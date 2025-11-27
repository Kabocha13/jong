// netlify/functions/pvp-data.js
// JSONBIN_BIN_ID2 に格納されたPvPゲームデータを処理する関数

const API_KEY = process.env.JSONBIN_API_KEY; // 既存のAPIキーを再利用
const BIN_ID = process.env.JSONBIN_BIN_ID2; // PvP用の新しいBin IDを使用

// BIN_IDが設定されていない場合はエラーを返す
if (!BIN_ID) {
    console.error("環境変数 JSONBIN_BIN_ID2 が設定されていません。");
}
const JSONBIN_URL = BIN_ID ? `https://api.jsonbin.io/v3/b/${BIN_ID}` : null;

exports.handler = async (event) => {
    // BIN_IDが未設定の場合はエラー応答
    if (!JSONBIN_URL) {
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: 'Server configuration error: JSONBIN_BIN_ID2 is missing.' }) 
        };
    }

    const method = event.queryStringParameters.method;

    if (method === 'GET') {
        // --- データ取得 (GET) ---
        try {
            const response = await fetch(JSONBIN_URL, {
                method: 'GET',
                headers: {
                    'X-Master-Key': API_KEY,
                }
            });

            if (!response.ok) {
                return {
                    statusCode: response.status,
                    body: JSON.stringify({ error: `JSONBin Fetch Error (PvP): ${response.statusText}` })
                };
            }

            const data = await response.json();
            const record = data.record;
            
            // pvp_games配列が未定義の場合に初期化
            if (!record.pvp_games) record.pvp_games = [];

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(record)
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to fetch PvP data from JSONBin', details: error.message })
            };
        }
    } else if (method === 'PUT') {
        // --- データ更新 (PUT) ---
        if (!event.body) {
            return { statusCode: 400, body: 'Request body required' };
        }
        
        try {
            const newData = JSON.parse(event.body);
            
            // lastUpdatedを自動で追加・更新
            newData.lastUpdated = new Date().toISOString();

            const response = await fetch(JSONBIN_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': API_KEY,
                },
                body: JSON.stringify(newData)
            });

            if (!response.ok) {
                 return {
                    statusCode: response.status,
                    body: JSON.stringify({ status: "error", message: `JSONBin Update Error (PvP): ${response.statusText}` })
                };
            }

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "success", message: "PvPデータが正常に更新されました。" })
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ status: "error", message: `Failed to update PvP data: ${error.message}` })
            };
        }
    } else {
        return { statusCode: 405, body: 'Method Not Allowed (PvP)' };
    }
};
