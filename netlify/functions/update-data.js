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
        // 現在のBinデータを取得して、保護フィールドを保持する
        const currentRes = await fetch(JSONBIN_URL, {
            method: 'GET',
            headers: { 'X-Master-Key': API_KEY }
        });
        if (currentRes.ok) {
            const currentJson = await currentRes.json();
            const currentRecord = currentJson.record || {};
            // exercise_reports / career_posts は専用関数で管理するため常に保持
            if (currentRecord.exercise_reports && !newData.exercise_reports) {
                newData.exercise_reports = currentRecord.exercise_reports;
            }
            if (currentRecord.career_posts && !newData.career_posts) {
                newData.career_posts = currentRecord.career_posts;
            }
            // special_themeはmaster経由で明示的に送られた場合のみ上書き、それ以外は保持
            if (!('special_theme' in newData)) {
                newData.special_theme = currentRecord.special_theme ?? null;
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