// assets/js/common.js

// ★★★ JSONBin.io の設定情報 (APIキーとBIN IDを削除し、関数エンドポイントに変更) ★★★

// Netlify Functionのエンドポイントを定義
// クライアント側ではAPIキーなしで、サーバーレス関数を呼び出す
const FETCH_URL = "/.netlify/functions/fetch-data";
const UPDATE_URL = "/.netlify/functions/update-data";

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

function getNeutralTerritoryDefense(area) {
    return parseFloat(Math.min(15, Math.max(5, area / TERRITORY_AVERAGE_WARD_AREA * 7)).toFixed(1));
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
 * Netlify Functionを経由して、最新の全データを取得する関数
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
            // Netlify Functionを呼び出す
            const response = await fetch(FETCH_URL, {
                method: 'GET',
                // APIキーはサーバーレス関数側で設定するため、ヘッダーから削除
            });
            
            if (response.status === 429) {
                // 429エラーの場合はリトライ
                throw new Error('429 Too Many Requests');
            }

            if (!response.ok) {
                // Netlify Functionからのエラーメッセージを受け取る
                const errorData = await response.json();
                throw new Error(`データ取得エラー: ${response.status} ${errorData.error || response.statusText}`);
            }
            
            // 関数側で既にデータ構造の調整が行われているため、そのまま record として扱う
            const record = await response.json();

            // スペシャルテーマをキャッシュして適用
            if (record.special_theme !== undefined) {
                localStorage.setItem('specialTheme', JSON.stringify(record.special_theme || null));
                applySpecialTheme(record.special_theme);
            }

            return record;
        
        } catch (error) {
            // 429エラーか、その他のリトライすべきネットワークエラーの場合
            if (error.message.includes('429') || attempt < MAX_RETRIES - 1) {
                attempt++;
                console.warn(`データ取得リトライ (${attempt}/${MAX_RETRIES})。待機: ${delayMs}ms`);
                await delay(delayMs);
                delayMs *= 2; // 指数バックオフ
            } else {
                console.error("ポイントデータ取得中にエラー:", error);
                // 最終的に失敗した場合、空の初期データを返す
                return { scores: [], sports_bets: [], speedstorm_records: [], lotteries: [], territory_battle: createDefaultTerritoryBattle() };
            }
        }
    }
     // 最終リトライ後も失敗した場合
     console.error("ポイントデータ取得に失敗しました。最大リトライ回数を超えました。");
     return { scores: [], sports_bets: [], speedstorm_records: [], lotteries: [], territory_battle: createDefaultTerritoryBattle() };
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
 * Netlify Functionを経由して、新しい全データを上書き保存する関数 (PUT)
 * @param {object} newData - scores, sports_bets, speedstorm_records, lotteries を含む新しい全データ
 * @returns {Promise<object>} APIからの応答
 */
async function updateAllData(newData) {
    // 書き込み前にキャッシュを破棄して次回fetchで最新を取得させる
    invalidateFetchCache();

    const MAX_RETRIES = 3;
    let attempt = 0;
    let delayMs = 1000;

    while (attempt < MAX_RETRIES) {
        try {
            // ★ 修正: Netlify Functionを呼び出す
            const response = await fetch(UPDATE_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    // APIキーはサーバーレス関数側で設定するため、ヘッダーから削除
                },
                body: JSON.stringify(newData)
            });
            
            if (response.status === 429) {
                throw new Error('429 Too Many Requests on PUT');
            }

            if (!response.ok) {
                 // Netlify Functionからのエラーメッセージを受け取る
                const errorData = await response.json();
                throw new Error(`データ書き込みエラー: ${response.status} ${errorData.message || response.statusText}`);
            }

            // 関数からの応答をそのまま返す
            const data = await response.json();
            return data;
        } catch (error) {
             if (error.message.includes('429') || attempt < MAX_RETRIES - 1) {
                attempt++;
                console.warn(`データ書き込みリトライ (${attempt}/${MAX_RETRIES})。待機: ${delayMs}ms`);
                await delay(delayMs);
                delayMs *= 2; // 指数バックオフ
            } else {
                console.error("ポイントデータ書き込み中にエラー:", error);
                return { status: "error", message: `データ書き込み失敗: ${error.message}`, totalChange: 0 };
            }
        }
    }
    console.error("ポイントデータ書き込みに失敗しました。最大リトライ回数を超えました。");
    return { status: "error", message: `データ書き込み失敗: 最大リトライ回数を超えました`, totalChange: 0 };
}

// -----------------------------------------------------------------
// 東京19区 陣取り合戦
// -----------------------------------------------------------------

function createDefaultTerritoryBattle() {
    return {
        seasonId: 'tokyo-19-1',
        status: 'open',
        updatedAt: new Date().toISOString(),
        tiles: TOKYO_WARDS.map(ward => ({
            id: ward.id,
            name: ward.name,
            area: ward.area,
            owner: null,
            defense: getNeutralTerritoryDefense(ward.area)
        })),
        actions: []
    };
}

function normalizeTerritoryBattle(battle) {
    const normalized = battle && Array.isArray(battle.tiles) ? battle : createDefaultTerritoryBattle();
    const tileMap = new Map(normalized.tiles.map(tile => [tile.id, tile]));

    return {
        seasonId: normalized.seasonId || 'tokyo-19-1',
        status: normalized.status || 'open',
        updatedAt: normalized.updatedAt || new Date().toISOString(),
        tiles: TOKYO_WARDS.map(ward => {
            const existing = tileMap.get(ward.id) || {};
            const existingDefense = parseFloat(existing.defense);
            const defense = existing.owner
                ? Math.max(0, existingDefense || 0)
                : Math.max(getNeutralTerritoryDefense(ward.area), existingDefense || 0);
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
        ? Math.min(10, Math.max(0.5, (area / TERRITORY_AVERAGE_WARD_AREA) * 3))
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
