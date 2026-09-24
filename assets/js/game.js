// ゲームタブ: ルーレット
// 出目・配当・残高はすべて Cloud Function (casinoRoulette) が決める。
// この画面は賭け方を組み立てて送り、返ってきた結果を描くだけ。

const ROULETTE_WHEEL_ORDER = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const ROULETTE_SPIN_MS = 3200;
const CASINO_CHIP_STORAGE_KEY = 'casinoChip';
const OUTSIDE_BETS = [
    { type: 'low', label: '1〜18' },
    { type: 'even', label: '偶数' },
    { type: 'red', label: '赤' },
    { type: 'black', label: '黒' },
    { type: 'odd', label: '奇数' },
    { type: 'high', label: '19〜36' }
];

const casino = {
    score: 0,
    session: null,
    bets: new Map(),      // "type:value" → { type, value, amount }
    placed: [],           // 置いた順の { key, amount } (1つ戻す用)
    lastBets: [],
    chip: 10,
    busy: false,
    wheelRotation: 0
};

const el = id => document.getElementById(id);

function rouletteColor(number) {
    if (number === 0) return 'green';
    return ROULETTE_RED.has(number) ? 'red' : 'black';
}

function colorLabel(color) {
    return { red: '赤', black: '黒', green: '緑' }[color] || '';
}

function formatSigned(value) {
    const n = Math.round(Number(value) || 0);
    return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toLocaleString('ja-JP')}`;
}

function formatClock(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

async function callCasino(action, payload = {}) {
    const token = await getFirebaseIdToken();
    if (!token) throw new Error('ログインが切れています。マイページでログインし直してください。');
    const response = await fetch(`${getFunctionsBaseUrl()}/casinoRoulette`, {
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

function showView(name) {
    el('casino-loading').classList.toggle('hidden', name !== 'loading');
    el('casino-login').classList.toggle('hidden', name !== 'login');
    el('casino-lobby').classList.toggle('hidden', name !== 'lobby');
    el('casino-table').classList.toggle('hidden', name !== 'table');
}

function settledMessage(settled) {
    if (!settled) return '';
    const head = settled.auto ? '前回のテーブルを自動で精算しました' : '精算しました';
    if (settled.beforeScore === null) return `${head}。`;
    return `${head}: ${settled.spins}回 / 持込 ${settled.buyIn.toLocaleString('ja-JP')} → ${settled.chips.toLocaleString('ja-JP')}。`
        + ` レート ${settled.beforeScore.toLocaleString('ja-JP')} → ${settled.afterScore.toLocaleString('ja-JP')} (${formatSigned(settled.delta)})`;
}

// ------------------------------------------------------------------
// ロビー
// ------------------------------------------------------------------
function renderLobby() {
    el('casino-lobby-score').textContent = formatRate(casino.score);
    const input = el('casino-buyin');
    input.max = String(casino.score);
    if (!input.value || Number(input.value) > casino.score) {
        input.value = String(Math.min(casino.score, 100));
    }
    el('casino-enter-button').disabled = casino.score < 1;
    showView('lobby');
}

async function enterTable(event) {
    event.preventDefault();
    if (casino.busy) return;
    const buyIn = Number(el('casino-buyin').value);
    if (!Number.isInteger(buyIn) || buyIn < 1 || buyIn > casino.score) {
        showMessage(el('casino-lobby-message'), `持ち込めるのは1〜${casino.score}の整数です。`, 'error');
        return;
    }

    const button = el('casino-enter-button');
    casino.busy = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
        const data = await callCasino('enter', { buyIn });
        if (data.autoSettled) showMessage(el('casino-lobby-message'), settledMessage(data.autoSettled), 'info');
        openTable(data.session);
    } catch (error) {
        showMessage(el('casino-lobby-message'), error.message, 'error');
        await refreshCasino().catch(() => {});
    } finally {
        casino.busy = false;
        button.disabled = false;
        button.removeAttribute('aria-busy');
    }
}

// ------------------------------------------------------------------
// テーブル
// ------------------------------------------------------------------
function openTable(session) {
    casino.session = session;
    clearBets();
    renderRecent();
    renderSession();
    el('casino-result').textContent = '賭け先を選んでスピン';
    el('casino-result').className = 'casino-result';
    showView('table');
}

function renderSession() {
    const session = casino.session;
    if (!session) return;
    const net = session.chips - session.buyIn;
    el('casino-chips').textContent = session.chips.toLocaleString('ja-JP');
    el('casino-buyin-display').textContent = session.buyIn.toLocaleString('ja-JP');
    el('casino-spins').textContent = `${session.spins}回`;
    const netEl = el('casino-net');
    netEl.textContent = formatSigned(net);
    netEl.dataset.sign = net > 0 ? 'plus' : net < 0 ? 'minus' : 'zero';
    el('casino-expiry').textContent = `${formatClock(session.expiresAt)} までにスピンか精算をしないと自動で精算されます`;
    renderBetControls();
}

function renderRecent() {
    const list = el('casino-recent');
    list.innerHTML = '';
    (casino.session?.recent || []).forEach(item => {
        const li = document.createElement('li');
        li.className = `roulette-pip is-${item.color}`;
        li.textContent = item.number;
        li.title = `${item.number} ${colorLabel(item.color)} / 賭け ${item.bet} → 払戻 ${item.returned}`;
        list.appendChild(li);
    });
}

function betKey(type, value) {
    return `${type}:${value ?? ''}`;
}

function totalBet() {
    let sum = 0;
    casino.bets.forEach(bet => { sum += bet.amount; });
    return sum;
}

function placeBet(type, value) {
    if (casino.busy || !casino.session) return;
    const remaining = casino.session.chips - totalBet();
    const amount = Math.min(casino.chip, remaining);
    if (amount < 1) {
        showMessage(el('casino-table-message'), '手元のチップを使い切っています。', 'info');
        return;
    }
    const key = betKey(type, value);
    const current = casino.bets.get(key);
    casino.bets.set(key, { type, value, amount: (current ? current.amount : 0) + amount });
    casino.placed.push({ key, amount });
    renderBetControls();
}

function undoBet() {
    const last = casino.placed.pop();
    if (!last) return;
    const bet = casino.bets.get(last.key);
    if (!bet) return;
    bet.amount -= last.amount;
    if (bet.amount <= 0) casino.bets.delete(last.key);
    renderBetControls();
}

function clearBets() {
    casino.bets.clear();
    casino.placed = [];
    renderBetControls();
}

function rebet() {
    if (!casino.lastBets.length || !casino.session) return;
    const total = casino.lastBets.reduce((sum, bet) => sum + bet.amount, 0);
    if (total > casino.session.chips) {
        showMessage(el('casino-table-message'), `前回の賭け (${total}) は手元のチップを超えています。`, 'info');
        return;
    }
    clearBets();
    casino.lastBets.forEach(bet => {
        const key = betKey(bet.type, bet.value);
        casino.bets.set(key, { ...bet });
        casino.placed.push({ key, amount: bet.amount });
    });
    renderBetControls();
}

function renderBetControls() {
    document.querySelectorAll('#roulette-board [data-type]').forEach(cell => {
        const value = cell.dataset.value === undefined ? null : Number(cell.dataset.value);
        const bet = casino.bets.get(betKey(cell.dataset.type, value));
        const stake = cell.querySelector('.roulette-stake');
        stake.textContent = bet ? bet.amount : '';
        cell.classList.toggle('has-stake', Boolean(bet));
        cell.disabled = casino.busy;
    });
    document.querySelectorAll('.casino-chip-picker [data-chip]').forEach(button => {
        button.setAttribute('aria-checked', String(Number(button.dataset.chip) === casino.chip));
        button.disabled = casino.busy;
    });

    const total = totalBet();
    el('casino-bet-total').textContent = total.toLocaleString('ja-JP');
    el('casino-spin-button').disabled = casino.busy || total < 1;
    el('casino-undo-button').disabled = casino.busy || casino.placed.length === 0;
    el('casino-clear-button').disabled = casino.busy || casino.bets.size === 0;
    el('casino-rebet-button').disabled = casino.busy || casino.lastBets.length === 0;
    el('casino-settle-button').disabled = casino.busy;
}

function setBusy(busy) {
    casino.busy = busy;
    el('casino-spin-button').setAttribute('aria-busy', String(busy));
    renderBetControls();
}

function spinWheelTo(number) {
    const wheel = el('roulette-wheel');
    const index = ROULETTE_WHEEL_ORDER.indexOf(number);
    const pocketAngle = (index * 360) / ROULETTE_WHEEL_ORDER.length;
    // 今の角度から最低5周まわし、当たりのポケットが上の針に来る角度で止める
    const current = casino.wheelRotation;
    const target = -pocketAngle;
    const offset = ((target - current) % 360 + 360) % 360;
    casino.wheelRotation = current + 360 * 5 + offset;
    wheel.style.transform = `rotate(${casino.wheelRotation}deg)`;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return delay(reduced ? 0 : ROULETTE_SPIN_MS);
}

async function spin() {
    if (casino.busy || !casino.session) return;
    const bets = Array.from(casino.bets.values());
    if (!bets.length) return;

    setBusy(true);
    const resultEl = el('casino-result');
    resultEl.className = 'casino-result is-spinning';
    resultEl.textContent = 'ノー・モア・ベット…';
    try {
        const data = await callCasino('spin', { bets });
        if (data.expired) {
            showView('lobby');
            await refreshCasino();
            showMessage(el('casino-lobby-message'), settledMessage(data.settled), 'info');
            return;
        }

        await spinWheelTo(data.result.number);
        const { number, color, bet, returned } = data.result;
        resultEl.className = `casino-result is-${color}`;
        resultEl.textContent = `${number} ${colorLabel(color)} — 賭け ${bet.toLocaleString('ja-JP')} / 払い戻し ${returned.toLocaleString('ja-JP')}`
            + (returned > 0 ? ` (${formatSigned(returned - bet)})` : '');

        casino.lastBets = bets.map(item => ({ ...item }));
        casino.bets.clear();
        casino.placed = [];

        if (data.settled) {
            // チップが尽きてサーバー側で精算済み
            casino.session = { ...casino.session, chips: 0, recent: [data.result, ...(casino.session.recent || [])] };
            renderRecent();
            renderSession();
            showMessage(el('casino-table-message'), `チップがなくなりました。${settledMessage(data.settled)}`, 'info');
            await delay(2500);
            await refreshCasino();
            showMessage(el('casino-lobby-message'), settledMessage(data.settled), 'info');
            return;
        }

        casino.session = data.session;
        renderRecent();
        renderSession();
    } catch (error) {
        resultEl.className = 'casino-result';
        resultEl.textContent = '賭け先を選んでスピン';
        showMessage(el('casino-table-message'), error.message, 'error');
    } finally {
        setBusy(false);
    }
}

async function settle() {
    if (casino.busy || !casino.session) return;
    const net = casino.session.chips - casino.session.buyIn;
    if (!confirm(`精算します。レートに ${formatSigned(net)} を反映します。よろしいですか？`)) return;

    setBusy(true);
    try {
        const data = await callCasino('settle');
        casino.session = null;
        await refreshCasino();
        showMessage(el('casino-lobby-message'), settledMessage(data.settled), 'success');
    } catch (error) {
        showMessage(el('casino-table-message'), error.message, 'error');
        await refreshCasino().catch(() => {});
    } finally {
        setBusy(false);
    }
}

// ------------------------------------------------------------------
// 盤面とホイールの組み立て
// ------------------------------------------------------------------
function createBetCell(type, value, label, extraClass = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `roulette-cell ${extraClass}`.trim();
    button.dataset.type = type;
    if (value !== null) button.dataset.value = String(value);
    const text = document.createElement('span');
    text.className = 'roulette-cell-label';
    text.textContent = label;
    const stake = document.createElement('span');
    stake.className = 'roulette-stake';
    button.append(text, stake);
    button.addEventListener('click', () => placeBet(type, value));
    return button;
}

function buildBoard() {
    const board = el('roulette-board');
    const numbers = document.createElement('div');
    numbers.className = 'roulette-numbers';
    numbers.appendChild(createBetCell('straight', 0, '0', 'is-green is-zero'));
    for (let n = 1; n <= 36; n++) {
        const cell = createBetCell('straight', n, String(n), `is-${rouletteColor(n)}`);
        cell.setAttribute('aria-label', `${n} ${colorLabel(rouletteColor(n))}`);
        numbers.appendChild(cell);
    }
    for (let column = 1; column <= 3; column++) {
        numbers.appendChild(createBetCell('column', column, '2to1', 'is-outside'));
    }

    const dozens = document.createElement('div');
    dozens.className = 'roulette-dozens';
    ['1〜12', '13〜24', '25〜36'].forEach((label, index) => {
        dozens.appendChild(createBetCell('dozen', index + 1, label, 'is-outside'));
    });

    const evens = document.createElement('div');
    evens.className = 'roulette-evens';
    OUTSIDE_BETS.forEach(({ type, label }) => {
        const extra = type === 'red' ? 'is-red' : type === 'black' ? 'is-black' : 'is-outside';
        evens.appendChild(createBetCell(type, null, label, extra));
    });

    board.append(numbers, dozens, evens);
}

function buildWheel() {
    const svg = el('roulette-wheel');
    const ns = 'http://www.w3.org/2000/svg';
    const count = ROULETTE_WHEEL_ORDER.length;
    const step = (Math.PI * 2) / count;
    const point = (radius, angle) => [100 + radius * Math.sin(angle), 100 - radius * Math.cos(angle)];

    const rim = document.createElementNS(ns, 'circle');
    rim.setAttribute('cx', '100');
    rim.setAttribute('cy', '100');
    rim.setAttribute('r', '99');
    rim.setAttribute('class', 'roulette-rim');
    svg.appendChild(rim);

    ROULETTE_WHEEL_ORDER.forEach((number, index) => {
        // ポケット index の中心が真上から index*step の位置に来るように並べる
        const start = index * step - step / 2;
        const end = start + step;
        const [x1, y1] = point(94, start);
        const [x2, y2] = point(94, end);
        const [x3, y3] = point(58, end);
        const [x4, y4] = point(58, start);
        const wedge = document.createElementNS(ns, 'path');
        wedge.setAttribute('d', `M${x1} ${y1} A94 94 0 0 1 ${x2} ${y2} L${x3} ${y3} A58 58 0 0 0 ${x4} ${y4}Z`);
        wedge.setAttribute('class', `roulette-pocket is-${rouletteColor(number)}`);
        svg.appendChild(wedge);

        const [lx, ly] = point(81, index * step);
        const label = document.createElementNS(ns, 'text');
        label.setAttribute('x', lx.toFixed(2));
        label.setAttribute('y', ly.toFixed(2));
        label.setAttribute('transform', `rotate(${(index * 360) / count} ${lx.toFixed(2)} ${ly.toFixed(2)})`);
        label.setAttribute('class', 'roulette-number');
        label.textContent = number;
        svg.appendChild(label);
    });

    const hub = document.createElementNS(ns, 'circle');
    hub.setAttribute('cx', '100');
    hub.setAttribute('cy', '100');
    hub.setAttribute('r', '56');
    hub.setAttribute('class', 'roulette-hub');
    svg.appendChild(hub);

    const cap = document.createElementNS(ns, 'circle');
    cap.setAttribute('cx', '100');
    cap.setAttribute('cy', '100');
    cap.setAttribute('r', '14');
    cap.setAttribute('class', 'roulette-cap');
    svg.appendChild(cap);
}

// ------------------------------------------------------------------
// 起動
// ------------------------------------------------------------------
async function refreshCasino() {
    const data = await callCasino('status');
    casino.score = data.score;
    if (data.session) {
        openTable(data.session);
    } else {
        casino.session = null;
        renderLobby();
    }
    if (data.autoSettled) {
        showMessage(el('casino-lobby-message'), settledMessage(data.autoSettled), 'info');
    }
}

function loadChipPreference() {
    try {
        const saved = Number(localStorage.getItem(CASINO_CHIP_STORAGE_KEY));
        if ([1, 5, 10, 50, 100].includes(saved)) casino.chip = saved;
    } catch (error) {
        // 保存できない環境では既定値のまま
    }
}

function bindEvents() {
    el('casino-enter-form').addEventListener('submit', enterTable);
    document.querySelectorAll('.casino-presets [data-buyin]').forEach(button => {
        button.addEventListener('click', () => {
            const value = button.dataset.buyin === 'all' ? casino.score : Number(button.dataset.buyin);
            el('casino-buyin').value = String(Math.min(value, casino.score));
        });
    });
    document.querySelectorAll('.casino-chip-picker [data-chip]').forEach(button => {
        button.addEventListener('click', () => {
            casino.chip = Number(button.dataset.chip);
            try { localStorage.setItem(CASINO_CHIP_STORAGE_KEY, String(casino.chip)); } catch (error) { /* 無視 */ }
            renderBetControls();
        });
    });
    el('casino-undo-button').addEventListener('click', undoBet);
    el('casino-clear-button').addEventListener('click', clearBets);
    el('casino-rebet-button').addEventListener('click', rebet);
    el('casino-spin-button').addEventListener('click', spin);
    el('casino-settle-button').addEventListener('click', settle);
}

async function initCasino() {
    loadChipPreference();
    buildWheel();
    buildBoard();
    bindEvents();
    showView('loading');

    if (!await ensureCasinoLogin()) {
        showView('login');
        return;
    }
    try {
        await refreshCasino();
    } catch (error) {
        showView('lobby');
        showMessage(el('casino-lobby-message'), error.message, 'error');
    }
}

document.addEventListener('DOMContentLoaded', initCasino);
