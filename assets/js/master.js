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

async function attemptLogin(username, password, isAuto = false) {
    if (!isAuto) showMessage(AUTH_MESSAGE, '認証中...', 'info');
    const allData = await fetchAllData();
    const user = allData.scores.find(p => p.name === username && p.pass === password);
    if (user) {
        authenticatedUser = user; 
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
            showMessage(AUTH_MESSAGE, '❌ 認証失敗', 'error');
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
}

AUTH_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    await attemptLogin(document.getElementById('username').value.trim(), document.getElementById('password').value.trim());
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
    const isMember = authenticatedUser && ['pro', 'premium', 'luxury'].includes(authenticatedUser.status);
    if (isMember) {
        if (PRO_BONUS_TOOL) PRO_BONUS_TOOL.classList.remove('hidden');
        updateMemberBonusDisplay(); 
    }
}

function updateMemberBonusDisplay() {
    if (!authenticatedUser) return;
    const now = Date.now();
    const last = authenticatedUser.lastBonusTime ? new Date(authenticatedUser.lastBonusTime).getTime() : 0;
    const interval = authenticatedUser.status === 'luxury' ? 3600000 : 86400000;
    const isReady = (now - last) >= interval;
    if (PRO_BONUS_BUTTON) {
        PRO_BONUS_BUTTON.disabled = !isReady;
        PRO_BONUS_BUTTON.textContent = isReady ? "ボーナスを受け取る" : "獲得済み";
    }
}

async function loadBettingDataAndHistory() {
    const data = await fetchAllData();
    const bets = data.sports_bets || [];
    if (TARGET_BET_SELECT) {
        TARGET_BET_SELECT.innerHTML = '<option value="" disabled selected>くじを選択</option>';
        bets.filter(b => b.status === 'OPEN').forEach(b => {
            TARGET_BET_SELECT.innerHTML += `<option value="${b.betId}">${b.matchName}</option>`;
        });
    }
}

function initializeWagerInputs() {
    if (WAGER_INPUTS_CONTAINER) WAGER_INPUTS_CONTAINER.innerHTML = '';
}

async function loadTransferReceiverList() {
    const data = await fetchAllData();
    if (RECEIVER_PLAYER_SELECT_MYPAGE) {
        RECEIVER_PLAYER_SELECT_MYPAGE.innerHTML = '<option value="" disabled selected>送金先を選択</option>';
        data.scores.filter(p => p.name !== authenticatedUser.name).forEach(p => {
            RECEIVER_PLAYER_SELECT_MYPAGE.innerHTML += `<option value="${p.name}">${p.name}</option>`;
        });
    }
}

async function loadLotteryData() {
    const data = await fetchAllData();
    availableLotteries = data.lotteries || [];
    if (LOTTERY_SELECT) {
        LOTTERY_SELECT.innerHTML = '<option value="" disabled selected>宝くじを選択</option>';
        availableLotteries.filter(l => l.status === 'OPEN').forEach(l => {
            LOTTERY_SELECT.innerHTML += `<option value="${l.lotteryId}">${l.name}</option>`;
        });
    }
}

function initializeLotteryPurchaseForm() {}
function initializeGiftCodeFeature() {}

window.onload = autoLogin;
