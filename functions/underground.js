// 船底 (レートが0以下の人の地下労働) のルール。
//   Firestore や HTTP には触らず、数の計算だけをここに置く (index.js から呼ぶ)。
//   乱数は呼び出し側から randomInt(n) → 0〜n-1 の整数 として受け取る。
//
//   - 入れるのはレートが0以下の人だけ。レートが1以上になったら船底を出て、残った金貨は没収 (0 に戻す)
//   - 積荷の仕分け: 1便ぶんの積荷 (並びはサーバーが決める) を木箱に振り分け、正解で金貨が増え、ミスで減る (1便でマイナスにはしない)
//   - チンチロ: 金貨を賭けて班長 (親) と勝負する。サイコロ3つ、役ができるまで3回まで振る
//       勝ち: 賭けた金貨 × (1 + 倍率) がレートになり、賭けた金貨は消える
//       負け: 賭け金 × 倍率 の金貨を失う (倍払い。最悪5倍でも払えるよう、賭けられるのは手持ちの1/5まで)
//   - 数値 (1便の個数・時間・給料・賭け金の範囲・ピンハネ率) は settings/app の underground_* で変えられる (管理画面)

export const UNDERGROUND_SOURCE = 'underground_chinchiro';
export const UNDERGROUND_RECENT_LIMIT = 12;
export const UNDERGROUND_MAX_LOSS_MULTIPLIER = 5;   // 負けで払う最大の倍率 (班長のピンゾロ)
export const UNDERGROUND_MIN_MS_PER_ITEM = 200;     // 1個あたりこれより速い操作は人間ではないとみなす
export const UNDERGROUND_SUBMIT_GRACE_MS = 10000;   // 制限時間を過ぎてから答えが届くまでの猶予 (通信の遅れ)

// settings/app のキー名 → 既定値。管理画面はこのキーで保存する
export const UNDERGROUND_SETTING_DEFAULTS = {
  underground_items_per_shipment: 20,   // 1便の積荷の数
  underground_shipment_seconds: 40,     // 1便の制限時間 (秒)
  underground_pay_correct: 5,           // 正しく仕分けた1個の給料 (金貨)
  underground_pay_miss: 5,              // 間違えた1個で減る金貨
  underground_bet_min: 10,              // チンチロの賭け金の下限 (金貨)
  underground_bet_max: 100,             // チンチロの賭け金の上限 (金貨)
  underground_pinhane_rate: 0           // 勝ったときに班長が抜く割合 (0.05 = 5%)
};

// 積荷 (絵柄はスロットと同じ) → 入れる木箱
export const CARGO_BINS = {
  chest: 'treasure',
  coin: 'treasure',
  rum: 'barrel',
  compass: 'tools',
  map: 'tools',
  anchor: 'tools',
  parrot: 'cage',
  wild: 'overboard'
};
export const CARGO_ITEMS = Object.keys(CARGO_BINS);
export const BIN_KEYS = ['treasure', 'barrel', 'tools', 'cage', 'overboard'];

export class UndergroundError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function toInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) + 0 : 0;
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * settings/app から船底の設定を取り出す。欠けていれば既定値、外れた値は範囲に収める。
 * 画面側 (assets/js/common.js の normalizeUndergroundSettings) と同じ丸め方にしておくこと
 */
export function undergroundSettingsFrom(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const d = UNDERGROUND_SETTING_DEFAULTS;
  const read = key => toNumber(source[key], d[key]);
  const betMin = clamp(Math.round(read('underground_bet_min')), 1, 100000);
  return {
    itemsPerShipment: clamp(Math.round(read('underground_items_per_shipment')), 5, 100),
    shipmentSeconds: clamp(Math.round(read('underground_shipment_seconds')), 10, 300),
    payCorrect: clamp(Math.round(read('underground_pay_correct')), 0, 1000),
    payMiss: clamp(Math.round(read('underground_pay_miss')), 0, 1000),
    betMin,
    betMax: clamp(Math.round(read('underground_bet_max')), betMin, 100000),
    pinhaneRate: clamp(read('underground_pinhane_rate'), 0, 0.5)
  };
}

/** 船底に入れるか (レートが0以下) */
export function isInUnderground(score) {
  return toInt(score) <= 0;
}

/** 保存されている船底の記録を、欠けている項目を埋めた形にする */
export function normalizeUndergroundRecord(record, player) {
  const source = record && typeof record === 'object' ? record : {};
  const shipment = source.shipment && typeof source.shipment === 'object' && Array.isArray(source.shipment.items)
    ? {
      id: String(source.shipment.id || ''),
      items: source.shipment.items.map(String).filter(item => Object.hasOwn(CARGO_BINS, item)),
      startedAt: String(source.shipment.startedAt || ''),
      seconds: Math.max(1, toInt(source.shipment.seconds))
    }
    : null;
  const stats = source.stats && typeof source.stats === 'object' ? source.stats : {};
  return {
    player: String(source.player || player || ''),
    coins: Math.max(0, toInt(source.coins)),
    shipment: shipment && shipment.id && shipment.items.length ? shipment : null,
    stats: {
      shipments: Math.max(0, toInt(stats.shipments)),       // 仕分けた便の数
      correct: Math.max(0, toInt(stats.correct)),
      missed: Math.max(0, toInt(stats.missed)),
      coinsEarned: Math.max(0, toInt(stats.coinsEarned)),   // 仕分けで得た金貨
      games: Math.max(0, toInt(stats.games)),               // チンチロの勝負の数
      wins: Math.max(0, toInt(stats.wins)),
      losses: Math.max(0, toInt(stats.losses)),
      rateWon: Math.max(0, toInt(stats.rateWon)),           // チンチロでレートにした額
      coinsLost: Math.max(0, toInt(stats.coinsLost)),       // チンチロの負けで失った金貨
      coinsForfeited: Math.max(0, toInt(stats.coinsForfeited)), // 船底を出るときに没収された金貨
      releases: Math.max(0, toInt(stats.releases))          // 船底を出た回数
    },
    recent: Array.isArray(source.recent) ? source.recent.slice(0, UNDERGROUND_RECENT_LIMIT) : [],
    updatedAt: source.updatedAt ? String(source.updatedAt) : null
  };
}

function pushRecent(record, entry) {
  return [entry, ...record.recent].slice(0, UNDERGROUND_RECENT_LIMIT);
}

/**
 * 船底を出る (レートが1以上になった)。残った金貨と仕分けの途中の便は没収する。
 * 金貨も途中の便も無ければ null (記録を書き直す必要がない)。always なら何も無くても出たことを記録する
 */
export function applyRelease(record, at, { always = false } = {}) {
  const current = normalizeUndergroundRecord(record);
  if (!always && current.coins <= 0 && !current.shipment) return null;
  const forfeited = current.coins;
  return {
    forfeited,
    record: {
      ...current,
      coins: 0,
      shipment: null,
      stats: {
        ...current.stats,
        coinsForfeited: current.stats.coinsForfeited + forfeited,
        releases: current.stats.releases + 1
      },
      recent: pushRecent(current, { type: 'release', forfeited, at }),
      updatedAt: at
    }
  };
}

// ------------------------------------------------------------------
// 積荷の仕分け
// ------------------------------------------------------------------

/** 1便ぶんの積荷の並び。絵柄は一様に選ぶ */
export function generateShipmentItems(randomInt, count) {
  return Array.from({ length: count }, () => CARGO_ITEMS[randomInt(CARGO_ITEMS.length)]);
}

/**
 * 答え合わせ。answers は積荷と同じ順の木箱の名前 (答えていない積荷は null / 省略)。
 * 給料 = 正解 × payCorrect − ミス × payMiss (1便でマイナスにはしない)
 */
export function gradeShipment(items, answers, config) {
  const list = Array.isArray(answers) ? answers : [];
  let correct = 0;
  let missed = 0;
  items.forEach((item, index) => {
    const answer = list[index];
    if (answer === null || answer === undefined || answer === '') return;
    if (String(answer) === CARGO_BINS[item]) correct += 1;
    else missed += 1;
  });
  const answered = correct + missed;
  return {
    correct,
    missed,
    unanswered: items.length - answered,
    answered,
    coins: Math.max(0, correct * config.payCorrect - missed * config.payMiss)
  };
}

/**
 * 答えが届いた時刻の検証。制限時間 (+ 通信の猶予) を過ぎていないか、人間には無理な速さでないか。
 * elapsedMs は便を始めてから答えが届くまでの実時間 (サーバーで測る)
 */
export function validateShipmentTiming(elapsedMs, answered, seconds) {
  if (elapsedMs > seconds * 1000 + UNDERGROUND_SUBMIT_GRACE_MS) {
    throw new UndergroundError(409, '時間切れです。この便の給料は出ません。');
  }
  if (elapsedMs < answered * UNDERGROUND_MIN_MS_PER_ITEM) {
    throw new UndergroundError(400, '仕分けが速すぎます。もう一度やり直してください。');
  }
}

/** 仕分けを終えたあとの記録 */
export function applyShipmentResult(record, grade, at) {
  const current = normalizeUndergroundRecord(record);
  return {
    ...current,
    coins: current.coins + grade.coins,
    shipment: null,
    stats: {
      ...current.stats,
      shipments: current.stats.shipments + 1,
      correct: current.stats.correct + grade.correct,
      missed: current.stats.missed + grade.missed,
      coinsEarned: current.stats.coinsEarned + grade.coins
    },
    recent: pushRecent(current, { type: 'shipment', correct: grade.correct, missed: grade.missed, coins: grade.coins, at }),
    updatedAt: at
  };
}

// ------------------------------------------------------------------
// チンチロ
// ------------------------------------------------------------------

// 役。rank が大きいほど強い (目は point で比べる)
const HAND_INFO = {
  pinzoro: { label: 'ピンゾロ', rank: 100, multiplier: 5 },
  zoro:    { label: 'ゾロ目', rank: 90, multiplier: 3 },
  shigoro: { label: 'シゴロ', rank: 80, multiplier: 2 },
  me:      { label: '目', rank: 10, multiplier: 1 },
  menashi: { label: '目なし', rank: 1, multiplier: 1 },
  hifumi:  { label: 'ヒフミ', rank: 0, multiplier: 2 }
};
export const CHINCHIRO_HANDS = HAND_INFO;
const STRONG_HANDS = new Set(['pinzoro', 'zoro', 'shigoro']);   // 出た時点で勝ち
const SELF_DEFEAT_HANDS = new Set(['hifumi', 'menashi']);       // 出た時点で負け
export const CHINCHIRO_MAX_ROLLS = 3;

/** サイコロ3つの役。役が無ければ null (振り直し) */
export function chinchiroHand(dice) {
  const sorted = [...dice].sort((a, b) => a - b);
  const [a, b, c] = sorted;
  if (a === 1 && b === 1 && c === 1) return { kind: 'pinzoro', point: 1 };
  if (a === c) return { kind: 'zoro', point: a };
  if (a === 4 && b === 5 && c === 6) return { kind: 'shigoro', point: 0 };
  if (a === 1 && b === 2 && c === 3) return { kind: 'hifumi', point: 0 };
  if (a === b) return { kind: 'me', point: c };
  if (b === c) return { kind: 'me', point: a };
  return null;
}

/** 役の名前 (「5の目」「ゾロ目 (4)」など) */
export function chinchiroHandLabel(hand) {
  if (!hand) return '';
  if (hand.kind === 'me') return `${hand.point}の目`;
  if (hand.kind === 'zoro') return `ゾロ目 (${hand.point})`;
  return HAND_INFO[hand.kind].label;
}

/** 役ができるまで3回まで振る。3回とも役が無ければ目なし */
export function rollChinchiroTurn(randomInt) {
  const rolls = [];
  for (let i = 0; i < CHINCHIRO_MAX_ROLLS; i++) {
    const dice = [randomInt(6) + 1, randomInt(6) + 1, randomInt(6) + 1];
    rolls.push(dice);
    const hand = chinchiroHand(dice);
    if (hand) return { rolls, hand };
  }
  return { rolls, hand: { kind: 'menashi', point: 0 } };
}

/**
 * 1回の勝負。班長 (親) が先に振り、強い役 (ピンゾロ・ゾロ目・シゴロ) なら親の勝ち、
 * ヒフミ・目なしなら親の負けでその場で決まる。親が目なら子 (プレイヤー) が振って比べる。
 * 倍率は勝った側の役 (親が自滅したときは親の役) で決まる
 */
export function playChinchiro(randomInt) {
  const dealer = rollChinchiroTurn(randomInt);
  const dk = dealer.hand.kind;
  if (STRONG_HANDS.has(dk)) {
    return { dealer, player: null, outcome: 'lose', multiplier: HAND_INFO[dk].multiplier, decidedBy: 'dealer' };
  }
  if (SELF_DEFEAT_HANDS.has(dk)) {
    return { dealer, player: null, outcome: 'win', multiplier: HAND_INFO[dk].multiplier, decidedBy: 'dealer' };
  }

  const player = rollChinchiroTurn(randomInt);
  const pk = player.hand.kind;
  if (STRONG_HANDS.has(pk)) {
    return { dealer, player, outcome: 'win', multiplier: HAND_INFO[pk].multiplier, decidedBy: 'player' };
  }
  if (SELF_DEFEAT_HANDS.has(pk)) {
    return { dealer, player, outcome: 'lose', multiplier: HAND_INFO[pk].multiplier, decidedBy: 'player' };
  }
  if (player.hand.point > dealer.hand.point) return { dealer, player, outcome: 'win', multiplier: 1, decidedBy: 'point' };
  if (player.hand.point < dealer.hand.point) return { dealer, player, outcome: 'lose', multiplier: 1, decidedBy: 'point' };
  return { dealer, player, outcome: 'draw', multiplier: 0, decidedBy: 'point' };
}

/** いま賭けられる上限。最悪5倍払いでも手持ちで払えるよう、手持ちの1/5までで、設定の上限まで */
export function maxChinchiroBet(coins, config) {
  return Math.min(config.betMax, Math.floor(Math.max(0, toInt(coins)) / UNDERGROUND_MAX_LOSS_MULTIPLIER));
}

/** 賭け金の検証 */
export function validateChinchiroBet(rawBet, coins, config) {
  const bet = Number(rawBet);
  const max = maxChinchiroBet(coins, config);
  if (!Number.isSafeInteger(bet) || bet < config.betMin) {
    throw new UndergroundError(400, `賭け金は${config.betMin}金貨以上の整数で入力してください。`);
  }
  if (max < config.betMin) {
    throw new UndergroundError(400, `金貨が足りません。${config.betMin * UNDERGROUND_MAX_LOSS_MULTIPLIER}枚あれば${config.betMin}金貨から賭けられます (負けたときの5倍払いに備えて、賭けられるのは手持ちの1/5まで)。`);
  }
  if (bet > max) {
    throw new UndergroundError(400, `いま賭けられるのは${max}金貨までです (手持ちの1/5、上限${config.betMax})。`);
  }
  return bet;
}

/**
 * 勝負の結果を金貨とレートの増減に直す。
 *   勝ち: 賭けた金貨は消え、賭け金 × (1 + 倍率) がレートになる (ピンハネ率ぶんを班長が抜く、端数切り捨て)
 *   負け: 賭け金 × 倍率 の金貨を失う
 *   引き分け: 何も動かない
 */
export function settleChinchiro(bet, result, config) {
  if (result.outcome === 'win') {
    const gross = bet * (1 + result.multiplier);
    const rate = Math.floor(gross * (1 - config.pinhaneRate));
    return { coinsDelta: -bet, rateDelta: rate, pinhane: gross - rate };
  }
  if (result.outcome === 'lose') {
    return { coinsDelta: -bet * result.multiplier, rateDelta: 0, pinhane: 0 };
  }
  return { coinsDelta: 0, rateDelta: 0, pinhane: 0 };
}

/** チンチロのあとの記録 */
export function applyChinchiroResult(record, bet, result, settled, at) {
  const current = normalizeUndergroundRecord(record);
  return {
    ...current,
    coins: Math.max(0, current.coins + settled.coinsDelta),
    stats: {
      ...current.stats,
      games: current.stats.games + 1,
      wins: current.stats.wins + (result.outcome === 'win' ? 1 : 0),
      losses: current.stats.losses + (result.outcome === 'lose' ? 1 : 0),
      rateWon: current.stats.rateWon + settled.rateDelta,
      coinsLost: current.stats.coinsLost + (result.outcome === 'lose' ? -settled.coinsDelta : 0)
    },
    recent: pushRecent(current, {
      type: 'chinchiro',
      bet,
      outcome: result.outcome,
      multiplier: result.multiplier,
      dealer: chinchiroHandLabel(result.dealer.hand),
      player: result.player ? chinchiroHandLabel(result.player.hand) : null,
      coinsDelta: settled.coinsDelta,
      rateDelta: settled.rateDelta,
      at
    }),
    updatedAt: at
  };
}

/** 増減ログの reason。「船底チンチロ 班長 3の目 / 自分 シゴロ (賭け100金貨 ×2)」 */
export function chinchiroReason(bet, result) {
  const dealer = chinchiroHandLabel(result.dealer.hand);
  const player = result.player ? ` / 自分 ${chinchiroHandLabel(result.player.hand)}` : '';
  return `船底チンチロ 班長 ${dealer}${player} (賭け${bet}金貨 ×${1 + result.multiplier})`;
}

/** 本人に返す形 (途中の便の積荷は、始めた本人の画面にだけ渡す) */
export function publicUndergroundRecord(record) {
  const current = normalizeUndergroundRecord(record);
  return {
    player: current.player,
    coins: current.coins,
    shipment: current.shipment ? { id: current.shipment.id, startedAt: current.shipment.startedAt, seconds: current.shipment.seconds, items: current.shipment.items } : null,
    stats: current.stats,
    recent: current.recent
  };
}
