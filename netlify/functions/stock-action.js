// netlify/functions/stock-action.js

const API_KEY       = process.env.JSONBIN_API_KEY;
const STOCK_BIN_ID  = process.env.JSONBIN_STOCK_BIN_ID;
const MAIN_BIN_ID   = process.env.JSONBIN_BIN_ID;
const STOCK_BIN_URL = `https://api.jsonbin.io/v3/b/${STOCK_BIN_ID}`;
const MAIN_BIN_URL  = `https://api.jsonbin.io/v3/b/${MAIN_BIN_ID}`;

// 売買手数料率 (0 = 手数料なし)
const TRANSACTION_FEE_RATE = 0.0;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch {
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON body.' }) };
    }

    const { action, player, stockId, quantity } = body;

    if (!action || !player || !stockId || !quantity || quantity <= 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing required fields: action, player, stockId, quantity.' })
        };
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
        return { statusCode: 400, body: JSON.stringify({ message: 'quantity must be a positive integer.' }) };
    }

    try {
        // ====================================================
        // 1. 両Binを並行取得
        // ====================================================
        const [stockRes, mainRes] = await Promise.all([
            fetch(STOCK_BIN_URL, { method: 'GET', headers: { 'X-Master-Key': API_KEY } }),
            fetch(MAIN_BIN_URL,  { method: 'GET', headers: { 'X-Master-Key': API_KEY } }),
        ]);

        if (!stockRes.ok) throw new Error(`Stock Bin fetch failed: ${stockRes.statusText}`);
        if (!mainRes.ok)  throw new Error(`Main Bin fetch failed: ${mainRes.statusText}`);

        const stockData = (await stockRes.json()).record;
        const mainData  = (await mainRes.json()).record;

        // ====================================================
        // 2. 対象株・プレイヤーデータを取得
        // ====================================================
        const stock = stockData.stocks && stockData.stocks[stockId];
        if (!stock) {
            return { statusCode: 404, body: JSON.stringify({ message: `Stock '${stockId}' not found.` }) };
        }

        const scoresMap = new Map((mainData.scores || []).map(p => [p.name, p]));
        const playerData = scoresMap.get(player);
        if (!playerData) {
            return { statusCode: 404, body: JSON.stringify({ message: `Player '${player}' not found.` }) };
        }

        if (!stockData.holdings) stockData.holdings = {};
        if (!stockData.holdings[player]) stockData.holdings[player] = {};
        const holdings = stockData.holdings[player];

        const currentPrice = stock.currentPrice;
        let responseMessage = '';

        // ====================================================
        // 3. 売買処理
        // ====================================================
        if (action === 'buy') {
            const totalCost = parseFloat((currentPrice * qty * (1 + TRANSACTION_FEE_RATE)).toFixed(1));

            if (playerData.score < totalCost) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: `ポイント残高不足です。必要: ${totalCost.toFixed(1)} P / 残高: ${playerData.score.toFixed(1)} P`
                    })
                };
            }

            // ポイント減算
            playerData.score = parseFloat((playerData.score - totalCost).toFixed(1));

            // 保有株増加
            holdings[stockId] = (holdings[stockId] || 0) + qty;

            responseMessage = `✅ ${stockId} を ${qty}株 購入しました（${totalCost.toFixed(1)} P）`;

        } else if (action === 'sell') {
            const owned = holdings[stockId] || 0;
            if (owned < qty) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: `保有株数が不足しています。保有: ${owned}株 / 売却希望: ${qty}株`
                    })
                };
            }

            const totalRevenue = parseFloat((currentPrice * qty * (1 - TRANSACTION_FEE_RATE)).toFixed(1));

            // ポイント加算
            playerData.score = parseFloat((playerData.score + totalRevenue).toFixed(1));

            // 保有株減少
            holdings[stockId] = owned - qty;
            if (holdings[stockId] <= 0) delete holdings[stockId];

            responseMessage = `✅ ${stockId} を ${qty}株 売却しました（+${totalRevenue.toFixed(1)} P）`;

        } else {
            return { statusCode: 400, body: JSON.stringify({ message: `Invalid action: ${action}` }) };
        }

        // ====================================================
        // 4. 両Binに書き戻す (並行)
        // ====================================================
        scoresMap.set(player, playerData);
        mainData.scores = Array.from(scoresMap.values());

        const [putStockRes, putMainRes] = await Promise.all([
            fetch(STOCK_BIN_URL, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
                body: JSON.stringify(stockData)
            }),
            fetch(MAIN_BIN_URL, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
                body: JSON.stringify(mainData)
            })
        ]);

        if (!putStockRes.ok) throw new Error(`Stock Bin PUT failed: ${putStockRes.statusText}`);
        if (!putMainRes.ok)  throw new Error(`Main Bin PUT failed: ${putMainRes.statusText}`);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'success',
                message: responseMessage,
                newScore: playerData.score,
                newHoldings: stockData.holdings[player] || {}
            })
        };

    } catch (error) {
        console.error('stock-action error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ status: 'error', message: `Server Error: ${error.message}` })
        };
    }
};