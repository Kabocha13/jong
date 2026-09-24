// ブラックジャックの卓 (1卓・最大4席) の進め方 (Firestore には触らない)。
// index.js がトランザクションの中で「卓の状態」と「卓に関わる人の財布 (casino_sessions)」を読んで渡し、
// ここで書き換えた卓と財布を書き戻す。
//
// 流れ
//   ベット受付 (betting): 座っている人がそれぞれ賭け金を置く。全員が置いたらすぐ配る。
//     誰かが置いてから TABLE_BETTING_MS たっても置かない人がいれば、置いた人だけで配る。
//   勝負 (playing): 席順に1人ずつ操作する。1回の操作の持ち時間は TABLE_TURN_MS で、
//     時間切れの人は残りの手をスタンドにして次の人へ回す。
//   全員終わるとディーラーが引いて決着し、払い戻しを財布に足してベット受付に戻る。
//   決着した勝負は、次に配るまで結果を見せるため卓に残しておく。
//   賭けないまま TABLE_IDLE_ROUNDS 回続けて勝負が始まった人と、財布を精算した人は席を空ける。
//   サーバーは常駐しないので、締め切りの判定は画面を開いている誰かの bjTick と定期処理で行う。

import {
  applyBlackjackMove,
  blackjackPlayerTotals,
  blackjackTurnPlayer,
  publicBlackjackRound,
  standOutTurnPlayer,
  startBlackjackRound,
  summarizeBlackjackPlayer
} from './blackjack.js';

export const TABLE_SEATS = 4;
export const TABLE_BETTING_MS = 15 * 1000;
export const TABLE_TURN_MS = 20 * 1000;
export const TABLE_IDLE_ROUNDS = 3;
const TABLE_RECENT_LIMIT = 12;

export class TableError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function emptyTable() {
  return {
    phase: 'betting',
    seats: Array(TABLE_SEATS).fill(null),
    round: null,
    roundNo: 0,
    bettingEndsAt: null,
    turnEndsAt: null,
    seq: 0,
    updatedAt: null
  };
}

/** 卓に関わる人 (座っている人と、いまの勝負に参加している人) の uid */
export function tableUids(table) {
  const uids = new Set();
  (table.seats || []).forEach(seat => { if (seat) uids.add(seat.uid); });
  if (table.phase === 'playing' && table.round) table.round.players.forEach(player => uids.add(player.uid));
  return uids;
}

export function seatIndexOf(table, uid) {
  return (table.seats || []).findIndex(seat => seat && seat.uid === uid);
}

/** いまの勝負に参加している (決着するまで席を立てず、自分では精算もできない) */
export function isInLiveRound(table, uid) {
  return table.phase === 'playing' && Boolean(table.round)
    && table.round.players.some(player => player.uid === uid);
}

/** 賭け金が1つも置かれていなければ、ベット受付の締め切りを消す */
function clearBettingClockIfNoBets(table) {
  if (table.phase === 'betting' && !table.seats.some(seat => seat && seat.bet > 0)) {
    table.bettingEndsAt = null;
  }
}

/** 席を空ける */
export function vacateSeat(table, index) {
  table.seats[index] = null;
  clearBettingClockIfNoBets(table);
}

/**
 * 1回の操作ぶんの作業場所。wallets は uid → 財布 (無ければ null)。
 * touchWallet(wallet, nowIso) は財布の最終操作時刻と期限を進める関数 (期限の決まりは index.js 側)。
 */
export function createTableContext({ table, wallets, now, randomInt, touchWallet }) {
  const copy = JSON.parse(JSON.stringify(table));
  copy.seats = Array.from({ length: TABLE_SEATS }, (_, index) => (copy.seats || [])[index] || null);
  return {
    table: copy,
    wallets,
    now,
    nowIso: new Date(now).toISOString(),
    randomInt,
    touchWallet,
    touched: new Set(),     // 書き戻す財布
    orphanPayouts: [],      // 財布を精算済みの人へ、レートで直接返すぶん { uid, name, amount, reason }
    broke: new Set(),       // 決着してチップが尽きた人 (index.js がこのあと精算する)
    changed: false
  };
}

function creditChips(ctx, uid, name, amount, reason) {
  if (!amount) return;
  const wallet = ctx.wallets.get(uid);
  if (wallet) {
    wallet.chips += amount;
    ctx.touchWallet(wallet, ctx.nowIso);
    ctx.touched.add(uid);
  } else {
    ctx.orphanPayouts.push({ uid, name, amount, reason });
  }
}

/** 財布を精算した人の席を空け (勝負の途中の人は決着まで残す)、席に出すチップを財布に合わせる */
export function sweepSeats(ctx) {
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
    if (isInLiveRound(table, seat.uid)) return;
    creditChips(ctx, seat.uid, seat.name, seat.bet, 'refund');
    vacateSeat(table, index);
    ctx.changed = true;
  });
}

export function joinSeat(ctx, uid, name, rawSeat) {
  const { table } = ctx;
  const wallet = ctx.wallets.get(uid);
  if (!wallet) throw new TableError(409, '先にチップを持ち込んでください。');
  if (seatIndexOf(table, uid) >= 0) return;
  const wanted = Number.isInteger(rawSeat) && rawSeat >= 0 && rawSeat < TABLE_SEATS ? rawSeat : null;
  const index = wanted ?? table.seats.findIndex(seat => !seat);
  if (index < 0) throw new TableError(409, '満席です。席が空くまで見ていてください。');
  if (table.seats[index]) throw new TableError(409, 'その席はふさがっています。');
  table.seats[index] = { uid, name, bet: 0, chips: wallet.chips, idleRounds: 0, joinedAt: ctx.nowIso };
  ctx.changed = true;
}

export function leaveSeat(ctx, uid) {
  const { table } = ctx;
  const index = seatIndexOf(table, uid);
  if (index < 0) return;
  if (isInLiveRound(table, uid)) throw new TableError(409, '勝負が終わってから席を立ってください。');
  const seat = table.seats[index];
  creditChips(ctx, uid, seat.name, seat.bet, 'refund');
  vacateSeat(table, index);
  ctx.changed = true;
}

/** 次の勝負の賭け金を置く (0 で取り消し)。置いていたぶんはいったん戻してから置き直す */
export function placeBet(ctx, uid, rawAmount) {
  const { table } = ctx;
  const index = seatIndexOf(table, uid);
  if (index < 0) throw new TableError(409, '席に座っていません。');
  if (table.phase !== 'betting') throw new TableError(409, '勝負の最中です。決着してから賭けてください。');
  const amount = Number(rawAmount);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new TableError(400, '賭け金は0以上の整数で指定してください。');
  }
  const wallet = ctx.wallets.get(uid);
  if (!wallet) throw new TableError(409, '先にチップを持ち込んでください。');
  const seat = table.seats[index];
  const available = wallet.chips + seat.bet;
  if (amount > available) {
    throw new TableError(400, `手元のチップ (${available}) を超えて賭けることはできません。`);
  }
  wallet.chips = available - amount;
  seat.bet = amount;
  seat.chips = wallet.chips;
  ctx.touchWallet(wallet, ctx.nowIso);
  ctx.touched.add(uid);
  if (amount > 0 && !table.bettingEndsAt) {
    table.bettingEndsAt = new Date(ctx.now + TABLE_BETTING_MS).toISOString();
  }
  clearBettingClockIfNoBets(table);
  ctx.changed = true;
}

/** 決着したら払い戻しを財布に足し、ベット受付に戻す */
function finishTableRound(ctx) {
  const { table } = ctx;
  const round = table.round;
  round.finishedAt = ctx.nowIso;
  round.players.forEach(player => {
    const { bet, returned } = blackjackPlayerTotals(player);
    const wallet = ctx.wallets.get(player.uid);
    if (wallet) {
      wallet.chips += returned;
      wallet.bjHands = (wallet.bjHands || 0) + 1;
      wallet.wagered = (wallet.wagered || 0) + bet;
      wallet.bjRecent = [summarizeBlackjackPlayer(round, player, ctx.nowIso), ...(wallet.bjRecent || [])]
        .slice(0, TABLE_RECENT_LIMIT);
      ctx.touchWallet(wallet, ctx.nowIso);
      ctx.touched.add(player.uid);
      if (wallet.chips <= 0) ctx.broke.add(player.uid);
    } else if (returned > 0) {
      ctx.orphanPayouts.push({ uid: player.uid, name: player.name, amount: returned, reason: 'payout' });
    }
    const seat = table.seats[player.seat];
    if (seat && seat.uid === player.uid && wallet) seat.chips = wallet.chips;
  });
  table.phase = 'betting';
  table.turnEndsAt = null;
  table.bettingEndsAt = null;
}

/** 勝負が1つ進んだあと: 決着していれば払い戻し、まだなら次の操作の持ち時間を決める */
function afterProgress(ctx) {
  const { table } = ctx;
  if (table.round.phase === 'done') {
    finishTableRound(ctx);
  } else {
    table.turnEndsAt = new Date(ctx.now + TABLE_TURN_MS).toISOString();
  }
}

/** 全員が賭けたか、受付の締め切りを過ぎたら配る (どの操作のあとにも呼ぶ) */
export function maybeStartRound(ctx) {
  const { table } = ctx;
  if (table.phase !== 'betting') return;
  const seated = table.seats.map((seat, index) => seat && { seat, index }).filter(Boolean);
  const bettors = seated.filter(({ seat }) => seat.bet > 0);
  if (!bettors.length) {
    if (table.bettingEndsAt) {
      table.bettingEndsAt = null;
      ctx.changed = true;
    }
    return;
  }
  const everyone = bettors.length === seated.length;
  const closed = Boolean(table.bettingEndsAt) && Date.parse(table.bettingEndsAt) <= ctx.now;
  if (!everyone && !closed) return;

  // 賭けなかった人は1回休み。続けて休んだ人は席を空ける
  seated.forEach(({ seat, index }) => {
    if (seat.bet > 0) {
      seat.idleRounds = 0;
      return;
    }
    seat.idleRounds = (seat.idleRounds || 0) + 1;
    if (seat.idleRounds >= TABLE_IDLE_ROUNDS) table.seats[index] = null;
  });

  const entries = bettors.map(({ seat, index }) => ({ seat: index, uid: seat.uid, name: seat.name, bet: seat.bet }));
  bettors.forEach(({ seat }) => { seat.bet = 0; });
  table.roundNo = (table.roundNo || 0) + 1;
  const round = startBlackjackRound(entries, ctx.randomInt, ctx.nowIso);
  round.no = table.roundNo;
  table.round = round;
  table.phase = 'playing';
  table.bettingEndsAt = null;
  ctx.changed = true;
  afterProgress(ctx);
}

/** 番の人の操作。seq は画面に出ている勝負の番号 (二度押しや古い画面からの操作を断る) */
export function moveTurn(ctx, uid, move, rawSeq) {
  const { table } = ctx;
  const player = table.phase === 'playing' ? blackjackTurnPlayer(table.round) : null;
  if (!player) throw new TableError(409, '進行中の勝負がありません。');
  if (player.uid !== uid) throw new TableError(409, 'あなたの番ではありません。');
  if (Number(rawSeq) !== (table.round.seq || 0)) {
    throw new TableError(409, '画面の表示が古くなっています。最新の状態を読み込み直してください。');
  }
  const wallet = ctx.wallets.get(uid);
  const chips = wallet ? wallet.chips : 0;
  const next = applyBlackjackMove(table.round, String(move || ''), chips, ctx.randomInt).chips;
  if (wallet && next !== chips) {
    wallet.chips = next;
    ctx.touchWallet(wallet, ctx.nowIso);
    ctx.touched.add(uid);
    const seat = table.seats[player.seat];
    if (seat) seat.chips = next;
  }
  ctx.changed = true;
  afterProgress(ctx);
}

/** 番の人の持ち時間切れ。ベット受付の締め切りは maybeStartRound が見る */
export function tickTable(ctx) {
  const { table } = ctx;
  if (table.phase !== 'playing' || !table.round || !table.turnEndsAt) return;
  if (Date.parse(table.turnEndsAt) > ctx.now) return;
  standOutTurnPlayer(table.round, ctx.randomInt);
  ctx.changed = true;
  afterProgress(ctx);
}

/** 誰でも読める形 (uid とディーラーの裏札を含めない) */
export function publicTable(table) {
  const playing = table.phase === 'playing';
  const turnPlayer = playing ? blackjackTurnPlayer(table.round) : null;
  const turnSeat = turnPlayer ? table.seats[turnPlayer.seat] : null;
  return {
    phase: table.phase,
    seq: table.seq || 0,
    roundNo: table.roundNo || 0,
    bettingEndsAt: table.bettingEndsAt || null,
    turnEndsAt: playing ? table.turnEndsAt || null : null,
    seats: Array.from({ length: TABLE_SEATS }, (_, index) => {
      const seat = (table.seats || [])[index];
      return seat ? { name: seat.name, bet: seat.bet, chips: seat.chips, idleRounds: seat.idleRounds || 0 } : null;
    }),
    round: publicBlackjackRound(table.round || null, turnSeat ? turnSeat.chips : 0),
    updatedAt: table.updatedAt || null
  };
}
