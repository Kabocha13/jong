// assets/js/mypage.js

const AUTH_FORM = document.getElementById('auth-form');
const MYPAGE_CONTENT = document.getElementById('mypage-content');
const AUTH_MESSAGE = document.getElementById('auth-message');
const WAGER_FORM = document.getElementById('wager-form');
const TARGET_BET_SELECT = document.getElementById('target-bet');
const WAGER_PLAYER_INPUT = document.getElementById('wager-player');
const WAGER_SELECTION_SELECT = document.getElementById('wager-selection');
const AUTHENTICATED_USER_NAME = document.getElementById('authenticated-user-name');
const CURRENT_SCORE_ELEMENT = document.getElementById('current-score');
const FIXED_PLAYER_NAME = document.getElementById('fixed-player-name');
const WAGER_HISTORY_LIST = document.getElementById('wager-history-list');

let authenticatedUser = null; // 認証されたユーザー情報 ({name: '...', score: ..., pass: '...'})

// --- 認証機能 ---

AUTH_FORM.addEventListener('submit', async (e) => {
// ... (変更なし)
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
// ... (変更なし)
    // 1. ユーザー情報の表示と固定
    AUTHENTICATED_USER_NAME.textContent = authenticatedUser.name;
    CURRENT_SCORE_ELEMENT.textContent = authenticatedUser.score.toFixed(1);
    FIXED_PLAYER_NAME.textContent = authenticatedUser.name;
    WAGER_PLAYER_INPUT.value = authenticatedUser.name; // 投票フォームにユーザー名を固定

    // 2. くじデータと履歴のロード
    await loadBettingDataAndHistory();
}

/**
 * 最新のくじデータと投票履歴を取得し、表示を更新する
 */
async function loadBettingDataAndHistory() {
// ... (変更なし)
    const data = await fetchAllData();
    const allBets = data.sports_bets || []; 
    
    updateWagerForm(allBets);
    renderWagerHistory(allBets);
}


/**
 * 投票フォームの対象くじセレクトボックスを更新する
 */
function updateWagerForm(allBets) {
// ... (変更なし)
    const openBets = allBets.filter(bet => bet.status === 'OPEN');
    let options = ''; 
    let firstBetId = null;
    
    openBets.forEach((bet, index) => {
        if (index === 0) {
            firstBetId = bet.betId;
        }
        // ★ 変更: くじの種類をオプションに表示
        let betLabel = bet.matchName;
        if (bet.betType === 'RANKING') {
            let predLabel = '';
            switch(bet.predictionType) {
                 case 'EXACTA': predLabel = '二連単'; break;
                 case 'PLACE': predLabel = '二連複'; break;
                 case 'WIN': predLabel = '単勝'; break;
            }
            betLabel += ` (順位予想: ${predLabel})`;
        } else {
            betLabel += ` (簡易予想)`;
        }

        options += `<option value="${bet.betId}" ${index === 0 ? 'selected' : ''}>${betLabel}</option>`;
    });

    if (openBets.length === 0) {
        options = '<option value="" disabled selected>開催中のくじはありません</option>';
        WAGER_FORM.querySelector('button[type="submit"]').disabled = true;
    } else {
        WAGER_FORM.querySelector('button[type="submit"]').disabled = false;
    }
    
    TARGET_BET_SELECT.innerHTML = options;
    
    // イベントリスナーを再設定
    TARGET_BET_SELECT.removeEventListener('change', updateWagerSelectionOptions);
    TARGET_BET_SELECT.addEventListener('change', updateWagerSelectionOptions);

    if (firstBetId) {
        TARGET_BET_SELECT.value = firstBetId; 
    } else {
        TARGET_BET_SELECT.value = "";
    }
    
    updateWagerSelectionOptions();
}

/**
 * 選択されたくじに基づいて、投票選択肢のオッズを表示する
 */
function updateWagerSelectionOptions() {
// ... (変更なし)
    const betId = TARGET_BET_SELECT.value;
    WAGER_SELECTION_SELECT.innerHTML = '<option value="" disabled selected>選択肢</option>';

    if (betId) {
        fetchAllData().then(data => {
            const allBets = data.sports_bets || [];
            // betIdは数値として比較
            const bet = allBets.find(b => b.betId == betId);
            
            if (bet) {
                const odds = bet.odds;
                
                if (odds && Object.keys(odds).length > 0) {
                    Object.entries(odds).forEach(([selection, selectionOdds]) => {
                        WAGER_SELECTION_SELECT.innerHTML += `<option value="${selection}">${selection} (x${selectionOdds.toFixed(1)})</option>`;
                    });
                } else {
                     WAGER_SELECTION_SELECT.innerHTML += `<option disabled>オッズが設定されていません</option>`;
                }
            }
        });
    }
}

/**
 * 認証ユーザーの投票履歴を表示する (更新)
 */
function renderWagerHistory(allBets) {
    const playerName = authenticatedUser.name;
    const playerWagers = [];

    // すべてのくじから認証ユーザーの投票を抽出
    allBets.forEach(bet => {
        const betName = bet.matchName;
        const betId = bet.betId;
        const status = bet.status;

        bet.wagers.filter(w => w.player === playerName).forEach(wager => {
            playerWagers.push({
                ...wager,
                betName: betName,
                betId: betId,
                status: status,
                outcome: bet.outcome || [] // outcomeは配列になった可能性があるので初期値を[]とする
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
            
            // ★ 変更: 当選判定を配列に対応
            const isWinningWager = Array.isArray(wager.outcome) && wager.outcome.includes(wager.selection);

            if (wager.status === 'OPEN') {
                statusText = '開催中';
            } else if (wager.status === 'CLOSED') {
                statusText = '結果待ち';
            } else if (wager.status === 'SETTLED') {
                statusText = '確定済';
                outcomeText = isWinningWager ? ' (✅ 当選)' : ' (❌ 外れ)';
                statusClass = isWinningWager ? 'success' : 'error';
                // 確定結果を表示 (配列の場合はカンマ区切り)
                if (wager.outcome.length > 0) {
                    outcomeText += ` [結果: ${wager.outcome.join(' / ')}]`;
                }
            }

            const formattedTime = new Date(wager.timestamp).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) + ' ' + 
                                  new Date(wager.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

            html += `
                <li class="message ${statusClass}" style="margin-top: 5px; padding: 8px; font-size: 0.9em; text-align: left;">
                    [${formattedTime}] ${wager.betName}: <strong>${wager.selection}</strong> に ${wager.amount} P 投票。 (${statusText}${outcomeText})
                </li>
            `;
        });
    }

    WAGER_HISTORY_LIST.innerHTML = html;
}


// --- イベントハンドラ: 投票（くじ購入） (変更なし) ---

WAGER_FORM.addEventListener('submit', async (e) => {
// ... (変更なし)
    e.preventDefault();
    const messageEl = document.getElementById('wager-message');
    const betId = parseInt(TARGET_BET_SELECT.value);
    // プレイヤーは認証ユーザーに固定
    const player = authenticatedUser.name; 
    const amount = parseFloat(document.getElementById('wager-amount').value);
    const selection = WAGER_SELECTION_SELECT.value;

    if (!betId || isNaN(amount) || amount <= 0 || !selection) {
        showMessage(messageEl, '❌ すべての項目を正しく入力してください。', 'error');
        return;
    }

    const submitButton = WAGER_FORM.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    showMessage(messageEl, '投票を処理中...', 'info');
    
    try {
        // 1. 最新の全データを取得し、残高チェックを厳密に行う
        const currentData = await fetchAllData();
        const allBets = currentData.sports_bets || [];
        const betIndex = allBets.findIndex(b => b.betId === betId);
        
        // scoresから認証ユーザーの最新スコアを取得
        let targetPlayer = currentData.scores.find(p => p.name === player);
        
        // passフィールドが取得されているか確認 (common.jsの修正で保証されるはずだが念のため)
        if (!targetPlayer || typeof targetPlayer.pass === 'undefined') {
             showMessage(messageEl, '❌ 認証ユーザーのデータにパスワード情報が不足しています。', 'error');
             return;
        }

        // 認証時のスコアではなく、最新のスコアで残高チェック
        if (targetPlayer.score < amount) {
            showMessage(messageEl, `❌ ポイント残高 (${targetPlayer.score.toFixed(1)} P) が不足しているため、投票できません。`, 'error');
            return;
        }

        if (betIndex === -1 || allBets[betIndex].status !== 'OPEN') {
            showMessage(messageEl, '❌ 開催中のくじではありません。', 'error');
            return;
        }

        // 2. スコアからポイントを減算
        targetPlayer.score = parseFloat((targetPlayer.score - amount).toFixed(1));

        // 3. 投票情報を追加
        allBets[betIndex].wagers.push({
            player: player,
            amount: amount,
            selection: selection,
            timestamp: new Date().toISOString()
        });
        
        // 4. 履歴エントリーを作成
        const historyEntry = {
            timestamp: new Date().toISOString(),
            ranks: ['WAGER'],
            changes: [{name: player, change: -amount}],
            memo: `[くじ投票] ${player}がくじ#${betId} (${allBets[betIndex].matchName})に ${amount} Pを投票(選択肢: ${selection})。`,
            gameId: `WAGER-${betId}-${Date.now()}`
        };
        currentData.history.push(historyEntry);

        // 5. 更新された全データを保存 (scores, history, sports_bets, speedstorm_recordsを含む)
        currentData.sports_bets = allBets;
        
        // scoresはtargetPlayerが更新されているので、それを反映させるためにscores配列全体を再構築
        currentData.scores = currentData.scores.map(p => p.name === player ? targetPlayer : p); 

        // ★ データ永続性の確保: updateAllData()内でpassフィールドが失われないことを確認する

        const response = await updateAllData(currentData);
        if (response.status === 'success') {
            showMessage(messageEl, `✅ ${player}様の ${amount} P (選択: ${selection}) の投票を登録し、ポイントを減算しました。`, 'success');
            WAGER_FORM.reset();
            
            // 6. 認証ユーザー情報を更新し、画面を再表示
            authenticatedUser.score = targetPlayer.score; // 認証ユーザーのメモリ上のスコアを更新
            CURRENT_SCORE_ELEMENT.textContent = authenticatedUser.score.toFixed(1); // 画面上のスコアを更新
            
            // 投票履歴とくじリストを再ロード
            loadBettingDataAndHistory(); 
            
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
