// assets/js/master.js

const AUTH_FORM = document.getElementById('auth-form');
const ADMIN_TOOLS = document.getElementById('admin-tools');
const AUTH_MESSAGE = document.getElementById('auth-message');
const TARGET_PLAYER_SELECT = document.getElementById('target-player');
const MASTER_LOGOUT_BUTTON = document.getElementById('master-logout-button');

// ★ 送金機能 (既存)
const TRANSFER_FORM = document.getElementById('transfer-form');
const SENDER_PLAYER_SELECT = document.getElementById('sender-player');
const RECEIVER_PLAYER_SELECT = document.getElementById('receiver-player');

// ★ スポーツくじ管理機能
const BET_LIST_CONTAINER = document.getElementById('bet-list-container');
const CREATE_BET_FORM = document.getElementById('create-bet-form');

// ★★★ 麻雀結果入力機能 (新規追加) ★★★
const MAHJONG_FORM = document.getElementById('mahjong-form');
const MAHJONG_PLAYER_INPUTS_CONTAINER = document.getElementById('mahjong-player-inputs');
const MAHJONG_MESSAGE_ELEMENT = document.getElementById('mahjong-message');
const MAHJONG_SUBMIT_BUTTON = document.getElementById('mahjong-submit-button');

// ★ 新規追加: 日次ポイント徴収
const DAILY_TAX_BUTTON = document.getElementById('daily-tax-button');
const DAILY_TAX_MESSAGE = document.getElementById('daily-tax-message');

// ★★★ 新規追加: 宝くじ機能 ★★★
const CREATE_LOTTERY_FORM = document.getElementById('create-lottery-form');
const CREATE_LOTTERY_MESSAGE = document.getElementById('create-lottery-message');

// ★★★ 新規追加要素: プレゼントコード発行 ★★★
const CREATE_GIFT_CODE_FORM = document.getElementById('create-gift-code-form');
const CREATE_GIFT_CODE_MESSAGE = document.getElementById('create-gift-code-message');
// ★★★ 新規追加ここまで ★★★


// --- 定数：麻雀ルール (mahjong.jsから移動) ---
const POINT_RATE = 1000; // 1000点 = 1ポイント
const UMA_OKA = [30, 10, -10, -20]; // 4位, 3位, 2位, 1位 のボーナス/ペナルティ点 (例: 10-20ウマ)
const STARTING_SCORE = 30000; // 基準点
let ALL_PLAYER_NAMES = []; // 全プレイヤー名を保持

// ★ 修正: 認証状態をキャッシュではなく、メモリ上の変数で管理
let isAuthenticatedAsMaster = false;


// -----------------------------------------------------------------
// ★★★ 認証とログイン状態の管理 ★★★
// -----------------------------------------------------------------

/**
 * マスター認証を試みる処理
 * @param {string} username - 入力されたユーザー名
 * @param {string} password - 入力されたパスワード
 * @param {boolean} isAuto - 自動ログインかどうか
 * @returns {Promise<boolean>} 認証成功ならtrue
 */
async function attemptMasterLogin(username, password, isAuto = false) { 
    if (!isAuto) {
        showMessage(AUTH_MESSAGE, '認証中...', 'info');
    }
    
    // 1. マスターユーザー名と比較
    if (username !== MASTER_USERNAME) {
        showMessage(AUTH_MESSAGE, '❌ ユーザー名がマスターユーザー名と異なります。', 'error');
        return false;
    }

    // 2. JSONBinからユーザーデータを取得し、パスワードを照合
    try {
        const allData = await fetchAllData();
        const scores = allData.scores;
        
        const masterUser = scores.find(p => p.name === MASTER_USERNAME);

        if (!masterUser) {
            console.error("[ERROR:master.js] 認証失敗: 取得データ内にマスターユーザーが見つかりません。");
            showMessage(AUTH_MESSAGE, '❌ ユーザーデータにマスターアカウントが見つかりませんでした。', 'error');
            return false;
        }

        if (masterUser.pass === password) {
            isAuthenticatedAsMaster = true;

            // UIの切り替え
            document.getElementById('auth-section').classList.add('hidden');
            ADMIN_TOOLS.classList.remove('hidden');
            MASTER_LOGOUT_BUTTON.classList.remove('hidden'); 

            // ツール類の初期化
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


/**
 * ログアウト処理
 */
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

/**
 * ページロード時の自動ログイン処理
 */
async function autoLogin() { 
    // master画面ではキャッシュによる自動ログインを廃止
}


AUTH_FORM.addEventListener('submit', async (e) => { 
    e.preventDefault();
    const username = document.getElementById('username').value.trim(); 
    const password = document.getElementById('password').value;
    await attemptMasterLogin(username, password, false); 
});

MASTER_LOGOUT_BUTTON.addEventListener('click', handleMasterLogout);

window.onload = autoLogin;

// --- プレイヤーリストのロード関数群 ---

async function fetchAndSetPlayerNames() {
    const scores = await fetchScores(); 
    if (scores.length === 0) {
        return false;
    }
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


// --- 麻雀結果フォーム生成/処理 ---
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
            const nameElement = document.getElementById(`mahjong-player-${i}-name`);
            const scoreElement = document.getElementById(`mahjong-player-${i}-score`);
    
            const name = nameElement.value;
            const score = parseInt(scoreElement.value, 10);
            
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
        
        if (totalScore < 119900 || totalScore > 120100) { 
            showMessage(MAHJONG_MESSAGE_ELEMENT, `警告: 合計点が ${totalScore} です。120000点周辺ではありません。計算を再確認してください。`, 'error');
        }
    
        MAHJONG_SUBMIT_BUTTON.disabled = true;
        MAHJONG_SUBMIT_BUTTON.textContent = '送信中...';
        showMessage(MAHJONG_MESSAGE_ELEMENT, '結果を計算し、JSONBinに送信中...', 'info');
    
        try {
            const currentData = await fetchAllData();
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p])); 
            
            results.sort((a, b) => b.score - a.score);
            
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const rankIndex = i;
    
                const pointDifference = (result.score - STARTING_SCORE) / POINT_RATE;
                const bonusPoint = UMA_OKA[rankIndex];
                const finalPointChange = pointDifference + bonusPoint;
                
                const currentPlayer = currentScoresMap.get(result.name);
                if (currentPlayer) {
                    const currentScore = currentPlayer.score || 0;
                    const newScore = currentScore + finalPointChange;
                    currentScoresMap.set(result.name, { 
                        ...currentPlayer, 
                        score: parseFloat(newScore.toFixed(1)) 
                    });
                }
            }
    
            const newScores = Array.from(currentScoresMap.values());
            
            const newData = {
                scores: newScores,
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
            console.error("麻雀結果処理中にエラー:", error);
            showMessage(MAHJONG_MESSAGE_ELEMENT, `❌ サーバーエラー: ${error.message}`, 'error');
        } finally {
            MAHJONG_SUBMIT_BUTTON.disabled = false;
            MAHJONG_SUBMIT_BUTTON.textContent = '結果を反映する';
        }
    });
}


// --- スポーツくじ管理機能 ---

async function initializeSportsMasterTools() {
    if (!CREATE_BET_FORM) return;
    
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const deadlineInput = document.getElementById('deadline-datetime');
    if (deadlineInput) {
        deadlineInput.value = formatDateTimeLocal(now);
    }

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
    const allBets = data.sports_bets || []; 
    renderBetList(allBets);
}


// --- ポイント送金機能 ---
if (TRANSFER_FORM) {
    TRANSFER_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageEl = document.getElementById('transfer-message');
        const sender = SENDER_PLAYER_SELECT.value;
        const receiver = RECEIVER_PLAYER_SELECT.value;
        const amount = parseFloat(document.getElementById('transfer-amount').value);
    
        if (!sender || !receiver || isNaN(amount) || amount <= 0) {
            showMessage(messageEl, 'エラー: 送金元、送金先、および有効なポイントを入力してください。', 'error');
            return;
        }
        if (sender === receiver) {
            showMessage(messageEl, 'エラー: 送金元と送金先は異なるプレイヤーである必要があります。', 'error');
            return;
        }
    
        showMessage(messageEl, 'ポイント送金を処理中...', 'info');
    
        try {
            const currentData = await fetchAllData();
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            
            const senderPlayer = currentScoresMap.get(sender);
            const receiverPlayer = currentScoresMap.get(receiver);
            
            if (!senderPlayer) {
                showMessage(messageEl, `エラー: 送金元 ${sender} のデータが見つかりません。`, 'error');
                return;
            }
    
            const senderScore = senderPlayer.score || 0;
            if (senderScore < amount) {
                showMessage(messageEl, `エラー: ${sender} の残高 (${senderScore.toFixed(1)} P) が不足しています。`, 'error');
                return;
            }
    
            currentScoresMap.set(sender, { 
                ...senderPlayer, 
                score: parseFloat((senderScore - amount).toFixed(1)) 
            });
            
            if (receiverPlayer) {
                const receiverScore = receiverPlayer.score || 0;
                currentScoresMap.set(receiver, { 
                    ...receiverPlayer, 
                    score: parseFloat((receiverScore + amount).toFixed(1)) 
                });
            } else {
                 showMessage(messageEl, `エラー: 送金先 ${receiver} のデータが見つかりません。`, 'error');
                 return;
            }
    
            const newScores = Array.from(currentScoresMap.values());
            
            const newData = {
                scores: newScores,
                sports_bets: currentData.sports_bets, 
                lotteries: currentData.lotteries || [],
                gift_codes: currentData.gift_codes || [],
                electric_chair_games: currentData.electric_chair_games || []
            };
    
            const response = await updateAllData(newData);
    
            if (response.status === 'success') {
                showMessage(messageEl, `✅ ${sender} から ${receiver} へ ${amount.toFixed(1)} P の送金を完了しました。`, 'success');
                TRANSFER_FORM.reset();
                loadPlayerList();
                loadTransferPlayerLists(); 
                loadMahjongForm(); 
            } else {
                showMessage(messageEl, `❌ 送金エラー: ${response.message}`, 'error');
            }
    
        } catch (error) {
            console.error(error);
            showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
        }
    });
}


// --- スポーツくじ管理機能 ---

if (CREATE_BET_FORM) {
    CREATE_BET_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageEl = document.getElementById('create-message');
        const matchName = document.getElementById('match-name').value.trim();
        const deadline = document.getElementById('deadline-datetime').value; 
    
        if (!matchName || !deadline) {
            showMessage(messageEl, '❌ くじ名、締切日時をすべて入力してください。', 'error');
            return;
        }
        
        const deadlineDate = new Date(deadline);
        if (isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
            showMessage(messageEl, '❌ 締切日時は現在時刻よりも後の有効な日時を選択してください。', 'error');
            return;
        }
    
        try {
            const currentData = await fetchAllData();
            let allBets = currentData.sports_bets || [];
            
            if (allBets.length >= 3) {
                allBets.sort((a, b) => a.betId - b.betId);
                const removedBet = allBets.shift();
                console.log(`[メンテナンス] スポーツくじ ID:${removedBet.betId}「${removedBet.matchName}」を削除しました。`);
            }

            const newBetId = allBets.length > 0 ? Math.max(...allBets.map(b => b.betId)) + 1 : 1;
            
            const newBet = {
                betId: newBetId,
                matchName: matchName,
                creator: 'Master', 
                deadline: deadlineDate.toISOString(), 
                status: 'OPEN',
                wagers: []
            };
    
            allBets.push(newBet);
            currentData.sports_bets = allBets;
            
            const newData = {
                scores: currentData.scores,
                sports_bets: currentData.sports_bets,
                lotteries: currentData.lotteries || [],
                gift_codes: currentData.gift_codes || [],
                electric_chair_games: currentData.electric_chair_games || []
            };
    
            const response = await updateAllData(newData);
    
            if (response.status === 'success') {
                showMessage(messageEl, `✅ くじ「${matchName}」を作成しました (ID: ${newBetId})`, 'success');
                CREATE_BET_FORM.reset();
                
                const now = new Date();
                now.setHours(now.getHours() + 1);
                document.getElementById('deadline-datetime').value = formatDateTimeLocal(now);
                loadBettingData();
            } else {
                showMessage(messageEl, `❌ 作成エラー: ${response.message}`, 'error');
            }
    
        } catch (error) {
            console.error(error);
            showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
        }
    });
}

async function handleCloseBet(e) {
    const betId = parseInt(e.target.dataset.betId);
    
    if (!window.confirm(`くじ ID:${betId} の投票を締め切りますか？`)) {
        return;
    }

    try {
        const currentData = await fetchAllData();
        const allBets = currentData.sports_bets || [];
        const bet = allBets.find(b => b.betId === betId);

        if (bet && bet.status === 'OPEN') {
            bet.status = 'CLOSED';
            currentData.sports_bets = allBets;
            
            const newData = {
                scores: currentData.scores,
                sports_bets: currentData.sports_bets,
                lotteries: currentData.lotteries || [],
                gift_codes: currentData.gift_codes || [],
                electric_chair_games: currentData.electric_chair_games || []
            };
            
            const response = await updateAllData(newData);
            if (response.status === 'success') {
                showMessage(document.getElementById('create-message'), `✅ くじ ID:${betId} の投票を締め切りました。`, 'success');
                loadBettingData();
            } else {
                showMessage(document.getElementById('create-message'), `❌ 締切処理エラー: ${response.message}`, 'error');
            }
        }
    } catch (error) {
        console.error(error);
        showMessage(document.getElementById('create-message'), `❌ サーバーエラー: ${error.message}`, 'error');
    }
}


function renderBetList(allBets) {
    if (!BET_LIST_CONTAINER) return;

    if (allBets.length === 0) {
        BET_LIST_CONTAINER.innerHTML = '<p>まだくじが作成されていません。</p>';
        return;
    }

    let html = '';
    const now = new Date();
    
    const sortedBets = allBets.sort((a, b) => {
        const order = { 'OPEN': 1, 'CLOSED': 2, 'SETTLED': 3 };
        return order[a.status] - order[b.status];
    });

    sortedBets.forEach(bet => {
        let currentStatus = bet.status;
        if (currentStatus === 'OPEN' && new Date(bet.deadline) <= now) {
            currentStatus = 'CLOSED_AUTO';
        }

        const totalWagers = bet.wagers.reduce((sum, w) => sum + w.amount, 0);
        let statusText = '';
        let statusClass = '';
        let managementTools = '';

        const formattedDeadline = new Date(bet.deadline).toLocaleString('ja-JP', { 
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
        });

        if (currentStatus === 'OPEN') {
            statusText = '開催中 (投票受付中)';
            statusClass = 'status-open';
            managementTools = `
                <p>締切: ${formattedDeadline}</p>
                <button class="action-button close-bet secondary-button" data-bet-id="${bet.betId}" style="width: auto;">投票締切</button>
            `;
        } else if (currentStatus === 'CLOSED' || currentStatus === 'CLOSED_AUTO') {
            statusText = currentStatus === 'CLOSED_AUTO' ? '自動締切 (結果待ち)' : '締切済 (結果待ち)';
            statusClass = 'status-closed';
            
            const unsettledWagers = bet.wagers.filter(w => w.isWin === null);
            
            if (unsettledWagers.length > 0) {
                managementTools = `
                    <form class="settle-wagers-form" data-bet-id="${bet.betId}">
                        <div class="result-tools-score">
                            <p style="margin-top: 10px;">🎯 **未確定の投票結果入力** (${unsettledWagers.length}件)</p>
                            <div id="wager-result-inputs-${bet.betId}" style="max-height: 400px; overflow-y: auto; padding: 10px; border: 1px solid #ccc; margin-bottom: 15px;">
                            </div>
                            <button type="submit" class="action-button result-button">確定した結果を反映</button>
                        </div>
                    </form>
                `;
            } else {
                managementTools = '<p class="settled-info" style="color: #28a745; font-weight: bold;">全ての投票結果が確定済みです。</p>';
                managementTools += `<button class="action-button finalize-bet secondary-button" data-bet-id="${bet.betId}" style="width: auto;">くじを完了済みにする</button>`;
            }
            
        } else if (bet.status === 'SETTLED') {
            statusText = `完了`;
            statusClass = 'status-settled';
            managementTools = `<p class="settled-info">このくじは完了済みです。</p>`;
        }
        
        let wagersHtml = bet.wagers.length > 0 ? 
            bet.wagers.map(w => {
                let winStatus = (w.isWin === true) ? ` (✅ x${w.appliedOdds.toFixed(1)})` : (w.isWin === false ? ' (❌)' : ' (?)');
                const playerInitials = w.player.substring(0, 3);
                return `<li class="wager-item" title="${w.item}">${playerInitials}: ${w.amount} P - ${w.item} ${winStatus}</li>`;
            }).join('') : '<li>まだ投票はありません。</li>';

        html += `
            <div class="bet-card ${statusClass}">
                <h3>${bet.matchName} (#${bet.betId})</h3>
                <p class="bet-creator">開設者: <strong>${bet.creator || 'N/A'}</strong></p>
                <div class="odds-info"><strong>締切:</strong> ${formattedDeadline}</div>
                <p class="status-label">ステータス: <span class="${statusClass}">${statusText}</span></p>
                <div class="wager-info"><strong>合計投票:</strong> ${totalWagers} P (${bet.wagers.length}件)</div>
                <ul class="wagers-list" style="font-size: 0.9em;">${wagersHtml}</ul>
                <div class="management-tools">${managementTools}</div>
            </div>
        `;
    });

    BET_LIST_CONTAINER.innerHTML = html;

    document.querySelectorAll('.close-bet').forEach(btn => btn.addEventListener('click', handleCloseBet));
    document.querySelectorAll('.finalize-bet').forEach(btn => btn.addEventListener('click', handleFinalizeBet));
    
    document.querySelectorAll('.settle-wagers-form').forEach(form => {
        const betId = parseInt(form.dataset.betId);
        const bet = sortedBets.find(b => b.betId === betId);
        if (bet) {
            generateWagerResultInputs(bet);
            form.addEventListener('submit', handleSettleWagers);
        }
    });
}


function generateWagerResultInputs(bet) {
    const container = document.getElementById(`wager-result-inputs-${bet.betId}`);
    if (!container) return;

    const unsettledWagers = bet.wagers.filter(w => w.isWin === null); 
    let html = '';

    unsettledWagers.forEach((wager, index) => {
        const uniqueId = `${bet.betId}-${index}`;
        html += `
            <div class="wager-result-row" style="padding: 5px 0; border-bottom: 1px dotted #ddd;">
                <p style="margin: 5px 0;"><strong>${wager.player}:</strong> ${wager.amount} P / ${wager.item}</p>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <label><input type="radio" name="result-${uniqueId}" value="win" class="wager-result-radio" data-wager-index="${index}"> 当選</label>
                    <label><input type="radio" name="result-${uniqueId}" value="lose" class="wager-result-radio" data-wager-index="${index}"> 外れ</label>
                    <input type="number" step="0.1" min="1.0" class="applied-odds-input" data-wager-index="${index}" placeholder="オッズ" style="width: 100px; display: none;">
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    container.querySelectorAll('.wager-result-radio').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const index = e.target.closest('.wager-result-row').querySelector('.applied-odds-input').dataset.wagerIndex;
            const oddsInput = container.querySelector(`.applied-odds-input[data-wager-index="${index}"]`);
            if (e.target.value === 'win') {
                oddsInput.style.display = 'inline';
                oddsInput.required = true;
                oddsInput.value = oddsInput.value || 1.0;
            } else {
                oddsInput.style.display = 'none';
                oddsInput.required = false;
                oddsInput.value = '';
            }
        });
    });
}

async function handleSettleWagers(e) {
    e.preventDefault();
    const form = e.target;
    const betId = parseInt(form.dataset.betId);
    const messageEl = document.getElementById('create-message');
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    let allValid = true; 

    try {
        const currentData = await fetchAllData();
        const allBets = currentData.sports_bets || [];
        const betIndex = allBets.findIndex(b => b.betId === betId);
        
        if (betIndex === -1 || allBets[betIndex].status === 'SETTLED') {
            showMessage(messageEl, '❌ くじが見つからないか、既に完了済みです。', 'error');
            submitButton.disabled = false;
            return;
        }

        const bet = allBets[betIndex];
        const originalWagers = bet.wagers; 
        let updatedWagersCount = 0;
        let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
        
        const wagerResultInputs = form.querySelectorAll('.wager-result-row');
        const unsettledWagersIndices = originalWagers
            .map((w, index) => w.isWin === null ? index : -1)
            .filter(index => index !== -1);

        wagerResultInputs.forEach((row, formIndex) => {
            const radioWin = row.querySelector('input[value="win"]');
            const oddsInput = row.querySelector('.applied-odds-input');
            const originalWagerIndex = unsettledWagersIndices[formIndex];
            
            if (originalWagerIndex === undefined) return;

            let isWin = null;
            let appliedOdds = null;
            let pointChange = 0;

            if (radioWin && radioWin.checked) {
                isWin = true;
                appliedOdds = parseFloat(oddsInput.value);
                if (isNaN(appliedOdds) || appliedOdds < 1.0) {
                    allValid = false;
                    return; 
                }
                pointChange = originalWagers[originalWagerIndex].amount * appliedOdds;
            } else if (row.querySelector('input[value="lose"]').checked) {
                isWin = false;
                appliedOdds = 0;
                pointChange = 0;
            } else {
                return;
            }

            originalWagers[originalWagerIndex].isWin = isWin;
            originalWagers[originalWagerIndex].appliedOdds = appliedOdds;

            const player = originalWagers[originalWagerIndex].player;
            const currentPlayer = currentScoresMap.get(player);
            if (currentPlayer) {
                const currentScore = currentPlayer.score || 0;
                currentScoresMap.set(player, { 
                    ...currentPlayer, 
                    score: parseFloat((currentScore + pointChange).toFixed(1)) 
                });
            }
            updatedWagersCount++;
        });

        if (!allValid) {
             showMessage(messageEl, `❌ 当選結果のオッズが不正です。`, 'error');
             submitButton.disabled = false;
             return;
        }

        if (updatedWagersCount === 0) {
            showMessage(messageEl, '⚠️ 反映する結果が選択されていません。', 'info');
            submitButton.disabled = false;
            return;
        }

        bet.wagers = originalWagers;
        allBets[betIndex] = bet;
        currentData.sports_bets = allBets;
        currentData.scores = Array.from(currentScoresMap.values());
        
        const newData = {
            scores: currentData.scores,
            sports_bets: currentData.sports_bets,
            lotteries: currentData.lotteries || [],
            gift_codes: currentData.gift_codes || [],
            electric_chair_games: currentData.electric_chair_games || []
        };
        
        const response = await updateAllData(newData);

        if (response.status === 'success') {
            showMessage(messageEl, `✅ ${updatedWagersCount}件の結果を確定しポイントを反映しました。`, 'success');
            loadBettingData();
            loadPlayerList();
            loadTransferPlayerLists();
            loadMahjongForm();
        } else {
            showMessage(messageEl, `❌ ポイント反映エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    } finally {
        submitButton.disabled = false;
    }
}

async function handleFinalizeBet(e) {
    const betId = parseInt(e.target.dataset.betId);
    const messageEl = document.getElementById('create-message');

    if (!window.confirm(`くじ ID:${betId} を「完了済み」にマークしますか？`)) {
        return;
    }

    try {
        const currentData = await fetchAllData();
        const allBets = currentData.sports_bets || [];
        const betIndex = allBets.findIndex(b => b.betId === betId);
        
        if (betIndex === -1 || allBets[betIndex].status === 'SETTLED') return;

        const bet = allBets[betIndex];
        const unsettledCount = bet.wagers.filter(w => w.isWin === null).length;
        if (unsettledCount > 0) {
            showMessage(messageEl, `❌ まだ ${unsettledCount}件の投票結果が未確定です。`, 'error');
            return;
        }

        bet.status = 'SETTLED';
        currentData.sports_bets = allBets;
        
        const newData = {
            scores: currentData.scores,
            sports_bets: currentData.sports_bets,
            lotteries: currentData.lotteries || [],
            gift_codes: currentData.gift_codes || [],
            electric_chair_games: currentData.electric_chair_games || []
        };
        
        const response = await updateAllData(newData);
        if (response.status === 'success') {
            showMessage(messageEl, `✅ くじ ID:${betId} を「完了済み」にしました。`, 'success');
            loadBettingData();
        }
    } catch (error) {
        console.error(error);
    }
}


// --- 特殊ポイント調整機能 ---
if (document.getElementById('adjustment-form')) {
    document.getElementById('adjustment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageEl = document.getElementById('adjustment-message');
        const targetPlayerName = document.getElementById('target-player').value;
        const adjustAmount = parseFloat(document.getElementById('adjust-amount').value);
    
        if (!targetPlayerName || isNaN(adjustAmount) || adjustAmount === 0) return;
    
        try {
            const currentData = await fetchAllData();
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            const player = currentScoresMap.get(targetPlayerName);
            if (!player) return;
            
            const newScore = player.score + adjustAmount;
            currentScoresMap.set(targetPlayerName, { 
                ...player, 
                score: parseFloat(newScore.toFixed(1)) 
            });
            
            const newData = {
                scores: Array.from(currentScoresMap.values()),
                sports_bets: currentData.sports_bets,
                lotteries: currentData.lotteries || [],
                gift_codes: currentData.gift_codes || [],
                electric_chair_games: currentData.electric_chair_games || []
            };
    
            const response = await updateAllData(newData);
            if (response.status === 'success') {
                showMessage(messageEl, `✅ ${targetPlayerName} のポイントを ${adjustAmount.toFixed(1)} P 調整しました。`, 'success');
                document.getElementById('adjustment-form').reset();
                loadPlayerList();
            }
        } catch (error) {
            console.error(error);
        }
    });
}

// --- 日次ポイント徴収機能 ---
if (DAILY_TAX_BUTTON) {
    DAILY_TAX_BUTTON.addEventListener('click', async () => {
        const TAX_RATE = 0.05; 
        const EXCLUDED_PLAYER_NAMES = ['3mahjong']; 
        const messageEl = DAILY_TAX_MESSAGE;
    
        if (!window.confirm(`全プレイヤーの保有ポイント合計の ${TAX_RATE * 100}% を比例配分で徴収を実行します。よろしいですか？`)) {
            return;
        }
    
        DAILY_TAX_BUTTON.disabled = true;
        showMessage(messageEl, 'ポイント徴収を処理中...', 'info');
        
        try {
            const currentData = await fetchAllData();
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            
            const targetPlayers = currentData.scores.filter(player => !EXCLUDED_PLAYER_NAMES.includes(player.name));
            const totalTargetScore = targetPlayers.reduce((sum, player) => sum + Math.max(0, player.score), 0);
            const CALCULATED_TAX_AMOUNT = parseFloat((totalTargetScore * TAX_RATE).toFixed(1)); 

            if (totalTargetScore <= 0 || CALCULATED_TAX_AMOUNT <= 0) {
                showMessage(messageEl, '⚠️ 徴収対象ポイントがありません。', 'info');
                return;
            }
    
            targetPlayers.forEach(player => {
                if (player.score <= 0) return;
                const taxAmount = parseFloat((CALCULATED_TAX_AMOUNT * (player.score / totalTargetScore)).toFixed(1));
                currentScoresMap.set(player.name, { 
                    ...player, 
                    score: parseFloat((player.score - taxAmount).toFixed(1)) 
                });
            });
            
            const newData = {
                scores: Array.from(currentScoresMap.values()),
                sports_bets: currentData.sports_bets,
                lotteries: currentData.lotteries || [],
                gift_codes: currentData.gift_codes || [],
                electric_chair_games: currentData.electric_chair_games || []
            };
    
            const response = await updateAllData(newData);
            if (response.status === 'success') {
                showMessage(messageEl, `✅ 日次ポイント徴収を完了しました。`, 'success');
                loadPlayerList(); 
                loadTransferPlayerLists();
                loadMahjongForm();
            }
        } catch (error) {
            console.error(error);
        } finally {
            DAILY_TAX_BUTTON.disabled = false;
        }
    });
}


// --- プレゼントコード発行機能 ---
if (CREATE_GIFT_CODE_FORM) {
    CREATE_GIFT_CODE_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageEl = CREATE_GIFT_CODE_MESSAGE;
        const submitButton = CREATE_GIFT_CODE_FORM.querySelector('button[type="submit"]');

        const codeName = document.getElementById('gift-code-name').value.trim().toUpperCase();
        const points = parseFloat(document.getElementById('gift-code-amount').value);
        const maxUses = parseInt(document.getElementById('gift-code-max-uses').value, 10);

        if (!codeName || isNaN(points) || isNaN(maxUses)) return;

        submitButton.disabled = true;
        try {
            const currentData = await fetchAllData();
            let allGiftCodes = currentData.gift_codes || [];
            if (allGiftCodes.find(c => c.code === codeName)) {
                showMessage(messageEl, `❌ 既に存在します。`, 'error');
                return;
            }

            allGiftCodes.push({
                code: codeName,
                points: parseFloat(points.toFixed(1)),
                maxUses: maxUses,
                currentUses: 0,
                createdAt: new Date().toISOString()
            });
            
            const response = await updateAllData({
                ...currentData,
                gift_codes: allGiftCodes
            });

            if (response.status === 'success') {
                showMessage(messageEl, `✅ コード「${codeName}」を発行しました。`, 'success');
                CREATE_GIFT_CODE_FORM.reset();
            }
        } catch (error) {
            console.error(error);
        } finally {
            submitButton.disabled = false;
        }
    });
}


// --- 宝くじ開催機能 ---
function initializeLotteryForm() {
    if (!CREATE_LOTTERY_FORM) return;
    const now = new Date();
    const purchaseDeadline = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const resultAnnounceDate = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

    const formatLocal = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    document.getElementById('lottery-purchase-deadline').value = formatLocal(purchaseDeadline);
    document.getElementById('lottery-result-announce').value = formatLocal(resultAnnounceDate);
}

if (CREATE_LOTTERY_FORM) {
    CREATE_LOTTERY_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageEl = CREATE_LOTTERY_MESSAGE;
        const submitButton = CREATE_LOTTERY_FORM.querySelector('button[type="submit"]');

        const lotteryName = document.getElementById('lottery-name').value.trim();
        const ticketPrice = parseFloat(document.getElementById('lottery-ticket-price').value);
        const purchaseDeadline = document.getElementById('lottery-purchase-deadline').value;
        const resultAnnounceDate = document.getElementById('lottery-result-announce').value;

        if (!lotteryName || isNaN(ticketPrice)) return;
        
        const prizes = [];
        let totalProbability = 0;
        for (let i = 1; i <= 5; i++) {
            const amount = parseFloat(document.getElementById(`lottery-prize-amount-${i}`).value);
            const probPercent = parseFloat(document.getElementById(`lottery-prize-prob-${i}`).value);
            if (!isNaN(amount) && !isNaN(probPercent)) {
                prizes.push({ rank: i, amount: amount, probability: probPercent / 100.0 });
                totalProbability += probPercent / 100.0;
            }
        }

        if (totalProbability > 1.0) {
            showMessage(messageEl, `❌ 確率合計が100%を超えています。`, 'error');
            return;
        }

        submitButton.disabled = true;
        try {
            const currentData = await fetchAllData();
            let allLotteries = currentData.lotteries || [];
            
            if (allLotteries.length >= 3) {
                allLotteries.sort((a, b) => a.lotteryId - b.lotteryId);
                allLotteries.shift();
            }
            
            const newLotteryId = allLotteries.length > 0 ? Math.max(...allLotteries.map(l => l.lotteryId)) + 1 : 1;

            allLotteries.push({
                lotteryId: newLotteryId,
                name: lotteryName,
                ticketPrice: ticketPrice,
                purchaseDeadline: new Date(purchaseDeadline).toISOString(),
                resultAnnounceDate: new Date(resultAnnounceDate).toISOString(),
                status: 'OPEN',
                prizes: prizes,
                tickets: []
            });

            const response = await updateAllData({ ...currentData, lotteries: allLotteries });
            if (response.status === 'success') {
                showMessage(messageEl, `✅ 宝くじ「${lotteryName}」を作成しました。`, 'success');
                CREATE_LOTTERY_FORM.reset();
                initializeLotteryForm();
            }
        } catch (error) {
            console.error(error);
        } finally {
            submitButton.disabled = false;
        }
    });
}
