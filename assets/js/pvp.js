// assets/js/pvp.js

const AUTH_SECTION = document.getElementById('auth-section');
const PVP_LOBBY = document.getElementById('pvp-lobby');
const GAME_ARENA = document.getElementById('game-arena');
const AUTH_FORM = document.getElementById('auth-form');
const AUTH_MESSAGE = document.getElementById('auth-message');
const LOGOUT_BUTTON = document.getElementById('logout-button');

const AUTHENTICATED_USER_NAME = document.getElementById('authenticated-user-name');
const CURRENT_SCORE_ELEMENT = document.getElementById('current-score');
// 削除：const MY_GAME_LIST = document.getElementById('my-game-list');
const AVAILABLE_GAME_LIST = document.getElementById('available-game-list');

const CREATE_ROOM_FORM = document.getElementById('create-room-form');
const JOIN_ROOM_FORM = document.getElementById('join-room-form');

const CHAIR_CONTAINER = document.getElementById('chair-container');
const ACTION_FORM = document.getElementById('action-form');
const TURN_DISPLAY = document.getElementById('turn-display');
const ROUND_DISPLAY = document.getElementById('round-display');
const LAST_RESULT_DISPLAY = document.getElementById('last-result-display');
const RESULT_MESSAGE = document.getElementById('result-message');
const PLAYER_A_CARD = document.getElementById('player-a-card');
const PLAYER_B_CARD = document.getElementById('player-b-card');

// --- 状態管理 ---
let authenticatedUser = null; 
let currentGameState = null; // 現在のゲームデータ (pvp-fetchから取得)
let pollingInterval = null;
const POLLING_RATE = 3000; // 3秒ごとにポーリング

// --- 認証ロジック (mypage.jsから流用) ---

async function attemptLogin(username, password, isAuto = false) {
    if (!isAuto) showMessage(AUTH_MESSAGE, '認証中...', 'info');
    
    // PVP_FETCH_URLを使って、全スコアデータ（パスワード含む）を取得する
    const pvpData = await fetchPvpData(username);
    const allScores = pvpData.allScores;

    const user = allScores.find(p => p.name === username && p.pass === password);

    if (user) {
        authenticatedUser = user; 
        localStorage.setItem('pvpAuthUsername', username); // PVP専用の認証情報を保存
        localStorage.setItem('pvpAuthPassword', password);

        AUTH_SECTION.classList.add('hidden');
        PVP_LOBBY.classList.remove('hidden');
        
        initializeLobby();
        startPolling();
        return true;
    } else {
        if (isAuto) {
            localStorage.removeItem('pvpAuthUsername');
            localStorage.removeItem('pvpAuthPassword');
        } else {
            showMessage(AUTH_MESSAGE, '❌ ユーザー名またはパスワードが間違っています。', 'error');
        }
        return false;
    }
}

async function autoLogin() {
    const username = localStorage.getItem('pvpAuthUsername');
    const password = localStorage.getItem('pvpAuthPassword');

    if (username && password) {
        await attemptLogin(username, password, true);
    }
}

function handleLogout() {
    if (pollingInterval) clearInterval(pollingInterval);
    localStorage.removeItem('pvpAuthUsername');
    localStorage.removeItem('pvpAuthPassword');

    authenticatedUser = null;
    currentGameState = null;
    
    AUTH_SECTION.classList.remove('hidden');
    PVP_LOBBY.classList.add('hidden');
    GAME_ARENA.classList.add('hidden');
    AUTH_FORM.reset();
    
    showMessage(AUTH_MESSAGE, '👋 ログアウトしました。', 'info');
}

// --- 初期化とポーリング ---

function initializeLobby() {
    if (!authenticatedUser) return;
    AUTHENTICATED_USER_NAME.textContent = authenticatedUser.name;
    CURRENT_SCORE_ELEMENT.textContent = authenticatedUser.score ? authenticatedUser.score.toFixed(1) : '0.0';
    
    // 既存のゲームがあればアリーナに直接移動させる
    // ★修正: FINISHEDでもアリーナに残すため、FINISHEDチェックを削除
    if (currentGameState && currentGameState.status !== 'WAITING_JOIN' && currentGameState.playerB) {
        PVP_LOBBY.classList.add('hidden');
        GAME_ARENA.classList.remove('hidden');
        renderGameArena(currentGameState);
    }
}

/**
 * PVPゲームの状態をサーバーから取得し、UIを更新する
 */
async function fetchAndUpdatePvpData() {
    if (!authenticatedUser) return;

    const data = await fetchPvpData(authenticatedUser.name);
    
    // 1. 自分のスコアを更新 (認証情報が古くなっている可能性があるため)
    const myCurrentScoreData = data.allScores.find(p => p.name === authenticatedUser.name);
    if (myCurrentScoreData) {
        authenticatedUser.score = myCurrentScoreData.score;
        CURRENT_SCORE_ELEMENT.textContent = myCurrentScoreData.score.toFixed(1);
    }

    // 2. 進行中のゲームをチェック
    // 自分が参加しているゲームのうち、まだログアウト/削除されていないものを取得
    const myGame = data.currentGames.find(g => g.status !== 'DELETED'); 

    if (myGame) {
        // 進行中または終了済みのゲームが見つかった場合
        // 以下の条件でレンダリング（トークン更新、参加完了、ステータス変更、FINISHEDへの移行）
        // FINISHEDの場合も、actionTokenが変わらなくても再レンダリングする
        if (!currentGameState || myGame.actionToken !== currentGameState.actionToken || myGame.status !== currentGameState.status || myGame.status === 'FINISHED') {
            currentGameState = myGame;
            PVP_LOBBY.classList.add('hidden');
            GAME_ARENA.classList.remove('hidden');
            renderGameArena(currentGameState);
        }
    } else {
        // 進行中のゲームがない場合（ログが削除された場合）
        if (currentGameState) {
            currentGameState = null;
            GAME_ARENA.classList.add('hidden');
            PVP_LOBBY.classList.remove('hidden');
        }
        
        // ロビーリストの更新
        renderLobbyLists([], data.availableGames);
    }
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    fetchAndUpdatePvpData(); // 初回実行
    pollingInterval = setInterval(fetchAndUpdatePvpData, POLLING_RATE);
}


// --- UIレンダリング ---

// ★修正: 完了したゲームに関する処理を削除
function renderLobbyLists(finishedGames, availableGames) {
    
    // 完了したゲームのリスト表示は削除されたため、ここでは availableGames の処理のみ行う。
    
    // 参加可能なルーム
    AVAILABLE_GAME_LIST.innerHTML = availableGames.map(g => {
        return `<div class="tool-box" style="margin-bottom: 10px; padding: 10px;">
                    <p style="margin: 0; font-weight: bold;">ルーム作成者: ${g.playerA}</p>
                    <p style="margin: 0; font-size: 0.8em; color: #6c757d;">
                        勝者: +${g.winPoints || 0} P / 敗者: ${g.losePoints || 0} P / 放棄者: ${g.forfeitPoints || 0} P
                    </p>
                    <button class="action-button join-available-button" data-room-code="${g.roomCode}" style="width: auto; margin-top: 5px; background-color: #007bff;">
                        参加 (${g.roomCode})
                    </button>
                </div>`;
    }).join('');
    if (availableGames.length === 0) AVAILABLE_GAME_LIST.innerHTML = '<p>現在、参加可能なルームはありません。</p>';

    // イベントリスナーの再設定
    document.querySelectorAll('.join-available-button').forEach(btn => {
        btn.addEventListener('click', () => {
            const roomCode = btn.dataset.roomCode;
            document.getElementById('room-code').value = roomCode;
            JOIN_ROOM_FORM.dispatchEvent(new Event('submit'));
        });
    });
}


function renderGameArena(game) {
    if (!game) return;

    const myName = authenticatedUser.name;
    const isPlayerA = game.playerA === myName;
    const leaveButton = document.getElementById('leave-game-button');

    // --- 1. プレイヤー情報カードの更新 ---
    const renderPlayerCard = (player, score, shockCount, isCurrentPlayer) => {
        const shockText = '⚡'.repeat(shockCount);
        return `
            <h4 style="margin-top: 0; display: flex; justify-content: space-between;">
                ${player} ${isCurrentPlayer ? '(あなた)' : ''}
                <span class="shock-counter">${shockText}</span>
            </h4>
            <p style="margin: 0;">スコア: <strong style="color: var(--color-accent);">${score.toFixed(1)} P</strong></p>
        `;
    };
    
    PLAYER_A_CARD.innerHTML = renderPlayerCard(game.playerA, game.scoreA, game.shockCountA, game.playerA === myName);
    PLAYER_B_CARD.innerHTML = game.playerB 
        ? renderPlayerCard(game.playerB, game.scoreB, game.shockCountB, game.playerB === myName)
        : '<h4>相手プレイヤー参加待ち...</h4>';
    
    // ターンの強調表示はFINISHEDでは行わない
    const isFinished = game.status === 'FINISHED';
    PLAYER_A_CARD.classList.toggle('current-player', !isFinished && game.playerA === game.nextActionPlayer);
    PLAYER_B_CARD.classList.toggle('current-player', !isFinished && game.playerB === game.nextActionPlayer);


    // --- 2. ターンとラウンドの表示 ---
    // ★修正：アクション回数(game.round)をラウンド数(1-6)に変換して表示
    const currentRound = Math.ceil(game.round / 2);
    document.getElementById('current-round').textContent = `${currentRound}/6`;
    
    let turnText = '';
    
    if (game.status === 'WAITING_JOIN') {
        turnText = `ルームコード: ${game.roomCode}。相手プレイヤー (${game.playerB || '??? '}) の参加を待っています。`;
        CHAIR_CONTAINER.innerHTML = '';
        leaveButton.textContent = 'ルームを削除';
        leaveButton.dataset.action = 'delete'; // ★修正: data-actionを設定
    } else if (game.status === 'FINISHED') {
        
        // ★★★ 修正: 勝敗メッセージを再構築し、常に表示する ★★★
        
        const myPointChange = game.winner === myName 
            ? game.winPoints
            : (game.winner === 'DRAW' ? 0 : game.losePoints);
        
        const myResultText = game.winner === myName 
            ? '🏆 勝利!' 
            : (game.winner === 'DRAW' ? '🤝 引き分け' : '😭 敗北...');

        const opponent = myName === game.playerA ? game.playerB : game.playerA;
        
        const finalMessage = game.winner === 'DRAW' 
            ? `<span style="color: #6c757d;">ゲーム終了! ${myResultText}です。最終スコア ${game.scoreA.toFixed(1)}P vs ${game.scoreB.toFixed(1)}P。</span>`
            : `<span style="color: ${game.winner === myName ? 'var(--color-primary)' : 'var(--color-error)'};">
                ${game.winner}の${myResultText}です! 
                あなたの総合ポイントは ${myPointChange > 0 ? '+' : ''}${myPointChange.toFixed(1)} P 反映されました。
            </span>`;
            
        turnText = finalMessage;
        
        CHAIR_CONTAINER.innerHTML = '<p style="text-align: center; font-size: 1.2em; font-weight: bold; color: var(--color-primary);">ゲームは終了しました。</p>';
        
        // 終了時のボタンアクション
        leaveButton.textContent = 'ロビーに戻る (ログ削除)';
        leaveButton.dataset.action = 'delete'; 

    } else if (game.nextActionPlayer === myName) {
        // 仕掛け (WAITING_A/B) か座る (WAITING_A/B_SIT) かを判定
        const isAttackerPhase = game.status === 'WAITING_A' || game.status === 'WAITING_B';
        turnText = isAttackerPhase ? '⚡ あなたのターン: 電流を仕掛ける椅子を選んでください。' : '🪑 あなたのターン: 座る椅子を選んでください。';
        
        renderChairButtons(game.publicChairs, isAttackerPhase, game.gameId, game.actionToken);
        CHAIR_CONTAINER.classList.remove('hidden');
        leaveButton.textContent = '対戦を辞める (敗北)';
        leaveButton.dataset.action = 'forfeit';

    } else {
        turnText = `相手のターン (${game.nextActionPlayer} のアクション待ち)...`;
        CHAIR_CONTAINER.innerHTML = '<p style="text-align: center; color: #6c757d;">相手の操作を待っています...</p>';
        leaveButton.textContent = '対戦を辞める (敗北)';
        leaveButton.dataset.action = 'forfeit';
    }
    TURN_DISPLAY.innerHTML = turnText; // ★修正: HTMLタグを含むため innerHTML を使用

    // --- 3. 直前の結果表示 ---
    if (game.lastResult) {
        LAST_RESULT_DISPLAY.classList.remove('hidden');
        const isMyResult = game.lastResult.player === myName;
        
        // game.roundが次のラウンドのアクション回数になっているため、ここでは -1 して表示する
        const lastActionRound = Math.ceil((game.round - 1) / 2);

        let message = `${game.lastResult.player} がラウンド ${lastActionRound} で椅子 ${game.lastResult.points > 0 ? game.lastResult.points : '??'} に座り...`;
        
        if (game.lastResult.result === 'SHOCK') {
            message += ` ⚡ 感電! スコア没収。ショック回数 ${isMyResult ? game.shockCountA : game.shockCountB}回。`;
            LAST_RESULT_DISPLAY.style.backgroundColor = '#f8d7da'; // Redish background
        } else {
            message += ` ✅ 回避成功! ${game.lastResult.points} P獲得。`;
            LAST_RESULT_DISPLAY.style.backgroundColor = '#d4edda'; // Greenish background
        }
        
        RESULT_MESSAGE.textContent = message;
    } else {
        LAST_RESULT_DISPLAY.classList.add('hidden');
    }
}

/**
 * 椅子ボタンをレンダリングし、イベントリスナーを設定する
 */
function renderChairButtons(chairs, isAttackerPhase, gameId, actionToken) {
    CHAIR_CONTAINER.innerHTML = '';
    
    chairs.forEach(chair => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chair-button';
        button.dataset.chairId = chair.id;
        button.textContent = `${chair.id} P`;

        if (!chair.available) {
            button.disabled = true;
            button.classList.add('chosen-chair');
        } else if (isAttackerPhase) {
            // 仕掛ける側は、仕掛ける椅子を選択できる
            button.addEventListener('click', () => handleShockAction(gameId, actionToken, chair.id));
        } else {
            // 座る側は、座る椅子を選択できる
            button.addEventListener('click', () => handleChooseAction(gameId, actionToken, chair.id));
        }
        
        // 自分のアクションでない場合は、ボタンを無効化する
        if (!currentGameState || currentGameState.nextActionPlayer !== authenticatedUser.name) {
            button.disabled = true;
        }

        CHAIR_CONTAINER.appendChild(button);
    });
}


// --- アクションハンドラ (サーバー通信) ---

/**
 * ルーム作成アクション
 */
CREATE_ROOM_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('create-room-message');
    
    // ★追加: フォームからのポイント値を取得
    const winPoints = parseFloat(document.getElementById('win-points').value);
    const losePoints = parseFloat(document.getElementById('lose-points').value);
    const forfeitPoints = parseFloat(document.getElementById('forfeit-points').value);

    if (isNaN(winPoints) || isNaN(losePoints) || isNaN(forfeitPoints)) {
        showMessage(messageEl, '❌ ポイント設定は全て有効な数値で入力してください。', 'error');
        return;
    }

    showMessage(messageEl, 'ルーム作成中...', 'info');

    const response = await sendPvpAction({
        action: 'create',
        player: authenticatedUser.name,
        // ★追加: ポイント設定を送信
        pointsConfig: {
            winPoints: winPoints,
            losePoints: losePoints,
            forfeitPoints: forfeitPoints
        }
    });
    
    if (response.status === 'success') {
        showMessage(messageEl, `✅ ルームを作成しました。コード: ${response.gameData.roomCode}`, 'success');
    } else {
        showMessage(messageEl, `❌ ルーム作成エラー: ${response.message}`, 'error');
    }
    // ポーリングが自動でゲーム状態を更新
});

/**
 * ルーム参加アクション
 */
JOIN_ROOM_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('join-room-message');
    const roomCode = document.getElementById('room-code').value.toUpperCase().trim();
    showMessage(messageEl, `ルーム ${roomCode} に参加中...`, 'info');
    
    // 参加可能なゲームリストから対象ゲームIDを取得
    const pvpData = await fetchPvpData(authenticatedUser.name);
    const targetGame = pvpData.availableGames.find(g => g.roomCode === roomCode);
    
    if (!targetGame) {
        showMessage(messageEl, '❌ ルームコードが見つからないか、満室です。', 'error');
        return;
    }

    const response = await sendPvpAction({
        action: 'join',
        gameId: targetGame.gameId,
        roomCode: roomCode,
        player: authenticatedUser.name,
        actionToken: targetGame.actionToken
    });
    
    if (response.status === 'success') {
        showMessage(messageEl, `✅ ルーム ${roomCode} に参加しました。`, 'success');
        JOIN_ROOM_FORM.reset();
    } else {
        showMessage(messageEl, `❌ 参加エラー: ${response.message}`, 'error');
    }
});


/**
 * 電流を仕掛けるアクション
 */
async function handleShockAction(gameId, actionToken, chairId) {
    if (!window.confirm(`${chairId} P の椅子に電流を仕掛けますか？`)) return;

    const messageEl = document.getElementById('chair-action-message');
    showMessage(messageEl, `⚡ ${chairId} Pの椅子に電流を仕掛けています...`, 'info');
    
    // すべてのボタンを一時的に無効化
    CHAIR_CONTAINER.querySelectorAll('button').forEach(btn => btn.disabled = true);

    const response = await sendPvpAction({
        action: 'setShockChair',
        gameId: gameId,
        player: authenticatedUser.name,
        input: chairId,
        actionToken: actionToken
    });

    if (response.status === 'success') {
        // UI更新はポーリングに任せる
        showMessage(messageEl, `✅ 電流を仕掛けました。相手の操作を待ってください。`, 'success');
        currentGameState.actionToken = response.actionToken; // トークンを更新
    } else {
        // ★修正: 排他制御エラー（データが古い）の場合はメッセージ表示をスキップ
        if (response.message.includes('データが古いです')) {
             console.warn('Action rejected due to stale token (normal polling conflict). Suppressing error display.');
        } else {
            showMessage(messageEl, `❌ アクションエラー: ${response.message}`, 'error');
        }
        
        // エラー時はボタンを再度有効化
        CHAIR_CONTAINER.querySelectorAll('button').forEach(btn => btn.disabled = false);
    }
}


/**
 * 椅子に座るアクション
 */
async function handleChooseAction(gameId, actionToken, chairId) {
    if (!window.confirm(`${chairId} P の椅子に座りますか？`)) return;

    const messageEl = document.getElementById('chair-action-message');
    showMessage(messageEl, `🪑 ${chairId} Pの椅子に座ります...`, 'info');
    
    // すべてのボタンを一時的に無効化
    CHAIR_CONTAINER.querySelectorAll('button').forEach(btn => btn.disabled = true);
    
    // 選択された椅子にアニメーションクラスを追加
    const selectedButton = CHAIR_CONTAINER.querySelector(`[data-chair-id="${chairId}"]`);
    if (selectedButton) {
        selectedButton.classList.add('chosen-chair');
    }

    const response = await sendPvpAction({
        action: 'chooseChair',
        gameId: gameId,
        player: authenticatedUser.name,
        input: chairId,
        actionToken: actionToken
    });

    if (response.status === 'success') {
        // 判定結果を即座に表示
        const result = response.shockResult.result;
        if (result === 'SHOCK') {
            showMessage(messageEl, `❌ 感電! スコア没収！`, 'error');
            if (selectedButton) selectedButton.classList.add('shocked');
        } else {
            showMessage(messageEl, `✅ 回避! ${response.shockResult.points} P獲得！`, 'success');
        }
        
        currentGameState.actionToken = response.actionToken; // トークンを更新
        
        // 1.5秒後にポーリングを待たずにUIを更新 (視覚的なレスポンス向上のため)
        setTimeout(() => {
             fetchAndUpdatePvpData();
        }, 1500);

    } else {
        // ★修正: 排他制御エラー（データが古い）の場合はメッセージ表示をスキップ
        if (response.message.includes('データが古いです')) {
             console.warn('Action rejected due to stale token (normal polling conflict). Suppressing error display.');
        } else {
            showMessage(messageEl, `❌ アクションエラー: ${response.message}`, 'error');
        }

        // エラー時はボタンを再度有効化
        CHAIR_CONTAINER.querySelectorAll('button').forEach(btn => btn.disabled = false);
        if (selectedButton) {
             selectedButton.classList.remove('chosen-chair', 'shocked');
        }
    }
}


/**
 * ゲームを途中で辞める（または終了後にロビーに戻る）アクション
 */
document.getElementById('leave-game-button').addEventListener('click', async (e) => {
    // ★修正: 認証情報とゲーム状態の存在チェックを強化
    if (!currentGameState || !authenticatedUser) {
        showMessage(document.getElementById('game-message'), '❌ エラー: ゲーム状態または認証情報が見つかりません。ロビーに戻ります。', 'error');
        // 強制的にロビー状態に戻す
        currentGameState = null;
        fetchAndUpdatePvpData(); 
        return;
    }
    
    const leaveButton = e.target;
    const action = leaveButton.dataset.action; // 'delete' or 'forfeit'
    
    // actionが有効な値かチェック
    if (!['delete', 'forfeit'].includes(action)) {
        // ★修正: actionが設定されていない場合の明確なエラーメッセージ
        showMessage(document.getElementById('game-message'), '❌ エラー: アクションタイプが不明です (ルームを削除または対戦を辞める)。', 'error');
        return;
    }

    if (action === 'forfeit' && !window.confirm('対戦を途中放棄しますか？ 相手の勝利としてポイントが反映されます。')) {
        return;
    }
    
    const messageEl = document.getElementById('game-message');
    showMessage(messageEl, 'ゲームを終了しています...', 'info');
    leaveButton.disabled = true;

    const response = await sendPvpAction({
        action: action,
        gameId: currentGameState.gameId,
        player: authenticatedUser.name,
        actionToken: currentGameState.actionToken 
    });

    if (response.status === 'success') {
        showMessage(messageEl, `✅ ゲームを終了しました。ロビーに戻ります。`, 'success');
        currentGameState = null; // 状態をリセット
        fetchAndUpdatePvpData(); // ロビーを再レンダリング
    } else {
        showMessage(messageEl, `❌ 終了エラー: ${response.message}`, 'error');
    }
    leaveButton.disabled = false;
});


// --- イベントリスナー設定 ---
AUTH_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    await attemptLogin(username, password, false);
});

LOGOUT_BUTTON.addEventListener('click', handleLogout);

// --- ページロード ---
window.onload = autoLogin;
