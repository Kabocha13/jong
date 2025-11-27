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
 * ★ 新規追加: パスワードをSHA-256でハッシュ化する関数
 */
async function hashPassword(password) {
    if (!crypto.subtle) {
         console.warn("Web Crypto API is not available.");
         return password; 
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // ハッシュバッファを16進数文字列に変換
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

/**
 * ログイン処理本体
 * @param {string} username - ユーザー名
 * @param {string} password - パスワード (プレーンテキスト)
 * @param {boolean} isAuto - 自動ログインかどうか
 * @returns {Promise<boolean>} ログイン成功ならtrue
 */
async function attemptLogin(username, password, isAuto = false) {
    if (!isAuto) {
        showMessage(AUTH_MESSAGE, '認証中...', 'info');
    }
    
    const allData = await fetchAllData();
    const scores = allData.scores;

    // ★ 修正: ユーザー入力のパスワードをハッシュ化
    let hashedPassword;
    try {
        hashedPassword = await hashPassword(password);
    } catch (e) {
        showMessage(AUTH_MESSAGE, '❌ 認証エラー: ハッシュ化処理に失敗しました。', 'error');
        return false;
    }

    // ★ 修正: ハッシュ化されたパスワードとデータ内の 'pass' フィールドを比較
    // ★ NOTE: データ内のパスワードフィールドが 'pass' であることを前提としています。
    const user = scores.find(p => p.name === username && p.pass === hashedPassword);

    if (user) {
        // ★ 修正: 認証ユーザー情報を最新のデータで上書き
        authenticatedUser = user; 
        
        // ★ 修正: statusフィールドが存在しない場合、'none' をデフォルトとして設定
        if (!authenticatedUser.status) {
            authenticatedUser.status = 'none';
        }
        
        // 1. 認証情報をlocalStorageに保存 (自動ログイン用)
        localStorage.setItem('authUsername', username);
        // ★ 修正: 保存するのはプレーンテキストのパスワードではなく、ハッシュ値
        localStorage.setItem('authPasswordHash', hashedPassword); 

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
            // ★ 修正: ハッシュ値を削除
            localStorage.removeItem('authPasswordHash');
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
    // ★ 修正: 保存されたハッシュ値を取得
    const hashedPassword = localStorage.getItem('authPasswordHash');

    if (username && hashedPassword) {
        // ハッシュ値を渡す特殊なログイン処理を実行
        await attemptLoginWithHash(username, hashedPassword, true);
    }
}

/**
 * ハッシュ値を使用したログイン処理 (自動ログイン専用)
 * @param {string} username - ユーザー名
 * @param {string} hashedPassword - パスワードハッシュ
 * @param {boolean} isAuto - 自動ログインかどうか
 * @returns {Promise<boolean>} ログイン成功ならtrue
 */
async function attemptLoginWithHash(username, hashedPassword, isAuto) {
    const allData = await fetchAllData();
    const scores = allData.scores;

    // ★ 修正: ハッシュ値とデータ内の 'pass' フィールドを直接比較
    const user = scores.find(p => p.name === username && p.pass === hashedPassword);

    if (user) {
        authenticatedUser = user; 
        if (!authenticatedUser.status) {
            authenticatedUser.status = 'none';
        }
        
        document.getElementById('auth-section').classList.add('hidden');
        MYPAGE_CONTENT.classList.remove('hidden');
        
        if (isAuto) {
             AUTH_MESSAGE.classList.add('hidden');
        }
        
        initializeMyPageContent(); 
        return true;
    } else {
        if (isAuto) {
            localStorage.removeItem('authUsername');
            localStorage.removeItem('authPasswordHash');
        }
        return false;
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
    // ★ 修正: ハッシュ値を削除
    localStorage.removeItem('authPasswordHash');

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
    // ★ 修正: プレーンテキストのパスワードを取得
    const password = document.getElementById('password').value.trim();
    
    // プレーンテキストのパスワードでログイン試行 (内部でハッシュ化される)
    await attemptLogin(username, password, false);
});

LOGOUT_BUTTON.addEventListener('click', handleLogout);

// -----------------------------------------------------------------
// ★★★ 初期化とダークモード/ボーナス/送金処理 ★★★
// -----------------------------------------------------------------


async function initializeMyPageContent() {
[Immersive content redacted for brevity.]
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
[Immersive content redacted for brevity.]
        
        // ページ全体にクラスを適用（ロード時の処理を統一するため、ここで再実行）
        if (isDarkModeEnabled) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }
}

/**
 * ダークモードの表示を更新するヘルパー関数
 * @param {boolean} isEnabled - ダークモードが有効かどうか
 */
function updateDarkModeDisplay(isEnabled) {
[Immersive content redacted for brevity.]
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
// ★★★ 会員ボーナス機能 (Pro 10P / Premium 15P / Luxury 20P) ★★★
// -----------------------------------------------------------------

/**
 * 会員ボーナス機能の初期化
 * Pro/Premium/Luxury会員であるかチェックし、ボタンの表示/有効性を制御
 */
function initializeMemberBonusFeature() {
[Immersive content redacted for brevity.]
// ★ 修正: nullチェック
if (PRO_BONUS_BUTTON) {
    PRO_BONUS_BUTTON.addEventListener('click', async () => {
        if (!authenticatedUser) {
[Immersive content redacted for brevity.]
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
[Immersive content redacted for brevity.]
// -----------------------------------------------------------------
// 以降、既存の機能 (一部修正済み)
// -----------------------------------------------------------------


// --- 送金機能のロード (変更なし) ---

async function loadTransferReceiverList() {
[Immersive content redacted for brevity.]
// ★ 修正: nullチェック
if (TRANSFER_FORM_MYPAGE) {
    TRANSFER_FORM_MYPAGE.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // ★ 修正: authenticatedUser の null チェック
        if (!authenticatedUser) {
[Immersive content redacted for brevity.]
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
[Immersive content redacted for brevity.]
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
[Immersive content redacted for brevity.]
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
[Immersive content redacted for brevity.]
// -----------------------------------------------------------------
// ★★★ ページロード時の処理に autoLogin を追加 ★★★
// -----------------------------------------------------------------

// まず自動ログインを試み、失敗した場合（認証情報がない/古い場合）はログイン画面が表示されたままになる
window.onload = autoLogin;
