// assets/js/common.js

// ★★★ JSONBin.io の設定情報 (APIキーとBIN IDを削除し、関数エンドポイントに変更) ★★★

// Netlify Functionのエンドポイントを定義
// クライアント側ではAPIキーなしで、サーバーレス関数を呼び出す
const FETCH_URL = "/.netlify/functions/fetch-data";
const UPDATE_URL = "/.netlify/functions/update-data";

const PVP_FETCH_URL = "/.netlify/functions/pvp-fetch";
const PVP_ACTION_URL = "/.netlify/functions/pvp-action";


// -----------------------------------------------------------------
// データ取得 (GET)
// -----------------------------------------------------------------

// リトライを制御するヘルパー関数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Netlify Functionを経由して、最新の全データを取得する関数
 * @returns {Promise<object>} 全データ (scores, sports_bets, lotteries)
 */
async function fetchAllData() {
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
                return { scores: [], history: [], sports_bets: [], lotteries: [], electric_chair_games: [] };
            }
        }
    }
     // 最終リトライ後も失敗した場合
     console.error("ポイントデータ取得に失敗しました。最大リトライ回数を超えました。");
     return { scores: [], history: [], sports_bets: [], lotteries: [], electric_chair_games: [] };
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
 * @param {object} newData - scores, sports_bets, lotteries を含む新しい全データ
 * @returns {Promise<object>} APIからの応答
 */
async function updateAllData(newData) {
    // historyは保存しないため、念のため削除
    if (newData.history) {
        delete newData.history;
    }
    
    const MAX_RETRIES = 3;
    let attempt = 0;
    let delayMs = 1000;

    while (attempt < MAX_RETRIES) {
        try {
            const response = await fetch(UPDATE_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newData)
            });
            
            if (response.status === 429) {
                throw new Error('429 Too Many Requests on PUT');
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`データ書き込みエラー: ${response.status} ${errorData.message || response.statusText}`);
            }

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

/**
 * Netlify Functionを経由して、PVPゲームのアクションを実行する関数 (POST)
 * @param {object} actionData - action, gameId, roomCode, actionToken, player, input などの情報
 * @returns {Promise<object>} APIからの応答 (status, message, actionToken, gameData, shockResult)
 */
async function sendPvpAction(actionData) {
    const MAX_RETRIES = 3;
    let attempt = 0;
    let delayMs = 1000;

    while (attempt < MAX_RETRIES) {
        try {
            const response = await fetch(PVP_ACTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(actionData)
            });
            
            if (response.status === 429) {
                throw new Error('429 Too Many Requests on POST');
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || response.statusText);
            }

            return data;
        } catch (error) {
             if (error.message.includes('429') || attempt < MAX_RETRIES - 1) {
                attempt++;
                console.warn(`PVPアクションリトライ (${attempt}/${MAX_RETRIES})。待機: ${delayMs}ms`);
                await delay(delayMs);
                delayMs *= 2; // 指数バックオフ
            } else {
                console.error("PVPアクション中にエラー:", error);
                return { status: "error", message: `PVPアクション失敗: ${error.message}` };
            }
        }
    }
    console.error("PVPアクションに失敗しました。最大リトライ回数を超えました。");
    return { status: "error", message: `PVPアクション失敗: 最大リトライ回数を超えました` };
}

/**
 * Netlify Functionを経由して、PVPゲームの状態を取得する関数 (GET)
 * @param {string} playerName - 自分のプレイヤー名
 * @returns {Promise<object>} PVPゲームの状態 (currentGames, availableGames)
 */
async function fetchPvpData(playerName) {
    const MAX_RETRIES = 3;
    let attempt = 0;
    let delayMs = 1000;

    while (attempt < MAX_RETRIES) {
        try {
            const response = await fetch(`${PVP_FETCH_URL}?player=${encodeURIComponent(playerName)}`, {
                method: 'GET',
            });
            
            if (response.status === 429) {
                throw new Error('429 Too Many Requests on GET');
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`PVPデータ取得エラー: ${response.status} ${errorData.error || response.statusText}`);
            }
            
            const data = await response.json();
            return data;
        
        } catch (error) {
            if (error.message.includes('429') || attempt < MAX_RETRIES - 1) {
                attempt++;
                console.warn(`PVPデータ取得リトライ (${attempt}/${MAX_RETRIES})。待機: ${delayMs}ms`);
                await delay(delayMs);
                delayMs *= 2; // 指数バックオフ
            } else {
                console.error("PVPデータ取得中にエラー:", error);
                return { currentGames: [], availableGames: [], allScores: [] };
            }
        }
    }
     console.error("PVPデータ取得に失敗しました。最大リトライ回数を超えました。");
     return { currentGames: [], availableGames: [], allScores: [] };
}

function showMessage(element, message, type) {
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
    
    setTimeout(() => {
        if (element) {
            element.classList.add('hidden');
        }
    }, 5000);
}

const MASTER_USERNAME = "Kabocha";
