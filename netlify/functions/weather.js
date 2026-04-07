// netlify/functions/weather.js
// Open-Meteo API の CORS 問題を回避するためのサーバーサイドプロキシ

const URL =
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=35.68&longitude=140.02' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
    '&timezone=Asia/Tokyo&forecast_days=2';

exports.handler = async () => {
    try {
        const res = await fetch(URL);
        const text = await res.text();
        if (!res.ok) {
            return {
                statusCode: res.status,
                body: JSON.stringify({ error: 'upstream error', status: res.status, body: text }),
            };
        }
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: text,
        };
    } catch (e) {
        return {
            statusCode: 502,
            body: JSON.stringify({ error: e.message, stack: e.stack }),
        };
    }
};
