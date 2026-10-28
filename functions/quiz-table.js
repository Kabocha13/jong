// 早押しクイズ (61.0〜) の卓 (1卓・最大6席) の進め方 (Firestore には触らない)。
// index.js がトランザクションの中で「卓の状態」と「卓に関わる人の財布」を読んで渡し、ここで書き換えた卓と財布を書き戻す。
// 問題は quiz-bank.js (testsite.html のデータベース工学の問題)。答えは卓の中 (quiz_tables) だけに置き、
// 誰でも読める形 (quiz_public) には結果が出てから入れる。
//
// 流れ
//   受付 (lobby): 座っている人が「参加する」を押す。全員が押したらすぐ、誰かが押してから QUIZ_LOBBY_MS たったら
//     押した人だけで1戦 (QUIZ_MATCH_QUESTIONS 問) を始める。押さなかった人 (一戦参加しなかった人) は席を空ける。
//     押さないまま QUIZ_SEAT_IDLE_MS 座っている人も席を空ける (画面を閉じたまま席が残らないように)。
//   出題 (question): 問題を出し、QUIZ_INTRO_MS のあと早押しを受け付ける。QUIZ_QUESTION_MS 誰も押さなければ打ち切りで、
//     参加者全員 QUIZ_REWARDS.timeout。
//   解答 (answering): 押した人が QUIZ_ANSWER_MS のうちに4択から選ぶ (時間切れは不正解)。
//     1番目の正解 QUIZ_REWARDS.first・2番目の正解 QUIZ_REWARDS.second・不正解 QUIZ_REWARDS.wrong。
//     1番目が不正解なら、まだ押していない人がもう1回だけ押せる (残りの時間が短ければ QUIZ_REOPEN_MIN_MS まで延ばす)。
//   結果 (result): 正解と解説を QUIZ_RESULT_MS 見せてから次の問題へ。最後の問題のあとは受付に戻る (全員もう一度「参加する」)。
//   レートは1問ごとにその場で動く (賭けは無いので押さえている額は無い)。
//   サーバーは常駐しないので、締め切りの判定は画面を開いている誰かの qzTick と定期処理で行う。

import { QUIZ_QUESTIONS, QUIZ_SUBJECT } from './quiz-bank.js';

export const QUIZ_SEATS = 6;
export const QUIZ_MATCH_QUESTIONS = 5;
export const QUIZ_LOBBY_MS = 15 * 1000;
export const QUIZ_INTRO_MS = 3 * 1000;
export const QUIZ_QUESTION_MS = 20 * 1000;
export const QUIZ_ANSWER_MS = 10 * 1000;
export const QUIZ_REOPEN_MIN_MS = 8 * 1000;
export const QUIZ_RESULT_MS = 6 * 1000;
export const QUIZ_SEAT_IDLE_MS = 5 * 60 * 1000;
export const QUIZ_MAX_BUZZES = 2;
export const QUIZ_REWARDS = { first: 10, second: 5, wrong: -15, timeout: -5 };
const QUIZ_RECENT_IDS = 80;    // この数の問題は続けて出さない
const QUIZ_RECENT_LIMIT = 12;  // 口座に残す直近の戦績

export class QuizError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function emptyQuizTable() {
  return {
    phase: 'lobby',
    seats: Array(QUIZ_SEATS).fill(null),
    lobbyEndsAt: null,
    resultEndsAt: null,
    matchNo: 0,
    questionNo: 0,
    match: null,
    question: null,
    lastMatch: null,
    recentIds: [],
    seq: 0,
    updatedAt: null
  };
}

/** 卓に関わる人 (座っている人と、いまの1戦の参加者) の uid → 名前 */
export function quizTableNames(table) {
  const names = new Map();
  (table.seats || []).forEach(seat => { if (seat) names.set(seat.uid, seat.name); });
  (table.match?.participants || []).forEach(player => {
    if (!player.left && !names.has(player.uid)) names.set(player.uid, player.name);
  });
  return names;
}

function seatIndexOf(table, uid) {
  return table.seats.findIndex(seat => seat && seat.uid === uid);
}

function activePlayers(table) {
  return (table.match?.participants || []).filter(player => !player.left);
}

function participantOf(table, uid) {
  return activePlayers(table).find(player => player.uid === uid) || null;
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function passed(value, now) {
  return Boolean(value) && Date.parse(value) <= now;
}

/** 1回の操作ぶんの作業場所。wallets は uid → 財布 (無ければ null) */
export function createQuizContext({ table, wallets, now, randomInt }) {
  const copy = JSON.parse(JSON.stringify(table));
  copy.seats = Array.from({ length: QUIZ_SEATS }, (_, index) => (copy.seats || [])[index] || null);
  copy.recentIds = Array.isArray(copy.recentIds) ? copy.recentIds : [];
  return { table: copy, wallets, now, nowIso: iso(now), randomInt, changed: false };
}

/** レートを動かす (財布の chips を増減する。書き戻しは index.js) */
function addRate(ctx, uid, amount) {
  const wallet = ctx.wallets.get(uid);
  if (!wallet || !amount) return;
  wallet.chips += amount;
  const seat = ctx.table.seats[seatIndexOf(ctx.table, uid)];
  if (seat) seat.chips = wallet.chips;
}

/** プレイヤーが消えた人の席を空け、席に出すレートを財布に合わせ、受付で押さないまま長く座っている人を立たせる */
export function sweepQuizSeats(ctx) {
  const { table } = ctx;
  table.seats.forEach((seat, index) => {
    if (!seat) return;
    const wallet = ctx.wallets.get(seat.uid);
    const idle = table.phase === 'lobby' && !seat.ready
      && ctx.now - Date.parse(seat.idleSince || seat.joinedAt || ctx.nowIso) >= QUIZ_SEAT_IDLE_MS;
    if (!wallet || idle) {
      table.seats[index] = null;
      ctx.changed = true;
      return;
    }
    if (seat.chips !== wallet.chips) {
      seat.chips = wallet.chips;
      ctx.changed = true;
    }
  });
}

export function joinQuizSeat(ctx, uid, name, rawSeat) {
  const { table } = ctx;
  const wallet = ctx.wallets.get(uid);
  if (!wallet) throw new QuizError(404, 'プレイヤーが見つかりません。');
  if (seatIndexOf(table, uid) >= 0) return;
  const wanted = Number.isInteger(rawSeat) && rawSeat >= 0 && rawSeat < QUIZ_SEATS ? rawSeat : null;
  const index = wanted ?? table.seats.findIndex(seat => !seat);
  if (index < 0) throw new QuizError(409, '満席です。席が空くまで見ていてください。');
  if (table.seats[index]) throw new QuizError(409, 'その席はふさがっています。');
  table.seats[index] = { uid, name, ready: false, chips: wallet.chips, joinedAt: ctx.nowIso, idleSince: ctx.nowIso };
  ctx.changed = true;
}

/** 席を立つ。1戦の途中なら、そのあとの問題には参加しない (打ち切りの減点も受けない) */
export function leaveQuizSeat(ctx, uid) {
  const { table } = ctx;
  if (table.phase === 'answering' && table.question?.answerer === uid) {
    throw new QuizError(409, '解答中は席を立てません。');
  }
  const index = seatIndexOf(table, uid);
  if (index >= 0) table.seats[index] = null;
  const player = participantOf(table, uid);
  if (player) player.left = true;
  if (index >= 0 || player) ctx.changed = true;
}

/** 受付で「参加する」(ready = false で取り消し) */
export function readyQuiz(ctx, uid, ready = true) {
  const { table } = ctx;
  const index = seatIndexOf(table, uid);
  if (index < 0) throw new QuizError(409, '席に座っていません。');
  if (table.phase !== 'lobby') throw new QuizError(409, '1戦の最中です。終わってから参加してください。');
  const seat = table.seats[index];
  seat.ready = ready !== false;
  seat.idleSince = ctx.nowIso;
  if (seat.ready && !table.lobbyEndsAt) table.lobbyEndsAt = iso(ctx.now + QUIZ_LOBBY_MS);
  if (!table.seats.some(item => item && item.ready)) table.lobbyEndsAt = null;
  ctx.changed = true;
}

function shuffled(items, randomInt) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** 次の問題を出す (最近出した問題は避ける。選択肢の並びは毎回変える) */
function openQuestion(ctx) {
  const { table } = ctx;
  const recent = new Set(table.recentIds);
  const pool = QUIZ_QUESTIONS.filter(item => !recent.has(item.id));
  const source = (pool.length ? pool : QUIZ_QUESTIONS)[ctx.randomInt(pool.length || QUIZ_QUESTIONS.length)];
  const order = shuffled(source.choices.map((_, index) => index), ctx.randomInt);
  const openAt = ctx.now + QUIZ_INTRO_MS;
  table.questionNo = (table.questionNo || 0) + 1;
  table.recentIds = [source.id, ...table.recentIds].slice(0, QUIZ_RECENT_IDS);
  table.question = {
    no: table.questionNo,
    id: source.id,
    lecture: source.lecture,
    tags: source.tags || [],
    text: source.question,
    choices: order.map(index => source.choices[index]),
    answer: order.indexOf(source.answer),
    explanation: source.explanation || '',
    openAt: iso(openAt),
    endsAt: iso(openAt + QUIZ_QUESTION_MS),
    answerer: null,
    answerEndsAt: null,
    buzzes: [],
    outcome: null,
    timeout: null
  };
  table.phase = 'question';
  table.resultEndsAt = null;
  ctx.changed = true;
}

/** 受付: 全員が「参加する」を押したか、締め切りを過ぎたら1戦を始める */
function maybeStartMatch(ctx) {
  const { table } = ctx;
  const seated = table.seats.map((seat, index) => seat && { seat, index }).filter(Boolean);
  const ready = seated.filter(({ seat }) => seat.ready);
  if (!ready.length) {
    if (table.lobbyEndsAt) {
      table.lobbyEndsAt = null;
      ctx.changed = true;
    }
    return;
  }
  if (ready.length < seated.length && !passed(table.lobbyEndsAt, ctx.now)) return;
  // 一戦参加しなかった人は席を空ける (座ったままオフラインになった人が残らないように)
  seated.forEach(({ seat, index }) => { if (!seat.ready) table.seats[index] = null; });
  table.matchNo = (table.matchNo || 0) + 1;
  table.match = {
    no: table.matchNo,
    index: 0,
    total: QUIZ_MATCH_QUESTIONS,
    startedAt: ctx.nowIso,
    participants: ready.map(({ seat, index }) => ({
      uid: seat.uid, name: seat.name, seat: index, delta: 0, correct: 0, wrong: 0, left: false
    }))
  };
  ready.forEach(({ seat }) => { seat.ready = false; });
  table.lobbyEndsAt = null;
  table.lastMatch = null;
  openQuestion(ctx);
}

/** 問題の決着。参加者の遊んだ回数を足し、結果を見せる */
function resolveQuestion(ctx, outcome) {
  const { table } = ctx;
  const question = table.question;
  question.outcome = outcome;
  question.answerer = null;
  question.answerEndsAt = null;
  if (outcome === 'timeout') {
    question.timeout = QUIZ_REWARDS.timeout;
    activePlayers(table).forEach(player => {
      player.delta += QUIZ_REWARDS.timeout;
      addRate(ctx, player.uid, QUIZ_REWARDS.timeout);
    });
  }
  activePlayers(table).forEach(player => {
    const wallet = ctx.wallets.get(player.uid);
    if (!wallet) return;
    wallet.qzRounds = (wallet.qzRounds || 0) + 1;
  });
  table.phase = 'result';
  table.resultEndsAt = iso(ctx.now + QUIZ_RESULT_MS);
  ctx.changed = true;
}

/** 1戦の終わり。口座に戦績を残し、受付に戻す */
function finishMatch(ctx) {
  const { table } = ctx;
  const match = table.match;
  const ranking = match.participants
    .map(({ name, delta, correct, wrong, left }) => ({ name, delta, correct, wrong, left: Boolean(left) }))
    .sort((a, b) => b.delta - a.delta || b.correct - a.correct);
  match.participants.forEach(player => {
    const wallet = ctx.wallets.get(player.uid);
    if (!wallet || player.left) return;
    const rank = ranking.findIndex(item => item.name === player.name) + 1;
    wallet.qzRecent = [{ no: match.no, delta: player.delta, correct: player.correct, wrong: player.wrong, rank, players: ranking.length, at: ctx.nowIso }, ...(wallet.qzRecent || [])]
      .slice(0, QUIZ_RECENT_LIMIT);
  });
  table.lastMatch = { no: match.no, total: match.total, ranking, finishedAt: ctx.nowIso };
  table.match = null;
  table.question = null;
  table.phase = 'lobby';
  table.lobbyEndsAt = null;
  table.resultEndsAt = null;
  table.seats.forEach(seat => { if (seat) { seat.ready = false; seat.idleSince = ctx.nowIso; } });
  ctx.changed = true;
}

/** 解答を採点する (choice が null なら時間切れ) */
function judgeAnswer(ctx, uid, choice) {
  const { table } = ctx;
  const question = table.question;
  const player = participantOf(table, uid);
  const correct = choice !== null && choice === question.answer;
  const order = question.buzzes.length;
  const delta = correct ? (order === 1 ? QUIZ_REWARDS.first : QUIZ_REWARDS.second) : QUIZ_REWARDS.wrong;
  const buzz = question.buzzes[order - 1];
  buzz.choice = choice;
  buzz.correct = correct;
  buzz.delta = delta;
  if (player) {
    player.delta += delta;
    if (correct) player.correct += 1;
    else player.wrong += 1;
  }
  addRate(ctx, uid, delta);
  const wallet = ctx.wallets.get(uid);
  if (wallet && correct) wallet.qzCorrect = (wallet.qzCorrect || 0) + 1;
  ctx.changed = true;
  if (correct) {
    resolveQuestion(ctx, 'correct');
    return;
  }
  const buzzed = new Set(question.buzzes.map(item => item.uid));
  const others = activePlayers(table).some(item => !buzzed.has(item.uid));
  if (order >= QUIZ_MAX_BUZZES || !others) {
    resolveQuestion(ctx, 'wrong');
    return;
  }
  // もう1人だけ押せる。残りが短ければ少し延ばす
  question.answerer = null;
  question.answerEndsAt = null;
  question.endsAt = iso(Math.max(Date.parse(question.endsAt), ctx.now + QUIZ_REOPEN_MIN_MS));
  table.phase = 'question';
}

function assertQuestion(table, rawNo) {
  if (!table.question || Number(rawNo) !== table.question.no) {
    throw new QuizError(409, '画面の表示が古くなっています。');
  }
}

/** 早押し。no は画面に出ている問題の番号 */
export function buzzQuiz(ctx, uid, rawNo) {
  const { table } = ctx;
  assertQuestion(table, rawNo);
  if (!participantOf(table, uid)) throw new QuizError(409, 'この1戦には参加していません。次の1戦で「参加する」を押してください。');
  if (table.phase === 'answering') throw new QuizError(409, 'ほかの人が先に押しました。');
  if (table.phase !== 'question') throw new QuizError(409, 'この問題はもう締め切りました。');
  const question = table.question;
  if (ctx.now < Date.parse(question.openAt)) throw new QuizError(409, 'まだ押せません。');
  if (passed(question.endsAt, ctx.now)) throw new QuizError(409, 'この問題はもう締め切りました。');
  if (question.buzzes.some(item => item.uid === uid)) throw new QuizError(409, 'この問題ではもう解答しました。');
  if (question.buzzes.length >= QUIZ_MAX_BUZZES) throw new QuizError(409, 'この問題はもう締め切りました。');
  question.buzzes.push({ uid, name: participantOf(table, uid).name, choice: null, correct: null, delta: 0, at: ctx.nowIso });
  question.answerer = uid;
  question.answerEndsAt = iso(ctx.now + QUIZ_ANSWER_MS);
  table.phase = 'answering';
  ctx.changed = true;
}

/** 解答。choice は画面に出ている選択肢の番号 (0〜3) */
export function answerQuiz(ctx, uid, rawNo, rawChoice) {
  const { table } = ctx;
  assertQuestion(table, rawNo);
  if (table.phase !== 'answering' || table.question.answerer !== uid) {
    throw new QuizError(409, 'あなたの解答の番ではありません。');
  }
  const choice = Number(rawChoice);
  if (!Number.isInteger(choice) || choice < 0 || choice >= table.question.choices.length) {
    throw new QuizError(400, '選択肢を選んでください。');
  }
  judgeAnswer(ctx, uid, choice);
}

/** 締め切りを過ぎた段階を先へ進める (どの操作のあとにも呼ぶ) */
export function advanceQuiz(ctx) {
  const { table } = ctx;
  for (let step = 0; step < 6; step++) {
    if (table.match && !activePlayers(table).length && table.phase !== 'lobby') {
      finishMatch(ctx);
      continue;
    }
    if (table.phase === 'lobby') {
      const before = table.phase;
      maybeStartMatch(ctx);
      if (table.phase === before) return;
    } else if (table.phase === 'answering') {
      if (!passed(table.question.answerEndsAt, ctx.now)) return;
      judgeAnswer(ctx, table.question.answerer, null);
    } else if (table.phase === 'question') {
      if (!passed(table.question.endsAt, ctx.now)) return;
      resolveQuestion(ctx, table.question.buzzes.length ? 'wrong' : 'timeout');
    } else if (table.phase === 'result') {
      if (!passed(table.resultEndsAt, ctx.now)) return;
      table.match.index += 1;
      if (table.match.index >= table.match.total) finishMatch(ctx);
      else openQuestion(ctx);
    } else {
      return;
    }
  }
}

/** 誰でも読める形 (uid を含めず、答えと解説は結果が出てから) */
export function publicQuizTable(table) {
  const question = table.question;
  const revealed = table.phase === 'result';
  const nameOf = uid => (table.match?.participants || []).find(player => player.uid === uid)?.name || null;
  const inMatch = new Map(activePlayers(table).map(player => [player.uid, player]));
  return {
    phase: table.phase,
    seq: table.seq || 0,
    subject: QUIZ_SUBJECT,
    questionCount: QUIZ_QUESTIONS.length,
    rewards: QUIZ_REWARDS,
    timing: { lobbyMs: QUIZ_LOBBY_MS, questionMs: QUIZ_QUESTION_MS, answerMs: QUIZ_ANSWER_MS, resultMs: QUIZ_RESULT_MS },
    lobbyEndsAt: table.phase === 'lobby' ? table.lobbyEndsAt || null : null,
    resultEndsAt: revealed ? table.resultEndsAt || null : null,
    seats: Array.from({ length: QUIZ_SEATS }, (_, index) => {
      const seat = (table.seats || [])[index];
      if (!seat) return null;
      const player = inMatch.get(seat.uid);
      return { name: seat.name, ready: Boolean(seat.ready), chips: seat.chips, inMatch: Boolean(player), delta: player ? player.delta : 0 };
    }),
    match: table.match ? {
      no: table.match.no,
      index: table.match.index,
      total: table.match.total,
      participants: table.match.participants.map(({ name, seat, delta, correct, wrong, left }) => ({ name, seat, delta, correct, wrong, left: Boolean(left) }))
    } : null,
    question: question ? {
      no: question.no,
      lecture: question.lecture,
      tags: question.tags,
      text: question.text,
      choices: question.choices,
      openAt: question.openAt,
      endsAt: question.endsAt,
      answerer: question.answerer ? nameOf(question.answerer) : null,
      answerEndsAt: question.answerEndsAt,
      buzzes: question.buzzes.map(({ name, choice, correct, delta }) => ({ name, choice, correct, delta })),
      outcome: question.outcome,
      timeout: question.timeout,
      answer: revealed ? question.answer : null,
      explanation: revealed ? question.explanation : null
    } : null,
    lastMatch: table.lastMatch || null,
    updatedAt: table.updatedAt || null
  };
}
