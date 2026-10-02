// ゲームタブ: 航海 (大海賊の航海日誌)。2026/10/5〜12/21 の期間限定のエンドレス双六。
//   30マスの海をぐるぐる回る。賭け金を決めて「振る」と、サイコロの目だけコマが進み、止まったマスで払い戻しが決まる。
//   1回ぶん (出目・動き・止まるマス・払い戻し・JP・スタンプ) は Cloud Function (casino の vgRoll) が最初にすべて決め、
//   画面はそれを順に見せる (サイコロ → コマの移動 → マスの効果)。途中で閉じても払い戻しは入っている。
//   章 (毎週月曜に進む) と盤面はサーバーから受け取る (voyage.chapter / voyage.chapters)。章ごとの物語 (アニメ) は voyage-story.js。
//   ジャックポットと最終秘宝は voyage_public/main を読んで出す (20秒ごとに読み直す)。
//   閃光・金貨・画面いっぱいの演出は game-slot.js のものを使う。入場・手元チップ・精算は game.js。
//   ゲーム一覧のカードは Ver54.1 で出すまで Coming soon のままで、#voyage で直接開ける。

const VG_BETS = [1, 2, 5, 10, 20, 50, 100, 500, 1000, 5000];   // サーバーの VOYAGE_BETS と同じ
const VG_SQUARES = 30;
const VG_BET_STORAGE_KEY = 'voyageBet';
const VG_SEEN_STORAGE_KEY = 'voyageSeenChapters';   // 物語を見せた章 (この端末)
const VG_HOP_MS = 230;            // コマが1マス動く時間
const VG_DICE_MS = 1100;          // サイコロを振っている時間
const VG_AUTO_GAP_MS = 900;       // オート: 結果が出てから次を振るまで
const VG_AUTO_WIN_GAP_MS = 1800;
const VG_POLL_MS = 20000;         // JP・最終秘宝を読み直す間隔
const VG_BIG_MULTIPLIER = 8;      // この倍率以上は大きく祝う
const VG_FACES = ['smile', 'laugh', 'surprise', 'angry', 'sad'];

// マスの見た目。label は章で上書きできる (VG_FLAVOR)
const VG_SQUARE_LOOK = {
    port: { label: '港', sub: '×2', icon: '⚓' },
    sea: { label: '', sub: '', icon: '' },
    x: { label: '', sub: '', icon: '🪙' },
    q: { label: '×?', sub: '', icon: '🗺' },
    again: { label: 'もう1回', sub: '', icon: '🦜' },
    fwd: { label: '追い風', sub: '', icon: '💨' },
    back: { label: '嵐', sub: '', icon: '🌪' },
    captain: { label: '船長', sub: 'JP', icon: '🏴‍☠️' },
    gamble: { label: '呪いの金貨', sub: '', icon: '💀' },
    duel: { label: '一騎打ち', sub: '', icon: '⚔' }
};
// 章ごとのマスの呼び方 (その週の物語に合わせる)
const VG_FLAVOR = {
    1: { x: '酒場' },
    2: { x: '霧の商い' },
    3: { x6: '拿捕', x: '商船' },
    4: { gamble: '呪いの金貨', x: '幽霊の金貨' },
    5: { q: '掘る', x: '漂着物' },
    6: { back: '砲撃', fwd: '逃げ切り', x: '戦利品' },
    7: { again: '人魚の歌', x: '真珠' },
    8: { x: '流氷の金貨', back: '流氷' },
    9: { duel: '一騎打ち', x: '戦利品' },
    10: { x: '帰り荷', back: '逆風' },
    11: { captain: '船長', x: '港の酒場' },
    12: { captain: '船長', x: '秘宝のかけら' }
};

const vg = {
    bet: 10,
    open: false,
    playing: false,       // 1回ぶんを見せている途中
    storyOpen: false,     // 物語を見せている途中
    auto: false,
    autoTimer: null,
    info: null,           // サーバーから受け取った航海の様子 (期間・章・共有の分・自分の分)
    chapter: null,        // いま出している章 (盤面を含む)
    cells: [],            // 30マスの要素
    layout: null,         // { cols, rows }
    pos: 0,               // コマの位置 (見せている途中は動く)
    adminChapter: '',     // 管理者が指定した章 ('' は日付どおり)
    pollTimer: null,
    polling: false
};

function vgChips() {
    return casino.session ? casino.session.chips : 0;
}

function vgIsMaster() {
    try {
        return typeof MASTER_USERNAME !== 'undefined' && localStorage.getItem('authUsername') === MASTER_USERNAME;
    } catch (error) {
        return false;
    }
}

function vgFormat(value) {
    return Math.round(Number(value) || 0).toLocaleString('ja-JP');
}

/** マスの文字列を読む (サーバーの parseVoyageSquare と同じ) */
function vgParseSquare(square) {
    const text = String(square || 'sea');
    let match;
    if (['port', 'sea', 'again', 'captain', 'duel'].includes(text)) return { type: text };
    if ((match = /^x(\d+)$/.exec(text))) return { type: 'x', value: Number(match[1]) };
    if ((match = /^q(\d+)-(\d+)$/.exec(text))) return { type: 'q', min: Number(match[1]), max: Number(match[2]) };
    if ((match = /^fwd(\d+)$/.exec(text))) return { type: 'fwd', value: Number(match[1]) };
    if ((match = /^back(\d+)$/.exec(text))) return { type: 'back', value: Number(match[1]) };
    if ((match = /^gamble(\d+)-(\d+)$/.exec(text))) return { type: 'gamble', value: Number(match[1]), back: Number(match[2]) };
    return { type: 'sea' };
}

/** マスの表示 { label, sub, icon } */
function vgSquareLook(square, chapterNo) {
    const parsed = vgParseSquare(square);
    const look = { ...VG_SQUARE_LOOK[parsed.type] };
    const flavor = VG_FLAVOR[chapterNo] || {};
    if (flavor[square]) look.label = flavor[square];
    else if (flavor[parsed.type]) look.label = flavor[parsed.type];
    if (parsed.type === 'x') look.sub = `×${parsed.value}`;
    if (parsed.type === 'q') look.sub = `${parsed.min}〜${parsed.max}`;
    if (parsed.type === 'fwd') look.sub = `+${parsed.value}`;
    if (parsed.type === 'back') look.sub = `−${parsed.value}`;
    if (parsed.type === 'gamble') look.sub = `×${parsed.value} / −${parsed.back}`;
    if (parsed.type === 'duel') look.sub = '×3 / −2';
    if (parsed.type === 'captain' && vg.chapter) look.sub = `1/${vg.chapter.jpOdds}`;
    return { ...look, type: parsed.type };
}

// ------------------------------------------------------------------
// 盤 (30マスを長方形の外周に並べる。港が左下で、左の列を上へ → 上の行を右へ → 右の列を下へ → 下の行を左へ)
// ------------------------------------------------------------------
function vgLayoutFor(width) {
    // スマホは縦長 (7列×10行)、広ければ横長 (10列×7行)。どちらも外周は 30 マス
    return width < 560 ? { cols: 7, rows: 10 } : { cols: 10, rows: 7 };
}

/** マス i の (列, 行) */
function vgCellPosition(index, { cols, rows }) {
    let i = index;
    if (i < rows) return { col: 0, row: rows - 1 - i };
    i -= rows;
    if (i < cols - 1) return { col: 1 + i, row: 0 };
    i -= cols - 1;
    if (i < rows - 1) return { col: cols - 1, row: 1 + i };
    i -= rows - 1;
    return { col: cols - 2 - i, row: rows - 1 };
}

/** 盤を描く。章の盤面に合わせてマスの中身を入れ、コマをいまの位置へ */
function renderVoyageBoard() {
    const board = el('vg-board');
    const wrap = el('vg-board-wrap');
    if (!board || !vg.chapter) return;
    const layout = vgLayoutFor(wrap.clientWidth || window.innerWidth);
    const changed = !vg.layout || vg.layout.cols !== layout.cols;
    vg.layout = layout;
    board.style.setProperty('--vg-cols', layout.cols);
    board.style.setProperty('--vg-rows', layout.rows);
    board.classList.toggle('is-portrait', layout.rows > layout.cols);
    board.classList.toggle('is-reverse', Boolean(vg.chapter.reverse));
    board.dataset.chapter = String(vg.chapter.no);
    if (changed || vg.cells.length !== VG_SQUARES) {
        vg.cells.forEach(cell => cell.remove());
        vg.cells = [];
        for (let i = 0; i < VG_SQUARES; i++) {
            const cell = document.createElement('div');
            cell.className = 'vg-cell';
            cell.dataset.index = String(i);
            cell.append(modeText('span', 'vg-cell-icon', ''), modeText('span', 'vg-cell-label', ''), modeText('span', 'vg-cell-sub', ''));
            board.appendChild(cell);
            vg.cells.push(cell);
        }
    }
    const center = el('vg-center');
    center.style.gridRow = `2 / ${layout.rows}`;
    center.style.gridColumn = `2 / ${layout.cols}`;
    vg.chapter.board.forEach((square, i) => {
        const cell = vg.cells[i];
        const look = vgSquareLook(square, vg.chapter.no);
        const at = vgCellPosition(i, layout);
        cell.style.gridRow = String(at.row + 1);
        cell.style.gridColumn = String(at.col + 1);
        cell.className = `vg-cell is-${look.type}`;
        cell.querySelector('.vg-cell-icon').textContent = look.icon;
        cell.querySelector('.vg-cell-label').textContent = look.label;
        cell.querySelector('.vg-cell-sub').textContent = look.sub;
        cell.title = look.label ? `${look.label} ${look.sub}`.trim() : '海';
    });
    placeVoyageShip(vg.pos, false);
}

/** コマをマス index の上へ。animate が真なら滑らかに動く */
function placeVoyageShip(index, animate = true) {
    const ship = el('vg-ship');
    const cell = vg.cells[index];
    if (!ship || !cell) return;
    ship.classList.toggle('is-still', !animate);
    const x = cell.offsetLeft + cell.offsetWidth / 2;
    const y = cell.offsetTop + cell.offsetHeight / 2;
    ship.style.transform = `translate(${x}px, ${y}px)`;
    vg.cells.forEach(other => other.classList.toggle('is-here', other === cell));
}

/** path のマスを順に進む。港 (0) を通ったら祝う */
async function moveVoyageShipAlong(path, { back = false } = {}) {
    const ship = el('vg-ship');
    ship.classList.toggle('is-back', back);
    for (const index of path) {
        vg.pos = index;
        placeVoyageShip(index, !prefersReducedMotion());
        restartClass(ship, 'is-hop');
        if (index === 0 && !back) celebrateVoyageLap();
        await delay(prefersReducedMotion() ? 30 : VG_HOP_MS);
    }
    ship.classList.remove('is-back');
}

function celebrateVoyageLap() {
    const port = vg.cells[0];
    restartClass(port, 'is-lap');
    flashScreen('gold');
    buzz([60, 40, 60]);
    showVoyageToast('⚓ 1周！ 港を通過', 'is-gold');
    burstCoins(16, port);
}

// ------------------------------------------------------------------
// サイコロ・吹き出し・トースト
// ------------------------------------------------------------------
function renderVoyageDicePips(face, value) {
    face.dataset.pips = String(value);
    face.innerHTML = '';
    if (!value) {
        face.textContent = '?';
        return;
    }
    const map = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
    for (let i = 1; i <= 9; i++) {
        const pip = document.createElement('i');
        if ((map[value] || []).includes(i)) pip.className = 'on';
        face.appendChild(pip);
    }
}

/** サイコロを振って value で止める。霧の章は止まるまで ? のまま、動いたあとに見せる */
async function rollVoyageDice(value, { fog = false, max = 6 } = {}) {
    const dice = el('vg-dice');
    const face = el('vg-dice-face');
    dice.classList.add('is-rolling');
    dice.classList.toggle('is-fog', fog);
    if (prefersReducedMotion()) {
        dice.classList.remove('is-rolling');
        renderVoyageDicePips(face, fog ? 0 : value);
        return;
    }
    const until = performance.now() + VG_DICE_MS;
    let wait = 70;
    while (performance.now() < until) {
        renderVoyageDicePips(face, fog ? 0 : 1 + Math.floor(Math.random() * max));
        await delay(wait);
        wait = Math.min(220, wait * 1.15);
    }
    dice.classList.remove('is-rolling');
    renderVoyageDicePips(face, fog ? 0 : value);
    restartClass(dice, 'is-landed');
    buzz(40);
}

function revealVoyageDice(value) {
    const dice = el('vg-dice');
    dice.classList.remove('is-fog');
    renderVoyageDicePips(el('vg-dice-face'), value);
    restartClass(dice, 'is-landed');
}

function setVoyageFace(name) {
    const face = el('vg-face');
    if (!face) return;
    const safe = VG_FACES.includes(name) ? name : 'smile';
    if (!face.src.endsWith(`face-${safe}.png`)) face.src = `assets/img/voyage/face-${safe}.png`;
    restartClass(face, 'is-pop');
}

/** 真ん中の吹き出し (船長のひとこと) */
async function showVoyageBubble(text, face = 'smile', ms = 900) {
    const bubble = el('vg-bubble');
    if (!bubble) return;
    bubble.textContent = text;
    bubble.classList.remove('hidden');
    restartClass(bubble, 'is-in');
    setVoyageFace(face);
    await delay(prefersReducedMotion() ? Math.min(ms, 400) : ms);
}

function hideVoyageBubble() {
    el('vg-bubble')?.classList.add('hidden');
}

function showVoyageToast(text, tone = '') {
    const wrap = el('vg-board-wrap');
    if (!wrap) return;
    const toast = modeText('p', `vg-toast ${tone}`.trim(), text);
    wrap.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
}

function setVoyageStatus(text) {
    const status = el('vg-status');
    if (status) status.textContent = text;
}

function setVoyageResult(text, tone = '') {
    const result = el('vg-result');
    if (!result) return;
    result.className = `slot-result ${tone}`.trim();
    result.textContent = text;
}

// ------------------------------------------------------------------
// マスの効果の見せ方
// ------------------------------------------------------------------
/** ×? の数字を回してから見せる */
async function revealVoyageQ(min, max, value) {
    const status = el('vg-status');
    if (!prefersReducedMotion()) {
        let wait = 40;
        while (wait < 260) {
            status.textContent = `×${min + Math.floor(Math.random() * (max - min + 1))}`;
            await delay(wait);
            wait *= 1.12;
        }
    }
    status.textContent = `×${value}`;
}

/** 呪いの金貨: 真ん中で金貨を回す */
async function flipVoyageCoin(hit) {
    const center = el('vg-center');
    const coin = document.createElement('img');
    coin.className = 'vg-flip-coin';
    coin.src = 'assets/img/voyage/coin.png';
    coin.alt = '';
    center.appendChild(coin);
    await delay(prefersReducedMotion() ? 200 : 1300);
    coin.classList.add(hit ? 'is-hit' : 'is-miss');
    await delay(prefersReducedMotion() ? 100 : 500);
    coin.remove();
}

/** 一騎打ち: 剣を交える */
async function clashVoyageSwords(hit) {
    const center = el('vg-center');
    const swords = modeText('div', 'vg-clash', '⚔');
    center.appendChild(swords);
    buzz([40, 30, 40, 30, 80]);
    await delay(prefersReducedMotion() ? 200 : 1100);
    flashScreen(hit ? 'gold' : 'red');
    swords.classList.add(hit ? 'is-hit' : 'is-miss');
    await delay(prefersReducedMotion() ? 100 : 500);
    swords.remove();
}

/** 船長チャンス: カットイン → 抽選 → 結果 */
async function drawVoyageCaptain(effect, play) {
    window.playGameSound?.('gpCaptain');
    flashScreen('white');
    buzz([120, 60, 120, 60, 400]);
    await showSlotOverlay('is-start vg-overlay-captain', body => {
        const face = document.createElement('img');
        face.className = 'vg-overlay-face';
        face.src = 'assets/img/voyage/face-surprise.png';
        face.alt = '';
        body.append(
            face,
            modeText('p', 'slot-overlay-title', 'Captain'),
            modeText('p', 'slot-overlay-title is-second', 'Chance'),
            modeText('p', 'slot-overlay-sub', `船長チャンス!!  1/${effect.odds} でジャックポット総取り`)
        );
    });
    // 抽選: 真ん中で数字を回す
    setVoyageStatus('抽選中…');
    const stop = prefersReducedMotion() ? () => {} : (window.startGameSoundLoop?.('nrJpSpin') || (() => {}));
    const status = el('vg-status');
    const until = performance.now() + (prefersReducedMotion() ? 300 : 2600);
    let wait = 60;
    while (performance.now() < until) {
        status.textContent = `${1 + Math.floor(Math.random() * effect.odds)} / ${effect.odds}`;
        await delay(wait);
        wait = Math.min(240, wait * 1.08);
    }
    stop();
    if (effect.hit) {
        status.textContent = 'JACKPOT!!';
        window.playGameSound?.('gpJackpotWin');
        window.qjongTreasureRain?.preview(7000);
        strobeScreen(['white', 'gold', 'red', 'white', 'gold']);
        buzz([200, 80, 200, 80, 200, 80, 600]);
        restartClass(el('vg-cabinet'), 'is-shake');
        burstCoins(60, el('vg-center'));
        setVoyageFace('laugh');
        const total = modeText('p', 'slot-overlay-total', '総取り ');
        total.appendChild(modeText('strong', 'slot-overlay-won', vgFormat(effect.payout)));
        await showSlotOverlay('is-result vg-overlay-jp', body => {
            body.append(
                modeText('p', 'slot-overlay-sub', '船長チャンス 的中!!'),
                modeText('p', 'slot-overlay-title', 'Jackpot'),
                total
            );
        });
        return;
    }
    status.textContent = 'Miss…';
    window.playGameSound?.('gpJackpotMiss');
    setVoyageFace('sad');
    await showSlotOverlay('is-miss', body => {
        body.append(
            modeText('p', 'slot-overlay-title', 'Miss'),
            modeText('p', 'slot-overlay-sub', 'ジャックポットならず…'),
            modeText('p', 'slot-overlay-count', `JACKPOT ${vgFormat(vg.info?.state?.jp || 0)} は持ち越し`)
        );
    });
}

/** 止まったマスの効果を見せる。払い戻しがあれば win に足す */
async function presentVoyageEffect(move, play, tally) {
    const effect = move.effect || { type: 'sea' };
    const cell = vg.cells[move.to];
    const look = vgSquareLook(move.square, play.chapter);
    if (cell) restartClass(cell, 'is-hit');
    switch (effect.type) {
        case 'sea':
            setVoyageFace('smile');
            setVoyageStatus('…何もない海');
            await delay(500);
            break;
        case 'port':
        case 'x': {
            const big = effect.value >= VG_BIG_MULTIPLIER;
            setVoyageStatus(`${look.label || '港'} ×${effect.value}`);
            tally.win += effect.payout;
            tally.mult += effect.value;
            burstCoins(Math.min(50, 8 + effect.value * 4), cell);
            if (big) {
                strobeScreen(['white', 'gold', 'white']);
                buzz([200, 80, 200, 80, 500]);
                window.qjongTreasureRain?.preview(4000);
            } else {
                flashScreen('gold');
                buzz([80, 50, 140]);
            }
            await showVoyageBubble(effect.value >= 3 ? 'いい風だ！' : 'よし、稼いだ', effect.value >= 3 ? 'laugh' : 'smile', 700);
            break;
        }
        case 'q':
            setVoyageFace('surprise');
            await showVoyageBubble(`${look.label || '×?'}… いくらだ？`, 'surprise', 500);
            await revealVoyageQ(effect.min, effect.max, effect.value);
            tally.win += effect.payout;
            tally.mult += effect.value;
            burstCoins(Math.min(60, 8 + effect.value * 3), cell);
            if (effect.value >= VG_BIG_MULTIPLIER) {
                strobeScreen(['white', 'gold', 'white']);
                buzz([200, 80, 200, 80, 500]);
                window.qjongTreasureRain?.preview(4000);
                setVoyageFace('laugh');
            } else {
                flashScreen('gold');
                buzz([80, 50, 140]);
            }
            await delay(600);
            break;
        case 'again':
            window.playGameSound?.('nrUp');
            flashScreen('gold');
            restartClass(el('vg-ship'), 'is-cheer');
            await showVoyageBubble(play.chapter === 7 ? '歌が聞こえる… もう1回！' : 'ポン「もういっかい！」', 'laugh', 900);
            break;
        case 'fwd':
            flashScreen('white');
            await showVoyageBubble(`${look.label || '追い風'}！ +${effect.value}`, 'laugh', 700);
            break;
        case 'back':
            flashScreen('red');
            restartClass(el('vg-cabinet'), 'is-shake');
            buzz([60, 40, 60, 40, 200]);
            await showVoyageBubble(`${look.label || '嵐'}だ… −${effect.value}`, 'angry', 700);
            await moveVoyageShipAlong(effect.path, { back: true });
            break;
        case 'gamble':
            setVoyageStatus(look.label || '呪いの金貨');
            await showVoyageBubble('呪いの金貨… 表か裏か', 'surprise', 600);
            await flipVoyageCoin(effect.hit);
            if (effect.hit) {
                tally.win += effect.payout;
                tally.mult += effect.value;
                strobeScreen(['white', 'gold', 'white']);
                buzz([200, 80, 200, 80, 500]);
                burstCoins(50, cell);
                window.qjongTreasureRain?.preview(4000);
                await showVoyageBubble(`×${effect.value}！ 呪いが解けた`, 'laugh', 800);
            } else {
                flashScreen('red');
                restartClass(el('vg-cabinet'), 'is-shake');
                await showVoyageBubble(`呪われた… −${effect.back}`, 'sad', 700);
                await moveVoyageShipAlong(effect.path, { back: true });
            }
            break;
        case 'duel':
            setVoyageStatus('一騎打ち');
            await showVoyageBubble('来い！', 'angry', 500);
            await clashVoyageSwords(effect.hit);
            if (effect.hit) {
                tally.win += effect.payout;
                tally.mult += effect.value;
                buzz([120, 60, 300]);
                burstCoins(30, cell);
                await showVoyageBubble('勝った！ ×3', 'laugh', 800);
            } else {
                restartClass(el('vg-cabinet'), 'is-shake');
                await showVoyageBubble('くっ… 退け！ −2', 'angry', 700);
                await moveVoyageShipAlong(effect.path, { back: true });
            }
            break;
        case 'captain':
            await drawVoyageCaptain(effect, play);
            if (effect.hit) {
                tally.win += effect.payout;
                tally.jp = effect.payout;
            }
            break;
        default:
            await delay(300);
    }
}

/** 払い戻しを数え上げて見せる */
async function countVoyageWin(tally, bet) {
    const head = tally.jp ? 'JACKPOT ' : `×${Math.round(tally.mult * 100) / 100}  WIN `;
    const tone = tally.jp || tally.mult >= VG_BIG_MULTIPLIER ? 'is-big' : 'is-win';
    if (prefersReducedMotion() || tally.win <= 10) {
        setVoyageResult(`${head}${vgFormat(tally.win)}`, tone);
        return;
    }
    const steps = Math.min(24, tally.win);
    for (let i = 1; i <= steps; i++) {
        setVoyageResult(`${head}${vgFormat((tally.win * i) / steps)}`, tone);
        await delay(40);
    }
}

/** スタンプが押された */
async function celebrateVoyageStamp(no) {
    renderVoyageLog();
    const stamp = el('vg-stamps')?.querySelector(`[data-no="${no}"]`);
    if (stamp) restartClass(stamp, 'is-new');
    showVoyageToast(`📜 航海日誌に 第${no}章 のスタンプ`, 'is-stamp');
    flashScreen('gold');
    await delay(600);
}

/** play (サーバーが決めた1回ぶん) を順に見せる */
async function presentVoyagePlay(play) {
    const chapter = vg.chapter;
    const tally = { win: 0, mult: 0, jp: 0 };
    hideVoyageBubble();
    for (let index = 0; index < play.moves.length; index++) {
        const move = play.moves[index];
        if (move.dice) {
            setVoyageStatus(index === 0 ? 'サイコロを振る…' : 'もう1回！');
            await rollVoyageDice(move.dice, { fog: Boolean(chapter.fog), max: chapter.dice });
            setVoyageStatus(chapter.fog ? '霧の中を進む…' : `${move.dice} マス進む`);
        } else {
            setVoyageStatus(`${move.path.length} マス進む`);
        }
        hideVoyageBubble();
        await moveVoyageShipAlong(move.path);
        if (move.dice && chapter.fog) revealVoyageDice(move.dice);
        await presentVoyageEffect(move, play, tally);
    }
    hideVoyageBubble();
    if (play.newStamp) await celebrateVoyageStamp(play.newStamp);
    if (tally.win > 0) {
        await countVoyageWin(tally, play.bet);
        el('vg-result-detail').textContent = `賭け ${vgFormat(play.bet)} → 払い戻し ${vgFormat(play.payout)}`;
    } else {
        setVoyageResult('はずれ', 'is-miss');
        el('vg-result-detail').textContent = `賭け ${vgFormat(play.bet)}`;
    }
    setVoyageStatus('賭け金を決めて「振る」');
}

// ------------------------------------------------------------------
// 賭け金と「振る」
// ------------------------------------------------------------------
function fitVoyageBet() {
    const chips = vgChips();
    if (vg.bet <= chips) return;
    const fits = VG_BETS.filter(bet => bet <= chips);
    vg.bet = fits.length ? fits[fits.length - 1] : VG_BETS[0];
}

function stepVoyageBet(direction) {
    const index = VG_BETS.indexOf(vg.bet);
    const next = VG_BETS[index + direction];
    if (!next || next > vgChips()) return;
    vg.bet = next;
    try { localStorage.setItem(VG_BET_STORAGE_KEY, String(vg.bet)); } catch (error) { /* 無視 */ }
    renderVoyageControls();
}

/** いま振れるか (期間の外・山分け済みは振れない。管理者は章を指定していれば振れる) */
function vgCanRoll() {
    const info = vg.info;
    if (!info) return false;
    if (info.state?.final) return false;
    if (vgIsMaster() && vg.adminChapter) return true;
    return info.started && !info.over;
}

function renderVoyageControls() {
    if (!el('vg-roll-button')) return;
    const locked = casino.busy || !casino.session || vg.playing || vg.storyOpen || !vgCanRoll();
    el('vg-bet').textContent = vgFormat(vg.bet);
    el('vg-bet-down').disabled = locked || vg.bet <= VG_BETS[0];
    el('vg-bet-up').disabled = locked || !VG_BETS.some(bet => bet > vg.bet && bet <= vgChips());
    el('vg-roll-button').disabled = vg.auto ? false : locked || vg.bet > vgChips();
    el('vg-roll-button').textContent = vg.auto ? 'オートを止める' : '振る';
    el('vg-roll-button').classList.toggle('is-auto', vg.auto);
    el('vg-auto').checked = vg.auto;
    el('vg-auto').disabled = !casino.session || !vgCanRoll();
}

function stopVoyageAuto() {
    vg.auto = false;
    clearTimeout(vg.autoTimer);
    vg.autoTimer = null;
    renderVoyageControls();
}

function queueVoyageAuto(wait) {
    clearTimeout(vg.autoTimer);
    if (!vg.auto || !vg.open) return;
    vg.autoTimer = setTimeout(() => {
        vg.autoTimer = null;
        if (!vg.auto || !vg.open) return;
        if (vg.bet > vgChips() || !vgCanRoll()) {
            stopVoyageAuto();
            showMessage(el('vg-message'), '手元のチップが賭け金に足りないので、オートを止めました。', 'info');
            return;
        }
        rollVoyage();
    }, wait);
}

async function rollVoyage() {
    if (casino.busy || !casino.session || vg.playing || vg.storyOpen || vg.bet > vgChips() || !vgCanRoll()) return;
    const bet = vg.bet;
    vg.playing = true;
    setCasinoBusy(true);
    el('vg-roll-button').setAttribute('aria-busy', 'true');
    setVoyageResult('');
    el('vg-result-detail').textContent = '';
    vg.cells.forEach(cell => cell.classList.remove('is-hit'));
    // 通信のあいだもサイコロを振っておく
    el('vg-dice').classList.add('is-rolling');
    setVoyageStatus('サイコロを振る…');
    let wait = VG_AUTO_GAP_MS;
    try {
        const payload = { bet };
        if (vgIsMaster() && vg.adminChapter) payload.chapter = Number(vg.adminChapter);
        const data = await callCasino('vgRoll', payload);
        if (data.expired) {
            stopVoyageAuto();
            el('vg-dice').classList.remove('is-rolling');
            await refreshCasino();
            showMessage(el('casino-message'), settledMessage(data.settled), 'info');
            return;
        }
        const play = data.result;
        // 章が変わっていたら (日付が進んだ・管理者が指定した) 盤を描き直してから見せる
        if (!vg.chapter || vg.chapter.no !== play.chapter) {
            vg.chapter = vgChapterByNo(play.chapter, data.voyage) || vg.chapter;
            renderVoyageChapterHead();
            renderVoyageBoard();
        }
        if (vg.pos !== play.moves[0].from) {
            vg.pos = play.moves[0].from;
            placeVoyageShip(vg.pos, false);
        }
        await presentVoyagePlay(play);
        if (play.payout > 0) wait = VG_AUTO_WIN_GAP_MS;
        receiveVoyage(data.voyage, { keepPos: true });
        if (data.settled) {
            stopVoyageAuto();
            casino.session = null;
            showMessage(el('vg-message'), `チップがなくなりました。${settledMessage(data.settled)}`, 'info');
            await delay(2500);
            await refreshCasino();
            showMessage(el('casino-message'), settledMessage(data.settled), 'info');
            return;
        }
        casino.session = data.session;
        fitVoyageBet();
        renderWallet();
        renderVoyageRecent();
    } catch (error) {
        stopVoyageAuto();
        el('vg-dice').classList.remove('is-rolling');
        setVoyageStatus('');
        showMessage(el('vg-message'), error.message, 'error');
        await refreshCasino().catch(() => {});
    } finally {
        el('vg-roll-button').removeAttribute('aria-busy');
        vg.playing = false;
        setCasinoBusy(false);
        queueVoyageAuto(wait);
    }
}

// ------------------------------------------------------------------
// サーバーからの様子
// ------------------------------------------------------------------
function vgChapterByNo(no, info = vg.info) {
    return (info?.chapters || []).find(chapter => chapter.no === Number(no)) || null;
}

/** いま出す章: 管理者の指定 > 日付どおり > (始まる前は) 第1章 */
function vgCurrentChapter() {
    const info = vg.info;
    if (!info) return null;
    if (vgIsMaster() && vg.adminChapter) return vgChapterByNo(vg.adminChapter) || info.chapter;
    return info.chapter || vgChapterByNo(1);
}

/** status や振った結果で受け取った航海の様子を反映する */
function receiveVoyage(voyage, { keepPos = false } = {}) {
    if (!voyage) return;
    vg.info = voyage;
    const chapter = vgCurrentChapter();
    if (chapter && (!vg.chapter || vg.chapter.no !== chapter.no)) vg.chapter = chapter;
    if (!keepPos) vg.pos = voyage.me?.pos || 0;
    if (!vg.open) return;
    renderVoyageChapterHead();
    renderVoyageBoard();
    renderVoyagePools();
    renderVoyageLog();
    renderVoyageRecent();
    renderVoyageControls();
}

/** 'YYYY-MM-DD…' (JST で書かれた日付) → '10/5'。端末の時間帯で日付がずれないよう文字列から読む */
function vgFormatDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!match) return '';
    return `${Number(match[2])}/${Number(match[3])}`;
}

function renderVoyageChapterHead() {
    const chapter = vg.chapter;
    const info = vg.info;
    if (!chapter || !el('vg-chapter-no')) return;
    el('vg-chapter-no').textContent = chapter.no >= 12 ? '最終日' : `第${chapter.no}章`;
    el('vg-chapter-title').textContent = chapter.title;
    const episodeReady = typeof hasVoyageEpisode === 'function' && hasVoyageEpisode(chapter.no);
    el('vg-story-button').classList.toggle('hidden', !episodeReady);
    const notice = el('vg-notice');
    let text = '';
    if (info?.state?.final) text = `航海は終わりました。最終秘宝 ${vgFormat(info.state.final.treasure)} を ${info.state.final.count}人で山分けしました (下の航海日誌)。`;
    else if (info && !info.started) text = `航海は ${vgFormatDate(info.start)} (月) 0:00 に出港します。`;
    else if (info && info.over) text = `航海は ${vgFormatDate(info.end)} で終わりました。最終秘宝は ${vgFormatDate(info.finalAt)} 0:10 に山分けします。`;
    else if (chapter.reverse) text = '第10章: 盤が逆回り。港から時計と反対に進みます。';
    else if (chapter.fog) text = '第2章: 霧で出目が見えません。止まってから分かります。';
    else if (chapter.dice && chapter.dice < 6) text = `第${chapter.no}章: 流氷で出目は 1〜${chapter.dice}。進みは遅いが、港を踏む回数も変わります。`;
    else if (chapter.jpOdds && chapter.jpOdds < 12) text = `第${chapter.no}章: 船長チャンスが 1/${chapter.jpOdds} で当たります。`;
    if (vgIsMaster() && vg.adminChapter) text = `管理者の試し: 第${chapter.no}章の盤面で振ります。${text}`;
    notice.textContent = text;
    notice.classList.toggle('hidden', !text);
    el('vg-cabinet').dataset.chapter = String(chapter.no);
}

function renderVoyagePools() {
    const state = vg.info?.state;
    if (!state || !el('vg-jp')) return;
    const jp = el('vg-jp');
    if (jp.textContent !== vgFormat(state.jp)) restartClass(jp, 'is-bump');
    jp.textContent = vgFormat(state.jp);
    el('vg-treasure').textContent = vgFormat(state.treasure);
}

function renderVoyageLog() {
    const info = vg.info;
    if (!info || !el('vg-stamps')) return;
    const me = info.me || { wagered: 0, laps: 0, stamps: [], multiplier: 1, share: 0 };
    const state = info.state || {};
    el('vg-wagered').textContent = vgFormat(me.wagered);
    el('vg-multiplier').textContent = `×${(me.multiplier || 1).toFixed(1)}`;
    const expect = state.totalShare > 0 ? Math.floor((state.treasure * me.share) / state.totalShare) : 0;
    el('vg-expect').textContent = vgFormat(expect);
    el('vg-laps').textContent = `${vgFormat(me.laps)}周`;
    el('vg-share-note').textContent = state.totalShare > 0
        ? `取り分 ${vgFormat(me.share)} / 全員 ${vgFormat(state.totalShare)} (${((me.share / state.totalShare) * 100).toFixed(1)}%)。最終秘宝はこの比で ${vgFormatDate(info.finalAt)} に山分け`
        : `取り分 = 航海した金額 × 日誌の倍率。最終秘宝はこの比で ${vgFormatDate(info.finalAt)} に山分け`;

    // スタンプ (12章)
    const stamps = el('vg-stamps');
    stamps.innerHTML = '';
    const current = vg.chapter?.no || 0;
    (info.chapters || []).forEach(chapter => {
        const item = document.createElement('li');
        const has = (me.stamps || []).includes(chapter.no);
        item.className = `vg-stamp${has ? ' is-on' : ''}${chapter.no === current ? ' is-current' : ''}`;
        item.dataset.no = String(chapter.no);
        item.title = `${chapter.no >= 12 ? '最終日' : `第${chapter.no}章`} ${chapter.title} (${vgFormatDate(chapter.from)}〜)`;
        item.append(modeText('span', 'vg-stamp-no', chapter.no >= 12 ? '終' : String(chapter.no)), modeText('span', 'vg-stamp-mark', has ? '⚓' : ''));
        stamps.appendChild(item);
    });

    // 物語の一覧
    const episodes = el('vg-episodes');
    episodes.innerHTML = '';
    const unlockedNo = vgIsMaster() ? 99 : (info.chapter?.no || 0);
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(VG_SEEN_STORAGE_KEY) || '[]'); } catch (error) { seen = []; }
    (info.chapters || []).forEach(chapter => {
        const item = document.createElement('li');
        const unlocked = chapter.no <= unlockedNo && typeof hasVoyageEpisode === 'function' && hasVoyageEpisode(chapter.no);
        item.className = `vg-episode${unlocked ? '' : ' is-locked'}${seen.includes(chapter.no) ? ' is-seen' : ''}`;
        const head = modeText('span', 'vg-episode-no', chapter.no >= 12 ? '最終日' : `第${chapter.no}章`);
        const title = modeText('span', 'vg-episode-title', unlocked ? chapter.title : '？？？');
        const date = modeText('span', 'vg-episode-date', `${vgFormatDate(chapter.from)}〜`);
        item.append(head, title, date);
        if (unlocked) {
            const button = modeText('button', 'vg-episode-button', seen.includes(chapter.no) ? 'もう一度見る' : '見る');
            button.type = 'button';
            button.addEventListener('click', () => openVoyageEpisode(chapter.no));
            item.appendChild(button);
        }
        episodes.appendChild(item);
    });

    // 山分けの結果
    const finalBox = el('vg-final');
    finalBox.innerHTML = '';
    if (state.final) {
        finalBox.classList.remove('hidden');
        finalBox.append(modeText('h3', 'icon-title', '最終秘宝の山分け'));
        finalBox.append(modeText('p', 'info-text', `秘宝 ${vgFormat(state.final.treasure)} を ${state.final.count}人で。取り分の合計 ${vgFormat(state.final.total)}`));
        const list = document.createElement('ol');
        list.className = 'vg-final-list';
        (state.final.winners || []).forEach(winner => {
            const row = document.createElement('li');
            row.append(modeText('span', 'vg-final-name', winner.player), modeText('strong', 'vg-final-amount', `+${vgFormat(winner.amount)}`), modeText('span', 'vg-final-share', `航海 ${vgFormat(winner.wagered)} × ${(winner.stamps >= 12 ? 3 : 1 + 0.1 * winner.stamps).toFixed(1)}`));
            if (winner.player === casino.me) row.classList.add('is-me');
            list.appendChild(row);
        });
        finalBox.appendChild(list);
    } else {
        finalBox.classList.add('hidden');
    }

    // JP の記録
    const history = el('vg-jp-history');
    history.innerHTML = '';
    (state.jpHistory || []).forEach(entry => {
        const row = document.createElement('li');
        row.append(modeText('span', '', `${entry.player}  第${entry.chapter}章`), modeText('strong', 'vg-jp-amount', `+${vgFormat(entry.amount)}`));
        history.appendChild(row);
    });
    if (!history.children.length) history.appendChild(modeText('li', 'vg-empty', 'まだ誰も当てていません'));

    // 管理者の欄
    const adminBox = el('vg-admin');
    adminBox.classList.toggle('hidden', !vgIsMaster());
    const select = el('vg-admin-chapter');
    if (vgIsMaster() && select.options.length <= 1) {
        (info.chapters || []).forEach(chapter => {
            const option = document.createElement('option');
            option.value = String(chapter.no);
            option.textContent = `第${chapter.no}章 ${chapter.title}`;
            select.appendChild(option);
        });
        select.value = vg.adminChapter;
    }
}

function renderVoyageRecent() {
    const list = el('vg-recent');
    if (!list) return;
    list.innerHTML = '';
    const recent = casino.session?.voyage?.recent || [];
    recent.forEach(entry => {
        const row = document.createElement('li');
        const look = vgSquareLook(entry.square, vg.chapter?.no || 1);
        row.className = entry.returned > entry.bet ? 'is-win' : entry.returned > 0 ? '' : 'is-lose';
        row.append(
            modeText('span', '', `${formatClock(entry.at)}  🎲${entry.dice ?? '?'}  ${look.label || '海'}`),
            modeText('strong', '', entry.jp ? `JP +${vgFormat(entry.returned)}` : entry.returned > 0 ? `×${entry.multiplier} +${vgFormat(entry.returned)}` : `−${vgFormat(entry.bet)}`)
        );
        list.appendChild(row);
    });
}

/** JP・最終秘宝を読み直す (画面を開いているあいだ 20秒ごと) */
async function pollVoyagePublic() {
    if (vg.polling || document.hidden || !vg.open || !vg.info) return;
    vg.polling = true;
    try {
        const doc = await getFirestoreDb().collection('voyage_public').doc('main').get();
        if (doc.exists) {
            const data = doc.data();
            vg.info.state = {
                ...vg.info.state,
                jp: Math.floor((data.jpCents || 0) / 100),
                treasure: Math.floor((data.treasureCents || 0) / 100),
                totalShare: data.totalShare || 0,
                lastJp: data.lastJp || null,
                jpHistory: data.jpHistory || [],
                final: data.final || null
            };
            if (!vg.playing) {
                renderVoyagePools();
                renderVoyageLog();
                renderVoyageChapterHead();
                renderVoyageControls();
            }
        }
    } catch (error) {
        console.warn('航海の共有の分の読み込みに失敗:', error);
    } finally {
        vg.polling = false;
    }
}

// ------------------------------------------------------------------
// 物語 (voyage-story.js)
// ------------------------------------------------------------------
function vgMarkSeen(no) {
    try {
        const seen = JSON.parse(localStorage.getItem(VG_SEEN_STORAGE_KEY) || '[]');
        if (!seen.includes(no)) seen.push(no);
        localStorage.setItem(VG_SEEN_STORAGE_KEY, JSON.stringify(seen));
    } catch (error) { /* 無視 */ }
}

function vgHasSeen(no) {
    try {
        return JSON.parse(localStorage.getItem(VG_SEEN_STORAGE_KEY) || '[]').includes(no);
    } catch (error) {
        return false;
    }
}

async function openVoyageEpisode(no) {
    if (vg.storyOpen || typeof playVoyageEpisode !== 'function') return;
    if (vg.auto) stopVoyageAuto();
    vg.storyOpen = true;
    renderVoyageControls();
    try {
        await playVoyageEpisode(no);
        vgMarkSeen(no);
    } finally {
        vg.storyOpen = false;
        renderVoyageControls();
        renderVoyageLog();
    }
}

/** この章の物語をまだ見ていなければ見せる (開いたとき) */
function maybeOpenVoyageEpisode() {
    const chapter = vg.chapter;
    const info = vg.info;
    if (!chapter || !info || vg.playing || vg.storyOpen) return;
    const unlocked = vgIsMaster() || (info.started && info.chapter && chapter.no <= info.chapter.no);
    if (!unlocked || vgHasSeen(chapter.no) || typeof hasVoyageEpisode !== 'function' || !hasVoyageEpisode(chapter.no)) return;
    setTimeout(() => { if (vg.open && !vg.playing) openVoyageEpisode(chapter.no); }, 500);
}

// ------------------------------------------------------------------
// 画面の出入りと組み立て
// ------------------------------------------------------------------
function openVoyageTable() {
    vg.open = true;
    if (!vg.info) {
        setVoyageStatus('読み込み中…');
        callCasino('vgStatus').then(data => receiveVoyage(data.voyage)).catch(error => showMessage(el('vg-message'), error.message, 'error'));
    } else {
        receiveVoyage(vg.info, { keepPos: true });
    }
    fitVoyageBet();
    renderVoyageControls();
    // 画面に出た直後はマスの位置が決まっていないので、1コマ描いてからコマを置き直す
    requestAnimationFrame(() => { if (vg.open) renderVoyageBoard(); });
    clearInterval(vg.pollTimer);
    vg.pollTimer = setInterval(pollVoyagePublic, VG_POLL_MS);
    maybeOpenVoyageEpisode();
}

function closeVoyageTable() {
    vg.open = false;
    if (vg.auto) stopVoyageAuto();
    clearInterval(vg.pollTimer);
    vg.pollTimer = null;
}

async function vgAdminAction(action, payload, confirmText) {
    if (!confirm(confirmText)) return;
    setCasinoBusy(true);
    try {
        const data = await callCasino(action, payload);
        showMessage(el('vg-message'), action === 'vgReset' ? `消しました (${data.players}人ぶん)。` : data.final ? `配りました: ${data.final.count}人に ${vgFormat(data.final.paid)}` : '配る分がありませんでした。', 'success');
        vg.pos = 0;
        const status = await callCasino('vgStatus');
        receiveVoyage(status.voyage);
    } catch (error) {
        showMessage(el('vg-message'), error.message, 'error');
    } finally {
        setCasinoBusy(false);
    }
}

function initVoyage() {
    if (!el('vg-board')) return;
    try {
        const saved = Number(localStorage.getItem(VG_BET_STORAGE_KEY));
        if (VG_BETS.includes(saved)) vg.bet = saved;
    } catch (error) {
        // 保存できない環境では既定値のまま
    }
    renderVoyageDicePips(el('vg-dice-face'), 0);
    el('vg-bet-down').addEventListener('click', () => stepVoyageBet(-1));
    el('vg-bet-up').addEventListener('click', () => stepVoyageBet(1));
    el('vg-roll-button').addEventListener('click', () => {
        if (vg.auto) {
            stopVoyageAuto();
            return;
        }
        rollVoyage();
    });
    el('vg-auto').addEventListener('change', event => {
        vg.auto = event.target.checked;
        renderVoyageControls();
        if (!vg.auto) {
            stopVoyageAuto();
            return;
        }
        if (!casino.busy && !vg.playing) rollVoyage();
    });
    el('vg-story-button').addEventListener('click', () => { if (vg.chapter) openVoyageEpisode(vg.chapter.no); });
    el('vg-admin-chapter').addEventListener('change', event => {
        vg.adminChapter = event.target.value;
        vg.chapter = vgCurrentChapter();
        renderVoyageChapterHead();
        renderVoyageBoard();
        renderVoyageLog();
        renderVoyageControls();
    });
    el('vg-admin-reset').addEventListener('click', () => vgAdminAction('vgReset', {}, '航海の共有の分 (JP・最終秘宝) と全員の分 (位置・スタンプ・取り分) を全部消します。本番の前の片付け用です。よろしいですか？'));
    el('vg-admin-final').addEventListener('click', () => vgAdminAction('vgFinalize', { force: true }, '最終秘宝をいま、取り分の比で全員のレートへ配ります (取り消せません)。よろしいですか？'));
    window.addEventListener('resize', () => { if (vg.open) renderVoyageBoard(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && vg.open) pollVoyagePublic(); });
}
