// assets/js/master.js

const AUTH_FORM = document.getElementById('auth-form');
const ADMIN_TOOLS = document.getElementById('admin-tools');
const AUTH_MESSAGE = document.getElementById('auth-message');
const TARGET_PLAYER_SELECT = document.getElementById('target-player');
// ★ 新規追加: ログアウトボタン
const MASTER_LOGOUT_BUTTON = document.getElementById('master-logout-button');

// ★ 送金機能 (既存)
const TRANSFER_FORM = document.getElementById('transfer-form');
const SENDER_PLAYER_SELECT = document.getElementById('sender-player');
const RECEIVER_PLAYER_SELECT = document.getElementById('receiver-player');

// ★ レース記録機能 (修正)
const RACE_RECORD_FORM = document.getElementById('race-record-form');
const RACE_RECORD_HOLDER_SELECT = document.getElementById('race-record-holder');
const RACE_COURSE_SELECT = document.getElementById('race-course-select'); 


// ★ スポーツくじ管理機能 (大幅修正)
const BET_LIST_CONTAINER = document.getElementById('bet-list-container');
const CREATE_BET_FORM = document.getElementById('create-bet-form');

// ★★★ 麻雀結果入力機能 (新規追加) ★★★
const MAHJONG_FORM = document.getElementById('mahjong-form');
const MAHJONG_PLAYER_INPUTS_CONTAINER = document.getElementById('mahjong-player-inputs');
const MAHJONG_MESSAGE_ELEMENT = document.getElementById('mahjong-message');
const MAHJONG_SUBMIT_BUTTON = document.getElementById('mahjong-submit-button');

// ★ 新規追加: 日次ポイント徴収
const DAILY_TAX_BUTTON = document.getElementById('daily-tax-button');
const DAILY_TAX_MESSAGE = document.getElementById('daily-tax-message');

// ★★★ 新規追加: 宝くじ機能 ★★★
const CREATE_LOTTERY_FORM = document.getElementById('create-lottery-form');
const CREATE_LOTTERY_MESSAGE = document.getElementById('create-lottery-message');

// ★★★ 新規追加要素: プレゼントコード発行 ★★★
const CREATE_GIFT_CODE_FORM = document.getElementById('create-gift-code-form');
const CREATE_GIFT_CODE_MESSAGE = document.getElementById('create-gift-code-message');
// ★★★ 新規追加ここまで ★★★


// --- 定数：麻雀ルール (mahjong.jsから移動) ---
const POINT_RATE = 1000; // 1000点 = 1ポイント
const UMA_OKA = [30, 10, -10, -20]; // 4位, 3位, 2位, 1位 のボーナス/ペナルティ点 (例: 10-20ウマ)
const STARTING_SCORE = 30000; // 基準点
let ALL_PLAYER_NAMES = []; // 全プレイヤー名を保持

// ★ 修正: 認証状態をキャッシュではなく、メモリ上の変数で管理
let isAuthenticatedAsMaster = false;


// -----------------------------------------------------------------
// ★★★ 認証とログイン状態の管理 ★★★
// -----------------------------------------------------------------

/**
 * マスター認証を試みる処理
 * @param {string} username - 入力されたユーザー名
 * @param {string} password - 入力されたパスワード
 * @param {boolean} isAuto - 自動ログインかどうか
 * @returns {Promise<boolean>} 認証成功ならtrue
 */
async function attemptMasterLogin(username, password, isAuto = false) { 
    if (!isAuto) {
        showMessage(AUTH_MESSAGE, '認証中...', 'info');
    }
    
    // 1. マスターユーザー名と比較
    if (username !== MASTER_USERNAME) {
        showMessage(AUTH_MESSAGE, '❌ ユーザー名がマスターユーザー名と異なります。', 'error');
        // ★ 修正: localStorageへのアクセスを削除
        return false;
    }

    // 2. JSONBinからユーザーデータを取得し、パスワードを照合
    const allData = await fetchAllData();
    const scores = allData.scores;
    
    // 認証対象のマスターユーザーを探す
    const masterUser = scores.find(p => p.name === MASTER_USERNAME);

    // ユーザーが見つかり、パスワードが一致するかどうかをチェック
    if (masterUser && masterUser.pass === password) {
        // ★ 修正: localStorageへの認証情報保存を削除

        // 状態を更新
        isAuthenticatedAsMaster = true;

        // 2. UIの切り替え
        document.getElementById('auth-section').classList.add('hidden');
        ADMIN_TOOLS.classList.remove('hidden');
        MASTER_LOGOUT_BUTTON.classList.remove('hidden'); // ログアウトボタンを表示

        // 3. ツール類の初期化
        loadPlayerList(); 
        loadTransferPlayerLists(); 
        loadRaceRecordHolders(); 
        loadRaceCourses(); 
        initializeSportsMasterTools(); 
        loadMahjongForm(); 
        initializeLotteryForm();
        
        if (!isAuto) {
             showMessage(AUTH_MESSAGE, `✅ ログイン成功! マスターモードを有効化しました。`, 'success');
        } else {
             AUTH_MESSAGE.classList.add('hidden'); // 自動ログイン時はメッセージを非表示
        }

        return true;
    } else {
        // ★ 修正: localStorageへのアクセスを削除
        
        if (!isAuto) {
            showMessage(AUTH_MESSAGE, '❌ パスワードが間違っています。', 'error');
        }
        return false;
    }
}


/**
 * ログアウト処理
 */
function handleMasterLogout() {
    if (!window.confirm('マスターモードからログアウトしますか？')) {
        return;
    }
    
    // 1. ★ 修正: 状態をリセット
    isAuthenticatedAsMaster = false;
    // (localStorageへの保存は行っていないため、削除の必要なし)

    // 2. 状態をリセットし、UIを切り替える
    document.getElementById('auth-section').classList.remove('hidden');
    ADMIN_TOOLS.classList.add('hidden');
    MASTER_LOGOUT_BUTTON.classList.add('hidden'); // ログアウトボタンを非表示
    
    // フォームをリセット
    AUTH_FORM.reset();
    
    showMessage(AUTH_MESSAGE, '👋 マスターモードを解除しました。', 'info');
}

/**
 * ページロード時の自動ログイン処理 (★ 修正: キャッシュを使わないため、この関数は空にする)
 */
async function autoLogin() { 
    // ★ 修正: master画面ではキャッシュによる自動ログインを廃止するため、何もしない
    // ログインフォームが常に表示されます
}


// --- イベントリスナーの修正と追加 ---

// 既存のフォーム送信イベントを修正
AUTH_FORM.addEventListener('submit', async (e) => { 
    e.preventDefault();
    const username = document.getElementById('username').value.trim(); 
    const password = document.getElementById('password').value;
    
    // isAuto=false (手動ログイン) で実行
    await attemptMasterLogin(username, password, false); 
});

// ★ 新規追加: ログアウトボタンのイベントリスナー
MASTER_LOGOUT_BUTTON.addEventListener('click', handleMasterLogout);

// -----------------------------------------------------------------
// ★★★ ページロード時に autoLogin を実行 ★★★
// -----------------------------------------------------------------
window.onload = autoLogin;
// -----------------------------------------------------------------

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

// ポイント調整用リストのロード（proステータス表示を削除）
async function loadPlayerList() {
    TARGET_PLAYER_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    const scores = await fetchScores();

    if (scores.length === 0) {
        TARGET_PLAYER_SELECT.innerHTML = '<option value="" disabled selected>リストの取得に失敗</option>';
        return;
    }

    let options = '<option value="" disabled selected>プレイヤーを選択</option>';
    scores.forEach(player => { 
        // ★ 修正: proステータス表示ロジックを削除
        options += `<option value="${player.name}">${player.name} (${player.score.toFixed(1)} P)</option>`;
    });

    TARGET_PLAYER_SELECT.innerHTML = options;
}

// 送金プレイヤーリストのロード（proステータス表示を削除）
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
        // ★ 修正: proステータス表示ロジックを削除
        options += `<option value="${player.name}">${player.name}</option>`;
    });

    SENDER_PLAYER_SELECT.innerHTML = options;
    RECEIVER_PLAYER_SELECT.innerHTML = options;
}

// レース記録保持者リストのロード（proステータス表示を削除）
async function loadRaceRecordHolders() {
    RACE_RECORD_HOLDER_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    const scores = await fetchScores();

    if (scores.length === 0) {
        RACE_RECORD_HOLDER_SELECT.innerHTML = '<option value="" disabled selected>リストの取得に失敗</option>';
        return;
    }

    let options = '<option value="" disabled selected>記録保持者を選択</option>';
    scores.forEach(player => {
        // ★ 修正: proステータス表示ロジックを削除
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


// --- 麻雀結果フォーム生成/処理 (履歴削除) ---
async function loadMahjongForm() {
    // ★ 修正: MAHJONG_PLAYER_INPUTS_CONTAINER が存在しないページ (master_sports等) もあるため、nullチェック
    if (!MAHJONG_PLAYER_INPUTS_CONTAINER) return;
    
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

// ★ 修正: MAHJONG_FORM が存在しないページもあるため、nullチェック
if (MAHJONG_FORM) {
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
    
        // 削除: メモの取得
        // const memo = document.getElementById('mahjong-memo').value;
        
        MAHJONG_SUBMIT_BUTTON.disabled = true;
        MAHJONG_SUBMIT_BUTTON.textContent = '送信中...';
        showMessage(MAHJONG_MESSAGE_ELEMENT, '結果を計算し、JSONBinに送信中...', 'info');
    
        try {
            const currentData = await fetchAllData();
            // pass/pro/status/lastBonusTimeフィールドを保持するために、scores全体をマップとして処理
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p])); 
            
            results.sort((a, b) => b.score - a.score);
            
            // ★ 修正: 履歴エントリーの生成と追加を削除
            // const historyEntry = { ... };
            
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const rankIndex = i;
    
                const pointDifference = (result.score - STARTING_SCORE) / POINT_RATE;
                const bonusPoint = UMA_OKA[rankIndex];
                const finalPointChange = pointDifference + bonusPoint;
                
                // historyEntry.changes.push({name: result.name, change: parseFloat(finalPointChange.toFixed(1))});
                
                const currentPlayer = currentScoresMap.get(result.name);
                if (currentPlayer) {
                    const currentScore = currentPlayer.score || 0;
                    const newScore = currentScore + finalPointChange;
                    // pass/status/lastBonusTimeフィールドを保持したままscoreを更新
                    currentScoresMap.set(result.name, { 
                        ...currentPlayer, 
                        score: parseFloat(newScore.toFixed(1)) 
                    });
                }
            }
    
            // scores配列を再構築
            const newScores = Array.from(currentScoresMap.values());
            // const newHistory = [...currentData.history, historyEntry]; // 履歴の追加を削除
    
            // ★★★ 修正: lotteries, gift_codes フィールドを保持 ★★★
            const newData = {
                scores: newScores, // pass/pro/status/lastBonusTimeフィールドを保持したscores
                // 修正: historyは保存しない
                sports_bets: currentData.sports_bets || [],
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [], // ★ 宝くじデータを保持
                gift_codes: currentData.gift_codes || [] // ★ 新規追加: gift_codes
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
}
// --- 麻雀結果フォーム処理 終了 ---


// --- スポーツくじ管理機能 ---

async function initializeSportsMasterTools() {
    // ★ 修正: CREATE_BET_FORM が存在しないページもあるため、nullチェック
    if (!CREATE_BET_FORM) return;
    
    // オッズ追加ボタンの初期化は不要になった
    // デフォルトで現在時刻から1時間後に締切を設定
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const deadlineInput = document.getElementById('deadline-datetime');
    if (deadlineInput) {
        // master.jsでのくじ作成では開設者の入力を省略するため、作成者情報を埋める必要がない
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
    // ★ 修正: BET_LIST_CONTAINER が存在しないページもあるため、nullチェック
    if (!BET_LIST_CONTAINER) return;
    
    const data = await fetchAllData();
    const allBets = data.sports_bets || []; 
    renderBetList(allBets);
}


// --- 3. ポイント送金機能 (履歴削除) ---
// ★ 修正: TRANSFER_FORM が存在しないページもあるため、nullチェック
if (TRANSFER_FORM) {
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
            // pass/pro/status/lastBonusTimeフィールドを保持するために、scores全体をマップとして処理
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
            // ★ status/lastBonusTimeを保持
            currentScoresMap.set(sender, { 
                ...senderPlayer, 
                score: parseFloat((senderScore - amount).toFixed(1)) 
            });
            
            // 受信先スコアを更新（存在しない場合は初期化）
            if (receiverPlayer) {
                const receiverScore = receiverPlayer.score || 0;
                // ★ status/lastBonusTimeを保持
                currentScoresMap.set(receiver, { 
                    ...receiverPlayer, 
                    score: parseFloat((receiverScore + amount).toFixed(1)) 
                });
            } else {
                 // 存在しないプレイヤーに送金しようとした場合はエラーとするか、新規登録として扱う。
                 // 今回は、プレイヤーリストから選択するため、基本は存在するはず。
                 showMessage(messageEl, `エラー: 送金先 ${receiver} のデータが見つかりません。`, 'error');
                 return;
            }
    
            // ★ 修正: 履歴エントリーの生成と追加を削除
    
            const newScores = Array.from(currentScoresMap.values()); // pass/pro/status/lastBonusTimeフィールドを保持したscores
            
            // ★★★ 修正: lotteries, gift_codes フィールドを保持 ★★★
            const newData = {
                scores: newScores,
                // 修正: historyは保存しない
                sports_bets: currentData.sports_bets, 
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [], // ★ 宝くじデータを保持
                gift_codes: currentData.gift_codes || [] // ★ 新規追加: gift_codes
            };
    
            const response = await updateAllData(newData);
    
            if (response.status === 'success') {
                showMessage(messageEl, `✅ ${sender} から ${receiver} へ ${amount.toFixed(1)} P の送金を完了しました。`, 'success');
                
                TRANSFER_FORM.reset();
                loadPlayerList();
                loadTransferPlayerLists(); 
                loadMahjongForm(); 
            } else {
                showMessage(messageEl, `❌ 送金エラー: ${response.message}`, 'error');
            }
    
        } catch (error) {
            console.error(error);
            showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
        }
    });
}


// --- 5. スピードストーム レコード管理機能 (履歴削除) ---

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

// ★ 修正: RACE_RECORD_FORM が存在しないページもあるため、nullチェック
if (RACE_RECORD_FORM) {
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
    
            // let historyChanges = []; // 履歴変更ログを削除
            let newScores = currentData.scores;
    
            if (shouldAwardPoints) {
                // pass/pro/status/lastBonusTimeフィールドを保持するために、scores全体をマップとして処理
                let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
                
                const holderPlayer = currentScoresMap.get(recordHolder);
                if(holderPlayer) {
                    const currentScore = holderPlayer.score || 0;
                    // pass/status/lastBonusTimeフィールドを保持したままscoreを更新
                    currentScoresMap.set(recordHolder, { 
                        ...holderPlayer, 
                        score: parseFloat((currentScore + AWARD_POINTS).toFixed(1)) 
                    });
                    // historyChanges.push({name: recordHolder, change: AWARD_POINTS}); // 履歴変更ログの生成を削除
                }
                
                const KABOCHA_NAME = "Kabocha"; 
                const KABOCHA_BONUS = 1.0;     
                
                const kabochaPlayer = currentScoresMap.get(KABOCHA_NAME);
                if (kabochaPlayer) {
                    const kabochaCurrentScore = kabochaPlayer.score;
                    // pass/status/lastBonusTimeフィールドを保持したままscoreを更新
                    currentScoresMap.set(KABOCHA_NAME, { 
                        ...kabochaPlayer, 
                        score: parseFloat((kabochaCurrentScore + KABOCHA_BONUS).toFixed(1)) 
                    });
                    // historyChanges.push({name: KABOCHA_NAME, change: KABOCHA_BONUS}); // 履歴変更ログの生成を削除
                    logMessage += ` (報酬: ${AWARD_POINTS} P + ${KABOCHA_NAME}に ${KABOCHA_BONUS} P)`;
                } else {
                     logMessage += ` (報酬: ${AWARD_POINTS} P)`;
                }
    
                // scores配列を再構築
                newScores = Array.from(currentScoresMap.values());
    
                // ★ 修正: 履歴エントリーの生成と追加を完全に削除
                // const historyEntry = { ... };
                // currentData.history.push(historyEntry);
            }
    
            // ★★★ 修正: lotteries, gift_codes フィールドを保持 ★★★
            const newData = {
                scores: newScores, // pass/pro/status/lastBonusTimeフィールドを保持したscores
                sports_bets: currentData.sports_bets,
                speedstorm_records: records,
                lotteries: currentData.lotteries || [], // ★ 宝くじデータを保持
                gift_codes: currentData.gift_codes || [] // ★ 新規追加: gift_codes
            };
    
            const response = await updateAllData(newData);
    
            if (response.status === 'success') {
                showMessage(messageEl, logMessage, 'success');
                RACE_RECORD_FORM.reset();
                loadPlayerList();
                loadTransferPlayerLists();
                loadMahjongForm(); 
                loadRaceCourses(); // コースリストを再ロード
            } else {
                showMessage(messageEl, `❌ 更新エラー: ${response.message}`, 'error');
            }
    
        } catch (error) {
            console.error(error);
            showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
        }
    });
}


// --- 6. スポーツくじ管理機能 ---

// イベントハンドラ: 新規くじ作成 (履歴削除)
// ★ 修正: CREATE_BET_FORM が存在しないページもあるため、nullチェック
if (CREATE_BET_FORM) {
    CREATE_BET_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageEl = document.getElementById('create-message');
        const matchName = document.getElementById('match-name').value.trim();
        // 削除: 開設者名の取得
        // const creatorName = document.getElementById('creator-name').value.trim();
        const deadline = document.getElementById('deadline-datetime').value; // ISO 8601形式の文字列を取得
    
        // 修正: creatorNameのチェックを削除
        if (!matchName || !deadline) {
            showMessage(messageEl, '❌ くじ名、締切日時をすべて入力してください。', 'error');
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
            let allBets = currentData.sports_bets || [];
            
            // ★★★ 修正: 3件以上の記録がある場合、最も古い記録を削除 ★★★
            // betIdが最小（最も古い）のものを削除
            if (allBets.length >= 3) {
                // betIdで昇順ソート
                allBets.sort((a, b) => a.betId - b.betId);
                // 最初の要素（最も古い記録）を削除
                const removedBet = allBets.shift();
                console.log(`[メンテナンス] スポーツくじ ID:${removedBet.betId}「${removedBet.matchName}」を削除しました。`);
            }

            const newBetId = allBets.length > 0 ? Math.max(...allBets.map(b => b.betId)) + 1 : 1;
            
            // ★ オッズを廃止し、作成者と締切日時を追加
            const newBet = {
                betId: newBetId,
                matchName: matchName,
                creator: 'Master', // マスター作成
                deadline: deadlineDate.toISOString(), // 新規: 締切日時 (ISO文字列)
                status: 'OPEN',
                // odds: {} は廃止
                wagers: [] // 投票はwagers配列に直接格納
            };
    
            allBets.push(newBet);
            currentData.sports_bets = allBets;
            
            // ★★★ 修正: lotteries, gift_codes フィールドを保持 ★★★
            const newData = {
                scores: currentData.scores,
                sports_bets: currentData.sports_bets,
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [], // ★ 宝くじデータを保持
                gift_codes: currentData.gift_codes || [] // ★ 新規追加: gift_codes
            };
    
            const response = await updateAllData(newData);
    
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
}


// イベントハンドラ: くじ締切 (変更なし)

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
            
            // ★★★ 修正: lotteries, gift_codes フィールドを保持 ★★★
            const newData = {
                scores: currentData.scores,
                sports_bets: currentData.sports_bets,
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [], // ★ 宝くじデータを保持
                gift_codes: currentData.gift_codes || [] // ★ 新規追加: gift_codes
            };
            
            const response = await updateAllData(newData);
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
 * くじ一覧のHTMLを生成し、表示する (変更なし)
 * @param {Array<Object>} allBets - すべてのくじのデータ
 */
function renderBetList(allBets) {
    // ★ 修正: BET_LIST_CONTAINER が存在しないページもあるため、nullチェック
    if (!BET_LIST_CONTAINER) return;

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
 * 投票結果確定用の入力フィールドを生成する (変更なし)
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

// --- イベントハンドラ: 個別投票結果の確定とポイント反映 (履歴削除) ---

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
        
        // let totalPointChange = 0; // 履歴ログ用変数を削除
        // let historyChanges = []; // 履歴ログ用変数を削除
        let updatedWagersCount = 0;
        
        // pass/pro/status/lastBonusTimeフィールドを保持するために、scores全体をマップとして処理
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
                // pass/status/lastBonusTimeフィールドを保持したままscoreを更新
                currentScoresMap.set(player, { 
                    ...currentPlayer, 
                    score: parseFloat((currentScore + pointChange).toFixed(1)) 
                });
                
                // 履歴記録用の変更点を蓄積 (削除)
                // historyChanges.push({ name: player, change: parseFloat(pointChange.toFixed(1)) });
                // totalPointChange += pointChange;
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

        // ★ 修正: 履歴エントリーの生成と追加を完全に削除
        // const historyEntry = { ... };
        // currentData.history.push(historyEntry);

        // データ全体を更新
        bet.wagers = originalWagers;
        allBets[betIndex] = bet;
        currentData.sports_bets = allBets;
        currentData.scores = Array.from(currentScoresMap.values()); // pass/pro/status/lastBonusTimeフィールドを保持したscores
        
        // ★★★ 修正: lotteries, gift_codes フィールドを保持 ★★★
        const newData = {
            scores: currentData.scores,
            sports_bets: currentData.sports_bets,
            speedstorm_records: currentData.speedstorm_records || [],
            lotteries: currentData.lotteries || [], // ★ 宝くじデータを保持
            gift_codes: currentData.gift_codes || [] // ★ 新規追加: gift_codes
        };
        
        const response = await updateAllData(newData);

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

// --- イベントハンドラ: くじ完了 (SETTLED) にする (変更なし) ---

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
        
        // ★★★ 修正: lotteries, gift_codes フィールドを保持 ★★★
        const newData = {
            scores: currentData.scores,
            sports_bets: currentData.sports_bets,
            speedstorm_records: currentData.speedstorm_records || [],
            lotteries: currentData.lotteries || [], // ★ 宝くじデータを保持
            gift_codes: currentData.gift_codes || [] // ★ 新規追加: gift_codes
        };
        
        const response = await updateAllData(newData);

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


// --- 特殊ポイント調整機能 (履歴削除) ---
// ★ 修正: adjustment-form が存在しないページもあるため、nullチェック
if (document.getElementById('adjustment-form')) {
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
            // pass/pro/status/lastBonusTimeフィールドを保持するために、scores全体をマップとして処理
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            
            const player = currentScoresMap.get(targetPlayerName);
            
            if (!player) {
                showMessage(messageEl, `エラー: プレイヤー ${targetPlayerName} が見つかりません。`, 'error');
                return;
            }
            
            const newScore = player.score + adjustAmount;
            
            // pass/status/lastBonusTimeフィールドを保持したままscoreを更新
            currentScoresMap.set(targetPlayerName, { 
                ...player, 
                score: parseFloat(newScore.toFixed(1)) 
            });
            
            // ★ 修正: 履歴エントリーの生成と追加を削除
    
            const newScores = Array.from(currentScoresMap.values()); // pass/pro/status/lastBonusTimeフィールドを保持したscores
    
            // ★★★ 修正: lotteries, gift_codes フィールドを保持 ★★★
            const newData = {
                scores: newScores,
                // 修正: historyは保存しない
                sports_bets: currentData.sports_bets,
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [], // ★ 宝くじデータを保持
                gift_codes: currentData.gift_codes || [] // ★ 新規追加: gift_codes
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
}

// --- 日次ポイント徴収機能のロジック (新規追加) ---

// ★ 修正: DAILY_TAX_BUTTON が存在しないページもあるため、nullチェック
if (DAILY_TAX_BUTTON) {
    DAILY_TAX_BUTTON.addEventListener('click', async () => {
        // ★ 修正: TOTAL_TAX_AMOUNT を定数から削除
        // const TOTAL_TAX_AMOUNT = 100.0; // 削除
        const TAX_RATE = 0.05; // 徴収率 5%
        const EXCLUDED_PLAYER_NAMES = ['3mahjong']; 
        const messageEl = DAILY_TAX_MESSAGE;
    
        if (!window.confirm(`全プレイヤーの保有ポイント合計の ${TAX_RATE * 100}% を比例配分で徴収を実行します。よろしいですか？`)) {
            return;
        }
    
        DAILY_TAX_BUTTON.disabled = true;
        showMessage(messageEl, 'ポイント徴収を処理中...', 'info');
        
        try {
            const currentData = await fetchAllData();
            // pass/pro/status/lastBonusTimeフィールドを保持するために、scores全体をマップとして処理
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            
            // 1. 徴収対象プレイヤーの特定と総ポイントの計算
            const targetPlayers = currentData.scores.filter(player => 
                !EXCLUDED_PLAYER_NAMES.includes(player.name)
            );
            
            // 徴収対象プレイヤーの合計ポイントを計算 (ポイントがマイナスの場合は0として扱う)
            const totalTargetScore = targetPlayers.reduce((sum, player) => sum + Math.max(0, player.score), 0);
            
            // ★ 新規: 徴収合計額を計算 (保有ポイントの合計の0.5割)
            const CALCULATED_TAX_AMOUNT = parseFloat((totalTargetScore * TAX_RATE).toFixed(1)); 

            if (totalTargetScore <= 0 || CALCULATED_TAX_AMOUNT <= 0) {
                showMessage(messageEl, '⚠️ 徴収対象プレイヤーの合計ポイントが0以下、または徴収合計額が0です。徴収はスキップされました。', 'info');
                return;
            }
    
            let pointsToDistribute = {}; // 徴収額を保持するオブジェクト
    
            // 2. 各プレイヤーの徴収額を計算
            targetPlayers.forEach(player => {
                // ポイントがマイナスまたはゼロの場合は徴収しない
                if (player.score <= 0) {
                     pointsToDistribute[player.name] = 0;
                     return;
                }
    
                // 比例配分で徴収額を計算し、小数点第一位に丸める
                // CALCULATED_TAX_AMOUNT を使用して比例配分する
                const taxAmount = parseFloat((CALCULATED_TAX_AMOUNT * (player.score / totalTargetScore)).toFixed(1));
                pointsToDistribute[player.name] = taxAmount;
            });
            
            // 3. スコアを更新
            targetPlayers.forEach(player => {
                const taxAmount = pointsToDistribute[player.name];
                
                if (taxAmount > 0) {
                    const newScore = player.score - taxAmount;
                    
                    // pass/status/lastBonusTimeフィールドを保持したままscoreを更新
                    currentScoresMap.set(player.name, { 
                        ...player, 
                        score: parseFloat(newScore.toFixed(1)) 
                    });
                }
            });
            
            const newScores = Array.from(currentScoresMap.values()); // pass/pro/status/lastBonusTimeフィールドを保持したscores
    
            // ★★★ 修正: lotteries, gift_codes フィールドを保持 ★★★
            const newData = {
                scores: newScores,
                sports_bets: currentData.sports_bets,
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [], // ★ 宝くじデータを保持
                gift_codes: currentData.gift_codes || [] // ★ 新規追加: gift_codes
            };
    
            const response = await updateAllData(newData);
    
            if (response.status === 'success') {
                // 徴収された合計ポイントを再計算し、小数点第一位で表示
                const finalTaxCollected = newScores
                    .filter(p => targetPlayers.map(tp => tp.name).includes(p.name)) // 徴収対象プレイヤーのみ
                    .reduce((sum, current) => {
                        const originalPlayer = currentData.scores.find(s => s.name === current.name);
                        // (元のスコア) - (新しいスコア) を計算
                        return sum + (originalPlayer.score - current.score);
                    }, 0);
    
                showMessage(messageEl, `✅ 日次ポイント徴収を完了しました。合計徴収ポイント: ${finalTaxCollected.toFixed(1)} P (保有ポイント合計 ${totalTargetScore.toFixed(1)} P の約5%)`, 'success');
                
                // UIを更新
                loadPlayerList(); 
                loadTransferPlayerLists();
                loadMahjongForm();
            } else {
                showMessage(messageEl, `❌ 徴収エラー: ${response.message}`, 'error');
            }
    
        } catch (error) {
            console.error(error);
            showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
        } finally {
            DAILY_TAX_BUTTON.disabled = false;
        }
    });
}


// -----------------------------------------------------------------
// ★★★ 新規追加: プレゼントコード発行機能 ★★★
// -----------------------------------------------------------------

if (CREATE_GIFT_CODE_FORM) {
    CREATE_GIFT_CODE_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageEl = CREATE_GIFT_CODE_MESSAGE;
        const submitButton = CREATE_GIFT_CODE_FORM.querySelector('button[type="submit"]');

        const codeName = document.getElementById('gift-code-name').value.trim().toUpperCase();
        const points = parseFloat(document.getElementById('gift-code-amount').value);
        const maxUses = parseInt(document.getElementById('gift-code-max-uses').value, 10);

        if (!codeName || isNaN(points) || isNaN(maxUses) || maxUses < 0) {
            showMessage(messageEl, '❌ エラー: コード名、ポイント、最大利用回数をすべて正しく入力してください。', 'error');
            return;
        }

        submitButton.disabled = true;
        showMessage(messageEl, 'プレゼントコードを作成中...', 'info');

        try {
            const currentData = await fetchAllData();
            let allGiftCodes = currentData.gift_codes || [];
            
            // 既存コードとの重複チェック
            const existingCode = allGiftCodes.find(c => c.code === codeName);
            if (existingCode) {
                showMessage(messageEl, `❌ エラー: コード名「${codeName}」は既に存在します。`, 'error');
                return;
            }

            const newGiftCode = {
                code: codeName,
                points: parseFloat(points.toFixed(1)), // 小数点第一位に丸める
                maxUses: maxUses,
                currentUses: 0,
                usedBy: [],
                createdAt: new Date().toISOString()
            };

            allGiftCodes.push(newGiftCode);
            currentData.gift_codes = allGiftCodes;
            
            // 全データを更新
            // ★★★ 修正: lotteries, gift_codes フィールドを保持 ★★★
            const newData = {
                scores: currentData.scores,
                sports_bets: currentData.sports_bets,
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [],
                gift_codes: currentData.gift_codes // ★ 新規追加: gift_codes
            };

            const response = await updateAllData(newData);

            if (response.status === 'success') {
                showMessage(messageEl, `✅ コード「${codeName}」を発行しました (${newGiftCode.points.toFixed(1)} P、最大${maxUses === 0 ? '無制限' : maxUses}回)。`, 'success');
                CREATE_GIFT_CODE_FORM.reset();
                document.getElementById('gift-code-max-uses').value = 1; // フォームリセット後にデフォルト値に戻す
            } else {
                showMessage(messageEl, `❌ 発行エラー: ${response.message}`, 'error');
            }

        } catch (error) {
            console.error("プレゼントコード発行中にエラー:", error);
            showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
        }
    });
}


// -----------------------------------------------------------------
// ★★★ 新規追加: 宝くじ開催機能 ★★★
// -----------------------------------------------------------------

/**
 * 宝くじフォームの初期化 (日付入力のデフォルト値設定)
 */
function initializeLotteryForm() {
    if (!CREATE_LOTTERY_FORM) return;
    
    // デフォルト: 購入締切を3日後、結果発表を4日後に設定
    const now = new Date();
    const purchaseDeadline = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const resultAnnounceDate = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

    // タイムゾーンを考慮して YYYY-MM-DDTHH:MM 形式に変換
    purchaseDeadline.setMinutes(purchaseDeadline.getMinutes() - purchaseDeadline.getTimezoneOffset());
    resultAnnounceDate.setMinutes(resultAnnounceDate.getMinutes() - resultAnnounceDate.getTimezoneOffset());

    document.getElementById('lottery-purchase-deadline').value = purchaseDeadline.toISOString().slice(0, 16);
    document.getElementById('lottery-result-announce').value = resultAnnounceDate.toISOString().slice(0, 16);
}

/**
 * 宝くじ開催フォームの送信イベント
 */
if (CREATE_LOTTERY_FORM) {
    CREATE_LOTTERY_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageEl = CREATE_LOTTERY_MESSAGE;
        const submitButton = CREATE_LOTTERY_FORM.querySelector('button[type="submit"]');

        const lotteryName = document.getElementById('lottery-name').value.trim();
        const ticketPrice = parseFloat(document.getElementById('lottery-ticket-price').value);
        const purchaseDeadline = document.getElementById('lottery-purchase-deadline').value;
        const resultAnnounceDate = document.getElementById('lottery-result-announce').value;

        if (!lotteryName || isNaN(ticketPrice) || ticketPrice <= 0 || !purchaseDeadline || !resultAnnounceDate) {
            showMessage(messageEl, '❌ エラー: 基本情報 (名前, 価格, 期限, 発表日) をすべて正しく入力してください。', 'error');
            return;
        }
        
        const purchaseDeadlineDate = new Date(purchaseDeadline);
        const resultAnnounceDateDate = new Date(resultAnnounceDate);

        if (purchaseDeadlineDate <= new Date() || resultAnnounceDateDate <= purchaseDeadlineDate) {
            showMessage(messageEl, '❌ エラー: 購入期限は現在より後、発表日は購入期限より後に設定してください。', 'error');
            return;
        }

        // 当選確率と金額の収集
        const prizes = [];
        let totalProbability = 0;
        let validPrizes = 0;

        for (let i = 1; i <= 5; i++) {
            const amount = parseFloat(document.getElementById(`lottery-prize-amount-${i}`).value);
            const probPercent = parseFloat(document.getElementById(`lottery-prize-prob-${i}`).value);

            if (!isNaN(amount) && amount > 0 && !isNaN(probPercent) && probPercent > 0) {
                const probability = probPercent / 100.0; // 1% -> 0.01
                prizes.push({
                    rank: i,
                    amount: amount,
                    probability: probability
                });
                totalProbability += probability;
                validPrizes++;
            }
        }

        if (validPrizes === 0) {
            showMessage(messageEl, '❌ エラー: 少なくとも1つの有効な当選（金額と確率）を設定してください。', 'error');
            return;
        }

        if (totalProbability > 1.0) {
            showMessage(messageEl, `❌ エラー: 当選確率の合計が ${totalProbability * 100}% となり、100% を超えています。`, 'error');
            return;
        }

        // 当選確率順（高確率＝低ランク）ではなく、ランク順（1等から）にソート
        prizes.sort((a, b) => a.rank - b.rank); 

        submitButton.disabled = true;
        showMessage(messageEl, '宝くじを作成中...', 'info');

        try {
            const currentData = await fetchAllData();
            let allLotteries = currentData.lotteries || [];
            
            // ★★★ 修正: 3件以上の記録がある場合、最も古い記録を削除 ★★★
            // lotteryIdが最小（最も古い）のものを削除
            if (allLotteries.length >= 3) {
                // lotteryIdで昇順ソート
                allLotteries.sort((a, b) => a.lotteryId - b.lotteryId);
                // 最初の要素（最も古い記録）を削除
                const removedLottery = allLotteries.shift();
                console.log(`[メンテナンス] 宝くじ ID:${removedLottery.lotteryId}「${removedLottery.name}」を削除しました。`);
            }
            
            const newLotteryId = allLotteries.length > 0 ? Math.max(...allLotteries.map(l => l.lotteryId)) + 1 : 1;

            const newLottery = {
                lotteryId: newLotteryId,
                name: lotteryName,
                ticketPrice: ticketPrice,
                purchaseDeadline: purchaseDeadlineDate.toISOString(),
                resultAnnounceDate: resultAnnounceDateDate.toISOString(),
                status: 'OPEN', // OPEN, CLOSED, FINISHED
                prizes: prizes,
                tickets: []
            };

            currentData.lotteries.push(newLottery);
            
            // 全データを更新
            // ★★★ 修正: gift_codes フィールドを保持 ★★★
            const newData = {
                scores: currentData.scores,
                sports_bets: currentData.sports_bets,
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries,
                gift_codes: currentData.gift_codes || [] // ★ 新規追加: gift_codes
            };

            const response = await updateAllData(newData);

            if (response.status === 'success') {
                showMessage(messageEl, `✅ 宝くじ「${lotteryName}」を作成しました (ID: ${newLotteryId})`, 'success');
                CREATE_LOTTERY_FORM.reset();
                initializeLotteryForm(); // 日付をリセット
            } else {
                showMessage(messageEl, `❌ 作成エラー: ${response.message}`, 'error');
            }

        } catch (error) {
            console.error("宝くじ作成中にエラー:", error);
            showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
        }
    });
}
