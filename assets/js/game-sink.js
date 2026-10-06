// ゲームタブ: 沈没 (全員共通の1卓のチキンレース)
//   運賃は最初に乗った人が決め、2人以上そろうと出港する。船は出港から10〜30秒のどこかで沈む (いつかはサーバーだけが知っている)。
//   沈む前に「飛び降りる」を押した人のうち、いちばん最後に飛び降りた1人が総取り。誰が飛び降りたかは結果まで見えない。
//   全員沈んだら賞金は「海の底の財宝」として次の便へ持ち越す。
//   沈む時刻・勝ち負け・払い戻しはすべて Cloud Function (casino の skBoard / skLeave / skReady / skJump / skTick) が決める
//   (ルールと進め方は functions/sink-table.js)。船の様子は誰でも読める写し (sink_public/main) を読み直して反映し、
//   航海のあいだは skTick を送り続けて、沈んだらすぐ結果を受け取る。
//   海の水位は浸水の進み具合で、満水になったときに沈む。skTick の返事の「いまの水位と、いまの速さ」で描き、
//   次の返事までその速さで進める (速さは途中で変わる。この先の速さはサーバーしか知らない)。
//   財布 (使えるレート) の表示と画面の切り替えは game.js。

const SINK_POLL_MS = 1200;        // 船の写しを読み直す間隔
const SINK_CLOCK_MS = 100;        // 経過時間の表示を進める間隔
const SINK_SAIL_TICK_MS = 1000;   // 航海のあいだ skTick を送る間隔 (沈んだかどうかと、いまの浸水を確かめる)
const SINK_SEA_HOLD = 0.985;      // 返事を待つあいだに先回りして進めてよい水位の上限 (満水はサーバーが沈んだと言ってから)
const SINK_FALLBACK_RULES = { fares: [10, 50, 100, 500, 1000, 5000], minPlayers: 2, maxPlayers: 8, rake: 0.05, minMs: 10000, maxMs: 30000 };

const sk = {
    table: null,          // 最後に受け取った船 (公開の形)
    offset: 0,            // サーバーの時刻 − 端末の時刻
    jumpMs: null,         // 自分が飛び降りた時刻 (出港から。サーバーの返事から)
    jumpRound: 0,         // jumpMs がどの便のものか
    sea: null,            // いまの浸水 { roundNo, progress, rate (1ミリ秒あたり), at (受け取った端末の時刻) }
    busy: false,
    open: false,
    pollTimer: null,
    clockTimer: null,
    polling: false,
    tickedKey: '',        // skTick を送った締め切り (同じ締め切りに何度も送らない)
    lastSailTick: 0,
    celebrated: 0         // 結果の演出を出した便
};

function applySinkClock(iso) {
    const server = Date.parse(iso);
    if (Number.isFinite(server)) sk.offset = server - Date.now();
}

function sinkNow() {
    return Date.now() + sk.offset;
}

function sinkRules() {
    return sk.table?.rules || SINK_FALLBACK_RULES;
}

function sinkSecondsLeft(iso) {
    if (!iso) return null;
    return Math.max(0, Math.ceil((Date.parse(iso) - sinkNow()) / 1000));
}

function formatSinkSeconds(ms) {
    return `${(Math.max(0, ms) / 1000).toFixed(1)}秒`;
}

function sinkAboard(table = sk.table) {
    return Boolean(table && table.players.some(player => player.name === myName()));
}

/** 船に乗っていて、まだ結果が出ていない (精算できない) */
function isSinkLive() {
    return Boolean(sk.table && sk.table.phase !== 'result' && sinkAboard());
}

function myJumpMs() {
    return sk.table && sk.jumpRound === sk.table.roundNo ? sk.jumpMs : null;
}

function showSinkMessage(text, type = 'info') {
    showMessage(el('sk-message'), text, type);
}

// ------------------------------------------------------------------
// 船を受け取る
// ------------------------------------------------------------------
/** 届いた船を反映する。mine (本人の分) と sea (いまの浸水) はサーバーの返事にだけ入る */
function receiveSinkTable(table, now, mine = null, sea = null) {
    if (now) applySinkClock(now);
    if (!table) return;
    if (sk.table && table.seq < sk.table.seq && table.roundNo <= sk.table.roundNo) return;
    sk.table = table;
    if (mine) {
        sk.jumpMs = mine.jumpMs;
        sk.jumpRound = table.roundNo;
    }
    if (sea) sk.sea = { ...sea, at: Date.now() };
    // 出港したのに、この便の浸水をまだ受け取っていなければすぐ確かめる
    if (table.phase === 'sailing' && sk.sea?.roundNo !== table.roundNo) sk.lastSailTick = 0;
    renderSinkView();
}

function receiveSinkAction(data) {
    receiveSinkTable(data.sink, data.now, data.sinkMine, data.sinkSea);
    if (data.session) {
        casino.session = data.session;
        renderWallet();
        renderSinkRecent();
    } else if (casino.session) {
        // チップが尽きて精算された (または時間切れで精算されていた)
        refreshCasino().catch(() => {});
    }
}

async function pollSinkTable() {
    if (sk.polling || document.hidden || routeGame() !== 'sink') return;
    sk.polling = true;
    try {
        const doc = await getFirestoreDb().collection('sink_public').doc('main').get();
        if (doc.exists) receiveSinkTable(doc.data());
    } catch (error) {
        console.warn('沈没の船の読み込みに失敗:', error);
    } finally {
        sk.polling = false;
    }
}

async function sendSinkTick() {
    try {
        receiveSinkAction(await callCasino('skTick'));
    } catch (error) {
        console.warn('沈没の船を進められませんでした:', error);
    }
}

// ------------------------------------------------------------------
// 表示
// ------------------------------------------------------------------
function renderSinkView() {
    if (!sk.table || !el('sk-sea')) return;
    renderSinkStatus();
    renderSinkSea();
    renderSinkCrew();
    renderSinkControls();
    renderSinkResult();
    renderSinkTile();
    celebrateSinkResult();
}

function renderSinkStatus() {
    const table = sk.table;
    const rules = sinkRules();
    el('sk-carry').textContent = table.carry.toLocaleString('ja-JP');
    let text = '';
    if (table.phase === 'waiting') {
        text = table.players.length
            ? `${table.players[0].name} が乗って待っています。あと${rules.minPlayers - table.players.length}人で出港の受付が始まります`
            : `船は港で待っています。運賃を選んで乗ってください (${rules.minPlayers}人から出港)`;
    } else if (table.phase === 'boarding') {
        text = `出港まで あと${sinkSecondsLeft(table.boardingEndsAt)}秒 (${table.players.length}人)`;
    } else if (table.phase === 'sailing') {
        const jumped = myJumpMs();
        text = !sinkAboard() ? '航海中… (この便には乗っていません)'
            : jumped !== null ? `${formatSinkSeconds(jumped)}で飛び降りました。結果を待っています…`
                : '沈む前に飛び降りろ！ 最後に飛び降りた1人が総取り';
    } else if (table.phase === 'result') {
        text = `沈没！ 次の便まで ${sinkSecondsLeft(table.nextRoundAt)}秒`;
    }
    el('sk-status').textContent = text;
    el('sk-fare').textContent = table.fare ? `運賃 ${table.fare.toLocaleString('ja-JP')} ・ 賞金 ${sinkPrize(table).toLocaleString('ja-JP')}` : '';
}

/** いま沈んだときに勝った人がもらう額 (運賃の合計 − 運営の取り分 + 海の底の財宝) */
function sinkPrize(table) {
    if (table.result) return table.result.prize;
    const pot = (table.fare || 0) * table.players.length;
    return pot - Math.floor(pot * sinkRules().rake) + table.carry;
}

/** いまの浸水 (0〜1)。航海中は最後に受け取った水位を、そのときの速さで進める。沈んだら 1 */
function sinkProgress(table = sk.table) {
    if (!table) return 0;
    if (table.phase === 'result') return 1;
    const sea = sk.sea;
    if (table.phase !== 'sailing' || !sea || sea.roundNo !== table.roundNo) return 0;
    return Math.min(SINK_SEA_HOLD, Math.max(0, sea.progress + sea.rate * (Date.now() - sea.at)));
}

/** 海と船: 水位は浸水の進み具合。満水になると船が水の下に沈みきる */
function renderSinkSea() {
    const table = sk.table;
    const sea = el('sk-sea');
    sea.dataset.phase = table.phase;
    const progress = sinkProgress(table);
    sea.style.setProperty('--sink', progress.toFixed(4));
    let elapsed = 0;
    if (table.phase === 'sailing' && table.departAt) elapsed = sinkNow() - Date.parse(table.departAt);
    el('sk-timer').textContent = table.phase === 'sailing' ? formatSinkSeconds(elapsed)
        : table.phase === 'result' && table.result ? `${formatSinkSeconds(table.result.sinkMs)}で沈没` : '';
}

function renderSinkCrew() {
    const table = sk.table;
    const list = el('sk-crew');
    list.innerHTML = '';
    if (table.phase === 'result' && table.result) {
        table.result.jumps.forEach(entry => {
            const item = document.createElement('li');
            const won = entry.name === table.result.winner;
            item.className = won ? 'is-winner' : entry.ms === null || entry.ms >= table.result.sinkMs ? 'is-sunk' : 'is-jumped';
            item.textContent = `${won ? '👑 ' : ''}${entry.name}${entry.name === myName() ? ' (自分)' : ''} `
                + (entry.ms === null || entry.ms >= table.result.sinkMs ? '— 船と一緒に沈没' : `— ${formatSinkSeconds(entry.ms)}で飛び降り`);
            list.appendChild(item);
        });
        return;
    }
    table.players.forEach(player => {
        const item = document.createElement('li');
        const me = player.name === myName();
        let mark = '';
        if (table.phase === 'boarding') mark = player.ready ? ' ✓' : '';
        if (table.phase === 'sailing') mark = me && myJumpMs() !== null ? ' (飛び降りた)' : ' ？';
        item.textContent = `${player.name}${me ? ' (自分)' : ''}${mark}`;
        if (me) item.classList.add('is-me');
        list.appendChild(item);
    });
}

function renderSinkControls() {
    const table = sk.table;
    if (!table || !el('sk-controls')) return;
    const rules = sinkRules();
    const aboard = sinkAboard();
    const chips = casino.session?.chips ?? 0;
    const busy = sk.busy || casino.busy || !casino.session;
    const open = table.phase === 'waiting' || table.phase === 'boarding';
    const choosing = table.phase === 'waiting' && !table.players.length;
    const fares = el('sk-fares');
    fares.classList.toggle('hidden', !choosing);
    if (choosing) {
        fares.querySelectorAll('button').forEach(button => {
            button.disabled = busy || Number(button.dataset.fare) > chips;
        });
    }
    const board = el('sk-board-button');
    const canBoard = open && !aboard && table.fare && table.players.length < rules.maxPlayers;
    board.classList.toggle('hidden', !canBoard);
    if (canBoard) {
        board.textContent = `乗船する (運賃 ${table.fare.toLocaleString('ja-JP')})`;
        board.disabled = busy || table.fare > chips;
    }
    const meReady = table.players.some(player => player.name === myName() && player.ready);
    el('sk-ready-button').classList.toggle('hidden', !(aboard && table.phase === 'boarding'));
    el('sk-ready-button').disabled = busy || meReady;
    el('sk-ready-button').textContent = meReady ? '出港準備OK (ほかの人を待っています)' : '出港準備OK';
    el('sk-leave-button').classList.toggle('hidden', !(aboard && open));
    el('sk-leave-button').disabled = busy;
    const canJump = aboard && table.phase === 'sailing' && myJumpMs() === null;
    el('sk-jump-button').classList.toggle('hidden', !canJump);
    el('sk-jump-button').disabled = sk.busy;
    let note = '';
    if (open && !aboard && table.fare && table.fare > chips) note = `使えるレートが運賃 (${table.fare.toLocaleString('ja-JP')}) に足りません。`;
    else if (open && !aboard && table.players.length >= rules.maxPlayers) note = '満員です。次の便を待ってください。';
    else if (table.phase === 'sailing' && !aboard) note = '次の便を待ってください。';
    el('sk-note').textContent = note;
}

function renderSinkResult() {
    const table = sk.table;
    const box = el('sk-result');
    const result = table.phase === 'result' ? table.result : null;
    box.classList.toggle('hidden', !result);
    if (!result || box.dataset.round === String(result.roundNo)) return;
    box.dataset.round = String(result.roundNo);
    box.innerHTML = '';
    const head = document.createElement('p');
    head.className = 'sk-result-head';
    head.textContent = result.winner
        ? `👑 ${result.winner} が総取り！ +${result.prize.toLocaleString('ja-JP')}`
        : `全員沈没… 賞金 ${result.prize.toLocaleString('ja-JP')} は海の底へ (次の便に持ち越し)`;
    const sub = document.createElement('p');
    sub.className = 'sk-result-sub';
    sub.textContent = `運賃 ${result.fare.toLocaleString('ja-JP')} × ${result.jumps.length}人`
        + (result.carryIn ? ` ＋ 海の底の財宝 ${result.carryIn.toLocaleString('ja-JP')}` : '')
        + ` ・ ${formatSinkSeconds(result.sinkMs)}で沈没`;
    box.append(head, sub);
}

function renderSinkRecent() {
    const list = el('sk-recent');
    if (!list) return;
    list.innerHTML = '';
    (casino.session?.sink?.recent || []).forEach(item => {
        const li = document.createElement('li');
        const net = item.returned - item.bet;
        li.className = `bj-pip ${item.won ? 'is-plus' : 'is-minus'}`;
        li.textContent = formatSigned(net);
        li.title = `運賃 ${item.bet} / ${item.won ? `総取り ${item.returned}` : item.jumpMs === null || item.jumpMs >= item.sinkMs ? '沈没' : `${(item.jumpMs / 1000).toFixed(1)}秒で飛び降り`}`
            + ` (${(item.sinkMs / 1000).toFixed(1)}秒で沈没)`;
        list.appendChild(li);
    });
}

/** ゲーム一覧のタイル: 乗っている人数と海の底の財宝 */
function renderSinkTile() {
    const live = el('sk-tile-live');
    if (!live) return;
    const table = sk.table;
    if (!table) {
        live.textContent = '';
        return;
    }
    const people = table.players.length;
    const parts = [];
    if (people) parts.push(`${table.phase === 'sailing' ? '航海中' : '乗船'} ${people}人`);
    if (table.carry) parts.push(`財宝 ${table.carry.toLocaleString('ja-JP')}`);
    live.textContent = parts.join(' ・ ');
    live.classList.toggle('is-busy', people > 0);
}

function sinkTileBadge() {
    const table = sk.table;
    if (!table) return '';
    if (isSinkLive()) return '乗船中';
    if (table.phase === 'waiting' && table.players.length) return '乗員募集中';
    if (table.phase === 'boarding') return 'まもなく出港';
    return '';
}

// ------------------------------------------------------------------
// 結果の演出
// ------------------------------------------------------------------
function celebrateSinkResult() {
    const table = sk.table;
    const result = table?.phase === 'result' ? table.result : null;
    if (!result || sk.celebrated === result.roundNo) return;
    sk.celebrated = result.roundNo;
    if (!sk.open) return;
    const mine = result.jumps.find(entry => entry.name === myName());
    if (!mine) return;
    if (result.winner === myName()) {
        strobeScreen(['white', 'gold', 'white']);
        burstCoins(Math.min(60, 20 + result.jumps.length * 6), el('sk-sea'));
        buzz([200, 80, 200, 80, 500]);
        showSinkMessage(`🎉 最後まで粘って総取り！ +${result.prize.toLocaleString('ja-JP')}`, 'success');
    } else if (mine.ms === null || mine.ms >= result.sinkMs) {
        flashScreen('red');
        buzz([300]);
        showSinkMessage('船と一緒に沈んでしまいました…', 'info');
    } else {
        showSinkMessage(`${formatSinkSeconds(mine.ms)}で飛び降りました。${result.winner ? `${result.winner} のほうが粘りました` : ''}`, 'info');
    }
    // 総取りのチップが入った財布を読み直す
    sendSinkTick();
}

// ------------------------------------------------------------------
// 操作
// ------------------------------------------------------------------
async function sinkAction(action, payload = {}) {
    if (sk.busy) return;
    sk.busy = true;
    renderSinkControls();
    try {
        receiveSinkAction(await callCasino(action, payload));
    } catch (error) {
        showSinkMessage(error.message, 'error');
        await sendSinkTick();
    } finally {
        sk.busy = false;
        renderSinkControls();
        renderSettleButton();
    }
}

function boardSinkShip(fare) {
    return sinkAction('skBoard', fare ? { fare } : {});
}

async function jumpSinkShip() {
    if (sk.busy) return;
    buzz(40);
    await sinkAction('skJump');
}

// ------------------------------------------------------------------
// 時計: 経過時間の表示、締め切りの skTick、航海中の skTick
// ------------------------------------------------------------------
function sinkDeadline(table) {
    if (table.phase === 'waiting') return table.players.length ? table.lonelyEndsAt : null;
    if (table.phase === 'boarding') return table.boardingEndsAt;
    if (table.phase === 'result') return table.nextRoundAt;
    return null;
}

function tickSinkClock() {
    const table = sk.table;
    if (!table) return;
    if (table.phase === 'sailing' || table.phase === 'boarding' || table.phase === 'result') {
        renderSinkSea();
        renderSinkStatus();
    }
    if (table.phase === 'sailing') {
        if (Date.now() - sk.lastSailTick >= SINK_SAIL_TICK_MS) {
            sk.lastSailTick = Date.now();
            sendSinkTick();
        }
        return;
    }
    const deadline = sinkDeadline(table);
    if (!deadline || sk.tickedKey === deadline || sinkNow() < Date.parse(deadline) + 300) return;
    sk.tickedKey = deadline;
    setTimeout(async () => {
        await sendSinkTick();
        setTimeout(() => {
            if (sk.tickedKey === deadline) sk.tickedKey = '';
        }, 2000);
    }, Math.random() * 500);
}

// ------------------------------------------------------------------
// 開く・閉じる (game.js の renderRoute から呼ぶ)
// ------------------------------------------------------------------
function openSinkTable() {
    if (sk.open) return;
    sk.open = true;
    renderSinkView();
    renderSinkRecent();
    sendSinkTick();
    sk.pollTimer = setInterval(pollSinkTable, SINK_POLL_MS);
    sk.clockTimer = setInterval(tickSinkClock, SINK_CLOCK_MS);
}

function closeSinkTable() {
    if (!sk.open) return;
    sk.open = false;
    clearInterval(sk.pollTimer);
    clearInterval(sk.clockTimer);
    sk.pollTimer = null;
    sk.clockTimer = null;
}

/** game.js の setCasinoBusy から呼ぶ */
function renderSinkControlsIfReady() {
    if (sk.table) renderSinkControls();
}

function initSink() {
    if (!el('sink-table')) return;
    const fares = el('sk-fares');
    SINK_FALLBACK_RULES.fares.forEach(fare => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.fare = String(fare);
        button.textContent = fare.toLocaleString('ja-JP');
        button.addEventListener('click', () => boardSinkShip(fare));
        fares.appendChild(button);
    });
    el('sk-board-button').addEventListener('click', () => boardSinkShip(null));
    el('sk-ready-button').addEventListener('click', () => sinkAction('skReady'));
    el('sk-leave-button').addEventListener('click', () => sinkAction('skLeave'));
    el('sk-jump-button').addEventListener('click', jumpSinkShip);
}
