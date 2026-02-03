// assets/js/mypage.js

const AUTH_FORM = document.getElementById('auth-form');
const MYPAGE_CONTENT = document.getElementById('mypage-content');
const AUTH_MESSAGE = document.getElementById('auth-message');
const WAGER_FORM = document.getElementById('wager-form');
const TARGET_BET_SELECT = document.getElementById('target-bet');
const WAGER_PLAYER_INPUT = document.getElementById('wager-player');
const AUTHENTICATED_USER_NAME = document.getElementById('authenticated-user-name');
const CURRENT_SCORE_ELEMENT = document.getElementById('current-score');
const FIXED_PLAYER_NAME = document.getElementById('fixed-player-name');
const WAGER_HISTORY_LIST = document.getElementById('wager-history-list');

const WAGER_INPUTS_CONTAINER = document.getElementById('wager-inputs-container');
const ADD_WAGER_ROW_BUTTON = document.getElementById('add-wager-row-button');

const LOGOUT_BUTTON = document.getElementById('logout-button');

const PRO_BONUS_TOOL = document.getElementById('pro-bonus-tool');
const PRO_BONUS_BUTTON = document.getElementById('pro-bonus-button');
const PRO_BONUS_MESSAGE = document.getElementById('pro-bonus-message');
const PRO_BONUS_INSTRUCTION = document.getElementById('pro-bonus-instruction'); 

const TRANSFER_FORM_MYPAGE = document.getElementById('transfer-form-mypage');
const RECEIVER_PLAYER_SELECT_MYPAGE = document.getElementById('receiver-player-mypage');
const AUTHENTICATED_USER_TRANSFER = document.getElementById('authenticated-user-transfer');

const LOTTERY_PURCHASE_FORM = document.getElementById('lottery-purchase-form');
const LOTTERY_SELECT = document.getElementById('lottery-select');
const LOTTERY_TICKET_COUNT = document.getElementById('lottery-ticket-count');
const LOTTERY_PURCHASE_MESSAGE = document.getElementById('lottery-purchase-message');
const LOTTERY_TOTAL_PRICE_DISPLAY = document.getElementById('lottery-total-price');
const LOTTERY_RESULTS_CONTAINER = document.getElementById('lottery-results-container');

const APPLY_GIFT_CODE_FORM = document.getElementById('apply-gift-code-form');
const GIFT_CODE_INPUT = document.getElementById('gift-code-input');
const APPLY_GIFT_CODE_MESSAGE = document.getElementById('apply-gift-code-message');
const TARGET_CONTINUE_TOOL = document.getElementById('target-continue-tool');


let authenticatedUser = null; 
let availableLotteries = [];

// -----------------------------------------------------------------
// ★★★ 認証とログイン状態の管理 ★★★
// -----------------------------------------------------------------

async function attemptLogin(username, password, isAuto = false) {
    if (!isAuto) showMessage(AUTH_MESSAGE, '認証中...', 'info');
    
    const allData = await fetchAllData();
    const scores = allData.scores;
    const user = scores.find(p => p.name === username && p.pass === password);

    if (user) {
        authenticatedUser = user; 
        if (!authenticatedUser.status) authenticatedUser.status = 'none';
        
        localStorage.setItem('authUsername', username);
        localStorage.setItem('authPassword', password);

        document.getElementById('auth-section').classList.add('hidden');
        MYPAGE_CONTENT.classList.remove('hidden');
        
        if (!isAuto) showMessage(AUTH_MESSAGE, `✅ ようこそ、${username}様。`, 'success');
        else AUTH_MESSAGE.classList.add('hidden');
        
        initializeMyPageContent(); 
        return true;
    } else {
        if (isAuto) {
            localStorage.removeItem('authUsername');
            localStorage.removeItem('authPassword');
        } else showMessage(AUTH_MESSAGE, '❌ 認証失敗', 'error');
        return false;
    }
}

async function autoLogin() {
    const username = localStorage.getItem('authUsername');
    const password = localStorage.getItem('authPassword');
    if (username && password) await attemptLogin(username, password, true);
}

function handleLogout() {
    if (!window.confirm('ログアウトしますか？')) return;
    localStorage.removeItem('authUsername');
    localStorage.removeItem('authPassword');
    authenticatedUser = null;
    document.getElementById('auth-section').classList.remove('hidden');
    MYPAGE_CONTENT.classList.add('hidden');
    AUTH_FORM.reset();
}

AUTH_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    attemptLogin(document.getElementById('username').value.trim(), document.getElementById('password').value.trim(), false);
});

LOGOUT_BUTTON.addEventListener('click', handleLogout);

// -----------------------------------------------------------------
// ★★★ 初期化 ★★★
// -----------------------------------------------------------------

async function initializeMyPageContent() {
    if (!authenticatedUser) return;

    AUTHENTICATED_USER_NAME.textContent = authenticatedUser.name;
    CURRENT_SCORE_ELEMENT.textContent = authenticatedUser.score.toFixed(1);
    FIXED_PLAYER_NAME.textContent = authenticatedUser.name;
    WAGER_PLAYER_INPUT.value = authenticatedUser.name; 
    AUTHENTICATED_USER_TRANSFER.textContent = authenticatedUser.name; 
    
    await loadBettingDataAndHistory();
    initializeWagerInputs();
    initializeMemberBonusFeature(); 
    loadTransferReceiverList(); 
    await loadLotteryData();
    initializeLotteryPurchaseForm();
    initializeGiftCodeFeature();
    controlTargetContinueFormDisplay();
}

function controlTargetContinueFormDisplay() {
    if (!TARGET_CONTINUE_TOOL) return;
    const TARGET_DATE = new Date('2025-12-10T00:00:00+09:00'); 
    if (new Date() >= TARGET_DATE) TARGET_CONTINUE_TOOL.classList.remove('hidden');
}

// -----------------------------------------------------------------
// ★★★ 会員ボーナス機能 ★★★
// -----------------------------------------------------------------

function initializeMemberBonusFeature() {
    const isMember = authenticatedUser && ['pro', 'premium', 'luxury'].includes(authenticatedUser.status);
    if (isMember) {
        if (PRO_BONUS_TOOL) PRO_BONUS_TOOL.classList.remove('hidden');
        updateMemberBonusDisplay(); 
    }
}

function updateMemberBonusDisplay() {
    if (!authenticatedUser) return;
    const status = authenticatedUser.status;
    let amount, interval;

    if (status === 'luxury') { amount = 10.0; interval = 3600000; }
    else if (status === 'premium') { amount = 15.0; interval = 86400000; }
    else if (status === 'pro') { amount = 10.0; interval = 86400000; }
    else return;

    const now = Date.now();
    const last = authenticatedUser.lastBonusTime ? new Date(authenticatedUser.lastBonusTime).getTime() : 0;
    const ready = (now - last) >= interval;
    
    if (PRO_BONUS_BUTTON) {
        PRO_BONUS_BUTTON.disabled = !ready;
        PRO_BONUS_BUTTON.textContent = ready ? `ボーナス (+${amount.toFixed(1)} P) を受け取る` : `獲得済み`;
    }
}

if (PRO_BONUS_BUTTON) {
    PRO_BONUS_BUTTON.addEventListener('click', async () => {
        const status = authenticatedUser.status;
        let amount, interval;
        if (status === 'luxury') { amount = 10.0; interval = 3600000; }
        else { amount = (status === 'premium' ? 15.0 : 10.0); interval = 86400000; }

        try {
            const currentData = await fetchAllData();
            let scoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            const target = scoresMap.get(authenticatedUser.name);
            
            const last = target.lastBonusTime ? new Date(target.lastBonusTime).getTime() : 0;
            if ((Date.now() - last) < interval) return;

            const newScore = target.score + amount;
            const nowIso = new Date().toISOString();
            scoresMap.set(authenticatedUser.name, { ...target, score: parseFloat(newScore.toFixed(1)), lastBonusTime: nowIso });
            
            const response = await updateAllData({ ...currentData, scores: Array.from(scoresMap.values()) });
            if (response.status === 'success') {
                authenticatedUser.score = newScore;
                authenticatedUser.lastBonusTime = nowIso;
                CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
                updateMemberBonusDisplay();
            }
        } catch (e) { console.error(e); }
    });
}

// --- プレゼントコード ---
function initializeGiftCodeFeature() {
    if (APPLY_GIFT_CODE_FORM) APPLY_GIFT_CODE_FORM.addEventListener('submit', handleApplyGiftCode);
}

async function handleApplyGiftCode(e) {
    e.preventDefault();
    const code = GIFT_CODE_INPUT.value.trim().toUpperCase();
    if (!code) return;

    try {
        const currentData = await fetchAllData();
        let allCodes = currentData.gift_codes || [];
        const idx = allCodes.findIndex(c => c.code === code);
        
        if (idx === -1) { showMessage(APPLY_GIFT_CODE_MESSAGE, '❌ 無効なコード', 'error'); return; }
        const gc = allCodes[idx];
        if (gc.maxUses > 0 && gc.currentUses >= gc.maxUses) return;

        let scoresMap = new Map(currentData.scores.map(p => [p.name, p]));
        const target = scoresMap.get(authenticatedUser.name);
        const newScore = parseFloat((target.score + gc.points).toFixed(1));
        
        scoresMap.set(authenticatedUser.name, { ...target, score: newScore });
        gc.currentUses += 1;
        if (gc.maxUses > 0 && gc.currentUses >= gc.maxUses) allCodes.splice(idx, 1);

        const response = await updateAllData({ ...currentData, scores: Array.from(scoresMap.values()), gift_codes: allCodes });
        if (response.status === 'success') {
            authenticatedUser.score = newScore;
            CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
            GIFT_CODE_INPUT.value = '';
            showMessage(APPLY_GIFT_CODE_MESSAGE, '✅ 適用完了', 'success');
        }
    } catch (e) { console.error(e); }
}

// --- 送金 ---
async function loadTransferReceiverList() {
    if (!RECEIVER_PLAYER_SELECT_MYPAGE) return;
    const allData = await fetchAllData(); 
    let options = '<option value="" disabled selected>選択</option>';
    allData.scores.forEach(p => { if (p.name !== authenticatedUser.name) options += `<option value="${p.name}">${p.name}</option>`; });
    RECEIVER_PLAYER_SELECT_MYPAGE.innerHTML = options;
}

if (TRANSFER_FORM_MYPAGE) {
    TRANSFER_FORM_MYPAGE.addEventListener('submit', async (e) => {
        e.preventDefault();
        const receiver = RECEIVER_PLAYER_SELECT_MYPAGE.value;
        const amount = parseFloat(document.getElementById('transfer-amount-mypage').value);
        if (!receiver || isNaN(amount) || amount <= 0 || authenticatedUser.score < amount) return;

        try {
            const currentData = await fetchAllData();
            let scoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            const sPlayer = scoresMap.get(authenticatedUser.name);
            const rPlayer = scoresMap.get(receiver);
            
            const newS = parseFloat((sPlayer.score - amount).toFixed(1));
            const newR = parseFloat((rPlayer.score + amount).toFixed(1));
            
            scoresMap.set(authenticatedUser.name, { ...sPlayer, score: newS });
            scoresMap.set(receiver, { ...rPlayer, score: newR });
            
            const response = await updateAllData({ ...currentData, scores: Array.from(scoresMap.values()) });
            if (response.status === 'success') {
                authenticatedUser.score = newS;
                CURRENT_SCORE_ELEMENT.textContent = newS.toFixed(1);
                TRANSFER_FORM_MYPAGE.reset();
            }
        } catch (e) { console.error(e); }
    });
}

// --- スポーツくじ投票 ---
function initializeWagerInputs() {
    if (!WAGER_INPUTS_CONTAINER) return;
    WAGER_INPUTS_CONTAINER.innerHTML = '';
    addWagerRow(); 
}

function addWagerRow() {
    const row = document.createElement('div');
    row.className = 'form-group wager-row';
    row.innerHTML = `<div style="display: flex; gap: 10px; margin-bottom: 10px;">
        <input type="text" class="wager-item-input" placeholder="内容" required>
        <input type="number" class="wager-amount-input" placeholder="P" min="1" required>
        <button type="button" class="remove-wager-row-button">×</button>
    </div>`;
    row.querySelector('.remove-wager-row-button').addEventListener('click', () => {
        if (WAGER_INPUTS_CONTAINER.children.length > 1) row.remove();
    });
    WAGER_INPUTS_CONTAINER.appendChild(row);
}

if (ADD_WAGER_ROW_BUTTON) ADD_WAGER_ROW_BUTTON.addEventListener('click', addWagerRow);

async function loadBettingDataAndHistory() {
    const data = await fetchAllData();
    updateWagerForm(data.sports_bets || []);
    renderWagerHistory(data.sports_bets || []);
}

function updateWagerForm(bets) {
    if (!TARGET_BET_SELECT) return;
    const open = bets.filter(b => b.status === 'OPEN' && new Date(b.deadline) > new Date());
    let opt = '<option value="" disabled selected>選択</option>';
    open.forEach(b => opt += `<option value="${b.betId}">${b.matchName}</option>`);
    TARGET_BET_SELECT.innerHTML = opt;
}

function renderWagerHistory(bets) {
    if (!WAGER_HISTORY_LIST) return;
    const myWagers = bets.flatMap(b => b.wagers.filter(w => w.player === authenticatedUser.name).map(w => ({ ...w, betStatus: b.status, matchName: b.matchName })));
    myWagers.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    WAGER_HISTORY_LIST.innerHTML = myWagers.slice(0, 5).map(w => `<li>${w.matchName}: ${w.amount}P -> ${w.item} (${w.betStatus})</li>`).join('');
}

if (WAGER_FORM) {
    WAGER_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const betId = parseInt(TARGET_BET_SELECT.value);
        const wagers = [];
        let total = 0;
        WAGER_INPUTS_CONTAINER.querySelectorAll('.wager-row').forEach(r => {
            const item = r.querySelector('.wager-item-input').value.trim();
            const amt = parseFloat(r.querySelector('.wager-amount-input').value);
            if (item && amt >= 1) {
                wagers.push({ item, amount: amt, player: authenticatedUser.name, timestamp: new Date().toISOString(), isWin: null, appliedOdds: null });
                total += amt;
            }
        });

        if (!betId || total > authenticatedUser.score) return;

        try {
            const currentData = await fetchAllData();
            let scoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            const target = scoresMap.get(authenticatedUser.name);
            const betIdx = currentData.sports_bets.findIndex(b => b.betId === betId);
            
            const newScore = parseFloat((target.score - total).toFixed(1));
            scoresMap.set(authenticatedUser.name, { ...target, score: newScore });
            currentData.sports_bets[betIdx].wagers.push(...wagers);
            
            const response = await updateAllData({ ...currentData, scores: Array.from(scoresMap.values()) });
            if (response.status === 'success') {
                authenticatedUser.score = newScore;
                CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
                WAGER_FORM.reset();
                loadBettingDataAndHistory();
            }
        } catch (e) { console.error(e); }
    });
}

// --- 宝くじ ---
async function loadLotteryData() {
    const data = await fetchAllData();
    availableLotteries = (data.lotteries || []).filter(l => l.status === 'OPEN' && new Date(l.purchaseDeadline) > new Date());
    let opt = '<option value="" disabled selected>選択</option>';
    availableLotteries.forEach(l => opt += `<option value="${l.lotteryId}">${l.name}</option>`);
    if (LOTTERY_SELECT) LOTTERY_SELECT.innerHTML = opt;
    renderLotteryResults(data.lotteries || []);
}

function initializeLotteryPurchaseForm() {
    if (!LOTTERY_SELECT) return;
    const update = () => {
        const l = availableLotteries.find(x => x.lotteryId === parseInt(LOTTERY_SELECT.value));
        const count = parseInt(LOTTERY_TICKET_COUNT.value);
        if (l && count > 0) {
            const price = (l.ticketPrice * count) * (authenticatedUser.status === 'luxury' ? 0.8 : 1.0);
            LOTTERY_TOTAL_PRICE_DISPLAY.textContent = `合計: ${price.toFixed(1)} P`;
        }
    };
    LOTTERY_SELECT.addEventListener('change', update);
    LOTTERY_TICKET_COUNT.addEventListener('input', update);
}

if (LOTTERY_PURCHASE_FORM) {
    LOTTERY_PURCHASE_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const lid = parseInt(LOTTERY_SELECT.value);
        const count = parseInt(LOTTERY_TICKET_COUNT.value);
        const lottery = availableLotteries.find(x => x.lotteryId === lid);
        const finalPrice = (lottery.ticketPrice * count) * (authenticatedUser.status === 'luxury' ? 0.8 : 1.0);

        if (authenticatedUser.score < finalPrice) return;

        try {
            const data = await fetchAllData();
            let scoresMap = new Map(data.scores.map(p => [p.name, p]));
            const target = scoresMap.get(authenticatedUser.name);
            const lIdx = data.lotteries.findIndex(x => x.lotteryId === lid);

            const newTickets = [];
            for (let i = 0; i < count; i++) {
                const res = performLotteryDraw(data.lotteries[lIdx].prizes);
                newTickets.push({ ticketId: `t-${Date.now()}-${i}`, player: authenticatedUser.name, prizeRank: res.prizeRank, prizeAmount: res.prizeAmount, count: 1, isClaimed: false });
            }

            const newScore = parseFloat((target.score - finalPrice).toFixed(1));
            scoresMap.set(authenticatedUser.name, { ...target, score: newScore });
            data.lotteries[lIdx].tickets.push(...newTickets);

            const response = await updateAllData({ ...data, scores: Array.from(scoresMap.values()) });
            if (response.status === 'success') {
                authenticatedUser.score = newScore;
                CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
                loadLotteryData();
            }
        } catch (e) { console.error(e); }
    });
}

function performLotteryDraw(prizes) {
    const r = Math.random();
    let cum = 0;
    for (const p of prizes) {
        cum += p.probability;
        if (r < cum) return { prizeRank: p.rank, prizeAmount: p.amount };
    }
    return { prizeRank: null, prizeAmount: 0 };
}

function renderLotteryResults(lotteries) {
    if (!LOTTERY_RESULTS_CONTAINER) return;
    const my = lotteries.filter(l => l.tickets.some(t => t.player === authenticatedUser.name));
    LOTTERY_RESULTS_CONTAINER.innerHTML = my.map(l => {
        const mine = l.tickets.filter(t => t.player === authenticatedUser.name);
        const unclaimed = mine.filter(t => !t.isClaimed).length;
        return `<div>${l.name} (${mine.length}枚) ${unclaimed > 0 ? `<button onclick="handleCheckLotteryResult(${l.lotteryId})">確認</button>` : '確認済'}</div>`;
    }).join('');
}

async function handleCheckLotteryResult(lid) {
    try {
        const data = await fetchAllData();
        let scoresMap = new Map(data.scores.map(p => [p.name, p]));
        const lIdx = data.lotteries.findIndex(x => x.lotteryId === lid);
        const tickets = data.lotteries[lIdx].tickets;
        
        let win = 0;
        tickets.forEach(t => {
            if (t.player === authenticatedUser.name && !t.isClaimed) {
                win += t.prizeAmount;
                t.isClaimed = true;
            }
        });

        const target = scoresMap.get(authenticatedUser.name);
        const newScore = parseFloat((target.score + win).toFixed(1));
        scoresMap.set(authenticatedUser.name, { ...target, score: newScore });

        const response = await updateAllData({ ...data, scores: Array.from(scoresMap.values()) });
        if (response.status === 'success') {
            authenticatedUser.score = newScore;
            CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
            loadLotteryData();
        }
    } catch (e) { console.error(e); }
}

window.onload = autoLogin;
