// ゲームタブ: 船底 (レートが上限 (既定1000) 以下の人の地下労働)
//   積荷の仕分けで金貨を稼ぎ、チンチロで班長に勝つとレートになる。レートが上限を超えると船底を出て、残った金貨は没収。
//   積荷の並び・採点・サイコロの目・金貨とレートの増減はすべて Cloud Function (underground) が決める
//   (ルールは functions/underground.js)。この画面は答えを集めて送り、返ってきた結果を見せるだけ。
//   積荷の絵柄はスロットと同じ (SLOT_SYMBOLS と画像は game-slot.js)。画面の切り替えは game.js。

// 木箱と、そこに入れる積荷 (functions/underground.js の CARGO_BINS と同じ。表示用)
const UG_BINS = [
    { key: 'treasure', name: '財宝箱', items: ['chest', 'coin'] },
    { key: 'barrel', name: '酒樽', items: ['rum'] },
    { key: 'tools', name: '航海道具', items: ['compass', 'map', 'anchor'] },
    { key: 'cage', name: '鳥かご', items: ['parrot'] },
    { key: 'overboard', name: '海へ捨てる', items: ['wild'] }
];
const UG_BIN_OF = Object.fromEntries(UG_BINS.flatMap(bin => bin.items.map(item => [item, bin.key])));
const UG_QUEUE_PREVIEW = 3;          // 次に来る積荷を何個見せるか
const UG_TIMER_TICK_MS = 100;
const UG_DIE_SHAKE_MS = 520;         // サイコロを振っている間
const UG_ROLL_GAP_MS = 380;          // 振り直しの間
const UG_TURN_GAP_MS = 600;          // 班長から自分に番が移る間
// 1の目の並び (3 × 3 の升目のどこに目を打つか。1〜9 は左上から)
const UG_PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };

// 役と倍率 (functions/underground.js と同じ。表示用)
const UG_HAND_TABLE = [
    { name: 'ピンゾロ (1・1・1)', note: '出た時点で勝ち', odds: '0.8%', mult: '5倍' },
    { name: 'ゾロ目 (2〜6 が3つ)', note: '出た時点で勝ち', odds: '4.1%', mult: '3倍' },
    { name: 'シゴロ (4・5・6)', note: '出た時点で勝ち', odds: '4.9%', mult: '2倍' },
    { name: '目 (2つ揃い + 1つ)', note: '残りの1つの数で比べる', odds: '72.9%', mult: '1倍' },
    { name: '目なし (3回振っても役なし)', note: '出た時点で負け', odds: '12.5%', mult: '1倍払い' },
    { name: 'ヒフミ (1・2・3)', note: '出た時点で負け', odds: '4.9%', mult: '2倍払い' }
];

const ug = {
    open: false,
    loaded: false,
    loading: false,
    busy: false,
    state: null,        // サーバーから最後に受け取った状態
    bet: 10,
    work: null,         // 仕分けの最中: { id, items, answers, index, correct, missed, endsAt, timer }
    lastGrade: null
};

async function callUnderground(action, payload = {}) {
    const token = await getFirebaseIdToken();
    if (!token) throw new Error('ログインが切れています。マイページでログインし直してください。');
    const response = await fetch(`${getFunctionsBaseUrl()}/underground`, {
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

function ugSettings() {
    return ug.state?.settings || normalizeUndergroundSettings({});
}

function ugCoins() {
    return ug.state?.underground?.coins || 0;
}

function ugInUnderground() {
    return Boolean(ug.state?.inUnderground);
}

function ugDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, prefersReducedMotion() ? 0 : ms));
}

// ------------------------------------------------------------------
// 絵柄とサイコロ
// ------------------------------------------------------------------
/** 積荷の絵柄。画像が無ければ絵文字で出す */
function ugCargoNode(item, className = 'ug-cargo-icon') {
    const symbol = SLOT_SYMBOLS[item] || { name: item, emoji: '📦' };
    const node = document.createElement('span');
    node.className = className;
    node.title = symbol.name;
    const img = document.createElement('img');
    img.src = `${SLOT_IMAGE_DIR}${item}${SLOT_IMAGE_EXT}`;
    img.alt = symbol.name;
    img.onerror = () => { node.textContent = symbol.emoji; };
    node.appendChild(img);
    return node;
}

function ugDieNode(face) {
    const die = document.createElement('span');
    die.className = 'ug-die';
    setUgDieFace(die, face);
    return die;
}

function setUgDieFace(die, face) {
    die.dataset.face = String(face);
    die.setAttribute('aria-label', `${face}`);
    if (!die.children.length) {
        for (let i = 1; i <= 9; i++) die.appendChild(document.createElement('i'));
    }
    Array.from(die.children).forEach((pip, index) => {
        pip.classList.toggle('is-on', (UG_PIPS[face] || []).includes(index + 1));
    });
}

// ------------------------------------------------------------------
// 状態の表示
// ------------------------------------------------------------------
function renderUnderground() {
    if (!ug.open) return;
    const state = ug.state;
    const settings = ugSettings();
    el('ug-score').textContent = state ? formatRate(state.score) : '—';
    el('ug-coins').textContent = state ? `${ugCoins().toLocaleString('ja-JP')}枚` : '—';
    el('ug-max-bet').textContent = state ? `${(state.maxBet || 0).toLocaleString('ja-JP')}枚` : '—';

    const inside = ugInUnderground();
    el('ug-notice').textContent = !state
        ? '読み込み中...'
        : inside
            ? `レートが${formatRate(settings.maxRate)}を超えるまで働けます。地上に戻ると、残った金貨は没収されます。`
            : `船底に入れるのはレートが${formatRate(settings.maxRate)}以下の人だけです (いまのレート ${formatRate(state.score)})。`;
    el('ug-hold').classList.toggle('is-locked', !inside);
    el('ug-den').classList.toggle('is-locked', !inside);

    el('ug-work-summary').textContent = `1便 ${settings.itemsPerShipment}個・${settings.shipmentSeconds}秒。`
        + `正しい木箱に入れると +${settings.payCorrect}金貨、間違えると −${settings.payMiss}金貨 (1便でマイナスにはなりません)。`
        + ' 数字キー 1〜5 でも仕分けられます。';
    renderUgWorkControls();
    renderUgBetControls();
    renderUgRecent();
}

function renderUgWorkControls() {
    const inside = ugInUnderground();
    const running = Boolean(ug.work);
    el('ug-work-idle').classList.toggle('hidden', running || Boolean(ug.lastGrade));
    el('ug-work-run').classList.toggle('hidden', !running);
    el('ug-work-result').classList.toggle('hidden', running || !ug.lastGrade);
    el('ug-start-button').disabled = ug.busy || !inside;
    el('ug-again-button').disabled = ug.busy || !inside;
    el('ug-bins').querySelectorAll('button').forEach(button => {
        button.disabled = !running;
    });
}

function renderUgBetControls() {
    const settings = ugSettings();
    const max = ug.state?.maxBet || 0;
    const inside = ugInUnderground();
    const canBet = inside && max >= settings.betMin;
    ug.bet = Math.min(Math.max(ug.bet, settings.betMin), Math.max(settings.betMin, max));
    el('ug-bet').textContent = String(ug.bet);
    el('ug-bet-down').disabled = ug.busy || !canBet || ug.bet <= settings.betMin;
    el('ug-bet-up').disabled = ug.busy || !canBet || ug.bet >= max;
    el('ug-roll-button').disabled = ug.busy || !canBet || Boolean(ug.work);
    el('ug-bet-note').textContent = !inside
        ? ''
        : canBet
            ? `賭けられるのは手持ちの1/5まで (負けたときの最大5倍払いに備えて)。勝つと 賭け金 × (1 + 倍率) がレートになります。`
            : `金貨が ${(settings.betMin * 5).toLocaleString('ja-JP')}枚 あれば ${settings.betMin}金貨から賭けられます。まずは積荷を仕分けましょう。`;
}

function describeUgRecent(entry) {
    if (entry.type === 'shipment') {
        return `仕分け 正解${entry.correct}・ミス${entry.missed} → +${entry.coins}金貨`;
    }
    if (entry.type === 'chinchiro') {
        const hands = `班長 ${entry.dealer}${entry.player ? ` / 自分 ${entry.player}` : ''}`;
        if (entry.outcome === 'win') return `チンチロ 勝ち (${hands}) ${entry.bet}金貨 → +${entry.rateDelta}レート`;
        if (entry.outcome === 'lose') return `チンチロ 負け (${hands}) −${-entry.coinsDelta}金貨`;
        return `チンチロ 引き分け (${hands})`;
    }
    if (entry.type === 'release') {
        return entry.forfeited > 0 ? `地上に戻った (金貨${entry.forfeited}枚を没収)` : '地上に戻った';
    }
    return '';
}

function renderUgRecent() {
    const list = el('ug-recent');
    const recent = ug.state?.underground?.recent || [];
    list.innerHTML = '';
    if (!recent.length) {
        const item = document.createElement('li');
        item.textContent = 'まだ何もしていません。';
        list.appendChild(item);
        return;
    }
    recent.forEach(entry => {
        const item = document.createElement('li');
        item.className = `ug-recent-${entry.type}${entry.outcome ? ` is-${entry.outcome}` : ''}`;
        const time = document.createElement('span');
        time.className = 'ug-recent-time';
        time.textContent = formatClock(entry.at);
        const text = document.createElement('span');
        text.textContent = describeUgRecent(entry);
        item.append(time, text);
        list.appendChild(item);
    });
}

function renderUgRules() {
    const settings = ugSettings();
    const rules = [
        `レートが${formatRate(settings.maxRate)}以下の人だけが入れます。${formatRate(settings.maxRate)}を超えたら (チンチロで勝つ・日次補正・借入など) 船底を出て、残った金貨は没収されます。`,
        `積荷の仕分け: 流れてくる積荷を正しい木箱へ。正解 +${settings.payCorrect}金貨、ミス −${settings.payMiss}金貨。1便 ${settings.itemsPerShipment}個・${settings.shipmentSeconds}秒で、何便でも働けます。`,
        '木箱: 財宝箱 = 宝箱・金貨 / 酒樽 = ラム酒 / 航海道具 = 羅針盤・宝の地図・錨 / 鳥かご = オウム / ドクロ旗は海へ捨てる。',
        'チンチロ: 班長が先に振り、役ができるまで3回まで振り直し。班長がピンゾロ・ゾロ目・シゴロならその場で負け、ヒフミ・目なしならその場で勝ち。班長が目なら、あなたが振って比べます。',
        `勝つと 賭け金 × (1 + 倍率) がレートになり、賭けた金貨は消えます${settings.pinhaneRate > 0 ? ` (班長が ${Math.round(settings.pinhaneRate * 100)}% をピンハネ)` : ''}。負けると 賭け金 × 倍率 の金貨を失います。同じ目なら引き分け。`,
        `賭け金は ${settings.betMin}〜${settings.betMax}金貨で、手持ちの1/5まで。`
    ];
    el('ug-rules').innerHTML = '';
    rules.forEach(text => {
        const item = document.createElement('li');
        item.textContent = text;
        el('ug-rules').appendChild(item);
    });
    el('ug-hands').innerHTML = `
        <thead><tr><th>役</th><th>出る確率</th><th>倍率</th></tr></thead>
        <tbody>${UG_HAND_TABLE.map(row => `
            <tr><td>${row.name}<br><small>${row.note}</small></td><td>${row.odds}</td><td>${row.mult}</td></tr>`).join('')}
        </tbody>`;
}

function showUgMessage(text, type = 'info') {
    showMessage(el('ug-message'), text, type);
}

/** サーバーの返事を受け取って画面とゲーム一覧のレートを揃える */
function receiveUnderground(data) {
    ug.state = data;
    ug.loaded = true;
    if (Number.isFinite(Number(data.score))) casino.score = Number(data.score);
    if (data.released) {
        const over = `レートが${formatRate(ugSettings().maxRate)}を超えたので地上に戻りました。`;
        showUgMessage(data.released.forfeited > 0
            ? `${over}残っていた金貨 ${data.released.forfeited}枚 は没収されました。`
            : over, 'success');
    }
    renderUgRules();
    renderUnderground();
}

async function loadUndergroundStatus() {
    if (ug.loading) return;
    ug.loading = true;
    try {
        const data = await callUnderground('status');
        receiveUnderground(data);
        resumeUgShipment(data);
    } catch (error) {
        showUgMessage(error.message, 'error');
    } finally {
        ug.loading = false;
    }
}

function setUgBusy(busy) {
    ug.busy = busy;
    renderUgWorkControls();
    renderUgBetControls();
}

// ------------------------------------------------------------------
// 積荷の仕分け
// ------------------------------------------------------------------
function buildUgBins() {
    const container = el('ug-bins');
    container.innerHTML = '';
    UG_BINS.forEach((bin, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `ug-bin is-${bin.key}`;
        button.dataset.bin = bin.key;
        const icons = document.createElement('span');
        icons.className = 'ug-bin-icons';
        bin.items.forEach(item => icons.appendChild(ugCargoNode(item, 'ug-bin-icon')));
        const name = document.createElement('span');
        name.className = 'ug-bin-name';
        name.textContent = `${index + 1}. ${bin.name}`;
        button.append(icons, name);
        button.addEventListener('click', () => answerUgCargo(bin.key));
        container.appendChild(button);
    });
}

function renderUgCargo() {
    const work = ug.work;
    if (!work) return;
    const cargo = el('ug-cargo');
    cargo.innerHTML = '';
    if (work.index < work.items.length) {
        const item = work.items[work.index];
        cargo.appendChild(ugCargoNode(item, 'ug-cargo-main'));
        const label = document.createElement('span');
        label.className = 'ug-cargo-name';
        label.textContent = SLOT_SYMBOLS[item]?.name || item;
        cargo.appendChild(label);
    }
    const queue = el('ug-queue');
    queue.innerHTML = '';
    work.items.slice(work.index + 1, work.index + 1 + UG_QUEUE_PREVIEW).forEach(item => {
        const li = document.createElement('li');
        li.appendChild(ugCargoNode(item, 'ug-queue-icon'));
        queue.appendChild(li);
    });
    el('ug-progress').textContent = `${work.index} / ${work.items.length}`;
    const settings = ugSettings();
    const earning = Math.max(0, work.correct * settings.payCorrect - work.missed * settings.payMiss);
    el('ug-earning').textContent = `+${earning} 金貨`;
}

function renderUgTimer() {
    const work = ug.work;
    if (!work) return;
    const remaining = Math.max(0, work.endsAt - Date.now());
    const ratio = remaining / (work.seconds * 1000);
    const bar = el('ug-timer-bar');
    bar.style.width = `${(ratio * 100).toFixed(1)}%`;
    bar.classList.toggle('is-low', ratio < 0.25);
    if (remaining <= 0) finishUgShipment();
}

function beginUgWork(shipment, remainingMs) {
    stopUgWork();
    ug.lastGrade = null;
    ug.work = {
        id: shipment.id,
        items: shipment.items,
        seconds: shipment.seconds,
        answers: Array(shipment.items.length).fill(null),
        index: 0,
        correct: 0,
        missed: 0,
        endsAt: Date.now() + remainingMs,
        timer: setInterval(renderUgTimer, UG_TIMER_TICK_MS)
    };
    renderUgWorkControls();
    renderUgBetControls();
    renderUgCargo();
    renderUgTimer();
}

function stopUgWork() {
    if (ug.work?.timer) clearInterval(ug.work.timer);
}

/** 読み込んだときに仕分けの途中の便があれば、残り時間で続きから (答えは最初から) */
function resumeUgShipment(data) {
    const shipment = data.underground?.shipment;
    if (!shipment || ug.work || !data.inUnderground) return;
    const serverNow = Date.parse(data.now) || Date.now();
    const remaining = shipment.seconds * 1000 - (serverNow - Date.parse(shipment.startedAt));
    if (remaining > 3000) beginUgWork(shipment, remaining);
}

async function startUgShipment() {
    if (ug.busy || ug.work || !ugInUnderground()) return;
    setUgBusy(true);
    try {
        const data = await callUnderground('start');
        receiveUnderground(data);
        const shipment = data.underground?.shipment;
        if (shipment) beginUgWork(shipment, shipment.seconds * 1000);
    } catch (error) {
        showUgMessage(error.message, 'error');
        await loadUndergroundStatus();
    } finally {
        setUgBusy(false);
    }
}

function answerUgCargo(binKey) {
    const work = ug.work;
    if (!work || work.finishing || work.index >= work.items.length) return;
    const item = work.items[work.index];
    const ok = UG_BIN_OF[item] === binKey;
    work.answers[work.index] = binKey;
    if (ok) work.correct += 1;
    else work.missed += 1;
    work.index += 1;

    // 答えた木箱を ○ / × で光らせる
    const button = el('ug-bins').querySelector(`[data-bin="${binKey}"]`);
    if (button) {
        button.classList.remove('is-ok', 'is-ng');
        void button.offsetWidth;
        button.classList.add(ok ? 'is-ok' : 'is-ng');
    }
    renderUgCargo();
    if (work.index >= work.items.length) finishUgShipment();
}

async function finishUgShipment() {
    const work = ug.work;
    if (!work || work.finishing) return;
    work.finishing = true;
    stopUgWork();
    setUgBusy(true);
    try {
        const data = await callUnderground('submit', { shipmentId: work.id, answers: work.answers });
        ug.work = null;
        ug.lastGrade = data.grade || null;
        receiveUnderground(data);
        if (data.grade) {
            el('ug-result-head').textContent = `+${data.grade.coins} 金貨`;
            el('ug-result-detail').textContent = `正解 ${data.grade.correct} / ミス ${data.grade.missed}`
                + (data.grade.unanswered ? ` / 間に合わず ${data.grade.unanswered}` : '')
                + `。手持ちの金貨は ${ugCoins().toLocaleString('ja-JP')}枚 です。`;
        }
    } catch (error) {
        ug.work = null;
        ug.lastGrade = null;
        showUgMessage(error.message, 'error');
        await loadUndergroundStatus();
    } finally {
        setUgBusy(false);
        renderUgWorkControls();
    }
}

// ------------------------------------------------------------------
// チンチロ
// ------------------------------------------------------------------
function clearUgBowl(id) {
    el(id).innerHTML = '';
}

/** 1回ぶん振る演出。サイコロを転がしてから出目で止める */
async function animateUgRoll(bowlId, dice) {
    const bowl = el(bowlId);
    bowl.innerHTML = '';
    const nodes = dice.map(() => {
        const die = ugDieNode(1 + Math.floor(Math.random() * 6));
        die.classList.add('is-rolling');
        bowl.appendChild(die);
        return die;
    });
    if (!prefersReducedMotion()) {
        const until = Date.now() + UG_DIE_SHAKE_MS;
        while (Date.now() < until) {
            nodes.forEach(die => setUgDieFace(die, 1 + Math.floor(Math.random() * 6)));
            await new Promise(resolve => setTimeout(resolve, 70));
        }
    }
    nodes.forEach((die, index) => {
        die.classList.remove('is-rolling');
        setUgDieFace(die, dice[index]);
    });
}

/** 班長か自分の番 (最大3回振る) を順に見せ、最後に役の名前を出す */
async function animateUgTurn(bowlId, handId, turn) {
    el(handId).textContent = '';
    for (let i = 0; i < turn.rolls.length; i++) {
        el(handId).textContent = turn.rolls.length > 1 ? `${i + 1}投目…` : '';
        await animateUgRoll(bowlId, turn.rolls[i]);
        if (i < turn.rolls.length - 1) {
            el(handId).textContent = `${i + 1}投目: 役なし`;
            await ugDelay(UG_ROLL_GAP_MS);
        }
    }
    el(handId).textContent = turn.hand.label;
    el(handId).dataset.kind = turn.hand.kind;
}

function ugOutcomeText(game) {
    const dealer = game.dealer.hand.label;
    const player = game.player ? game.player.hand.label : '';
    let head;
    if (game.decidedBy === 'dealer') {
        head = game.outcome === 'win' ? `班長が${dealer}！` : `班長の${dealer}。`;
    } else if (game.decidedBy === 'player') {
        head = `あなたの${player}${game.outcome === 'win' ? '！' : '。'}`;
    } else {
        head = `班長 ${dealer} 対 あなた ${player}。`;
    }
    if (game.outcome === 'win') {
        return `${head} 勝ち → +${game.rateDelta.toLocaleString('ja-JP')} レート`
            + (game.pinhane > 0 ? ` (ピンハネ ${game.pinhane})` : '');
    }
    if (game.outcome === 'lose') {
        return `${head} 負け → −${(-game.coinsDelta).toLocaleString('ja-JP')} 金貨${game.multiplier > 1 ? ` (${game.multiplier}倍払い)` : ''}`;
    }
    return `${head} 引き分け`;
}

async function playUgChinchiro() {
    if (ug.busy || ug.work || !ugInUnderground()) return;
    const bet = ug.bet;
    setUgBusy(true);
    const outcome = el('ug-outcome');
    outcome.textContent = '';
    outcome.removeAttribute('data-outcome');
    clearUgBowl('ug-dealer-dice');
    clearUgBowl('ug-player-dice');
    el('ug-dealer-hand').textContent = '';
    el('ug-player-hand').textContent = '';
    try {
        const data = await callUnderground('chinchiro', { bet });
        const game = data.chinchiro;
        if (game) {
            await animateUgTurn('ug-dealer-dice', 'ug-dealer-hand', game.dealer);
            if (game.player) {
                await ugDelay(UG_TURN_GAP_MS);
                await animateUgTurn('ug-player-dice', 'ug-player-hand', game.player);
            } else {
                el('ug-player-hand').textContent = '振るまでもなく決着';
            }
            outcome.textContent = ugOutcomeText(game);
            outcome.dataset.outcome = game.outcome;
        }
        receiveUnderground(data);
    } catch (error) {
        showUgMessage(error.message, 'error');
        await loadUndergroundStatus();
    } finally {
        setUgBusy(false);
    }
}

function stepUgBet(direction) {
    const settings = ugSettings();
    const max = ug.state?.maxBet || 0;
    const top = Math.min(max, settings.betMax);
    const steps = [settings.betMin, 20, 30, 50, 100, 200, 500, 1000, top]
        .filter(value => value >= settings.betMin && value <= top);
    const unique = [...new Set(steps)].sort((a, b) => a - b);
    if (!unique.length) return;
    if (direction > 0) ug.bet = unique.find(value => value > ug.bet) ?? unique[unique.length - 1];
    else ug.bet = [...unique].reverse().find(value => value < ug.bet) ?? unique[0];
    renderUgBetControls();
}

// ------------------------------------------------------------------
// 開く・閉じる (game.js の renderRoute から呼ぶ)
// ------------------------------------------------------------------
function openUnderground() {
    const wasOpen = ug.open;
    ug.open = true;
    if (!ug.loaded) {
        renderUgRules();
        renderUnderground();
    }
    // 開くたびに最新の状態を取り直す (仕分けの最中は取り直さない)
    if (!wasOpen && !ug.work) loadUndergroundStatus();
}

function closeUnderground() {
    if (!ug.open) return;
    ug.open = false;
    // 仕分けの途中で画面を離れたら、そこまでの答えで締める
    if (ug.work) finishUgShipment();
}

/** 船底に入れるレートの上限。状態を読む前は、公開の設定から読んだ値 (それも無ければ既定値) */
function undergroundMaxRate() {
    return ug.state?.settings?.maxRate ?? ug.maxRate ?? UNDERGROUND_SETTING_DEFAULTS.underground_max_rate;
}

/** ゲーム一覧のタイルの説明に、入れるレートの上限を出す */
function renderUndergroundTile() {
    const desc = el('ug-tile-desc');
    if (desc) desc.textContent = `レートが${formatRate(undergroundMaxRate())}以下の人の地下労働。積荷を仕分けて金貨を稼ぎ、チンチロで地上をめざす`;
}

/** 入れるレートの上限を設定 (誰でも読める settings/app) から読んでおく。ゲーム一覧の札と説明に使う */
async function loadUndergroundMaxRate() {
    try {
        const db = getFirestoreDb();
        if (!db) return;
        const doc = await db.collection('settings').doc('app').get();
        ug.maxRate = normalizeUndergroundSettings(doc.exists ? doc.data() : {}).maxRate;
        if (casino.ready && !location.hash.slice(1)) renderMenu();
        else renderUndergroundTile();
    } catch (error) {
        console.warn('船底の設定を読めませんでした:', error);
    }
}

function initUnderground() {
    if (!el('underground-view')) return;
    loadUndergroundMaxRate();
    // ゲーム一覧のタイルのサイコロ (シゴロ)
    document.querySelectorAll('.game-tile-art.is-underground .ug-die').forEach(die => setUgDieFace(die, Number(die.dataset.face)));
    buildUgBins();
    el('ug-start-button').addEventListener('click', startUgShipment);
    el('ug-again-button').addEventListener('click', () => {
        ug.lastGrade = null;
        startUgShipment();
    });
    el('ug-roll-button').addEventListener('click', playUgChinchiro);
    el('ug-bet-down').addEventListener('click', () => stepUgBet(-1));
    el('ug-bet-up').addEventListener('click', () => stepUgBet(1));
    // 数字キー 1〜5 で木箱を選ぶ
    document.addEventListener('keydown', event => {
        if (!ug.open || !ug.work || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
        const index = Number(event.key) - 1;
        if (Number.isInteger(index) && index >= 0 && index < UG_BINS.length) {
            event.preventDefault();
            answerUgCargo(UG_BINS[index].key);
        }
    });
}
