// 沈没 (全員共通の1卓のチキンレース) のルールと卓の進め方 (Firestore には触らない)。
// index.js がトランザクションの中で「卓の状態」と「乗った人の財布 (casino_sessions)」を読んで渡し、
// ここで書き換えた卓と財布を書き戻す。乱数は randomInt(n) → 0〜n-1 の整数 として受け取る。
//
// ルール
//   運賃は最初に乗った人が SINK_FARES から選び、あとから乗る人も同じ額を払う (最大 SINK_MAX_PLAYERS 人)。
//   2人そろうと乗船の受付 (SINK_BOARDING_MS) が始まり、締め切るか全員が「出港準備OK」を押したら出港する。
//   1人のまま SINK_LONELY_MS たつと、運賃を返して船を片付ける。受付のあいだは降りれば運賃が戻る。
//   出港すると船は沈み始め、出港から SINK_MIN_MS〜SINK_MAX_MS (10〜30秒) のどこかで沈む。どの時刻も同じ確率
//   (平均20秒。54.8 までは 5秒 + 指数分布で最長60秒)。沈む時刻はサーバーだけが知っている。
//   浸水 (画面の水位) は出港で 0、沈む時刻でちょうど満水 (1) になる。速さは 0.6〜1.8秒ごとに 0.25〜2倍で変わる
//   (出港のときに sinkCurve として決めておく)。画面には「いまの水位と、いまの速さ」だけを返し、この先の速さは見せない。
//   航海のあいだは「飛び降りる」を押せる。誰が飛び降りたかは結果まで見せない (画面にも公開の写しにも出さない)。
//   沈んだら、沈む前に飛び降りた人のうち、いちばん最後に飛び降りた1人が総取り。
//   賞金 = 運賃の合計 − 運営の取り分 (SINK_RAKE) + 海の底の財宝 (持ち越し)。
//   誰も飛び降りなかったら (全員沈んだら) 賞金はまるごと海の底の財宝として次の便へ持ち越す。
//   還元率は 1 − SINK_RAKE = 95% (持ち越しもいずれ誰かに渡る)。

export const SINK_FARES = [10, 50, 100, 500, 1000, 5000];
export const SINK_MIN_PLAYERS = 2;
export const SINK_MAX_PLAYERS = 8;
export const SINK_BOARDING_MS = 20 * 1000;
export const SINK_LONELY_MS = 10 * 60 * 1000;
export const SINK_MIN_MS = 10 * 1000;
export const SINK_MAX_MS = 30 * 1000;
export const SINK_RAKE = 0.05;
export const SINK_RESULT_MS = 12 * 1000;
const SINK_RECENT_LIMIT = 12;

export class SinkTableError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function iso(ms) {
  return new Date(ms).toISOString();
}

export function emptySinkTable() {
  return {
    phase: 'waiting',      // waiting (1人以下) / boarding (2人以上で受付中) / sailing / result
    roundNo: 0,
    seq: 0,
    fare: null,
    carry: 0,              // 海の底の財宝 (全員沈んだ便の賞金の持ち越し)
    players: [],           // [{ uid, name, jumpAt }]
    ready: [],             // 出港準備OK を押した uid
    boardingEndsAt: null,
    lonelyEndsAt: null,
    departAt: null,
    sinkAt: null,          // 沈む時刻 (公開の写しには出さない)
    curve: null,           // 浸水の進み方 [{ at (出港からのミリ秒), p (そこまでの水位 0〜1) }] (公開の写しには出さない)
    result: null,
    nextRoundAt: null,
    updatedAt: null
  };
}

/**
 * 浸水の進み方。totalMs (出港から沈むまで) を 0.6〜1.8秒の区間に分け、区間ごとの速さを 0.25〜2倍から選ぶ。
 * 返り値は区間の終わりごとの [{ at, p }] で、最後の p は 1 (沈む時刻にちょうど満水)
 */
export function buildSinkCurve(totalMs, randomInt) {
  const segments = [];
  for (let at = 0; at < totalMs;) {
    const length = Math.min(totalMs - at, 600 + randomInt(1201));
    const speed = 25 + randomInt(176);
    segments.push({ length, weight: length * speed });
    at += length;
  }
  const total = segments.reduce((sum, segment) => sum + segment.weight, 0);
  let at = 0;
  let filled = 0;
  return segments.map((segment, index) => {
    at += segment.length;
    filled += segment.weight;
    return { at, p: index === segments.length - 1 ? 1 : filled / total };
  });
}

/**
 * いまの浸水。航海中は { elapsedMs, progress (0〜1), rate (1ミリ秒あたりの水位の増え方。いまの区間だけ) }、
 * 沈んだあとは { progress: 1 }、それ以外は null
 */
export function sinkSeaState(table, now) {
  if (table.phase === 'result') return { roundNo: table.roundNo, progress: 1, rate: 0 };
  if (table.phase !== 'sailing' || !Array.isArray(table.curve) || !table.curve.length) return null;
  const elapsed = Math.max(0, now - Date.parse(table.departAt));
  let before = { at: 0, p: 0 };
  for (const point of table.curve) {
    if (elapsed < point.at) {
      const rate = (point.p - before.p) / Math.max(1, point.at - before.at);
      return { roundNo: table.roundNo, elapsedMs: elapsed, progress: before.p + rate * (elapsed - before.at), rate };
    }
    before = point;
  }
  return { roundNo: table.roundNo, elapsedMs: elapsed, progress: 1, rate: 0 };
}

/** 出港から沈むまでの長さ (ミリ秒)。SINK_MIN_MS〜SINK_MAX_MS から一様に選ぶ */
export function sinkDuration(randomInt) {
  return SINK_MIN_MS + randomInt(SINK_MAX_MS - SINK_MIN_MS + 1);
}

export function createSinkContext({ table, wallets, now, randomInt, touchWallet }) {
  return {
    table: JSON.parse(JSON.stringify(table)),
    wallets,
    now,
    nowIso: iso(now),
    randomInt,
    touchWallet,
    changed: false,         // 卓 (非公開) を書き直す
    publicChanged: false,   // 公開の写しも書き直す (飛び降りたときは書き直さない。人の動きを見せないため)
    touched: new Set(),
    orphanPayouts: [],
    broke: new Set()
  };
}

function markPublic(ctx) {
  ctx.changed = true;
  ctx.publicChanged = true;
}

function playerIndex(table, uid) {
  return table.players.findIndex(player => player.uid === uid);
}

/** 卓に関わる人 (乗っている人) の uid */
export function sinkTableUids(table) {
  return new Set((table.players || []).map(player => player.uid));
}

/** 乗っていて、まだ結果が出ていない (自分では精算できない) */
export function isInLiveSinkRound(table, uid) {
  return Boolean(table) && table.phase !== 'result' && playerIndex(table, uid) >= 0;
}

function credit(ctx, uid, name, amount, reason) {
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

function clearBoat(table) {
  table.phase = 'waiting';
  table.fare = null;
  table.players = [];
  table.ready = [];
  table.boardingEndsAt = null;
  table.lonelyEndsAt = null;
  table.departAt = null;
  table.sinkAt = null;
  table.curve = null;
}

function depart(ctx) {
  const { table } = ctx;
  table.roundNo = (table.roundNo || 0) + 1;
  table.phase = 'sailing';
  table.departAt = ctx.nowIso;
  const duration = sinkDuration(ctx.randomInt);
  table.sinkAt = iso(ctx.now + duration);
  table.curve = buildSinkCurve(duration, ctx.randomInt);
  table.ready = [];
  table.boardingEndsAt = null;
  table.lonelyEndsAt = null;
  table.result = null;
  table.players.forEach(player => { player.jumpAt = null; });
  markPublic(ctx);
}

/** 乗る。最初の人は運賃を選ぶ (rawFare)。あとの人は決まった運賃を払う */
export function boardSink(ctx, uid, name, rawFare) {
  const { table } = ctx;
  if (table.phase === 'sailing' || table.phase === 'result') {
    throw new SinkTableError(409, '船は出港しています。次の便を待ってください。');
  }
  if (playerIndex(table, uid) >= 0) throw new SinkTableError(409, 'もう乗っています。');
  if (table.players.length >= SINK_MAX_PLAYERS) throw new SinkTableError(409, `満員です (${SINK_MAX_PLAYERS}人まで)。`);
  const wallet = ctx.wallets.get(uid);
  if (!wallet) throw new SinkTableError(409, 'ゲームの準備ができていません。画面を読み込み直してください。');
  const fare = table.fare ?? Number(rawFare);
  if (!SINK_FARES.includes(fare)) throw new SinkTableError(400, `運賃は ${SINK_FARES.join('・')} から選んでください。`);
  if (wallet.chips < fare) throw new SinkTableError(400, `使えるレート (${wallet.chips}) が運賃 (${fare}) に足りません。`);

  wallet.chips -= fare;
  ctx.touchWallet(wallet, ctx.nowIso);
  ctx.touched.add(uid);
  table.fare = fare;
  table.players.push({ uid, name, jumpAt: null });
  if (table.players.length < SINK_MIN_PLAYERS) {
    table.phase = 'waiting';
    table.lonelyEndsAt = iso(ctx.now + SINK_LONELY_MS);
  } else if (table.phase === 'waiting') {
    table.phase = 'boarding';
    table.boardingEndsAt = iso(ctx.now + SINK_BOARDING_MS);
    table.lonelyEndsAt = null;
  }
  markPublic(ctx);
}

/** 受付のあいだに降りる (運賃は戻る) */
export function leaveSink(ctx, uid) {
  const { table } = ctx;
  const index = playerIndex(table, uid);
  if (index < 0) throw new SinkTableError(409, '乗っていません。');
  if (table.phase !== 'waiting' && table.phase !== 'boarding') {
    throw new SinkTableError(409, '出港したあとは「飛び降りる」しかありません。');
  }
  const [player] = table.players.splice(index, 1);
  table.ready = table.ready.filter(id => id !== uid);
  credit(ctx, uid, player.name, table.fare, 'refund');
  if (!table.players.length) {
    clearBoat(table);
  } else if (table.players.length < SINK_MIN_PLAYERS) {
    table.phase = 'waiting';
    table.boardingEndsAt = null;
    table.ready = [];
    table.lonelyEndsAt = iso(ctx.now + SINK_LONELY_MS);
  }
  markPublic(ctx);
}

/** 出港準備OK。乗っている全員が押したら、受付を待たずに出港する */
export function readySink(ctx, uid) {
  const { table } = ctx;
  if (table.phase !== 'boarding') throw new SinkTableError(409, 'いまは出港の準備ができません。');
  if (playerIndex(table, uid) < 0) throw new SinkTableError(409, '乗っていません。');
  if (!table.ready.includes(uid)) table.ready.push(uid);
  if (table.players.every(player => table.ready.includes(player.uid))) depart(ctx);
  markPublic(ctx);
}

/** 飛び降りる。沈む前に届けば、その時刻を残す (公開の写しは書き直さない) */
export function jumpSink(ctx, uid) {
  const { table } = ctx;
  const index = playerIndex(table, uid);
  if (index < 0) throw new SinkTableError(409, 'この便には乗っていません。');
  if (table.phase !== 'sailing') throw new SinkTableError(409, '船はもう沈みました…');
  const player = table.players[index];
  if (player.jumpAt) throw new SinkTableError(409, 'もう飛び降りています。');
  player.jumpAt = ctx.nowIso;
  ctx.changed = true;
}

/** 沈んだ: いちばん最後に飛び降りた1人が総取り。誰もいなければ持ち越し */
function finishSink(ctx) {
  const { table } = ctx;
  const departMs = Date.parse(table.departAt);
  const sinkMs = Date.parse(table.sinkAt);
  const jumped = table.players.filter(player => player.jumpAt && Date.parse(player.jumpAt) < sinkMs);
  const winner = jumped.reduce((best, player) => (!best || Date.parse(player.jumpAt) > Date.parse(best.jumpAt) ? player : best), null);
  const pot = table.fare * table.players.length;
  const rake = Math.floor(pot * SINK_RAKE);
  const carryIn = Math.floor(table.carry || 0);
  const prize = pot - rake + carryIn;
  if (winner) {
    credit(ctx, winner.uid, winner.name, prize, 'payout');
    table.carry = 0;
  } else {
    table.carry = prize;
  }
  table.players.forEach(player => {
    const wallet = ctx.wallets.get(player.uid);
    if (!wallet) return;
    const won = winner && winner.uid === player.uid;
    wallet.skRounds = (wallet.skRounds || 0) + 1;
    wallet.wagered = (wallet.wagered || 0) + table.fare;   // 賭けた額は結果の回に数える (増減ログの「賭け」)
    wallet.skRecent = [{
      bet: table.fare,
      returned: won ? prize : 0,
      won: Boolean(won),
      jumpMs: player.jumpAt ? Date.parse(player.jumpAt) - departMs : null,
      sinkMs: sinkMs - departMs,
      at: ctx.nowIso
    }, ...(wallet.skRecent || [])].slice(0, SINK_RECENT_LIMIT);
    ctx.touchWallet(wallet, ctx.nowIso);
    ctx.touched.add(player.uid);
    if (wallet.chips <= 0) ctx.broke.add(player.uid);
  });
  table.result = {
    roundNo: table.roundNo,
    fare: table.fare,
    pot,
    rake,
    carryIn,
    prize,
    carryOut: winner ? 0 : prize,
    winner: winner ? winner.name : null,
    sinkMs: sinkMs - departMs,
    jumps: table.players
      .map(player => ({ name: player.name, ms: player.jumpAt ? Date.parse(player.jumpAt) - departMs : null }))
      .sort((a, b) => (b.ms ?? -1) - (a.ms ?? -1))
  };
  table.phase = 'result';
  table.nextRoundAt = iso(ctx.now + SINK_RESULT_MS);
  markPublic(ctx);
}

/** 締め切りを過ぎた段階を先へ進める (どの操作の前後にも呼ぶ) */
export function advanceSinkTable(ctx) {
  const { table } = ctx;
  for (let guard = 0; guard < 6; guard++) {
    if (table.phase === 'waiting' && table.players.length && table.lonelyEndsAt && ctx.now >= Date.parse(table.lonelyEndsAt)) {
      table.players.forEach(player => credit(ctx, player.uid, player.name, table.fare, 'refund'));
      clearBoat(table);
      markPublic(ctx);
    } else if (table.phase === 'boarding' && ctx.now >= Date.parse(table.boardingEndsAt)) {
      depart(ctx);
    } else if (table.phase === 'sailing' && ctx.now >= Date.parse(table.sinkAt)) {
      finishSink(ctx);
    } else if (table.phase === 'result' && ctx.now >= Date.parse(table.nextRoundAt)) {
      clearBoat(table);
      table.result = null;
      table.nextRoundAt = null;
      markPublic(ctx);
    } else {
      return;
    }
  }
}

/** 誰でも読める形。沈む時刻と、航海中に誰が飛び降りたかは出さない */
export function publicSinkTable(table) {
  return {
    phase: table.phase,
    seq: table.seq || 0,
    roundNo: table.roundNo || 0,
    fare: table.fare,
    carry: Math.floor(table.carry || 0),
    players: (table.players || []).map(player => ({ name: player.name, ready: (table.ready || []).includes(player.uid) })),
    boardingEndsAt: table.boardingEndsAt || null,
    lonelyEndsAt: table.lonelyEndsAt || null,
    departAt: table.phase === 'sailing' ? table.departAt : null,
    result: table.phase === 'result' ? table.result : null,
    nextRoundAt: table.nextRoundAt || null,
    rules: {
      fares: SINK_FARES,
      minPlayers: SINK_MIN_PLAYERS,
      maxPlayers: SINK_MAX_PLAYERS,
      rake: SINK_RAKE,
      minMs: SINK_MIN_MS,
      maxMs: SINK_MAX_MS
    },
    updatedAt: table.updatedAt || null
  };
}

/** 本人だけに返す分 (乗っているか・飛び降りた時刻) */
export function sinkMine(table, uid) {
  const player = (table.players || []).find(item => item.uid === uid);
  if (!player) return { aboard: false, jumpMs: null };
  return {
    aboard: true,
    jumpMs: player.jumpAt && table.departAt ? Date.parse(player.jumpAt) - Date.parse(table.departAt) : null
  };
}
