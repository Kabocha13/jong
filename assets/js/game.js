// ゲームタブの共通部分
//   ログイン、ゲームの選択 (ブロックのタイル)、入場 (持ち込み)、手元チップと精算、画面の切り替え。
//   各テーブルの中身は game-blackjack.js / game-roulette.js。
//   出目・配られるカード・配当・残高はすべて Cloud Function (casino) が決める。
//   画面は #blackjack / #roulette のハッシュで切り替えるので、ブラウザの「戻る」でゲーム一覧に戻れる。

const CASINO_GAMES = {
    blackjack: { name: 'ブラックジャック', playsLabel: '勝負' },
    roulette:  { name: 'ルーレット', playsLabel: 'スピン' }
};

const casino = {
    ready: false,       // status を読み込み終えたか
    score: 0,
    session: null,      // 持ち込んだチップ。ブラックジャックとルーレットで共通
    busy: false,
    lobbyGame: null     // 入場フォームを出しているゲーム
};

const el = id => document.getElementById(id);

function formatSigned(value) {
    const n = Math.round(Number(value) || 0);
    return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toLocaleString('ja-JP')}`;
}

function formatClock(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

async function callCasino(action, payload = {}) {
    const token = await getFirebaseIdToken();
    if (!token) throw new Error('ログインが切れています。マイページでログインし直してください。');
    const response = await fetch(`${getFunctionsBaseUrl()}/casino`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status !== 'success') {
        throw new Error(data.message || `通信に失敗しました (${response.status})`);
    }
    return data;
}

/** ホームと同じく、保存済みの ID/パスワードがあれば裏でログインしておく */
async function ensureCasinoLogin() {
    if (await waitForFirebaseUser(3000)) return true;
    const username = localStorage.getItem('authUsername');
    const password = localStorage.getItem('authPassword');
    if (!username || !password) return false;
    try {
        await qjongSignIn(username, password);
        return true;
    } catch (error) {
        console.warn('ゲーム用ログインに失敗:', error);
        return false;
    }
}

/** data-view に name を含む要素だけを出す (1つの要素を複数の画面で使うときは空白区切り) */
function showView(name) {
    document.querySelectorAll('[data-view]').forEach(section => {
        section.classList.toggle('hidden', !section.dataset.view.split(' ').includes(name));
    });
}

function playsSummary({ spins = 0, bjHands = 0 }) {
    const parts = [];
    if (bjHands > 0) parts.push(`ブラックジャック${bjHands}回`);
    if (spins > 0) parts.push(`ルーレット${spins}回`);
    return parts.length ? parts.join('・') : '0回';
}

function settledMessage(settled) {
    if (!settled) return '';
    const head = settled.auto ? '前回のテーブルを自動で精算しました' : '精算しました';
    if (settled.beforeScore === null) return `${head}。`;
    return `${head}: ${playsSummary(settled)} / 持込 ${settled.buyIn.toLocaleString('ja-JP')} → ${settled.chips.toLocaleString('ja-JP')}。`
        + ` レート ${settled.beforeScore.toLocaleString('ja-JP')} → ${settled.afterScore.toLocaleString('ja-JP')} (${formatSigned(settled.delta)})`;
}

function isBlackjackPending() {
    return casino.session?.blackjack?.round?.phase === 'player';
}

// ------------------------------------------------------------------
// 画面の切り替え (#blackjack / #roulette / それ以外はゲーム一覧)
// ------------------------------------------------------------------
function routeGame() {
    const name = location.hash.slice(1);
    return Object.hasOwn(CASINO_GAMES, name) ? name : null;
}

function renderRoute() {
    if (!casino.ready) return;
    const game = routeGame();
    let view = 'menu';
    if (!game) {
        renderMenu();
    } else if (!casino.session) {
        view = 'lobby';
        renderLobby(game);
    } else {
        view = game;
        if (game === 'blackjack') openBlackjackTable();
        else openRouletteTable();
    }
    showView(view);
    // 手元チップは入場中だけ、ゲーム一覧と各テーブルで出す
    el('casino-wallet').classList.toggle('hidden', !casino.session || view === 'lobby');
    renderWallet();
}

// ------------------------------------------------------------------
// ゲーム一覧
// ------------------------------------------------------------------
function renderMenu() {
    el('casino-menu-score').textContent = formatRate(casino.score);
    el('casino-menu-rate').classList.toggle('hidden', Boolean(casino.session));
    document.querySelectorAll('.game-tile').forEach(tile => {
        const badge = tile.querySelector('.game-tile-badge');
        const text = tile.dataset.game === 'blackjack' && isBlackjackPending() ? '勝負の途中' : '';
        badge.textContent = text;
        badge.classList.toggle('hidden', !text);
    });
}

// ------------------------------------------------------------------
// 入場
// ------------------------------------------------------------------
function renderLobby(game) {
    casino.lobbyGame = game;
    el('casino-lobby-title').textContent = CASINO_GAMES[game].name;
    document.querySelectorAll('#casino-lobby [data-rules]').forEach(item => {
        item.classList.toggle('hidden', item.dataset.rules !== game);
    });
    el('casino-lobby-score').textContent = formatRate(casino.score);
    const input = el('casino-buyin');
    input.max = String(casino.score);
    if (!input.value || Number(input.value) > casino.score) {
        input.value = String(Math.min(casino.score, 100));
    }
    el('casino-enter-button').disabled = casino.busy || casino.score < 1;
}

async function enterTable(event) {
    event.preventDefault();
    if (casino.busy || !casino.lobbyGame) return;
    const buyIn = Number(el('casino-buyin').value);
    if (!Number.isInteger(buyIn) || buyIn < 1 || buyIn > casino.score) {
        showMessage(el('casino-message'), `持ち込めるのは1〜${casino.score}の整数です。`, 'error');
        return;
    }

    const button = el('casino-enter-button');
    setCasinoBusy(true);
    button.setAttribute('aria-busy', 'true');
    try {
        const data = await callCasino('enter', { buyIn, game: casino.lobbyGame });
        if (data.autoSettled) showMessage(el('casino-message'), settledMessage(data.autoSettled), 'info');
        casino.session = data.session;
        renderRoute();
    } catch (error) {
        showMessage(el('casino-message'), error.message, 'error');
        await refreshCasino().catch(() => {});
    } finally {
        button.removeAttribute('aria-busy');
        setCasinoBusy(false);
    }
}

// ------------------------------------------------------------------
// 手元チップと精算
// ------------------------------------------------------------------
function renderWallet() {
    const session = casino.session;
    if (!session) return;
    const game = routeGame();
    const net = session.chips - session.buyIn;
    const spins = session.spins || 0;
    const hands = session.bjHands || 0;
    el('casino-chips').textContent = session.chips.toLocaleString('ja-JP');
    el('casino-buyin-display').textContent = session.buyIn.toLocaleString('ja-JP');
    // 回数は開いているテーブルのもの。ゲーム一覧では合計
    el('casino-plays-label').textContent = game ? CASINO_GAMES[game].playsLabel : 'プレイ';
    el('casino-plays').textContent = `${game === 'roulette' ? spins : game === 'blackjack' ? hands : spins + hands}回`;
    const netEl = el('casino-net');
    netEl.textContent = formatSigned(net);
    netEl.dataset.sign = net > 0 ? 'plus' : net < 0 ? 'minus' : 'zero';
    el('casino-expiry').textContent = `${formatClock(session.expiresAt)} までに遊ぶか精算しないと自動で精算されます`;
    renderSettleButton();
}

function renderSettleButton() {
    const pending = isBlackjackPending();
    el('casino-settle-button').disabled = casino.busy || !casino.session || pending;
    el('casino-settle-note').classList.toggle('hidden', !pending);
}

function setCasinoBusy(busy) {
    casino.busy = busy;
    renderSettleButton();
    renderBetControls();
    renderBlackjackControls();
    if (casino.lobbyGame) el('casino-enter-button').disabled = busy || casino.score < 1;
}

async function settle() {
    if (casino.busy || !casino.session) return;
    const net = casino.session.chips - casino.session.buyIn;
    if (!confirm(`精算します。レートに ${formatSigned(net)} を反映します。よろしいですか？`)) return;

    setCasinoBusy(true);
    try {
        const data = await callCasino('settle');
        casino.session = null;
        await refreshCasino();
        showMessage(el('casino-message'), settledMessage(data.settled), 'success');
    } catch (error) {
        showMessage(el('casino-message'), error.message, 'error');
        await refreshCasino().catch(() => {});
    } finally {
        setCasinoBusy(false);
    }
}

// ------------------------------------------------------------------
// 起動
// ------------------------------------------------------------------
async function refreshCasino() {
    const data = await callCasino('status');
    casino.score = data.score;
    casino.session = data.session;
    casino.ready = true;
    renderRoute();
    if (data.autoSettled) {
        showMessage(el('casino-message'), settledMessage(data.autoSettled), 'info');
    }
}

function bindCasinoEvents() {
    el('casino-enter-form').addEventListener('submit', enterTable);
    document.querySelectorAll('.casino-presets [data-buyin]').forEach(button => {
        button.addEventListener('click', () => {
            const input = el('casino-buyin');
            if (button.dataset.buyin === 'other') {
                // 任意の額は入力欄に直接打ってもらう
                input.value = '';
                input.focus();
                return;
            }
            input.value = String(Math.min(Number(button.dataset.buyin), casino.score));
        });
    });
    el('casino-settle-button').addEventListener('click', settle);
    window.addEventListener('hashchange', () => {
        renderRoute();
        window.scrollTo(0, 0);
    });
}

async function initCasino() {
    initRoulette();
    initBlackjack();
    bindCasinoEvents();
    showView('loading');

    if (!await ensureCasinoLogin()) {
        showView('login');
        return;
    }
    try {
        await refreshCasino();
    } catch (error) {
        casino.ready = true;
        casino.session = null;
        renderRoute();
        showMessage(el('casino-message'), error.message, 'error');
    }
}

document.addEventListener('DOMContentLoaded', initCasino);
