// assets/js/common.js

// Netlify Functionのエンドポイントを定義
const FETCH_URL = "/.netlify/functions/fetch-data";
const UPDATE_URL = "/.netlify/functions/update-data";

const PVP_FETCH_URL = "/.netlify/functions/pvp-fetch";
const PVP_ACTION_URL = "/.netlify/functions/pvp-action";

// -----------------------------------------------------------------
// データ取得 (GET)
// -----------------------------------------------------------------

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
            const response = await fetch(FETCH_URL, {
                method: 'GET',
            });
            
            if (response.status === 429) {
                throw new Error('429 Too Many Requests');
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`データ取得エラー: ${response.status} ${errorData.error || response.statusText}`);
            }
            
            const record = await response.json();
            return record;
        
        } catch (error) {
            if (error.message.includes('429') || attempt < MAX_RETRIES - 1) {
                attempt++;
                console.warn(`データ取得リトライ (${attempt}/${MAX_RETRIES})。待機: ${delayMs}ms`);
                await delay(delayMs);
                delayMs *= 2;
            } else {
                console.error("ポイントデータ取得中にエラー:", error);
                return { scores: [], history: [], sports_bets: [], lotteries: [], electric_chair_games: [] };
            }
        }
    }
     return { scores: [], history: [], sports_bets: [], lotteries: [], electric_chair_games: [] };
}

/**
 * ランキング描画用にスコアのみを取得する関数
 */
async function fetchScores() {
    const data = await fetchAllData();
    return data.scores;
}

/**
 * Netlify Functionを経由して、新しい全データを上書き保存する関数 (PUT)
 * @param {object} newData - scores, sports_bets, lotteries を含む新しい全データ
 */
async function updateAllData(newData) {
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
                delayMs *= 2;
            } else {
                console.error("ポイントデータ書き込み中にエラー:", error);
                return { status: "error", message: `データ書き込み失敗: ${error.message}`, totalChange: 0 };
            }
        }
    }
    return { status: "error", message: `データ書き込み失敗: 最大リトライ回数を超えました`, totalChange: 0 };
}

// -----------------------------------------------------------------
// PVPアクション関数
// -----------------------------------------------------------------

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
                delayMs *= 2;
            } else {
                console.error("PVPアクション中にエラー:", error);
                return { status: "error", message: `PVPアクション失敗: ${error.message}` };
            }
        }
    }
    return { status: "error", message: `PVPアクション失敗: 最大リトライ回数を超えました` };
}

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
                delayMs *= 2;
            } else {
                console.error("PVPデータ取得中にエラー:", error);
                return { currentGames: [], availableGames: [], allScores: [] };
            }
        }
    }
     return { currentGames: [], availableGames: [], allScores: [] };
}

// -----------------------------------------------------------------
// 共通ヘルパー関数
// -----------------------------------------------------------------

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
