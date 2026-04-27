// assets/js/common.js

const FIREBASE_COLLECTIONS = {
    scores: 'players',
    sports_bets: 'sports_bets',
    speedstorm_records: 'speedstorm_records',
    lotteries: 'lotteries',
    gift_codes: 'gift_codes',
    exercise_reports: 'exercise_reports',
    career_posts: 'career_posts'
};
let _firebaseFirestoreSettingsApplied = false;

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
    const auth = getFirebaseAuth();
    if (!auth || !auth.currentUser) return null;
    return auth.currentUser.getIdToken();
}

function createEmptyData() {
    return {
        scores: [],
        sports_bets: [],
        speedstorm_records: [],
        lotteries: [],
        gift_codes: [],
        exercise_reports: [],
        career_posts: [],
        territory_battle: createDefaultTerritoryBattle(),
        special_theme: null,
        attendance_allowed_users: []
    };
}

function normalizeFetchedRecord(record) {
    const normalized = { ...createEmptyData(), ...(record || {}) };
    normalized.scores = (normalized.scores || []).map(player => ({
        ...player,
        status: player.status || 'none'
    }));
    normalized.territory_battle = normalizeTerritoryBattle(normalized.territory_battle);
    normalized.attendance_allowed_users = Array.isArray(normalized.attendance_allowed_users)
        ? normalized.attendance_allowed_users.filter(Boolean)
        : [];
    return normalized;
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
    if (key === 'exercise_reports') return toDocId(item.id ?? `exercise_${index}`);
    if (key === 'career_posts') return toDocId(item.id ?? `career_${index}`);
    if (key === 'speedstorm_records') return toDocId(item.id ?? item.player ?? `speedstorm_${index}`);
    return toDocId(item.id ?? index);
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
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${databaseId}/documents`;
    const keyQuery = `key=${encodeURIComponent(config.apiKey)}`;

    function docUrl(path) {
        return `${baseUrl}/${path.split('/').map(encodeURIComponent).join('/')}?${keyQuery}`;
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
                await request(docUrl(path), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fields: firestoreFieldsFromJson(data) })
                });
            },
            async update(data) {
                await this.set(data);
            },
            async delete() {
                await request(docUrl(path), { method: 'DELETE' });
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
            const operations = [];
            return {
                set: (docRef, data) => operations.push(() => docRef.set(data)),
                delete: docRef => operations.push(() => docRef.delete()),
                commit: async () => {
                    for (const operation of operations) {
                        await operation();
                    }
                }
            };
        },
        async runTransaction(updateFunction) {
            const transaction = {
                get: docRef => docRef.get(),
                update: (docRef, data) => docRef.update(data),
                delete: docRef => docRef.delete()
            };
            return updateFunction(transaction);
        }
    };
}

const TOKYO_WARDS = [
    { id: 'nerima', name: '練馬区', area: 48.08, row: 1, col: 1 },
    { id: 'toshima', name: '豊島区', area: 13.01, row: 1, col: 2 },
    { id: 'bunkyo', name: '文京区', area: 11.29, row: 1, col: 3 },
    { id: 'arakawa', name: '荒川区', area: 10.16, row: 1, col: 4 },
    { id: 'adachi', name: '足立区', area: 53.25, row: 1, col: 5 },
    { id: 'katsushika', name: '葛飾区', area: 34.80, row: 1, col: 6 },
    { id: 'shinjuku', name: '新宿区', area: 18.22, row: 2, col: 2 },
    { id: 'chiyoda', name: '千代田区', area: 11.66, row: 2, col: 3 },
    { id: 'taito', name: '台東区', area: 10.11, row: 2, col: 4 },
    { id: 'sumida', name: '墨田区', area: 13.77, row: 2, col: 5 },
    { id: 'edogawa', name: '江戸川区', area: 49.90, row: 2, col: 6 },
    { id: 'setagaya', name: '世田谷区', area: 58.05, row: 3, col: 1 },
    { id: 'shibuya', name: '渋谷区', area: 15.11, row: 3, col: 2 },
    { id: 'minato', name: '港区', area: 20.37, row: 3, col: 3 },
    { id: 'chuo', name: '中央区', area: 10.21, row: 3, col: 4 },
    { id: 'koto', name: '江東区', area: 40.16, row: 3, col: 5 },
    { id: 'meguro', name: '目黒区', area: 14.67, row: 4, col: 1 },
    { id: 'shinagawa', name: '品川区', area: 22.84, row: 4, col: 2 },
    { id: 'ota', name: '大田区', area: 60.66, row: 5, col: 2 }
];

const TERRITORY_AVERAGE_WARD_AREA = TOKYO_WARDS.reduce((sum, ward) => sum + ward.area, 0) / TOKYO_WARDS.length;

function getNeutralTerritoryDefense(area, multiplier = 1) {
    return parseFloat((Math.min(15, Math.max(5, area / TERRITORY_AVERAGE_WARD_AREA * 7)) * multiplier).toFixed(1));
}

function getTerritorySeasonNumber(battle) {
    const explicitSeason = parseInt(battle && battle.seasonNumber, 10);
    if (Number.isFinite(explicitSeason) && explicitSeason > 0) return explicitSeason;

    const seasonMatch = String((battle && battle.seasonId) || '').match(/-(\d+)$/);
    const parsedSeason = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;
    return Number.isFinite(parsedSeason) && parsedSeason > 0 ? parsedSeason : 1;
}

function getTerritoryNeutralDefenseMultiplier(seasonNumber) {
    return parseFloat(Math.pow(1.05, Math.max(0, seasonNumber - 1)).toFixed(4));
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

async function fetchAllDataFromFirebase() {
    const db = getFirestoreDb();
    if (!db) return createEmptyData();

    const [
        scores,
        sportsBets,
        speedstormRecords,
        lotteries,
        giftCodes,
        exerciseReports,
        careerPosts,
        settingsDoc,
        territoryDoc
    ] = await Promise.all([
        fetchCollection(db, 'scores'),
        fetchCollection(db, 'sports_bets'),
        fetchCollection(db, 'speedstorm_records'),
        fetchCollection(db, 'lotteries'),
        fetchCollection(db, 'gift_codes'),
        fetchCollection(db, 'exercise_reports'),
        fetchCollection(db, 'career_posts'),
        db.collection('settings').doc('app').get(),
        db.collection('territory_battle').doc('current').get()
    ]);

    const settings = settingsDoc.exists ? settingsDoc.data() : {};
    const record = normalizeFetchedRecord({
        scores,
        sports_bets: sportsBets,
        speedstorm_records: speedstormRecords,
        lotteries,
        gift_codes: giftCodes,
        exercise_reports: exerciseReports,
        career_posts: careerPosts,
        territory_battle: territoryDoc.exists ? territoryDoc.data() : null,
        special_theme: settings.special_theme ?? null,
        attendance_allowed_users: settings.attendance_allowed_users ?? []
    });

    if (record.special_theme !== undefined) {
        localStorage.setItem('specialTheme', JSON.stringify(record.special_theme || null));
        applySpecialTheme(record.special_theme);
    }

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

async function updateAllDataInFirebase(newData) {
    try {
        const db = getFirestoreDb();
        const currentData = _fetchCache || await fetchAllDataFromFirebase();
        const mergedData = normalizeFetchedRecord({ ...currentData, ...(newData || {}) });
        const batch = db.batch();

        for (const key of Object.keys(FIREBASE_COLLECTIONS)) {
            await replaceCollection(db, batch, key, mergedData[key] || []);
        }

        batch.set(db.collection('settings').doc('app'), {
            special_theme: mergedData.special_theme ?? null,
            attendance_allowed_users: mergedData.attendance_allowed_users || [],
            updatedAt: new Date().toISOString()
        }, { merge: true });
        batch.set(db.collection('territory_battle').doc('current'), {
            ...normalizeTerritoryBattle(mergedData.territory_battle),
            updatedAt: new Date().toISOString()
        }, { merge: false });

        await batch.commit();
        _fetchCache = mergedData;
        _fetchCacheTime = Date.now();
        return { status: "success", message: "データをFirebaseに保存しました。", totalChange: 0 };
    } catch (error) {
        console.error("Firebase書き込み中にエラー:", error);
        return { status: "error", message: `Firebase書き込み失敗: ${error.message}`, totalChange: 0 };
    }
}

async function submitExerciseReportToFirebase({ player, distance, pace, imageFile }) {
    const storage = getFirebaseStorage();
    const db = getFirestoreDb();
    if (!storage || !db) {
        throw new Error('Firebase Storage が設定されていません。');
    }

    const distanceNum = parseFloat(distance);
    const paceMatch = String(pace).match(/(\d+)'(\d+)/);
    let suspicious = false;
    if (paceMatch) {
        const paceMin = parseInt(paceMatch[1], 10) + parseInt(paceMatch[2], 10) / 60;
        suspicious = paceMin < 4.0;
    }

    const reportId = `ex_${Date.now()}`;
    const extension = (imageFile.name.split('.').pop() || 'jpg').toLowerCase();
    const imagePath = `exercise_reports/${reportId}.${extension}`;
    const imageRef = storage.ref().child(imagePath);
    await imageRef.put(imageFile, { contentType: imageFile.type || 'image/jpeg' });
    const imageUrl = await imageRef.getDownloadURL();
    const points = parseFloat((distanceNum * 10).toFixed(1));

    const report = {
        id: reportId,
        player,
        submittedAt: new Date().toISOString(),
        distance: distanceNum,
        pace,
        imageUrl,
        storagePath: imagePath,
        status: 'pending',
        points,
        suspicious
    };

    await db.collection(FIREBASE_COLLECTIONS.exercise_reports).doc(reportId).set(report);
    invalidateFetchCache();
    return { status: 'success', message: '運動申請を送信しました。', points, suspicious };
}

async function handleExerciseActionInFirebase(reportId, action) {
    const db = getFirestoreDb();
    if (!db) throw new Error('Firebase が設定されていません。');
    if (!['approve', 'reject'].includes(action)) throw new Error('不正な操作です。');

    let message = '';
    await db.runTransaction(async transaction => {
        const reportRef = db.collection(FIREBASE_COLLECTIONS.exercise_reports).doc(toDocId(reportId));
        const reportDoc = await transaction.get(reportRef);
        if (!reportDoc.exists) throw new Error('申請が見つかりません。');

        const report = reportDoc.data();
        if (action === 'approve') {
            const playerRef = db.collection(FIREBASE_COLLECTIONS.scores).doc(toDocId(report.player));
            const playerDoc = await transaction.get(playerRef);
            if (!playerDoc.exists) throw new Error('プレイヤーが見つかりません。');
            const player = playerDoc.data();
            const nextScore = parseFloat(((player.score || 0) + report.points).toFixed(1));
            transaction.update(playerRef, { score: nextScore });
            message = `✅ ${report.player} の申請を承認し、${report.points}P を付与しました。`;
        } else {
            message = `❌ ${report.player} の申請を却下しました。`;
        }
        transaction.delete(reportRef);
    });

    invalidateFetchCache();
    return { status: 'success', message };
}

// -----------------------------------------------------------------
// 東京19区 陣取り合戦
// -----------------------------------------------------------------

function createDefaultTerritoryBattle(seasonNumber = 1) {
    const normalizedSeasonNumber = Math.max(1, parseInt(seasonNumber, 10) || 1);
    const neutralDefenseMultiplier = getTerritoryNeutralDefenseMultiplier(normalizedSeasonNumber);
    return {
        seasonId: `tokyo-19-${normalizedSeasonNumber}`,
        seasonNumber: normalizedSeasonNumber,
        neutralDefenseMultiplier,
        status: 'open',
        updatedAt: new Date().toISOString(),
        tiles: TOKYO_WARDS.map(ward => ({
            id: ward.id,
            name: ward.name,
            area: ward.area,
            owner: null,
            defense: getNeutralTerritoryDefense(ward.area, neutralDefenseMultiplier)
        })),
        actions: []
    };
}

function normalizeTerritoryBattle(battle) {
    const normalized = battle && Array.isArray(battle.tiles) ? battle : createDefaultTerritoryBattle();
    const seasonNumber = getTerritorySeasonNumber(normalized);
    const existingMultiplier = parseFloat(normalized.neutralDefenseMultiplier);
    const neutralDefenseMultiplier = Number.isFinite(existingMultiplier) && existingMultiplier > 0
        ? existingMultiplier
        : getTerritoryNeutralDefenseMultiplier(seasonNumber);
    const tileMap = new Map(normalized.tiles.map(tile => [tile.id, tile]));

    return {
        seasonId: normalized.seasonId || `tokyo-19-${seasonNumber}`,
        seasonNumber,
        neutralDefenseMultiplier,
        status: normalized.status || 'open',
        updatedAt: normalized.updatedAt || new Date().toISOString(),
        tiles: TOKYO_WARDS.map(ward => {
            const existing = tileMap.get(ward.id) || {};
            const existingDefense = parseFloat(existing.defense);
            const hasExistingDefense = Number.isFinite(existingDefense);
            const defense = hasExistingDefense
                ? Math.max(0, existingDefense)
                : getNeutralTerritoryDefense(ward.area, neutralDefenseMultiplier);
            return {
                id: ward.id,
                name: ward.name,
                area: ward.area,
                owner: existing.owner || null,
                defense
            };
        }),
        actions: Array.isArray(normalized.actions) ? normalized.actions.slice(-30) : []
    };
}

function getTerritoryTileMeta(tileId) {
    return TOKYO_WARDS.find(ward => ward.id === tileId) || null;
}

function getGridAdjacentTerritoryIds(tileId) {
    const target = getTerritoryTileMeta(tileId);
    if (!target) return [];

    return TOKYO_WARDS
        .filter(ward => Math.abs(ward.row - target.row) + Math.abs(ward.col - target.col) === 1)
        .map(ward => ward.id);
}

function getPlayerTerritoryStats(playerName, battle) {
    const normalized = normalizeTerritoryBattle(battle);
    const ownedTiles = normalized.tiles.filter(tile => tile.owner === playerName);
    const area = ownedTiles.reduce((sum, tile) => sum + tile.area, 0);
    const reduction = area > 0
        ? Math.max(0.5, (area / TERRITORY_AVERAGE_WARD_AREA) * 3)
        : 0;

    return {
        count: ownedTiles.length,
        area: parseFloat(area.toFixed(2)),
        reduction: parseFloat(reduction.toFixed(1)),
        tiles: ownedTiles
    };
}


// -----------------------------------------------------------------
// 共通ヘルパー関数
// -----------------------------------------------------------------

/**
 * HTML要素にメッセージを表示するヘルパー関数
 * @param {HTMLElement} element - メッセージを表示する要素
 * @param {string} message - 表示するテキスト
 * @param {('success'|'error'|'info')} type - メッセージのタイプ
 */
function showMessage(element, message, type) {
    // ★ 修正: 'info' タイプに対応
    element.textContent = message;
    element.className = 'message';
    if (type === 'success') {
        element.classList.add('success');
    } else if (type === 'error') {
        element.classList.add('error');
    } else if (type === 'info') {
        element.classList.add('info');
    }
    
    element.classList.remove('hidden');
    
    // 5秒後にメッセージを非表示にする (既存の3秒から延長)
    setTimeout(() => {
        if (element) { // 要素がまだ存在するか確認
            element.classList.add('hidden');
        }
    }, 5000);
}

// 共通パスワードを定義 (master.jsとmahjong.jsで使用)
// ★ 修正: ハードコードされたパスワードを削除し、マスターユーザー名に置き換える
const MASTER_USERNAME = "Kabocha";

// -----------------------------------------------------------------
// スペシャルテーマ適用
// -----------------------------------------------------------------

/**
 * special_theme データを元に special.css を動的に読み込む
 * @param {object|null} themeData - { startDate, endDate, label } または null
 */
function applySpecialTheme(themeData) {
    if (!themeData || !themeData.startDate || !themeData.endDate) return;
    const now   = new Date();
    const start = new Date(themeData.startDate + 'T00:00:00');
    const end   = new Date(themeData.endDate   + 'T23:59:59');
    if (now >= start && now <= end) {
        if (!document.getElementById('special-theme-css')) {
            const link = document.createElement('link');
            link.id   = 'special-theme-css';
            link.rel  = 'stylesheet';
            link.href = 'assets/css/special.css';
            document.head.appendChild(link);
        }
        document.documentElement.classList.add('special-theme');
    } else {
        document.documentElement.classList.remove('special-theme');
        const existing = document.getElementById('special-theme-css');
        if (existing) existing.remove();
    }
}

// ページ読み込み時にキャッシュから即時適用（フラッシュ防止）
(function () {
    try {
        const cached = localStorage.getItem('specialTheme');
        if (cached) applySpecialTheme(JSON.parse(cached));
    } catch (e) { /* キャッシュ破損時は無視 */ }
})();
