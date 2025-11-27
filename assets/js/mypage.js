// assets/js/mypage.js

const AUTH_FORM = document.getElementById('auth-form');
const MYPAGE_CONTENT = document.getElementById('mypage-content');
const AUTH_MESSAGE = document.getElementById('auth-message');
// ... [DOM要素の定義は省略] ...

// 認証されたユーザー情報 ({name: '...', score: ..., pass: '...', status: ..., lastBonusTime: ...})
let authenticatedUser = null; 
// 宝くじのデータを一時的に保持 (価格計算用)
let availableLotteries = [];

// -----------------------------------------------------------------
// ★★★ 認証とログイン状態の管理 ★★★
// -----------------------------------------------------------------

// ★ 修正: hashPassword関数はcommon.jsから利用するため削除

/**
 * ログイン処理本体
 * @param {string} username - ユーザー名
 * @param {string} password - パスワード (プレーンテキスト)
 * @param {boolean} isAuto - 自動ログインかどうか
 * @returns {Promise<boolean>} ログイン成功ならtrue
 */
async function attemptLogin(username, password, isAuto = false) {
    if (!isAuto) {
        showMessage(AUTH_MESSAGE, '認証中...', 'info');
    }
    
    const allData = await fetchAllData();
    const scores = allData.scores;

    // ★ 修正: ユーザー入力のパスワードをハッシュ化する前にtrim()で空白を削除
    let hashedPassword;
    try {
        // common.jsのhashPasswordを使用
        hashedPassword = await hashPassword(password.trim());
    } catch (e) {
        showMessage(AUTH_MESSAGE, '❌ 認証エラー: ハッシュ化処理に失敗しました。', 'error');
        return false;
    }

    // ★ 修正: ユーザー名をtrim()し、ハッシュ化されたパスワードとデータ内の 'pass' フィールドを比較
    const user = scores.find(p => p.name === username.trim() && p.pass === hashedPassword);

    if (user) {
        // ★ 修正: 認証ユーザー情報を最新のデータで上書き
        authenticatedUser = user; 
        
        // ★ 修正: statusフィールドが存在しない場合、'none' をデフォルトとして設定
        if (!authenticatedUser.status) {
            authenticatedUser.status = 'none';
        }
        
        // 1. 認証情報をlocalStorageに保存 (自動ログイン用)
        localStorage.setItem('authUsername', username.trim());
        localStorage.setItem('authPasswordHash', hashedPassword); 

        // 2. UIの切り替え
        document.getElementById('auth-section').classList.add('hidden');
        MYPAGE_CONTENT.classList.remove('hidden');
        
        if (!isAuto) {
             showMessage(AUTH_MESSAGE, `✅ ログイン成功! ようこそ、${username.trim()}様。`, 'success');
        } else {
             // 自動ログイン時はメッセージを非表示にする
             AUTH_MESSAGE.classList.add('hidden');
        }
        
        // 3. マイページコンテンツの初期化
        initializeMyPageContent(); 
        return true;
    } else {
        // 自動ログインが失敗した場合は、保存された認証情報が古い可能性があるためクリア
        if (isAuto) {
            localStorage.removeItem('authUsername');
            localStorage.removeItem('authPasswordHash');
        } else {
            showMessage(AUTH_MESSAGE, '❌ ユーザー名またはパスワードが間違っています。', 'error');
        }
        return false;
    }
}


/**
 * ページロード時の自動ログイン処理
 */
async function autoLogin() {
    const username = localStorage.getItem('authUsername');
    const hashedPassword = localStorage.getItem('authPasswordHash');

    if (username && hashedPassword) {
        // ハッシュ値を渡す特殊なログイン処理を実行
        await attemptLoginWithHash(username, hashedPassword, true);
    }
}

/**
 * ハッシュ値を使用したログイン処理 (自動ログイン専用)
 * @param {string} username - ユーザー名
 * @param {string} hashedPassword - パスワードハッシュ
 * @param {boolean} isAuto - 自動ログインかどうか
 * @returns {Promise<boolean>} ログイン成功ならtrue
 */
async function attemptLoginWithHash(username, hashedPassword, isAuto) {
    const allData = await fetchAllData();
    const scores = allData.scores;

    // ★ 修正: ハッシュ値とデータ内の 'pass' フィールドを直接比較 (trim()は不要)
    const user = scores.find(p => p.name === username && p.pass === hashedPassword);

    if (user) {
        authenticatedUser = user; 
        if (!authenticatedUser.status) {
            authenticatedUser.status = 'none';
        }
        
        document.getElementById('auth-section').classList.add('hidden');
        MYPAGE_CONTENT.classList.remove('hidden');
        
        if (isAuto) {
             AUTH_MESSAGE.classList.add('hidden');
        }
        
        initializeMyPageContent(); 
        return true;
    } else {
        // ★ 修正: 自動ログイン失敗時、保存データをクリア
        if (isAuto) {
            localStorage.removeItem('authUsername');
            localStorage.removeItem('authPasswordHash');
        }
        return false;
    }
}


/**
 * ログアウト処理
 */
function handleLogout() {
    // 既存の window.confirm をカスタムモーダルに置き換える指示がないため、一旦そのままにするが、本来はカスタムモーダルが必要
    if (!window.confirm('ログアウトしますか？次回アクセス時に再度ログインが必要です。')) {
        return;
    }
    
    // 1. localStorageから認証情報を削除
    localStorage.removeItem('authUsername');
    localStorage.removeItem('authPasswordHash');

    // 2. 状態をリセットし、UIを切り替える
    authenticatedUser = null;
    document.getElementById('auth-section').classList.remove('hidden');
    MYPAGE_CONTENT.classList.add('hidden');
    
    // フォームをリセット
    AUTH_FORM.reset();
    
    showMessage(AUTH_MESSAGE, '👋 ログアウトしました。', 'info');
}

// --- イベントリスナー ---

AUTH_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    // ★ 修正: 取得時にtrim()を適用し、不必要な空白を除去
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value; // trim()はattemptLogin内で実行
    
    // プレーンテキストのパスワードでログイン試行 (内部でハッシュ化される)
    await attemptLogin(username, password, false);
});

LOGOUT_BUTTON.addEventListener('click', handleLogout);

// -----------------------------------------------------------------
// ... [以降の関数は変更なし] ...
