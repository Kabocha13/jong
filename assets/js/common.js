// assets/js/common.js

const FIREBASE_COLLECTIONS = {
    scores: 'players',
    sports_bets: 'sports_bets',
    speedstorm_records: 'speedstorm_records',
    lotteries: 'lotteries',
    gift_codes: 'gift_codes',
    career_posts: 'career_posts'
};
// -----------------------------------------------------------------
// レート制の基本設定
//   毎日「基準との差」の一定割合が基準へ引き戻されるので、放置すれば
//   全員が RATE_BASELINE_DEFAULT (3000) ちょうどに収束する。
// -----------------------------------------------------------------
const RATE_BASELINE_DEFAULT = 3000;          // 基準レート
const RATE_REVERSION_RATE_DEFAULT = 0.13;    // 1日に戻す割合 (基準との差に対して)
const RATE_REVERSION_FLAT_DEFAULT = 10;      // 割合ぶんに上乗せする固定分
// CPUを入れて打ったとき用の仮想プレイヤー。麻雀の結果入力でだけ選べる席で、
// レートは常に基準レート(3000)に固定する。勝っても負けても本人のレートは動かさず、
// 卓平均レートの計算にもこの3000をそのまま使うので、実プレイヤーのレートを吸わない。
const MAHJONG_CPU_NAME = '3mahjong';
const MAHJONG_CPU_RATE = RATE_BASELINE_DEFAULT;
const MAHJONG_CPU_MAX_SEATS = 2;            // 1卓に入れられるCPUの人数 (三麻・四麻とも)
const RATE_EXCLUDED_PLAYERS = [MAHJONG_CPU_NAME];  // 日次補正の対象外
const RATE_BONUS_AMOUNTS = { luxury: 10, pro: 5, none: 1 };
const RATE_BONUS_PENALTY = 10;               // ペナルティ時の減少量
const RATE_BONUS_SPECIAL = 30;               // 特別ボーナスの加算量
const RATE_BONUS_SPECIAL_PERCENT = 1;        // 特別ボーナスの発生確率 (%)
const RATE_CHART_COLLECTION = 'rate_chart';  // レート推移グラフ用 (日別の終値)
const RATE_CHART_DOC = 'daily';
const RATE_CHART_DAYS = 30;                 // グラフに出す日数

function isMahjongCpu(name) {
    return name === MAHJONG_CPU_NAME;
}
let _firebaseFirestoreSettingsApplied = false;
let _rateReversionCheckedDate = '';

function isFirebaseConfigured() {
    return Boolean(
        window.firebase &&
        window.QJONG_FIREBASE_CONFIG &&
        window.QJONG_FIREBASE_CONFIG.apiKey &&
        !String(window.QJONG_FIREBASE_CONFIG.apiKey).includes('YOUR_')
    );
}

function getFirebaseApp() {
    if (!isFirebaseConfigured()) return null;
    if (!window.firebase.apps.length) {
        window.firebase.initializeApp(window.QJONG_FIREBASE_CONFIG);
        if (window.firebase.firestore && !_firebaseFirestoreSettingsApplied) {
            window.firebase.firestore().settings({ ignoreUndefinedProperties: true });
            _firebaseFirestoreSettingsApplied = true;
        }
    }
    return window.firebase.app();
}

function getFirestoreDb() {
    const app = getFirebaseApp();
    if (!app) return null;
    return createFirestoreRestDb(window.QJONG_FIREBASE_CONFIG);
}

function getFirebaseStorage() {
    const app = getFirebaseApp();
    return app && window.firebase.storage ? window.firebase.storage() : null;
}

function getFirebaseAuth() {
    const app = getFirebaseApp();
    return app && window.firebase.auth ? window.firebase.auth() : null;
}

function getFunctionsBaseUrl() {
    const config = window.QJONG_FIREBASE_CONFIG || {};
    const region = config.functionsRegion || 'asia-northeast1';
    return `https://${region}-${config.projectId}.cloudfunctions.net`;
}

async function qjongSignIn(username, password) {
    const auth = getFirebaseAuth();
    if (!auth) return null;

    const response = await fetch(`${getFunctionsBaseUrl()}/qjongLogin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.token) {
        throw new Error(data.message || 'Firebaseログインに失敗しました。');
    }
    const credential = await auth.signInWithCustomToken(data.token);
    return { firebaseUser: credential.user, user: data.user || null };
}

async function qjongSignOut() {
    const auth = getFirebaseAuth();
    if (auth && auth.currentUser) {
        await auth.signOut();
    }
}

async function getFirebaseIdToken() {
    const user = await waitForFirebaseUser();
    return user ? user.getIdToken() : null;
}

function getCurrentFirebaseUidSync() {
    const auth = getFirebaseAuth();
    return auth && auth.currentUser ? auth.currentUser.uid : null;
}

async function waitForFirebaseUser(timeoutMs = 5000) {
    const auth = getFirebaseAuth();
    if (!auth) return null;
    if (auth.currentUser) return auth.currentUser;

    return new Promise(resolve => {
        let unsubscribe = null;
        const timeoutId = setTimeout(() => {
            if (unsubscribe) unsubscribe();
            resolve(auth.currentUser || null);
        }, timeoutMs);

        unsubscribe = auth.onAuthStateChanged(user => {
            clearTimeout(timeoutId);
            if (unsubscribe) unsubscribe();
            resolve(user || null);
        });
    });
}

async function requireFirebaseUid() {
    const user = await waitForFirebaseUser();
    if (!user) throw new Error('Firebase認証が必要です。ログアウトして再ログインしてください。');
    return user.uid;
}

const DEFAULT_MANABA_BASE_URL = 'https://cit.manaba.jp/ct/home';
const DEFAULT_MANABA_LOGIN_PATH = '/ct/login';
const DEFAULT_MANABA_ASSIGNMENTS_PATH = '/ct/home_library_query';
const MANABA_ASSIGNMENT_URGENT_HOURS = 48;

function parseManabaAssignmentDeadline(item) {
    const rawText = String(item?.deadlineText || item?.deadline || '').trim();
    if (!rawText) return null;

    const normalizedText = rawText
        .replace(/[年月]/g, '/')
        .replace(/[日]/g, ' ')
        .replace(/[時]/g, ':')
        .replace(/[分]/g, '')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const dateMatch = normalizedText.match(/(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
    if (!dateMatch) return null;

    const [, year, month, day] = dateMatch;
    const afterDate = normalizedText.slice(dateMatch.index + dateMatch[0].length);
    const timeMatch = afterDate.match(/(\d{1,2}):(\d{1,2})/);
    const hasTime = Boolean(timeMatch);
    const hour = hasTime ? Number(timeMatch[1]) : 23;
    const minute = hasTime ? Number(timeMatch[2]) : 59;
    const deadline = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        hour,
        minute,
        hasTime ? 0 : 59
    );

    return Number.isNaN(deadline.getTime()) ? null : deadline;
}

function isManabaAssignmentUrgent(item, now = new Date()) {
    const deadline = parseManabaAssignmentDeadline(item);
    if (!deadline) return false;
    const remainingMs = deadline.getTime() - now.getTime();
    return remainingMs >= 0 && remainingMs <= MANABA_ASSIGNMENT_URGENT_HOURS * 60 * 60 * 1000;
}

async function saveManabaCredentialsToFirebase(credentials) {
    const db = getFirestoreDb();
    const uid = await requireFirebaseUid();
    if (!db) throw new Error('Firebaseが設定されていません。');

    const payload = {
        owner: credentials.owner || '',
        ownerUid: uid,
        baseUrl: String(credentials.baseUrl || DEFAULT_MANABA_BASE_URL).trim(),
        loginPath: String(credentials.loginPath || DEFAULT_MANABA_LOGIN_PATH).trim(),
        assignmentsPath: String(credentials.assignmentsPath || DEFAULT_MANABA_ASSIGNMENTS_PATH).trim(),
        loginId: String(credentials.loginId || '').trim(),
        password: String(credentials.password || ''),
        usernameField: String(credentials.usernameField || 'userid').trim(),
        passwordField: String(credentials.passwordField || 'password').trim(),
        updatedAt: new Date().toISOString()
    };
    await db.collection('manaba_credentials').doc(uid).set(payload, { merge: true });
    return payload;
}

async function fetchManabaCredentialsFromFirebase() {
    const db = getFirestoreDb();
    if (!db) return null;
    const uid = getCurrentFirebaseUidSync() || await requireFirebaseUid();
    const doc = await db.collection('manaba_credentials').doc(uid).get();
    return doc.exists ? doc.data() : null;
}

async function fetchManabaAssignmentsFromFirebase() {
    const db = getFirestoreDb();
    if (!db) return null;
    const uid = getCurrentFirebaseUidSync() || await requireFirebaseUid();
    const doc = await db.collection('manaba_assignments').doc(uid).get();
    return doc.exists ? doc.data() : null;
}

async function saveManabaAssignmentsToFirebase(assignments, owner) {
    const db = getFirestoreDb();
    const uid = await requireFirebaseUid();
    if (!db) throw new Error('Firebaseが設定されていません。');
    const payload = {
        owner: owner || '',
        ownerUid: uid,
        assignments: assignments || [],
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: 'success',
        lastSyncError: ''
    };
    await db.collection('manaba_assignments').doc(uid).set(payload, { merge: true });
    return payload;
}

async function syncManabaAssignmentsNow() {
    const token = await getFirebaseIdToken();
    if (!token) throw new Error('Firebase認証が必要です。');
    const response = await fetch(`${getFunctionsBaseUrl()}/syncManabaNow`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status !== 'success') {
        throw new Error(data.message || 'manaba同期に失敗しました。');
    }
    return data;
}

function createEmptyData() {
    return {
        scores: [],
        sports_bets: [],
        speedstorm_records: [],
        lotteries: [],
        gift_codes: [],
        career_posts: [],
        rate_baseline: RATE_BASELINE_DEFAULT,
        rate_reversion_rate: RATE_REVERSION_RATE_DEFAULT,
        rate_reversion_flat: RATE_REVERSION_FLAT_DEFAULT,
        rate_reversion_last_date: '',
        rate_reversion_last_run_at: '',
        rate_reversion_last_total: 0,
        attendance_allowed_users: []
    };
}

function normalizeFetchedRecord(record) {
    const normalized = { ...createEmptyData(), ...(record || {}) };
    normalized.scores = (normalized.scores || []).map(player => ({
        ...player,
        score: normalizeRate(player.score),
        status: player.status || 'none',
        dailyProbability: toFiniteNumber(player.dailyProbability, 0),
        accumulatedProbability: toFiniteNumber(player.accumulatedProbability, 0),
        dailyPressCount: Math.max(0, Math.floor(toFiniteNumber(player.dailyPressCount, 0)))
    }));
    normalized.rate_baseline = normalizeRate(normalized.rate_baseline ?? RATE_BASELINE_DEFAULT);
    normalized.rate_reversion_rate = normalizeReversionRate(normalized.rate_reversion_rate);
    normalized.rate_reversion_flat = Math.max(0, Math.round(toFiniteNumber(normalized.rate_reversion_flat, RATE_REVERSION_FLAT_DEFAULT)));
    normalized.rate_reversion_last_date = String(normalized.rate_reversion_last_date || '');
    normalized.rate_reversion_last_run_at = String(normalized.rate_reversion_last_run_at || '');
    normalized.rate_reversion_last_total = toFiniteNumber(normalized.rate_reversion_last_total, 0);
    normalized.attendance_allowed_users = Array.isArray(normalized.attendance_allowed_users)
        ? normalized.attendance_allowed_users.filter(Boolean)
        : [];
    return normalized;
}

function normalizeReversionRate(value) {
    const rate = toFiniteNumber(value, RATE_REVERSION_RATE_DEFAULT);
    return Math.min(1, Math.max(0, rate));
}

/** レートは常に 0 以上の整数として扱う */
function normalizeRate(value) {
    return Math.max(0, Math.round(toFiniteNumber(value, 0)));
}

/** 画面表示用。単位は付けず、桁区切りだけを入れる */
function formatRate(value) {
    return normalizeRate(value).toLocaleString('ja-JP');
}

/**
 * 基準レートへ1日ぶん近づけたときの増減を返す。
 *   1日の補正量 = 基準との差 × rate (既定13%) + flat (既定10)
 * 固定分があるので差は必ず 0 になり、残りの差が補正量を下回った日に
 * 基準ちょうどへ揃う。上下どちらでも同じ式なので補正は左右対称。
 * 基準3000なら、レート0から27日・6000から27日・4000から19日で一致する。
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

function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
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

function createRateHistoryId(playerName, at = new Date().toISOString()) {
    return toDocId(`ph_${at}_${playerName}_${Math.random().toString(36).slice(2, 8)}`);
}

function getRateHistoryActor() {
    return localStorage.getItem('authUsername') || getCurrentFirebaseUidSync() || 'system';
}

function buildRateHistoryEntries(beforeScores, afterScores, meta = {}) {
    const beforeMap = new Map((beforeScores || []).map(player => [player.name, player]));
    const actor = meta.actor || getRateHistoryActor();
    const source = meta.source || 'rate_update';
    const reason = meta.reason || '';
    const at = meta.at || new Date().toISOString();

    return (afterScores || []).flatMap(player => {
        if (!player || !player.name) return [];
        const before = beforeMap.get(player.name);
        if (!before) return [];
        const beforeScore = normalizeRate(before.score);
        const afterScore = normalizeRate(player.score);
        const delta = afterScore - beforeScore;
        if (delta === 0) return [];
        return [{
            id: createRateHistoryId(player.name, at),
            player: player.name,
            beforeScore,
            afterScore,
            delta,
            source,
            reason,
            actor,
            createdAt: at
        }];
    });
}

function addRateHistoryEntriesToBatch(db, batch, entries) {
    (entries || []).forEach(entry => {
        batch.set(db.collection('point_history').doc(entry.id), entry);
    });
}

function firestoreValueFromJson(value) {
    if (value === undefined) return undefined;
    if (value === null) return { nullValue: null };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (typeof value === 'string') return { stringValue: value };
    if (Array.isArray(value)) {
        return { arrayValue: { values: value.map(firestoreValueFromJson).filter(Boolean) } };
    }
    if (typeof value === 'object') {
        const fields = {};
        Object.entries(value).forEach(([key, childValue]) => {
            const converted = firestoreValueFromJson(childValue);
            if (converted) fields[key] = converted;
        });
        return { mapValue: { fields } };
    }
    return { stringValue: String(value) };
}

function jsonFromFirestoreValue(value) {
    if (!value || value.nullValue === null) return null;
    if ('booleanValue' in value) return value.booleanValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('stringValue' in value) return value.stringValue;
    if ('timestampValue' in value) return value.timestampValue;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(jsonFromFirestoreValue);
    if ('mapValue' in value) {
        const result = {};
        Object.entries(value.mapValue.fields || {}).forEach(([key, childValue]) => {
            result[key] = jsonFromFirestoreValue(childValue);
        });
        return result;
    }
    return null;
}

function firestoreFieldsFromJson(data) {
    return firestoreValueFromJson(data || {}).mapValue.fields || {};
}

function jsonFromFirestoreDocument(document) {
    const result = {};
    Object.entries(document.fields || {}).forEach(([key, value]) => {
        result[key] = jsonFromFirestoreValue(value);
    });
    return result;
}

function createFirestoreRestDb(config) {
    const databaseId = config.databaseId || '(default)';
    const databaseRoot = `projects/${config.projectId}/databases/${databaseId}/documents`;
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${databaseId}/documents`;
    const keyQuery = `key=${encodeURIComponent(config.apiKey)}`;

    function docUrl(path) {
        return `${baseUrl}/${path.split('/').map(encodeURIComponent).join('/')}?${keyQuery}`;
    }

    function commitUrl() {
        return `${baseUrl}:commit?${keyQuery}`;
    }

    function documentName(path) {
        return `${databaseRoot}/${path}`;
    }

    function updateMaskFromFields(fields) {
        return { fieldPaths: Object.keys(fields || {}) };
    }

    async function commitWrites(writes) {
        if (!writes.length) return null;
        return request(commitUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ writes })
        });
    }

    async function request(url, options = {}) {
        const headers = new Headers(options.headers || {});
        const token = await getFirebaseIdToken();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }
        const response = await fetch(url, { ...options, headers });
        if (response.status === 404) return null;
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Firestore REST Error ${response.status}: ${errorText}`);
        }
        return response.json();
    }

    function makeDoc(path) {
        return {
            path,
            get id() {
                return decodeURIComponent(path.split('/').pop());
            },
            async get() {
                const document = await request(docUrl(path));
                return {
                    exists: Boolean(document),
                    id: this.id,
                    data: () => document ? jsonFromFirestoreDocument(document) : undefined,
                    ref: this
                };
            },
            async set(data) {
                const fields = firestoreFieldsFromJson(data);
                await commitWrites([{
                    update: {
                        name: documentName(path),
                        fields
                    }
                }]);
            },
            async update(data) {
                const fields = firestoreFieldsFromJson(data);
                await commitWrites([{
                    update: {
                        name: documentName(path),
                        fields
                    },
                    updateMask: updateMaskFromFields(fields)
                }]);
            },
            async delete() {
                await commitWrites([{ delete: documentName(path) }]);
            }
        };
    }

    function makeCollection(path) {
        return {
            path,
            doc: id => makeDoc(`${path}/${id}`),
            async get() {
                const result = await request(`${baseUrl}/${path}?${keyQuery}`);
                const docs = (result && result.documents ? result.documents : []).map(document => {
                    const doc = makeDoc(document.name.split('/documents/')[1]);
                    const data = jsonFromFirestoreDocument(document);
                    return { id: doc.id, ref: doc, data: () => data };
                });
                return { docs };
            }
        };
    }

    return {
        collection: makeCollection,
        batch() {
            const writes = [];
            return {
                set: (docRef, data, options = {}) => {
                    const fields = firestoreFieldsFromJson(data);
                    const write = {
                        update: {
                            name: documentName(docRef.path),
                            fields
                        }
                    };
                    if (options && options.merge) {
                        write.updateMask = updateMaskFromFields(fields);
                    }
                    writes.push(write);
                },
                delete: docRef => writes.push({ delete: documentName(docRef.path) }),
                commit: async () => {
                    await commitWrites(writes);
                }
            };
        },
        async runTransaction(updateFunction) {
            const transaction = {
                get: docRef => docRef.get(),
                set: (docRef, data, options = {}) => docRef.set(data, options),
                update: (docRef, data) => docRef.update(data),
                delete: docRef => docRef.delete()
            };
            return updateFunction(transaction);
        }
    };
}

// -----------------------------------------------------------------
// データ取得 (GET)
// -----------------------------------------------------------------

// リトライを制御するヘルパー関数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 短時間キャッシュ (同一ページ内の連続呼び出しをまとめる)
let _fetchCache = null;
let _fetchCacheTime = 0;
let _fetchInFlight = null;
const FETCH_CACHE_TTL = 10000; // 10秒間キャッシュ

/**
 * Firebaseから最新の全データを取得する関数
 * @returns {Promise<object>} 全データ (scores, sports_bets, speedstorm_records, lotteries)
 */
async function fetchAllData() {
    // キャッシュが有効なら即返す
    if (_fetchCache && (Date.now() - _fetchCacheTime) < FETCH_CACHE_TTL) {
        return _fetchCache;
    }
    // 同時リクエスト中なら同じPromiseを返す (重複リクエスト防止)
    if (_fetchInFlight) {
        return _fetchInFlight;
    }
    _fetchInFlight = _fetchAllDataRaw().then(data => {
        _fetchCache = data;
        _fetchCacheTime = Date.now();
        _fetchInFlight = null;
        return data;
    }).catch(err => {
        _fetchInFlight = null;
        throw err;
    });
    return _fetchInFlight;
}

/**
 * キャッシュを破棄して強制的に最新データを取得する
 */
function invalidateFetchCache() {
    _fetchCache = null;
    _fetchCacheTime = 0;
}

async function _fetchAllDataRaw() {
    const MAX_RETRIES = 3;
    let attempt = 0;
    let delayMs = 1000;

    while (attempt < MAX_RETRIES) {
        try {
            return await fetchAllDataFromFirebase();
        } catch (error) {
            if (attempt < MAX_RETRIES - 1) {
                attempt++;
                console.warn(`データ取得リトライ (${attempt}/${MAX_RETRIES})。待機: ${delayMs}ms`);
                await delay(delayMs);
                delayMs *= 2;
            } else {
                console.error("Firebaseデータ取得中にエラー:", error);
                return createEmptyData();
            }
        }
    }
    return createEmptyData();
}

async function fetchCollection(db, key) {
    const snapshot = await db.collection(FIREBASE_COLLECTIONS[key]).get();
    return snapshot.docs.map(doc => ({ ...doc.data(), _docId: doc.id }));
}

async function fetchOptionalCollection(db, key) {
    try {
        return await fetchCollection(db, key);
    } catch (error) {
        console.warn(`${key} の取得に失敗しました。空配列として続行します。`, error);
        return [];
    }
}

async function fetchAllDataFromFirebase() {
    const db = getFirestoreDb();
    if (!db) return createEmptyData();

    const [
        scores,
        sportsBets,
        speedstormRecords,
        lotteries,
        giftCodes,
        careerPosts,
        settingsDoc,
    ] = await Promise.all([
        fetchCollection(db, 'scores'),
        fetchCollection(db, 'sports_bets'),
        fetchCollection(db, 'speedstorm_records'),
        fetchCollection(db, 'lotteries'),
        fetchCollection(db, 'gift_codes'),
        fetchCollection(db, 'career_posts'),
        db.collection('settings').doc('app').get(),
    ]);

    const settings = settingsDoc.exists ? settingsDoc.data() : {};
    const record = normalizeFetchedRecord({
        scores,
        sports_bets: sportsBets,
        speedstorm_records: speedstormRecords,
        lotteries,
        gift_codes: giftCodes,
        career_posts: careerPosts,
        rate_baseline: settings.rate_baseline ?? RATE_BASELINE_DEFAULT,
        rate_reversion_rate: settings.rate_reversion_rate ?? RATE_REVERSION_RATE_DEFAULT,
        rate_reversion_flat: settings.rate_reversion_flat ?? RATE_REVERSION_FLAT_DEFAULT,
        rate_reversion_last_date: settings.rate_reversion_last_date ?? '',
        rate_reversion_last_run_at: settings.rate_reversion_last_run_at ?? '',
        rate_reversion_last_total: settings.rate_reversion_last_total ?? 0,
        attendance_allowed_users: settings.attendance_allowed_users ?? []
    });

    return record;
}

/**
 * ランキング描画用にスコアのみを取得する関数
 * @returns {Promise<Array>} スコアデータ (例: [{name: "友人A", score: 10.0}])
 */
async function fetchScores() {
    const data = await fetchAllData();
    // fetchAllDataでstatusが保証されるため、そのまま返す
    return data.scores;
}


/**
 * Firebaseに新しい全データを上書き保存する関数
 * @param {object} newData - scores, sports_bets, speedstorm_records, lotteries を含む新しい全データ
 * @returns {Promise<object>} APIからの応答
 */
async function updateAllData(newData) {
    // 書き込み前にキャッシュを破棄して次回fetchで最新を取得させる
    invalidateFetchCache();
    return updateAllDataInFirebase(newData);
}

async function replaceCollection(db, batch, key, items) {
    const collectionName = FIREBASE_COLLECTIONS[key];
    const collectionRef = db.collection(collectionName);
    const snapshot = await collectionRef.get();
    const nextIds = new Set();

    (items || []).forEach((item, index) => {
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

async function updateAllDataViaFunction(data, pointHistoryEntries) {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const token = await getFirebaseIdToken();
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const body = {
        data,
        pointHistoryEntries
    };

    const response = await fetch(`${getFunctionsBaseUrl()}/updateAllData`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || `Cloud Function Error ${response.status}`);
    }
    return result;
}

async function updateAllDataInFirebase(newData) {
    try {
        const currentData = _fetchCache || await fetchAllDataFromFirebase();
        const mergedData = normalizeFetchedRecord({ ...currentData, ...(newData || {}) });
        const pointHistoryEntries = buildRateHistoryEntries(
            currentData.scores,
            mergedData.scores,
            newData?.rate_history_meta || {}
        );
        delete mergedData.rate_history_meta;

        const functionResult = await updateAllDataViaFunction(mergedData, pointHistoryEntries);
        _fetchCache = mergedData;
        _fetchCacheTime = Date.now();
        return { status: "success", message: functionResult.message || "データをFirebaseに保存しました。", totalChange: 0 };
    } catch (error) {
        console.error("Firebase書き込み中にエラー:", error);
        return { status: "error", message: `Firebase書き込み失敗: ${error.message}`, totalChange: 0 };
    }
}

/**
 * ホームのレート推移グラフ用データ。
 * Cloud Function が point_history から組み立てた1ドキュメントを読むだけなので、
 * 未ログインのホームからでも1リクエストで済む。
 * @returns {Promise<{days: Array, players: Array, updatedAt: string}|null>}
 */
async function fetchRateChart() {
    const db = getFirestoreDb();
    if (!db) return null;
    const doc = await db.collection(RATE_CHART_COLLECTION).doc(RATE_CHART_DOC).get();
    if (!doc.exists) return null;
    const data = doc.data() || {};
    const days = Array.isArray(data.days) ? data.days : [];
    return {
        days: days.filter(day => day && typeof day.date === 'string' && day.rates),
        players: Array.isArray(data.players) ? data.players : [],
        updatedAt: String(data.updatedAt || '')
    };
}

/**
 * グラフ用データ (rate_chart/daily) を point_history から組み立て直させる。
 * 管理画面のボタンから呼ぶ。失敗したら例外を投げる。
 */
async function rebuildRateChartNow() {
    const token = await getFirebaseIdToken();
    if (!token) throw new Error('Firebaseログインが必要です。');

    const response = await fetch(`${getFunctionsBaseUrl()}/rebuildRateChart`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || `Cloud Function Error ${response.status}`);
    }
    return result;
}

/**
 * Cloud Function を経由せずに players を書き換えたとき用。
 * 失敗しても呼び出し元の処理は続ける。
 */
async function requestRateChartRebuild() {
    try {
        await rebuildRateChartNow();
    } catch (error) {
        console.error('レート推移の再構築に失敗しました:', error);
    }
}

async function saveRateReversionSettings({ baseline, rate, flat }) {
    const db = getFirestoreDb();
    if (!db) throw new Error('Firebase が設定されていません。');
    const payload = {
        rate_baseline: normalizeRate(baseline ?? RATE_BASELINE_DEFAULT),
        rate_reversion_rate: normalizeReversionRate(rate),
        rate_reversion_flat: Math.max(0, Math.round(toFiniteNumber(flat, RATE_REVERSION_FLAT_DEFAULT))),
        updatedAt: new Date().toISOString()
    };
    await db.collection('settings').doc('app').set(payload, { merge: true });
    invalidateFetchCache();
    return payload;
}

/**
 * 1日1回、全員のレートを基準へ近づける。
 * 上がりすぎた人は下げ、下がりすぎた人は上げるので、遊ばなければ約30日で
 * 全員 5000 に揃う。ログイン時に当日ぶんが未実行なら実行する。
 */
async function runDailyRateReversionIfNeeded() {
    const todayKey = getJstDateKey();
    if (_rateReversionCheckedDate === todayKey) {
        return { status: 'skipped', message: '本日分のレート補正は確認済みです。' };
    }

    if (!getCurrentFirebaseUidSync()) {
        return { status: 'skipped', message: 'ログイン前のためレート補正をスキップしました。' };
    }

    const db = getFirestoreDb();
    if (!db) return { status: 'skipped', message: 'Firebase が設定されていません。' };

    const currentData = normalizeFetchedRecord(await fetchAllDataFromFirebase());

    if (currentData.rate_reversion_last_date === todayKey) {
        _rateReversionCheckedDate = todayKey;
        return { status: 'skipped', message: '本日分のレート補正は完了済みです。' };
    }

    const baseline = currentData.rate_baseline;
    const reversionRate = currentData.rate_reversion_rate;
    const reversionFlat = currentData.rate_reversion_flat;

    let totalMoved = 0;
    const changedNames = new Set();
    const updatedScores = currentData.scores.map(player => {
        if (RATE_EXCLUDED_PLAYERS.includes(player.name)) return player;
        const delta = getRateReversionDelta(player.score, baseline, reversionRate, reversionFlat);
        if (delta === 0) return player;
        totalMoved += Math.abs(delta);
        changedNames.add(player.name);
        return { ...player, score: normalizeRate(player.score + delta) };
    });

    if (changedNames.size === 0) {
        const nowIso = new Date().toISOString();
        await db.collection('settings').doc('app').set({
            rate_reversion_last_date: todayKey,
            rate_reversion_last_run_at: nowIso,
            rate_reversion_last_total: 0,
            updatedAt: nowIso
        }, { merge: true });
        _rateReversionCheckedDate = todayKey;
        invalidateFetchCache();
        return { status: 'success', message: '補正が必要なプレイヤーはいませんでした。', date: todayKey, totalMoved: 0 };
    }

    const batch = db.batch();
    updatedScores.forEach(player => {
        if (!changedNames.has(player.name)) return;
        const payload = { ...player };
        delete payload._docId;
        batch.set(db.collection(FIREBASE_COLLECTIONS.scores).doc(getItemDocId('scores', player, 0)), payload);
    });
    addRateHistoryEntriesToBatch(db, batch, buildRateHistoryEntries(currentData.scores, updatedScores, {
        source: 'daily_rate_reversion',
        reason: `日次レート補正 基準${baseline} / ${(reversionRate * 100).toFixed(1).replace(/\.0$/, '')}%`,
        actor: 'system'
    }));

    const nowIso = new Date().toISOString();
    batch.set(db.collection('settings').doc('app'), {
        rate_baseline: baseline,
        rate_reversion_rate: reversionRate,
        rate_reversion_flat: reversionFlat,
        rate_reversion_last_date: todayKey,
        rate_reversion_last_run_at: nowIso,
        rate_reversion_last_total: totalMoved,
        updatedAt: nowIso
    }, { merge: true });

    await batch.commit();
    _rateReversionCheckedDate = todayKey;
    invalidateFetchCache();
    await requestRateChartRebuild();

    return {
        status: 'success',
        message: '日次レート補正を完了しました。',
        date: todayKey,
        rate: reversionRate,
        totalMoved
    };
}

// -----------------------------------------------------------------
// ログインボーナス (ホーム／マイページ共通)
//   押すたびに小さくレートが増えるが、押すほどペナルティ確率が上がる。
// -----------------------------------------------------------------

function getRateBonusAmount(status) {
    return RATE_BONUS_AMOUNTS[status] ?? RATE_BONUS_AMOUNTS.none;
}

function getRateBonusMemberLabel(status) {
    if (status === 'luxury') return 'Luxury';
    if (status === 'pro') return 'Pro';
    return '一般';
}

function getJstDayNumber(dateText) {
    const match = String(dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

function getElapsedBonusDays(lastDate, todayJst) {
    const lastDay = getJstDayNumber(lastDate);
    const todayDay = getJstDayNumber(todayJst);
    if (lastDay === null || todayDay === null) return lastDate === todayJst ? 0 : 1;
    return Math.max(0, todayDay - lastDay);
}

function clampBonusProbability(value) {
    return Math.min(100, Math.max(0, toFiniteNumber(value, 0)));
}

/** 日付が変わっていた場合の減衰を反映した、いまのボーナス状態 */
function getRateBonusState(player) {
    const todayJst = getJstDateKey();
    let daily = toFiniteNumber(player?.dailyProbability, 0);
    let accumulated = toFiniteNumber(player?.accumulatedProbability, 0);
    let pressCount = Math.max(0, Math.floor(toFiniteNumber(player?.dailyPressCount, 0)));

    const elapsedDays = getElapsedBonusDays(player?.lastBonusDate || '', todayJst);
    if (elapsedDays > 0) {
        daily = 0;
        accumulated = Math.max(0, accumulated - 5 * elapsedDays);
        pressCount = 0;
    }

    return {
        todayJst,
        daily,
        accumulated,
        pressCount,
        total: clampBonusProbability(daily + accumulated),
        status: player?.status || 'none',
        bonusAmount: getRateBonusAmount(player?.status || 'none'),
        memberLabel: getRateBonusMemberLabel(player?.status || 'none')
    };
}

/**
 * ログインボーナスを1回受け取り、結果を返す。
 * 画面表示はホーム・マイページそれぞれで行う。
 */
async function claimRateBonus(playerName) {
    if (!playerName) return { status: 'error', message: '認証エラーが発生しました。' };

    const currentData = await fetchAllData();
    const scoresMap = new Map(currentData.scores.map(player => [player.name, player]));
    const player = scoresMap.get(playerName);
    if (!player) return { status: 'error', message: `プレイヤー ${playerName} が見つかりません。` };

    const state = getRateBonusState(player);
    let { daily, accumulated, pressCount } = state;

    const penaltyOccurred = Math.random() * 100 < state.total;
    let delta = 0;

    if (penaltyOccurred) {
        delta -= RATE_BONUS_PENALTY;
        // ペナルティを引いたぶんだけ確率も戻す (会員ほど戻りが大きい)
        if (state.status === 'luxury') accumulated = Math.max(0, accumulated - 8);
        else if (state.status === 'pro') accumulated = Math.max(0, accumulated - 5);
        else daily = Math.max(0, daily - 10);
    } else {
        delta += state.bonusAmount;
        daily += 5;
        if (pressCount >= 1) accumulated += 10;
    }

    const specialBonusOccurred = !penaltyOccurred && Math.random() * 100 < RATE_BONUS_SPECIAL_PERCENT;
    if (specialBonusOccurred) delta += RATE_BONUS_SPECIAL;
    pressCount += 1;

    const beforeRate = normalizeRate(player.score);
    const newRate = normalizeRate(beforeRate + delta);

    scoresMap.set(playerName, {
        ...player,
        score: newRate,
        lastBonusDate: state.todayJst,
        dailyProbability: daily,
        accumulatedProbability: accumulated,
        dailyPressCount: pressCount,
        lastBonusTime: new Date().toISOString()
    });

    const response = await updateAllData({
        scores: Array.from(scoresMap.values()),
        rate_history_meta: { source: 'login_bonus', reason: 'ログインボーナス' }
    });

    if (response.status !== 'success') {
        return { status: 'error', message: response.message || 'ボーナスの保存に失敗しました。' };
    }

    return {
        status: 'success',
        penaltyOccurred,
        specialBonusOccurred,
        bonusAmount: state.bonusAmount,
        delta: newRate - beforeRate,
        newRate,
        daily,
        accumulated,
        pressCount,
        total: clampBonusProbability(daily + accumulated)
    };
}

/** ボーナス結果の文言。ホームとマイページで同じ表現を使う */
function describeRateBonusResult(result) {
    if (result.penaltyOccurred) {
        return `⚠️ ボーナス外れ。ペナルティ -${RATE_BONUS_PENALTY}`;
    }
    let message = `✅ ボーナス +${result.bonusAmount} を獲得しました！`;
    if (result.specialBonusOccurred) {
        message += ` 🎉 特別ボーナス +${RATE_BONUS_SPECIAL}`;
    }
    return message;
}

/** ボタンから浮き上がる増減表示 */
function getRateBonusFloatText(result) {
    const delta = toFiniteNumber(result.delta, 0);
    return `${delta > 0 ? '+' : ''}${delta}`;
}

/** ボーナス受け取り時の演出。container は position:relative であること */
function triggerRateBonusAnimation(container, type, floatText) {
    if (!container) return;

    const animClass = type === 'success' ? 'bonus-animate-success' : 'bonus-animate-penalty';
    container.classList.remove('bonus-animate-success', 'bonus-animate-penalty');
    void container.offsetWidth; // reflow で再トリガー
    container.classList.add(animClass);

    const floatEl = document.createElement('span');
    floatEl.className = 'bonus-float-text';
    floatEl.textContent = floatText;
    floatEl.style.color = type === 'success' ? '#38c172' : '#e74c3c';
    container.appendChild(floatEl);
    floatEl.addEventListener('animationend', () => floatEl.remove());
}

// -----------------------------------------------------------------
// 共通ヘルパー関数
// -----------------------------------------------------------------

/**
 * 画面下のトースト通知を表示する (success/errorの結果通知用)
 * @param {string} message - 表示するテキスト
 * @param {('success'|'error')} type - メッセージのタイプ
 */
function showToast(message, type) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // 同時表示は3件まで
    while (container.children.length > 3) {
        container.removeChild(container.firstChild);
    }

    setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 500);
    }, type === 'error' ? 6000 : 3500);
}

/**
 * HTML要素にメッセージを表示するヘルパー関数
 * 成功/情報は5秒で自動的に消え、エラーは✕で閉じるまで表示し続ける。
 * 成功/エラーは画面下のトーストにも表示する (フォームが画面外でも見逃さないように)。
 * @param {HTMLElement} element - メッセージを表示する要素
 * @param {string} message - 表示するテキスト
 * @param {('success'|'error'|'info')} type - メッセージのタイプ
 */
function showMessage(element, message, type) {
    if (element) {
        if (element._hideTimer) {
            clearTimeout(element._hideTimer);
            element._hideTimer = null;
        }

        element.textContent = message;
        element.className = 'message';
        if (type === 'success' || type === 'error' || type === 'info') {
            element.classList.add(type);
        }
        element.classList.remove('hidden');

        if (type === 'error') {
            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'message-close';
            closeButton.setAttribute('aria-label', 'メッセージを閉じる');
            closeButton.textContent = '✕';
            closeButton.addEventListener('click', () => element.classList.add('hidden'));
            element.appendChild(closeButton);
        } else {
            element._hideTimer = setTimeout(() => {
                element.classList.add('hidden');
            }, 5000);
        }
    }

    if (type === 'success' || type === 'error') {
        showToast(message, type);
    }
}

// 共通パスワードを定義 (master.jsとmahjong.jsで使用)
// ★ 修正: ハードコードされたパスワードを削除し、マスターユーザー名に置き換える
const MASTER_USERNAME = "Kabocha";


/**
 * 管理画面へのリンクは、マスターアカウントでログインしているときだけ表示する。
 * [hidden] だけでは .footer-nav .input-link の display: flex に負けるため、
 * style.css 側に .footer-nav .input-link[hidden] { display: none } を置いてある。
 */
function refreshMasterNavLinks() {
    const isMaster = localStorage.getItem('authUsername') === MASTER_USERNAME;
    document.querySelectorAll('[data-master-only]').forEach(element => {
        element.hidden = !isMaster;
    });
}
window.refreshMasterNavLinks = refreshMasterNavLinks;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshMasterNavLinks, { once: true });
} else {
    refreshMasterNavLinks();
}
