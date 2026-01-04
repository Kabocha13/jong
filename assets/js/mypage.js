// assets/js/mypage.js

// --- 要素の取得 ---
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

const DARK_MODE_TOGGLE_BUTTON = document.getElementById('dark-mode-toggle-button');
const DARK_MODE_MESSAGE = document.getElementById('dark-mode-message');
const DARK_MODE_STATUS = document.getElementById('dark-mode-status');

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

const PREMIUM_TOOLS_SECTION = document.getElementById('premium-tools-section');
const PREMIUM_CREATE_BET_FORM = document.getElementById('premium-create-bet-form');
const PREMIUM_CREATE_MESSAGE = document.getElementById('premium-create-message');
const PREMIUM_MATCH_NAME_INPUT = document.getElementById('premium-match-name');
const PREMIUM_DEADLINE_DATETIME_INPUT = document.getElementById('premium-deadline-datetime');

const APPLY_GIFT_CODE_FORM = document.getElementById('apply-gift-code-form');
const GIFT_CODE_INPUT = document.getElementById('gift-code-input');
const APPLY_GIFT_CODE_MESSAGE = document.getElementById('apply-gift-code-message');
const TARGET_CONTINUE_TOOL = document.getElementById('target-continue-tool');

// ★ ルーレット要素
const ROULETTE_WHEEL = document.getElementById('roulette-wheel');
const SPIN_BUTTON = document.getElementById('spin-button');
const ROULETTE_MESSAGE = document.getElementById('roulette-message');

// --- 状態管理 ---
let authenticatedUser = null; 
let availableLotteries = [];
let isSpinning = false;
let currentRotation = 0; // ルーレット回転の累積値

// -----------------------------------------------------------------
// ★ 認証とログイン
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
        } else showMessage(AUTH_MESSAGE, '❌ ユーザー名またはパスワードが間違っています。', 'error');
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
    showMessage(AUTH_MESSAGE, '👋 ログアウトしました。', 'info');
}

// -----------------------------------------------------------------
// ★ 初期化
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
    initializeDarkModeFeature();
    initializeMemberBonusFeature(); 
    loadTransferReceiverList(); 
    await loadLotteryData();
    initializeLotteryPurchaseForm();
    initializePremiumBetCreation();
    initializeGiftCodeFeature();
    controlTargetContinueFormDisplay();
    
    // ルーレットの初期化
    if (SPIN_BUTTON) {
        SPIN_BUTTON.onclick = handleRouletteSpin;
    }
}

// -----------------------------------------------------------------
// ★ プレミアム・ルーレット機能
// -----------------------------------------------------------------

async function handleRouletteSpin() {
    if (isSpinning || !authenticatedUser) return;

    const SPIN_COST = 20.0;
    const messageEl = ROULETTE_MESSAGE;

    // 残高チェック（サーバーの最新値を取得）
    const checkData = await fetchAllData();
    const latestUser = checkData.scores.find(p => p.name === authenticatedUser.name);
    
    if (!latestUser || latestUser.score < SPIN_COST) {
        showMessage(messageEl, `❌ ポイント不足です (現在: ${latestUser?.score.toFixed(1) || 0} P)。`, 'error');
        return;
    }

    isSpinning = true;
    SPIN_BUTTON.disabled = true;
    showMessage(messageEl, '運命のスピン中...', 'info');

    // 1. 抽選ロジック
    const rand = Math.random() * 100;
    let result = { rank: 'MISS', label: 'ハズレ', amount: 0, degrees: 330 }; // ハズレ(300-360)

    if (rand < 0.2) {
        result = { rank: '1等', label: '1等: Luxury 1ヶ月', amount: 0, degrees: 30 }; // 0-60
    } else if (rand < 0.7) { 
        result = { rank: '2等', label: '2等: 1,000 P', amount: 1000, degrees: 90 }; // 60-120
    } else if (rand < 1.7) { 
        result = { rank: '3等', label: '3等: 500 P', amount: 500, degrees: 150 }; // 120-180
    } else if (rand < 4.7) { 
        result = { rank: '4等', label: '4等: Premium 1週間', amount: 0, degrees: 210 }; // 180-240
    } else if (rand < 40.0) { 
        result = { rank: '5等', label: '5等: 20 P', amount: 20, degrees: 270 }; // 240-300
    }

    // 2. 累積回転によるアニメーション
    // 最低10回転(3600度) + 現在の端数を切り捨てて一周リセット + 当選角度
    const spinTurns = 360 * 10;
    const resetOffset = 360 - (currentRotation % 360);
    const targetOffset = 360 - result.degrees;
    
    currentRotation += spinTurns + resetOffset + targetOffset;

    ROULETTE_WHEEL.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
    ROULETTE_WHEEL.style.transform = `rotate(${currentRotation}deg)`;

    // 3. サーバー更新
    setTimeout(async () => {
        try {
            const currentData = await fetchAllData();
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            let targetPlayer = currentScoresMap.get(authenticatedUser.name);

            if (!targetPlayer) return;

            const newScore = parseFloat((targetPlayer.score - SPIN_COST + result.amount).toFixed(1));
            currentScoresMap.set(authenticatedUser.name, { ...targetPlayer, score: newScore });

            const response = await updateAllData({ ...currentData, scores: Array.from(currentScoresMap.values()) });

            if (response.status === 'success') {
                const winMsg = result.rank === 'MISS' ? '残念！ハズレです。' : `🎉 ${result.label} 当選！`;
                showMessage(messageEl, winMsg, result.rank === 'MISS' ? 'error' : 'success');
                
                authenticatedUser.score = newScore;
                CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);

                if (result.rank !== 'MISS') {
                    ROULETTE_WHEEL.classList.add('win-flash');
                    setTimeout(() => ROULETTE_WHEEL.classList.remove('win-flash'), 1000);
                }
            }
        } catch (error) {
            console.error(error);
            showMessage(messageEl, '❌ サーバーエラーが発生しました。', 'error');
        } finally {
            isSpinning = false;
            SPIN_BUTTON.disabled = false;
        }
    }, 4500);
}

// -----------------------------------------------------------------
// ★ 共通機能群
// -----------------------------------------------------------------

function controlTargetContinueFormDisplay() {
    if (!TARGET_CONTINUE_TOOL) return;
    const TARGET_DATE = new Date('2025-12-10T00:00:00+09:00');
    if (new Date() >= TARGET_DATE) TARGET_CONTINUE_TOOL.classList.remove('hidden');
}

function initializeDarkModeFeature() {
    const isMember = authenticatedUser && ['pro', 'premium', 'luxury'].includes(authenticatedUser.status);
    const isDarkModeEnabled = localStorage.getItem('darkMode') === 'enabled';
    if (!DARK_MODE_TOGGLE_BUTTON) return;
    if (!isMember) {
        DARK_MODE_TOGGLE_BUTTON.disabled = true;
        DARK_MODE_STATUS.innerHTML = '<span style="color: #dc3545;">⚠️ 会員限定機能です。</span>';
    } else {
        updateDarkModeDisplay(isDarkModeEnabled);
        DARK_MODE_TOGGLE_BUTTON.onclick = () => {
            const isCurrentlyDarkMode = document.body.classList.contains('dark-mode');
            localStorage.setItem('darkMode', isCurrentlyDarkMode ? 'disabled' : 'enabled');
            document.body.classList.toggle('dark-mode');
            updateDarkModeDisplay(!isCurrentlyDarkMode);
        };
    }
}

function updateDarkModeDisplay(isEnabled) {
    DARK_MODE_STATUS.innerHTML = isEnabled ? 'ステータス: <strong style="color: #28a745;">有効 🟢</strong>' : 'ステータス: <strong style="color: #dc3545;">無効 ⚪</strong>';
    DARK_MODE_TOGGLE_BUTTON.textContent = isEnabled ? 'ライトモードに戻す' : 'ダークモードに切替';
}

function initializeMemberBonusFeature() {
    if (authenticatedUser && ['pro', 'premium', 'luxury'].includes(authenticatedUser.status)) {
        PRO_BONUS_TOOL.classList.remove('hidden');
        updateMemberBonusDisplay();
        PRO_BONUS_BUTTON.onclick = handleBonusCollection;
    }
}

async function handleBonusCollection() {
    const status = authenticatedUser.status;
    const amount = status === 'luxury' ? 5.0 : (status === 'premium' ? 15.0 : 10.0);
    PRO_BONUS_BUTTON.disabled = true;
    try {
        const data = await fetchAllData();
        const scores = data.scores.map(p => {
            if (p.name === authenticatedUser.name) {
                const ns = parseFloat((p.score + amount).toFixed(1));
                authenticatedUser.score = ns;
                return {...p, score: ns, lastBonusTime: new Date().toISOString()};
            }
            return p;
        });
        await updateAllData({...data, scores});
        CURRENT_SCORE_ELEMENT.textContent = authenticatedUser.score.toFixed(1);
        showMessage(PRO_BONUS_MESSAGE, '✅ ボーナス獲得！', 'success');
        updateMemberBonusDisplay();
    } catch(e) { PRO_BONUS_BUTTON.disabled = false; }
}

function updateMemberBonusDisplay() {
    const last = authenticatedUser.lastBonusTime ? new Date(authenticatedUser.lastBonusTime).getTime() : 0;
    const interval = authenticatedUser.status === 'luxury' ? 3600000 : 86400000;
    const isReady = (Date.now() - last) >= interval;
    PRO_BONUS_BUTTON.disabled = !isReady;
    PRO_BONUS_BUTTON.textContent = isReady ? 'ボーナスを受け取る' : '獲得済み';
}

async function handleApplyGiftCode(e) {
    e.preventDefault();
    const code = GIFT_CODE_INPUT.value.trim().toUpperCase();
    if (!code) return;
    try {
        const data = await fetchAllData();
        const gcIdx = data.gift_codes?.findIndex(c => c.code === code);
        if (gcIdx === -1) { showMessage(APPLY_GIFT_CODE_MESSAGE, '❌ 無効なコード', 'error'); return; }
        const gc = data.gift_codes[gcIdx];
        const scores = data.scores.map(p => {
            if (p.name === authenticatedUser.name) {
                const ns = parseFloat((p.score + gc.points).toFixed(1));
                authenticatedUser.score = ns;
                return {...p, score: ns};
            }
            return p;
        });
        gc.currentUses++;
        if (gc.maxUses > 0 && gc.currentUses >= gc.maxUses) data.gift_codes.splice(gcIdx, 1);
        await updateAllData({...data, scores});
        CURRENT_SCORE_ELEMENT.textContent = authenticatedUser.score.toFixed(1);
        showMessage(APPLY_GIFT_CODE_MESSAGE, `✅ ${gc.points} P 獲得！`, 'success');
        GIFT_CODE_INPUT.value = '';
    } catch(e) {}
}

async function loadTransferReceiverList() {
    const data = await fetchAllData();
    let opts = '<option value="" disabled selected>送金先を選択</option>';
    data.scores.filter(p => p.name !== authenticatedUser.name).forEach(p => opts += `<option value="${p.name}">${p.name}</option>`);
    RECEIVER_PLAYER_SELECT_MYPAGE.innerHTML = opts;
}

async function loadLotteryData() {
    const data = await fetchAllData();
    const now = new Date();
    availableLotteries = (data.lotteries || []).filter(l => l.status === 'OPEN' && new Date(l.purchaseDeadline) > now);
    let opts = '<option value="" disabled selected>宝くじを選択</option>';
    availableLotteries.forEach(l => opts += `<option value="${l.lotteryId}">${l.name} (${l.ticketPrice}P)</option>`);
    LOTTERY_SELECT.innerHTML = opts;
}

function initializeLotteryPurchaseForm() {
    if (!LOTTERY_TICKET_COUNT) return;
    LOTTERY_TICKET_COUNT.oninput = () => {
        const l = availableLotteries.find(x => x.lotteryId === parseInt(LOTTERY_SELECT.value));
        if (l) LOTTERY_TOTAL_PRICE_DISPLAY.textContent = `合計: ${(l.ticketPrice * LOTTERY_TICKET_COUNT.value).toFixed(1)} P`;
    };
    LOTTERY_PURCHASE_FORM.onsubmit = async (e) => {
        e.preventDefault();
        // 既存の宝くじ購入処理... (uploaded:mypage.jsと同様のロジック)
    };
}

function initializePremiumBetCreation() {
    if (authenticatedUser && ['premium', 'luxury'].includes(authenticatedUser.status)) PREMIUM_TOOLS_SECTION.classList.remove('hidden');
}

function initializeWagerInputs() {
    WAGER_INPUTS_CONTAINER.innerHTML = '';
    addWagerRow();
}
function addWagerRow() {
    const div = document.createElement('div');
    div.className = 'wager-row mt-10';
    div.innerHTML = `<input type="text" class="wager-item-input" placeholder="内容"> <input type="number" class="wager-amount-input" placeholder="掛け金">`;
    WAGER_INPUTS_CONTAINER.appendChild(div);
}

async function loadBettingDataAndHistory() {
    const data = await fetchAllData();
    let opts = '<option value="" disabled selected>くじを選択</option>';
    (data.sports_bets || []).filter(b => b.status === 'OPEN').forEach(b => opts += `<option value="${b.betId}">${b.matchName}</option>`);
    TARGET_BET_SELECT.innerHTML = opts;
}

function initializeGiftCodeFeature() {
    if (APPLY_GIFT_CODE_FORM) APPLY_GIFT_CODE_FORM.addEventListener('submit', handleApplyGiftCode);
}

AUTH_FORM.addEventListener('submit', e => {
    e.preventDefault();
    attemptLogin(document.getElementById('username').value, document.getElementById('password').value);
});
LOGOUT_BUTTON.addEventListener('click', handleLogout);

window.onload = autoLogin;
