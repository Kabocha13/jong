// ゲームタブ: ブラックジャック (全員共通の1卓・最大4席)
// 配られるカード・勝敗・払い戻しは Cloud Function (casino の bjJoin / bjBet / bjMove など) が決める。
// ほかの人の操作は、誰でも読める卓の写し (bj_public/main) を読み直して反映する。
// ディーラーの裏のカードは決着するまで届かない (null のまま) ので、画面では伏せて描く。
// 締め切り (ベット受付・番の人の持ち時間) を過ぎたら、画面を開いている人が bjTick を送って先へ進める。
// 入場・手元チップ・精算・画面の切り替えは game.js。

const BLACKJACK_POLL_MS = 1200;     // 卓を読み直す間隔
const BLACKJACK_DEAL_MS = 200;      // 配るときの1枚ごとの間隔
const BLACKJACK_DEALER_MS = 650;    // ディーラーが1枚ずつめくる・引く間隔
const BLACKJACK_TURN_MS = 20000;    // 1回の操作の持ち時間 (サーバーの TABLE_TURN_MS と同じ)
const BLACKJACK_SEATS = 4;
const BLACKJACK_SUITS = {
    S: { mark: '♠︎', name: 'スペード', red: false },
    H: { mark: '♥︎', name: 'ハート', red: true },
    D: { mark: '♦︎', name: 'ダイヤ', red: true },
    C: { mark: '♣︎', name: 'クラブ', red: false }
};
const BLACKJACK_RESULTS = {
    blackjack: 'ブラックジャック',
    win: '勝ち',
    push: '引き分け',
    lose: '負け',
    bust: 'バースト',
    split: 'スプリット'
};

const blackjack = {
    table: null,        // 最後に受け取った卓 (公開の形)
    shown: null,        // いま画面に出している卓 (演出の途中は伏せ札をめくる前の形)
    queue: Promise.resolve(),
    bet: 0,             // 置こうとしている賭け金 (「賭ける」を押すまでは画面の中だけ)
    placed: [],         // 置いた順のチップ (1つ戻す用)
    lastBet: 0,
    offset: 0,          // サーバーの時刻 − 端末の時刻
    ticked: '',         // bjTick を送った締め切り (同じ締め切りに何度も送らない)
    pollTimer: null,
    clockTimer: null,
    polling: false,
    leaving: false
};

const EMPTY_BLACKJACK_TABLE = { phase: 'betting', seq: -1, seats: Array(BLACKJACK_SEATS).fill(null), round: null };

// ------------------------------------------------------------------
// 卓の読み方
// ------------------------------------------------------------------
function myName() {
    return casino.me || localStorage.getItem('authUsername') || '';
}

function mySeatIndex(table = blackjack.table) {
    return table ? table.seats.findIndex(seat => seat && seat.name === myName()) : -1;
}

/** その席に座っている人の、この勝負の手 (席の人が入れ替わっていれば出さない) */
function roundPlayerAt(table, index) {
    const seat = table.seats[index];
    if (!seat || !table.round) return null;
    return table.round.players.find(player => player.seat === index && player.name === seat.name) || null;
}

function turnSeatIndex(table) {
    return table && table.phase === 'playing' && table.round?.turn ? table.round.turn.seat : -1;
}

function isMyTurn(table = blackjack.table) {
    const index = turnSeatIndex(table);
    return index >= 0 && table.seats[index]?.name === myName();
}

/** いまの勝負に参加している (決着するまで席を立てず、精算もできない) */
function isBlackjackLive() {
    const table = blackjack.table;
    return Boolean(table && table.phase === 'playing' && table.round
        && table.round.players.some(player => player.name === myName()));
}

function serverNow() {
    return Date.now() + blackjack.offset;
}

function applyServerClock(iso) {
    const server = Date.parse(iso);
    if (Number.isFinite(server)) blackjack.offset = server - Date.now();
}

function secondsLeft(iso) {
    if (!iso) return null;
    return Math.max(0, Math.ceil((Date.parse(iso) - serverNow()) / 1000));
}

/** 途中の表示用。サーバー (functions/blackjack.js) と同じ数え方 */
function blackjackHandValue(cards) {
    let total = 0;
    let hasAce = false;
    cards.forEach(card => {
        const rank = card.slice(0, -1);
        const point = rank === 'A' ? 1 : ['J', 'Q', 'K'].includes(rank) ? 10 : Number(rank);
        total += point;
        if (point === 1) hasAce = true;
    });
    const soft = hasAce && total + 10 <= 21;
    return { total: soft ? total + 10 : total, soft };
}

/** ゲーム一覧のタイルに卓の人数を出す */
function renderBlackjackTile() {
    const live = el('bj-tile-live');
    const table = blackjack.table;
    const seated = table ? table.seats.filter(Boolean).length : 0;
    live.textContent = !table ? '' : seated ? `いま卓に${seated}人` : '卓は空いています';
    live.classList.toggle('is-busy', seated > 0);
}

// ------------------------------------------------------------------
// カードと席を描く
// ------------------------------------------------------------------
function createCardElement(card) {
    const node = document.createElement('span');
    node.setAttribute('role', 'img');
    if (!card) {
        node.className = 'bj-card is-back';
        node.setAttribute('aria-label', '伏せたカード');
        return node;
    }
    const rank = card.slice(0, -1);
    const suit = BLACKJACK_SUITS[card.slice(-1)];
    node.className = `bj-card ${suit.red ? 'is-red' : 'is-black'}`;
    node.setAttribute('aria-label', `${suit.name}の${rank}`);
    const rankEl = document.createElement('span');
    rankEl.className = 'bj-card-rank';
    rankEl.textContent = rank;
    const suitEl = document.createElement('span');
    suitEl.className = 'bj-card-suit';
    suitEl.textContent = suit.mark;
    node.append(rankEl, suitEl);
    return node;
}

/**
 * 前に出していた並び (before) と違う位置のカードだけ動かす。
 * before が null なら動かさない。伏せていたカードが表になったときはめくる動きにする。
 */
function renderCardRow(container, cards, before, delayFor) {
    container.innerHTML = '';
    cards.forEach((card, index) => {
        const node = createCardElement(card);
        const previous = before && index < before.length ? before[index] : undefined;
        if (before && previous !== card) {
            node.classList.add(previous === null ? 'is-flip' : 'is-dealt');
            const wait = delayFor ? delayFor(index) : 0;
            if (wait) node.style.animationDelay = `${wait}ms`;
        }
        container.appendChild(node);
    });
}

function handTotalText(hand) {
    if (hand.total > 21) return `${hand.total} バースト`;
    if (!hand.split && hand.cards.length === 2 && hand.total === 21) return 'BJ';
    if (hand.soft && hand.total < 21) return `${hand.total - 10} / ${hand.total}`;
    return String(hand.total);
}

function dealerTotalText(dealer) {
    if (dealer.cards.includes(null)) return String(dealer.total);
    if (dealer.cards.length === 2 && dealer.total === 21) return 'BJ';
    return dealer.total > 21 ? `${dealer.total} バースト` : String(dealer.total);
}

function resultText(result, net) {
    return result === 'push' ? BLACKJACK_RESULTS.push : `${BLACKJACK_RESULTS[result]} ${formatSigned(net)}`;
}

function createHandElement(hand, active, previousCards, delayFor) {
    const box = document.createElement('div');
    box.className = `bj-hand${active ? ' is-active' : ''}`;
    const cards = document.createElement('div');
    cards.className = 'bj-cards';
    renderCardRow(cards, hand.cards, previousCards, delayFor);

    const meta = document.createElement('div');
    meta.className = 'bj-hand-meta';
    const total = document.createElement('span');
    total.className = 'bj-total';
    total.textContent = handTotalText(hand);
    const bet = document.createElement('span');
    bet.className = `bj-hand-bet${hand.doubled ? ' is-doubled' : ''}`;
    bet.textContent = hand.bet.toLocaleString('ja-JP');
    bet.title = hand.doubled ? '賭け金 (ダブル)' : '賭け金';
    meta.append(total, bet);
    box.append(cards, meta);

    if (hand.result) {
        const result = document.createElement('span');
        result.className = `bj-hand-result is-${hand.result}`;
        result.textContent = resultText(hand.result, hand.returned - hand.bet);
        box.appendChild(result);
    }
    return box;
}

function createSeatPanel(view, index, before, fresh) {
    const seat = view.seats[index];
    const li = document.createElement('li');
    li.className = 'bj-seat-panel';
    li.dataset.seat = String(index);
    const head = document.createElement('div');
    head.className = 'bj-seat-head';
    li.appendChild(head);

    if (!seat) {
        li.classList.add('is-empty');
        head.textContent = `${index + 1}番 空席`;
        if (mySeatIndex() < 0 && casino.session) {
            const sit = document.createElement('button');
            sit.type = 'button';
            sit.className = 'bj-seat-sit';
            sit.dataset.sitSeat = String(index);
            sit.textContent = 'ここに座る';
            sit.disabled = casino.busy;
            li.appendChild(sit);
        }
        return li;
    }

    const me = seat.name === myName();
    li.classList.toggle('is-me', me);
    li.classList.toggle('is-turn', turnSeatIndex(view) === index);
    const name = document.createElement('span');
    name.className = 'bj-seat-name';
    name.textContent = seat.name;
    head.appendChild(name);
    if (me) {
        const tag = document.createElement('span');
        tag.className = 'bj-seat-me';
        tag.textContent = 'あなた';
        head.appendChild(tag);
    }
    const chips = document.createElement('span');
    chips.className = 'bj-seat-chips';
    chips.title = '手元チップ';
    chips.textContent = Number(seat.chips || 0).toLocaleString('ja-JP');
    head.appendChild(chips);

    const player = roundPlayerAt(view, index);
    if (player) {
        const hands = document.createElement('div');
        hands.className = 'bj-seat-hands';
        const previous = before && roundPlayerAt(before, index);
        const order = view.round.players.indexOf(player);
        const count = view.round.players.length;
        // 配る順: 全員の1枚目 → ディーラー表 → 全員の2枚目 → ディーラー裏
        const delayFor = fresh ? i => (i === 0 ? order : count + 1 + order) * BLACKJACK_DEAL_MS : null;
        player.hands.forEach((hand, handIndex) => {
            const active = turnSeatIndex(view) === index && player.hands.length > 1 && view.round.turn.hand === handIndex;
            const previousCards = before ? (previous?.hands[handIndex]?.cards || []) : null;
            hands.appendChild(createHandElement(hand, active, previousCards, delayFor));
        });
        li.appendChild(hands);
    } else {
        const note = document.createElement('p');
        note.className = 'bj-seat-note';
        note.textContent = view.phase === 'playing' ? '次の勝負から' : '';
        li.appendChild(note);
    }

    if (view.phase === 'betting' && seat.bet > 0) {
        const bet = document.createElement('p');
        bet.className = 'bj-seat-bet';
        bet.innerHTML = '<span class="bj-hand-bet"></span> 賭け済み';
        bet.firstChild.textContent = seat.bet.toLocaleString('ja-JP');
        li.appendChild(bet);
    }
    if (turnSeatIndex(view) === index) {
        const timer = document.createElement('span');
        timer.className = 'bj-seat-timer';
        timer.appendChild(document.createElement('span'));
        li.appendChild(timer);
    }
    return li;
}

/**
 * 卓を描く。animate のときは前の表示と比べて新しく出たカードだけ動かし、
 * fresh (配った直後) のときは 全員1枚目 → ディーラー → 全員2枚目 → ディーラー の順に時間差をつける。
 */
function renderBlackjackView(view, { animate = false, fresh = false } = {}) {
    const empty = { ...EMPTY_BLACKJACK_TABLE, round: null };
    const before = !animate ? null : fresh ? empty : (blackjack.shown || empty);
    const round = view.round;
    const count = round ? round.players.length : 0;

    const dealerTotal = el('bj-dealer-total');
    renderCardRow(
        el('bj-dealer-cards'),
        round ? round.dealer.cards : [],
        before ? (before.round?.dealer.cards || []) : null,
        fresh ? i => (i === 0 ? count : count * 2 + 1) * BLACKJACK_DEAL_MS : null
    );
    dealerTotal.classList.toggle('hidden', !round);
    if (round) dealerTotal.textContent = dealerTotalText(round.dealer);

    const seats = el('bj-seats');
    seats.innerHTML = '';
    for (let index = 0; index < BLACKJACK_SEATS; index++) {
        seats.appendChild(createSeatPanel(view, index, before, fresh));
    }
    blackjack.shown = view;
    renderBlackjackStatus();
    renderBlackjackResult(view);
}

/** 決着した勝負の、ディーラーを count 枚目まで表にした途中の形 (勝敗はまだ出さない) */
function withDealerShown(table, count) {
    const round = table.round;
    const cards = round.dealer.cards.slice(0, count);
    if (cards.length < 2) cards.push(null);
    return {
        ...table,
        phase: 'reveal',
        round: {
            ...round,
            dealer: { cards, ...blackjackHandValue(cards.filter(Boolean)) },
            players: round.players.map(player => ({
                ...player,
                net: null,
                returned: null,
                hands: player.hands.map(hand => ({ ...hand, result: null, returned: null }))
            }))
        }
    };
}

function roundHasMe(round) {
    return Boolean(round && round.players.some(player => player.name === myName()));
}

/**
 * 届いた卓を、配る・めくる・引くの順に少しずつ見せる。
 * 戻り値は「自分が参加していた勝負がこの表示で決着したか」。
 */
async function presentBlackjackTable(next) {
    if (!next || (blackjack.table && next.seq <= blackjack.table.seq)) return false;
    const previous = blackjack.table;
    blackjack.table = next;
    renderBlackjackControls();
    // ゲーム一覧を開いていれば、タイルの人数と「勝負の途中」も合わせる
    if (casino.ready && !routeGame()) renderMenu();
    if (!previous) {
        // 開いた直後は途中の様子をそのまま出す
        renderBlackjackView(next);
        return false;
    }

    const wait = ms => (prefersReducedMotion() ? Promise.resolve() : delay(ms));
    const round = next.round;
    const before = previous?.round;
    const fresh = Boolean(round) && (!before || before.no !== round.no);
    const finished = Boolean(round) && round.phase === 'done' && (fresh || before.phase !== 'done');
    const dealMs = round ? (round.players.length * 2 + 2) * BLACKJACK_DEAL_MS : 0;

    if (!finished) {
        renderBlackjackView(next, { animate: true, fresh });
        if (fresh) await wait(dealMs);
    } else {
        // 決着: まず全員の手を出し、ディーラーの裏から1枚ずつめくる
        renderBlackjackView(withDealerShown(next, 1), { animate: true, fresh });
        await wait(fresh ? dealMs + 300 : 350);
        for (let shown = 2; shown <= round.dealer.cards.length; shown++) {
            renderBlackjackView(withDealerShown(next, shown), { animate: true });
            await wait(BLACKJACK_DEALER_MS);
        }
        renderBlackjackView(next, { animate: true });
    }

    const settledMine = finished && roundHasMe(round);
    if (settledMine) {
        // 払い戻し後の手元チップと、チップが尽きたときの精算結果を取り直す
        await refreshCasino().catch(error => console.warn('手元チップの更新に失敗:', error));
        prefillBlackjackBet();
    }
    // 続けて賭けなかったなどで席がなくなったら知らせる (精算して席が消えたときは精算のお知らせが出る)
    if (mySeatIndex(previous) >= 0 && mySeatIndex(next) < 0 && !blackjack.leaving && casino.session) {
        showMessage(el('bj-message'), 'しばらく賭けなかったので席を空けました。', 'info');
    }
    renderBlackjackControls();
    return settledMine;
}

/** 卓の更新を順番に見せる (演出が重ならないように) */
function queueBlackjackTable(table) {
    blackjack.queue = blackjack.queue
        .then(() => presentBlackjackTable(table))
        .catch(error => {
            console.error('卓の表示に失敗:', error);
            return false;
        });
    return blackjack.queue;
}

// ------------------------------------------------------------------
// 状態の文字と締め切り
// ------------------------------------------------------------------
function renderBlackjackStatus() {
    const status = el('bj-status');
    const view = blackjack.shown;
    const table = blackjack.table;
    if (!view || !table) {
        status.textContent = '';
        return;
    }
    const seated = table.seats.filter(Boolean).length;
    let text;
    if (view.phase === 'reveal') {
        text = 'ディーラーの番…';
    } else if (table.phase === 'playing') {
        const index = turnSeatIndex(table);
        const left = secondsLeft(table.turnEndsAt);
        const who = isMyTurn(table) ? 'あなた' : `${table.seats[index]?.name || ''} さん`;
        text = `${who}の番です${left === null ? '' : ` — 残り ${left} 秒`}`;
    } else if (table.bettingEndsAt) {
        const left = secondsLeft(table.bettingEndsAt);
        text = `ベット受付中 — ${left ? `あと ${left} 秒で配ります` : 'まもなく配ります'}`;
    } else if (!seated) {
        text = '卓は空いています。座ると次の勝負から参加できます。';
    } else {
        text = `ベット受付中 (${seated}/${BLACKJACK_SEATS}人) — 全員が賭けると配ります`;
    }
    status.textContent = text;
    status.classList.toggle('is-my-turn', view.phase !== 'reveal' && isMyTurn(table));

    // 番の人の持ち時間を細い帯で見せる
    const timer = document.querySelector('#bj-seats .bj-seat-timer > span');
    if (timer && table.turnEndsAt) {
        const left = Math.max(0, Date.parse(table.turnEndsAt) - serverNow());
        timer.style.width = `${Math.min(100, (left / BLACKJACK_TURN_MS) * 100)}%`;
    }
}

function renderBlackjackResult(view) {
    const result = el('bj-result');
    result.className = 'casino-result';
    const round = view.round;
    const mine = round && view.phase !== 'reveal' && round.phase === 'done'
        ? round.players.find(player => player.name === myName()) : null;
    if (!mine) {
        result.textContent = '';
        return;
    }
    result.classList.add(mine.net > 0 ? 'is-plus' : mine.net < 0 ? 'is-minus' : 'is-even');
    const labels = mine.hands.map(hand => BLACKJACK_RESULTS[hand.result]);
    result.textContent = mine.hands.length === 1
        ? `${labels[0]}${mine.hands[0].result === 'blackjack' ? '!' : ''} ${formatSigned(mine.net)}`
        : `${labels.join('・')} — 合計 ${formatSigned(mine.net)}`;
}

/** 毎秒: 残り時間の表示と、締め切りを過ぎた卓を先へ進める */
function tickBlackjackClock() {
    renderBlackjackStatus();
    const table = blackjack.table;
    if (!table) return;
    const deadline = table.phase === 'playing' ? table.turnEndsAt : table.bettingEndsAt;
    if (!deadline || blackjack.ticked === deadline) return;
    if (serverNow() < Date.parse(deadline) + 300) return;
    // 画面を開いている全員が送っても、サーバー側で1回しか進まない。少しずらして送る
    blackjack.ticked = deadline;
    setTimeout(async () => {
        try {
            const data = await callCasino('bjTick');
            applyServerClock(data.now);
            queueBlackjackTable(data.table);
        } catch (error) {
            console.warn('卓の時間切れ処理に失敗:', error);
        }
        // 時計のずれで少し早く届いたり失敗したりして卓が進まなければ、少し待ってもう一度送る
        setTimeout(() => {
            if (blackjack.ticked === deadline) blackjack.ticked = '';
        }, 2000);
    }, Math.random() * 700);
}

async function pollBlackjackTable() {
    if (blackjack.polling || document.hidden || routeGame() !== 'blackjack') return;
    blackjack.polling = true;
    try {
        const doc = await getFirestoreDb().collection('bj_public').doc('main').get();
        if (doc.exists) queueBlackjackTable(doc.data());
    } catch (error) {
        console.warn('卓の読み込みに失敗:', error);
    } finally {
        blackjack.polling = false;
    }
}

// ------------------------------------------------------------------
// 操作
// ------------------------------------------------------------------
function renderBlackjackControls() {
    const table = blackjack.table || EMPTY_BLACKJACK_TABLE;
    const index = mySeatIndex(table);
    const seat = index >= 0 ? table.seats[index] : null;
    const playing = table.phase === 'playing';
    const myTurn = isMyTurn(table);
    const chips = casino.session ? casino.session.chips : 0;
    const locked = casino.busy || !casino.session;
    const full = table.seats.every(Boolean);

    el('bj-sit').classList.toggle('hidden', Boolean(seat) || !casino.session);
    el('bj-sit-button').disabled = locked || full;
    el('bj-sit-button').textContent = full ? '満席です' : '席に座る';
    el('bj-betting').classList.toggle('hidden', !seat || playing || seat.bet > 0);
    el('bj-waiting').classList.toggle('hidden', !seat || playing || !(seat.bet > 0));
    el('bj-actions').classList.toggle('hidden', !myTurn);
    el('bj-leave-button').classList.toggle('hidden', !seat || isBlackjackLive());
    el('bj-leave-button').disabled = casino.busy;

    document.querySelectorAll('.bj-chip-rack [data-bj-chip]').forEach(button => {
        button.disabled = locked || blackjack.bet >= chips;
    });
    el('bj-bet').textContent = blackjack.bet.toLocaleString('ja-JP');
    el('bj-undo-button').disabled = locked || blackjack.placed.length === 0;
    el('bj-clear-button').disabled = locked || blackjack.bet === 0;
    el('bj-rebet-button').disabled = locked || blackjack.lastBet < 1 || blackjack.lastBet > chips
        || blackjack.bet === blackjack.lastBet;
    el('bj-bet-button').disabled = locked || blackjack.bet < 1 || blackjack.bet > chips;
    if (seat) el('bj-placed-bet').textContent = Number(seat.bet || 0).toLocaleString('ja-JP');
    el('bj-cancel-button').disabled = casino.busy;

    const actions = myTurn ? table.round.actions : null;
    document.querySelectorAll('#bj-actions [data-bj-move]').forEach(button => {
        button.disabled = casino.busy || !actions || !actions[button.dataset.bjMove];
    });
    const turn = myTurn ? table.round.turn : null;
    const hand = turn ? roundPlayerAt(table, turn.seat)?.hands[turn.hand] : null;
    document.querySelectorAll('#bj-actions .bj-move-cost').forEach(cost => {
        cost.textContent = hand ? ` +${hand.bet.toLocaleString('ja-JP')}` : '';
    });
    document.querySelectorAll('#bj-seats [data-sit-seat]').forEach(button => {
        button.disabled = casino.busy;
    });
    // 勝負の途中かどうかで精算ボタンの可否も変わる (ほかの人の操作や時間切れで始まることもある)
    renderSettleButton();
}

function setBlackjackBet(amount) {
    blackjack.bet = amount;
    blackjack.placed = amount > 0 ? [amount] : [];
    renderBlackjackControls();
}

/** 前回と同じ額を置いておく (手元が足りなければ空にする) */
function prefillBlackjackBet() {
    const chips = casino.session ? casino.session.chips : 0;
    if (blackjack.lastBet >= 1 && blackjack.lastBet <= chips) {
        setBlackjackBet(blackjack.lastBet);
    } else if (blackjack.bet > chips) {
        setBlackjackBet(0);
    }
}

function addBlackjackChip(amount) {
    if (casino.busy || !casino.session) return;
    const add = Math.min(amount, casino.session.chips - blackjack.bet);
    if (add < 1) {
        showMessage(el('bj-message'), '手元のチップを使い切っています。', 'info');
        return;
    }
    blackjack.bet += add;
    blackjack.placed.push(add);
    renderBlackjackControls();
}

function undoBlackjackChip() {
    const last = blackjack.placed.pop();
    if (!last) return;
    blackjack.bet = Math.max(0, blackjack.bet - last);
    renderBlackjackControls();
}

/**
 * 盤面がずれていることもあるので、最新の状態を取り直して描き直してから知らせる。
 * 取り直した結果テーブルが閉じていれば (期限切れなど) 上のお知らせ欄に出す。
 */
async function showBlackjackError(error) {
    await refreshCasino().catch(() => {});
    showMessage(el(casino.session ? 'bj-message' : 'casino-message'), error.message, 'error');
}

/** 卓への操作を送り、返ってきた卓を見せる */
async function sendBlackjack(action, payload = {}) {
    if (casino.busy) return null;
    const before = blackjack.table?.round;
    setCasinoBusy(true);
    try {
        const data = await callCasino(action, payload);
        applyServerClock(data.now);
        if (data.me) casino.me = data.me;
        const settledMine = await queueBlackjackTable(data.table);
        // この操作で自分の勝負が決着したときは、手元チップは presentBlackjackTable が取り直している
        const round = data.table.round;
        const finishedNow = round && round.phase === 'done' && roundHasMe(round)
            && (!before || before.no !== round.no || before.phase !== 'done');
        if (!settledMine && !finishedNow) {
            casino.session = data.session;
            renderWallet();
        }
        return data;
    } catch (error) {
        await showBlackjackError(error);
        return null;
    } finally {
        setCasinoBusy(false);
    }
}

async function placeBlackjackBet() {
    const amount = blackjack.bet;
    if (amount < 1) return;
    const data = await sendBlackjack('bjBet', { amount });
    if (data) blackjack.lastBet = amount;
}

async function leaveBlackjackSeat() {
    blackjack.leaving = true;
    await sendBlackjack('bjLeave');
    blackjack.leaving = false;
}

/** 入場したらそのまま空いている席に座る (満席なら見ているだけ) */
async function joinBlackjackAfterEntering() {
    try {
        const data = await callCasino('bjJoin');
        applyServerClock(data.now);
        if (data.me) casino.me = data.me;
        casino.session = data.session;
        queueBlackjackTable(data.table);
        renderWallet();
    } catch (error) {
        showMessage(el('bj-message'), error.message, 'info');
    }
}

// ------------------------------------------------------------------
// 画面の出入り
// ------------------------------------------------------------------
/** status などで受け取った卓を反映する (演出の順番待ちには並べるが、待たない) */
function receiveBlackjackTable(table, now) {
    if (now) applyServerClock(now);
    if (table) queueBlackjackTable(table);
}

function openBlackjackTable() {
    const chips = casino.session ? casino.session.chips : 0;
    if (blackjack.bet > chips) setBlackjackBet(0);
    renderBlackjackView(blackjack.table || EMPTY_BLACKJACK_TABLE);
    renderBlackjackRecent();
    renderBlackjackControls();
    if (!blackjack.pollTimer) {
        blackjack.pollTimer = setInterval(pollBlackjackTable, BLACKJACK_POLL_MS);
        blackjack.clockTimer = setInterval(tickBlackjackClock, 250);
    }
}

function closeBlackjackTable() {
    clearInterval(blackjack.pollTimer);
    clearInterval(blackjack.clockTimer);
    blackjack.pollTimer = null;
    blackjack.clockTimer = null;
}

function renderBlackjackRecent() {
    const list = el('bj-recent');
    list.innerHTML = '';
    (casino.session?.blackjack?.recent || []).forEach(item => {
        const li = document.createElement('li');
        const tone = item.result === 'blackjack' ? 'blackjack' : item.net > 0 ? 'plus' : item.net < 0 ? 'minus' : 'even';
        li.className = `bj-pip is-${tone}`;
        li.textContent = item.result === 'blackjack' ? 'BJ' : formatSigned(item.net);
        li.title = `${BLACKJACK_RESULTS[item.result] || ''} / あなた ${item.player.join('・')} 対 ディーラー ${item.dealer}`
            + ` / 賭け ${item.bet} → 払戻 ${item.returned}`;
        list.appendChild(li);
    });
}

function initBlackjack() {
    document.querySelectorAll('.bj-chip-rack [data-bj-chip]').forEach(button => {
        button.addEventListener('click', () => addBlackjackChip(Number(button.dataset.bjChip)));
    });
    document.querySelectorAll('#bj-actions [data-bj-move]').forEach(button => {
        button.addEventListener('click', () => {
            const round = blackjack.table?.round;
            if (!isMyTurn() || !round) return;
            sendBlackjack('bjMove', { move: button.dataset.bjMove, seq: round.seq });
        });
    });
    el('bj-seats').addEventListener('click', event => {
        const button = event.target.closest('[data-sit-seat]');
        if (button) sendBlackjack('bjJoin', { seat: Number(button.dataset.sitSeat) });
    });
    el('bj-sit-button').addEventListener('click', () => sendBlackjack('bjJoin'));
    el('bj-leave-button').addEventListener('click', leaveBlackjackSeat);
    el('bj-undo-button').addEventListener('click', undoBlackjackChip);
    el('bj-clear-button').addEventListener('click', () => setBlackjackBet(0));
    el('bj-rebet-button').addEventListener('click', () => setBlackjackBet(blackjack.lastBet));
    el('bj-bet-button').addEventListener('click', placeBlackjackBet);
    el('bj-cancel-button').addEventListener('click', () => sendBlackjack('bjBet', { amount: 0 }));
    // 別のタブから戻ってきたら、すぐ読み直す
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && blackjack.pollTimer) pollBlackjackTable();
    });
}
