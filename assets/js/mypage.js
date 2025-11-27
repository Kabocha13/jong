// assets/js/mypage.js

const AUTH_FORM = document.getElementById('auth-form');
const MYPAGE_CONTENT = document.getElementById('mypage-content');
const AUTH_MESSAGE = document.getElementById('auth-message');
const WAGER_FORM = document.getElementById('wager-form');
const TARGET_BET_SELECT = document.getElementById('target-bet');
const WAGER_PLAYER_INPUT = document.getElementById('wager-player');
// 廃止された要素: WAGER_SELECTION_SELECT
const AUTHENTICATED_USER_NAME = document.getElementById('authenticated-user-name');
const CURRENT_SCORE_ELEMENT = document.getElementById('current-score');
const FIXED_PLAYER_NAME = document.getElementById('fixed-player-name');
const WAGER_HISTORY_LIST = document.getElementById('wager-history-list');

// ★ 新規追加要素
const WAGER_INPUTS_CONTAINER = document.getElementById('wager-inputs-container');
const ADD_WAGER_ROW_BUTTON = document.getElementById('add-wager-row-button');

// ★ ダークモード関連の要素
const DARK_MODE_TOGGLE_BUTTON = document.getElementById('dark-mode-toggle-button');
const DARK_MODE_MESSAGE = document.getElementById('dark-mode-message');
const DARK_MODE_STATUS = document.getElementById('dark-mode-status');

// ★ ログアウトボタン
const LOGOUT_BUTTON = document.getElementById('logout-button');

// ★★★ 会員ボーナス関連の要素
const PRO_BONUS_TOOL = document.getElementById('pro-bonus-tool');
const PRO_BONUS_BUTTON = document.getElementById('pro-bonus-button');
const PRO_BONUS_MESSAGE = document.getElementById('pro-bonus-message');
const PRO_BONUS_INSTRUCTION = document.getElementById('pro-bonus-instruction'); 

// ★★★ 新規追加: 送金関連の要素 ★★★
const TRANSFER_FORM_MYPAGE = document.getElementById('transfer-form-mypage');
const RECEIVER_PLAYER_SELECT_MYPAGE = document.getElementById('receiver-player-mypage');
const AUTHENTICATED_USER_TRANSFER = document.getElementById('authenticated-user-transfer');

// ★★★ 新規追加: 宝くじ関連の要素 ★★★
const LOTTERY_PURCHASE_FORM = document.getElementById('lottery-purchase-form');
const LOTTERY_SELECT = document.getElementById('lottery-select');
const LOTTERY_TICKET_COUNT = document.getElementById('lottery-ticket-count');
const LOTTERY_PURCHASE_MESSAGE = document.getElementById('lottery-purchase-message');
const LOTTERY_TOTAL_PRICE_DISPLAY = document.getElementById('lottery-total-price');
const LOTTERY_RESULTS_CONTAINER = document.getElementById('lottery-results-container');

// ★★★ Premium会員専用くじ作成フォームの要素 ★★★
const PREMIUM_TOOLS_SECTION = document.getElementById('premium-tools-section');
const PREMIUM_CREATE_BET_FORM = document.getElementById('premium-create-bet-form');
const PREMIUM_CREATE_MESSAGE = document.getElementById('premium-create-message');
const PREMIUM_MATCH_NAME_INPUT = document.getElementById('premium-match-name');
const PREMIUM_DEADLINE_DATETIME_INPUT = document.getElementById('premium-deadline-datetime');


// 認証されたユーザー情報 ({name: '...', score: ..., pass: '...', status: ..., lastBonusTime: ...})
let authenticatedUser = null; 
// 宝くじのデータを一時的に保持 (価格計算用)
let availableLotteries = [];

// -----------------------------------------------------------------
// ★★★ 認証とログイン状態の管理 ★★★
// -----------------------------------------------------------------

/**
 * ログイン処理本体
 * @param {string} username - ユーザー名
 * @param {string} password - パスワード
 * @param {boolean} isAuto - 自動ログインかどうか
 * @returns {Promise<boolean>} ログイン成功ならtrue
 */
async function attemptLogin(username, password, isAuto = false) {
    if (!isAuto) {
        showMessage(AUTH_MESSAGE, '認証中...', 'info');
    }
    
    const allData = await fetchAllData();
    const scores = allData.scores;

    // ユーザー名とパスワードで照合
    // ★ 修正: .pro フィールドではなく .status フィールドをチェックする
    const user = scores.find(p => p.name === username && p.pass === password);

    if (user) {
        // ★ 修正: 認証ユーザー情報を最新のデータで上書き
        authenticatedUser = user; 
        
        // ★ 修正: statusフィールドが存在しない場合、'none' をデフォルトとして設定
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
             // 自動ログイン時はメッセージを非表示にする
             AUTH_MESSAGE.classList.add('hidden');
        }
        
        // 3. マイページコンテンツの初期化
        initializeMyPageContent(); 
        return true;
    } else {
        // 自動ログインが失敗した場合は、保存された認証情報が古い可能性があるためクリア
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
        // ユーザーに一瞬表示される「認証」のタイトルを維持しつつ、自動ログインを試みる
        // 認証メッセージは表示しない
        await attemptLogin(username, password, true);
    }
}

/**
 * ログアウト処理
 */
function handleLogout() {
    // 既存の window.confirm をカスタムモーダルに置き換える指示がないため、一旦そのままにするが、本来はカスタムモーダルが必要
    if (!window.confirm('ログアウトしますか？次回アクセス時に再度ログインが必要です。')) {
        return;
    }
    
    // 1. localStorageから認証情報を削除
    localStorage.removeItem('authUsername');
    localStorage.removeItem('authPassword');

    // 2. 状態をリセットし、UIを切り替える
    authenticatedUser = null;
    document.getElementById('auth-section').classList.remove('hidden');
    MYPAGE_CONTENT.classList.add('hidden');
    
    // フォームをリセット
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
// ★★★ 初期化とダークモード/ボーナス/送金処理 ★★★
// -----------------------------------------------------------------


async function initializeMyPageContent() {
    if (!authenticatedUser) return; // 念のため

    // 1. ユーザー情報の表示と固定
    AUTHENTICATED_USER_NAME.textContent = authenticatedUser.name;
    CURRENT_SCORE_ELEMENT.textContent = authenticatedUser.score.toFixed(1);
    FIXED_PLAYER_NAME.textContent = authenticatedUser.name;
    WAGER_PLAYER_INPUT.value = authenticatedUser.name; // 投票フォームにユーザー名を固定
    AUTHENTICATED_USER_TRANSFER.textContent = authenticatedUser.name; // ★ 送金元をUIに表示
    
    // 2. くじデータと履歴のロード
    await loadBettingDataAndHistory();
    
    // 3. 賭け入力フィールドの初期化
    initializeWagerInputs();

    // 4. ダークモード機能の初期化
    initializeDarkModeFeature();

    // 5. 会員ボーナス機能の初期化
    initializeMemberBonusFeature(); 
    
    // 6. ★★★ 送金機能の初期化 ★★★
    loadTransferReceiverList(); 
    
    // 7. ★★★ 宝くじ機能の初期化 ★★★
    await loadLotteryData();
    initializeLotteryPurchaseForm();
    
    // 8. ★★★ Premiumツール (くじ作成) の初期化と表示制御 ★★★
    initializePremiumBetCreation();
}


// --- ダークモード機能の初期化 (Pro/Premium/Luxury対応) ---
/**
 * ダークモード機能の初期化
 * proまたはpremiumまたはluxuryステータスを確認し、ボタンの表示を制御する
 */
function initializeDarkModeFeature() {
    // ★ 修正: statusが'pro'または'premium'または'luxury'であれば有効
    const isMember = authenticatedUser && 
                     (authenticatedUser.status === 'pro' || 
                      authenticatedUser.status === 'premium' ||
                      authenticatedUser.status === 'luxury'); // ★ luxuryを追加
    const isDarkModeEnabled = localStorage.getItem('darkMode') === 'enabled';
    
    // ★ 修正: nullチェックの追加
    if (!DARK_MODE_TOGGLE_BUTTON || !DARK_MODE_STATUS) return;

    // pro/premium/luxury会員でない場合、ボタンを無効化・スタイル変更し、理由を表示する
    if (!isMember) {
        DARK_MODE_TOGGLE_BUTTON.disabled = true;
        DARK_MODE_TOGGLE_BUTTON.textContent = 'Pro/Premium/Luxury会員限定機能';
        DARK_MODE_STATUS.innerHTML = '<span style="color: #dc3545; font-weight: bold;">⚠️ ダークモードはPro/Premium/Luxury会員限定機能です。</span>';
    } else {
        // 会員の場合
        DARK_MODE_TOGGLE_BUTTON.disabled = false;
        updateDarkModeDisplay(isDarkModeEnabled);
    }
    
    // ページ全体にクラスを適用（ロード時の処理を統一するため、ここで再実行）
    if (isDarkModeEnabled) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

/**
 * ダークモードの表示を更新するヘルパー関数
 * @param {boolean} isEnabled - ダークモードが有効かどうか
 */
function updateDarkModeDisplay(isEnabled) {
    if (!DARK_MODE_STATUS || !DARK_MODE_TOGGLE_BUTTON) return; // ★ 修正: nullチェック
    
    if (isEnabled) {
        DARK_MODE_STATUS.innerHTML = 'ステータス: <strong style="color: #28a745;">有効です 🟢</strong> (会員特典)';
        DARK_MODE_TOGGLE_BUTTON.textContent = 'ライトモードに戻す';
    } else {
        DARK_MODE_STATUS.innerHTML = 'ステータス: <strong style="color: #dc3545;">無効です ⚪</strong> (会員特典)';
        DARK_MODE_TOGGLE_BUTTON.textContent = 'ダークモードに切り替える';
    }
}


/**
 * ダークモード切り替えボタンのイベントリスナー (Luxury対応)
 */
// ★ 修正: nullチェック
if (DARK_MODE_TOGGLE_BUTTON) {
    DARK_MODE_TOGGLE_BUTTON.addEventListener('click', () => {
        // ★ 修正: statusが'pro'または'premium'または'luxury'であれば有効
        const isMember = authenticatedUser && 
                         (authenticatedUser.status === 'pro' || 
                          authenticatedUser.status === 'premium' ||
                          authenticatedUser.status === 'luxury'); // ★ luxuryを追加
        
        if (!isMember) {
            showMessage(DARK_MODE_MESSAGE, '❌ この機能はPro/Premium/Luxury会員専用です。', 'error');
            return;
        }
        
        const isCurrentlyDarkMode = document.body.classList.contains('dark-mode');
        
        if (isCurrentlyDarkMode) {
            // ダークモードを解除 -> ライトモードに
            localStorage.setItem('darkMode', 'disabled');
            document.body.classList.remove('dark-mode');
            showMessage(DARK_MODE_MESSAGE, '✅ ライトモードに切り替えました。', 'success');
            updateDarkModeDisplay(false);
        } else {
            // ダークモードを有効に
            localStorage.setItem('darkMode', 'enabled');
            document.body.classList.add('dark-mode');
            showMessage(DARK_MODE_MESSAGE, '✅ ダークモードに切り替えました。', 'success');
            updateDarkModeDisplay(true);
        }
    });
}


// -----------------------------------------------------------------
// ★★★ 会員ボーナス機能 (Luxury 5.0P / 1時間ごと) ★★★
// -----------------------------------------------------------------

/**
 * 会員ボーナス機能の初期化
 * Pro/Premium/Luxury会員であるかチェックし、ボタンの表示/有効性を制御
 */
function initializeMemberBonusFeature() {
    // ★ 修正: statusが'pro','premium','luxury'の場合に表示
    const isMember = authenticatedUser && 
                     (authenticatedUser.status === 'pro' || 
                      authenticatedUser.status === 'premium' ||
                      authenticatedUser.status === 'luxury'); // ★ luxuryを追加
    
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

/**
 * 会員ボーナスボタンの状態をチェックし、表示を更新する
 */
function updateMemberBonusDisplay() {
    if (!authenticatedUser) return;

    const MEMBER_STATUS = authenticatedUser.status || 'none';
    
    let BONUS_AMOUNT;
    let MEMBER_TYPE;
    let REFRESH_INTERVAL; // 獲得間隔（ミリ秒）
    let REFRESH_TEXT;     // 獲得間隔（表示用テキスト）

    // ★ 修正: Luxury会員のボーナスを変更 (5.0P / 1時間ごと)
    if (MEMBER_STATUS === 'luxury') {
        BONUS_AMOUNT = 5.0; // Luxuryは5ポイント
        MEMBER_TYPE = 'Luxury';
        REFRESH_INTERVAL = 3600000; // 1時間 (60 * 60 * 1000)
        REFRESH_TEXT = '1時間ごと';
    } else if (MEMBER_STATUS === 'premium') {
        BONUS_AMOUNT = 15.0; // Premiumは15ポイント
        MEMBER_TYPE = 'Premium';
        REFRESH_INTERVAL = 86400000; // 24時間
        REFRESH_TEXT = '24時間ごと';
    } else if (MEMBER_STATUS === 'pro') {
        BONUS_AMOUNT = 10.0; // Proは10ポイント
        MEMBER_TYPE = 'Pro';
        REFRESH_INTERVAL = 86400000; // 24時間
        REFRESH_TEXT = '24時間ごと';
    } else {
        // none またはその他の場合
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
            
            // 獲得間隔に応じて表示を調整
            let displayTime;
            if (REFRESH_INTERVAL === 3600000) {
                 // 1時間ごとの場合、分単位で表示
                const minutes = Math.ceil(timeRemaining / 60000);
                displayTime = `${minutes}分`;
            } else {
                // 24時間ごとの場合、時間/分単位で表示
                const hours = Math.floor(timeRemaining / 3600000);
                const minutes = Math.ceil((timeRemaining % 3600000) / 60000);
                displayTime = `${hours}時間 ${minutes}分`;
            }
            
            PRO_BONUS_BUTTON.textContent = `獲得済み (次の獲得まで: ${displayTime})`;
        }
    }
    
    if (PRO_BONUS_INSTRUCTION) {
        // ★ 修正: REFRESH_TEXTを使用して表示を更新
        PRO_BONUS_INSTRUCTION.innerHTML = `${MEMBER_TYPE}会員特典: ${REFRESH_TEXT}に <strong>${BONUS_AMOUNT.toFixed(1)} P</strong> を獲得できます。`; 
    }
    
    if (PRO_BONUS_MESSAGE) {
        PRO_BONUS_MESSAGE.classList.add('hidden');
    }
}

/**
 * 会員ボーナスポイントを付与する処理
 */
// ★ 修正: nullチェック
if (PRO_BONUS_BUTTON) {
    PRO_BONUS_BUTTON.addEventListener('click', async () => {
        if (!authenticatedUser) {
            showMessage(PRO_BONUS_MESSAGE, '❌ 認証エラーが発生しました。', 'error');
            return;
        }

        const MEMBER_STATUS = authenticatedUser.status || 'none';
        let BONUS_AMOUNT;
        let REFRESH_INTERVAL; // 獲得間隔（ミリ秒）

        // ★ 修正: Luxury会員 (5.0P / 1時間ごと) を適用
        if (MEMBER_STATUS === 'luxury') {
            BONUS_AMOUNT = 5.0;
            REFRESH_INTERVAL = 3600000; // 1時間
        } else if (MEMBER_STATUS === 'premium') {
            BONUS_AMOUNT = 15.0; 
            REFRESH_INTERVAL = 86400000; // 24時間
        } else if (MEMBER_STATUS === 'pro') {
            BONUS_AMOUNT = 10.0;
            REFRESH_INTERVAL = 86400000; // 24時間
        } else {
            showMessage(PRO_BONUS_MESSAGE, '❌ 会員特典の対象外です。', 'error');
            return;
        }

        const player = authenticatedUser.name;
        const messageEl = PRO_BONUS_MESSAGE;
        const now = new Date().toISOString();
        
        // UIのdisabledチェック (時間ルール) は updateMemberBonusDisplay() で実行済み
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
    
            // 獲得可能か再チェック（二重獲得防止）
            const lastTime = targetPlayer.lastBonusTime ? new Date(targetPlayer.lastBonusTime).getTime() : 0;
            // ★ 修正: REFRESH_INTERVALを使用
            if ((Date.now() - lastTime) < REFRESH_INTERVAL) {
                showMessage(messageEl, '❌ まだ時間が経過していません。', 'error');
                 if (PRO_BONUS_BUTTON) PRO_BONUS_BUTTON.disabled = true;
                 updateMemberBonusDisplay();
                return;
            }
    
            const newScore = targetPlayer.score + BONUS_AMOUNT;
            
            // status/lastBonusTimeフィールドも更新
            currentScoresMap.set(player, { 
                ...targetPlayer, 
                score: parseFloat(newScore.toFixed(1)),
                lastBonusTime: now // 獲得時刻を記録
            });
            
            const newScores = Array.from(currentScoresMap.values());
    
            const newData = {
                scores: newScores,
                sports_bets: currentData.sports_bets,
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || []
            };
    
            const response = await updateAllData(newData);
    
            if (response.status === 'success') {
                showMessage(messageEl, `✅ ${MEMBER_STATUS.toUpperCase()}ボーナスとして ${BONUS_AMOUNT.toFixed(1)} P を獲得しました！`, 'success');
                
                // 認証ユーザー情報を更新
                authenticatedUser.score = newScore;
                authenticatedUser.lastBonusTime = now; // メモリ上の情報も更新
                CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
                
                // ボタンの状態を更新 (時間が経過後に再度有効になるように)
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


// -----------------------------------------------------------------
// Premium会員向けスポーツくじ作成機能 (Luxury会員にも開放)
// -----------------------------------------------------------------

/**
 * 日付をフォーマットするヘルパー関数 (master.jsからコピー)
 * Dateオブジェクトを <input type="datetime-local"> 形式の文字列にフォーマット
 */
function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}


/**
 * Premium/Luxury会員向けくじ作成フォームの初期化と表示制御
 */
function initializePremiumBetCreation() {
    if (!PREMIUM_TOOLS_SECTION || !PREMIUM_CREATE_BET_FORM) return;
    
    // ★ 修正: Luxury会員にも開放
    const isPremiumOrLuxury = authenticatedUser && 
                              (authenticatedUser.status === 'premium' || authenticatedUser.status === 'luxury');

    if (isPremiumOrLuxury) {
        PREMIUM_TOOLS_SECTION.classList.remove('hidden');
        
        // デフォルトで現在時刻から1時間後に締切を設定
        const now = new Date();
        now.setHours(now.getHours() + 1);
        if (PREMIUM_DEADLINE_DATETIME_INPUT) {
            PREMIUM_DEADLINE_DATETIME_INPUT.value = formatDateTimeLocal(now);
        }
        
        // イベントリスナー設定
        PREMIUM_CREATE_BET_FORM.addEventListener('submit', handlePremiumBetCreation);
        
    } else {
        PREMIUM_TOOLS_SECTION.classList.add('hidden');
    }
}


/**
 * Premium/Luxury会員向けくじ作成フォームの送信ハンドラ
 */
async function handlePremiumBetCreation(e) {
    e.preventDefault();
    const messageEl = PREMIUM_CREATE_MESSAGE;
    const matchName = PREMIUM_MATCH_NAME_INPUT.value.trim();
    const deadline = PREMIUM_DEADLINE_DATETIME_INPUT.value; // ISO 8601形式の文字列を取得
    
    // ログイン中のユーザーを作成者として使用
    const creatorName = authenticatedUser.name; 
    
    if (!matchName || !deadline) {
        showMessage(messageEl, '❌ くじ名、締切日時をすべて入力してください。', 'error');
        return;
    }
    
    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
        showMessage(messageEl, '❌ 締切日時は現在時刻よりも後の有効な日時を選択してください。', 'error');
        return;
    }

    const submitButton = PREMIUM_CREATE_BET_FORM.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    showMessage(messageEl, 'くじを作成中...', 'info');

    try {
        const currentData = await fetchAllData();
        let allBets = currentData.sports_bets || [];
        
        // ★★★ 修正: 3件以上の記録がある場合、最も古い記録を削除 (マスターと同じロジック) ★★★
        if (allBets.length >= 3) {
            allBets.sort((a, b) => a.betId - b.betId);
            allBets.shift();
        }

        const newBetId = allBets.length > 0 ? Math.max(...allBets.map(b => b.betId)) + 1 : 1;
        
        const newBet = {
            betId: newBetId,
            matchName: matchName,
            creator: creatorName, // Premium/Luxury会員が作成者
            deadline: deadlineDate.toISOString(), 
            status: 'OPEN',
            outcome: null,
            wagers: []
        };

        allBets.push(newBet);
        currentData.sports_bets = allBets;
        
        const newData = {
            scores: currentData.scores,
            sports_bets: currentData.sports_bets,
            speedstorm_records: currentData.speedstorm_records || [],
            lotteries: currentData.lotteries || [] 
        };

        const response = await updateAllData(newData);

        if (response.status === 'success') {
            showMessage(messageEl, `✅ くじ「${matchName}」を作成しました (ID: ${newBetId})`, 'success');
            PREMIUM_CREATE_BET_FORM.reset();
            
            // フォームリセット後、締切日時を再度設定
            const now = new Date();
            now.setHours(now.getHours() + 1);
            PREMIUM_DEADLINE_DATETIME_INPUT.value = formatDateTimeLocal(now);
            
            // ユーザーが作成したくじをすぐに確認できるように、くじ購入フォームも更新
            loadBettingDataAndHistory(); 
        } else {
            showMessage(messageEl, `❌ 作成エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    } finally {
        submitButton.disabled = false;
    }
}


// -----------------------------------------------------------------
// 以降、既存の機能 (一部修正済み)
// -----------------------------------------------------------------


// --- 送金機能のロード (変更なし) ---

async function loadTransferReceiverList() {
    // RECEIVER_PLAYER_SELECT_MYPAGEがnullでないことを確認 (安全のため)
    if (!RECEIVER_PLAYER_SELECT_MYPAGE) return;
    // ★ 修正: authenticatedUser の null チェック
    if (!authenticatedUser) return;
    
    RECEIVER_PLAYER_SELECT_MYPAGE.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    
    // fetchScores()はcommon.jsから全データを取得しscoresのみを返す
    const allData = await fetchAllData(); 
    const scores = allData.scores;

    if (scores.length === 0) {
        RECEIVER_PLAYER_SELECT_MYPAGE.innerHTML = '<option value="" disabled selected>リストの取得に失敗</option>';
        return;
    }

    let options = '<option value="" disabled selected>送金先プレイヤーを選択</option>';
    const senderName = authenticatedUser.name;

    // ログイン中のプレイヤー名を除外してリストを生成
    scores.forEach(player => {
        if (player.name !== senderName) {
            options += `<option value="${player.name}">${player.name}</option>`;
        }
    });

    RECEIVER_PLAYER_SELECT_MYPAGE.innerHTML = options;
}

/**
 * 送金処理のイベントハンドラ (変更なし)
 */
// ★ 修正: nullチェック
if (TRANSFER_FORM_MYPAGE) {
    TRANSFER_FORM_MYPAGE.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // ★ 修正: authenticatedUser の null チェック
        if (!authenticatedUser) {
            showMessage(document.getElementById('transfer-message-mypage'), '❌ 認証エラーが発生しました。', 'error');
            return;
        }

        const messageEl = document.getElementById('transfer-message-mypage');
        const sender = authenticatedUser.name; // 送金元はログイン中のユーザーに固定
        const receiver = RECEIVER_PLAYER_SELECT_MYPAGE.value;
        const amount = parseFloat(document.getElementById('transfer-amount-mypage').value);
        const submitButton = TRANSFER_FORM_MYPAGE.querySelector('button[type="submit"]');
    
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
            // pass/pro/status/lastBonusTimeフィールドを保持するために、scores全体をマップとして処理
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
    
            // 送信元スコアを更新
            const newSenderScore = parseFloat((senderScore - amount).toFixed(1));
            // ★ status/lastBonusTimeを保持
            currentScoresMap.set(sender, { 
                ...senderPlayer, 
                score: newSenderScore
            });
            
            // 受信先スコアを更新
            const receiverScore = receiverPlayer.score || 0;
            const newReceiverScore = parseFloat((receiverScore + amount).toFixed(1));
            // ★ status/lastBonusTimeを保持
            currentScoresMap.set(receiver, { 
                ...receiverPlayer, 
                score: newReceiverScore
            });
            
            const newScores = Array.from(currentScoresMap.values()); // status/lastBonusTimeフィールドを保持したscores
            
            const newData = {
                scores: newScores,
                sports_bets: currentData.sports_bets, 
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [] 
            };
    
            const response = await updateAllData(newData);
    
            if (response.status === 'success') {
                showMessage(messageEl, `✅ ${receiver} へ ${amount.toFixed(1)} P の送金を完了しました。`, 'success');
                
                // UIを更新
                authenticatedUser.score = newSenderScore; // 認証ユーザーのメモリ上のスコアを更新
                CURRENT_SCORE_ELEMENT.textContent = newSenderScore.toFixed(1); // 画面上のスコアを更新
                
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
// -----------------------------------------------------------------
// マイページ送金機能 終了
// -----------------------------------------------------------------


/**
 * 賭け入力行を初期化・追加する関数 (変更なし)
 */
function initializeWagerInputs() {
    // WAGER_INPUTS_CONTAINERがnullでないことを確認 (安全のため)
    if (!WAGER_INPUTS_CONTAINER) return;

    WAGER_INPUTS_CONTAINER.innerHTML = '';
    // 最初の行をデフォルトで追加
    addWagerRow(); 
}

/**
 * 賭け内容と掛け金の入力行を追加する関数 (変更なし)
 */
function addWagerRow(item = '', amount = '') {
    // WAGER_INPUTS_CONTAINERがnullでないことを確認 (安全のため)
    if (!WAGER_INPUTS_CONTAINER) return;

    const rowCount = WAGER_INPUTS_CONTAINER.querySelectorAll('.wager-row').length + 1;
    const row = document.createElement('div');
    row.className = 'form-group wager-row';
    row.innerHTML = `
        <div style="display: flex; gap: 10px; align-items: flex-end; margin-bottom: 10px;">
            <div style="flex-grow: 1;">
                <label for="wager-item-${rowCount}">内容 (かけるもの):</label>
                <input type="text" class="wager-item-input" id="wager-item-${rowCount}" value="${item}" placeholder="例: A選手優勝 or 満貫和了" required>
            </div>
            <div style="width: 120px;">
                <label for="wager-amount-${rowCount}">掛け金 (P):</label>
                <input type="number" class="wager-amount-input" id="wager-amount-${rowCount}" value="${amount}" step="1" min="1" placeholder="例: 10" required>
            </div>
            <button type="button" class="remove-wager-row-button remove-button" style="width: auto; margin-bottom: 0;">×</button>
        </div>
    `;
    
    row.querySelector('.remove-wager-row-button').addEventListener('click', (e) => {
        // 最後の1行は削除させない
        if (WAGER_INPUTS_CONTAINER.querySelectorAll('.wager-row').length > 1) {
            e.target.closest('.wager-row').remove();
        } else {
             showMessage(document.getElementById('wager-message'), '⚠️ 少なくとも1つの賭け行が必要です。', 'info');
        }
    });

    WAGER_INPUTS_CONTAINER.appendChild(row);
}

// 賭け追加ボタンのイベントリスナー (変更なし)
if (ADD_WAGER_ROW_BUTTON) {
    ADD_WAGER_ROW_BUTTON.addEventListener('click', () => addWagerRow());
}


/**
 * 最新のくじデータと投票履歴を取得し、表示を更新する (変更なし)
 */
async function loadBettingDataAndHistory() {
    const allData = await fetchAllData();
    const allBets = allData.sports_bets || []; 
    
    updateWagerForm(allBets);
    renderWagerHistory(allBets);
}


/**
 * 投票フォームの対象くじセレクトボックスを更新する (変更なし)
 */
function updateWagerForm(allBets) {
    // TARGET_BET_SELECTがnullでないことを確認 (安全のため)
    if (!TARGET_BET_SELECT) return;

    TARGET_BET_SELECT.innerHTML = '<option value="" disabled selected>開催中のくじを選択</option>';
    
    // 開催中のくじのみを対象とする
    const openBets = allBets.filter(bet => bet.status === 'OPEN' && new Date(bet.deadline) > new Date());
    
    if (openBets.length === 0) {
        TARGET_BET_SELECT.innerHTML = '<option value="" disabled selected>現在、開催中のくじはありません</option>';
        return;
    }

    let options = '<option value="" disabled selected>開催中のくじを選択</option>';
    openBets.forEach(bet => {
        const deadline = new Date(bet.deadline);
        const formattedDeadline = deadline.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) + ' ' + 
                                  deadline.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                                  
        options += `<option value="${bet.betId}">${bet.matchName} (#${bet.betId}) - 締切: ${formattedDeadline}</option>`;
    });

    TARGET_BET_SELECT.innerHTML = options;
}


/**
 * 認証ユーザーの投票履歴を表示する (変更なし)
 */
function renderWagerHistory(allBets) {
    // WAGER_HISTORY_LISTがnullでないことを確認 (安全のため)
    if (!WAGER_HISTORY_LIST) return;
    // ★ 修正: authenticatedUser の null チェック
    if (!authenticatedUser) return;

    const player = authenticatedUser.name;
    
    // すべてのくじから、認証ユーザーの投票のみを抽出
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

    // タイムスタンプでソートし、最新5件を表示
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
                resultClass = 'status-open'; // success color
            } else if (w.isWin === false) {
                resultText = '❌ 外れ / 損失: 0 P (購入時に減算済み)';
                resultClass = 'status-settled'; // neutral color
            } else {
                 resultText = '結果未確定（くじ完了済みだが投票結果が不明）';
            }
        } else if (w.betStatus === 'CLOSED' || w.betStatus === 'OPEN') {
             resultText = '結果待ち...';
             resultClass = 'status-closed';
        }

        html += `
            <li style="border-bottom: 1px dotted #ccc; padding: 5px 0;">
                <p style="margin: 0; font-size: 0.9em; color: #6c757d;">${timestamp} - くじ #${w.betId}: ${w.matchName}</p>
                <p style="margin: 2px 0 0 0;">
                    ${w.amount} P を <strong>「${w.item}」</strong> に投票
                </p>
                <p style="margin: 2px 0 0 10px; font-weight: bold;" class="${resultClass}">${resultText}</p>
            </li>
        `;
    });

    WAGER_HISTORY_LIST.innerHTML = html;
}


// --- イベントハンドラ: 投票（くじ購入） (変更なし) ---

if (WAGER_FORM) {
    WAGER_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // ★ 修正: authenticatedUser の null チェック
        if (!authenticatedUser) {
            showMessage(document.getElementById('wager-message'), '❌ 認証エラーが発生しました。', 'error');
            return;
        }

        const messageEl = document.getElementById('wager-message');
        const betId = parseInt(TARGET_BET_SELECT.value);
        const player = authenticatedUser.name; 
        
        // 1. フォームから有効な賭けのリストを収集 (変更なし)
        const wagersToSubmit = [];
        let totalWagerAmount = 0;
        let allValid = true;
        let hasAtLeastOneValid = false;
        
        if (WAGER_INPUTS_CONTAINER) {
            WAGER_INPUTS_CONTAINER.querySelectorAll('.wager-row').forEach(row => {
                const itemInput = row.querySelector('.wager-item-input').value.trim();
                const amountInput = parseFloat(row.querySelector('.wager-amount-input').value);
                
                // itemとamountが両方入力されているかチェック
                if (itemInput && !isNaN(amountInput) && amountInput >= 1) {
                    wagersToSubmit.push({
                        item: itemInput,
                        amount: amountInput,
                        // 新しいwagersには以下のフィールドを追加:
                        player: player,
                        timestamp: new Date().toISOString(),
                        isWin: null, // 結果確定前はnull
                        appliedOdds: null // 結果確定前はnull
                    });
                    totalWagerAmount += amountInput;
                    hasAtLeastOneValid = true;
                } else if (itemInput || !isNaN(amountInput)) {
                    // 一部でも入力されているが、有効な組み合わせではない場合はエラー
                    allValid = false;
                }
            });
        }

        if (!betId || !allValid || !hasAtLeastOneValid) {
            showMessage(messageEl, '❌ 対象くじを選択し、少なくとも一つの有効な「かけるもの」と「掛け金 (1P以上)」を入力してください。', 'error');
            return;
        }

        const submitButton = WAGER_FORM.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        showMessage(messageEl, `投票 (${totalWagerAmount} P) を処理中...`, 'info');
        
        try {
            // 2. 最新の全データを取得し、残高チェックを厳密に行う
            const currentData = await fetchAllData();
            const allBets = currentData.sports_bets || [];
            const betIndex = allBets.findIndex(b => b.betId === betId);
            
            // scoresから認証ユーザーの最新スコアを取得
            // ★ scores全体をマップとして取得し、更新後のscores配列を再構築するロジックに変更
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            let targetPlayer = currentScoresMap.get(player);
            
            // ★ status/pass/lastBonusTimeフィールドのチェックを追加
            if (!targetPlayer || typeof targetPlayer.pass === 'undefined' || typeof targetPlayer.status === 'undefined') {
                 showMessage(messageEl, '❌ 認証ユーザーのデータにパスワード情報または会員ステータス情報が不足しています。', 'error');
                 return;
            }

            // 認証時のスコアではなく、最新のスコアで残高チェック
            if (targetPlayer.score < totalWagerAmount) {
                showMessage(messageEl, `❌ ポイント残高 (${targetPlayer.score.toFixed(1)} P) が不足しているため、合計 ${totalWagerAmount} Pの投票はできません。`, 'error');
                return;
            }

            const currentBet = allBets[betIndex];

            // 締切時刻を過ぎていないかチェック
            if (betIndex === -1 || currentBet.status !== 'OPEN' || new Date(currentBet.deadline) <= new Date()) {
                showMessage(messageEl, '❌ 開催中のくじではありません（締切済みの可能性があります）。', 'error');
                return;
            }

            // 3. スコアから合計ポイントを減算
            const newScore = parseFloat((targetPlayer.score - totalWagerAmount).toFixed(1));

            // ★ status/lastBonusTimeフィールドを保持したままscoreを更新
            currentScoresMap.set(player, { 
                ...targetPlayer, 
                score: newScore
            });


            // 4. 投票情報を既存のwagers配列に追加 (変更なし)
            currentBet.wagers.push(...wagersToSubmit);
            
            // 5. 更新された全データを保存
            currentData.sports_bets = allBets;
            currentData.scores = Array.from(currentScoresMap.values()); // status/lastBonusTimeフィールドを保持したscores

            const newData = {
                scores: currentData.scores,
                sports_bets: currentData.sports_bets,
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [] // ★ 宝くじデータを保持
            };

            const response = await updateAllData(newData);
            if (response.status === 'success') {
                showMessage(messageEl, `✅ ${player}様の ${totalWagerAmount} P の投票 (${wagersToSubmit.length}件) を登録し、ポイントを減算しました。`, 'success');
                WAGER_FORM.reset();
                
                // 6. 認証ユーザー情報を更新し、画面を再表示
                authenticatedUser.score = newScore; // 認証ユーザーのメモリ上のスコアを更新
                CURRENT_SCORE_ELEMENT.textContent = authenticatedUser.score.toFixed(1); // 画面上のスコアを更新
                
                // 投票履歴とくじリストを再ロード
                loadBettingDataAndHistory(); 
                initializeWagerInputs(); // フォームを初期状態に戻す
                
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
// ★★★ 宝くじ購入・結果確認機能 (Luxury 20%割引対応 & データ集約化) ★★★
// -----------------------------------------------------------------

/**
 * 宝くじ購入フォームの初期化 (価格連動)
 */
function initializeLotteryPurchaseForm() {
    if (!LOTTERY_SELECT || !LOTTERY_TICKET_COUNT || !LOTTERY_TOTAL_PRICE_DISPLAY) return;

    // ★ 追加: 購入枚数の上限（もしHTMLで設定されていれば）を撤廃
    LOTTERY_TICKET_COUNT.removeAttribute('max');

    // ★ Luxury会員の割引率を定義
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
                
                // 小数点第一位で四捨五入 (JavaScriptのtoPrecision(2)は使わず、toFixed(1)で表示/計算)
                const finalPrice = parseFloat(discountedPrice.toFixed(1)); 

                if (DISCOUNT_RATE < 1.0) {
                    discountText = `(Luxury特典: ${originalPrice.toFixed(1)} P → ${finalPrice.toFixed(1)} P)`;
                    LOTTERY_TOTAL_PRICE_DISPLAY.innerHTML = `合計: <strong style="color: #28a745;">${finalPrice.toFixed(1)} P</strong> ${discountText}`;
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
    
    // 初期化
    updatePrice();
}

/**
 * 宝くじのデータをロードし、購入フォームと結果表示を更新
 */
async function loadLotteryData() {
    if (!authenticatedUser) return;
    if (!LOTTERY_SELECT || !LOTTERY_RESULTS_CONTAINER) return;

    // 初期化
    LOTTERY_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    LOTTERY_RESULTS_CONTAINER.innerHTML = '<p>購入履歴をロード中...</p>';
    availableLotteries = [];
    
    const allData = await fetchAllData();
    const allLotteries = allData.lotteries || [];
    const now = new Date();
    
    // 1. 購入フォームのセレクトボックスを生成
    const openLotteries = allLotteries.filter(l => 
        l.status === 'OPEN' && new Date(l.purchaseDeadline) > now
    );

    if (openLotteries.length === 0) {
        LOTTERY_SELECT.innerHTML = '<option value="" disabled>現在購入可能な宝くじはありません</option>';
    } else {
        let options = '<option value="" disabled selected>購入する宝くじを選択</option>';
        openLotteries.forEach(l => {
            const deadline = new Date(l.purchaseDeadline).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            options += `<option value="${l.lotteryId}">${l.name} (${l.ticketPrice} P/枚) - 締切: ${deadline}</option>`;
        });
        LOTTERY_SELECT.innerHTML = options;
        availableLotteries = openLotteries; // 価格計算用に保持
    }
    
    // 2. 結果発表セクションを生成
    const myPlayerName = authenticatedUser.name;
    // プレイヤーが購入したチケットが含まれる宝くじのみをフィルタリング
    const myLotteries = allLotteries.filter(l => 
        l.tickets.some(t => t.player === myPlayerName)
    );

    if (myLotteries.length === 0) {
        LOTTERY_RESULTS_CONTAINER.innerHTML = '<p>宝くじの購入履歴はありません。</p>';
    } else {
        let html = '';
        myLotteries.sort((a, b) => new Date(b.resultAnnounceDate) - new Date(a.resultAnnounceDate)); // 新しい順

        myLotteries.forEach(l => {
            // ログイン中のプレイヤーのチケット（集約型）のみをフィルタリング
            const myTickets = l.tickets.filter(t => t.player === myPlayerName);
            const resultAnnounceDate = new Date(l.resultAnnounceDate);
            
            // ★★★ 修正: チケットの合計枚数を計算 (集約型データに対応) ★★★
            const totalTicketsCount = myTickets.reduce((sum, t) => sum + t.count, 0);
            
            let statusHtml = '';
            
            if (resultAnnounceDate > now) {
                // 結果発表前
                statusHtml = `<p class="status-label status-closed">結果発表待ち (発表日時: ${resultAnnounceDate.toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })})</p>`;
            } else {
                // 結果発表後
                // 未請求のチケット総枚数を計算 (isClaimed: false のチケットの count の合計)
                const unclaimedTicketsCount = myTickets.filter(t => !t.isClaimed).reduce((sum, t) => sum + t.count, 0);
                
                // ★★★ 修正: 結果確認済みの内訳表示ロジック (集約型データに対応) ★★★
                const claimedTickets = myTickets.filter(t => t.isClaimed);
                let winnings = 0;
                let prizeSummary = '';
                
                if (claimedTickets.length > 0) {
                    const winCounts = claimedTickets.reduce((counts, t) => {
                        // isClaimed=true のチケットは、prizeRankとprizeAmountが最終確定した状態
                        if (t.prizeRank !== null) { // 当選チケットのみ（ハズレはランクがnull）
                            const rank = t.prizeRank;
                            counts[rank] = (counts[rank] || { count: 0, amount: 0 });
                            counts[rank].count += t.count;
                            counts[rank].amount += t.prizeAmount * t.count; // 単価*枚数
                            winnings += t.prizeAmount * t.count;
                        } else {
                            // ハズレチケットも集計（合計枚数算出用）
                             counts['ハズレ'] = (counts['ハズレ'] || { count: 0, amount: 0 });
                             counts['ハズレ'].count += t.count;
                        }
                        return counts;
                    }, {});

                    // 当選ランクのみを抽出してソート
                    const ranks = Object.keys(winCounts).filter(r => r !== 'ハズレ').sort((a, b) => parseInt(a) - parseInt(b));
                    
                    if (winnings > 0) {
                        prizeSummary = ranks.map(rank => {
                            const rankName = `${rank}等`;
                            return `${rankName}: ${winCounts[rank].count}枚`;
                        }).join(', ');
                        
                        prizeSummary = `<p style="font-size: 0.9em; margin: 5px 0 0 0; font-weight: bold; color: #38c172;">内訳: ${prizeSummary}</p>`;

                    } else {
                        prizeSummary = `<p style="font-size: 0.9em; margin: 5px 0 0 0; color: #dc3545;">当選はありませんでした。</p>`;
                    }
                }
                
                if (unclaimedTicketsCount > 0) {
                    // 未請求チケットがある
                    statusHtml = `
                        <button class="action-button check-lottery-result" data-lottery-id="${l.lotteryId}" style="width: auto; background-color: #28a745;">
                            結果を見る (${unclaimedTicketsCount}枚 未確認)
                        </button>
                        ${prizeSummary}
                    `;
                } else {
                    // 結果確認済み
                    if (winnings > 0) {
                        statusHtml = `<p class="status-label status-open">✅ 結果確認済み (合計当選: ${winnings.toFixed(1)} P)</p>`;
                    } else {
                        statusHtml = `<p class="status-label status-settled">❌ 結果確認済み</p>`;
                    }
                    statusHtml += prizeSummary;
                }
            }
            // ★★★ 修正ここまで ★★★

            html += `
                <div class="bet-card" style="margin-bottom: 10px;">
                    <h4>${l.name} (#${l.lotteryId})</h4>
                    <p>購入枚数: ${totalTicketsCount} 枚</p>
                    ${statusHtml}
                    <p id="lottery-result-message-${l.lotteryId}" class="hidden"></p>
                </div>
            `;
        });
        LOTTERY_RESULTS_CONTAINER.innerHTML = html;
        
        // 3. イベントリスナーを動的に追加
        LOTTERY_RESULTS_CONTAINER.querySelectorAll('.check-lottery-result').forEach(button => {
            button.addEventListener('click', handleCheckLotteryResult);
        });
    }
}

/**
 * 宝くじ購入フォームの送信ハンドラ
 */
if (LOTTERY_PURCHASE_FORM) {
    LOTTERY_PURCHASE_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!authenticatedUser) {
            showMessage(LOTTERY_PURCHASE_MESSAGE, '❌ 認証エラーが発生しました。', 'error');
            return;
        }

        const lotteryId = parseInt(LOTTERY_SELECT.value);
        const count = parseInt(LOTTERY_TICKET_COUNT.value);
        const submitButton = LOTTERY_PURCHASE_FORM.querySelector('button[type="submit"]');

        if (!lotteryId || !count || count <= 0) {
            showMessage(LOTTERY_PURCHASE_MESSAGE, '❌ 宝くじを選択し、1枚以上の購入枚数を入力してください。', 'error');
            return;
        }

        const lottery = availableLotteries.find(l => l.lotteryId === lotteryId);
        if (!lottery) {
            showMessage(LOTTERY_PURCHASE_MESSAGE, '❌ 選択された宝くじ情報が見つかりません。', 'error');
            return;
        }

        // ★★★ 修正: Luxury会員の割引を適用 ★★★
        const DISCOUNT_RATE = authenticatedUser.status === 'luxury' ? 0.8 : 1.0;
        const originalPrice = lottery.ticketPrice * count;
        const discountedPrice = originalPrice * DISCOUNT_RATE;
        // 最終的な価格を小数点第一位に丸める
        const finalPrice = parseFloat(discountedPrice.toFixed(1)); 
        // ★★★ 修正ここまで ★★★
        
        if (authenticatedUser.score < finalPrice) {
            showMessage(LOTTERY_PURCHASE_MESSAGE, `❌ ポイント残高 (${authenticatedUser.score.toFixed(1)} P) が不足しています (必要: ${finalPrice.toFixed(1)} P)。`, 'error');
            return;
        }

        submitButton.disabled = true;
        showMessage(LOTTERY_PURCHASE_MESSAGE, `${count}枚 (${finalPrice.toFixed(1)} P) の宝くじを購入し、抽選処理中...`, 'info');

        try {
            const currentData = await fetchAllData();
            
            // 1. スコアマップと宝くじデータを取得
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            let allLotteries = currentData.lotteries || [];
            
            // 2. 最新の残高を再チェック
            let targetPlayer = currentScoresMap.get(authenticatedUser.name);
            // ★ status/pass/lastBonusTimeフィールドのチェックを追加
            if (!targetPlayer || targetPlayer.score < finalPrice || typeof targetPlayer.status === 'undefined') {
                showMessage(LOTTERY_PURCHASE_MESSAGE, `❌ 最新のポイント残高 (${targetPlayer.score.toFixed(1)} P) が不足しているか、ユーザーデータが不完全です。`, 'error');
                submitButton.disabled = false;
                return;
            }

            // 3. 宝くじデータを取得
            const targetLotteryIndex = allLotteries.findIndex(l => l.lotteryId === lotteryId);
            if (targetLotteryIndex === -1 || allLotteries[targetLotteryIndex].status !== 'OPEN' || new Date(allLotteries[targetLotteryIndex].purchaseDeadline) <= new Date()) {
                showMessage(LOTTERY_PURCHASE_MESSAGE, '❌ この宝くじは購入可能ではありません (締切済みの可能性があります)。', 'error');
                submitButton.disabled = false;
                await loadLotteryData(); // フォームをリフレッシュ
                return;
            }
            
            const targetLottery = allLotteries[targetLotteryIndex];
            
            // ★★★ 修正: 抽選と集約化 ★★★
            
            // 抽選結果をランクごとに集計 { rank: { count: number, amount: number } }
            const drawResultsMap = {}; 
            let totalWinningsForLog = 0; 
            let winCount = 0; 

            for (let i = 0; i < count; i++) {
                const drawResult = performLotteryDraw(targetLottery.prizes);
                // null (ハズレ) は 'ハズレ' キーとして集計
                const rankKey = drawResult.prizeRank === null ? 'ハズレ' : drawResult.prizeRank.toString();
                
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
            
            // 集計された結果をチケットとして配列に追加
            Object.keys(drawResultsMap).forEach(rankKey => {
                const isWinner = rankKey !== 'ハズレ';
                const prizeRank = isWinner ? parseInt(rankKey) : null;
                const prizeAmount = drawResultsMap[rankKey].amount; // 1枚あたりの金額
                const ticketCount = drawResultsMap[rankKey].count;
                
                // ★ チケット集約型構造
                const newTicket = {
                    // ★ ticketIdは集約されたチケットのユニークIDとして付与（プレイヤー、ランク、購入日でユニーク）
                    ticketId: `tkt-${authenticatedUser.name}-${lotteryId}-${rankKey}-${purchaseDate}`,
                    player: authenticatedUser.name,
                    purchaseDate: purchaseDate, // 集約されたチケットの購入日は共通
                    prizeRank: prizeRank,
                    prizeAmount: prizeAmount, // 1枚あたりの金額 (当選時は当選額、ハズレ時は0)
                    count: ticketCount, // 購入枚数
                    isClaimed: false // 結果確認前
                };
                
                newTickets.push(newTicket);
            });
            // ★★★ 修正ここまで ★★★

            
            // 5. プレイヤーのスコアを減算 (割引後の最終価格を使用)
            const newScore = parseFloat((targetPlayer.score - finalPrice).toFixed(1));

            // ★ status/lastBonusTimeフィールドを保持したままscoreを更新
            currentScoresMap.set(authenticatedUser.name, { 
                ...targetPlayer, 
                score: newScore
            });


            // 6. 宝くじデータにチケットを追加
            targetLottery.tickets.push(...newTickets);
            allLotteries[targetLotteryIndex] = targetLottery;

            // 7. 全データを更新
            const newData = {
                scores: Array.from(currentScoresMap.values()),
                sports_bets: currentData.sports_bets, 
                speedstorm_records: currentData.speedstorm_records,
                lotteries: allLotteries
            };

            const response = await updateAllData(newData);
            
            if (response.status === 'success') {
                showMessage(LOTTERY_PURCHASE_MESSAGE, `✅ ${count}枚の購入が完了しました (ポイント ${finalPrice.toFixed(1)} P 減算)。${DISCOUNT_RATE < 1.0 ? ' Luxury割引が適用されました！' : ''}`, 'success');
                
                // (デバッグ/ログ用: 本来ユーザーには見せないが、B案ではここで結果がわかる)
                console.log(`[抽選結果] ${winCount}枚当選 / 合計 ${totalWinningsForLog} P`);
                
                // 認証ユーザー情報を更新
                authenticatedUser.score = newScore;
                CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
                
                // フォームリセットとUI更新
                LOTTERY_PURCHASE_FORM.reset();
                LOTTERY_TOTAL_PRICE_DISPLAY.textContent = '合計: - P';
                await loadLotteryData(); // 結果発表欄を更新

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

/**
 * 宝くじの抽選を実行する (B案)
 * @param {Array} prizes - 当選設定 (例: [{rank: 1, amount: 100, prob: 0.01}, ...])
 * @returns {object} - { prizeRank: (1-5 or null), prizeAmount: (金額 or 0), isWinner: (boolean) }
 */
function performLotteryDraw(prizes) {
    const randomValue = Math.random(); // 0.0 ... 0.999...
    let cumulativeProbability = 0;

    // 確率計算のため、ランク順 (1, 2, 3...) でソートされている前提
    // (master.jsでソート済み)
    for (const prize of prizes) {
        cumulativeProbability += prize.probability;
        
        if (randomValue < cumulativeProbability) {
            // 当選！
            return { prizeRank: prize.rank, prizeAmount: prize.amount, isWinner: true };
        }
    }

    // ハズレ
    return { prizeRank: null, prizeAmount: 0, isWinner: false };
}


/**
 * 宝くじの「結果を見る」ボタンのハンドラ
 */
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
        let ticketCount = 0; // 未確認チケットの総枚数
        
        // ★★★ 修正: 当選ランクごとの枚数を集計するためのオブジェクト ★★★
        const winRankCounts = {};
        
        // プレイヤーの未請求チケット（集約型）を処理
        lottery.tickets.forEach(ticket => {
            if (ticket.player === player && !ticket.isClaimed) {
                
                // チケットの枚数を加算
                ticketCount += ticket.count; 
                
                // 当選チケットの場合のみ集計と獲得額の計算
                if (ticket.prizeRank !== null && ticket.prizeAmount > 0) {
                    const winningsThisTicket = ticket.prizeAmount * ticket.count;
                    totalWinnings += winningsThisTicket;
                    winCount += ticket.count; // 当選枚数を加算
                    
                    // 当選ランクごとの枚数を集計
                    const rank = ticket.prizeRank;
                    winRankCounts[rank] = (winRankCounts[rank] || 0) + ticket.count;
                } else {
                    // ハズレチケットも合計枚数に含める
                    const rank = 'ハズレ';
                    winRankCounts[rank] = (winRankCounts[rank] || 0) + ticket.count;
                }
                
                // 確認したら請求済みにする (集約型エントリ全体を更新)
                ticket.isClaimed = true;
            }
        });

        if (ticketCount === 0) {
            showMessage(messageEl, '✅ 既に確認済みです (新たに確認したチケットはありません)。', 'info');
            button.style.display = 'none'; // ボタンを隠す (loadLotteryDataの再実行でも隠れる)
            await loadLotteryData(); // UIを最新化
            return;
        }

        let playerUpdated = false;
        
        // 当選金があればスコアに反映
        if (totalWinnings > 0) {
            let targetPlayer = currentScoresMap.get(player);
            if (targetPlayer) {
                const newScore = parseFloat((targetPlayer.score + totalWinnings).toFixed(1));
                // ★ status/lastBonusTimeを保持
                currentScoresMap.set(player, { 
                    ...targetPlayer, 
                    score: newScore
                });
                playerUpdated = true;
                
                // 認証ユーザー情報も更新
                authenticatedUser.score = newScore;
                CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
            }
        }
        
        // データを更新
        allLotteries[targetLotteryIndex] = lottery;
        
        const newData = {
            scores: Array.from(currentScoresMap.values()),
            sports_bets: currentData.sports_bets, 
            speedstorm_records: currentData.speedstorm_records,
            lotteries: allLotteries
        };
        
        const response = await updateAllData(newData);
        
        if (response.status === 'success') {
            
            let resultMessage = `✅ 結果: ${ticketCount}枚のチケットを確認しました。`;

            if (totalWinnings > 0) {
                // 当選の内訳を文字列化
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
            
            // UIを最新化 (ボタンが消え、確認済みテキストが表示される)
            await loadLotteryData();
            
        } else {
             showMessage(messageEl, `❌ 結果確認エラー: ${response.message}`, 'error');
             button.disabled = false;
             // 失敗した場合は isClaimed を元に戻す (簡易的にリロードを促す)
             // (ただし、スコアが加算されてしまった場合はデータ不整合が起きるため、ここではUIのリフレッシュのみ)
             await loadLotteryData();
        }

    } catch (error) {
        console.error("宝くじ結果確認中にエラー:", error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
        button.disabled = false;
    }
}


// -----------------------------------------------------------------
// ★★★ ページロード時の処理に autoLogin を追加 ★★★
// -----------------------------------------------------------------

// まず自動ログインを試み、失敗した場合（認証情報がない/古い場合）はログイン画面が表示されたままになる
window.onload = autoLogin;
