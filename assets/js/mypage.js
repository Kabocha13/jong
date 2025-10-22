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

let authenticatedUser = null; // 認証されたユーザー情報 ({name: '...', score: ..., pass: '...'})

// --- 認証機能 (変更なし) ---

AUTH_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    
    showMessage(AUTH_MESSAGE, '認証中...', 'info');

    const allData = await fetchAllData();
    const scores = allData.scores;

    // ユーザー名とパスワードで照合
    const user = scores.find(p => p.name === username && p.pass === password);

    if (user) {
        authenticatedUser = user;
        document.getElementById('auth-section').classList.add('hidden');
        MYPAGE_CONTENT.classList.remove('hidden');
        showMessage(AUTH_MESSAGE, `✅ ログイン成功! ようこそ、${username}様。`, 'success');
        
        // マイページコンテンツの初期化と表示
        initializeMyPageContent(); 
    } else {
        // パスワードまたはユーザー名が間違っている可能性があるため、エラーメッセージを一般化
        showMessage(AUTH_MESSAGE, '❌ ユーザー名またはパスワードが間違っています。', 'error');
    }
});


// --- 初期化: マイページコンテンツの表示とロード ---

async function initializeMyPageContent() {
    // 1. ユーザー情報の表示と固定
    AUTHENTICATED_USER_NAME.textContent = authenticatedUser.name;
    CURRENT_SCORE_ELEMENT.textContent = authenticatedUser.score.toFixed(1);
    FIXED_PLAYER_NAME.textContent = authenticatedUser.name;
    WAGER_PLAYER_INPUT.value = authenticatedUser.name; // 投票フォームにユーザー名を固定

    // 2. くじデータと履歴のロード
    await loadBettingDataAndHistory();
    
    // 3. 賭け入力フィールドの初期化
    initializeWagerInputs();
}

/**
 * 賭け入力行を初期化・追加する関数
 */
function initializeWagerInputs() {
    WAGER_INPUTS_CONTAINER.innerHTML = ''; // 初期化
    for (let i = 0; i < 3; i++) {
        addWagerRow(); // 初期で3つ表示
    }
}

/**
 * 賭け内容と掛け金の入力行を追加する関数
 */
function addWagerRow(item = '', amount = '') {
    const row = document.createElement('div');
    row.className = 'wager-row form-group';
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.marginBottom = '10px';
    row.style.borderLeft = '3px solid var(--color-accent)';
    row.style.paddingLeft = '10px';
    row.innerHTML = `
        <div style="flex-grow: 3;">
            <label style="font-size: 0.8em; display: block;">かけるもの (自由記述):</label>
            <input type="text" class="wager-item-input" value="${item}" placeholder="例: 陸上100mで山下が優勝">
        </div>
        <div style="flex-grow: 1; min-width: 100px;">
            <label style="font-size: 0.8em; display: block;">掛け金 (P):</label>
            <input type="number" class="wager-amount-input" step="1" min="1" value="${amount}" placeholder="例: 10">
        </div>
        <button type="button" class="remove-wager-row-button action-button secondary-button" style="background-color: #dc3545; width: auto; margin: 0; padding: 5px 10px; align-self: flex-end;">削除</button>
    `;
    WAGER_INPUTS_CONTAINER.appendChild(row);

    // 削除ボタンのイベントリスナー設定
    row.querySelector('.remove-wager-row-button').addEventListener('click', (e) => {
        e.target.closest('.wager-row').remove();
    });
}

// 賭け追加ボタンのイベントリスナー
ADD_WAGER_ROW_BUTTON.addEventListener('click', () => addWagerRow());


/**
 * 最新のくじデータと投票履歴を取得し、表示を更新する
 */
async function loadBettingDataAndHistory() {
    const data = await fetchAllData();
    const allBets = data.sports_bets || []; 
    
    updateWagerForm(allBets);
    renderWagerHistory(allBets);
}


/**
 * 投票フォームの対象くじセレクトボックスを更新する
 */
function updateWagerForm(allBets) {
    // 締切時刻を過ぎていないOPEN状態のくじのみを表示
    const now = new Date();
    const openBets = allBets.filter(bet => 
        bet.status === 'OPEN' && new Date(bet.deadline) > now
    );
    
    let options = ''; 
    let firstBetId = null;
    
    openBets.forEach((bet, index) => {
        if (index === 0) {
            firstBetId = bet.betId;
        }
        const deadline = new Date(bet.deadline).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) + ' ' + 
                         new Date(bet.deadline).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        options += `<option value="${bet.betId}" ${index === 0 ? 'selected' : ''}>${bet.matchName} (締切: ${deadline})</option>`;
    });

    if (openBets.length === 0) {
        options = '<option value="" disabled selected>開催中のくじはありません</option>';
        WAGER_FORM.querySelector('button[type="submit"]').disabled = true;
        ADD_WAGER_ROW_BUTTON.disabled = true;
    } else {
        WAGER_FORM.querySelector('button[type="submit"]').disabled = false;
        ADD_WAGER_ROW_BUTTON.disabled = false;
    }
    
    TARGET_BET_SELECT.innerHTML = options;
    
    // オッズ選択肢の更新は不要になったため、イベントリスナーも不要
    // updateWagerSelectionOptionsは削除/不使用
}


/**
 * 認証ユーザーの投票履歴を表示する (新しいデータ構造に対応して修正)
 */
function renderWagerHistory(allBets) {
    const playerName = authenticatedUser.name;
    const playerWagers = [];

    // すべてのくじから認証ユーザーの投票を抽出
    allBets.forEach(bet => {
        const betName = bet.matchName;
        const betId = bet.betId;
        const status = bet.status;

        // 投票は配列の配列ではなく、一律の配列になっている
        bet.wagers.filter(w => w.player === playerName).forEach(wager => {
            playerWagers.push({
                ...wager,
                betName: betName,
                betId: betId,
                status: status,
                // 新しいフィールド
                isWin: wager.isWin, 
                appliedOdds: wager.appliedOdds
            });
        });
    });

    // タイムスタンプで降順ソート
    playerWagers.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    let html = '';

    if (playerWagers.length === 0) {
        html = '<li>まだ投票履歴はありません。</li>';
    } else {
        const latestWagers = playerWagers.slice(0, 5); // 最新5件

        latestWagers.forEach(wager => {
            let statusText = '';
            let statusClass = 'info'; // デフォルトはinfo
            let outcomeText = '';

            if (wager.status === 'OPEN' || wager.status === 'CLOSED') {
                statusText = wager.status === 'OPEN' ? '開催中' : '結果待ち';
            } else if (wager.status === 'SETTLED') {
                statusText = '確定済';
                
                if (wager.isWin === true) {
                    const profit = (wager.amount * wager.appliedOdds).toFixed(1); // 利益 = 掛け金 * オッズ
                    outcomeText = ` (✅ 当選: x${wager.appliedOdds.toFixed(1)} -> +${profit} P)`;
                    statusClass = 'success';
                } else if (wager.isWin === false) {
                    outcomeText = ' (❌ 外れ)'; // 購入時に既に減算済み
                    statusClass = 'error';
                } else {
                    outcomeText = ' (結果未入力)';
                    statusClass = 'info';
                }
            }

            const formattedTime = new Date(wager.timestamp).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) + ' ' + 
                                  new Date(wager.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

            const itemDisplay = wager.item.length > 25 ? wager.item.substring(0, 25) + '...' : wager.item;

            html += `
                <li class="message ${statusClass}" style="margin-top: 5px; padding: 8px; font-size: 0.9em; text-align: left;">
                    [${formattedTime}] ${wager.betName}: <strong>${itemDisplay}</strong> に ${wager.amount} P 投票。 (${statusText}${outcomeText})
                </li>
            `;
        });
    }

    WAGER_HISTORY_LIST.innerHTML = html;
}


// --- イベントハンドラ: 投票（くじ購入） (大幅修正) ---

WAGER_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('wager-message');
    const betId = parseInt(TARGET_BET_SELECT.value);
    const player = authenticatedUser.name; 
    
    // 1. フォームから有効な賭けのリストを収集
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
        
        if (!targetPlayer || typeof targetPlayer.pass === 'undefined') {
             showMessage(messageEl, '❌ 認証ユーザーのデータにパスワード情報が不足しています。', 'error');
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

        // 4. 投票情報を既存のwagers配列に追加
        currentBet.wagers.push(...wagersToSubmit);
        
        // 5. 履歴エントリーを作成
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
