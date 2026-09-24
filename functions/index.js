import { randomInt } from 'node:crypto';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  BlackjackRuleError,
  applyBlackjackMove,
  publicBlackjackRound,
  standOutBlackjackRound,
  startBlackjackRound,
  summarizeBlackjackRound
} from './blackjack.js';

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

const RATE_CHART_EVENT_GAP_MS = 5000;   // 同じ source/reason でこれ以内の増減は1回の出来事とみなす

/**
 * 全員の増減ログを時刻順に並べ、同時に保存されたもの (1局ぶん・1回の補正) を1件にまとめる。
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
        changes: []
      };
      if (!eventsByDate.has(entry.date)) eventsByDate.set(entry.date, []);
      eventsByDate.get(entry.date).push(current);
    }
    current.lastTime = time;
    current.changes.push({ player: entry.player, afterScore: entry.afterScore });
  });
  return eventsByDate;
}

/** point_history と現在のレートから rate_chart/daily を作り直す */
async function rebuildRateChartFromHistory() {
  const playersSnapshot = await db.collection('players').get();
  const currentRates = new Map();
  playersSnapshot.docs.forEach(doc => {
    const player = doc.data();
    if (!player || !player.name || RATE_EXCLUDED_PLAYERS.has(player.name)) return;
    currentRates.set(player.name, normalizeRate(player.score));
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
    entriesByPlayer.get(entry.player).push({
      createdAt,
      date: getJstDateKey(new Date(createdAt)),
      beforeScore: normalizeRate(entry.beforeScore),
      afterScore: normalizeRate(entry.afterScore),
      source: String(entry.source || ''),
      reason: String(entry.reason || '')
    });
  });
  entriesByPlayer.forEach(entries => entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));

  const days = dates.map((date, index) => {
    const isToday = index === dates.length - 1;
    const rates = {};
    currentRates.forEach((currentRate, name) => {
      // 今日ぶんは players の現在値をそのまま使う。
      // 増減ログを通さずレートが書き換わった場合でも、グラフの右端が
      // ホームのランキングとずれないようにするため。
      if (date === RATE_CHART_START_DATE && !isToday) {
        rates[name] = RATE_CHART_START_RATE;
        return;
      }
      rates[name] = isToday
        ? currentRate
        : rateAtEndOfDay(entriesByPlayer.get(name) || [], date, currentRate);
    });
    return { date, rates };
  });

  // 日ごとの変動 (対局1回・日次補正1回 = 1イベント) を、各イベント直後の全員のレートつきで並べる
  const eventsByDate = groupRateChartEvents(entriesByPlayer);
  days.forEach((day, index) => {
    if (day.date === RATE_CHART_START_DATE) {
      day.events = [];
      return;
    }
    const state = { ...(index > 0 ? days[index - 1].rates : day.rates) };
    if (index === 0) {
      // 先頭の日は前日の終値を知らないので、その日最初の増減の beforeScore から起こす
      currentRates.forEach((currentRate, name) => {
        const first = (entriesByPlayer.get(name) || []).find(entry => entry.date >= day.date);
        state[name] = first && first.date === day.date ? first.beforeScore : day.rates[name];
      });
      day.open = { ...state };
    }
    day.events = (eventsByDate.get(day.date) || []).map(event => {
      event.changes.forEach(change => { state[change.player] = change.afterScore; });
      return { at: event.at, source: event.source, reason: event.reason, rates: { ...state } };
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

async function applyDailyRateReversionForToday() {
  const todayKey = getJstDateKey();
  const settingsRef = db.collection('settings').doc('app');

  return db.runTransaction(async transaction => {
    const settingsDoc = await transaction.get(settingsRef);
    const settings = settingsDoc.exists ? settingsDoc.data() : {};

    if (settings.rate_reversion_last_date === todayKey) {
      return { status: 'skipped', date: todayKey, reason: 'already_applied' };
    }

    const baseline = normalizeRate(settings.rate_baseline ?? RATE_BASELINE_DEFAULT);
    const rate = normalizeReversionRate(settings.rate_reversion_rate);
    const flat = Math.max(0, Math.round(Number(settings.rate_reversion_flat ?? RATE_REVERSION_FLAT_DEFAULT) || 0));
    const playersSnapshot = await transaction.get(db.collection('players'));
    let totalMoved = 0;

    playersSnapshot.docs.forEach(doc => {
      const player = doc.data();
      if (RATE_EXCLUDED_PLAYERS.has(player.name)) return;

      const before = normalizeRate(player.score);
      const delta = getRateReversionDelta(before, baseline, rate, flat);
      if (delta === 0) return;

      const after = normalizeRate(before + delta);
      totalMoved += Math.abs(after - before);
      transaction.set(doc.ref, { ...player, score: after }, { merge: false });

      const historyId = rateHistoryDocId(player.name);
      transaction.set(db.collection('point_history').doc(historyId), {
        id: historyId,
        player: player.name,
        beforeScore: before,
        afterScore: after,
        delta: after - before,
        source: 'daily_rate_reversion',
        reason: `日次レート補正 基準${baseline} / ${(rate * 100).toFixed(1).replace(/\.0$/, '')}%`,
        actor: 'scheduled_function',
        createdAt: new Date().toISOString()
      });
    });

    const nowIso = new Date().toISOString();
    transaction.set(settingsRef, {
      rate_baseline: baseline,
      rate_reversion_rate: rate,
      rate_reversion_flat: flat,
      rate_reversion_last_date: todayKey,
      rate_reversion_last_run_at: nowIso,
      rate_reversion_last_total: totalMoved,
      updatedAt: nowIso
    }, { merge: true });

    return { status: 'success', date: todayKey, rate, totalMoved };
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

// assets/js/main.js の ATTENDANCE_SCHEDULE / ATTENDANCE_USER_OVERRIDES / ATTENDANCE_USER_CLASSES /
// ATTENDANCE_MIN_RATE と同じ内容。時間割を変えるときは両方を直すこと。
const ATTENDANCE_MIN_RATE = 3000;
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
    if (rate === undefined || rate < ATTENDANCE_MIN_RATE) continue;

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

    const historyCount = await db.runTransaction(async transaction => {
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

        (Array.isArray(data[key]) ? data[key] : []).forEach((item, index) => {
          const docId = getItemDocId(key, item, index);
          nextIds.add(docId);
          const payload = { ...item };
          delete payload._docId;
          delete payload._baseScore;
          if (key === 'scores' && scoreWrites.scores.has(docId)) {
            payload.score = scoreWrites.scores.get(docId);
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

    res.status(200).json({ status: 'success', message: 'データをFirebaseに保存しました。' });
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
// カジノ (ルーレット・ブラックジャック)
//   入場時に持ち込むレートを決め、以降の勝ち負けは casino_sessions のチップだけで動かす。
//   チップは1人1つで、ルーレットとブラックジャックのどちらのテーブルでも使える
//   (持ち込みは1回ぶんしか持てないので、同じレートを2つのテーブルに二重に持ち込めない)。
//   players のレートに反映するのは精算の1回だけなので、レート推移グラフには
//   スピンや勝負ごとではなく「精算1回 = 1変動」として出る。
//   負けたまま精算せずに離れても、最後の操作から CASINO_IDLE_SETTLE_MS か
//   入場から CASINO_MAX_SESSION_MS を過ぎたセッションは settleIdleCasinoSessions が
//   自動で精算する (途中のブラックジャックは残りの手をスタンドして決着させる)。
//   チップが 0 になったときもその場で精算する。
//   乱数・配当・残高はすべてここで決め、ブラウザからは賭け方と操作しか受け取らない。
//   ブラックジャックのルール本体は blackjack.js にある。
// -----------------------------------------------------------------
const CASINO_SESSIONS = 'casino_sessions';
const CASINO_GAMES = new Set(['roulette', 'blackjack']);
const CASINO_IDLE_SETTLE_MS = 30 * 60 * 1000;
const CASINO_MAX_SESSION_MS = 3 * 60 * 60 * 1000;
const CASINO_RECENT_LIMIT = 12;
const CASINO_MAX_BETS_PER_SPIN = 60;

// シングルゼロ (0〜36) のヨーロピアンルーレット。配当は賭け金に対する倍率 (元金は別に戻る)
const ROULETTE_RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const ROULETTE_BET_TYPES = {
  straight: { payout: 35, values: [0, 36], wins: (n, v) => n === v },
  dozen:    { payout: 2,  values: [1, 3],  wins: (n, v) => n !== 0 && Math.ceil(n / 12) === v },
  column:   { payout: 2,  values: [1, 3],  wins: (n, v) => n !== 0 && ((n - 1) % 3) + 1 === v },
  red:      { payout: 1, wins: n => ROULETTE_RED_NUMBERS.has(n) },
  black:    { payout: 1, wins: n => n !== 0 && !ROULETTE_RED_NUMBERS.has(n) },
  even:     { payout: 1, wins: n => n !== 0 && n % 2 === 0 },
  odd:      { payout: 1, wins: n => n % 2 === 1 },
  low:      { payout: 1, wins: n => n >= 1 && n <= 18 },
  high:     { payout: 1, wins: n => n >= 19 }
};

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

function isBlackjackInProgress(session) {
  return Boolean(session.bjRound && session.bjRound.phase === 'player');
}

/** チップが尽きて続けようがない (ブラックジャックの途中なら、賭けたぶんがまだ戻りうる) */
function isCasinoBroke(session) {
  return session.chips <= 0 && !isBlackjackInProgress(session);
}

function publicCasinoSession(session) {
  return {
    game: session.game,
    buyIn: session.buyIn,
    chips: session.chips,
    spins: session.spins,
    bjHands: session.bjHands || 0,
    startedAt: session.startedAt,
    lastActionAt: session.lastActionAt,
    expiresAt: session.expiresAt,
    recent: session.recent || [],
    blackjack: {
      round: publicBlackjackRound(session.bjRound || null, session.chips),
      recent: session.bjRecent || []
    }
  };
}

function playerQuery(name) {
  return db.collection('players').where('name', '==', name).limit(1);
}

/** 増減ログに残す遊んだ内容。ルーレットだけのときは以前と同じ書き方にする */
function casinoPlayLog(session) {
  const spins = session.spins || 0;
  const hands = session.bjHands || 0;
  if (hands === 0) return { source: 'casino_roulette', label: `ルーレット ${spins}回` };
  if (spins === 0) return { source: 'casino_blackjack', label: `ブラックジャック ${hands}回` };
  return { source: 'casino', label: `カジノ ルーレット${spins}回・ブラックジャック${hands}回` };
}

/**
 * ブラックジャックを1手進めたあとのセッション。chips はダブル・スプリットの追加分を
 * 引いたあとの手元チップで、勝負が決着していれば払い戻しと記録をここで足す。
 */
function withBlackjackRound(session, round, chips, now) {
  const next = {
    ...session,
    chips,
    bjRound: round,
    lastActionAt: now,
    expiresAt: casinoSessionExpiresAt(session.startedAt, now)
  };
  if (round.phase === 'done') {
    next.chips = chips + round.returned;
    next.bjHands = (session.bjHands || 0) + 1;
    next.wagered = (session.wagered || 0) + round.totalBet;
    next.bjRecent = [summarizeBlackjackRound(round, now), ...(session.bjRecent || [])].slice(0, CASINO_RECENT_LIMIT);
  }
  return next;
}

/**
 * セッションを閉じて、持ち込みとの差を players のレートに1回で反映する。
 * 既に精算済み (ドキュメントが無い) なら null。自動精算と手動精算が重なっても二重には反映しない。
 * ブラックジャックの勝負が途中なら、手動 (manual) の精算は断り、
 * 自動の精算では残りの手をすべてスタンドしたものとして決着させてから精算する。
 */
async function settleCasinoSession(uid, actor, { manual = false } = {}) {
  const sessionRef = db.collection(CASINO_SESSIONS).doc(uid);
  const result = await db.runTransaction(async transaction => {
    const sessionDoc = await transaction.get(sessionRef);
    if (!sessionDoc.exists) return null;
    let session = sessionDoc.data();
    const at = new Date().toISOString();
    if (isBlackjackInProgress(session)) {
      if (manual) {
        throw new CasinoError(409, 'ブラックジャックの勝負が途中です。決着をつけてから精算してください。');
      }
      const { round, chips } = standOutBlackjackRound(session.bjRound, session.chips, casinoRandom);
      session = withBlackjackRound(session, round, chips, at);
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
    transaction.delete(sessionRef);
    return {
      player: session.player,
      buyIn,
      chips,
      spins: session.spins || 0,
      bjHands: session.bjHands || 0,
      beforeScore,
      afterScore,
      delta: beforeScore === null ? 0 : afterScore - beforeScore,
      auto: actor !== session.player
    };
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

async function casinoStatus(uid, username) {
  const autoSettled = await settleCasinoSessionIfExpired(uid);
  const [sessionDoc, playerSnapshot] = await Promise.all([
    db.collection(CASINO_SESSIONS).doc(uid).get(),
    playerQuery(username).get()
  ]);
  return {
    score: playerSnapshot.empty ? 0 : normalizeRate(playerSnapshot.docs[0].data().score),
    session: sessionDoc.exists ? publicCasinoSession(sessionDoc.data()) : null,
    autoSettled
  };
}

async function casinoEnter(uid, username, rawBuyIn, rawGame) {
  const buyIn = Number(rawBuyIn);
  if (!Number.isSafeInteger(buyIn) || buyIn < 1) {
    throw new CasinoError(400, '持ち込むレートは1以上の整数で入力してください。');
  }
  // どのテーブルから入場したか (記録用。チップはどちらのテーブルでも使える)
  const game = CASINO_GAMES.has(rawGame) ? rawGame : 'roulette';
  const autoSettled = await settleCasinoSessionIfExpired(uid);
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
      wagered: 0,
      startedAt: now,
      lastActionAt: now,
      expiresAt: casinoSessionExpiresAt(now, now),
      recent: [],
      bjRound: null,
      bjRecent: []
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
    const returned = bets.reduce((sum, bet) => {
      const rule = ROULETTE_BET_TYPES[bet.type];
      return rule.wins(number, bet.value) ? sum + bet.amount * (rule.payout + 1) : sum;
    }, 0);
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
  if (isCasinoBroke(spun.session)) {
    const settled = await settleCasinoSession(uid, spun.session.player);
    return { result: spun.result, session: null, settled };
  }
  return { result: spun.result, session: publicCasinoSession(spun.session) };
}

/** 賭け金を置いて配る。ナチュラルならこの1回で決着する */
async function blackjackDeal(uid, rawBet) {
  const bet = Number(rawBet);
  if (!Number.isSafeInteger(bet) || bet < 1) {
    throw new CasinoError(400, '賭け金は1以上の整数で指定してください。');
  }
  const sessionRef = db.collection(CASINO_SESSIONS).doc(uid);

  const outcome = await db.runTransaction(async transaction => {
    const sessionDoc = await transaction.get(sessionRef);
    if (!sessionDoc.exists) {
      throw new CasinoError(409, 'テーブルに入場していません。');
    }
    const session = sessionDoc.data();
    if (isCasinoSessionExpired(session)) return { expired: true };
    if (isBlackjackInProgress(session)) {
      throw new CasinoError(409, '前の勝負がまだ終わっていません。');
    }
    if (bet > session.chips) {
      throw new CasinoError(400, `手元のチップ (${session.chips}) を超えて賭けることはできません。`);
    }

    const now = new Date().toISOString();
    const round = startBlackjackRound(bet, casinoRandom, now);
    const next = withBlackjackRound(session, round, session.chips - bet, now);
    transaction.set(sessionRef, next);
    return { session: next };
  });
  return finishBlackjackAction(uid, outcome);
}

/** ヒット / スタンド / ダブル / スプリット。seq は画面に出ている盤面の番号 */
async function blackjackMove(uid, rawMove, rawSeq) {
  const move = String(rawMove || '');
  const sessionRef = db.collection(CASINO_SESSIONS).doc(uid);

  const outcome = await db.runTransaction(async transaction => {
    const sessionDoc = await transaction.get(sessionRef);
    if (!sessionDoc.exists) {
      throw new CasinoError(409, 'テーブルに入場していません。');
    }
    const session = sessionDoc.data();
    if (isCasinoSessionExpired(session)) return { expired: true };
    if (!isBlackjackInProgress(session)) {
      throw new CasinoError(409, '進行中の勝負がありません。');
    }
    // 二度押しや別のタブから、画面に出ている盤面より先に進んだ勝負を操作しないようにする
    if (Number(rawSeq) !== (session.bjRound.seq || 0)) {
      throw new CasinoError(409, '画面の表示が古くなっています。最新の状態を読み込み直してください。');
    }

    const now = new Date().toISOString();
    const { round, chips } = applyBlackjackMove(session.bjRound, move, session.chips, casinoRandom);
    const next = withBlackjackRound(session, round, chips, now);
    transaction.set(sessionRef, next);
    return { session: next };
  });
  return finishBlackjackAction(uid, outcome);
}

async function finishBlackjackAction(uid, outcome) {
  if (outcome.expired) {
    const settled = await settleCasinoSession(uid, 'casino_auto_settle');
    return { expired: true, settled };
  }
  const { session } = outcome;
  const round = publicBlackjackRound(session.bjRound, session.chips);
  // 決着してチップが尽きたら、ルーレットと同じくその場で精算する
  if (isCasinoBroke(session)) {
    const settled = await settleCasinoSession(uid, session.player);
    return { round, session: null, settled };
  }
  return { round, session: publicCasinoSession(session) };
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
  bjDeal: ({ uid, body }) => blackjackDeal(uid, body.bet),
  bjMove: ({ uid, body }) => blackjackMove(uid, body.move, body.seq)
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
    if (error instanceof CasinoError) {
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

// 45.x のゲーム画面 (ルーレットのみ) が呼んでいた入口。
// 更新前から開いたままのタブでも精算できるよう、同じ処理のまま残している
export const casinoRoulette = onRequest({ region: 'asia-northeast1' }, handleCasinoRequest);

// 精算せずに離れたテーブルを片付ける。期限は最後の操作から30分 / 入場から3時間
export const settleIdleCasinoSessions = onSchedule({
  region: 'asia-northeast1',
  schedule: 'every 10 minutes',
  timeZone: 'Asia/Tokyo'
}, async () => {
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
