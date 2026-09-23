import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

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

/** レートは常に 0 以上の整数として扱う */
function normalizeRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) ? Math.max(0, Math.round(rate)) : 0;
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
const RATE_CHART_DAYS = 30;          // グラフに出す日数
const RATE_CHART_COLLECTION = 'rate_chart';
const RATE_CHART_DOC = 'daily';

/** 今日を含む直近 days 日ぶんの JST 日付キーを古い順で返す */
function recentJstDateKeys(days = RATE_CHART_DAYS) {
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(getJstDateKey(new Date(Date.now() - i * 86400000)));
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
      afterScore: normalizeRate(entry.afterScore)
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
      rates[name] = isToday
        ? currentRate
        : rateAtEndOfDay(entriesByPlayer.get(name) || [], date, currentRate);
    });
    return { date, rates };
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

// assets/js/main.js の ATTENDANCE_SCHEDULE / ATTENDANCE_USER_OVERRIDES /
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
    { name: '国際社会論', start: '11:00', room: 432 }
  ]
};
const ATTENDANCE_USER_OVERRIDES = {
  kosuke: [{ day: 2, from: '14:30', to: '15:30', room: 646 }],
  mahhii: [{ day: 2, from: '14:30', to: '15:30', room: 646 }]
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

export const sendAttendanceNotices = onSchedule({
  region: 'asia-northeast1',
  schedule: '0,30 9-18 * * 1-4',
  timeZone: 'Asia/Tokyo',
  timeoutSeconds: 120
}, async () => {
  const { dow, minutes } = getJstDayAndMinutes();
  const slots = (ATTENDANCE_SCHEDULE[dow] || []).filter(slot =>
    Math.abs(minutes - attendanceToMinutes(slot.start)) <= ATTENDANCE_NOTICE_WINDOW_MINUTES
  );

  // 授業の開始時刻でなければ、DBを一切読まずに終わる
  if (!slots.length) return;

  const todayKey = getJstDateKey();
  const results = [];

  for (const slot of slots) {
    const noticeRef = db.collection('attendance_notices').doc(`${todayKey}_${slot.start.replace(':', '')}`);

    // 送る前に枠を押さえる。再試行で同じ授業を二重に通知しないため
    const claimed = await db.runTransaction(async transaction => {
      const doc = await transaction.get(noticeRef);
      if (doc.exists) return false;
      transaction.set(noticeRef, {
        course: slot.name,
        start: slot.start,
        createdAt: new Date().toISOString()
      });
      return true;
    });
    if (!claimed) {
      results.push({ course: slot.name, skipped: 'already_sent' });
      continue;
    }

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

      // レートが足りない人にも通知しない (画面のボタンと同じ条件)
      const rate = rateByName.get(owner);
      if (rate === undefined || rate < ATTENDANCE_MIN_RATE) continue;

      const tokenEntries = Array.isArray(data.tokens) ? data.tokens : [];
      const tokens = [...new Set(tokenEntries.map(entry => String(entry?.token || '')).filter(Boolean))];
      if (!tokens.length) continue;

      const room = resolveAttendanceRoom(owner, dow, minutes, slot);
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
    results.push({ course: slot.name, start: slot.start, notified, success, failure });
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
    if (!await hasWriteAccess(req, body)) {
      res.status(401).json({ status: 'error', message: '認証が必要です。' });
      return;
    }

    const data = body.data || {};
    const pointHistoryEntries = Array.isArray(body.pointHistoryEntries) ? body.pointHistoryEntries : [];
    const batch = db.batch();

    for (const [key, collectionName] of Object.entries(FIREBASE_COLLECTIONS)) {
      const collectionRef = db.collection(collectionName);
      const snapshot = await collectionRef.get();
      const nextIds = new Set();

      (Array.isArray(data[key]) ? data[key] : []).forEach((item, index) => {
        const docId = getItemDocId(key, item, index);
        nextIds.add(docId);
        const payload = { ...item };
        delete payload._docId;
        batch.set(collectionRef.doc(docId), payload);
      });

      snapshot.docs.forEach(doc => {
        if (!nextIds.has(doc.id)) {
          batch.delete(doc.ref);
        }
      });
    }

    pointHistoryEntries.forEach(entry => {
      if (!entry || !entry.id) return;
      batch.set(db.collection('point_history').doc(toDocId(entry.id)), entry);
    });

    batch.set(db.collection('settings').doc('app'), {
      attendance_allowed_users: Array.isArray(data.attendance_allowed_users) ? data.attendance_allowed_users : [],
      updatedAt: new Date().toISOString()
    }, { merge: true });

    await batch.commit();

    // レートが動いたときだけグラフ用データを作り直す (失敗しても保存自体は成功扱い)
    if (pointHistoryEntries.length > 0) {
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
