// ホールデムの卓 (1卓・6席) の進め方 (Firestore には触らない)。
// index.js がトランザクションの中で「卓の状態」と「卓に関わる人の財布 (casino_sessions)」を読んで渡し、
// ここで書き換えた卓と財布を書き戻す。
//
// 席と船員
//   席は 0〜5。人が座っていない席には、その席を家にしている船員 (holdem-bots.js) が入る。
//   だから1人で座っても6人でハンドが進み、人が増えた席の船員は次のハンドから休む。
//   船員のチップは卓に持たせる (減れば買い足し、増えすぎれば持ち帰る)。
//
// 流れ
//   座っている人 (休憩中でなく BB ぶんのチップがある人) が1人でもいれば、ハンドを始める。
//   人の番は HOLDEM_TURN_MS の持ち時間。時間切れはチェックかフォールド。
//   船員の番は、その場で (同じ処理の中で) 決めて進める。だから人の番か決着まで一気に進む。
//   決着したら払い戻し、HOLDEM_RESULT_MS おいてから次のハンド (画面を開いている誰かの hdTick で始まる)。
//   続けて HOLDEM_IDLE_TURNS 回時間切れになった人は、席に残したまま休憩にする。
//
// 人のチップは財布そのもの。ハンドの中の stack は処理のたびに財布から取り直し、
// 動いた分だけ財布に足し引きする (ほかのゲームで動いた分とぶつからないように)。

import {
  applyHoldemMove,
  holdemTurnPlayer,
  holdemActions,
  publicHoldemRound,
  startHoldemRound,
  summarizeHoldemPlayer,
  timeoutTurnPlayer
} from './holdem.js';
import { HOLDEM_BOTS, HOLDEM_BOT_BY_ID, botForSeat, decideBotMove } from './holdem-bots.js';

export const HOLDEM_SEATS = 6;
export const HOLDEM_SMALL_BLIND = 1;
export const HOLDEM_BIG_BLIND = 2;
export const HOLDEM_TURN_MS = 25 * 1000;
export const HOLDEM_RESULT_MS = 8 * 1000;
export const HOLDEM_IDLE_TURNS = 2;
const HOLDEM_BOT_STACK_MIN = 50;
const HOLDEM_BOT_STACK_MAX = 100;
const HOLDEM_BOT_REBUY_BELOW = 10;
const HOLDEM_BOT_CASHOUT_ABOVE = 250;
const HOLDEM_RECENT_LIMIT = 12;
const HOLDEM_BOT_LOOP_LIMIT = 300;

export class HoldemTableError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 船員が持ち込むチップ (HOLDEM_BOT_STACK_MIN〜MAX のどれか。randomInt は 0〜n-1) */
function botBuyIn(randomInt) {
  return HOLDEM_BOT_STACK_MIN + randomInt(HOLDEM_BOT_STACK_MAX - HOLDEM_BOT_STACK_MIN + 1);
}

export function emptyHoldemTable(randomInt) {
  return {
    phase: 'waiting',        // waiting (人がいない) | playing | done (決着を見せている)
    seats: Array(HOLDEM_SEATS).fill(null),
    bots: Object.fromEntries(HOLDEM_BOTS.map(bot => [bot.id, { chips: botBuyIn(randomInt) }])),
    button: null,            // 前のハンドのボタンの席
    round: null,
    handNo: 0,
    turnEndsAt: null,
    nextHandAt: null,
    seq: 0,
    updatedAt: null
  };
}

/** 卓に関わる人 (座っている人と、いまのハンドに配られた人) の uid */
export function holdemTableUids(table) {
  const uids = new Set();
  (table.seats || []).forEach(seat => { if (seat) uids.add(seat.uid); });
  if (table.phase === 'playing' && table.round) {
    table.round.players.forEach(player => { if (player.uid) uids.add(player.uid); });
  }
  return uids;
}

export function holdemSeatIndexOf(table, uid) {
  return (table.seats || []).findIndex(seat => seat && seat.uid === uid);
}

function roundPlayerOf(table, uid) {
  return table.round ? table.round.players.find(player => player.uid === uid) || null : null;
}

/** いまのハンドに残っている (降りていない)。決着するまで席を立てず、自分では精算もできない */
export function isInLiveHoldemRound(table, uid) {
  if (table.phase !== 'playing' || !table.round) return false;
  const player = roundPlayerOf(table, uid);
  return Boolean(player && !player.folded);
}

export function vacateHoldemSeat(table, index) {
  table.seats[index] = null;
}

/**
 * 1回の操作ぶんの作業場所。wallets は uid → 財布 (無ければ null)。
 * 人の stack は財布に合わせ、動いた分だけあとで財布に足し引きする (flushStacks)。
 */
export function createHoldemContext({ table, wallets, now, randomInt, touchWallet, rng = Math.random }) {
  const copy = JSON.parse(JSON.stringify(table));
  copy.seats = Array.from({ length: HOLDEM_SEATS }, (_, index) => (copy.seats || [])[index] || null);
  copy.bots = copy.bots || {};
  HOLDEM_BOTS.forEach(bot => { if (!copy.bots[bot.id]) copy.bots[bot.id] = { chips: botBuyIn(randomInt) }; });
  const ctx = {
    table: copy,
    wallets,
    now,
    nowIso: new Date(now).toISOString(),
    randomInt,
    rng,
    touchWallet,
    touched: new Set(),     // 書き戻す財布
    holes: new Map(),       // 配った手札 (uid → { no, seat, cards })。index.js が holdem_hole に書く
    orphanPayouts: [],      // 財布を精算済みの人へ、レートで直接返すぶん { uid, name, amount, reason }
    broke: new Set(),       // 決着してチップが尽きた人 (index.js がこのあと精算する)
    base: new Map(),        // 人の uid → この処理の初めの stack (差分を財布に反映する)
    changed: false
  };
  syncStacks(ctx);
  return ctx;
}

/** ハンドの中の人の stack を財布に合わせる (財布が無ければ 0 = もう出せない) */
function syncStacks(ctx) {
  const { table } = ctx;
  if (table.phase !== 'playing' || !table.round) return;
  table.round.players.forEach(player => {
    if (!player.uid) return;
    const wallet = ctx.wallets.get(player.uid);
    if (wallet) {
      player.stack = wallet.chips;
    } else {
      player.stack = 0;
      if (!player.folded) player.allIn = true;
    }
    ctx.base.set(player.uid, player.stack);
  });
}

/** 人の stack の動いた分を財布に足し引きする */
function flushStacks(ctx) {
  const { table } = ctx;
  if (!table.round) return;
  table.round.players.forEach(player => {
    if (!player.uid || !ctx.base.has(player.uid)) return;
    const wallet = ctx.wallets.get(player.uid);
    const delta = player.stack - ctx.base.get(player.uid);
    ctx.base.set(player.uid, player.stack);
    if (!wallet || delta === 0) return;
    wallet.chips += delta;
    ctx.touchWallet(wallet, ctx.nowIso);
    ctx.touched.add(player.uid);
    const seat = table.seats[player.seat];
    if (seat && seat.uid === player.uid) seat.chips = wallet.chips;
  });
}

/** 財布を精算した人の席を空け (ハンドの途中の人は決着まで残す)、席に出すチップを財布に合わせる */
export function sweepHoldemSeats(ctx) {
  const { table } = ctx;
  table.seats.forEach((seat, index) => {
    if (!seat) return;
    const wallet = ctx.wallets.get(seat.uid);
    if (wallet) {
      if (seat.chips !== wallet.chips) {
        seat.chips = wallet.chips;
        ctx.changed = true;
      }
      return;
    }
    if (isInLiveHoldemRound(table, seat.uid)) return;
    vacateHoldemSeat(table, index);
    ctx.changed = true;
  });
}

export function joinHoldemSeat(ctx, uid, name, rawSeat) {
  const { table } = ctx;
  const wallet = ctx.wallets.get(uid);
  if (!wallet) throw new HoldemTableError(409, '先にチップを持ち込んでください。');
  if (holdemSeatIndexOf(table, uid) >= 0) return;
  const wanted = Number.isInteger(rawSeat) && rawSeat >= 0 && rawSeat < HOLDEM_SEATS ? rawSeat : null;
  const index = wanted ?? table.seats.findIndex(seat => !seat);
  if (index < 0) throw new HoldemTableError(409, '満席です。席が空くまで見ていてください。');
  if (table.seats[index]) throw new HoldemTableError(409, 'その席はふさがっています。');
  table.seats[index] = { uid, name, chips: wallet.chips, sittingOut: false, outReason: null, idleTurns: 0, joinedAt: ctx.nowIso };
  ctx.changed = true;
}

export function leaveHoldemSeat(ctx, uid) {
  const { table } = ctx;
  const index = holdemSeatIndexOf(table, uid);
  if (index < 0) return;
  if (isInLiveHoldemRound(table, uid)) throw new HoldemTableError(409, 'ハンドが終わってから席を立ってください (降りれば立てます)。');
  vacateHoldemSeat(table, index);
  ctx.changed = true;
}

/** 休憩する / 戻る (次のハンドから) */
export function setHoldemSitOut(ctx, uid, out) {
  const { table } = ctx;
  const index = holdemSeatIndexOf(table, uid);
  if (index < 0) throw new HoldemTableError(409, '席に座っていません。');
  const seat = table.seats[index];
  seat.sittingOut = Boolean(out);
  seat.outReason = out ? 'self' : null;
  seat.idleTurns = 0;
  ctx.changed = true;
}

// ------------------------------------------------------------------
// ハンドの開始と進行
// ------------------------------------------------------------------
function botStackForHand(ctx, bot) {
  const state = ctx.table.bots[bot.id];
  if (state.chips < HOLDEM_BOT_REBUY_BELOW || state.chips > HOLDEM_BOT_CASHOUT_ABOVE) state.chips = botBuyIn(ctx.randomInt);
  return state.chips;
}

/** 座っている人と船員で次のハンドを始める (どの操作のあとにも呼ぶ) */
export function maybeStartHoldemHand(ctx) {
  const { table } = ctx;
  if (table.phase === 'playing') return;
  if (table.phase === 'done' && table.nextHandAt && Date.parse(table.nextHandAt) > ctx.now) return;

  const entries = [];
  let humans = 0;
  for (let index = 0; index < HOLDEM_SEATS; index++) {
    const seat = table.seats[index];
    if (seat) {
      const wallet = ctx.wallets.get(seat.uid);
      const chips = wallet ? wallet.chips : 0;
      if (!seat.sittingOut && chips < HOLDEM_BIG_BLIND) {
        seat.sittingOut = true;
        seat.outReason = 'chips';
        ctx.changed = true;
      }
      if (!seat.sittingOut && wallet) {
        entries.push({ seat: index, uid: seat.uid, name: seat.name, bot: null, stack: chips });
        humans += 1;
      }
      continue;
    }
    const bot = botForSeat(index);
    if (bot) entries.push({ seat: index, uid: null, name: bot.name, bot: bot.id, stack: botStackForHand(ctx, bot) });
  }

  if (!humans || entries.length < 2) {
    if (table.phase !== 'waiting') {
      table.phase = 'waiting';
      table.nextHandAt = null;
      table.turnEndsAt = null;
      ctx.changed = true;
    }
    return;
  }

  // ボタンは前のボタンの次の席 (座っている人・船員の中で)
  const seatsInHand = entries.map(entry => entry.seat);
  let button = 0;
  if (table.button !== null && table.button !== undefined) {
    for (let step = 1; step <= HOLDEM_SEATS; step++) {
      const seat = (table.button + step) % HOLDEM_SEATS;
      const found = seatsInHand.indexOf(seat);
      if (found >= 0) {
        button = found;
        break;
      }
    }
  } else {
    button = ctx.randomInt(entries.length);
  }

  table.handNo = (table.handNo || 0) + 1;
  const round = startHoldemRound(entries, {
    button,
    smallBlind: HOLDEM_SMALL_BLIND,
    bigBlind: HOLDEM_BIG_BLIND,
    no: table.handNo,
    startedAt: ctx.nowIso
  }, ctx.randomInt);
  table.round = round;
  table.button = entries[button].seat;
  table.phase = 'playing';
  table.nextHandAt = null;
  ctx.changed = true;

  entries.forEach(entry => {
    if (!entry.uid) return;
    ctx.base.set(entry.uid, entry.stack);
    const player = round.players.find(item => item.uid === entry.uid);
    ctx.holes.set(entry.uid, { no: round.no, seat: entry.seat, cards: player.hole });
  });
  flushStacks(ctx);
  runBots(ctx);
  afterProgress(ctx);
}

/** 船員の番が続くかぎり決めて進める (人の番か決着で止まる) */
function runBots(ctx) {
  const { table } = ctx;
  const round = table.round;
  for (let guard = 0; guard < HOLDEM_BOT_LOOP_LIMIT; guard++) {
    const player = holdemTurnPlayer(round);
    if (!player || !player.bot) return;
    const actions = holdemActions(round);
    const decision = decideBotMove(round, player, actions, ctx.rng);
    applyHoldemMove(round, decision.move, decision.amount, ctx.randomInt, { delay: decision.delay });
  }
  throw new Error('船員の操作が終わりません。');
}

/** 決着: 払い戻しと記録。船員のチップは卓へ戻す */
function finishHand(ctx) {
  const { table } = ctx;
  const round = table.round;
  round.finishedAt = ctx.nowIso;
  flushStacks(ctx);
  round.players.forEach(player => {
    if (player.bot) {
      table.bots[player.bot].chips = player.stack;
      return;
    }
    const wallet = ctx.wallets.get(player.uid);
    const seat = table.seats[player.seat];
    if (wallet) {
      wallet.hdHands = (wallet.hdHands || 0) + 1;
      wallet.wagered = (wallet.wagered || 0) + player.committed;
      wallet.hdRecent = [summarizeHoldemPlayer(round, player, ctx.nowIso), ...(wallet.hdRecent || [])]
        .slice(0, HOLDEM_RECENT_LIMIT);
      ctx.touchWallet(wallet, ctx.nowIso);
      ctx.touched.add(player.uid);
      if (wallet.chips <= 0) ctx.broke.add(player.uid);
    } else if (player.won > 0) {
      ctx.orphanPayouts.push({ uid: player.uid, name: player.name, amount: player.won, reason: 'payout' });
    }
    if (seat && seat.uid === player.uid) {
      if (player.timedOut) {
        seat.idleTurns = (seat.idleTurns || 0) + 1;
        if (seat.idleTurns >= HOLDEM_IDLE_TURNS) {
          seat.sittingOut = true;
          seat.outReason = 'idle';
        }
      } else {
        seat.idleTurns = 0;
      }
    }
  });
  table.phase = 'done';
  table.turnEndsAt = null;
  table.nextHandAt = new Date(ctx.now + HOLDEM_RESULT_MS).toISOString();
}

/** ハンドが進んだあと: 決着していれば払い戻し、人の番なら持ち時間を決める */
function afterProgress(ctx) {
  const { table } = ctx;
  if (table.round.phase === 'done') {
    finishHand(ctx);
  } else {
    flushStacks(ctx);
    table.turnEndsAt = new Date(ctx.now + HOLDEM_TURN_MS).toISOString();
  }
}

/** 番の人の操作。seq は画面に出ているハンドの操作番号 (二度押しや古い画面からの操作を断る) */
export function moveHoldemTurn(ctx, uid, move, amount, rawSeq) {
  const { table } = ctx;
  const player = table.phase === 'playing' ? holdemTurnPlayer(table.round) : null;
  if (!player) throw new HoldemTableError(409, '進行中のハンドがありません。');
  if (player.uid !== uid) throw new HoldemTableError(409, 'あなたの番ではありません。');
  if (Number(rawSeq) !== (table.round.seq || 0)) {
    throw new HoldemTableError(409, '画面の表示が古くなっています。最新の状態を読み込み直してください。');
  }
  applyHoldemMove(table.round, String(move || ''), amount, ctx.randomInt);
  ctx.changed = true;
  runBots(ctx);
  afterProgress(ctx);
}

/** 番の人の持ち時間切れ。次のハンドの開始は maybeStartHoldemHand が見る */
export function tickHoldemTable(ctx) {
  const { table } = ctx;
  if (table.phase !== 'playing' || !table.round || !table.turnEndsAt) return;
  if (Date.parse(table.turnEndsAt) > ctx.now) return;
  const player = holdemTurnPlayer(table.round);
  if (!player) return;
  timeoutTurnPlayer(table.round, ctx.randomInt);
  ctx.changed = true;
  runBots(ctx);
  afterProgress(ctx);
}

/** 誰でも読める形 (uid と、見せていない手札を含めない) */
export function publicHoldemTable(table) {
  const seats = Array.from({ length: HOLDEM_SEATS }, (_, index) => {
    const seat = (table.seats || [])[index];
    return seat ? {
      name: seat.name,
      chips: seat.chips,
      sittingOut: Boolean(seat.sittingOut),
      outReason: seat.outReason || null,
      idleTurns: seat.idleTurns || 0
    } : null;
  });
  return {
    phase: table.phase,
    seq: table.seq || 0,
    handNo: table.handNo || 0,
    button: table.button ?? null,
    turnEndsAt: table.phase === 'playing' ? table.turnEndsAt || null : null,
    nextHandAt: table.phase === 'done' ? table.nextHandAt || null : null,
    blinds: { small: HOLDEM_SMALL_BLIND, big: HOLDEM_BIG_BLIND },
    seats,
    bots: HOLDEM_BOTS.map(bot => ({
      id: bot.id,
      seat: bot.seat,
      name: bot.name,
      short: bot.short,
      title: bot.title,
      style: bot.style,
      desc: bot.desc,
      chips: (table.bots || {})[bot.id]?.chips ?? 0
    })),
    round: publicHoldemRound(table.round || null),
    updatedAt: table.updatedAt || null
  };
}

export { HOLDEM_BOT_BY_ID };
