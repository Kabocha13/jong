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


// ★ スポーツくじ管理機能 (既存)
const BET_LIST_CONTAINER = document.getElementById('bet-list-container');
const CREATE_BET_FORM = document.getElementById('create-bet-form');
const GENERIC_ODDS_CONTAINER = document.getElementById('generic-odds-container'); 
const ADD_GENERIC_ODDS_BUTTON = document.getElementById('add-generic-odds-button'); 

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
        initializeSportsMasterTools(); // スポーツくじ管理
        loadMahjongForm(); // ★ 追加: 麻雀フォームをロード
    } else {
        showMessage(AUTH_MESSAGE, '❌ パスワードが間違っています。', 'error');
    }
});


// --- ★★★ 新規プレイヤー登録機能の修正 ★★★ ---

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

// --- プレイヤーリストのロード関数群 (共通データ取得とフォーム更新) ---

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

// ★ 新規追加: 既存コースリストをロードする関数
async function loadRaceCourses() {
    RACE_COURSE_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    
    try {
        const allData = await fetchAllData();
        const records = allData.speedstorm_records || [];
        
        // 既存のコース名リストを重複なく取得
        const courseNames = [...new Set(records.map(r => r.courseName))].sort();

        if (courseNames.length === 0) {
            RACE_COURSE_SELECT.innerHTML = '<option value="" disabled selected>コースが未登録です</option>';
            // 新規登録の意図がないため、このままボタンを無効化する方が良いが、今回は更新のみに特化
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


// --- ★★★ 麻雀結果フォーム生成 ★★★
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
        showMessage(MAHJONG_MESSAGE_ELEMENT, `警告: 合計点が ${totalScore} です。120000点周辺ではありません。計算を再確認してください。`, 'warning');
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


// --- スポーツくじ管理機能 (既存) ---

async function initializeSportsMasterTools() {
    if (GENERIC_ODDS_CONTAINER.children.length === 0) {
        addGenericOddsRow('馬Aの勝利', 2.5);
        addGenericOddsRow('プレイヤーBが1位', 5.0);
    }
    await loadBettingData();
}

async function loadBettingData() {
    const data = await fetchAllData();
    const allBets = data.sports_bets || []; 
    renderBetList(allBets);
}

// --- 3. ポイント送金機能 ---
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


// --- 3. 全員一律ポイント減算機能 ---
document.getElementById('global-penalty-button').addEventListener('click', async () => {
    const penaltyAmount = -1.0;
    const messageEl = document.getElementById('global-penalty-message');

    // alert/confirmはカスタムモーダルに置き換える必要があるが、このタスクでは既存のconfirmを使用
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


// --- 4. スピードストーム レコード管理機能 (修正版) ---

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


// --- 6. スポーツくじ管理機能 (passフィールドの保持対応のため修正) ---

// --- 汎用オッズ入力フィールドの動的追加 (変更なし) ---
ADD_GENERIC_ODDS_BUTTON.addEventListener('click', () => addGenericOddsRow());

function addGenericOddsRow(selection = '', odds = '') {
    const row = document.createElement('div');
    row.className = 'generic-odds-row form-group';
    row.innerHTML = `
        <input type="text" class="selection-input" placeholder="選択肢名 (例: プレイヤーAが1位)" value="${selection}">
        <input type="number" class="odds-input" step="0.1" min="1.0" required placeholder="オッズ (例: 2.5)" value="${odds}">
        <button type="button" class="remove-generic-odds-button action-button secondary-button" style="background-color: #dc3545; width: auto; margin: 0; padding: 5px 10px;">削除</button>
    `;
    GENERIC_ODDS_CONTAINER.appendChild(row);

    // 削除ボタンのイベントリスナー設定
    row.querySelector('.remove-generic-odds-button').addEventListener('click', (e) => {
        e.target.closest('.generic-odds-row').remove();
    });
    
    return row;
}

// **既存のオッズデータから編集フォームのHTMLを生成する関数** (変更なし)
function generateOddsEditHtml(bet) {
    let editHtml = `<form class="edit-odds-form" data-bet-id="${bet.betId}">`;
    editHtml += `<p class="instruction" style="margin-top: 5px;">⚠️ **注意:** 投票受付中のオッズ変更は、公平性を損なう可能性があります。</p>`;
    editHtml += `<div class="tool-box" style="margin-top: 10px; padding: 10px;" id="edit-odds-container-${bet.betId}">`;
    
    const odds = bet.odds || {};
    Object.entries(odds).forEach(([selection, oddsValue]) => {
        editHtml += `
            <div class="generic-odds-row form-group">
                <input type="text" class="selection-input" placeholder="選択肢名" value="${selection}" required>
                <input type="number" class="odds-input" step="0.1" min="1.0" required placeholder="オッズ" value="${oddsValue}">
                <button type="button" class="remove-edit-odds-button action-button secondary-button" style="background-color: #dc3545; width: auto; margin: 0; padding: 5px 10px;">削除</button>
            </div>
        `;
    });
    
    editHtml += '</div>';
    editHtml += `<button type="button" class="add-edit-odds-button action-button secondary-button" data-bet-id="${bet.betId}" style="width: auto;">+ 選択肢を追加</button>`;
    editHtml += `<button type="submit" class="action-button" style="margin-top: 10px; background-color: #007bff;">オッズを更新</button>`;
    editHtml += `<p id="edit-message-${bet.betId}" class="hidden message"></p>`;
    editHtml += `</form>`;
    return editHtml;
}


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
            // オッズ編集ボタンと、編集フォーム表示コンテナを追加
            managementTools = `
                <button class="action-button close-bet secondary-button" data-bet-id="${bet.betId}" style="width: auto; margin-right: 5px;">投票締切</button>
                <button class="action-button toggle-edit-odds secondary-button" data-bet-id="${bet.betId}" style="background-color: #ffc107; width: auto;">オッズ編集</button>
                <div id="edit-odds-wrapper-${bet.betId}" class="hidden" style="margin-top: 10px;">
                    ${generateOddsEditHtml(bet)}
                </div>
            `;
        } else if (bet.status === 'CLOSED') {
            statusText = '締切 (結果待ち)';
            statusClass = 'status-closed';
            
            // ★ 修正箇所：結果確定ツールをプルダウン式に変更
            const oddsOptions = Object.keys(bet.odds || {}).map(selection => 
                `<option value="${selection}">${selection}</option>`
            ).join('');

            managementTools = `
                <div class="result-tools-score">
                    <p>🎯 当選した選択肢（結果）を選択:</p>
                    <div class="form-group score-input-group">
                        <select class="final-outcome-key" required style="width: 80%; display: inline; padding: 10px;">
                            <option value="" disabled selected>-- 当選選択肢を選択 --</option>
                            ${oddsOptions}
                        </select>
                    </div>
                    
                    <button class="action-button settle-bet result-button" data-bet-id="${bet.betId}">結果を確定し、ポイントを反映</button>
                </div>
            `;
            // ★ 修正箇所ここまで
            
        } else if (bet.status === 'SETTLED') {
            // 最終結果キーを表示
            statusText = `完了 (当選結果: ${bet.outcome || 'N/A'})`;
            statusClass = 'status-settled';
            managementTools = `<p class="settled-info">このくじは確定済みです。</p>`;
        }
        
        let wagersHtml = bet.wagers.length > 0 ? 
            bet.wagers.map(w => `<li class="wager-item">${w.player}: ${w.amount} P → ${w.selection}</li>`).join('') :
            '<li>まだ投票はありません。</li>';

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
    document.querySelectorAll('.settle-bet').forEach(btn => btn.addEventListener('click', handleSettleBet));
    
    // オッズ編集関連のイベントリスナー
    document.querySelectorAll('.toggle-edit-odds').forEach(btn => btn.addEventListener('click', handleToggleEditOdds));
    
    document.querySelectorAll('.edit-odds-form').forEach(form => {
        form.addEventListener('submit', handleEditOdds);
        
        const betId = form.dataset.betId;
        const container = document.getElementById(`edit-odds-container-${betId}`);

        // 追加ボタンのイベントリスナー設定
        form.querySelector('.add-edit-odds-button').addEventListener('click', () => {
             addEditOddsRow(container);
        });
        
        // 既存の削除ボタン
        container.querySelectorAll('.remove-edit-odds-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.generic-odds-row').remove();
            });
        });
    });
}

// **編集フォーム用のオッズ行追加関数** (変更なし)
function addEditOddsRow(container) {
    const row = document.createElement('div');
    row.className = 'generic-odds-row form-group';
    row.innerHTML = `
        <input type="text" class="selection-input" placeholder="選択肢名" required>
        <input type="number" class="odds-input" step="0.1" min="1.0" required placeholder="オッズ">
        <button type="button" class="remove-edit-odds-button action-button secondary-button" style="background-color: #dc3545; width: auto; margin: 0; padding: 5px 10px;">削除</button>
    `;
    container.appendChild(row);
    
    // 削除ボタンのイベントリスナー
    row.querySelector('.remove-edit-odds-button').addEventListener('click', (e) => {
        e.target.closest('.generic-odds-row').remove();
    });
}

// --- イベントハンドラ: 新規くじ作成 ---

CREATE_BET_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('create-message');
    const matchName = document.getElementById('match-name').value;

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
            outcome: null,
            odds: genericOdds,
            wagers: []
        };

        allBets.push(newBet);
        currentData.sports_bets = allBets;
        
        const response = await updateAllData(currentData);

        if (response.status === 'success') {
            showMessage(messageEl, `✅ くじ「${matchName}」を作成しました (ID: ${newBetId})`, 'success');
            CREATE_BET_FORM.reset();
            GENERIC_ODDS_CONTAINER.innerHTML = ''; 
            addGenericOddsRow('馬Aの勝利', 2.5);
            addGenericOddsRow('プレイヤーBが1位', 5.0);
            loadBettingData();
        } else {
            showMessage(messageEl, `❌ 作成エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    }
});


// --- イベントハンドラ: くじ締切 ---

async function handleCloseBet(e) {
    const betId = parseInt(e.target.dataset.betId);
    
    // alert/confirmはカスタムモーダルに置き換える必要があるが、このタスクでは既存のconfirmを使用
    if (!window.confirm(`くじ ID:${betId} の投票を締め切りますか？この操作後は投票できません。`)) {
        return;
    }

    try {
        const currentData = await fetchAllData();
        const allBets = currentData.sports_bets || [];
        const bet = allBets.find(b => b.betId === betId);

        if (bet && bet.status === 'OPEN') {
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


// **オッズ編集フォームの表示切り替え** (変更なし)
function handleToggleEditOdds(e) {
    const betId = e.target.dataset.betId;
    const wrapper = document.getElementById(`edit-odds-wrapper-${betId}`);
    wrapper.classList.toggle('hidden');
    
    if (!wrapper.classList.contains('hidden')) {
        e.target.textContent = 'オッズ編集を隠す';
    } else {
        e.target.textContent = 'オッズ編集';
    }
}


// **オッズ編集の確定処理** (変更なし)
async function handleEditOdds(e) {
    e.preventDefault();
    const form = e.target;
    const betId = parseInt(form.dataset.betId);
    const messageEl = document.getElementById(`edit-message-${betId}`);

    const genericOdds = {};
    let allValid = true;
    let hasAtLeastOne = false;
    
    form.querySelectorAll('.generic-odds-row').forEach(row => {
        const selectionInput = row.querySelector('.selection-input').value.trim();
        const oddsInput = parseFloat(row.querySelector('.odds-input').value);
        
        if (selectionInput && !isNaN(oddsInput) && oddsInput >= 1.0) {
            genericOdds[selectionInput] = oddsInput;
            hasAtLeastOne = true;
        } else if (selectionInput || row.querySelector('.odds-input').value.trim()) {
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
    
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    showMessage(messageEl, 'オッズを更新中...', 'info');


    try {
        const currentData = await fetchAllData();
        const allBets = currentData.sports_bets || [];
        const bet = allBets.find(b => b.betId === betId);

        if (!bet || bet.status !== 'OPEN') {
             showMessage(messageEl, '❌ くじが見つからないか、ステータスが「開催中」ではありません。', 'error');
             return;
        }

        bet.odds = genericOdds;
        currentData.sports_bets = allBets;

        const response = await updateAllData(currentData);

        if (response.status === 'success') {
            showMessage(messageEl, `✅ くじ ID:${betId} のオッズを更新しました。`, 'success');
            document.getElementById(`edit-odds-wrapper-${betId}`).classList.add('hidden');
            document.querySelector(`.toggle-edit-odds[data-bet-id="${betId}"]`).textContent = 'オッズ編集';
            loadBettingData();
        } else {
            showMessage(messageEl, `❌ 更新エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    } finally {
        submitButton.disabled = false;
    }
}


// --- イベントハンドラ: 結果確定とポイント反映 ---

async function handleSettleBet(e) {
    const betId = parseInt(e.target.dataset.betId);
    
    const betCard = e.target.closest('.bet-card');
    // finalOutcomeKeyInputは、<select>要素または古い<input>要素を取得
    const finalOutcomeKeyInput = betCard.querySelector(`.final-outcome-key`);
    const finalOutcomeKey = finalOutcomeKeyInput.value.trim(); // <select>要素から選択された値を取得

    const messageEl = document.getElementById('create-message');

    if (!finalOutcomeKey) {
        showMessage(messageEl, '❌ 当選した選択肢名を選択してください。', 'error');
        return;
    }

    // alert/confirmはカスタムモーダルに置き換える必要があるが、このタスクでは既存のconfirmを使用
    if (!window.confirm(`くじ ID:${betId} の結果を【当選選択肢: ${finalOutcomeKey}】で確定し、ポイントを反映しますか？元に戻せません。`)) {
        return;
    }
    
    betCard.querySelectorAll('.action-button').forEach(btn => btn.disabled = true);

    try {
        const currentData = await fetchAllData();
        const allBets = currentData.sports_bets || [];
        const bet = allBets.find(b => b.betId === betId);

        if (!bet || bet.status !== 'CLOSED') {
            showMessage(messageEl, '❌ くじが見つからないか、ステータスが「締切」ではありません。', 'error');
            return;
        }

        const oddsMap = bet.odds;
        const winningOdds = oddsMap[finalOutcomeKey];
        if (!winningOdds) {
             showMessage(messageEl, `❌ 選択された結果「${finalOutcomeKey}」はオッズに設定されていません。入力ミスがないか確認してください。`, 'error');
             betCard.querySelectorAll('.action-button').forEach(btn => btn.disabled = false);
             return;
        }
        
        // passフィールドを保持するために、scores全体をマップとして処理
        let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
        let historyChanges = [];
        let totalPointChange = 0;

        bet.wagers.forEach(wager => {
            let change = 0;
            const selectionKey = wager.selection;
            const player = wager.player;
            
            // ★ ポイント計算ロジックを修正
            //   購入時の減算は既に行われているため、
            //   当選者には (掛け金 * オッズ) を加算。
            //   外れた人には 0 を加算/減算 (既に購入時に減算済み)。
            if (selectionKey === finalOutcomeKey) {
                // 当選: 掛け金 * オッズ (例: 10P * x2.0 = +20P。購入時の-10Pと相殺し、実質+10Pの利益)
                change = wager.amount * winningOdds; 
            } else {
                // 外れ: 0P (購入時に既に-wager.amountされているため、ここで0にすることで二重減算を回避)
                change = 0; 
            }
            // ★ 修正ここまで

            const currentPlayer = currentScoresMap.get(player);

            if (currentPlayer) {
                const currentScore = currentPlayer.score || 0;
                // passフィールドを保持したままscoreを更新
                currentScoresMap.set(player, { ...currentPlayer, score: parseFloat((currentScore + change).toFixed(1)) });
            }

            historyChanges.push({
                name: player,
                change: parseFloat(change.toFixed(1))
            });
            totalPointChange += change;
        });

        bet.outcome = finalOutcomeKey;
        delete bet.finalScore; 
        bet.status = 'SETTLED';
        currentData.sports_bets = allBets;

        currentData.scores = Array.from(currentScoresMap.values()); // passフィールドを保持したscores
        
        const historyEntry = {
            timestamp: new Date().toISOString(),
            ranks: ['BET'],
            changes: historyChanges,
            memo: `[スポーツくじ] ${bet.matchName} 結果確定: 当選選択肢「${finalOutcomeKey}」. 総ポイント変動: ${totalPointChange.toFixed(1)} P`,
            gameId: `BET-${betId}-${Date.now()}`
        };
        currentData.history.push(historyEntry);
        
        const response = await updateAllData(currentData);

        if (response.status === 'success') {
            showMessage(messageEl, `✅ くじ ID:${betId} の結果を【当選選択肢: ${finalOutcomeKey}】で確定し、ポイントを反映しました。`, 'success');
            loadBettingData();
            loadPlayerList();
            loadTransferPlayerLists();
            loadMahjongForm(); // 麻雀フォームも更新
        } else {
            showMessage(messageEl, `❌ ポイント反映エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error(error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    } finally {
        betCard.querySelectorAll('.action-button').forEach(btn => btn.disabled = false);
    }
}

/**
 * HTML要素にメッセージを表示するヘルパー関数
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

// --- 特殊ポイント調整機能 (pass保持のため修正) ---
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
