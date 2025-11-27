// assets/js/common.js

// ★★★ JSONBin.io の設定情報 (APIキーとBIN IDを削除し、関数エンドポイントに変更) ★★★

// Netlify Functionのエンドポイントを定義
// クライアント側ではAPIキーなしで、サーバーレス関数を呼び出す
const FETCH_URL = "/.netlify/functions/fetch-data";
const UPDATE_URL = "/.netlify/functions/update-data";
// ★ 新規追加: PvPゲームデータ用のエンドポイント
const PVP_FETCH_URL = "/.netlify/functions/pvp-data?method=GET";
const PVP_UPDATE_URL = "/.netlify/functions/pvp-data?method=PUT";


// -----------------------------------------------------------------
// データ取得 (GET)
// -----------------------------------------------------------------

// リトライを制御するヘルパー関数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Netlify Functionを経由して、最新の全データ（スコア、くじなど）を取得する関数
 * @returns {Promise<object>} 全データ (scores, sports_bets, speedstorm_records, lotteries)
 */
async function fetchAllData() {
    const MAX_RETRIES = 3;
    let attempt = 0;
    let delayMs = 1000;

    while (attempt < MAX_RETRIES) {
        try {
            // ★ 修正: Netlify Functionを呼び出す
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
                return { scores: [], history: [], sports_bets: [], speedstorm_records: [], lotteries: [] };
            }
        }
    }
     // 最終リトライ後も失敗した場合
     console.error("ポイントデータ取得に失敗しました。最大リトライ回数を超えました。");
     return { scores: [], history: [], sports_bets: [], speedstorm_records: [], lotteries: [] };
}

/**
 * ★ 修正: ランキングデータとパスワードハッシュを含む全プレイヤー情報を取得する関数
 * @returns {Promise<Array>} スコアデータ (例: [{name: "友人A", score: 10.0, passwordHash: "..."}])
 */
async function fetchPlayerData() {
    const data = await fetchAllData();
    // scores配列には既にpasswordHashが含まれていることを想定
    return data.scores;
}

/**
 * PvPログイン画面用にスコアのみ（表示名）を取得する関数
 * @returns {Promise<Array>} スコアデータ (例: [{name: "友人A", score: 10.0}])
 */
async function fetchScoresForLogin() {
    // パスワード認証のために全プレイヤーデータを取得し、名前とスコアのみを返す
    const allPlayers = await fetchPlayerData();
    return allPlayers.map(p => ({
        name: p.name,
        score: p.score
    }));
}


/**
 * Netlify Functionを経由して、新しい全データ（スコア、くじなど）を上書き保存する関数 (PUT)
 * @param {object} newData - scores, sports_bets, speedstorm_records, lotteries を含む新しい全データ
 * @returns {Promise<object>} APIからの応答
 */
async function updateAllData(newData) {
    // historyは保存しないため、念のため削除
    if (newData.history) {
        delete newData.history;
    }
    
    // lotteriesの有無チェックとマージのロジックはサーバーレス関数側に移すか、呼び出し元が完全なデータを渡すことを前提とする
    // ここでは呼び出し元が完全なデータを渡すことを前提とする

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
// ★★★ 新規追加: PvPデータ取得・更新 (GET / PUT) ★★★
// -----------------------------------------------------------------

/**
 * Netlify Functionを経由して、最新のPvP全データを取得する関数
 * @returns {Promise<object>} PvP全データ (pvp_games)
 */
async function fetchPvpData() {
    const MAX_RETRIES = 3;
    let attempt = 0;
    let delayMs = 1000;

    while (attempt < MAX_RETRIES) {
        try {
            const response = await fetch(PVP_FETCH_URL, {
                method: 'GET',
            });
            
            if (response.status === 429) {
                throw new Error('429 Too Many Requests (PVP GET)');
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`PvPデータ取得エラー: ${response.status} ${errorData.error || response.statusText}`);
            }
            
            const record = await response.json();
            // pvp_games配列を保証
            record.pvp_games = record.pvp_games || [];
            return record;
        
        } catch (error) {
            if (error.message.includes('429') || attempt < MAX_RETRIES - 1) {
                attempt++;
                console.warn(`PvPデータ取得リトライ (${attempt}/${MAX_RETRIES})。待機: ${delayMs}ms`);
                await delay(delayMs);
                delayMs *= 2;
            } else {
                console.error("PvPデータ取得中にエラー:", error);
                return { pvp_games: [] };
            }
        }
    }
     console.error("PvPデータ取得に失敗しました。最大リトライ回数を超えました。");
     return { pvp_games: [] };
}

/**
 * Netlify Functionを経由して、新しいPvP全データを上書き保存する関数 (PUT)
 * @param {object} newData - pvp_games を含む新しい全データ
 * @returns {Promise<object>} APIからの応答
 */
async function updatePvpData(newData) {
    const MAX_RETRIES = 3;
    let attempt = 0;
    let delayMs = 1000;

    while (attempt < MAX_RETRIES) {
        try {
            const response = await fetch(PVP_UPDATE_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newData)
            });
            
            if (response.status === 429) {
                throw new Error('429 Too Many Requests (PVP PUT)');
            }

            if (!response.ok) {
                 const errorData = await response.json();
                throw new Error(`PvPデータ書き込みエラー: ${response.status} ${errorData.message || response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
             if (error.message.includes('429') || attempt < MAX_RETRIES - 1) {
                attempt++;
                console.warn(`PvPデータ書き込みリトライ (${attempt}/${MAX_RETRIES})。待機: ${delayMs}ms`);
                await delay(delayMs);
                delayMs *= 2;
            } else {
                console.error("PvPデータ書き込み中にエラー:", error);
                return { status: "error", message: `PvPデータ書き込み失敗: ${error.message}` };
            }
        }
    }
    console.error("PvPデータ書き込みに失敗しました。最大リトライ回数を超えました。");
    return { status: "error", message: `PvPデータ書き込み失敗: 最大リトライ回数を超えました` };
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
