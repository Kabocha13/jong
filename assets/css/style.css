// assets/js/common.js

// ★★★ JSONBin.io の設定情報 (提供された情報を使用) ★★★
const JSONBIN_API_KEY = "$2a$10$jXqWaOsnNAUVPbvzX4ytFeZoXohqmbWD20InKtsiIQr3.vkgXzj36";
const JSONBIN_BIN_ID = "68de859643b1c97be957f505";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

// -----------------------------------------------------------------
// データ取得 (GET)
// -----------------------------------------------------------------

// リトライを制御するヘルパー関数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * JSONBinから最新の全データを取得する関数
 * @returns {Promise<object>} 全データ (scores, history, sports_bets, speedstorm_records)
 */
async function fetchAllData() {
    const MAX_RETRIES = 3;
    let attempt = 0;
    let delayMs = 1000; // 1秒から開始

    while (attempt < MAX_RETRIES) {
        try {
            const response = await fetch(JSONBIN_URL, {
                method: 'GET',
                headers: {
                    'X-Master-Key': JSONBIN_API_KEY,
                }
            });
            
            if (response.status === 429) {
                // 429エラーの場合はリトライ
                throw new Error('429 Too Many Requests');
            }

            if (!response.ok) {
                throw new Error(`JSONBinからデータ取得エラー: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            // data.record に実際のJSONデータが入っています
            // 新しいキー 'speedstorm_records' を追加し、存在しない場合は空配列で初期化
            const record = data.record;
            if (!record.speedstorm_records) {
                record.speedstorm_records = [];
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
                return { scores: [], history: [], sports_bets: [], speedstorm_records: [] };
            }
        }
    }
     // 最終リトライ後も失敗した場合
     console.error("ポイントデータ取得に失敗しました。最大リトライ回数を超えました。");
     return { scores: [], history: [], sports_bets: [], speedstorm_records: [] };
}

/**
 * ランキング描画用にスコアのみを取得する関数
 * @returns {Promise<Array>} スコアデータ (例: [{name: "友人A", score: 10.0}])
 */
async function fetchScores() {
    const data = await fetchAllData();
    return data.scores;
}


/**
 * JSONBinに新しい全データを上書き保存する関数 (PUT)
 * @param {object} newData - scores, history, sports_bets, speedstorm_records を含む新しい全データ
 * @returns {Promise<object>} APIからの応答
 */
async function updateAllData(newData) {
    const MAX_RETRIES = 3;
    let attempt = 0;
    let delayMs = 1000; // 1秒から開始

    while (attempt < MAX_RETRIES) {
        try {
            const response = await fetch(JSONBIN_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': JSONBIN_API_KEY,
                },
                body: JSON.stringify(newData)
            });
            
            if (response.status === 429) {
                throw new Error('429 Too Many Requests on PUT');
            }

            if (!response.ok) {
                throw new Error(`JSONBinへのデータ書き込みエラー: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return { status: "success", message: "ポイントが正常に更新されました。", totalChange: 0 };
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
// 共通ヘルパー関数
// -----------------------------------------------------------------

/**
 * HTML要素にメッセージを表示するヘルパー関数
 * @param {HTMLElement} element - メッセージを表示する要素
 * @param {string} message - 表示するテキスト
 * @param {('success'|'error')} type - メッセージのタイプ
 */
function showMessage(element, message, type) {
    element.textContent = message;
    element.className = type === 'success' ? 'message success' : 'message error';
    element.classList.remove('hidden');
    // 3秒後にメッセージを非表示にする
    setTimeout(() => {
        element.classList.add('hidden');
    }, 5000);
}

// 共通パスワードを定義 (master.jsとmahjong.jsで使用)
const MASTER_PASSWORD = "21082"; 
