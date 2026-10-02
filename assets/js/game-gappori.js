// ゲームタブ: 宝探し (全員共通の1卓)
//   回る盤面の16マス (お宝15マス・船長1マス) に5球が入る。お宝を2〜5個予想して券を買い (同じお宝を重ねてよい)、
//   予想したお宝ごとに、選んだ数だけ球が入れば当たり。1口の値段は予想の個数で決まる。
//   盤面・配当・球・チャンス・ジャックポットはすべて Cloud Function (casino の gpBuy / gpChance / gpTick) が決める
//   (ルールは functions/gappori.js、卓の進め方は functions/gappori-table.js)。
//   ほかの人の券や進み具合は、誰でも読める卓の写し (gappori_public/main) を読み直して反映する。
//   球は ballsAt の時刻に合わせて1つずつ入れて見せる。締め切りを過ぎたら、画面を開いている人が gpTick を送って先へ進める。
//   お宝の絵は game-slot.js の createSymbol、閃光・金貨・震え・画面いっぱいの演出もスロットのものを使う。
//   入場・手元チップ・精算・画面の切り替えは game.js。

const GAPPORI_ORDER = ['anchor', 'parrot', 'rum', 'map', 'compass', 'coin', 'chest'];   // レア度の順 (functions/gappori.js と同じ)
const GAPPORI_PICKS_MIN = 2;
const GAPPORI_PICKS_MAX = 5;
const GAPPORI_UNIT_STEPS = [1, 2, 3, 5, 10, 20, 30, 50];   // 口数の選び方 (上限はサーバーの GAPPORI_MAX_UNITS と同じ)
const GAPPORI_MAX_UNITS = 50;
const GAPPORI_MAX_TICKETS = 20;    // 1回に買える券の数 (サーバーの GAPPORI_MAX_TICKETS と同じ)
const GAPPORI_POLL_MS = 1200;      // 卓を読み直す間隔
const GAPPORI_SPIN_MS = 4600;      // 球ごとに盤面を回す長さ (球を入れる間隔 5.2秒より少し短く)
const GAPPORI_SPIN_TURNS = 8;      // 止まるまでに回る回数 (このほかに、止まる位置までの端数を回る。長さに合わせて速さを保つ)
const GAPPORI_POCKET_DEG = 360 / 16;
const GAPPORI_BIG_WIN = 10;        // 払い戻しが賭けた額のこの倍以上なら大当たりの演出

const gp = {
    table: null,        // 最後に受け取った卓 (公開の形)
    offset: 0,          // サーバーの時刻 − 端末の時刻
    picks: [],          // 選んでいるお宝 (同じお宝は重ねて入る。「買う」を押すまでは画面の中だけ)
    units: 1,
    pollTimer: null,
    clockTimer: null,
    polling: false,
    ticked: '',         // gpTick を送った締め切り (同じ締め切りに何度も送らない)
    boardRound: 0,      // 盤面を描いた回
    shownBalls: 0,      // その回で、入れて見せた球の数
    angle: 0,           // 盤面の角度 (度。回すたびに増える)
    spinningFor: -1,    // 盤面を回している球の番号 (同じ球で二度回さない)
    celebrated: 0,      // 結果の演出を出した回
    choosing: false,    // チャンスの選択を送っている途中
    screen: 'buy',      // スマホで出している画面 ('buy' 券を買う / 'wheel' ルーレット)
    screenKey: ''       // 画面を自動で切り替えた回と段階 (同じ段階のうちは、手で切り替えたほうを守る)
};

// ------------------------------------------------------------------
// 時刻と卓の読み方
// ------------------------------------------------------------------
function applyGapporiClock(iso) {
    const server = Date.parse(iso);
    if (Number.isFinite(server)) gp.offset = server - Date.now();
}

function gapporiNow() {
    return Date.now() + gp.offset;
}

function gapporiSecondsLeft(iso) {
    if (!iso) return null;
    return Math.max(0, Math.ceil((Date.parse(iso) - gapporiNow()) / 1000));
}

function gapporiKindName(kind) {
    return kind === 'captain' ? '船長' : SLOT_SYMBOLS[kind]?.name || kind;
}

/** 予想の並べ方 (レア度の順。同じお宝は続けて並べる)。配当表のキーと同じ形 */
function sortGapporiPicks(picks) {
    return picks.slice().sort((a, b) => GAPPORI_ORDER.indexOf(a) - GAPPORI_ORDER.indexOf(b));
}

function gapporiKey(picks) {
    return sortGapporiPicks(picks).join('-');
}

function countGappori(list) {
    const counts = {};
    list.forEach(kind => { counts[kind] = (counts[kind] || 0) + 1; });
    return counts;
}

/** 予想のうち、まだ足りないお宝ごとの数 (granted はチャンスで「1球入ったこと」にしたお宝) */
function gapporiShortfall(picks, hits, granted = null) {
    const have = { ...hits };
    if (granted) have[granted] = (have[granted] || 0) + 1;
    const short = {};
    Object.entries(countGappori(picks)).forEach(([kind, need]) => {
        if (need > (have[kind] || 0)) short[kind] = need - (have[kind] || 0);
    });
    return short;
}

function myGapporiTickets(table = gp.table) {
    return table ? table.tickets.filter(ticket => ticket.name === myName()) : [];
}

/** この回の券を持っていて、まだ結果が出ていない (精算できない) */
function isGapporiLive() {
    return Boolean(gp.table && gp.table.phase !== 'result' && myGapporiTickets().length);
}

/** 受付中で、締め切りを過ぎていない */
function isGapporiOpen(table = gp.table) {
    return Boolean(table && table.phase === 'betting' && (!table.bettingEndsAt || Date.parse(table.bettingEndsAt) > gapporiNow()));
}

/** 見せてよい球の数 (ballsAt を過ぎたもの) */
function gapporiDueBalls(table = gp.table) {
    if (!table) return 0;
    return table.ballsAt.filter(at => Date.parse(at) <= gapporiNow()).length;
}

/** 見せている球で入ったお宝の数 { kind: 個数 } */
function gapporiShownHits(table = gp.table) {
    return countGappori(table.balls.slice(0, gp.shownBalls).map(index => table.board.pockets[index]).filter(kind => kind !== 'captain'));
}

// ------------------------------------------------------------------
// 絵
// ------------------------------------------------------------------
/**
 * お宝の絵 (スロットと同じ)。船長は assets/img/slot/captain.jpeg が読めればその絵、読めないあいだは札で出す
 * (札にも data-symbol を付けておくので、あとから画像が読めたら game-slot.js の loadSlotImages が絵に差し替える)
 */
function gapporiSymbol(kind) {
    if (kind !== 'captain' || slot.images.has(kind)) return createSymbol(kind);
    const node = document.createElement('span');
    node.className = 'slot-symbol gp-captain';
    node.dataset.symbol = kind;
    const label = document.createElement('span');
    label.className = 'gp-captain-label';
    label.textContent = '船長';
    node.appendChild(label);
    return node;
}

function gapporiPickIcons(picks) {
    const icons = document.createElement('span');
    icons.className = 'gp-pick-icons';
    picks.forEach(kind => icons.appendChild(gapporiSymbol(kind)));
    return icons;
}

// ------------------------------------------------------------------
// 盤面と球
// ------------------------------------------------------------------
/** 回る盤面。16マスを時計回りに並べる (回ごとに作り直す) */
function buildGapporiWheel(table) {
    const wheel = el('gp-wheel');
    wheel.innerHTML = '';
    table.board.pockets.forEach((kind, index) => {
        const pocket = document.createElement('span');
        pocket.className = `gp-pocket is-${kind}`;
        pocket.style.setProperty('--i', String(index));
        pocket.dataset.index = String(index);
        pocket.appendChild(gapporiSymbol(kind));
        const ball = document.createElement('span');
        ball.className = 'gp-ball';
        pocket.appendChild(ball);
        wheel.appendChild(pocket);
    });
    gp.boardRound = table.roundNo;
}

/** 盤面を angle 度に回す。ms をかけて、だんだん遅くして止める (0 ならすぐ) */
function turnGapporiWheel(angle, ms) {
    gp.angle = angle;
    const wheel = el('gp-wheel');
    wheel.style.transition = ms > 0 ? `transform ${Math.round(ms)}ms cubic-bezier(0.12, 0.7, 0.2, 1)` : 'none';
    wheel.style.transform = `rotate(${angle}deg)`;
}

/** マス index が一番上 (針の下) に来る角度のうち、いまの角度から turns 回以上先のもの */
function gapporiAngleFor(index, turns) {
    const target = (((-index * GAPPORI_POCKET_DEG) % 360) + 360) % 360;
    const current = ((gp.angle % 360) + 360) % 360;
    return gp.angle + turns * 360 + (((target - current) % 360) + 360) % 360;
}

/** 次の球が入る時刻が近づいたら盤面を回し始める。止まるのがちょうど球の入る時刻で、入るマスが針の下に来る */
function spinGapporiWheel() {
    const table = gp.table;
    const next = gp.shownBalls;
    if (!table || table.phase !== 'drawing' || next >= table.balls.length || gp.spinningFor === next) return;
    const left = Date.parse(table.ballsAt[next]) - gapporiNow();
    if (left > GAPPORI_SPIN_MS) return;
    gp.spinningFor = next;
    const index = table.balls[next];
    if (prefersReducedMotion() || left < 300) {
        turnGapporiWheel(gapporiAngleFor(index, 0), 0);
        return;
    }
    turnGapporiWheel(gapporiAngleFor(index, GAPPORI_SPIN_TURNS), left);
    el('gp-wheel-wrap').classList.add('is-spinning');
}

/** 入った球の印と、入ったお宝の並び */
function renderGapporiBalls() {
    const table = gp.table;
    const shown = table.balls.slice(0, gp.shownBalls);
    el('gp-wheel').querySelectorAll('.gp-pocket').forEach(pocket => {
        pocket.classList.toggle('has-ball', shown.includes(Number(pocket.dataset.index)));
    });
    const mine = new Set(myGapporiTickets(table).flatMap(ticket => ticket.picks));
    const list = el('gp-drawn');
    list.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        const item = document.createElement('li');
        const kind = shown[i] === undefined ? null : table.board.pockets[shown[i]];
        if (kind) {
            item.appendChild(gapporiSymbol(kind));
            item.classList.toggle('is-mine', mine.has(kind));
            item.classList.toggle('is-captain', kind === 'captain');
            item.title = gapporiKindName(kind);
        } else {
            item.className = 'is-empty';
            item.textContent = String(i + 1);
        }
        list.appendChild(item);
    }
}

/** 新しく入った球を1つずつ見せる (自分の予想なら光らせて震わせる。船長は赤く光らせる) */
function revealGapporiBalls() {
    const table = gp.table;
    const due = gapporiDueBalls(table);
    if (due <= gp.shownBalls) return;
    const mine = new Set(myGapporiTickets(table).flatMap(ticket => ticket.picks));
    while (gp.shownBalls < due) {
        const index = table.balls[gp.shownBalls];
        const kind = table.board.pockets[index];
        // 回し損ねた球 (画面が裏にあったときなど) は、入ったマスを針の下にすぐ合わせる
        if (gp.spinningFor !== gp.shownBalls) turnGapporiWheel(gapporiAngleFor(index, 0), 0);
        gp.shownBalls += 1;
        el('gp-wheel-wrap').classList.remove('is-spinning');
        const pocket = el('gp-wheel').querySelector(`.gp-pocket[data-index="${index}"]`);
        restartClass(pocket, 'is-landing');
        if (kind === 'captain') {
            flashScreen('red');
            buzz([120, 60, 120]);
        } else if (mine.has(kind)) {
            flashScreen('gold');
            buzz(60);
        }
    }
    renderGapporiBalls();
    renderGapporiTickets();
}

// ------------------------------------------------------------------
// 状態の表示
// ------------------------------------------------------------------
function renderGapporiStatus() {
    const table = gp.table;
    if (!table || !el('gp-status')) return;
    el('gp-jackpot').textContent = table.jackpot.toLocaleString('ja-JP');
    let text = '';
    if (table.phase === 'betting') {
        const left = gapporiSecondsLeft(table.bettingEndsAt);
        text = table.bettingEndsAt ? `受付中 あと${left}秒` : '券を買うと受付が始まります (30秒)';
    } else if (table.phase === 'drawing') {
        text = `抽選中… ${Math.min(gp.shownBalls + 1, 5)}球目`;
    } else if (table.phase === 'chance') {
        const mineWaiting = table.chances.some(chance => chance.name === myName() && !chance.choice);
        text = `${mineWaiting ? 'お宝ゲット！券ごとに1つ選んでください' : 'お宝ゲットの人が選んでいます'} あと${gapporiSecondsLeft(table.chanceEndsAt)}秒`;
    } else if (table.phase === 'result') {
        text = `結果発表 次の回まで${gapporiSecondsLeft(table.nextRoundAt)}秒`;
    }
    el('gp-status').textContent = text;
}

function renderGapporiKinds() {
    const table = gp.table;
    const container = el('gp-kinds');
    container.innerHTML = '';
    if (!table) return;
    const open = isGapporiOpen(table);
    const chosen = countGappori(gp.picks);
    table.board.kinds.forEach(kind => {
        const count = chosen[kind] || 0;
        const cell = document.createElement('div');
        cell.className = 'gp-kind-cell';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gp-kind';
        button.setAttribute('aria-pressed', String(count > 0));
        button.setAttribute('aria-label', `${gapporiKindName(kind)}を1つ選ぶ (${count}個選んでいます)`);
        button.disabled = !open || count >= table.board.counts[kind] || gp.picks.length >= GAPPORI_PICKS_MAX;
        button.append(gapporiSymbol(kind));
        const name = document.createElement('span');
        name.className = 'gp-kind-name';
        name.textContent = gapporiKindName(kind);
        const pockets = document.createElement('span');
        pockets.className = 'gp-kind-count';
        pockets.textContent = `${table.board.counts[kind]}マス`;
        button.append(name, pockets);
        if (count > 0) {
            const badge = document.createElement('span');
            badge.className = 'gp-kind-badge';
            badge.textContent = `×${count}`;
            button.appendChild(badge);
        }
        button.addEventListener('click', () => addGapporiPick(kind));
        cell.appendChild(button);
        if (count > 0) {
            const minus = document.createElement('button');
            minus.type = 'button';
            minus.className = 'gp-kind-minus';
            minus.textContent = '−';
            minus.setAttribute('aria-label', `${gapporiKindName(kind)}を1つ減らす`);
            minus.disabled = !open;
            minus.addEventListener('click', () => removeGapporiPick(kind));
            cell.appendChild(minus);
        }
        container.appendChild(cell);
    });
}

function addGapporiPick(kind) {
    const table = gp.table;
    const count = gp.picks.filter(item => item === kind).length;
    if (!table || gp.picks.length >= GAPPORI_PICKS_MAX || count >= table.board.counts[kind]) return;
    gp.picks = [...gp.picks, kind];
    renderGapporiKinds();
    renderGapporiControls();
}

function removeGapporiPick(kind) {
    const index = gp.picks.lastIndexOf(kind);
    if (index < 0) return;
    gp.picks = gp.picks.filter((_, i) => i !== index);
    renderGapporiKinds();
    renderGapporiControls();
}

/** 1口の値段 (予想の個数で決まる)。個数が足りないあいだは null */
function gapporiPrice(count = gp.picks.length) {
    return gp.table?.prices?.[count] ?? null;
}

function gapporiCost() {
    return gp.units * (gapporiPrice() || 0);
}

function renderGapporiControls() {
    if (!el('gp-buy-button')) return;
    const table = gp.table;
    const picks = gp.picks.length;
    const odds = table && picks >= GAPPORI_PICKS_MIN ? table.odds[gapporiKey(gp.picks)] ?? null : null;
    const cost = gapporiCost();
    // 打っている途中は書き換えない (空にしたときなど)。離れたときに change で直す
    if (document.activeElement !== el('gp-units')) el('gp-units').value = String(gp.units);
    el('gp-cost').textContent = `${cost.toLocaleString('ja-JP')}`;
    const chosen = sortGapporiPicks(gp.picks).map(gapporiKindName).join('・');
    el('gp-pick-info').textContent = picks < GAPPORI_PICKS_MIN
        ? `お宝をあと${GAPPORI_PICKS_MIN - picks}個選んでください (${GAPPORI_PICKS_MIN}〜${GAPPORI_PICKS_MAX}個。同じお宝を重ねてもよい)`
        : !odds || !gapporiPrice()
            ? 'この予想は次の回から買えます。'
            : `${chosen} (1口 ${gapporiPrice()}) ・ 倍率 ×${odds} ・ 当たれば ${Math.round(cost * odds).toLocaleString('ja-JP')}`;
    el('gp-pick-info').classList.toggle('is-ready', Boolean(odds));
    el('gp-units-down').disabled = gp.units <= 1;
    el('gp-units-up').disabled = gp.units >= GAPPORI_MAX_UNITS;
    el('gp-buy-button').disabled = casino.busy || !casino.session || !isGapporiOpen(table) || !odds || !gapporiPrice()
        || cost > slotChips() || myGapporiTickets(table).length >= GAPPORI_MAX_TICKETS;
    renderGapporiStart();
}

/** 口数を 1〜GAPPORI_MAX_UNITS の整数にして入れる (手で打った数もここで直す) */
function setGapporiUnits(value) {
    gp.units = Math.max(1, Math.min(GAPPORI_MAX_UNITS, Math.floor(Number(value)) || 1));
    el('gp-units').value = String(gp.units);
    renderGapporiControls();
}

/** −・＋: いまの口数から、GAPPORI_UNIT_STEPS の1つ前・1つ先の数へ (手で打った半端な数からでも) */
function stepGapporiUnits(direction) {
    const next = direction > 0
        ? GAPPORI_UNIT_STEPS.find(step => step > gp.units) ?? GAPPORI_MAX_UNITS
        : [...GAPPORI_UNIT_STEPS].reverse().find(step => step < gp.units) ?? 1;
    setGapporiUnits(next);
}

/** 口数の欄に打っているあいだ: 1以上の整数なら代金と倍率の表示に使う (上限を超えた分は上限で数える) */
function inputGapporiUnits() {
    const value = Number(el('gp-units').value);
    if (!Number.isInteger(value) || value < 1) return;
    gp.units = Math.min(GAPPORI_MAX_UNITS, value);
    renderGapporiControls();
}

// ------------------------------------------------------------------
// スマホの画面の切り替え (券を買う / ルーレット)
// ------------------------------------------------------------------
function setGapporiScreen(screen) {
    gp.screen = screen;
    const section = el('gappori-table');
    if (!section) return;
    section.dataset.screen = screen;
    section.querySelectorAll('.gp-tabs [data-screen]').forEach(tab => {
        tab.setAttribute('aria-selected', String(tab.dataset.screen === screen));
    });
}

/** 受付中は「券を買う」、抽選が始まったら「ルーレット」へ。段階が変わったときだけ切り替える */
function followGapporiScreen(table) {
    const screen = table.phase === 'betting' ? 'buy' : 'wheel';
    const key = `${table.roundNo}:${screen}`;
    if (gp.screenKey === key) return;
    gp.screenKey = key;
    setGapporiScreen(screen);
}

/** 自分の券 (結果が出たら当たり・はずれと払い戻し) と、ほかの人の数 */
function renderGapporiTickets() {
    const table = gp.table;
    const list = el('gp-my-tickets');
    if (!table || !list) return;
    list.innerHTML = '';
    // ルーレットの画面 (スマホ) の券: お宝と、代金か結果だけ
    const strip = el('gp-mine-strip');
    if (strip) strip.innerHTML = '';
    const mine = myGapporiTickets(table);
    const hits = gapporiShownHits(table);
    const grantedFor = ticket => table.chances.find(chance => chance.ticket === table.tickets.indexOf(ticket))?.choice || null;
    const finished = table.phase === 'result' && gp.shownBalls >= table.balls.length;
    if (!mine.length) {
        const item = document.createElement('li');
        item.className = 'is-none';
        item.textContent = isGapporiOpen(table) ? 'まだ買っていません。' : 'この回は買っていません。';
        list.appendChild(item);
    }
    mine.forEach(ticket => {
        const item = document.createElement('li');
        // 同じお宝は、入った球の数だけ前から光らせる。チャンスで足したぶんは、足りない1つに点線の枠
        const icons = gapporiPickIcons(ticket.picks);
        const used = {};
        let grantUsed = false;
        icons.querySelectorAll('.slot-symbol').forEach((node, i) => {
            const kind = ticket.picks[i];
            used[kind] = (used[kind] || 0) + 1;
            const hit = used[kind] <= (hits[kind] || 0);
            const grant = !hit && !grantUsed && kind === grantedFor(ticket);
            if (grant) grantUsed = true;
            node.classList.toggle('is-hit', hit);
            node.classList.toggle('is-granted', grant);
        });
        const info = document.createElement('span');
        info.className = 'gp-ticket-info';
        info.textContent = `${ticket.units}口 ×${ticket.odds}`;
        const state = document.createElement('strong');
        state.className = 'gp-ticket-state';
        if (finished) {
            state.textContent = ticket.win ? `+${ticket.payout.toLocaleString('ja-JP')}` : 'はずれ';
            item.classList.add(ticket.win ? 'is-win' : 'is-lose');
        } else {
            state.textContent = ticket.cost.toLocaleString('ja-JP');
        }
        if (strip) {
            const chip = document.createElement('li');
            chip.className = item.className;
            const chipState = document.createElement('span');
            chipState.textContent = finished ? state.textContent : `${ticket.units}口`;
            chip.append(icons.cloneNode(true), chipState);
            strip.appendChild(chip);
        }
        item.append(icons, info, state);
        list.appendChild(item);
    });
    const others = new Map();
    table.tickets.filter(ticket => ticket.name !== myName()).forEach(ticket => {
        others.set(ticket.name, (others.get(ticket.name) || 0) + 1);
    });
    el('gp-others').textContent = others.size
        ? `ほかの参加者: ${[...others.entries()].map(([name, count]) => `${name} ${count}枚`).join('、')}`
        : '';
}

/** 自分の券のうち、チャンスが来ていてまだ選んでいないもの [{ ticket (この回の券の番号), picks }] */
function myPendingChances(table = gp.table) {
    if (!table || table.phase !== 'chance') return [];
    return table.chances
        .filter(chance => chance.name === myName() && !chance.choice)
        .map(chance => ({ ticket: chance.ticket, picks: table.tickets[chance.ticket]?.picks || [] }));
}

/** チャンス: チャンスが来た自分の券ごとに、その券でまだ足りないお宝から1つ選ぶ */
function renderGapporiChance() {
    const table = gp.table;
    const panel = el('gp-chance');
    if (!panel) return;
    const pending = gp.shownBalls >= 3 ? myPendingChances(table) : [];
    panel.classList.toggle('hidden', !pending.length);
    if (!pending.length) return;
    el('gp-chance-left').textContent = `あと${gapporiSecondsLeft(table.chanceEndsAt)}秒`;
    const options = el('gp-chance-options');
    const signature = `${table.roundNo}:${pending.map(item => item.ticket).join(',')}`;
    if (options.dataset.signature === signature) return;
    const first = !options.dataset.signature?.startsWith(`${table.roundNo}:`);
    options.dataset.signature = signature;
    options.innerHTML = '';
    const hits = gapporiShownHits(table);
    pending.forEach(({ ticket, picks }) => {
        const row = document.createElement('div');
        row.className = 'gp-chance-row';
        row.appendChild(gapporiPickIcons(picks));
        const short = Object.keys(gapporiShortfall(picks, hits));
        GAPPORI_ORDER.filter(kind => short.includes(kind)).forEach(kind => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'gp-chance-option';
            button.append(gapporiSymbol(kind));
            const name = document.createElement('span');
            name.textContent = gapporiKindName(kind);
            button.appendChild(name);
            button.addEventListener('click', () => chooseGapporiChance(ticket, kind));
            row.appendChild(button);
        });
        options.appendChild(row);
    });
    if (first) {
        flashScreen('gold');
        buzz([80, 40, 80, 40, 200]);
    }
}

function renderGapporiRecent() {
    const list = el('gp-recent');
    if (!list) return;
    list.innerHTML = '';
    (casino.session?.gappori?.recent || []).forEach(item => {
        const li = document.createElement('li');
        const net = item.returned - item.bet;
        li.className = `bj-pip ${item.jackpot > 0 ? 'is-blackjack' : net > 0 ? 'is-plus' : net < 0 ? 'is-minus' : 'is-even'}`;
        li.textContent = item.jackpot > 0 ? 'JP' : formatSigned(net);
        li.title = `券 ${item.tickets}枚 (当たり ${item.wins}) / 賭け ${item.bet} → 払戻 ${item.returned}`
            + (item.jackpot > 0 ? ` (ジャックポット ${item.jackpot})` : '');
        list.appendChild(li);
    });
}

/** ゲーム一覧のタイル: ジャックポットの額と、この回の参加人数 */
function renderGapporiTile() {
    const live = el('gp-tile-live');
    if (!live) return;
    const table = gp.table;
    if (!table) {
        live.textContent = '';
        return;
    }
    const players = new Set(table.tickets.map(ticket => ticket.name)).size;
    live.textContent = `JP ${table.jackpot.toLocaleString('ja-JP')}${players ? ` ・ いま${players}人` : ''}`;
    live.classList.toggle('is-busy', players > 0);
}

// ------------------------------------------------------------------
// 結果の演出
// ------------------------------------------------------------------
/** 5球が入り終わって結果が出たら、船長のチャンスタイムと自分の当たりを見せる (回ごとに1回) */
async function celebrateGapporiResult() {
    const table = gp.table;
    if (!table || table.phase !== 'result' || gp.celebrated === table.roundNo) return;
    if (gp.shownBalls < table.balls.length) return;
    gp.celebrated = table.roundNo;
    const mine = myGapporiTickets(table);
    const payout = mine.reduce((sum, ticket) => sum + (ticket.payout || 0), 0);
    const cost = mine.reduce((sum, ticket) => sum + ticket.cost, 0);
    const jackpot = table.result?.jackpot || { captain: false, won: false, amount: 0, shares: [] };
    const myShare = jackpot.shares.find(share => share.name === myName())?.amount || 0;

    if (jackpot.captain) {
        window.playGameSound?.('gpCaptain');
        strobeScreen(['red', 'gold', 'white']);
        buzz([120, 60, 120, 60, 400]);
        await showSlotOverlay('is-start', body => {
            body.append(
                modeText('p', 'slot-overlay-title', 'Captain'),
                modeText('p', 'slot-overlay-sub', '船長チャンス!!'),
                modeText('p', 'slot-overlay-count', `ジャックポット ${(jackpot.won ? jackpot.amount : table.jackpot).toLocaleString('ja-JP')}`)
            );
        });
        if (jackpot.won) {
            window.playGameSound?.('gpJackpotWin');
            window.qjongTreasureRain?.preview(7000);
            strobeScreen(['white', 'gold', 'red', 'white']);
            buzz([200, 80, 200, 80, 600]);
            await showSlotOverlay('is-result', body => {
                const total = modeText('p', 'slot-overlay-total', '獲得 ');
                total.appendChild(modeText('strong', 'slot-overlay-won', (myShare || jackpot.amount).toLocaleString('ja-JP')));
                body.append(
                    modeText('p', 'slot-overlay-sub', myShare ? 'ジャックポット獲得!!' : 'ジャックポットが出ました'),
                    modeText('p', 'slot-overlay-title', 'Jackpot'),
                    total
                );
            });
        } else {
            // はずれ: 暗い画面で「ジャックポットならず」。貯まった額は持ち越し
            window.playGameSound?.('gpJackpotMiss');
            buzz([300]);
            await showSlotOverlay('is-miss', body => {
                body.append(
                    modeText('p', 'slot-overlay-sub', 'ジャックポットならず…'),
                    modeText('p', 'slot-overlay-title', 'Miss'),
                    modeText('p', 'slot-overlay-count', `JACKPOT ${table.jackpot.toLocaleString('ja-JP')} 持ち越し`)
                );
            });
        }
    }

    if (payout > 0) {
        const big = payout >= cost * GAPPORI_BIG_WIN;
        restartClass(el('gp-wheel-wrap'), 'is-shake');
        burstCoins(Math.min(60, 12 + Math.round((payout / Math.max(cost, 1)) * 2)), el('gp-wheel-wrap'));
        if (big) {
            window.qjongTreasureRain?.preview(4500);
            strobeScreen(['white', 'gold', 'white']);
            buzz([200, 80, 200, 80, 500]);
        } else {
            flashScreen('white');
            buzz([80, 50, 140]);
        }
        showMessage(el('gp-message'), `🎉 当たり！ 払い戻し ${payout.toLocaleString('ja-JP')}`, 'success');
    } else if (mine.length && !jackpot.won) {
        showMessage(el('gp-message'), 'この回ははずれでした。', 'info');
    }

    // 払い戻しが入った財布を読み直す
    if (mine.length) await sendGapporiTick();
}

// ------------------------------------------------------------------
// 卓を受け取る・読み直す・先へ進める
// ------------------------------------------------------------------
/** 届いた卓を反映する。新しい回なら盤面を描き直し、途中から開いたときは入り終わった球を演出なしで出す */
function receiveGapporiTable(table, now) {
    if (now) applyGapporiClock(now);
    if (!table) return;
    if (gp.table && table.seq < gp.table.seq && table.roundNo <= gp.table.roundNo) return;
    const newRound = !gp.table || table.roundNo !== gp.boardRound;
    gp.table = table;
    followGapporiScreen(table);
    if (newRound) {
        const firstLook = gp.boardRound === 0;
        if (el('gp-wheel')) buildGapporiWheel(table);
        gp.shownBalls = firstLook ? gapporiDueBalls(table) : 0;
        gp.spinningFor = -1;
        el('gp-wheel-wrap')?.classList.remove('is-spinning');
        // 途中から開いたときは、最後に入った球のマスを針の下に合わせておく
        if (el('gp-wheel') && gp.shownBalls > 0) turnGapporiWheel(gapporiAngleFor(table.balls[gp.shownBalls - 1], 0), 0);
        if (firstLook && table.phase === 'result') gp.celebrated = table.roundNo;
        // 選びかけの予想は、新しい盤面にあるお宝だけ残す
        gp.picks = gp.picks.filter(kind => table.board.kinds.includes(kind));
        if (el('gp-chance-options')) el('gp-chance-options').innerHTML = '';
    }
    renderGapporiView();
}

function renderGapporiView() {
    if (!gp.table || !el('gp-wheel')) return;
    renderGapporiStatus();
    renderGapporiBalls();
    renderGapporiKinds();
    renderGapporiControls();
    renderGapporiTickets();
    renderGapporiStart();
    renderGapporiChance();
    renderGapporiTile();
}

async function pollGapporiTable() {
    if (gp.polling || document.hidden || routeGame() !== 'gappori') return;
    gp.polling = true;
    try {
        const doc = await getFirestoreDb().collection('gappori_public').doc('main').get();
        if (doc.exists) receiveGapporiTable(doc.data());
    } catch (error) {
        console.warn('宝探しの卓の読み込みに失敗:', error);
    } finally {
        gp.polling = false;
    }
}

async function sendGapporiTick() {
    try {
        const data = await callCasino('gpTick');
        applyGapporiClock(data.now);
        receiveGapporiTable(data.gappori);
        if (data.session) {
            casino.session = data.session;
            renderWallet();
            renderGapporiRecent();
        } else if (casino.session) {
            // チップが尽きて精算された (または時間切れで精算されていた)
            await refreshCasino();
        }
    } catch (error) {
        console.warn('宝探しの卓を進められませんでした:', error);
    }
}

/** いまの段階の締め切り (過ぎたら gpTick を送る) */
function gapporiDeadline(table) {
    if (table.phase === 'betting') return table.tickets.length ? table.bettingEndsAt : null;
    if (table.phase === 'drawing') return table.drawEndsAt;
    if (table.phase === 'chance') return table.chanceEndsAt;
    if (table.phase === 'result') return table.nextRoundAt;
    return null;
}

/** 0.2秒ごと: 球を入れて見せ、残り時間を出し、締め切りを過ぎた卓を先へ進め、結果を見せる */
function tickGapporiClock() {
    const table = gp.table;
    if (!table) return;
    spinGapporiWheel();
    revealGapporiBalls();
    renderGapporiStatus();
    renderGapporiChance();
    if (table.phase === 'betting' && table.bettingEndsAt) renderGapporiControls();
    celebrateGapporiResult();
    const deadline = gapporiDeadline(table);
    if (!deadline || gp.ticked === deadline) return;
    if (gapporiNow() < Date.parse(deadline) + 300) return;
    // 画面を開いている全員が送っても、サーバー側で1回しか進まない。少しずらして送る
    gp.ticked = deadline;
    setTimeout(async () => {
        await sendGapporiTick();
        // 届くのが早すぎたり失敗したりして卓が進まなければ、少し待ってもう一度送る
        setTimeout(() => {
            if (gp.ticked === deadline) gp.ticked = '';
        }, 2000);
    }, Math.random() * 700);
}

// ------------------------------------------------------------------
// 操作
// ------------------------------------------------------------------
/** 「すぐ始める」: 券を買っているときだけ出す。押した人とまだの人がわかるようにする */
function renderGapporiStart() {
    const button = el('gp-start-button');
    if (!button) return;
    const table = gp.table;
    const mine = myGapporiTickets(table).length > 0;
    button.classList.toggle('hidden', !mine || !isGapporiOpen(table));
    if (!mine || !table) return;
    const players = [...new Set(table.tickets.map(ticket => ticket.name))];
    const waiting = players.filter(name => !(table.ready || []).includes(name));
    const pressed = (table.ready || []).includes(myName());
    button.disabled = casino.busy || pressed;
    button.textContent = pressed
        ? `ほかの人を待っています (あと${waiting.length}人)`
        : players.length > 1 ? `すぐ始める (${players.length}人全員が押したら始まります)` : 'すぐ始める';
}

async function startGapporiNow() {
    if (casino.busy) return;
    setCasinoBusy(true);
    try {
        const data = await callCasino('gpStart');
        applyGapporiClock(data.now);
        receiveGapporiTable(data.gappori);
    } catch (error) {
        showMessage(el('gp-message'), error.message, 'error');
    } finally {
        setCasinoBusy(false);
    }
}

/** いま選んでいる予想と口数で、券を1枚買う */
async function buyGapporiTicket() {
    const picks = sortGapporiPicks(gp.picks);
    if (casino.busy || !casino.session || !gp.table?.odds[gapporiKey(picks)]) return;
    const units = gp.units;
    const cost = gapporiCost();
    setCasinoBusy(true);
    try {
        const data = await callCasino('gpBuy', { picks, units });
        applyGapporiClock(data.now);
        if (data.session) casino.session = data.session;
        gp.picks = [];
        receiveGapporiTable(data.gappori);
        renderWallet();
        showMessage(el('gp-message'), `${picks.map(gapporiKindName).join('・')} ${units}口を買いました (代金 ${cost.toLocaleString('ja-JP')})`, 'success');
    } catch (error) {
        showMessage(el('gp-message'), error.message, 'error');
    } finally {
        setCasinoBusy(false);
    }
}

async function chooseGapporiChance(ticket, kind) {
    if (gp.choosing) return;
    gp.choosing = true;
    el('gp-chance-options').querySelectorAll('button').forEach(button => { button.disabled = true; });
    try {
        const data = await callCasino('gpChance', { ticket, kind });
        applyGapporiClock(data.now);
        receiveGapporiTable(data.gappori);
        showMessage(el('gp-message'), `${gapporiKindName(kind)}を「1球入ったこと」にしました。`, 'success');
    } catch (error) {
        showMessage(el('gp-message'), error.message, 'error');
    } finally {
        gp.choosing = false;
        // 選び終わっていない券が残っていれば、選び直せるように描き直す
        el('gp-chance-options').dataset.signature = '';
        renderGapporiChance();
    }
}

// ------------------------------------------------------------------
// 画面の出入り (game.js の renderRoute から呼ぶ)
// ------------------------------------------------------------------
function openGapporiTable() {
    renderGapporiView();
    renderGapporiRecent();
    if (!gp.pollTimer) {
        gp.pollTimer = setInterval(pollGapporiTable, GAPPORI_POLL_MS);
        gp.clockTimer = setInterval(tickGapporiClock, 200);
        pollGapporiTable();
    }
}

function closeGapporiTable() {
    el('gp-chance')?.classList.add('hidden');
    clearInterval(gp.pollTimer);
    clearInterval(gp.clockTimer);
    gp.pollTimer = null;
    gp.clockTimer = null;
}

function initGappori() {
    if (!el('gp-wheel')) return;
    // お宝ゲットの札は画面の下に固定する。main は動きの transform を持ち、その中では main が基準になるので body へ移す
    document.body.appendChild(el('gp-chance'));
    document.querySelectorAll('.gp-tabs [data-screen]').forEach(tab => {
        tab.addEventListener('click', () => setGapporiScreen(tab.dataset.screen));
    });
    el('gp-units-down').addEventListener('click', () => stepGapporiUnits(-1));
    el('gp-units-up').addEventListener('click', () => stepGapporiUnits(1));
    el('gp-units').addEventListener('input', inputGapporiUnits);
    el('gp-units').addEventListener('change', () => setGapporiUnits(el('gp-units').value));
    el('gp-buy-button').addEventListener('click', buyGapporiTicket);
    el('gp-start-button').addEventListener('click', startGapporiNow);
}
