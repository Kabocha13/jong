// AIカンカク (AI が数字を出さずに表したお題の数を当てる、1日1問の予想) のルール。
//   Firestore や HTTP には触らず、数の計算だけをここに置く (index.js から呼ぶ)。
//
//   - お題は AIKANKAKU_START_DATE を第1問として1日1問 (aikankaku-topics.js の上から順。全90問)。答えは 1〜100 のどれか。
//     その日 (JST) の問題は、前の日の 14:00 (前の問題の発表) から当日 13:00 まで BET を受け付け、14:00 に答えを発表する
//     (13:00〜14:00 は集計中で、BET も取り消しもできない)。第1問も前の日の 14:00 から受け付ける
//   - BET は数ごと。いくつの数にでも BET でき、1つの数に 1〜AIKANKAKU_MAX_BET まで (足していける)。
//     BET した額はその場でレートから引く (チップは使わない)。締め切りまでは数ごとに取り消せる (全額戻る)
//   - 答えの数に BET した額の AIKANKAKU_MULTIPLIER 倍 (賭け金込み) が、発表のときの精算でレートに入る
//   - 増減ログは BET・取り消し・的中のときに1件ずつ (source aikankaku)

import { AIKANKAKU_TOPICS } from './aikankaku-topics.js';

export const AIKANKAKU_SOURCE = 'aikankaku';
export const AIKANKAKU_START_DATE = '2026-10-07';   // 第1問の日 (JST)
export const AIKANKAKU_MIN_NUMBER = 1;
export const AIKANKAKU_MAX_NUMBER = 100;
export const AIKANKAKU_MIN_BET = 1;
export const AIKANKAKU_MAX_BET = 1000;               // 1つの数に BET できる額の上限 (1日の合計)
export const AIKANKAKU_MULTIPLIER = 10;              // 当たったら BET の何倍が戻るか (賭け金込み)
export const AIKANKAKU_CLOSE_HOUR = 13;             // 締め切り (JST。この時刻ちょうどから BET できない)
export const AIKANKAKU_REVEAL_HOUR = 14;            // 答えの発表 (JST)。次の問題の受付もここから
export const AIKANKAKU_TOTAL = AIKANKAKU_TOPICS.length;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const JST_OFFSET_MS = 9 * HOUR_MS;

export class AikankakuError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function toInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) + 0 : 0;
}

/** 'YYYY-MM-DD' どうしの日数の差 (b − a) */
function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** 'YYYY-MM-DD' に days 日足した日 */
export function addDays(dateKey, days) {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 時刻 (ms) の JST の日付 'YYYY-MM-DD' */
function jstDateKey(ms) {
  return new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** その日 (JST) の 0:00 + hour 時の ms */
function jstTime(dateKey, hour) {
  return Date.parse(`${dateKey}T00:00:00Z`) - JST_OFFSET_MS + hour * HOUR_MS;
}

/** dateKey の問題の受付開始 (前の日の発表)・締め切り・発表の ISO 文字列 */
export function aikankakuTimes(dateKey) {
  return {
    opensAt: new Date(jstTime(dateKey, AIKANKAKU_REVEAL_HOUR) - DAY_MS).toISOString(),
    closesAt: new Date(jstTime(dateKey, AIKANKAKU_CLOSE_HOUR)).toISOString(),
    revealsAt: new Date(jstTime(dateKey, AIKANKAKU_REVEAL_HOUR)).toISOString()
  };
}

/** dateKey の問題の答えを発表してよいか (発表の時刻を過ぎたか) */
export function isAikankakuRevealed(dateKey, nowMs) {
  return nowMs >= jstTime(dateKey, AIKANKAKU_REVEAL_HOUR);
}

/** その日のお題。期間の外なら null。no は第何問か (1〜) */
export function aikankakuTopicOn(dateKey) {
  const index = daysBetween(AIKANKAKU_START_DATE, dateKey);
  if (index < 0 || index >= AIKANKAKU_TOTAL) return null;
  return { date: dateKey, no: index + 1, ...AIKANKAKU_TOPICS[index] };
}

/**
 * いま (nowMs) の問題と段階。
 *   phase: open (BET を受け付けている) / closed (締め切って発表を待っている) / before (第1問の受付の前) / ended (全問発表した)
 *   date: open・closed ならその問題の日。before なら第1問の日
 * 14:00 で次の日の問題に切り替わるので、問題の日は「いまから10時間後の JST の日付」になる
 */
export function aikankakuRound(nowMs) {
  const date = jstDateKey(nowMs + (24 - AIKANKAKU_REVEAL_HOUR) * HOUR_MS);
  const topic = aikankakuTopicOn(date);
  if (!topic) {
    return date < AIKANKAKU_START_DATE
      ? { phase: 'before', date: AIKANKAKU_START_DATE, topic: null }
      : { phase: 'ended', date: null, topic: null };
  }
  const closed = nowMs >= Date.parse(aikankakuTimes(date).closesAt);
  return { phase: closed ? 'closed' : 'open', date, topic };
}

/** いままでに発表した問題のうちいちばん新しい日 (まだ1問も発表していなければ null) */
export function latestRevealedAikankakuDate(nowMs) {
  const date = jstDateKey(nowMs - AIKANKAKU_REVEAL_HOUR * HOUR_MS);
  const lastDate = addDays(AIKANKAKU_START_DATE, AIKANKAKU_TOTAL - 1);
  if (date < AIKANKAKU_START_DATE) return null;
  return date > lastDate ? lastDate : date;
}

/** 数ごとの BET { '37': 100 } を、正しい数と額だけにして返す */
export function normalizePicks(value) {
  const picks = {};
  if (!value || typeof value !== 'object') return picks;
  Object.entries(value).forEach(([key, amount]) => {
    const number = toInt(key);
    const bet = toInt(amount);
    if (String(number) !== String(key).trim()) return;
    if (number < AIKANKAKU_MIN_NUMBER || number > AIKANKAKU_MAX_NUMBER || bet <= 0) return;
    picks[String(number)] = bet;
  });
  return picks;
}

export function picksTotal(picks) {
  return Object.values(picks).reduce((sum, amount) => sum + amount, 0);
}

/** 小さい数から並べた [[数, 額], ...] */
export function sortedPicks(picks) {
  return Object.entries(picks).map(([key, amount]) => [Number(key), amount]).sort((a, b) => a[0] - b[0]);
}

/**
 * 画面から来た BET の追加 (rawPicks: { '37': 100, '42': 50 }) を確かめて、足したあとの BET を返す。
 * 返り値: { added (今回の分), picks (足したあと), cost (今回払う額) }
 */
export function addAikankakuBets(currentPicks, rawPicks) {
  if (!rawPicks || typeof rawPicks !== 'object' || Array.isArray(rawPicks)) {
    throw new AikankakuError(400, 'BET する数を選んでください。');
  }
  const entries = Object.entries(rawPicks);
  if (entries.length === 0) throw new AikankakuError(400, 'BET する数を選んでください。');
  if (entries.length > AIKANKAKU_MAX_NUMBER) throw new AikankakuError(400, 'BET する数が多すぎます。');
  const added = {};
  entries.forEach(([key, amount]) => {
    const number = Number(key);
    const bet = Number(amount);
    if (!Number.isInteger(number) || number < AIKANKAKU_MIN_NUMBER || number > AIKANKAKU_MAX_NUMBER) {
      throw new AikankakuError(400, `BET できるのは ${AIKANKAKU_MIN_NUMBER}〜${AIKANKAKU_MAX_NUMBER} の数です。`);
    }
    if (!Number.isInteger(bet) || bet < AIKANKAKU_MIN_BET) {
      throw new AikankakuError(400, `BET する額は ${AIKANKAKU_MIN_BET} 以上の整数にしてください。`);
    }
    added[String(number)] = bet;
  });
  const picks = { ...normalizePicks(currentPicks) };
  Object.entries(added).forEach(([key, bet]) => {
    const next = (picks[key] || 0) + bet;
    if (next > AIKANKAKU_MAX_BET) {
      throw new AikankakuError(400, `1つの数に BET できるのは ${AIKANKAKU_MAX_BET.toLocaleString('ja-JP')} までです (${key} はいま ${(picks[key] || 0).toLocaleString('ja-JP')})。`);
    }
    picks[key] = next;
  });
  return { added, picks, cost: picksTotal(added) };
}

/** 1つの数の BET を取り消す。返り値: { number, refund, picks (取り消したあと) } */
export function cancelAikankakuBet(currentPicks, rawNumber) {
  const number = Number(rawNumber);
  const picks = { ...normalizePicks(currentPicks) };
  const key = String(number);
  if (!Number.isInteger(number) || !picks[key]) {
    throw new AikankakuError(409, 'その数には BET していません。');
  }
  const refund = picks[key];
  delete picks[key];
  return { number, refund, picks };
}

/** 答えの数への BET から払い戻し (賭け金込み) */
export function aikankakuPayout(picks, answer) {
  return (normalizePicks(picks)[String(answer)] || 0) * AIKANKAKU_MULTIPLIER;
}

/** 増減ログの reason に出す数の並び。「37・42・55」 (多いときは「37・42 ほか8個」) */
function picksLabel(picks) {
  const numbers = sortedPicks(picks).map(([number]) => number);
  return numbers.length <= 6 ? numbers.join('・') : `${numbers.slice(0, 5).join('・')} ほか${numbers.length - 5}個`;
}

export function betReason(no, added) {
  return `AIカンカク 第${no}問に BET (${picksLabel(added)})`;
}

export function cancelReason(no, number) {
  return `AIカンカク 第${no}問の BET を取り消し (${number})`;
}

export function payoutReason(no, answer, bet) {
  return `AIカンカク 第${no}問 的中 (答え ${answer}・BET ${bet.toLocaleString('ja-JP')} → ×${AIKANKAKU_MULTIPLIER})`;
}

/** その日の記録 aikankaku_days/{date} の bets (uid → { player, picks, total, updatedAt }) を整える */
export function normalizeDayBets(value) {
  const bets = {};
  if (!value || typeof value !== 'object') return bets;
  Object.entries(value).forEach(([uid, entry]) => {
    if (!entry || typeof entry !== 'object' || !entry.player) return;
    const picks = normalizePicks(entry.picks);
    if (!Object.keys(picks).length) return;
    bets[uid] = { player: String(entry.player), picks, total: picksTotal(picks), updatedAt: String(entry.updatedAt || '') };
  });
  return bets;
}

/**
 * 締め切った日の集計 (精算と画面の結果に使う)。
 * winners は払い戻しの多い順。popular は BET した人の多い数の上位 (同じ人数なら額の多い順)
 */
export function summarizeAikankakuDay(bets, answer) {
  const entries = Object.values(bets);
  const byNumber = new Map();
  entries.forEach(entry => {
    Object.entries(entry.picks).forEach(([key, amount]) => {
      const current = byNumber.get(key) || { number: Number(key), players: 0, amount: 0 };
      current.players += 1;
      current.amount += amount;
      byNumber.set(key, current);
    });
  });
  const winners = entries
    .filter(entry => entry.picks[String(answer)])
    .map(entry => ({ player: entry.player, bet: entry.picks[String(answer)], payout: aikankakuPayout(entry.picks, answer) }))
    .sort((a, b) => b.payout - a.payout || a.player.localeCompare(b.player));
  const popular = [...byNumber.values()]
    .sort((a, b) => b.players - a.players || b.amount - a.amount || a.number - b.number)
    .slice(0, 5);
  return {
    players: entries.length,
    amount: entries.reduce((sum, entry) => sum + entry.total, 0),
    winners,
    popular
  };
}

/** 人ごとの合計 aikankaku_players/{uid} を整える */
export function normalizeAikankakuStats(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    plays: Math.max(0, toInt(source.plays)),     // BET した問題の数
    hits: Math.max(0, toInt(source.hits)),       // 当てた問題の数
    bet: Math.max(0, toInt(source.bet)),         // BET した額の合計 (取り消した分は除く)
    payout: Math.max(0, toInt(source.payout))    // 払い戻しの合計
  };
}
