// ゲームタブ: 指名手配 (レートが1万を超えた人を賞金首にする神経衰弱)
//   10×10 (50組) の神経衰弱。1枚めくるたびに自分から賞金首へ 1、1組そろえたら賞金首から自分へ 50 が動く。
//   賞金首はレートが1万を超えている人のうち最も高い人で、めくるたびにサーバーが決め直す。1万を超えている人は遊べない。
//   盤面は人ごとでサーバー (Cloud Function wanted、ルールは functions/wanted.js) が持ち、
//   画面はめくったカードの絵柄だけを受け取る。途中でやめても続きから遊べる。
//   チップは使わない (船底と同じく、レートがその場で動く)。画面の切り替えは game.js。

// 絵柄 (サーバーの 0〜49)。画像があるものは画像 (スロットの絵柄と航海の船長の顔)、ほかは絵文字
const WANTED_FACES = [
    ...['chest', 'coin', 'compass', 'map', 'rum', 'parrot', 'anchor', 'wild'].map(key => ({
        name: SLOT_SYMBOLS[key].name, src: `${SLOT_IMAGE_DIR}${key}${SLOT_IMAGE_EXT}`, emoji: SLOT_SYMBOLS[key].emoji
    })),
    { name: '船長の帽子', src: 'assets/img/slot/captain.jpeg', emoji: '🎩' },
    { name: '船長 (笑顔)', src: 'assets/img/voyage/face-smile.png', emoji: '😊' },
    { name: '船長 (大笑い)', src: 'assets/img/voyage/face-laugh.png', emoji: '😆' },
    { name: '船長 (怒り)', src: 'assets/img/voyage/face-angry.png', emoji: '😠' },
    { name: '船長 (しょんぼり)', src: 'assets/img/voyage/face-sad.png', emoji: '😢' },
    { name: '船長 (びっくり)', src: 'assets/img/voyage/face-surprise.png', emoji: '😲' },
    ...[
        ['🐙', 'タコ'], ['🦈', 'サメ'], ['🐳', 'クジラ'], ['🐬', 'イルカ'], ['🦀', 'カニ'], ['🐚', '貝'],
        ['🐢', 'カメ'], ['🦑', 'イカ'], ['🐠', '熱帯魚'], ['🦞', 'ロブスター'], ['⛵', '帆船'], ['🏝️', '無人島'],
        ['🌋', '火山'], ['🌊', '大波'], ['🗡️', '短剣'], ['💣', '爆弾'], ['🎲', 'サイコロ'], ['🃏', 'ジョーカー'],
        ['💎', 'ダイヤ'], ['👑', '王冠'], ['🔔', '鐘'], ['🕯️', 'ろうそく'], ['🗝️', '鍵'], ['📜', '巻物'],
        ['💀', 'ドクロ'], ['🍺', 'ビール'], ['🍖', '骨付き肉'], ['⭐', '星'], ['🌙', '月'], ['☀️', '太陽'],
        ['⚡', '雷'], ['🔥', '炎'], ['❄️', '雪'], ['🌈', '虹'], ['🍀', '四つ葉'], ['🍎', 'りんご']
    ].map(([emoji, name]) => ({ name, emoji }))
];
const WANTED_MISS_SHOW_MS = 1100;   // はずれた2枚を見せておく長さ (次のカードを押したらすぐ伏せる)
const WANTED_PAIRS_TOTAL = 50;

const wd = {
    open: false,
    loaded: false,
    loading: false,
    busy: false,         // めくった返事を待っている
    pending: null,       // 返事を待っているカード
    state: null,         // サーバーから最後に受け取った状態
    peek: null,          // はずれて見せている2枚: { cards: [{ index, face }], timer }
    flash: [],           // そろった直後に光らせるカード
    session: null        // 開いてからの合計: { flips, pairs, delta }
};

async function callWanted(action, payload = {}) {
    const token = await getFirebaseIdToken();
    if (!token) throw new Error('ログインが切れています。マイページでログインし直してください。');
    const response = await fetch(`${getFunctionsBaseUrl()}/wanted`, {
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

function wdRules() {
    return wd.state?.rules || { threshold: 10000, flipCost: 1, pairReward: 50, pairs: WANTED_PAIRS_TOTAL };
}

// ------------------------------------------------------------------
// 絵柄
// ------------------------------------------------------------------
function wdFaceNode(face) {
    const info = WANTED_FACES[face] || { name: '?', emoji: '❔' };
    const node = document.createElement('span');
    node.className = 'wd-face';
    node.title = info.name;
    if (info.src) {
        const img = document.createElement('img');
        img.src = info.src;
        img.alt = info.name;
        img.draggable = false;
        img.onerror = () => { node.textContent = info.emoji; };
        node.appendChild(img);
    } else {
        node.textContent = info.emoji;
        node.setAttribute('role', 'img');
        node.setAttribute('aria-label', info.name);
    }
    return node;
}

/** 画像の絵柄を先に読んでおく (めくったときにすぐ出るように) */
function preloadWantedFaces() {
    WANTED_FACES.forEach(info => {
        if (!info.src) return;
        const img = new Image();
        img.src = info.src;
    });
}

// ------------------------------------------------------------------
// 盤面
// ------------------------------------------------------------------
function buildWantedBoard() {
    const grid = el('wd-board');
    grid.innerHTML = '';
    for (let i = 0; i < WANTED_PAIRS_TOTAL * 2; i++) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'wd-card';
        button.dataset.index = String(i);
        button.setAttribute('aria-label', `${Math.floor(i / 10) + 1}行${(i % 10) + 1}列`);
        button.addEventListener('click', () => flipWantedCard(i));
        grid.appendChild(button);
    }
}

/** カードごとに見せる絵柄 (そろった札・1枚目の札・はずれて見せている2枚) */
function wdVisibleFaces() {
    const faces = [...(wd.state?.board?.faces || Array(WANTED_PAIRS_TOTAL * 2).fill(null))];
    (wd.peek?.cards || []).forEach(card => { faces[card.index] = card.face; });
    return faces;
}

function renderWantedBoard() {
    const board = wd.state?.board;
    const faces = wdVisibleFaces();
    const playable = wdCanFlip();
    el('wd-board').querySelectorAll('.wd-card').forEach(button => {
        const index = Number(button.dataset.index);
        const face = faces[index];
        const matched = Boolean(board?.matched?.[index]);
        const peeking = Boolean(wd.peek?.cards.some(card => card.index === index));
        const key = face === null || face === undefined ? '' : String(face);
        // 同じ絵柄のまま描き直さない (画像のちらつきを防ぐ)
        if (button.dataset.face !== key) {
            button.dataset.face = key;
            button.innerHTML = '';
            if (key) button.appendChild(wdFaceNode(face));
        }
        button.classList.toggle('is-up', Boolean(key));
        button.classList.toggle('is-matched', matched);
        button.classList.toggle('is-open', board?.open === index);
        button.classList.toggle('is-miss', peeking);
        button.classList.toggle('is-pending', wd.pending === index);
        button.classList.toggle('is-flash', wd.flash.includes(index));
        button.disabled = matched || board?.open === index || !playable;
    });
}

// ------------------------------------------------------------------
// 状態の表示
// ------------------------------------------------------------------
function wdCanFlip() {
    return Boolean(wd.state?.canHunt);
}

function renderWantedPoster() {
    const target = wd.state?.target;
    const poster = el('wd-poster');
    poster.classList.toggle('is-empty', !target);
    el('wd-target-name').textContent = target ? target.name : '— 不在 —';
    el('wd-target-bounty').textContent = target ? formatRate(target.score) : '—';
    el('wd-target-paid').textContent = target
        ? `これまでに奪われた懸賞金 ${formatRate(Math.max(0, target.paid))}`
        : `レートが${formatRate(wdRules().threshold)}を超えた人が現れると手配されます`;
}

function renderWanted() {
    if (!wd.open) return;
    const state = wd.state;
    const rules = wdRules();
    renderWantedPoster();
    el('wd-score').textContent = state ? formatRate(state.score) : '—';
    el('wd-pairs').textContent = state ? `${state.board.pairs} / ${rules.pairs}` : '—';
    const delta = wd.session ? wd.session.delta : null;
    const sessionEl = el('wd-session');
    sessionEl.textContent = delta === null ? '—' : formatSigned(delta);
    sessionEl.dataset.sign = delta > 0 ? 'plus' : delta < 0 ? 'minus' : 'zero';

    let notice;
    if (!state) notice = '読み込み中...';
    else if (!state.eligible && state.target?.name === state.me) notice = 'あなたが賞金首です。ほかの人がカードをめくるたびに懸賞金が動きます。';
    else if (!state.eligible) notice = `レートが${formatRate(rules.threshold)}を超えている人は指名手配を遊べません。`;
    else if (!state.target) notice = `いまはレートが${formatRate(rules.threshold)}を超えている人がいないので遊べません。盤面はそのまま残ります。`;
    else if (state.score < rules.flipCost) notice = `1枚めくるにはレートが${rules.flipCost}以上必要です。`;
    else notice = `1枚めくるたびに ${rules.flipCost} が賞金首へ。そろえると賞金首から ${rules.pairReward} を奪えます。`;
    el('wd-notice').textContent = notice;
    el('wd-table').classList.toggle('is-locked', Boolean(state) && !wdCanFlip());
    renderWantedBoard();
    renderWantedStats();
}

function renderWantedStats() {
    const stats = wd.state?.stats;
    el('wd-total').textContent = stats
        ? `これまで: めくり ${stats.flips.toLocaleString('ja-JP')}枚・ペア ${stats.pairs.toLocaleString('ja-JP')}組・`
            + `全部そろえた盤面 ${stats.boards.toLocaleString('ja-JP')}・レート ${formatSigned(stats.net)}`
        : '';
}

function renderWantedRules() {
    const rules = wdRules();
    const list = [
        `レートが${formatRate(rules.threshold)}を超えた人がいるときだけ遊べる。賞金首はその中でレートがいちばん高い人 (めくるたびに決め直す)。`,
        `${formatRate(rules.threshold)}を超えている人は遊べない。`,
        `10×10 の神経衰弱 (${rules.pairs}組)。1枚めくるたびにレート ${rules.flipCost} を賞金首へ払う (2枚で ${rules.flipCost * 2})。`,
        `2枚目で絵柄がそろうと、賞金首からレート ${rules.pairReward} をもらえる。`,
        '盤面は自分だけのもの。途中でやめても続きから遊べる。全部そろえたら新しい盤面になる。',
        '増減の記録は、続けて遊んだぶんを1件にまとめて残す。'
    ];
    const target = el('wd-rules');
    target.innerHTML = '';
    list.forEach(text => {
        const item = document.createElement('li');
        item.textContent = text;
        target.appendChild(item);
    });
}

function showWdMessage(text, type = 'info') {
    showMessage(el('wd-message'), text, type);
}

function receiveWanted(data) {
    wd.state = data;
    wd.loaded = true;
    if (Number.isFinite(Number(data.score))) casino.score = Number(data.score);
    renderWantedRules();
    renderWanted();
    renderWantedTile();
    // ゲーム一覧を出しているなら札も揃える
    if (casino.ready && !location.hash.slice(1)) renderMenu();
}

async function loadWantedStatus() {
    if (wd.loading) return;
    wd.loading = true;
    try {
        receiveWanted(await callWanted('status'));
    } catch (error) {
        if (wd.open) showWdMessage(error.message, 'error');
    } finally {
        wd.loading = false;
    }
}

// ------------------------------------------------------------------
// めくる
// ------------------------------------------------------------------
function clearWantedPeek() {
    if (!wd.peek) return;
    clearTimeout(wd.peek.timer);
    wd.peek = null;
}

async function flipWantedCard(index) {
    if (wd.busy || !wdCanFlip()) return;
    const board = wd.state.board;
    if (board.matched[index] || board.open === index) return;
    // はずれた2枚を見せている途中なら、すぐ伏せて次へ
    clearWantedPeek();
    wd.busy = true;
    wd.pending = index;
    renderWantedBoard();
    try {
        const data = await callWanted('flip', { index });
        const flip = data.flip;
        const session = wd.session || { flips: 0, pairs: 0, delta: 0 };
        wd.session = { flips: session.flips + 1, pairs: session.pairs + (flip.pair ? 1 : 0), delta: session.delta + flip.delta };
        if (typeof playGameSound === 'function') playGameSound('bjDeal', 0.5);
        if (!flip.first && !flip.pair) {
            const peek = { cards: [{ index: flip.firstIndex, face: flip.firstFace }, { index: flip.index, face: flip.face }] };
            peek.timer = setTimeout(() => {
                if (wd.peek !== peek) return;
                wd.peek = null;
                renderWantedBoard();
            }, WANTED_MISS_SHOW_MS);
            wd.peek = peek;
        }
        wd.flash = flip.pair && !flip.cleared ? [flip.firstIndex, flip.index] : [];
        wd.busy = false;
        wd.pending = null;
        receiveWanted(data);
        if (flip.pair) {
            showWdMessage(flip.cleared
                ? `全部そろえました！ ${flip.target} から懸賞金 +${wdRules().pairReward}。新しい盤面を配りました。`
                : `そろった！ ${flip.target} から懸賞金 +${wdRules().pairReward}`, 'success');
        }
        if (!data.target) showWdMessage(`賞金首がいなくなりました (レートが${formatRate(wdRules().threshold)}を超えている人がいません)。`, 'info');
    } catch (error) {
        wd.busy = false;
        wd.pending = null;
        showWdMessage(error.message, 'error');
        await loadWantedStatus();
    } finally {
        wd.busy = false;
        wd.pending = null;
        renderWantedBoard();
    }
}

// ------------------------------------------------------------------
// 開く・閉じる (game.js の renderRoute から呼ぶ)
// ------------------------------------------------------------------
function openWanted() {
    const wasOpen = wd.open;
    wd.open = true;
    if (!wasOpen) {
        wd.session = null;
        preloadWantedFaces();
        renderWantedRules();
        renderWanted();
        if (!wd.busy) loadWantedStatus();
    }
}

function closeWanted() {
    if (!wd.open) return;
    wd.open = false;
    clearWantedPeek();
}

/** ゲーム一覧のタイル: 賞金首の名前と懸賞金 */
function renderWantedTile() {
    const desc = el('wd-tile-desc');
    const name = el('wd-tile-name');
    if (!desc) return;
    const target = wd.state?.target;
    const rules = wdRules();
    if (name) name.textContent = target ? target.name : '?';
    desc.textContent = target
        ? `賞金首 ${target.name} (${formatRate(target.score)})。10×10 の神経衰弱で、そろえるたびに懸賞金を奪う`
        : `レートが${formatRate(rules.threshold)}を超えた人を賞金首にする神経衰弱。いまは賞金首がいません`;
}

/** ゲーム一覧の札 (game.js の renderMenu から呼ぶ) */
function wantedTileBadge() {
    if (!wd.loaded && !wd.loading) loadWantedStatus();
    return wd.state?.canHunt ? '手配中' : '';
}

function initWanted() {
    if (!el('wanted-view')) return;
    buildWantedBoard();
    renderWantedRules();
    renderWantedTile();
}
