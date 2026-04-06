// netlify/functions/exercise-action.js

const API_KEY     = process.env.JSONBIN_API_KEY;
const BIN_ID      = process.env.JSONBIN_BIN_ID;
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { reportId, action } = JSON.parse(event.body); // action: 'approve' | 'reject'

        if (!reportId || !['approve', 'reject'].includes(action)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ status: 'error', message: '不正なパラメータです。' })
            };
        }

        const currentRes = await fetch(JSONBIN_URL, {
            method: 'GET',
            headers: { 'X-Master-Key': API_KEY }
        });

        if (!currentRes.ok) {
            return {
                statusCode: 500,
                body: JSON.stringify({ status: 'error', message: 'データ取得に失敗しました。' })
            };
        }

        const currentJson = await currentRes.json();
        const record = currentJson.record;
        if (!record.exercise_reports) record.exercise_reports = [];

        const report = record.exercise_reports.find(r => r.id === reportId);
        if (!report) {
            return {
                statusCode: 404,
                body: JSON.stringify({ status: 'error', message: '申請が見つかりません。' })
            };
        }

        if (action === 'approve') {
            const player = record.scores.find(s => s.name === report.player);
            if (!player) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ status: 'error', message: 'プレイヤーが見つかりません。' })
                };
            }
            player.score = parseFloat((player.score + report.points).toFixed(1));
        }

        // 承認・却下後はレポートを削除してJSONのサイズを抑える
        record.exercise_reports = record.exercise_reports.filter(r => r.id !== reportId);

        const updateRes = await fetch(JSONBIN_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            },
            body: JSON.stringify(record)
        });

        if (!updateRes.ok) {
            return {
                statusCode: 500,
                body: JSON.stringify({ status: 'error', message: 'データの保存に失敗しました。' })
            };
        }

        const message = action === 'approve'
            ? `✅ ${report.player} の申請を承認し、${report.points}P を付与しました。`
            : `❌ ${report.player} の申請を却下しました。`;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'success', message })
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ status: 'error', message: `エラー: ${error.message}` })
        };
    }
};
