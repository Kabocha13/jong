// ゲームタブ: テキサスホールデム (全員共通の1卓・6席。空いた席は船員の AI が埋める)
// 配られるカード・船員の判断・勝敗・払い戻しは Cloud Function (casino の hdJoin / hdMove など) が決める。
// ほかの人や船員の操作は、誰でも読める卓の写し (holdem_public/main) を読み直して反映する。
// 自分の手札は holdem_hole/{uid} (本人だけが読める) から受け取る。
// 船員の番はサーバーで一気に進むので、届いた記録 (round.log) を1手ずつ時間差で見せる。
// 締め切り (番の持ち時間・次のハンドまでの間) を過ぎたら、画面を開いている人が hdTick を送って先へ進める。
// 入場・手元チップ・精算・画面の切り替えは game.js。カードの描き方とサーバー時計は game-blackjack.js のものを使う。

const HOLDEM_POLL_MS = 1200;
const HOLDEM_SEATS = 6;
const HOLDEM_TURN_MS = 25000;          // サーバーの HOLDEM_TURN_MS と同じ
const HOLDEM_REPLAY_MAX_MS = 6000;     // 1回の更新で見せる演出の上限
const HOLDEM_REPLAY_FAST_MS = 3000;    // 自分が降りているときの上限
const HOLDEM_STREET_MS = 800;
const HOLDEM_OTHER_HUMAN_MS = 500;
const HOLDEM_SHOWDOWN_MS = 900;
// 席の並び。自分の席を pos 0 (手前中央) にして時計回りに置く。grid の行・列
const HOLDEM_POSITIONS = [
    { row: 3, col: 2 },
    { row: 2, col: 1 },
    { row: 1, col: 1 },
    { row: 1, col: 2 },
    { row: 1, col: 3 },
    { row: 2, col: 3 }
];
const HOLDEM_MOVE_TEXT = {
    blind: 'ブラインド',
    fold: 'フォールド',
    check: 'チェック',
    call: 'コール',
    raise: 'レイズ',
    allin: 'オールイン'
};
const HOLDEM_STREET_TEXT = { preflop: 'プリフロップ', flop: 'フロップ', turn: 'ターン', river: 'リバー' };
const HOLDEM_HAND_NAMES = ['ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ', 'ロイヤルフラッシュ'];

const holdem = {
    table: null,        // 最後に受け取った卓 (公開の形)
    latest: null,
    shown: null,        // いま画面に出している卓
    queue: Promise.resolve(),
    hole: null,         // 自分の手札 { no, seat, cards }
    holeFetching: false,
    replayed: { no: 0, seq: 0 },  // ここまでの記録は見せた
    ticked: '',
    pollTimer: null,
    clockTimer: null,
    polling: false,
    leaving: false,
    raiseTo: 0
};

const EMPTY_HOLDEM_TABLE = { phase: 'waiting', seq: -1, seats: Array(HOLDEM_SEATS).fill(null), bots: [], round: null, blinds: { small: 1, big: 2 } };

// ------------------------------------------------------------------
// 卓の読み方
// ------------------------------------------------------------------
function myHoldemSeat(table = holdem.table) {
    return table ? table.seats.findIndex(seat => seat && seat.name === myName()) : -1;
}

function holdemRoundPlayer(table, seat) {
    return table?.round ? table.round.players.find(player => player.seat === seat) || null : null;
}

function myHoldemPlayer(table = holdem.table) {
    return table?.round ? table.round.players.find(player => !player.bot && player.name === myName()) || null : null;
}

function isMyHoldemTurn(table = holdem.table) {
    if (!table || table.phase !== 'playing' || !table.round || table.round.turn === null) return false;
    const seat = table.seats[table.round.turn];
    return Boolean(seat && seat.name === myName());
}

/** いまのハンドに残っている (降りるまで席を立てず、精算もできない) */
function isHoldemLive() {
    const table = holdem.table;
    if (!table || table.phase !== 'playing') return false;
    const player = myHoldemPlayer(table);
    return Boolean(player && !player.folded);
}

function holdemBotAt(table, seat) {
    return (table?.bots || []).find(bot => bot.seat === seat) || null;
}

function holdemBotById(table, id) {
    return (table?.bots || []).find(bot => bot.id === id) || null;
}

/** ゲーム一覧のタイルに卓の様子を出す */
function renderHoldemTile() {
    const live = el('hd-tile-live');
    const table = holdem.table;
    const seated = table ? table.seats.filter(Boolean).length : 0;
    live.textContent = !table ? '' : seated ? `いま卓に${seated}人` : '席は空いています';
    live.classList.toggle('is-busy', seated > 0);
}

// ------------------------------------------------------------------
// 役の名前 (表示用。functions/holdem.js と同じ数え方)
// ------------------------------------------------------------------
function holdemCardValue(card) {
    return ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(card.slice(0, -1)) + 2;
}

function holdemScoreFive(cards) {
    const values = cards.map(holdemCardValue).sort((x, y) => y - x);
    const flush = cards.every(card => card.slice(-1) === cards[0].slice(-1));
    const counts = new Map();
    values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
    const groups = Array.from(counts.entries()).sort((x, y) => y[1] - x[1] || y[0] - x[0]);
    let straight = 0;
    if (groups.length === 5) {
        if (values[0] - values[4] === 4) straight = values[0];
        else if (values[0] === 14 && values[1] === 5 && values[4] === 2) straight = 5;
    }
    let category;
    let kickers;
    if (straight && flush) { category = straight === 14 ? 9 : 8; kickers = [straight]; }
    else if (groups[0][1] === 4) { category = 7; kickers = [groups[0][0], groups[1][0]]; }
    else if (groups[0][1] === 3 && groups[1][1] === 2) { category = 6; kickers = [groups[0][0], groups[1][0]]; }
    else if (flush) { category = 5; kickers = values; }
    else if (straight) { category = 4; kickers = [straight]; }
    else if (groups[0][1] === 3) { category = 3; kickers = groups.map(g => g[0]); }
    else if (groups[0][1] === 2 && groups[1][1] === 2) { category = 2; kickers = groups.map(g => g[0]); }
    else if (groups[0][1] === 2) { category = 1; kickers = groups.map(g => g[0]); }
    else { category = 0; kickers = values; }
    let score = category;
    for (let i = 0; i < 5; i++) score = score * 15 + (kickers[i] || 0);
    return score;
}

/** 手札とボード (合わせて2〜7枚) から、いまの役の名前 */
function holdemHandLabel(cards) {
    if (cards.length < 5) {
        if (cards.length === 2 && holdemCardValue(cards[0]) === holdemCardValue(cards[1])) return 'ポケットペア';
        return '';
    }
    let best = -1;
    const pick = (start, chosen) => {
        if (chosen.length === 5) {
            best = Math.max(best, holdemScoreFive(chosen));
            return;
        }
        for (let i = start; i < cards.length; i++) pick(i + 1, [...chosen, cards[i]]);
    };
    pick(0, []);
    return HOLDEM_HAND_NAMES[Math.floor(best / 15 ** 5)] || '';
}

// ------------------------------------------------------------------
// 記録 (log) から途中の形を作る
// ------------------------------------------------------------------
function boardCountFor(street) {
    return { preflop: 0, flop: 3, turn: 4, river: 5 }[street] ?? 0;
}

/** round.log の index 番目まで進めたところの卓 (勝敗はまだ出さない) */
function holdemViewAt(table, index) {
    const round = table.round;
    // ハンドの初めの手元: 決着後なら いま − 収支、途中なら いま + 出した分
    const players = round.players.map(player => ({
        ...player,
        stack: player.net !== null && player.net !== undefined ? player.stack - player.net : player.stack + player.committed,
        committed: 0,
        streetBet: 0,
        folded: false,
        allIn: false,
        hole: null,
        result: null,
        net: null,
        hand: null,
        acting: false,
        lastMove: null
    }));
    let street = 'preflop';
    let pot = 0;
    for (let i = 0; i <= index && i < round.log.length; i++) {
        const entry = round.log[i];
        pot = entry.pot;
        if (entry.move === 'street') {
            street = entry.street;
            players.forEach(player => { player.streetBet = 0; player.lastMove = null; });
            continue;
        }
        const player = players.find(item => item.seat === entry.seat);
        if (!player) continue;
        player.stack = entry.stack;
        player.streetBet = entry.bet;
        player.lastMove = entry;
        player.acting = i === index;
        if (entry.move === 'fold') player.folded = true;
        if (entry.move === 'allin') player.allIn = true;
    }
    return {
        ...table,
        phase: 'playing',
        round: {
            ...round,
            phase: street,
            board: round.board.slice(0, boardCountFor(street)),
            pot,
            turn: null,
            showdown: false,
            winners: null,
            players
        }
    };
}

/** 決着した卓。カードは見せるが勝敗はまだ出さない */
function holdemViewRevealed(table) {
    return {
        ...table,
        round: {
            ...table.round,
            winners: null,
            players: table.round.players.map(player => ({ ...player, result: null, net: null, hand: null }))
        }
    };
}

// ------------------------------------------------------------------
// 描く
// ------------------------------------------------------------------
function holdemMoveText(entry) {
    if (!entry) return '';
    const text = HOLDEM_MOVE_TEXT[entry.move] || '';
    if (entry.move === 'fold' || entry.move === 'check') return text;
    return `${text} ${Number(entry.amount || 0).toLocaleString('ja-JP')}`;
}

function holdemMyCards(view) {
    const player = myHoldemPlayer(view);
    if (!player) return null;
    if (player.hole) return player.hole;
    if (holdem.hole && holdem.hole.no === view.round.no) return holdem.hole.cards;
    return [null, null];
}

function createHoldemSeat(view, seat, pos, before) {
    const li = document.createElement('li');
    li.className = 'hd-seat';
    li.dataset.seat = String(seat);
    li.style.gridRow = String(HOLDEM_POSITIONS[pos].row);
    li.style.gridColumn = String(HOLDEM_POSITIONS[pos].col);

    const round = view.round;
    const live = view.phase === 'playing' || view.phase === 'done';
    const player = live ? holdemRoundPlayer(view, seat) : null;
    const human = view.seats[seat];
    const bot = player?.bot ? holdemBotById(view, player.bot) : (!human ? holdemBotAt(view, seat) : null);
    const name = bot ? (bot.short || bot.name) : player ? player.name : human ? human.name : '';
    // 船員がハンドの途中の席に人が座ったときは、決着まで船員の席として出す
    const me = player ? (!player.bot && player.name === myName()) : Boolean(human && human.name === myName());
    li.classList.toggle('is-me', me);
    li.classList.toggle('is-bot', Boolean(player ? player.bot : bot));
    li.classList.toggle('is-folded', Boolean(player && player.folded));
    li.classList.toggle('is-out', !player && Boolean(human && human.sittingOut));
    li.classList.toggle('is-idle', !player && !me && Boolean(bot || human));
    li.classList.toggle('is-turn', Boolean(round && view.phase === 'playing' && round.turn === seat));
    li.classList.toggle('is-acting', Boolean(player && player.acting));
    li.classList.toggle('is-winner', Boolean(player && player.result === 'win'));

    const head = document.createElement('div');
    head.className = 'hd-seat-head';
    if (round && round.button === seat && live) {
        const button = document.createElement('span');
        button.className = 'hd-dealer';
        button.textContent = 'D';
        button.title = 'ディーラーボタン';
        head.appendChild(button);
    }
    const nameEl = document.createElement('span');
    nameEl.className = 'hd-seat-name';
    nameEl.textContent = name;
    if (bot) nameEl.title = `${bot.title} / ${bot.style}: ${bot.desc}`;
    head.appendChild(nameEl);
    if (me) {
        const tag = document.createElement('span');
        tag.className = 'bj-seat-me';
        tag.textContent = 'あなた';
        head.appendChild(tag);
    } else if (bot) {
        const tag = document.createElement('span');
        tag.className = 'hd-seat-style';
        tag.textContent = bot.style;
        head.appendChild(tag);
    }
    li.appendChild(head);

    // 手元チップと、このストリートで出しているチップ
    const stackRow = document.createElement('div');
    stackRow.className = 'hd-seat-stack';
    const chipsEl = document.createElement('span');
    chipsEl.className = 'bj-seat-chips hd-seat-chips';
    const chips = player ? player.stack : human ? human.chips : bot ? bot.chips : 0;
    chipsEl.textContent = Number(chips || 0).toLocaleString('ja-JP');
    chipsEl.title = '手元チップ';
    stackRow.appendChild(chipsEl);
    if (player && player.streetBet > 0 && view.round.phase !== 'done') {
        const bet = document.createElement('span');
        bet.className = 'bj-hand-bet hd-seat-bet';
        bet.textContent = Number(player.streetBet).toLocaleString('ja-JP');
        bet.title = 'このストリートで出したチップ';
        stackRow.appendChild(bet);
    }
    li.appendChild(stackRow);

    // カード
    const cards = document.createElement('div');
    cards.className = 'bj-cards hd-seat-cards';
    if (player && !player.folded) {
        let shown = player.hole;
        if (!shown && me) shown = holdemMyCards(view) || [null, null];
        const previous = before ? holdemRoundPlayer(before, seat) : null;
        const previousCards = before ? (previous && !previous.folded ? (previous.hole || (me ? holdemMyCards(before) : [null, null]) || [null, null]) : []) : null;
        renderCardRow(cards, shown || [null, null], previousCards, null);
    }
    li.appendChild(cards);

    // 状態の一言 (ブラインド・操作・降り・休憩)。演出の途中でなければ、このストリートの最後の操作を出す
    const note = document.createElement('span');
    note.className = 'hd-seat-note';
    let lastMove = player ? player.lastMove : null;
    if (player && !lastMove && round && round.log && round.phase !== 'done') {
        lastMove = [...round.log].reverse().find(entry => entry.seat === seat && entry.street === round.phase) || null;
    }
    if (player) {
        if (player.result === 'win') {
            note.textContent = `+${Number(player.net).toLocaleString('ja-JP')}`;
            note.classList.add('is-win');
        } else if (player.result === 'fold') {
            note.textContent = 'フォールド';
        } else if (player.result === 'lose') {
            note.textContent = '';
        } else if (lastMove && lastMove.move !== 'blind') {
            note.textContent = holdemMoveText(lastMove);
            note.classList.add('is-move', `is-${lastMove.move}`);
        } else if (player.folded) {
            note.textContent = 'フォールド';
        } else if (player.allIn) {
            note.textContent = 'オールイン';
        } else if (player.blind && view.round.phase === 'preflop') {
            note.textContent = player.blind;
        }
        if (player.result === 'win' && player.hand) note.title = player.hand.name;
    } else if (human) {
        note.textContent = human.sittingOut ? '休憩中' : (view.phase === 'playing' ? '次から' : '');
    } else if (bot && view.phase === 'playing') {
        note.textContent = '休み';
    }
    if (player && player.bot && human) {
        note.textContent = `次から ${human.name === myName() ? 'あなた' : human.name}`;
        note.className = 'hd-seat-note';
    }
    li.appendChild(note);

    // 役名 (決着時)
    if (player && player.hand && player.result !== 'fold') {
        const hand = document.createElement('span');
        hand.className = `hd-seat-hand${player.result === 'win' ? ' is-win' : ''}`;
        hand.textContent = player.hand.name;
        li.appendChild(hand);
    }

    if (round && view.phase === 'playing' && round.turn === seat) {
        const timer = document.createElement('span');
        timer.className = 'bj-seat-timer';
        timer.appendChild(document.createElement('span'));
        li.appendChild(timer);
    }

    if (!human && mySeatFree(view) && casino.session) {
        const sit = document.createElement('button');
        sit.type = 'button';
        sit.className = 'hd-seat-sit';
        sit.dataset.hdSit = String(seat);
        sit.textContent = 'ここに座る';
        sit.title = bot ? `${bot.name} と交代する` : '座る';
        sit.disabled = casino.busy;
        li.appendChild(sit);
    }
    return li;
}

function mySeatFree(view) {
    return myHoldemSeat(view) < 0;
}

function renderHoldemBoard(view, before) {
    const round = view.round;
    const board = el('hd-board');
    const cards = round ? round.board : [];
    renderCardRow(board, cards, before ? (before.round?.board || []) : null, index => (index - (before?.round?.board?.length || 0)) * 160);
    const pot = el('hd-pot');
    pot.textContent = round ? `ポット ${Number(round.pot || 0).toLocaleString('ja-JP')}` : '';
    pot.classList.toggle('hidden', !round);
    const street = el('hd-street');
    street.textContent = round && view.phase !== 'waiting' ? (round.phase === 'done' ? (round.showdown ? 'ショーダウン' : '決着') : HOLDEM_STREET_TEXT[round.phase] || '') : '';
}

/** 卓を描く。animate のときは前の表示と比べて新しく出たカードだけ動かす */
function renderHoldemView(view, { animate = false } = {}) {
    const before = animate ? holdem.shown : null;
    // 演出の途中は操作を出さない (終わったら renderHoldemControls が出し直す)
    if (view.replaying) el('hd-actions').classList.add('hidden');
    renderHoldemBoard(view, before);
    const seats = el('hd-seats');
    seats.innerHTML = '';
    const mine = myHoldemSeat(view);
    const origin = mine >= 0 ? mine : 0;
    for (let seat = 0; seat < HOLDEM_SEATS; seat++) {
        const pos = (seat - origin + HOLDEM_SEATS) % HOLDEM_SEATS;
        seats.appendChild(createHoldemSeat(view, seat, pos, before));
    }
    holdem.shown = view;
    renderHoldemMine(view);
    renderHoldemStatus();
    renderHoldemResult(view);
}

/** 自分の手札を大きく出し、いまの役を添える */
function renderHoldemMine(view) {
    const box = el('hd-mine');
    const player = myHoldemPlayer(view);
    const cards = player && !player.folded ? holdemMyCards(view) : null;
    if (!cards) {
        box.classList.add('hidden');
        return;
    }
    box.classList.remove('hidden');
    const container = el('hd-my-cards');
    const previous = holdem.mineShown || [];
    renderCardRow(container, cards, previous, null);
    holdem.mineShown = cards;
    const known = cards.filter(Boolean);
    el('hd-my-hand').textContent = known.length === 2 ? holdemHandLabel([...known, ...(view.round.board || [])]) : '';
}

function renderHoldemStatus() {
    const status = el('hd-status');
    const view = holdem.shown;
    const table = holdem.table;
    if (!view || !table) {
        status.textContent = '';
        return;
    }
    const mine = myHoldemSeat(table);
    const seat = mine >= 0 ? table.seats[mine] : null;
    let text = '';
    let myTurn = false;
    if (view.replaying) {
        const acting = view.round?.players.find(player => player.acting);
        text = acting ? `${acting.name} …` : view.round?.phase === 'done' ? '決着…' : '';
    } else if (table.phase === 'playing') {
        const index = table.round.turn;
        const who = table.seats[index];
        const left = secondsLeft(table.turnEndsAt);
        if (who && who.name === myName()) {
            myTurn = true;
            text = `あなたの番です${left === null ? '' : ` — 残り ${left} 秒`}`;
        } else {
            text = `${who ? who.name : holdemBotAt(table, index)?.name || ''} の番です${left === null ? '' : ` — 残り ${left} 秒`}`;
        }
    } else if (table.phase === 'done') {
        const left = secondsLeft(table.nextHandAt);
        text = seat && !seat.sittingOut ? `次のハンドまで ${left ?? 0} 秒` : '決着しました';
    } else if (seat && seat.sittingOut) {
        text = seat.outReason === 'chips' ? 'チップがブラインドに足りないので休憩中です'
            : seat.outReason === 'idle' ? '時間切れが続いたので休憩にしました。「戻る」で再開できます'
                : '休憩中です。「戻る」で次のハンドから参加します';
    } else if (seat) {
        text = 'まもなく始まります…';
    } else {
        text = '席に座ると、船員たちとのハンドが始まります (1人でも遊べます)';
    }
    status.textContent = text;
    status.classList.toggle('is-my-turn', myTurn);

    const timer = document.querySelector('#hd-seats .bj-seat-timer > span');
    if (timer && table.turnEndsAt) {
        const left = Math.max(0, Date.parse(table.turnEndsAt) - serverNow());
        timer.style.width = `${Math.min(100, (left / HOLDEM_TURN_MS) * 100)}%`;
    }
}

function renderHoldemResult(view) {
    const result = el('hd-result');
    result.className = 'casino-result';
    const round = view.round;
    const mine = round && round.phase === 'done' && !view.replaying ? myHoldemPlayer(view) : null;
    if (!mine || mine.result === null || mine.result === undefined) {
        result.textContent = '';
        return;
    }
    result.classList.add(mine.net > 0 ? 'is-plus' : mine.net < 0 ? 'is-minus' : 'is-even');
    const label = mine.result === 'win' ? (round.showdown && mine.hand ? `${mine.hand.name}で勝ち` : '勝ち')
        : mine.result === 'fold' ? 'フォールド' : (mine.hand ? `${mine.hand.name}で負け` : '負け');
    result.textContent = `${label} ${formatSigned(mine.net)}`;
}

// ------------------------------------------------------------------
// 届いた卓を、1手ずつ見せる
// ------------------------------------------------------------------
function holdemNewEntries(next) {
    const round = next.round;
    if (!round || !round.log) return [];
    const from = holdem.replayed.no === round.no ? holdem.replayed.seq : 0;
    return round.log.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.seq > from);
}

function holdemEntryDelay({ entry }, next) {
    if (entry.move === 'street') return HOLDEM_STREET_MS;
    if (entry.move === 'blind') return 250;
    const player = next.round.players.find(item => item.seat === entry.seat);
    if (!player) return 0;
    if (!player.bot) return player.name === myName() ? 0 : HOLDEM_OTHER_HUMAN_MS;
    return entry.delay || 800;
}

async function presentHoldemTable(next) {
    if (!next || (holdem.table && next.seq <= holdem.table.seq)) return false;
    const previous = holdem.table;
    holdem.table = next;
    renderHoldemControls();
    if (casino.ready && !routeGame()) renderMenu();

    const round = next.round;
    const entries = holdemNewEntries(next);
    const wait = ms => (prefersReducedMotion() ? Promise.resolve() : delay(ms));
    const finishedNow = Boolean(round) && round.phase === 'done'
        && !(previous && previous.round && previous.round.no === round.no && previous.round.phase === 'done');

    if (!previous || !round || !entries.length || prefersReducedMotion()) {
        renderHoldemView(next, { animate: Boolean(previous) });
    } else {
        // 演出の合計が長すぎるときは縮める
        const me = myHoldemPlayer(next);
        const cap = me && !me.folded ? HOLDEM_REPLAY_MAX_MS : HOLDEM_REPLAY_FAST_MS;
        const delays = entries.map(item => holdemEntryDelay(item, next));
        const total = delays.reduce((sum, ms) => sum + ms, 0);
        const scale = total > cap ? cap / total : 1;
        for (let i = 0; i < entries.length; i++) {
            const ms = delays[i] * scale;
            if (ms > 0) await wait(ms);
            const view = holdemViewAt(next, entries[i].index);
            view.replaying = true;
            renderHoldemView(view, { animate: true });
        }
        if (round.phase === 'done') {
            if (round.showdown) {
                await wait(HOLDEM_SHOWDOWN_MS * 0.6);
                const revealed = holdemViewRevealed(next);
                revealed.replaying = true;
                renderHoldemView(revealed, { animate: true });
                await wait(HOLDEM_SHOWDOWN_MS);
            } else {
                await wait(400);
            }
        }
        renderHoldemView(next, { animate: true });
    }
    if (round) holdem.replayed = { no: round.no, seq: round.seq };

    const settledMine = finishedNow && Boolean(myHoldemPlayer(round ? next : null));
    if (settledMine) {
        await refreshCasino().catch(error => console.warn('手元チップの更新に失敗:', error));
    }
    const beforeSeat = previous ? myHoldemSeat(previous) : -1;
    const afterSeat = myHoldemSeat(next);
    if (beforeSeat >= 0 && afterSeat < 0 && !holdem.leaving && casino.session) {
        showMessage(el('hd-message'), '席を空けました。', 'info');
    }
    if (afterSeat >= 0) {
        const seat = next.seats[afterSeat];
        const was = beforeSeat >= 0 ? previous.seats[beforeSeat] : null;
        if (seat.sittingOut && seat.outReason === 'idle' && !(was && was.sittingOut)) {
            showMessage(el('hd-message'), '時間切れが続いたので休憩にしました。「戻る」で再開できます。', 'info');
        } else if (seat.sittingOut && seat.outReason === 'chips' && !(was && was.sittingOut)) {
            showMessage(el('hd-message'), 'チップがブラインドに足りないので休憩になりました。', 'info');
        }
    }
    renderHoldemControls();
    return settledMine;
}

function queueHoldemTable(table) {
    if (table && (!holdem.latest || table.seq > holdem.latest.seq)) holdem.latest = table;
    holdem.queue = holdem.queue
        .then(() => presentHoldemTable(table))
        .catch(error => {
            console.error('卓の表示に失敗:', error);
            return false;
        });
    return holdem.queue;
}

/** status などで受け取った卓と手札を反映する */
function receiveHoldemTable(table, now, hole) {
    if (now) applyServerClock(now);
    if (hole) setHoldemHole(hole);
    if (table) queueHoldemTable(table);
}

function setHoldemHole(hole) {
    if (!hole || !Array.isArray(hole.cards)) return;
    if (holdem.hole && holdem.hole.no === hole.no) return;
    holdem.hole = { no: hole.no, seat: hole.seat, cards: hole.cards };
    // すでにそのハンドを出していれば描き直す
    if (holdem.shown && holdem.shown.round && holdem.shown.round.no === hole.no && !holdem.shown.replaying) {
        renderHoldemView(holdem.shown, { animate: true });
    }
}

// ------------------------------------------------------------------
// 時計と読み直し
// ------------------------------------------------------------------
function tickHoldemClock() {
    renderHoldemStatus();
    const table = holdem.table;
    if (!table) return;
    const deadline = table.phase === 'playing' ? table.turnEndsAt : table.phase === 'done' ? table.nextHandAt : null;
    if (!deadline || holdem.ticked === deadline) return;
    if (serverNow() < Date.parse(deadline) + 300) return;
    // 次のハンドは座っている人だけが始める (見ているだけの人は待つ)
    if (table.phase === 'done' && myHoldemSeat(table) < 0) return;
    holdem.ticked = deadline;
    setTimeout(async () => {
        try {
            const data = await callCasino('hdTick');
            applyServerClock(data.now);
            if (data.hole) setHoldemHole(data.hole);
            queueHoldemTable(data.holdemTable);
        } catch (error) {
            console.warn('卓の時間切れ処理に失敗:', error);
        }
        setTimeout(() => {
            if (holdem.ticked === deadline) holdem.ticked = '';
        }, 2000);
    }, Math.random() * 700);
}

async function pollHoldemTable() {
    if (holdem.polling || document.hidden || routeGame() !== 'holdem') return;
    holdem.polling = true;
    try {
        const doc = await getFirestoreDb().collection('holdem_public').doc('main').get();
        if (doc.exists) queueHoldemTable(doc.data());
        await fetchHoldemHoleIfNeeded();
    } catch (error) {
        console.warn('卓の読み込みに失敗:', error);
    } finally {
        holdem.polling = false;
    }
}

/** いまのハンドに自分が配られているのに手札がまだ無ければ、holdem_hole/{uid} を読む */
async function fetchHoldemHoleIfNeeded() {
    const round = holdem.latest?.round;
    if (!round || round.phase === 'done' || holdem.holeFetching) return;
    if (holdem.hole && holdem.hole.no === round.no) return;
    if (!round.players.some(player => !player.bot && player.name === myName())) return;
    const uid = getCurrentFirebaseUidSync();
    if (!uid) return;
    holdem.holeFetching = true;
    try {
        const doc = await getFirestoreDb().collection('holdem_hole').doc(uid).get();
        if (doc.exists) setHoldemHole(doc.data());
    } catch (error) {
        console.warn('手札の読み込みに失敗:', error);
    } finally {
        holdem.holeFetching = false;
    }
}

// ------------------------------------------------------------------
// 操作
// ------------------------------------------------------------------
function holdemActionsNow() {
    const table = holdem.table;
    return isMyHoldemTurn(table) && !holdem.shown?.replaying ? table.round.actions : null;
}

function renderHoldemControls() {
    const table = holdem.table || EMPTY_HOLDEM_TABLE;
    const index = myHoldemSeat(table);
    const seat = index >= 0 ? table.seats[index] : null;
    const locked = casino.busy || !casino.session;
    const full = table.seats.every(Boolean);
    const actions = holdemActionsNow();

    el('hd-sit').classList.toggle('hidden', Boolean(seat) || !casino.session);
    el('hd-sit-button').disabled = locked || full;
    el('hd-sit-button').textContent = full ? '満席です' : '席に座る';
    el('hd-seat-tools').classList.toggle('hidden', !seat);
    el('hd-sitout-button').textContent = seat && seat.sittingOut ? '戻る' : '休憩する';
    el('hd-sitout-button').disabled = casino.busy || !seat;
    el('hd-leave-button').disabled = casino.busy || !seat || isHoldemLive();
    el('hd-leave-button').classList.toggle('hidden', !seat);

    const box = el('hd-actions');
    box.classList.toggle('hidden', !actions);
    document.querySelectorAll('#hd-seats [data-hd-sit]').forEach(button => { button.disabled = casino.busy; });
    if (!actions) {
        renderSettleButton();
        return;
    }
    const fmt = value => Number(value).toLocaleString('ja-JP');
    el('hd-fold-button').disabled = casino.busy;
    el('hd-check-button').classList.toggle('hidden', !actions.check);
    el('hd-check-button').disabled = casino.busy;
    el('hd-call-button').classList.toggle('hidden', !actions.call);
    el('hd-call-button').disabled = casino.busy;
    el('hd-call-amount').textContent = actions.call ? fmt(actions.toCall) : '';
    const raise = el('hd-raise');
    raise.classList.toggle('hidden', !actions.raise && !actions.allin);
    const range = el('hd-raise-range');
    const input = el('hd-raise-input');
    if (actions.raise) {
        if (holdem.raiseTo < actions.minRaiseTo || holdem.raiseTo > actions.maxRaiseTo || !holdem.raiseFor || holdem.raiseFor !== table.round.seq) {
            holdem.raiseTo = actions.minRaiseTo;
            holdem.raiseFor = table.round.seq;
        }
        range.min = String(actions.minRaiseTo);
        range.max = String(actions.maxRaiseTo);
        range.value = String(holdem.raiseTo);
        input.min = String(actions.minRaiseTo);
        input.max = String(actions.maxRaiseTo);
        input.value = String(holdem.raiseTo);
        range.disabled = casino.busy;
        input.disabled = casino.busy;
        el('hd-raise-button').disabled = casino.busy;
        el('hd-raise-button').textContent = holdem.raiseTo >= actions.maxRaiseTo
            ? `オールイン ${fmt(actions.maxRaiseTo)}`
            : `${table.round.currentBet > 0 ? 'レイズ' : 'ベット'} ${fmt(holdem.raiseTo)}`;
        document.querySelectorAll('#hd-raise [data-hd-preset]').forEach(button => { button.disabled = casino.busy; });
        el('hd-raise-controls').classList.remove('hidden');
    } else {
        el('hd-raise-controls').classList.add('hidden');
        el('hd-raise-button').disabled = casino.busy;
        el('hd-raise-button').textContent = `オールイン ${fmt(actions.maxRaiseTo)}`;
    }
    renderSettleButton();
}

function setHoldemRaise(value) {
    const actions = holdemActionsNow();
    if (!actions || !actions.raise) return;
    const clamped = Math.min(actions.maxRaiseTo, Math.max(actions.minRaiseTo, Math.round(Number(value) || 0)));
    holdem.raiseTo = clamped;
    renderHoldemControls();
}

function holdemPreset(kind) {
    const actions = holdemActionsNow();
    if (!actions) return;
    const round = holdem.table.round;
    const potAfterCall = round.pot + actions.toCall;
    const size = kind === 'min' ? 0 : kind === 'half' ? Math.round(potAfterCall / 2) : kind === 'pot' ? potAfterCall : Infinity;
    const to = kind === 'min' ? actions.minRaiseTo : kind === 'max' ? actions.maxRaiseTo : round.currentBet + size;
    setHoldemRaise(to);
}

async function showHoldemError(error) {
    await refreshCasino().catch(() => {});
    showMessage(el(casino.session ? 'hd-message' : 'casino-message'), error.message, 'error');
}

/** 卓への操作を送り、返ってきた卓を見せる */
async function sendHoldem(action, payload = {}) {
    if (casino.busy) return null;
    setCasinoBusy(true);
    try {
        const data = await callCasino(action, payload);
        applyServerClock(data.now);
        if (data.me) casino.me = data.me;
        if (data.hole) setHoldemHole(data.hole);
        const round = data.holdemTable?.round;
        const before = holdem.table?.round;
        const finishedNow = round && round.phase === 'done'
            && round.players.some(player => !player.bot && player.name === myName())
            && (!before || before.no !== round.no || before.phase !== 'done');
        const settledMine = await queueHoldemTable(data.holdemTable);
        // 決着した (自分が参加していた) ときの手元チップは presentHoldemTable が取り直している
        if (!settledMine && !finishedNow) {
            casino.session = data.session;
            renderWallet();
        }
        return data;
    } catch (error) {
        await showHoldemError(error);
        return null;
    } finally {
        setCasinoBusy(false);
    }
}

function sendHoldemMove(move, amount) {
    const table = holdem.table;
    if (!isMyHoldemTurn(table)) return;
    sendHoldem('hdMove', { move, amount, seq: table.round.seq });
}

async function leaveHoldemSeat() {
    holdem.leaving = true;
    await sendHoldem('hdLeave');
    holdem.leaving = false;
}

/** 入場したらそのまま空いている席に座る */
async function joinHoldemAfterEntering() {
    try {
        const data = await callCasino('hdJoin');
        applyServerClock(data.now);
        if (data.me) casino.me = data.me;
        if (data.hole) setHoldemHole(data.hole);
        casino.session = data.session;
        queueHoldemTable(data.holdemTable);
        renderWallet();
    } catch (error) {
        showMessage(el('hd-message'), error.message, 'info');
    }
}

// ------------------------------------------------------------------
// 画面の出入り
// ------------------------------------------------------------------
function openHoldemTable() {
    renderHoldemView(holdem.table || EMPTY_HOLDEM_TABLE);
    renderHoldemRecent();
    renderHoldemCrew();
    renderHoldemControls();
    fetchHoldemHoleIfNeeded();
    if (!holdem.pollTimer) {
        holdem.pollTimer = setInterval(pollHoldemTable, HOLDEM_POLL_MS);
        holdem.clockTimer = setInterval(tickHoldemClock, 250);
    }
}

function closeHoldemTable() {
    clearInterval(holdem.pollTimer);
    clearInterval(holdem.clockTimer);
    holdem.pollTimer = null;
    holdem.clockTimer = null;
}

function renderHoldemRecent() {
    const list = el('hd-recent');
    list.innerHTML = '';
    (casino.session?.holdem?.recent || []).forEach(item => {
        const li = document.createElement('li');
        const tone = item.net > 0 ? 'plus' : item.net < 0 ? 'minus' : 'even';
        li.className = `bj-pip is-${tone}`;
        li.textContent = formatSigned(item.net);
        li.title = `${item.result === 'fold' ? 'フォールド' : item.result === 'win' ? '勝ち' : '負け'}${item.hand ? ` (${item.hand})` : ''}`
            + ` / 手札 ${(item.hole || []).join(' ')} / ボード ${(item.board || []).join(' ')}`;
        list.appendChild(li);
    });
}

/** 船員の紹介 */
function renderHoldemCrew() {
    const list = el('hd-crew');
    const bots = holdem.table?.bots || [];
    list.innerHTML = '';
    bots.forEach(bot => {
        const li = document.createElement('li');
        li.className = 'hd-crew-item';
        const name = document.createElement('strong');
        name.textContent = bot.name;
        const style = document.createElement('span');
        style.className = 'hd-seat-style';
        style.textContent = bot.style;
        const desc = document.createElement('p');
        desc.textContent = bot.desc;
        li.append(name, style, desc);
        list.appendChild(li);
    });
    el('hd-crew-box').classList.toggle('hidden', !bots.length);
}

function initHoldem() {
    el('hd-sit-button').addEventListener('click', () => sendHoldem('hdJoin'));
    el('hd-seats').addEventListener('click', event => {
        const button = event.target.closest('[data-hd-sit]');
        if (button) sendHoldem('hdJoin', { seat: Number(button.dataset.hdSit) });
    });
    el('hd-leave-button').addEventListener('click', leaveHoldemSeat);
    el('hd-sitout-button').addEventListener('click', () => {
        const index = myHoldemSeat();
        const seat = index >= 0 ? holdem.table.seats[index] : null;
        if (!seat) return;
        sendHoldem('hdSitOut', { out: !seat.sittingOut });
    });
    el('hd-fold-button').addEventListener('click', () => sendHoldemMove('fold'));
    el('hd-check-button').addEventListener('click', () => sendHoldemMove('check'));
    el('hd-call-button').addEventListener('click', () => sendHoldemMove('call'));
    el('hd-raise-button').addEventListener('click', () => {
        const actions = holdemActionsNow();
        if (!actions) return;
        if (!actions.raise || holdem.raiseTo >= actions.maxRaiseTo) sendHoldemMove('allin');
        else sendHoldemMove('raise', holdem.raiseTo);
    });
    el('hd-raise-range').addEventListener('input', event => setHoldemRaise(event.target.value));
    el('hd-raise-input').addEventListener('change', event => setHoldemRaise(event.target.value));
    document.querySelectorAll('#hd-raise [data-hd-preset]').forEach(button => {
        button.addEventListener('click', () => holdemPreset(button.dataset.hdPreset));
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && holdem.pollTimer) pollHoldemTable();
    });
}
