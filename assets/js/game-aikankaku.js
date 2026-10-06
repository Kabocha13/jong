// ゲームタブ: AIカンカク (1日1問。AI が数字を出さずに表したお題の数を当てる)
//   答えは 1〜100 のどれか。数ごとに BET でき (いくつでも)、当たった数の BET が10倍 (賭け金込み) になる。
//   第N問は前の日の 14:00 から当日 13:00 まで受け付け、14:00 に答えを発表して次の問題が始まる。
//   お題と答え・BET・精算はすべてサーバー (Cloud Function aikankaku、ルールは functions/aikankaku.js) が持ち、
//   画面には受付中の問題のお題 (答えは無し) と、発表済みの問題の結果だけが来る。
//   チップは使わない (指名手配と同じく、BET した額がその場でレートから引かれる)。画面の切り替えは game.js。

const AIKANKAKU_NUMBERS = 100;
const AIKANKAKU_AMOUNTS = [10, 50, 100, 500, 1000];

const ak = {
    open: false,
    loaded: false,
    loading: false,
    busy: false,
    state: null,
    selected: new Set(),   // BET しようとして選んでいる数
    clockTimer: null,
    reloadAt: null         // この時刻 (ms) を過ぎたら読み直す (締め切り・発表)
};

async function callAikankaku(action, payload = {}) {
    const token = await getFirebaseIdToken();
    if (!token) throw new Error('ログインが切れています。マイページでログインし直してください。');
    const response = await fetch(`${getFunctionsBaseUrl()}/aikankaku`, {
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

function akRules() {
    return ak.state?.rules || { total: 90, minBet: 1, maxBet: 1000, multiplier: 10, closeHour: 13, revealHour: 14 };
}

function akIsOpen() {
    return ak.state?.phase === 'open' && Boolean(ak.state.round);
}

function akMinePicks() {
    return ak.state?.round?.mine?.picks || {};
}

/** 「10/7 (水) 13:00」 */
function akFormatDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const day = date.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short' })
        .replace(/\((.)\)/, ' ($1)');
    const time = date.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
    return `${day} ${time}`;
}

/** 'YYYY-MM-DD' → 「10/7 (水)」 */
function akFormatDate(dateKey) {
    return akFormatDateTime(`${dateKey}T12:00:00+09:00`).replace(/ \d{2}:\d{2}$/, '');
}

/** 「あと 3時間12分」 */
function akRemaining(ms) {
    const minutes = Math.max(0, Math.ceil(ms / 60000));
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `あと ${hours}時間${minutes % 60}分` : `あと ${minutes}分`;
}

function akAmount() {
    const value = Number(el('ak-amount').value);
    return Number.isInteger(value) ? value : 0;
}

// ------------------------------------------------------------------
// 盤面 (1〜100)
// ------------------------------------------------------------------
function buildAikankakuBoard() {
    const grid = el('ak-board');
    grid.innerHTML = '';
    for (let number = 1; number <= AIKANKAKU_NUMBERS; number++) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ak-cell';
        button.dataset.number = String(number);
        const label = document.createElement('span');
        label.className = 'ak-cell-number';
        label.textContent = String(number);
        const bet = document.createElement('span');
        bet.className = 'ak-cell-bet';
        button.append(label, bet);
        button.addEventListener('click', () => toggleAikankakuNumber(number));
        grid.appendChild(button);
    }
}

function renderAikankakuBoard() {
    const picks = akMinePicks();
    const open = akIsOpen();
    el('ak-board').querySelectorAll('.ak-cell').forEach(button => {
        const number = Number(button.dataset.number);
        const bet = picks[String(number)] || 0;
        const selected = ak.selected.has(number);
        button.classList.toggle('is-selected', selected);
        button.classList.toggle('has-bet', bet > 0);
        button.querySelector('.ak-cell-bet').textContent = bet > 0 ? formatRate(bet) : '';
        button.disabled = !open || ak.busy;
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        button.setAttribute('aria-label', bet > 0 ? `${number} (BET ${bet})` : String(number));
    });
    el('ak-table').classList.toggle('is-locked', Boolean(ak.state) && !open);
}

function toggleAikankakuNumber(number) {
    if (!akIsOpen() || ak.busy) return;
    if (ak.selected.has(number)) ak.selected.delete(number);
    else ak.selected.add(number);
    renderAikankakuBoard();
    renderAikankakuSlip();
}

function selectAikankakuRange() {
    if (!akIsOpen()) return;
    const from = Number(el('ak-range-from').value);
    const to = Number(el('ak-range-to').value);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > AIKANKAKU_NUMBERS || from > to) {
        showAkMessage('まとめて選ぶ範囲は 1〜100 で、左を右以下にしてください。', 'error');
        return;
    }
    for (let number = from; number <= to; number++) ak.selected.add(number);
    renderAikankakuBoard();
    renderAikankakuSlip();
}

function clearAikankakuSelection() {
    ak.selected.clear();
    renderAikankakuBoard();
    renderAikankakuSlip();
}

// ------------------------------------------------------------------
// お題・状態の表示
// ------------------------------------------------------------------
function renderAikankakuTopic() {
    const state = ak.state;
    const round = state?.round;
    const rules = akRules();
    const topic = el('ak-topic');
    topic.dataset.phase = state ? state.phase : 'loading';
    if (!state) {
        el('ak-topic-no').textContent = 'AIカンカク';
        el('ak-topic-hint').textContent = '読み込み中...';
        return;
    }
    if (round) {
        el('ak-topic-no').textContent = `第${round.no}問 / 全${rules.total}問`;
        el('ak-topic-date').textContent = akFormatDate(round.date);
        el('ak-topic-hint').textContent = round.hint;
    } else if (state.phase === 'before') {
        el('ak-topic-no').textContent = `第1問 / 全${rules.total}問`;
        el('ak-topic-date').textContent = '';
        el('ak-topic-hint').textContent = '最初のお題はまだ出ていません';
    } else {
        el('ak-topic-no').textContent = `全${rules.total}問`;
        el('ak-topic-date').textContent = '';
        el('ak-topic-hint').textContent = '全問の発表が終わりました。遊んでくれてありがとう！';
    }
    renderAikankakuClock();
}

/** 締め切り・発表までの残り。境目を過ぎたら読み直す */
function renderAikankakuClock() {
    const state = ak.state;
    const round = state?.round;
    const clock = el('ak-topic-clock');
    const now = Date.now();
    let text = '';
    let reloadAt = null;
    if (state?.phase === 'open' && round) {
        const closes = Date.parse(round.closesAt);
        text = `締め切り ${akFormatDateTime(round.closesAt)} (${akRemaining(closes - now)}) ・ 発表 ${akFormatDateTime(round.revealsAt).slice(-5)}`;
        reloadAt = closes;
    } else if (state?.phase === 'closed' && round) {
        const reveals = Date.parse(round.revealsAt);
        text = `締め切りました。集計中… 発表は ${akFormatDateTime(round.revealsAt)} (${akRemaining(reveals - now)})`;
        reloadAt = reveals;
    } else if (state?.phase === 'before') {
        const opens = Date.parse(state.firstOpensAt);
        text = `第1問は ${akFormatDateTime(state.firstOpensAt)} から (${akRemaining(opens - now)})`;
        reloadAt = opens;
    }
    clock.textContent = text;
    ak.reloadAt = reloadAt;
    if (ak.open && reloadAt && now >= reloadAt && !ak.loading && !ak.busy) {
        ak.reloadAt = null;
        ak.selected.clear();
        loadAikankakuStatus();
    }
}

function renderAikankakuStatus() {
    const state = ak.state;
    const round = state?.round;
    const rules = akRules();
    el('ak-score').textContent = state ? formatRate(state.score) : '—';
    el('ak-mine-total').textContent = round ? formatRate(round.mine.total) : '—';
    el('ak-players').textContent = round ? `${round.players}人` : '—';
    let notice;
    if (!state) notice = '読み込み中...';
    else if (state.phase === 'open') notice = `答えだと思う数を押して BET。いくつ選んでもよく、当たった数の BET が ×${rules.multiplier} で戻ります。`;
    else if (state.phase === 'closed') notice = `${rules.closeHour}:00 で締め切りました。${rules.revealHour}:00 に答えを発表し、次のお題が出ます。`;
    else if (state.phase === 'before') notice = 'お題が出たら BET できます。';
    else notice = '全問終わりました。';
    el('ak-notice').textContent = notice;
}

function renderAikankakuSlip() {
    const open = akIsOpen();
    const numbers = [...ak.selected].sort((a, b) => a - b);
    const amount = akAmount();
    const rules = akRules();
    el('ak-slip').classList.toggle('hidden', !open);
    el('ak-selected').textContent = numbers.length
        ? `選んだ数 (${numbers.length}個): ${numbers.join('・')}`
        : '上の数を押して選ぶ (何個でも)';
    const cost = numbers.length * amount;
    el('ak-cost').textContent = formatRate(cost);
    el('ak-payout').textContent = numbers.length && amount > 0 ? formatRate(amount * rules.multiplier) : '—';
    el('ak-bet-button').disabled = !open || ak.busy || !numbers.length || amount < rules.minBet || amount > rules.maxBet;
    el('ak-clear-button').disabled = !numbers.length || ak.busy;
}

function renderAikankakuMine() {
    const round = ak.state?.round;
    const list = el('ak-mine-list');
    list.innerHTML = '';
    const entries = Object.entries(round?.mine?.picks || {}).map(([key, amount]) => [Number(key), amount]).sort((a, b) => a[0] - b[0]);
    el('ak-mine').classList.toggle('hidden', !round);
    if (!entries.length) {
        const item = document.createElement('li');
        item.className = 'ak-mine-empty';
        item.textContent = 'まだ BET していません';
        list.appendChild(item);
        return;
    }
    entries.forEach(([number, amount]) => {
        const item = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'ak-mine-number';
        label.textContent = String(number);
        const bet = document.createElement('span');
        bet.className = 'ak-mine-amount';
        bet.textContent = `BET ${formatRate(amount)} → 当たれば ${formatRate(amount * akRules().multiplier)}`;
        item.append(label, bet);
        if (akIsOpen()) {
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'ak-cancel-button';
            cancel.textContent = '取り消す';
            cancel.disabled = ak.busy;
            cancel.addEventListener('click', () => cancelAikankakuBet(number, amount));
            item.appendChild(cancel);
        }
        list.appendChild(item);
    });
}

function akResultNode(result, latest) {
    const box = document.createElement(latest ? 'div' : 'details');
    box.className = `ak-result${latest ? ' is-latest' : ''}`;
    const head = document.createElement(latest ? 'p' : 'summary');
    head.className = 'ak-result-head';
    head.textContent = `第${result.no}問 ${akFormatDate(result.date)} ・ 答え ${result.answer}`;
    box.appendChild(head);

    const hint = document.createElement('p');
    hint.className = 'ak-result-hint';
    hint.textContent = result.hint;
    const answer = document.createElement('p');
    answer.className = 'ak-result-answer';
    answer.innerHTML = '<span>答え</span>';
    const strong = document.createElement('strong');
    strong.textContent = String(result.answer);
    answer.appendChild(strong);
    box.append(hint, answer);

    const mine = document.createElement('p');
    mine.className = 'ak-result-mine';
    if (!result.mine) {
        mine.textContent = 'あなたは BET していません';
    } else {
        const numbers = Object.keys(result.mine.picks).map(Number).sort((a, b) => a - b);
        const head = `あなた: ${numbers.join('・')} に BET (計 ${formatRate(result.mine.total)})`;
        if (result.mine.payout > 0) {
            mine.textContent = `${head} → 的中！ ${formatRate(result.mine.payout)} (${formatSigned(result.mine.payout - result.mine.total)})`
                + (result.settled ? '' : ' ・ 精算中');
            mine.dataset.sign = 'plus';
        } else {
            mine.textContent = `${head} → はずれ (${formatSigned(-result.mine.total)})`;
            mine.dataset.sign = 'minus';
        }
    }
    box.appendChild(mine);

    const winners = document.createElement('p');
    winners.className = 'ak-result-meta';
    winners.textContent = result.players === 0 ? '誰も BET しませんでした'
        : result.winners.length
            ? `的中 ${result.winners.length}人: ${result.winners.map(winner => `${winner.player} (+${formatRate(winner.payout)})`).join('・')}`
            : `参加 ${result.players}人、的中した人はいませんでした`;
    box.appendChild(winners);
    if (result.popular.length) {
        const popular = document.createElement('p');
        popular.className = 'ak-result-meta';
        popular.textContent = `人気の数: ${result.popular.map(item => `${item.number} (${item.players}人)`).join('・')}`;
        box.appendChild(popular);
    }
    return box;
}

function renderAikankakuResults() {
    const target = el('ak-results');
    target.innerHTML = '';
    const results = ak.state?.results || [];
    el('ak-results-box').classList.toggle('hidden', !results.length);
    results.forEach((result, i) => target.appendChild(akResultNode(result, i === 0)));
}

function renderAikankakuRules() {
    const rules = akRules();
    const list = [
        `毎日1問、AI が「ある数 (1〜${AIKANKAKU_NUMBERS})」を数字を出さずに表したお題が出る (全${rules.total}問)。`,
        `答えだと思う数に BET する。いくつの数にでも BET でき、1つの数に ${formatRate(rules.minBet)}〜${formatRate(rules.maxBet)} まで (あとから足せる)。`,
        'BET した額はその場でレートから引かれる。締め切りまでは数ごとに取り消せる (全額戻る)。',
        `毎日 ${rules.closeHour}:00 に締め切り、${rules.revealHour}:00 に答えを発表。当たった数の BET が ×${rules.multiplier} (賭け金込み) でレートに入る。`,
        `${rules.revealHour}:00 の発表と同時に次のお題が出る。`
    ];
    const target = el('ak-rules');
    target.innerHTML = '';
    list.forEach(text => {
        const item = document.createElement('li');
        item.textContent = text;
        target.appendChild(item);
    });
    const stats = ak.state?.stats;
    el('ak-total').textContent = stats && stats.plays
        ? `これまで: 参加 ${stats.plays}問・的中 ${stats.hits}問・BET ${formatRate(stats.bet)}・払い戻し ${formatRate(stats.payout)}`
        : '';
}

function renderAikankaku() {
    if (!ak.open) return;
    renderAikankakuTopic();
    renderAikankakuStatus();
    renderAikankakuBoard();
    renderAikankakuSlip();
    renderAikankakuMine();
    renderAikankakuResults();
    renderAikankakuRules();
}

function showAkMessage(text, type = 'info') {
    showMessage(el('ak-message'), text, type);
}

function receiveAikankaku(data) {
    ak.state = data;
    ak.loaded = true;
    if (Number.isFinite(Number(data.score))) casino.score = Number(data.score);
    if (!akIsOpen()) ak.selected.clear();
    renderAikankaku();
    renderAikankakuTile();
    // ゲーム一覧を出しているなら札も揃える
    if (casino.ready && !location.hash.slice(1)) renderMenu();
}

async function loadAikankakuStatus() {
    if (ak.loading) return;
    ak.loading = true;
    try {
        receiveAikankaku(await callAikankaku('status'));
    } catch (error) {
        if (ak.open) showAkMessage(error.message, 'error');
    } finally {
        ak.loading = false;
    }
}

function setAikankakuBusy(busy) {
    ak.busy = busy;
    renderAikankakuBoard();
    renderAikankakuSlip();
    renderAikankakuMine();
}

// ------------------------------------------------------------------
// BET・取り消し
// ------------------------------------------------------------------
async function placeAikankakuBets() {
    if (ak.busy || !akIsOpen()) return;
    const rules = akRules();
    const numbers = [...ak.selected].sort((a, b) => a - b);
    const amount = akAmount();
    if (!numbers.length) return;
    if (amount < rules.minBet || amount > rules.maxBet) {
        showAkMessage(`1つの数に BET する額は ${rules.minBet}〜${formatRate(rules.maxBet)} にしてください。`, 'error');
        return;
    }
    const cost = numbers.length * amount;
    if (cost > ak.state.score) {
        showAkMessage(`レートが足りません (いま ${formatRate(ak.state.score)}、BET の合計 ${formatRate(cost)})。`, 'error');
        return;
    }
    if (!confirm(`${numbers.join('・')} に ${formatRate(amount)} ずつ BET します (計 ${formatRate(cost)})。レートからすぐ引かれます。よろしいですか？`)) return;
    const picks = Object.fromEntries(numbers.map(number => [String(number), amount]));
    setAikankakuBusy(true);
    el('ak-bet-button').setAttribute('aria-busy', 'true');
    try {
        const data = await callAikankaku('bet', { date: ak.state.round.date, picks });
        ak.selected.clear();
        receiveAikankaku(data);
        if (typeof playGameSound === 'function') playGameSound('bjDeal', 0.5);
        showAkMessage(`${numbers.length}個の数に BET しました (${formatSigned(data.change.delta)})。発表は ${akFormatDateTime(data.round.revealsAt)}。`, 'success');
    } catch (error) {
        showAkMessage(error.message, 'error');
        await loadAikankakuStatus();
    } finally {
        el('ak-bet-button').removeAttribute('aria-busy');
        setAikankakuBusy(false);
    }
}

async function cancelAikankakuBet(number, amount) {
    if (ak.busy || !akIsOpen()) return;
    if (!confirm(`${number} への BET (${formatRate(amount)}) を取り消します。よろしいですか？`)) return;
    setAikankakuBusy(true);
    try {
        const data = await callAikankaku('cancel', { date: ak.state.round.date, number });
        receiveAikankaku(data);
        showAkMessage(`${number} の BET を取り消しました (${formatSigned(data.change.delta)})。`, 'info');
    } catch (error) {
        showAkMessage(error.message, 'error');
        await loadAikankakuStatus();
    } finally {
        setAikankakuBusy(false);
    }
}

// ------------------------------------------------------------------
// 開く・閉じる (game.js の renderRoute から呼ぶ)
// ------------------------------------------------------------------
function openAikankaku() {
    const wasOpen = ak.open;
    ak.open = true;
    if (!wasOpen) {
        renderAikankaku();
        if (!ak.busy) loadAikankakuStatus();
        clearInterval(ak.clockTimer);
        ak.clockTimer = setInterval(renderAikankakuClock, 15000);
    }
}

function closeAikankaku() {
    if (!ak.open) return;
    ak.open = false;
    clearInterval(ak.clockTimer);
    ak.clockTimer = null;
}

/** ゲーム一覧のタイル: いまのお題 */
function renderAikankakuTile() {
    const desc = el('ak-tile-desc');
    if (!desc) return;
    const state = ak.state;
    const round = state?.round;
    if (round && state.phase === 'open') desc.textContent = `第${round.no}問「${round.hint}」は 1〜100 のどれ？ 当てると ×${akRules().multiplier}`;
    else if (round) desc.textContent = `第${round.no}問は集計中。${akRules().revealHour}:00 に答えを発表`;
    else if (state?.phase === 'before') desc.textContent = `第1問は ${akFormatDateTime(state.firstOpensAt)} から。AI が数字を出さずに表した数を当てる`;
    else if (state?.phase === 'ended') desc.textContent = '全問終わりました';
}

/** ゲーム一覧の札 (game.js の renderMenu から呼ぶ) */
function aikankakuTileBadge() {
    if (!ak.loaded && !ak.loading) loadAikankakuStatus();
    const state = ak.state;
    if (state?.phase === 'open') return state.round?.mine?.total > 0 ? 'BET済み' : 'BET受付中';
    if (state?.phase === 'closed') return '集計中';
    return '';
}

function initAikankaku() {
    if (!el('aikankaku-view')) return;
    buildAikankakuBoard();
    const presets = el('ak-presets');
    AIKANKAKU_AMOUNTS.forEach(amount => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = formatRate(amount);
        button.addEventListener('click', () => {
            el('ak-amount').value = String(amount);
            renderAikankakuSlip();
        });
        presets.appendChild(button);
    });
    el('ak-amount').addEventListener('input', renderAikankakuSlip);
    el('ak-range-button').addEventListener('click', selectAikankakuRange);
    el('ak-clear-button').addEventListener('click', clearAikankakuSelection);
    el('ak-bet-button').addEventListener('click', placeAikankakuBets);
    renderAikankakuRules();
}
