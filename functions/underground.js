// 船底 (レートが低い人の地下労働) のルール。
//   Firestore や HTTP には触らず、数の計算だけをここに置く (index.js から呼ぶ)。
//   乱数は呼び出し側から randomInt(n) → 0〜n-1 の整数 として受け取る。
//
//   - 積荷の仕分け: 流れてくる積荷を正しい木箱に入れるたびにレートが上がる (既定 +1。間違えても既定では下がらない)。
//     時間の制限はない
//   - 上がるのは上限 (settings の underground_max_rate、既定1000) まで。レートが上限以上の人は仕分けできない
//   - 積荷はサーバーが1回ぶん (既定20個) ずつ決めて渡し、答えをまとめて受け取って採点する。
//     続けるときは、採点の返事と一緒に次の積荷を渡す (画面では途切れずに流れる)
//   - 数値 (上限・1個あたりの増減・1回ぶんの個数) は settings/app の underground_* で変えられる (管理画面)
//   - チンチロ (金貨を賭けてレートにする) は 50.5 で休止した。コードは 50.4 までの git の履歴にある

export const UNDERGROUND_WORK_SOURCE = 'underground_work';
export const UNDERGROUND_RECENT_LIMIT = 12;
export const UNDERGROUND_MIN_MS_PER_ITEM = 200;     // 1個あたりこれより速い操作は人間ではないとみなす

// settings/app のキー名 → 既定値。管理画面はこのキーで保存する
export const UNDERGROUND_SETTING_DEFAULTS = {
  underground_max_rate: 1000,           // 仕分けで上げられるレートの上限 (これ未満の人が仕分けできる)
  underground_rate_per_correct: 1,      // 正しく仕分けた1個で上がるレート
  underground_rate_per_miss: 0,         // 間違えた1個で下がるレート
  underground_items_per_shipment: 20    // 1回に渡す積荷の数 (答えをまとめて送る単位。画面では途切れず流れる)
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
  return {
    maxRate: clamp(Math.round(read('underground_max_rate')), -100000, 100000),
    ratePerCorrect: clamp(Math.round(read('underground_rate_per_correct')), 0, 1000),
    ratePerMiss: clamp(Math.round(read('underground_rate_per_miss')), 0, 1000),
    itemsPerShipment: clamp(Math.round(read('underground_items_per_shipment')), 5, 100)
  };
}

/** 仕分けできるか (レートが上限未満) */
export function canWorkUnderground(score, config) {
  return toInt(score) < config.maxRate;
}

/** 保存されている船底の記録を、欠けている項目を埋めた形にする (チンチロの頃の金貨などは読まない) */
export function normalizeUndergroundRecord(record, player) {
  const source = record && typeof record === 'object' ? record : {};
  const shipment = source.shipment && typeof source.shipment === 'object' && Array.isArray(source.shipment.items)
    ? {
      id: String(source.shipment.id || ''),
      items: source.shipment.items.map(String).filter(item => Object.hasOwn(CARGO_BINS, item)),
      startedAt: String(source.shipment.startedAt || '')
    }
    : null;
  const stats = source.stats && typeof source.stats === 'object' ? source.stats : {};
  return {
    player: String(source.player || player || ''),
    shipment: shipment && shipment.id && shipment.items.length ? shipment : null,
    stats: {
      correct: Math.max(0, toInt(stats.correct)),        // 正しく仕分けた数
      missed: Math.max(0, toInt(stats.missed)),          // 間違えた数
      rateEarned: toInt(stats.rateEarned)                // 仕分けで動いたレートの合計
    },
    recent: Array.isArray(source.recent)
      ? source.recent.filter(entry => entry && entry.type === 'work').slice(0, UNDERGROUND_RECENT_LIMIT)
      : [],
    updatedAt: source.updatedAt ? String(source.updatedAt) : null
  };
}

/** 1回ぶんの積荷の並び。絵柄は一様に選ぶ */
export function generateShipmentItems(randomInt, count) {
  return Array.from({ length: count }, () => CARGO_ITEMS[randomInt(CARGO_ITEMS.length)]);
}

/** 答え合わせ。answers は積荷と同じ順の木箱の名前 (答えていない積荷は null / 省略) */
export function gradeShipment(items, answers) {
  const list = Array.isArray(answers) ? answers : [];
  let correct = 0;
  let missed = 0;
  items.forEach((item, index) => {
    const answer = list[index];
    if (answer === null || answer === undefined || answer === '') return;
    if (String(answer) === CARGO_BINS[item]) correct += 1;
    else missed += 1;
  });
  return { correct, missed, answered: correct + missed, unanswered: items.length - correct - missed };
}

/** 人間には無理な速さでないか。elapsedMs は積荷を渡してから答えが届くまでの実時間 (サーバーで測る) */
export function validateShipmentTiming(elapsedMs, answered) {
  if (elapsedMs < answered * UNDERGROUND_MIN_MS_PER_ITEM) {
    throw new UndergroundError(400, '仕分けが速すぎます。もう一度やり直してください。');
  }
}

/**
 * 仕分けの結果でレートがいくつ動くか。上がるのは上限まで (上限を超えて上がった分は切り捨て)。
 * 間違いで下がる設定のときは、上限と関係なく下がる
 */
export function workRateChange(score, grade, config) {
  const before = toInt(score);
  const raw = grade.correct * config.ratePerCorrect - grade.missed * config.ratePerMiss;
  const after = raw > 0 ? Math.max(before, Math.min(config.maxRate, before + raw)) : before + raw;
  return { beforeScore: before, afterScore: after, delta: after - before, capped: raw > 0 && after - before < raw };
}

/** 仕分けを1回ぶん終えたあとの記録。nextShipment があれば続けて渡す */
export function applyShipmentResult(record, grade, change, at, nextShipment = null) {
  const current = normalizeUndergroundRecord(record);
  const entry = { type: 'work', correct: grade.correct, missed: grade.missed, delta: change.delta, at };
  return {
    ...current,
    shipment: nextShipment,
    stats: {
      correct: current.stats.correct + grade.correct,
      missed: current.stats.missed + grade.missed,
      rateEarned: current.stats.rateEarned + change.delta
    },
    recent: grade.answered > 0 ? [entry, ...current.recent].slice(0, UNDERGROUND_RECENT_LIMIT) : current.recent,
    updatedAt: at
  };
}

/** 増減ログの reason。「船底の仕分け 正解18・ミス2 (+18)」 */
export function workReason(grade, change) {
  return `船底の仕分け 正解${grade.correct}・ミス${grade.missed} (${change.delta >= 0 ? '+' : ''}${change.delta})`;
}

/** 本人に返す形 */
export function publicUndergroundRecord(record) {
  const current = normalizeUndergroundRecord(record);
  return {
    player: current.player,
    shipment: current.shipment,
    stats: current.stats,
    recent: current.recent
  };
}
