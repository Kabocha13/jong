// ゲームタブの共通部分
//   ログイン、ゲームの選択 (ブロックのタイル)、財布 (使えるレート) の表示、画面の切り替え。
//   55.0 で持ち込み・精算を無くした。賭けはレートから直接で、賭けられるのは「使えるレート = レート − 結果待ちの賭け」まで。
//   casino.session はサーバーが返す財布 (chips = 使えるレート、held = 結果待ちの賭け、score = レート)。
//   各テーブルの中身は game-blackjack.js / game-slot.js / game-gappori.js / game-nariagari.js / game-voyage.js / game-sink.js
//   (ルーレットとテキサスホールデムは 52.0 で廃止)。
//   船底 (#underground) と指名手配 (#wanted) はチップを使わない別の遊び場で、中身は game-underground.js と game-wanted.js。
//   出目・配られるカード・リールの止まる位置・配当・残高はすべて Cloud Function (casino) が決める。
//   画面は #blackjack / #slot / #gappori / #nariagari のハッシュで切り替えるので、ブラウザの「戻る」でゲーム一覧に戻れる。

// plays は財布 (session) の中で、そのゲームを遊んだ回数を持つ項目
const CASINO_GAMES = {
    blackjack: { name: 'ブラックジャック', playsLabel: '勝負', plays: 'bjHands' },
    slot:      { name: 'スロット', playsLabel: 'スピン', plays: 'slotSpins' },
    gappori:   { name: '宝探し', playsLabel: '回', plays: 'gpRounds' },
    nariagari: { name: '成り上がり', playsLabel: '回', plays: 'nrSpins' },
    // 航海 (2026/10/5〜12/21 の期間限定)。ゲーム一覧のカードは 10/4 0:00 に Coming soon から切り替わる (game-voyage.js の showVoyageTile)
    voyage:    { name: '航海', playsLabel: '回', plays: 'vgRolls' },
    // 沈没 (2人以上で出港するチキンレース。全員共通の1卓)
    sink:      { name: '沈没', playsLabel: '回', plays: 'skRounds' }
};

const casino = {
    ready: false,       // status を読み込み終えたか
    me: '',             // ログインしている人の名前 (卓で自分の席を見分ける)
    score: 0,
    session: null,      // 財布 (chips = 使えるレート、held = 結果待ちの賭け、score = レート)。どのゲームでも共通
    busy: false,
    rulesGame: null     // ルールの欄に出しているゲーム
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
    if (settled.reason === 'v55') {
        // 54.x の持ち込みの財布を、55.0 で持ち込みを無くしたときに精算した結果
        return '持ち込み・精算は無くなり、レートからそのまま賭けられるようになりました。前の持ち込みは精算しました'
            + (settled.beforeScore === null ? '。' : ` (レート ${settled.beforeScore.toLocaleString('ja-JP')} → ${settled.afterScore.toLocaleString('ja-JP')})。`);
    }
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

function isWantedRoute() {
    return location.hash.slice(1) === 'wanted';
}

function renderRoute() {
    if (!casino.ready) return;
    // 船底と指名手配は、賞金首がいるあいだは指名手配だけ・いないあいだは船底だけ (58.0〜)。閉じているほうはゲーム一覧へ戻す
    const closed = closedGameRouteMessage();
    if (closed) {
        history.replaceState(null, '', `${location.pathname}${location.search}`);
        showMessage(el('casino-message'), closed, 'info');
    }
    const game = routeGame();
    let view = 'menu';
    if (isUndergroundRoute()) {
        // 船底はチップを持ち込まずに入る
        view = 'underground';
        openUnderground();
    } else if (isWantedRoute()) {
        // 指名手配もチップを持ち込まずに入る (レートがその場で動く)
        view = 'wanted';
        openWanted();
    } else if (isShopRoute()) {
        // 購入 (57.5〜)。レートを道具に交換する
        view = 'shop';
        openShop();
    } else if (isHlRoute()) {
        // HL (58.3〜)。トークンを手に入れるハイアンドロー
        view = 'hl';
        openHl();
    } else if (!game) {
        renderMenu();
    } else {
        view = game;
        renderCasinoRules(game);
        if (game === 'blackjack') openBlackjackTable();
        else if (game === 'slot') openSlotTable();
        else if (game === 'gappori') openGapporiTable();
        else if (game === 'voyage') openVoyageTable();
        else if (game === 'sink') openSinkTable();
        else openNariagariTable();
    }
    if (view !== 'blackjack') closeBlackjackTable();
    if (view !== 'slot') closeSlotTable();
    if (view !== 'gappori') closeGapporiTable();
    if (view !== 'nariagari') closeNariagariTable();
    if (view !== 'voyage') closeVoyageTable();
    if (view !== 'sink') closeSinkTable();
    if (view !== 'underground') closeUnderground();
    if (view !== 'wanted') closeWanted();
    showView(view);
    // 画面ごとの見た目の切り替えに使う (宝探しと成り上がりはスマホで見出しを消し、1画面に収める)
    document.body.dataset.casinoView = view;
    // 財布 (使えるレート) はカジノの各テーブルで出す (ゲーム一覧・船底・指名手配では出さない)
    el('casino-wallet').classList.toggle('hidden', !casino.session || !game);
    renderWallet();
}

// ------------------------------------------------------------------
// ゲーム一覧
// ------------------------------------------------------------------
function renderMenu() {
    el('casino-menu-score').textContent = formatRate(casino.score);
    // 結果待ちの賭けがあれば添える
    const held = casino.session?.held || 0;
    el('casino-menu-held').textContent = held > 0 ? `(結果待ち ${formatRate(held)})` : '';
    document.querySelectorAll('.game-tile').forEach(tile => {
        const badge = tile.querySelector('.game-tile-badge');
        let text = tile.dataset.game === 'blackjack' && isBlackjackLive() ? '勝負の途中'
            : tile.dataset.game === 'gappori' && isGapporiLive() ? '抽選の途中'
                : tile.dataset.game === 'nariagari' ? nariagariTileBadge()
                    : tile.dataset.game === 'sink' ? sinkTileBadge() : '';
        // 船底はレートが上限 (既定1000) 未満のときだけ仕分けできる
        if (tile.dataset.game === 'underground' && casino.score < undergroundMaxRate()) text = '入れます';
        if (tile.dataset.game === 'wanted') text = wantedTileBadge();
        // HL (58.3〜) は使えるレートが1回の代金 (300,000) 以上の人だけが入れる VIP の卓
        if (tile.dataset.game === 'hl' && (casino.session?.chips ?? casino.score) >= 300000) text = '入れます';
        badge.textContent = text;
        badge.classList.toggle('hidden', !text);
    });
    // 船底と指名手配は、賞金首がいるあいだは指名手配だけ・いないあいだは船底だけ出す (58.0〜。まだわからないあいだはどちらも出さない)
    const mode = wantedOrUnderground();
    document.querySelector('.game-tile[data-game="underground"]')?.classList.toggle('hidden', mode !== 'underground');
    document.querySelector('.game-tile[data-game="wanted"]')?.classList.toggle('hidden', mode !== 'wanted');
    renderBlackjackTile();
    renderGapporiTile();
    renderSinkTile();
    renderUndergroundTile();
    placeHlTile();
}

/**
 * HL (58.6〜): 使えるレートが1回の代金 (300,000) 以上の人には、ゲーム一覧のいちばん上に画面の幅いっぱいで出す。
 * それより少ない人には、ふつうの大きさで購入の前に出す
 */
function placeHlTile() {
    const tile = document.querySelector('.game-tile[data-game="hl"]');
    if (!tile) return;
    const tiles = tile.parentElement;
    const rich = (casino.session?.chips ?? casino.score) >= 300000;
    tile.classList.toggle('is-hl-featured', rich);
    if (rich) {
        if (tiles.firstElementChild !== tile) tiles.prepend(tile);
        return;
    }
    const shop = tiles.querySelector('.game-tile[data-game="shop"]');
    if (shop && tile.nextElementSibling !== shop) tiles.insertBefore(tile, shop);
}

// ------------------------------------------------------------------
// ルール (各テーブルの下。そのゲームの分だけ出す)
// ------------------------------------------------------------------
function renderCasinoRules(game) {
    casino.rulesGame = game;
    el('casino-rules-title').textContent = `${CASINO_GAMES[game].name}のルール`;
    document.querySelectorAll('#casino-rules-box [data-rules]').forEach(item => {
        item.classList.toggle('hidden', item.dataset.rules !== game);
    });
}

// ------------------------------------------------------------------
// 財布 (使えるレート = レート − 結果待ちの賭け)
// ------------------------------------------------------------------
function renderWallet() {
    const session = casino.session;
    if (!session) return;
    if (Number.isFinite(Number(session.score))) casino.score = Number(session.score);
    const game = routeGame();
    el('casino-chips').textContent = formatRate(session.chips);
    el('casino-held').textContent = formatRate(session.held || 0);
    el('casino-score').textContent = formatRate(session.score ?? casino.score);
    // 今日 (日本時間 0:00 から) 遊んだ回数と、1日の上限 (一般 100回・プロ 1,000回。56.0〜)。全部のゲームで共通に数える
    const playsToday = Number(session.playsToday) || 0;
    const playLimit = Number(session.playLimit) || 0;
    el('casino-plays').textContent = playLimit ? `${playsToday.toLocaleString('ja-JP')}/${playLimit.toLocaleString('ja-JP')}` : `${playsToday.toLocaleString('ja-JP')}回`;
    el('casino-plays').dataset.full = String(Boolean(playLimit) && playsToday >= playLimit);
    renderSettleButton();
}

/** 結果待ちの賭けがあれば、その説明を添える (名前は 54.x の精算ボタンのころのまま。ほかのゲームの画面からも呼ぶ) */
function renderSettleButton() {
    const pending = isBlackjackLive() ? 'ブラックジャックの勝負' : isGapporiLive() ? '宝探しの抽選'
        : isSinkLive() ? '沈没の航海' : '';
    const note = el('casino-held-note');
    note.classList.toggle('hidden', !(casino.session?.held > 0));
    note.textContent = pending
        ? `${pending}の賭けは、結果が出るまで使えるレートから外しています。結果が出たら差し引きがレートに入ります。`
        : '結果待ちの賭けは、結果が出るまで使えるレートから外しています。';
}

function setCasinoBusy(busy) {
    casino.busy = busy;
    renderSettleButton();
    renderBlackjackControls();
    renderSlotControls();
    renderGapporiControls();
    renderNariagariControls();
    renderVoyageControls();
    renderSinkControlsIfReady();
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
    receiveSinkTable(data.sink, data.now, data.sinkMine, data.sinkSea);
    renderRoute();
    if (data.autoSettled) {
        showMessage(el('casino-message'), settledMessage(data.autoSettled), 'info');
    }
}

function bindCasinoEvents() {
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
    initSink();
    initUnderground();
    initWanted();
    initHl();
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
