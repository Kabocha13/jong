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
const SCORE_ODDS_CONTAINER = document.getElementById('score-odds-container'); // スコアオッズコンテナ
const ADD_SCORE_ODDS_BUTTON = document.getElementById('add-score-odds-button'); // スコアオッズ追加ボタン

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

// --- スコアオッズ入力フィールドの動的追加 ---
ADD_SCORE_ODDS_BUTTON.addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'score-odds-row form-group';
    row.innerHTML = `
        <input type="text" class="score-input" placeholder="スコア例: 1-0">
        <input type="number" class="odds-input" step="0.1" min="5.0" placeholder="オッズ">
        <button type="button" class="remove-score-odds-button action-button" style="background-color: #dc3545; width: auto; margin: 0; padding: 5px 10px;">削除</button>
    `;
    SCORE_ODDS_CONTAINER.appendChild(row);

    // 削除ボタンのイベントリスナー設定
    row.querySelector('.remove-score-odds-button').addEventListener('click', (e) => {
        e.target.closest('.score-odds-row').remove();
    });
});


/**
 * くじ一覧のHTMLを生成し、表示する
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

        const oddsA = bet.odds.A_WIN.toFixed(2);
        const oddsD = bet.odds.DRAW.toFixed(2);
        const oddsB = bet.odds.B_WIN.toFixed(2);
        
        let scoreOddsList = '';
        const scoreOdds = bet.odds.SCORE || {};
        if (Object.keys(scoreOdds).length > 0) {
            scoreOddsList = Object.entries(scoreOdds).map(([score, odds]) => 
                `<span class="score-odds-item">${score}: x${odds.toFixed(1)}</span>`
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
            // 結果確定時、最終スコアの入力が必要になる
            managementTools = `
                <div class="result-tools-score">
                    <p>最終スコアを入力:</p>
                    <div class="form-group score-input-group">
                        <input type="number" class="final-score" data-team="A" placeholder="A点" min="0" required style="width: 40%; display: inline;">
                        <span style="display: inline; font-size: 1.5em; padding: 0 5px;">-</span>
                        <input type="number" class="final-score" data-team="B" placeholder="B点" min="0" required style="width: 40%; display: inline;">
                    </div>
                    
                    <button class="action-button settle-bet-win-draw" data-bet-id="${bet.betId}">勝利/引き分け結果を確定</button>
                </div>
            `;
        } else if (bet.status === 'SETTLED') {
            statusText = `完了 (確定結果: ${getOutcomeLabel(bet.outcome)} - ${bet.finalScore || 'N/A'})`;
            statusClass = 'status-settled';
            managementTools = `<p class="settled-info">このくじは確定済みです。</p>`;
        }
        
        let wagersHtml = bet.wagers.length > 0 ? 
            bet.wagers.map(w => `<li class="wager-item">${w.player}: ${w.amount} P → ${getOutcomeLabel(w.selection)}</li>`).join('') :
            '<li>まだ投票はありません。</li>';

        html += `
            <div class="bet-card ${statusClass}">
                <h3>${bet.matchName} (#${bet.betId})</h3>
                <p class="status-label">ステータス: <span class="${statusClass}">${statusText}</span></p>
                <div class="odds-info">
                    <strong>勝利/引分:</strong> A(${oddsA}) / D(${oddsD}) / B(${oddsB})
                    ${scoreOddsList ? `<br><strong>🎯 スコア予想:</strong> ${scoreOddsList}` : ''}
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
    document.querySelectorAll('.settle-bet-win-draw').forEach(btn => btn.addEventListener('click', handleSettleBet));
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
 * 選択されたくじに基づいて、投票選択肢のオッズを表示する
 */
function updateWagerSelectionOptions() {
    const betId = TARGET_BET_SELECT.value;
    WAGER_SELECTION_SELECT.innerHTML = '<option value="" disabled selected>選択肢</option>';

    if (betId) {
        fetchAllData().then(data => {
            const bet = data.sports_bets.find(b => b.betId == betId);
            if (bet) {
                const odds = bet.odds;
                
                // 1. 勝利/引き分け
                WAGER_SELECTION_SELECT.innerHTML += `<option value="A_WIN">${getOutcomeLabel('A_WIN')} (${odds.A_WIN.toFixed(2)})</option>`;
                WAGER_SELECTION_SELECT.innerHTML += `<option value="DRAW">${getOutcomeLabel('DRAW')} (${odds.DRAW.toFixed(2)})</option>`;
                WAGER_SELECTION_SELECT.innerHTML += `<option value="B_WIN">${getOutcomeLabel('B_WIN')} (${odds.B_WIN.toFixed(2)})</option>`;
                
                // 2. スコア予想 (SCOREが存在する場合のみ)
                if (odds.SCORE && Object.keys(odds.SCORE).length > 0) {
                     WAGER_SELECTION_SELECT.innerHTML += `<option disabled>--- スコア予想 ---</option>`;
                    Object.entries(odds.SCORE).forEach(([score, scoreOdds]) => {
                        WAGER_SELECTION_SELECT.innerHTML += `<option value="${score}">${score} (${scoreOdds.toFixed(1)})</option>`;
                    });
                }
            }
        });
    }
}

// --- ヘルパー関数 ---

/**
 * 結果/選択肢のラベルを取得する
 * @param {string} key - A_WIN, DRAW, B_WIN, またはスコア (例: '2-1')
 * @returns {string} ラベル
 */
function getOutcomeLabel(key) {
    switch (key) {
        case 'A_WIN': return 'A勝利';
        case 'DRAW': return '引き分け';
        case 'B_WIN': return 'B勝利';
        default: return key; // スコアの場合はそのまま返す
    }
}

// --- イベントハンドラ: 新規くじ作成 ---

CREATE_BET_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('create-message');
    const matchName = document.getElementById('match-name').value;
    const oddsA = parseFloat(document.getElementById('odds-a').value);
    const oddsDraw = parseFloat(document.getElementById('odds-draw').value);
    const oddsB = parseFloat(document.getElementById('odds-b').value);

    // スコア予想オッズを収集
    const scoreOdds = {};
    let scoreValid = true;
    document.querySelectorAll('#score-odds-container .score-odds-row').forEach(row => {
        const scoreInput = row.querySelector('.score-input').value.trim();
        const oddsInput = parseFloat(row.querySelector('.odds-input').value);
        
        if (scoreInput && !isNaN(oddsInput) && oddsInput >= 1.0) {
             // スコア形式の簡易チェック (数字-数字)
            if (!/^\d+-\d+$/.test(scoreInput)) {
                scoreValid = false;
                return;
            }
            scoreOdds[scoreInput] = oddsInput;
        }
        // 未入力の行は無視する
    });
    
    if (!scoreValid) {
        showMessage(messageEl, '❌ スコア予想の形式が不正です（例: 1-0）。', 'error');
        return;
    }

    if (isNaN(oddsA) || isNaN(oddsDraw) || isNaN(oddsB)) {
        showMessage(messageEl, '❌ 勝利/引き分けオッズは数値で入力してください。', 'error');
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
            outcome: null, // 勝利/引分結果
            finalScore: null, // 最終スコア (例: '2-1')
            odds: {
                A_WIN: oddsA,
                DRAW: oddsDraw,
                B_WIN: oddsB,
                SCORE: scoreOdds // スコア予想オッズを追加
            },
            wagers: [] // プレイヤーの投票
        };

        currentData.sports_bets.push(newBet);
        
        const response = await updateAllData(currentData);
        if (response.status === 'success') {
            showMessage(messageEl, `✅ くじ「${matchName}」を作成しました (ID: ${newBetId})`, 'success');
            CREATE_BET_FORM.reset();
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

WAGER_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('wager-message');
    const betId = parseInt(TARGET_BET_SELECT.value);
    const player = WAGER_PLAYER_SELECT.value;
    const amount = parseFloat(document.getElementById('wager-amount').value);
    const selection = WAGER_SELECTION_SELECT.value;

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
            showMessage(messageEl, `✅ ${player}様の ${amount} P (選択: ${getOutcomeLabel(selection)}) の投票を登録しました。`, 'success');
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


// --- イベントハンドラ: 結果確定とポイント反映 (重要機能) ---

async function handleSettleBet(e) {
    const betId = parseInt(e.target.dataset.betId);
    
    // スコア入力を取得
    const betCard = e.target.closest('.bet-card');
    const scoreAInput = betCard.querySelector(`.final-score[data-team="A"]`);
    const scoreBInput = betCard.querySelector(`.final-score[data-team="B"]`);

    const scoreA = parseInt(scoreAInput.value, 10);
    const scoreB = parseInt(scoreBInput.value, 10);
    const finalScoreKey = `${scoreA}-${scoreB}`;

    if (isNaN(scoreA) || isNaN(scoreB)) {
        showMessage(document.getElementById('wager-message'), '❌ 最終スコアを正しく入力してください。', 'error');
        return;
    }

    if (!confirm(`くじ ID:${betId} の結果を【最終スコア: ${finalScoreKey}】で確定し、ポイントを反映しますか？元に戻せません。`)) {
        return;
    }
    
    // 勝利/引き分けの結果を決定
    let resultOutcome = '';
    if (scoreA > scoreB) {
        resultOutcome = 'A_WIN';
    } else if (scoreA < scoreB) {
        resultOutcome = 'B_WIN';
    } else {
        resultOutcome = 'DRAW';
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
        let scoreChanges = new Map(currentData.scores.map(p => [p.name, p.score]));
        let historyChanges = [];
        let totalPointChange = 0; // ログ用

        // --- ポイント計算ロジック ---
        bet.wagers.forEach(wager => {
            let change = 0;
            const selectionKey = wager.selection;
            
            // 1. 勝利/引き分け予想の場合
            if (selectionKey === 'A_WIN' || selectionKey === 'DRAW' || selectionKey === 'B_WIN') {
                if (selectionKey === resultOutcome) {
                    // 当選: 獲得ポイント = 掛け金 * (オッズ - 1)
                    change = wager.amount * (oddsMap[selectionKey] - 1);
                } else {
                    // 敗北: ペナルティ = -掛け金
                    change = -wager.amount;
                }
            } 
            // 2. スコア予想の場合
            else if (oddsMap.SCORE && oddsMap.SCORE[selectionKey]) {
                if (selectionKey === finalScoreKey) {
                    // スコアぴったり当選: 獲得ポイント = 掛け金 * (オッズ - 1)
                    change = wager.amount * (oddsMap.SCORE[selectionKey] - 1);
                } else {
                    // 敗北: ペナルティ = -掛け金
                    change = -wager.amount;
                }
            }
            // 3. その他（予期せぬ選択肢）はポイント変動なし

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
        bet.outcome = resultOutcome; // 勝利/引分結果を記録
        bet.finalScore = finalScoreKey; // 最終スコアを記録
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
            memo: `[スポーツくじ] ${bet.matchName} 結果確定: ${getOutcomeLabel(resultOutcome)} (スコア: ${finalScoreKey}). 総ポイント変動: ${totalPointChange.toFixed(1)} P`,
            gameId: `BET-${betId}-${Date.now()}`
        };
        currentData.history.push(historyEntry);

        // JSONBinに新しい全データをPUTで上書き
        const response = await updateAllData(currentData);

        if (response.status === 'success') {
            showMessage(document.getElementById('wager-message'), `✅ くじ ID:${betId} の結果を【最終スコア: ${finalScoreKey}】で確定し、ポイントを反映しました。`, 'success');
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

// 認証成功時に一度実行
// initializeSportsTools(); // 認証後に実行するためコメントアウト
