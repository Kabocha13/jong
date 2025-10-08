// assets/js/master.js

const AUTH_FORM = document.getElementById('auth-form');
const ADMIN_TOOLS = document.getElementById('admin-tools');
const AUTH_MESSAGE = document.getElementById('auth-message');
const TARGET_PLAYER_SELECT = document.getElementById('target-player');

// ★ 新規追加要素
const RACE_RECORD_FORM = document.getElementById('race-record-form');
const RACE_RECORD_HOLDER_SELECT = document.getElementById('race-record-holder');


// --- 認証機能 ---

AUTH_FORM.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = document.getElementById('password').value;
    
    if (password === MASTER_PASSWORD) {
        document.getElementById('auth-section').classList.add('hidden');
        ADMIN_TOOLS.classList.remove('hidden');
        loadPlayerList(); // 認証成功後、プレイヤーリストをロード
        loadRaceRecordHolders(); // ★ 追加: 記録保持者リストをロード
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

// --- ★ 新規追加: レース記録保持者リストのロード ---

async function loadRaceRecordHolders() {
    RACE_RECORD_HOLDER_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    const scores = await fetchScores(); // common.js からスコアを取得

    if (scores.length === 0) {
        RACE_RECORD_HOLDER_SELECT.innerHTML = '<option value="" disabled selected>リストの取得に失敗</option>';
        return;
    }

    let options = '<option value="" disabled selected>記録保持者を選択</option>';
    scores.forEach(player => {
        // ポイントは不要なので名前のみ
        options += `<option value="${player.name}">${player.name}</option>`;
    });

    RACE_RECORD_HOLDER_SELECT.innerHTML = options;
}

// --- 1. 新規プレイヤー登録機能 (変更なし) ---

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
        history: currentData.history, 
        sports_bets: currentData.sports_bets || [],
        speedstorm_records: currentData.speedstorm_records || [] // ★ レース記録も保持
    };

    // JSONBinに書き込み
    const response = await updateAllData(newData);

    if (response.status === 'success') {
        showMessage(document.getElementById('register-message'), `✅ ${name} を初期 ${score} Pで登録しました。`, 'success');
        nameInput.value = '';
        scoreInput.value = 7.0;
        loadPlayerList(); // プレイヤーリストを更新
        loadRaceRecordHolders(); // ★ レース記録保持者リストも更新
    } else {
        showMessage(document.getElementById('register-message'), `❌ 登録エラー: ${response.message}`, 'error');
    }
});

// --- 2. 特殊ポイント調整機能 (修正済み) ---

document.getElementById('adjustment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const player = TARGET_PLAYER_SELECT.value;
    const amount = parseFloat(document.getElementById('adjust-amount').value);
    // 理由欄を削除したため、空文字列で代替
    const reason = ''; 

    if (!player || isNaN(amount)) {
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
        // 理由フィールドを削除したため、メモ内容を修正
        memo: `[調整] 管理者によるポイント調整: ${amount > 0 ? '+' : ''}${amount.toFixed(1)} P`,
        gameId: Date.now()
    };
    // 理由テキストが空でない場合のみ、メモに追加（今回は常に空だが、念のためロジックを残す）
    if (reason) {
        historyEntry.memo += `: ${reason}`;
    }

    // 新しいデータを作成
    const newScores = Array.from(currentScoresMap.entries()).map(([name, score]) => ({ name, score }));
    const newHistory = [...currentData.history, historyEntry];
    
    const newData = {
        scores: newScores,
        history: newHistory,
        sports_bets: currentData.sports_bets, 
        speedstorm_records: currentData.speedstorm_records || [] // ★ レース記録も保持
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

// --- 3. 全員一律ポイント減算機能 (変更なし) ---

document.getElementById('global-penalty-button').addEventListener('click', async () => {
    const penaltyAmount = -1.0;
    const messageEl = document.getElementById('global-penalty-message');

    if (!confirm(`全てのプレイヤーの得点を一律で ${penaltyAmount} P 減らします。よろしいですか？`)) {
        return;
    }

    // ボタンを無効化し、処理メッセージを表示
    const button = document.getElementById('global-penalty-button');
    button.disabled = true;
    showMessage(messageEl, '全体ポイント減算を処理中...', 'info');
    
    try {
        const currentData = await fetchAllData();
        let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p.score]));
        let historyChanges = [];

        // 全プレイヤーに対して減算処理を実行
        currentData.scores.forEach(player => {
            const newScore = player.score + penaltyAmount; // penaltyAmountは負の値
            currentScoresMap.set(player.name, newScore);
            
            historyChanges.push({
                name: player.name, 
                change: penaltyAmount
            });
        });

        // 履歴エントリーを作成
        const historyEntry = {
            timestamp: new Date().toISOString(),
            ranks: ['ADMIN'], 
            changes: historyChanges,
            memo: `[全体調整] 全プレイヤーに ${penaltyAmount} Pのペナルティを適用。`,
            gameId: `GLOBAL-PENALTY-${Date.now()}`
        };

        // 新しいデータを作成 (sports_bets, speedstorm_records を忘れずに含める)
        const newScores = Array.from(currentScoresMap.entries()).map(([name, score]) => ({ name, score }));
        const newHistory = [...currentData.history, historyEntry];
        
        const newData = {
            scores: newScores,
            history: newHistory,
            sports_bets: currentData.sports_bets,
            speedstorm_records: currentData.speedstorm_records || [] // ★ レース記録も保持
        };

        // JSONBinに書き込み
        const response = await updateAllData(newData);

        if (response.status === 'success') {
            showMessage(messageEl, `✅ 全員から ${Math.abs(penaltyAmount)} P の減算を完了しました。`, 'success');
            loadPlayerList(); // プレイヤーリストを更新
        } else {
            showMessage(messageEl, `❌ 減算エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    } finally {
        button.disabled = false;
    }
});


// --- ★ 新規追加: スピードストーム レコード管理機能 ---

// タイム文字列 (例: "0:46.965" または "46.965") をミリ秒に変換するヘルパー関数
function timeToMilliseconds(timeString) {
    if (!timeString) return NaN;

    const parts = timeString.split(':');
    let minutes = 0;
    let seconds = 0;

    if (parts.length === 2) {
        minutes = parseInt(parts[0], 10);
        seconds = parseFloat(parts[1]);
    } else if (parts.length === 1) {
        seconds = parseFloat(parts[0]);
    } else {
        return NaN;
    }

    if (isNaN(minutes) || isNaN(seconds)) return NaN;
    
    // 少数点以下をミリ秒として扱う
    // 例: 46.965 -> 46965ミリ秒
    return Math.round((minutes * 60 + seconds) * 1000);
}

// ミリ秒を "分:秒.ミリ秒" 形式にフォーマットするヘルパー関数
function formatMilliseconds(ms) {
    if (isNaN(ms) || ms < 0) return 'N/A';
    
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    // 秒を xx.xxx の形式でフォーマット
    const formattedSeconds = seconds.toFixed(3);
    
    if (minutes > 0) {
        // 秒の部分はゼロ埋め（例: 01.234）にする
        const secPart = seconds < 10 ? '0' + formattedSeconds : formattedSeconds;
        return `${minutes}:${secPart}`;
    } else {
        return formattedSeconds;
    }
}


RACE_RECORD_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('race-record-message');
    const courseName = document.getElementById('race-course-name').value.trim();
    const timeString = document.getElementById('race-best-time').value.trim();
    const recordHolder = RACE_RECORD_HOLDER_SELECT.value;
    
    const newTimeMs = timeToMilliseconds(timeString);

    if (!courseName || isNaN(newTimeMs) || !recordHolder || newTimeMs <= 0) {
        showMessage(messageEl, 'エラー: 全ての項目を正しく入力してください (タイムは分:秒.ミリ秒 または 秒.ミリ秒 形式)。', 'error');
        return;
    }

    showMessage(messageEl, 'レース記録を更新中...', 'info');

    try {
        const currentData = await fetchAllData();
        let records = currentData.speedstorm_records || [];
        
        // 既存のコースを探す
        const existingIndex = records.findIndex(r => r.courseName === courseName);
        
        const newRecord = {
            courseName: courseName,
            bestTimeMs: newTimeMs,
            bestTime: formatMilliseconds(newTimeMs), // 表示用フォーマット
            holder: recordHolder,
            timestamp: new Date().toISOString()
        };

        let logMessage = '';
        // ★ ポイント付与のためのフラグと変数を追加 ★
        let shouldAwardPoints = false;
        const AWARD_POINTS = 5.0; // 記録更新時の付与ポイント

        if (existingIndex !== -1) {
            const existingRecord = records[existingIndex];
            if (newTimeMs < existingRecord.bestTimeMs) {
                // 既存記録より早い場合、更新
                records[existingIndex] = newRecord;
                logMessage = `✅ 記録を更新しました: ${courseName} | ${existingRecord.bestTime} (旧) → ${newRecord.bestTime} (新)`;
                shouldAwardPoints = true; // ポイント付与フラグを立てる
            } else if (newTimeMs === existingRecord.bestTimeMs && recordHolder !== existingRecord.holder) {
                // 同タイムで別人が記録した場合（保持者変更）も更新し、ポイント付与
                records[existingIndex] = newRecord;
                logMessage = `✅ 同タイムで記録を更新（保持者変更）しました: ${newRecord.bestTime}`;
                shouldAwardPoints = true; // ポイント付与フラグを立てる
            } else {
                // 既存記録より遅い場合、拒否
                showMessage(messageEl, `❌ 記録は更新されませんでした。入力された ${newRecord.bestTime} は既存の記録 ${existingRecord.bestTime} より遅いです。`, 'error');
                return;
            }
        } else {
            // 新規コース追加
            records.push(newRecord);
            logMessage = `✅ 新規コース ${courseName} の記録を登録しました: ${newRecord.bestTime}`;
            shouldAwardPoints = true; // ポイント付与フラグを立てる
        }

        // 記録をタイムの昇順でソート
        records.sort((a, b) => a.bestTimeMs - b.bestTimeMs);

        // ★ ポイント付与処理を追加 ★
        let historyChanges = [];
        let newScores = currentData.scores;

        if (shouldAwardPoints) {
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p.score]));
            
            // 1. 記録保持者にポイントを付与 (5.0 P)
            const currentScore = currentScoresMap.get(recordHolder) || 0;
            currentScoresMap.set(recordHolder, currentScore + AWARD_POINTS);
            
            // 履歴変更を記録
            historyChanges.push({name: recordHolder, change: AWARD_POINTS});
            
            // === ★ 追加要件: Kabochaに1P追加 ★ ===
            const KABOCHA_NAME = "Kabocha"; 
            const KABOCHA_BONUS = 1.0;     
            
            // Kabochaに1Pを追加 (Kabochaが存在する場合のみ)
            if (currentScoresMap.has(KABOCHA_NAME)) {
                const kabochaCurrentScore = currentScoresMap.get(KABOCHA_NAME);
                currentScoresMap.set(KABOCHA_NAME, kabochaCurrentScore + KABOCHA_BONUS);
                historyChanges.push({name: KABOCHA_NAME, change: KABOCHA_BONUS});
                logMessage += ` (報酬: ${AWARD_POINTS} P + ${KABOCHA_NAME}に ${KABOCHA_BONUS} P)`; // ログメッセージを更新
            } else {
                 logMessage += ` (報酬: ${AWARD_POINTS} P)`;
            }
            // === ★ 追加要件 終了 ★ ===


            // スコア配列を更新
            newScores = Array.from(currentScoresMap.entries()).map(([name, score]) => ({ 
                name, 
                score: parseFloat(score.toFixed(1)) // スコアを丸める
            }));

            // 履歴エントリーを作成
            const historyEntry = {
                timestamp: new Date().toISOString(),
                ranks: ['RACE_RECORD'], 
                // historyChangesには記録保持者とKabochaの両方の変更が含まれる
                changes: historyChanges,
                memo: `[レース記録] ${courseName} のベストタイム (${newRecord.bestTime}) を更新し、${recordHolder} に ${AWARD_POINTS} P ${currentScoresMap.has(KABOCHA_NAME) ? `+ ${KABOCHA_NAME} に ${KABOCHA_BONUS} P` : ''} 付与。`,
                gameId: `RACE-${Date.now()}`
            };
            currentData.history.push(historyEntry);
        }


        // 新しいデータを作成
        const newData = {
            scores: newScores, // 更新されたスコア
            history: currentData.history, // 更新された履歴
            sports_bets: currentData.sports_bets,
            speedstorm_records: records // 更新された記録リスト
        };

        // JSONBinに書き込み
        const response = await updateAllData(newData);

        if (response.status === 'success') {
            showMessage(messageEl, logMessage, 'success');
            // フォームをリセット
            RACE_RECORD_FORM.reset();
            // プレイヤーリストも更新（ポイントが変更されたため）
            loadPlayerList();
        } else {
            showMessage(messageEl, `❌ 更新エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
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
