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

/**
 * マスター認証を試みる処理
 */
async function attemptMasterLogin(username, password, isAuto = false) { 
    if (!isAuto) {
        showMessage(AUTH_MESSAGE, '認証中...', 'info');
    }
    
    if (username !== MASTER_USERNAME) {
        showMessage(AUTH_MESSAGE, '❌ ユーザー名がマスターユーザー名と異なります。', 'error');
        return false;
    }

    try {
        const allData = await fetchAllData();
        const scores = allData.scores;
        const masterUser = scores.find(p => p.name === MASTER_USERNAME);

        if (!masterUser) {
            showMessage(AUTH_MESSAGE, '❌ ユーザーデータにマスターアカウントが見つかりませんでした。', 'error');
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
            
            if (!isAuto) {
                 showMessage(AUTH_MESSAGE, `✅ ログイン成功! マスターモードを有効化しました。`, 'success');
            }
            return true;
        } else {
            showMessage(AUTH_MESSAGE, '❌ パスワードが間違っています。', 'error');
            return false;
        }
    } catch (error) {
        showMessage(AUTH_MESSAGE, `❌ サーバーエラーが発生しました。`, 'error');
        return false;
    }
}

function handleMasterLogout() {
    if (!window.confirm('マスターモードからログアウトしますか？')) return;
    isAuthenticatedAsMaster = false;
    document.getElementById('auth-section').classList.remove('hidden');
    ADMIN_TOOLS.classList.add('hidden');
    MASTER_LOGOUT_BUTTON.classList.add('hidden');
    AUTH_FORM.reset();
    showMessage(AUTH_MESSAGE, '👋 マスターモードを解除しました。', 'info');
}

AUTH_FORM.addEventListener('submit', async (e) => { 
    e.preventDefault();
    const username = document.getElementById('username').value.trim(); 
    const password = document.getElementById('password').value;
    await attemptMasterLogin(username, password, false); 
});

MASTER_LOGOUT_BUTTON.addEventListener('click', handleMasterLogout);

async function fetchAndSetPlayerNames() {
    const scores = await fetchScores(); 
    if (scores.length === 0) return false;
    ALL_PLAYER_NAMES = scores.map(p => p.name);
    return true;
}

async function loadPlayerList() {
    if (!TARGET_PLAYER_SELECT) return;
    TARGET_PLAYER_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    const scores = await fetchScores();
    if (scores.length === 0) {
        TARGET_PLAYER_SELECT.innerHTML = '<option value="" disabled selected>リストの取得に失敗</option>';
        return;
    }
    let options = '<option value="" disabled selected>プレイヤーを選択</option>';
    scores.forEach(player => { 
        options += `<option value="${player.name}">${player.name} (${player.score.toFixed(1)} P)</option>`;
    });
    TARGET_PLAYER_SELECT.innerHTML = options;
}

async function loadTransferPlayerLists() {
    if (!SENDER_PLAYER_SELECT || !RECEIVER_PLAYER_SELECT) return;
    SENDER_PLAYER_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    RECEIVER_PLAYER_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    const scores = await fetchScores();
    if (scores.length === 0) {
        const fallback = '<option value="" disabled selected>リストの取得に失敗</option>';
        SENDER_PLAYER_SELECT.innerHTML = fallback;
        RECEIVER_PLAYER_SELECT.innerHTML = fallback;
        return;
    }
    let options = '<option value="" disabled selected>プレイヤーを選択</option>';
    scores.forEach(player => {
        options += `<option value="${player.name}">${player.name}</option>`;
    });
    SENDER_PLAYER_SELECT.innerHTML = options;
    RECEIVER_PLAYER_SELECT.innerHTML = options;
}

async function loadMahjongForm() {
    if (!MAHJONG_PLAYER_INPUTS_CONTAINER) return;
    const success = await fetchAndSetPlayerNames();
    if (!success) {
        MAHJONG_PLAYER_INPUTS_CONTAINER.innerHTML = '<p class="error">参加者リストを取得できませんでした。</p>';
        return;
    }
    let html = '';
    for (let i = 1; i <= 4; i++) {
        html += `
            <div class="form-group player-input-row">
                <label for="mahjong-player-${i}-name">プレイヤー${i}:</label>
                <select id="mahjong-player-${i}-name" required>
                    <option value="" disabled selected>名前を選択</option>
                    ${ALL_PLAYER_NAMES.map(name => `<option value="${name}">${name}</option>`).join('')}
                </select>
                <input type="number" id="mahjong-player-${i}-score" placeholder="最終得点" required>
            </div>
        `;
    }
    MAHJONG_PLAYER_INPUTS_CONTAINER.innerHTML = html;
}

if (MAHJONG_FORM) {
    MAHJONG_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const results = [];
        const selectedNames = new Set();
        let totalScore = 0;
    
        for (let i = 1; i <= 4; i++) {
            const name = document.getElementById(`mahjong-player-${i}-name`).value;
            const score = parseInt(document.getElementById(`mahjong-player-${i}-score`).value, 10);
            if (!name || isNaN(score)) return;
            if (selectedNames.has(name)) {
                showMessage(MAHJONG_MESSAGE_ELEMENT, 'エラー: 参加者が重複しています。', 'error');
                return;
            }
            selectedNames.add(name);
            results.push({ name, score });
            totalScore += score;
        }
        
        MAHJONG_SUBMIT_BUTTON.disabled = true;
        showMessage(MAHJONG_MESSAGE_ELEMENT, '結果を計算中...', 'info');
    
        try {
            const currentData = await fetchAllData();
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p])); 
            results.sort((a, b) => b.score - a.score);
            
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const finalPointChange = (result.score - STARTING_SCORE) / POINT_RATE + UMA_OKA[i];
                const currentPlayer = currentScoresMap.get(result.name);
                if (currentPlayer) {
                    currentScoresMap.set(result.name, { 
                        ...currentPlayer, 
                        score: parseFloat(((currentPlayer.score || 0) + finalPointChange).toFixed(1)) 
                    });
                }
            }
    
            const newData = {
                scores: Array.from(currentScoresMap.values()),
                sports_bets: currentData.sports_bets || [],
                lotteries: currentData.lotteries || [],
                gift_codes: currentData.gift_codes || [],
                electric_chair_games: currentData.electric_chair_games || []
            };
            const response = await updateAllData(newData);
            if (response.status === 'success') {
                showMessage(MAHJONG_MESSAGE_ELEMENT, `✅ 成功! ポイントが更新されました。`, 'success');
                MAHJONG_FORM.reset();
                loadPlayerList();
                loadMahjongForm();
            }
        } finally {
            MAHJONG_SUBMIT_BUTTON.disabled = false;
        }
    });
}

// スポーツくじ管理機能
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
    if (!BET_LIST_CONTAINER) return;
    const data = await fetchAllData();
    renderBetList(data.sports_bets || []);
}

if (TRANSFER_FORM) {
    TRANSFER_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageEl = document.getElementById('transfer-message');
        const sender = SENDER_PLAYER_SELECT.value;
        const receiver = RECEIVER_PLAYER_SELECT.value;
        const amount = parseFloat(document.getElementById('transfer-amount').value);
    
        if (sender === receiver) {
            showMessage(messageEl, 'エラー: 送金元と送金先は異なる必要があります。', 'error');
            return;
        }
        try {
            const currentData = await fetchAllData();
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            const s = currentScoresMap.get(sender);
            const r = currentScoresMap.get(receiver);
            if (!s || s.score < amount) return showMessage(messageEl, '残高不足', 'error');

            currentScoresMap.set(sender, { ...s, score: parseFloat((s.score - amount).toFixed(1)) });
            currentScoresMap.set(receiver, { ...r, score: parseFloat((r.score + amount).toFixed(1)) });

            const response = await updateAllData({ ...currentData, scores: Array.from(currentScoresMap.values()) });
            if (response.status === 'success') {
                showMessage(messageEl, '送金完了', 'success');
                TRANSFER_FORM.reset();
                loadPlayerList();
            }
        } catch (e) {}
    });
}

if (CREATE_BET_FORM) {
    CREATE_BET_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageEl = document.getElementById('create-message');
        const matchName = document.getElementById('match-name').value.trim();
        const deadline = document.getElementById('deadline-datetime').value;
        try {
            const currentData = await fetchAllData();
            let allBets = currentData.sports_bets || [];
            if (allBets.length >= 3) allBets.shift();
            const newBetId = allBets.length > 0 ? Math.max(...allBets.map(b => b.betId)) + 1 : 1;
            allBets.push({ betId: newBetId, matchName, creator: 'Master', deadline: new Date(deadline).toISOString(), status: 'OPEN', wagers: [] });
            const response = await updateAllData({ ...currentData, sports_bets: allBets });
            if (response.status === 'success') {
                showMessage(messageEl, `✅ くじ「${matchName}」を作成しました`, 'success');
                CREATE_BET_FORM.reset();
                loadBettingData();
            }
        } catch (e) {}
    });
}

function renderBetList(allBets) {
    if (!BET_LIST_CONTAINER) return;
    if (allBets.length === 0) {
        BET_LIST_CONTAINER.innerHTML = '<p>まだくじが作成されていません。</p>';
        return;
    }
    let html = '';
    allBets.forEach(bet => {
        const totalWagers = bet.wagers.reduce((sum, w) => sum + w.amount, 0);
        html += `
            <div class="bet-card status-${bet.status.toLowerCase()}">
                <h3>${bet.matchName} (#${bet.betId})</h3>
                <p>ステータス: ${bet.status}</p>
                <p>合計投票: ${totalWagers} P</p>
                ${bet.status === 'OPEN' ? `<button class="close-bet" data-bet-id="${bet.betId}">投票締切</button>` : ''}
            </div>
        `;
    });
    BET_LIST_CONTAINER.innerHTML = html;
    document.querySelectorAll('.close-bet').forEach(btn => btn.addEventListener('click', async (e) => {
        const id = parseInt(e.target.dataset.betId);
        const data = await fetchAllData();
        const bet = data.sports_bets.find(b => b.betId === id);
        if (bet) {
            bet.status = 'CLOSED';
            await updateAllData(data);
            loadBettingData();
        }
    }));
}

if (DAILY_TAX_BUTTON) {
    DAILY_TAX_BUTTON.addEventListener('click', async () => {
        if (!window.confirm('保有ポイントの5%を徴収します。よろしいですか？')) return;
        try {
            const data = await fetchAllData();
            let totalCollected = 0;
            data.scores.forEach(p => {
                if (p.name !== '3mahjong' && p.score > 0) {
                    const tax = parseFloat((p.score * 0.05).toFixed(1));
                    p.score = parseFloat((p.score - tax).toFixed(1));
                    totalCollected += tax;
                }
            });
            await updateAllData(data);
            showMessage(DAILY_TAX_MESSAGE, `✅ 徴収完了。合計: ${totalCollected.toFixed(1)} P`, 'success');
        } catch (e) {}
    });
}

if (CREATE_GIFT_CODE_FORM) {
    CREATE_GIFT_CODE_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('gift-code-name').value.trim().toUpperCase();
        const points = parseFloat(document.getElementById('gift-code-amount').value);
        const maxUses = parseInt(document.getElementById('gift-code-max-uses').value);
        try {
            const data = await fetchAllData();
            data.gift_codes = data.gift_codes || [];
            data.gift_codes.push({ code, points, maxUses, currentUses: 0, createdAt: new Date().toISOString() });
            await updateAllData(data);
            showMessage(CREATE_GIFT_CODE_MESSAGE, 'コード発行完了', 'success');
        } catch (e) {}
    });
}

function initializeLotteryForm() {
    if (!CREATE_LOTTERY_FORM) return;
    const now = new Date();
    const format = (d) => d.toISOString().slice(0, 16);
    document.getElementById('lottery-purchase-deadline').value = format(new Date(now.getTime() + 3*24*60*60*1000));
    document.getElementById('lottery-result-announce').value = format(new Date(now.getTime() + 4*24*60*60*1000));
}

if (CREATE_LOTTERY_FORM) {
    CREATE_LOTTERY_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('lottery-name').value;
        const price = parseFloat(document.getElementById('lottery-ticket-price').value);
        const prizes = [];
        for (let i = 1; i <= 5; i++) {
            const amt = parseFloat(document.getElementById(`lottery-prize-amount-${i}`).value);
            const prob = parseFloat(document.getElementById(`lottery-prize-prob-${i}`).value);
            if (amt && prob) prizes.push({ rank: i, amount: amt, probability: prob / 100 });
        }
        try {
            const data = await fetchAllData();
            data.lotteries = data.lotteries || [];
            if (data.lotteries.length >= 3) data.lotteries.shift();
            data.lotteries.push({ 
                lotteryId: data.lotteries.length + 1, 
                name, ticketPrice: price, 
                purchaseDeadline: new Date(document.getElementById('lottery-purchase-deadline').value).toISOString(),
                resultAnnounceDate: new Date(document.getElementById('lottery-result-announce').value).toISOString(),
                status: 'OPEN', prizes, tickets: []
            });
            await updateAllData(data);
            showMessage(CREATE_LOTTERY_MESSAGE, '宝くじ開催完了', 'success');
        } catch (e) {}
    });
}

window.onload = () => {};
