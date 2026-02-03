// assets/js/master.js

const AUTH_FORM = document.getElementById('auth-form');
const ADMIN_TOOLS = document.getElementById('admin-tools');
const AUTH_MESSAGE = document.getElementById('auth-message');
const TARGET_PLAYER_SELECT = document.getElementById('target-player');
const MASTER_LOGOUT_BUTTON = document.getElementById('master-logout-button');

const TRANSFER_FORM = document.getElementById('transfer-form');
const SENDER_PLAYER_SELECT = document.getElementById('sender-player');
const RECEIVER_PLAYER_SELECT = document.getElementById('receiver-player');

const BET_LIST_CONTAINER = document.getElementById('bet-list-container');
const CREATE_BET_FORM = document.getElementById('create-bet-form');

const MAHJONG_FORM = document.getElementById('mahjong-form');
const MAHJONG_PLAYER_INPUTS_CONTAINER = document.getElementById('mahjong-player-inputs');
const MAHJONG_MESSAGE_ELEMENT = document.getElementById('mahjong-message');
const MAHJONG_SUBMIT_BUTTON = document.getElementById('mahjong-submit-button');

const DAILY_TAX_BUTTON = document.getElementById('daily-tax-button');
const DAILY_TAX_MESSAGE = document.getElementById('daily-tax-message');

const CREATE_LOTTERY_FORM = document.getElementById('create-lottery-form');
const CREATE_LOTTERY_MESSAGE = document.getElementById('create-lottery-message');

const CREATE_GIFT_CODE_FORM = document.getElementById('create-gift-code-form');
const CREATE_GIFT_CODE_MESSAGE = document.getElementById('create-gift-code-message');

const POINT_RATE = 1000; 
const UMA_OKA = [30, 10, -10, -20]; 
const STARTING_SCORE = 30000; 
let ALL_PLAYER_NAMES = []; 

let isAuthenticatedAsMaster = false;

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
            } else {
                 AUTH_MESSAGE.classList.add('hidden'); 
            }
            return true;
        } else {
            showMessage(AUTH_MESSAGE, '❌ パスワードが間違っています。', 'error');
            return false;
        }
    } catch (error) {
        console.error("マスター認証中にエラー:", error);
        showMessage(AUTH_MESSAGE, `❌ サーバーエラーまたはデータ取得エラーが発生しました。`, 'error');
        return false;
    }
}

function handleMasterLogout() {
    if (!window.confirm('マスターモードからログアウトしますか？')) {
        return;
    }
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
                <input type="number" id="mahjong-player-${i}-score" placeholder="最終得点 (例: 32500)" required>
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
            if (!name || isNaN(score) || score < 0) {
                showMessage(MAHJONG_MESSAGE_ELEMENT, 'エラー: 名前を選択し、有効な得点を入力してください。', 'error');
                return;
            }
            if (selectedNames.has(name)) {
                showMessage(MAHJONG_MESSAGE_ELEMENT, 'エラー: 参加者が重複しています。', 'error');
                return;
            }
            selectedNames.add(name);
            results.push({ name, score });
            totalScore += score;
        }
        
        MAHJONG_SUBMIT_BUTTON.disabled = true;
        MAHJONG_SUBMIT_BUTTON.textContent = '送信中...';
        showMessage(MAHJONG_MESSAGE_ELEMENT, '結果を計算し、送信中...', 'info');
    
        try {
            const currentData = await fetchAllData();
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p])); 
            results.sort((a, b) => b.score - a.score);
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const pointDifference = (result.score - STARTING_SCORE) / POINT_RATE;
                const finalPointChange = pointDifference + UMA_OKA[i];
                const currentPlayer = currentScoresMap.get(result.name);
                if (currentPlayer) {
                    currentScoresMap.set(result.name, { 
                        ...currentPlayer, 
                        score: parseFloat((currentPlayer.score + finalPointChange).toFixed(1)) 
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
                loadTransferPlayerLists();
                loadMahjongForm();
            } else {
                showMessage(MAHJONG_MESSAGE_ELEMENT, `❌ 処理エラー: ${response.message}`, 'error');
            }
        } catch (error) {
            showMessage(MAHJONG_MESSAGE_ELEMENT, `❌ サーバーエラー: ${error.message}`, 'error');
        } finally {
            MAHJONG_SUBMIT_BUTTON.disabled = false;
            MAHJONG_SUBMIT_BUTTON.textContent = '結果を反映する';
        }
    });
}

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
        if (!sender || !receiver || isNaN(amount) || amount <= 0 || sender === receiver) {
            showMessage(messageEl, 'エラー: 入力内容を確認してください。', 'error');
            return;
        }
        showMessage(messageEl, '処理中...', 'info');
        try {
            const currentData = await fetchAllData();
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            const senderPlayer = currentScoresMap.get(sender);
            const receiverPlayer = currentScoresMap.get(receiver);
            if (!senderPlayer || senderPlayer.score < amount || !receiverPlayer) {
                showMessage(messageEl, `エラー: 残高不足またはプレイヤー不在。`, 'error');
                return;
            }
            currentScoresMap.set(sender, { ...senderPlayer, score: parseFloat((senderPlayer.score - amount).toFixed(1)) });
            currentScoresMap.set(receiver, { ...receiverPlayer, score: parseFloat((receiverPlayer.score + amount).toFixed(1)) });
            const response = await updateAllData({
                scores: Array.from(currentScoresMap.values()),
                sports_bets: currentData.sports_bets, 
                lotteries: currentData.lotteries || [],
                gift_codes: currentData.gift_codes || [],
                electric_chair_games: currentData.electric_chair_games || []
            });
            if (response.status === 'success') {
                showMessage(messageEl, `✅ 送金を完了しました。`, 'success');
                TRANSFER_FORM.reset();
                loadPlayerList();
                loadTransferPlayerLists(); 
            }
        } catch (error) {
            showMessage(messageEl, `❌ エラー: ${error.message}`, 'error');
        }
    });
}

if (CREATE_BET_FORM) {
    CREATE_BET_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const matchName = document.getElementById('match-name').value.trim();
        const deadline = document.getElementById('deadline-datetime').value;
        if (!matchName || !deadline) return;
        try {
            const currentData = await fetchAllData();
            let allBets = currentData.sports_bets || [];
            if (allBets.length >= 3) {
                allBets.sort((a, b) => a.betId - b.betId);
                allBets.shift();
            }
            const newBet = {
                betId: allBets.length > 0 ? Math.max(...allBets.map(b => b.betId)) + 1 : 1,
                matchName: matchName,
                creator: 'Master',
                deadline: new Date(deadline).toISOString(),
                status: 'OPEN',
                wagers: []
            };
            allBets.push(newBet);
            const response = await updateAllData({
                ...currentData,
                sports_bets: allBets
            });
            if (response.status === 'success') {
                showMessage(document.getElementById('create-message'), `✅ くじを作成しました`, 'success');
                CREATE_BET_FORM.reset();
                loadBettingData();
            }
        } catch (error) {
            console.error(error);
        }
    });
}

function renderBetList(allBets) {
    if (!BET_LIST_CONTAINER) return;
    if (allBets.length === 0) {
        BET_LIST_CONTAINER.innerHTML = '<p>まだくじが作成されていません。</p>';
        return;
    }
    let html = '';
    allBets.sort((a, b) => {
        const order = { 'OPEN': 1, 'CLOSED': 2, 'SETTLED': 3 };
        return order[a.status] - order[b.status];
    }).forEach(bet => {
        const statusClass = bet.status.toLowerCase();
        html += `
            <div class="bet-card status-${statusClass}">
                <h3>${bet.matchName} (#${bet.betId})</h3>
                <p>ステータス: ${bet.status}</p>
                <button class="action-button close-bet" data-bet-id="${bet.betId}">投票締切</button>
            </div>
        `;
    });
    BET_LIST_CONTAINER.innerHTML = html;
}

if (DAILY_TAX_BUTTON) {
    DAILY_TAX_BUTTON.addEventListener('click', async () => {
        const TAX_RATE = 0.05;
        if (!window.confirm(`全プレイヤーから ${TAX_RATE * 100}% 徴収します。よろしいですか？`)) return;
        try {
            const currentData = await fetchAllData();
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            currentData.scores.forEach(player => {
                if (player.name === '3mahjong' || player.score <= 0) return;
                const tax = parseFloat((player.score * TAX_RATE).toFixed(1));
                currentScoresMap.set(player.name, { ...player, score: parseFloat((player.score - tax).toFixed(1)) });
            });
            const response = await updateAllData({
                ...currentData,
                scores: Array.from(currentScoresMap.values())
            });
            if (response.status === 'success') {
                showMessage(DAILY_TAX_MESSAGE, `✅ 徴収完了`, 'success');
                loadPlayerList();
            }
        } catch (error) {
            console.error(error);
        }
    });
}

if (CREATE_LOTTERY_FORM) {
    CREATE_LOTTERY_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const lotteryName = document.getElementById('lottery-name').value.trim();
        const ticketPrice = parseFloat(document.getElementById('lottery-ticket-price').value);
        if (!lotteryName || isNaN(ticketPrice)) return;
        try {
            const currentData = await fetchAllData();
            let allLotteries = currentData.lotteries || [];
            if (allLotteries.length >= 3) {
                allLotteries.sort((a, b) => a.lotteryId - b.lotteryId);
                allLotteries.shift();
            }
            const newLottery = {
                lotteryId: allLotteries.length > 0 ? Math.max(...allLotteries.map(l => l.lotteryId)) + 1 : 1,
                name: lotteryName,
                ticketPrice: ticketPrice,
                purchaseDeadline: new Date(document.getElementById('lottery-purchase-deadline').value).toISOString(),
                resultAnnounceDate: new Date(document.getElementById('lottery-result-announce').value).toISOString(),
                status: 'OPEN',
                prizes: [], 
                tickets: []
            };
            for (let i = 1; i <= 5; i++) {
                const amt = parseFloat(document.getElementById(`lottery-prize-amount-${i}`).value);
                const prb = parseFloat(document.getElementById(`lottery-prize-prob-${i}`).value);
                if (amt > 0 && prb > 0) newLottery.prizes.push({ rank: i, amount: amt, probability: prb / 100 });
            }
            allLotteries.push(newLottery);
            const response = await updateAllData({ ...currentData, lotteries: allLotteries });
            if (response.status === 'success') {
                showMessage(CREATE_LOTTERY_MESSAGE, `✅ 宝くじを作成しました`, 'success');
                CREATE_LOTTERY_FORM.reset();
            }
        } catch (error) {
            console.error(error);
        }
    });
}

function initializeLotteryForm() {
    if (!CREATE_LOTTERY_FORM) return;
    const now = new Date();
    const deadline = new Date(now.getTime() + 3 * 86400000);
    const announce = new Date(now.getTime() + 4 * 86400000);
    const fmt = (d) => d.toISOString().slice(0, 16);
    document.getElementById('lottery-purchase-deadline').value = fmt(deadline);
    document.getElementById('lottery-result-announce').value = fmt(announce);
}

window.onload = () => {};
