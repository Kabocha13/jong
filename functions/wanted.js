// 指名手配 (レートが閾値 (1万) を超えた人を賞金首にする神経衰弱) のルール。
//   Firestore や HTTP には触らず、数の計算だけをここに置く (index.js から呼ぶ)。
//   乱数は呼び出し側から randomInt(n) → 0〜n-1 の整数 として受け取る。
//
//   - レートが閾値を超えている人がいるときだけ遊べる。賞金首はその中でレートがいちばん高い人
//     (同じなら名前順で先の人)。閾値を超えている人は遊べない
//   - 盤面は人ごと (10×10 = 50組)。カードを1枚めくるたびに、遊んでいる人から賞金首へ 1 移る。
//     2枚目で組がそろうと、賞金首から遊んでいる人へ 50 移る。賞金首はめくるたびにその時点で決め直す
//   - 手持ちがめくる代金に足りない人はめくれない。賞金首は閾値を下回ってからはめくられない
//     (払いで閾値を下回るのは構わない)
//   - 盤面は途中でやめても残り、続きから遊べる。全部そろえたら新しい盤面を配る
//   - 増減ログは1枚ごとには残さず、人ごとに1件へまとめて書き足していく (wantedLogStep)

export const WANTED_SOURCE = 'wanted';                // 遊んだ人の増減ログ
export const WANTED_BOUNTY_SOURCE = 'wanted_bounty';  // 賞金首の増減ログ
export const WANTED_THRESHOLD = 10000;                // これを超えた人が賞金首になる
export const WANTED_FLIP_COST = 1;                   // 1枚めくる代金
export const WANTED_PAIR_REWARD = 50;                 // 1組そろえたときの懸賞金
export const WANTED_PAIRS = 50;                       // 10×10
export const WANTED_CARDS = WANTED_PAIRS * 2;
// 増減ログを1件にまとめる長さ。最後にめくってからこれだけ空いたら、次は新しい1件にする (日付が変わったときも)
export const WANTED_LOG_IDLE_MS = 30 * 60 * 1000;

export class WantedError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function toInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) + 0 : 0;
}

/**
 * 賞金首を決める。players は [{ name, score }]。閾値を超えている人のうちレートが最も高い人 (同点は名前順)。
 * いなければ null
 */
export function pickWantedTarget(players) {
  return players
    .filter(player => player && player.name && toInt(player.score) > WANTED_THRESHOLD)
    .map(player => ({ name: String(player.name), score: toInt(player.score) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))[0] || null;
}

/** 遊べる人か (閾値を超えていない) */
export function canHuntWanted(score) {
  return toInt(score) <= WANTED_THRESHOLD;
}

/** 新しい盤面。0〜49 の絵柄を2枚ずつ並べてシャッフルする */
export function newWantedBoard(randomInt) {
  const cards = Array.from({ length: WANTED_CARDS }, (_, i) => Math.floor(i / 2));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return { cards, matched: Array(WANTED_CARDS).fill(false), open: null };
}

function normalizeBoard(value) {
  const source = value && typeof value === 'object' ? value : {};
  const cards = Array.isArray(source.cards) ? source.cards.map(toInt) : [];
  if (cards.length !== WANTED_CARDS) return null;
  const matched = Array.isArray(source.matched) && source.matched.length === WANTED_CARDS
    ? source.matched.map(Boolean)
    : Array(WANTED_CARDS).fill(false);
  const open = Number.isInteger(source.open) && source.open >= 0 && source.open < WANTED_CARDS && !matched[source.open]
    ? source.open
    : null;
  return { cards, matched, open };
}

function normalizeLog(value) {
  if (!value || typeof value !== 'object' || !value.historyId) return null;
  return {
    historyId: String(value.historyId),
    createdAt: String(value.createdAt || ''),
    lastAt: String(value.lastAt || ''),
    date: String(value.date || ''),
    beforeScore: toInt(value.beforeScore),
    afterScore: toInt(value.afterScore),
    flips: Math.max(0, toInt(value.flips)),
    pairs: Math.max(0, toInt(value.pairs)),
    with: String(value.with || ''),                       // 遊んだ人の記録なら賞金首の名前
    hunters: Array.isArray(value.hunters) ? value.hunters.map(String) : []   // 賞金首の記録なら、めくった人たち
  };
}

/** 保存されている盤面の記録を、欠けている項目を埋めた形にする (盤面が無ければ配る) */
export function normalizeWantedRecord(record, player, randomInt) {
  const source = record && typeof record === 'object' ? record : {};
  const stats = source.stats && typeof source.stats === 'object' ? source.stats : {};
  return {
    player: String(source.player || player || ''),
    board: normalizeBoard(source.board) || newWantedBoard(randomInt),
    stats: {
      flips: Math.max(0, toInt(stats.flips)),       // めくった枚数
      pairs: Math.max(0, toInt(stats.pairs)),       // そろえた組
      boards: Math.max(0, toInt(stats.boards)),     // 全部そろえた盤面
      net: toInt(stats.net)                         // 指名手配で動いたレートの合計
    },
    log: normalizeLog(source.log),
    updatedAt: source.updatedAt ? String(source.updatedAt) : null
  };
}

/** 賞金首の記録 (人ごと。増減ログをまとめる途中の1件と、合計) */
export function normalizeBountyRecord(record, player) {
  const source = record && typeof record === 'object' ? record : {};
  const stats = source.stats && typeof source.stats === 'object' ? source.stats : {};
  return {
    player: String(source.player || player || ''),
    stats: {
      flips: Math.max(0, toInt(stats.flips)),       // めくられた枚数
      pairs: Math.max(0, toInt(stats.pairs)),       // 払った組
      net: toInt(stats.net)
    },
    log: normalizeLog(source.log),
    updatedAt: source.updatedAt ? String(source.updatedAt) : null
  };
}

/**
 * 1枚めくる。board は書き換えずに次の盤面を返す。
 * 返り値: { board, index, face, first, firstIndex?, firstFace?, pair, cleared }
 *   first: 1枚目だった (まだ組の判定をしない) / pair: 2枚目でそろった / cleared: 全部そろった
 */
export function flipWantedCard(board, rawIndex) {
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0 || index >= WANTED_CARDS) {
    throw new WantedError(400, 'めくるカードを選び直してください。');
  }
  if (board.matched[index]) throw new WantedError(409, 'そのカードはもうそろっています。');
  if (board.open === index) throw new WantedError(409, 'そのカードはもうめくっています。');
  const next = { cards: board.cards, matched: [...board.matched], open: board.open };
  const face = board.cards[index];
  if (board.open === null) {
    next.open = index;
    return { board: next, index, face, first: true, pair: false, cleared: false };
  }
  const firstIndex = board.open;
  const firstFace = board.cards[firstIndex];
  const pair = firstFace === face;
  next.open = null;
  if (pair) {
    next.matched[firstIndex] = true;
    next.matched[index] = true;
  }
  return { board: next, index, face, first: false, firstIndex, firstFace, pair, cleared: pair && next.matched.every(Boolean) };
}

/** めくった1枚で動くレート。hunter は遊んだ人、bounty は賞金首の増減 */
export function wantedFlipDelta(flip) {
  const reward = flip.pair ? WANTED_PAIR_REWARD : 0;
  return { hunter: reward - WANTED_FLIP_COST, bounty: WANTED_FLIP_COST - reward };
}

/**
 * 増減ログを1件にまとめる。いまの1件 (log) に書き足せるなら同じ historyId で、
 * 書き足せないなら新しい1件として、書き込む中身と次の log を返す。
 * 書き足せるのは: 相手 (遊んだ人の記録なら賞金首) が同じ・最後の記録からレートがほかで動いていない
 * (afterScore が beforeScore と同じ)・最後から WANTED_LOG_IDLE_MS 以内・同じ日 (JST) のとき。
 * レートがほかで動いていたら新しい1件にするので、増減ログの前後の値はいつも正しくつながる。
 *   step: { at, date, beforeScore, afterScore, pair, with?, hunter? }
 */
export function wantedLogStep(log, step, newHistoryId) {
  const current = normalizeLog(log);
  const continues = current
    && current.afterScore === step.beforeScore
    && current.date === step.date
    && (step.with === undefined || current.with === step.with)
    && Date.parse(step.at) - Date.parse(current.lastAt) < WANTED_LOG_IDLE_MS;
  const base = continues ? current : {
    historyId: newHistoryId(),
    createdAt: step.at,
    lastAt: step.at,
    date: step.date,
    beforeScore: step.beforeScore,
    afterScore: step.beforeScore,
    flips: 0,
    pairs: 0,
    with: step.with || '',
    hunters: []
  };
  const hunters = step.hunter && !base.hunters.includes(step.hunter) ? [...base.hunters, step.hunter] : base.hunters;
  return {
    ...base,
    lastAt: step.at,
    afterScore: step.afterScore,
    flips: base.flips + 1,
    pairs: base.pairs + (step.pair ? 1 : 0),
    hunters
  };
}

/** 遊んだ人の増減ログの reason。「指名手配 (賞金首 A) めくり24枚・ペア5組」 */
export function wantedReason(log) {
  return `指名手配 (賞金首 ${log.with}) めくり${log.flips}枚・ペア${log.pairs}組`;
}

/** 賞金首の増減ログの reason。「指名手配の賞金首 めくられ24枚・払い5組 (B・C)」 */
export function bountyReason(log) {
  return `指名手配の賞金首 めくられ${log.flips}枚・払い${log.pairs}組 (${log.hunters.join('・')})`;
}

/** 本人に返す盤面。そろった札と、1枚目にめくっている札だけ絵柄を見せる (ほかは null) */
export function publicWantedBoard(board) {
  return {
    faces: board.cards.map((face, i) => (board.matched[i] || board.open === i ? face : null)),
    matched: board.matched,
    open: board.open,
    pairs: board.matched.filter(Boolean).length / 2
  };
}
