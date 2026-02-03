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

let authenticatedUser = null; 
let availableLotteries = [];

// -----------------------------------------------------------------
// 認証とログイン状態の管理
// -----------------------------------------------------------------

async function attemptLogin(username, password, isAuto = false) {
    if (!isAuto) {
        showMessage(AUTH_MESSAGE, '認証中...', 'info');
    }
    
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
        
        if (!isAuto) {
             showMessage(AUTH_MESSAGE, `✅ ログイン成功! ようこそ、${username}様。`, 'success');
        } else {
             AUTH_MESSAGE.classList.add('hidden');
        }
        
        initializeMyPageContent(); 
        return true;
    } else {
        if (isAuto) {
            localStorage.removeItem('authUsername');
            localStorage.removeItem('authPassword');
        } else {
            showMessage(AUTH_MESSAGE, '❌ ユーザー名またはパスワードが間違っています。', 'error');
        }
        return false;
    }
}

async function autoLogin() {
    const username = localStorage.getItem('authUsername');
    const password = localStorage.getItem('authPassword');
    if (username && password) {
        await attemptLogin(username, password, true);
    }
}

function handleLogout() {
    if (!window.confirm('ログアウトしますか？')) return;
    localStorage.removeItem('authUsername');
    localStorage.removeItem('authPassword');
    authenticatedUser = null;
    document.getElementById('auth-section').classList.remove('hidden');
    MYPAGE_CONTENT.classList.add('hidden');
    AUTH_FORM.reset();
    showMessage(AUTH_MESSAGE, '👋 ログアウトしました。', 'info');
}

AUTH_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    attemptLogin(document.getElementById('username').value.trim(), document.getElementById('password').value.trim(), false);
});

LOGOUT_BUTTON.addEventListener('click', handleLogout);

// -----------------------------------------------------------------
// 初期化と各機能
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
}

// --- 会員ボーナス ---
function initializeMemberBonusFeature() {
    const isMember = authenticatedUser && ['pro', 'premium', 'luxury'].includes(authenticatedUser.status);
    if (isMember) {
        if (PRO_BONUS_TOOL) PRO_BONUS_TOOL.classList.remove('hidden');
        updateMemberBonusDisplay(); 
    } else {
        if (PRO_BONUS_TOOL) PRO_BONUS_TOOL.classList.add('hidden');
    }
}

function updateMemberBonusDisplay() {
    if (!authenticatedUser) return;
    const MEMBER_STATUS = authenticatedUser.status;
    let BONUS_AMOUNT = 10.0;
    let REFRESH_INTERVAL = 86400000;
    let REFRESH_TEXT = '24時間ごと';

    if (MEMBER_STATUS === 'luxury') {
        BONUS_AMOUNT = 10.0; REFRESH_INTERVAL = 3600000; REFRESH_TEXT = '1時間ごと';
    } else if (MEMBER_STATUS === 'premium') {
        BONUS_AMOUNT = 15.0; 
    }

    const now = Date.now();
    const last = authenticatedUser.lastBonusTime ? new Date(authenticatedUser.lastBonusTime).getTime() : 0;
    const isReady = (now - last) >= REFRESH_INTERVAL;
    
    if (PRO_BONUS_BUTTON) {
        PRO_BONUS_BUTTON.disabled = !isReady;
        if (isReady) {
            PRO_BONUS_BUTTON.textContent = `ボーナス (+${BONUS_AMOUNT.toFixed(1)} P) を受け取る`;
        } else {
            const remaining = last + REFRESH_INTERVAL - now;
            const hours = Math.floor(remaining / 3600000);
            const mins = Math.ceil((remaining % 3600000) / 60000);
            PRO_BONUS_BUTTON.textContent = `獲得済み (次は ${hours > 0 ? hours + '時間' : ''}${mins}分後)`;
        }
    }
    if (PRO_BONUS_INSTRUCTION) {
        PRO_BONUS_INSTRUCTION.innerHTML = `${MEMBER_STATUS}特典: ${REFRESH_TEXT}に <strong>${BONUS_AMOUNT.toFixed(1)} P</strong> 獲得可能`;
    }
}

if (PRO_BONUS_BUTTON) {
    PRO_BONUS_BUTTON.addEventListener('click', async () => {
        const player = authenticatedUser.name;
        const status = authenticatedUser.status;
        let amount = (status === 'premium') ? 15.0 : 10.0;
        let interval = (status === 'luxury') ? 3600000 : 86400000;

        try {
            const data = await fetchAllData();
            let scoresMap = new Map(data.scores.map(p => [p.name, p]));
            const target = scoresMap.get(player);
            
            const last = target.lastBonusTime ? new Date(target.lastBonusTime).getTime() : 0;
            if (Date.now() - last < interval) return;

            const newScore = parseFloat((target.score + amount).toFixed(1));
            const nowIso = new Date().toISOString();
            
            scoresMap.set(player, { ...target, score: newScore, lastBonusTime: nowIso });
            
            const response = await updateAllData({ ...data, scores: Array.from(scoresMap.values()) });
            if (response.status === 'success') {
                authenticatedUser.score = newScore;
                authenticatedUser.lastBonusTime = nowIso;
                CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
                updateMemberBonusDisplay();
                showMessage(PRO_BONUS_MESSAGE, '✅ ボーナスを獲得しました！', 'success');
            }
        } catch (e) { console.error(e); }
    });
}

// --- ギフトコード ---
function initializeGiftCodeFeature() {
    if (APPLY_GIFT_CODE_FORM) APPLY_GIFT_CODE_FORM.addEventListener('submit', handleApplyGiftCode);
}

async function handleApplyGiftCode(e) {
    e.preventDefault();
    const code = GIFT_CODE_INPUT.value.trim().toUpperCase();
    if (!code) return;

    showMessage(APPLY_GIFT_CODE_MESSAGE, '検証中...', 'info');
    try {
        const data = await fetchAllData();
        let scoresMap = new Map(data.scores.map(p => [p.name, p]));
        let codes = data.gift_codes || [];
        const idx = codes.findIndex(c => c.code === code);

        if (idx === -1) { showMessage(APPLY_GIFT_CODE_MESSAGE, '❌ 無効なコードです', 'error'); return; }
        const gc = codes[idx];
        if (gc.maxUses > 0 && gc.currentUses >= gc.maxUses) { showMessage(APPLY_GIFT_CODE_MESSAGE, '❌ 利用上限に達しています', 'error'); return; }

        const target = scoresMap.get(authenticatedUser.name);
        const newScore = parseFloat((target.score + gc.points).toFixed(1));
        scoresMap.set(authenticatedUser.name, { ...target, score: newScore });
        
        gc.currentUses++;
        if (gc.maxUses > 0 && gc.currentUses >= gc.maxUses) codes.splice(idx, 1);
        else codes[idx] = gc;

        const response = await updateAllData({ ...data, scores: Array.from(scoresMap.values()), gift_codes: codes });
        if (response.status === 'success') {
            authenticatedUser.score = newScore;
            CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
            GIFT_CODE_INPUT.value = '';
            showMessage(APPLY_GIFT_CODE_MESSAGE, `✅ ${gc.points} P 獲得しました！`, 'success');
        }
    } catch (e) { console.error(e); }
}

// --- 送金 ---
async function loadTransferReceiverList() {
    const data = await fetchAllData();
    let options = '<option value="" disabled selected>送金先を選択</option>';
    data.scores.forEach(p => {
        if (p.name !== authenticatedUser.name) options += `<option value="${p.name}">${p.name}</option>`;
    });
    RECEIVER_PLAYER_SELECT_MYPAGE.innerHTML = options;
}

if (TRANSFER_FORM_MYPAGE) {
    TRANSFER_FORM_MYPAGE.addEventListener('submit', async (e) => {
        e.preventDefault();
        const receiver = RECEIVER_PLAYER_SELECT_MYPAGE.value;
        const amount = parseFloat(document.getElementById('transfer-amount-mypage').value);
        if (!receiver || isNaN(amount) || amount <= 0) return;

        try {
            const data = await fetchAllData();
            let scoresMap = new Map(data.scores.map(p => [p.name, p]));
            const sender = scoresMap.get(authenticatedUser.name);
            const recv = scoresMap.get(receiver);

            if (sender.score < amount) { showMessage(document.getElementById('transfer-message-mypage'), '❌ 残高不足', 'error'); return; }

            const newSenderScore = parseFloat((sender.score - amount).toFixed(1));
            const newRecvScore = parseFloat((recv.score + amount).toFixed(1));
            
            scoresMap.set(authenticatedUser.name, { ...sender, score: newSenderScore });
            scoresMap.set(receiver, { ...recv, score: newRecvScore });

            const response = await updateAllData({ ...data, scores: Array.from(scoresMap.values()) });
            if (response.status === 'success') {
                authenticatedUser.score = newSenderScore;
                CURRENT_SCORE_ELEMENT.textContent = newSenderScore.toFixed(1);
                TRANSFER_FORM_MYPAGE.reset();
                showMessage(document.getElementById('transfer-message-mypage'), `✅ ${receiver} へ送金しました`, 'success');
            }
        } catch (e) { console.error(e); }
    });
}

// --- スポーツくじ ---
function initializeWagerInputs() {
    WAGER_INPUTS_CONTAINER.innerHTML = '';
    addWagerRow();
}

function addWagerRow() {
    const div = document.createElement('div');
    div.className = 'form-group wager-row';
    div.style.marginBottom = '10px';
    div.innerHTML = `
        <div style="display: flex; gap: 5px;">
            <input type="text" class="wager-item-input flex-1" placeholder="かけるもの" required>
            <input type="number" class="wager-amount-input" style="width: 80px;" placeholder="P" min="1" required>
            <button type="button" class="remove-row secondary-button" style="width: auto;">×</button>
        </div>
    `;
    div.querySelector('.remove-row').onclick = () => { if(WAGER_INPUTS_CONTAINER.children.length > 1) div.remove(); };
    WAGER_INPUTS_CONTAINER.appendChild(div);
}

ADD_WAGER_ROW_BUTTON.onclick = addWagerRow;

async function loadBettingDataAndHistory() {
    const data = await fetchAllData();
    const bets = data.sports_bets || [];
    let options = '<option value="" disabled selected>くじを選択</option>';
    bets.filter(b => b.status === 'OPEN').forEach(b => {
        options += `<option value="${b.betId}">${b.matchName}</option>`;
    });
    TARGET_BET_SELECT.innerHTML = options;
    renderWagerHistory(bets);
}

function renderWagerHistory(bets) {
    const myWagers = bets.flatMap(b => b.wagers.filter(w => w.player === authenticatedUser.name).map(w => ({...w, matchName: b.matchName, status: b.status})));
    WAGER_HISTORY_LIST.innerHTML = myWagers.length ? myWagers.slice(-5).reverse().map(w => `<li>${w.matchName}: ${w.item} (${w.amount}P) - ${w.status}</li>`).join('') : '<li>履歴なし</li>';
}

WAGER_FORM.onsubmit = async (e) => {
    e.preventDefault();
    const betId = parseInt(TARGET_BET_SELECT.value);
    const rows = WAGER_INPUTS_CONTAINER.querySelectorAll('.wager-row');
    let total = 0;
    const newWagers = Array.from(rows).map(r => {
        const amt = parseFloat(r.querySelector('.wager-amount-input').value);
        total += amt;
        return { item: r.querySelector('.wager-item-input').value, amount: amt, player: authenticatedUser.name, timestamp: new Date().toISOString(), isWin: null, appliedOdds: null };
    });

    if (authenticatedUser.score < total) { showMessage(document.getElementById('wager-message'), '❌ 残高不足', 'error'); return; }

    try {
        const data = await fetchAllData();
        const bIdx = data.sports_bets.findIndex(b => b.betId === betId);
        if (bIdx === -1 || data.sports_bets[bIdx].status !== 'OPEN') return;
        
        let scoresMap = new Map(data.scores.map(p => [p.name, p]));
        const target = scoresMap.get(authenticatedUser.name);
        const newScore = parseFloat((target.score - total).toFixed(1));
        
        scoresMap.set(authenticatedUser.name, { ...target, score: newScore });
        data.sports_bets[bIdx].wagers.push(...newWagers);

        const response = await updateAllData({ ...data, scores: Array.from(scoresMap.values()) });
        if (response.status === 'success') {
            authenticatedUser.score = newScore;
            CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
            WAGER_FORM.reset();
            initializeWagerInputs();
            loadBettingDataAndHistory();
            showMessage(document.getElementById('wager-message'), '✅ 投票を登録しました', 'success');
        }
    } catch (e) { console.error(e); }
};

// --- 宝くじ ---
async function loadLotteryData() {
    const data = await fetchAllData();
    const lotteries = data.lotteries || [];
    availableLotteries = lotteries.filter(l => l.status === 'OPEN');
    let options = '<option value="" disabled selected>宝くじを選択</option>';
    availableLotteries.forEach(l => {
        options += `<option value="${l.lotteryId}">${l.name} (${l.ticketPrice}P)</option>`;
    });
    LOTTERY_SELECT.innerHTML = options;
    renderLotteryResults(lotteries);
}

function initializeLotteryPurchaseForm() {
    const update = () => {
        const l = availableLotteries.find(x => x.lotteryId === parseInt(LOTTERY_SELECT.value));
        const count = parseInt(LOTTERY_TICKET_COUNT.value) || 0;
        if (l) {
            const price = l.ticketPrice * count * (authenticatedUser.status === 'luxury' ? 0.8 : 1.0);
            LOTTERY_TOTAL_PRICE_DISPLAY.textContent = `合計: ${price.toFixed(1)} P`;
        }
    };
    LOTTERY_SELECT.onchange = update;
    LOTTERY_TICKET_COUNT.oninput = update;
}

LOTTERY_PURCHASE_FORM.onsubmit = async (e) => {
    e.preventDefault();
    const lId = parseInt(LOTTERY_SELECT.value);
    const count = parseInt(LOTTERY_TICKET_COUNT.value);
    const lottery = availableLotteries.find(x => x.lotteryId === lId);
    const price = lottery.ticketPrice * count * (authenticatedUser.status === 'luxury' ? 0.8 : 1.0);

    if (authenticatedUser.score < price) return;

    try {
        const data = await fetchAllData();
        let scoresMap = new Map(data.scores.map(p => [p.name, p]));
        const lIdx = data.lotteries.findIndex(x => x.lotteryId === lId);
        
        const newTickets = [];
        for (let i = 0; i < count; i++) {
            const res = performLotteryDraw(data.lotteries[lIdx].prizes);
            newTickets.push({ ticketId: `t-${Date.now()}-${i}`, player: authenticatedUser.name, prizeRank: res.rank, prizeAmount: res.amount, count: 1, isClaimed: false });
        }

        const target = scoresMap.get(authenticatedUser.name);
        const newScore = parseFloat((target.score - price).toFixed(1));
        scoresMap.set(authenticatedUser.name, { ...target, score: newScore });
        data.lotteries[lIdx].tickets.push(...newTickets);

        const response = await updateAllData({ ...data, scores: Array.from(scoresMap.values()) });
        if (response.status === 'success') {
            authenticatedUser.score = newScore;
            CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
            loadLotteryData();
            showMessage(LOTTERY_PURCHASE_MESSAGE, '✅ 購入完了！', 'success');
        }
    } catch (e) { console.error(e); }
};

function performLotteryDraw(prizes) {
    const rand = Math.random();
    let cur = 0;
    for (const p of prizes) {
        cur += p.probability;
        if (rand < cur) return { rank: p.rank, amount: p.amount };
    }
    return { rank: null, amount: 0 };
}

function renderLotteryResults(allLotteries) {
    const my = allLotteries.filter(l => l.tickets.some(t => t.player === authenticatedUser.name));
    LOTTERY_RESULTS_CONTAINER.innerHTML = my.length ? my.map(l => {
        const unclaimed = l.tickets.filter(t => t.player === authenticatedUser.name && !t.isClaimed).length;
        return `<div class="bet-card"><h4>${l.name}</h4><p>未確認: ${unclaimed}枚</p>${unclaimed > 0 ? `<button onclick="checkResult(${l.lotteryId})">結果確認</button>` : '確認済み'}</div>`;
    }).join('') : '<p>履歴なし</p>';
}

window.checkResult = async (lId) => {
    try {
        const data = await fetchAllData();
        const lIdx = data.lotteries.findIndex(x => x.lotteryId === lId);
        const targetTickets = data.lotteries[lIdx].tickets.filter(t => t.player === authenticatedUser.name && !t.isClaimed);
        let win = 0;
        targetTickets.forEach(t => { win += t.prizeAmount; t.isClaimed = true; });

        let scoresMap = new Map(data.scores.map(p => [p.name, p]));
        const user = scoresMap.get(authenticatedUser.name);
        const newScore = parseFloat((user.score + win).toFixed(1));
        scoresMap.set(authenticatedUser.name, { ...user, score: newScore });

        const response = await updateAllData({ ...data, scores: Array.from(scoresMap.values()) });
        if (response.status === 'success') {
            authenticatedUser.score = newScore;
            CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
            loadLotteryData();
            alert(`結果: ${win.toFixed(1)} P 獲得しました！`);
        }
    } catch (e) { console.error(e); }
};

window.onload = autoLogin;
