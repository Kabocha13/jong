// netlify/functions/exercise-submit.js

const API_KEY     = process.env.JSONBIN_API_KEY;
const BIN_ID      = process.env.JSONBIN_BIN_ID;
const IMGBB_KEY   = process.env.IMGBB_API_KEY;
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { player, distance, pace, imageBase64 } = JSON.parse(event.body);

        if (!player || !distance || !pace || !imageBase64) {
            return {
                statusCode: 400,
                body: JSON.stringify({ status: 'error', message: '必要なパラメータが不足しています。' })
            };
        }

        // ImgBB に画像をアップロード
        const formData = new URLSearchParams();
        formData.append('key', IMGBB_KEY);
        formData.append('image', imageBase64);

        const imgbbRes = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData.toString(),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (!imgbbRes.ok) {
            return {
                statusCode: 500,
                body: JSON.stringify({ status: 'error', message: '画像のアップロードに失敗しました。' })
            };
        }

        const imgbbData = await imgbbRes.json();
        if (!imgbbData.success) {
            return {
                statusCode: 500,
                body: JSON.stringify({ status: 'error', message: `ImgBBエラー: ${imgbbData.error?.message || '不明なエラー'}` })
            };
        }
        const imageUrl = imgbbData.data.url;

        // ペースを解析して速度チェック（4分/km より速い = 車・電車の疑い）
        // ペース形式: "6'30\"" or "6'30" → 分単位に変換
        const paceMatch = pace.match(/(\d+)'(\d+)/);
        let suspicious = false;
        if (paceMatch) {
            const paceMin = parseInt(paceMatch[1]) + parseInt(paceMatch[2]) / 60;
            suspicious = paceMin < 4.0;
        }

        const distanceNum = parseFloat(distance);
        const points = parseFloat((distanceNum * 10).toFixed(1));

        const report = {
            id: `ex_${Date.now()}`,
            player,
            submittedAt: new Date().toISOString(),
            distance: distanceNum,
            pace,
            imageUrl,
            status: 'pending',
            points,
            suspicious
        };

        // 現在のデータを取得して exercise_reports に追加
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
        record.exercise_reports.push(report);

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

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'success',
                message: '運動申請を送信しました。承認をお待ちください。',
                points,
                suspicious
            })
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ status: 'error', message: `エラー: ${error.message}` })
        };
    }
};
