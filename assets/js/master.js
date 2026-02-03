// assets/js/master.js

const AUTH_FORM = document.getElementById('auth-form');
const ADMIN_TOOLS = document.getElementById('admin-tools');
const AUTH_MESSAGE = document.getElementById('auth-message');
const TARGET_PLAYER_SELECT = document.getElementById('target-player');
const MASTER_LOGOUT_BUTTON = document.getElementById('master-logout-button');

// 送金機能
const TRANSFER_FORM = document.getElementById('transfer-form');
const SENDER_PLAYER_SELECT = document.getElementById('sender-player');
const RECEIVER_PLAYER_SELECT = document.getElementById('receiver-player');

// スポーツくじ管理機能
const BET_LIST_CONTAINER = document.getElementById('bet-list-container');
const CREATE_BET_FORM = document.getElementById('create-bet-form');

// 麻雀結果入力機能
const MAHJONG_FORM = document.getElementById('mahjong-form');
const MAHJONG_PLAYER_INPUTS_CONTAINER = document.getElementById('mahjong-player-inputs');
const MAHJONG_MESSAGE_ELEMENT = document.getElementById('mahjong-message');
const MAHJONG_SUBMIT_BUTTON = document.getElementById('mahjong-submit-button');

// 日次ポイント徴収
const DAILY_TAX_BUTTON = document.getElementById('daily-tax-button');
const DAILY_TAX_MESSAGE = document.getElementById('daily-tax-message');

// 宝くじ機能
const CREATE_LOTTERY_FORM = document.getElementById('create-lottery-form');
const CREATE_LOTTERY_MESSAGE = document.getElementById('create-lottery-message');

// プレゼントコード発行
const CREATE_GIFT_CODE_FORM = document.getElementById('create-gift-code-form');
const CREATE_GIFT_CODE_MESSAGE = document.getElementById('create-gift-code-message');

// --- 定数：麻雀ルール ---
const POINT_RATE = 1000; 
const UMA_OKA = [30, 10, -10, -20]; 
const STARTING_SCORE = 30000; 
let ALL_PLAYER_NAMES = []; 

let isAuthenticatedAsMaster = false;

// -----------------------------------------------------------------
// 認証とログイン状態の管理
// -----------------------------------------------------------------

async function attemptMasterLogin(username, password, isAuto = false) { 
    if (!isAuto) showMessage(AUTH_MESSAGE, '認証中...', 'info');
    
    if (username !== MASTER_USERNAME) {
        showMessage(AUTH_MESSAGE, '❌ ユーザー名が異なります。', 'error');
        return false;
    }

    try {
        const allData = await fetchAllData();
        const masterUser = allData.scores.find(p => p.name === MASTER_USERNAME);

        if (!masterUser) {
            showMessage(AUTH_MESSAGE, '❌ マスターアカウントが見つかりません。', 'error');
            return false;
        }

        if (masterUser.pass === password) {
            isAuthenticatedAsMaster = true;
            document.getElementById('auth-section').classList.add('hidden');
            ADMIN_TOOLS.classList.remove('hidden');
            MASTER_LOGOUT_BUTTON.classList.remove('hidden');

            loadPlayerList(); 
            loadTransferPlayerLists(); 
            initializeSportsMasterTools(); 
            loadMahjongForm(); 
            initializeLotteryForm();
            
            if (!isAuto) showMessage(AUTH_MESSAGE, `✅ ログイン成功!`, 'success');
            return true;
        } else {
            showMessage(AUTH_MESSAGE, '❌ パスワード不一致', 'error');
            return false;
        }
    } catch (error) {
        showMessage(AUTH_MESSAGE, `❌ サーバーエラー`, 'error');
        return false;
    }
}

function handleMasterLogout() {
    if (!window.confirm('ログアウトしますか？')) return;
    isAuthenticatedAsMaster = false;
    document.getElementById('auth-section').classList.remove('hidden');
    ADMIN_TOOLS.classList.add('hidden');
    MASTER_LOGOUT_BUTTON.classList.add('hidden');
    AUTH_FORM.reset();
    showMessage(AUTH_MESSAGE, '👋 ログアウト完了', 'info');
}

AUTH_FORM.addEventListener('submit', async (e) => { 
    e.preventDefault();
    const username = document.getElementById('username').value.trim(); 
    const password = document.getElementById('password').value;
    await attemptMasterLogin(username, password, false); 
});

MASTER_LOGOUT_BUTTON.addEventListener('click', handleMasterLogout);

// -----------------------------------------------------------------
// プレイヤーリストロード
// -----------------------------------------------------------------

async function loadPlayerList() {
    const scores = await fetchScores();
    if (!TARGET_PLAYER_SELECT) return;
    let options = '<option value="" disabled selected>プレイヤーを選択</option>';
    scores.forEach(p => options += `<option value="${p.name}">${p.name} (${p.score.toFixed(1)} P)</option>`);
    TARGET_PLAYER_SELECT.innerHTML = options;
}

async function loadTransferPlayerLists() {
    const scores = await fetchScores();
    if (!SENDER_PLAYER_SELECT || !RECEIVER_PLAYER_SELECT) return;
    let options = '<option value="" disabled selected>プレイヤーを選択</option>';
    scores.forEach(p => options += `<option value="${p.name}">${p.name}</option>`);
    SENDER_PLAYER_SELECT.innerHTML = options;
    RECEIVER_PLAYER_SELECT.innerHTML = options;
}

// -----------------------------------------------------------------
// 麻雀結果
// -----------------------------------------------------------------

async function loadMahjongForm() {
    const scores = await fetchScores();
    ALL_PLAYER_NAMES = scores.map(p => p.name);
    if (!MAHJONG_PLAYER_INPUTS_CONTAINER) return;
    let html = '';
    for (let i = 1; i <= 4; i++) {
        html += `
            <div class="form-group player-input-row">
                <label>プレイヤー${i}:</label>
                <select id="mahjong-player-${i}-name" required>
                    <option value="" disabled selected>選択</option>
                    ${ALL_PLAYER_NAMES.map(name => `<option value="${name}">${name}</option>`).join('')}
                </select>
                <input type="number" id="mahjong-player-${i}-score" placeholder="点数" required>
            </div>
        `;
    }
    MAHJONG_PLAYER_INPUTS_CONTAINER.innerHTML = html;
}

MAHJONG_FORM?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const results = [];
    const selectedNames = new Set();
    for (let i = 1; i <= 4; i++) {
        const name = document.getElementById(`mahjong-player-${i}-name`).value;
        const score = parseInt(document.getElementById(`mahjong-player-${i}-score`).value, 10);
        if (selectedNames.has(name)) return showMessage(MAHJONG_MESSAGE_ELEMENT, '重複あり', 'error');
        selectedNames.add(name);
        results.push({ name, score });
    }
    
    MAHJONG_SUBMIT_BUTTON.disabled = true;
    try {
        const data = await fetchAllData();
        let scoresMap = new Map(data.scores.map(p => [p.name, p]));
        results.sort((a, b) => b.score - a.score);
        results.forEach((r, i) => {
            const diff = (r.score - STARTING_SCORE) / POINT_RATE + UMA_OKA[i];
            const p = scoresMap.get(r.name);
            if (p) scoresMap.set(r.name, { ...p, score: parseFloat(((p.score || 0) + diff).toFixed(1)) });
        });
        await updateAllData({ ...data, scores: Array.from(scoresMap.values()) });
        showMessage(MAHJONG_MESSAGE_ELEMENT, '反映完了', 'success');
        MAHJONG_FORM.reset();
        loadPlayerList();
    } finally { MAHJONG_SUBMIT_BUTTON.disabled = false; }
});

// -----------------------------------------------------------------
// スポーツくじ
// -----------------------------------------------------------------

async function initializeSportsMasterTools() {
    if (!CREATE_BET_FORM) return;
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const deadlineInput = document.getElementById('deadline-datetime');
    if (deadlineInput) deadlineInput.value = formatDateTimeLocal(now);
    await loadBettingData();
}

function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function loadBettingData() {
    const data = await fetchAllData();
    renderBetList(data.sports_bets || []);
}

CREATE_BET_FORM?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('match-name').value;
    const deadline = document.getElementById('deadline-datetime').value;
    const data = await fetchAllData();
    let bets = data.sports_bets || [];
    if (bets.length >= 3) bets.shift();
    bets.push({ betId: Date.now(), matchName: name, creator: 'Master', deadline: new Date(deadline).toISOString(), status: 'OPEN', wagers: [] });
    await updateAllData({ ...data, sports_bets: bets });
    showMessage(document.getElementById('create-message'), '作成完了', 'success');
    loadBettingData();
});

function renderBetList(bets) {
    if (!BET_LIST_CONTAINER) return;
    let html = bets.length ? '' : '<p>なし</p>';
    bets.forEach(b => {
        html += `<div class="bet-card"><h4>${b.matchName} (#${b.betId})</h4><p>ステータス: ${b.status}</p>`;
        if (b.status === 'OPEN') html += `<button class="close-btn" data-id="${b.betId}">投票締切</button>`;
        html += `</div>`;
    });
    BET_LIST_CONTAINER.innerHTML = html;
    document.querySelectorAll('.close-btn').forEach(btn => btn.onclick = async (e) => {
        const id = parseInt(e.target.dataset.id);
        const data = await fetchAllData();
        const bet = data.sports_bets.find(bx => bx.betId === id);
        if (bet) { bet.status = 'CLOSED'; await updateAllData(data); loadBettingData(); }
    });
}

// -----------------------------------------------------------------
// 税金徴収
// -----------------------------------------------------------------

DAILY_TAX_BUTTON?.addEventListener('click', async () => {
    if (!window.confirm('保有ポイントの5%を徴収します。よろしいですか？')) return;
    try {
        const data = await fetchAllData();
        data.scores.forEach(p => {
            if (p.name !== '3mahjong' && p.score > 0) {
                const tax = parseFloat((p.score * 0.05).toFixed(1));
                p.score = parseFloat((p.score - tax).toFixed(1));
            }
        });
        await updateAllData(data);
        showMessage(DAILY_TAX_MESSAGE, '徴収完了', 'success');
    } catch (e) {}
});

// -----------------------------------------------------------------
// プレゼントコード & 宝くじ
// -----------------------------------------------------------------

CREATE_GIFT_CODE_FORM?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('gift-code-name').value.trim().toUpperCase();
    const points = parseFloat(document.getElementById('gift-code-amount').value);
    const max = parseInt(document.getElementById('gift-code-max-uses').value);
    const data = await fetchAllData();
    data.gift_codes = data.gift_codes || [];
    data.gift_codes.push({ code, points, maxUses: max, currentUses: 0 });
    await updateAllData(data);
    showMessage(CREATE_GIFT_CODE_MESSAGE, 'コード発行完了', 'success');
});

function initializeLotteryForm() {
    const now = new Date();
    const f = (d) => d.toISOString().slice(0, 16);
    document.getElementById('lottery-purchase-deadline').value = f(new Date(now.getTime() + 3*24*60*60*1000));
    document.getElementById('lottery-result-announce').value = f(new Date(now.getTime() + 4*24*60*60*1000));
}

CREATE_LOTTERY_FORM?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('lottery-name').value;
    const price = parseFloat(document.getElementById('lottery-ticket-price').value);
    const prizes = [];
    for (let i = 1; i <= 5; i++) {
        const amt = parseFloat(document.getElementById(`lottery-prize-amount-${i}`).value);
        const prob = parseFloat(document.getElementById(`lottery-prize-prob-${i}`).value);
        if (amt && prob) prizes.push({ rank: i, amount: amt, probability: prob / 100 });
    }
    const data = await fetchAllData();
    data.lotteries = data.lotteries || [];
    data.lotteries.push({ lotteryId: Date.now(), name, ticketPrice: price, status: 'OPEN', prizes, tickets: [], 
        purchaseDeadline: new Date(document.getElementById('lottery-purchase-deadline').value).toISOString(),
        resultAnnounceDate: new Date(document.getElementById('lottery-result-announce').value).toISOString()
    });
    await updateAllData(data);
    showMessage(CREATE_LOTTERY_MESSAGE, '開催完了', 'success');
});
