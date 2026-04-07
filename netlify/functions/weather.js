// netlify/functions/weather.js
// Open-Meteo API の CORS 問題を回避するためのサーバーサイドプロキシ

exports.handler = async () => {
    try {
        const res = await fetch(
            'https://api.open-meteo.com/v1/forecast?latitude=35.68&longitude=140.02' +
            '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
            '&timezone=Asia%2FTokyo&forecast_days=2'
        );
        if (!res.ok) {
            return { statusCode: res.status, body: 'upstream error' };
        }
        const data = await res.json();
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        };
    } catch (e) {
        return { statusCode: 502, body: 'fetch failed' };
    }
};
