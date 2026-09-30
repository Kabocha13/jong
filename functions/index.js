import { randomInt } from 'node:crypto';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { BlackjackRuleError } from './blackjack.js';
import { normalizeSlotState, playSlotRound, publicSlotState } from './slot.js';
import { HoldemRuleError } from './holdem.js';
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
  HoldemTableError,
  createHoldemContext,
  emptyHoldemTable,
  holdemSeatIndexOf,
  holdemTableUids,
  isInLiveHoldemRound,
  joinHoldemSeat,
  leaveHoldemSeat,
  maybeStartHoldemHand,
  moveHoldemTurn,
  publicHoldemTable,
  setHoldemSitOut,
  sweepHoldemSeats,
  tickHoldemTable,
  vacateHoldemSeat
} from './holdem-table.js';
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
  let current = null;
  all.forEach(entry => {
    const time = Date.parse(entry.createdAt);
    const delta = entry.afterScore - entry.beforeScore;
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
      reason: String(entry.reason || '')
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
      return { at: event.at, source: event.source, reason: event.reason, rates: { ...state }, debts: { ...debtState } };
    });
  });

  const payload = {
    days,
    players: Array.from(currentRates.keys()),
    updatedAt: new Date().toISOString()
  };
  await db.collection(RATE_CHART_COLLECTION).doc(RATE_CHART_DOC).set(payload);
  return payload;
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

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      webpush: {
        fcmOptions: { link },
        notification: { icon: '/assets/icon.png', tag }
      }
    });
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
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: `📚 締切が近い課題が${targets.length}件あります`,
        body: buildDeadlineReminderBody(targets)
      },
      webpush: {
        fcmOptions: { link: APP_URL },
        notification: {
          icon: '/assets/icon.png',
          tag: 'manaba-deadline-reminder'
        }
      }
    });

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
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: '📋 出席の時間です',
        body: `${slot.name}（${room}教室）`
      },
      webpush: {
        fcmOptions: { link: `${ATTENDANCE_URL_BASE}${room}` },
        notification: {
          icon: '/assets/icon.png',
          tag: `attendance-${todayKey}-${slot.start}`
        }
      }
    });

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
 * players.score をそのまま書くと、読み込んだあとに入った変化 (ルーレットの精算、
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
//   積荷は1回ぶん (既定20個) ずつ渡し、答えをまとめて受け取って採点する。続けるときは次の積荷も一緒に返す。
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

/** 仕分けを始める。途中の積荷があれば捨てて新しく渡す */
async function undergroundStartShipment(username, settings) {
  const at = new Date().toISOString();
  const state = await db.runTransaction(async transaction => {
    const current = await readUndergroundState(transaction, username);
    if (!canWorkUnderground(current.score, settings)) {
      throw new UndergroundError(403, `船底で仕分けできるのはレートが${settings.maxRate}未満の人だけです。`);
    }
    const record = { ...current.record, shipment: newShipment(settings, at), updatedAt: at };
    transaction.set(current.ref, record);
    return { ...current, record };
  });
  return undergroundPayload(state, settings);
}

/**
 * 仕分けの答えを受け取って採点し、その場でレートを動かす (上限まで)。
 * body.next が true で、まだ上限に届いていなければ、次の積荷も一緒に渡す
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
      const record = { ...current.record, shipment: null, updatedAt: at };
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
    const next = body.next && canWorkUnderground(moved.afterScore, settings) ? newShipment(settings, at) : null;
    const record = applyShipmentResult(current.record, result, moved, at, next);
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
// カジノ (ルーレット・ブラックジャック・スロット)
//   入場時に持ち込むレートを決め、以降の勝ち負けは casino_sessions のチップだけで動かす。
//   チップは1人1つで、どのゲームでも使える
//   (持ち込みは1回ぶんしか持てないので、同じレートを二重に持ち込めない)。
//   players のレートに反映するのは精算の1回だけなので、レート推移グラフには
//   スピンや勝負ごとではなく「精算1回 = 1変動」として出る。
//   負けたまま精算せずに離れても、最後の操作から CASINO_IDLE_SETTLE_MS か
//   入場から CASINO_MAX_SESSION_MS を過ぎたセッションは settleIdleCasinoSessions が
//   自動で精算する。チップが 0 になったときもその場で精算する。
//   乱数・配当・残高はすべてここで決め、ブラウザからは賭け方と操作しか受け取らない。
//
//   ブラックジャックは全員共通の1卓 (最大4席)。ルールは blackjack.js、卓の進め方は
//   blackjack-table.js にあり、ここでは卓と財布の読み書きだけを行う。
//   卓の中身 (ディーラーの裏札を含む) は bj_tables/main に置き、誰でも読める形に直したものを
//   bj_public/main に置く。画面は bj_public を読み直して、ほかの人の操作を反映する。
//
//   スロットのルール (リールの並び・ライン・配当) は slot.js にある。
//
//   ホールデムも全員共通の1卓 (6席)。人がいない席には船員 (holdem-bots.js) が入るので1人でも遊べる。
//   ルールは holdem.js、卓の進め方は holdem-table.js。卓の中身 (全員の手札を含む) は holdem_tables/main、
//   誰でも読める形は holdem_public/main、本人の手札は holdem_hole/{uid} (本人だけが読める) に置く。
// -----------------------------------------------------------------
const CASINO_SESSIONS = 'casino_sessions';
// スロットのジャックポットタイムの状態 (人ごと。カジノを精算しても引き継ぐ。Cloud Functions だけが読み書きする)
const SLOT_STATES = 'slot_states';
const CASINO_GAMES = new Set(['roulette', 'blackjack', 'slot', 'holdem']);
const CASINO_IDLE_SETTLE_MS = 30 * 60 * 1000;
const CASINO_MAX_SESSION_MS = 3 * 60 * 60 * 1000;
const CASINO_RECENT_LIMIT = 12;
const CASINO_MAX_BETS_PER_SPIN = 60;
const CASINO_NOTICES = 'casino_notices';     // 自動精算の結果を、本人の次の画面で1回だけ見せる
const BJ_TABLE_ID = 'main';                  // ブラックジャックの卓は1つだけ
const HOLDEM_TABLE_ID = 'main';              // ホールデムの卓も1つだけ

// シングルゼロ (0〜36) のヨーロピアンルーレット。配当は賭け金に対する倍率 (元金は別に戻る)
const ROULETTE_RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const ROULETTE_BET_TYPES = {
  straight: { payout: 35, values: [0, 36], wins: (n, v) => n === v },
  dozen:    { payout: 2,  values: [1, 3],  wins: (n, v) => n !== 0 && Math.ceil(n / 12) === v },
  column:   { payout: 2,  values: [1, 3],  wins: (n, v) => n !== 0 && ((n - 1) % 3) + 1 === v },
  // ×2 の賭け (赤黒・偶奇・前後半) は、0 が出たら賭け金の半分を返す (halfBackOnZero)。
  // 賭け金が奇数のときの 0.5 の端数は、半々の確率で切り上げか切り捨て (平均するとちょうど半分)
  red:     { payout: 1, halfBackOnZero: true, wins: n => ROULETTE_RED_NUMBERS.has(n) },
  black:    { payout: 1, halfBackOnZero: true, wins: n => n !== 0 && !ROULETTE_RED_NUMBERS.has(n) },
  even:     { payout: 1, halfBackOnZero: true, wins: n => n !== 0 && n % 2 === 0 },
  odd:      { payout: 1, halfBackOnZero: true, wins: n => n % 2 === 1 },
  low:      { payout: 1, halfBackOnZero: true, wins: n => n >= 1 && n <= 18 },
  high:     { payout: 1, halfBackOnZero: true, wins: n => n >= 19 }
};

/** ルーレットの1つの賭けの払い戻し (賭け金込み) */
function rouletteReturn(rule, bet, number) {
  if (rule.wins(number, bet.value)) return bet.amount * (rule.payout + 1);
  if (number === 0 && rule.halfBackOnZero) {
    const half = Math.floor(bet.amount / 2);
    return bet.amount % 2 === 1 && randomInt(2) === 1 ? half + 1 : half;
  }
  return 0;
}

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

function rouletteColor(number) {
  if (number === 0) return 'green';
  return ROULETTE_RED_NUMBERS.has(number) ? 'red' : 'black';
}

/** ブラウザから来た賭けを検証し、同じ賭け先はまとめて返す */
function normalizeRouletteBets(rawBets) {
  if (!Array.isArray(rawBets) || rawBets.length === 0) {
    throw new CasinoError(400, '賭け先を選んでください。');
  }
  if (rawBets.length > CASINO_MAX_BETS_PER_SPIN) {
    throw new CasinoError(400, `1回に賭けられるのは${CASINO_MAX_BETS_PER_SPIN}か所までです。`);
  }

  const merged = new Map();
  rawBets.forEach(raw => {
    const type = String(raw?.type || '');
    const rule = Object.hasOwn(ROULETTE_BET_TYPES, type) ? ROULETTE_BET_TYPES[type] : null;
    const amount = Number(raw?.amount);
    if (!rule || !Number.isSafeInteger(amount) || amount < 1) {
      throw new CasinoError(400, '賭け方が正しくありません。');
    }
    let value = null;
    if (rule.values) {
      value = Number(raw.value);
      if (!Number.isInteger(value) || value < rule.values[0] || value > rule.values[1]) {
        throw new CasinoError(400, '賭け方が正しくありません。');
      }
    }
    const key = `${type}:${value ?? ''}`;
    const current = merged.get(key);
    merged.set(key, { type, value, amount: (current ? current.amount : 0) + amount });
  });
  return Array.from(merged.values());
}

function casinoSessionExpiresAt(startedAt, lastActionAt) {
  return new Date(Math.min(
    Date.parse(lastActionAt) + CASINO_IDLE_SETTLE_MS,
    Date.parse(startedAt) + CASINO_MAX_SESSION_MS
  )).toISOString();
}

function isCasinoSessionExpired(session, now = Date.now()) {
  return Date.parse(session.expiresAt) <= now;
}

function publicCasinoSession(session) {
  return {
    game: session.game,
    buyIn: session.buyIn,
    chips: session.chips,
    spins: session.spins,
    bjHands: session.bjHands || 0,
    slotSpins: session.slotSpins || 0,
    hdHands: session.hdHands || 0,
    startedAt: session.startedAt,
    lastActionAt: session.lastActionAt,
    expiresAt: session.expiresAt,
    recent: session.recent || [],
    blackjack: {
      recent: session.bjRecent || []
    },
    slot: {
      recent: session.slotRecent || []
    },
    holdem: {
      recent: session.hdRecent || []
    }
  };
}

function playerQuery(name) {
  return db.collection('players').where('name', '==', name).limit(1);
}

/**
 * 増減ログに残す遊んだ内容。1種類だけならそのゲームの名前で、2種類以上なら「カジノ」でまとめる。
 * 何も遊んでいないときは以前と同じくルーレット扱い
 */
function casinoPlayLog(session) {
  const plays = [
    { source: 'casino_roulette', name: 'ルーレット', count: session.spins || 0 },
    { source: 'casino_blackjack', name: 'ブラックジャック', count: session.bjHands || 0 },
    { source: 'casino_slot', name: 'スロット', count: session.slotSpins || 0 },
    { source: 'casino_holdem', name: 'ホールデム', count: session.hdHands || 0 }
  ].filter(play => play.count > 0);
  if (plays.length === 0) return { source: 'casino_roulette', label: 'ルーレット 0回' };
  if (plays.length === 1) return { source: plays[0].source, label: `${plays[0].name} ${plays[0].count}回` };
  return { source: 'casino', label: `カジノ ${plays.map(play => `${play.name}${play.count}回`).join('・')}` };
}

function blackjackTableRefs() {
  return {
    tableRef: db.collection('bj_tables').doc(BJ_TABLE_ID),
    publicRef: db.collection('bj_public').doc(BJ_TABLE_ID)
  };
}

function holdemTableRefs() {
  return {
    tableRef: db.collection('holdem_tables').doc(HOLDEM_TABLE_ID),
    publicRef: db.collection('holdem_public').doc(HOLDEM_TABLE_ID)
  };
}

function holdemHoleRef(uid) {
  return db.collection('holdem_hole').doc(uid);
}

/** 財布の最終操作時刻と自動精算の期限を進める (卓での賭けや払い戻しでも伸びる) */
function touchCasinoSession(session, nowIso) {
  session.lastActionAt = nowIso;
  session.expiresAt = casinoSessionExpiresAt(session.startedAt, nowIso);
}

/**
 * セッションを閉じて、持ち込みとの差を players のレートに1回で反映する。
 * 既に精算済み (ドキュメントが無い) なら null。自動精算と手動精算が重なっても二重には反映しない。
 * ブラックジャックの卓に座っていれば席を空け、置いていた賭け金は戻してから精算する。
 * 勝負の途中なら、手動 (manual) の精算は断り、自動の精算では決着まで席を残す
 * (決着したときの払い戻しは、財布が無いのでレートへ直接返る)。
 * 自動で精算したときは結果を casino_notices に残し、本人が次に画面を開いたときに見せる。
 */
async function settleCasinoSession(uid, actor, { manual = false, reason = null } = {}) {
  const sessionRef = db.collection(CASINO_SESSIONS).doc(uid);
  const { tableRef, publicRef } = blackjackTableRefs();
  const holdemRefs = holdemTableRefs();
  const result = await db.runTransaction(async transaction => {
    const [sessionDoc, tableDoc, holdemDoc] = await transaction.getAll(sessionRef, tableRef, holdemRefs.tableRef);
    if (!sessionDoc.exists) return null;
    const session = sessionDoc.data();
    const at = new Date().toISOString();
    const table = tableDoc.exists ? tableDoc.data() : null;
    const seatIndex = table ? seatIndexOf(table, uid) : -1;
    let tableChanged = false;
    if (table && isInLiveRound(table, uid)) {
      if (manual) {
        throw new CasinoError(409, 'ブラックジャックの勝負が途中です。決着してから精算してください。');
      }
    } else if (seatIndex >= 0) {
      session.chips += table.seats[seatIndex].bet || 0;
      vacateSeat(table, seatIndex);
      tableChanged = true;
    }
    // ホールデムの席も同じ。ハンドに残っている間は手動の精算を断り、自動なら決着まで席を残す
    const holdemTable = holdemDoc.exists ? holdemDoc.data() : null;
    const holdemSeat = holdemTable ? holdemSeatIndexOf(holdemTable, uid) : -1;
    let holdemChanged = false;
    if (holdemTable && isInLiveHoldemRound(holdemTable, uid)) {
      if (manual) {
        throw new CasinoError(409, 'ホールデムのハンドが途中です。降りるか決着してから精算してください。');
      }
    } else if (holdemSeat >= 0) {
      vacateHoldemSeat(holdemTable, holdemSeat);
      holdemChanged = true;
    }
    const playerSnapshot = await transaction.get(playerQuery(session.player));

    const buyIn = normalizeRate(session.buyIn);
    const chips = normalizeRate(session.chips);
    let beforeScore = null;
    let afterScore = null;
    if (!playerSnapshot.empty) {
      const playerDoc = playerSnapshot.docs[0];
      beforeScore = normalizeRate(playerDoc.data().score);
      afterScore = normalizeRate(beforeScore + chips - buyIn);
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
          reason: `${play.label} (持込${buyIn} → ${chips})`,
          actor,
          createdAt: at
        });
      }
    }
    if (tableChanged) {
      table.seq = (table.seq || 0) + 1;
      table.updatedAt = at;
      transaction.set(tableRef, table);
      transaction.set(publicRef, publicTable(table));
    }
    if (holdemChanged) {
      holdemTable.seq = (holdemTable.seq || 0) + 1;
      holdemTable.updatedAt = at;
      transaction.set(holdemRefs.tableRef, holdemTable);
      transaction.set(holdemRefs.publicRef, publicHoldemTable(holdemTable));
    }
    transaction.delete(sessionRef);
    const settled = {
      player: session.player,
      buyIn,
      chips,
      spins: session.spins || 0,
      bjHands: session.bjHands || 0,
      slotSpins: session.slotSpins || 0,
      hdHands: session.hdHands || 0,
      beforeScore,
      afterScore,
      delta: beforeScore === null ? 0 : afterScore - beforeScore,
      auto: actor !== session.player,
      reason
    };
    if (settled.auto) {
      transaction.set(db.collection(CASINO_NOTICES).doc(uid), { settled, createdAt: at });
    }
    return settled;
  });

  if (result && result.delta !== 0) {
    await rebuildRateChartQuietly('casino_settle');
  }
  return result;
}

/** 期限切れのセッションが残っていれば、この場で精算して結果を返す */
async function settleCasinoSessionIfExpired(uid) {
  const sessionDoc = await db.collection(CASINO_SESSIONS).doc(uid).get();
  if (!sessionDoc.exists || !isCasinoSessionExpired(sessionDoc.data())) return null;
  return settleCasinoSession(uid, 'casino_auto_settle');
}

/** 自動精算の結果が残っていれば、1回だけ取り出す */
async function takeCasinoNotice(uid) {
  const noticeRef = db.collection(CASINO_NOTICES).doc(uid);
  const noticeDoc = await noticeRef.get();
  if (!noticeDoc.exists) return null;
  await noticeRef.delete();
  return noticeDoc.data().settled || null;
}

async function readPublicBlackjackTable() {
  const publicDoc = await blackjackTableRefs().publicRef.get();
  return publicDoc.exists ? publicDoc.data() : publicTable(emptyTable());
}

async function readPublicHoldemTable() {
  const publicDoc = await holdemTableRefs().publicRef.get();
  return publicDoc.exists ? publicDoc.data() : publicHoldemTable(emptyHoldemTable(casinoRandom));
}

/** 本人に配られている手札 (いまのハンドのものだけ) */
async function readHoldemHole(uid) {
  const holeDoc = await holdemHoleRef(uid).get();
  return holeDoc.exists ? holeDoc.data() : null;
}

async function casinoStatus(uid, username) {
  await settleCasinoSessionIfExpired(uid);
  const [sessionDoc, playerSnapshot, table, holdemTable, hole, autoSettled, slotStateDoc] = await Promise.all([
    db.collection(CASINO_SESSIONS).doc(uid).get(),
    playerQuery(username).get(),
    readPublicBlackjackTable(),
    readPublicHoldemTable(),
    readHoldemHole(uid),
    takeCasinoNotice(uid),
    db.collection(SLOT_STATES).doc(uid).get()
  ]);
  return {
    me: username,
    score: playerSnapshot.empty ? 0 : normalizeRate(playerSnapshot.docs[0].data().score),
    session: sessionDoc.exists ? publicCasinoSession(sessionDoc.data()) : null,
    slot: publicSlotState(slotStateDoc.exists ? slotStateDoc.data() : null),
    table,
    holdemTable,
    hole,
    autoSettled,
    now: new Date().toISOString()
  };
}

async function casinoEnter(uid, username, rawBuyIn, rawGame) {
  const buyIn = Number(rawBuyIn);
  if (!Number.isSafeInteger(buyIn) || buyIn < 1) {
    throw new CasinoError(400, '持ち込むレートは1以上の整数で入力してください。');
  }
  // どのテーブルから入場したか (記録用。チップはどちらのテーブルでも使える)
  const game = CASINO_GAMES.has(rawGame) ? rawGame : 'roulette';
  await settleCasinoSessionIfExpired(uid);
  const autoSettled = await takeCasinoNotice(uid);
  const sessionRef = db.collection(CASINO_SESSIONS).doc(uid);

  const session = await db.runTransaction(async transaction => {
    const [sessionDoc, playerSnapshot] = await Promise.all([
      transaction.get(sessionRef),
      transaction.get(playerQuery(username))
    ]);
    if (sessionDoc.exists) {
      throw new CasinoError(409, '入場中のテーブルがあります。先に精算してください。');
    }
    if (playerSnapshot.empty) {
      throw new CasinoError(404, 'プレイヤーが見つかりません。');
    }
    const score = normalizeRate(playerSnapshot.docs[0].data().score);
    if (buyIn > score) {
      throw new CasinoError(400, `持ち込めるのは現在のレート (${score}) までです。`);
    }

    const now = new Date().toISOString();
    const next = {
      game,
      player: username,
      buyIn,
      chips: buyIn,
      spins: 0,
      bjHands: 0,
      slotSpins: 0,
      hdHands: 0,
      wagered: 0,
      startedAt: now,
      lastActionAt: now,
      expiresAt: casinoSessionExpiresAt(now, now),
      recent: [],
      bjRecent: [],
      slotRecent: [],
      hdRecent: []
    };
    transaction.set(sessionRef, next);
    return next;
  });

  return { session: publicCasinoSession(session), autoSettled };
}

async function casinoSpin(uid, rawBets) {
  const bets = normalizeRouletteBets(rawBets);
  const total = bets.reduce((sum, bet) => sum + bet.amount, 0);
  const sessionRef = db.collection(CASINO_SESSIONS).doc(uid);

  const spun = await db.runTransaction(async transaction => {
    const sessionDoc = await transaction.get(sessionRef);
    if (!sessionDoc.exists) {
      throw new CasinoError(409, 'テーブルに入場していません。');
    }
    const session = sessionDoc.data();
    if (isCasinoSessionExpired(session)) return { expired: true };
    if (total > session.chips) {
      throw new CasinoError(400, `手元のチップ (${session.chips}) を超えて賭けることはできません。`);
    }

    const number = randomInt(0, 37);
    const returned = bets.reduce((sum, bet) => sum + rouletteReturn(ROULETTE_BET_TYPES[bet.type], bet, number), 0);
    const now = new Date().toISOString();
    const chips = session.chips - total + returned;
    const result = { number, color: rouletteColor(number), bet: total, returned, at: now };
    const next = {
      ...session,
      chips,
      spins: session.spins + 1,
      wagered: (session.wagered || 0) + total,
      lastActionAt: now,
      expiresAt: casinoSessionExpiresAt(session.startedAt, now),
      recent: [result, ...(session.recent || [])].slice(0, CASINO_RECENT_LIMIT)
    };
    transaction.set(sessionRef, next);
    return { result, session: next };
  });

  if (spun.expired) {
    const settled = await settleCasinoSession(uid, 'casino_auto_settle');
    return { expired: true, settled };
  }
  // チップが尽きたら続けようがないので、その場で精算する
  if (spun.session.chips <= 0) {
    const settled = await settleCasinoSession(uid, spun.session.player);
    return { result: spun.result, session: null, settled };
  }
  return { result: spun.result, session: publicCasinoSession(spun.session) };
}

/**
 * スロットを1回まわす。bet は5本のラインすべてにかかる賭け金。
 * ジャックポットタイム中は賭け金が固定なので、送られてきた bet は使わない (ルールは slot.js)
 */
async function casinoSlotSpin(uid, rawBet) {
  const requestedBet = Number(rawBet);
  const sessionRef = db.collection(CASINO_SESSIONS).doc(uid);
  const slotStateRef = db.collection(SLOT_STATES).doc(uid);

  const spun = await db.runTransaction(async transaction => {
    const [sessionDoc, slotStateDoc] = await Promise.all([
      transaction.get(sessionRef),
      transaction.get(slotStateRef)
    ]);
    if (!sessionDoc.exists) {
      throw new CasinoError(409, 'テーブルに入場していません。');
    }
    const session = sessionDoc.data();
    if (isCasinoSessionExpired(session)) return { expired: true };
    const slotState = normalizeSlotState(slotStateDoc.exists ? slotStateDoc.data() : null);
    if (slotState.mode === 'normal') {
      if (!Number.isSafeInteger(requestedBet) || requestedBet < 1) {
        throw new CasinoError(400, '賭け金は1以上の整数にしてください。');
      }
      if (requestedBet > session.chips) {
        throw new CasinoError(400, `手元のチップ (${session.chips}) を超えて賭けることはできません。`);
      }
    }

    const now = new Date().toISOString();
    const round = playSlotRound(slotState, requestedBet, session.chips, casinoRandom);
    const outcome = round.outcome;
    const result = { ...outcome, at: now, entered: round.entered, finished: round.finished };
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
    const next = {
      ...session,
      chips: session.chips - round.bet + outcome.returned,
      slotSpins: (session.slotSpins || 0) + 1,
      wagered: (session.wagered || 0) + round.bet,
      lastActionAt: now,
      expiresAt: casinoSessionExpiresAt(session.startedAt, now),
      slotRecent: [summary, ...(session.slotRecent || [])].slice(0, CASINO_RECENT_LIMIT)
    };
    transaction.set(sessionRef, next);
    transaction.set(slotStateRef, { ...round.state, updatedAt: now });
    return { result, session: next, slot: round.state };
  });

  if (spun.expired) {
    const settled = await settleCasinoSession(uid, 'casino_auto_settle');
    return { expired: true, settled };
  }
  const slot = publicSlotState(spun.slot);
  // チップが尽きたら続けようがないので、その場で精算する (ブラックジャックの席に置いた賭けがあれば精算で戻る)
  if (spun.session.chips <= 0) {
    const settled = await settleCasinoSession(uid, spun.session.player, { reason: 'broke' });
    return { result: spun.result, session: null, settled, slot };
  }
  return { result: spun.result, session: publicCasinoSession(spun.session), slot };
}

/** 財布を精算したあとの人へ返すぶんを、人ごとにまとめる */
function groupOrphanPayouts(payouts) {
  const byName = new Map();
  payouts.forEach(payout => {
    const current = byName.get(payout.name);
    if (current) current.amount += payout.amount;
    else byName.set(payout.name, { ...payout });
  });
  return Array.from(byName.values());
}

/** 財布を精算済みの人の賭け金の返却・払い戻しは、レートへ直接返す */
function creditBlackjackOrphan(transaction, playerSnapshot, payout, at, game = 'blackjack') {
  if (playerSnapshot.empty) return;
  const playerDoc = playerSnapshot.docs[0];
  const beforeScore = normalizeRate(playerDoc.data().score);
  const afterScore = beforeScore + payout.amount;
  transaction.update(playerDoc.ref, { score: afterScore });
  const historyId = rateHistoryDocId(payout.name, at);
  const label = game === 'holdem' ? 'ホールデム' : 'ブラックジャック';
  transaction.set(db.collection('point_history').doc(historyId), {
    id: historyId,
    player: payout.name,
    beforeScore,
    afterScore,
    delta: payout.amount,
    source: game === 'holdem' ? 'casino_holdem' : 'casino_blackjack',
    reason: payout.reason === 'refund'
      ? `${label} 精算後の賭け金の返却 (${payout.amount})`
      : `${label} 精算後の払い戻し (${payout.amount})`,
    actor: 'casino_auto_settle',
    createdAt: at
  });
}

/**
 * 卓を1回動かす。卓と、卓に関わる人 (と操作した本人) の財布をトランザクションで読み、
 * mutate(ctx) で書き換えたあと、全員が賭けていれば配ってから書き戻す。
 * 決着してチップが尽きた人は、書き戻したあとで精算する。
 */
async function runBlackjackTable(actorUid, mutate) {
  const { tableRef, publicRef } = blackjackTableRefs();
  const ctx = await db.runTransaction(async transaction => {
    const tableDoc = await transaction.get(tableRef);
    const table = tableDoc.exists ? tableDoc.data() : emptyTable();
    const uids = Array.from(new Set([...tableUids(table), actorUid].filter(Boolean)));
    const walletRefs = uids.map(uid => db.collection(CASINO_SESSIONS).doc(uid));
    const walletDocs = walletRefs.length ? await transaction.getAll(...walletRefs) : [];
    const wallets = new Map(uids.map((uid, index) => [uid, walletDocs[index].exists ? walletDocs[index].data() : null]));
    const context = createTableContext({
      table,
      wallets,
      now: Date.now(),
      randomInt: casinoRandom,
      touchWallet: touchCasinoSession
    });
    sweepSeats(context);
    mutate(context);
    maybeStartRound(context);

    // 読み込みは書き込みより前にすべて済ませる
    const orphans = groupOrphanPayouts(context.orphanPayouts);
    const orphanSnapshots = await Promise.all(orphans.map(payout => transaction.get(playerQuery(payout.name))));

    if (context.changed) {
      context.table.seq = (context.table.seq || 0) + 1;
      context.table.updatedAt = context.nowIso;
      transaction.set(tableRef, context.table);
      transaction.set(publicRef, publicTable(context.table));
    }
    context.touched.forEach(uid => {
      transaction.set(db.collection(CASINO_SESSIONS).doc(uid), context.wallets.get(uid));
    });
    orphans.forEach((payout, index) => creditBlackjackOrphan(transaction, orphanSnapshots[index], payout, context.nowIso));
    return context;
  });

  for (const uid of ctx.broke) {
    try {
      await settleCasinoSession(uid, 'casino_auto_settle', { reason: 'broke' });
    } catch (error) {
      console.error(`casino_sessions/${uid} の精算 (チップ切れ) に失敗しました:`, error);
    }
  }
  if (ctx.orphanPayouts.length) {
    await rebuildRateChartQuietly('blackjack_orphan_payout');
  }
  return ctx;
}

/** 卓の操作の返事: 卓の様子と本人の財布 */
async function blackjackTableAction(uid, username, mutate) {
  const ctx = await runBlackjackTable(uid, mutate);
  const wallet = ctx.broke.has(uid) ? null : ctx.wallets.get(uid);
  return {
    me: username,
    table: publicTable(ctx.table),
    session: wallet ? publicCasinoSession(wallet) : null,
    now: new Date().toISOString()
  };
}

/**
 * ホールデムの卓を1回動かす。ブラックジャックと同じく、卓と関わる人の財布をトランザクションで読み、
 * mutate(ctx) で書き換えたあと、始められればハンドを始めて (船員の番は一気に進めて) 書き戻す。
 * 配った手札は holdem_hole/{uid} に置く (本人だけが読める)。
 */
async function runHoldemTable(actorUid, mutate) {
  const { tableRef, publicRef } = holdemTableRefs();
  const ctx = await db.runTransaction(async transaction => {
    const tableDoc = await transaction.get(tableRef);
    const table = tableDoc.exists ? tableDoc.data() : emptyHoldemTable(casinoRandom);
    const uids = Array.from(new Set([...holdemTableUids(table), actorUid].filter(Boolean)));
    const walletRefs = uids.map(uid => db.collection(CASINO_SESSIONS).doc(uid));
    const walletDocs = walletRefs.length ? await transaction.getAll(...walletRefs) : [];
    const wallets = new Map(uids.map((uid, index) => [uid, walletDocs[index].exists ? walletDocs[index].data() : null]));
    const context = createHoldemContext({
      table,
      wallets,
      now: Date.now(),
      randomInt: casinoRandom,
      touchWallet: touchCasinoSession
    });
    sweepHoldemSeats(context);
    mutate(context);
    maybeStartHoldemHand(context);

    // 読み込みは書き込みより前にすべて済ませる
    const orphans = groupOrphanPayouts(context.orphanPayouts);
    const orphanSnapshots = await Promise.all(orphans.map(payout => transaction.get(playerQuery(payout.name))));

    if (context.changed) {
      context.table.seq = (context.table.seq || 0) + 1;
      context.table.updatedAt = context.nowIso;
      transaction.set(tableRef, context.table);
      transaction.set(publicRef, publicHoldemTable(context.table));
    }
    context.holes.forEach((hole, uid) => {
      transaction.set(holdemHoleRef(uid), { ...hole, updatedAt: context.nowIso });
    });
    context.touched.forEach(uid => {
      transaction.set(db.collection(CASINO_SESSIONS).doc(uid), context.wallets.get(uid));
    });
    orphans.forEach((payout, index) => creditBlackjackOrphan(transaction, orphanSnapshots[index], payout, context.nowIso, 'holdem'));
    return context;
  });

  for (const uid of ctx.broke) {
    try {
      await settleCasinoSession(uid, 'casino_auto_settle', { reason: 'broke' });
    } catch (error) {
      console.error(`casino_sessions/${uid} の精算 (チップ切れ) に失敗しました:`, error);
    }
  }
  if (ctx.orphanPayouts.length) {
    await rebuildRateChartQuietly('holdem_orphan_payout');
  }
  return ctx;
}

/** ホールデムの卓の操作の返事: 卓の様子・本人の手札・本人の財布 */
async function holdemTableAction(uid, username, mutate) {
  const ctx = await runHoldemTable(uid, mutate);
  const wallet = ctx.broke.has(uid) ? null : ctx.wallets.get(uid);
  const hole = ctx.holes.get(uid) || await readHoldemHole(uid);
  return {
    me: username,
    holdemTable: publicHoldemTable(ctx.table),
    hole,
    session: wallet ? publicCasinoSession(wallet) : null,
    now: new Date().toISOString()
  };
}

const CASINO_ACTIONS = {
  status: ({ uid, username }) => casinoStatus(uid, username),
  enter: ({ uid, username, body }) => casinoEnter(uid, username, body.buyIn, body.game),
  settle: async ({ uid, username }) => {
    const settled = await settleCasinoSession(uid, username, { manual: true });
    if (!settled) throw new CasinoError(409, '精算するテーブルがありません。');
    return { settled };
  },
  spin: ({ uid, body }) => casinoSpin(uid, body.bets),
  slotSpin: ({ uid, body }) => casinoSlotSpin(uid, body.bet),
  bjJoin: ({ uid, username, body }) => blackjackTableAction(uid, username, ctx => joinSeat(ctx, uid, username, body.seat)),
  bjLeave: ({ uid, username }) => blackjackTableAction(uid, username, ctx => leaveSeat(ctx, uid)),
  bjBet: ({ uid, username, body }) => blackjackTableAction(uid, username, ctx => placeBet(ctx, uid, body.amount, body.squeeze)),
  bjMove: ({ uid, username, body }) => blackjackTableAction(uid, username, ctx => moveTurn(ctx, uid, body.move, body.seq)),
  bjOpen: ({ uid, username, body }) => blackjackTableAction(uid, username, ctx => openCards(ctx, uid, body.no, body.hands)),
  bjTick: ({ uid, username }) => blackjackTableAction(uid, username, tickTable),
  hdJoin: ({ uid, username, body }) => holdemTableAction(uid, username, ctx => joinHoldemSeat(ctx, uid, username, body.seat)),
  hdLeave: ({ uid, username }) => holdemTableAction(uid, username, ctx => leaveHoldemSeat(ctx, uid)),
  hdSitOut: ({ uid, username, body }) => holdemTableAction(uid, username, ctx => setHoldemSitOut(ctx, uid, body.out !== false)),
  hdMove: ({ uid, username, body }) => holdemTableAction(uid, username, ctx => moveHoldemTurn(ctx, uid, body.move, body.amount, body.seq)),
  hdTick: ({ uid, username }) => holdemTableAction(uid, username, tickHoldemTable)
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
    const payload = await CASINO_ACTIONS[action]({ uid: decoded.uid, username, body });
    res.status(200).json({ status: 'success', ...payload });
  } catch (error) {
    if (error instanceof CasinoError || error instanceof TableError || error instanceof HoldemTableError) {
      res.status(error.status).json({ status: 'error', message: error.message });
      return;
    }
    if (error instanceof BlackjackRuleError || error instanceof HoldemRuleError) {
      res.status(409).json({ status: 'error', message: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ status: 'error', message: `カジノの処理に失敗しました: ${error.message}` });
  }
}

export const casino = onRequest({ region: 'asia-northeast1' }, handleCasinoRequest);

// 45.x のゲーム画面 (ルーレットのみ) が呼んでいた入口。
// 更新前から開いたままのタブでも精算できるよう、同じ処理のまま残している
export const casinoRoulette = onRequest({ region: 'asia-northeast1' }, handleCasinoRequest);

// 精算せずに離れたテーブルを片付ける。期限は最後の操作から30分 / 入場から3時間。
// ブラックジャックの卓も、誰も画面を開いていないまま時間切れで止まっていれば先へ進める
export const settleIdleCasinoSessions = onSchedule({
  region: 'asia-northeast1',
  schedule: 'every 10 minutes',
  timeZone: 'Asia/Tokyo'
}, async () => {
  try {
    await runBlackjackTable(null, tickTable);
  } catch (error) {
    console.error('ブラックジャックの卓の時間切れ処理に失敗しました:', error);
  }
  try {
    await runHoldemTable(null, tickHoldemTable);
  } catch (error) {
    console.error('ホールデムの卓の時間切れ処理に失敗しました:', error);
  }
  const snapshot = await db.collection(CASINO_SESSIONS)
    .where('expiresAt', '<=', new Date().toISOString())
    .get();
  for (const doc of snapshot.docs) {
    try {
      const settled = await settleCasinoSession(doc.id, 'casino_auto_settle');
      console.log('casino auto settle:', JSON.stringify(settled));
    } catch (error) {
      console.error(`casino_sessions/${doc.id} の自動精算に失敗しました:`, error);
    }
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
