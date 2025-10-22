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

// ★★★ Proボーナス関連の要素
const PRO_BONUS_TOOL = document.getElementById('pro-bonus-tool');
const PRO_BONUS_BUTTON = document.getElementById('pro-bonus-button');
const PRO_BONUS_MESSAGE = document.getElementById('pro-bonus-message');

// ★★★ 新規追加: 送金関連の要素 ★★★
const TRANSFER_FORM_MYPAGE = document.getElementById('transfer-form-mypage');
const RECEIVER_PLAYER_SELECT_MYPAGE = document.getElementById('receiver-player-mypage');
const AUTHENTICATED_USER_TRANSFER = document.getElementById('authenticated-user-transfer');

// 認証されたユーザー情報 ({name: '...', score: ..., pass: '...', pro: ...})
let authenticatedUser = null; 

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
    const user = scores.find(p => p.name === username && p.pass === password);

    if (user) {
        authenticatedUser = user; 
        
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

    // 5. Proボーナス機能の初期化
    initializeProBonusFeature(); 
    
    // 6. ★★★ 送金機能の初期化 ★★★
    loadTransferReceiverList(); 
}


// --- ダークモード機能の初期化 (変更なし) ---
/**
 * ダークモード機能の初期化
 * proステータスを確認し、ボタンの表示を制御する
 */
function initializeDarkModeFeature() {
    // authenticatedUser.pro が存在しない場合や false の場合は pro ではないと見なす
    const isPro = authenticatedUser.pro === true;
    const isDarkModeEnabled = localStorage.getItem('darkMode') === 'enabled';
    
    // proプレイヤーでない場合、ボタンを無効化・スタイル変更し、理由を表示する
    if (!isPro) {
        DARK_MODE_TOGGLE_BUTTON.disabled = true;
        DARK_MODE_TOGGLE_BUTTON.textContent = 'Proプレイヤー限定機能';
        DARK_MODE_STATUS.innerHTML = '<span style="color: #dc3545; font-weight: bold;">⚠️ ダークモードはProプレイヤー限定機能です。</span>';
    } else {
        // Proプレイヤーの場合
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
    if (isEnabled) {
        DARK_MODE_STATUS.innerHTML = 'ステータス: <strong style="color: #28a745;">有効です 🟢</strong> (Pro特典)';
        DARK_MODE_TOGGLE_BUTTON.textContent = 'ライトモードに戻す';
    } else {
        DARK_MODE_STATUS.innerHTML = 'ステータス: <strong style="color: #dc3545;">無効です ⚪</strong> (Pro特典)';
        DARK_MODE_TOGGLE_BUTTON.textContent = 'ダークモードに切り替える';
    }
}


/**
 * ダークモード切り替えボタンのイベントリスナー (変更なし)
 */
DARK_MODE_TOGGLE_BUTTON.addEventListener('click', () => {
    const isPro = authenticatedUser.pro === true;
    
    if (!isPro) {
        // Proチェックはボタンの disabled で行っているが、念のため二重チェック
        showMessage(DARK_MODE_MESSAGE, '❌ この機能はProプレイヤー専用です。', 'error');
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


// -----------------------------------------------------------------
// ★★★ Proボーナス機能 (制限解除＆0.1Pに変更) ★★★
// -----------------------------------------------------------------

/**
 * Proボーナス機能の初期化
 * Proプレイヤーであるかチェックし、ボタンの表示/有効性を制御
 */
function initializeProBonusFeature() {
    const isPro = authenticatedUser.pro === true;
    
    if (isPro) {
        PRO_BONUS_TOOL.classList.remove('hidden');
        // ★ 変更: 1日1回のチェックロジックを削除し、常に有効状態にする表示に更新
        updateProBonusDisplay(); 
    } else {
        PRO_BONUS_TOOL.classList.add('hidden');
    }
}

/**
 * Proボーナスボタンの状態をチェックし、表示を更新する (制限を撤廃し、常時有効化)
 */
function updateProBonusDisplay() {
    // ★ 変更: 1日1回のチェックロジックを完全に削除
    
    PRO_BONUS_BUTTON.disabled = false;
    PRO_BONUS_BUTTON.textContent = 'ボーナス (+0.1 P) を受け取る'; // ★ 0.1 P に変更
    document.getElementById('pro-bonus-instruction').innerHTML = 'Proプレイヤー特典: 何度でもボーナスポイントを獲得できます (0.1 P)。'; // ★ 0.1 P と「何度でも」に変更
    PRO_BONUS_MESSAGE.classList.add('hidden');
}

/**
 * Proボーナスポイントを付与する処理
 */
PRO_BONUS_BUTTON.addEventListener('click', async () => {
    // ★ 変更: 0.1 P に変更
    const BONUS_AMOUNT = 0.1; 
    const player = authenticatedUser.name;
    const messageEl = PRO_BONUS_MESSAGE;
    
    // 二重チェック
    if (!authenticatedUser.pro) {
        showMessage(messageEl, '❌ Proプレイヤーではありません。', 'error');
        return;
    }
    
    // ★ 削除: 1日1回の制限チェックロジックを削除

    PRO_BONUS_BUTTON.disabled = true;
    showMessage(messageEl, 'ポイントを付与中...', 'info');

    try {
        const currentData = await fetchAllData();
        // pass/proフィールドを保持するために、scores全体をマップとして処理
        let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
        
        const targetPlayer = currentScoresMap.get(player);
        
        if (!targetPlayer) {
            showMessage(messageEl, `❌ プレイヤー ${player} が見つかりません。`, 'error');
            PRO_BONUS_BUTTON.disabled = false;
            return;
        }
        
        const newScore = targetPlayer.score + BONUS_AMOUNT;
        
        // pass/proフィールドを保持したままscoreを更新
        currentScoresMap.set(player, { 
            ...targetPlayer, 
            score: parseFloat(newScore.toFixed(1)) 
        });
        
        const historyEntry = {
            timestamp: new Date().toISOString(),
            ranks: ['PRO_BONUS'],
            // ★ 変更: BONUS_AMOUNTは0.1P
            changes: [{name: player, change: BONUS_AMOUNT}], 
            // ★ 変更: メッセージを0.1 P に変更
            memo: `[Proボーナス] ${player} に ボーナスとして ${BONUS_AMOUNT.toFixed(1)} P を付与。`, 
            gameId: `PRO-BONUS-${Date.now()}`
        };

        const newScores = Array.from(currentScoresMap.values()); // pass/proフィールドを保持したscores
        const newHistory = [...currentData.history, historyEntry];

        const newData = {
            scores: newScores,
            history: newHistory,
            sports_bets: currentData.sports_bets,
            speedstorm_records: currentData.speedstorm_records || []
        };

        const response = await updateAllData(newData);

        if (response.status === 'success') {
            // ★ 変更: メッセージを0.1 P に変更
            showMessage(messageEl, `✅ Proボーナスとして ${BONUS_AMOUNT.toFixed(1)} P を獲得しました！`, 'success');
            
            // ★ 削除: ローカルストレージへの記録ロジックを削除 (1日1回制限用のため)
            
            authenticatedUser.score = newScore;
            CURRENT_SCORE_ELEMENT.textContent = newScore.toFixed(1);
            
            // ★ 変更: ボタンの状態を更新 (常時有効)
            updateProBonusDisplay(); 
            
        } else {
            showMessage(messageEl, `❌ ボーナス付与エラー: ${response.message}`, 'error');
            PRO_BONUS_BUTTON.disabled = false;
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
        PRO_BONUS_BUTTON.disabled = false;
    }
});


// -----------------------------------------------------------------
// ★★★ 新規追加: マイページ送金機能 ★★★
// -----------------------------------------------------------------

/**
 * 送金先プレイヤーリストのロード
 */
async function loadTransferReceiverList() {
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
 * 送金処理のイベントハンドラ
 */
TRANSFER_FORM_MYPAGE.addEventListener('submit', async (e) => {
    e.preventDefault();
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
        // pass/proフィールドを保持するために、scores全体をマップとして処理
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
        currentScoresMap.set(sender, { 
            ...senderPlayer, 
            score: newSenderScore
        });
        
        // 受信先スコアを更新
        const receiverScore = receiverPlayer.score || 0;
        const newReceiverScore = parseFloat((receiverScore + amount).toFixed(1));
        currentScoresMap.set(receiver, { 
            ...receiverPlayer, 
            score: newReceiverScore
        });
        

        const historyEntry = {
            timestamp: new Date().toISOString(),
            ranks: ['TRANSFER'],
            changes: [
                {name: sender, change: -amount},
                {name: receiver, change: amount}
            ],
            memo: `[送金] ${sender} から ${receiver} へ ${amount.toFixed(1)} P の送金を実行。(マイページ)`,
            gameId: `TRANSFER-MYPAGE-${Date.now()}`
        };

        const newScores = Array.from(currentScoresMap.values()); // pass/proフィールドを保持したscores
        const newHistory = [...currentData.history, historyEntry];
        
        const newData = {
            scores: newScores,
            history: newHistory,
            sports_bets: currentData.sports_bets, 
            speedstorm_records: currentData.speedstorm_records || []
        };

        const response = await updateAllData(newData);

        if (response.status === 'success') {
            showMessage(messageEl, `✅ ${receiver} へ ${amount.toFixed(1)} P の送金を完了しました。`, 'success');
            
            // UIを更新
            authenticatedUser.score = newSenderScore; // 認証ユーザーのメモリ上のスコアを更新
            CURRENT_SCORE_ELEMENT.textContent = newSenderScore.toFixed(1); // 画面上のスコアを更新
            
            TRANSFER_FORM_MYPAGE.reset();
            loadTransferReceiverList(); // リストを再ロードして最新の状態を反映
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
// -----------------------------------------------------------------
// マイページ送金機能 終了
// -----------------------------------------------------------------


/**
 * 賭け入力行を初期化・追加する関数
 */
function initializeWagerInputs() {
    WAGER_INPUTS_CONTAINER.innerHTML = '';
    // 最初の行をデフォルトで追加
    addWagerRow(); 
}

/**
 * 賭け内容と掛け金の入力行を追加する関数
 */
function addWagerRow(item = '', amount = '') {
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
ADD_WAGER_ROW_BUTTON.addEventListener('click', () => addWagerRow());


/**
 * 最新のくじデータと投票履歴を取得し、表示を更新する
 */
async function loadBettingDataAndHistory() {
    const allData = await fetchAllData();
    const allBets = allData.sports_bets || []; 
    
    updateWagerForm(allBets);
    renderWagerHistory(allBets);
}


/**
 * 投票フォームの対象くじセレクトボックスを更新する
 */
function updateWagerForm(allBets) {
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
 * 認証ユーザーの投票履歴を表示する (新しいデータ構造に対応して修正)
 */
function renderWagerHistory(allBets) {
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

WAGER_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('wager-message');
    const betId = parseInt(TARGET_BET_SELECT.value);
    const player = authenticatedUser.name; 
    
    // 1. フォームから有効な賭けのリストを収集 (変更なし)
    const wagersToSubmit = [];
    let totalWagerAmount = 0;
    let allValid = true;
    let hasAtLeastOneValid = false;
    
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
        let targetPlayer = currentData.scores.find(p => p.name === player);
        
        // ★ pass/proフィールドのチェックを追加
        if (!targetPlayer || typeof targetPlayer.pass === 'undefined' || typeof targetPlayer.pro === 'undefined') {
             showMessage(messageEl, '❌ 認証ユーザーのデータにパスワード情報またはプロ情報が不足しています。', 'error');
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
        targetPlayer.score = parseFloat((targetPlayer.score - totalWagerAmount).toFixed(1));

        // 4. 投票情報を既存のwagers配列に追加 (変更なし)
        currentBet.wagers.push(...wagersToSubmit);
        
        // 5. 履歴エントリーを作成 (変更なし)
        const historyEntry = {
            timestamp: new Date().toISOString(),
            ranks: ['WAGER'],
            changes: [{name: player, change: -totalWagerAmount}],
            memo: `[くじ投票] ${player}がくじ#${betId} (${currentBet.matchName})に ${totalWagerAmount} Pを投票(内訳: ${wagersToSubmit.length}件)。`,
            gameId: `WAGER-${betId}-${Date.now()}`
        };
        currentData.history.push(historyEntry);

        // 6. 更新された全データを保存
        currentData.sports_bets = allBets;
        // ★ scoresの更新時に、targetPlayerの全てのプロパティ（pass, proを含む）が引き継がれていることを確認
        currentData.scores = currentData.scores.map(p => p.name === player ? targetPlayer : p); 

        const response = await updateAllData(currentData);
        if (response.status === 'success') {
            showMessage(messageEl, `✅ ${player}様の ${totalWagerAmount} P の投票 (${wagersToSubmit.length}件) を登録し、ポイントを減算しました。`, 'success');
            WAGER_FORM.reset();
            
            // 7. 認証ユーザー情報を更新し、画面を再表示
            authenticatedUser.score = targetPlayer.score; // 認証ユーザーのメモリ上のスコアを更新
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


// -----------------------------------------------------------------
// ★★★ ページロード時の処理に autoLogin を追加 ★★★
// -----------------------------------------------------------------

// まず自動ログインを試み、失敗した場合（認証情報がない/古い場合）はログイン画面が表示されたままになる
window.onload = autoLogin;
