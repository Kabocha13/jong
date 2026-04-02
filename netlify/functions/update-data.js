// netlify/functions/update-data.js

const API_KEY = process.env.JSONBIN_API_KEY;
const BIN_ID = process.env.JSONBIN_BIN_ID;
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

exports.handler = async (event) => {
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    
    // クライアントから送信されたボディデータを解析
    const newData = JSON.parse(event.body);

    try {
        // 現在のBinデータを取得して、保護フィールド(product)を保持する
        const currentRes = await fetch(JSONBIN_URL, {
            method: 'GET',
            headers: { 'X-Master-Key': API_KEY }
        });
        if (currentRes.ok) {
            const currentJson = await currentRes.json();
            const currentRecord = currentJson.record || {};
            // productはクライアント側からの上書きを許可せず、常にBin上の値を使用
            if (currentRecord.product) {
                newData.product = currentRecord.product;
            }
            // exercise_reportsはexercise-submit/exercise-actionで管理するため常に保持
            if (currentRecord.exercise_reports && !newData.exercise_reports) {
                newData.exercise_reports = currentRecord.exercise_reports;
            }
        }

        const response = await fetch(JSONBIN_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY, // APIキーを使用
            },
            body: JSON.stringify(newData)
        });

        if (!response.ok) {
            // JSONBinからのエラーをそのまま返す
             return {
                statusCode: response.status,
                body: JSON.stringify({ status: "error", message: `JSONBin Update Error: ${response.statusText}` })
            };
        }

        // 更新成功の応答を返す
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "success", message: "ポイントが正常に更新されました。", totalChange: 0 })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ status: "error", message: `Failed to update data: ${error.message}` })
        };
    }
};