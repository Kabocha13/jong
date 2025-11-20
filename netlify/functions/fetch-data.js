// netlify/functions/fetch-data.js

const API_KEY = process.env.JSONBIN_API_KEY;
const BIN_ID = process.env.JSONBIN_BIN_ID;
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// Netlify Functionsのエントリーポイント
exports.handler = async (event) => {
    // GETリクエストのみを処理
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const response = await fetch(JSONBIN_URL, {
            method: 'GET',
            headers: {
                // APIキーをヘッダーに含める
                'X-Master-Key': API_KEY,
            }
        });

        if (!response.ok) {
            // JSONBinからのエラーをそのまま返す
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `JSONBin Fetch Error: ${response.statusText}` })
            };
        }

        const data = await response.json();
        
        // クライアントに返すJSONBinのデータ構造を調整
        const record = data.record;
        
        // クライアント側のcommon.jsの処理を簡略化するため、ここで初期化を行う
        record.history = []; 
        if (!record.speedstorm_records) record.speedstorm_records = [];
        if (!record.lotteries) record.lotteries = [];
        if (record.scores) {
            record.scores = record.scores.map(player => ({
                ...player,
                status: player.status || 'none'
            }));
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record)
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch data from JSONBin', details: error.message })
        };
    }
};
