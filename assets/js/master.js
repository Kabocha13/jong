// assets/js/master.js

const AUTH_FORM = document.getElementById('auth-form');
const ADMIN_TOOLS = document.getElementById('admin-tools');
const AUTH_MESSAGE = document.getElementById('auth-message');
const TARGET_PLAYER_SELECT = document.getElementById('target-player');

// --- 認証機能 ---

AUTH_FORM.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = document.getElementById('password').value;
    
    if (password === MASTER_PASSWORD) {
        document.getElementById('auth-section').classList.add('hidden');
        ADMIN_TOOLS.classList.remove('hidden');
        loadPlayerList(); // 認証成功後、プレイヤーリストをロード
    } else {
        showMessage(AUTH_MESSAGE, '❌ パスワードが間違っています。', 'error');
    }
});

// --- プレイヤーリストのロード（ポイント調整用）---

async function loadPlayerList() {
    TARGET_PLAYER_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    const scores = await fetchScores(); // common.js からスコアを取得

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

// --- 1. 新規プレイヤー登録機能 ---

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('new-player-name');
    const scoreInput = document.getElementById('initial-score');
    const name = nameInput.value.trim();
    const score = parseFloat(scoreInput.value);

    if (!name || isNaN(score)) {
        showMessage(document.getElementById('register-message'), 'エラー: 名前と有効なポイントを入力してください。', 'error');
        return;
    }

    showMessage(document.getElementById('register-message'), 'プレイヤー登録を処理中...', 'info');
    
    // 既存のデータを取得
    const currentData = await fetchAllData();
    const existingNames = currentData.scores.map(p => p.name.toLowerCase());

    if (existingNames.includes(name.toLowerCase())) {
        showMessage(document.getElementById('register-message'), `エラー: ${name} は既に登録されています。`, 'error');
        return;
    }

    // 新しいプレイヤーを追加
    const newPlayer = { name: name, score: score };
    const newScores = [...currentData.scores, newPlayer];

    const newData = {
        scores: newScores,
        history: currentData.history, // 履歴はそのまま
        // ★ 修正: sports_bets を保持する ★
        sports_bets: currentData.sports_bets || [] 
    };

    // JSONBinに書き込み
    const response = await updateAllData(newData);

    if (response.status === 'success') {
        showMessage(document.getElementById('register-message'), `✅ ${name} を初期 ${score} Pで登録しました。`, 'success');
        nameInput.value = '';
        scoreInput.value = 7.0;
        loadPlayerList(); // プレイヤーリストを更新
    } else {
        showMessage(document.getElementById('register-message'), `❌ 登録エラー: ${response.message}`, 'error');
    }
});

// --- 2. 特殊ポイント調整機能 ---

document.getElementById('adjustment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const player = TARGET_PLAYER_SELECT.value;
    const amount = parseFloat(document.getElementById('adjust-amount').value);
    const reason = document.getElementById('adjust-reason').value.trim();

    if (!player || isNaN(amount) || !reason) {
        showMessage(document.getElementById('adjustment-message'), 'エラー: 全ての項目を入力してください。', 'error');
        return;
    }

    showMessage(document.getElementById('adjustment-message'), 'ポイント調整を処理中...', 'info');

    // 既存のデータを取得
    const currentData = await fetchAllData();
    let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p.score]));
    
    // スコアを更新
    const currentScore = currentScoresMap.get(player) || 0;
    const newScore = currentScore + amount;
    currentScoresMap.set(player, newScore);

    // 履歴エントリーを作成
    const historyEntry = {
        timestamp: new Date().toISOString(),
        ranks: ['ADMIN'], // 管理者による調整であることを示す
        changes: [{name: player, change: amount}],
        memo: `[調整] ${reason}`,
        gameId: Date.now()
    };

    // 新しいデータを作成
    const newScores = Array.from(currentScoresMap.entries()).map(([name, score]) => ({ name, score }));
    const newHistory = [...currentData.history, historyEntry];
    
    const newData = {
        scores: newScores,
        history: newHistory,
        // ★ 修正: sports_bets を保持する ★
        sports_bets: currentData.sports_bets 
    };

    // JSONBinに書き込み
    const response = await updateAllData(newData);

    if (response.status === 'success') {
        showMessage(document.getElementById('adjustment-message'), `✅ ${player} のポイントを ${amount} P 調整しました。`, 'success');
        
        // フォームをリセットし、プレイヤーリストを更新
        document.getElementById('adjustment-form').reset();
        loadPlayerList();
    } else {
        showMessage(document.getElementById('adjustment-message'), `❌ 調整エラー: ${response.message}`, 'error');
    }
});


/**
 * メッセージを表示するヘルパー関数
 */
function showMessage(element, text, type) {
    element.textContent = text;
    element.className = type; 
    element.classList.remove('hidden');
}
