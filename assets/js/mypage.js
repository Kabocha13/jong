// assets/js/mypage.js

const AUTH_FORM = document.getElementById('auth-form');
const MYPAGE_CONTENT = document.getElementById('mypage-content');
const AUTH_MESSAGE = document.getElementById('auth-message');
const WAGER_FORM = document.getElementById('wager-form');
const TARGET_BET_SELECT = document.getElementById('target-bet');
const WAGER_PLAYER_INPUT = document.getElementById('wager-player');
const AUTHENTICATED_USER_NAME = document.getElementById('authenticated-user-name');
const CURRENT_SCORE_ELEMENT = document.getElementById('current-score');
const FIXED_PLAYER_NAME = document.getElementById('fixed-player-name');
const WAGER_HISTORY_LIST = document.getElementById('wager-history-list');

// ★ 新規追加要素
const WAGER_INPUTS_CONTAINER = document.getElementById('wager-inputs-container');
const ADD_WAGER_ROW_BUTTON = document.getElementById('add-wager-row-button');

// ★ ログアウトボタン
const LOGOUT_BUTTON = document.getElementById('logout-button');

// ★★★ 会員ボーナス関連の要素
const PRO_BONUS_TOOL = document.getElementById('pro-bonus-tool');
const PRO_BONUS_BUTTON = document.getElementById('pro-bonus-button');
const PRO_BONUS_MESSAGE = document.getElementById('pro-bonus-message');
const PRO_BONUS_INSTRUCTION = document.getElementById('pro-bonus-instruction');
const PRO_BONUS_PROBABILITY = document.getElementById('pro-bonus-probability');

const TRANSFER_FORM_MYPAGE = document.getElementById('transfer-form-mypage');
const RECEIVER_PLAYER_SELECT_MYPAGE = document.getElementById('receiver-player-mypage');
const AUTHENTICATED_USER_TRANSFER = document.getElementById('authenticated-user-transfer');

const LOTTERY_PURCHASE_FORM = document.getElementById('lottery-purchase-form');
const LOTTERY_SELECT = document.getElementById('lottery-select');
const LOTTERY_TICKET_COUNT = document.getElementById('lottery-ticket-count');
const LOTTERY_PURCHASE_MESSAGE = document.getElementById('lottery-purchase-message');
const LOTTERY_TOTAL_PRICE_DISPLAY = document.getElementById('lottery-total-price');
const LOTTERY_RESULTS_CONTAINER = document.getElementById('lottery-results-container');


const APPLY_GIFT_CODE_FORM = document.getElementById('apply-gift-code-form');
const GIFT_CODE_INPUT = document.getElementById('gift-code-input');
const APPLY_GIFT_CODE_MESSAGE = document.getElementById('apply-gift-code-message');
const TARGET_CONTINUE_TOOL = document.getElementById('target-continue-tool');
const MANABA_SYNC_BUTTON = document.getElementById('manaba-sync-button');
const MANABA_ASSIGNMENT_LIST = document.getElementById('manaba-assignment-list');
const MANABA_IMPORT_MESSAGE = document.getElementById('manaba-import-message');
const MANABA_SYNC_INTERVAL_MS = 60 * 60 * 1000;

document.querySelectorAll('.mypage-quick-nav a[href^="#"]').forEach(link => {
    link.addEventListener('click', () => {
        const target = document.querySelector(link.getAttribute('href'));
        if (target && target.tagName === 'DETAILS') {
            target.open = true;
        }
    });
});

// -----------------------------------------------------------------
// アコーディオン開閉状態の記憶 (次回アクセス時に同じ状態で開く)
// -----------------------------------------------------------------

const ACCORDION_STATE_KEY = 'mypageAccordionState';

function readAccordionState() {
    try {
        return JSON.parse(localStorage.getItem(ACCORDION_STATE_KEY)) || {};
    } catch (e) {
        return {};
    }
}

(function restoreAccordionState() {
    const saved = readAccordionState();
    document.querySelectorAll('details.mypage-accordion[id]').forEach(details => {
        if (typeof saved[details.id] === 'boolean') {
            details.open = saved[details.id];
        }
        details.addEventListener('toggle', () => {
            const state = readAccordionState();
            state[details.id] = details.open;
            localStorage.setItem(ACCORDION_STATE_KEY, JSON.stringify(state));
        });
    });
}());


// 認証されたユーザー情報 ({name: '...', score: ..., status: ..., lastBonusTime: ...})
let authenticatedUser = null; 
// 宝くじのデータを一時的に保持 (価格計算用)
let availableLotteries = [];
let latestAllData = null;

function finishAuthPending() {
    document.documentElement.classList.remove('auth-pending');
}

window.updateMyPageAuthenticatedUser = (user) => {
    if (!user) return;
    authenticatedUser = { ...authenticatedUser, ...user };
    if (CURRENT_SCORE_ELEMENT && Number.isFinite(Number(authenticatedUser.score))) {
        CURRENT_SCORE_ELEMENT.textContent = formatRate(authenticatedUser.score);
    }
};

// -----------------------------------------------------------------
// ★★★ 認証とログイン状態の管理 ★★★
// -----------------------------------------------------------------

/**
 * ログイン処理本体
 */
async function attemptLogin(username, password, isAuto = false) {
    if (!isAuto) {
        showMessage(AUTH_MESSAGE, '認証中...', 'info');
    }
    
    try {
        await qjongSignIn(username, password);
        await runDailyRateReversionIfNeeded().catch(error => {
            console.warn('日次レート補正に失敗しました。ログイン処理は継続します。', error);
        });
    } catch (error) {
        showMessage(AUTH_MESSAGE, `❌ Firebase認証エラー: ${error.message}`, 'error');
        finishAuthPending();
        return false;
    }

    const allData = await fetchAllData();
    latestAllData = allData;
    const scores = allData.scores;
    const user = scores.find(p => p.name === username);

    if (user) {
        authenticatedUser = user; 
        
        if (!authenticatedUser.status) {
            authenticatedUser.status = 'none';
        }
        
        // 1. 認証情報をlocalStorageに保存 (自動ログイン用)
        localStorage.setItem('authUsername', username);
        localStorage.setItem('authPassword', password);
        if (window.refreshMasterNavLinks) window.refreshMasterNavLinks();

        // 2. UIの切り替え
        document.getElementById('auth-section').classList.add('hidden');
        MYPAGE_CONTENT.classList.remove('hidden');
        finishAuthPending();
        
        if (!isAuto) {
             showMessage(AUTH_MESSAGE, `✅ ログイン成功! ようこそ、${username}様。`, 'success');
        } else {
             AUTH_MESSAGE.classList.add('hidden');
        }
        
        // 3. マイページコンテンツの初期化
        initializeMyPageContent(); 
        return true;
    } else {
        if (isAuto) {
            localStorage.removeItem('authUsername');
            localStorage.removeItem('authPassword');
        } else {
            showMessage(AUTH_MESSAGE, '❌ ユーザーデータが見つかりません。', 'error');
        }
        finishAuthPending();
        return false;
    }
}


/**
 * ページロード時の自動ログイン処理
 */
async function autoLogin() {
    const username = localStorage.getItem('authUsername');
    const password = localStorage.getItem('authPassword');

    if (username && password) {
        const success = await attemptLogin(username, password, true);
        if (!success) finishAuthPending();
    } else {
        finishAuthPending();
    }
}

/**
 * ログアウト処理
 */
function handleLogout() {
    if (!window.confirm('ログアウトしますか？次回アクセス時に再度ログインが必要です。')) {
        return;
    }
    
    localStorage.removeItem('authUsername');
    localStorage.removeItem('authPassword');
    if (window.refreshMasterNavLinks) window.refreshMasterNavLinks();
    qjongSignOut();

    authenticatedUser = null;
    finishAuthPending();
    document.getElementById('auth-section').classList.remove('hidden');
    MYPAGE_CONTENT.classList.add('hidden');
    
    AUTH_FORM.reset();
    
    showMessage(AUTH_MESSAGE, '👋 ログアウトしました。', 'info');
}

// --- イベントリスナー ---

AUTH_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const submitButton = document.getElementById('auth-submit-button');
    const originalLabel = submitButton ? submitButton.textContent : '';

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.setAttribute('aria-busy', 'true');
        submitButton.textContent = '認証中…';
    }
    try {
        await attemptLogin(username, password, false);
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.removeAttribute('aria-busy');
            submitButton.textContent = originalLabel;
        }
    }
});

LOGOUT_BUTTON.addEventListener('click', handleLogout);

// -----------------------------------------------------------------
// ★★★ 初期化とボーナス/送金処理 ★★★
// -----------------------------------------------------------------


async function initializeMyPageContent() {
    if (!authenticatedUser) return;

    AUTHENTICATED_USER_NAME.textContent = authenticatedUser.name;
    CURRENT_SCORE_ELEMENT.textContent = formatRate(authenticatedUser.score);
    FIXED_PLAYER_NAME.textContent = authenticatedUser.name;
    WAGER_PLAYER_INPUT.value = authenticatedUser.name; 
    AUTHENTICATED_USER_TRANSFER.textContent = authenticatedUser.name; 
    
    await loadBettingDataAndHistory();
    
    initializeWagerInputs();

    initializeMemberBonusFeature(); 

    loadTransferReceiverList(); 
    
    await loadLotteryData();
    initializeLotteryPurchaseForm();

    initializeGiftCodeFeature();

    initializeLoanFeature();

    await initManabaAssignments();

    controlTargetContinueFormDisplay();

}


// -----------------------------------------------------------------
// ★★★ レートの貸し出し (借金) ★★★
//   借りる・返す・信用枠の計算はすべて Cloud Function (loan) が行う (functions/loan.js)。
//   ここでは返ってきた状態を表示し、額の入力を送るだけ。
// -----------------------------------------------------------------

const CURRENT_DEBT_ELEMENT = document.getElementById('current-debt');
const LOAN_DEBT = document.getElementById('loan-debt');
const LOAN_DEBT_NOTE = document.getElementById('loan-debt-note');
const LOAN_LIMIT = document.getElementById('loan-limit');
const LOAN_AVAILABLE_NOTE = document.getElementById('loan-available-note');
const LOAN_BREAKDOWN_TABLE = document.getElementById('loan-breakdown-table');
const LOAN_INTEREST_RATE_TEXT = document.getElementById('loan-interest-rate-text');
const LOAN_INTEREST_MULTIPLIER_TEXT = document.getElementById('loan-interest-multiplier-text');
const LOAN_BORROW_FORM = document.getElementById('loan-borrow-form');
const LOAN_BORROW_AMOUNT = document.getElementById('loan-borrow-amount');
const LOAN_BORROW_PREVIEW = document.getElementById('loan-borrow-preview');
const LOAN_BORROW_BUTTON = document.getElementById('loan-borrow-button');
const LOAN_REPAY_FORM = document.getElementById('loan-repay-form');
const LOAN_REPAY_AMOUNT = document.getElementById('loan-repay-amount');
const LOAN_REPAY_BUTTON = document.getElementById('loan-repay-button');
const LOAN_REPAY_ALL_BUTTON = document.getElementById('loan-repay-all-button');
const LOAN_RECENT_LIST = document.getElementById('loan-recent-list');
const LOAN_MESSAGE = document.getElementById('loan-message');

let loanState = null;       // サーバーから最後に受け取った状態
let loanFormsBound = false;

/** 見出しの「現在のレート」の横に借金を出す (0 なら消す) */
function updateCurrentDebtBadge(debt) {
    if (!CURRENT_DEBT_ELEMENT) return;
    const label = formatDebtLabel(debt);
    CURRENT_DEBT_ELEMENT.textContent = label;
    CURRENT_DEBT_ELEMENT.hidden = !label;
}

/** いまの利率などの設定。サーバーの返事が無ければ読み込み済みの一覧の設定、それも無ければ既定値 */
function currentLoanSettings() {
    return loanState?.settings || latestAllData?.loan_settings || normalizeLoanSettings({});
}

function initializeLoanFeature() {
    if (!authenticatedUser || !LOAN_BORROW_FORM) return;
    bindLoanFormsOnce();
    // まず読み込み済みの一覧から借金と利率だけ出し、詳しい状態はサーバーから取り直す
    const cached = buildDebtMap(latestAllData?.loans).get(authenticatedUser.name) || 0;
    updateCurrentDebtBadge(cached);
    renderLoanSettingsText(currentLoanSettings());
    loadLoanStatus();
}

function bindLoanFormsOnce() {
    if (loanFormsBound) return;
    loanFormsBound = true;

    LOAN_BORROW_AMOUNT?.addEventListener('input', updateLoanBorrowPreview);
    LOAN_BORROW_FORM.querySelectorAll('[data-loan-amount]').forEach(button => {
        button.addEventListener('click', () => {
            if (!LOAN_BORROW_AMOUNT) return;
            const available = loanState ? loanState.available : 0;
            const raw = button.dataset.loanAmount;
            const amount = raw === 'max' ? available : Math.min(Number(raw), available);
            LOAN_BORROW_AMOUNT.value = amount > 0 ? String(amount) : '';
            updateLoanBorrowPreview();
            LOAN_BORROW_AMOUNT.focus();
        });
    });
    LOAN_BORROW_FORM.addEventListener('submit', handleLoanBorrow);

    LOAN_REPAY_ALL_BUTTON?.addEventListener('click', () => {
        if (!LOAN_REPAY_AMOUNT || !loanState) return;
        LOAN_REPAY_AMOUNT.value = String(maxLoanRepayable());
        LOAN_REPAY_AMOUNT.focus();
    });
    LOAN_REPAY_FORM?.addEventListener('submit', handleLoanRepay);
}

/** いま返せる額 = 借金と手持ちのレートの小さい方 (レートがマイナスなら 0) */
function maxLoanRepayable() {
    if (!loanState) return 0;
    return Math.max(0, Math.min(loanState.loan.debt, normalizeRate(loanState.score)));
}

/** 説明文の利率 (「5割」「×1.5」) を設定に合わせる */
function renderLoanSettingsText(settings) {
    if (LOAN_INTEREST_RATE_TEXT) LOAN_INTEREST_RATE_TEXT.textContent = formatLoanInterestRate(settings.interestRate);
    if (LOAN_INTEREST_MULTIPLIER_TEXT) {
        LOAN_INTEREST_MULTIPLIER_TEXT.textContent = String(Math.round((1 + settings.interestRate) * 100) / 100);
    }
}

/** 借りたあと、明日 0:05 の利息が付いた時点の借金の見込み */
function updateLoanBorrowPreview() {
    if (!LOAN_BORROW_PREVIEW) return;
    const amount = Math.round(parseFloat(LOAN_BORROW_AMOUNT?.value));
    if (!Number.isFinite(amount) || amount < 1) {
        LOAN_BORROW_PREVIEW.textContent = '—';
        return;
    }
    const currentDebt = loanState ? normalizeRate(loanState.loan.debt) : 0;
    LOAN_BORROW_PREVIEW.textContent = formatRate(loanDebtAfterDays(currentDebt + amount, currentLoanSettings().interestRate, 1));
}

/** 「9/30 00:05」。利息が付くのは日本時間の 0:05 なので、端末のタイムゾーンによらず JST で出す */
function formatLoanDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 「あと 8時間12分」。過ぎていれば空文字 */
function formatRemaining(iso) {
    const remainingMs = Date.parse(iso) - Date.now();
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '';
    const totalMinutes = Math.ceil(remainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `あと ${hours}時間${minutes}分` : `あと ${minutes}分`;
}

async function loadLoanStatus() {
    if (!authenticatedUser) return;
    try {
        const data = await callLoanFunction('status');
        renderLoanStatus(data);
    } catch (error) {
        console.error('貸し出し状態の取得に失敗:', error);
        if (LOAN_RECENT_LIST) LOAN_RECENT_LIST.innerHTML = '<li>貸し出しの状態を読み込めませんでした。</li>';
        if (LOAN_BREAKDOWN_TABLE) LOAN_BREAKDOWN_TABLE.innerHTML = '<tbody><tr><td>読み込めませんでした。</td></tr></tbody>';
        showMessage(LOAN_MESSAGE, `❌ 貸し出しの状態を読み込めませんでした: ${error.message}`, 'error');
    }
}

function renderLoanStatus(data) {
    loanState = data;
    const loan = data.loan || { debt: 0, principal: 0, recent: [] };
    const settings = currentLoanSettings();
    const debt = normalizeRate(loan.debt);
    const available = Math.max(0, normalizeRate(data.available));

    // 手元のレートも最新に揃える (借入・返済で動いているため)
    if (Number.isFinite(Number(data.score))) {
        authenticatedUser.score = normalizeRate(data.score);
        CURRENT_SCORE_ELEMENT.textContent = formatRate(authenticatedUser.score);
    }
    updateCurrentDebtBadge(debt);
    renderLoanSettingsText(settings);

    if (LOAN_DEBT) {
        LOAN_DEBT.textContent = debt > 0 ? formatRate(debt) : 'なし';
        LOAN_DEBT.classList.toggle('is-debt', debt > 0);
    }
    if (LOAN_DEBT_NOTE) {
        if (debt > 0) {
            const interest = Math.max(0, debt - normalizeRate(loan.principal));
            const remaining = formatRemaining(data.nextInterestAt);
            LOAN_DEBT_NOTE.textContent = `元本 ${formatRate(loan.principal)} + 利息 ${formatRate(interest)}`
                + ` / ${formatLoanDateTime(data.nextInterestAt)}${remaining ? ` (${remaining})` : ''} に ${formatRate(loanDebtAfterDays(debt, settings.interestRate, 1))} へ`;
        } else {
            LOAN_DEBT_NOTE.textContent = '';
        }
    }
    if (LOAN_LIMIT) LOAN_LIMIT.textContent = formatRate(data.limit);
    if (LOAN_AVAILABLE_NOTE) {
        LOAN_AVAILABLE_NOTE.textContent = available > 0
            ? `いま借りられる額: ${formatRate(available)}`
            : (debt > 0 ? '枠を使い切っています (返済すると空きます)' : '枠がありません');
    }

    renderLoanBreakdown(data.breakdown || {});
    renderLoanRecent(loan.recent || []);

    // 借りるフォーム
    if (LOAN_BORROW_AMOUNT) {
        LOAN_BORROW_AMOUNT.max = String(Math.max(1, available));
        LOAN_BORROW_AMOUNT.disabled = available < 1;
        if (Number(LOAN_BORROW_AMOUNT.value) > available) LOAN_BORROW_AMOUNT.value = available > 0 ? String(available) : '';
    }
    if (LOAN_BORROW_BUTTON) LOAN_BORROW_BUTTON.disabled = available < 1;
    LOAN_BORROW_FORM.querySelectorAll('[data-loan-amount]').forEach(button => {
        const raw = button.dataset.loanAmount;
        button.disabled = available < 1 || (raw !== 'max' && Number(raw) > available);
    });
    updateLoanBorrowPreview();

    // 返すフォーム (借金があるときだけ出す)
    const repayable = maxLoanRepayable();
    if (LOAN_REPAY_FORM) LOAN_REPAY_FORM.classList.toggle('hidden', debt <= 0);
    if (LOAN_REPAY_AMOUNT) {
        LOAN_REPAY_AMOUNT.max = String(Math.max(1, repayable));
        LOAN_REPAY_AMOUNT.disabled = repayable < 1;
        if (!LOAN_REPAY_AMOUNT.value || Number(LOAN_REPAY_AMOUNT.value) > repayable) {
            LOAN_REPAY_AMOUNT.value = repayable > 0 ? String(repayable) : '';
        }
    }
    if (LOAN_REPAY_BUTTON) LOAN_REPAY_BUTTON.disabled = repayable < 1;
    if (LOAN_REPAY_ALL_BUTTON) LOAN_REPAY_ALL_BUTTON.disabled = repayable < 1;
}

function renderLoanBreakdown(breakdown) {
    if (!LOAN_BREAKDOWN_TABLE) return;
    const trust = normalizeRate(breakdown.trust);
    const interestWeight = toFiniteNumber(breakdown.interestWeight, 0.5);
    const trustDivisor = toFiniteNumber(breakdown.trustDivisor, 2);
    const stabilityPercent = Math.round(toFiniteNumber(breakdown.stability, 1) * 100);
    const stabilityMinPercent = Math.round(toFiniteNumber(breakdown.stabilityMin, 0.25) * 100);
    const debt = loanState ? normalizeRate(loanState.loan?.debt) : 0;
    const rows = [
        ['基本枠', formatRate(breakdown.base), '実績が無くても借りられる額'],
        ['返した元本', `+${formatRate(breakdown.repaidCarriedPrincipal)}`, '日付をまたいでから返した元本 (利息は含まない)。当日中に借りて返した分は数えない'],
        ['付いた利息', `−${formatRate(normalizeRate(toFiniteNumber(breakdown.interestTotal, 0) * interestWeight))}`, `これまでに付いた利息 ${formatRate(breakdown.interestTotal)} × ${interestWeight}。返すのが遅いほど枠が減る`],
        ['実績枠', formatRate(breakdown.historyLimit), `基本枠 ${trust >= 0 ? '+' : '−'} ${formatRate(Math.abs(trust))} ÷ ${trustDivisor}`],
        ['変動の大きさ', formatRate(breakdown.volatility), `直近${breakdown.volatilityDays || 14}日の1日の増減の標準偏差 (日次補正・参加ボーナス・借金の出入りは除く)`],
        ['安定度', `× ${stabilityPercent}%`, `変動が大きいほど下がる (${formatRate(breakdown.volatilityScale || 500)} で 2/3、その2倍で半分、下限 ${stabilityMinPercent}%)`],
        ['信用枠', formatRate(loanState ? loanState.limit : 0), `実績枠 × 安定度 (${formatRate(breakdown.min)}〜${formatRate(breakdown.max)})`],
        ['借入可能', formatRate(loanState ? loanState.available : 0), `信用枠 − いまの借金 ${formatRate(debt)}`]
    ];
    LOAN_BREAKDOWN_TABLE.innerHTML = `<tbody>${rows.map(([label, value, note]) => `
        <tr>
            <th scope="row">${manabaEscapeHtml(label)}</th>
            <td class="loan-breakdown-value">${manabaEscapeHtml(value)}</td>
            <td class="loan-breakdown-note">${manabaEscapeHtml(note)}</td>
        </tr>`).join('')}</tbody>`;
}

function describeLoanRecent(entry) {
    const amount = formatRate(entry.amount);
    const debtAfter = normalizeRate(entry.debtAfter);
    if (entry.type === 'borrow') return `借入 ${amount} (借金 ${formatRate(debtAfter)})`;
    if (entry.type === 'repay') return `返済 ${amount}${debtAfter > 0 ? ` (残り ${formatRate(debtAfter)})` : ' (完済)'}`;
    if (entry.type === 'interest') return `利息 +${amount} (借金 ${formatRate(debtAfter)})`;
    return amount;
}

function renderLoanRecent(recent) {
    if (!LOAN_RECENT_LIST) return;
    if (!recent.length) {
        LOAN_RECENT_LIST.innerHTML = '<li>まだ借りたことはありません。</li>';
        return;
    }
    LOAN_RECENT_LIST.innerHTML = recent.map(entry => `
        <li class="loan-recent-${manabaEscapeHtml(entry.type || '')}">
            <span class="loan-recent-time">${manabaEscapeHtml(formatLoanDateTime(entry.at))}</span>
            <span>${manabaEscapeHtml(describeLoanRecent(entry))}</span>
        </li>`).join('');
}

async function afterLoanChange(data) {
    invalidateFetchCache();
    renderLoanStatus(data);
    try {
        latestAllData = await fetchAllData();
    } catch (error) {
        console.warn('一覧の再取得に失敗しました:', error);
    }
}

async function handleLoanBorrow(e) {
    e.preventDefault();
    if (!authenticatedUser) {
        showMessage(LOAN_MESSAGE, '❌ 認証エラーが発生しました。', 'error');
        return;
    }
    const amount = Math.round(parseFloat(LOAN_BORROW_AMOUNT.value));
    if (!Number.isFinite(amount) || amount < 1) {
        showMessage(LOAN_MESSAGE, '❌ 借りる額は1以上の整数で入力してください。', 'error');
        return;
    }
    const settings = currentLoanSettings();
    const currentDebt = loanState ? normalizeRate(loanState.loan.debt) : 0;
    const tomorrow = loanDebtAfterDays(currentDebt + amount, settings.interestRate, 1);
    if (!window.confirm(`レート ${formatRate(amount)} を借ります。借金は ${formatRate(currentDebt + amount)} になり、今日中に返さなければ明日 0:05 に ${formatRate(tomorrow)} (×${Math.round((1 + settings.interestRate) * 100) / 100}) へ増えます。よろしいですか？`)) {
        return;
    }

    LOAN_BORROW_BUTTON.disabled = true;
    LOAN_BORROW_BUTTON.setAttribute('aria-busy', 'true');
    showMessage(LOAN_MESSAGE, '借入を処理中...', 'info');
    try {
        const data = await callLoanFunction('borrow', { amount });
        LOAN_BORROW_AMOUNT.value = '';
        await afterLoanChange(data);
        showMessage(LOAN_MESSAGE, `✅ レート ${formatRate(data.amount)} を借りました。借金は ${formatRate(data.loan?.debt)} です。${formatLoanDateTime(data.nextInterestAt)} までに返さなければ利息が付きます。`, 'success');
    } catch (error) {
        console.error('借入中にエラー:', error);
        showMessage(LOAN_MESSAGE, `❌ ${error.message}`, 'error');
        await loadLoanStatus();
    } finally {
        LOAN_BORROW_BUTTON.removeAttribute('aria-busy');
        if (loanState) LOAN_BORROW_BUTTON.disabled = normalizeRate(loanState.available) < 1;
    }
}

async function handleLoanRepay(e) {
    e.preventDefault();
    if (!authenticatedUser) {
        showMessage(LOAN_MESSAGE, '❌ 認証エラーが発生しました。', 'error');
        return;
    }
    const amount = Math.round(parseFloat(LOAN_REPAY_AMOUNT.value));
    if (!Number.isFinite(amount) || amount < 1) {
        showMessage(LOAN_MESSAGE, '❌ 返す額は1以上の整数で入力してください。', 'error');
        return;
    }

    LOAN_REPAY_BUTTON.disabled = true;
    LOAN_REPAY_BUTTON.setAttribute('aria-busy', 'true');
    showMessage(LOAN_MESSAGE, '返済を処理中...', 'info');
    try {
        const data = await callLoanFunction('repay', { amount });
        await afterLoanChange(data);
        const remaining = normalizeRate(data.loan?.debt);
        showMessage(LOAN_MESSAGE, remaining > 0
            ? `✅ レート ${formatRate(data.amount)} を返しました。残りの借金は ${formatRate(remaining)} です。`
            : `✅ レート ${formatRate(data.amount)} を返して完済しました。`, 'success');
    } catch (error) {
        console.error('返済中にエラー:', error);
        showMessage(LOAN_MESSAGE, `❌ ${error.message}`, 'error');
        await loadLoanStatus();
    } finally {
        LOAN_REPAY_BUTTON.removeAttribute('aria-busy');
        if (loanState) LOAN_REPAY_BUTTON.disabled = maxLoanRepayable() < 1;
    }
}

// --- 目標継続フォームの表示制御 ---
function controlTargetContinueFormDisplay() {
    if (!TARGET_CONTINUE_TOOL) return;

    const TARGET_DATE = new Date('2025-12-10T00:00:00+09:00'); 
    const now = new Date();

    if (now >= TARGET_DATE) {
        TARGET_CONTINUE_TOOL.classList.remove('hidden');
    } else {
        TARGET_CONTINUE_TOOL.classList.add('hidden');
    }
}


// -----------------------------------------------------------------
// ★★★ ログインボーナス ★★★
//   抽選と保存は common.js の claimRateBonus に置いてある。
//   ホームのデッキバーにあるボーナスボタンも同じ処理を呼ぶ。
// -----------------------------------------------------------------

function initializeMemberBonusFeature() {
    if (!authenticatedUser) return;
    if (PRO_BONUS_TOOL) PRO_BONUS_TOOL.classList.remove('hidden');
    updateMemberBonusDisplay();
}

function updateMemberBonusDisplay({ keepMessage = false } = {}) {
    if (!authenticatedUser) return;

    // 日付が変わっていれば減衰後の値で表示する (DBへの反映はボタン押下時)
    const state = getRateBonusState(authenticatedUser);

    if (PRO_BONUS_INSTRUCTION) {
        PRO_BONUS_INSTRUCTION.innerHTML =
            `${state.memberLabel}会員: ボタンを押すたびに <strong>+${state.bonusAmount}</strong>（1日何回でも押せます）`;
    }
    if (PRO_BONUS_PROBABILITY) {
        let probColor;
        if (state.total === 0) {
            probColor = '#888';
        } else if (state.total <= 30) {
            probColor = 'var(--color-gold)';
        } else if (state.total <= 60) {
            probColor = '#e67e22';
        } else {
            probColor = 'var(--color-error)';
        }
        PRO_BONUS_PROBABILITY.innerHTML =
            `ペナルティ確率: <strong style="color:${probColor}">${state.total.toFixed(0)}%</strong>`
            + `（日次: ${state.daily.toFixed(0)}% + 蓄積: ${state.accumulated.toFixed(0)}%）`;
    }
    if (PRO_BONUS_BUTTON) {
        PRO_BONUS_BUTTON.disabled = false;
        PRO_BONUS_BUTTON.textContent = `ボーナス (+${state.bonusAmount}) を受け取る`;
    }
    if (PRO_BONUS_MESSAGE && !keepMessage) {
        PRO_BONUS_MESSAGE.classList.add('hidden');
    }
}

if (PRO_BONUS_BUTTON) {
    PRO_BONUS_BUTTON.addEventListener('click', async () => {
        if (!authenticatedUser) {
            showMessage(PRO_BONUS_MESSAGE, '❌ 認証エラーが発生しました。', 'error');
            return;
        }

        PRO_BONUS_BUTTON.disabled = true;
        showMessage(PRO_BONUS_MESSAGE, 'レートを付与中...', 'info');

        try {
            const result = await claimRateBonus(authenticatedUser.name);

            if (result.status !== 'success') {
                showMessage(PRO_BONUS_MESSAGE, `❌ ${result.message}`, 'error');
                PRO_BONUS_BUTTON.disabled = false;
                return;
            }

            authenticatedUser.score = result.newRate;
            authenticatedUser.lastBonusDate = getJstDateKey();
            authenticatedUser.dailyProbability = result.daily;
            authenticatedUser.accumulatedProbability = result.accumulated;
            authenticatedUser.dailyPressCount = result.pressCount;
            authenticatedUser.lastBonusTime = new Date().toISOString();
            CURRENT_SCORE_ELEMENT.textContent = formatRate(result.newRate);
            latestAllData = await fetchAllData();

            updateMemberBonusDisplay({ keepMessage: true });
            showMessage(
                PRO_BONUS_MESSAGE,
                describeRateBonusResult(result),
                result.penaltyOccurred ? 'error' : 'success'
            );
            triggerRateBonusAnimation(
                PRO_BONUS_TOOL,
                result.penaltyOccurred ? 'penalty' : 'success',
                getRateBonusFloatText(result)
            );
        } catch (error) {
            console.error(error);
            showMessage(PRO_BONUS_MESSAGE, `❌ サーバーエラー: ${error.message}`, 'error');
            PRO_BONUS_BUTTON.disabled = false;
        }
    });
}


function initializeGiftCodeFeature() {
    if (!APPLY_GIFT_CODE_FORM) return;
    
    APPLY_GIFT_CODE_FORM.addEventListener('submit', handleApplyGiftCode);
    
    if (GIFT_CODE_INPUT) {
        GIFT_CODE_INPUT.value = '';
    }
    if (APPLY_GIFT_CODE_MESSAGE) {
        APPLY_GIFT_CODE_MESSAGE.classList.add('hidden');
    }
}

async function handleApplyGiftCode(e) {
    e.preventDefault();
    
    if (!authenticatedUser) {
        showMessage(APPLY_GIFT_CODE_MESSAGE, '❌ 認証エラーが発生しました。', 'error');
        return;
    }

    const messageEl = APPLY_GIFT_CODE_MESSAGE;
    const player = authenticatedUser.name;
    const submitButton = APPLY_GIFT_CODE_FORM.querySelector('button[type=\"submit\"]');
    const code = (GIFT_CODE_INPUT.value || '').trim().toUpperCase();

    if (!code) {
        showMessage(messageEl, '❌ コードを入力してください。', 'error');
        return;
    }

    submitButton.disabled = true;
    showMessage(messageEl, 'コードを検証中...', 'info');

    try {
        const currentData = await fetchAllData();
        
        let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
        let allGiftCodes = currentData.gift_codes || [];
        
        const codeIndex = allGiftCodes.findIndex(c => c.code === code);
        
        if (codeIndex === -1) {
            showMessage(messageEl, '❌ エラー: 無効なプレゼントコードです。', 'error');
            return;
        }

        const giftCode = allGiftCodes[codeIndex];
        
        if (giftCode.maxUses > 0 && giftCode.currentUses >= giftCode.maxUses) {
            showMessage(messageEl, '❌ エラー: このコードは最大利用合計回数に達しています。', 'error');
            return;
        }
        
        const pointsToApply = giftCode.points; 
        
        let targetPlayer = currentScoresMap.get(player);
        if (!targetPlayer) {
             showMessage(messageEl, '❌ ユーザーデータが見つかりません。', 'error');
             return;
        }

        const newScore = normalizeRate(targetPlayer.score + pointsToApply);
        
        currentScoresMap.set(player, { 
            ...targetPlayer, 
            score: newScore
        });
        
        giftCode.currentUses += 1;
        const isFullyUsed = giftCode.maxUses > 0 && giftCode.currentUses >= giftCode.maxUses;

        if (isFullyUsed) {
            allGiftCodes.splice(codeIndex, 1);
        } else {
            allGiftCodes[codeIndex] = giftCode;
        }

        currentData.scores = Array.from(currentScoresMap.values());
        currentData.gift_codes = allGiftCodes;
        
        const newData = {
            scores: currentData.scores,
            sports_bets: currentData.sports_bets,
            speedstorm_records: currentData.speedstorm_records,
            lotteries: currentData.lotteries,
            gift_codes: currentData.gift_codes
        };
        
        const response = await updateAllData(newData);
        
        if (response.status === 'success') {
            const actionText = pointsToApply >= 0 ? '獲得' : '消費';
            
            let successMessage = `✅ コード適用成功! レート ${formatRate(Math.abs(pointsToApply))} を${actionText}しました。`;
            if (isFullyUsed) {
                successMessage += ' (このコードは期限切れとなり削除されました)';
            }
            showMessage(messageEl, successMessage, 'success');
            
            authenticatedUser.score = newScore;
            CURRENT_SCORE_ELEMENT.textContent = formatRate(newScore);
            
            GIFT_CODE_INPUT.value = '';
        } else {
             showMessage(messageEl, `❌ 適用エラー: ${response.message}`, 'error');
        }

    } catch (error) {
        console.error("プレゼントコード適用中にエラー:", error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
    } finally {
        submitButton.disabled = false;
    }
}


async function loadTransferReceiverList() {
    if (!RECEIVER_PLAYER_SELECT_MYPAGE) return;
    if (!authenticatedUser) return;
    
    RECEIVER_PLAYER_SELECT_MYPAGE.innerHTML = '<option value=\"\" disabled selected>ロード中...</option>';
    
    const allData = await fetchAllData(); 
    const scores = allData.scores;

    if (scores.length === 0) {
        RECEIVER_PLAYER_SELECT_MYPAGE.innerHTML = '<option value=\"\" disabled selected>リストの取得に失敗</option>';
        return;
    }

    let options = '<option value=\"\" disabled selected>送金先プレイヤーを選択</option>';
    const senderName = authenticatedUser.name;

    scores.forEach(player => {
        if (player.name !== senderName) {
            options += `<option value=\"${player.name}\">${player.name}</option>`;
        }
    });

    RECEIVER_PLAYER_SELECT_MYPAGE.innerHTML = options;
}

if (TRANSFER_FORM_MYPAGE) {
    TRANSFER_FORM_MYPAGE.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!authenticatedUser) {
            showMessage(document.getElementById('transfer-message-mypage'), '❌ 認証エラーが発生しました。', 'error');
            return;
        }

        const messageEl = document.getElementById('transfer-message-mypage');
        const sender = authenticatedUser.name; 
        const receiver = RECEIVER_PLAYER_SELECT_MYPAGE.value;
        const amount = Math.round(parseFloat(document.getElementById('transfer-amount-mypage').value));
        const submitButton = TRANSFER_FORM_MYPAGE.querySelector('button[type=\"submit\"]');
    
        if (!receiver || !Number.isFinite(amount) || amount < 1) {
            showMessage(messageEl, 'エラー: 送金先と有効なレート (1以上の整数) を入力してください。', 'error');
            return;
        }
    
        if (sender === receiver) {
            showMessage(messageEl, 'エラー: 送金元と送金先は異なるプレイヤーである必要があります。', 'error');
            return;
        }
    
        submitButton.disabled = true;
        showMessage(messageEl, 'レート送金を処理中...', 'info');
    
        try {
            const currentData = await fetchAllData();
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            
            const senderPlayer = currentScoresMap.get(sender);
            const receiverPlayer = currentScoresMap.get(receiver);
            
            if (!senderPlayer) {
                showMessage(messageEl, `エラー: 送金元 ${sender} のデータが見つかりません。`, 'error');
                return;
            }
            if (!receiverPlayer) {
                 showMessage(messageEl, `エラー: 送金先 ${receiver} のデータが見つかりません。`, 'error');
                 return;
            }
    
            const senderScore = senderPlayer.score || 0;
            
            if (senderScore < amount) {
                showMessage(messageEl, `エラー: 残りレート (${formatRate(senderScore)}) が不足しています。`, 'error');
                return;
            }
    
            const newSenderScore = normalizeRate(senderScore - amount);
            currentScoresMap.set(sender, { 
                ...senderPlayer, 
                score: newSenderScore
            });
            
            const receiverScore = receiverPlayer.score || 0;
            const newReceiverScore = normalizeRate(receiverScore + amount);
            currentScoresMap.set(receiver, { 
                ...receiverPlayer, 
                score: newReceiverScore
            });
            
            const newScores = Array.from(currentScoresMap.values());
            
            const newData = {
                scores: newScores,
                sports_bets: currentData.sports_bets, 
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [],
                gift_codes: currentData.gift_codes || []
            };
    
            const response = await updateAllData(newData);
    
            if (response.status === 'success') {
                showMessage(messageEl, `✅ ${receiver} へ レート ${formatRate(amount)} の送金を完了しました。`, 'success');
                
                authenticatedUser.score = newSenderScore; 
                CURRENT_SCORE_ELEMENT.textContent = formatRate(newSenderScore); 
                
                TRANSFER_FORM_MYPAGE.reset();
                loadTransferReceiverList(); 
            } else {
                showMessage(messageEl, `❌ 送金エラー: ${response.message}`, 'error');
            }
    
        } catch (error) {
            console.error("送金処理中にエラー:", error);
            showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
        }
    });
}


function initializeWagerInputs() {
    if (!WAGER_INPUTS_CONTAINER) return;

    WAGER_INPUTS_CONTAINER.innerHTML = '';
    addWagerRow(); 
}

function addWagerRow(item = '', amount = '') {
    if (!WAGER_INPUTS_CONTAINER) return;

    const rowCount = WAGER_INPUTS_CONTAINER.querySelectorAll('.wager-row').length + 1;
    const row = document.createElement('div');
    row.className = 'form-group wager-row';
    row.innerHTML = `
        <div style=\"display: flex; gap: 10px; align-items: flex-end; margin-bottom: 10px;\">
            <div style=\"flex-grow: 1;\">
                <label for=\"wager-item-${rowCount}\">内容 (かけるもの):</label>
                <input type=\"text\" class=\"wager-item-input\" id=\"wager-item-${rowCount}\" value=\"${item}\" placeholder=\"例: A選手優勝 or 満貫和了\" required>
            </div>
            <div style=\"width: 120px;\">
                <label for=\"wager-amount-${rowCount}\">賭けるレート:</label>
                <input type=\"number\" class=\"wager-amount-input\" id=\"wager-amount-${rowCount}\" value=\"${amount}\" step=\"1\" min=\"1\" placeholder=\"例: 10\" required>
            </div>
            <button type=\"button\" class=\"remove-wager-row-button remove-button\" style=\"width: auto; margin-bottom: 0;\">×</button>
        </div>
    `;
    
    row.querySelector('.remove-wager-row-button').addEventListener('click', (e) => {
        if (WAGER_INPUTS_CONTAINER.querySelectorAll('.wager-row').length > 1) {
            e.target.closest('.wager-row').remove();
        } else {
             showMessage(document.getElementById('wager-message'), '⚠️ 少なくとも1つの賭け行が必要です。', 'info');
        }
    });

    WAGER_INPUTS_CONTAINER.appendChild(row);
}

if (ADD_WAGER_ROW_BUTTON) {
    ADD_WAGER_ROW_BUTTON.addEventListener('click', () => addWagerRow());
}


async function loadBettingDataAndHistory() {
    const allData = await fetchAllData();
    const allBets = allData.sports_bets || []; 
    
    updateWagerForm(allBets);
    renderWagerHistory(allBets);
}


function updateWagerForm(allBets) {
    if (!TARGET_BET_SELECT) return;

    TARGET_BET_SELECT.innerHTML = '<option value=\"\" disabled selected>開催中のくじを選択</option>';
    
    const openBets = allBets.filter(bet => bet.status === 'OPEN' && new Date(bet.deadline) > new Date());
    
    if (openBets.length === 0) {
        TARGET_BET_SELECT.innerHTML = '<option value=\"\" disabled selected>現在、開催中のくじはありません</option>';
        return;
    }

    let options = '<option value=\"\" disabled selected>開催中のくじを選択</option>';
    openBets.forEach(bet => {
        const deadline = new Date(bet.deadline);
        const formattedDeadline = deadline.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) + ' ' + 
                                  deadline.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                                  
        options += `<option value=\"${bet.betId}\">${bet.matchName} (#${bet.betId}) - 締切: ${formattedDeadline}</option>`;
    });

    TARGET_BET_SELECT.innerHTML = options;
}


function renderWagerHistory(allBets) {
    if (!WAGER_HISTORY_LIST) return;
    if (!authenticatedUser) return;

    const player = authenticatedUser.name;
    
    const allPlayerWagers = allBets.flatMap(bet => 
        bet.wagers
           .filter(w => w.player === player)
           .map(w => ({
                ...w, 
                betId: bet.betId, 
                matchName: bet.matchName,
                betStatus: bet.status 
            }))
    );
    
    if (allPlayerWagers.length === 0) {
        WAGER_HISTORY_LIST.innerHTML = '<li>まだ投票履歴はありません。</li>';
        return;
    }

    allPlayerWagers.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const latestWagers = allPlayerWagers.slice(0, 5);

    let html = '';
    latestWagers.forEach(w => {
        const timestamp = new Date(w.timestamp).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        
        let resultText = '';
        let resultClass = 'status-closed'; 
        
        if (w.betStatus === 'SETTLED') {
             if (w.isWin === true) {
                resultText = `✅ 当選 (x${w.appliedOdds.toFixed(1)}) / 獲得: ${formatRate(w.amount * w.appliedOdds)}`;
                resultClass = 'status-open'; 
            } else if (w.isWin === false) {
                resultText = '❌ 外れ (投票時に減算済み)';
                resultClass = 'status-settled'; 
            } else {
                 resultText = '結果未確定（くじ完了済みだが投票結果が不明）';
            }
        } else if (w.betStatus === 'CLOSED' || w.betStatus === 'OPEN') {
             resultText = '結果待ち...';
             resultClass = 'status-closed';
        }

        html += `
            <li style=\"border-bottom: 1px dotted #ccc; padding: 5px 0;\">
                <p style=\"margin: 0; font-size: 0.9em; color: #6c757d;\">${timestamp} - くじ #${w.betId}: ${w.matchName}</p>
                <p style=\"margin: 2px 0 0 0;\">
                    レート ${formatRate(w.amount)} を <strong>「${w.item}」</strong> に投票
                </p>
                <p style=\"margin: 2px 0 0 10px; font-weight: bold;\" class=\"${resultClass}\">${resultText}</p>
            </li>
        `;
    });

    WAGER_HISTORY_LIST.innerHTML = html;
}


if (WAGER_FORM) {
    WAGER_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!authenticatedUser) {
            showMessage(document.getElementById('wager-message'), '❌ 認証エラーが発生しました。', 'error');
            return;
        }

        const messageEl = document.getElementById('wager-message');
        const betId = parseInt(TARGET_BET_SELECT.value);
        const player = authenticatedUser.name; 
        
        const wagersToSubmit = [];
        let totalWagerAmount = 0;
        let allValid = true;
        let hasAtLeastOneValid = false;
        
        if (WAGER_INPUTS_CONTAINER) {
            WAGER_INPUTS_CONTAINER.querySelectorAll('.wager-row').forEach(row => {
                const itemInput = row.querySelector('.wager-item-input').value.trim();
                const amountInput = Math.round(parseFloat(row.querySelector('.wager-amount-input').value));
                
                if (itemInput && Number.isFinite(amountInput) && amountInput >= 1) {
                    wagersToSubmit.push({
                        item: itemInput,
                        amount: amountInput,
                        player: player,
                        timestamp: new Date().toISOString(),
                        isWin: null, 
                        appliedOdds: null 
                    });
                    totalWagerAmount += amountInput;
                    hasAtLeastOneValid = true;
                } else if (itemInput || Number.isFinite(amountInput)) {
                    allValid = false;
                }
            });
        }

        if (!betId || !allValid || !hasAtLeastOneValid) {
            showMessage(messageEl, '❌ 対象くじを選択し、少なくとも一つの有効な「かけるもの」と「賭けるレート (1以上)」を入力してください。', 'error');
            return;
        }

        const submitButton = WAGER_FORM.querySelector('button[type=\"submit\"]');
        submitButton.disabled = true;
        showMessage(messageEl, `投票 (レート ${formatRate(totalWagerAmount)}) を処理中...`, 'info');
        
        try {
            const currentData = await fetchAllData();
            const allBets = currentData.sports_bets || [];
            const betIndex = allBets.findIndex(b => b.betId === betId);
            
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            let targetPlayer = currentScoresMap.get(player);
            
            if (!targetPlayer || typeof targetPlayer.status === 'undefined') {
                 showMessage(messageEl, '❌ 認証ユーザーの会員ステータス情報が不足しています。', 'error');
                 return;
            }

            if (targetPlayer.score < totalWagerAmount) {
                showMessage(messageEl, `❌ 残りレート (${formatRate(targetPlayer.score)}) が不足しているため、合計 ${formatRate(totalWagerAmount)} の投票はできません。`, 'error');
                return;
            }

            const currentBet = allBets[betIndex];

            if (betIndex === -1 || currentBet.status !== 'OPEN' || new Date(currentBet.deadline) <= new Date()) {
                showMessage(messageEl, '❌ 開催中のくじではありません（締切済みの可能性があります）。', 'error');
                return;
            }

            const newScore = normalizeRate(targetPlayer.score - totalWagerAmount);

            currentScoresMap.set(player, { 
                ...targetPlayer, 
                score: newScore
            });

            currentBet.wagers.push(...wagersToSubmit);
            
            currentData.sports_bets = allBets;
            currentData.scores = Array.from(currentScoresMap.values()); 

            const newData = {
                scores: currentData.scores,
                sports_bets: currentData.sports_bets,
                speedstorm_records: currentData.speedstorm_records || [],
                lotteries: currentData.lotteries || [], 
                gift_codes: currentData.gift_codes || [] 
            };

            const response = await updateAllData(newData);
            if (response.status === 'success') {
                showMessage(messageEl, `✅ ${player}様の レート ${formatRate(totalWagerAmount)} の投票 (${wagersToSubmit.length}件) を登録し、レートを減算しました。`, 'success');
                WAGER_FORM.reset();
                
                authenticatedUser.score = newScore; 
                CURRENT_SCORE_ELEMENT.textContent = formatRate(authenticatedUser.score); 
                
                loadBettingDataAndHistory(); 
                initializeWagerInputs(); 
                
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
}


// -----------------------------------------------------------------
// ★★★ 宝くじ購入・結果確認機能 ★★★
// -----------------------------------------------------------------

function initializeLotteryPurchaseForm() {
    if (!LOTTERY_SELECT || !LOTTERY_TICKET_COUNT || !LOTTERY_TOTAL_PRICE_DISPLAY) return;

    LOTTERY_TICKET_COUNT.removeAttribute('max');

    const DISCOUNT_RATE = authenticatedUser && authenticatedUser.status === 'luxury' ? 0.8 : 1.0; 
    
    const updatePrice = () => {
        const selectedLotteryId = parseInt(LOTTERY_SELECT.value);
        const count = parseInt(LOTTERY_TICKET_COUNT.value);
        
        let discountText = '';

        if (selectedLotteryId && count > 0) {
            const lottery = availableLotteries.find(l => l.lotteryId === selectedLotteryId);
            if (lottery) {
                const originalPrice = lottery.ticketPrice * count;
                const discountedPrice = originalPrice * DISCOUNT_RATE;
                
                const finalPrice = normalizeRate(discountedPrice);

                if (DISCOUNT_RATE < 1.0) {
                    discountText = `(Luxury特典: ${formatRate(originalPrice)} → ${formatRate(finalPrice)})`;
                    LOTTERY_TOTAL_PRICE_DISPLAY.innerHTML = `合計: <strong style=\"color: #28a745;\">${formatRate(finalPrice)}</strong> ${discountText}`;
                } else {
                    LOTTERY_TOTAL_PRICE_DISPLAY.textContent = `合計: ${formatRate(finalPrice)}`;
                }

            } else {
                LOTTERY_TOTAL_PRICE_DISPLAY.textContent = '合計: -';
            }
        } else {
            LOTTERY_TOTAL_PRICE_DISPLAY.textContent = '合計: -';
        }
    };

    LOTTERY_SELECT.addEventListener('change', updatePrice);
    LOTTERY_TICKET_COUNT.addEventListener('input', updatePrice);
    
    updatePrice();
}

async function loadLotteryData() {
    if (!authenticatedUser) return;
    if (!LOTTERY_SELECT || !LOTTERY_RESULTS_CONTAINER) return;

    LOTTERY_SELECT.innerHTML = '<option value=\"\" disabled selected>ロード中...</option>';
    LOTTERY_RESULTS_CONTAINER.innerHTML = '<p>購入履歴をロード中...</p>';
    availableLotteries = [];
    
    const allData = await fetchAllData();
    const allLotteries = allData.lotteries || [];
    const now = new Date();
    
    const openLotteries = allLotteries.filter(l => 
        l.status === 'OPEN' && new Date(l.purchaseDeadline) > now
    );

    if (openLotteries.length === 0) {
        LOTTERY_SELECT.innerHTML = '<option value=\"\" disabled>現在購入可能な宝くじはありません</option>';
    } else {
        let options = '<option value=\"\" disabled selected>購入する宝くじを選択</option>';
        openLotteries.forEach(l => {
            const deadline = new Date(l.purchaseDeadline).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            options += `<option value=\"${l.lotteryId}\">${l.name} (${formatRate(l.ticketPrice)}/枚) - 締切: ${deadline}</option>`;
        });
        LOTTERY_SELECT.innerHTML = options;
        availableLotteries = openLotteries; 
    }
    
    const myPlayerName = authenticatedUser.name;
    const myLotteries = allLotteries.filter(l => 
        l.tickets.some(t => t.player === myPlayerName)
    );

    if (myLotteries.length === 0) {
        LOTTERY_RESULTS_CONTAINER.innerHTML = '<p>宝くじの購入履歴はありません。</p>';
    } else {
        let html = '';
        myLotteries.sort((a, b) => new Date(b.resultAnnounceDate) - new Date(a.resultAnnounceDate)); 

        myLotteries.forEach(l => {
            const myTickets = l.tickets.filter(t => t.player === myPlayerName);
            const resultAnnounceDate = new Date(l.resultAnnounceDate);
            
            const totalTicketsCount = myTickets.reduce((sum, t) => sum + t.count, 0);
            
            let statusHtml = '';
            
            if (resultAnnounceDate > now) {
                statusHtml = `<p class=\"status-label status-closed\">結果発表待ち (発表日時: ${resultAnnounceDate.toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })})</p>`;
            } else {
                const unclaimedTicketsCount = myTickets.filter(t => !t.isClaimed).reduce((sum, t) => sum + t.count, 0);
                
                const claimedTickets = myTickets.filter(t => t.isClaimed);
                let winnings = 0;
                let prizeSummary = '';
                
                if (claimedTickets.length > 0) {
                    const winCounts = claimedTickets.reduce((counts, t) => {
                        if (t.prizeRank !== null) { 
                            const rank = t.prizeRank;
                            counts[rank] = (counts[rank] || { count: 0, amount: 0 });
                            counts[rank].count += t.count;
                            counts[rank].amount += t.prizeAmount * t.count; 
                            winnings += t.prizeAmount * t.count;
                        } else {
                             counts['ハズレ'] = (counts['ハズレ'] || { count: 0, amount: 0 });
                             counts['ハズレ'].count += t.count;
                        }
                        return counts;
                    }, {});

                    const ranks = Object.keys(winCounts).filter(r => r !== 'ハズレ').sort((a, b) => parseInt(a) - parseInt(b));
                    
                    if (winnings > 0) {
                        prizeSummary = ranks.map(rank => {
                            const rankName = `${rank}等`;
                            return `${rankName}: ${winCounts[rank].count}枚`;
                        }).join(', ');
                        
                        prizeSummary = `<p style=\"font-size: 0.9em; margin: 5px 0 0 0; font-weight: bold; color: #38c172;\">内訳: ${prizeSummary}</p>`;

                    } else {
                        prizeSummary = `<p style=\"font-size: 0.9em; margin: 5px 0 0 0; color: #dc3545;\">当選はありませんでした。</p>`;
                    }
                }
                
                if (unclaimedTicketsCount > 0) {
                    statusHtml = `
                        <button class=\"action-button check-lottery-result\" data-lottery-id=\"${l.lotteryId}\" style=\"width: auto;\">
                            結果を見る (${unclaimedTicketsCount}枚 未確認)
                        </button>
                        ${prizeSummary}
                    `;
                } else {
                    if (winnings > 0) {
                        statusHtml = `<p class=\"status-label status-open\">✅ 結果確認済み (合計当選: ${formatRate(winnings)})</p>`;
                    } else {
                        statusHtml = `<p class=\"status-label status-settled\">❌ 結果確認済み</p>`;
                    }
                    statusHtml += prizeSummary;
                }
            }

            html += `
                <div class=\"bet-card\" style=\"margin-bottom: 10px;\">
                    <h4>${l.name} (#${l.lotteryId})</h4>
                    <p>購入枚数: ${totalTicketsCount} 枚</p>
                    ${statusHtml}
                    <p id=\"lottery-result-message-${l.lotteryId}\" class=\"hidden\"></p>
                </div>
            `;
        });
        LOTTERY_RESULTS_CONTAINER.innerHTML = html;
        
        LOTTERY_RESULTS_CONTAINER.querySelectorAll('.check-lottery-result').forEach(button => {
            button.addEventListener('click', handleCheckLotteryResult);
        });
    }
}

if (LOTTERY_PURCHASE_FORM) {
    LOTTERY_PURCHASE_FORM.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!authenticatedUser) {
            showMessage(LOTTERY_PURCHASE_MESSAGE, '❌ 認証エラーが発生しました。', 'error');
            return;
        }

        const lotteryId = parseInt(LOTTERY_SELECT.value);
        const count = parseInt(LOTTERY_TICKET_COUNT.value);
        const submitButton = LOTTERY_PURCHASE_FORM.querySelector('button[type=\"submit\"]');

        if (!lotteryId || !count || count <= 0) {
            showMessage(LOTTERY_PURCHASE_MESSAGE, '❌ 宝くじを選択し、1枚以上の購入枚数を入力してください。', 'error');
            return;
        }

        const lottery = availableLotteries.find(l => l.lotteryId === lotteryId);
        if (!lottery) {
            showMessage(LOTTERY_PURCHASE_MESSAGE, '❌ 選択された宝くじ情報が見つかりません。', 'error');
            return;
        }

        const DISCOUNT_RATE = authenticatedUser.status === 'luxury' ? 0.8 : 1.0;
        const originalPrice = lottery.ticketPrice * count;
        const discountedPrice = originalPrice * DISCOUNT_RATE;
        const finalPrice = normalizeRate(discountedPrice);

        if (authenticatedUser.score < finalPrice) {
            showMessage(LOTTERY_PURCHASE_MESSAGE, `❌ 残りレート (${formatRate(authenticatedUser.score)}) が不足しています (必要: ${formatRate(finalPrice)})。`, 'error');
            return;
        }

        submitButton.disabled = true;
        showMessage(LOTTERY_PURCHASE_MESSAGE, `${count}枚 (レート ${formatRate(finalPrice)}) の宝くじを購入し、抽選処理中...`, 'info');

        try {
            const currentData = await fetchAllData();
            
            let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
            let allLotteries = currentData.lotteries || [];
            
            let targetPlayer = currentScoresMap.get(authenticatedUser.name);
            if (!targetPlayer || targetPlayer.score < finalPrice || typeof targetPlayer.status === 'undefined') {
                showMessage(LOTTERY_PURCHASE_MESSAGE, `❌ 最新の残りレート (${formatRate(targetPlayer?.score)}) が不足しているか、ユーザーデータが不完全です。`, 'error');
                submitButton.disabled = false;
                return;
            }

            const targetLotteryIndex = allLotteries.findIndex(l => l.lotteryId === lotteryId);
            if (targetLotteryIndex === -1 || allLotteries[targetLotteryIndex].status !== 'OPEN' || new Date(allLotteries[targetLotteryIndex].purchaseDeadline) <= new Date()) {
                showMessage(LOTTERY_PURCHASE_MESSAGE, '❌ この宝くじは購入可能ではありません (締切済みの可能性があります)。', 'error');
                submitButton.disabled = false;
                await loadLotteryData(); 
                return;
            }
            
            const targetLottery = allLotteries[targetLotteryIndex];
            
            const drawResultsMap = {}; 
            let totalWinningsForLog = 0; 
            let winCount = 0; 

            for (let i = 0; i < count; i++) {
                const drawResult = performLotteryDraw(targetLottery.prizes);
                const rankKey = drawResult.prizeRank === null ? 'ハズRE' : drawResult.prizeRank.toString();
                
                if (!drawResultsMap[rankKey]) {
                     drawResultsMap[rankKey] = { count: 0, amount: drawResult.prizeAmount };
                }
                
                drawResultsMap[rankKey].count++;
                
                if(drawResult.isWinner) {
                    totalWinningsForLog += drawResult.prizeAmount;
                    winCount++;
                }
            }
            
            const newTickets = [];
            const purchaseDate = new Date().toISOString();
            
            Object.keys(drawResultsMap).forEach(rankKey => {
                const isWinner = rankKey !== 'ハズRE';
                const prizeRank = isWinner ? parseInt(rankKey) : null;
                const prizeAmount = drawResultsMap[rankKey].amount; 
                const ticketCount = drawResultsMap[rankKey].count;
                
                const newTicket = {
                    ticketId: `tkt-${authenticatedUser.name}-${lotteryId}-${rankKey}-${purchaseDate}`,
                    player: authenticatedUser.name,
                    purchaseDate: purchaseDate, 
                    prizeRank: prizeRank,
                    prizeAmount: prizeAmount, 
                    count: ticketCount, 
                    isClaimed: false 
                };
                
                newTickets.push(newTicket);
            });

            const newScore = normalizeRate(targetPlayer.score - finalPrice);

            currentScoresMap.set(authenticatedUser.name, { 
                ...targetPlayer, 
                score: newScore
            });

            targetLottery.tickets.push(...newTickets);
            allLotteries[targetLotteryIndex] = targetLottery;

            const newData = {
                scores: Array.from(currentScoresMap.values()),
                sports_bets: currentData.sports_bets, 
                speedstorm_records: currentData.speedstorm_records,
                lotteries: allLotteries,
                gift_codes: currentData.gift_codes || []
            };

            const response = await updateAllData(newData);
            
            if (response.status === 'success') {
                showMessage(LOTTERY_PURCHASE_MESSAGE, `✅ ${count}枚の購入が完了しました (レート ${formatRate(finalPrice)} 減算)。${DISCOUNT_RATE < 1.0 ? ' Luxury割引が適用されました！' : ''}`, 'success');
                
                authenticatedUser.score = newScore;
                CURRENT_SCORE_ELEMENT.textContent = formatRate(newScore);
                
                LOTTERY_PURCHASE_FORM.reset();
                LOTTERY_TOTAL_PRICE_DISPLAY.textContent = '合計: -';
                await loadLotteryData(); 

            } else {
                showMessage(LOTTERY_PURCHASE_MESSAGE, `❌ 購入エラー: ${response.message}`, 'error');
            }

        } catch (error) {
            console.error("宝くじ購入処理中にエラー:", error);
            showMessage(LOTTERY_PURCHASE_MESSAGE, `❌ サーバーエラー: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
        }
    });
}

function performLotteryDraw(prizes) {
    const randomValue = Math.random(); 
    let cumulativeProbability = 0;

    for (const prize of prizes) {
        cumulativeProbability += prize.probability;
        
        if (randomValue < cumulativeProbability) {
            return { prizeRank: prize.rank, prizeAmount: prize.amount, isWinner: true };
        }
    }

    return { prizeRank: null, prizeAmount: 0, isWinner: false };
}


async function handleCheckLotteryResult(e) {
    const button = e.target;
    const lotteryId = parseInt(button.dataset.lotteryId);
    
    if (!authenticatedUser || !lotteryId) return;

    const messageEl = document.getElementById(`lottery-result-message-${lotteryId}`);
    if (!messageEl) return;
    
    button.disabled = true;
    showMessage(messageEl, '結果を確認し、レートを反映中...', 'info');

    try {
        const currentData = await fetchAllData();
        
        let currentScoresMap = new Map(currentData.scores.map(p => [p.name, p]));
        let allLotteries = currentData.lotteries || [];
        
        const targetLotteryIndex = allLotteries.findIndex(l => l.lotteryId === lotteryId);
        if (targetLotteryIndex === -1) {
            showMessage(messageEl, '❌ 宝くじデータが見つかりません。', 'error');
            return;
        }
        
        const lottery = allLotteries[targetLotteryIndex];
        const player = authenticatedUser.name;
        
        let totalWinnings = 0;
        let winCount = 0;
        let ticketCount = 0; 
        
        const winRankCounts = {};
        
        lottery.tickets.forEach(ticket => {
            if (ticket.player === player && !ticket.isClaimed) {
                ticketCount += ticket.count; 
                
                if (ticket.prizeRank !== null && ticket.prizeAmount > 0) {
                    const winningsThisTicket = ticket.prizeAmount * ticket.count;
                    totalWinnings += winningsThisTicket;
                    winCount += ticket.count; 
                    
                    const rank = ticket.prizeRank;
                    winRankCounts[rank] = (winRankCounts[rank] || 0) + ticket.count;
                } else {
                    const rank = 'ハズレ';
                    winRankCounts[rank] = (winRankCounts[rank] || 0) + ticket.count;
                }
                
                ticket.isClaimed = true;
            }
        });

        if (ticketCount === 0) {
            showMessage(messageEl, '✅ 既に確認済みです (新たに確認したチケットはありません)。', 'info');
            button.style.display = 'none'; 
            await loadLotteryData(); 
            return;
        }

        if (totalWinnings > 0) {
            let targetPlayer = currentScoresMap.get(player);
            if (targetPlayer) {
                const newScore = normalizeRate(targetPlayer.score + totalWinnings);
                currentScoresMap.set(player, { 
                    ...targetPlayer, 
                    score: newScore
                });
                
                authenticatedUser.score = newScore;
                CURRENT_SCORE_ELEMENT.textContent = formatRate(newScore);
            }
        }
        
        allLotteries[targetLotteryIndex] = lottery;
        
        const newData = {
            scores: Array.from(currentScoresMap.values()),
            sports_bets: currentData.sports_bets, 
            speedstorm_records: currentData.speedstorm_records,
            lotteries: allLotteries,
            gift_codes: currentData.gift_codes || []
        };
        
        const response = await updateAllData(newData);
        
        if (response.status === 'success') {
            
            let resultMessage = `✅ 結果: ${ticketCount}枚のチケットを確認しました。`;

            if (totalWinnings > 0) {
                const ranks = Object.keys(winRankCounts).filter(r => r !== 'ハズレ').sort((a, b) => parseInt(a) - parseInt(b));
                const prizeDetails = ranks.map(rank => {
                    const rankName = `${rank}等`;
                    return `${rankName}: ${winRankCounts[rank]}枚`;
                }).join(', ');

                resultMessage += ` ${winCount}枚が当選し、合計レート ${formatRate(totalWinnings)} を獲得！ (${prizeDetails})`;
                
                showMessage(messageEl, resultMessage, 'success');
            } else {
                resultMessage += ` 残念ながら当選はありませんでした。`;
                showMessage(messageEl, resultMessage, 'error');
            }
            
            await loadLotteryData();
            
        } else {
             showMessage(messageEl, `❌ 結果確認エラー: ${response.message}`, 'error');
             button.disabled = false;
             await loadLotteryData();
        }

    } catch (error) {
        console.error("宝くじ結果確認中にエラー:", error);
        showMessage(messageEl, `❌ サーバーエラー: ${error.message}`, 'error');
        button.disabled = false;
    }
}


window.onload = autoLogin;

// ============================================================
// manaba 未提出課題
// ============================================================

async function initManabaAssignments() {
    if (!authenticatedUser || !MANABA_ASSIGNMENT_LIST) return;

    bindManabaFormsOnce();
    await loadManabaAssignments();
    await syncManabaOnLoginIfStale();
}

let manabaFormsBound = false;

function bindManabaFormsOnce() {
    if (manabaFormsBound) return;
    manabaFormsBound = true;

    MANABA_SYNC_BUTTON?.addEventListener('click', async () => {
        await syncManabaFromServer(true);
    });

}

async function syncManabaOnLoginIfStale() {
    try {
        const credentials = await fetchManabaCredentialsFromFirebase();
        if (!credentials || !credentials.baseUrl || !credentials.loginId || !credentials.password) return;
        const record = await fetchManabaAssignmentsFromFirebase();
        const lastSynced = Date.parse(record?.lastSyncedAt || '');
        if (Number.isFinite(lastSynced) && Date.now() - lastSynced < MANABA_SYNC_INTERVAL_MS) return;
        await syncManabaFromServer(false);
    } catch (err) {
        renderManabaSyncNote(`自動取得に失敗しました: ${err.message}`, 'error');
    }
}

async function syncManabaFromServer(showProgress) {
    if (!MANABA_SYNC_BUTTON) return;
    MANABA_SYNC_BUTTON.disabled = true;
    if (showProgress) renderManabaSyncNote('manabaから取得中...', 'info');

    try {
        const data = await syncManabaAssignmentsNow();
        renderManabaSyncNote(`${data.count}件の未提出課題を取得しました。`, 'success');
        await loadManabaAssignments();
    } catch (err) {
        renderManabaSyncNote(`取得エラー: ${err.message}`, 'error');
    } finally {
        MANABA_SYNC_BUTTON.disabled = false;
    }
}

function renderManabaSyncNote(message, type) {
    showMessage(MANABA_IMPORT_MESSAGE, message, type);
}

async function loadManabaAssignments() {
    if (!MANABA_ASSIGNMENT_LIST) return;
    try {
        const record = await fetchManabaAssignmentsFromFirebase();
        renderManabaAssignments(record || { assignments: [] });
    } catch (err) {
        MANABA_ASSIGNMENT_LIST.innerHTML = '<p>manaba課題の読み込みに失敗しました。</p>';
    }
}

function renderManabaAssignments(record) {
    const assignments = [...(record.assignments || [])].sort((a, b) => {
        return (a.deadline || '9999-12-31').localeCompare(b.deadline || '9999-12-31');
    });
    const syncedAt = record.lastSyncedAt
        ? new Date(record.lastSyncedAt).toLocaleString('ja-JP')
        : '未取得';
    const statusText = record.lastSyncStatus === 'error'
        ? ` / 前回エラー: ${manabaEscapeHtml(record.lastSyncError || '')}`
        : '';
    const previewText = record.lastSyncPreview
        ? `<p class="text-small">取得ページ: ${manabaEscapeHtml(record.lastSyncTitle || 'タイトルなし')} / ${manabaEscapeHtml(record.lastSyncPreview)}</p>`
        : '';
    const checkedUrlsText = Array.isArray(record.lastCheckedUrls) && record.lastCheckedUrls.length
        ? `<p class="text-small">確認URL: ${record.lastCheckedUrls.map(url => manabaEscapeHtml(url)).join(' / ')}</p>`
        : '';

    if (!assignments.length) {
        MANABA_ASSIGNMENT_LIST.innerHTML = `<p class="text-small">最終取得: ${manabaEscapeHtml(syncedAt)}${statusText}</p>${previewText}${checkedUrlsText}<p>未提出課題はありません。</p>`;
        return;
    }

    MANABA_ASSIGNMENT_LIST.innerHTML = `
        <p class="text-small">最終取得: ${manabaEscapeHtml(syncedAt)}${statusText}</p>
        <div class="career-table-wrap">
            <table class="career-table manaba-assignment-table">
                <thead>
                    <tr>
                        <th>課題</th>
                        <th>授業</th>
                        <th>締切</th>
                        <th>リンク</th>
                    </tr>
                </thead>
                <tbody>
                    ${assignments.map(item => {
                        const urgentClass = isManabaAssignmentUrgent(item) ? ' class="manaba-assignment-urgent"' : '';
                        return `
                        <tr${urgentClass}>
                            <td>${manabaEscapeHtml(item.title || '名称未取得')}</td>
                            <td>${manabaEscapeHtml(item.course || '—')}</td>
                            <td>${manabaEscapeHtml(item.deadlineText || item.deadline || '—')}</td>
                            <td>${item.url ? `<a class="career-link" href="${manabaEscapeHtml(item.url)}" target="_blank" rel="noopener">開く</a>` : '—'}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

function manabaEscapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// -----------------------------------------------------------------
// ★★★ manaba締切プッシュ通知 (締切2日前にFCMでお知らせ) ★★★
// -----------------------------------------------------------------

const ENABLE_NOTIFICATIONS_BUTTON = document.getElementById('enable-notifications-button');
const NOTIFICATION_MESSAGE = document.getElementById('notification-message');
const PUSH_TOKEN_SAVED_KEY = 'manabaPushTokenSaved';
const NOTIFICATION_ENABLED_LABEL = '通知設定済み (タップで再設定)';

function isPushNotificationSupported() {
    return Boolean(
        'Notification' in window &&
        'serviceWorker' in navigator &&
        window.firebase &&
        firebase.messaging &&
        firebase.messaging.isSupported()
    );
}

function getMessagingVapidKey() {
    const key = String((window.QJONG_FIREBASE_CONFIG || {}).messagingVapidKey || '');
    return key && !key.includes('YOUR_') ? key : '';
}

async function savePushTokenToFirebase(token) {
    const db = getFirestoreDb();
    const uid = await requireFirebaseUid();
    if (!db) throw new Error('Firebaseが設定されていません。');

    const docRef = db.collection('push_tokens').doc(uid);
    const existing = await docRef.get();
    const entries = existing.exists && Array.isArray(existing.data().tokens) ? existing.data().tokens : [];
    const nextEntries = entries.filter(entry => entry && entry.token && entry.token !== token);
    nextEntries.push({
        token,
        userAgent: String(navigator.userAgent || '').slice(0, 160),
        updatedAt: new Date().toISOString()
    });

    await docRef.set({
        owner: localStorage.getItem('authUsername') || '',
        ownerUid: uid,
        tokens: nextEntries.slice(-5),
        updatedAt: new Date().toISOString()
    }, { merge: true });
}

async function registerPushToken() {
    const vapidKey = getMessagingVapidKey();
    if (!vapidKey) {
        throw new Error('通知用キー(VAPID)が未設定です。firebase-config.js の messagingVapidKey を設定してください。');
    }

    getFirebaseApp();
    const registration = await navigator.serviceWorker.register('firebase-messaging-sw.js');
    const token = await firebase.messaging().getToken({
        vapidKey,
        serviceWorkerRegistration: registration
    });
    if (!token) throw new Error('通知トークンを取得できませんでした。');

    await savePushTokenToFirebase(token);
    localStorage.setItem(PUSH_TOKEN_SAVED_KEY, '1');
    return token;
}

async function enableDeadlineNotifications() {
    const originalLabel = ENABLE_NOTIFICATIONS_BUTTON.textContent;
    ENABLE_NOTIFICATIONS_BUTTON.disabled = true;
    ENABLE_NOTIFICATIONS_BUTTON.setAttribute('aria-busy', 'true');
    ENABLE_NOTIFICATIONS_BUTTON.textContent = '設定中…';

    try {
        if (!isPushNotificationSupported()) {
            throw new Error('この環境はプッシュ通知に未対応です。iPhoneの場合は「ホーム画面に追加」したQ-Jongから開いてください。');
        }
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error('通知が許可されませんでした。端末・ブラウザの通知設定を確認してください。');
        }
        await registerPushToken();
        showMessage(NOTIFICATION_MESSAGE, '✅ この端末で締切通知を受け取ります（毎朝9時に判定）。', 'success');
        ENABLE_NOTIFICATIONS_BUTTON.textContent = NOTIFICATION_ENABLED_LABEL;
    } catch (error) {
        showMessage(NOTIFICATION_MESSAGE, `通知設定エラー: ${error.message}`, 'error');
        ENABLE_NOTIFICATIONS_BUTTON.textContent = originalLabel;
    } finally {
        ENABLE_NOTIFICATIONS_BUTTON.disabled = false;
        ENABLE_NOTIFICATIONS_BUTTON.removeAttribute('aria-busy');
    }
}

if (ENABLE_NOTIFICATIONS_BUTTON) {
    ENABLE_NOTIFICATIONS_BUTTON.addEventListener('click', enableDeadlineNotifications);

    if (isPushNotificationSupported() && Notification.permission === 'granted' && localStorage.getItem(PUSH_TOKEN_SAVED_KEY)) {
        ENABLE_NOTIFICATIONS_BUTTON.textContent = NOTIFICATION_ENABLED_LABEL;

        // ログイン済みならトークンを静かに最新化する (失敗しても画面には影響させない)。
        // ページを開いている間に届いた通知も firebase-messaging-sw.js が端末の通知として出す
        registerPushToken().catch(() => {});
    }
}


// -----------------------------------------------------------------
// ★★★ 就活ロードマップ: 今月の項目をハイライト ★★★
// (元は job-quiz.js にあった処理。就活問題集を削除した際に一緒に消えていた)
// -----------------------------------------------------------------

function scrollRoadmapItemIntoView(item) {
    const list = item.closest('.roadmap-list');
    if (!list) return;

    const targetLeft = item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2;
    list.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: 'auto'
    });
}

function highlightCurrentRoadmapMonth() {
    const roadmapItems = document.querySelectorAll('[data-roadmap-month]');
    if (!roadmapItems.length) return;

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let currentItem = null;
    roadmapItems.forEach(item => {
        const isCurrent = item.dataset.roadmapMonth === currentMonth;
        item.classList.toggle('is-current', isCurrent);
        if (isCurrent) currentItem = item;
    });
    if (currentItem) {
        requestAnimationFrame(() => scrollRoadmapItemIntoView(currentItem));
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', highlightCurrentRoadmapMonth, { once: true });
} else {
    highlightCurrentRoadmapMonth();
}
