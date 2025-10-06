// assets/js/master_sports.js

const AUTH_FORM = document.getElementById('auth-form');
const SPORTS_TOOLS = document.getElementById('sports-tools');
const AUTH_MESSAGE = document.getElementById('auth-message');
const BET_LIST_CONTAINER = document.getElementById('bet-list-container');

const CREATE_BET_FORM = document.getElementById('create-bet-form');
const WAGER_FORM = document.getElementById('wager-form');
const TARGET_BET_SELECT = document.getElementById('target-bet');
const WAGER_PLAYER_SELECT = document.getElementById('wager-player');
const WAGER_SELECTION_SELECT = document.getElementById('wager-selection');

// 変更箇所: 汎用オッズ入力用のコンテナとボタン
const GENERIC_ODDS_CONTAINER = document.getElementById('generic-odds-container'); 
const ADD_GENERIC_ODDS_BUTTON = document.getElementById('add-generic-odds-button'); 

let ALL_PLAYERS = []; // プレイヤー名を格納する配列

// --- 認証機能 ---
AUTH_FORM.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = document.getElementById('auth-password').value;
    
    if (password === MASTER_PASSWORD) {
        document.getElementById('auth-section').classList.add('hidden');
        SPORTS_TOOLS.classList.remove('hidden');
        initializeSportsTools(); // 認証成功後、ツールを初期化
    } else {
        showMessage(AUTH_MESSAGE, '❌ パスワードが間違っています。', 'error');
    }
});

// --- 初期化: プレイヤーリストとくじリストのロード ---

async function initializeSportsTools() {
    await loadPlayerList();
    await loadBettingData();
    // ページロード時に一つも選択肢がない場合のために初期行を一つ追加しておく
    if (GENERIC_ODDS_CONTAINER.children.length === 0) {
        addGenericOddsRow();
    }
}

/**
 * プレイヤーリストをロードし、投票フォームのセレクトボックスを更新する
 */
async function loadPlayerList() {
    WAGER_PLAYER_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    const scores = await fetchScores();
    
    if (scores.length === 0) {
        WAGER_PLAYER_SELECT.innerHTML = '<option value="" disabled selected>リストの取得に失敗</option>';
        return;
    }

    ALL_PLAYERS = scores.map(p => p.name);
    
    let options = '<option value="" disabled selected>プレイヤーを選択</option>';
    ALL_PLAYERS.forEach(name => {
        options += `<option value="${name}">${name}</option>`;
    });

    WAGER_PLAYER_SELECT.innerHTML = options;
}

/**
 * くじのデータ (sports_bets) を取得し、くじ一覧と投票フォームを更新する
 */
async function loadBettingData() {
    const data = await fetchAllData();
    const allBets = data.sports_bets || [];
    
    renderBetList(allBets);
    updateWagerForm(allBets);
}

// --- 汎用オッズ入力フィールドの動的追加 (変更箇所) ---
ADD_GENERIC_ODDS_BUTTON.addEventListener('click', addGenericOddsRow);

function addGenericOddsRow() {
    const row = document.createElement('div');
    row.className = 'generic-odds-row form-group';
    row.innerHTML = `
        <input type="text" class="selection-input" placeholder="選択肢名 (例: プレイヤーAが1位)">
        <input type="number" class="odds-input" step="0.1" min="1.0" required placeholder="オッズ (例: 2.5)">
        <button type="button" class="remove-generic-odds-button action-button" style="background-color: #dc3545; width: auto; margin: 0; padding: 5px 10px;">削除</button>
    `;
    GENERIC_ODDS_CONTAINER.appendChild(row);

    // 削除ボタンのイベントリスナー設定
    row.querySelector('.remove-generic-odds-button').addEventListener('click', (e) => {
        e.target.closest('.generic-odds-row').remove();
    });
}


/**
 * くじ一覧のHTMLを生成し、表示する (変更箇所: 表示ロジックの汎用化)
 * @param {Array<Object>} allBets - すべてのくじのデータ
 */
function renderBetList(allBets) {
    if (allBets.length === 0) {
        BET_LIST_CONTAINER.innerHTML = '<p>まだくじが作成されていません。</p>';
        return;
    }

    let html = '';
    
    // ソート: OPEN -> CLOSED -> SETTLED
    const sortedBets = allBets.sort((a, b) => {
        const order = { 'OPEN': 1, 'CLOSED': 2, 'SETTLED': 3 };
        return order[a.status] - order[b.status];
    });

    sortedBets.forEach(bet => {
        const totalWagers = bet.wagers.reduce((sum, w) => sum + w.amount, 0);
        let statusText = '';
        let statusClass = '';
        let managementTools = '';

        // 汎用オッズリストを生成
        let genericOddsList = '';
        const genericOdds = bet.odds || {};
        if (Object.keys(genericOdds).length > 0) {
            genericOddsList = Object.entries(genericOdds).map(([selection, odds]) => 
                `<span class="score-odds-item">${selection}: x${odds.toFixed(1)}</span>`
            ).join(', ');
        }


        if (bet.status === 'OPEN') {
            statusText = '開催中 (投票受付中)';
            statusClass = 'status-open';
            managementTools = `
                <button class="action-button close-bet" data-bet-id="${bet.betId}">投票締切</button>
            `;
        } else if (bet.status === 'CLOSED') {
            statusText = '締切 (結果待ち)';
            statusClass = 'status-closed';
            // 結果確定時、当選選択肢の入力が必要になる (変更箇所: 最終結果は選択肢名で入力)
            managementTools = `
                <div class="result-tools-score">
                    <p>🎯 当選した選択肢（結果）を入力:</p>
                    <div class="form-group score-input-group">
                        <input type="text" class="final-outcome-key" placeholder="例: 馬Aの勝利" required style="width: 80%; display: inline;">
                    </div>
                    
                    <button class="action-button settle-bet" data-bet-id="${bet.betId}">結果を確定し、ポイントを反映</button>
                </div>
            `;
        } else if (bet.status === 'SETTLED') {
            // 変更箇所: 最終結果キーを表示
            statusText = `完了 (当選結果: ${bet.outcome || 'N/A'})`;
            statusClass = 'status-settled';
            managementTools = `<p class="settled-info">このくじは確定済みです。</p>`;
        }
        
        let wagersHtml = bet.wagers.length > 0 ? 
            bet.wagers.map(w => `<li class="wager-item">${w.player}: ${w.amount} P → ${w.selection}</li>`).join('') :
            '<li>まだ投票はありません。</li>'; // w.selectionは既に選択肢名

        html += `
            <div class="bet-card ${statusClass}">
                <h3>${bet.matchName} (#${bet.betId})</h3>
                <p class="status-label">ステータス: <span class="${statusClass}">${statusText}</span></p>
                <div class="odds-info">
                    <strong>オッズ:</strong> ${genericOddsList}
                </div>
                <div class="wager-info">
                    <strong>合計投票:</strong> ${totalWagers} P (${bet.wagers.length}件)
                </div>
                <ul class="wagers-list">${wagersHtml}</ul>
                <div class="management-tools">
                    ${managementTools}
                </div>
            </div>
        `;
    });

    BET_LIST_CONTAINER.innerHTML = html;

    // イベントリスナーを再設定
    document.querySelectorAll('.close-bet').forEach(btn => btn.addEventListener('click', handleCloseBet));
    // 変更箇所: 新しい確定ボタンのセレクタに変更
    document.querySelectorAll('.settle-bet').forEach(btn => btn.addEventListener('click', handleSettleBet));
}

/**
 * 投票フォームの対象くじセレクトボックスを更新する
 * @param {Array<Object>} allBets - すべてのくじのデータ
 */
function updateWagerForm(allBets) {
    const openBets = allBets.filter(bet => bet.status === 'OPEN');
    let options = '<option value="" disabled selected>開催中のくじを選択</option>';
    
    openBets.forEach(bet => {
        options += `<option value="${bet.betId}">${bet.matchName}</option>`;
    });

    TARGET_BET_SELECT.innerHTML = options;
    
    // 対象くじが選択されたら、選択肢(オッズ)を更新
    TARGET_BET_SELECT.removeEventListener('change', updateWagerSelectionOptions);
    TARGET_BET_SELECT.addEventListener('change', updateWagerSelectionOptions);

    // 初期化時にも一度実行
    updateWagerSelectionOptions();
}

/**
 * 選択されたくじに基づいて、投票選択肢のオッズを表示する (変更箇所: 汎用オッズの表示)
 */
function updateWagerSelectionOptions() {
    const betId = TARGET_BET_SELECT.value;
    WAGER_SELECTION_SELECT.innerHTML = '<option value="" disabled selected>選択肢</option>';

    if (betId) {
        fetchAllData().then(data => {
            const bet = data.sports_bets.find(b => b.betId == betId);
            if (bet) {
                const odds = bet.odds;
                
                // 汎用オッズ
                if (odds && Object.keys(odds).length > 0) {
                    Object.entries(odds).forEach(([selection, selectionOdds]) => {
                        // valueと表示テキストはどちらも選択肢名（selection）を使用
                        WAGER_SELECTION_SELECT.innerHTML += `<option value="${selection}">${selection} (x${selectionOdds.toFixed(1)})</option>`;
                    });
                } else {
                     WAGER_SELECTION_SELECT.innerHTML += `<option disabled>オッズが設定されていません</option>`;
                }
            }
        });
    }
}

// --- ヘルパー関数 (不要になったgetOutcomeLabelは削除) ---


// --- イベントハンドラ: 新規くじ作成 (変更箇所: 汎用オッズの収集) ---

CREATE_BET_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('create-message');
    const matchName = document.getElementById('match-name').value;

    // 汎用オッズを収集
    const genericOdds = {};
    let allValid = true;
    let hasAtLeastOne = false;
    
    document.querySelectorAll('#generic-odds-container .generic-odds-row').forEach(row => {
        const selectionInput = row.querySelector('.selection-input').value.trim();
        const oddsInput = parseFloat(row.querySelector('.odds-input').value);
        
        if (selectionInput && !isNaN(oddsInput) && oddsInput >= 1.0) {
            genericOdds[selectionInput] = oddsInput;
            hasAtLeastOne = true;
        } else if (selectionInput || row.querySelector('.odds-input').value.trim()) {
            // 一部入力があるが無効な場合
            allValid = false;
            return;
        }
    });
    
    if (!allValid) {
        showMessage(messageEl, '❌ 選択肢名と有効なオッズ (1.0以上) を入力してください。', 'error');
        return;
    }
    
    if (!hasAtLeastOne) {
        showMessage(messageEl, '❌ オッズを最低一つは設定してください。', 'error');
        return;
    }


    try {
        const currentData = await fetchAllData();
        const allBets = currentData.sports_bets || [];
        const newBetId = allBets.length > 0 ? Math.max(...allBets.map(b => b.betId)) + 1 : 1;
        
        const newBet = {
            betId: newBetId,
            matchName: matchName,
            status: 'OPEN',
            outcome: null, // 当選した選択肢のキー (例: '馬Aの勝利')
            odds: genericOdds, // 汎用オッズを使用
            wagers: [] // プレイヤーの投票
        };

        currentData.sports_bets.push(newBet);
        
        const response = await updateAllData(currentData);
        if (response.status === 'success') {
            showMessage(messageEl, `✅ くじ「${matchName}」を作成しました (ID: ${newBetId})`, 'success');
            CREATE_BET_FORM.reset();
            // 初期状態のオッズ行に戻す (既存の行を削除し、デフォルトの行を追加)
            GENERIC_ODDS_CONTAINER.innerHTML = ''; 
            addGenericOddsRow(); 
            addGenericOddsRow(); 
            loadBettingData(); // リストを再ロード
        } else {
            showMessage(messageEl, `❌ 作成エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    }
});

// --- イベントハンドラ: 投票（代理購入） ---
// WAGER_FORMのロジックは変更なし。wager.selectionが汎用的な選択肢名になる。

WAGER_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('wager-message');
    const betId = parseInt(TARGET_BET_SELECT.value);
    const player = WAGER_PLAYER_SELECT.value;
    const amount = parseFloat(document.getElementById('wager-amount').value);
    const selection = WAGER_SELECTION_SELECT.value; // 選択肢名がそのままキーになる

    if (!betId || !player || isNaN(amount) || amount <= 0 || !selection) {
        showMessage(messageEl, '❌ すべての項目を正しく入力してください。', 'error');
        return;
    }
    
    try {
        const currentData = await fetchAllData();
        const betIndex = currentData.sports_bets.findIndex(b => b.betId === betId);

        if (betIndex === -1 || currentData.sports_bets[betIndex].status !== 'OPEN') {
            showMessage(messageEl, '❌ 開催中のくじではありません。', 'error');
            return;
        }
        
        // 投票情報を追加
        currentData.sports_bets[betIndex].wagers.push({
            player: player,
            amount: amount,
            selection: selection,
            timestamp: new Date().toISOString()
        });

        const response = await updateAllData(currentData);
        if (response.status === 'success') {
            showMessage(messageEl, `✅ ${player}様の ${amount} P (選択: ${selection}) の投票を登録しました。`, 'success');
            WAGER_FORM.reset();
            loadBettingData(); // リストを再ロード
            loadPlayerList(); // プレイヤーリストも再ロード（念のため）
        } else {
            showMessage(messageEl, `❌ 投票エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    }
});


// --- イベントハンドラ: くじ締切 ---
// handleCloseBet のロジックは変更なし。

async function handleCloseBet(e) {
    const betId = parseInt(e.target.dataset.betId);
    
    if (!confirm(`くじ ID:${betId} の投票を締め切りますか？この操作後は投票できません。`)) {
        return;
    }

    try {
        const currentData = await fetchAllData();
        const bet = currentData.sports_bets.find(b => b.betId === betId);

        if (bet && bet.status === 'OPEN') {
            bet.status = 'CLOSED';
            const response = await updateAllData(currentData);
            if (response.status === 'success') {
                showMessage(document.getElementById('wager-message'), `✅ くじ ID:${betId} の投票を締め切りました。`, 'success');
                loadBettingData();
            } else {
                showMessage(document.getElementById('wager-message'), `❌ 締切処理エラー: ${response.message}`, 'error');
            }
        }
    } catch (error) {
        console.error(error);
        showMessage(document.getElementById('wager-message'), `❌ サーバーエラー: ${error.message}`, 'error');
    }
}


// --- イベントハンドラ: 結果確定とポイント反映 (変更箇所: 汎用結果判定) ---

async function handleSettleBet(e) {
    const betId = parseInt(e.target.dataset.betId);
    
    // 当選選択肢の入力を取得
    const betCard = e.target.closest('.bet-card');
    const finalOutcomeKeyInput = betCard.querySelector(`.final-outcome-key`);
    const finalOutcomeKey = finalOutcomeKeyInput.value.trim(); // 当選した選択肢名 (例: '馬Aの勝利')

    if (!finalOutcomeKey) {
        showMessage(document.getElementById('wager-message'), '❌ 当選した選択肢名を入力してください。', 'error');
        return;
    }

    if (!confirm(`くじ ID:${betId} の結果を【当選選択肢: ${finalOutcomeKey}】で確定し、ポイントを反映しますか？元に戻せません。`)) {
        return;
    }
    
    // ボタンを無効化して二重送信を防ぐ
    betCard.querySelectorAll('.action-button').forEach(btn => btn.disabled = true);

    try {
        const currentData = await fetchAllData();
        const bet = currentData.sports_bets.find(b => b.betId === betId);

        if (!bet || bet.status !== 'CLOSED') {
            showMessage(document.getElementById('wager-message'), '❌ くじが見つからないか、ステータスが「締切」ではありません。', 'error');
            return;
        }

        const oddsMap = bet.odds;
        // 入力された当選キーがオッズに存在するか確認
        const winningOdds = oddsMap[finalOutcomeKey];
        if (!winningOdds) {
             showMessage(document.getElementById('wager-message'), `❌ 入力された結果「${finalOutcomeKey}」はオッズに設定されていません。入力ミスがないか確認してください。`, 'error');
             betCard.querySelectorAll('.action-button').forEach(btn => btn.disabled = false);
             return;
        }
        
        let scoreChanges = new Map(currentData.scores.map(p => [p.name, p.score]));
        let historyChanges = [];
        let totalPointChange = 0; // ログ用

        // --- ポイント計算ロジック (汎用化) ---
        bet.wagers.forEach(wager => {
            let change = 0;
            const selectionKey = wager.selection; // 投票された選択肢名
            
            if (selectionKey === finalOutcomeKey) {
                // 当選: 獲得ポイント = 掛け金 * (オッズ - 1)
                change = wager.amount * (winningOdds - 1);
            } else {
                // 敗北: ペナルティ = -掛け金
                change = -wager.amount;
            }

            const currentScore = scoreChanges.get(wager.player) || 0;
            scoreChanges.set(wager.player, currentScore + change);
            
            historyChanges.push({
                name: wager.player,
                change: parseFloat(change.toFixed(1)) // 小数点第1位までに丸める
            });
            totalPointChange += change;
        });

        // --- データ更新 ---
        
        // 1. sports_bets を更新
        bet.outcome = finalOutcomeKey; // 当選選択肢のキーを記録
        // 既存の finalScore は削除またはnullを保持
        delete bet.finalScore; 
        bet.status = 'SETTLED';

        // 2. scores を更新
        currentData.scores = Array.from(scoreChanges.entries()).map(([name, score]) => ({ 
            name, 
            score: parseFloat(score.toFixed(1)) // スコアも丸める
        }));
        
        // 3. history を更新
        const historyEntry = {
            timestamp: new Date().toISOString(),
            ranks: ['BET'], // くじであることを示すタイプ
            changes: historyChanges,
            memo: `[スポーツくじ] ${bet.matchName} 結果確定: 当選選択肢「${finalOutcomeKey}」. 総ポイント変動: ${totalPointChange.toFixed(1)} P`,
            gameId: `BET-${betId}-${Date.now()}`
        };
        currentData.history.push(historyEntry);

        // JSONBinに新しい全データをPUTで上書き
        const response = await updateAllData(currentData);

        if (response.status === 'success') {
            showMessage(document.getElementById('wager-message'), `✅ くじ ID:${betId} の結果を【当選選択肢: ${finalOutcomeKey}】で確定し、ポイントを反映しました。`, 'success');
            loadBettingData();
            loadPlayerList();
        } else {
            showMessage(document.getElementById('wager-message'), `❌ ポイント反映エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(document.getElementById('wager-message'), `❌ サーバーエラー: ${error.message}`, 'error');
    } finally {
        // ボタンを再度有効化
        betCard.querySelectorAll('.action-button').forEach(btn => btn.disabled = false);
    }
}
