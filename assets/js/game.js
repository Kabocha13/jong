// ゲームタブの共通部分
//   ログイン、ゲームの選択 (ブロックのタイル)、入場 (持ち込み)、手元チップと精算、画面の切り替え。
//   各テーブルの中身は game-blackjack.js / game-slot.js / game-gappori.js / game-nariagari.js / game-voyage.js
//   (ルーレットとテキサスホールデムは 52.0 で廃止)。
//   船底 (#underground) はチップを使わない別の遊び場で、中身は game-underground.js。
//   出目・配られるカード・リールの止まる位置・配当・残高はすべて Cloud Function (casino) が決める。
//   画面は #blackjack / #slot / #gappori / #nariagari のハッシュで切り替えるので、ブラウザの「戻る」でゲーム一覧に戻れる。

// plays は財布 (session) の中で、そのゲームを遊んだ回数を持つ項目
const CASINO_GAMES = {
    blackjack: { name: 'ブラックジャック', playsLabel: '勝負', plays: 'bjHands' },
    slot:      { name: 'スロット', playsLabel: 'スピン', plays: 'slotSpins' },
    gappori:   { name: '宝探し', playsLabel: '回', plays: 'gpRounds' },
    nariagari: { name: '成り上がり', playsLabel: '回', plays: 'nrSpins' },
    // 航海 (2026/10/5〜12/21 の期間限定)。ゲーム一覧のカードは Ver54.1 で出すまで Coming soon のままで、#voyage で直接開ける
    voyage:    { name: '航海', playsLabel: '回', plays: 'vgRolls' }
};

const casino = {
    ready: false,       // status を読み込み終えたか
    me: '',             // ログインしている人の名前 (卓で自分の席を見分ける)
    score: 0,
    session: null,      // 持ち込んだチップ。どのゲームでも共通
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

function playsSummary(settled) {
    const parts = Object.values(CASINO_GAMES)
        .filter(game => (settled[game.plays] || 0) > 0)
        .map(game => `${game.name}${settled[game.plays]}回`);
    return parts.length ? parts.join('・') : '0回';
}

function settledMessage(settled) {
    if (!settled) return '';
    const head = settled.reason === 'broke' ? 'チップがなくなったので精算しました'
        : settled.auto ? '前回のテーブルを自動で精算しました' : '精算しました';
    if (settled.beforeScore === null) return `${head}。`;
    return `${head}: ${playsSummary(settled)} / 持込 ${settled.buyIn.toLocaleString('ja-JP')} → ${settled.chips.toLocaleString('ja-JP')}。`
        + ` レート ${settled.beforeScore.toLocaleString('ja-JP')} → ${settled.afterScore.toLocaleString('ja-JP')} (${formatSigned(settled.delta)})`;
}

// ------------------------------------------------------------------
// 画面の切り替え (#blackjack / #slot / #gappori / #nariagari / #underground / それ以外はゲーム一覧)
// ------------------------------------------------------------------
function routeGame() {
    const name = location.hash.slice(1);
    return Object.hasOwn(CASINO_GAMES, name) ? name : null;
}

function isUndergroundRoute() {
    return location.hash.slice(1) === 'underground';
}

function renderRoute() {
    if (!casino.ready) return;
    const game = routeGame();
    let view = 'menu';
    if (isUndergroundRoute()) {
        // 船底はチップを持ち込まずに入る
        view = 'underground';
        openUnderground();
    } else if (!game) {
        renderMenu();
    } else if (!casino.session) {
        view = 'lobby';
        renderLobby(game);
    } else {
        view = game;
        if (game === 'blackjack') openBlackjackTable();
        else if (game === 'slot') openSlotTable();
        else if (game === 'gappori') openGapporiTable();
        else if (game === 'voyage') openVoyageTable();
        else openNariagariTable();
    }
    if (view !== 'blackjack') closeBlackjackTable();
    if (view !== 'slot') closeSlotTable();
    if (view !== 'gappori') closeGapporiTable();
    if (view !== 'nariagari') closeNariagariTable();
    if (view !== 'voyage') closeVoyageTable();
    if (view !== 'underground') closeUnderground();
    showView(view);
    // 画面ごとの見た目の切り替えに使う (宝探しと成り上がりはスマホで見出しを消し、1画面に収める)
    document.body.dataset.casinoView = view;
    // 手元チップは入場中だけ、ゲーム一覧と各テーブルで出す (船底はチップを使わないので出さない)
    el('casino-wallet').classList.toggle('hidden', !casino.session || view === 'lobby' || view === 'underground');
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
        let text = tile.dataset.game === 'blackjack' && isBlackjackLive() ? '勝負の途中'
            : tile.dataset.game === 'gappori' && isGapporiLive() ? '抽選の途中'
                : tile.dataset.game === 'nariagari' ? nariagariTileBadge() : '';
        // 船底はレートが上限 (既定1000) 未満のときだけ仕分けできる
        if (tile.dataset.game === 'underground' && casino.score < undergroundMaxRate()) text = '入れます';
        badge.textContent = text;
        badge.classList.toggle('hidden', !text);
    });
    renderBlackjackTile();
    renderGapporiTile();
    renderUndergroundTile();
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
        const game = casino.lobbyGame;
        const data = await callCasino('enter', { buyIn, game });
        if (data.autoSettled) showMessage(el('casino-message'), settledMessage(data.autoSettled), 'info');
        casino.session = data.session;
        renderRoute();
        // ブラックジャックから入場したら、そのまま空いている席に座る
        if (game === 'blackjack') await joinBlackjackAfterEntering();
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
    el('casino-chips').textContent = session.chips.toLocaleString('ja-JP');
    el('casino-buyin-display').textContent = session.buyIn.toLocaleString('ja-JP');
    // 回数は開いているテーブルのもの。ゲーム一覧では合計
    el('casino-plays-label').textContent = game ? CASINO_GAMES[game].playsLabel : 'プレイ';
    const plays = game
        ? session[CASINO_GAMES[game].plays] || 0
        : Object.values(CASINO_GAMES).reduce((sum, item) => sum + (session[item.plays] || 0), 0);
    el('casino-plays').textContent = `${plays}回`;
    const netEl = el('casino-net');
    netEl.textContent = formatSigned(net);
    netEl.dataset.sign = net > 0 ? 'plus' : net < 0 ? 'minus' : 'zero';
    el('casino-expiry').textContent = `${formatClock(session.expiresAt)} までに遊ぶか精算しないと自動で精算されます`;
    renderSettleButton();
}

function renderSettleButton() {
    const pending = isBlackjackLive() ? 'ブラックジャックの勝負' : isGapporiLive() ? '宝探しの抽選' : '';
    el('casino-settle-button').disabled = casino.busy || !casino.session || Boolean(pending);
    el('casino-settle-note').classList.toggle('hidden', !pending);
    if (pending) el('casino-settle-note').textContent = `${pending}が終わると精算できます。`;
}

function setCasinoBusy(busy) {
    casino.busy = busy;
    renderSettleButton();
    renderBlackjackControls();
    renderSlotControls();
    renderGapporiControls();
    renderNariagariControls();
    renderVoyageControls();
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
    if (data.me) casino.me = data.me;
    casino.ready = true;
    receiveBlackjackTable(data.table, data.now);
    receiveGapporiTable(data.gappori, data.now);
    receiveSlotState(data.slot);
    receiveVoyage(data.voyage);
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
    initBlackjack();
    initSlot();
    initGappori();
    initNariagari();
    initVoyage();
    initUnderground();
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
