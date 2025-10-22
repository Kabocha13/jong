// assets/js/master.js

const AUTH_FORM = document.getElementById('auth-form');
const ADMIN_TOOLS = document.getElementById('admin-tools');
const AUTH_MESSAGE = document.getElementById('auth-message');
const TARGET_PLAYER_SELECT = document.getElementById('target-player');

// ★ 新規プレイヤー登録フォーム (master.htmlにパスワードフィールドを追加)
const REGISTER_FORM = document.getElementById('register-form');


// ★ 送金機能 (既存)
const TRANSFER_FORM = document.getElementById('transfer-form');
const SENDER_PLAYER_SELECT = document.getElementById('sender-player');
const RECEIVER_PLAYER_SELECT = document.getElementById('receiver-player');

// ★ レース記録機能 (修正)
const RACE_RECORD_FORM = document.getElementById('race-record-form');
const RACE_RECORD_HOLDER_SELECT = document.getElementById('race-record-holder');
// ★ 修正: コース名入力フィールドをプルダウンに変更
const RACE_COURSE_SELECT = document.getElementById('race-course-select'); 


// ★ スポーツくじ管理機能 (大幅修正)
const BET_LIST_CONTAINER = document.getElementById('bet-list-container');
const CREATE_BET_FORM = document.getElementById('create-bet-form');
// 廃止された要素: GENERIC_ODDS_CONTAINER, ADD_GENERIC_ODDS_BUTTON 

// ★★★ 麻雀結果入力機能 (新規追加) ★★★
const MAHJONG_FORM = document.getElementById('mahjong-form');
const MAHJONG_PLAYER_INPUTS_CONTAINER = document.getElementById('mahjong-player-inputs');
const MAHJONG_MESSAGE_ELEMENT = document.getElementById('mahjong-message');
const MAHJONG_SUBMIT_BUTTON = document.getElementById('mahjong-submit-button');

// --- 定数：麻雀ルール (mahjong.jsから移動) ---
const POINT_RATE = 3000; // 1000点 = 1ポイント
const UMA_OKA = [-2, -1, 1, 3]; // 4位, 3位, 2位, 1位 のボーナス/ペナルティ点 (例: 10-20ウマ)
const STARTING_SCORE = 30000; // 基準点
let ALL_PLAYER_NAMES = []; // 全プレイヤー名を保持


// --- 認証機能 (変更なし) ---

AUTH_FORM.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = document.getElementById('password').value;
    
    if (password === MASTER_PASSWORD) {
        document.getElementById('auth-section').classList.add('hidden');
        ADMIN_TOOLS.classList.remove('hidden');
        loadPlayerList(); // ポイント調整用
        loadTransferPlayerLists(); // 送金用
        loadRaceRecordHolders(); // レース記録保持者用
        loadRaceCourses(); // ★ 追加: レースコースプルダウンをロード
        initializeSportsMasterTools(); // スポーツくじ管理 (修正)
        loadMahjongForm(); // ★ 追加: 麻雀フォームをロード
    } else {
        showMessage(AUTH_MESSAGE, '❌ パスワードが間違っています。', 'error');
    }
});


// --- 新規プレイヤー登録機能 (変更なし) ---

REGISTER_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('register-message');
    const newPlayerName = document.getElementById('new-player-name').value.trim();
    const newPlayerPass = document.getElementById('new-player-pass').value.trim(); // パスワードを取得
    const initialScore = parseFloat(document.getElementById('initial-score').value);

    if (!newPlayerName || !newPlayerPass || isNaN(initialScore)) {
        showMessage(messageEl, 'エラー: 名前、パスワード、および有効な初期ポイントを入力してください。', 'error');
        return;
    }

    try {
        const currentData = await fetchAllData();
        const existingPlayer = currentData.scores.find(p => p.name === newPlayerName);

        if (existingPlayer) {
            showMessage(messageEl, 'エラー: その名前のプレイヤーは既に存在します。', 'error');
            return;
        }

        const newPlayer = {
            name: newPlayerName,
            score: initialScore,
            pass: newPlayerPass, // ★ パスワードフィールドを追加
        };

        currentData.scores.push(newPlayer);
        
        const historyEntry = {
            timestamp: new Date().toISOString(),
            ranks: ['ADMIN'],
            changes: [{name: newPlayerName, change: initialScore}],
            memo: `[新規登録] ${newPlayerName} を ${initialScore.toFixed(1)} Pで登録。`,
            gameId: `REGISTER-${Date.now()}`
        };
        currentData.history.push(historyEntry);

        const response = await updateAllData(currentData);

        if (response.status === 'success') {
            showMessage(messageEl, `✅ ${newPlayerName} を ${initialScore.toFixed(1)} Pで登録しました。`, 'success');
            REGISTER_FORM.reset();
            loadPlayerList(); // リストを更新
            loadTransferPlayerLists();
            loadMahjongForm();
        } else {
            showMessage(messageEl, `❌ 登録エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    }
});

// --- プレイヤーリストのロード関数群 (変更なし) ---

async function fetchAndSetPlayerNames() {
    // fetchScores()はcommon.jsから全データを取得しscoresのみを返す
    const scores = await fetchScores(); 
    if (scores.length === 0) {
        return false;
    }
    ALL_PLAYER_NAMES = scores.map(p => p.name);
    return true;
}

// ポイント調整用リストのロード（既存）
async function loadPlayerList() {
    TARGET_PLAYER_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    const scores = await fetchScores();

    if (scores.length === 0) {
        TARGET_PLAYER_SELECT.innerHTML = '<option value="" disabled selected>リストの取得に失敗</option>';
        return;
    }

    let options = '<option value="" disabled selected>プレイヤーを選択</option>';
    // scoreにはpassフィールドは含まれない（fetchScores()の戻り値がscores配列全体ではないため）が、ここではnameとscoreのみで良い。
    scores.forEach(player => { 
        options += `<option value="${player.name}">${player.name} (${player.score.toFixed(1)} P)</option>`;
    });

    TARGET_PLAYER_SELECT.innerHTML = options;
}

// 送金プレイヤーリストのロード（既存）
async function loadTransferPlayerLists() {
    SENDER_PLAYER_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    RECEIVER_PLAYER_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    
    const scores = await fetchScores();

    if (scores.length === 0) {
        const fallback = '<option value="" disabled selected>リストの取得に失敗</option>';
        SENDER_PLAYER_SELECT.innerHTML = fallback;
        RECEIVER_PLAYER_SELECT.innerHTML = fallback;
        return;
    }

    let options = '<option value="" disabled selected>プレイヤーを選択</option>';
    scores.forEach(player => {
        options += `<option value="${player.name}">${player.name}</option>`;
    });

    SENDER_PLAYER_SELECT.innerHTML = options;
    RECEIVER_PLAYER_SELECT.innerHTML = options;
}

// レース記録保持者リストのロード（既存）
async function loadRaceRecordHolders() {
    RACE_RECORD_HOLDER_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    const scores = await fetchScores();

    if (scores.length === 0) {
        RACE_RECORD_HOLDER_SELECT.innerHTML = '<option value="" disabled selected>リストの取得に失敗</option>';
        return;
    }

    let options = '<option value="" disabled selected>記録保持者を選択</option>';
    scores.forEach(player => {
        options += `<option value="${player.name}">${player.name}</option>`;
    });

    RACE_RECORD_HOLDER_SELECT.innerHTML = options;
}

// 既存コースリストをロードする関数 (変更なし)
async function loadRaceCourses() {
    RACE_COURSE_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    
    try {
        const allData = await fetchAllData();
        const records = allData.speedstorm_records || [];
        
        // 既存のコース名リストを重複なく取得
        const courseNames = [...new Set(records.map(r => r.courseName))].sort();

        if (courseNames.length === 0) {
            RACE_COURSE_SELECT.innerHTML = '<option value="" disabled selected>コースが未登録です</option>';
        } else {
            let options = '<option value="" disabled selected>更新するコースを選択</option>';
            courseNames.forEach(name => {
                options += `<option value="${name}">${name}</option>`;
            });
            RACE_COURSE_SELECT.innerHTML = options;
        }
    } catch (error) {
        console.error("レースコースリストのロード中にエラー:", error);
        RACE_COURSE_SELECT.innerHTML = '<option value="" disabled selected>リストの取得に失敗</option>';
    }
}


// --- 麻雀結果フォーム生成/処理 (変更なし) ---
async function loadMahjongForm() {
    const success = await fetchAndSetPlayerNames();

    if (!success) {
        MAHJONG_PLAYER_INPUTS_CONTAINER.innerHTML = '<p class="error">参加者リストを取得できませんでした。</p>';
        return;
    }

    let html = '';
    for (let i = 1; i <= 4; i++) {
        html += `
            <div class="form-group player-input-row">
                <label for="mahjong-player-${i}-name">プレイヤー${i}:</label>
                <select id="mahjong-player-${i}-name" required>
                    <option value="" disabled selected>名前を選択</option>
                    ${ALL_PLAYER_NAMES.map(name => `<option value="${name}">${name}</option>`).join('')}
                </select>
                <input type="number" id="mahjong-player-${i}-score" placeholder="最終得点 (例: 32500)" required>
            </div>
        `;
    }
    MAHJONG_PLAYER_INPUTS_CONTAINER.innerHTML = html;
}

MAHJONG_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const results = [];
    const selectedNames = new Set();
    let totalScore = 0;

    for (let i = 1; i <= 4; i++) {
        const nameElement = document.getElementById(`mahjong-player-${i}-name`);
        const scoreElement = document.getElementById(`mahjong-player-${i}-score`);

        const name = nameElement.value;
        const score = parseInt(scoreElement.value, 10);
        
        if (!name || isNaN(score) || score < 0) {
            showMessage(MAHJONG_MESSAGE_ELEMENT, 'エラー: 名前を選択し、有効な得点を入力してください。', 'error');
            return;
        }

        if (selectedNames.has(name)) {
            showMessage(MAHJONG_MESSAGE_ELEMENT, 'エラー: 参加者が重複しています。', 'error');
            return;
        }
        selectedNames.add(name);
        results.push({ name, score });
        totalScore += score;
    }
    
    if (totalScore < 119900 || totalScore > 120100) { 
        showMessage(MAHJONG_MESSAGE_ELEMENT, `警告: 合計点が ${totalScore} です。120000点周辺ではありません。計算を再確認してください。`, 'error');
    }

    const memo = document.getElementById('mahjong-memo').value;
    
    MAHJONG_SUBMIT_BUTTON.disabled = true;
    MAHJONG_SUBMIT_BUTTON.textContent = '送信中...';
    showMessage(MAHJONG_MESSAGE_ELEMENT, '結果を計算し、JSONBinに送信中...', 'info');

    try {
        const currentData = await fetchAllData();
        // passフィールドを保持するために、scores全体をマップとして処理
        let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p])); 
        
        results.sort((a, b) => b.score - a.score);
        
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
            const rankIndex = i;

            const pointDifference = (result.score - STARTING_SCORE) / POINT_RATE;
            const bonusPoint = UMA_OKA[rankIndex];
            const finalPointChange = pointDifference + bonusPoint;
            
            historyEntry.changes.push({name: result.name, change: parseFloat(finalPointChange.toFixed(1))});
            
            const currentPlayer = currentScoresMap.get(result.name);
            if (currentPlayer) {
                const currentScore = currentPlayer.score || 0;
                const newScore = currentScore + finalPointChange;
                // passフィールドを保持したままscoreを更新
                currentScoresMap.set(result.name, { ...currentPlayer, score: parseFloat(newScore.toFixed(1)) });
            }
        }

        // scores配列を再構築
        const newScores = Array.from(currentScoresMap.values());
        const newHistory = [...currentData.history, historyEntry];

        // 麻雀結果にはsports_betsとspeedstorm_recordsを含める
        const newData = {
            scores: newScores, // ★ passフィールドを保持したscores
            history: newHistory,
            sports_bets: currentData.sports_bets || [],
            speedstorm_records: currentData.speedstorm_records || []
        };

        const response = await updateAllData(newData);

        if (response.status === 'success') {
            showMessage(MAHJONG_MESSAGE_ELEMENT, `✅ 成功! ポイントが更新されました。`, 'success');
            // フォームをリセットして再ロード
            MAHJONG_FORM.reset();
            loadPlayerList(); // ポイント調整リストを更新
            loadTransferPlayerLists(); // 送金リストを更新
            loadMahjongForm(); // 麻雀フォームをリセット
        } else {
            showMessage(MAHJONG_MESSAGE_ELEMENT, `❌ 処理エラー: ${response.message}`, 'error');
        }
        
    } catch (error) {
        console.error("麻雀結果処理中にエラー:", error);
        showMessage(MAHJONG_MESSAGE_ELEMENT, `❌ サーバーエラー: ${error.message}`, 'error');
    } finally {
        MAHJONG_SUBMIT_BUTTON.disabled = false;
        MAHJONG_SUBMIT_BUTTON.textContent = '結果を反映する';
    }
});
// --- 麻雀結果フォーム処理 終了 ---


// --- スポーツくじ管理機能 (大幅修正) ---

async function initializeSportsMasterTools() {
    // オッズ追加ボタンの初期化は不要になった
    // デフォルトで現在時刻から1時間後に締切を設定
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const deadlineInput = document.getElementById('deadline-datetime');
    if (deadlineInput) {
        deadlineInput.value = formatDateTimeLocal(now);
    }

    await loadBettingData();
}

/**
 * Dateオブジェクトを <input type="datetime-local"> 形式の文字列にフォーマット
 */
function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}


async function loadBettingData() {
    const data = await fetchAllData();
    const allBets = data.sports_bets || []; 
    renderBetList(allBets);
}


// --- 3. ポイント送金機能 (変更なし) ---
TRANSFER_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('transfer-message');
    const sender = SENDER_PLAYER_SELECT.value;
    const receiver = RECEIVER_PLAYER_SELECT.value;
    const amount = parseFloat(document.getElementById('transfer-amount').value);

    if (!sender || !receiver || isNaN(amount) || amount <= 0) {
        showMessage(messageEl, 'エラー: 送金元、送金先、および有効なポイントを入力してください。', 'error');
        return;
    }
    if (sender === receiver) {
        showMessage(messageEl, 'エラー: 送金元と送金先は異なるプレイヤーである必要があります。', 'error');
        return;
    }

    showMessage(messageEl, 'ポイント送金を処理中...', 'info');

    try {
        const currentData = await fetchAllData();
        // passフィールドを保持するために、scores全体をマップとして処理
        let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
        
        const senderPlayer = currentScoresMap.get(sender);
        const receiverPlayer = currentScoresMap.get(receiver);
        
        if (!senderPlayer) {
            showMessage(messageEl, `エラー: 送金元 ${sender} のデータが見つかりません。`, 'error');
            return;
        }

        const senderScore = senderPlayer.score || 0;
        
        if (senderScore < amount) {
            showMessage(messageEl, `エラー: ${sender} の残高 (${senderScore.toFixed(1)} P) が不足しています。`, 'error');
            return;
        }

        // 送信元スコアを更新
        currentScoresMap.set(sender, { ...senderPlayer, score: parseFloat((senderScore - amount).toFixed(1)) });
        
        // 受信先スコアを更新（存在しない場合は初期化）
        if (receiverPlayer) {
            const receiverScore = receiverPlayer.score || 0;
            currentScoresMap.set(receiver, { ...receiverPlayer, score: parseFloat((receiverScore + amount).toFixed(1)) });
        } else {
             // 存在しないプレイヤーに送金しようとした場合はエラーとするか、新規登録として扱う。
             // 今回は、プレイヤーリストから選択するため、基本は存在するはず。
             showMessage(messageEl, `エラー: 送金先 ${receiver} のデータが見つかりません。`, 'error');
             return;
        }

        const historyEntry = {
            timestamp: new Date().toISOString(),
            ranks: ['TRANSFER'],
            changes: [
                {name: sender, change: -amount},
                {name: receiver, change: amount}
            ],
            memo: `[送金] ${sender} から ${receiver} へ ${amount.toFixed(1)} P の送金を実行。`,
            gameId: `TRANSFER-${Date.now()}`
        };

        const newScores = Array.from(currentScoresMap.values()); // passフィールドを保持したscores
        const newHistory = [...currentData.history, historyEntry];
        
        const newData = {
            scores: newScores,
            history: newHistory,
            sports_bets: currentData.sports_bets, 
            speedstorm_records: currentData.speedstorm_records || []
        };

        const response = await updateAllData(newData);

        if (response.status === 'success') {
            showMessage(messageEl, `✅ ${sender} から ${receiver} へ ${amount.toFixed(1)} P の送金を完了しました。`, 'success');
            
            TRANSFER_FORM.reset();
            loadPlayerList();
            loadTransferPlayerLists(); 
            loadMahjongForm(); // 麻雀フォームも更新
        } else {
            showMessage(messageEl, `❌ 送金エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    }
});


// --- 3. 全員一律ポイント減算機能 (変更なし) ---
document.getElementById('global-penalty-button').addEventListener('click', async () => {
    const penaltyAmount = -1.0;
    const messageEl = document.getElementById('global-penalty-message');

    if (!window.confirm(`全てのプレイヤーの得点を一律で ${penaltyAmount} P 減らします。よろしいですか？`)) {
        return;
    }

    const button = document.getElementById('global-penalty-button');
    button.disabled = true;
    showMessage(messageEl, '全体ポイント減算を処理中...', 'info');
    
    try {
        const currentData = await fetchAllData();
        // passフィールドを保持するために、scores全体をマップとして処理
        let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
        let historyChanges = [];

        currentData.scores.forEach(player => {
            const newScore = player.score + penaltyAmount;
            
            // passフィールドを保持したままscoreを更新
            currentScoresMap.set(player.name, { ...player, score: parseFloat(newScore.toFixed(1)) });
            
            historyChanges.push({
                name: player.name, 
                change: penaltyAmount
            });
        });

        const historyEntry = {
            timestamp: new Date().toISOString(),
            ranks: ['ADMIN'], 
            changes: historyChanges,
            memo: `[全体調整] 全プレイヤーに ${penaltyAmount} Pのペナルティを適用。`,
            gameId: `GLOBAL-PENALTY-${Date.now()}`
        };

        const newScores = Array.from(currentScoresMap.values()); // passフィールドを保持したscores
        const newHistory = [...currentData.history, historyEntry];
        
        const newData = {
            scores: newScores,
            history: newHistory,
            sports_bets: currentData.sports_bets,
            speedstorm_records: currentData.speedstorm_records || []
        };

        const response = await updateAllData(newData);

        if (response.status === 'success') {
            showMessage(messageEl, `✅ 全員から ${Math.abs(penaltyAmount)} P の減算を完了しました。`, 'success');
            loadPlayerList(); 
            loadTransferPlayerLists();
            loadMahjongForm(); // 麻雀フォームも更新
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


// --- 4. スピードストーム レコード管理機能 (変更なし) ---

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
    
    return Math.round((minutes * 60 + seconds) * 1000);
}

// ミリ秒を "分:秒.ミリ秒" 形式にフォーマットするヘルパー関数
function formatMilliseconds(ms) {
    if (isNaN(ms) || ms < 0) return 'N/A';
    
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    const formattedSeconds = seconds.toFixed(3);
    
    if (minutes > 0) {
        const secPart = seconds < 10 ? '0' + formattedSeconds : formattedSeconds;
        return `${minutes}:${secPart}`;
    } else {
        return formattedSeconds;
    }
}


RACE_RECORD_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('race-record-message');
    // ★ 修正: プルダウンからコース名を取得
    const courseName = RACE_COURSE_SELECT.value; 
    const timeString = document.getElementById('race-best-time').value.trim();
    const recordHolder = RACE_RECORD_HOLDER_SELECT.value;
    
    const newTimeMs = timeToMilliseconds(timeString);

    if (!courseName || isNaN(newTimeMs) || !recordHolder || newTimeMs <= 0) {
        showMessage(messageEl, 'エラー: 全ての項目を正しく選択・入力してください (タイムは分:秒.ミリ秒 または 秒.ミリ秒 形式)。', 'error');
        return;
    }
    
    // ★ 修正: ここから新規コースの追加はできず、既存コースの更新のみを行う

    showMessage(messageEl, 'レース記録を更新中...', 'info');

    try {
        const currentData = await fetchAllData();
        let records = currentData.speedstorm_records || [];
        
        // 既存のレコードの中から、選択されたコース名と一致するものを探す
        const existingIndex = records.findIndex(r => r.courseName === courseName);
        
        // ★ 修正: 既存コースが見つからない場合はエラーとする
        if (existingIndex === -1) {
            showMessage(messageEl, `❌ エラー: コース名「${courseName}」は既存のコースリストに見つかりませんでした。新規コースの追加はできません。`, 'error');
            return;
        }

        const existingRecord = records[existingIndex];
        const newRecord = {
            courseName: courseName,
            bestTimeMs: newTimeMs,
            bestTime: formatMilliseconds(newTimeMs),
            holder: recordHolder,
            timestamp: new Date().toISOString()
        };

        let logMessage = '';
        let shouldAwardPoints = false;
        const AWARD_POINTS = 5.0;

        // 新しい記録が既存の記録より速いか、同タイムで保持者が異なる場合のみ更新
        if (newTimeMs < existingRecord.bestTimeMs) {
            records[existingIndex] = newRecord;
            logMessage = `✅ 記録を更新しました: ${courseName} | ${existingRecord.bestTime} (旧) → ${newRecord.bestTime} (新)`;
            shouldAwardPoints = true;
        } else if (newTimeMs === existingRecord.bestTimeMs && recordHolder !== existingRecord.holder) {
            // 同タイムの場合は、保持者変更として記録を更新し、ポイント付与対象とする（競り合いの評価）
            records[existingIndex] = newRecord;
            logMessage = `✅ 同タイムで記録を更新（保持者変更）しました: ${newRecord.bestTime}`;
            shouldAwardPoints = true;
        } else {
            showMessage(messageEl, `❌ 記録は更新されませんでした。入力された ${newRecord.bestTime} は既存の記録 ${existingRecord.bestTime} より遅いか同タイムです(保持者も同じ)。`, 'error');
            return;
        }
        
        // 更新後のリストをソート (念のため)
        records.sort((a, b) => a.bestTimeMs - b.bestTimeMs);

        let historyChanges = [];
        let newScores = currentData.scores;

        if (shouldAwardPoints) {
            // passフィールドを保持するために、scores全体をマップとして処理
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            
            const holderPlayer = currentScoresMap.get(recordHolder);
            if(holderPlayer) {
                const currentScore = holderPlayer.score || 0;
                // passフィールドを保持したままscoreを更新
                currentScoresMap.set(recordHolder, { ...holderPlayer, score: parseFloat((currentScore + AWARD_POINTS).toFixed(1)) });
                historyChanges.push({name: recordHolder, change: AWARD_POINTS});
            }
            
            const KABOCHA_NAME = "Kabocha"; 
            const KABOCHA_BONUS = 1.0;     
            
            const kabochaPlayer = currentScoresMap.get(KABOCHA_NAME);
            if (kabochaPlayer) {
                const kabochaCurrentScore = kabochaPlayer.score;
                // passフィールドを保持したままscoreを更新
                currentScoresMap.set(KABOCHA_NAME, { ...kabochaPlayer, score: parseFloat((kabochaCurrentScore + KABOCHA_BONUS).toFixed(1)) });
                historyChanges.push({name: KABOCHA_NAME, change: KABOCHA_BONUS});
                logMessage += ` (報酬: ${AWARD_POINTS} P + ${KABOCHA_NAME}に ${KABOCHA_BONUS} P)`;
            } else {
                 logMessage += ` (報酬: ${AWARD_POINTS} P)`;
            }

            // scores配列を再構築
            newScores = Array.from(currentScoresMap.values());

            const historyEntry = {
                timestamp: new Date().toISOString(),
                ranks: ['RACE_RECORD'], 
                changes: historyChanges,
                memo: `[レース記録] ${courseName} のベストタイム (${newRecord.bestTime}) を更新し、${recordHolder} に ${AWARD_POINTS} P ${kabochaPlayer ? `+ ${KABOCHA_BONUS} P` : ''} 付与。`,
                gameId: `RACE-${Date.now()}`
            };
            currentData.history.push(historyEntry);
        }

        const newData = {
            scores: newScores, // ★ passフィールドを保持したscores
            history: currentData.history,
            sports_bets: currentData.sports_bets,
            speedstorm_records: records
        };

        const response = await updateAllData(newData);

        if (response.status === 'success') {
            showMessage(messageEl, logMessage, 'success');
            RACE_RECORD_FORM.reset();
            loadPlayerList();
            loadTransferPlayerLists();
            loadMahjongForm(); // 麻雀フォームも更新
            loadRaceCourses(); // コースリストを再ロード
        } else {
            showMessage(messageEl, `❌ 更新エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    }
});


// --- 6. スポーツくじ管理機能 (大幅修正: 新規くじ作成、結果確定ロジック) ---

// --- イベントハンドラ: 新規くじ作成 ---

CREATE_BET_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('create-message');
    const matchName = document.getElementById('match-name').value.trim();
    const creatorName = document.getElementById('creator-name').value.trim();
    const deadline = document.getElementById('deadline-datetime').value; // ISO 8601形式の文字列を取得

    if (!matchName || !creatorName || !deadline) {
        showMessage(messageEl, '❌ くじ名、開設者名、締切日時をすべて入力してください。', 'error');
        return;
    }
    
    // 締切時刻の有効性チェック
    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
        showMessage(messageEl, '❌ 締切日時は現在時刻よりも後の有効な日時を選択してください。', 'error');
        return;
    }


    try {
        const currentData = await fetchAllData();
        const allBets = currentData.sports_bets || [];
        const newBetId = allBets.length > 0 ? Math.max(...allBets.map(b => b.betId)) + 1 : 1;
        
        // ★ オッズを廃止し、作成者と締切日時を追加
        const newBet = {
            betId: newBetId,
            matchName: matchName,
            creator: creatorName, // 新規: 開設者名
            deadline: deadlineDate.toISOString(), // 新規: 締切日時 (ISO文字列)
            status: 'OPEN',
            outcome: null,
            // odds: {} は廃止
            wagers: [] // 投票はwagers配列に直接格納
        };

        allBets.push(newBet);
        currentData.sports_bets = allBets;
        
        const response = await updateAllData(currentData);

        if (response.status === 'success') {
            showMessage(messageEl, `✅ くじ「${matchName}」を作成しました (ID: ${newBetId})`, 'success');
            CREATE_BET_FORM.reset();
            
            // フォームリセット後、締切日時を再度設定
            const now = new Date();
            now.setHours(now.getHours() + 1);
            document.getElementById('deadline-datetime').value = formatDateTimeLocal(now);
            
            loadBettingData();
        } else {
            showMessage(messageEl, `❌ 作成エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    }
});


// --- イベントハンドラ: くじ締切 (ロジック修正) ---

async function handleCloseBet(e) {
    const betId = parseInt(e.target.dataset.betId);
    
    if (!window.confirm(`くじ ID:${betId} の投票を締め切りますか？この操作後は投票できません。`)) {
        return;
    }

    try {
        const currentData = await fetchAllData();
        const allBets = currentData.sports_bets || [];
        const bet = allBets.find(b => b.betId === betId);

        if (bet && bet.status === 'OPEN') {
            // 締切処理
            bet.status = 'CLOSED';
            currentData.sports_bets = allBets;
            const response = await updateAllData(currentData);
            if (response.status === 'success') {
                showMessage(document.getElementById('create-message'), `✅ くじ ID:${betId} の投票を締め切りました。`, 'success');
                loadBettingData();
            } else {
                showMessage(document.getElementById('create-message'), `❌ 締切処理エラー: ${response.message}`, 'error');
            }
        }
    } catch (error) {
        console.error(error);
        showMessage(document.getElementById('create-message'), `❌ サーバーエラー: ${error.message}`, 'error');
    }
}


/**
 * くじ一覧のHTMLを生成し、表示する (大幅修正)
 * @param {Array<Object>} allBets - すべてのくじのデータ
 */
function renderBetList(allBets) {
    if (allBets.length === 0) {
        BET_LIST_CONTAINER.innerHTML = '<p>まだくじが作成されていません。</p>';
        return;
    }

    let html = '';
    const now = new Date();
    
    // ソート: OPEN -> CLOSED -> SETTLED
    const sortedBets = allBets.sort((a, b) => {
        const order = { 'OPEN': 1, 'CLOSED': 2, 'SETTLED': 3 };
        return order[a.status] - order[b.status];
    });

    sortedBets.forEach(bet => {
        // OPEN状態のくじについて、締切時間を過ぎていたら強制的にCLOSEDとして扱う (表示上のみ)
        let currentStatus = bet.status;
        if (currentStatus === 'OPEN' && new Date(bet.deadline) <= now) {
            currentStatus = 'CLOSED_AUTO'; // 自動締切
        }

        const totalWagers = bet.wagers.reduce((sum, w) => sum + w.amount, 0);
        let statusText = '';
        let statusClass = '';
        let managementTools = '';

        const formattedDeadline = new Date(bet.deadline).toLocaleString('ja-JP', { 
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
        });

        // 汎用オッズリストは廃止されたため表示しない

        if (currentStatus === 'OPEN') {
            statusText = '開催中 (投票受付中)';
            statusClass = 'status-open';
            managementTools = `
                <p>締切: ${formattedDeadline}</p>
                <button class="action-button close-bet secondary-button" data-bet-id="${bet.betId}" style="width: auto;">投票締切</button>
            `;
        } else if (currentStatus === 'CLOSED' || currentStatus === 'CLOSED_AUTO') {
            statusText = currentStatus === 'CLOSED_AUTO' ? '自動締切 (結果待ち)' : '締切済 (結果待ち)';
            statusClass = 'status-closed';
            
            // ★ 大幅修正箇所：結果確定ツール
            // 各投票に対する結果入力フォームを生成
            const unsettledWagers = bet.wagers.filter(w => w.isWin === null); // isWinがnullの結果未入力の投票
            
            if (unsettledWagers.length > 0) {
                managementTools = `
                    <form class="settle-wagers-form" data-bet-id="${bet.betId}">
                        <div class="result-tools-score">
                            <p style="margin-top: 10px;">🎯 **未確定の投票結果入力** (${unsettledWagers.length}件)</p>
                            <div id="wager-result-inputs-${bet.betId}" style="max-height: 400px; overflow-y: auto; padding: 10px; border: 1px solid #ccc; margin-bottom: 15px;">
                                <!-- 個別の投票結果入力がJSで生成される -->
                            </div>
                            <button type="submit" class="action-button result-button">確定した結果を反映</button>
                            <p class="instruction" style="color: #dc3545;">※ 当選時はオッズ (1.0以上) を入力してください。</p>
                        </div>
                    </form>
                `;
            } else {
                managementTools = '<p class="settled-info" style="color: #28a745; font-weight: bold;">全ての投票結果が確定済みです。</p>';
                // 全ての投票結果が確定したら、くじ自体をSETTLEDに更新するボタン
                managementTools += `<button class="action-button finalize-bet secondary-button" data-bet-id="${bet.betId}" style="width: auto;">くじを完了済みにする</button>`;
            }
            
        } else if (bet.status === 'SETTLED') {
            statusText = `完了`;
            statusClass = 'status-settled';
            managementTools = `<p class="settled-info">このくじは完了済みです。</p>`;
        }
        
        let wagersHtml = bet.wagers.length > 0 ? 
            bet.wagers.map(w => {
                let winStatus = '';
                if (w.isWin === true) {
                    winStatus = ` (✅ x${w.appliedOdds.toFixed(1)})`;
                } else if (w.isWin === false) {
                    winStatus = ' (❌)';
                } else {
                    winStatus = ' (?)';
                }
                const playerInitials = w.player.substring(0, 3);
                return `<li class="wager-item" title="${w.item}">${playerInitials}: ${w.amount} P - ${w.item} ${winStatus}</li>`;
            }).join('') :
            '<li>まだ投票はありません。</li>';

        html += `
            <div class="bet-card ${statusClass}">
                <h3>${bet.matchName} (#${bet.betId})</h3>
                <p class="bet-creator">開設者: <strong>${bet.creator || 'N/A'}</strong></p>
                <div class="odds-info">
                    <strong>締切:</strong> ${formattedDeadline}
                </div>
                <p class="status-label">ステータス: <span class="${statusClass}">${statusText}</span></p>
                <div class="wager-info">
                    <strong>合計投票:</strong> ${totalWagers} P (${bet.wagers.length}件)
                </div>
                <ul class="wagers-list" style="font-size: 0.9em;">${wagersHtml}</ul>
                <div class="management-tools">
                    ${managementTools}
                </div>
            </div>
        `;
    });

    BET_LIST_CONTAINER.innerHTML = html;

    // イベントリスナーを再設定
    document.querySelectorAll('.close-bet').forEach(btn => btn.addEventListener('click', handleCloseBet));
    document.querySelectorAll('.finalize-bet').forEach(btn => btn.addEventListener('click', handleFinalizeBet));
    
    // ★ 新規: 投票結果確定フォームのセットアップ
    document.querySelectorAll('.settle-wagers-form').forEach(form => {
        const betId = parseInt(form.dataset.betId);
        const bet = sortedBets.find(b => b.betId === betId);
        
        if (bet) {
            // 個別投票結果の入力フィールドを生成
            generateWagerResultInputs(bet);
            
            // フォーム送信イベント
            form.addEventListener('submit', handleSettleWagers);
        }
    });
}


/**
 * 投票結果確定用の入力フィールドを生成する
 * @param {Object} bet - くじオブジェクト
 */
function generateWagerResultInputs(bet) {
    const container = document.getElementById(`wager-result-inputs-${bet.betId}`);
    if (!container) return;

    // 結果未入力の投票のみを対象とする
    const unsettledWagers = bet.wagers.filter(w => w.isWin === null); 
    
    let html = '';

    unsettledWagers.forEach((wager, index) => {
        // isWin: null, appliedOdds: null のものが対象
        const uniqueId = `${bet.betId}-${index}`;
        
        html += `
            <div class="wager-result-row" style="padding: 5px 0; border-bottom: 1px dotted #ddd;">
                <p style="margin: 5px 0;">
                    <strong>${wager.player}:</strong> ${wager.amount} P / ${wager.item}
                </p>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <label style="flex: 0 0 auto;"><input type="radio" name="result-${uniqueId}" value="win" class="wager-result-radio" data-wager-index="${index}"> 当選</label>
                    <label style="flex: 0 0 auto;"><input type="radio" name="result-${uniqueId}" value="lose" class="wager-result-radio" data-wager-index="${index}"> 外れ</label>
                    <div style="flex-grow: 1; display: flex; gap: 5px;">
                        <input type="number" step="0.1" min="1.0" class="applied-odds-input" data-wager-index="${index}" placeholder="オッズ (当選時)" style="width: 100px; display: none;">
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // ラジオボタンの変更イベントリスナーを追加
    container.querySelectorAll('.wager-result-radio').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const index = e.target.dataset.wagerIndex;
            const oddsInput = container.querySelector(`.applied-odds-input[data-wager-index="${index}"]`);
            
            if (e.target.value === 'win') {
                oddsInput.style.display = 'inline';
                oddsInput.required = true;
                oddsInput.value = oddsInput.value || 1.0; // デフォルト値を設定
            } else {
                oddsInput.style.display = 'none';
                oddsInput.required = false;
                oddsInput.value = '';
            }
        });
    });
}

// --- イベントハンドラ: 個別投票結果の確定とポイント反映 ---

async function handleSettleWagers(e) {
    e.preventDefault();
    const form = e.target;
    const betId = parseInt(form.dataset.betId);
    const messageEl = document.getElementById('create-message');
    
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    // ★ 修正: allValid をここで初期化する
    let allValid = true; 

    try {
        const currentData = await fetchAllData();
        const allBets = currentData.sports_bets || [];
        const betIndex = allBets.findIndex(b => b.betId === betId);
        
        if (betIndex === -1 || allBets[betIndex].status === 'SETTLED') {
            showMessage(messageEl, '❌ くじが見つからないか、既に完了済みです。', 'error');
            submitButton.disabled = false;
            return;
        }

        const bet = allBets[betIndex];
        // 元のwagers配列（未確定を含む）
        const originalWagers = bet.wagers; 
        
        let totalPointChange = 0;
        let historyChanges = [];
        let updatedWagersCount = 0;
        
        // passフィールドを保持するために、scores全体をマップとして処理
        let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
        
        // フォームから結果データを収集し、元のwagers配列に反映させる
        const wagerResultInputs = form.querySelectorAll('.wager-result-row');

        // 未確定の投票リストを取得 (フォームのインデックスと対応させるための工夫)
        const unsettledWagersIndices = originalWagers
            .map((w, index) => w.isWin === null ? index : -1)
            .filter(index => index !== -1);

        wagerResultInputs.forEach((row, formIndex) => {
            // formIndexは0, 1, 2... とフォームに表示されている未確定投票の順序
            const radioWin = row.querySelector('input[value="win"]');
            const radioLose = row.querySelector('input[value="lose"]');
            const oddsInput = row.querySelector('.applied-odds-input');
            
            // フォームのインデックスに対応する元のwagers配列のインデックス
            const originalWagerIndex = unsettledWagersIndices[formIndex];
            
            if (originalWagerIndex === undefined || originalWagerIndex === null) return; // 念のためのチェック

            let isWin = null;
            let appliedOdds = null;
            let pointChange = 0; // 反映するポイントの増減

            if (radioWin && radioWin.checked) {
                isWin = true;
                appliedOdds = parseFloat(oddsInput.value);
                
                if (isNaN(appliedOdds) || appliedOdds < 1.0) {
                    allValid = false; // エラーフラグを立てる
                    showMessage(messageEl, `❌ 当選結果のオッズが不正です (${originalWagers[originalWagerIndex].item})。`, 'error');
                    return; 
                }
                // ポイント計算: 掛け金 * オッズ (利益分)
                pointChange = originalWagers[originalWagerIndex].amount * appliedOdds;
                
            } else if (radioLose && radioLose.checked) {
                isWin = false;
                appliedOdds = 0; // 外れの場合はオッズなし
                pointChange = 0; // 既に購入時に減算済みのため、追加の増減なし
            } else {
                // 結果が選択されていない場合はスキップ
                return;
            }

            // データの更新
            originalWagers[originalWagerIndex].isWin = isWin;
            originalWagers[originalWagerIndex].appliedOdds = appliedOdds;

            // スコアの更新
            const player = originalWagers[originalWagerIndex].player;
            const currentPlayer = currentScoresMap.get(player);

            if (currentPlayer) {
                const currentScore = currentPlayer.score || 0;
                // passフィールドを保持したままscoreを更新
                currentScoresMap.set(player, { ...currentPlayer, score: parseFloat((currentScore + pointChange).toFixed(1)) });
                
                // 履歴記録用の変更点を蓄積
                historyChanges.push({
                    name: player,
                    change: parseFloat(pointChange.toFixed(1))
                });
                totalPointChange += pointChange;
            }
            
            updatedWagersCount++;
        });

        // ★ 修正: allValid のチェックをここで行う
        if (!allValid) {
             submitButton.disabled = false;
             return;
        }

        if (updatedWagersCount === 0) {
            showMessage(messageEl, '⚠️ 反映する結果が選択されていません。', 'info');
            submitButton.disabled = false;
            return;
        }

        // 履歴エントリーを作成
        const historyEntry = {
            timestamp: new Date().toISOString(),
            ranks: ['BET_SETTLE'],
            changes: historyChanges,
            memo: `[くじ結果確定] ${bet.matchName} (${updatedWagersCount}件)の結果を確定。総ポイント変動: ${totalPointChange.toFixed(1)} P`,
            gameId: `BET-SETTLE-${betId}-${Date.now()}`
        };
        currentData.history.push(historyEntry);

        // データ全体を更新
        bet.wagers = originalWagers;
        allBets[betIndex] = bet;
        currentData.sports_bets = allBets;
        currentData.scores = Array.from(currentScoresMap.values()); // passフィールドを保持したscores
        
        const response = await updateAllData(currentData);

        if (response.status === 'success') {
            showMessage(messageEl, `✅ ${updatedWagersCount}件の結果を確定し、ポイントを反映しました。`, 'success');
            loadBettingData(); // リストを再ロードして更新されたフォームを表示
            loadPlayerList();
            loadTransferPlayerLists();
            loadMahjongForm();
        } else {
            showMessage(messageEl, `❌ ポイント反映エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    } finally {
        submitButton.disabled = false;
    }
}

// --- イベントハンドラ: くじ完了 (SETTLED) にする ---

async function handleFinalizeBet(e) {
    const betId = parseInt(e.target.dataset.betId);
    const messageEl = document.getElementById('create-message');

    if (!window.confirm(`くじ ID:${betId} を「完了済み」にマークしますか？この操作は元に戻せません。`)) {
        return;
    }

    try {
        const currentData = await fetchAllData();
        const allBets = currentData.sports_bets || [];
        const betIndex = allBets.findIndex(b => b.betId === betId);
        
        if (betIndex === -1 || allBets[betIndex].status === 'SETTLED') {
            showMessage(messageEl, '❌ くじが見つからないか、既に完了済みです。', 'error');
            return;
        }

        const bet = allBets[betIndex];
        
        // 未確定の投票がないか最終チェック
        const unsettledCount = bet.wagers.filter(w => w.isWin === null).length;
        if (unsettledCount > 0) {
            showMessage(messageEl, `❌ まだ ${unsettledCount}件の投票結果が未確定です。全ての結果を確定してから完了にしてください。`, 'error');
            return;
        }

        bet.status = 'SETTLED';
        currentData.sports_bets = allBets;
        
        const response = await updateAllData(currentData);

        if (response.status === 'success') {
            showMessage(messageEl, `✅ くじ ID:${betId} を「完了済み」にしました。`, 'success');
            loadBettingData();
        } else {
            showMessage(messageEl, `❌ 完了処理エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    }
}


/**
 * HTML要素にメッセージを表示するヘルパー関数 (変更なし)
 */
function showMessage(element, text, type) {
    element.textContent = text;
    element.className = type === 'success' ? 'message success' : (type === 'error' ? 'message error' : 'message info');
    element.classList.remove('hidden');
    
    // 3秒後にメッセージを非表示にする
    setTimeout(() => {
        element.classList.add('hidden');
    }, 5000);
}

// --- 特殊ポイント調整機能 (変更なし) ---
document.getElementById('adjustment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('adjustment-message');
    const targetPlayerName = document.getElementById('target-player').value;
    const adjustAmount = parseFloat(document.getElementById('adjust-amount').value);

    if (!targetPlayerName || isNaN(adjustAmount) || adjustAmount === 0) {
        showMessage(messageEl, 'エラー: 対象プレイヤーと有効な調整ポイントを入力してください。', 'error');
        return;
    }

    try {
        const currentData = await fetchAllData();
        // passフィールドを保持するために、scores全体をマップとして処理
        let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
        
        const player = currentScoresMap.get(targetPlayerName);
        
        if (!player) {
            showMessage(messageEl, `エラー: プレイヤー ${targetPlayerName} が見つかりません。`, 'error');
            return;
        }
        
        const newScore = player.score + adjustAmount;
        
        // passフィールドを保持したままscoreを更新
        currentScoresMap.set(targetPlayerName, { ...player, score: parseFloat(newScore.toFixed(1)) });
        
        const historyEntry = {
            timestamp: new Date().toISOString(),
            ranks: ['ADJUSTMENT'],
            changes: [{name: targetPlayerName, change: adjustAmount}],
            memo: `[ポイント調整] ${targetPlayerName} に ${adjustAmount.toFixed(1)} P を調整。`,
            gameId: `ADJUST-${Date.now()}`
        };

        const newScores = Array.from(currentScoresMap.values()); // passフィールドを保持したscores
        const newHistory = [...currentData.history, historyEntry];

        const newData = {
            scores: newScores,
            history: newHistory,
            sports_bets: currentData.sports_bets,
            speedstorm_records: currentData.speedstorm_records || []
        };

        const response = await updateAllData(newData);

        if (response.status === 'success') {
            showMessage(messageEl, `✅ ${targetPlayerName} のポイントを ${adjustAmount.toFixed(1)} P 調整しました。`, 'success');
            document.getElementById('adjustment-form').reset();
            loadPlayerList();
        } else {
            showMessage(messageEl, `❌ 調整エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    }
});
