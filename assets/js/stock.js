// assets/js/stock.js

// ============================================================
// 定数・エンドポイント
// ============================================================
const STOCK_FETCH_URL  = '/.netlify/functions/stock-fetch';
const STOCK_ACTION_URL = '/.netlify/functions/stock-action';

// ============================================================
// 状態変数
// ============================================================
let authenticatedUser = null;   // { name, score, pass, status }
let stockDefinitions  = {};     // サーバーから取得した株の定義
let currentStocks     = {};     // 現在の株価・履歴
let currentHoldings   = {};     // 自分の保有株 { MANZU: 3, PINZU: 1, ... }
let countdownInterval = null;
let nextUpdateMs      = 0;

// ============================================================
// DOM要素
// ============================================================
const AUTH_FORM             = document.getElementById('auth-form');
const AUTH_MESSAGE          = document.getElementById('auth-message');
const STOCK_CONTENT         = document.getElementById('stock-content');
const AUTH_SECTION          = document.getElementById('auth-section');
const CURRENT_SCORE_EL      = document.getElementById('current-score');
const AUTH_USER_NAME_EL     = document.getElementById('authenticated-user-name');
const LOGOUT_BUTTON         = document.getElementById('logout-button');
const STOCKS_CONTAINER      = document.getElementById('stocks-container');
const HOLDINGS_CONTAINER    = document.getElementById('holdings-container');
const NEXT_UPDATE_COUNTDOWN = document.getElementById('next-update-countdown');

// ============================================================
// 認証
// ============================================================
AUTH_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    await attemptLogin(username, password, false);
});

LOGOUT_BUTTON.addEventListener('click', handleLogout);

async function attemptLogin(username, password, isAuto = false) {
    if (!isAuto) showMessage(AUTH_MESSAGE, '認証中...', 'info');

    const data = await fetchStockData(username);
    if (!data) {
        if (!isAuto) showMessage(AUTH_MESSAGE, '❌ データ取得に失敗しました。', 'error');
        return false;
    }

    const user = (data.allScores || []).find(p => p.name === username && p.pass === password);
    if (!user) {
        if (isAuto) {
            localStorage.removeItem('authUsername');
            localStorage.removeItem('authPassword');
        } else {
            showMessage(AUTH_MESSAGE, '❌ ユーザー名またはパスワードが間違っています。', 'error');
        }
        return false;
    }

    authenticatedUser = { ...user };

    if (!isAuto) {
        localStorage.setItem('authUsername', username);
        localStorage.setItem('authPassword', password);
    }

    AUTH_SECTION.classList.add('hidden');
    STOCK_CONTENT.classList.remove('hidden');

    applyStockData(data);

    if (!isAuto) showMessage(AUTH_MESSAGE, `✅ ようこそ、${username}様。`, 'success');
    return true;
}

function handleLogout() {
    if (!window.confirm('ログアウトしますか？')) return;
    localStorage.removeItem('authUsername');
    localStorage.removeItem('authPassword');
    authenticatedUser = null;
    if (countdownInterval) clearInterval(countdownInterval);
    AUTH_SECTION.classList.remove('hidden');
    STOCK_CONTENT.classList.add('hidden');
    AUTH_FORM.reset();
    showMessage(AUTH_MESSAGE, '👋 ログアウトしました。', 'info');
}

async function autoLogin() {
    const username = localStorage.getItem('authUsername');
    const password = localStorage.getItem('authPassword');
    if (username && password) {
        await attemptLogin(username, password, true);
    }
}

// ============================================================
// データ取得
// ============================================================
async function fetchStockData(playerName) {
    try {
        const url = playerName
            ? `${STOCK_FETCH_URL}?player=${encodeURIComponent(playerName)}`
            : STOCK_FETCH_URL;
        const res = await fetch(url);
        if (!res.ok) {
            console.error('stock-fetch error:', res.status);
            return null;
        }
        return await res.json();
    } catch (err) {
        console.error('fetchStockData:', err);
        return null;
    }
}

// ============================================================
// データ適用・描画
// ============================================================
function applyStockData(data) {
    stockDefinitions  = data.definitions  || {};
    currentStocks     = data.stocks       || {};
    currentHoldings   = data.holdings     || {};
    nextUpdateMs      = data.nextUpdateIn || 0;

    // スコアをサーバーから最新値で更新
    if (authenticatedUser && data.allScores) {
        const fresh = data.allScores.find(p => p.name === authenticatedUser.name);
        if (fresh) {
            authenticatedUser.score = fresh.score;
        }
    }

    renderUserBar();
    renderStocks();
    renderHoldings();
    startCountdown(nextUpdateMs);
}

function renderUserBar() {
    if (!authenticatedUser) return;
    CURRENT_SCORE_EL.textContent    = authenticatedUser.score.toFixed(1);
    AUTH_USER_NAME_EL.textContent   = authenticatedUser.name;
}

// ============================================================
// 株式カード描画
// ============================================================
function renderStocks() {
    if (!STOCKS_CONTAINER) return;

    const ids = Object.keys(stockDefinitions);
    if (ids.length === 0) {
        STOCKS_CONTAINER.innerHTML = '<p class="info-text">株価データがありません。</p>';
        return;
    }

    let html = '';
    ids.forEach(id => {
        const def   = stockDefinitions[id];
        const stock = currentStocks[id];
        if (!def || !stock) return;

        const history = stock.priceHistory || [];
        const price   = stock.currentPrice;

        // 変動率計算 (直前との比較)
        let changeHtml = '';
        if (history.length >= 2) {
            const prev = history[history.length - 2].price;
            const diff = price - prev;
            const pct  = ((diff / prev) * 100).toFixed(2);
            const sign = diff >= 0 ? '+' : '';
            const cls  = diff >= 0 ? 'price-up' : 'price-down';
            changeHtml = `<span class="price-change ${cls}">${sign}${diff.toFixed(1)} P (${sign}${pct}%)</span>`;
        }

        // ボラティリティラベル
        const volLabels = { low: '🟢 安定', high: '🟡 ハイリスク', extreme: '🔴 超ギャンブル' };
        const volLabel  = volLabels[def.volatility] || '';

        // グラフSVG
        const chartSvg = buildMiniChart(history, id);

        html += `
        <div class="stock-card tool-box" id="stock-card-${id}">
            <div class="stock-header">
                <span class="stock-emoji">${def.emoji}</span>
                <div class="stock-title-block">
                    <h3 class="stock-name">${def.name}</h3>
                    <span class="stock-vol-label">${volLabel}</span>
                </div>
                <div class="stock-price-block">
                    <span class="stock-price" id="price-${id}">${price.toFixed(1)} P</span>
                    <div id="change-${id}">${changeHtml}</div>
                </div>
            </div>

            <p class="stock-description instruction">${def.description}</p>

            <!-- ミニチャート -->
            <div class="stock-chart-wrap">
                ${chartSvg}
            </div>

            <!-- 売買フォーム -->
            <div class="stock-trade-form">
                <div class="trade-row">
                    <div class="form-group" style="flex:1; margin-bottom:0;">
                        <label for="qty-${id}">数量 (株):</label>
                        <input type="number" id="qty-${id}" min="1" value="1" step="1">
                    </div>
                    <div class="trade-cost-display">
                        <span class="trade-cost-label">合計</span>
                        <span class="trade-cost-value" id="cost-${id}">-- P</span>
                    </div>
                </div>
                <div class="trade-buttons">
                    <button type="button" class="btn-buy action-button"
                        data-stock="${id}" style="background:linear-gradient(135deg,#1a6a3a,#0d4020); border-color:#38c172; flex:1; margin-top:0;">
                        🟢 買う
                    </button>
                    <button type="button" class="btn-sell action-button"
                        data-stock="${id}" style="background:linear-gradient(135deg,#7a1a1a,#4a0d0d); border-color:#e05555; flex:1; margin-top:0;">
                        🔴 売る
                    </button>
                </div>
                <p id="trade-message-${id}" class="hidden"></p>
            </div>
        </div>
        `;
    });

    STOCKS_CONTAINER.innerHTML = html;

    // イベントリスナーを付与
    ids.forEach(id => {
        const qtyInput = document.getElementById(`qty-${id}`);
        const costEl   = document.getElementById(`cost-${id}`);
        const stock    = currentStocks[id];

        if (qtyInput && costEl && stock) {
            const updateCost = () => {
                const q = parseInt(qtyInput.value) || 0;
                costEl.textContent = q > 0 ? `${(stock.currentPrice * q).toFixed(1)} P` : '-- P';
            };
            qtyInput.addEventListener('input', updateCost);
            updateCost();
        }

        const buyBtn  = STOCKS_CONTAINER.querySelector(`.btn-buy[data-stock="${id}"]`);
        const sellBtn = STOCKS_CONTAINER.querySelector(`.btn-sell[data-stock="${id}"]`);
        if (buyBtn)  buyBtn.addEventListener('click',  () => handleTrade('buy',  id));
        if (sellBtn) sellBtn.addEventListener('click',  () => handleTrade('sell', id));
    });
}

// ============================================================
// ミニチャート (SVG折れ線)
// ============================================================
function buildMiniChart(history, stockId) {
    const W = 600, H = 140;
    const PAD_X = 10, PAD_Y = 10;

    if (history.length < 2) {
        return `<svg class="stock-chart" viewBox="0 0 ${W} ${H}">
            <text x="${W/2}" y="${H/2}" text-anchor="middle" fill="#aaa" font-size="12">データ蓄積中...</text>
        </svg>`;
    }

    const prices = history.map(h => h.price);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);

    // 変動幅を誇張: 実際のレンジを中心に上下25%広げて表示
    const center = (maxP + minP) / 2;
    const rawRange = maxP - minP || 1;
    const exaggeratedRange = rawRange * 1.5; // 1.5倍に誇張
    const dispMin = center - exaggeratedRange / 2;
    const dispMax = center + exaggeratedRange / 2;

    const toX = (i) => PAD_X + (i / (prices.length - 1)) * (W - PAD_X * 2);
    const toY = (p) => PAD_Y + (1 - (p - dispMin) / (dispMax - dispMin)) * (H - PAD_Y * 2);

    // グラデーション: 上昇=緑、下降=赤
    const lastChange = prices[prices.length - 1] - prices[prices.length - 2];
    const lineColor  = lastChange >= 0 ? '#38c172' : '#e05555';
    const gradColor  = lastChange >= 0 ? 'rgba(56,193,114,0.18)' : 'rgba(224,85,85,0.14)';

    // ポリライン座標
    const points = prices.map((p, i) => `${toX(i).toFixed(1)},${toY(p).toFixed(1)}`).join(' ');

    // エリア塗りつぶし用パス
    const areaPath = `M ${toX(0).toFixed(1)},${toY(prices[0]).toFixed(1)} ` +
        prices.map((p, i) => `L ${toX(i).toFixed(1)},${toY(p).toFixed(1)}`).join(' ') +
        ` L ${toX(prices.length - 1).toFixed(1)},${H} L ${toX(0).toFixed(1)},${H} Z`;

    // 最高値・最安値ラベル
    const maxLabel = `${maxP.toFixed(1)}P`;
    const minLabel = `${minP.toFixed(1)}P`;

    return `
    <svg class="stock-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs>
            <linearGradient id="grad-${stockId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stop-color="${lineColor}" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <!-- エリア -->
        <path d="${areaPath}" fill="url(#grad-${stockId})"/>
        <!-- 折れ線 -->
        <polyline points="${points}" fill="none" stroke="${lineColor}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
        <!-- 最新点 -->
        <circle cx="${toX(prices.length-1).toFixed(1)}" cy="${toY(prices[prices.length-1]).toFixed(1)}" r="3" fill="${lineColor}"/>
        <!-- 最高値 -->
        <text x="${W - PAD_X}" y="${PAD_Y + 2}" text-anchor="end" fill="#38c172" font-size="9" font-family="monospace">${maxLabel}</text>
        <!-- 最安値 -->
        <text x="${W - PAD_X}" y="${H - 2}" text-anchor="end" fill="#e05555" font-size="9" font-family="monospace">${minLabel}</text>
    </svg>`;
}

// ============================================================
// 保有株描画
// ============================================================
function renderHoldings() {
    if (!HOLDINGS_CONTAINER) return;

    // 新旧両構造に対応: {qty, totalCost} または数値
    const ids = Object.keys(currentHoldings).filter(id => {
        const h = currentHoldings[id];
        return typeof h === 'object' ? h.qty > 0 : h > 0;
    });

    if (ids.length === 0) {
        HOLDINGS_CONTAINER.innerHTML = '<p class="info-text">保有株はありません。</p>';
        return;
    }

    let totalValue = 0;
    let html = `<table class="holdings-table">
        <thead><tr><th>銘柄</th><th>保有数</th><th>平均取得単価</th><th>現在値</th><th>評価額</th><th>損益</th><th>操作</th></tr></thead>
        <tbody>`;

    ids.forEach(id => {
        const holding   = currentHoldings[id];
        const qty       = typeof holding === 'object' ? holding.qty       : holding;
        const totalCost = typeof holding === 'object' ? holding.totalCost : 0;
        const def       = stockDefinitions[id];
        const stock     = currentStocks[id];
        if (!def || !stock) return;

        const currentValue = parseFloat((stock.currentPrice * qty).toFixed(1));
        totalValue += currentValue;

        // 平均取得単価
        const avgPrice = (totalCost > 0 && qty > 0)
            ? parseFloat((totalCost / qty).toFixed(1))
            : null;

        // 損益
        const pnl        = totalCost > 0 ? parseFloat((currentValue - totalCost).toFixed(1)) : null;
        const pnlSign    = pnl >= 0 ? '+' : '';
        const pnlColor   = pnl >= 0 ? '#1a7a4a' : '#c0392b';
        const pnlDisplay = pnl !== null
            ? `<span style="color:${pnlColor}; font-weight:bold;">${pnlSign}${pnl.toFixed(1)} P</span>`
            : '<span style="color:#aaa;">--</span>';

        const avgDisplay = avgPrice !== null
            ? `${avgPrice.toFixed(1)} P`
            : '<span style="color:#aaa;">--</span>';

        html += `<tr>
            <td data-label="銘柄">${def.emoji} ${def.name}</td>
            <td data-label="保有数" style="text-align:right;">${qty} 株</td>
            <td data-label="平均取得単価" style="text-align:right; color:#6a7888;">${avgDisplay}</td>
            <td data-label="現在値" style="text-align:right;">${stock.currentPrice.toFixed(1)} P</td>
            <td data-label="評価額" style="text-align:right; font-weight:bold; color:var(--color-indigo);">${currentValue.toFixed(1)} P</td>
            <td data-label="損益" style="text-align:right;">${pnlDisplay}</td>
            <td data-label="操作" style="text-align:center;">
                <button type="button" class="btn-sell-all action-button"
                    data-stock="${id}" data-qty="${qty}"
                    style="background:linear-gradient(135deg,#7a1a1a,#4a0d0d); border-color:#e05555; padding:5px 10px; font-size:0.75em; margin:0; width:auto; white-space:nowrap;">
                    🔴 全売却
                </button>
                <p id="sell-all-message-${id}" class="hidden" style="font-size:0.75em; margin:4px 0 0;"></p>
            </td>
        </tr>`;
    });

    html += `</tbody><tfoot><tr>
        <td colspan="6" style="text-align:right; font-family:var(--font-display); letter-spacing:1px; font-size:0.85em;">合計評価額</td>
        <td style="text-align:right; font-family:var(--font-display); font-weight:700; color:var(--color-gold); font-size:1.1em;">${totalValue.toFixed(1)} P</td>
    </tr></tfoot></table>`;

    HOLDINGS_CONTAINER.innerHTML = html;

    // 全売却ボタンのイベント
    HOLDINGS_CONTAINER.querySelectorAll('.btn-sell-all').forEach(btn => {
        btn.addEventListener('click', async () => {
            const stockId = btn.dataset.stock;
            const qty = parseInt(btn.dataset.qty);
            const def = stockDefinitions[stockId];
            if (!def) return;
            if (!window.confirm(`${def.emoji} ${def.name} を ${qty}株 全売却しますか？`)) return;
            btn.disabled = true;
            const msgEl = document.getElementById(`sell-all-message-${stockId}`);
            showMessage(msgEl, '処理中...', 'info');
            try {
                const res = await fetch(STOCK_ACTION_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'sell',
                        player: authenticatedUser.name,
                        stockId,
                        quantity: qty
                    })
                });
                const data = await res.json();
                if (!res.ok || data.status !== 'success') {
                    showMessage(msgEl, `❌ ${data.message || 'エラーが発生しました。'}`, 'error');
                    btn.disabled = false;
                    return;
                }
                authenticatedUser.score = data.newScore;
                currentHoldings = data.newHoldings || {};
                renderUserBar();
                renderHoldings();
            } catch (err) {
                showMessage(msgEl, `❌ 通信エラー: ${err.message}`, 'error');
                btn.disabled = false;
            }
        });
    });
}

// ============================================================
// 売買処理
// ============================================================
async function handleTrade(action, stockId) {
    if (!authenticatedUser) return;

    const qtyInput = document.getElementById(`qty-${stockId}`);
    const msgEl    = document.getElementById(`trade-message-${stockId}`);
    const qty      = parseInt(qtyInput ? qtyInput.value : 0);

    if (!qty || qty <= 0) {
        showMessage(msgEl, '❌ 数量を1以上で入力してください。', 'error');
        return;
    }

    const stock = currentStocks[stockId];
    if (!stock) return;

    // ポイント確認 (買いのみ) / 保有数確認 (売りのみ)
    if (action === 'buy') {
        const cost = stock.currentPrice * qty;
        if (authenticatedUser.score < cost) {
            showMessage(msgEl, `❌ 残高不足 (必要: ${cost.toFixed(1)} P / 残高: ${authenticatedUser.score.toFixed(1)} P)`, 'error');
            return;
        }
    } else if (action === 'sell') {
        const holding = currentHoldings[stockId];
        const owned   = holding ? (typeof holding === 'object' ? holding.qty : holding) : 0;
        if (owned < qty) {
            showMessage(msgEl, `❌ 保有株数不足 (保有: ${owned}株 / 売却希望: ${qty}株)`, 'error');
            return;
        }
    }

    // ボタン無効化
    const btnClass = action === 'buy' ? '.btn-buy' : '.btn-sell';
    const card = document.getElementById(`stock-card-${stockId}`);
    const btn  = card ? card.querySelector(`${btnClass}[data-stock="${stockId}"]`) : null;
    if (btn) btn.disabled = true;
    showMessage(msgEl, `処理中...`, 'info');

    try {
        const res = await fetch(STOCK_ACTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action,
                player: authenticatedUser.name,
                stockId,
                quantity: qty
            })
        });
        const data = await res.json();

        if (!res.ok || data.status !== 'success') {
            showMessage(msgEl, `❌ ${data.message || 'エラーが発生しました。'}`, 'error');
            return;
        }

        // ローカル状態を更新
        authenticatedUser.score = data.newScore;
        currentHoldings = data.newHoldings || {};

        renderUserBar();
        renderHoldings();

        showMessage(msgEl, data.message, 'success');

        // コスト表示を更新
        const costEl = document.getElementById(`cost-${stockId}`);
        if (costEl) {
            const newQty = parseInt(qtyInput.value) || 0;
            costEl.textContent = newQty > 0 ? `${(stock.currentPrice * newQty).toFixed(1)} P` : '-- P';
        }

    } catch (err) {
        console.error('handleTrade:', err);
        showMessage(msgEl, `❌ 通信エラー: ${err.message}`, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ============================================================
// カウントダウンタイマー
// ============================================================
function startCountdown(msRemaining) {
    if (countdownInterval) clearInterval(countdownInterval);

    let remaining = msRemaining;

    const update = () => {
        if (remaining <= 0) {
            NEXT_UPDATE_COUNTDOWN.textContent = '更新中...';
            // 株価を再取得して描画更新
            if (authenticatedUser) {
                fetchStockData(authenticatedUser.name).then(data => {
                    if (data) applyStockData(data);
                });
            }
            remaining = 60 * 1000; // 1分でリセット
            return;
        }

        const m = Math.floor(remaining / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        NEXT_UPDATE_COUNTDOWN.textContent =
            `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        remaining -= 1000;
    };

    update();
    countdownInterval = setInterval(update, 1000);
}

// ============================================================
// 追加CSS (インライン注入)
// ============================================================
(function injectStockStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* === 株式カード === */
        .stock-card {
            padding: 20px 24px;
        }

        .stock-header {
            display: flex;
            align-items: flex-start;
            gap: 14px;
            margin-bottom: 8px;
        }

        .stock-emoji {
            font-size: 2em;
            line-height: 1;
            flex-shrink: 0;
        }

        .stock-title-block {
            flex: 1;
        }

        .stock-title-block h3 {
            margin: 0 0 4px;
            font-size: 1em;
            border-bottom: none;
            padding-bottom: 0;
        }

        .stock-vol-label {
            font-size: 0.78em;
            color: #6a7888;
            letter-spacing: 0.5px;
        }

        .stock-price-block {
            text-align: right;
            flex-shrink: 0;
        }

        .stock-price {
            font-family: var(--font-display);
            font-size: 1.4em;
            font-weight: 700;
            color: var(--color-indigo);
            letter-spacing: 1px;
            display: block;
        }

        .price-change {
            font-size: 0.82em;
            font-family: monospace;
            letter-spacing: 0.5px;
        }

        .price-up   { color: #1a7a4a; }
        .price-down { color: #c0392b; }

        /* === チャート === */
        .stock-chart-wrap {
            margin: 10px 0;
            border: 1px solid rgba(201,168,76,0.2);
            border-radius: 2px;
            background: #f8f6f0;
            overflow: hidden;
        }

        .stock-chart {
            width: 100%;
            height: 140px;
            display: block;
        }

        /* === 売買フォーム === */
        .stock-trade-form {
            margin-top: 14px;
            padding-top: 14px;
            border-top: 1px solid rgba(201,168,76,0.25);
        }

        .trade-row {
            display: flex;
            gap: 12px;
            align-items: flex-end;
            margin-bottom: 10px;
        }

        .trade-cost-display {
            flex-shrink: 0;
            text-align: right;
            min-width: 110px;
        }

        .trade-cost-label {
            display: block;
            font-family: var(--font-display);
            font-size: 0.72em;
            letter-spacing: 2px;
            color: #8090a8;
            text-transform: uppercase;
            margin-bottom: 4px;
        }

        .trade-cost-value {
            display: block;
            font-family: var(--font-display);
            font-size: 1.1em;
            font-weight: 700;
            color: var(--color-gold);
        }

        .trade-buttons {
            display: flex;
            gap: 10px;
        }

        .trade-buttons .action-button {
            margin-top: 0;
            padding: 10px 14px;
            font-size: 0.8em;
        }

        /* === 保有株テーブル === */
        .holdings-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9em;
        }

        .holdings-table th {
            font-family: var(--font-display);
            background-color: var(--color-indigo);
            color: var(--color-gold-pale);
            padding: 8px 12px;
            letter-spacing: 1px;
            font-size: 0.78em;
            font-weight: 600;
            text-align: center;
        }

        .holdings-table td {
            padding: 8px 12px;
            border-bottom: 1px solid rgba(201,168,76,0.15);
            color: var(--color-text);
        }

        .holdings-table tfoot td {
            background: linear-gradient(to right, #fffbf0, #fff);
            border-top: 2px solid var(--color-gold);
            padding: 10px 12px;
        }

        /* === スマホ対応 (768px以下) === */
        @media (max-width: 768px) {

            /* 株式カード */
            .stock-card {
                padding: 14px 14px;
            }

            .stock-header {
                gap: 10px;
            }

            .stock-emoji {
                font-size: 1.6em;
            }

            .stock-title-block h3 {
                font-size: 0.92em;
            }

            .stock-price {
                font-size: 1.15em;
            }

            .price-change {
                font-size: 0.75em;
            }

            /* チャート */
            .stock-chart {
                height: 100px;
            }

            /* 売買フォーム */
            .trade-row {
                flex-direction: column;
                gap: 6px;
            }

            .trade-cost-display {
                text-align: left;
                min-width: unset;
            }

            .trade-buttons {
                gap: 8px;
            }

            .trade-buttons .action-button {
                padding: 10px 8px;
                font-size: 0.78em;
            }

            /* 保有株テーブル: スマホではカード形式 */
            .holdings-table thead {
                display: none;
            }

            .holdings-table,
            .holdings-table tbody,
            .holdings-table tr,
            .holdings-table td,
            .holdings-table tfoot {
                display: block;
                width: 100%;
            }

            .holdings-table tr {
                background: #fff;
                border: 1px solid rgba(201,168,76,0.3);
                border-radius: 4px;
                margin-bottom: 10px;
                padding: 10px 12px;
                position: relative;
            }

            .holdings-table td {
                padding: 4px 0;
                border-bottom: none;
                text-align: left !important;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 0.9em;
            }

            .holdings-table td::before {
                content: attr(data-label);
                font-family: var(--font-display);
                font-size: 0.72em;
                letter-spacing: 1px;
                color: #8090a8;
                flex-shrink: 0;
                margin-right: 8px;
            }

            .holdings-table tfoot tr {
                background: linear-gradient(to right, #fffbf0, #fff);
                border-top: 2px solid var(--color-gold);
                border-radius: 4px;
            }

            .holdings-table tfoot td {
                justify-content: space-between;
            }
        }

        @media (max-width: 480px) {
            .stock-header {
                flex-wrap: wrap;
            }

            .stock-price-block {
                width: 100%;
                text-align: left;
                margin-top: 2px;
            }

            .stock-price {
                font-size: 1.1em;
            }
        }
    `;
    document.head.appendChild(style);
})();

// ============================================================
// 初期化
// ============================================================
window.onload = autoLogin;