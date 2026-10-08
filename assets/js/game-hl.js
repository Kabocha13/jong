// HL (ハイアンドロー。58.3〜。ゲーム一覧の「HL」、#hl)。大勝ちした人だけが入れる VIP の部屋で、トークンを手に入れるゲーム。
//   1回 300,000 のレートで、次のカードが上 (High) か下 (Low) かを10回当てる。5回以上当てたらトークンを1つ。
//   ルールと山札はサーバー (functions/hilo.js・functions/index.js の casinoHl*) が持ち、画面は出たカードだけを受け取る。
//   トークンはランキングでレートの左に出る。1つ以上持つと永久Pro会員。
//   ディーラーは公式キャラの船長 (ハク)。当たり・はずれで表情を変える (assets/img/captain/)

const HL_SUIT_MARKS = ['♠', '♥', '♦', '♣'];
const HL_RANK_LABELS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const HL_DEALER = {
    idle: { face: 'assets/img/captain/icon.png', line: 'ようこそ、VIP席へ。運命の10枚、読み切れるか？' },
    start: { face: 'assets/img/captain/surprised.png', line: 'さあ、勝負だ。次は上か、下か？' },
    win: { face: 'assets/img/captain/laugh.png', line: 'お見事！ その調子だ。' },
    lose: { face: 'assets/img/captain/disappointed.png', line: 'おっと、外れだ…まだ取り返せる。' },
    token: { face: 'assets/img/captain/laugh.png', line: 'トークンはお前のものだ。さすがだな！' },
    miss: { face: 'assets/img/captain/disappointed.png', line: '今回は海の神に嫌われたな…。' }
};

// HL 専用の絵 (assets/img/hl/。README.md に一覧と生成プロンプト)。読めた絵だけ <html> に hl-art-<名前> を付けて CSS で使う
const HL_ART = ['hero.jpeg', 'table.jpeg', 'card-back.png', 'button-high.png', 'button-low.png', 'button-start.png', 'frame.png', 'tile.jpeg'];
const HL_TOKEN_SRC = 'assets/img/hl/token.png';
const HL_TOKEN_FALLBACK = 'assets/img/token.svg';

function loadHlArt() {
    HL_ART.forEach(file => {
        const image = new Image();
        image.onload = () => document.documentElement.classList.add(`hl-art-${file.replace(/\.[a-z]+$/, '')}`);
        image.src = `assets/img/hl/${file}`;
    });
}

const hl = {
    state: null,      // サーバーの返事 ({ hl, tokens, rules })
    busy: false,
    loading: false,
    mood: 'idle',     // ディーラーの表情 (HL_DEALER のキー)
    lastGuess: null   // 直前に当てた結果 (いまのカードを光らせる)
};

function isHlRoute() {
    return location.hash.slice(1) === 'hl';
}

async function openHl() {
    renderHl();
    if (hl.loading) return;
    hl.loading = true;
    try {
        hl.state = await callCasino('hlStatus');
        const game = hl.state.hl;
        casino.hlPlaying = Boolean(game && !game.finished);
        hl.mood = game && !game.finished ? 'start' : 'idle';
        renderHl();
    } catch (error) {
        showMessage(el('hl-message'), error.message, 'error');
    } finally {
        hl.loading = false;
    }
}

function hlCard(card, options = {}) {
    const node = document.createElement('span');
    const red = card.suit === 1 || card.suit === 2;
    node.className = `bj-card hl-card ${red ? 'is-red' : 'is-black'}${options.small ? ' is-small' : ''}`;
    const rank = document.createElement('span');
    rank.className = 'bj-card-rank';
    rank.textContent = HL_RANK_LABELS[card.rank] || String(card.rank);
    const suit = document.createElement('span');
    suit.className = 'bj-card-suit';
    suit.textContent = `${HL_SUIT_MARKS[card.suit]}︎`;
    node.append(rank, suit);
    return node;
}

function hlTokenImage() {
    const image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    image.onerror = () => { image.onerror = null; image.src = HL_TOKEN_FALLBACK; };
    image.src = HL_TOKEN_SRC;
    return image;
}

function hlChips() {
    return casino.session?.chips ?? casino.score;
}

function renderHlDealer() {
    const face = el('hl-dealer-face');
    if (!face) return;
    const dealer = HL_DEALER[hl.mood] || HL_DEALER.idle;
    // 公式キャラを出し始める日 (CAPTAIN_REVEAL_AT) より前は顔を出さない
    face.closest('.hl-dealer').classList.toggle('hidden', !isCaptainRevealed());
    if (face.getAttribute('src') !== dealer.face) face.src = dealer.face;
    el('hl-dealer-line').textContent = dealer.line;
}

function renderHl() {
    if (!el('hl-view')) return;
    const state = hl.state;
    const rules = state?.rules || { cost: 300000, rounds: 10, need: 5 };
    const game = state?.hl;
    const playing = Boolean(game && !game.finished);
    el('hl-tokens').textContent = state ? `${state.tokens}` : '—';
    el('hl-chips').textContent = formatRate(hlChips());
    renderHlDealer();

    const board = el('hl-board');
    board.innerHTML = '';
    if (game) {
        const big = hlCard(game.cards[game.cards.length - 1]);
        big.classList.add('is-current');
        if (hl.lastGuess !== null) big.classList.add(hl.lastGuess ? 'is-win' : 'is-lose');
        board.appendChild(big);
    } else {
        const back = document.createElement('span');
        back.className = 'hl-card-back is-big';
        board.appendChild(back);
    }

    const pips = el('hl-pips');
    pips.innerHTML = '';
    // 当たりは光るトークン、はずれは色を抜いたトークン、まだの回は番号 (58.9〜。58.8 までは ○・×)
    for (let i = 0; i < rules.rounds; i++) {
        const pip = document.createElement('li');
        const guess = game?.guesses?.[i];
        pip.className = guess ? (guess.win ? 'is-win' : 'is-lose') : '';
        if (guess) {
            pip.appendChild(hlTokenImage());
            pip.title = guess.win ? `${i + 1}回目 当たり` : `${i + 1}回目 はずれ`;
        } else {
            pip.textContent = String(i + 1);
        }
        pips.appendChild(pip);
    }

    const history = el('hl-history');
    history.innerHTML = '';
    if (game) {
        game.cards.forEach((card, index) => {
            const item = document.createElement('li');
            const guess = game.guesses[index - 1];
            // 当てたカードは、当たりなら金色に光らせ、はずれなら暗く沈める。上・下の矢印だけを添える
            if (guess) item.className = guess.win ? 'is-win' : 'is-lose';
            item.appendChild(hlCard(card, { small: true }));
            const mark = document.createElement('span');
            mark.className = 'hl-mark';
            mark.textContent = guess ? (guess.guess === 'high' ? '▲' : '▼') : '最初';
            item.appendChild(mark);
            history.appendChild(item);
        });
    }

    el('hl-progress').textContent = game
        ? `${game.round}/${game.rounds}回 ・ 当たり ${game.wins}回${game.wins < game.need ? ` (あと${game.need - game.wins}回)` : ' ・ トークン確定'}`
        : '';
    el('hl-high').disabled = hl.busy || !playing;
    el('hl-low').disabled = hl.busy || !playing;
    el('hl-guess').classList.toggle('hidden', !playing);
    const start = el('hl-start');
    start.classList.toggle('hidden', playing);
    start.textContent = game?.finished ? `もう一度 (${formatRate(rules.cost)})` : `${formatRate(rules.cost)} で卓につく`;
    start.disabled = hl.busy || !state || hlChips() < rules.cost;
    el('hl-start-note').textContent = state && !playing && hlChips() < rules.cost
        ? `この卓につけるのは、使えるレートが ${formatRate(rules.cost)} 以上の人だけです (いま ${formatRate(hlChips())})。`
        : '';
}

async function startHl() {
    const cost = hl.state?.rules?.cost || 300000;
    if (hl.busy || !window.confirm(`HL を ${formatRate(cost)} で始めますか？\nレートから ${formatRate(cost)} 引かれます (戻りません)。`)) return;
    hl.busy = true;
    hl.lastGuess = null;
    renderHl();
    try {
        const data = await callCasino('hlStart');
        hl.state = data;
        casino.hlPlaying = true;
        hl.mood = 'start';
        if (Number.isFinite(Number(data.score))) casino.score = Number(data.score);
        if (casino.session && Number.isFinite(Number(data.chips))) casino.session = { ...casino.session, chips: data.chips, score: data.score };
        window.playGameSound?.('gpCaptain');
        showMessage(el('hl-message'), `卓につきました (−${formatRate(cost)})。次のカードは上？ 下？`, 'info');
    } catch (error) {
        showMessage(el('hl-message'), error.message, 'error');
    } finally {
        hl.busy = false;
        renderHl();
    }
}

/** トークンを手に入れたときの画面いっぱいの演出 */
function celebrateHlToken(data) {
    window.playGameSound?.('gpJackpotWin');
    window.qjongTreasureRain?.preview(6000);
    if (typeof strobeScreen === 'function') strobeScreen(['white', 'gold', 'white']);
    return showSlotOverlay('is-result', body => {
        const coin = document.createElement('img');
        coin.className = 'hl-overlay-token';
        coin.onerror = () => { coin.onerror = null; coin.src = HL_TOKEN_FALLBACK; };
        coin.src = HL_TOKEN_SRC;
        coin.alt = '';
        const total = modeText('p', 'slot-overlay-total', '持っているトークン ');
        total.appendChild(modeText('strong', 'slot-overlay-won', String(data.tokens)));
        body.append(coin, modeText('p', 'slot-overlay-sub', `${data.hl.wins}回当たり!! トークン獲得`), modeText('p', 'slot-overlay-title', 'Token'), total);
    }, { captain: 'laugh' });
}

async function guessHl(guess) {
    if (hl.busy) return;
    hl.busy = true;
    renderHl();
    try {
        const data = await callCasino('hlGuess', { guess });
        const before = hl.state?.tokens || 0;
        hl.state = data;
        casino.hlPlaying = !data.hl.finished;
        const last = data.hl.guesses[data.hl.guesses.length - 1];
        hl.lastGuess = last ? last.win : null;
        hl.mood = last?.win ? 'win' : 'lose';
        window.playGameSound?.(last?.win ? 'gpBallHit' : 'gpBall');
        if (data.hl.finished) {
            if (data.hl.token) {
                hl.mood = 'token';
                renderHl();
                showMessage(el('hl-message'), `🎉 ${data.hl.wins}回当たり！ トークンを1つ手に入れました (いま ${data.tokens}つ)。${before === 0 ? 'トークンを持っているあいだは永久Pro会員です。' : ''}`, 'success');
                await celebrateHlToken(data);
            } else {
                hl.mood = 'miss';
                window.playGameSound?.('gpJackpotMiss');
                showMessage(el('hl-message'), `${data.hl.wins}回当たり… トークンには${data.hl.need}回以上の当たりが必要です。`, 'info');
            }
        } else {
            showMessage(el('hl-message'), last?.win ? '当たり！' : 'はずれ…', last?.win ? 'success' : 'info');
        }
    } catch (error) {
        showMessage(el('hl-message'), error.message, 'error');
    } finally {
        hl.busy = false;
        renderHl();
    }
}

function initHl() {
    loadHlArt();
    if (!el('hl-view')) return;
    el('hl-start').addEventListener('click', startHl);
    el('hl-high').addEventListener('click', () => guessHl('high'));
    el('hl-low').addEventListener('click', () => guessHl('low'));
}
