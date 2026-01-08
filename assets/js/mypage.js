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

// ★ 新規追加要素
const WAGER_INPUTS_CONTAINER = document.getElementById('wager-inputs-container');
const ADD_WAGER_ROW_BUTTON = document.getElementById('add-wager-row-button');

// ★ ログアウトボタン
const LOGOUT_BUTTON = document.getElementById('logout-button');

// ★★★ 会員ボーナス関連の要素
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


// 認証されたユーザー情報 ({name: '...', score: ..., pass: '...', status: ..., lastBonusTime: ...})
let authenticatedUser = null; 
// 宝くじのデータを一時的に保持 (価格計算用)
let availableLotteries = [];

// -----------------------------------------------------------------
// ★★★ 認証とログイン状態の管理 ★★★
// -----------------------------------------------------------------

/**
 * ログイン処理本体
 */
async function attemptLogin(username, password, isAuto = false) {
    if (!isAuto) {
        showMessage(AUTH_MESSAGE, '認証中...', 'info');
    }
    
    const allData = await fetchAllData();
    const scores = allData.scores;

    // ユーザー名とパスワードで照合
    const user = scores.find(p => p.name === username && p.pass === password);

    if (user) {
        authenticatedUser = user; 
        
        if (!authenticatedUser.status) {
            authenticatedUser.status = 'none';
        }
        
        // 1. 認証情報をlocalStorageに保存 (自動ログイン用)
        localStorage.setItem('authUsername', username);
        localStorage.setItem('authPassword', password);

        // 2. UIの切り替え
        document.getElementById('auth-section').classList.add('hidden');
        MYPAGE_CONTENT.classList.remove('hidden');
        
        if (!isAuto) {
             showMessage(AUTH_MESSAGE, `✅ ログイン成功! ようこそ、${username}様。`, 'success');
        } else {
             AUTH_MESSAGE.classList.add('hidden');
        }
        
        // 3. マイページコンテンツの初期化
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


/**
 * ページロード時の自動ログイン処理
 */
async function autoLogin() {
    const username = localStorage.getItem('authUsername');
    const password = localStorage.getItem('authPassword');

    if (username && password) {
        await attemptLogin(username, password, true);
    }
}

/**
 * ログアウト処理
 */
function handleLogout() {
    if (!window.confirm('ログアウトしますか？次回アクセス時に再度ログインが必要です。')) {
        return;
    }
    
    localStorage.removeItem('authUsername');
    localStorage.removeItem('authPassword');

    authenticatedUser = null;
    document.getElementById('auth-section').classList.remove('hidden');
    MYPAGE_CONTENT.classList.add('hidden');
    
    AUTH_FORM.reset();
    
    showMessage(AUTH_MESSAGE, '👋 ログアウトしました。', 'info');
}

// --- イベントリスナー ---

AUTH_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    
    await attemptLogin(username, password, false);
});

LOGOUT_BUTTON.addEventListener('click', handleLogout);

// -----------------------------------------------------------------
// ★★★ 初期化とボーナス/送金処理 ★★★
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


// --- 目標継続フォームの表示制御 ---
function controlTargetContinueFormDisplay() {
    if (!TARGET_CONTINUE_TOOL) return;

    const TARGET_DATE = new Date('2025-12-10T00:00:00+09:00'); 
    const now = new Date();

    if (now >= TARGET_DATE) {
        TARGET_CONTINUE_TOOL.classList.remove('hidden');
    } else {
        TARGET_CONTINUE_TOOL.classList.add('hidden');
    }
}


// -----------------------------------------------------------------
// ★★★ 会員ボーナス機能 ★★★
// -----------------------------------------------------------------

function initializeMemberBonusFeature() {
    const isMember = authenticatedUser && 
                     (authenticatedUser.status === 'pro' || 
                      authenticatedUser.status === 'premium' ||
                      authenticatedUser.status === 'luxury');
    
    if (isMember) {
        if (PRO_BONUS_TOOL) {
            PRO_BONUS_TOOL.classList.remove('hidden');
        }
        updateMemberBonusDisplay(); 
    } else {
         if (PRO_BONUS_TOOL) {
            PRO_BONUS_TOOL.classList.add('hidden');
        }
    }
}

function updateMemberBonusDisplay() {
    if (!authenticatedUser) return;

    const MEMBER_STATUS = authenticatedUser.status || 'none';
    
    let BONUS_AMOUNT;
    let MEMBER_TYPE;
    let REFRESH_INTERVAL; 
    let REFRESH_TEXT;     

    if (MEMBER_STATUS === 'luxury') {
        BONUS_AMOUNT = 10.0;
        MEMBER_TYPE = 'Luxury';
        REFRESH_INTERVAL = 3600000; 
        REFRESH_TEXT = '1時間ごと';
    } else if (MEMBER_STATUS === 'premium') {
        BONUS_AMOUNT = 15.0; 
        MEMBER_TYPE = 'Premium';
        REFRESH_INTERVAL = 86400000; 
        REFRESH_TEXT = '24時間ごと';
    } else if (MEMBER_STATUS === 'pro') {
        BONUS_AMOUNT = 10.0;
        MEMBER_TYPE = 'Pro';
        REFRESH_INTERVAL = 86400000; 
        REFRESH_TEXT = '24時間ごと';
    } else {
        if (PRO_BONUS_TOOL) PRO_BONUS_TOOL.classList.add('hidden');
        return;
    }

    const now = Date.now();
    const lastBonusTime = authenticatedUser.lastBonusTime ? new Date(authenticatedUser.lastBonusTime).getTime() : 0;
    
    const isReady = (now - lastBonusTime) >= REFRESH_INTERVAL;
    
    if (PRO_BONUS_BUTTON) {
        if (isReady) {
            PRO_BONUS_BUTTON.disabled = false;
            PRO_BONUS_BUTTON.textContent = `ボーナス (+${BONUS_AMOUNT.toFixed(1)} P) を受け取る`; 
        } else {
            PRO_BONUS_BUTTON.disabled = true;
            const timeRemaining = lastBonusTime + REFRESH_INTERVAL - now;
            
            let displayTime;
            if (REFRESH_INTERVAL === 3600000) {
                const minutes = Math.ceil(timeRemaining / 60000);
                displayTime = `${minutes}分`;
            } else {
                const hours = Math.floor(timeRemaining / 3600000);
                const minutes = Math.ceil((timeRemaining % 3600000) / 60000);
                displayTime = `${hours}時間 ${minutes}分`;
            }
            
            PRO_BONUS_BUTTON.textContent = `獲得済み (次の獲得まで: ${displayTime})`;
        }
    }
    
    if (PRO_BONUS_INSTRUCTION) {
        PRO_BONUS_INSTRUCTION.innerHTML = `${MEMBER_TYPE}会員特典: ${REFRESH_TEXT}に <strong>${BONUS_AMOUNT.toFixed(1)} P</strong> を獲得できます。`; 
    }
    
    if (PRO_BONUS_MESSAGE) {
        PRO_BONUS_MESSAGE.classList.add('hidden');
    }
}

if (PRO_BONUS_BUTTON) {
    PRO_BONUS_BUTTON.addEventListener('click', async () => {
        if (!authenticatedUser) {
            showMessage(PRO_BONUS_MESSAGE, '❌ 認証エラーが発生しました。', 'error');
            return;
        }

        const MEMBER_STATUS = authenticatedUser.status || 'none';
        let BONUS_AMOUNT;
        let REFRESH_INTERVAL;

        if (MEMBER_STATUS === 'luxury') {
            BONUS_AMOUNT = 10.0;
            REFRESH_INTERVAL = 3600000;
        } else if (MEMBER_STATUS === 'premium') {
            BONUS_AMOUNT = 15.0; 
            REFRESH_INTERVAL = 86400000;
        } else if (MEMBER_STATUS === 'pro') {
            BONUS_AMOUNT = 10.0;
            REFRESH_INTERVAL = 86400000;
        } else {
            showMessage(PRO_BONUS_MESSAGE, '❌ 会員特典の対象外です。', 'error');
            return;
        }

        const player = authenticatedUser.name;
        const messageEl = PRO_BONUS_MESSAGE;
        const now = new Date().toISOString();
        
        if (PRO_BONUS_BUTTON && PRO_BONUS_BUTTON.disabled) {
            showMessage(messageEl, '⚠️ まだ時間が経過していません。', 'error');
            return;
        }
        
        if (PRO_BONUS_BUTTON) {
            PRO_BONUS_BUTTON.disabled = true;
        }
        showMessage(messageEl, 'ポイントを付与中...', 'info');
    
        try {
            const currentData = await fetchAllData();
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            
            const targetPlayer = currentScoresMap.get(player);
            
            if (!targetPlayer) {
                showMessage(messageEl, `❌ プレイヤー ${player} が見つかりません。`, 'error');
                if (PRO_BONUS_BUTTON) PRO_BONUS_BUTTON.disabled = false;
                return;
            }
    
            const lastTime = targetPlayer.lastBonusTime ? new Date(targetPlayer.lastBonusTime).getTime() : 0;
            if ((Date.now() - lastTime) < REFRESH_INTERVAL) {
                showMessage(messageEl, '❌ まだ時間が経過していません。', 'error');
                 if (PRO_BONUS_BUTTON) PRO_BONUS_BUTTON.disabled = true;
                 updateMemberBonusDisplay();
                return;
            }
    
            const newScore = targetPlayer.score + BONUS_AMOUNT;
            
            currentScoresMap.set(player, { 
                ...targetPlayer, 
                score: parseFloat(newScore.toFixed(1)),
                lastBonusTime: now 
            });
            
            const newScores = Array.from(currentScoresMap.values());
    
            const newData = {
                scores: newScores,
                sports_bets: currentData.sports_bets,
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [],
                gift_codes: currentData.gift_codes || []
            };
    
            const response = await updateAllData(newData);
    
            if (response.status === 'success') {
                showMessage(messageEl, `✅ ${MEMBER_STATUS.toUpperCase()}ボーナスとして ${BONUS_AMOUNT.toFixed(1)} P を獲得しました！`, 'success');
                
                authenticatedUser.score = newScore;
                authenticatedUser.lastBonusTime = now;
                CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
                
                updateMemberBonusDisplay(); 
                
            } else {
                showMessage(messageEl, `❌ ボーナス付与エラー: ${response.message}`, 'error');
                if (PRO_BONUS_BUTTON) PRO_BONUS_BUTTON.disabled = false;
            }
    
        } catch (error) {
            console.error(error);
            showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
            if (PRO_BONUS_BUTTON) PRO_BONUS_BUTTON.disabled = false;
        }
    });
}


function initializeGiftCodeFeature() {
    if (!APPLY_GIFT_CODE_FORM) return;
    
    APPLY_GIFT_CODE_FORM.addEventListener('submit', handleApplyGiftCode);
    
    if (GIFT_CODE_INPUT) {
        GIFT_CODE_INPUT.value = '';
    }
    if (APPLY_GIFT_CODE_MESSAGE) {
        APPLY_GIFT_CODE_MESSAGE.classList.add('hidden');
    }
}

async function handleApplyGiftCode(e) {
    e.preventDefault();
    
    if (!authenticatedUser) {
        showMessage(APPLY_GIFT_CODE_MESSAGE, '❌ 認証エラーが発生しました。', 'error');
        return;
    }

    const messageEl = APPLY_GIFT_CODE_MESSAGE;
    const player = authenticatedUser.name;
    const submitButton = APPLY_GIFT_CODE_FORM.querySelector('button[type=\"submit\"]');
    const code = (GIFT_CODE_INPUT.value || '').trim().toUpperCase();

    if (!code) {
        showMessage(messageEl, '❌ コードを入力してください。', 'error');
        return;
    }

    submitButton.disabled = true;
    showMessage(messageEl, 'コードを検証中...', 'info');

    try {
        const currentData = await fetchAllData();
        
        let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
        let allGiftCodes = currentData.gift_codes || [];
        
        const codeIndex = allGiftCodes.findIndex(c => c.code === code);
        
        if (codeIndex === -1) {
            showMessage(messageEl, '❌ エラー: 無効なプレゼントコードです。', 'error');
            return;
        }

        const giftCode = allGiftCodes[codeIndex];
        
        if (giftCode.maxUses > 0 && giftCode.currentUses >= giftCode.maxUses) {
            showMessage(messageEl, '❌ エラー: このコードは最大利用合計回数に達しています。', 'error');
            return;
        }
        
        const pointsToApply = giftCode.points; 
        
        let targetPlayer = currentScoresMap.get(player);
        if (!targetPlayer) {
             showMessage(messageEl, '❌ ユーザーデータが見つかりません。', 'error');
             return;
        }

        const newScore = parseFloat((targetPlayer.score + pointsToApply).toFixed(1));
        
        currentScoresMap.set(player, { 
            ...targetPlayer, 
            score: newScore
        });
        
        giftCode.currentUses += 1;
        const isFullyUsed = giftCode.maxUses > 0 && giftCode.currentUses >= giftCode.maxUses;

        if (isFullyUsed) {
            allGiftCodes.splice(codeIndex, 1);
        } else {
            allGiftCodes[codeIndex] = giftCode;
        }

        currentData.scores = Array.from(currentScoresMap.values());
        currentData.gift_codes = allGiftCodes;
        
        const newData = {
            scores: currentData.scores,
            sports_bets: currentData.sports_bets,
            speedstorm_records: currentData.speedstorm_records,
            lotteries: currentData.lotteries,
            gift_codes: currentData.gift_codes
        };
        
        const response = await updateAllData(newData);
        
        if (response.status === 'success') {
            const actionText = pointsToApply >= 0 ? '獲得' : '消費';
            
            let successMessage = `✅ コード適用成功! ${pointsToApply.toFixed(1)} P を${actionText}しました。`;
            if (isFullyUsed) {
                successMessage += ' (このコードは期限切れとなり削除されました)';
            }
            showMessage(messageEl, successMessage, 'success');
            
            authenticatedUser.score = newScore;
            CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
            
            GIFT_CODE_INPUT.value = '';
        } else {
             showMessage(messageEl, `❌ 適用エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error("プレゼントコード適用中にエラー:", error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    } finally {
        submitButton.disabled = false;
    }
}


async function loadTransferReceiverList() {
    if (!RECEIVER_PLAYER_SELECT_MYPAGE) return;
    if (!authenticatedUser) return;
    
    RECEIVER_PLAYER_SELECT_MYPAGE.innerHTML = '<option value=\"\" disabled selected>ロード中...</option>';
    
    const allData = await fetchAllData(); 
    const scores = allData.scores;

    if (scores.length === 0) {
        RECEIVER_PLAYER_SELECT_MYPAGE.innerHTML = '<option value=\"\" disabled selected>リストの取得に失敗</option>';
        return;
    }

    let options = '<option value=\"\" disabled selected>送金先プレイヤーを選択</option>';
    const senderName = authenticatedUser.name;

    scores.forEach(player => {
        if (player.name !== senderName) {
            options += `<option value=\"${player.name}\">${player.name}</option>`;
        }
    });

    RECEIVER_PLAYER_SELECT_MYPAGE.innerHTML = options;
}

if (TRANSFER_FORM_MYPAGE) {
    TRANSFER_FORM_MYPAGE.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!authenticatedUser) {
            showMessage(document.getElementById('transfer-message-mypage'), '❌ 認証エラーが発生しました。', 'error');
            return;
        }

        const messageEl = document.getElementById('transfer-message-mypage');
        const sender = authenticatedUser.name; 
        const receiver = RECEIVER_PLAYER_SELECT_MYPAGE.value;
        const amount = parseFloat(document.getElementById('transfer-amount-mypage').value);
        const submitButton = TRANSFER_FORM_MYPAGE.querySelector('button[type=\"submit\"]');
    
        if (!receiver || isNaN(amount) || amount <= 0) {
            showMessage(messageEl, 'エラー: 送金先と有効なポイント (0.1P以上) を入力してください。', 'error');
            return;
        }
    
        if (sender === receiver) {
            showMessage(messageEl, 'エラー: 送金元と送金先は異なるプレイヤーである必要があります。', 'error');
            return;
        }
    
        submitButton.disabled = true;
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
            if (!receiverPlayer) {
                 showMessage(messageEl, `エラー: 送金先 ${receiver} のデータが見つかりません。`, 'error');
                 return;
            }
    
            const senderScore = senderPlayer.score || 0;
            
            if (senderScore < amount) {
                showMessage(messageEl, `エラー: ポイント残高 (${senderScore.toFixed(1)} P) が不足しています。`, 'error');
                return;
            }
    
            const newSenderScore = parseFloat((senderScore - amount).toFixed(1));
            currentScoresMap.set(sender, { 
                ...senderPlayer, 
                score: newSenderScore
            });
            
            const receiverScore = receiverPlayer.score || 0;
            const newReceiverScore = parseFloat((receiverScore + amount).toFixed(1));
            currentScoresMap.set(receiver, { 
                ...receiverPlayer, 
                score: newReceiverScore
            });
            
            const newScores = Array.from(currentScoresMap.values());
            
            const newData = {
                scores: newScores,
                sports_bets: currentData.sports_bets, 
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [],
                gift_codes: currentData.gift_codes || []
            };
    
            const response = await updateAllData(newData);
    
            if (response.status === 'success') {
                showMessage(messageEl, `✅ ${receiver} へ ${amount.toFixed(1)} P の送金を完了しました。`, 'success');
                
                authenticatedUser.score = newSenderScore; 
                CURRENT_SCORE_ELEMENT.textContent = newSenderScore.toFixed(1); 
                
                TRANSFER_FORM_MYPAGE.reset();
                loadTransferReceiverList(); 
            } else {
                showMessage(messageEl, `❌ 送金エラー: ${response.message}`, 'error');
            }
    
        } catch (error) {
            console.error("送金処理中にエラー:", error);
            showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
        }
    });
}


function initializeWagerInputs() {
    if (!WAGER_INPUTS_CONTAINER) return;

    WAGER_INPUTS_CONTAINER.innerHTML = '';
    addWagerRow(); 
}

function addWagerRow(item = '', amount = '') {
    if (!WAGER_INPUTS_CONTAINER) return;

    const rowCount = WAGER_INPUTS_CONTAINER.querySelectorAll('.wager-row').length + 1;
    const row = document.createElement('div');
    row.className = 'form-group wager-row';
    row.innerHTML = `
        <div style=\"display: flex; gap: 10px; align-items: flex-end; margin-bottom: 10px;\">
            <div style=\"flex-grow: 1;\">
                <label for=\"wager-item-${rowCount}\">内容 (かけるもの):</label>
                <input type=\"text\" class=\"wager-item-input\" id=\"wager-item-${rowCount}\" value=\"${item}\" placeholder=\"例: A選手優勝 or 満貫和了\" required>
            </div>
            <div style=\"width: 120px;\">
                <label for=\"wager-amount-${rowCount}\">掛け金 (P):</label>
                <input type=\"number\" class=\"wager-amount-input\" id=\"wager-amount-${rowCount}\" value=\"${amount}\" step=\"1\" min=\"1\" placeholder=\"例: 10\" required>
            </div>
            <button type=\"button\" class=\"remove-wager-row-button remove-button\" style=\"width: auto; margin-bottom: 0;\">×</button>
        </div>
    `;
    
    row.querySelector('.remove-wager-row-button').addEventListener('click', (e) => {
        if (WAGER_INPUTS_CONTAINER.querySelectorAll('.wager-row').length > 1) {
            e.target.closest('.wager-row').remove();
        } else {
             showMessage(document.getElementById('wager-message'), '⚠️ 少なくとも1つの賭け行が必要です。', 'info');
        }
    });

    WAGER_INPUTS_CONTAINER.appendChild(row);
}

if (ADD_WAGER_ROW_BUTTON) {
    ADD_WAGER_ROW_BUTTON.addEventListener('click', () => addWagerRow());
}


async function loadBettingDataAndHistory() {
    const allData = await fetchAllData();
    const allBets = allData.sports_bets || []; 
    
    updateWagerForm(allBets);
    renderWagerHistory(allBets);
}


function updateWagerForm(allBets) {
    if (!TARGET_BET_SELECT) return;

    TARGET_BET_SELECT.innerHTML = '<option value=\"\" disabled selected>開催中のくじを選択</option>';
    
    const openBets = allBets.filter(bet => bet.status === 'OPEN' && new Date(bet.deadline) > new Date());
    
    if (openBets.length === 0) {
        TARGET_BET_SELECT.innerHTML = '<option value=\"\" disabled selected>現在、開催中のくじはありません</option>';
        return;
    }

    let options = '<option value=\"\" disabled selected>開催中のくじを選択</option>';
    openBets.forEach(bet => {
        const deadline = new Date(bet.deadline);
        const formattedDeadline = deadline.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) + ' ' + 
                                  deadline.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                                  
        options += `<option value=\"${bet.betId}\">${bet.matchName} (#${bet.betId}) - 締切: ${formattedDeadline}</option>`;
    });

    TARGET_BET_SELECT.innerHTML = options;
}


function renderWagerHistory(allBets) {
    if (!WAGER_HISTORY_LIST) return;
    if (!authenticatedUser) return;

    const player = authenticatedUser.name;
    
    const allPlayerWagers = allBets.flatMap(bet => 
        bet.wagers
           .filter(w => w.player === player)
           .map(w => ({
                ...w, 
                betId: bet.betId, 
                matchName: bet.matchName,
                betStatus: bet.status 
            }))
    );
    
    if (allPlayerWagers.length === 0) {
        WAGER_HISTORY_LIST.innerHTML = '<li>まだ投票履歴はありません。</li>';
        return;
    }

    allPlayerWagers.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const latestWagers = allPlayerWagers.slice(0, 5);

    let html = '';
    latestWagers.forEach(w => {
        const timestamp = new Date(w.timestamp).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        
        let resultText = '';
        let resultClass = 'status-closed'; 
        
        if (w.betStatus === 'SETTLED') {
             if (w.isWin === true) {
                resultText = `✅ 当選 (x${w.appliedOdds.toFixed(1)}) / 獲得: ${(w.amount * w.appliedOdds).toFixed(1)} P`;
                resultClass = 'status-open'; 
            } else if (w.isWin === false) {
                resultText = '❌ 外れ / 損失: 0 P (購入時に減算済み)';
                resultClass = 'status-settled'; 
            } else {
                 resultText = '結果未確定（くじ完了済みだが投票結果が不明）';
            }
        } else if (w.betStatus === 'CLOSED' || w.betStatus === 'OPEN') {
             resultText = '結果待ち...';
             resultClass = 'status-closed';
        }

        html += `
            <li style=\"border-bottom: 1px dotted #ccc; padding: 5px 0;\">
                <p style=\"margin: 0; font-size: 0.9em; color: #6c757d;\">${timestamp} - くじ #${w.betId}: ${w.matchName}</p>
                <p style=\"margin: 2px 0 0 0;\">
                    ${w.amount} P を <strong>「${w.item}」</strong> に投票
                </p>
                <p style=\"margin: 2px 0 0 10px; font-weight: bold;\" class=\"${resultClass}\">${resultText}</p>
            </li>
        `;
    });

    WAGER_HISTORY_LIST.innerHTML = html;
}


if (WAGER_FORM) {
    WAGER_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!authenticatedUser) {
            showMessage(document.getElementById('wager-message'), '❌ 認証エラーが発生しました。', 'error');
            return;
        }

        const messageEl = document.getElementById('wager-message');
        const betId = parseInt(TARGET_BET_SELECT.value);
        const player = authenticatedUser.name; 
        
        const wagersToSubmit = [];
        let totalWagerAmount = 0;
        let allValid = true;
        let hasAtLeastOneValid = false;
        
        if (WAGER_INPUTS_CONTAINER) {
            WAGER_INPUTS_CONTAINER.querySelectorAll('.wager-row').forEach(row => {
                const itemInput = row.querySelector('.wager-item-input').value.trim();
                const amountInput = parseFloat(row.querySelector('.wager-amount-input').value);
                
                if (itemInput && !isNaN(amountInput) && amountInput >= 1) {
                    wagersToSubmit.push({
                        item: itemInput,
                        amount: amountInput,
                        player: player,
                        timestamp: new Date().toISOString(),
                        isWin: null, 
                        appliedOdds: null 
                    });
                    totalWagerAmount += amountInput;
                    hasAtLeastOneValid = true;
                } else if (itemInput || !isNaN(amountInput)) {
                    allValid = false;
                }
            });
        }

        if (!betId || !allValid || !hasAtLeastOneValid) {
            showMessage(messageEl, '❌ 対象くじを選択し、少なくとも一つの有効な「かけるもの」と「掛け金 (1P以上)」を入力してください。', 'error');
            return;
        }

        const submitButton = WAGER_FORM.querySelector('button[type=\"submit\"]');
        submitButton.disabled = true;
        showMessage(messageEl, `投票 (${totalWagerAmount} P) を処理中...`, 'info');
        
        try {
            const currentData = await fetchAllData();
            const allBets = currentData.sports_bets || [];
            const betIndex = allBets.findIndex(b => b.betId === betId);
            
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            let targetPlayer = currentScoresMap.get(player);
            
            if (!targetPlayer || typeof targetPlayer.pass === 'undefined' || typeof targetPlayer.status === 'undefined') {
                 showMessage(messageEl, '❌ 認証ユーザーのデータにパスワード情報または会員ステータス情報が不足しています。', 'error');
                 return;
            }

            if (targetPlayer.score < totalWagerAmount) {
                showMessage(messageEl, `❌ ポイント残高 (${targetPlayer.score.toFixed(1)} P) が不足しているため、合計 ${totalWagerAmount} Pの投票はできません。`, 'error');
                return;
            }

            const currentBet = allBets[betIndex];

            if (betIndex === -1 || currentBet.status !== 'OPEN' || new Date(currentBet.deadline) <= new Date()) {
                showMessage(messageEl, '❌ 開催中のくじではありません（締切済みの可能性があります）。', 'error');
                return;
            }

            const newScore = parseFloat((targetPlayer.score - totalWagerAmount).toFixed(1));

            currentScoresMap.set(player, { 
                ...targetPlayer, 
                score: newScore
            });

            currentBet.wagers.push(...wagersToSubmit);
            
            currentData.sports_bets = allBets;
            currentData.scores = Array.from(currentScoresMap.values()); 

            const newData = {
                scores: currentData.scores,
                sports_bets: currentData.sports_bets,
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [], 
                gift_codes: currentData.gift_codes || [] 
            };

            const response = await updateAllData(newData);
            if (response.status === 'success') {
                showMessage(messageEl, `✅ ${player}様の ${totalWagerAmount} P の投票 (${wagersToSubmit.length}件) を登録し、ポイントを減算しました。`, 'success');
                WAGER_FORM.reset();
                
                authenticatedUser.score = newScore; 
                CURRENT_SCORE_ELEMENT.textContent = authenticatedUser.score.toFixed(1); 
                
                loadBettingDataAndHistory(); 
                initializeWagerInputs(); 
                
            } else {
                showMessage(messageEl, `❌ 投票エラー: ${response.message}`, 'error');
            }

        } catch (error) {
            console.error("投票処理中にエラー:", error);
            showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
        }
    });
}


// -----------------------------------------------------------------
// ★★★ 宝くじ購入・結果確認機能 ★★★
// -----------------------------------------------------------------

function initializeLotteryPurchaseForm() {
    if (!LOTTERY_SELECT || !LOTTERY_TICKET_COUNT || !LOTTERY_TOTAL_PRICE_DISPLAY) return;

    LOTTERY_TICKET_COUNT.removeAttribute('max');

    const DISCOUNT_RATE = authenticatedUser && authenticatedUser.status === 'luxury' ? 0.8 : 1.0; 
    
    const updatePrice = () => {
        const selectedLotteryId = parseInt(LOTTERY_SELECT.value);
        const count = parseInt(LOTTERY_TICKET_COUNT.value);
        
        let discountText = '';

        if (selectedLotteryId && count > 0) {
            const lottery = availableLotteries.find(l => l.lotteryId === selectedLotteryId);
            if (lottery) {
                const originalPrice = lottery.ticketPrice * count;
                const discountedPrice = originalPrice * DISCOUNT_RATE;
                
                const finalPrice = parseFloat(discountedPrice.toFixed(1)); 

                if (DISCOUNT_RATE < 1.0) {
                    discountText = `(Luxury特典: ${originalPrice.toFixed(1)} P → ${finalPrice.toFixed(1)} P)`;
                    LOTTERY_TOTAL_PRICE_DISPLAY.innerHTML = `合計: <strong style=\"color: #28a745;\">${finalPrice.toFixed(1)} P</strong> ${discountText}`;
                } else {
                    LOTTERY_TOTAL_PRICE_DISPLAY.textContent = `合計: ${finalPrice.toFixed(1)} P`;
                }

            } else {
                LOTTERY_TOTAL_PRICE_DISPLAY.textContent = '合計: - P';
            }
        } else {
            LOTTERY_TOTAL_PRICE_DISPLAY.textContent = '合計: - P';
        }
    };

    LOTTERY_SELECT.addEventListener('change', updatePrice);
    LOTTERY_TICKET_COUNT.addEventListener('input', updatePrice);
    
    updatePrice();
}

async function loadLotteryData() {
    if (!authenticatedUser) return;
    if (!LOTTERY_SELECT || !LOTTERY_RESULTS_CONTAINER) return;

    LOTTERY_SELECT.innerHTML = '<option value=\"\" disabled selected>ロード中...</option>';
    LOTTERY_RESULTS_CONTAINER.innerHTML = '<p>購入履歴をロード中...</p>';
    availableLotteries = [];
    
    const allData = await fetchAllData();
    const allLotteries = allData.lotteries || [];
    const now = new Date();
    
    const openLotteries = allLotteries.filter(l => 
        l.status === 'OPEN' && new Date(l.purchaseDeadline) > now
    );

    if (openLotteries.length === 0) {
        LOTTERY_SELECT.innerHTML = '<option value=\"\" disabled>現在購入可能な宝くじはありません</option>';
    } else {
        let options = '<option value=\"\" disabled selected>購入する宝くじを選択</option>';
        openLotteries.forEach(l => {
            const deadline = new Date(l.purchaseDeadline).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            options += `<option value=\"${l.lotteryId}\">${l.name} (${l.ticketPrice} P/枚) - 締切: ${deadline}</option>`;
        });
        LOTTERY_SELECT.innerHTML = options;
        availableLotteries = openLotteries; 
    }
    
    const myPlayerName = authenticatedUser.name;
    const myLotteries = allLotteries.filter(l => 
        l.tickets.some(t => t.player === myPlayerName)
    );

    if (myLotteries.length === 0) {
        LOTTERY_RESULTS_CONTAINER.innerHTML = '<p>宝くじの購入履歴はありません。</p>';
    } else {
        let html = '';
        myLotteries.sort((a, b) => new Date(b.resultAnnounceDate) - new Date(a.resultAnnounceDate)); 

        myLotteries.forEach(l => {
            const myTickets = l.tickets.filter(t => t.player === myPlayerName);
            const resultAnnounceDate = new Date(l.resultAnnounceDate);
            
            const totalTicketsCount = myTickets.reduce((sum, t) => sum + t.count, 0);
            
            let statusHtml = '';
            
            if (resultAnnounceDate > now) {
                statusHtml = `<p class=\"status-label status-closed\">結果発表待ち (発表日時: ${resultAnnounceDate.toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })})</p>`;
            } else {
                const unclaimedTicketsCount = myTickets.filter(t => !t.isClaimed).reduce((sum, t) => sum + t.count, 0);
                
                const claimedTickets = myTickets.filter(t => t.isClaimed);
                let winnings = 0;
                let prizeSummary = '';
                
                if (claimedTickets.length > 0) {
                    const winCounts = claimedTickets.reduce((counts, t) => {
                        if (t.prizeRank !== null) { 
                            const rank = t.prizeRank;
                            counts[rank] = (counts[rank] || { count: 0, amount: 0 });
                            counts[rank].count += t.count;
                            counts[rank].amount += t.prizeAmount * t.count; 
                            winnings += t.prizeAmount * t.count;
                        } else {
                             counts['ハズレ'] = (counts['ハズレ'] || { count: 0, amount: 0 });
                             counts['ハズレ'].count += t.count;
                        }
                        return counts;
                    }, {});

                    const ranks = Object.keys(winCounts).filter(r => r !== 'ハズレ').sort((a, b) => parseInt(a) - parseInt(b));
                    
                    if (winnings > 0) {
                        prizeSummary = ranks.map(rank => {
                            const rankName = `${rank}等`;
                            return `${rankName}: ${winCounts[rank].count}枚`;
                        }).join(', ');
                        
                        prizeSummary = `<p style=\"font-size: 0.9em; margin: 5px 0 0 0; font-weight: bold; color: #38c172;\">内訳: ${prizeSummary}</p>`;

                    } else {
                        prizeSummary = `<p style=\"font-size: 0.9em; margin: 5px 0 0 0; color: #dc3545;\">当選はありませんでした。</p>`;
                    }
                }
                
                if (unclaimedTicketsCount > 0) {
                    statusHtml = `
                        <button class=\"action-button check-lottery-result\" data-lottery-id=\"${l.lotteryId}\" style=\"width: auto; background-color: #28a745;\">
                            結果を見る (${unclaimedTicketsCount}枚 未確認)
                        </button>
                        ${prizeSummary}
                    `;
                } else {
                    if (winnings > 0) {
                        statusHtml = `<p class=\"status-label status-open\">✅ 結果確認済み (合計当選: ${winnings.toFixed(1)} P)</p>`;
                    } else {
                        statusHtml = `<p class=\"status-label status-settled\">❌ 結果確認済み</p>`;
                    }
                    statusHtml += prizeSummary;
                }
            }

            html += `
                <div class=\"bet-card\" style=\"margin-bottom: 10px;\">
                    <h4>${l.name} (#${l.lotteryId})</h4>
                    <p>購入枚数: ${totalTicketsCount} 枚</p>
                    ${statusHtml}
                    <p id=\"lottery-result-message-${l.lotteryId}\" class=\"hidden\"></p>
                </div>
            `;
        });
        LOTTERY_RESULTS_CONTAINER.innerHTML = html;
        
        LOTTERY_RESULTS_CONTAINER.querySelectorAll('.check-lottery-result').forEach(button => {
            button.addEventListener('click', handleCheckLotteryResult);
        });
    }
}

if (LOTTERY_PURCHASE_FORM) {
    LOTTERY_PURCHASE_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!authenticatedUser) {
            showMessage(LOTTERY_PURCHASE_MESSAGE, '❌ 認証エラーが発生しました。', 'error');
            return;
        }

        const lotteryId = parseInt(LOTTERY_SELECT.value);
        const count = parseInt(LOTTERY_TICKET_COUNT.value);
        const submitButton = LOTTERY_PURCHASE_FORM.querySelector('button[type=\"submit\"]');

        if (!lotteryId || !count || count <= 0) {
            showMessage(LOTTERY_PURCHASE_MESSAGE, '❌ 宝くじを選択し、1枚以上の購入枚数を入力してください。', 'error');
            return;
        }

        const lottery = availableLotteries.find(l => l.lotteryId === lotteryId);
        if (!lottery) {
            showMessage(LOTTERY_PURCHASE_MESSAGE, '❌ 選択された宝くじ情報が見つかりません。', 'error');
            return;
        }

        const DISCOUNT_RATE = authenticatedUser.status === 'luxury' ? 0.8 : 1.0;
        const originalPrice = lottery.ticketPrice * count;
        const discountedPrice = originalPrice * DISCOUNT_RATE;
        const finalPrice = parseFloat(discountedPrice.toFixed(1)); 
        
        if (authenticatedUser.score < finalPrice) {
            showMessage(LOTTERY_PURCHASE_MESSAGE, `❌ ポイント残高 (${authenticatedUser.score.toFixed(1)} P) が不足しています (必要: ${finalPrice.toFixed(1)} P)。`, 'error');
            return;
        }

        submitButton.disabled = true;
        showMessage(LOTTERY_PURCHASE_MESSAGE, `${count}枚 (${finalPrice.toFixed(1)} P) の宝くじを購入し、抽選処理中...`, 'info');

        try {
            const currentData = await fetchAllData();
            
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            let allLotteries = currentData.lotteries || [];
            
            let targetPlayer = currentScoresMap.get(authenticatedUser.name);
            if (!targetPlayer || targetPlayer.score < finalPrice || typeof targetPlayer.status === 'undefined') {
                showMessage(LOTTERY_PURCHASE_MESSAGE, `❌ 最新のポイント残高 (${targetPlayer.score.toFixed(1)} P) が不足しているか、ユーザーデータが不完全です。`, 'error');
                submitButton.disabled = false;
                return;
            }

            const targetLotteryIndex = allLotteries.findIndex(l => l.lotteryId === lotteryId);
            if (targetLotteryIndex === -1 || allLotteries[targetLotteryIndex].status !== 'OPEN' || new Date(allLotteries[targetLotteryIndex].purchaseDeadline) <= new Date()) {
                showMessage(LOTTERY_PURCHASE_MESSAGE, '❌ この宝くじは購入可能ではありません (締切済みの可能性があります)。', 'error');
                submitButton.disabled = false;
                await loadLotteryData(); 
                return;
            }
            
            const targetLottery = allLotteries[targetLotteryIndex];
            
            const drawResultsMap = {}; 
            let totalWinningsForLog = 0; 
            let winCount = 0; 

            for (let i = 0; i < count; i++) {
                const drawResult = performLotteryDraw(targetLottery.prizes);
                const rankKey = drawResult.prizeRank === null ? 'ハズRE' : drawResult.prizeRank.toString();
                
                if (!drawResultsMap[rankKey]) {
                     drawResultsMap[rankKey] = { count: 0, amount: drawResult.prizeAmount };
                }
                
                drawResultsMap[rankKey].count++;
                
                if(drawResult.isWinner) {
                    totalWinningsForLog += drawResult.prizeAmount;
                    winCount++;
                }
            }
            
            const newTickets = [];
            const purchaseDate = new Date().toISOString();
            
            Object.keys(drawResultsMap).forEach(rankKey => {
                const isWinner = rankKey !== 'ハズRE';
                const prizeRank = isWinner ? parseInt(rankKey) : null;
                const prizeAmount = drawResultsMap[rankKey].amount; 
                const ticketCount = drawResultsMap[rankKey].count;
                
                const newTicket = {
                    ticketId: `tkt-${authenticatedUser.name}-${lotteryId}-${rankKey}-${purchaseDate}`,
                    player: authenticatedUser.name,
                    purchaseDate: purchaseDate, 
                    prizeRank: prizeRank,
                    prizeAmount: prizeAmount, 
                    count: ticketCount, 
                    isClaimed: false 
                };
                
                newTickets.push(newTicket);
            });

            const newScore = parseFloat((targetPlayer.score - finalPrice).toFixed(1));

            currentScoresMap.set(authenticatedUser.name, { 
                ...targetPlayer, 
                score: newScore
            });

            targetLottery.tickets.push(...newTickets);
            allLotteries[targetLotteryIndex] = targetLottery;

            const newData = {
                scores: Array.from(currentScoresMap.values()),
                sports_bets: currentData.sports_bets, 
                speedstorm_records: currentData.speedstorm_records,
                lotteries: allLotteries,
                gift_codes: currentData.gift_codes || []
            };

            const response = await updateAllData(newData);
            
            if (response.status === 'success') {
                showMessage(LOTTERY_PURCHASE_MESSAGE, `✅ ${count}枚の購入が完了しました (ポイント ${finalPrice.toFixed(1)} P 減算)。${DISCOUNT_RATE < 1.0 ? ' Luxury割引が適用されました！' : ''}`, 'success');
                
                authenticatedUser.score = newScore;
                CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
                
                LOTTERY_PURCHASE_FORM.reset();
                LOTTERY_TOTAL_PRICE_DISPLAY.textContent = '合計: - P';
                await loadLotteryData(); 

            } else {
                showMessage(LOTTERY_PURCHASE_MESSAGE, `❌ 購入エラー: ${response.message}`, 'error');
            }

        } catch (error) {
            console.error("宝くじ購入処理中にエラー:", error);
            showMessage(LOTTERY_PURCHASE_MESSAGE, `❌ サーバーエラー: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
        }
    });
}

function performLotteryDraw(prizes) {
    const randomValue = Math.random(); 
    let cumulativeProbability = 0;

    for (const prize of prizes) {
        cumulativeProbability += prize.probability;
        
        if (randomValue < cumulativeProbability) {
            return { prizeRank: prize.rank, prizeAmount: prize.amount, isWinner: true };
        }
    }

    return { prizeRank: null, prizeAmount: 0, isWinner: false };
}


async function handleCheckLotteryResult(e) {
    const button = e.target;
    const lotteryId = parseInt(button.dataset.lotteryId);
    
    if (!authenticatedUser || !lotteryId) return;

    const messageEl = document.getElementById(`lottery-result-message-${lotteryId}`);
    if (!messageEl) return;
    
    button.disabled = true;
    showMessage(messageEl, '結果を確認し、ポイントを反映中...', 'info');

    try {
        const currentData = await fetchAllData();
        
        let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
        let allLotteries = currentData.lotteries || [];
        
        const targetLotteryIndex = allLotteries.findIndex(l => l.lotteryId === lotteryId);
        if (targetLotteryIndex === -1) {
            showMessage(messageEl, '❌ 宝くじデータが見つかりません。', 'error');
            return;
        }
        
        const lottery = allLotteries[targetLotteryIndex];
        const player = authenticatedUser.name;
        
        let totalWinnings = 0;
        let winCount = 0;
        let ticketCount = 0; 
        
        const winRankCounts = {};
        
        lottery.tickets.forEach(ticket => {
            if (ticket.player === player && !ticket.isClaimed) {
                ticketCount += ticket.count; 
                
                if (ticket.prizeRank !== null && ticket.prizeAmount > 0) {
                    const winningsThisTicket = ticket.prizeAmount * ticket.count;
                    totalWinnings += winningsThisTicket;
                    winCount += ticket.count; 
                    
                    const rank = ticket.prizeRank;
                    winRankCounts[rank] = (winRankCounts[rank] || 0) + ticket.count;
                } else {
                    const rank = 'ハズレ';
                    winRankCounts[rank] = (winRankCounts[rank] || 0) + ticket.count;
                }
                
                ticket.isClaimed = true;
            }
        });

        if (ticketCount === 0) {
            showMessage(messageEl, '✅ 既に確認済みです (新たに確認したチケットはありません)。', 'info');
            button.style.display = 'none'; 
            await loadLotteryData(); 
            return;
        }

        if (totalWinnings > 0) {
            let targetPlayer = currentScoresMap.get(player);
            if (targetPlayer) {
                const newScore = parseFloat((targetPlayer.score + totalWinnings).toFixed(1));
                currentScoresMap.set(player, { 
                    ...targetPlayer, 
                    score: newScore
                });
                
                authenticatedUser.score = newScore;
                CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
            }
        }
        
        allLotteries[targetLotteryIndex] = lottery;
        
        const newData = {
            scores: Array.from(currentScoresMap.values()),
            sports_bets: currentData.sports_bets, 
            speedstorm_records: currentData.speedstorm_records,
            lotteries: allLotteries,
            gift_codes: currentData.gift_codes || []
        };
        
        const response = await updateAllData(newData);
        
        if (response.status === 'success') {
            
            let resultMessage = `✅ 結果: ${ticketCount}枚のチケットを確認しました。`;

            if (totalWinnings > 0) {
                const ranks = Object.keys(winRankCounts).filter(r => r !== 'ハズレ').sort((a, b) => parseInt(a) - parseInt(b));
                const prizeDetails = ranks.map(rank => {
                    const rankName = `${rank}等`;
                    return `${rankName}: ${winRankCounts[rank]}枚`;
                }).join(', ');

                resultMessage += ` ${winCount}枚が当選し、合計 ${totalWinnings.toFixed(1)} P を獲得！ (${prizeDetails})`;
                
                showMessage(messageEl, resultMessage, 'success');
            } else {
                resultMessage += ` 残念ながら当選はありませんでした。`;
                showMessage(messageEl, resultMessage, 'error');
            }
            
            await loadLotteryData();
            
        } else {
             showMessage(messageEl, `❌ 結果確認エラー: ${response.message}`, 'error');
             button.disabled = false;
             await loadLotteryData();
        }

    } catch (error) {
        console.error("宝くじ結果確認中にエラー:", error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
        button.disabled = false;
    }
}


window.onload = autoLogin;
