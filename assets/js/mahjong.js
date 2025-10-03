// assets/js/mahjong.js

const FORM = document.getElementById('mahjong-form');
const PLAYER_INPUTS_CONTAINER = document.getElementById('player-inputs');
const MESSAGE_ELEMENT = document.getElementById('message');
const SUBMIT_BUTTON = document.getElementById('submit-button');

// --- 認証に必要な要素の追加 ---
const AUTH_FORM = document.getElementById('auth-form');
const MAHJONG_TOOLS = document.getElementById('mahjong-tools');
const AUTH_MESSAGE = document.getElementById('auth-message');
const MASTER_PASSWORD = "21082"; // master.jsから共通のパスワードをコピー

let PARTICIPANT_NAMES = []; 

// --- 定数：麻雀ルール ---
const POINT_RATE = 1000; // 1000点 = 1ポイント
const UMA_OKA = [-2, -1, 1, 3]; // 4位, 3位, 2位, 1位 のボーナス/ペナルティ点 (例: 10-20ウマ)
const STARTING_SCORE = 30000; // 基準点

// --- 認証機能 ---
AUTH_FORM.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = document.getElementById('auth-password').value;
    
    if (password === MASTER_PASSWORD) {
        document.getElementById('auth-section').classList.add('hidden');
        MAHJONG_TOOLS.classList.remove('hidden');
        generateForm(); // 認証成功後、フォームを生成
    } else {
        showMessage(AUTH_MESSAGE, '❌ パスワードが間違っています。', 'error');
    }
});


/**
 * 参加者リストを取得し、入力フォームを動的に生成する
 */
async function generateForm() {
    // フォームが既に表示されている前提で実行
    const scores = await fetchScores();
    if (scores.length === 0) {
        PLAYER_INPUTS_CONTAINER.innerHTML = '<p class="error">参加者リストを取得できませんでした。JSONBinの初期データを確認してください。</p>';
        return;
    }
    PARTICIPANT_NAMES = scores.map(p => p.name);

    let html = '';
    for (let i = 1; i <= 4; i++) {
        html += `
            <div class="form-group player-input-row">
                <label for="player-${i}-name">プレイヤー${i}:</label>
                <select id="player-${i}-name" required>
                    <option value="" disabled selected>名前を選択</option>
                    ${PARTICIPANT_NAMES.map(name => `<option value="${name}">${name}</option>`).join('')}
                </select>
                <input type="number" id="player-${i}-score" placeholder="最終得点 (例: 32500)" required>
            </div>
        `;
    }
    PLAYER_INPUTS_CONTAINER.innerHTML = html;
}

/**
 * フォームのバリデーションと計算、JSONBinへのデータ送信
 */
FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // フォームデータ収集とバリデーション
    const results = [];
    const selectedNames = new Set();
    let totalScore = 0;

    for (let i = 1; i <= 4; i++) {
        const nameElement = document.getElementById(`player-${i}-name`);
        const scoreElement = document.getElementById(`player-${i}-score`);

        const name = nameElement.value;
        const score = parseInt(scoreElement.value, 10);
        
        if (!name || isNaN(score) || score < 0) {
            showMessage(MESSAGE_ELEMENT, 'エラー: 名前を選択し、有効な得点を入力してください。', 'error');
            return;
        }

        if (selectedNames.has(name)) {
            showMessage(MESSAGE_ELEMENT, 'エラー: 参加者が重複しています。', 'error');
            return;
        }
        selectedNames.add(name);
        results.push({ name, score });
        totalScore += score;
    }
    
    // 合計点チェック (100点の誤差は四捨五入などで生じるため、多少は許容する場合もあるが、厳密にチェック)
    if (totalScore < 119900 || totalScore > 120100) { 
        showMessage(MESSAGE_ELEMENT, `警告: 合計点が ${totalScore} です。120000点周辺ではありません。計算を再確認してください。`, 'warning');
    }

    const memo = document.getElementById('memo').value;
    
    // フォームを無効化
    SUBMIT_BUTTON.disabled = true;
    SUBMIT_BUTTON.textContent = '送信中...';
    showMessage(MESSAGE_ELEMENT, '結果を計算し、JSONBinに送信中...', 'info');

    // 1. JSONBinから最新の全データを取得
    const currentData = await fetchAllData();
    let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p.score]));
    
    // 2. 麻雀結果の計算とスコアの更新
    results.sort((a, b) => b.score - a.score); // 順位を決定
    
    const gameId = Date.now();
    const historyEntry = {
        timestamp: new Date().toISOString(),
        ranks: [results[0].name, results[1].name, results[2].name, results[3].name],
        changes: [],
        memo: memo,
        gameId: gameId
    };
    
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const rankIndex = i; // 0, 1, 2, 3

        // 基準点との差を計算
        const pointDifference = (result.score - STARTING_SCORE) / POINT_RATE;
        
        // ウマ・オカを適用
        const bonusPoint = UMA_OKA[rankIndex];
        
        // 最終的なポイント変動
        const finalPointChange = pointDifference + bonusPoint;
        
        // 履歴記録用のポイント変動を保存
        historyEntry.changes.push({name: result.name, change: finalPointChange});
        
        // 合計スコアを更新
        const currentScore = currentScoresMap.get(result.name) || 0;
        const newScore = currentScore + finalPointChange;
        currentScoresMap.set(result.name, newScore);
    }

    // 3. 新しいデータを構成
    const newScores = Array.from(currentScoresMap.entries()).map(([name, score]) => ({ name, score }));
    const newHistory = [...currentData.history, historyEntry];

    const newData = {
        scores: newScores,
        history: newHistory
    };

    // 4. JSONBinに新しい全データをPUTで上書き
    const response = await updateAllData(newData);

    // 応答の処理
    if (response.status === 'success') {
        showMessage(MESSAGE_ELEMENT, `✅ 成功! ポイントが更新されました。`, 'success');
        
        // 成功したらランキングページへリダイレクト
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
    } else {
        showMessage(MESSAGE_ELEMENT, `❌ 処理エラー: ${response.message}`, 'error');
    }
    
    // エラー時はフォームを再度有効化
    SUBMIT_BUTTON.disabled = false;
    SUBMIT_BUTTON.textContent = '結果を反映する';
});


/**
 * メッセージを表示するヘルパー関数
 */
function showMessage(element, text, type) {
    element.textContent = text;
    element.className = type; 
    element.classList.remove('hidden');
}

// ページ読み込み時にフォームの生成は行わず、認証を待つ
