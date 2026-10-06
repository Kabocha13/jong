import { randomInt } from 'node:crypto';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { BlackjackRuleError } from './blackjack.js';
import { normalizeSlotState, playSlotRound, publicSlotState } from './slot.js';
import { GAPPORI_JACKPOT_RATE, GapporiRuleError } from './gappori.js';
import { NARIAGARI_BETS, playNariagari } from './nariagari.js';
import {
  VOYAGE_BET,
  VOYAGE_BETS,
  VOYAGE_CHAPTERS,
  VOYAGE_END,
  VOYAGE_FINAL_AT,
  VOYAGE_JP_RATE,
  VOYAGE_RULES_VERSION,
  VOYAGE_SOURCE,
  VOYAGE_START,
  VOYAGE_TREASURE_RATE,
  isVoyageOver,
  isVoyageStarted,
  playVoyage,
  publicVoyageChapter,
  voyageJpAmount,
  voyageJpCentsAfterWin,
  voyageTreasureAmount,
  splitVoyageTreasure,
  voyageChapterAt,
  voyageLapCount
} from './voyage.js';
import {
  GAPPORI_RULES_VERSION,
  GapporiTableError,
  advanceGapporiTable,
  buyGapporiTickets,
  chooseGapporiChance,
  createGapporiContext,
  emptyGapporiTable,
  gapporiTableUids,
  isInLiveGapporiRound,
  publicGapporiTable,
  refreshGapporiRules,
  startGapporiNow
} from './gappori-table.js';
import {
  LOAN_SOURCES,
  LoanError,
  applyBorrow,
  applyInterest,
  applyRepay,
  computeLoanLimit,
  dailyDeltasFromEntries,
  loanSettingsFrom,
  normalizeLoanRecord,
  publicLoanRecord,
  validateBorrowAmount,
  validateRepayAmount,
  volatilityOf
} from './loan.js';
import {
  PARTICIPATION_BONUS_SOURCE,
  ParticipationBonusError,
  buildParticipationGrants,
  jstDayRange,
  normalizeBonusUnits,
  participationBonusReason,
  tallyParticipation
} from './participation-bonus.js';
import {
  UNDERGROUND_WORK_SOURCE,
  UndergroundError,
  applyShipmentResult,
  canWorkUnderground,
  generateShipmentItems,
  gradeShipment,
  normalizeUndergroundRecord,
  publicUndergroundRecord,
  undergroundSettingsFrom,
  validateShipmentTiming,
  workRateChange,
  workReason
} from './underground.js';
import {
  WANTED_BOUNTY_SOURCE,
  WANTED_FLIP_COST,
  WANTED_PAIR_REWARD,
  WANTED_PAIRS,
  WANTED_SOURCE,
  WANTED_THRESHOLD,
  WantedError,
  bountyReason,
  canHuntWanted,
  flipWantedCard,
  newWantedBoard,
  normalizeBountyRecord,
  normalizeWantedRecord,
  pickWantedTarget,
  publicWantedBoard,
  wantedFlipDelta,
  wantedLogStep,
  wantedReason
} from './wanted.js';
import {
  CASINO_LOG_GAMES,
  casinoChartKey,
  casinoHeld,
  casinoLogReason,
  casinoLogStep,
  tableHeld
} from './casino-wallet.js';
import {
  SinkTableError,
  advanceSinkTable,
  boardSink,
  createSinkContext,
  emptySinkTable,
  isInLiveSinkRound,
  jumpSink,
  leaveSink,
  publicSinkTable,
  readySink,
  sinkMine,
  sinkSeaState,
  sinkTableUids
} from './sink-table.js';
import {
  TableError,
  createTableContext,
  emptyTable,
  isInLiveRound,
  joinSeat,
  leaveSeat,
  maybeStartRound,
  moveTurn,
  openCards,
  placeBet,
  publicTable,
  seatIndexOf,
  sweepSeats,
  tableUids,
  tickTable,
  vacateSeat
} from './blackjack-table.js';

const app = admin.initializeApp();
const db = getFirestore(app, 'q-jong');
const MASTER_USERNAME = 'Kabocha';
const FIREBASE_COLLECTIONS = {
  scores: 'players',
  sports_bets: 'sports_bets',
  speedstorm_records: 'speedstorm_records',
  lotteries: 'lotteries',
  gift_codes: 'gift_codes',
  career_posts: 'career_posts'
};
// レート制: 毎日「基準との差」の一定割合が基準へ引き戻されるので、
// 放置すれば全員が RATE_BASELINE_DEFAULT ちょうどに収束する。
const RATE_BASELINE_DEFAULT = 3000;
const RATE_REVERSION_RATE_DEFAULT = 0.13;
const RATE_REVERSION_FLAT_DEFAULT = 10;
const RATE_EXCLUDED_PLAYERS = new Set(['3mahjong']);
// 日次レート補正を済ませた日の記録 (Cloud Functions だけが読み書きする)。同じ日に2回動かさないために見る
const RATE_REVERSION_RUN_COLLECTION = 'rate_reversion_runs';
// レートの貸し出し (借金)。ルールは loan.js。書き込みは Cloud Functions だけ (firestore.rules で write を禁止)
const LOAN_COLLECTION = 'loans';
const DEFAULT_MANABA_BASE_URL = 'https://cit.manaba.jp/ct/home';
const DEFAULT_MANABA_LOGIN_PATH = '/ct/login';
const DEFAULT_MANABA_ASSIGNMENTS_PATH = '/ct/home_library_query';
const ALLOWED_ORIGINS = new Set([
  'https://q-jong.web.app',
  'https://q-jong.firebaseapp.com',
  'http://localhost:5000',
  'http://localhost:5002'
]);

function setCors(req, res) {
  const origin = req.get('origin') || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function authUidFromUsername(username) {
  return encodeURIComponent(username).replace(/%/g, '_').slice(0, 120);
}

function toDocId(value) {
  const raw = String(value ?? '').trim();
  return encodeURIComponent(raw || `item_${Date.now()}_${Math.random().toString(36).slice(2)}`)
    .replace(/\./g, '%2E')
    .replace(/\//g, '%2F');
}

function getItemDocId(key, item, index) {
  if (key === 'scores') return toDocId(item.name || `player_${index}`);
  if (key === 'sports_bets') return toDocId(item.betId ?? item.id ?? `bet_${index}`);
  if (key === 'lotteries') return toDocId(item.lotteryId ?? item.id ?? `lottery_${index}`);
  if (key === 'gift_codes') return toDocId(item.code ?? item.name ?? item.id ?? `gift_${index}`);
  if (key === 'career_posts') return toDocId(item.id ?? `career_${index}`);
  if (key === 'speedstorm_records') return toDocId(item.id ?? item.player ?? `speedstorm_${index}`);
  return toDocId(item.id ?? index);
}

async function getVerifiedAuthToken(req) {
  const authHeader = req.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch (error) {
    console.warn('IDトークン検証に失敗しました:', error.message);
    return null;
  }
}

async function hasWriteAccess(req, body = {}) {
  // 以前は body.masterPin が固定PINと一致すれば書き込みを許可していたが、
  // そのPINは公開JSに直書きされて配信されていたため廃止した。
  // 書き込みは Firebase の IDトークン検証のみで認可する
  return Boolean(await getVerifiedAuthToken(req));
}

function normalizeReversionRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return RATE_REVERSION_RATE_DEFAULT;
  return Math.min(1, Math.max(0, rate));
}

/** レートは整数として扱う。負けが込めばマイナスにもなる (+ 0 は -0 を 0 に揃えるため) */
function normalizeRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) ? Math.round(rate) + 0 : 0;
}

/**
 * 基準レートへ1日ぶん近づけたときの増減。
 *   1日の補正量 = 基準との差 × rate + flat
 * 固定分があるので差は必ず 0 になり、有限日で基準ちょうどに一致する。
 */
function getRateReversionDelta(currentRate, baseline, rate, flat) {
  const gap = normalizeRate(baseline) - normalizeRate(currentRate);
  if (gap === 0) return 0;
  const gapSize = Math.abs(gap);
  const step = Math.min(gapSize, Math.max(Math.round(gapSize * rate) + flat, 1));
  return gap > 0 ? step : -step;
}

function getJstDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function rateHistoryDocId(playerName, at = new Date().toISOString()) {
  return encodeURIComponent(`ph_${at}_${playerName}_${Math.random().toString(36).slice(2, 8)}`)
    .replace(/\./g, '%2E')
    .replace(/\//g, '%2F');
}

// -----------------------------------------------------------------
// レート推移グラフ用の日別データ
//   point_history (増減ログ) と players の現在値から「その日の終値」を組み立て、
//   rate_chart/daily に1ドキュメントとしてまとめて置く。
//   ホームはこの1件を読むだけでグラフを描けるので、公開ページから
//   point_history を直接読ませる必要がない。
// -----------------------------------------------------------------
const RATE_CHART_DAYS = 13;          // グラフに出す日数 (古い日から消えていく)
const RATE_CHART_START_DATE = '2026-09-22';  // これより前の日はグラフに出さない
const RATE_CHART_START_RATE = 5000;          // 初日は全員この値から始める (実際のログは見ない)
const RATE_CHART_COLLECTION = 'rate_chart';
const RATE_CHART_DOC = 'daily';
// 今日の分だけを持つドキュメント (daily の最後の日と同じ形)。カジノは1回ごとにここだけを動かす (applyRateChartLive)。
// 画面は daily を読んでから、日付が同じなら最後の日をこれで置き換え、変わるたびに描き直す
const RATE_CHART_TODAY_DOC = 'today';

/** 今日を含む直近 days 日ぶん (RATE_CHART_START_DATE 以降) の JST 日付キーを古い順で返す */
function recentJstDateKeys(days = RATE_CHART_DAYS) {
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = getJstDateKey(new Date(Date.now() - i * 86400000));
    if (key >= RATE_CHART_START_DATE) keys.push(key);
  }
  return keys;
}

/**
 * その日の終わり時点のレート。
 *   - その日までに増減があれば、最後の増減の afterScore
 *   - まだ何も無ければ、その後に来る最初の増減の beforeScore (= 変わる前の値)
 *   - 増減が1件も無ければ現在値
 * entries は createdAt の古い順。
 */
function rateAtEndOfDay(entries, dateKey, currentRate) {
  let closing = null;
  for (const entry of entries) {
    if (entry.date <= dateKey) {
      closing = entry.afterScore;
    } else if (closing === null) {
      return entry.beforeScore;
    } else {
      break;
    }
  }
  return closing === null ? currentRate : closing;
}

/**
 * その日の終わり時点の借金。借金の出入り (loan_*: 借入・返済・利息) の増減ログだけを見る。
 *   - その日までに出入りがあれば、最後の出入りの debtAfter
 *   - まだ無ければ、その後に来る最初の出入りの debtBefore
 *   - 出入りが1件も無ければ今日なら現在値、過去の日なら 0
 *     (借金が残っている日は必ず 0:05 に利息のログが付くので、期間内にログが無ければ借金も無い)
 */
function debtAtEndOfDay(entries, dateKey, currentDebt, isToday) {
  let closing = null;
  for (const entry of entries) {
    if (entry.debtAfter === null) continue;
    if (entry.date <= dateKey) {
      closing = entry.debtAfter;
    } else if (closing === null) {
      return entry.debtBefore;
    } else {
      break;
    }
  }
  if (closing !== null) return closing;
  return isToday ? currentDebt : 0;
}

const RATE_CHART_EVENT_GAP_MS = 5000;   // 同じ source/reason でこれ以内の増減は1回の出来事とみなす
// 1回ごとに増減ログが残るが、グラフでは続けてやった分を1つにまとめる source → まとめたときの理由。
// 同じ日に同じ人が続け、その間にほかの誰の増減も無ければ1つの出来事にする
// (船底チンチロは 50.5 で休止したが、グラフの期間に残っている分のために置いておく)
const signed = value => `${value >= 0 ? '+' : ''}${value}`;
const RATE_CHART_MERGED_SOURCES = new Map([
  [UNDERGROUND_WORK_SOURCE, (count, delta) => `船底の仕分け (${signed(delta)})`],
  ['underground_chinchiro', (count, delta) => `船底チンチロ ${count}勝 (${signed(delta)})`]
]);

/** カジノの同じ回の出来事の理由。1人ならその人の増減ログの理由、2人以上なら「ブラックジャック (3人)」 */
function rateChartGroupReason(source, changes, firstReason) {
  if (changes.length <= 1) return firstReason;
  const game = Object.values(CASINO_LOG_GAMES).find(item => item.source === source);
  return `${game ? game.name : 'カジノ'} (${changes.length}人)`;
}

/**
 * 全員の増減ログを時刻順に並べ、同時に保存されたもの (1局ぶん・1回の補正) を1件にまとめる。
 * RATE_CHART_MERGED_SOURCES (船底の仕分けなど) は、同じ人が続けた分も1件にまとめる (「船底の仕分け (+120)」)。
 * 戻り値は JST 日付キー → イベント配列 (古い順)。
 */
function groupRateChartEvents(entriesByPlayer) {
  const all = [];
  entriesByPlayer.forEach((entries, player) => {
    entries.forEach(entry => all.push({ ...entry, player }));
  });
  all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const eventsByDate = new Map();
  const keyed = new Map();   // chartKey → 出来事 (カジノの同じ回・同じ時に始めた人は1つにまとめる)
  let current = null;
  all.forEach(entry => {
    const time = Date.parse(entry.createdAt);
    const delta = entry.afterScore - entry.beforeScore;
    if (entry.chartKey) {
      const change = { player: entry.player, afterScore: entry.afterScore, debtAfter: entry.debtAfter };
      const existing = keyed.get(entry.chartKey);
      if (existing && existing.date === entry.date) {
        if (!existing.changes.some(item => item.player === entry.player)) existing.changes.push(change);
        existing.reason = rateChartGroupReason(existing.source, existing.changes, existing.firstReason);
        current = null;
        return;
      }
      const event = {
        at: entry.createdAt, date: entry.date, source: entry.source, reason: entry.reason, firstReason: entry.reason,
        key: entry.chartKey, lastTime: time, count: 1, delta, changes: [change]
      };
      keyed.set(entry.chartKey, event);
      if (!eventsByDate.has(entry.date)) eventsByDate.set(entry.date, []);
      eventsByDate.get(entry.date).push(event);
      current = null;
      return;
    }
    const continued = current
      && RATE_CHART_MERGED_SOURCES.has(entry.source)
      && current.source === entry.source
      && current.date === entry.date
      && current.changes.length === 1
      && current.changes[0].player === entry.player;
    if (continued) {
      // 直前の出来事を、この回のあとの値と時刻で上書きする
      current.count += 1;
      current.delta += delta;
      current.at = entry.createdAt;
      current.lastTime = time;
      current.reason = RATE_CHART_MERGED_SOURCES.get(entry.source)(current.count, current.delta);
      current.changes[0] = { player: entry.player, afterScore: entry.afterScore, debtAfter: entry.debtAfter };
      return;
    }
    const sameEvent = current
      && current.date === entry.date
      && current.source === entry.source
      && current.reason === entry.reason
      && time - current.lastTime <= RATE_CHART_EVENT_GAP_MS
      && !current.changes.some(change => change.player === entry.player);
    if (!sameEvent) {
      current = {
        at: entry.createdAt,
        date: entry.date,
        source: entry.source,
        reason: entry.reason,
        lastTime: time,
        count: 1,
        delta,
        changes: []
      };
      if (!eventsByDate.has(entry.date)) eventsByDate.set(entry.date, []);
      eventsByDate.get(entry.date).push(current);
    }
    current.lastTime = time;
    current.changes.push({ player: entry.player, afterScore: entry.afterScore, debtAfter: entry.debtAfter });
  });
  return eventsByDate;
}

/** point_history と現在のレートから rate_chart/daily を作り直す */
async function rebuildRateChartFromHistory() {
  const [playersSnapshot, loansSnapshot] = await Promise.all([
    db.collection('players').get(),
    db.collection(LOAN_COLLECTION).get()
  ]);
  const currentRates = new Map();
  playersSnapshot.docs.forEach(doc => {
    const player = doc.data();
    if (!player || !player.name || RATE_EXCLUDED_PLAYERS.has(player.name)) return;
    currentRates.set(player.name, normalizeRate(player.score));
  });
  // いまの借金 (ランキングと同じく、今日の右端はこの現在値を使う)
  const currentDebts = new Map();
  loansSnapshot.docs.forEach(doc => {
    const loan = normalizeLoanRecord(doc.data());
    if (loan.player && currentRates.has(loan.player)) currentDebts.set(loan.player, loan.debt);
  });

  const dates = recentJstDateKeys();
  // 期間の先頭より1日ぶん多めに取り、期間開始時点の値も beforeScore から拾えるようにする
  const since = new Date(Date.now() - (RATE_CHART_DAYS + 1) * 86400000).toISOString();
  const historySnapshot = await db.collection('point_history')
    .where('createdAt', '>=', since)
    .get();

  const entriesByPlayer = new Map();
  historySnapshot.docs.forEach(doc => {
    const entry = doc.data();
    if (!entry || !entry.player || !currentRates.has(entry.player)) return;
    const createdAt = String(entry.createdAt || '');
    if (!createdAt) return;
    if (!entriesByPlayer.has(entry.player)) entriesByPlayer.set(entry.player, []);
    const source = String(entry.source || '');
    // 借金の出入りだけが debtBefore / debtAfter を持つ。それ以外は借金を変えない (null)
    const isLoan = LOAN_SOURCES.has(source);
    entriesByPlayer.get(entry.player).push({
      createdAt,
      date: getJstDateKey(new Date(createdAt)),
      beforeScore: normalizeRate(entry.beforeScore),
      afterScore: normalizeRate(entry.afterScore),
      debtBefore: isLoan ? Math.max(0, normalizeRate(entry.debtBefore)) : null,
      debtAfter: isLoan ? Math.max(0, normalizeRate(entry.debtAfter)) : null,
      source,
      reason: String(entry.reason || ''),
      chartKey: String(entry.chartKey || '')
    });
  });
  entriesByPlayer.forEach(entries => entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));

  const days = dates.map((date, index) => {
    const isToday = index === dates.length - 1;
    const rates = {};
    const debts = {};
    currentRates.forEach((currentRate, name) => {
      const entries = entriesByPlayer.get(name) || [];
      // 今日ぶんは players の現在値をそのまま使う。
      // 増減ログを通さずレートが書き換わった場合でも、グラフの右端が
      // ホームのランキングとずれないようにするため。
      if (date === RATE_CHART_START_DATE && !isToday) {
        rates[name] = RATE_CHART_START_RATE;
        debts[name] = 0;
        return;
      }
      rates[name] = isToday
        ? currentRate
        : rateAtEndOfDay(entries, date, currentRate);
      debts[name] = debtAtEndOfDay(entries, date, currentDebts.get(name) || 0, isToday);
    });
    return { date, rates, debts };
  });

  // 日ごとの変動 (対局1回・日次補正1回 = 1イベント) を、各イベント直後の全員のレートと借金つきで並べる
  const eventsByDate = groupRateChartEvents(entriesByPlayer);
  days.forEach((day, index) => {
    if (day.date === RATE_CHART_START_DATE) {
      day.events = [];
      return;
    }
    const state = { ...(index > 0 ? days[index - 1].rates : day.rates) };
    const debtState = { ...(index > 0 ? days[index - 1].debts : day.debts) };
    if (index === 0) {
      // 先頭の日は前日の終値を知らないので、その日最初の増減の beforeScore から起こす
      currentRates.forEach((currentRate, name) => {
        const entries = entriesByPlayer.get(name) || [];
        const first = entries.find(entry => entry.date >= day.date);
        state[name] = first && first.date === day.date ? first.beforeScore : day.rates[name];
        const firstLoan = entries.find(entry => entry.debtAfter !== null && entry.date >= day.date);
        debtState[name] = firstLoan && firstLoan.date === day.date ? firstLoan.debtBefore : day.debts[name];
      });
      day.open = { ...state };
      day.openDebts = { ...debtState };
    }
    day.events = (eventsByDate.get(day.date) || []).map(event => {
      event.changes.forEach(change => {
        state[change.player] = change.afterScore;
        if (change.debtAfter !== null && change.debtAfter !== undefined) debtState[change.player] = change.debtAfter;
      });
      return {
        at: event.at,
        source: event.source,
        reason: event.reason,
        key: event.key || null,
        members: event.changes.map(change => change.player),
        rates: { ...state },
        debts: { ...debtState }
      };
    });
  });

  const payload = {
    days,
    players: Array.from(currentRates.keys()),
    updatedAt: new Date().toISOString()
  };
  await db.collection(RATE_CHART_COLLECTION).doc(RATE_CHART_DOC).set(payload);
  // 今日の分 (カジノが1回ごとに動かすほう) も同じ中身で書き直す
  const today = days[days.length - 1];
  const yesterday = days.length > 1 ? days[days.length - 2] : null;
  await db.collection(RATE_CHART_COLLECTION).doc(RATE_CHART_TODAY_DOC).set({
    ...today,
    open: today.open || (yesterday ? yesterday.rates : today.rates),
    openDebts: today.openDebts || (yesterday ? yesterday.debts : today.debts),
    players: payload.players,
    updatedAt: payload.updatedAt
  });
  return payload;
}

/**
 * カジノの1回ぶんの変化 (items: [{ key, at, date, source, game, reason, player, afterScore }]) を、
 * 今日のグラフ (rate_chart/today) のその点へ入れる。同じ key の点があればその点 (とそれより後の点) の本人の値を
 * 書き換え、無ければ今日の最後に点を足す。同じ key の点に2人以上いれば、全員がその点で動く。
 * 今日の分がまだ無い・日付が違う・グラフに居ない人がいる・書き込みに失敗したときは、全部を作り直す
 * (それより後の点で本人の値が変わることは無い。ほかでレートが動くと増減ログは次の1件 = 次の点になるため)
 */
async function applyRateChartLive(items) {
  if (!items || !items.length) return;
  let rebuild = false;
  try {
    rebuild = await db.runTransaction(async transaction => {
      const ref = db.collection(RATE_CHART_COLLECTION).doc(RATE_CHART_TODAY_DOC);
      const doc = await transaction.get(ref);
      const todayKey = getJstDateKey();
      if (!doc.exists) return true;
      const day = doc.data();
      if (day.date !== todayKey || items.some(item => item.date !== todayKey)) return true;
      const players = new Set(day.players || []);
      if (items.some(item => !players.has(item.player))) return true;
      const events = Array.isArray(day.events) ? day.events.map(event => ({ ...event })) : [];
      const rates = { ...(day.rates || {}) };
      const groups = new Map();
      items.forEach(item => {
        if (!groups.has(item.key)) groups.set(item.key, []);
        groups.get(item.key).push(item);
      });
      groups.forEach((group, key) => {
        let index = events.findIndex(event => event.key === key);
        if (index < 0) {
          const last = events.length ? events[events.length - 1] : { rates: day.open || {}, debts: day.openDebts || {} };
          events.push({
            key, at: group[0].at, source: group[0].source, reason: group[0].reason, members: [],
            rates: { ...last.rates }, debts: { ...(last.debts || {}) }
          });
          index = events.length - 1;
        }
        const members = new Set(events[index].members || []);
        group.forEach(item => {
          members.add(item.player);
          for (let i = index; i < events.length; i++) events[i].rates = { ...events[i].rates, [item.player]: item.afterScore };
          rates[item.player] = item.afterScore;
        });
        events[index].members = [...members];
        events[index].reason = rateChartGroupReason(group[0].source, events[index].members, group[group.length - 1].reason);
      });
      transaction.set(ref, { ...day, events, rates, updatedAt: new Date().toISOString() });
      return false;
    });
  } catch (error) {
    console.error('レート推移グラフの今日の分の更新に失敗しました:', error);
    rebuild = true;
  }
  if (rebuild) await rebuildRateChartQuietly('casino_live');
}

/** グラフ更新は本体の処理を巻き込んで失敗させない */
async function rebuildRateChartQuietly(context) {
  try {
    await rebuildRateChartFromHistory();
  } catch (error) {
    console.error(`rate_chart の更新に失敗しました (${context}):`, error);
  }
}

/**
 * 日次レート補正 (と借金の利息)。毎日 0:05 の collectDailyPointTax からだけ呼ぶ (画面からは呼ばない)。
 * その日に済んだかどうかは rate_reversion_runs/{日付} で見る。settings/app はログインした人なら書けるので、
 * そこの rate_reversion_last_date (表示用) が書き換えられても、同じ日に2回は動かない
 */
async function applyDailyRateReversionForToday() {
  const todayKey = getJstDateKey();
  const settingsRef = db.collection('settings').doc('app');
  const runRef = db.collection(RATE_REVERSION_RUN_COLLECTION).doc(todayKey);

  return db.runTransaction(async transaction => {
    const [settingsDoc, runDoc] = await Promise.all([
      transaction.get(settingsRef),
      transaction.get(runRef)
    ]);
    const settings = settingsDoc.exists ? settingsDoc.data() : {};

    if (runDoc.exists || settings.rate_reversion_last_date === todayKey) {
      return { status: 'skipped', date: todayKey, reason: 'already_applied' };
    }

    const baseline = normalizeRate(settings.rate_baseline ?? RATE_BASELINE_DEFAULT);
    const rate = normalizeReversionRate(settings.rate_reversion_rate);
    const flat = Math.max(0, Math.round(Number(settings.rate_reversion_flat ?? RATE_REVERSION_FLAT_DEFAULT) || 0));
    const [playersSnapshot, loansSnapshot] = await Promise.all([
      transaction.get(db.collection('players')),
      transaction.get(db.collection(LOAN_COLLECTION))
    ]);
    const nowIso = new Date().toISOString();
    // 借金の利息は補正の直後に別の出来事として残す (グラフで「補正」と「利息」を分けて見せるため)。
    // 同じ時刻だと並び順が定まらないので 1秒だけ後ろにずらす
    const interestIso = new Date(Date.parse(nowIso) + 1000).toISOString();
    const loanSettings = loanSettingsFrom(settings);
    const loansByPlayer = new Map();
    loansSnapshot.docs.forEach(doc => {
      const loan = normalizeLoanRecord(doc.data());
      if (loan.player && loan.debt > 0) loansByPlayer.set(loan.player, { ref: doc.ref, loan });
    });
    let totalMoved = 0;
    let totalInterest = 0;

    playersSnapshot.docs.forEach(doc => {
      const player = doc.data();
      if (RATE_EXCLUDED_PLAYERS.has(player.name)) return;

      // 1. 日次レート補正。借りたレートも通常のレートなので、そのまま含めて補正する
      const before = normalizeRate(player.score);
      const delta = getRateReversionDelta(before, baseline, rate, flat);
      const after = normalizeRate(before + delta);
      if (delta !== 0) {
        totalMoved += Math.abs(after - before);
        transaction.set(doc.ref, { ...player, score: after }, { merge: false });
        const historyId = rateHistoryDocId(player.name, nowIso);
        transaction.set(db.collection('point_history').doc(historyId), {
          id: historyId,
          player: player.name,
          beforeScore: before,
          afterScore: after,
          delta: after - before,
          source: 'daily_rate_reversion',
          reason: `日次レート補正 基準${baseline} / ${(rate * 100).toFixed(1).replace(/\.0$/, '')}%`,
          actor: 'scheduled_function',
          createdAt: nowIso
        });
      }

      // 2. 借金の利息。返すまで毎日、残っている借金を (1 + 利率) 倍にする (複利)。
      //    レートは動かないが、グラフと履歴のために増減ログにも残す (delta 0、借金の前後つき)。
      //    利息が 0 でも、残っている元本を「日付をまたいだ元本」にするため記録は必ず書く
      const owed = loansByPlayer.get(player.name);
      if (owed) {
        const accrued = applyInterest(owed.loan, loanSettings.interestRate, interestIso);
        if (accrued) transaction.set(owed.ref, accrued.loan);
        if (accrued && accrued.added > 0) {
          totalInterest += accrued.added;
          const historyId = rateHistoryDocId(player.name, interestIso);
          transaction.set(db.collection('point_history').doc(historyId), {
            id: historyId,
            player: player.name,
            beforeScore: after,
            afterScore: after,
            delta: 0,
            source: 'loan_interest',
            reason: `借金の利息 ×${1 + loanSettings.interestRate}`,
            debtBefore: accrued.debtBefore,
            debtAfter: accrued.debtAfter,
            actor: 'scheduled_function',
            createdAt: interestIso
          });
        }
      }
    });

    transaction.set(settingsRef, {
      rate_baseline: baseline,
      rate_reversion_rate: rate,
      rate_reversion_flat: flat,
      rate_reversion_last_date: todayKey,
      rate_reversion_last_run_at: nowIso,
      rate_reversion_last_total: totalMoved,
      loan_interest_last_total: totalInterest,
      updatedAt: nowIso
    }, { merge: true });
    transaction.set(runRef, { date: todayKey, ranAt: nowIso, baseline, rate, flat, totalMoved, totalInterest });

    return { status: 'success', date: todayKey, rate, totalMoved, totalInterest };
  });
}

async function getStoredPassword(playerDoc, player) {
  const secretDoc = await db.collection('player_secrets').doc(playerDoc.id).get();
  if (secretDoc.exists) {
    return String(secretDoc.data().pass || '');
  }

  // 移行期間の後方互換。player_secrets 作成後は players.pass を削除する。
  return String(player.pass || '');
}

function buildUrl(baseUrl, path = '') {
  const base = String(baseUrl || '').trim();
  if (!base) throw new Error('manaba URLが未設定です。');
  const parsedBase = new URL(base);
  const root = `${parsedBase.protocol}//${parsedBase.host}/`;
  return new URL(String(path || ''), root).toString();
}

function parseCookieHeaders(headers) {
  const raw = headers.get('set-cookie');
  if (!raw) return [];
  return raw
    .split(/,\s*(?=[^;,]+=)/)
    .map(cookie => cookie.split(';')[0])
    .filter(Boolean);
}

function mergeCookies(existing, next) {
  const jar = new Map();
  existing.forEach(cookie => {
    const [name] = cookie.split('=');
    if (name) jar.set(name, cookie);
  });
  next.forEach(cookie => {
    const [name] = cookie.split('=');
    if (name) jar.set(name, cookie);
  });
  return [...jar.values()];
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
  return decodeHtml(String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAttributes(tag) {
  const attrs = {};
  String(tag || '').replace(/([:\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g, (_, key, __, doubleValue, singleValue, bareValue) => {
    attrs[key.toLowerCase()] = decodeHtml(doubleValue ?? singleValue ?? bareValue ?? '');
    return '';
  });
  return attrs;
}

function extractHiddenInputs(html) {
  const params = new URLSearchParams();
  const inputPattern = /<input\b[^>]*>/gi;
  let match;
  while ((match = inputPattern.exec(String(html || '')))) {
    const attrs = parseAttributes(match[0]);
    if (String(attrs.type || '').toLowerCase() !== 'hidden' || !attrs.name) continue;
    params.append(attrs.name, attrs.value || '');
  }
  return params;
}

function findLoginFormAction(html, fallbackUrl) {
  const formMatch = String(html || '').match(/<form\b[^>]*>/i);
  if (!formMatch) return fallbackUrl;
  const attrs = parseAttributes(formMatch[0]);
  if (!attrs.action) return fallbackUrl;
  try {
    return new URL(attrs.action, fallbackUrl).toString();
  } catch {
    return fallbackUrl;
  }
}

function findFirstLink(rowHtml, baseUrl) {
  const match = String(rowHtml || '').match(/<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const href = match ? (match[2] || match[3] || match[4] || '') : '';
  if (!href) return '';
  try {
    return new URL(decodeHtml(href), baseUrl).toString();
  } catch {
    return decodeHtml(href);
  }
}

function findLinkByClass(rowHtml, className, baseUrl) {
  const classPattern = String(className || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const containerPattern = new RegExp(`<[^>]*class\\s*=\\s*["'][^"']*${classPattern}[^"']*["'][^>]*>[\\s\\S]*?<\\/[^>]+>`, 'i');
  const containerMatch = String(rowHtml || '').match(containerPattern);
  const targetHtml = containerMatch ? containerMatch[0] : String(rowHtml || '');
  const linkMatch = targetHtml.match(/<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/i);
  if (!linkMatch) return { text: '', url: '' };
  const href = linkMatch[2] || linkMatch[3] || linkMatch[4] || '';
  let url = '';
  try {
    url = new URL(decodeHtml(href), baseUrl).toString();
  } catch {
    url = decodeHtml(href);
  }
  return { text: stripTags(linkMatch[5] || ''), url };
}

// manaba の見出し・絞り込み UI に出る文言。これらを含む塊は課題ではない
const MANABA_UI_NOISE = /(課題一覧|非表示に設定中|全課題|受付終了まで|絞り込|一覧に戻る|コースメニュー|マイページ)/;

function parseManabaLibraryAssignments(html, baseUrl) {
  if (!/未提出の課題一覧|myassignments-title/.test(String(html || ''))) return [];
  const rows = String(html || '').match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const assignments = [];

  rows.forEach((row, index) => {
    if (!/myassignments-title/.test(row)) return;
    const cells = (row.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || []).map(stripTags);
    const type = cells[0] || '課題';
    const assignment = findLinkByClass(row, 'myassignments-title', baseUrl);
    const course = findLinkByClass(row, 'mycourse-title', baseUrl);
    const periods = (row.match(/<td\b[^>]*class\s*=\s*["'][^"']*td-period[^"']*["'][^>]*>[\s\S]*?<\/td>/gi) || []).map(stripTags);
    const startText = periods[0] || '';
    const deadlineText = periods[1] || '';
    const sourceKey = `${assignment.text}|${course.text}|${deadlineText}|${assignment.url || index}`;

    assignments.push({
      id: `manaba_${Buffer.from(sourceKey).toString('base64url').slice(0, 40)}`,
      title: assignment.text || '名称未取得',
      course: course.text || '',
      type,
      status: '未提出',
      startText,
      deadlineText,
      deadline: normalizeDeadline(deadlineText),
      url: assignment.url,
      courseUrl: course.url,
      source: 'manaba',
      done: false
    });
  });

  return assignments;
}

function findManabaPendingLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const anchorPattern = /<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(String(html || '')))) {
    const rawHref = match[2] || match[3] || match[4] || '';
    const label = stripTags(match[5] || '');
    const href = decodeHtml(rawHref);
    const nearby = stripTags(String(html || '').slice(Math.max(0, match.index - 300), match.index + match[0].length + 300));
    const text = `${label} ${href} ${nearby}`;
    const looksPending = /(未提出|未回答|未解答|未受験|未完了|課題一覧|レポート|小テスト|アンケート)/.test(text);
    if (!href || !looksPending) continue;

    try {
      const url = new URL(href, baseUrl).toString();
      if (!seen.has(url)) {
        seen.add(url);
        links.push(url);
      }
    } catch {
      // Invalid or javascript links cannot be fetched server-side.
    }
  }

  return links.slice(0, 8);
}

function parseManabaAssignmentBlocks(html, baseUrl) {
  const pendingWords = /(未提出|未回答|未解答|未受験|未完了|受付中)/;
  const doneWords = /(提出済|回答済|解答済|完了|採点済)/;
  const blockPattern = /<(li|div|section)\b[^>]*>[\s\S]*?<\/\1>/gi;
  const assignments = [];
  let match;

  while ((match = blockPattern.exec(String(html || '')))) {
    const block = match[0];
    const text = stripTags(block);
    if (text.length < 8 || !pendingWords.test(text) || doneWords.test(text)) continue;
    // 見出しや絞り込みパネルは「未提出の課題一覧」を含むため pendingWords に引っかかる。
    // これを課題として登録しないように、画面部品の文言と長すぎる本文を弾く
    if (MANABA_UI_NOISE.test(text)) continue;
    if (text.length > 200) continue;
    const url = findFirstLink(block, baseUrl);
    if (!url) continue;
    const deadlineText = (text.match(/20\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2}[^\s　]*/)?.[0]) || '';
    // 実際の課題には必ず受付終了日時が入る。日付が取れない塊は課題ではない
    if (!deadlineText) continue;
    const sourceKey = `${text.slice(0, 100)}|${url}`;
    assignments.push({
      id: `manaba_${Buffer.from(sourceKey).toString('base64url').slice(0, 40)}`,
      title: text.replace(deadlineText, '').replace(pendingWords, '').trim().slice(0, 90) || '名称未取得',
      course: '',
      status: (text.match(pendingWords)?.[0]) || '未提出',
      deadlineText,
      deadline: normalizeDeadline(deadlineText),
      url,
      source: 'manaba',
      done: false
    });
  }

  return assignments;
}

function normalizeDeadline(text) {
  const value = String(text || '');
  const match = value.match(/(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parseManabaAssignments(html, baseUrl) {
  const libraryAssignments = parseManabaLibraryAssignments(html, baseUrl);
  if (libraryAssignments.length) return libraryAssignments;

  const rows = String(html || '').match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const pendingWords = /(未提出|未回答|未解答|未受験|未完了|未提出課題|受付中)/;
  const doneWords = /(提出済|回答済|解答済|完了|採点済)/;
  const assignments = [];

  rows.forEach((row, index) => {
    const cells = (row.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || []).map(stripTags).filter(Boolean);
    const text = stripTags(row);
    if (!cells.length || !pendingWords.test(text) || doneWords.test(text)) return;

    const deadlineText = cells.find(cell => /20\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2}/.test(cell)) || '';
    const status = cells.find(cell => pendingWords.test(cell)) || '未提出';
    if (MANABA_UI_NOISE.test(text)) return;
    const title = cells.find(cell => !pendingWords.test(cell) && cell !== deadlineText) || text.slice(0, 80);
    const course = cells.length >= 3 ? cells[0] : '';
    const url = findFirstLink(row, baseUrl);
    const sourceKey = `${title}|${deadlineText}|${url || index}`;

    assignments.push({
      id: `manaba_${Buffer.from(sourceKey).toString('base64url').slice(0, 40)}`,
      title,
      course,
      status,
      deadlineText,
      deadline: normalizeDeadline(deadlineText),
      url,
      source: 'manaba',
      done: false
    });
  });

  const blockAssignments = parseManabaAssignmentBlocks(html, baseUrl);
  const merged = new Map();
  [...assignments, ...blockAssignments].forEach(item => {
    merged.set(item.id, item);
  });
  // 解析漏れの保険。画面部品の文言がタイトルに残っているものは最後に落とす
  return [...merged.values()].filter(item => !MANABA_UI_NOISE.test(item.title));
}

function getHtmlTitle(html) {
  const match = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return stripTags(match ? match[1] : '');
}

function getTextPreview(html) {
  return stripTags(html).slice(0, 300);
}

async function scrapeManabaCredential(credentialDoc) {
  const credential = credentialDoc.data();
  const baseUrl = credential.baseUrl || DEFAULT_MANABA_BASE_URL;
  const loginUrl = buildUrl(baseUrl, credential.loginPath || DEFAULT_MANABA_LOGIN_PATH);
  const assignmentsUrl = buildUrl(baseUrl, credential.assignmentsPath || DEFAULT_MANABA_ASSIGNMENTS_PATH);
  const username = String(credential.loginId || '');
  const password = String(credential.password || '');
  const usernameField = credential.usernameField || 'userid';
  const passwordField = credential.passwordField || 'password';
  if (!username || !password) throw new Error('ログインIDまたはパスワードが未設定です。');

  let cookies = [];
  const loginPage = await fetch(loginUrl, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(20000)
  });
  cookies = mergeCookies(cookies, parseCookieHeaders(loginPage.headers));
  const loginHtml = await loginPage.text().catch(() => '');
  const body = extractHiddenInputs(loginHtml);
  body.set(usernameField, username);
  body.set(passwordField, password);

  const postUrl = findLoginFormAction(loginHtml, loginUrl);
  const loginResponse = await fetch(postUrl, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookies.join('; ')
    },
    signal: AbortSignal.timeout(20000),
    body
  });
  cookies = mergeCookies(cookies, parseCookieHeaders(loginResponse.headers));

  const assignmentsResponse = await fetch(assignmentsUrl, {
    method: 'GET',
    headers: { Cookie: cookies.join('; ') },
    signal: AbortSignal.timeout(20000)
  });
  let html = await assignmentsResponse.text();
  if (!assignmentsResponse.ok) {
    throw new Error(`課題一覧の取得に失敗しました (${assignmentsResponse.status})。`);
  }

  let assignments = parseManabaAssignments(html, assignmentsUrl);
  const checkedUrls = [assignmentsUrl];

  if (!assignments.length) {
    const candidateUrls = findManabaPendingLinks(html, assignmentsUrl);
    for (const candidateUrl of candidateUrls) {
      const candidateResponse = await fetch(candidateUrl, {
        method: 'GET',
        headers: { Cookie: cookies.join('; ') },
        signal: AbortSignal.timeout(20000)
      });
      const candidateHtml = await candidateResponse.text();
      checkedUrls.push(candidateUrl);
      if (!candidateResponse.ok) continue;
      const candidateAssignments = parseManabaAssignments(candidateHtml, candidateUrl);
      if (candidateAssignments.length) {
        html = candidateHtml;
        assignments = candidateAssignments;
        break;
      }
    }
  }

  await db.collection('manaba_assignments').doc(credentialDoc.id).set({
    owner: credential.owner || '',
    ownerUid: credentialDoc.id,
    assignments,
    lastSyncedAt: new Date().toISOString(),
    lastSyncStatus: 'success',
    lastSyncError: '',
    lastSyncTitle: getHtmlTitle(html),
    lastSyncPreview: assignments.length ? '' : getTextPreview(html),
    lastCheckedUrls: checkedUrls
  }, { merge: true });

  return assignments.length;
}

async function syncManabaCredentialDoc(credentialDoc) {
  try {
    return { uid: credentialDoc.id, count: await scrapeManabaCredential(credentialDoc), status: 'success' };
  } catch (error) {
    await db.collection('manaba_assignments').doc(credentialDoc.id).set({
      ownerUid: credentialDoc.id,
      lastSyncedAt: new Date().toISOString(),
      lastSyncStatus: 'error',
      lastSyncError: error.message
    }, { merge: true });
    return { uid: credentialDoc.id, count: 0, status: 'error', message: error.message };
  }
}

// ------------------------------------------------------------------
// manaba締切プッシュ通知 (締切2日前)
// ------------------------------------------------------------------

const MANABA_REMINDER_DAYS_BEFORE = 2;
const APP_URL = 'https://q-jong.web.app/';

/**
 * 通知1件ぶんの送信内容。ブラウザ・PWA (Web プッシュ) と iOS アプリ (APNs) の両方に届く形にする。
 * 同じ tag の通知は上書きして1つにまとめる (Web は tag、iOS は apns-collapse-id)。
 * iOS アプリは通知をタップすると data.link のページを開く (assets/js/common.js の listenNativeNotificationTaps)
 */
function pushMessage(tokens, { title, body, tag, link = APP_URL }) {
  return {
    tokens,
    notification: { title, body },
    data: { link },
    webpush: {
      fcmOptions: { link },
      // 通知のアイコンは公式キャラ (船長) の顔 (iOS アプリはアプリのアイコンが出る)。
      // 船長を出し始める日時 (assets/js/common.js の CAPTAIN_REVEAL_AT と同じ) より前は、これまでのアイコン
      notification: { icon: Date.now() >= Date.parse('2026-10-04T00:00:00+09:00') ? '/assets/img/captain/icon.png' : '/assets/icon.png', tag }
    },
    apns: {
      headers: { 'apns-collapse-id': String(tag).slice(0, 64) },
      payload: { aps: { sound: 'default', 'thread-id': String(tag) } }
    }
  };
}

/** 送れなかった (失効した) トークンを push_tokens から消す */
async function removeInvalidPushTokens(tokenDoc, tokenEntries, tokens, response) {
  const invalidTokens = new Set();
  response.responses.forEach((sendResult, index) => {
    if (sendResult.success) return;
    const code = String(sendResult.error?.code || '');
    if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
      invalidTokens.add(tokens[index]);
    }
  });
  if (invalidTokens.size) {
    await tokenDoc.ref.set({
      tokens: tokenEntries.filter(entry => !invalidTokens.has(String(entry?.token || ''))),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }
}

/**
 * 通知を登録している全員 (push_tokens の全端末) に同じ通知を送る。
 * 同じ端末のトークンが複数の人に登録されていても1回だけ送る。失効したトークンは消す
 */
async function sendPushToEveryone({ title, body, tag, link = APP_URL }) {
  const snapshot = await db.collection('push_tokens').get();
  const sentTokens = new Set();
  let success = 0;
  let failure = 0;
  for (const tokenDoc of snapshot.docs) {
    const tokenEntries = Array.isArray(tokenDoc.data().tokens) ? tokenDoc.data().tokens : [];
    const tokens = [...new Set(tokenEntries.map(entry => String(entry?.token || '')).filter(Boolean))]
      .filter(token => !sentTokens.has(token));
    if (!tokens.length) continue;
    tokens.forEach(token => sentTokens.add(token));

    const response = await admin.messaging().sendEachForMulticast(pushMessage(tokens, { title, body, tag, link }));
    success += response.successCount;
    failure += response.failureCount;
    await removeInvalidPushTokens(tokenDoc, tokenEntries, tokens, response);
  }
  return { success, failure };
}

/** 「10/1 12:00」。通知の本文用 (JST) */
function formatJstShortDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 新しく作られた宝くじ・スポーツくじを全員に知らせる。失敗しても保存は成功扱い (ログだけ残す) */
async function notifyNewEvents(created) {
  const messages = [
    ...created.lotteries.map(lottery => ({
      title: `🎟️ 新しい宝くじ「${lottery.name}」`,
      body: [
        Number.isFinite(Number(lottery.ticketPrice)) ? `1枚 ${lottery.ticketPrice}` : '',
        lottery.purchaseDeadline ? `購入締切 ${formatJstShortDateTime(lottery.purchaseDeadline)}` : ''
      ].filter(Boolean).join(' / ') || 'ホームから購入できます',
      tag: `lottery-${lottery.lotteryId}`
    })),
    ...created.sports_bets.map(bet => ({
      title: `🏆 新しいスポーツくじ「${bet.matchName}」`,
      body: bet.deadline ? `締切 ${formatJstShortDateTime(bet.deadline)}` : 'ホームから投票できます',
      tag: `sports-bet-${bet.betId}`
    }))
  ];
  let success = 0;
  let failure = 0;
  for (const message of messages) {
    try {
      const result = await sendPushToEveryone(message);
      success += result.success;
      failure += result.failure;
    } catch (error) {
      console.error(`くじ作成の通知に失敗しました (${message.tag}):`, error);
    }
  }
  if (messages.length) console.log('notifyNewEvents:', JSON.stringify({ count: messages.length, success, failure }));
  return { count: messages.length, success, failure };
}

function parseManabaDeadlineDateParts(item) {
  const rawText = String(item?.deadlineText || item?.deadline || '').trim();
  if (!rawText) return null;

  const normalizedText = rawText
    .replace(/[年月]/g, '/')
    .replace(/[日]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const dateMatch = normalizedText.match(/(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
  if (!dateMatch) return null;

  const [, year, month, day] = dateMatch;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

function getDaysUntilManabaDeadline(item, todayKey) {
  const parts = parseManabaDeadlineDateParts(item);
  if (!parts) return null;
  const [todayYear, todayMonth, todayDay] = String(todayKey).split('-').map(Number);
  const diffMs = Date.UTC(parts.year, parts.month - 1, parts.day)
    - Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.round(diffMs / 86400000);
}

function buildDeadlineReminderBody(targets) {
  const lines = targets.slice(0, 4).map(({ item, daysLeft }) => {
    const label = daysLeft <= 0 ? '今日締切' : `あと${daysLeft}日`;
    const course = item.course ? `（${item.course}）` : '';
    return `${label}: ${item.title || '名称未取得'}${course}`;
  });
  if (targets.length > lines.length) {
    lines.push(`ほか${targets.length - lines.length}件`);
  }
  return lines.join('\n');
}

export const sendManabaDeadlineReminders = onSchedule({
  region: 'asia-northeast1',
  schedule: '0 9 * * *',
  timeZone: 'Asia/Tokyo',
  timeoutSeconds: 300
}, async () => {
  const tokensSnapshot = await db.collection('push_tokens').get();
  if (tokensSnapshot.empty) {
    console.log('sendManabaDeadlineReminders: 通知先トークンがないためスキップしました。');
    return;
  }

  // 通知対象ユーザーの課題を最新化してから判定する
  for (const tokenDoc of tokensSnapshot.docs) {
    const credentialDoc = await db.collection('manaba_credentials').doc(tokenDoc.id).get();
    if (credentialDoc.exists) {
      await syncManabaCredentialDoc(credentialDoc);
    }
  }

  const todayKey = getJstDateKey();
  const results = [];

  for (const tokenDoc of tokensSnapshot.docs) {
    const uid = tokenDoc.id;
    const tokenEntries = Array.isArray(tokenDoc.data().tokens) ? tokenDoc.data().tokens : [];
    const tokens = [...new Set(tokenEntries.map(entry => String(entry?.token || '')).filter(Boolean))];
    if (!tokens.length) continue;

    const assignmentsRef = db.collection('manaba_assignments').doc(uid);
    const assignmentsDoc = await assignmentsRef.get();
    if (!assignmentsDoc.exists) continue;

    const record = assignmentsDoc.data();
    const assignments = Array.isArray(record.assignments) ? record.assignments : [];
    const sentMap = record.deadlineRemindersSent || {};

    // 提出済み・消滅した課題の送信記録は掃除する
    const currentIds = new Set(assignments.map(item => item?.id).filter(Boolean));
    const nextSentMap = {};
    Object.entries(sentMap).forEach(([id, at]) => {
      if (currentIds.has(id)) nextSentMap[id] = at;
    });

    const targets = [];
    assignments.forEach(item => {
      if (!item || item.done || !item.id) return;
      const daysLeft = getDaysUntilManabaDeadline(item, todayKey);
      if (daysLeft === null || daysLeft < 0 || daysLeft > MANABA_REMINDER_DAYS_BEFORE) return;
      if (nextSentMap[item.id]) return;
      targets.push({ item, daysLeft });
    });

    if (!targets.length) {
      if (Object.keys(nextSentMap).length !== Object.keys(sentMap).length) {
        await assignmentsRef.set({ deadlineRemindersSent: nextSentMap }, { merge: true });
      }
      continue;
    }

    targets.sort((a, b) => a.daysLeft - b.daysLeft);
    const response = await admin.messaging().sendEachForMulticast(pushMessage(tokens, {
      title: `📚 締切が近い課題が${targets.length}件あります`,
      body: buildDeadlineReminderBody(targets),
      tag: 'manaba-deadline-reminder'
    }));

    // 失効したトークンを削除する
    await removeInvalidPushTokens(tokenDoc, tokenEntries, tokens, response);

    const nowIso = new Date().toISOString();
    targets.forEach(({ item }) => {
      nextSentMap[item.id] = nowIso;
    });
    await assignmentsRef.set({ deadlineRemindersSent: nextSentMap }, { merge: true });

    results.push({
      uid,
      notified: targets.length,
      success: response.successCount,
      failure: response.failureCount
    });
  }

  console.log('sendManabaDeadlineReminders results:', JSON.stringify(results));
});

// ------------------------------------------------------------------
// 出席登録のプッシュ通知 (授業開始時刻)
// ------------------------------------------------------------------

// assets/js/main.js の ATTENDANCE_SCHEDULE / ATTENDANCE_USER_OVERRIDES / ATTENDANCE_USER_CLASSES
// と同じ内容。時間割を変えるときは両方を直すこと。
// 通知を送るレートの下限は settings/app の attendance_min_rate (管理画面で変えられる)。
// 無いときの既定値は assets/js/common.js の ATTENDANCE_MIN_RATE_DEFAULT と揃えること
const ATTENDANCE_MIN_RATE_DEFAULT = 3000;
const ATTENDANCE_SCHEDULE = {
  1: [{ name: 'ネットワーク・データ工学実験', start: '14:00', room: 642 }],
  2: [{ name: '物理の世界と先端技術', start: '15:00', room: 622 }],
  3: [
    { name: '技術者倫理', start: '09:00', room: 647 },
    { name: 'データベース工学', start: '12:00', room: 647 },
    { name: 'デザインプロジェクト設計', start: '14:00', room: 647 }
  ],
  4: [
    { name: 'データマイニング', start: '09:00', room: 611 },
    { name: '国際社会論', start: '11:00', room: 435 }
  ]
};
const ATTENDANCE_USER_OVERRIDES = {
  kosuke: [{ day: 2, from: '14:30', to: '15:30', room: 646 }],
  mahhii: [{ day: 2, from: '14:30', to: '15:30', room: 646 }]
};
// 共通の時間割に無い、その人だけが取っている授業。開始時刻にその人にだけ通知する
const ATTENDANCE_USER_CLASSES = {
  kosuke: [{ day: 1, name: '月曜1・2限', start: '09:00', room: 642 }],
  mahhii: [{ day: 1, name: '月曜1・2限', start: '09:00', room: 642 }]
};
const ATTENDANCE_NOTICE_WINDOW_MINUTES = 5;
const ATTENDANCE_URL_BASE = 'https://attendance.is.chibatech.ac.jp/attendance/class_room/';

function attendanceToMinutes(hhmm) {
  const [hour, minute] = String(hhmm).split(':').map(Number);
  return hour * 60 + minute;
}

/** JST での曜日 (0=日) と、0時からの経過分 */
function getJstDayAndMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // ロケールによっては深夜0時が "24" になるため丸める
  const hour = Number(parts.hour) % 24;
  return { dow: dowMap[parts.weekday], minutes: hour * 60 + Number(parts.minute) };
}

/** その人がその時刻に向かう教室。例外設定があれば優先する */
function resolveAttendanceRoom(username, dow, minutes, slot) {
  const overrides = ATTENDANCE_USER_OVERRIDES[String(username || '').toLowerCase()] || [];
  const override = overrides.find(entry =>
    entry.day === dow
    && minutes >= attendanceToMinutes(entry.from)
    && minutes <= attendanceToMinutes(entry.to)
  );
  return override ? override.room : slot.room;
}

/**
 * 1つの授業ぶんの通知を送る。slot.user があればその人だけに送る (ユーザー別の追加授業)。
 * 送る前に attendance_notices に枠を押さえ、再試行で二重に通知しないようにする。
 */
async function sendAttendanceNoticeForSlot(slot, { dow, minutes, todayKey }) {
  const noticeId = `${todayKey}_${slot.start.replace(':', '')}${slot.user ? `_${slot.user}` : ''}`;
  const noticeRef = db.collection('attendance_notices').doc(noticeId);

  const claimed = await db.runTransaction(async transaction => {
    const doc = await transaction.get(noticeRef);
    if (doc.exists) return false;
    transaction.set(noticeRef, {
      course: slot.name,
      start: slot.start,
      ...(slot.user ? { user: slot.user } : {}),
      createdAt: new Date().toISOString()
    });
    return true;
  });
  if (!claimed) return { course: slot.name, user: slot.user, skipped: 'already_sent' };

  const [settingsDoc, tokensSnapshot, playersSnapshot] = await Promise.all([
    db.collection('settings').doc('app').get(),
    db.collection('push_tokens').get(),
    db.collection('players').get()
  ]);

  const allowedUsers = new Set(
    Array.isArray(settingsDoc.data()?.attendance_allowed_users) ? settingsDoc.data().attendance_allowed_users : []
  );
  const minRateSetting = Number(settingsDoc.data()?.attendance_min_rate);
  const minRate = Number.isFinite(minRateSetting) ? Math.max(0, Math.round(minRateSetting)) : ATTENDANCE_MIN_RATE_DEFAULT;
  const rateByName = new Map(playersSnapshot.docs.map(doc => [doc.data().name, normalizeRate(doc.data().score)]));

  let notified = 0;
  let success = 0;
  let failure = 0;

  for (const tokenDoc of tokensSnapshot.docs) {
    const data = tokenDoc.data();
    const owner = String(data.owner || '');

    // 出席ボタンを出していない人には通知しない
    if (!owner || !allowedUsers.has(owner)) continue;

    // その人だけの授業は、本人以外には送らない
    if (slot.user && owner.toLowerCase() !== slot.user) continue;

    // レートが足りない人にも通知しない (画面のボタンと同じ条件)
    const rate = rateByName.get(owner);
    if (rate === undefined || rate < minRate) continue;

    const tokenEntries = Array.isArray(data.tokens) ? data.tokens : [];
    const tokens = [...new Set(tokenEntries.map(entry => String(entry?.token || '')).filter(Boolean))];
    if (!tokens.length) continue;

    const room = slot.user ? slot.room : resolveAttendanceRoom(owner, dow, minutes, slot);
    const response = await admin.messaging().sendEachForMulticast(pushMessage(tokens, {
      title: '📋 出席の時間です',
      body: `${slot.name}（${room}教室）`,
      tag: `attendance-${todayKey}-${slot.start}`,
      link: `${ATTENDANCE_URL_BASE}${room}`
    }));

    notified += 1;
    success += response.successCount;
    failure += response.failureCount;

    // 失効したトークンを削除する
    await removeInvalidPushTokens(tokenDoc, tokenEntries, tokens, response);
  }

  await noticeRef.set({ notified, success, failure }, { merge: true });
  return { course: slot.name, user: slot.user, start: slot.start, notified, success, failure };
}

export const sendAttendanceNotices = onSchedule({
  region: 'asia-northeast1',
  schedule: '0,30 9-18 * * 1-4',
  timeZone: 'Asia/Tokyo',
  timeoutSeconds: 120
}, async () => {
  const { dow, minutes } = getJstDayAndMinutes();
  const isStartingNow = slot => slot.day === undefined || slot.day === dow
    ? Math.abs(minutes - attendanceToMinutes(slot.start)) <= ATTENDANCE_NOTICE_WINDOW_MINUTES
    : false;
  const slots = [
    ...(ATTENDANCE_SCHEDULE[dow] || []).filter(isStartingNow),
    ...Object.entries(ATTENDANCE_USER_CLASSES).flatMap(([user, classes]) =>
      classes.filter(isStartingNow).map(slot => ({ ...slot, user }))
    )
  ];

  // 授業の開始時刻でなければ、DBを一切読まずに終わる
  if (!slots.length) return;

  const context = { dow, minutes, todayKey: getJstDateKey() };
  const results = [];
  for (const slot of slots) {
    results.push(await sendAttendanceNoticeForSlot(slot, context));
  }

  console.log('sendAttendanceNotices results:', JSON.stringify(results));
});

// 関数名は据え置き。リネームすると Cloud Scheduler のジョブが作り直され、
// 旧ジョブが消し漏れると同じ日に二重で補正が走るおそれがあるため。
export const collectDailyPointTax = onSchedule({
  region: 'asia-northeast1',
  schedule: '5 0 * * *',
  timeZone: 'Asia/Tokyo'
}, async () => {
  const result = await applyDailyRateReversionForToday();
  console.log('applyDailyRateReversion result:', result);
  await rebuildRateChartQuietly('daily_rate_reversion');
});

/**
 * クライアントは画面で読み込んだ全データを丸ごと送ってくる。
 * players.score をそのまま書くと、読み込んだあとに入った変化 (カジノの精算、
 * 別の人の宝くじ購入、日次補正など) を古い値で巻き戻してしまうので、
 * 読み込み時点の値 (_baseScore) との差だけを「今の値」に足す。
 * 増減ログもここで実際の前後の値から作り直し、クライアントの送ってきたログは
 * source / reason / actor / createdAt を借りるだけにする。
 * _baseScore が無い (古いページから送られた) プレイヤーは従来どおり送られた値で上書きする。
 */
function rebasePlayerScores(players, snapshot, clientEntries, fallbackMeta) {
  const currentById = new Map(snapshot.docs.map(doc => [doc.id, doc.data()]));
  const metaByPlayer = new Map();
  clientEntries.forEach(entry => {
    if (entry && entry.player && !metaByPlayer.has(entry.player)) metaByPlayer.set(entry.player, entry);
  });

  const scores = new Map();
  const history = [];
  players.forEach((player, index) => {
    if (!player || !player.name) return;
    const docId = getItemDocId('scores', player, index);
    const current = currentById.get(docId);
    const sent = normalizeRate(player.score);
    if (!current) {
      scores.set(docId, sent);
      return;
    }

    const before = normalizeRate(current.score);
    const base = Number(player._baseScore);
    const after = Number.isFinite(base) ? normalizeRate(before + sent - normalizeRate(base)) : sent;
    scores.set(docId, after);
    if (after === before) return;

    const meta = metaByPlayer.get(player.name) || {};
    const at = String(meta.createdAt || fallbackMeta.at);
    const id = rateHistoryDocId(player.name, at);
    history.push({
      id,
      player: player.name,
      beforeScore: before,
      afterScore: after,
      delta: after - before,
      source: String(meta.source || 'rate_update'),
      reason: String(meta.reason || ''),
      actor: String(meta.actor || fallbackMeta.actor),
      createdAt: at
    });
  });
  return { scores, history };
}

export const updateAllData = onRequest({ region: 'asia-northeast1' }, async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
    return;
  }

  try {
    const body = req.body || {};
    const decoded = await getVerifiedAuthToken(req);
    if (!decoded) {
      res.status(401).json({ status: 'error', message: '認証が必要です。' });
      return;
    }

    const data = body.data || {};
    const pointHistoryEntries = Array.isArray(body.pointHistoryEntries) ? body.pointHistoryEntries : [];
    const actor = decoded.username || decoded.uid;
    const nowIso = new Date().toISOString();

    // 新しく作られた宝くじ・スポーツくじ (保存が終わったら全員に通知する)
    let created = { lotteries: [], sports_bets: [] };
    const historyCount = await db.runTransaction(async transaction => {
      created = { lotteries: [], sports_bets: [] };
      const snapshots = new Map();
      for (const [key, collectionName] of Object.entries(FIREBASE_COLLECTIONS)) {
        snapshots.set(key, await transaction.get(db.collection(collectionName)));
      }

      const scoreWrites = rebasePlayerScores(
        Array.isArray(data.scores) ? data.scores : [],
        snapshots.get('scores'),
        pointHistoryEntries,
        { actor, at: nowIso }
      );

      for (const [key, collectionName] of Object.entries(FIREBASE_COLLECTIONS)) {
        const collectionRef = db.collection(collectionName);
        const nextIds = new Set();
        const existingIds = new Set(snapshots.get(key).docs.map(doc => doc.id));

        (Array.isArray(data[key]) ? data[key] : []).forEach((item, index) => {
          const docId = getItemDocId(key, item, index);
          nextIds.add(docId);
          const payload = { ...item };
          delete payload._docId;
          delete payload._baseScore;
          if (key === 'scores' && scoreWrites.scores.has(docId)) {
            payload.score = scoreWrites.scores.get(docId);
          }
          if (Object.hasOwn(created, key) && !existingIds.has(docId)) {
            created[key].push(payload);
          }
          transaction.set(collectionRef.doc(docId), payload);
        });

        snapshots.get(key).docs.forEach(doc => {
          if (!nextIds.has(doc.id)) {
            transaction.delete(doc.ref);
          }
        });
      }

      scoreWrites.history.forEach(entry => {
        transaction.set(db.collection('point_history').doc(entry.id), entry);
      });

      transaction.set(db.collection('settings').doc('app'), {
        attendance_allowed_users: Array.isArray(data.attendance_allowed_users) ? data.attendance_allowed_users : [],
        updatedAt: nowIso
      }, { merge: true });

      return scoreWrites.history.length;
    });

    // レートが動いたときだけグラフ用データを作り直す (失敗しても保存自体は成功扱い)
    if (historyCount > 0) {
      await rebuildRateChartQuietly('updateAllData');
    }
    const notifications = await notifyNewEvents(created);

    res.status(200).json({ status: 'success', message: 'データをFirebaseに保存しました。', notifications });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'error', message: `Firebase書き込み失敗: ${error.message}` });
  }
});

export const rebuildRateChart = onRequest({ region: 'asia-northeast1' }, async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
    return;
  }

  try {
    if (!await hasWriteAccess(req, req.body || {})) {
      res.status(401).json({ status: 'error', message: '認証が必要です。' });
      return;
    }

    const payload = await rebuildRateChartFromHistory();
    res.status(200).json({
      status: 'success',
      message: `レート推移を${payload.days.length}日ぶん組み立てました。`,
      days: payload.days.length,
      players: payload.players.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'error', message: `レート推移の再構築に失敗しました: ${error.message}` });
  }
});

// -----------------------------------------------------------------
// 参加ボーナス
//   指定した日 (JST) に麻雀・カジノに参加した回数に応じてレートを配る。数え方は participation-bonus.js。
//   管理者 (admin クレーム) だけが呼べる。preview は数えるだけ、grant で配る。
//   同じ日には1回しか配れない (bonus_runs/participation_{日付} に配った内容を残す。rules に無いので画面からは読み書きできない)
// -----------------------------------------------------------------
const BONUS_RUN_COLLECTION = 'bonus_runs';

function participationBonusRunRef(dateKey) {
  return db.collection(BONUS_RUN_COLLECTION).doc(`participation_${dateKey}`);
}

/** その日の増減ログを読んで、人ごとの参加回数を数える */
async function participationCountsOn(dateKey) {
  const { start, end } = jstDayRange(dateKey);
  const snapshot = await db.collection('point_history')
    .where('createdAt', '>=', start)
    .where('createdAt', '<', end)
    .get();
  const entries = snapshot.docs.map(doc => doc.data());
  return tallyParticipation(entries, RATE_EXCLUDED_PLAYERS);
}

async function previewParticipationBonus(dateKey, units) {
  const [counts, playersSnapshot, runDoc] = await Promise.all([
    participationCountsOn(dateKey),
    db.collection('players').get(),
    participationBonusRunRef(dateKey).get()
  ]);
  const knownPlayers = new Set(playersSnapshot.docs.map(doc => doc.data().name));
  const grants = buildParticipationGrants(counts, units, knownPlayers);
  return {
    date: dateKey,
    ...units,
    grants,
    total: grants.reduce((sum, grant) => sum + grant.bonus, 0),
    alreadyGranted: runDoc.exists ? runDoc.data() : null
  };
}

async function grantParticipationBonus(dateKey, units, actor) {
  const counts = await participationCountsOn(dateKey);
  const runRef = participationBonusRunRef(dateKey);
  const result = await db.runTransaction(async transaction => {
    const [runDoc, playersSnapshot] = await Promise.all([
      transaction.get(runRef),
      transaction.get(db.collection('players'))
    ]);
    if (runDoc.exists) {
      const run = runDoc.data();
      throw new ParticipationBonusError(409, `${dateKey} の参加ボーナスは配布済みです (${run.grantedAt} / 合計 ${run.total})。`);
    }
    const playerDocs = new Map(playersSnapshot.docs.map(doc => [doc.data().name, doc]));
    const grants = buildParticipationGrants(counts, units, new Set(playerDocs.keys()));
    if (grants.length === 0) {
      throw new ParticipationBonusError(409, `${dateKey} に麻雀・カジノに参加した人がいません。`);
    }

    const at = new Date().toISOString();
    const applied = grants.map(grant => {
      const playerDoc = playerDocs.get(grant.player);
      const beforeScore = normalizeRate(playerDoc.data().score);
      const afterScore = beforeScore + grant.bonus;
      transaction.update(playerDoc.ref, { score: afterScore });
      const historyId = rateHistoryDocId(grant.player, at);
      transaction.set(db.collection('point_history').doc(historyId), {
        id: historyId,
        player: grant.player,
        beforeScore,
        afterScore,
        delta: grant.bonus,
        source: PARTICIPATION_BONUS_SOURCE,
        reason: participationBonusReason(dateKey, grant),
        actor,
        createdAt: at
      });
      return { ...grant, beforeScore, afterScore };
    });
    const total = applied.reduce((sum, grant) => sum + grant.bonus, 0);
    transaction.set(runRef, { date: dateKey, ...units, grants: applied, total, grantedBy: actor, grantedAt: at });
    return { date: dateKey, ...units, grants: applied, total, grantedAt: at };
  });
  await rebuildRateChartQuietly(PARTICIPATION_BONUS_SOURCE);
  return result;
}

export const participationBonus = onRequest({ region: 'asia-northeast1' }, async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
    return;
  }

  try {
    const decoded = await getVerifiedAuthToken(req);
    if (!decoded || decoded.admin !== true) {
      res.status(403).json({ status: 'error', message: '管理者としてログインしてください。' });
      return;
    }
    const body = req.body || {};
    const dateKey = String(body.date || getJstDateKey());
    jstDayRange(dateKey);
    const units = normalizeBonusUnits(body);
    const action = String(body.action || 'preview');
    let payload;
    if (action === 'preview') {
      payload = await previewParticipationBonus(dateKey, units);
    } else if (action === 'grant') {
      payload = await grantParticipationBonus(dateKey, units, String(decoded.username || 'admin'));
    } else {
      throw new ParticipationBonusError(400, '不明な操作です。');
    }
    res.status(200).json({ status: 'success', ...payload });
  } catch (error) {
    if (error instanceof ParticipationBonusError) {
      res.status(error.status).json({ status: 'error', message: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ status: 'error', message: `参加ボーナスの処理に失敗しました: ${error.message}` });
  }
});

// -----------------------------------------------------------------
// 船底 (レートが低い人の地下労働)
//   ルールは underground.js。積荷を正しい木箱に仕分けるたびにレートが上がる (既定 +1、上限1000まで、時間の制限なし)。
//   積荷は1回ぶん (既定20個) ずつ渡し、答えをまとめて受け取って採点する。次の積荷も1つ先に渡しておくので、
//   画面は答えを送りながら止まらずに続けられる。
//   記録 underground/{player} は Cloud Functions だけが読み書きする (rules で禁止)。
//   数値は settings/app の underground_* で変えられる (管理画面)。チンチロは 50.5 で休止した。
// -----------------------------------------------------------------
const UNDERGROUND_COLLECTION = 'underground';

function undergroundRef(username) {
  return db.collection(UNDERGROUND_COLLECTION).doc(toDocId(username));
}

async function loadUndergroundSettings() {
  const settingsDoc = await db.collection('settings').doc('app').get();
  return undergroundSettingsFrom(settingsDoc.exists ? settingsDoc.data() : {});
}

function newShipment(settings, at) {
  return {
    id: `${Date.now().toString(36)}${randomInt(1e9).toString(36)}`,
    items: generateShipmentItems(randomInt, settings.itemsPerShipment),
    startedAt: at
  };
}

/** 本人のレートと船底の記録をトランザクションで読む (読むのはここだけ。このあとは書くだけにすること) */
async function readUndergroundState(transaction, username) {
  const ref = undergroundRef(username);
  const [undergroundDoc, playerSnapshot] = await Promise.all([
    transaction.get(ref),
    transaction.get(playerQuery(username))
  ]);
  if (playerSnapshot.empty) {
    throw new UndergroundError(404, 'プレイヤーが見つかりません。');
  }
  const playerDoc = playerSnapshot.docs[0];
  return {
    ref,
    playerDoc,
    score: normalizeRate(playerDoc.data().score),
    record: normalizeUndergroundRecord(undergroundDoc.exists ? undergroundDoc.data() : null, username)
  };
}

/** 画面に返す共通の形 */
function undergroundPayload({ score, record }, settings) {
  return {
    me: record.player,
    score,
    canWork: canWorkUnderground(score, settings),
    underground: publicUndergroundRecord(record),
    settings,
    now: new Date().toISOString()
  };
}

async function undergroundStatus(username, settings) {
  const state = await db.runTransaction(transaction => readUndergroundState(transaction, username));
  return undergroundPayload(state, settings);
}

/** 仕分けを始める。途中の積荷があれば捨てて、いまの積荷と次の積荷を新しく渡す */
async function undergroundStartShipment(username, settings) {
  const at = new Date().toISOString();
  const state = await db.runTransaction(async transaction => {
    const current = await readUndergroundState(transaction, username);
    if (!canWorkUnderground(current.score, settings)) {
      throw new UndergroundError(403, `船底で仕分けできるのはレートが${settings.maxRate}未満の人だけです。`);
    }
    const record = { ...current.record, shipment: newShipment(settings, at), nextShipment: newShipment(settings, at), updatedAt: at };
    transaction.set(current.ref, record);
    return { ...current, record };
  });
  return undergroundPayload(state, settings);
}

/**
 * 仕分けの答えを受け取って採点し、その場でレートを動かす (上限まで)。
 * body.next が true で、まだ上限に届いていなければ、先に渡してあった次の積荷をいまの積荷に繰り上げ、
 * その次の積荷を新しく渡す。やめるとき・上限に届いたときは両方片付ける
 */
async function undergroundSubmitShipment(username, body, settings) {
  const at = new Date().toISOString();
  let grade = null;
  let change = null;
  let rejected = null;
  const state = await db.runTransaction(async transaction => {
    grade = null;
    change = null;
    rejected = null;
    const current = await readUndergroundState(transaction, username);
    const shipment = current.record.shipment;
    if (!shipment || shipment.id !== String(body.shipmentId || '')) {
      throw new UndergroundError(409, 'この積荷はもう片付いています。');
    }
    const answers = Array.isArray(body.answers) ? body.answers.slice(0, shipment.items.length) : [];
    const result = gradeShipment(shipment.items, answers);
    try {
      validateShipmentTiming(Date.parse(at) - Date.parse(shipment.startedAt), result.answered);
    } catch (error) {
      // 速すぎる答えは、この積荷を片付けてレートは動かさない
      rejected = error;
      const record = { ...current.record, shipment: null, nextShipment: null, updatedAt: at };
      transaction.set(current.ref, record);
      return { ...current, record };
    }

    // 上限に届いている人は動かさない (途中で借入などをして上限を超えた場合も)
    const moved = canWorkUnderground(current.score, settings)
      ? workRateChange(current.score, result, settings)
      : { beforeScore: current.score, afterScore: current.score, delta: 0, capped: false };
    if (moved.delta !== 0) {
      transaction.update(current.playerDoc.ref, { score: moved.afterScore });
      const historyId = rateHistoryDocId(username, at);
      transaction.set(db.collection('point_history').doc(historyId), {
        id: historyId,
        player: username,
        beforeScore: moved.beforeScore,
        afterScore: moved.afterScore,
        delta: moved.delta,
        source: UNDERGROUND_WORK_SOURCE,
        reason: workReason(result, moved),
        actor: username,
        createdAt: at
      });
    }
    // 繰り上げた積荷は、いまから仕分け始めたものとして速さを測る (先に渡してあった時間を数えない)
    const keepGoing = body.next && canWorkUnderground(moved.afterScore, settings);
    const queued = current.record.nextShipment;
    const shipments = keepGoing
      ? { shipment: queued ? { ...queued, startedAt: at } : newShipment(settings, at), nextShipment: newShipment(settings, at) }
      : { shipment: null, nextShipment: null };
    const record = applyShipmentResult(current.record, result, moved, at, shipments);
    transaction.set(current.ref, record);
    grade = result;
    change = moved;
    return { ...current, score: moved.afterScore, record };
  });
  if (rejected) throw rejected;
  if (change && change.delta !== 0) {
    await rebuildRateChartQuietly(UNDERGROUND_WORK_SOURCE);
  }
  return { ...undergroundPayload(state, settings), grade, change };
}

const UNDERGROUND_ACTIONS = {
  status: ({ username, settings }) => undergroundStatus(username, settings),
  start: ({ username, settings }) => undergroundStartShipment(username, settings),
  submit: ({ username, body, settings }) => undergroundSubmitShipment(username, body, settings)
};

export const underground = onRequest({ region: 'asia-northeast1' }, async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
    return;
  }

  try {
    const decoded = await getVerifiedAuthToken(req);
    const username = decoded && decoded.username;
    if (!username) {
      res.status(401).json({ status: 'error', message: 'ログインが必要です。マイページでログインし直してください。' });
      return;
    }
    if (RATE_EXCLUDED_PLAYERS.has(username)) {
      res.status(403).json({ status: 'error', message: 'このアカウントは船底を利用できません。' });
      return;
    }

    const body = req.body || {};
    const action = String(body.action || 'status');
    if (!Object.hasOwn(UNDERGROUND_ACTIONS, action)) {
      throw new UndergroundError(400, action === 'chinchiro' ? 'チンチロは休止中です。' : '不明な操作です。');
    }
    const settings = await loadUndergroundSettings();
    const payload = await UNDERGROUND_ACTIONS[action]({ username, body, settings });
    res.status(200).json({ status: 'success', ...payload });
  } catch (error) {
    if (error instanceof UndergroundError) {
      res.status(error.status).json({ status: 'error', message: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ status: 'error', message: `船底の処理に失敗しました: ${error.message}` });
  }
});

// -----------------------------------------------------------------
// 指名手配 (レートが1万を超えた人を賞金首にする神経衰弱)
//   ルールは wanted.js。1枚めくるたびに遊んだ人から賞金首へ 1、1組そろえたら賞金首から遊んだ人へ 50 を
//   その場でレートに反映する。賞金首はめくるたびに、その時点でレートがいちばん高い人 (1万を超えている人) に決め直す。
//   増減ログは1枚ごとには残さず、人ごとに1件へ書き足す (間が30分空いた・日付が変わった・ほかでレートが動いたら次の1件)。
//   盤面 wanted_boards/{uid} と賞金首の記録 wanted_bounties/{player} は Cloud Functions だけが読み書きする (rules で禁止)。
//   レート推移グラフは、めくるたびには作り直さず settleIdleCasinoSessions (10分ごと) が作り直す。
// -----------------------------------------------------------------
const WANTED_BOARDS = 'wanted_boards';
const WANTED_BOUNTIES = 'wanted_bounties';

function wantedBountyRef(name) {
  return db.collection(WANTED_BOUNTIES).doc(toDocId(name));
}

/** レートの対象になっている人 (除外アカウントを除く) の { name, score, doc } */
function wantedPlayersFrom(snapshot) {
  return snapshot.docs
    .map(doc => ({ name: String(doc.data().name || ''), score: normalizeRate(doc.data().score), doc }))
    .filter(player => player.name && !RATE_EXCLUDED_PLAYERS.has(player.name));
}

function publicWantedTarget(target, bounty) {
  if (!target) return null;
  return { name: target.name, score: target.score, paid: bounty ? -bounty.stats.net : 0 };
}

/** 画面に返す共通の形 */
function wantedPayload({ username, score, record, target, bounty }) {
  return {
    me: username,
    score,
    canHunt: Boolean(target) && canHuntWanted(score) && score >= WANTED_FLIP_COST,
    eligible: canHuntWanted(score),
    target: publicWantedTarget(target, bounty),
    board: publicWantedBoard(record.board),
    stats: record.stats,
    rules: { threshold: WANTED_THRESHOLD, flipCost: WANTED_FLIP_COST, pairReward: WANTED_PAIR_REWARD, pairs: WANTED_PAIRS },
    now: new Date().toISOString()
  };
}

async function wantedStatus(uid, username) {
  const [boardDoc, playersSnapshot] = await Promise.all([
    db.collection(WANTED_BOARDS).doc(uid).get(),
    db.collection('players').get()
  ]);
  const players = wantedPlayersFrom(playersSnapshot);
  const me = players.find(player => player.name === username);
  const target = pickWantedTarget(players);
  const bountyDoc = target ? await wantedBountyRef(target.name).get() : null;
  return wantedPayload({
    username,
    score: me ? me.score : 0,
    record: normalizeWantedRecord(boardDoc.exists ? boardDoc.data() : null, username, randomInt),
    target,
    bounty: bountyDoc && bountyDoc.exists ? normalizeBountyRecord(bountyDoc.data(), target.name) : null
  });
}

/** 1枚めくる。代金と懸賞金をその場で本人と賞金首のレートに反映する */
async function wantedFlip(uid, username, rawIndex) {
  const boardRef = db.collection(WANTED_BOARDS).doc(uid);
  return db.runTransaction(async transaction => {
    const [boardDoc, playersSnapshot] = await Promise.all([
      transaction.get(boardRef),
      transaction.get(db.collection('players'))
    ]);
    const players = wantedPlayersFrom(playersSnapshot);
    const me = players.find(player => player.name === username);
    if (!me) throw new WantedError(404, 'プレイヤーが見つかりません。');
    const target = pickWantedTarget(players);
    if (!target) throw new WantedError(409, `いまはレートが${WANTED_THRESHOLD.toLocaleString('ja-JP')}を超えている人がいないので、指名手配は遊べません。`);
    if (!canHuntWanted(me.score)) {
      throw new WantedError(403, `レートが${WANTED_THRESHOLD.toLocaleString('ja-JP')}を超えている人は指名手配を遊べません。`);
    }
    if (me.score < WANTED_FLIP_COST) {
      throw new WantedError(400, `1枚めくるにはレートが${WANTED_FLIP_COST}以上必要です (いま ${me.score})。`);
    }
    const bountyRef = wantedBountyRef(target.name);
    const bountyDoc = await transaction.get(bountyRef);

    const at = new Date().toISOString();
    const date = getJstDateKey(new Date(at));
    const record = normalizeWantedRecord(boardDoc.exists ? boardDoc.data() : null, username, randomInt);
    const bounty = normalizeBountyRecord(bountyDoc.exists ? bountyDoc.data() : null, target.name);
    const flip = flipWantedCard(record.board, rawIndex);
    const delta = wantedFlipDelta(flip);

    // レート (players は2人とも同じ一覧から読んだ値に足す)
    const hunterAfter = me.score + delta.hunter;
    const targetAfter = target.score + delta.bounty;
    const targetDoc = players.find(player => player.name === target.name).doc;
    transaction.update(me.doc.ref, { score: hunterAfter });
    transaction.update(targetDoc.ref, { score: targetAfter });

    // 増減ログ (人ごとに1件へ書き足す)
    const hunterLog = wantedLogStep(record.log, {
      at, date, beforeScore: me.score, afterScore: hunterAfter, pair: flip.pair, with: target.name
    }, () => rateHistoryDocId(username, at));
    const bountyLog = wantedLogStep(bounty.log, {
      at, date, beforeScore: target.score, afterScore: targetAfter, pair: flip.pair, hunter: username
    }, () => rateHistoryDocId(target.name, at));
    const historyEntry = (player, log, source, reason) => ({
      id: log.historyId,
      player,
      beforeScore: log.beforeScore,
      afterScore: log.afterScore,
      delta: log.afterScore - log.beforeScore,
      source,
      reason,
      actor: username,
      createdAt: log.createdAt,
      updatedAt: at
    });
    transaction.set(db.collection('point_history').doc(hunterLog.historyId),
      historyEntry(username, hunterLog, WANTED_SOURCE, wantedReason(hunterLog)));
    transaction.set(db.collection('point_history').doc(bountyLog.historyId),
      historyEntry(target.name, bountyLog, WANTED_BOUNTY_SOURCE, bountyReason(bountyLog)));

    // 盤面 (全部そろったら新しい盤面を配る) と合計
    const nextRecord = {
      ...record,
      board: flip.cleared ? newWantedBoard(randomInt) : flip.board,
      stats: {
        flips: record.stats.flips + 1,
        pairs: record.stats.pairs + (flip.pair ? 1 : 0),
        boards: record.stats.boards + (flip.cleared ? 1 : 0),
        net: record.stats.net + delta.hunter
      },
      log: hunterLog,
      updatedAt: at
    };
    const nextBounty = {
      ...bounty,
      stats: {
        flips: bounty.stats.flips + 1,
        pairs: bounty.stats.pairs + (flip.pair ? 1 : 0),
        net: bounty.stats.net + delta.bounty
      },
      log: bountyLog,
      updatedAt: at
    };
    transaction.set(boardRef, nextRecord);
    transaction.set(bountyRef, nextBounty);

    // 返す賞金首は、払ったあとの値で決め直す (1万を下回ったら null)
    const afterPlayers = players.map(player => (
      player.name === username ? { ...player, score: hunterAfter }
        : player.name === target.name ? { ...player, score: targetAfter } : player
    ));
    const nextTarget = pickWantedTarget(afterPlayers);
    return {
      ...wantedPayload({
        username,
        score: hunterAfter,
        record: nextRecord,
        target: nextTarget,
        bounty: nextTarget && nextTarget.name === target.name ? nextBounty : null
      }),
      flip: {
        index: flip.index,
        face: flip.face,
        first: flip.first,
        firstIndex: flip.first ? null : flip.firstIndex,
        firstFace: flip.first ? null : flip.firstFace,
        pair: flip.pair,
        cleared: flip.cleared,
        delta: delta.hunter,
        target: target.name
      }
    };
  });
}

/** 最近めくられた賞金首がいれば、レート推移グラフを作り直す (settleIdleCasinoSessions から呼ぶ) */
async function rebuildRateChartAfterWanted(sinceMs) {
  const snapshot = await db.collection(WANTED_BOUNTIES)
    .where('updatedAt', '>=', new Date(Date.now() - sinceMs).toISOString())
    .limit(1)
    .get();
  if (!snapshot.empty) await rebuildRateChartQuietly(WANTED_SOURCE);
}

const WANTED_ACTIONS = {
  status: ({ uid, username }) => wantedStatus(uid, username),
  flip: ({ uid, username, body }) => wantedFlip(uid, username, body.index)
};

export const wanted = onRequest({ region: 'asia-northeast1' }, async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
    return;
  }

  try {
    const decoded = await getVerifiedAuthToken(req);
    const username = decoded && decoded.username;
    if (!username) {
      res.status(401).json({ status: 'error', message: 'ログインが必要です。マイページでログインし直してください。' });
      return;
    }
    if (RATE_EXCLUDED_PLAYERS.has(username)) {
      res.status(403).json({ status: 'error', message: 'このアカウントは指名手配を利用できません。' });
      return;
    }

    const body = req.body || {};
    const action = String(body.action || 'status');
    if (!Object.hasOwn(WANTED_ACTIONS, action)) {
      throw new WantedError(400, '不明な操作です。');
    }
    const payload = await WANTED_ACTIONS[action]({ uid: decoded.uid, username, body });
    res.status(200).json({ status: 'success', ...payload });
  } catch (error) {
    if (error instanceof WantedError) {
      res.status(error.status).json({ status: 'error', message: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ status: 'error', message: `指名手配の処理に失敗しました: ${error.message}` });
  }
});

// -----------------------------------------------------------------
// AIカンカク (54.16 で入れ、55.1 で削除)。精算していない問題 (aikankaku_days の settled が false) に BET していた人へ、
// その BET を全額レートへ返す。カジノの操作の前 (このインスタンスで1回) と10分ごとの定期処理で呼ぶ。
// 返したら settled: true・refunded: true にするので、2回呼ばれても二重には返さない。
// aikankaku_days・aikankaku_players は残す (rules で読み書きとも禁止のまま)
// -----------------------------------------------------------------
const AIKANKAKU_DAYS = 'aikankaku_days';
let aikankakuRefundChecked = false;

async function refundAikankakuBets() {
  if (aikankakuRefundChecked) return;
  const snapshot = await db.collection(AIKANKAKU_DAYS).where('settled', '==', false).get();
  if (snapshot.empty) {
    aikankakuRefundChecked = true;
    return;
  }
  let refunded = 0;
  for (const doc of snapshot.docs) {
    try {
      refunded += await db.runTransaction(async transaction => {
        const dayDoc = await transaction.get(doc.ref);
        if (!dayDoc.exists || dayDoc.data().settled) return 0;
        const day = dayDoc.data();
        const entries = Object.values(day.bets || {})
          .filter(entry => entry && entry.player)
          .map(entry => {
            const picks = Object.entries(entry.picks || {})
              .map(([number, amount]) => [Number(number), Math.max(0, normalizeRate(amount))])
              .filter(([, amount]) => amount > 0)
              .sort((a, b) => a[0] - b[0]);
            return { player: String(entry.player), picks, total: picks.reduce((sum, [, amount]) => sum + amount, 0) };
          })
          .filter(entry => entry.total > 0);
        const snapshots = await Promise.all(entries.map(entry => transaction.get(playerQuery(entry.player))));
        const at = new Date().toISOString();
        let count = 0;
        entries.forEach((entry, index) => {
          if (snapshots[index].empty) {
            console.warn(`AIカンカク ${doc.id}: ${entry.player} が見つからないので BET ${entry.total} を返せませんでした`);
            return;
          }
          const playerDoc = snapshots[index].docs[0];
          const beforeScore = normalizeRate(playerDoc.data().score);
          const afterScore = beforeScore + entry.total;
          transaction.update(playerDoc.ref, { score: afterScore });
          const historyId = rateHistoryDocId(entry.player, at);
          const numbers = entry.picks.map(([number]) => number);
          transaction.set(db.collection('point_history').doc(historyId), {
            id: historyId,
            player: entry.player,
            beforeScore,
            afterScore,
            delta: entry.total,
            source: 'aikankaku',
            reason: `AIカンカク 終了のため第${day.no || '?'}問の BET を返却 (${numbers.length <= 6 ? numbers.join('・') : `${numbers.slice(0, 5).join('・')} ほか${numbers.length - 5}個`})`,
            actor: 'aikankaku_refund',
            createdAt: at
          });
          count += 1;
        });
        transaction.update(doc.ref, { settled: true, refunded: true, settledAt: at });
        return count;
      });
    } catch (error) {
      console.error(`aikankaku_days/${doc.id} の返却に失敗しました:`, error);
    }
  }
  console.log('AIカンカクの BET の返却:', refunded, '人');
  if (refunded) await rebuildRateChartQuietly('aikankaku_refund');
}

// -----------------------------------------------------------------
// レートの貸し出し (借金)
//   ルールは loan.js。誰でも借りられ、上限 (信用枠) は「日付をまたいでから返した元本」「付いた利息」「レートの変動の大きさ」で決まる。
//   借りた額はそのままレートに足し (以後は通常のレートと同じ扱い)、同じ額を借金として記録する。
//   利息は日付をまたぐたびに日次補正 (applyDailyRateReversionForToday) で付く。自動では徴収せず、自分で返すまで残る。
//   数値 (利率・基本枠・上限など) は settings/app の loan_* で変えられる (管理画面)。
//   貸し出し記録 loans/{player} は誰でも読める (ランキングとグラフに出す) が、書くのはここだけ。
// -----------------------------------------------------------------
function loanRef(username) {
  return db.collection(LOAN_COLLECTION).doc(toDocId(username));
}

async function loadLoanSettings() {
  const settingsDoc = await db.collection('settings').doc('app').get();
  return loanSettingsFrom(settingsDoc.exists ? settingsDoc.data() : {});
}

/** 次に利息が付く時刻 (日付が変わった後の日次補正。定時は 0:05 JST) */
function nextLoanInterestAt(now = new Date()) {
  const todayKey = getJstDateKey(now);
  const todayRun = Date.parse(`${todayKey}T00:05:00+09:00`);
  const next = todayRun > now.getTime() ? todayRun : todayRun + 86400000;
  return new Date(next).toISOString();
}

/**
 * 直近 volatilityDays 日の増減ログから、その人の「1日の変動の大きさ」(標準偏差) を求める。
 * player と createdAt の複合インデックスを要らなくするため、期間で絞ってから本人の分だけ拾う。
 */
async function loanVolatilityOf(username, settings) {
  const days = settings.volatilityDays;
  const dateKeys = [];
  for (let i = days - 1; i >= 0; i--) {
    dateKeys.push(getJstDateKey(new Date(Date.now() - i * 86400000)));
  }
  const since = new Date(Date.now() - (days + 1) * 86400000).toISOString();
  const snapshot = await db.collection('point_history').where('createdAt', '>=', since).get();
  const entries = [];
  snapshot.docs.forEach(doc => {
    const entry = doc.data();
    if (!entry || entry.player !== username || !entry.createdAt) return;
    const delta = Number.isFinite(Number(entry.delta))
      ? Number(entry.delta)
      : normalizeRate(entry.afterScore) - normalizeRate(entry.beforeScore);
    entries.push({
      date: getJstDateKey(new Date(String(entry.createdAt))),
      delta,
      source: String(entry.source || '')
    });
  });
  return volatilityOf(dailyDeltasFromEntries(entries, dateKeys));
}

/** 画面に返す共通の項目 (利率などの設定と、次に利息が付く時刻) */
function loanEnvelope(settings) {
  return {
    settings,
    nextInterestAt: nextLoanInterestAt(),
    now: new Date().toISOString()
  };
}

async function loanStatus(username) {
  const settings = await loadLoanSettings();
  const [loanDoc, playerSnapshot, volatility] = await Promise.all([
    loanRef(username).get(),
    playerQuery(username).get(),
    loanVolatilityOf(username, settings)
  ]);
  const loan = normalizeLoanRecord(loanDoc.exists ? loanDoc.data() : null, username);
  return {
    me: username,
    score: playerSnapshot.empty ? 0 : normalizeRate(playerSnapshot.docs[0].data().score),
    loan: publicLoanRecord(loan),
    ...computeLoanLimit(loan, volatility, settings),
    ...loanEnvelope(settings)
  };
}

/** 借りる。レートに足し、同じ額を借金に乗せる (利息は日付をまたいだときに付く) */
async function loanBorrow(username, rawAmount) {
  const settings = await loadLoanSettings();
  const volatility = await loanVolatilityOf(username, settings);
  const ref = loanRef(username);
  const result = await db.runTransaction(async transaction => {
    const [loanDoc, playerSnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(playerQuery(username))
    ]);
    if (playerSnapshot.empty) {
      throw new LoanError(404, 'プレイヤーが見つかりません。');
    }
    const loan = normalizeLoanRecord(loanDoc.exists ? loanDoc.data() : null, username);
    const limit = computeLoanLimit(loan, volatility, settings);
    const amount = validateBorrowAmount(rawAmount, limit.available);
    const at = new Date().toISOString();
    const borrowed = applyBorrow(loan, amount, at);

    const playerDoc = playerSnapshot.docs[0];
    const beforeScore = normalizeRate(playerDoc.data().score);
    const afterScore = normalizeRate(beforeScore + amount);
    transaction.update(playerDoc.ref, { score: afterScore });
    const historyId = rateHistoryDocId(username, at);
    transaction.set(db.collection('point_history').doc(historyId), {
      id: historyId,
      player: username,
      beforeScore,
      afterScore,
      delta: afterScore - beforeScore,
      source: 'loan_borrow',
      reason: `レート借入 ${amount} (借金 ${borrowed.debtAfter})`,
      debtBefore: borrowed.debtBefore,
      debtAfter: borrowed.debtAfter,
      actor: username,
      createdAt: at
    });
    transaction.set(ref, borrowed.loan);
    return {
      amount,
      score: afterScore,
      loan: publicLoanRecord(borrowed.loan),
      ...computeLoanLimit(borrowed.loan, volatility, settings)
    };
  });
  await rebuildRateChartQuietly('loan_borrow');
  return { ...result, ...loanEnvelope(settings) };
}

/** 自分で返す。手持ちのレートから引き、借金を減らす (返した元本は信用の実績になる) */
async function loanRepay(username, rawAmount) {
  const settings = await loadLoanSettings();
  const volatility = await loanVolatilityOf(username, settings);
  const ref = loanRef(username);
  const result = await db.runTransaction(async transaction => {
    const [loanDoc, playerSnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(playerQuery(username))
    ]);
    if (playerSnapshot.empty) {
      throw new LoanError(404, 'プレイヤーが見つかりません。');
    }
    const loan = normalizeLoanRecord(loanDoc.exists ? loanDoc.data() : null, username);
    const playerDoc = playerSnapshot.docs[0];
    const beforeScore = normalizeRate(playerDoc.data().score);
    const amount = validateRepayAmount(rawAmount, loan.debt, beforeScore);
    const at = new Date().toISOString();
    const repaid = applyRepay(loan, amount, at);

    const afterScore = normalizeRate(beforeScore - amount);
    transaction.update(playerDoc.ref, { score: afterScore });
    const historyId = rateHistoryDocId(username, at);
    transaction.set(db.collection('point_history').doc(historyId), {
      id: historyId,
      player: username,
      beforeScore,
      afterScore,
      delta: afterScore - beforeScore,
      source: 'loan_repay',
      reason: `借金の返済 ${amount}${repaid.debtAfter > 0 ? ` (残り ${repaid.debtAfter})` : ' (完済)'}`,
      debtBefore: repaid.debtBefore,
      debtAfter: repaid.debtAfter,
      actor: username,
      createdAt: at
    });
    transaction.set(ref, repaid.loan);
    return {
      amount,
      score: afterScore,
      loan: publicLoanRecord(repaid.loan),
      ...computeLoanLimit(repaid.loan, volatility, settings)
    };
  });
  await rebuildRateChartQuietly('loan_repay');
  return { ...result, ...loanEnvelope(settings) };
}

const LOAN_ACTIONS = {
  status: ({ username }) => loanStatus(username),
  borrow: ({ username, body }) => loanBorrow(username, body.amount),
  repay: ({ username, body }) => loanRepay(username, body.amount)
};

export const loan = onRequest({ region: 'asia-northeast1' }, async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
    return;
  }

  try {
    const decoded = await getVerifiedAuthToken(req);
    const username = decoded && decoded.username;
    if (!username) {
      res.status(401).json({ status: 'error', message: 'ログインが必要です。マイページでログインし直してください。' });
      return;
    }
    if (RATE_EXCLUDED_PLAYERS.has(username)) {
      res.status(403).json({ status: 'error', message: 'このアカウントは貸し出しを利用できません。' });
      return;
    }

    const body = req.body || {};
    const action = String(body.action || 'status');
    if (!Object.hasOwn(LOAN_ACTIONS, action)) {
      throw new LoanError(400, '不明な操作です。');
    }
    const payload = await LOAN_ACTIONS[action]({ username, body });
    res.status(200).json({ status: 'success', ...payload });
  } catch (error) {
    if (error instanceof LoanError) {
      res.status(error.status).json({ status: 'error', message: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ status: 'error', message: `貸し出しの処理に失敗しました: ${error.message}` });
  }
});

// -----------------------------------------------------------------
// カジノ (ブラックジャック・スロット・宝探し・成り上がり・航海・沈没。ルーレットとテキサスホールデムは 52.0 で廃止)
//   55.0 で持ち込み・精算を無くした。賭けはレートから直接で、賭けられるのは
//   「使えるレート = レート − 結果待ちの賭け (押さえている額)」まで (計算は casino-wallet.js)。
//   スロット・成り上がり・航海は1回ごとに、ブラックジャック・宝探し・沈没は結果が出たときに、
//   差し引き (払い戻し − 賭け) だけをレートに反映する (賭けたときはレートを動かさず、押さえておく)。
//   増減ログは同じゲームを続けているあいだ1件に書き足し (casinoLogStep)、レート推移グラフは1回ごとに
//   今日の分 (rate_chart/today) のその点だけを動かす (applyRateChartLive)。同じ回の卓の人は同じ点で動く。
//   遊んだ回数・直近の結果・まとめている途中の増減ログは casino_accounts/{uid} (Cloud Functions だけ) に置く。
//   54.x までの持ち込みの財布 (casino_sessions) が残っていたら、最初の操作で精算して消す
//   (migrateLegacyCasinoSessions。卓に置いたままの賭けは押さえている額として引き継ぐ)。
//   乱数・配当・残高はすべてここで決め、ブラウザからは賭け方と操作しか受け取らない。
//
//   ブラックジャックは全員共通の1卓 (最大4席)。ルールは blackjack.js、卓の進め方は
//   blackjack-table.js にあり、ここでは卓と財布の読み書きだけを行う。
//   卓の中身 (ディーラーの裏札を含む) は bj_tables/main に置き、誰でも読める形に直したものを
//   bj_public/main に置く。画面は bj_public を読み直して、ほかの人の操作を反映する。
//
//   スロットのルール (リールの並び・ライン・配当) は slot.js にある。
//   成り上がり (5段のルーレット) のルールは nariagari.js にある。1回ぶんを最初に最後の弾まで決めて払い戻し、
//   画面は順に回して見せる。
//
//   宝探しも全員共通の1卓。ルールは gappori.js、卓の進め方は gappori-table.js。
//   沈没も全員共通の1卓 (2人以上で出港するチキンレース)。ルールと進め方は sink-table.js。
//   卓の中身は gappori_tables/main、誰でも読める形は gappori_public/main に置く。
// -----------------------------------------------------------------
const CASINO_SESSIONS = 'casino_sessions';   // 54.x までの持ち込みの財布。55.0 で廃止 (残っていたら精算して消す)
const CASINO_ACCOUNTS = 'casino_accounts';   // 人ごとの遊んだ回数・直近の結果・まとめている途中の増減ログ
// スロットのジャックポットタイムの状態 (人ごと。Cloud Functions だけが読み書きする)
const SLOT_STATES = 'slot_states';
const CASINO_RECENT_LIMIT = 12;
const CASINO_NOTICES = 'casino_notices';     // 持ち込みの財布を精算した結果を、本人の次の画面で1回だけ見せる
const BJ_TABLE_ID = 'main';                  // ブラックジャックの卓は1つだけ
const GAPPORI_TABLE_ID = 'main';             // 宝探しの卓も1つだけ
const SINK_TABLE_ID = 'main';                // 沈没の船も1つだけ
// 口座に持つ、遊んだ回数と直近の結果の項目
const CASINO_ACCOUNT_COUNTS = ['bjHands', 'slotSpins', 'gpRounds', 'nrSpins', 'vgRolls', 'skRounds', 'wagered'];
const CASINO_ACCOUNT_RECENTS = ['bjRecent', 'slotRecent', 'gpRecent', 'nrRecent', 'vgRecent', 'skRecent'];

class CasinoError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** blackjack.js に渡す乱数 (0〜n-1) */
function casinoRandom(n) {
  return randomInt(n);
}

function playerQuery(name) {
  return db.collection('players').where('name', '==', name).limit(1);
}

function casinoAccountRef(uid) {
  return db.collection(CASINO_ACCOUNTS).doc(uid);
}

/** 口座の中身を、欠けている項目を埋めた形にする */
function normalizeCasinoAccount(value, player) {
  const source = value && typeof value === 'object' ? value : {};
  const account = { player: String(source.player || player || '') };
  CASINO_ACCOUNT_COUNTS.forEach(key => { account[key] = Math.max(0, normalizeRate(source[key])); });
  CASINO_ACCOUNT_RECENTS.forEach(key => { account[key] = Array.isArray(source[key]) ? source[key] : []; });
  account.nrLast = source.nrLast || null;
  account.logs = source.logs && typeof source.logs === 'object' ? source.logs : {};
  account.updatedAt = source.updatedAt ? String(source.updatedAt) : null;
  return account;
}

/**
 * 画面に返す財布。chips は使えるレート (レート − 押さえている額)、held は押さえている額。
 * 形は 54.x の持ち込みの財布に合わせてある (buyIn・expiresAt は無い)
 */
function publicCasinoSession(wallet, held) {
  return {
    chips: wallet.chips,
    held,
    score: wallet.chips + held,
    buyIn: null,
    bjHands: wallet.bjHands || 0,
    slotSpins: wallet.slotSpins || 0,
    gpRounds: wallet.gpRounds || 0,
    nrSpins: wallet.nrSpins || 0,
    vgRolls: wallet.vgRolls || 0,
    skRounds: wallet.skRounds || 0,
    startedAt: null,
    lastActionAt: wallet.updatedAt || null,
    expiresAt: null,
    blackjack: { recent: wallet.bjRecent || [] },
    slot: { recent: wallet.slotRecent || [] },
    gappori: { recent: wallet.gpRecent || [] },
    nariagari: {
      recent: wallet.nrRecent || [],
      // 最後の1回 (第4弾以上まで行った回を、画面を開き直したときに続きから見せるため)
      last: wallet.nrLast || null
    },
    voyage: { recent: wallet.vgRecent || [] },
    sink: { recent: wallet.skRecent || [] }
  };
}

/**
 * 54.x の精算の増減ログに残していた遊んだ内容。1種類だけならそのゲームの名前で、2種類以上なら「カジノ」でまとめる
 * (持ち込みの財布を精算するときだけ使う)
 */
function casinoPlayLog(session) {
  const plays = [
    { source: 'casino_blackjack', name: 'ブラックジャック', count: session.bjHands || 0 },
    { source: 'casino_slot', name: 'スロット', count: session.slotSpins || 0 },
    { source: 'casino_gappori', name: '宝探し', count: session.gpRounds || 0 },
    { source: 'casino_nariagari', name: '成り上がり', count: session.nrSpins || 0 },
    { source: VOYAGE_SOURCE, name: '航海', count: session.vgRolls || 0 },
    { source: 'casino_sink', name: '沈没', count: session.skRounds || 0 }
  ].filter(play => play.count > 0);
  if (plays.length === 0) return { source: 'casino', label: 'カジノ 0回' };
  if (plays.length === 1) return { source: plays[0].source, label: `${plays[0].name} ${plays[0].count}回` };
  return { source: 'casino', label: `カジノ ${plays.map(play => `${play.name}${play.count}回`).join('・')}` };
}

function blackjackTableRefs() {
  return {
    tableRef: db.collection('bj_tables').doc(BJ_TABLE_ID),
    publicRef: db.collection('bj_public').doc(BJ_TABLE_ID)
  };
}

function gapporiTableRefs() {
  return {
    tableRef: db.collection('gappori_tables').doc(GAPPORI_TABLE_ID),
    publicRef: db.collection('gappori_public').doc(GAPPORI_TABLE_ID)
  };
}

function sinkTableRefs() {
  return {
    tableRef: db.collection('sink_tables').doc(SINK_TABLE_ID),
    publicRef: db.collection('sink_public').doc(SINK_TABLE_ID)
  };
}

/** 卓の進め方が財布を触ったときに呼ぶ関数。55.0 で期限を無くしたので何もしない */
function touchCasinoWallet() {}

/**
 * 3つの卓 (押さえている額を数えるため) をトランザクションの中で読む。
 * known は読み済みの卓 ({ blackjack: 卓 } など)。無い卓は null
 */
async function readCasinoTables(transaction, known = {}) {
  const refs = {
    blackjack: blackjackTableRefs().tableRef,
    gappori: gapporiTableRefs().tableRef,
    sink: sinkTableRefs().tableRef
  };
  const games = Object.keys(refs).filter(game => !Object.hasOwn(known, game));
  const docs = games.length ? await transaction.getAll(...games.map(game => refs[game])) : [];
  const tables = { ...known };
  games.forEach((game, index) => { tables[game] = docs[index].exists ? docs[index].data() : null; });
  return tables;
}

/** 卓に関わる人の uid → 名前 (席・勝負・券・船の人と、操作した本人) */
function casinoTableNames(game, table, actorUid, actorName) {
  const names = new Map();
  const add = (uid, name) => { if (uid && name && !names.has(uid)) names.set(uid, String(name)); };
  if (game === 'blackjack') {
    (table.seats || []).forEach(seat => seat && add(seat.uid, seat.name));
    (table.round?.players || []).forEach(player => add(player.uid, player.name));
  } else if (game === 'gappori') {
    (table.tickets || []).forEach(ticket => add(ticket.uid, ticket.name));
  } else if (game === 'sink') {
    (table.players || []).forEach(player => add(player.uid, player.name));
  }
  add(actorUid, actorName);
  return names;
}

/**
 * 財布を読む (トランザクションの中)。names は uid → 名前、tables は3つの卓 (操作の前)、game はこの操作のゲーム。
 * 口座と players のレートを読み、卓に渡す財布 (口座の中身 + chips = 使えるレート) と、書き戻しに使う元の値を返す。
 * プレイヤーが見つからない人の財布は null (卓の進め方はその人へのお金を orphanPayouts に回すが、渡す先が無いので捨てる)
 */
async function readCasinoWallets(transaction, names, tables, game) {
  const uids = [...names.keys()];
  const accountDocs = uids.length ? await transaction.getAll(...uids.map(casinoAccountRef)) : [];
  const playerSnapshots = await Promise.all(uids.map((uid, index) => {
    const stored = accountDocs[index].exists ? accountDocs[index].data().player : null;
    return transaction.get(playerQuery(stored || names.get(uid)));
  }));
  const wallets = new Map();
  const origins = new Map();
  uids.forEach((uid, index) => {
    const snapshot = playerSnapshots[index];
    if (snapshot.empty) {
      wallets.set(uid, null);
      return;
    }
    const playerDoc = snapshot.docs[0];
    const name = String(playerDoc.data().name || names.get(uid));
    const account = normalizeCasinoAccount(accountDocs[index].exists ? accountDocs[index].data() : null, name);
    const score = normalizeRate(playerDoc.data().score);
    const held = casinoHeld(tables, uid);
    wallets.set(uid, { ...JSON.parse(JSON.stringify(account)), chips: score - held });
    origins.set(uid, { account, score, held, heldHere: tableHeld(game, tables[game], uid), playerRef: playerDoc.ref, name });
  });
  return { wallets, origins };
}

/**
 * 財布を書き戻す (トランザクションの中。読み込みはすべて済ませてから呼ぶ)。
 * レートの増減 = chips の増減 + この卓 (game) で押さえている額の増減 (賭けたときは 0、決着で差し引き)。
 * レートが動いたか遊んだ回数が増えたら、増減ログをまとめて書き足す。
 * 返り値: { chart (グラフに足す変化 [{ key, at, date, source, reason, player, afterScore }]), held (uid → 操作のあとの押さえている額) }
 */
function writeCasinoWallets(transaction, { wallets, origins }, game, tableAfter, nowIso) {
  const info = CASINO_LOG_GAMES[game];
  const date = getJstDateKey(new Date(nowIso));
  const chart = [];
  const heldAfter = new Map();
  origins.forEach((origin, uid) => {
    const wallet = wallets.get(uid);
    if (!wallet) return;
    const heldHereAfter = tableHeld(game, tableAfter, uid);
    const held = origin.held - origin.heldHere + heldHereAfter;
    heldAfter.set(uid, held);
    const afterScore = wallet.chips + held;
    const delta = afterScore - origin.score;
    const plays = (wallet[info.plays] || 0) - (origin.account[info.plays] || 0);
    const wagered = (wallet.wagered || 0) - (origin.account.wagered || 0);
    const { chips, ...next } = wallet;
    if (delta !== 0) transaction.update(origin.playerRef, { score: afterScore });
    if (delta !== 0 || plays > 0) {
      const log = casinoLogStep(origin.account.logs[game], {
        at: nowIso, date, beforeScore: origin.score, afterScore, plays, wagered
      }, () => rateHistoryDocId(origin.name, nowIso));
      const key = casinoChartKey(game, log);
      const reason = casinoLogReason(game, log);
      transaction.set(db.collection('point_history').doc(log.historyId), {
        id: log.historyId,
        player: origin.name,
        beforeScore: log.beforeScore,
        afterScore: log.afterScore,
        delta: log.afterScore - log.beforeScore,
        source: info.source,
        reason,
        actor: origin.name,
        chartKey: key,
        createdAt: log.createdAt,
        updatedAt: nowIso
      });
      next.logs = { ...next.logs, [game]: log };
      chart.push({ key, at: log.createdAt, date: log.date, source: info.source, game, reason, player: origin.name, afterScore });
    }
    if (JSON.stringify(next) !== JSON.stringify(origin.account)) {
      transaction.set(casinoAccountRef(uid), { ...next, player: origin.name, updatedAt: nowIso });
    }
  });
  return { chart, held: heldAfter };
}

// -----------------------------------------------------------------
// 54.x までの持ち込みの財布 (casino_sessions) の後始末
// -----------------------------------------------------------------
let legacyCasinoSessionsCleared = false;   // このインスタンスで、もう残っていないと確かめたか (55.0 からは作られない)

/**
 * 持ち込みの財布を1つ精算して消す。レートの増減 = 手元のチップ + 卓に置いたままの賭け − 持ち込み
 * (卓に置いたままの賭けは、このあと押さえている額として引き継ぎ、結果が出たときに差し引きをレートへ入れる)。
 * 遊んだ回数と直近の結果は口座へ引き継ぐ。結果は casino_notices に残し、本人が次に画面を開いたときに見せる
 */
async function settleLegacyCasinoSession(uid) {
  const sessionRef = db.collection(CASINO_SESSIONS).doc(uid);
  return db.runTransaction(async transaction => {
    const sessionDoc = await transaction.get(sessionRef);
    if (!sessionDoc.exists) return null;
    const session = sessionDoc.data();
    const tables = await readCasinoTables(transaction);
    const [playerSnapshot, accountDoc] = await Promise.all([
      transaction.get(playerQuery(session.player)),
      transaction.get(casinoAccountRef(uid))
    ]);
    const at = new Date().toISOString();
    const buyIn = normalizeRate(session.buyIn);
    const chips = normalizeRate(session.chips);
    const held = casinoHeld(tables, uid);
    let beforeScore = null;
    let afterScore = null;
    if (!playerSnapshot.empty) {
      const playerDoc = playerSnapshot.docs[0];
      beforeScore = normalizeRate(playerDoc.data().score);
      afterScore = beforeScore + chips + held - buyIn;
      if (afterScore !== beforeScore) {
        transaction.update(playerDoc.ref, { score: afterScore });
        const historyId = rateHistoryDocId(session.player, at);
        const play = casinoPlayLog(session);
        transaction.set(db.collection('point_history').doc(historyId), {
          id: historyId,
          player: session.player,
          beforeScore,
          afterScore,
          delta: afterScore - beforeScore,
          source: play.source,
          reason: `${play.label} (持込${buyIn} → ${chips}${held ? `・卓の賭け ${held} は引き継ぎ` : ''}。55.0 で持ち込みを無くしたので精算)`,
          actor: 'casino_v55',
          createdAt: at
        });
      }
    }
    if (!accountDoc.exists) {
      const account = normalizeCasinoAccount(session, session.player);
      transaction.set(casinoAccountRef(uid), { ...account, logs: {}, updatedAt: at });
    }
    transaction.delete(sessionRef);
    const settled = {
      player: session.player,
      buyIn,
      chips,
      held,
      beforeScore,
      afterScore,
      delta: beforeScore === null ? 0 : afterScore - beforeScore,
      auto: true,
      reason: 'v55'
    };
    transaction.set(db.collection(CASINO_NOTICES).doc(uid), { settled, createdAt: at });
    return settled;
  });
}

/** 持ち込みの財布が残っていれば、すべて精算して消す (カジノの操作の前と定期処理で呼ぶ) */
async function migrateLegacyCasinoSessions() {
  if (legacyCasinoSessionsCleared) return;
  const snapshot = await db.collection(CASINO_SESSIONS).limit(50).get();
  if (snapshot.empty) {
    legacyCasinoSessionsCleared = true;
    return;
  }
  let changed = false;
  for (const doc of snapshot.docs) {
    try {
      const settled = await settleLegacyCasinoSession(doc.id);
      if (settled && settled.delta !== 0) changed = true;
    } catch (error) {
      console.error(`casino_sessions/${doc.id} の精算 (55.0 の移行) に失敗しました:`, error);
    }
  }
  if (changed) await rebuildRateChartQuietly('casino_v55_settle');
}

/** 持ち込みの財布を精算した結果が残っていれば、1回だけ取り出す */
async function takeCasinoNotice(uid) {
  const noticeRef = db.collection(CASINO_NOTICES).doc(uid);
  const noticeDoc = await noticeRef.get();
  if (!noticeDoc.exists) return null;
  await noticeRef.delete();
  return noticeDoc.data().settled || null;
}

/** いまの財布 (トランザクションの外で読む。画面を開いたとき用) */
async function readCasinoSession(uid, username) {
  const [accountDoc, playerSnapshot, bjDoc, gpDoc, skDoc] = await Promise.all([
    casinoAccountRef(uid).get(),
    playerQuery(username).get(),
    blackjackTableRefs().tableRef.get(),
    gapporiTableRefs().tableRef.get(),
    sinkTableRefs().tableRef.get()
  ]);
  const score = playerSnapshot.empty ? 0 : normalizeRate(playerSnapshot.docs[0].data().score);
  const tables = {
    blackjack: bjDoc.exists ? bjDoc.data() : null,
    gappori: gpDoc.exists ? gpDoc.data() : null,
    sink: skDoc.exists ? skDoc.data() : null
  };
  const held = casinoHeld(tables, uid);
  const account = normalizeCasinoAccount(accountDoc.exists ? accountDoc.data() : null, username);
  return { score, session: publicCasinoSession({ ...account, chips: score - held }, held) };
}

async function readPublicBlackjackTable() {
  const publicDoc = await blackjackTableRefs().publicRef.get();
  return publicDoc.exists ? publicDoc.data() : publicTable(emptyTable());
}

/**
 * 宝探しの卓 (誰でも読める形)。まだ卓が無いか、ルールを変える前の盤面のままなら、
 * 卓を動かして (作るか、受付中で券が無ければ新しい作り方の盤面にして) から返す
 */
async function readPublicGapporiTable() {
  const publicDoc = await gapporiTableRefs().publicRef.get();
  if (publicDoc.exists && publicDoc.data().rulesVersion === GAPPORI_RULES_VERSION) return publicDoc.data();
  const ctx = await runGapporiTable(null, () => {});
  return publicGapporiTable(ctx.table);
}

async function casinoStatus(uid, username) {
  const [wallet, table, gappori, autoSettled, slotStateDoc, voyage, sink] = await Promise.all([
    readCasinoSession(uid, username),
    readPublicBlackjackTable(),
    readPublicGapporiTable(),
    takeCasinoNotice(uid),
    db.collection(SLOT_STATES).doc(uid).get(),
    readVoyageStatus(uid),
    readSinkStatus(uid)
  ]);
  return {
    me: username,
    score: wallet.score,
    session: wallet.session,
    slot: publicSlotState(slotStateDoc.exists ? slotStateDoc.data() : null),
    table,
    gappori,
    voyage,
    sink: sink.sink,
    sinkMine: sink.sinkMine,
    sinkSea: sink.sinkSea,
    autoSettled,
    now: new Date().toISOString()
  };
}

/**
 * 1人で1回ずつ遊ぶゲーム (スロット・成り上がり・航海) の1回。トランザクションの中で
 * 3つの卓 (押さえている額のため)・財布・extraRefs を読み、play(wallet, extraDocs) で財布を書き換えてから書き戻す。
 * play は { result, ...そのほか返したいもの } を返し、ほかの書き込みは write(transaction, played) で行う
 */
async function runSoloCasinoPlay(game, uid, username, { extraRefs = [], play, write = () => {} }) {
  const done = await db.runTransaction(async transaction => {
    const tables = await readCasinoTables(transaction);
    const extraDocs = extraRefs.length ? await transaction.getAll(...extraRefs) : [];
    const loaded = await readCasinoWallets(transaction, new Map([[uid, username]]), tables, game);
    const wallet = loaded.wallets.get(uid);
    if (!wallet) throw new CasinoError(404, 'プレイヤーが見つかりません。');
    const nowIso = new Date().toISOString();
    const played = play(wallet, extraDocs, nowIso);
    write(transaction, played, nowIso);
    const written = writeCasinoWallets(transaction, loaded, game, null, nowIso);
    return { played, wallet, held: written.held.get(uid) || 0, chart: written.chart };
  });
  await applyRateChartLive(done.chart);
  return { ...done.played, session: publicCasinoSession(done.wallet, done.held) };
}

/**
 * スロットを1回まわす。bet は5本のラインすべてにかかる賭け金。
 * ジャックポットタイム中は賭け金が固定なので、送られてきた bet は使わない (ルールは slot.js)
 */
async function casinoSlotSpin(uid, username, rawBet) {
  const requestedBet = Number(rawBet);
  const slotStateRef = db.collection(SLOT_STATES).doc(uid);
  const spun = await runSoloCasinoPlay('slot', uid, username, {
    extraRefs: [slotStateRef],
    play: (wallet, [slotStateDoc], now) => {
      const slotState = normalizeSlotState(slotStateDoc.exists ? slotStateDoc.data() : null);
      if (slotState.mode === 'normal') {
        if (!Number.isSafeInteger(requestedBet) || requestedBet < 1) {
          throw new CasinoError(400, '賭け金は1以上の整数にしてください。');
        }
        if (requestedBet > wallet.chips) {
          throw new CasinoError(400, `使えるレート (${wallet.chips}) を超えて賭けることはできません。`);
        }
      } else if (wallet.chips < 1) {
        throw new CasinoError(400, `使えるレート (${wallet.chips}) が足りません。`);
      }
      const round = playSlotRound(slotState, requestedBet, wallet.chips, casinoRandom);
      const outcome = round.outcome;
      // 直近の一覧には、いちばん高い当たりの絵柄だけ残す
      const best = outcome.lines.reduce((top, line) => (!top || line.multiplier > top.multiplier ? line : top), null);
      const summary = {
        bet: round.bet,
        returned: outcome.returned,
        multiplier: outcome.multiplier,
        symbol: best ? best.symbol : null,
        mode: outcome.mode,
        at: now
      };
      wallet.chips = wallet.chips - round.bet + outcome.returned;
      wallet.slotSpins = (wallet.slotSpins || 0) + 1;
      wallet.wagered = (wallet.wagered || 0) + round.bet;
      wallet.slotRecent = [summary, ...(wallet.slotRecent || [])].slice(0, CASINO_RECENT_LIMIT);
      return { result: { ...outcome, at: now, entered: round.entered, finished: round.finished }, state: round.state };
    },
    write: (transaction, played, now) => transaction.set(slotStateRef, { ...played.state, updatedAt: now })
  });
  return { result: spun.result, session: spun.session, slot: publicSlotState(spun.state) };
}

/**
 * 成り上がりを1回まわす。bet は NARIAGARI_BETS のどれか、layout は画面が見せている第1弾の並び
 * (中身と並べ方が正しければそのまま使う。止まるマスはここで等確率に決めるので、並びを選べても有利にはならない)。
 * 最後の弾まで決めて払い戻しまで済ませ、画面は返した stages を順に回して見せる。
 */
async function casinoNariagariSpin(uid, username, rawBet, rawLayout) {
  const bet = Number(rawBet);
  if (!NARIAGARI_BETS.includes(bet)) {
    throw new CasinoError(400, `賭け金は ${NARIAGARI_BETS.join('・')} のどれかにしてください。`);
  }
  const layout = Array.isArray(rawLayout) ? rawLayout.map(String) : null;
  const spun = await runSoloCasinoPlay('nariagari', uid, username, {
    play: (wallet, _docs, now) => {
      if (bet > wallet.chips) {
        throw new CasinoError(400, `使えるレート (${wallet.chips}) を超えて賭けることはできません。`);
      }
      const play = playNariagari(bet, casinoRandom, layout);
      const id = `${Date.now().toString(36)}${randomInt(36 ** 4).toString(36)}`;
      const last = { id, bet, ...play, at: now };
      const summary = { bet, returned: play.payout, multiplier: play.multiplier, top: play.top, at: now };
      wallet.chips = wallet.chips - bet + play.payout;
      wallet.nrSpins = (wallet.nrSpins || 0) + 1;
      wallet.wagered = (wallet.wagered || 0) + bet;
      wallet.nrRecent = [summary, ...(wallet.nrRecent || [])].slice(0, CASINO_RECENT_LIMIT);
      wallet.nrLast = last;
      return { result: last };
    }
  });
  return { result: spun.result, session: spun.session };
}

/** 卓の進め方がお金を返そうとした相手のプレイヤーが見つからないとき (消されたなど)。渡す先が無いので記録だけ残す */
function warnCasinoOrphans(game, payouts) {
  if (payouts.length) console.warn(`${game}: プレイヤーが見つからず渡せなかった払い戻し:`, JSON.stringify(payouts));
}

/**
 * 卓を1回動かす。卓・ほかの2つの卓 (押さえている額のため)・卓に関わる人 (と操作した本人) の財布を
 * トランザクションで読み、mutate(ctx) で書き換えたあと、全員が賭けていれば配ってから書き戻す。
 * レートは決着した人だけ差し引きで動く (賭けただけでは動かない)
 */
async function runBlackjackTable(actorUid, mutate, actorName = null) {
  const { tableRef, publicRef } = blackjackTableRefs();
  const done = await db.runTransaction(async transaction => {
    const tableDoc = await transaction.get(tableRef);
    const table = tableDoc.exists ? tableDoc.data() : emptyTable();
    const tables = await readCasinoTables(transaction, { blackjack: table });
    const loaded = await readCasinoWallets(transaction, casinoTableNames('blackjack', table, actorUid, actorName), tables, 'blackjack');
    const context = createTableContext({
      table,
      wallets: loaded.wallets,
      now: Date.now(),
      randomInt: casinoRandom,
      touchWallet: touchCasinoWallet
    });
    sweepSeats(context);
    mutate(context);
    maybeStartRound(context);

    if (context.changed) {
      context.table.seq = (context.table.seq || 0) + 1;
      context.table.updatedAt = context.nowIso;
      transaction.set(tableRef, context.table);
      transaction.set(publicRef, publicTable(context.table));
    }
    const written = writeCasinoWallets(transaction, loaded, 'blackjack', context.table, context.nowIso);
    return { context, written };
  });
  warnCasinoOrphans('blackjack', done.context.orphanPayouts);
  await applyRateChartLive(done.written.chart);
  return { ...done.context, heldAfter: done.written.held };
}

/** 卓の操作の返事: 卓の様子と本人の財布 */
async function blackjackTableAction(uid, username, mutate) {
  const ctx = await runBlackjackTable(uid, mutate, username);
  const wallet = ctx.wallets.get(uid);
  return {
    me: username,
    table: publicTable(ctx.table),
    session: wallet ? publicCasinoSession(wallet, ctx.heldAfter.get(uid) || 0) : null,
    now: new Date().toISOString()
  };
}

/**
 * 宝探しの卓を1回動かす。ブラックジャックと同じく、卓・ほかの2つの卓・券を買った人 (と操作した本人) の財布を
 * トランザクションで読み、mutate(ctx) で書き換えたあと、締め切りを過ぎた段階を先へ進めて書き戻す。
 * レートは結果が出た回の人だけ差し引きで動く (券を買っただけでは動かない)
 */
async function runGapporiTable(actorUid, mutate, actorName = null) {
  const { tableRef, publicRef } = gapporiTableRefs();
  const done = await db.runTransaction(async transaction => {
    const tableDoc = await transaction.get(tableRef);
    const table = tableDoc.exists ? tableDoc.data() : emptyGapporiTable(casinoRandom);
    const tables = await readCasinoTables(transaction, { gappori: tableDoc.exists ? table : null });
    const loaded = await readCasinoWallets(transaction, casinoTableNames('gappori', table, actorUid, actorName), tables, 'gappori');
    const context = createGapporiContext({
      table,
      wallets: loaded.wallets,
      now: Date.now(),
      randomInt: casinoRandom,
      touchWallet: touchCasinoWallet
    });
    if (!tableDoc.exists) context.changed = true;
    refreshGapporiRules(context);
    mutate(context);
    advanceGapporiTable(context);

    if (context.changed) {
      context.table.seq = (context.table.seq || 0) + 1;
      context.table.updatedAt = context.nowIso;
      transaction.set(tableRef, context.table);
      transaction.set(publicRef, publicGapporiTable(context.table));
    }
    const written = writeCasinoWallets(transaction, loaded, 'gappori', context.table, context.nowIso);
    return { context, written };
  });
  warnCasinoOrphans('gappori', done.context.orphanPayouts);
  await applyRateChartLive(done.written.chart);
  return { ...done.context, heldAfter: done.written.held };
}

// -----------------------------------------------------------------
// 沈没 (全員共通の1卓のチキンレース)。ルールと卓の進め方は sink-table.js。
//   卓の中身 (沈む時刻・誰が飛び降りたか) は sink_tables/main (Cloud Functions だけ)、
//   誰でも読める形は sink_public/main に置く。飛び降りたときは公開の写しを書き直さない
//   (書き直すと seq の変化で誰かが飛び降りたことがわかってしまうため)。
//   画面は航海のあいだ skTick を送り続け、沈む時刻を過ぎたらその場で結果を出す。
//   skTick の返事には、いまの浸水 (水位と、いまの区間の速さ) だけを入れる (sinkSeaState)。
//   運賃は押さえておき、結果が出たとき (と、降りた・片付けたときに戻すとき) に差し引きでレートを動かす。
// -----------------------------------------------------------------
async function runSinkTable(actorUid, mutate, actorName = null) {
  const { tableRef, publicRef } = sinkTableRefs();
  const done = await db.runTransaction(async transaction => {
    const tableDoc = await transaction.get(tableRef);
    const table = tableDoc.exists ? tableDoc.data() : emptySinkTable();
    const tables = await readCasinoTables(transaction, { sink: tableDoc.exists ? table : null });
    const loaded = await readCasinoWallets(transaction, casinoTableNames('sink', table, actorUid, actorName), tables, 'sink');
    const context = createSinkContext({ table, wallets: loaded.wallets, now: Date.now(), randomInt: casinoRandom, touchWallet: touchCasinoWallet });
    if (!tableDoc.exists) {
      context.changed = true;
      context.publicChanged = true;
    }
    // 沈む時刻を過ぎていれば、操作より先に沈める (沈んだあとの「飛び降りる」は受け付けない)
    advanceSinkTable(context);
    mutate(context);
    advanceSinkTable(context);

    if (context.changed) {
      if (context.publicChanged) context.table.seq = (context.table.seq || 0) + 1;
      context.table.updatedAt = context.nowIso;
      transaction.set(tableRef, context.table);
      if (context.publicChanged) transaction.set(publicRef, publicSinkTable(context.table));
    }
    const written = writeCasinoWallets(transaction, loaded, 'sink', context.table, context.nowIso);
    return { context, written };
  });
  warnCasinoOrphans('sink', done.context.orphanPayouts);
  await applyRateChartLive(done.written.chart);
  return { ...done.context, heldAfter: done.written.held };
}

/** 沈没の操作の返事: 船の様子と、本人の分 (乗っているか・飛び降りた時刻) と財布 */
async function sinkTableAction(uid, username, mutate) {
  const ctx = await runSinkTable(uid, mutate, username);
  const wallet = ctx.wallets.get(uid);
  return {
    me: username,
    sink: publicSinkTable(ctx.table),
    sinkMine: sinkMine(ctx.table, uid),
    sinkSea: sinkSeaState(ctx.table, Date.now()),
    session: wallet ? publicCasinoSession(wallet, ctx.heldAfter.get(uid) || 0) : null,
    now: new Date().toISOString()
  };
}

/** 画面を開いたときの船の様子と本人の分 (船がまだ無ければ作る) */
async function readSinkStatus(uid) {
  const tableDoc = await sinkTableRefs().tableRef.get();
  if (!tableDoc.exists) {
    const ctx = await runSinkTable(null, () => {});
    return { sink: publicSinkTable(ctx.table), sinkMine: sinkMine(ctx.table, uid), sinkSea: sinkSeaState(ctx.table, Date.now()) };
  }
  return { sink: publicSinkTable(tableDoc.data()), sinkMine: sinkMine(tableDoc.data(), uid), sinkSea: sinkSeaState(tableDoc.data(), Date.now()) };
}

/** 宝探しの操作の返事: 卓の様子と本人の財布 */
async function gapporiTableAction(uid, username, mutate) {
  const ctx = await runGapporiTable(uid, mutate, username);
  const wallet = ctx.wallets.get(uid);
  return {
    me: username,
    gappori: publicGapporiTable(ctx.table),
    session: wallet ? publicCasinoSession(wallet, ctx.heldAfter.get(uid) || 0) : null,
    now: new Date().toISOString()
  };
}

// -----------------------------------------------------------------
// 宝探しのジャックポット (管理画面から見る・書き換える。管理者だけ)
//   書き換えは卓のトランザクション (runGapporiTable) の中で行い、公開の写しも同時に直す。
//   抽選の途中でも書き換えられ、その回の船長チャンスには書き換えたあとの額が使われる。
//   最後に書き換えた内容は卓の jackpotAdjust に残す (公開の写しには出さない)。
// -----------------------------------------------------------------
const GAPPORI_JACKPOT_ADMIN_MAX = 100000000;

class GapporiAdminError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function gapporiJackpotInfo(table) {
  return {
    jackpot: Math.floor(Number(table.jackpot) || 0),
    jackpotRate: GAPPORI_JACKPOT_RATE,   // JP ルーレットで JP が出る確率 (1/16)
    phase: table.phase || null,
    roundNo: table.roundNo || 0,
    lastAdjust: table.jackpotAdjust || null
  };
}

async function gapporiAdminStatus() {
  const { tableRef } = gapporiTableRefs();
  const doc = await tableRef.get();
  return gapporiJackpotInfo(doc.exists ? doc.data() : { jackpot: 0 });
}

async function gapporiAdminSetJackpot(rawAmount, actor) {
  const amount = Number(rawAmount);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > GAPPORI_JACKPOT_ADMIN_MAX) {
    throw new GapporiAdminError(400, `ジャックポットは 0〜${GAPPORI_JACKPOT_ADMIN_MAX.toLocaleString('ja-JP')} の整数で入力してください。`);
  }
  let before = 0;
  const ctx = await runGapporiTable(null, context => {
    before = Math.floor(Number(context.table.jackpot) || 0);
    context.table.jackpot = amount;
    context.table.jackpotAdjust = { before, after: amount, by: actor, at: context.nowIso };
    context.changed = true;
  });
  console.log('gappori jackpot set:', JSON.stringify({ before, after: amount, by: actor }));
  return { before, ...gapporiJackpotInfo(ctx.table) };
}

export const gapporiAdmin = onRequest({ region: 'asia-northeast1' }, async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
    return;
  }

  try {
    const decoded = await getVerifiedAuthToken(req);
    if (!decoded || decoded.admin !== true) {
      res.status(403).json({ status: 'error', message: '管理者としてログインしてください。' });
      return;
    }
    const body = req.body || {};
    const action = String(body.action || 'status');
    let payload;
    if (action === 'status') payload = await gapporiAdminStatus();
    else if (action === 'setJackpot') payload = await gapporiAdminSetJackpot(body.amount, String(decoded.username || 'admin'));
    else throw new GapporiAdminError(400, '不明な操作です。');
    res.status(200).json({ status: 'success', ...payload });
  } catch (error) {
    if (error instanceof GapporiAdminError) {
      res.status(error.status).json({ status: 'error', message: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ status: 'error', message: `宝探しのジャックポットの処理に失敗しました: ${error.message}` });
  }
});

// -----------------------------------------------------------------
// 航海 (大海賊の航海日誌)。ルールは voyage.js。2026/10/5 〜 12/21 の期間限定。
//   みんなで共有する分 (ジャックポット・最終秘宝・直近の JP) は voyage_public/main (誰でも読める)、
//   人ごとの分 (位置・周回・航海した金額) は voyage_players/{uid} (Cloud Functions だけ) に置く。
//   賭け金は 10 で固定。最終秘宝は周回 (港を通って1周した数) の比で分ける (取り分は画面に出さない)。
//   チップはほかのゲームと共通の財布 (casino_sessions)。1回ぶん (出目・止まるマス・払い戻し) はここで決めて
//   払い戻しまで済ませ、画面はそれを順に見せる。航海の通知 (JP・章の始まり・山分け) は送らない。
//   最終秘宝は 12/22 0:10 (JST) のスケジュール (finalizeVoyageTreasure) で、周回の数の比でレートへ直接配る。
// -----------------------------------------------------------------
const VOYAGE_PUBLIC = 'voyage_public';
const VOYAGE_PLAYERS = 'voyage_players';
const VOYAGE_DOC_ID = 'main';
const VOYAGE_JP_HISTORY_LIMIT = 10;

function voyageRefs(uid = null) {
  return {
    publicRef: db.collection(VOYAGE_PUBLIC).doc(VOYAGE_DOC_ID),
    playerRef: uid ? db.collection(VOYAGE_PLAYERS).doc(uid) : null
  };
}

function emptyVoyagePublic(nowIso) {
  return {
    rulesVersion: VOYAGE_RULES_VERSION,
    seq: 0,
    jpCents: 0,          // ジャックポットの貯まった分 (1/100 単位。額は土台 VOYAGE_JP_BASE を足した voyageJpAmount)
    treasureCents: 0,    // 最終秘宝の貯まった分 (同上。額は voyageTreasureAmount)。山分けは周回の数の比 (取り分は公開しないので、合計もここには置かない)
    jp: voyageJpAmount(0),               // 画面が直接読む額 (土台込み)。振るたびに書き直す
    treasure: voyageTreasureAmount(0),   // 同上。山分けを済ませたら 0
    rolls: 0,
    wagered: 0,
    players: 0,
    lastJp: null,
    jpHistory: [],
    final: null,         // 山分けを済ませたら { at, treasure, total, winners }
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

function emptyVoyagePlayer(uid, player, nowIso) {
  // laps は港を通って1周した数。lapDebt は押し戻されて港より手前へ戻った回数 (次に港を通っても周回に数えない分)
  return { uid, player, pos: 0, laps: 0, lapDebt: 0, rolls: 0, wagered: 0, jpWon: 0, bestWin: 0, last: null, createdAt: nowIso, updatedAt: nowIso };
}

/** みんなで共有する分を画面へ返す形 */
function publicVoyageState(data) {
  const state = data || emptyVoyagePublic(new Date().toISOString());
  return {
    jp: voyageJpAmount(state.jpCents),
    treasure: state.final ? 0 : voyageTreasureAmount(state.treasureCents),
    rolls: state.rolls || 0,
    wagered: state.wagered || 0,
    players: state.players || 0,
    lastJp: state.lastJp || null,
    jpHistory: state.jpHistory || [],
    final: state.final || null,
    updatedAt: state.updatedAt || null
  };
}

/** 本人の分を画面へ返す形 (uid は含めない) */
function publicVoyagePlayer(data) {
  if (!data) return null;
  // 取り分 (全員の周回の合計に対する割合) は公開しない
  return {
    pos: data.pos || 0,
    rolls: data.rolls || 0,
    wagered: data.wagered || 0,
    laps: voyageLapCount(data.laps),
    jpWon: data.jpWon || 0,
    bestWin: data.bestWin || 0,
    last: data.last || null
  };
}

/** 期間と章の情報 */
function voyageTimeInfo(now = Date.now()) {
  return {
    now: new Date(now).toISOString(),
    started: isVoyageStarted(now),
    over: isVoyageOver(now),
    start: VOYAGE_START,
    end: VOYAGE_END,
    finalAt: VOYAGE_FINAL_AT,
    chapter: publicVoyageChapter(voyageChapterAt(now)),
    // 全部の章 (盤面を含む。管理者が章を指定して試すときと、航海日誌の一覧に使う)
    chapters: VOYAGE_CHAPTERS.map(publicVoyageChapter)
  };
}

/** 航海の様子 (status と、画面を開いたときに読む) */
async function readVoyageStatus(uid) {
  const { publicRef, playerRef } = voyageRefs(uid);
  const [publicDoc, playerDoc] = await Promise.all([publicRef.get(), playerRef.get()]);
  return {
    ...voyageTimeInfo(),
    state: publicVoyageState(publicDoc.exists ? publicDoc.data() : null),
    me: publicVoyagePlayer(playerDoc.exists ? playerDoc.data() : null)
  };
}

/**
 * 航海を1回振る。bet は VOYAGE_BET (10) で固定。章は日付どおり。
 * 出目・止まるマス・払い戻し・JP はここで決め、ジャックポットと最終秘宝に賭け金の一部を貯め、
 * 港を通って1周したら周回を数える。罰のマス (loss) で払い戻しがマイナスなら、手元から引く (0 より下にはしない)
 */
async function casinoVoyageRoll(uid, username, rawBet) {
  const bet = Number(rawBet);
  if (!VOYAGE_BETS.includes(bet)) {
    throw new CasinoError(400, `航海の賭け金は ${VOYAGE_BET} で固定です。`);
  }
  const now = Date.now();
  if (!isVoyageStarted(now)) throw new CasinoError(400, '航海は 10/5 (月) 0:00 に始まります。');
  if (isVoyageOver(now)) throw new CasinoError(400, '航海は 12/21 で終わりました。最終秘宝の山分けをお待ちください。');
  const chapter = voyageChapterAt(now);
  const { publicRef, playerRef } = voyageRefs(uid);

  const rolled = await runSoloCasinoPlay('voyage', uid, username, {
    extraRefs: [publicRef, playerRef],
    play: (wallet, [publicDoc, playerDoc], nowIso) => {
      if (bet > wallet.chips) {
        throw new CasinoError(400, `使えるレート (${wallet.chips}) を超えて賭けることはできません。`);
      }
      const state = publicDoc.exists ? publicDoc.data() : emptyVoyagePublic(nowIso);
      if (state.final) throw new CasinoError(400, '航海は終わり、最終秘宝は山分け済みです。');
      const isNewPlayer = !playerDoc.exists;
      const player = isNewPlayer ? emptyVoyagePlayer(uid, username, nowIso) : playerDoc.data();

      const play = playVoyage({ chapter, bet, pos: player.pos || 0, jp: voyageJpAmount(state.jpCents), lapDebt: player.lapDebt || 0, randomInt: casinoRandom });
      const id = `${Date.now().toString(36)}${randomInt(36 ** 4).toString(36)}`;

      // 貯める分と JP の払い出し (当たったら貯まった分を払い、0 から貯め直す)
      state.jpCents = (state.jpCents || 0) + bet * VOYAGE_JP_RATE;
      state.treasureCents = (state.treasureCents || 0) + bet * VOYAGE_TREASURE_RATE;
      if (play.jpHit) state.jpCents = voyageJpCentsAfterWin(state.jpCents, play.jpWon);
      state.jp = voyageJpAmount(state.jpCents);
      state.treasure = voyageTreasureAmount(state.treasureCents);

      // 周回 (港を通って1周するたびに1つ)
      const laps = voyageLapCount(player.laps) + play.laps;
      const wagered = (player.wagered || 0) + bet;

      const last = { id, bet, chapter: chapter.no, dice: play.dice, from: player.pos || 0, pos: play.pos, newLaps: play.laps, laps, payout: play.payout, multiplier: play.multiplier, jpHit: play.jpHit, jpWon: play.jpWon, at: nowIso };
      const nextPlayer = {
        ...player,
        player: username,
        pos: play.pos,
        laps,
        lapDebt: play.lapDebt,
        rolls: (player.rolls || 0) + 1,
        wagered,
        jpWon: (player.jpWon || 0) + play.jpWon,
        bestWin: Math.max(player.bestWin || 0, play.payout),
        last,
        updatedAt: nowIso
      };
      state.rolls = (state.rolls || 0) + 1;
      state.wagered = (state.wagered || 0) + bet;
      if (isNewPlayer) state.players = (state.players || 0) + 1;
      if (play.jpHit) {
        state.lastJp = { player: username, amount: play.jpWon, chapter: chapter.no, at: nowIso };
        state.jpHistory = [state.lastJp, ...(state.jpHistory || [])].slice(0, VOYAGE_JP_HISTORY_LIMIT);
      }
      state.seq = (state.seq || 0) + 1;
      state.updatedAt = nowIso;

      const summary = { bet, returned: play.payout, multiplier: play.multiplier, dice: play.dice, square: play.moves[play.moves.length - 1].square, jp: play.jpHit, at: nowIso };
      wallet.chips = wallet.chips - bet + play.payout;
      wallet.vgRolls = (wallet.vgRolls || 0) + 1;
      wallet.wagered = (wallet.wagered || 0) + bet;
      wallet.vgRecent = [summary, ...(wallet.vgRecent || [])].slice(0, CASINO_RECENT_LIMIT);
      return {
        result: { id, bet, chapter: chapter.no, ...play, lapsTotal: laps, at: nowIso },
        state,
        player: nextPlayer
      };
    },
    write: (transaction, played) => {
      transaction.set(publicRef, played.state);
      transaction.set(playerRef, played.player);
    }
  });

  const voyage = { ...voyageTimeInfo(), state: publicVoyageState(rolled.state), me: publicVoyagePlayer(rolled.player) };
  return { result: rolled.result, session: rolled.session, voyage };
}

/**
 * 最終秘宝を取り分の比で全員に配る (12/22 0:10 のスケジュール finalizeVoyageTreasure)。
 * 期間が終わる前は配らない。配った分はレートへ直接足し、増減ログに残す。
 * 済んでいれば (final があれば) 何もしない
 */
async function finalizeVoyage() {
  const now = Date.now();
  if (!isVoyageOver(now)) throw new CasinoError(400, '航海はまだ終わっていません (12/22 0:00 以降に配れます)。');
  const { publicRef } = voyageRefs();
  const publicDoc = await publicRef.get();
  if (!publicDoc.exists) return { final: null, skipped: 'no-state' };
  if (publicDoc.data().final) return { final: publicDoc.data().final, skipped: 'done' };
  const treasure = voyageTreasureAmount(publicDoc.data().treasureCents);
  const snapshot = await db.collection(VOYAGE_PLAYERS).get();
  const split = splitVoyageTreasure(snapshot.docs.map(doc => doc.data()), treasure);
  const at = new Date().toISOString();

  // 1人ずつレートへ足す (全員ぶんを1つのトランザクションに入れると大きくなりすぎるため)
  const paid = [];
  for (const winner of split.winners) {
    try {
      await db.runTransaction(async transaction => {
        const playerSnapshot = await transaction.get(playerQuery(winner.player));
        if (playerSnapshot.empty) return;
        const playerDoc = playerSnapshot.docs[0];
        const beforeScore = normalizeRate(playerDoc.data().score);
        const afterScore = beforeScore + winner.amount;
        transaction.update(playerDoc.ref, { score: afterScore });
        const historyId = rateHistoryDocId(winner.player, at);
        transaction.set(db.collection('point_history').doc(historyId), {
          id: historyId,
          player: winner.player,
          beforeScore,
          afterScore,
          delta: winner.amount,
          source: VOYAGE_SOURCE,
          reason: `大海賊の秘宝 山分け (${winner.laps.toLocaleString('ja-JP')}周)`,
          actor: 'voyage_final',
          createdAt: at
        });
      });
      paid.push({ player: winner.player, amount: winner.amount, laps: winner.laps });
    } catch (error) {
      console.error(`航海の最終秘宝を ${winner.player} へ配れませんでした:`, error);
    }
  }
  const final = { at, treasure, total: split.total, paid: paid.reduce((sum, entry) => sum + entry.amount, 0), count: paid.length, winners: paid };
  await publicRef.set({
    final,
    treasureCents: 0,
    treasure: 0,
    seq: (publicDoc.data().seq || 0) + 1,
    updatedAt: at
  }, { merge: true });

  if (paid.length) await rebuildRateChartQuietly('voyage_final');
  console.log('voyage final:', JSON.stringify({ treasure, total: split.total, count: paid.length, paid: final.paid }));
  return { final };
}

const CASINO_ACTIONS = {
  status: ({ uid, username }) => casinoStatus(uid, username),
  // 持ち込み・精算は 55.0 で無くした (開いたままの古い画面から呼ばれたときは読み込み直してもらう)
  enter: () => { throw new CasinoError(410, '55.0 で持ち込みは無くなりました (レートからそのまま賭けられます)。画面を読み込み直してください。'); },
  settle: () => { throw new CasinoError(410, '55.0 で精算は無くなりました (結果はそのままレートに入ります)。画面を読み込み直してください。'); },
  slotSpin: ({ uid, username, body }) => casinoSlotSpin(uid, username, body.bet),
  nrSpin: ({ uid, username, body }) => casinoNariagariSpin(uid, username, body.bet, body.layout),
  vgStatus: ({ uid }) => readVoyageStatus(uid).then(voyage => ({ voyage })),
  vgRoll: ({ uid, username, body }) => casinoVoyageRoll(uid, username, body.bet),
  bjJoin: ({ uid, username, body }) => blackjackTableAction(uid, username, ctx => joinSeat(ctx, uid, username, body.seat)),
  bjLeave: ({ uid, username }) => blackjackTableAction(uid, username, ctx => leaveSeat(ctx, uid)),
  bjBet: ({ uid, username, body }) => blackjackTableAction(uid, username, ctx => placeBet(ctx, uid, body.amount, body.squeeze)),
  bjMove: ({ uid, username, body }) => blackjackTableAction(uid, username, ctx => moveTurn(ctx, uid, body.move, body.seq)),
  bjOpen: ({ uid, username, body }) => blackjackTableAction(uid, username, ctx => openCards(ctx, uid, body.no, body.hands)),
  bjTick: ({ uid, username }) => blackjackTableAction(uid, username, tickTable),
  // tickets: [{ picks, units }] をまとめて買う (古い画面の { picks, units } 1枚も受け付ける)
  gpBuy: ({ uid, username, body }) => gapporiTableAction(uid, username, ctx => buyGapporiTickets(
    ctx, uid, username, Array.isArray(body.tickets) ? body.tickets : [{ picks: body.picks, units: body.units }]
  )),
  gpChance: ({ uid, username, body }) => gapporiTableAction(uid, username, ctx => chooseGapporiChance(ctx, uid, body.ticket, body.kind)),
  gpStart: ({ uid, username }) => gapporiTableAction(uid, username, ctx => startGapporiNow(ctx, uid)),
  gpTick: ({ uid, username }) => gapporiTableAction(uid, username, () => {}),
  skBoard: ({ uid, username, body }) => sinkTableAction(uid, username, ctx => boardSink(ctx, uid, username, body.fare)),
  skLeave: ({ uid, username }) => sinkTableAction(uid, username, ctx => leaveSink(ctx, uid)),
  skReady: ({ uid, username }) => sinkTableAction(uid, username, ctx => readySink(ctx, uid)),
  skJump: ({ uid, username }) => sinkTableAction(uid, username, ctx => jumpSink(ctx, uid)),
  skTick: ({ uid, username }) => sinkTableAction(uid, username, () => {})
};

async function handleCasinoRequest(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
    return;
  }

  try {
    const decoded = await getVerifiedAuthToken(req);
    const username = decoded && decoded.username;
    if (!username) {
      res.status(401).json({ status: 'error', message: 'ログインが必要です。マイページでログインし直してください。' });
      return;
    }
    if (RATE_EXCLUDED_PLAYERS.has(username)) {
      res.status(403).json({ status: 'error', message: 'このアカウントはカジノを利用できません。' });
      return;
    }

    const body = req.body || {};
    const action = String(body.action || 'status');
    if (!Object.hasOwn(CASINO_ACTIONS, action)) {
      throw new CasinoError(400, '不明な操作です。');
    }
    // 54.x の持ち込みの財布が残っていれば、操作より先に精算して消す (卓の賭けを二重に数えないため)
    await migrateLegacyCasinoSessions();
    await refundAikankakuBets();
    const payload = await CASINO_ACTIONS[action]({ uid: decoded.uid, username, body, admin: Boolean(decoded.admin) });
    res.status(200).json({ status: 'success', ...payload });
  } catch (error) {
    if (error instanceof CasinoError || error instanceof TableError || error instanceof GapporiTableError || error instanceof GapporiRuleError
      || error instanceof SinkTableError) {
      res.status(error.status).json({ status: 'error', message: error.message });
      return;
    }
    if (error instanceof BlackjackRuleError) {
      res.status(409).json({ status: 'error', message: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ status: 'error', message: `カジノの処理に失敗しました: ${error.message}` });
  }
}

export const casino = onRequest({ region: 'asia-northeast1' }, handleCasinoRequest);

// 45.x のゲーム画面 (ルーレットのみ) が呼んでいた入口。名前はそのころのまま (ルーレットは 52.0 で廃止)。
// 更新前から開いたままのタブでも精算できるよう、同じ処理のまま残している
export const casinoRoulette = onRequest({ region: 'asia-northeast1' }, handleCasinoRequest);

// 10分ごと。ブラックジャック・宝探し・沈没の卓が、誰も画面を開いていないまま時間切れで止まっていれば先へ進める。
// 指名手配でこの10分にめくられた賞金首がいれば、レート推移グラフもここで作り直す。AIカンカク (55.1 で削除) の残りの BET も返す。
// 関数名は 54.x (持ち込みの財布の自動精算) のまま (変えると Cloud Scheduler のジョブが作り直されるため)
export const settleIdleCasinoSessions = onSchedule({
  region: 'asia-northeast1',
  schedule: 'every 10 minutes',
  timeZone: 'Asia/Tokyo'
}, async () => {
  try {
    // 54.x の持ち込みの財布が残っていれば精算して消す (55.0 からは作られない)。卓を進めるより先に (卓の賭けを二重に数えないため)
    legacyCasinoSessionsCleared = false;
    await migrateLegacyCasinoSessions();
  } catch (error) {
    console.error('持ち込みの財布の精算 (55.0 の移行) に失敗しました:', error);
  }
  try {
    await runBlackjackTable(null, tickTable);
  } catch (error) {
    console.error('ブラックジャックの卓の時間切れ処理に失敗しました:', error);
  }
  try {
    await runGapporiTable(null, () => {});
  } catch (error) {
    console.error('宝探しの卓の時間切れ処理に失敗しました:', error);
  }
  try {
    await runSinkTable(null, () => {});
  } catch (error) {
    console.error('沈没の船の時間切れ処理に失敗しました:', error);
  }
  try {
    await rebuildRateChartAfterWanted(10 * 60 * 1000);
  } catch (error) {
    console.error('指名手配のあとのレート推移グラフの作り直しに失敗しました:', error);
  }
  try {
    // AIカンカク (55.1 で削除) の精算していない BET が残っていれば返す
    aikankakuRefundChecked = false;
    await refundAikankakuBets();
  } catch (error) {
    console.error('AIカンカクの BET の返却に失敗しました:', error);
  }
});

// 航海の最終秘宝を 12/22 0:10 (JST) に山分けする (期間 2026/10/5〜12/21)。済んでいれば何もしない。
export const finalizeVoyageTreasure = onSchedule({
  region: 'asia-northeast1',
  schedule: '10 0 22 12 *',
  timeZone: 'Asia/Tokyo'
}, async () => {
  try {
    const result = await finalizeVoyage();
    console.log('finalizeVoyageTreasure:', JSON.stringify({ skipped: result.skipped || null, count: result.final?.count ?? null }));
  } catch (error) {
    console.error('航海の最終秘宝の山分けに失敗しました:', error);
  }
});

// 学食のメニュー (大学のサイトの PDF) を中継する。大学のサイトは CORS のヘッダーを返さないので、
// ホームの画面 (PDF.js で絵にして横幅いっぱいに出す) はここから読む。毎回取り直し、画面側で10分だけ使い回させる
const CAFETERIA_MENU_PDF_URL = 'https://www.cit-s.com/wp/wp-content/themes/cit/syokudo/t.pdf';
const CAFETERIA_MENU_MAX_BYTES = 15 * 1024 * 1024;

export const cafeteriaMenu = onRequest({ region: 'asia-northeast1' }, async (req, res) => {
  setCors(req, res);
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
    return;
  }
  try {
    const response = await fetch(`${CAFETERIA_MENU_PDF_URL}?t=${Date.now()}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`大学のサイトが ${response.status} を返しました`);
    const body = Buffer.from(await response.arrayBuffer());
    if (!String(response.headers.get('content-type') || '').includes('pdf') || body.length > CAFETERIA_MENU_MAX_BYTES) {
      throw new Error('メニューの PDF ではありませんでした');
    }
    res.set('Content-Type', 'application/pdf');
    res.set('Cache-Control', 'public, max-age=600');
    res.status(200).send(body);
  } catch (error) {
    console.error('学食のメニューの取得に失敗しました:', error);
    res.status(502).json({ status: 'error', message: `学食のメニューを取得できませんでした: ${error.message}` });
  }
});

export const qjongLogin = onRequest({ region: 'asia-northeast1' }, async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
    return;
  }

  try {
    const { username, password } = req.body || {};
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '');

    if (!cleanUsername || !cleanPassword) {
      res.status(400).json({ status: 'error', message: 'ユーザー名とパスワードを入力してください。' });
      return;
    }

    const snapshot = await db.collection('players').where('name', '==', cleanUsername).limit(1).get();
    if (snapshot.empty) {
      res.status(401).json({ status: 'error', message: 'ユーザー名またはパスワードが違います。' });
      return;
    }

    const playerDoc = snapshot.docs[0];
    const player = playerDoc.data();
    const storedPassword = await getStoredPassword(playerDoc, player);
    if (storedPassword !== cleanPassword) {
      res.status(401).json({ status: 'error', message: 'ユーザー名またはパスワードが違います。' });
      return;
    }

    const isAdmin = cleanUsername === MASTER_USERNAME;
    const uid = authUidFromUsername(cleanUsername);
    const token = await admin.auth().createCustomToken(uid, {
      username: cleanUsername,
      admin: isAdmin
    });

    res.status(200).json({
      status: 'success',
      token,
      user: {
        name: player.name,
        score: player.score || 0,
        status: player.status || 'none',
        admin: isAdmin
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'error', message: `Firebase認証エラー: ${error.message}` });
  }
});

export const syncManabaNow = onRequest({ region: 'asia-northeast1' }, async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
    return;
  }

  try {
    const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) {
      res.status(401).json({ status: 'error', message: '認証が必要です。' });
      return;
    }
    const decoded = await admin.auth().verifyIdToken(token);
    const credentialDoc = await db.collection('manaba_credentials').doc(decoded.uid).get();
    if (!credentialDoc.exists) {
      res.status(404).json({ status: 'error', message: 'manaba認証情報が保存されていません。' });
      return;
    }

    const result = await syncManabaCredentialDoc(credentialDoc);
    if (result.status === 'error') {
      res.status(502).json({ status: 'error', message: result.message });
      return;
    }
    res.status(200).json({ status: 'success', count: result.count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});
