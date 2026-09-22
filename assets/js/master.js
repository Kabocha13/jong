// assets/js/master.js

const AUTH_FORM = document.getElementById('auth-form');
const ADMIN_TOOLS = document.getElementById('admin-tools');
const AUTH_MESSAGE = document.getElementById('auth-message');
const TARGET_PLAYER_SELECT = document.getElementById('target-player');
const MASTER_LOGOUT_BUTTON = document.getElementById('master-logout-button');

// ★ 送金機能 (既存)
const TRANSFER_FORM = document.getElementById('transfer-form');
const SENDER_PLAYER_SELECT = document.getElementById('sender-player');
const RECEIVER_PLAYER_SELECT = document.getElementById('receiver-player');

// ★ スポーツくじ管理機能
const BET_LIST_CONTAINER = document.getElementById('bet-list-container');
const CREATE_BET_FORM = document.getElementById('create-bet-form');

// ★★★ 麻雀結果入力機能 (新規追加) ★★★
const MAHJONG_FORM = document.getElementById('mahjong-form');
const MAHJONG_PLAYER_INPUTS_CONTAINER = document.getElementById('mahjong-player-inputs');
const MAHJONG_PLAYER_COUNT_SELECT = document.getElementById('mahjong-player-count');
const MAHJONG_RULE_NOTE = document.getElementById('mahjong-rule-note');
const MAHJONG_MESSAGE_ELEMENT = document.getElementById('mahjong-message');
const MAHJONG_SUBMIT_BUTTON = document.getElementById('mahjong-submit-button');

// ★ 日次レート補正設定
const RATE_REVERSION_FORM = document.getElementById('rate-reversion-form');
const RATE_REVERSION_BASELINE_INPUT = document.getElementById('rate-reversion-baseline');
const RATE_REVERSION_RATE_INPUT = document.getElementById('rate-reversion-rate');
const RATE_REVERSION_FLAT_INPUT = document.getElementById('rate-reversion-flat');
const RATE_REVERSION_STATUS = document.getElementById('rate-reversion-status');
const RATE_REVERSION_MESSAGE = document.getElementById('rate-reversion-message');

const MEMBER_STATUS_LIST = document.getElementById('member-status-list');
const MEMBER_STATUS_SAVE_BUTTON = document.getElementById('member-status-save-button');
const MEMBER_STATUS_MESSAGE = document.getElementById('member-status-message');

const ATTENDANCE_ACCESS_LIST = document.getElementById('attendance-access-list');
const ATTENDANCE_ACCESS_SAVE_BUTTON = document.getElementById('attendance-access-save-button');
const ATTENDANCE_ACCESS_MESSAGE = document.getElementById('attendance-access-message');

// ★★★ 新規追加: 宝くじ機能 ★★★
const CREATE_LOTTERY_FORM = document.getElementById('create-lottery-form');
const CREATE_LOTTERY_MESSAGE = document.getElementById('create-lottery-message');

// ★★★ 新規追加要素: プレゼントコード発行 ★★★
const CREATE_GIFT_CODE_FORM = document.getElementById('create-gift-code-form');
const CREATE_GIFT_CODE_MESSAGE = document.getElementById('create-gift-code-message');
// ★★★ 新規追加ここまで ★★★


// --- 定数：麻雀レートのルール ---
// レート変動 = (最終得点 - 原点) / 1000 + ウマ + (卓平均レート - 自分のレート) / 40
// ウマの合計もレート差補正の合計も 0 なので、人数が何人でも卓全体のレートは増減しない。
const MAHJONG_SCORE_UNIT = 1000;              // 1000点 = 1レート
const MAHJONG_RATE_DIFF_DIVISOR = 40;         // レート差補正の分母
const MAHJONG_TOTAL_TOLERANCE = 100;          // 合計点のズレをどこまで黙認するか
const MAHJONG_RULES = {
    4: { label: '四人麻雀', startingScore: 30000, uma: [30, 10, -10, -30] },
    3: { label: '三人麻雀', startingScore: 35000, uma: [30, 0, -30] }
};

function getMahjongPlayerCount() {
    const count = parseInt(MAHJONG_PLAYER_COUNT_SELECT?.value, 10);
    return MAHJONG_RULES[count] ? count : 4;
}

function getMahjongRule() {
    return MAHJONG_RULES[getMahjongPlayerCount()];
}
let ALL_PLAYER_NAMES = []; // 全プレイヤー名を保持

// ★ 修正: 認証状態をキャッシュではなく、メモリ上の変数で管理
let isAuthenticatedAsMaster = false;

/**
 * 管理画面に差し込む文字列のエスケープ。
 * main.js の escapeText と同じ処理だが、main.js は管理画面では読み込まれないため
 * ここに定義する (未定義のまま呼ばれていて出席表示設定が動作していなかった)
 */
function escapeAdminText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function finishAuthPending() {
    document.documentElement.classList.remove('auth-pending');
}


// -----------------------------------------------------------------
// ★★★ 認証とログイン状態の管理 ★★★
// -----------------------------------------------------------------

/**
 * マスターアカウントのID/パスワードで管理画面を開く処理
 * @param {string} username - 入力されたID (MASTER_USERNAME と一致する必要がある)
 * @param {string} password - 入力されたパスワード
 * @param {boolean} isAuto - 自動ログインかどうか
 * @returns {Promise<boolean>} 認証成功ならtrue
 */
async function attemptMasterLogin(username, password, isAuto = false) {
    if (!isAuto) {
        showMessage(AUTH_MESSAGE, '確認中...', 'info');
    }

    // 管理画面はマスターアカウント専用。他のユーザーのログインは受け付けない
    if (username !== MASTER_USERNAME) {
        showMessage(AUTH_MESSAGE, '❌ 管理者アカウントではありません。', 'error');
        finishAuthPending();
        return false;
    }

    try {
        // マイページと同じ認証を通す。以降の書き込みは Firebase の IDトークンで認可される
        await qjongSignIn(username, password);
    } catch (error) {
        if (isAuto) {
            localStorage.removeItem('authUsername');
            localStorage.removeItem('authPassword');
        } else {
            showMessage(AUTH_MESSAGE, '❌ IDまたはパスワードが違います。', 'error');
        }
        finishAuthPending();
        return false;
    }

    try {
        await runDailyRateReversionIfNeeded().catch(error => {
            console.warn('日次レート補正に失敗しました。マスター画面の表示は継続します。', error);
        });
        const allData = await fetchAllData();
        const scores = allData.scores;
        
        // 認証対象のマスターユーザーを探す
        const masterUser = scores.find(p => p.name === MASTER_USERNAME);

        if (!masterUser) {
            console.error("[ERROR:master.js] 認証失敗: 取得データ内にマスターユーザーが見つかりません。");
            showMessage(AUTH_MESSAGE, '❌ ユーザーデータにマスターアカウントが見つかりませんでした。', 'error');
            finishAuthPending();
            return false;
        }

        // ★ 認証成功ロジック
        isAuthenticatedAsMaster = true;
        localStorage.setItem('authUsername', username);
        localStorage.setItem('authPassword', password);
        if (window.refreshMasterNavLinks) window.refreshMasterNavLinks();
        if (window.refreshSpecialThemeDisplayToggle) window.refreshSpecialThemeDisplayToggle();

        // UIの切り替え
        document.getElementById('auth-section').classList.add('hidden');
        ADMIN_TOOLS.classList.remove('hidden');
        if (MASTER_LOGOUT_BUTTON) MASTER_LOGOUT_BUTTON.classList.remove('hidden'); // ログアウトボタンを表示
        finishAuthPending();

        // ツール類の初期化
        loadPlayerList();
        loadTransferPlayerLists();
        initializeSportsMasterTools();
        loadMahjongForm();
        initializeLotteryForm();
        loadSpecialThemeStatus();
        loadAttendanceAccessStatus();
        loadMemberStatusList();
        loadRateReversionSettings();
        
        if (!isAuto) {
             showMessage(AUTH_MESSAGE, `✅ ログイン成功! マスターモードを有効化しました。`, 'success');
        } else {
             AUTH_MESSAGE.classList.add('hidden'); // 自動ログイン時はメッセージを非表示
        }

        return true;
    } catch (error) {
        console.error("マスター認証中にエラー:", error);
        showMessage(AUTH_MESSAGE, `❌ Firebase認証エラー: ${error.message}`, 'error');
        finishAuthPending();
        return false;
    }
}


/**
 * ログアウト処理
 */
function handleMasterLogout() {
    // 既存の window.confirm をカスタムモーダルに置き換える指示がないため、一旦そのままにする
    if (!window.confirm('マスターモードからログアウトしますか？')) {
        return;
    }
    
    // 1. 状態をリセット
    isAuthenticatedAsMaster = false;
    localStorage.removeItem('authUsername');
    localStorage.removeItem('authPassword');
    qjongSignOut();
    if (window.refreshMasterNavLinks) window.refreshMasterNavLinks();
    if (window.refreshSpecialThemeDisplayToggle) window.refreshSpecialThemeDisplayToggle();

    // 2. 状態をリセットし、UIを切り替える
    finishAuthPending();
    document.getElementById('auth-section').classList.remove('hidden');
    ADMIN_TOOLS.classList.add('hidden');
    if (MASTER_LOGOUT_BUTTON) MASTER_LOGOUT_BUTTON.classList.add('hidden'); // ログアウトボタンを非表示
    
    showMessage(AUTH_MESSAGE, '👋 マスターモードを解除しました。', 'info');
}

/**
 * ページロード時の自動ログイン処理
 */
async function autoLogin() {
    const username = localStorage.getItem('authUsername');
    const password = localStorage.getItem('authPassword');

    if (username === MASTER_USERNAME && password) {
        const success = await attemptMasterLogin(username, password, true);
        if (!success) finishAuthPending();
        return;
    }
    finishAuthPending();
}


// --- イベントリスナーの修正と追加 ---

if (AUTH_FORM) {
    AUTH_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('master-username').value.trim();
        const password = document.getElementById('master-password').value;
        await attemptMasterLogin(username, password, false);
    });
}

// ★ 新規追加: ログアウトボタンのイベントリスナー
if (MASTER_LOGOUT_BUTTON) MASTER_LOGOUT_BUTTON.addEventListener('click', handleMasterLogout);

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

// レート調整用リストのロード（proステータス表示を削除）
async function loadPlayerList() {
    if (!TARGET_PLAYER_SELECT) return; // 要素がない場合はスキップ

    TARGET_PLAYER_SELECT.innerHTML = '<option value="" disabled selected>ロード中...</option>';
    const scores = await fetchScores();

    if (scores.length === 0) {
        TARGET_PLAYER_SELECT.innerHTML = '<option value="" disabled selected>リストの取得に失敗</option>';
        return;
    }

    let options = '<option value="" disabled selected>プレイヤーを選択</option>';
    scores.forEach(player => { 
        // ★ 修正: proステータス表示ロジックを削除
        options += `<option value="${player.name}">${player.name} (${formatRate(player.score)})</option>`;
    });

    TARGET_PLAYER_SELECT.innerHTML = options;
}

// 送金プレイヤーリストのロード（proステータス表示を削除）
async function loadTransferPlayerLists() {
    if (!SENDER_PLAYER_SELECT || !RECEIVER_PLAYER_SELECT) return; // 要素がない場合はスキップ

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

// --- 麻雀結果フォーム生成/処理 ---
function renderMahjongRuleNote() {
    if (!MAHJONG_RULE_NOTE) return;
    const count = getMahjongPlayerCount();
    const rule = MAHJONG_RULES[count];
    const umaText = rule.uma
        .map((value, index) => `${index + 1}位 ${value >= 0 ? '+' : ''}${value}`)
        .join(' / ');

    MAHJONG_RULE_NOTE.innerHTML = `
        ${count}人の最終得点を入力します (合計 ${formatRate(rule.startingScore * count)} 点)。<br>
        レート変動 = (最終得点 − ${formatRate(rule.startingScore)}) ÷ ${MAHJONG_SCORE_UNIT}
        ＋ ウマ(${escapeAdminText(umaText)})
        ＋ (卓の平均レート − 本人のレート) ÷ ${MAHJONG_RATE_DIFF_DIVISOR}<br>
        <span class="text-small">格上に勝つほど大きく上がり、卓全体の合計は増減しません。</span>`;
}

async function loadMahjongForm() {
    // ★ 修正: MAHJONG_PLAYER_INPUTS_CONTAINER が存在しないページ (master_sports等) もあるため、nullチェック
    if (!MAHJONG_PLAYER_INPUTS_CONTAINER) return;

    renderMahjongRuleNote();

    const success = await fetchAndSetPlayerNames();

    if (!success) {
        MAHJONG_PLAYER_INPUTS_CONTAINER.innerHTML = '<p class="error">参加者リストを取得できませんでした。</p>';
        return;
    }

    // 三人麻雀のダミー席として使っていた 3mahjong は、卓平均レートを狂わせるので選ばせない
    const selectableNames = ALL_PLAYER_NAMES.filter(name => !RATE_EXCLUDED_PLAYERS.includes(name));

    let html = '';
    for (let i = 1; i <= getMahjongPlayerCount(); i++) {
        html += `
            <div class="form-group player-input-row">
                <label for="mahjong-player-${i}-name">プレイヤー${i}:</label>
                <select id="mahjong-player-${i}-name" required>
                    <option value="" disabled selected>名前を選択</option>
                    ${selectableNames.map(name => `<option value="${name}">${name}</option>`).join('')}
                </select>
                <input type="number" id="mahjong-player-${i}-score" placeholder="最終得点 (例: 32500)" required>
            </div>
        `;
    }
    MAHJONG_PLAYER_INPUTS_CONTAINER.innerHTML = html;
}

MAHJONG_PLAYER_COUNT_SELECT?.addEventListener('change', () => {
    loadMahjongForm();
    if (MAHJONG_MESSAGE_ELEMENT) MAHJONG_MESSAGE_ELEMENT.classList.add('hidden');
});

// ★ 修正: MAHJONG_FORM が存在しないページもあるため、nullチェック
if (MAHJONG_FORM) {
    MAHJONG_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const playerCount = getMahjongPlayerCount();
        const rule = MAHJONG_RULES[playerCount];
        const results = [];
        const selectedNames = new Set();
        let totalScore = 0;

        for (let i = 1; i <= playerCount; i++) {
            const nameElement = document.getElementById(`mahjong-player-${i}-name`);
            const scoreElement = document.getElementById(`mahjong-player-${i}-score`);

            const name = nameElement.value;
            // 飛んだ人はマイナス点で終わるので、負の得点も受け付ける
            const score = parseInt(scoreElement.value, 10);

            if (!name || !Number.isFinite(score)) {
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

        // 合計がずれているとゼロサムが崩れ、卓の外のレートまで動いてしまう
        const expectedTotal = rule.startingScore * playerCount;
        if (Math.abs(totalScore - expectedTotal) > MAHJONG_TOTAL_TOLERANCE) {
            const proceed = window.confirm(
                `合計点が ${totalScore} 点です (${rule.label}は ${expectedTotal} 点)。\n`
                + 'このまま反映すると卓全体のレート合計が増減します。続けますか？'
            );
            if (!proceed) {
                showMessage(MAHJONG_MESSAGE_ELEMENT, '反映を中止しました。得点を確認してください。', 'info');
                return;
            }
        }

        
        MAHJONG_SUBMIT_BUTTON.disabled = true;
        MAHJONG_SUBMIT_BUTTON.textContent = '送信中...';
        showMessage(MAHJONG_MESSAGE_ELEMENT, '結果を計算し、Firebaseに送信中...', 'info');
    
        try {
            const currentData = await fetchAllData();
            // pass/pro/status/lastBonusTimeフィールドを保持するために、scores全体をマップとして処理
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p])); 
            
            results.sort((a, b) => b.score - a.score);

            // 1人でも欠けていると卓平均が狂い、全員のレートがずれてしまう
            const missing = results.filter(result => !currentScoresMap.has(result.name)).map(result => result.name);
            if (missing.length > 0) {
                showMessage(MAHJONG_MESSAGE_ELEMENT, `❌ プレイヤーデータが見つかりません: ${missing.join(', ')}`, 'error');
                return;
            }

            // 卓平均レートは「対局前」のレートで固定する。
            // 先に計算した人の結果が後の人の補正に影響しないようにするため。
            const seatRates = results.map(result => normalizeRate(currentScoresMap.get(result.name).score));
            const tableAverageRate = seatRates.reduce((sum, rate) => sum + rate, 0) / results.length;

            for (let i = 0; i < results.length; i++) {
                const result = results[i];

                const scoreDifference = (result.score - rule.startingScore) / MAHJONG_SCORE_UNIT;
                const uma = rule.uma[i];
                const rateDiffBonus = (tableAverageRate - seatRates[i]) / MAHJONG_RATE_DIFF_DIVISOR;
                const rateChange = Math.round(scoreDifference + uma + rateDiffBonus);

                const currentPlayer = currentScoresMap.get(result.name);
                if (currentPlayer) {
                    // pass/status/lastBonusTimeフィールドを保持したままレートを更新
                    currentScoresMap.set(result.name, {
                        ...currentPlayer,
                        score: normalizeRate(seatRates[i] + rateChange)
                    });
                }
            }
    
            // scores配列を再構築
            const newScores = Array.from(currentScoresMap.values());
            
    
            const newData = {
                scores: newScores, // pass/pro/status/lastBonusTimeフィールドを保持したscores
                sports_bets: currentData.sports_bets || [],
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [], // ★ 宝くじデータを保持
                gift_codes: currentData.gift_codes || [] // ★ 新規追加: gift_codes
            };
    
            const response = await updateAllData(newData);
    
            if (response.status === 'success') {
                showMessage(MAHJONG_MESSAGE_ELEMENT, `✅ 成功! ${rule.label}の結果でレートが更新されました。`, 'success');
                // フォームをリセットして再ロード
                MAHJONG_FORM.reset();
                loadPlayerList(); // レート調整リストを更新
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
    // ★ 修正: CREATE_BET_FORM が存在しないページ (master_sports等) もあるため、nullチェック
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


// --- 3. レート送金機能 (履歴削除) ---
// ★ 修正: TRANSFER_FORM が存在しないページもあるため、nullチェック
if (TRANSFER_FORM) {
    TRANSFER_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageEl = document.getElementById('transfer-message');
        const sender = SENDER_PLAYER_SELECT.value;
        const receiver = RECEIVER_PLAYER_SELECT.value;
        const amount = Math.round(parseFloat(document.getElementById('transfer-amount').value));
    
        if (!sender || !receiver || !Number.isFinite(amount) || amount < 1) {
            showMessage(messageEl, 'エラー: 送金元、送金先、および有効なレートを入力してください。', 'error');
            return;
        }
        if (sender === receiver) {
            showMessage(messageEl, 'エラー: 送金元と送金先は異なるプレイヤーである必要があります。', 'error');
            return;
        }
    
        showMessage(messageEl, 'レート送金を処理中...', 'info');
    
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
                showMessage(messageEl, `エラー: ${sender} の残りレート (${formatRate(senderScore)}) が不足しています。`, 'error');
                return;
            }
    
            // 送信元スコアを更新
            // ★ status/lastBonusTimeを保持
            currentScoresMap.set(sender, { 
                ...senderPlayer, 
                score: normalizeRate(senderScore - amount) 
            });
            
            // 受信先スコアを更新（存在しない場合は初期化）
            if (receiverPlayer) {
                const receiverScore = receiverPlayer.score || 0;
                // ★ status/lastBonusTimeを保持
                currentScoresMap.set(receiver, { 
                    ...receiverPlayer, 
                    score: normalizeRate(receiverScore + amount) 
                });
            } else {
                 // 存在しないプレイヤーに送金しようとした場合はエラーとするか、新規登録として扱う。
                 // 今回は、プレイヤーリストから選択するため、基本は存在するはず。
                 showMessage(messageEl, `エラー: 送金先 ${receiver} のデータが見つかりません。`, 'error');
                 return;
            }
    
            // 削除: 履歴エントリーの生成と追加を削除
    
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
                showMessage(messageEl, `✅ ${sender} から ${receiver} へ レート ${formatRate(amount)} の送金を完了しました。`, 'success');
                
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
                return `<li class="wager-item" title="${w.item}">${playerInitials}: ${formatRate(w.amount)} - ${w.item} ${winStatus}</li>`;
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
                    <strong>合計投票:</strong> レート ${formatRate(totalWagers)} (${bet.wagers.length}件)
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
                    <strong>${wager.player}:</strong> レート ${formatRate(wager.amount)} / ${wager.item}
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
            // formIndexではなく、data-wager-indexを使うように修正
            const index = e.target.closest('.wager-result-row').querySelector('.applied-odds-input').dataset.wagerIndex;
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

// --- イベントハンドラ: 個別投票結果の確定とレート反映 (履歴削除) ---

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
            let rateChange = 0; // 反映するレートの増減

            if (radioWin && radioWin.checked) {
                isWin = true;
                appliedOdds = parseFloat(oddsInput.value);
                
                if (isNaN(appliedOdds) || appliedOdds < 1.0) {
                    allValid = false; // エラーフラグを立てる
                    // メッセージはループの外で表示されるため、ここでは return
                    return; 
                }
                // レート計算: 賭けたレート * オッズ (払い戻し)
                rateChange = originalWagers[originalWagerIndex].amount * appliedOdds;
                
            } else if (radioLose && radioLose.checked) {
                isWin = false;
                appliedOdds = 0; // 外れの場合はオッズなし
                rateChange = 0; // 既に投票時に減算済みのため、追加の増減なし
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
                    score: normalizeRate(currentScore + rateChange) 
                });
            }
            
            updatedWagersCount++;
        });

        // ★ 修正: allValid のチェックをここで行う
        if (!allValid) {
             showMessage(messageEl, `❌ 当選結果のオッズが不正です（1.0以上の数値を入力してください）。`, 'error');
             submitButton.disabled = false;
             return;
        }

        if (updatedWagersCount === 0) {
            showMessage(messageEl, '⚠️ 反映する結果が選択されていません。', 'info');
            submitButton.disabled = false;
            return;
        }

        // 削除: 履歴エントリーの生成と追加を完全に削除

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
            showMessage(messageEl, `✅ ${updatedWagersCount}件の結果を確定し、レートを反映しました。`, 'success');
            loadBettingData(); // リストを再ロードして更新されたフォームを表示
            loadPlayerList();
            loadTransferPlayerLists();
            loadMahjongForm();
        } else {
            showMessage(messageEl, `❌ レート反映エラー: ${response.message}`, 'error');
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


// --- 特殊レート調整機能 (履歴削除) ---
// ★ 修正: adjustment-form が存在しないページもあるため、nullチェック
if (document.getElementById('adjustment-form')) {
    document.getElementById('adjustment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageEl = document.getElementById('adjustment-message');
        const targetPlayerName = document.getElementById('target-player').value;
        const adjustAmount = Math.round(parseFloat(document.getElementById('adjust-amount').value));
    
        if (!targetPlayerName || !Number.isFinite(adjustAmount) || adjustAmount === 0) {
            showMessage(messageEl, 'エラー: 対象プレイヤーと有効な調整レートを入力してください。', 'error');
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
                score: normalizeRate(newScore) 
            });
            
            // 削除: 履歴エントリーの生成と追加を削除
    
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
                showMessage(messageEl, `✅ ${targetPlayerName} のレートを ${adjustAmount > 0 ? '+' : ''}${adjustAmount} 調整しました。`, 'success');
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

// --- 日次レート補正設定 ---
// 毎日1回、全員のレートを基準へ近づける。上がりすぎた人は下げ、
// 下がりすぎた人は上げるので、遊ばなければ約30日で全員が基準に揃う。
async function loadRateReversionSettings() {
    if (!RATE_REVERSION_RATE_INPUT || !RATE_REVERSION_STATUS) return;

    try {
        const data = await fetchAllData();
        const ratePercent = (data.rate_reversion_rate * 100).toFixed(1).replace(/\.0$/, '');
        if (RATE_REVERSION_BASELINE_INPUT) RATE_REVERSION_BASELINE_INPUT.value = data.rate_baseline;
        RATE_REVERSION_RATE_INPUT.value = ratePercent;
        if (RATE_REVERSION_FLAT_INPUT) RATE_REVERSION_FLAT_INPUT.value = data.rate_reversion_flat;

        const lastDate = data.rate_reversion_last_date || '未実行';
        const lastTotal = formatRate(data.rate_reversion_last_total);
        const days = estimateDaysToBaseline(data.rate_baseline, data.rate_reversion_rate, data.rate_reversion_flat);
        RATE_REVERSION_STATUS.textContent =
            `毎日0時5分に自動実行します。基準との差が最大 (${formatRate(data.rate_baseline)}) でも約${days}日で基準ちょうどに戻ります。`
            + ` 最終実行日: ${lastDate} / 前回の移動量合計: ${lastTotal}`;
    } catch (error) {
        console.error(error);
        RATE_REVERSION_STATUS.textContent = '日次レート補正の設定を読み込めませんでした。';
    }
}

/** 基準から最大に離れた状態 (レート0) から基準に戻るまでの日数の目安 */
function estimateDaysToBaseline(baseline, rate, flat) {
    let current = 0;
    for (let day = 1; day <= 400; day++) {
        const delta = getRateReversionDelta(current, baseline, rate, flat);
        if (delta === 0) return day - 1;
        current += delta;
        if (current === baseline) return day;
    }
    return 400;
}

if (RATE_REVERSION_FORM) {
    RATE_REVERSION_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = RATE_REVERSION_FORM.querySelector('button[type="submit"]');
        const baseline = parseFloat(RATE_REVERSION_BASELINE_INPUT?.value);
        const ratePercent = parseFloat(RATE_REVERSION_RATE_INPUT.value);
        const flat = parseFloat(RATE_REVERSION_FLAT_INPUT?.value);

        if (!Number.isFinite(baseline) || baseline < 0) {
            showMessage(RATE_REVERSION_MESSAGE, '基準レートは0以上で入力してください。', 'error');
            return;
        }
        if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
            showMessage(RATE_REVERSION_MESSAGE, '1日に戻す割合は0〜100%で入力してください。', 'error');
            return;
        }
        if (!Number.isFinite(flat) || flat < 0) {
            showMessage(RATE_REVERSION_MESSAGE, '固定加算は0以上で入力してください。', 'error');
            return;
        }

        submitButton.disabled = true;
        showMessage(RATE_REVERSION_MESSAGE, '設定を保存中...', 'info');

        try {
            const saved = await saveRateReversionSettings({
                baseline,
                rate: ratePercent / 100,
                flat
            });
            const days = estimateDaysToBaseline(saved.rate_baseline, saved.rate_reversion_rate, saved.rate_reversion_flat);
            showMessage(
                RATE_REVERSION_MESSAGE,
                `✅ 保存しました (基準 ${formatRate(saved.rate_baseline)} / ${(saved.rate_reversion_rate * 100).toFixed(1).replace(/\.0$/, '')}% + ${saved.rate_reversion_flat})。最大でも約${days}日で基準に戻ります。`,
                'success'
            );
            await loadRateReversionSettings();
        } catch (error) {
            console.error(error);
            showMessage(RATE_REVERSION_MESSAGE, `❌ 保存エラー: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
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
            showMessage(messageEl, '❌ エラー: コード名、レート、全利用合計回数をすべて正しく入力してください。', 'error');
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
                points: Math.round(points), // レートは整数で扱う
                maxUses: maxUses,
                currentUses: 0,
                // usedBy: [], <- ログは残さないため削除
                createdAt: new Date().toISOString()
            };

            allGiftCodes.push(newGiftCode);
            currentData.gift_codes = allGiftCodes;
            
            // 全データを更新
            // fetchAllData() の返却値を信じ、すべてのトップレベルフィールドを明示的に指定します。
            
            const response = await updateAllData({
                scores: currentData.scores,
                sports_bets: currentData.sports_bets || [],
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [],
                gift_codes: currentData.gift_codes || [],
            });

            if (response.status === 'success') {
                showMessage(messageEl, `✅ コード「${codeName}」を発行しました (レート ${newGiftCode.points}、合計${maxUses === 0 ? '無制限' : maxUses}回)。`, 'success');
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
    // ブラウザの toISOString() は UTC になるため、setTimezoneOffset() を使用して調整し、
    // YYYY-MM-DDTHH:MM 形式でローカルタイムとして値を設定する
    // JavaScriptの Dateオブジェクト操作は複雑なため、ここは簡易的なtoDateString() + toTimeString()で取得できる
    // 形式に合うよう、ISO文字列の先頭16文字を使用
    
    // date.toISOString().slice(0, 16) はUTCベースの文字列を生成するため、ユーザーのローカル時間に変換する
    
    const formatLocal = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    document.getElementById('lottery-purchase-deadline').value = formatLocal(purchaseDeadline);
    document.getElementById('lottery-result-announce').value = formatLocal(resultAnnounceDate);
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
        const ticketPrice = Math.round(parseFloat(document.getElementById('lottery-ticket-price').value));
        const purchaseDeadline = document.getElementById('lottery-purchase-deadline').value;
        const resultAnnounceDate = document.getElementById('lottery-result-announce').value;

        if (!lotteryName || !Number.isFinite(ticketPrice) || ticketPrice <= 0 || !purchaseDeadline || !resultAnnounceDate) {
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
            const amount = Math.round(parseFloat(document.getElementById(`lottery-prize-amount-${i}`).value));
            const probPercent = parseFloat(document.getElementById(`lottery-prize-prob-${i}`).value);

            if (Number.isFinite(amount) && amount > 0 && !isNaN(probPercent) && probPercent > 0) {
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

async function loadSpecialThemeStatus() {
    const el = document.getElementById('special-theme-current');
    if (!el) return;
    const currentData = await fetchAllData();
    const theme = currentData.special_theme;
    if (theme && theme.startDate) {
        el.innerHTML = `<p style="color:#27ae60;">✅ 現在の設定: <strong>${theme.label || '(ラベルなし)'}</strong>　${theme.startDate} 〜 ${theme.endDate}</p>`;
        document.getElementById('theme-label').value  = theme.label    || '';
        document.getElementById('theme-start').value  = theme.startDate;
        document.getElementById('theme-end').value    = theme.endDate;
    } else {
        el.innerHTML = '<p style="color:#888;">現在スペシャルテーマは設定されていません。</p>';
    }
}

async function saveSpecialTheme(themeData) {
    const messageEl = document.getElementById('special-theme-message');
    try {
        const currentData = await fetchAllData();
        const newData = {
            scores:               currentData.scores,
            sports_bets:          currentData.sports_bets          || [],
            speedstorm_records:   currentData.speedstorm_records    || [],
            lotteries:            currentData.lotteries             || [],
            gift_codes:           currentData.gift_codes            || [],
            career_posts:         currentData.career_posts          || [],
            special_theme:        themeData,
        };
        const res = await updateAllData(newData);
        if (res.status === 'success') {
            showMessage(messageEl, themeData ? `✅ テーマを設定しました。` : '✅ テーマを解除しました。', 'success');
            applySpecialTheme(themeData);
            await loadSpecialThemeStatus();
        } else {
            showMessage(messageEl, `❌ エラー: ${res.message}`, 'error');
        }
    } catch (err) {
        showMessage(messageEl, `❌ サーバーエラー: ${err.message}`, 'error');
    }
}

document.getElementById('special-theme-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = document.getElementById('theme-label').value.trim();
    const start = document.getElementById('theme-start').value;
    const end   = document.getElementById('theme-end').value;
    if (start > end) {
        showMessage(document.getElementById('special-theme-message'), '❌ 終了日は開始日以降にしてください。', 'error');
        return;
    }
    await saveSpecialTheme({ label, startDate: start, endDate: end });
});

document.getElementById('clear-theme-button').addEventListener('click', async () => {
    if (!window.confirm('スペシャルテーマを解除しますか？')) return;
    await saveSpecialTheme(null);
});

// ============================================================
// 出席登録の表示設定
// ============================================================

async function loadAttendanceAccessStatus() {
    if (!ATTENDANCE_ACCESS_LIST) return;

    ATTENDANCE_ACCESS_LIST.innerHTML = '<p>読み込み中...</p>';
    try {
        const currentData = await fetchAllData();
        const allowedUsers = Array.isArray(currentData.attendance_allowed_users)
            ? currentData.attendance_allowed_users
            : [];
        const players = currentData.scores || [];

        if (players.length === 0) {
            ATTENDANCE_ACCESS_LIST.innerHTML = '<p>プレイヤーが見つかりません。</p>';
            return;
        }

        ATTENDANCE_ACCESS_LIST.innerHTML = players.map(player => {
            const name = player.name;
            const checked = allowedUsers.includes(name) ? ' checked' : '';
            return `
                <label style="display:flex;align-items:center;gap:6px;margin:0;">
                    <input type="checkbox" class="attendance-access-checkbox" value="${escapeAdminText(name)}"${checked}>
                    <span>${escapeAdminText(name)}</span>
                </label>
            `;
        }).join('');
    } catch (error) {
        ATTENDANCE_ACCESS_LIST.innerHTML = `<p>読み込みに失敗しました: ${escapeAdminText(error.message)}</p>`;
    }
}

async function saveAttendanceAccessStatus() {
    if (!ATTENDANCE_ACCESS_LIST || !ATTENDANCE_ACCESS_MESSAGE) return;

    const allowedUsers = Array.from(ATTENDANCE_ACCESS_LIST.querySelectorAll('.attendance-access-checkbox:checked'))
        .map(input => input.value);

    if (ATTENDANCE_ACCESS_SAVE_BUTTON) ATTENDANCE_ACCESS_SAVE_BUTTON.disabled = true;
    showMessage(ATTENDANCE_ACCESS_MESSAGE, '出席表示設定を保存中...', 'info');

    try {
        const currentData = await fetchAllData();
        const response = await updateAllData({
            ...currentData,
            attendance_allowed_users: allowedUsers
        });

        if (response.status === 'success') {
            invalidateFetchCache();
            showMessage(ATTENDANCE_ACCESS_MESSAGE, `✅ ${allowedUsers.length}人に出席登録を表示します。`, 'success');
            await loadAttendanceAccessStatus();
        } else {
            showMessage(ATTENDANCE_ACCESS_MESSAGE, `❌ 保存エラー: ${response.message}`, 'error');
        }
    } catch (error) {
        showMessage(ATTENDANCE_ACCESS_MESSAGE, `❌ サーバーエラー: ${error.message}`, 'error');
    } finally {
        if (ATTENDANCE_ACCESS_SAVE_BUTTON) ATTENDANCE_ACCESS_SAVE_BUTTON.disabled = false;
    }
}

if (ATTENDANCE_ACCESS_SAVE_BUTTON) {
    ATTENDANCE_ACCESS_SAVE_BUTTON.addEventListener('click', saveAttendanceAccessStatus);
}


// -----------------------------------------------------------------
// ★★★ 会員ステータス (一般 / プロ / ラグジュアリー) の変更 ★★★
// -----------------------------------------------------------------

// ランキングの表示に使われる値。main.js の判定と一致させること
const MEMBER_STATUS_OPTIONS = [
    { value: 'none',    label: '一般' },
    { value: 'pro',     label: 'プロ ⭐' },
    { value: 'luxury',  label: 'ラグジュアリー 💎' }
];

async function loadMemberStatusList() {
    if (!MEMBER_STATUS_LIST) return;

    MEMBER_STATUS_LIST.innerHTML = '<p>読み込み中...</p>';
    try {
        const currentData = await fetchAllData();
        const players = currentData.scores || [];

        if (players.length === 0) {
            MEMBER_STATUS_LIST.innerHTML = '<p>プレイヤーが見つかりません。</p>';
            return;
        }

        MEMBER_STATUS_LIST.innerHTML = players.map(player => {
            const name = escapeAdminText(player.name);
            const current = player.status || 'none';
            const options = MEMBER_STATUS_OPTIONS.map(option => {
                const selected = option.value === current ? ' selected' : '';
                return `<option value="${option.value}"${selected}>${option.label}</option>`;
            }).join('');
            return `
                <label class="member-status-row">
                    <span class="member-status-name">${name}</span>
                    <select class="member-status-select" data-player="${name}">${options}</select>
                </label>
            `;
        }).join('');
    } catch (error) {
        MEMBER_STATUS_LIST.innerHTML = `<p>読み込みに失敗しました: ${escapeAdminText(error.message)}</p>`;
    }
}

async function saveMemberStatuses() {
    if (!MEMBER_STATUS_LIST || !MEMBER_STATUS_MESSAGE) return;

    const selected = new Map();
    MEMBER_STATUS_LIST.querySelectorAll('.member-status-select').forEach(select => {
        selected.set(select.dataset.player, select.value);
    });

    if (MEMBER_STATUS_SAVE_BUTTON) MEMBER_STATUS_SAVE_BUTTON.disabled = true;
    showMessage(MEMBER_STATUS_MESSAGE, 'ステータスを保存中...', 'info');

    try {
        const currentData = await fetchAllData();
        let changed = 0;

        // 取得しなおしたデータに対して差分だけ当てる。
        // 画面を開いている間に他の値が更新されていても巻き戻さないため
        const scores = (currentData.scores || []).map(player => {
            const next = selected.get(player.name);
            if (next === undefined || next === (player.status || 'none')) return player;
            changed += 1;
            return { ...player, status: next };
        });

        if (changed === 0) {
            showMessage(MEMBER_STATUS_MESSAGE, '変更はありませんでした。', 'info');
            return;
        }

        const response = await updateAllData({ ...currentData, scores });

        if (response.status === 'success') {
            invalidateFetchCache();
            showMessage(MEMBER_STATUS_MESSAGE, `✅ ${changed}人のステータスを更新しました。`, 'success');
            await loadMemberStatusList();
        } else {
            showMessage(MEMBER_STATUS_MESSAGE, `❌ 保存エラー: ${response.message}`, 'error');
        }
    } catch (error) {
        showMessage(MEMBER_STATUS_MESSAGE, `❌ サーバーエラー: ${error.message}`, 'error');
    } finally {
        if (MEMBER_STATUS_SAVE_BUTTON) MEMBER_STATUS_SAVE_BUTTON.disabled = false;
    }
}

if (MEMBER_STATUS_SAVE_BUTTON) {
    MEMBER_STATUS_SAVE_BUTTON.addEventListener('click', saveMemberStatuses);
}
