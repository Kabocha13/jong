// 宝探しの卓 (全員共通の1卓) の進め方 (Firestore には触らない)。
// index.js がトランザクションの中で「卓の状態」と「券を買った人の財布 (casino_sessions)」を読んで渡し、
// ここで書き換えた卓と財布を書き戻す。ルール (盤面・配当・当たり) は gappori.js。
//
// 流れ
//   受付 (betting): その回の盤面と配当を見せて券を売る。最初の券が売れてから GAPPORI_BETTING_MS で締め切る。
//   抽選 (drawing): 3球を GAPPORI_BALL_MS おきに入れる。
//   チャンス (chance): 3球目のあと、まだ足りない絵柄がある券ごとに、予想の個数で決まる確率
//     (GAPPORI_CHANCE_RATES: 2個 2.5%・3個 5%・4個 7.5%・5個 15%) でチャンス。チャンスの券の持ち主は
//     GAPPORI_CHANCE_MS のうちに、その券のまだ足りない絵柄を1つ選んで「1球入ったこと」にする
//     (その券だけに効く。選ばなければ当たりやすくなるものを自動で選ぶ)。チャンスの券がなければ飛ばす。
//   受付は、券を買った人が全員「すぐ始める」を押したら、締め切りを待たずに始める。
//   残り2球を入れて結果 (result): 船長マスに球が入っていれば JP ルーレット (gappori.js の generateGapporiJpWheel) を1回回す。
//     JP ならジャックポットをその回に券を買った人で均等に分け、お宝ゲットなら全員の券ごとに足りないお宝を1つ
//     「1球入ったこと」にする (あと1球で当たりだった券が当たりになる)。ハズレなら何もしない。
//   払い戻しを財布に足し、外れた券の代金の1割をジャックポットに貯める。
//     GAPPORI_RESULT_MS (船長のときは + GAPPORI_CAPTAIN_MS、JP が当たったら さらに + GAPPORI_JACKPOT_MS) 見せてから、
//     次の盤面で受付に戻る。
//   券を買った人が途中で財布を精算しても券は残り、払い戻しはレートへ直接返す。
//   サーバーは常駐しないので、締め切りの判定は画面を開いている誰かの gpTick と定期処理で行う。
//   次の段階の時刻は前の締め切りから数えるので、誰も見ていないまま時間がたっていても1回の gpTick で最後まで進む。

import {
  GAPPORI_BALLS,
  GAPPORI_CAPTAIN,
  GAPPORI_CHANCE_RATES,
  GAPPORI_FIRST_BALLS,
  GAPPORI_JACKPOT_LOST_RATE,
  GAPPORI_JACKPOT_RATE,
  GAPPORI_JP_JACKPOT,
  GAPPORI_JP_TREASURE,
  GAPPORI_MAX_TICKETS,
  GAPPORI_MAX_UNITS,
  GAPPORI_UNIT_PRICES,
  drawGapporiBall,
  gapporiAutoChance,
  gapporiFeatured,
  gapporiHitList,
  gapporiJpTreasureChoice,
  gapporiOdds,
  gapporiPickKey,
  gapporiShortfall,
  gapporiUnitPrice,
  generateGapporiBoard,
  generateGapporiJpWheel,
  isGapporiWin,
  normalizeGapporiPicks
} from './gappori.js';

export const GAPPORI_BETTING_MS = 30 * 1000;
export const GAPPORI_BALL_MS = 5200;           // 球を1つ入れる間隔 (画面の演出もこの間隔。52.9 までは 2.6秒)
export const GAPPORI_SETTLE_MS = 900;          // 最後の球が入ってから次の段階までの間
export const GAPPORI_CHANCE_MS = 10 * 1000;
export const GAPPORI_RESULT_MS = 9 * 1000;
export const GAPPORI_CAPTAIN_MS = 10 * 1000;   // 船長チャンス (カットイン + JP ルーレットを回す) の演出のぶん、結果を長く見せる
export const GAPPORI_JACKPOT_MS = 4 * 1000;    // JP が当たったときのカットインのぶん、さらに長く見せる
const GAPPORI_RECENT_LIMIT = 12;
// 盤面と配当の作り方 (ルール) を変えたら上げる。卓がこれより古ければ、受付中で券が無いときに新しい作り方の盤面にする
// (1: 52.0 の 3〜5個・重ねなし / 2: 52.1 の 2〜5個・重ねてよい・同じお宝はまとめて並べる /
//  3: 52.2 の 1口 2個 10・3個 50・4個 100・5個 200 と、1口の払い戻しが整数になる倍率の刻み /
//  4: 52.3 の 配当の還元率 90% と、外れた券の代金の1割を 0 から貯めるジャックポット /
//  5: 52.4 の 券ごとに予想の個数で決まるチャンスの確率 /
//  6: 52.6 の チャンスの確率を半分に /
//  7: 54.17 の 本日のおすすめ (5・4・3・2個の予想を1つずつ、倍率 ×1.1) /
//  8: 54.19 の お宝を 7種類 → 11種類に (舵輪・望遠鏡・大砲・海賊旗。1回に並べるのは今までどおり6種類) /
//  9: 55.2 の 船長チャンスを JP ルーレット (JP 1/16・お宝ゲット 1/16) に)
export const GAPPORI_RULES_VERSION = 9;
const GAPPORI_CHANCE_SCALE = 1000;   // チャンスの確率を整数の乱数で引くときの目の細かさ
const GAPPORI_OLD_JACKPOT_SEED = 10000;   // 52.2 までジャックポットに最初に入れていた額 (ルールの版を上げるときに抜く)

export class GapporiTableError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 新しい盤面で受付を始める (前の回の券と球を片付ける) */
function startGapporiBoard(table, randomInt) {
  table.rulesVersion = GAPPORI_RULES_VERSION;
  table.board = generateGapporiBoard(randomInt);
  // 本日のおすすめ (個数ごとに1つ) は倍率を上げて配当表に入れる。券はこの配当表の倍率で買う
  const featured = gapporiFeatured(table.board, gapporiOdds(table.board), randomInt);
  table.odds = featured.odds;
  table.featured = featured.featured;
  table.phase = 'betting';
  table.roundNo = (table.roundNo || 0) + 1;
  table.tickets = [];
  table.balls = [];
  table.ballsAt = [];
  table.bettingEndsAt = null;
  table.drawEndsAt = null;
  table.chances = [];
  table.chanceEndsAt = null;
  table.ready = [];       // 「すぐ始める」を押した人の uid
  table.result = null;
  table.nextRoundAt = null;
}

export function emptyGapporiTable(randomInt) {
  const table = { roundNo: 0, jackpot: 0, seq: 0, updatedAt: null };
  startGapporiBoard(table, randomInt);
  return table;
}

/** 卓に関わる人 (この回の券を買った人) の uid */
export function gapporiTableUids(table) {
  return new Set((table.tickets || []).map(ticket => ticket.uid));
}

/** この回の券を持っていて、まだ結果が出ていない (自分では精算できない) */
export function isInLiveGapporiRound(table, uid) {
  return table.phase !== 'result' && (table.tickets || []).some(ticket => ticket.uid === uid);
}

export function createGapporiContext({ table, wallets, now, randomInt, touchWallet }) {
  return {
    table: JSON.parse(JSON.stringify(table)),
    wallets,
    now,
    nowIso: new Date(now).toISOString(),
    randomInt,
    touchWallet,
    touched: new Set(),     // 書き戻す財布
    orphanPayouts: [],      // 財布を精算済みの人へ、レートで直接返すぶん { uid, name, amount, reason }
    broke: new Set(),       // 結果が出てチップが尽きた人 (index.js がこのあと精算する)
    changed: false
  };
}

function iso(ms) {
  return new Date(ms).toISOString();
}

/**
 * ルールを変えたあとに残っている古い盤面を、受付中で券が無ければ新しい作り方の盤面にする。
 * 券がある回は、その回の盤面と配当のまま最後まで進める (index.js が操作の前に呼ぶ)
 */
export function refreshGapporiRules(ctx) {
  const { table } = ctx;
  if (table.rulesVersion === GAPPORI_RULES_VERSION) return;
  if (table.phase !== 'betting' || table.tickets.length) return;
  // 52.2 までは最初に1万を入れていたので、それを抜いて、賭けから貯まった分だけ残す
  if ((table.rulesVersion || 1) < 4) table.jackpot = Math.max(0, (table.jackpot || 0) - GAPPORI_OLD_JACKPOT_SEED);
  startGapporiBoard(table, ctx.randomInt);
  ctx.changed = true;
}

/**
 * 券をまとめて買う。orders は [{ picks, units }] (セットごとに予想と口数)。
 * picks は予想する絵柄 (2〜5。同じ絵柄を重ねてよい)、units は口数。1口の値段は予想の個数で決まる。
 * 全部のセットを確かめてから買う (途中で手元が足りなくなって一部だけ買える、ということはない)
 */
export function buyGapporiTickets(ctx, uid, name, rawOrders) {
  const { table } = ctx;
  if (table.phase !== 'betting' || (table.bettingEndsAt && Date.parse(table.bettingEndsAt) <= ctx.now)) {
    throw new GapporiTableError(409, 'この回の受付は締め切りました。次の回をお待ちください。');
  }
  const wallet = ctx.wallets.get(uid);
  if (!wallet) throw new GapporiTableError(409, 'ゲームの準備ができていません。画面を読み込み直してください。');
  const orders = Array.isArray(rawOrders) ? rawOrders : [];
  if (!orders.length) throw new GapporiTableError(400, '買う券を選んでください。');
  const bought = table.tickets.filter(ticket => ticket.uid === uid).length;
  if (bought + orders.length > GAPPORI_MAX_TICKETS) {
    throw new GapporiTableError(409, `1回に買える券は${GAPPORI_MAX_TICKETS}枚までです (いま${bought}枚)。`);
  }
  const tickets = orders.map(order => {
    const picks = normalizeGapporiPicks(table.board, order?.picks);
    const units = Number(order?.units);
    if (!Number.isSafeInteger(units) || units < 1 || units > GAPPORI_MAX_UNITS) {
      throw new GapporiTableError(400, `口数は1〜${GAPPORI_MAX_UNITS}で指定してください。`);
    }
    const key = gapporiPickKey(picks);
    if (!table.odds[key]) throw new GapporiTableError(409, 'この予想は次の回から買えます。');
    const price = gapporiUnitPrice(picks);
    const featured = (table.featured || []).some(item => item.key === key);
    return { uid, name, picks, key, units, price, cost: units * price, odds: table.odds[key], featured, at: ctx.nowIso };
  });
  const total = tickets.reduce((sum, ticket) => sum + ticket.cost, 0);
  if (total > wallet.chips) {
    throw new GapporiTableError(400, `使えるレート (${wallet.chips}) が足りません (合計 ${total})。`);
  }
  wallet.chips -= total;
  ctx.touchWallet(wallet, ctx.nowIso);
  ctx.touched.add(uid);
  table.tickets.push(...tickets);
  // 買い足した人は、まだ「すぐ始める」を押していないことにする
  table.ready = (table.ready || []).filter(id => id !== uid);
  if (!table.bettingEndsAt) table.bettingEndsAt = iso(ctx.now + GAPPORI_BETTING_MS);
  ctx.changed = true;
}

/** 「すぐ始める」: この回に券を買った人が全員押したら、締め切りを待たずに抽選を始める */
export function startGapporiNow(ctx, uid) {
  const { table } = ctx;
  if (table.phase !== 'betting') throw new GapporiTableError(409, 'もう抽選が始まっています。');
  if (!table.tickets.some(ticket => ticket.uid === uid)) throw new GapporiTableError(409, '券を買ってから押してください。');
  table.ready = [...new Set([...(table.ready || []), uid])];
  if ([...gapporiTableUids(table)].every(id => table.ready.includes(id))) {
    table.bettingEndsAt = ctx.nowIso;
  }
  ctx.changed = true;
}

/** 券を1枚買う (buyGapporiTickets のセット1つぶん) */
export function buyGapporiTicket(ctx, uid, name, rawPicks, rawUnits) {
  buyGapporiTickets(ctx, uid, name, [{ picks: rawPicks, units: rawUnits }]);
}

/** その券のまだ足りない絵柄 */
function shortOf(table, ticket) {
  return Object.keys(gapporiShortfall(table.board, table.balls, ticket.picks));
}

/**
 * チャンスで「1球入ったこと」にする絵柄を選ぶ。rawTicket はチャンスの券の番号 (この回の券の並びの添字)。
 * 古い画面は券を指定しないので、そのときは本人のまだ選んでいない最初のチャンスに当てる
 */
export function chooseGapporiChance(ctx, uid, rawTicket, rawKind) {
  const { table } = ctx;
  const mine = table.phase === 'chance' ? table.chances.filter(item => item.uid === uid && table.tickets[item.ticket]) : [];
  const ticketNo = Number(rawTicket);
  const chance = Number.isInteger(ticketNo) ? mine.find(item => item.ticket === ticketNo) : mine.find(item => !item.choice);
  if (!chance) throw new GapporiTableError(409, 'いまはお宝ゲットの時間ではありません。');
  if (chance.choice) throw new GapporiTableError(409, 'この券はもう選んであります。');
  const kind = String(rawKind || '');
  if (!shortOf(table, table.tickets[chance.ticket]).includes(kind)) {
    throw new GapporiTableError(400, 'その券でまだ足りないお宝を選んでください。');
  }
  chance.choice = kind;
  chance.auto = false;
  ctx.changed = true;
}

/** 球を count 個入れる。1つ目は start から GAPPORI_BALL_MS 後 */
function dropBalls(ctx, count, start) {
  const { table } = ctx;
  for (let i = 0; i < count; i++) {
    table.balls.push(drawGapporiBall(table.board, table.balls, ctx.randomInt));
    table.ballsAt.push(iso(start + (i + 1) * GAPPORI_BALL_MS));
  }
  table.phase = 'drawing';
  table.drawEndsAt = iso(start + count * GAPPORI_BALL_MS + GAPPORI_SETTLE_MS);
}

/** 3球が入ったあと: まだ足りない絵柄がある券ごとにチャンスを引く。チャンスの券がなければ残りの球へ */
function startChance(ctx, start) {
  const { table } = ctx;
  table.chances = table.tickets
    .map((ticket, index) => ({ ticket, index }))
    .filter(({ ticket }) => shortOf(table, ticket).length > 0
      && ctx.randomInt(GAPPORI_CHANCE_SCALE) < Math.round(GAPPORI_CHANCE_RATES[ticket.picks.length] * GAPPORI_CHANCE_SCALE))
    .map(({ ticket, index }) => ({ ticket: index, uid: ticket.uid, name: ticket.name, choice: null, auto: false }));
  if (table.chances.length) {
    table.phase = 'chance';
    table.chanceEndsAt = iso(start + GAPPORI_CHANCE_MS);
  } else {
    dropBalls(ctx, GAPPORI_BALLS - GAPPORI_FIRST_BALLS, start);
  }
}

/** 選ばなかった人のチャンスを自動で決めて、残りの球へ */
function closeChance(ctx, start) {
  const { table } = ctx;
  // 券ごとになる前 (ルールの版 4 まで) の、券の番号がないチャンスは外す
  table.chances = table.chances.filter(chance => table.tickets[chance.ticket]);
  table.chances.forEach(chance => {
    if (chance.choice) return;
    chance.choice = gapporiAutoChance(table.board, table.balls, [table.tickets[chance.ticket]]);
    chance.auto = true;
  });
  table.chanceEndsAt = null;
  dropBalls(ctx, GAPPORI_BALLS - GAPPORI_FIRST_BALLS, start);
}

function creditGappori(ctx, uid, name, amount, reason) {
  if (!amount) return;
  const wallet = ctx.wallets.get(uid);
  if (wallet) {
    wallet.chips += amount;
  } else {
    ctx.orphanPayouts.push({ uid, name, amount, reason });
  }
}

/** 5球が入った: 当たりの払い戻しと、船長マスなら JP ルーレット (JP / お宝ゲット / ハズレ) */
function finishGapporiRound(ctx, start) {
  const { table } = ctx;
  const grantedBy = new Map(table.chances.map(chance => [chance.ticket, chance.choice]));
  const settle = (ticket, index, extra = null) => {
    ticket.win = isGapporiWin(table.board, table.balls, ticket.picks, [grantedBy.get(index) || null, extra]);
    ticket.payout = ticket.win ? Math.round(ticket.cost * ticket.odds) : 0;
  };
  table.tickets.forEach((ticket, index) => settle(ticket, index));

  const costBy = new Map();
  table.tickets.forEach(ticket => {
    const current = costBy.get(ticket.uid) || { name: ticket.name, cost: 0 };
    current.cost += ticket.cost;
    costBy.set(ticket.uid, current);
  });

  // 船長マスに球が入ったらチャンスタイム: JP ルーレットを1回回す (券を買った人がいる回だけ)
  const captain = table.balls.some(index => table.board.pockets[index] === GAPPORI_CAPTAIN);
  const jackpot = { captain, rate: GAPPORI_JACKPOT_RATE, wheel: null, index: null, kind: null, won: false, amount: 0, shares: [], granted: [] };
  if (captain && costBy.size) {
    const wheel = generateGapporiJpWheel(ctx.randomInt);
    jackpot.wheel = wheel.pockets;
    jackpot.index = wheel.index;
    jackpot.kind = wheel.kind;
  }

  // お宝ゲット: 全員の券ごとに、足りないお宝を1つ「1球入ったこと」にする (あと1球で当たりだった券が当たりになる)
  if (jackpot.kind === GAPPORI_JP_TREASURE) {
    table.tickets.forEach((ticket, index) => {
      if (ticket.win) return;
      const kind = gapporiJpTreasureChoice(table.board, table.balls, ticket.picks, grantedBy.get(index) || null);
      if (!kind) return;
      ticket.granted = kind;
      settle(ticket, index, kind);
      jackpot.granted.push({ ticket: index, uid: ticket.uid, name: ticket.name, kind });
    });
  }

  // 外れた券の代金の1割をジャックポットに貯める (この回のぶんも、このあとの JP に入る)
  const lost = table.tickets.filter(ticket => !ticket.win).reduce((sum, ticket) => sum + ticket.cost, 0);
  table.jackpot = (table.jackpot || 0) + lost * GAPPORI_JACKPOT_LOST_RATE;

  // JP: ジャックポットをその回に券を買った人で均等に分ける
  if (jackpot.kind === GAPPORI_JP_JACKPOT) {
    const amount = Math.floor(table.jackpot);
    // 均等に割り、割り切れない端数は1ずつ、くじで選んだ人に足す
    const people = [...costBy.entries()];
    for (let i = people.length - 1; i > 0; i--) {
      const j = ctx.randomInt(i + 1);
      [people[i], people[j]] = [people[j], people[i]];
    }
    const each = Math.floor(amount / people.length);
    const extra = amount - each * people.length;
    const shares = people
      .map(([uid, item], index) => ({ uid, name: item.name, cost: item.cost, amount: each + (index < extra ? 1 : 0) }))
      .sort((a, b) => b.amount - a.amount || b.cost - a.cost);
    jackpot.won = true;
    jackpot.amount = amount;
    jackpot.shares = shares.map(({ uid, name, amount: share }) => ({ uid, name, amount: share }));
    table.jackpot -= amount;
  }

  costBy.forEach((item, uid) => {
    const tickets = table.tickets.filter(ticket => ticket.uid === uid);
    const payout = tickets.reduce((sum, ticket) => sum + ticket.payout, 0);
    const share = jackpot.shares.find(entry => entry.uid === uid)?.amount || 0;
    creditGappori(ctx, uid, item.name, payout, 'payout');
    creditGappori(ctx, uid, item.name, share, 'jackpot');
    const wallet = ctx.wallets.get(uid);
    if (!wallet) return;
    wallet.gpRounds = (wallet.gpRounds || 0) + 1;
    wallet.wagered = (wallet.wagered || 0) + item.cost;   // 賭けた額は結果の回に数える (増減ログの「賭け」)
    wallet.gpRecent = [{
      bet: item.cost,
      returned: payout + share,
      jackpot: share,
      wins: tickets.filter(ticket => ticket.win).length,
      tickets: tickets.length,
      at: ctx.nowIso
    }, ...(wallet.gpRecent || [])].slice(0, GAPPORI_RECENT_LIMIT);
    ctx.touchWallet(wallet, ctx.nowIso);
    ctx.touched.add(uid);
    if (wallet.chips <= 0) ctx.broke.add(uid);
  });

  table.result = {
    hits: gapporiHitList(table.board, table.balls),
    jackpot
  };
  table.phase = 'result';
  table.nextRoundAt = iso(start + GAPPORI_RESULT_MS + (jackpot.kind ? GAPPORI_CAPTAIN_MS : 0) + (jackpot.won ? GAPPORI_JACKPOT_MS : 0));
}

/**
 * 締め切りを過ぎた段階を先へ進める (どの操作のあとにも呼ぶ)。
 * 次の段階の時刻は前の締め切りから数えるので、遅れて呼ばれても順に最後まで進む
 */
export function advanceGapporiTable(ctx) {
  const { table } = ctx;
  for (let guard = 0; guard < 10; guard++) {
    const due = deadline => Boolean(deadline) && Date.parse(deadline) <= ctx.now;
    if (table.phase === 'betting') {
      if (!table.tickets.length || !due(table.bettingEndsAt)) return;
      dropBalls(ctx, GAPPORI_FIRST_BALLS, Date.parse(table.bettingEndsAt));
      table.bettingEndsAt = null;
    } else if (table.phase === 'drawing') {
      if (!due(table.drawEndsAt)) return;
      const start = Date.parse(table.drawEndsAt);
      if (table.balls.length < GAPPORI_BALLS) startChance(ctx, start);
      else finishGapporiRound(ctx, start);
    } else if (table.phase === 'chance') {
      const everyone = table.chances.every(chance => chance.choice);
      if (!everyone && !due(table.chanceEndsAt)) return;
      closeChance(ctx, everyone ? ctx.now : Date.parse(table.chanceEndsAt));
    } else if (table.phase === 'result') {
      if (!due(table.nextRoundAt)) return;
      startGapporiBoard(table, ctx.randomInt);
    } else {
      startGapporiBoard(table, ctx.randomInt);
    }
    ctx.changed = true;
  }
}

/** 誰でも読める形 (uid を含めない) */
export function publicGapporiTable(table) {
  const showChances = table.phase === 'chance' || table.phase === 'result' || (table.phase === 'drawing' && table.balls.length > GAPPORI_FIRST_BALLS);
  return {
    phase: table.phase,
    seq: table.seq || 0,
    roundNo: table.roundNo || 0,
    rulesVersion: table.rulesVersion || 1,
    board: table.board,
    odds: table.odds,
    featured: table.featured || [],
    prices: GAPPORI_UNIT_PRICES,
    jackpot: Math.floor(table.jackpot || 0),
    jackpotRate: GAPPORI_JACKPOT_RATE,   // JP ルーレットで JP が出る確率 (1/16)
    ready: (table.ready || []).map(id => table.tickets.find(ticket => ticket.uid === id)?.name).filter(Boolean),
    bettingEndsAt: table.bettingEndsAt || null,
    balls: table.balls || [],
    ballsAt: table.ballsAt || [],
    drawEndsAt: table.drawEndsAt || null,
    chances: showChances ? (table.chances || []).map(({ ticket, name, choice, auto }) => ({ ticket, name, choice, auto: Boolean(auto) })) : [],
    chanceEndsAt: table.chanceEndsAt || null,
    tickets: (table.tickets || []).map(({ name, picks, key, units, cost, odds, featured, win, payout, granted }) => (
      table.phase === 'result'
        ? { name, picks, key, units, cost, odds, featured: Boolean(featured), win, payout, granted: granted || null }
        : { name, picks, key, units, cost, odds, featured: Boolean(featured) }
    )),
    result: table.result
      ? {
        hits: table.result.hits,
        jackpot: {
          ...table.result.jackpot,
          shares: table.result.jackpot.shares.map(({ name, amount }) => ({ name, amount })),
          granted: (table.result.jackpot.granted || []).map(({ ticket, name, kind }) => ({ ticket, name, kind }))
        }
      }
      : null,
    nextRoundAt: table.nextRoundAt || null,
    updatedAt: table.updatedAt || null
  };
}
