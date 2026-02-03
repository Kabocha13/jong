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

async function attemptLogin(username, password, isAuto = false) {
    if (!isAuto) showMessage(AUTH_MESSAGE, '認証中...', 'info');
    const allData = await fetchAllData();
    const user = allData.scores.find(p => p.name === username && p.pass === password);
    if (user) {
        authenticatedUser = user; 
        if (!authenticatedUser.status) authenticatedUser.status = 'none';
        localStorage.setItem('authUsername', username);
        localStorage.setItem('authPassword', password);
        document.getElementById('auth-section').classList.add('hidden');
        MYPAGE_CONTENT.classList.remove('hidden');
        initializeMyPageContent(); 
        return true;
    } else {
        if (isAuto) {
            localStorage.removeItem('authUsername');
            localStorage.removeItem('authPassword');
        } else {
            showMessage(AUTH_MESSAGE, '❌ 失敗', 'error');
        }
        return false;
    }
}

async function autoLogin() {
    const u = localStorage.getItem('authUsername');
    const p = localStorage.getItem('authPassword');
    if (u && p) await attemptLogin(u, p, true);
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
    await attemptLogin(document.getElementById('username').value.trim(), document.getElementById('password').value.trim(), false);
});
LOGOUT_BUTTON.addEventListener('click', handleLogout);

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

function initializeMemberBonusFeature() {
    const isMember = ['pro', 'premium', 'luxury'].includes(authenticatedUser.status);
    if (isMember) {
        PRO_BONUS_TOOL?.classList.remove('hidden');
        updateMemberBonusDisplay(); 
    }
}

function updateMemberBonusDisplay() {
    if (!authenticatedUser) return;
    const s = authenticatedUser.status;
    let amt = (s === 'premium') ? 15 : 10;
    let interval = (s === 'luxury') ? 3600000 : 86400000;
    const last = authenticatedUser.lastBonusTime ? new Date(authenticatedUser.lastBonusTime).getTime() : 0;
    const ready = (Date.now() - last) >= interval;
    if (PRO_BONUS_BUTTON) {
        PRO_BONUS_BUTTON.disabled = !ready;
        PRO_BONUS_BUTTON.textContent = ready ? `ボーナス (+${amt.toFixed(1)} P) を獲得` : '獲得済み';
    }
}

PRO_BONUS_BUTTON?.addEventListener('click', async () => {
    const s = authenticatedUser.status;
    const amt = (s === 'premium') ? 15 : 10;
    const data = await fetchAllData();
    const player = data.scores.find(p => p.name === authenticatedUser.name);
    player.score = parseFloat((player.score + amt).toFixed(1));
    player.lastBonusTime = new Date().toISOString();
    await updateAllData(data);
    authenticatedUser = player;
    CURRENT_SCORE_ELEMENT.textContent = player.score.toFixed(1);
    updateMemberBonusDisplay();
});

async function handleApplyGiftCode(e) {
    e.preventDefault();
    const code = GIFT_CODE_INPUT.value.trim().toUpperCase();
    const data = await fetchAllData();
    const cIdx = data.gift_codes.findIndex(c => c.code === code);
    if (cIdx === -1) return showMessage(APPLY_GIFT_CODE_MESSAGE, '無効なコード', 'error');
    const gift = data.gift_codes[cIdx];
    const player = data.scores.find(p => p.name === authenticatedUser.name);
    player.score = parseFloat((player.score + gift.points).toFixed(1));
    gift.currentUses++;
    if (gift.maxUses > 0 && gift.currentUses >= gift.maxUses) data.gift_codes.splice(cIdx, 1);
    await updateAllData(data);
    authenticatedUser = player;
    CURRENT_SCORE_ELEMENT.textContent = player.score.toFixed(1);
    showMessage(APPLY_GIFT_CODE_MESSAGE, '獲得完了', 'success');
}

function initializeGiftCodeFeature() {
    APPLY_GIFT_CODE_FORM?.addEventListener('submit', handleApplyGiftCode);
}

async function loadTransferReceiverList() {
    const data = await fetchAllData();
    let opt = '<option value="" disabled selected>送金先を選択</option>';
    data.scores.forEach(p => { if(p.name !== authenticatedUser.name) opt += `<option value="${p.name}">${p.name}</option>`; });
    RECEIVER_PLAYER_SELECT_MYPAGE.innerHTML = opt;
}

TRANSFER_FORM_MYPAGE?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rcvr = RECEIVER_PLAYER_SELECT_MYPAGE.value;
    const amt = parseFloat(document.getElementById('transfer-amount-mypage').value);
    const data = await fetchAllData();
    const s = data.scores.find(p => p.name === authenticatedUser.name);
    const r = data.scores.find(p => p.name === rcvr);
    if (s.score < amt) return;
    s.score = parseFloat((s.score - amt).toFixed(1));
    r.score = parseFloat((r.score + amt).toFixed(1));
    await updateAllData(data);
    authenticatedUser = s;
    CURRENT_SCORE_ELEMENT.textContent = s.score.toFixed(1);
    showMessage(document.getElementById('transfer-message-mypage'), '送金完了', 'success');
});

async function loadBettingDataAndHistory() {
    const data = await fetchAllData();
    const open = (data.sports_bets || []).filter(b => b.status === 'OPEN' && new Date(b.deadline) > new Date());
    let opt = '<option value="" disabled selected>くじを選択</option>';
    open.forEach(b => { opt += `<option value="${b.betId}">${b.matchName}</option>`; });
    TARGET_BET_SELECT.innerHTML = opt;
}

function initializeWagerInputs() {
    WAGER_INPUTS_CONTAINER.innerHTML = '';
    addWagerRow();
}

function addWagerRow() {
    const row = document.createElement('div');
    row.className = 'form-group wager-row';
    row.innerHTML = `<input type="text" class="wager-item-input" placeholder="内容" required> <input type="number" class="wager-amount-input" placeholder="P" required>`;
    WAGER_INPUTS_CONTAINER.appendChild(row);
}

ADD_WAGER_ROW_BUTTON?.addEventListener('click', addWagerRow);

WAGER_FORM?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const betId = parseInt(TARGET_BET_SELECT.value);
    const wagers = [];
    let total = 0;
    WAGER_INPUTS_CONTAINER.querySelectorAll('.wager-row').forEach(r => {
        const item = r.querySelector('.wager-item-input').value;
        const amt = parseFloat(r.querySelector('.wager-amount-input').value);
        wagers.push({ item, amount: amt, player: authenticatedUser.name, timestamp: new Date().toISOString(), isWin: null });
        total += amt;
    });
    const data = await fetchAllData();
    const s = data.scores.find(p => p.name === authenticatedUser.name);
    if (s.score < total) return showMessage(document.getElementById('wager-message'), '残高不足', 'error');
    s.score = parseFloat((s.score - total).toFixed(1));
    data.sports_bets.find(b => b.betId === betId).wagers.push(...wagers);
    await updateAllData(data);
    authenticatedUser = s;
    CURRENT_SCORE_ELEMENT.textContent = s.score.toFixed(1);
    showMessage(document.getElementById('wager-message'), '投票完了', 'success');
});

async function loadLotteryData() {
    const data = await fetchAllData();
    const open = (data.lotteries || []).filter(l => l.status === 'OPEN' && new Date(l.purchaseDeadline) > new Date());
    availableLotteries = open;
    let opt = '<option value="" disabled selected>宝くじを選択</option>';
    open.forEach(l => { opt += `<option value="${l.lotteryId}">${l.name}</option>`; });
    LOTTERY_SELECT.innerHTML = opt;
}

function initializeLotteryPurchaseForm() {
    LOTTERY_SELECT.onchange = () => {
        const l = availableLotteries.find(lx => lx.lotteryId === parseInt(LOTTERY_SELECT.value));
        const cnt = parseInt(LOTTERY_TICKET_COUNT.value);
        LOTTERY_TOTAL_PRICE_DISPLAY.textContent = `合計: ${(l.ticketPrice * cnt).toFixed(1)} P`;
    };
}

LOTTERY_PURCHASE_FORM?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(LOTTERY_SELECT.value);
    const cnt = parseInt(LOTTERY_TICKET_COUNT.value);
    const data = await fetchAllData();
    const lot = data.lotteries.find(l => l.lotteryId === id);
    const cost = lot.ticketPrice * cnt;
    const s = data.scores.find(p => p.name === authenticatedUser.name);
    if (s.score < cost) return;
    s.score = parseFloat((s.score - cost).toFixed(1));
    for(let i=0; i<cnt; i++) {
        const r = Math.random();
        let cur = 0;
        let rank = null;
        for(const p of lot.prizes) {
            cur += p.probability;
            if(r < cur) { rank = p.rank; break; }
        }
        lot.tickets.push({ player: s.name, prizeRank: rank, isClaimed: false, count: 1 });
    }
    await updateAllData(data);
    authenticatedUser = s;
    CURRENT_SCORE_ELEMENT.textContent = s.score.toFixed(1);
    showMessage(LOTTERY_PURCHASE_MESSAGE, '購入完了', 'success');
});

window.onload = autoLogin;
