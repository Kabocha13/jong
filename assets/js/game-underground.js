// ゲームタブ: 船底 (レートが上限 (既定1000) 未満の人の地下労働)
//   流れてくる積荷を正しい木箱に仕分けるたびにレートが上がる (既定 +1、上限まで)。時間の制限はない。
//   積荷の並び・採点・レートの増減はすべて Cloud Function (underground) が決める (ルールは functions/underground.js)。
//   積荷はサーバーから1回ぶん (既定20個) ずつ受け取り、答えをまとめて送る。送った返事に次の積荷も入っているので、
//   画面では途切れずに流れる。積荷の絵柄はスロットと同じ (SLOT_SYMBOLS と画像は game-slot.js)。画面の切り替えは game.js。
//   チンチロは 50.5 で休止した (コードは 50.4 までの git の履歴にある)。

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

const ug = {
    open: false,
    loaded: false,
    loading: false,
    busy: false,
    state: null,        // サーバーから最後に受け取った状態
    maxRate: undefined, // 状態を読む前に、公開の設定から読んだ上限
    work: null,         // 仕分けの最中: { id, items, answers, index, correct, missed, sending }
    session: null,      // 今回 (始めてからやめるまで) の合計: { correct, missed, delta }
    lastSession: null   // やめたあとに見せる今回の合計
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

/** 船底で仕分けできるレートの上限。状態を読む前は、公開の設定から読んだ値 (それも無ければ既定値) */
function undergroundMaxRate() {
    return ug.state?.settings?.maxRate ?? ug.maxRate ?? UNDERGROUND_SETTING_DEFAULTS.underground_max_rate;
}

function ugCanWork() {
    return Boolean(ug.state?.canWork);
}

/** 仕分けの最中の見込みのレート (サーバーの値 + まだ送っていない今回ぶん。上限まで) */
function ugPendingScore() {
    const score = Number(ug.state?.score) || 0;
    const work = ug.work;
    if (!work) return score;
    const settings = ugSettings();
    const raw = work.correct * settings.ratePerCorrect - work.missed * settings.ratePerMiss;
    return raw > 0 ? Math.max(score, Math.min(settings.maxRate, score + raw)) : score + raw;
}

// ------------------------------------------------------------------
// 絵柄
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

// ------------------------------------------------------------------
// 状態の表示
// ------------------------------------------------------------------
function renderUnderground() {
    if (!ug.open) return;
    const state = ug.state;
    const settings = ugSettings();
    const score = ugPendingScore();
    el('ug-score').textContent = state ? formatRate(score) : '—';
    el('ug-remaining-label').textContent = `${formatRate(settings.maxRate)}まで`;
    el('ug-remaining').textContent = state ? (score >= settings.maxRate ? '到達' : `あと${formatRate(settings.maxRate - score)}`) : '—';
    // 今回ぶん。仕分けの最中は、まだ送っていない分も含めた見込み
    const session = ug.session || ug.lastSession;
    const sessionDelta = session ? session.delta + (ug.session ? score - (Number(state?.score) || 0) : 0) : null;
    el('ug-session').textContent = sessionDelta === null ? '—' : `${sessionDelta >= 0 ? '+' : ''}${formatRate(sessionDelta)}`;

    const canWork = ugCanWork();
    el('ug-notice').textContent = !state
        ? '読み込み中...'
        : canWork
            ? `レートが${formatRate(settings.maxRate)}になるまで、何個でも仕分けられます。時間の制限はありません。`
            : `船底で仕分けできるのはレートが${formatRate(settings.maxRate)}未満の人だけです (いまのレート ${formatRate(state.score)})。`;
    el('ug-hold').classList.toggle('is-locked', !canWork && !ug.work);

    el('ug-work-summary').textContent = `正しい木箱に入れるたびにレートが +${settings.ratePerCorrect}`
        + (settings.ratePerMiss > 0 ? `、間違えると −${settings.ratePerMiss}` : ' (間違えても下がりません)')
        + `。${formatRate(settings.maxRate)}まで上げられます。数字キー 1〜5 でも仕分けられます。`;
    renderUgWorkControls();
    renderUgRecent();
}

function renderUgWorkControls() {
    const running = Boolean(ug.work);
    el('ug-work-idle').classList.toggle('hidden', running);
    el('ug-work-run').classList.toggle('hidden', !running);
    el('ug-start-button').disabled = ug.busy || !ugCanWork();
    el('ug-start-button').textContent = ug.lastSession ? 'もう一度仕分ける' : '仕分けを始める';
    el('ug-stop-button').disabled = !running || ug.busy;
    const head = el('ug-result-head');
    if (ug.lastSession) {
        head.textContent = `正解 ${ug.lastSession.correct} / ミス ${ug.lastSession.missed} → レート ${ug.lastSession.delta >= 0 ? '+' : ''}${formatRate(ug.lastSession.delta)}`;
    }
    head.classList.toggle('hidden', !ug.lastSession || running);
    el('ug-bins').querySelectorAll('button').forEach(button => {
        button.disabled = !running || Boolean(ug.work?.sending);
    });
}

function renderUgRecent() {
    const list = el('ug-recent');
    const recent = ug.state?.underground?.recent || [];
    list.innerHTML = '';
    if (!recent.length) {
        const item = document.createElement('li');
        item.textContent = 'まだ仕分けていません。';
        list.appendChild(item);
        return;
    }
    recent.forEach(entry => {
        const item = document.createElement('li');
        const time = document.createElement('span');
        time.className = 'ug-recent-time';
        time.textContent = formatClock(entry.at);
        const text = document.createElement('span');
        text.textContent = `正解${entry.correct}・ミス${entry.missed} → レート ${entry.delta >= 0 ? '+' : ''}${entry.delta}`;
        item.append(time, text);
        list.appendChild(item);
    });
}

function renderUgRules() {
    const settings = ugSettings();
    const rules = [
        `レートが${formatRate(settings.maxRate)}未満の人だけが仕分けできます。${formatRate(settings.maxRate)}に届いたらそれ以上は上がりません。`,
        `流れてくる積荷を正しい木箱に入れるたびにレートが +${settings.ratePerCorrect}`
            + (settings.ratePerMiss > 0 ? `、間違えると −${settings.ratePerMiss}` : ' (間違えても下がりません)')
            + '。時間の制限はなく、いつでもやめられます。',
        '木箱: 財宝箱 = 宝箱・金貨 / 酒樽 = ラム酒 / 航海道具 = 羅針盤・宝の地図・錨 / 鳥かご = オウム / ドクロ旗は海へ捨てる。',
        `レートには${settings.itemsPerShipment}個ごとにまとめて反映されます (やめたときは、そこまでの分)。速すぎる操作 (1個0.2秒未満) は数えません。`
    ];
    el('ug-rules').innerHTML = '';
    rules.forEach(text => {
        const item = document.createElement('li');
        item.textContent = text;
        el('ug-rules').appendChild(item);
    });
}

function showUgMessage(text, type = 'info') {
    showMessage(el('ug-message'), text, type);
}

/** サーバーの返事を受け取って画面とゲーム一覧のレートを揃える */
function receiveUnderground(data) {
    ug.state = data;
    ug.loaded = true;
    if (Number.isFinite(Number(data.score))) casino.score = Number(data.score);
    renderUgRules();
    renderUnderground();
}

async function loadUndergroundStatus() {
    if (ug.loading) return;
    ug.loading = true;
    try {
        receiveUnderground(await callUnderground('status'));
    } catch (error) {
        showUgMessage(error.message, 'error');
    } finally {
        ug.loading = false;
    }
}

function setUgBusy(busy) {
    ug.busy = busy;
    renderUgWorkControls();
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
    if (work.sending) {
        const label = document.createElement('span');
        label.className = 'ug-cargo-name';
        label.textContent = '次の積荷を運んでいます…';
        cargo.appendChild(label);
    } else if (work.index < work.items.length) {
        const item = work.items[work.index];
        cargo.appendChild(ugCargoNode(item, 'ug-cargo-main'));
        const label = document.createElement('span');
        label.className = 'ug-cargo-name';
        label.textContent = SLOT_SYMBOLS[item]?.name || item;
        cargo.appendChild(label);
    }
    const queue = el('ug-queue');
    queue.innerHTML = '';
    if (!work.sending) {
        work.items.slice(work.index + 1, work.index + 1 + UG_QUEUE_PREVIEW).forEach(item => {
            const li = document.createElement('li');
            li.appendChild(ugCargoNode(item, 'ug-queue-icon'));
            queue.appendChild(li);
        });
    }
    const session = ug.session || { correct: 0, missed: 0 };
    el('ug-progress').textContent = `正解 ${session.correct + work.correct} / ミス ${session.missed + work.missed}`;
    const pendingDelta = (session.delta || 0) + (ugPendingScore() - (Number(ug.state?.score) || 0));
    el('ug-earning').textContent = `レート ${pendingDelta >= 0 ? '+' : ''}${formatRate(pendingDelta)}`;
    renderUnderground();
}

function beginUgWork(shipment) {
    ug.work = {
        id: shipment.id,
        items: shipment.items,
        answers: Array(shipment.items.length).fill(null),
        index: 0,
        correct: 0,
        missed: 0,
        sending: false
    };
    renderUgWorkControls();
    renderUgCargo();
}

async function startUgShipment() {
    if (ug.busy || ug.work || !ugCanWork()) return;
    setUgBusy(true);
    try {
        const data = await callUnderground('start');
        ug.session = { correct: 0, missed: 0, delta: 0 };
        ug.lastSession = null;
        receiveUnderground(data);
        const shipment = data.underground?.shipment;
        if (shipment) beginUgWork(shipment);
    } catch (error) {
        showUgMessage(error.message, 'error');
        await loadUndergroundStatus();
    } finally {
        setUgBusy(false);
    }
}

function answerUgCargo(binKey) {
    const work = ug.work;
    if (!work || work.sending || work.index >= work.items.length) return;
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
    // 1回ぶん仕分け終わったら答えを送り、次の積荷を受け取って続ける
    if (work.index >= work.items.length) sendUgAnswers({ next: true });
    else renderUgCargo();
}

/** ここまでの答えを送る。next なら次の積荷を受け取って続け、そうでなければ終わる */
async function sendUgAnswers({ next }) {
    const work = ug.work;
    if (!work || work.sending) return;
    work.sending = true;
    renderUgWorkControls();
    renderUgCargo();
    try {
        const data = await callUnderground('submit', { shipmentId: work.id, answers: work.answers, next });
        const grade = data.grade || { correct: 0, missed: 0 };
        const session = ug.session || { correct: 0, missed: 0, delta: 0 };
        ug.session = {
            correct: session.correct + grade.correct,
            missed: session.missed + grade.missed,
            delta: session.delta + (data.change?.delta || 0)
        };
        ug.work = null;
        receiveUnderground(data);
        const shipment = data.underground?.shipment;
        if (next && shipment) {
            beginUgWork(shipment);
            return;
        }
        finishUgSession();
        if (next && !data.canWork) {
            showUgMessage(`レートが${formatRate(ugSettings().maxRate)}に届きました。お疲れさまでした！`, 'success');
        }
    } catch (error) {
        ug.work = null;
        finishUgSession();
        showUgMessage(error.message, 'error');
        await loadUndergroundStatus();
    }
}

function finishUgSession() {
    ug.lastSession = ug.session;
    ug.session = null;
    renderUnderground();
}

function stopUgWork() {
    if (!ug.work || ug.work.sending) return;
    sendUgAnswers({ next: false });
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
    stopUgWork();
}

/** ゲーム一覧のタイルの説明に、上限を出す */
function renderUndergroundTile() {
    const desc = el('ug-tile-desc');
    const max = formatRate(undergroundMaxRate());
    if (desc) desc.textContent = `レートが${max}未満の人の地下労働。積荷を1つ仕分けるごとにレートが上がる (${max}まで)`;
}

/** 上限を設定 (誰でも読める settings/app) から読んでおく。ゲーム一覧の札と説明に使う */
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
    // ゲーム一覧のタイルの積荷
    document.querySelectorAll('.game-tile-art.is-underground .ug-tile-cargo').forEach(node => {
        node.appendChild(ugCargoNode(node.dataset.item, 'ug-tile-cargo-icon'));
    });
    buildUgBins();
    el('ug-start-button').addEventListener('click', startUgShipment);
    el('ug-stop-button').addEventListener('click', stopUgWork);
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
