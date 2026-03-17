// netlify/functions/stock-fetch.js

const API_KEY  = process.env.JSONBIN_API_KEY;
const STOCK_BIN_ID = process.env.JSONBIN_STOCK_BIN_ID;
const MAIN_BIN_ID  = process.env.JSONBIN_BIN_ID;
const STOCK_BIN_URL = `https://api.jsonbin.io/v3/b/${STOCK_BIN_ID}`;
const MAIN_BIN_URL  = `https://api.jsonbin.io/v3/b/${MAIN_BIN_ID}`;

// ============================================================
// 株式の定義 (サーバー側で管理)
// ============================================================
const STOCK_DEFINITIONS = {
    MANZU: {
        id: 'MANZU',
        name: 'MANZU Corp.',
        emoji: '🀄',
        description: '老舗・安定・伝統。長期保有向きの安定銘柄。',
        basePrice: 200.0,
        volatility: 'low',
        trendStrength: 0.1,       // トレンド継続性 (低)
        positiveBias: 0.0002,    // +0.02%/分の上昇バイアス → 長期保有で緩やかに増加
        bigEventChance: 0.06,     // 6%で大変動
        bigEventRange: 0.10,      // 大変動 ±10%
        normalRange: 0.1,        // 通常変動 ±10%
        minPrice: 0,
        maxPrice: 999999999,
    },
    PINZU: {
        id: 'PINZU',
        name: 'PINZU Electric',
        emoji: '⚡',
        description: 'テクノロジー・新興・ハイリスク。トレンドに乗れば急騰、乗り遅れれば急落。',
        basePrice: 100.0,
        volatility: 'high',
        trendStrength: 0.45,      // トレンド継続性 (高) → 上昇中はさらに上がりやすい
        positiveBias: 0,
        bigEventChance: 0.10,     // 10%で大変動
        bigEventRange: 0.25,      // 大変動 ±25%
        normalRange: 0.18,        // 通常変動 ±18%
        minPrice: 0,
        maxPrice: 999999999,
    },
    SOUZU: {
        id: 'SOUZU',
        name: 'SOUZU Casino',
        emoji: '🎲',
        description: 'ギャンブル・波乱・博打。予測不能な大暴騰/大暴落が起きる。',
        basePrice: 50.0,
        volatility: 'extreme',
        trendStrength: 0.0,       // トレンドなし (完全ランダム)
        positiveBias: 0,
        bigEventChance: 0.2,     // 20%で大変動
        bigEventRange: 0.5,      // 大変動 ±50%
        normalRange: 0.25,        // 通常変動 ±25%
        minPrice: 0,
        maxPrice: 999999999,
    }
};

const PRICE_HISTORY_MAX = 44;          // 最大保持履歴数 (5人・10KB制限内)
const UPDATE_INTERVAL_MS = 60 * 1000;  // 1分 (ms)

// ============================================================
// 株価変動ロジック
// ============================================================
function calcNextPrice(stock, def) {
    const rand = Math.random();
    let changeRate = 0;

    // 大変動イベント判定
    if (rand < def.bigEventChance) {
        const sign = Math.random() < 0.5 ? 1 : -1;
        changeRate = sign * def.bigEventRange * (0.7 + Math.random() * 0.6);
    } else {
        // 通常変動
        changeRate = (Math.random() * 2 - 1) * def.normalRange;
    }

    // 正バイアス: 定義値があれば上方向に底上げ (MANZUの長期上昇傾向)
    if (def.positiveBias) {
        changeRate += def.positiveBias;
    }

    // トレンド補正: 直近の方向性を維持しやすくする
    if (def.trendStrength > 0 && stock.priceHistory && stock.priceHistory.length >= 2) {
        const hist = stock.priceHistory;
        const prevChange = hist[hist.length - 1].price - hist[hist.length - 2].price;
        const trendBias = prevChange > 0 ? def.trendStrength : -def.trendStrength;
        changeRate += trendBias * Math.random();
    }

    let newPrice = stock.currentPrice * (1 + changeRate);
    newPrice = Math.max(def.minPrice, Math.min(def.maxPrice, newPrice));
    newPrice = parseFloat(newPrice.toFixed(1));

    // 最低変動保証: 変動が0.1P未満なら強制的に±0.1P動かす
    if (Math.abs(newPrice - stock.currentPrice) < 0.1) {
        const sign = changeRate >= 0 ? 1 : -1;
        newPrice = parseFloat((stock.currentPrice + sign * 0.1).toFixed(1));
        newPrice = Math.max(def.minPrice, Math.min(def.maxPrice, newPrice));
    }

    return newPrice;
}

// ============================================================
// アクセス時に経過時間分だけ株価を更新する
// ============================================================
function updateStockPrices(stockData) {
    const now = Date.now();
    let updated = false;

    for (const id of Object.keys(STOCK_DEFINITIONS)) {
        const def = STOCK_DEFINITIONS[id];
        const stock = stockData.stocks[id];

        if (!stock) continue;

        const lastUpdate = stock.lastUpdated ? new Date(stock.lastUpdated).getTime() : 0;
        const elapsed = now - lastUpdate;
        const ticks = Math.floor(elapsed / UPDATE_INTERVAL_MS);

        if (ticks <= 0) continue;

        updated = true;
        const logCount = stock.priceHistory.length || 1;
        const maxTicks = Math.min(ticks, logCount); // ログに残っている件数分だけ更新

        for (let i = 0; i < maxTicks; i++) {
            const newPrice = calcNextPrice(stock, def);
            const tickTime = new Date(lastUpdate + (i + 1) * UPDATE_INTERVAL_MS).toISOString();

            stock.priceHistory.push({ price: newPrice, timestamp: tickTime });
            if (stock.priceHistory.length > PRICE_HISTORY_MAX) {
                stock.priceHistory.shift();
            }
            stock.currentPrice = newPrice;
        }

        stock.lastUpdated = new Date(lastUpdate + maxTicks * UPDATE_INTERVAL_MS).toISOString();
    }

    return updated;
}

// ============================================================
// 初期データ生成
// ============================================================
function createInitialStockData() {
    const now = new Date().toISOString();
    const stocks = {};

    for (const [id, def] of Object.entries(STOCK_DEFINITIONS)) {
        stocks[id] = {
            id,
            currentPrice: def.basePrice,
            lastUpdated: now,
            priceHistory: [{ price: def.basePrice, timestamp: now }],
        };
    }

    return { stocks, holdings: {}, lastInitialized: now };
}


// ============================================================
// エントリーポイント
// ============================================================
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const playerName = event.queryStringParameters && event.queryStringParameters.player;

    try {
        // 1. Stock Binからデータ取得 (初回は初期化)
        let stockData;
        let isNew = false;

        const stockRes = await fetch(STOCK_BIN_URL, {
            method: 'GET',
            headers: { 'X-Master-Key': API_KEY }
        });

        if (!stockRes.ok) {
            if (stockRes.status === 404) {
                // Binが空の場合は初期化
                stockData = createInitialStockData();
                isNew = true;
            } else {
                return {
                    statusCode: stockRes.status,
                    body: JSON.stringify({ error: `Stock Bin Fetch Error: ${stockRes.statusText}` })
                };
            }
        } else {
            const json = await stockRes.json();
            stockData = json.record;
            if (!stockData || !stockData.stocks) {
                stockData = createInitialStockData();
                isNew = true;
            }
        }

        // 2. 株価を経過時間分だけ更新
        const pricesUpdated = updateStockPrices(stockData);

        // 3. 変動があれば Stock Bin に書き戻す
        if (pricesUpdated || isNew) {
            await fetch(STOCK_BIN_URL, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
                body: JSON.stringify(stockData)
            });
        }

        // 4. Main Bin からプレイヤー認証情報を取得 (playerName指定時)
        let playerScores = [];
        if (playerName) {
            const mainRes = await fetch(MAIN_BIN_URL, {
                method: 'GET',
                headers: { 'X-Master-Key': API_KEY }
            });
            if (mainRes.ok) {
                const mainJson = await mainRes.json();
                playerScores = (mainJson.record.scores || []).map(p => ({
                    name: p.name,
                    pass: p.pass,
                    score: p.score,
                    status: p.status || 'none'
                }));
            }
        }

        // 5. 株の定義情報をクライアントに渡す (機密情報なし)
        const publicDefs = {};
        for (const [id, def] of Object.entries(STOCK_DEFINITIONS)) {
            publicDefs[id] = {
                id: def.id,
                name: def.name,
                emoji: def.emoji,
                description: def.description,
                minPrice: def.minPrice,
                maxPrice: def.maxPrice,
                volatility: def.volatility,
            };
        }

        // 6. プレイヤーの保有株を取得
        const playerHoldings = playerName ? (stockData.holdings[playerName] || {}) : {};

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stocks: stockData.stocks,
                definitions: publicDefs,
                holdings: playerHoldings,
                allScores: playerScores,
                nextUpdateIn: (() => {
                    // 次回更新までの残り時間 (ms) を計算
                    const firstStockId = Object.keys(stockData.stocks)[0];
                    if (!firstStockId) return UPDATE_INTERVAL_MS;
                    const last = new Date(stockData.stocks[firstStockId].lastUpdated).getTime();
                    return Math.max(0, UPDATE_INTERVAL_MS - (Date.now() - last));
                })()
            })
        };

    } catch (error) {
        console.error('stock-fetch error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch stock data', details: error.message })
        };
    }
};