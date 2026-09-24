// ゲームタブ: ブラックジャック (ディーラーと1対1)
// 配られるカード・勝敗・払い戻しは Cloud Function (casino の bjDeal / bjMove) が決める。
// ディーラーの裏のカードは決着するまで届かない (null のまま) ので、画面では伏せて描く。
// 入場・手元チップ・精算・画面の切り替えは game.js。

const BLACKJACK_DEAL_MS = 240;      // 配るときの1枚ごとの間隔
const BLACKJACK_DEALER_MS = 650;    // ディーラーが1枚ずつめくる・引く間隔
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
    bet: 0,
    placed: [],      // 置いた順のチップ (1つ戻す用)
    lastBet: 0,
    shown: null      // いま画面に出している盤面 (新しく配られたカードだけ動かすため)
};

function currentBlackjackRound() {
    return casino.session?.blackjack?.round || null;
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

function isNaturalHand(hand) {
    return !hand.split && hand.cards.length === 2 && hand.total === 21;
}

// ------------------------------------------------------------------
// 盤面
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
    if (isNaturalHand(hand)) return 'BJ';
    if (hand.soft && hand.total < 21) return `${hand.total - 10} / ${hand.total}`;
    return String(hand.total);
}

function dealerTotalText(dealer) {
    if (dealer.cards.includes(null)) return String(dealer.total);
    if (dealer.cards.length === 2 && dealer.total === 21) return 'BJ';
    return dealer.total > 21 ? `${dealer.total} バースト` : String(dealer.total);
}

function createBetSpot() {
    const spot = document.createElement('div');
    spot.className = 'bj-bet-spot';
    spot.textContent = blackjack.bet > 0 ? blackjack.bet.toLocaleString('ja-JP') : 'BET';
    return spot;
}

function createHandElement(view, hand, index, before, fresh) {
    const box = document.createElement('div');
    box.className = 'bj-hand';
    const several = view.hands.length > 1;
    if (several) box.setAttribute('aria-label', `${index + 1}手目`);
    if (view.phase === 'player' && several && index === view.active) box.classList.add('is-active');

    const cards = document.createElement('div');
    cards.className = 'bj-cards';
    const previous = before ? (before.hands?.[index]?.cards || []) : null;
    renderCardRow(cards, hand.cards, previous, fresh ? i => i * 2 * BLACKJACK_DEAL_MS : null);

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
        const net = hand.returned - hand.bet;
        result.textContent = hand.result === 'push'
            ? BLACKJACK_RESULTS.push
            : `${BLACKJACK_RESULTS[hand.result]} ${formatSigned(net)}`;
        box.appendChild(result);
    }
    return box;
}

function renderBlackjackStatus(view) {
    const status = el('bj-result');
    status.className = 'casino-result';
    if (!view) {
        status.textContent = 'チップを置いて「配る」';
        return;
    }
    if (view.phase === 'reveal') {
        status.classList.add('is-spinning');
        status.textContent = 'ディーラーの番…';
        return;
    }
    if (view.phase === 'player') {
        status.textContent = view.hands.length > 1
            ? `${view.active + 1}手目 (全${view.hands.length}手) の番です`
            : 'ヒットかスタンドを選んでください';
        return;
    }
    const net = view.net;
    status.classList.add(net > 0 ? 'is-plus' : net < 0 ? 'is-minus' : 'is-even');
    const labels = view.hands.map(hand => BLACKJACK_RESULTS[hand.result]);
    status.textContent = view.hands.length === 1
        ? `${labels[0]}${view.hands[0].result === 'blackjack' ? '!' : ''} ${formatSigned(net)}`
        : `${labels.join('・')} — 合計 ${formatSigned(net)}`;
}

/**
 * 盤面を描く。animate のときは前の表示と比べて新しく出たカードだけ動かし、
 * fresh (配った直後) のときは プレイヤー → ディーラー → プレイヤー → ディーラー の順に時間差をつける。
 */
function renderBlackjackRound(view, { animate = false, fresh = false } = {}) {
    const before = !animate ? null : fresh ? { hands: [], dealer: { cards: [] } } : (blackjack.shown || { hands: [], dealer: { cards: [] } });

    const dealerTotal = el('bj-dealer-total');
    renderCardRow(
        el('bj-dealer-cards'),
        view ? view.dealer.cards : [],
        before ? before.dealer.cards : null,
        fresh ? i => (i * 2 + 1) * BLACKJACK_DEAL_MS : null
    );
    dealerTotal.classList.toggle('hidden', !view);
    if (view) dealerTotal.textContent = dealerTotalText(view.dealer);

    const hands = el('bj-hands');
    hands.innerHTML = '';
    if (view) {
        view.hands.forEach((hand, index) => hands.appendChild(createHandElement(view, hand, index, before, fresh)));
    } else {
        hands.appendChild(createBetSpot());
    }

    renderBlackjackStatus(view);
    blackjack.shown = view;
}

/** ディーラーの手を count 枚目まで表にした途中の盤面 (勝敗はまだ出さない) */
function withDealerShown(round, count) {
    const cards = round.dealer.cards.slice(0, count);
    if (cards.length < 2) cards.push(null);
    return {
        ...round,
        phase: 'reveal',
        dealer: { cards, ...blackjackHandValue(cards.filter(Boolean)) },
        hands: round.hands.map(hand => ({ ...hand, result: null, returned: null })),
        net: null
    };
}

/** 届いた盤面を、配る・めくる・引くの順に少しずつ見せる */
async function presentBlackjackRound(round, { fresh }) {
    const wait = ms => (prefersReducedMotion() ? Promise.resolve() : delay(ms));
    if (round.phase !== 'done') {
        renderBlackjackRound(round, { animate: true, fresh });
        if (fresh) await wait(BLACKJACK_DEAL_MS * 4);
        return;
    }
    // 決着した勝負: まずプレイヤーの手を出し、ディーラーの裏から1枚ずつめくる
    renderBlackjackRound(withDealerShown(round, 1), { animate: true, fresh });
    await wait(fresh ? BLACKJACK_DEAL_MS * 4 + 300 : 350);
    for (let count = 2; count <= round.dealer.cards.length; count++) {
        renderBlackjackRound(withDealerShown(round, count), { animate: true });
        await wait(BLACKJACK_DEALER_MS);
    }
    renderBlackjackRound(round, { animate: true });
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

// ------------------------------------------------------------------
// 賭け金と操作
// ------------------------------------------------------------------
function renderBlackjackControls() {
    const round = currentBlackjackRound();
    const playing = round?.phase === 'player';
    const chips = casino.session ? casino.session.chips : 0;
    const locked = casino.busy || !casino.session;
    el('bj-betting').classList.toggle('hidden', playing);
    el('bj-actions').classList.toggle('hidden', !playing);

    document.querySelectorAll('.bj-chip-rack [data-bj-chip]').forEach(button => {
        button.disabled = locked || blackjack.bet >= chips;
    });
    el('bj-bet').textContent = blackjack.bet.toLocaleString('ja-JP');
    const spot = document.querySelector('#bj-hands .bj-bet-spot');
    if (spot) spot.textContent = blackjack.bet > 0 ? blackjack.bet.toLocaleString('ja-JP') : 'BET';
    el('bj-undo-button').disabled = locked || blackjack.placed.length === 0;
    el('bj-clear-button').disabled = locked || blackjack.bet === 0;
    el('bj-rebet-button').disabled = locked || blackjack.lastBet < 1 || blackjack.lastBet > chips
        || blackjack.bet === blackjack.lastBet;
    el('bj-deal-button').disabled = locked || blackjack.bet < 1 || blackjack.bet > chips;

    const actions = playing ? round.actions : null;
    document.querySelectorAll('#bj-actions [data-bj-move]').forEach(button => {
        button.disabled = locked || !actions || !actions[button.dataset.bjMove];
    });
    const hand = playing ? round.hands[round.active] : null;
    document.querySelectorAll('#bj-actions .bj-move-cost').forEach(cost => {
        cost.textContent = hand ? ` +${hand.bet.toLocaleString('ja-JP')}` : '';
    });
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
    if (casino.busy || !casino.session || currentBlackjackRound()?.phase === 'player') return;
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

async function applyBlackjackResponse(data, { fresh }) {
    if (data.expired) {
        await refreshCasino();
        showMessage(el('casino-message'), settledMessage(data.settled), 'info');
        return;
    }

    // 手元チップや履歴は、ディーラーのカードをめくり終えてから更新する (結果が先に見えないように)
    await presentBlackjackRound(data.round, { fresh });
    if (data.session) {
        casino.session = data.session;
    } else {
        // チップが尽きてサーバー側で精算済み。最後の勝負だけは描いて見せる
        const round = data.round;
        const summary = {
            result: round.hands.length === 1 ? round.hands[0].result : 'split',
            bet: round.totalBet,
            returned: round.returned,
            net: round.net,
            player: round.hands.map(hand => hand.total),
            dealer: round.dealer.total
        };
        casino.session = {
            ...casino.session,
            chips: 0,
            bjHands: (casino.session.bjHands || 0) + 1,
            blackjack: { round, recent: [summary, ...(casino.session.blackjack?.recent || [])] }
        };
    }
    renderWallet();
    renderBlackjackRecent();
    if (data.round.phase === 'done') prefillBlackjackBet();
    renderBlackjackControls();

    if (data.settled) {
        showMessage(el('bj-message'), `チップがなくなりました。${settledMessage(data.settled)}`, 'info');
        await delay(2500);
        await refreshCasino();
        showMessage(el('casino-message'), settledMessage(data.settled), 'info');
    }
}

/**
 * 盤面がずれていることもあるので、最新の状態を取り直して描き直してから知らせる。
 * 取り直した結果テーブルが閉じていれば (期限切れなど) 上のお知らせ欄に出す。
 */
async function showBlackjackError(error) {
    await refreshCasino().catch(() => {});
    showMessage(el(casino.session ? 'bj-message' : 'casino-message'), error.message, 'error');
}

async function dealBlackjack() {
    if (casino.busy || !casino.session || blackjack.bet < 1) return;
    const bet = blackjack.bet;
    const button = el('bj-deal-button');
    setCasinoBusy(true);
    button.setAttribute('aria-busy', 'true');
    try {
        const data = await callCasino('bjDeal', { bet });
        blackjack.lastBet = bet;
        await applyBlackjackResponse(data, { fresh: true });
    } catch (error) {
        await showBlackjackError(error);
    } finally {
        button.removeAttribute('aria-busy');
        setCasinoBusy(false);
    }
}

async function moveBlackjack(move) {
    const round = currentBlackjackRound();
    if (casino.busy || round?.phase !== 'player' || !round.actions?.[move]) return;
    setCasinoBusy(true);
    try {
        const data = await callCasino('bjMove', { move, seq: round.seq });
        await applyBlackjackResponse(data, { fresh: false });
    } catch (error) {
        await showBlackjackError(error);
    } finally {
        setCasinoBusy(false);
    }
}

// ------------------------------------------------------------------
// 起動
// ------------------------------------------------------------------
function openBlackjackTable() {
    const chips = casino.session ? casino.session.chips : 0;
    if (blackjack.bet > chips) setBlackjackBet(0);
    if (blackjack.bet === 0) prefillBlackjackBet();
    renderBlackjackRound(currentBlackjackRound());
    renderBlackjackRecent();
    renderBlackjackControls();
}

function initBlackjack() {
    document.querySelectorAll('.bj-chip-rack [data-bj-chip]').forEach(button => {
        button.addEventListener('click', () => addBlackjackChip(Number(button.dataset.bjChip)));
    });
    document.querySelectorAll('#bj-actions [data-bj-move]').forEach(button => {
        button.addEventListener('click', () => moveBlackjack(button.dataset.bjMove));
    });
    el('bj-undo-button').addEventListener('click', undoBlackjackChip);
    el('bj-clear-button').addEventListener('click', () => setBlackjackBet(0));
    el('bj-rebet-button').addEventListener('click', () => setBlackjackBet(blackjack.lastBet));
    el('bj-deal-button').addEventListener('click', dealBlackjack);
    renderBlackjackRound(null);
}
