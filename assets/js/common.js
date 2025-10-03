// assets/js/common.js

// ★★★ JSONBin.io の設定情報 (提供された情報を使用) ★★★
const JSONBIN_API_KEY = "$2a$10$jXqWaOsnNAUVPbvzX4ytFeZoXohqmbWD20InKtsiIQr3.vkgXzj36";
const JSONBIN_BIN_ID = "68de859643b1c97be957f505";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

// -----------------------------------------------------------------
// データ取得 (GET)
// -----------------------------------------------------------------

/**
 * JSONBinから最新の全データを取得する関数
 * @returns {Promise<object>} 全データ (scoresとhistory)
 */
async function fetchAllData() {
    try {
        const response = await fetch(JSONBIN_URL, {
            method: 'GET',
            headers: {
                'X-Master-Key': JSONBIN_API_KEY,
            }
        });
        
        if (!response.ok) {
            throw new Error(`JSONBinからデータ取得エラー: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        // data.record に実際のJSONデータが入っています
        return data.record;
    } catch (error) {
        console.error("ポイントデータ取得中にエラー:", error);
        return { scores: [], history: [] };
    }
}

/**
 * ランキング描画用にスコアのみを取得する関数
 * @returns {Promise<Array>} スコアデータ (例: [{name: "友人A", score: 10.0}])
 */
async function fetchScores() {
    const data = await fetchAllData();
    return data.scores;
}

// -----------------------------------------------------------------
// データ更新 (PUT)
// -----------------------------------------------------------------

/**
 * JSONBinに新しい全データを上書き保存する関数 (PUT)
 * @param {object} newData - scoresとhistoryを含む新しい全データ
 * @returns {Promise<object>} APIからの応答
 */
async function updateAllData(newData) {
    try {
        const response = await fetch(JSONBIN_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': JSONBIN_API_KEY,
            },
            body: JSON.stringify(newData)
        });
        
        if (!response.ok) {
            throw new Error(`JSONBinへのデータ書き込みエラー: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return { status: "success", message: "ポイントが正常に更新されました。", totalChange: 0 };
    } catch (error) {
        console.error("結果送信中にエラー:", error);
        return { status: "error", message: `通信エラーが発生しました: ${error.message}` };
    }
}
