// ゲームタブ: スロット (3リール × 3段、5ライン)
// 止まる位置・当たり・払い戻しは Cloud Function (casino の slotSpin) が決める。
// この画面は賭け金を送り、返ってきた絵柄の並びにリールを止めて見せるだけ。
// 絵柄の画像は assets/img/slot/<絵柄>.jpeg。まだ置かれていない絵柄は絵文字で代わりに出す。
// 入場・手元チップ・精算・画面の切り替えは game.js。

// 配当とラインは functions/slot.js と同じ (表示用)
const SLOT_SYMBOLS = {
    wild:    { name: 'ドクロ旗', emoji: '🏴‍☠️' },
    chest:   { name: '宝箱', emoji: '💰' },
    coin:    { name: '金貨', emoji: '🪙' },
    compass: { name: '羅針盤', emoji: '🧭' },
    map:     { name: '宝の地図', emoji: '🗺️' },
    rum:     { name: 'ラム酒', emoji: '🍾' },
    parrot:  { name: 'オウム', emoji: '🦜' },
    anchor:  { name: '錨', emoji: '⚓' },
    // 宝探しの船長マス (スロットには出ない)。画像が無いあいだは game-gappori.js が札で出す
    captain: { name: '船長', emoji: '🎩' }
};
const SLOT_PAYS = { chest: 100, coin: 30, compass: 15, map: 12, rum: 5, parrot: 3, anchor: 2 };
const SLOT_LINES = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
const SLOT_LINE_NAMES = ['中段', '上段', '下段', '右下がり', '右上がり'];
const SLOT_BETS = [1, 2, 5, 10, 20, 50, 100];
const SLOT_BET_STORAGE_KEY = 'slotBet';
const SLOT_IMAGE_DIR = 'assets/img/slot/';
const SLOT_IMAGE_EXT = '.jpeg';
// 回っている間に流す絵柄。通常モードの左右のリールの枚数の割合に合わせる (錨8 オウム6 ラム3 地図3 羅針盤3 金貨3 宝箱2)。
// 通常モードはドクロ旗が出ないので流さない。ジャックポットタイムは高い絵柄とドクロ旗だけを流す
// (functions/slot.js のジャックポットタイムのリールの割合に合わせる: 地図8 羅針盤7 金貨5 宝箱2 ドクロ旗3)
const SLOT_FILLER = [
    ...Array(8).fill('anchor'), ...Array(6).fill('parrot'), ...Array(3).fill('rum'), ...Array(3).fill('map'),
    ...Array(3).fill('compass'), ...Array(3).fill('coin'), ...Array(2).fill('chest')
];
const SLOT_FILLER_JACKPOT = [
    ...Array(8).fill('map'), ...Array(7).fill('compass'), ...Array(5).fill('coin'), ...Array(2).fill('chest'), ...Array(3).fill('wild')
];
const SLOT_STOP_MS = [900, 1300, 1700];   // 結果が届いてから各リールが止まるまで
const SLOT_REACH_MS = 1300;               // リーチのとき右のリールを引き延ばす長さ
const SLOT_REACH_MIN_PAY = 8;             // この倍率以上の絵柄でリーチになったら演出する
const SLOT_REACH_MIN_PAY_JACKPOT = 30;    // ジャックポットタイムは高い絵柄しか出ないので、金貨・宝箱のときだけ
const SLOT_BIG_WIN = 20;                  // 倍率の合計がこれ以上なら大当たりの演出
const SLOT_AUTO_GAP_MS = 700;             // オートで次をまわすまでの間 (当たりのときは長めに)
const SLOT_FREEZE_MS = 1300;              // ジャックポットタイム突入が決まった回、リールを止める前に暗転させる長さ
const SLOT_CUTIN_MS = 3800;               // 突入・終了の画面いっぱいの演出を出しておく長さ (タップで閉じられる)
const SLOT_STROBE_GAP_MS = 350;           // 続けて光らせる間隔 (光過敏に配慮して1秒に3回を超えないように)
const SLOT_HAPTIC_TAP_MS = 60;            // アプリで震わせるとき、これより短い区間は「コツッ」と叩くだけにする

const slot = {
    bet: 1,
    state: null,            // ジャックポットタイムの状態 (サーバーの返事。functions/slot.js の publicSlotState)
    grid: null,             // いま見えている 3段 × 3列
    images: new Set(),      // 読み込めた絵柄の画像
    auto: false,
    autoTimer: null,
    open: false,
    jackpotWon: 0           // いまのジャックポットタイムで払い戻された合計 (画面を開き直すと0から数える)
};

function randomFiller() {
    const filler = isSlotJackpot() ? SLOT_FILLER_JACKPOT : SLOT_FILLER;
    return filler[Math.floor(Math.random() * filler.length)];
}

// ------------------------------------------------------------------
// ジャックポットタイム (ルールは functions/slot.js。入るか・何回続くかはサーバーが決める)
// ------------------------------------------------------------------
function isSlotJackpot() {
    return slot.state?.mode === 'jackpot';
}

/** 次の1回の賭け金。ジャックポットタイム中は固定 (手持ちが足りなければ手持ちぶん) */
function slotSpinBet() {
    return isSlotJackpot() ? Math.max(1, Math.min(slot.state.jackpotBet, slotChips())) : slot.bet;
}

/** サーバーから届いたジャックポットタイムの状態を受け取って、表示を揃える (game.js の refreshCasino からも呼ぶ) */
function receiveSlotState(state) {
    slot.state = state || null;
    renderSlotMode();
    renderSlotControls();
}

/** 筐体の上の表示。ジャックポットタイム中は筐体・看板・画面の縁まで光らせ、残りの回数と獲得を大きく出す */
function renderSlotMode() {
    const node = el('slot-mode');
    if (!node) return;
    const jackpot = isSlotJackpot();
    const left = jackpot ? slot.state.jackpotLeft : 0;
    const cabinet = document.querySelector('.slot-cabinet');
    cabinet?.classList.toggle('is-jackpot', jackpot);
    cabinet?.classList.toggle('is-last', left === 1);
    toggleSlotAura(jackpot && slot.open);
    const marquee = document.querySelector('.slot-marquee span');
    if (marquee) marquee.textContent = jackpot ? 'Jackpot Time' : 'Treasure Reels';
    node.innerHTML = '';
    // 天井は隠しているので、通常モードでは何も出さない
    if (!jackpot) return;
    if (left === 1) {
        node.appendChild(modeText('span', 'slot-mode-last', 'LAST GAME!!'));
    } else {
        node.append(modeText('span', '', '残り'), modeText('strong', '', String(left)), modeText('span', '', '回'));
    }
    node.append(modeText('span', 'slot-mode-gap', '獲得'), modeText('strong', 'slot-mode-won', slot.jackpotWon.toLocaleString('ja-JP')));
}

function modeText(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
}

// ------------------------------------------------------------------
// ジャックポットタイムの演出
// ------------------------------------------------------------------
/**
 * ジャックポットタイム中の画面の縁の光と光線。main は入場のアニメーションで transform が残り、
 * その中に置いた position: fixed は画面に固定されないので、body の直下に置く
 */
function toggleSlotAura(show) {
    let aura = document.querySelector('body > .slot-aura');
    if (!show) {
        aura?.remove();
        return;
    }
    if (aura) return;
    aura = document.createElement('div');
    aura.className = 'slot-aura';
    aura.setAttribute('aria-hidden', 'true');
    document.body.appendChild(aura);
}

/**
 * 震わせる (iOS アプリだけ。ブラウザ・PWA では震わせない: iPhone の Safari には震わせる仕組みが無いため 50.18 でやめた)。
 * pattern は ms の数か [震える, 止まる, 震える, …] の配列。ネイティブの触覚 (Haptics プラグイン) で、
 * 震える区間ごとにその長さだけ震わせ、ごく短い区間は強く1回叩く
 */
function buzz(pattern) {
    const haptics = nativePlugin('Haptics');
    if (!haptics) return;
    const steps = Array.isArray(pattern) ? pattern : [pattern];
    let at = 0;
    steps.forEach((ms, index) => {
        if (index % 2 === 0) {
            setTimeout(() => {
                const done = ms < SLOT_HAPTIC_TAP_MS ? haptics.impact({ style: 'HEAVY' }) : haptics.vibrate({ duration: ms });
                done?.catch?.(() => {});
            }, at);
        }
        at += ms;
    });
}

/** アニメーションを最初からやり直すため、クラスを付け直す */
function restartClass(node, name) {
    if (!node) return;
    node.classList.remove(name);
    void node.offsetWidth;
    node.classList.add(name);
}

/** 画面全体を一瞬光らせる。tone は white (いちばん強い)・gold (やわらかめ)・red */
function flashScreen(tone = 'white') {
    if (prefersReducedMotion()) return;
    const flash = document.createElement('div');
    flash.className = `slot-flash is-${tone}`;
    flash.setAttribute('aria-hidden', 'true');
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 700);
}

/** 続けて光らせる */
function strobeScreen(tones) {
    tones.forEach((tone, index) => setTimeout(() => flashScreen(tone), index * SLOT_STROBE_GAP_MS));
}

/**
 * from (既定はスロットの窓) の真ん中から金貨を飛び散らせる (画面に固定した入れ物に置くので、横にはみ出してもスクロールしない)。
 * 宝探し (game-gappori.js) からも使う
 */
function burstCoins(count, from = document.querySelector('.slot-window-frame')) {
    const frame = from;
    if (!frame || prefersReducedMotion()) return;
    const rect = frame.getBoundingClientRect();
    const burst = document.createElement('div');
    burst.className = 'slot-burst';
    burst.setAttribute('aria-hidden', 'true');
    burst.style.setProperty('--x', `${rect.left + rect.width / 2}px`);
    burst.style.setProperty('--y', `${rect.top + rect.height / 2}px`);
    for (let i = 0; i < count; i++) {
        const coin = document.createElement('span');
        coin.className = `slot-burst-coin treasure-coin${Math.random() < 0.3 ? ' is-silver' : ''}`;
        const angle = Math.random() * Math.PI * 2;
        const distance = 80 + Math.random() * 180;
        coin.style.setProperty('--dx', `${(Math.cos(angle) * distance).toFixed(0)}px`);
        coin.style.setProperty('--dy', `${(Math.sin(angle) * distance - 70).toFixed(0)}px`);
        coin.style.setProperty('--size', `${(12 + Math.random() * 16).toFixed(0)}px`);
        coin.style.setProperty('--spin', `${(Math.random() * 1440 - 720).toFixed(0)}deg`);
        coin.style.animationDelay = `${(Math.random() * 0.18).toFixed(2)}s`;
        burst.appendChild(coin);
    }
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 1600);
}

/** ジャックポットタイム中に当たった: 揺らして光らせ、倍率に応じて金貨を飛ばす。大当たりは何度も光らせて長く震わせる */
function celebrateJackpotWin(multiplier) {
    restartClass(document.querySelector('.slot-window-frame'), 'is-shake');
    restartClass(document.querySelector('.slot-mode-won'), 'is-bump');
    burstCoins(Math.min(60, 12 + multiplier * 2));
    if (multiplier >= SLOT_BIG_WIN) {
        strobeScreen(['white', 'gold', 'red', 'white']);
        buzz([200, 80, 200, 80, 500]);
    } else {
        flashScreen('white');
        buzz([80, 50, 140]);
    }
}

/** 突入が決まった回: リールを止める前に、筐体を暗転させてドクロ旗を脈打たせ、揺らしてから光らせる */
async function freezeSlot() {
    const cabinet = document.querySelector('.slot-cabinet');
    cabinet?.classList.add('is-freeze');
    // 暗転のあいだは小刻みに震わせ続ける
    buzz(Array(Math.floor(SLOT_FREEZE_MS / 100) * 2).fill(50));
    await delay(SLOT_FREEZE_MS);
    cabinet?.classList.remove('is-freeze');
    strobeScreen(['white', 'gold', 'red']);
    buzz(500);
}

/** 画面いっぱいの演出を出し、時間が来るかタップされたら消す。消えたら解決する */
function showSlotOverlay(variant, build) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = `slot-overlay ${variant}`;
        overlay.setAttribute('aria-hidden', 'true');
        const rays = document.createElement('div');
        rays.className = 'slot-overlay-rays';
        const body = document.createElement('div');
        body.className = 'slot-overlay-body';
        build(body);
        overlay.append(rays, body, modeText('p', 'slot-overlay-hint', 'タップで閉じる'));
        let closed = false;
        let timer = null;
        const close = () => {
            if (closed) return;
            closed = true;
            clearTimeout(timer);
            overlay.classList.add('is-leaving');
            setTimeout(() => {
                overlay.remove();
                resolve();
            }, 260);
        };
        overlay.addEventListener('click', close);
        document.body.appendChild(overlay);
        timer = setTimeout(close, prefersReducedMotion() ? 2200 : SLOT_CUTIN_MS);
    });
}

/** ジャックポットタイム突入のカットイン (効果音 a.mp3 はカットインとほぼ同じ長さ) */
function showJackpotCutin(spins) {
    window.playGameSound?.('slotJackpot');
    window.qjongTreasureRain?.preview(6000);
    flashScreen('white');
    buzz([120, 60, 120, 60, 400]);
    return showSlotOverlay('is-start', body => {
        const flag = createSymbol('wild');
        flag.classList.add('slot-overlay-flag');
        const count = modeText('p', 'slot-overlay-count', ' Games');
        count.prepend(modeText('strong', '', String(spins)));
        body.append(
            flag,
            modeText('p', 'slot-overlay-title', 'Jackpot'),
            modeText('p', 'slot-overlay-title is-second', 'Time'),
            modeText('p', 'slot-overlay-sub', 'ジャックポットタイム突入!!'),
            count
        );
    });
}

/** ジャックポットタイム終了: 払い戻しの合計を数え上げて見せる */
function showJackpotResult(won) {
    if (won > 0) window.qjongTreasureRain?.preview(5000);
    flashScreen('gold');
    buzz([80, 40, 80, 40, 300]);
    let number = null;
    const closed = showSlotOverlay('is-result', body => {
        number = modeText('strong', 'slot-overlay-won', '0');
        const total = modeText('p', 'slot-overlay-total', '獲得 ');
        total.appendChild(number);
        body.append(
            modeText('p', 'slot-overlay-sub', 'ジャックポットタイム終了'),
            modeText('p', 'slot-overlay-title', 'Total'),
            total
        );
    });
    (async () => {
        const steps = prefersReducedMotion() ? 1 : 30;
        await delay(prefersReducedMotion() ? 0 : 400);
        for (let i = 1; i <= steps; i++) {
            number.textContent = Math.round((won * i) / steps).toLocaleString('ja-JP');
            await delay(40);
        }
        number.classList.add('is-done');
    })();
    return closed;
}

function randomGrid() {
    return Array.from({ length: 3 }, () => Array.from({ length: 3 }, randomFiller));
}

// ------------------------------------------------------------------
// 絵柄
// ------------------------------------------------------------------
function fillSymbol(node, symbol) {
    node.innerHTML = '';
    node.dataset.symbol = symbol;
    if (slot.images.has(symbol)) {
        const img = document.createElement('img');
        img.src = `${SLOT_IMAGE_DIR}${symbol}${SLOT_IMAGE_EXT}`;
        img.alt = '';
        img.draggable = false;
        node.appendChild(img);
    } else {
        const emoji = document.createElement('span');
        emoji.className = 'slot-symbol-emoji';
        emoji.textContent = SLOT_SYMBOLS[symbol].emoji;
        node.appendChild(emoji);
    }
}

function createSymbol(symbol) {
    const node = document.createElement('span');
    node.className = `slot-symbol is-${symbol}`;
    fillSymbol(node, symbol);
    return node;
}

/** 画像が置かれている絵柄だけ、見えているところも含めて画像に差し替える */
function loadSlotImages() {
    Object.keys(SLOT_SYMBOLS).forEach(symbol => {
        const img = new Image();
        img.onload = () => {
            slot.images.add(symbol);
            document.querySelectorAll(`.slot-symbol[data-symbol="${symbol}"]`).forEach(node => fillSymbol(node, symbol));
        };
        img.src = `${SLOT_IMAGE_DIR}${symbol}${SLOT_IMAGE_EXT}`;
    });
}

// ------------------------------------------------------------------
// リール
// ------------------------------------------------------------------
function reelStrips() {
    return Array.from(document.querySelectorAll('#slot-window .slot-strip'));
}

/** 止まっている状態: 各リールに見えている3つだけを置く */
function renderGrid(grid) {
    slot.grid = grid;
    reelStrips().forEach((strip, reel) => {
        strip.innerHTML = '';
        strip.style.transition = 'none';
        strip.style.setProperty('--shift', '0');
        grid.forEach(row => {
            const cell = document.createElement('span');
            cell.className = 'slot-cell';
            cell.appendChild(createSymbol(row[reel]));
            strip.appendChild(cell);
        });
    });
}

function appendCells(strip, symbols) {
    symbols.forEach(symbol => {
        const cell = document.createElement('span');
        cell.className = 'slot-cell';
        cell.appendChild(createSymbol(symbol));
        strip.appendChild(cell);
    });
}

/** 結果が届くまでの空回り。先頭の3つを末尾にも置いて、ずれ目なくくり返す */
function startReelsWaiting() {
    reelStrips().forEach(strip => {
        const loop = Array.from({ length: 8 }, randomFiller);
        strip.innerHTML = '';
        strip.style.transition = 'none';
        strip.style.setProperty('--shift', '0');
        appendCells(strip, [...loop, ...loop.slice(0, 3)]);
        strip.parentElement.classList.remove('is-landed', 'is-reach');
        strip.parentElement.classList.add('is-waiting');
    });
}

/** 左と真ん中のリールで、高い絵柄が1本のラインに2つ揃っているか */
function isReach(grid) {
    const minPay = isSlotJackpot() ? SLOT_REACH_MIN_PAY_JACKPOT : SLOT_REACH_MIN_PAY;
    return SLOT_LINES.some(rows => {
        const left = grid[rows[0]][0];
        const middle = grid[rows[1]][1];
        return (SLOT_PAYS[left] || 0) >= minPay && (middle === left || middle === 'wild');
    });
}

/**
 * 届いた並びに向かってリールを回して止める。上から [結果3つ, 流す絵柄…, いまの3つ] と並べ、
 * いまの3つが見えている位置から先頭へ向かって (絵柄が下へ流れるように) 動かす。
 */
async function landReels(grid) {
    const reach = isReach(grid);
    // ジャックポットタイム中は、リールが1本止まるたびに画面全体を光らせる (アプリでは震わせる)
    const jackpot = isSlotJackpot();
    const strips = reelStrips();
    const durations = SLOT_STOP_MS.map((ms, reel) => (reach && reel === 2 ? ms + SLOT_REACH_MS : ms));
    strips.forEach((strip, reel) => {
        const count = Math.round(durations[reel] / 55);
        const current = Array.from(strip.children).slice(0, 3).map(cell => cell.firstChild.dataset.symbol);
        strip.innerHTML = '';
        appendCells(strip, [...grid.map(row => row[reel]), ...Array.from({ length: count }, randomFiller), ...current]);
        strip.parentElement.classList.remove('is-waiting');
        strip.style.transition = 'none';
        strip.style.setProperty('--shift', String(count + 3));
    });
    // 置き直した位置を一度描かせてから動かす
    void strips[0].offsetHeight;

    const stops = strips.map((strip, reel) => new Promise(resolve => {
        strip.style.transition = `transform ${durations[reel]}ms cubic-bezier(0.2, 0.62, 0.28, 1)`;
        strip.style.setProperty('--shift', '0');
        setTimeout(() => {
            // 止まった3つだけを残す (演出用に積んだ絵柄を捨てる)
            strip.style.transition = 'none';
            while (strip.children.length > 3) strip.lastChild.remove();
            strip.parentElement.classList.remove('is-reach');
            strip.parentElement.classList.add('is-landed');
            if (jackpot) {
                flashScreen('gold');
                buzz(40);
            }
            resolve();
        }, durations[reel]);
    }));
    if (reach) {
        // 真ん中が止まったところで右のリールを光らせる
        setTimeout(() => {
            strips[2].parentElement.classList.add('is-reach');
            setSlotResult('リーチ！', 'is-reach');
        }, durations[1]);
    }
    await Promise.all(stops);
    slot.grid = grid;
}

// ------------------------------------------------------------------
// 当たりの表示
// ------------------------------------------------------------------
function clearWinLines() {
    el('slot-lines').innerHTML = '';
    document.querySelectorAll('#slot-window .slot-cell.is-win').forEach(cell => cell.classList.remove('is-win'));
    el('slot-window').classList.remove('has-win', 'is-big');
}

function drawWinLines(lines) {
    const svg = el('slot-lines');
    const ns = 'http://www.w3.org/2000/svg';
    const strips = reelStrips();
    lines.forEach(({ line }) => {
        const rows = SLOT_LINES[line];
        const path = document.createElementNS(ns, 'polyline');
        path.setAttribute('points', rows.map((row, reel) => `${reel * 100 + 50},${row * 100 + 50}`).join(' '));
        path.setAttribute('class', 'slot-line');
        svg.appendChild(path);
        rows.forEach((row, reel) => strips[reel].children[row]?.classList.add('is-win'));
    });
    el('slot-window').classList.toggle('has-win', lines.length > 0);
}

function setSlotResult(text, tone = '') {
    const result = el('slot-result');
    result.className = `slot-result ${tone}`.trim();
    result.textContent = text;
}

/** 払い戻しを数え上げて見せる */
async function countUpWin(returned, tone) {
    if (prefersReducedMotion() || returned <= 10) {
        setSlotResult(`WIN ${returned.toLocaleString('ja-JP')}`, tone);
        return;
    }
    const steps = Math.min(24, returned);
    for (let i = 1; i <= steps; i++) {
        setSlotResult(`WIN ${Math.round((returned * i) / steps).toLocaleString('ja-JP')}`, tone);
        await delay(40);
    }
}

function renderSlotRecent() {
    const list = el('slot-recent');
    list.innerHTML = '';
    (casino.session?.slot?.recent || []).forEach(item => {
        const li = document.createElement('li');
        const net = item.returned - item.bet;
        const big = item.multiplier >= SLOT_BIG_WIN;
        li.className = `bj-pip ${big ? 'is-blackjack' : net > 0 ? 'is-plus' : net < 0 ? 'is-minus' : 'is-even'}`;
        li.textContent = formatSigned(net);
        li.title = item.symbol
            ? `${SLOT_SYMBOLS[item.symbol].name}ほか ×${item.multiplier} / 賭け ${item.bet} → 払戻 ${item.returned}`
            : `はずれ / 賭け ${item.bet}`;
        list.appendChild(li);
    });
}

// ------------------------------------------------------------------
// 賭け金とスピン
// ------------------------------------------------------------------
function slotChips() {
    return casino.session ? casino.session.chips : 0;
}

/** 手元が賭け金に足りなければ、足りる中でいちばん大きい段に下げる */
function fitSlotBet() {
    const chips = slotChips();
    if (slot.bet <= chips) return;
    const fits = SLOT_BETS.filter(bet => bet <= chips);
    slot.bet = fits.length ? fits[fits.length - 1] : Math.max(1, chips);
}

function stepSlotBet(direction) {
    const index = SLOT_BETS.indexOf(slot.bet);
    const next = index < 0
        ? (direction > 0 ? SLOT_BETS.find(bet => bet > slot.bet) : [...SLOT_BETS].reverse().find(bet => bet < slot.bet))
        : SLOT_BETS[index + direction];
    if (!next || next > slotChips()) return;
    slot.bet = next;
    try { localStorage.setItem(SLOT_BET_STORAGE_KEY, String(slot.bet)); } catch (error) { /* 無視 */ }
    renderSlotControls();
}

function renderSlotControls() {
    if (!el('slot-spin-button')) return;
    const chips = slotChips();
    const locked = casino.busy || !casino.session;
    // ジャックポットタイム中は賭け金が固定なので変えられない
    const jackpot = isSlotJackpot();
    el('slot-bet').textContent = slotSpinBet().toLocaleString('ja-JP');
    el('slot-bet-down').disabled = locked || jackpot || slot.bet <= SLOT_BETS[0];
    el('slot-bet-up').disabled = locked || jackpot || !SLOT_BETS.some(bet => bet > slot.bet && bet <= chips);
    // オート中のボタンは、まわっている最中でも押せる「止める」にする
    el('slot-spin-button').disabled = slot.auto ? false : locked || (!jackpot && slot.bet > chips);
    el('slot-spin-button').textContent = slot.auto ? 'オートを止める' : 'スピン';
    el('slot-spin-button').classList.toggle('is-auto', slot.auto);
    el('slot-auto').checked = slot.auto;
    el('slot-auto').disabled = !casino.session;
}

function stopSlotAuto() {
    slot.auto = false;
    clearTimeout(slot.autoTimer);
    slot.autoTimer = null;
    renderSlotControls();
}

function queueSlotAuto(wait) {
    clearTimeout(slot.autoTimer);
    if (!slot.auto || !slot.open) return;
    slot.autoTimer = setTimeout(() => {
        slot.autoTimer = null;
        if (!slot.auto || !slot.open) return;
        if (!isSlotJackpot() && slot.bet > slotChips()) {
            stopSlotAuto();
            showMessage(el('slot-message'), '手元のチップが賭け金に足りないので、オートを止めました。', 'info');
            return;
        }
        spinSlot();
    }, wait);
}

async function spinSlot() {
    if (casino.busy || !casino.session) return;
    const bet = slotSpinBet();
    if (!isSlotJackpot() && bet > slotChips()) return;

    setCasinoBusy(true);
    el('slot-spin-button').setAttribute('aria-busy', 'true');
    clearWinLines();
    setSlotResult('');
    el('slot-result-detail').textContent = '';
    const motion = !prefersReducedMotion();
    if (motion) startReelsWaiting();
    let wait = SLOT_AUTO_GAP_MS;
    try {
        const data = await callCasino('slotSpin', { bet });
        if (data.expired) {
            stopSlotAuto();
            renderGrid(slot.grid || randomGrid());
            await refreshCasino();
            showMessage(el('casino-message'), settledMessage(data.settled), 'info');
            return;
        }

        const { grid, lines, multiplier, returned, entered, finished, mode } = data.result;
        const jackpotSpin = mode === 'jackpot';
        // 突入が決まった回は、止める前に暗転させる (筐体がジャックポットタイムに変わるのはカットインのとき)
        if (entered && motion) await freezeSlot();
        if (motion) await landReels(grid);
        else renderGrid(grid);
        drawWinLines(lines);
        if (jackpotSpin) slot.jackpotWon += returned;
        if (data.slot && !entered) receiveSlotState(data.slot);

        const big = multiplier >= SLOT_BIG_WIN;
        if (returned > 0) {
            el('slot-window').classList.toggle('is-big', big);
            if (big) {
                window.qjongTreasureRain?.preview(4500);
                wait = 3800;
            } else {
                wait = 1500;
            }
            if (jackpotSpin && motion) celebrateJackpotWin(multiplier);
            await countUpWin(returned, big ? 'is-big' : 'is-win');
            el('slot-result-detail').textContent = lines
                .map(item => `${SLOT_LINE_NAMES[item.line]} ${SLOT_SYMBOLS[item.symbol].name} ×${item.multiplier}`).join('・');
        } else {
            setSlotResult('はずれ', 'is-miss');
            el('slot-result-detail').textContent = '';
        }
        if (entered) {
            // ジャックポットタイム突入。次の回から、真ん中のリールにドクロ旗が増える
            showMessage(el('slot-message'), `🏴‍☠️ ジャックポットタイム突入！ ${entered.spins}回`, 'success');
            slot.jackpotWon = 0;
            const cutin = showJackpotCutin(entered.spins);
            if (data.slot) receiveSlotState(data.slot);
            await cutin;
            wait = SLOT_AUTO_GAP_MS;
        } else if (finished) {
            showMessage(el('slot-message'), 'ジャックポットタイムが終わりました。', 'info');
            const won = slot.jackpotWon;
            slot.jackpotWon = 0;
            await showJackpotResult(won);
            wait = SLOT_AUTO_GAP_MS;
        }

        if (data.settled) {
            // チップが尽きてサーバー側で精算済み
            stopSlotAuto();
            casino.session = null;
            showMessage(el('slot-message'), `チップがなくなりました。${settledMessage(data.settled)}`, 'info');
            await delay(2500);
            await refreshCasino();
            showMessage(el('casino-message'), settledMessage(data.settled), 'info');
            return;
        }
        casino.session = data.session;
        fitSlotBet();
        renderSlotRecent();
        renderWallet();
    } catch (error) {
        stopSlotAuto();
        renderGrid(slot.grid || randomGrid());
        setSlotResult('');
        el('slot-result-detail').textContent = '';
        showMessage(el('slot-message'), error.message, 'error');
        await refreshCasino().catch(() => {});
    } finally {
        el('slot-spin-button').removeAttribute('aria-busy');
        setCasinoBusy(false);
        queueSlotAuto(wait);
    }
}

// ------------------------------------------------------------------
// 画面の出入りと組み立て
// ------------------------------------------------------------------
function openSlotTable() {
    slot.open = true;
    if (!slot.grid) {
        renderGrid(randomGrid());
        setSlotResult('Good Luck', 'is-idle');
    }
    fitSlotBet();
    renderSlotRecent();
    renderSlotMode();
    renderSlotControls();
}

function closeSlotTable() {
    slot.open = false;
    if (slot.auto) stopSlotAuto();
    toggleSlotAura(false);
}

function buildSlotPaytable() {
    const list = el('slot-paytable');
    Object.entries(SLOT_PAYS).forEach(([symbol, pay]) => {
        const li = document.createElement('li');
        const icons = document.createElement('span');
        icons.className = 'slot-pay-icons';
        for (let i = 0; i < 3; i++) icons.appendChild(createSymbol(symbol));
        const name = document.createElement('span');
        name.className = 'slot-pay-name';
        name.textContent = SLOT_SYMBOLS[symbol].name;
        const value = document.createElement('strong');
        value.textContent = `×${pay}`;
        li.append(icons, name, value);
        list.appendChild(li);
    });
    const wild = document.createElement('li');
    wild.className = 'is-wild';
    const icon = document.createElement('span');
    icon.className = 'slot-pay-icons';
    icon.appendChild(createSymbol('wild'));
    const text = document.createElement('span');
    text.className = 'slot-pay-name';
    text.textContent = 'ドクロ旗はジャックポットタイムだけ真ん中のリールに出て、どの絵柄の代わりにもなる';
    wild.append(icon, text);
    list.appendChild(wild);

    // 5本のラインの形
    const ns = 'http://www.w3.org/2000/svg';
    const shapes = el('slot-line-shapes');
    SLOT_LINES.forEach((rows, line) => {
        const figure = document.createElement('li');
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 30 30');
        svg.setAttribute('aria-hidden', 'true');
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const dot = document.createElementNS(ns, 'rect');
                dot.setAttribute('x', String(c * 10 + 1.5));
                dot.setAttribute('y', String(r * 10 + 1.5));
                dot.setAttribute('width', '7');
                dot.setAttribute('height', '7');
                dot.setAttribute('rx', '1.5');
                dot.setAttribute('class', rows[c] === r ? 'is-on' : '');
                svg.appendChild(dot);
            }
        }
        const label = document.createElement('span');
        label.textContent = SLOT_LINE_NAMES[line];
        figure.append(svg, label);
        shapes.appendChild(figure);
    });
}

/** ゲーム一覧のタイルに3つの絵柄を並べる */
function buildSlotTileArt() {
    document.querySelectorAll('.game-tile-art.is-slot .mini-reel').forEach(reel => {
        reel.appendChild(createSymbol(reel.dataset.symbol));
    });
}

function initSlot() {
    try {
        const saved = Number(localStorage.getItem(SLOT_BET_STORAGE_KEY));
        if (SLOT_BETS.includes(saved)) slot.bet = saved;
    } catch (error) {
        // 保存できない環境では既定値のまま
    }
    buildSlotPaytable();
    buildSlotTileArt();
    loadSlotImages();
    el('slot-bet-down').addEventListener('click', () => stepSlotBet(-1));
    el('slot-bet-up').addEventListener('click', () => stepSlotBet(1));
    el('slot-spin-button').addEventListener('click', () => {
        if (slot.auto) {
            stopSlotAuto();
            return;
        }
        spinSlot();
    });
    el('slot-auto').addEventListener('change', event => {
        slot.auto = event.target.checked;
        renderSlotControls();
        if (slot.auto && !casino.busy) spinSlot();
        if (!slot.auto) stopSlotAuto();
    });
}
