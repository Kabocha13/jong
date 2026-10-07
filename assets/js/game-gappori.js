// ゲームタブ: 宝探し (全員共通の1卓)
//   回る盤面の16マス (お宝15マス・船長1マス) に5球が入る。お宝を2〜5個予想して券を買い (同じお宝を重ねてよい)、
//   予想したお宝ごとに、選んだ数だけ球が入れば当たり。1口の値段は予想の個数で決まる。
//   盤面・配当・球・チャンス・ジャックポットはすべて Cloud Function (casino の gpBuy / gpChance / gpTick) が決める
//   (ルールは functions/gappori.js、卓の進め方は functions/gappori-table.js)。
//   ほかの人の券や進み具合は、誰でも読める卓の写し (gappori_public/main) を読み直して反映する
//   (ルーレットの下に、この回の全員の券を人ごとに出す)。
//   ドクロ旗 (55.5〜) は盤面に無い単品の賭けで、船長チャンスの JP ルーレットのドクロ旗のマスで当たる (倍率は当たったときに ×50〜×99)。
//   券を買う欄の上に「本日のおすすめ」(回ごとに 5・4・3・2個の予想を1つずつ。サーバーが倍率を上げてある) を出す。
//   球は ballsAt の時刻に合わせて1つずつ入れて見せる。締め切りを過ぎたら、画面を開いている人が gpTick を送って先へ進める。
//   船長マスに球が入った回は、5球のあとにカットイン (船長チャンス) → 盤面が JP ルーレット (JP 1・お宝ゲット 1・ハズレ 14) に
//   変わって1回回る → JP ならもう1つカットイン (ジャックポット)。止まるマスはサーバーが決めてある (result.jackpot)。
//   お宝の絵は game-slot.js の createSymbol、閃光・金貨・震え・画面いっぱいの演出もスロットのものを使う。
//   財布 (使えるレート) の表示と画面の切り替えは game.js。

// レア度の順 (functions/gappori.js と同じ)。10種類から毎回5種類が盤面に並ぶ。名前と絵は game-slot.js の SLOT_SYMBOLS
const GAPPORI_ORDER = ['anchor', 'parrot', 'helm', 'rum', 'telescope', 'map', 'compass', 'cannon', 'coin', 'chest'];
// ドクロ旗 (55.5〜): 盤面には出さず、単品でだけ賭ける。JP ルーレットのドクロ旗のマスで当たり、倍率は当たったときに ×50〜×99 を引く
const GAPPORI_FLAG = 'flag';
// ハク (55.19〜): スタンプカードで使える「どのお宝の球でもOK」の札。倍率は結果で決まる (いちばん高くなるお宝に化ける)
const GAPPORI_HAKU = 'haku';
const GAPPORI_HAKU_MIN_PICKS = 3;   // ハクも1個に数えて3個以上の予想でだけ使える (サーバーの GAPPORI_HAKU_MIN_PICKS と同じ)
const GAPPORI_STAMPS_PER_CARD = 3;   // 3つでハク1回 (56.3〜。サーバーの GAPPORI_STAMPS_PER_CARD と同じ)
const GAPPORI_PICKS_MIN = 2;
const GAPPORI_PICKS_MAX = 5;
// 口数の −・＋ で動く数 (55.20 で上限を無くした。最後より大きいときは2倍・半分ずつ動く。手で打てばいくつでも)
const GAPPORI_UNIT_STEPS = [1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000];
const GAPPORI_MAX_UNITS = Number.MAX_SAFE_INTEGER;
const GAPPORI_MAX_TICKETS = 20;    // 1回に買える券の数 (サーバーの GAPPORI_MAX_TICKETS と同じ)
const GAPPORI_POLL_MS = 1200;      // 卓を読み直す間隔
const GAPPORI_FAST_POLL_MS = 400;  // 5球が出そろって結果を待つあいだの読み直しの間隔
const GAPPORI_SPIN_MS = 4600;      // 球ごとに盤面を回す長さ (球を入れる間隔 5.2秒より少し短く)
const GAPPORI_SPIN_TURNS = 8;      // 止まるまでに回る回数 (このほかに、止まる位置までの端数を回る。長さに合わせて速さを保つ)
const GAPPORI_POCKET_DEG = 360 / 16;
const GAPPORI_BIG_WIN = 10;        // 払い戻しが賭けた額のこの倍以上なら大当たりの演出
const GAPPORI_RANKING_SIZE = 3;    // 結果のあとに見せる「理想の賭け方」の数
const GAPPORI_RANKING_DELAY_MS = 1200;   // 結果の演出のあと、ランキングを出すまでの間 (当たりの金貨を見せてから)
const GAPPORI_JP_SPIN_MS = 4200;         // JP ルーレットを回す長さ
const GAPPORI_JP_HOLD_MS = 1400;         // JP ルーレットが止まってから、結果 (JP・お宝ゲット・ハズレ) を見せておく間
const GAPPORI_JP_LABELS = {
    jackpot: 'JP', treasure: 'お宝', miss: 'ハズレ', double: 'JP\n×2', half: 'JP\n½',
    payout2: '払戻\n×2', extra: 'もう\n1球', plus: 'JP\n+???', minus: 'JP\n−???', plussmall: 'JP\n+??', minussmall: 'JP\n−??', stamp: 'スタンプ'
};   // マスの字 (お宝ゲットは「お宝」。ドクロ旗とスタンプは絵)
const GAPPORI_STAMP_IMAGE = 'assets/img/gappori/stamp.svg';

const gp = {
    table: null,        // 最後に受け取った卓 (公開の形)
    offset: 0,          // サーバーの時刻 − 端末の時刻
    picks: [],          // 選んでいるお宝 (同じお宝は重ねて入る。「買う」を押すまでは画面の中だけ)
    units: 1,
    pollTimer: null,
    clockTimer: null,
    polling: false,
    ticked: '',         // gpTick を送った締め切り (同じ締め切りに何度も送らない)
    boardRound: 0,      // 盤面を描いた回
    shownBalls: 0,      // その回で、入れて見せた球の数
    angle: 0,           // 盤面の角度 (度。回すたびに増える)
    spinningFor: -1,    // 盤面を回している球の番号 (同じ球で二度回さない)
    celebrated: 0,      // 結果の演出を出した回
    ranked: 0,          // 「理想の賭け方」を出してよくなった回
    rankClosed: 0,      // 「理想の賭け方」をタップで閉じた回
    jpShown: 0,         // JP ルーレットの結果 (お宝ゲットで当たりになった券) を見せてよくなった回
    drawSoundStop: null, // 抽選中に流している音 (gappori-drawing-loop.mp3) を止める関数
    extraShown: 0,      // JP ルーレットの「もう1球」の6球目を見せた回
    boostShown: 0,      // JP 2倍・1/2 で変わったジャックポットの額を見せてよくなった回 (回して止めるまでは前の額)
    choosing: false,    // チャンスの選択を送っている途中
    screen: 'buy',      // スマホで出している画面 ('buy' 券を買う / 'wheel' ルーレット)
    screenKey: ''       // 画面を自動で切り替えた回と段階 (同じ段階のうちは、手で切り替えたほうを守る)
};

// ------------------------------------------------------------------
// 時刻と卓の読み方
// ------------------------------------------------------------------
function applyGapporiClock(iso) {
    const server = Date.parse(iso);
    if (Number.isFinite(server)) gp.offset = server - Date.now();
}

function gapporiNow() {
    return Date.now() + gp.offset;
}

function gapporiSecondsLeft(iso) {
    if (!iso) return null;
    return Math.max(0, Math.ceil((Date.parse(iso) - gapporiNow()) / 1000));
}

function gapporiKindName(kind) {
    return kind === 'captain' ? '船長' : SLOT_SYMBOLS[kind]?.name || kind;
}

/** 予想の並べ方 (レア度の順。同じお宝は続けて並べる)。配当表のキーと同じ形 */
function sortGapporiPicks(picks) {
    return picks.slice().sort((a, b) => GAPPORI_ORDER.indexOf(a) - GAPPORI_ORDER.indexOf(b));
}

function gapporiKey(picks) {
    return sortGapporiPicks(picks).join('-');
}

function countGappori(list) {
    const counts = {};
    list.forEach(kind => { counts[kind] = (counts[kind] || 0) + 1; });
    return counts;
}

/** 予想のうち、まだ足りないお宝ごとの数 (granted はチャンスで「1球入ったこと」にしたお宝) */
function gapporiShortfall(picks, hits, granted = null) {
    const have = { ...hits };
    if (granted) have[granted] = (have[granted] || 0) + 1;
    const short = {};
    Object.entries(countGappori(picks)).forEach(([kind, need]) => {
        if (need > (have[kind] || 0)) short[kind] = need - (have[kind] || 0);
    });
    return short;
}

function myGapporiTickets(table = gp.table) {
    return table ? table.tickets.filter(ticket => ticket.name === myName()) : [];
}

/** この回の券を持っていて、まだ結果が出ていない (精算できない) */
function isGapporiLive() {
    return Boolean(gp.table && gp.table.phase !== 'result' && myGapporiTickets().length);
}

/** 受付中で、締め切りを過ぎていない */
function isGapporiOpen(table = gp.table) {
    return Boolean(table && table.phase === 'betting' && (!table.bettingEndsAt || Date.parse(table.bettingEndsAt) > gapporiNow()));
}

/** 見せてよい球の数 (ballsAt を過ぎたもの) */
function gapporiDueBalls(table = gp.table) {
    if (!table) return 0;
    return table.ballsAt.filter(at => Date.parse(at) <= gapporiNow()).length;
}

/** 見せている球で入ったお宝の数 { kind: 個数 } */
/** 見せている球のマス (JP ルーレットの「もう1球」の6球目は、回して見せたあとだけ足す) */
function gapporiVisibleBalls(table = gp.table) {
    const balls = table.balls.slice(0, gp.shownBalls);
    const extra = table.result?.jackpot?.extraBall;
    if (Number.isInteger(extra) && gp.extraShown === table.roundNo) balls.push(extra);
    return balls;
}

function gapporiShownHits(table = gp.table) {
    return countGappori(gapporiVisibleBalls(table).map(index => table.board.pockets[index]).filter(kind => kind !== 'captain'));
}

// ------------------------------------------------------------------
// 絵
// ------------------------------------------------------------------
/**
 * お宝の絵 (スロットと同じ)。船長は公式キャラの顔 (assets/img/captain/face.jpeg)、無ければ帽子の絵
 * (assets/img/slot/captain.jpeg)。どちらも読めないあいだは札で出す
 * (札にも data-symbol を付けておくので、あとから画像が読めたら game-slot.js の loadSlotImages が絵に差し替える)
 */
function gapporiSymbol(kind) {
    if (kind !== 'captain' || slot.images.has(kind)) return createSymbol(kind);
    const node = document.createElement('span');
    node.className = 'slot-symbol gp-captain';
    node.dataset.symbol = kind;
    const label = document.createElement('span');
    label.className = 'gp-captain-label';
    label.textContent = '船長';
    node.appendChild(label);
    return node;
}

function gapporiPickIcons(picks) {
    const icons = document.createElement('span');
    icons.className = 'gp-pick-icons';
    picks.forEach(kind => icons.appendChild(gapporiSymbol(kind)));
    return icons;
}

// ------------------------------------------------------------------
// 盤面と球
// ------------------------------------------------------------------
/** 回る盤面。16マスを時計回りに並べる (回ごとに作り直す) */
function buildGapporiWheel(table) {
    // 宝探しだけのお宝 (立体物の絵) は、盤面に出たときに読む
    table.board.kinds.forEach(kind => loadSlotSymbolImage(kind));
    const wheel = el('gp-wheel');
    wheel.innerHTML = '';
    // ゴールド盤 (2% の回。お宝4種類・1種類6マスまで) はルーレットと台を金色にする
    wheel.classList.toggle('is-gold', Boolean(table.board.gold));
    el('gappori-table')?.classList.toggle('is-gold', Boolean(table.board.gold));
    table.board.pockets.forEach((kind, index) => {
        const pocket = document.createElement('span');
        pocket.className = `gp-pocket is-${kind}`;
        pocket.style.setProperty('--i', String(index));
        pocket.dataset.index = String(index);
        pocket.appendChild(gapporiSymbol(kind));
        const ball = document.createElement('span');
        ball.className = 'gp-ball';
        pocket.appendChild(ball);
        wheel.appendChild(pocket);
    });
    gp.boardRound = table.roundNo;
}

/**
 * JP ルーレット。盤面の16マスを JP・お宝ゲット・ハズレ (サーバーが決めた並び) に入れ替える。
 * 回し終わったら restoreGapporiWheel でお宝の盤面に戻す
 */
function buildGapporiJpWheel(pockets) {
    const wheel = el('gp-wheel');
    wheel.innerHTML = '';
    wheel.classList.add('is-jp');
    pockets.forEach((kind, index) => {
        const pocket = document.createElement('span');
        pocket.className = `gp-pocket is-jp-${kind}`;
        pocket.style.setProperty('--i', String(index));
        pocket.dataset.index = String(index);
        const face = document.createElement('span');
        face.className = `gp-jp-pocket is-${kind}`;
        if (kind === GAPPORI_FLAG) face.appendChild(gapporiSymbol(GAPPORI_FLAG));
        else if (kind === 'stamp') face.appendChild(gapporiStampImage());
        else face.textContent = GAPPORI_JP_LABELS[kind] || kind;
        pocket.appendChild(face);
        wheel.appendChild(pocket);
    });
}

/** JP ルーレットのスタンプのマスの絵 (56.6〜。55.19〜56.5 は「スタンプ」の字) */
function gapporiStampImage() {
    const image = document.createElement('img');
    image.src = GAPPORI_STAMP_IMAGE;
    image.alt = 'スタンプ';
    image.draggable = false;
    return image;
}

/** JP ルーレットを回し、index のマスを針の下で止める。止まるまで待つ */
function spinGapporiJpWheel(index) {
    const wrap = el('gp-wheel-wrap');
    const ms = prefersReducedMotion() ? 0 : GAPPORI_JP_SPIN_MS;
    turnGapporiWheel(gapporiAngleFor(index, ms ? GAPPORI_SPIN_TURNS : 0), ms);
    if (ms) wrap.classList.add('is-spinning');
    return new Promise(resolve => {
        setTimeout(() => {
            wrap.classList.remove('is-spinning');
            const pocket = el('gp-wheel').querySelector(`.gp-pocket[data-index="${index}"]`);
            if (pocket) {
                pocket.classList.add('has-ball', 'is-stopped');
                restartClass(pocket, 'is-landing');
            }
            resolve();
        }, ms);
    });
}

/** もう1球: お宝の盤面に戻して回し、6球目のマスを針の下で止めて見せる */
async function dropGapporiExtraBall(table, index) {
    restoreGapporiWheel(table);
    const ms = prefersReducedMotion() ? 0 : GAPPORI_SPIN_MS;
    turnGapporiWheel(gapporiAngleFor(index, ms ? GAPPORI_SPIN_TURNS : 0), ms);
    if (ms) el('gp-wheel-wrap').classList.add('is-spinning');
    await new Promise(resolve => setTimeout(resolve, ms));
    el('gp-wheel-wrap').classList.remove('is-spinning');
    gp.extraShown = table.roundNo;
    renderGapporiBalls();
    const pocket = el('gp-wheel').querySelector(`.gp-pocket[data-index="${index}"]`);
    if (pocket) restartClass(pocket, 'is-landing');
    const kind = table.board.pockets[index];
    const mine = new Set(myGapporiTickets(table).flatMap(ticket => ticket.picks));
    window.playGameSound?.(kind !== 'captain' && mine.has(kind) ? 'gpBallHit' : 'gpBall');
    if (mine.has(kind)) flashScreen('gold');
    await new Promise(resolve => setTimeout(resolve, prefersReducedMotion() ? 300 : 900));
}

/** JP ルーレットからお宝の盤面に戻す (入った球もそのまま出す) */
function restoreGapporiWheel(table) {
    el('gp-wheel').classList.remove('is-jp');
    buildGapporiWheel(table);
    if (gp.shownBalls > 0) turnGapporiWheel(gapporiAngleFor(table.balls[gp.shownBalls - 1], 0), 0);
    renderGapporiBalls();
}

/** 盤面を angle 度に回す。ms をかけて、だんだん遅くして止める (0 ならすぐ) */
function turnGapporiWheel(angle, ms) {
    gp.angle = angle;
    const wheel = el('gp-wheel');
    wheel.style.transition = ms > 0 ? `transform ${Math.round(ms)}ms cubic-bezier(0.12, 0.7, 0.2, 1)` : 'none';
    wheel.style.transform = `rotate(${angle}deg)`;
}

/** マス index が一番上 (針の下) に来る角度のうち、いまの角度から turns 回以上先のもの */
function gapporiAngleFor(index, turns) {
    const target = (((-index * GAPPORI_POCKET_DEG) % 360) + 360) % 360;
    const current = ((gp.angle % 360) + 360) % 360;
    return gp.angle + turns * 360 + (((target - current) % 360) + 360) % 360;
}

/** 次の球が入る時刻が近づいたら盤面を回し始める。止まるのがちょうど球の入る時刻で、入るマスが針の下に来る */
function spinGapporiWheel() {
    const table = gp.table;
    const next = gp.shownBalls;
    if (!table || table.phase !== 'drawing' || next >= table.balls.length || gp.spinningFor === next) return;
    const left = Date.parse(table.ballsAt[next]) - gapporiNow();
    // 球の間隔は1球ごとに ±1秒ゆらぐ (56.3〜)。前の球との間隔に合わせて回す長さを変える (前の球が無い・お宝ゲットを挟んだときは今までの長さ)
    const previous = next > 0 ? Date.parse(table.ballsAt[next - 1]) : NaN;
    const interval = Date.parse(table.ballsAt[next]) - previous;
    const spinMs = Number.isFinite(interval) && interval <= GAPPORI_SPIN_MS + 2000
        ? Math.max(2500, interval - 600)
        : GAPPORI_SPIN_MS;
    if (left > spinMs) return;
    gp.spinningFor = next;
    const index = table.balls[next];
    if (prefersReducedMotion() || left < 300) {
        turnGapporiWheel(gapporiAngleFor(index, 0), 0);
        return;
    }
    turnGapporiWheel(gapporiAngleFor(index, GAPPORI_SPIN_TURNS), left);
    el('gp-wheel-wrap').classList.add('is-spinning');
}

/** 入った球の印と、入ったお宝の並び */
function renderGapporiBalls() {
    const table = gp.table;
    const shown = gapporiVisibleBalls(table);
    el('gp-wheel').querySelectorAll('.gp-pocket').forEach(pocket => {
        pocket.classList.toggle('has-ball', shown.includes(Number(pocket.dataset.index)));
    });
    const mine = new Set(myGapporiTickets(table).flatMap(ticket => ticket.picks));
    const list = el('gp-drawn');
    list.innerHTML = '';
    for (let i = 0; i < Math.max(5, shown.length); i++) {
        const item = document.createElement('li');
        const kind = shown[i] === undefined ? null : table.board.pockets[shown[i]];
        if (kind) {
            item.appendChild(gapporiSymbol(kind));
            item.classList.toggle('is-mine', mine.has(kind));
            item.classList.toggle('is-captain', kind === 'captain');
            item.title = gapporiKindName(kind);
        } else {
            item.className = 'is-empty';
            item.textContent = String(i + 1);
        }
        list.appendChild(item);
    }
}

/** 新しく入った球を1つずつ見せる (自分の予想なら光らせて震わせる。船長は赤く光らせる) */
function revealGapporiBalls() {
    const table = gp.table;
    const due = gapporiDueBalls(table);
    if (due <= gp.shownBalls) return;
    const mine = new Set(myGapporiTickets(table).flatMap(ticket => ticket.picks));
    while (gp.shownBalls < due) {
        const index = table.balls[gp.shownBalls];
        const kind = table.board.pockets[index];
        // 回し損ねた球 (画面が裏にあったときなど) は、入ったマスを針の下にすぐ合わせる
        if (gp.spinningFor !== gp.shownBalls) turnGapporiWheel(gapporiAngleFor(index, 0), 0);
        gp.shownBalls += 1;
        el('gp-wheel-wrap').classList.remove('is-spinning');
        const pocket = el('gp-wheel').querySelector(`.gp-pocket[data-index="${index}"]`);
        restartClass(pocket, 'is-landing');
        // 自分の券のお宝のマスに入ったら当たりの音、それ以外 (船長・ほかのお宝・券が無いとき) はふつうの音
        window.playGameSound?.(kind !== 'captain' && mine.has(kind) ? 'gpBallHit' : 'gpBall');
        if (kind === 'captain') {
            flashScreen('red');
            buzz([120, 60, 120]);
        } else if (mine.has(kind)) {
            flashScreen('gold');
            buzz(60);
        }
    }
    renderGapporiBalls();
    renderGapporiTickets();
}

// ------------------------------------------------------------------
// 状態の表示
// ------------------------------------------------------------------
function renderGapporiStatus() {
    const table = gp.table;
    if (!table || !el('gp-status')) return;
    // JP 2倍・1/2 の回は、JP ルーレットを回して止めるまで前の額を出す
    const boost = table.phase === 'result' ? (table.result?.jackpot?.boost || table.result?.jackpot?.shift) : null;
    const hideBoost = boost && gp.boostShown !== table.roundNo && gp.jpShown !== table.roundNo;
    el('gp-jackpot').textContent = (hideBoost ? boost.before : Math.floor(table.jackpot)).toLocaleString('ja-JP');
    let text = '';
    if (table.phase === 'betting') {
        const left = gapporiSecondsLeft(table.bettingEndsAt);
        text = table.bettingEndsAt ? `受付中 あと${left}秒` : '券を買うと受付が始まります (30秒)';
    } else if (table.phase === 'drawing') {
        text = `抽選中… ${Math.min(gp.shownBalls + 1, 5)}球目`;
    } else if (table.phase === 'chance') {
        const mineWaiting = table.chances.some(chance => chance.name === myName() && !chance.choice);
        text = `${mineWaiting ? 'お宝ゲット！券ごとに1つ選んでください' : 'お宝ゲットの人が選んでいます'} あと${gapporiSecondsLeft(table.chanceEndsAt)}秒`;
    } else if (table.phase === 'result') {
        text = `結果発表 次の回まで${gapporiSecondsLeft(table.nextRoundAt)}秒`;
    }
    el('gp-status').textContent = table.board?.gold ? `✨ゴールド盤 ・ ${text}` : text;
}

function renderGapporiKinds() {
    const table = gp.table;
    const container = el('gp-kinds');
    container.innerHTML = '';
    if (!table) return;
    const open = isGapporiOpen(table);
    const chosen = countGappori(gp.picks);
    table.board.kinds.forEach(kind => {
        const count = chosen[kind] || 0;
        const cell = document.createElement('div');
        cell.className = 'gp-kind-cell';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gp-kind';
        button.setAttribute('aria-pressed', String(count > 0));
        button.setAttribute('aria-label', `${gapporiKindName(kind)}を1つ選ぶ (${count}個選んでいます)`);
        button.disabled = !open || count >= table.board.counts[kind] || gp.picks.length >= GAPPORI_PICKS_MAX;
        button.append(gapporiSymbol(kind));
        const name = document.createElement('span');
        name.className = 'gp-kind-name';
        name.textContent = gapporiKindName(kind);
        const pockets = document.createElement('span');
        pockets.className = 'gp-kind-count';
        pockets.textContent = `${table.board.counts[kind]}マス`;
        button.append(name, pockets);
        if (count > 0) {
            const badge = document.createElement('span');
            badge.className = 'gp-kind-badge';
            badge.textContent = `×${count}`;
            button.appendChild(badge);
        }
        button.addEventListener('click', () => addGapporiPick(kind));
        cell.appendChild(button);
        if (count > 0) {
            const minus = document.createElement('button');
            minus.type = 'button';
            minus.className = 'gp-kind-minus';
            minus.textContent = '−';
            minus.setAttribute('aria-label', `${gapporiKindName(kind)}を1つ減らす`);
            minus.disabled = !open;
            minus.addEventListener('click', () => removeGapporiPick(kind));
            cell.appendChild(minus);
        }
        container.appendChild(cell);
    });
    // ドクロ旗 (単品。盤面には無く、JP ルーレットのドクロ旗のマスで当たり)。いつでも選べる
    const flagOn = isGapporiFlag(gp.picks);
    const info = gapporiFlagInfo(table);
    const cell = document.createElement('div');
    cell.className = 'gp-kind-cell';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gp-kind is-flag';
    button.setAttribute('aria-pressed', String(flagOn));
    button.setAttribute('aria-label', `ドクロ旗を単品で選ぶ (1口 ${info.price.toLocaleString('ja-JP')})`);
    button.disabled = !open;
    button.append(gapporiSymbol(GAPPORI_FLAG));
    const name = document.createElement('span');
    name.className = 'gp-kind-name';
    name.textContent = 'ドクロ旗';
    const note = document.createElement('span');
    note.className = 'gp-kind-count';
    note.textContent = '単品';
    button.append(name, note);
    if (flagOn) {
        const badge = document.createElement('span');
        badge.className = 'gp-kind-badge';
        badge.textContent = '✓';
        button.appendChild(badge);
    }
    button.addEventListener('click', toggleGapporiFlag);
    cell.appendChild(button);
    container.appendChild(cell);
    // ハク (スタンプカードで貯めた回数があるときだけ。1回の抽選で1枚まで)
    const { haku } = gapporiStampInfo();
    const usedThisRound = myGapporiTickets(table).some(ticket => ticket.haku);
    if (haku > 0) {
        const hakuOn = isGapporiHaku(gp.picks);
        const hakuCell = document.createElement('div');
        hakuCell.className = 'gp-kind-cell';
        const hakuButton = document.createElement('button');
        hakuButton.type = 'button';
        hakuButton.className = 'gp-kind is-haku';
        hakuButton.setAttribute('aria-pressed', String(hakuOn));
        hakuButton.setAttribute('aria-label', `ハクを選ぶ (残り${haku}回)`);
        hakuButton.disabled = !open || usedThisRound || (!hakuOn && gp.picks.length >= GAPPORI_PICKS_MAX);
        hakuButton.append(gapporiSymbol(GAPPORI_HAKU));
        const hakuName = document.createElement('span');
        hakuName.className = 'gp-kind-name';
        hakuName.textContent = 'ハク';
        const hakuNote = document.createElement('span');
        hakuNote.className = 'gp-kind-count';
        hakuNote.textContent = usedThisRound ? 'この回は使用済み' : `残り${haku}回`;
        hakuButton.append(hakuName, hakuNote);
        if (hakuOn) {
            const badge = document.createElement('span');
            badge.className = 'gp-kind-badge';
            badge.textContent = '✓';
            hakuButton.appendChild(badge);
        }
        hakuButton.addEventListener('click', toggleGapporiHaku);
        hakuCell.appendChild(hakuButton);
        container.appendChild(hakuCell);
    }
}

/** スタンプカード (券を買う欄の上)。押したスタンプと、ハクを使える回数 */
function renderGapporiStamps() {
    const card = el('gp-stamps-card');
    if (!card) return;
    const { stamps, haku } = gapporiStampInfo();
    el('gp-stamps-note').textContent = `${stamps}/${GAPPORI_STAMPS_PER_CARD}${haku ? ` ・ ハク残り${haku}回` : ''}`;
    if (card.dataset.stamps === String(stamps)) return;
    card.dataset.stamps = String(stamps);
    card.innerHTML = '';
    for (let i = 0; i < GAPPORI_STAMPS_PER_CARD; i++) {
        const item = document.createElement('li');
        item.className = i < stamps ? 'is-stamped' : '';
        item.textContent = i < stamps ? '⚓' : String(i + 1);
        card.appendChild(item);
    }
}

function addGapporiPick(kind) {
    const table = gp.table;
    if (isGapporiFlag(gp.picks)) gp.picks = [];
    const count = gp.picks.filter(item => item === kind).length;
    if (!table || gp.picks.length >= GAPPORI_PICKS_MAX || count >= table.board.counts[kind]) return;
    gp.picks = [...gp.picks, kind];
    renderGapporiKinds();
    renderGapporiControls();
}

/** ハクを足す・外す (1枚の券に1つまで。ドクロ旗とは組み合わせない) */
function toggleGapporiHaku() {
    if (isGapporiHaku(gp.picks)) {
        gp.picks = gp.picks.filter(kind => kind !== GAPPORI_HAKU);
    } else if (gp.picks.length < GAPPORI_PICKS_MAX) {
        gp.picks = [...gp.picks.filter(kind => kind !== GAPPORI_FLAG), GAPPORI_HAKU];
    }
    renderGapporiKinds();
    renderGapporiControls();
}

/** ドクロ旗 (単品) を選ぶ。もう選んでいたら外す */
function toggleGapporiFlag() {
    gp.picks = isGapporiFlag(gp.picks) ? [] : [GAPPORI_FLAG];
    renderGapporiKinds();
    renderGapporiControls();
}

function removeGapporiPick(kind) {
    const index = gp.picks.lastIndexOf(kind);
    if (index < 0) return;
    gp.picks = gp.picks.filter((_, i) => i !== index);
    renderGapporiKinds();
    renderGapporiControls();
}

/** ハクを入れた予想か */
function isGapporiHaku(picks) {
    return picks.includes(GAPPORI_HAKU);
}

/** 宝探しのスタンプカード (財布の gappori.stamps・haku) */
function gapporiStampInfo() {
    const info = casino.session?.gappori || {};
    const current = { stamps: Number(info.stamps) || 0, haku: Number(info.haku) || 0 };
    // JP ルーレットを回す回は、止めて見せるまで前の表示のまま (サーバーはもうスタンプを押しているので、先に増えて見えないように)
    const table = gp.table;
    const hidden = table && table.phase === 'result' && table.result?.jackpot?.kind && !isGapporiJpRevealed(table);
    if (hidden && gp.stampShown) return gp.stampShown;
    gp.stampShown = current;
    return current;
}

/** ハクの券の倍率の幅 (ハクが化けうるお宝ごとの倍率)。others はハク以外のお宝 */
function gapporiHakuRange(table, others) {
    const values = (table?.board?.kinds || []).map(kind => table.odds?.[gapporiKey([...others, kind])]).filter(Boolean);
    return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
}

/** ドクロ旗の券 (単品) か */
function isGapporiFlag(picks) {
    return picks.length === 1 && picks[0] === GAPPORI_FLAG;
}

/** ドクロ旗の値段と倍率の範囲 (公開の写しの flag。無ければ既定) */
function gapporiFlagInfo(table = gp.table) {
    return table?.flag || { price: 1000, oddsMin: 50, oddsMax: 99 };
}

/** 券の倍率の表示。ドクロ旗は当たって JP ルーレットを見せるまで「×50〜99」 */
function gapporiOddsLabel(table, ticket) {
    if (isGapporiHaku(ticket.picks)) {
        // ハクは結果で倍率が決まる。見せるまでは化けうる倍率の幅
        if (ticket.odds && isGapporiTicketSettled(table, ticket, table.phase === 'result')) {
            return `×${ticket.odds}${ticket.hakuAs ? ` (ハク→${gapporiKindName(ticket.hakuAs)})` : ''}`;
        }
        const range = gapporiHakuRange(table, ticket.picks.filter(kind => kind !== GAPPORI_HAKU));
        return range ? `×${range.min}〜${range.max}` : '×?';
    }
    if (!isGapporiFlag(ticket.picks)) return `×${ticket.odds}`;
    const info = gapporiFlagInfo(table);
    return ticket.odds && isGapporiJpRevealed(table) ? `×${ticket.odds}` : `×${info.oddsMin}〜${info.oddsMax}`;
}

/** 1口の値段 (予想の個数で決まる。ドクロ旗は単品の値段)。個数が足りないあいだは null */
function gapporiPrice(count = gp.picks.length) {
    if (isGapporiFlag(gp.picks)) return gapporiFlagInfo().price;
    // ハクは1個に数える (値段は個数どおり)
    return gp.table?.prices?.[count] ?? null;
}

function gapporiCost() {
    return gp.units * (gapporiPrice() || 0);
}

function renderGapporiControls() {
    if (!el('gp-buy-button')) return;
    const table = gp.table;
    const picks = gp.picks.length;
    const flag = isGapporiFlag(gp.picks);
    const haku = isGapporiHaku(gp.picks);
    const hakuOthers = gp.picks.filter(kind => kind !== GAPPORI_HAKU);
    const hakuRange = haku && picks >= GAPPORI_HAKU_MIN_PICKS ? gapporiHakuRange(table, hakuOthers) : null;
    const odds = !table ? null : flag ? GAPPORI_FLAG : haku ? (hakuRange ? GAPPORI_HAKU : null)
        : picks >= GAPPORI_PICKS_MIN ? table.odds[gapporiKey(gp.picks)] ?? null : null;
    const cost = gapporiCost();
    // 打っている途中は書き換えない (空にしたときなど)。離れたときに change で直す
    if (document.activeElement !== el('gp-units')) el('gp-units').value = String(gp.units);
    el('gp-cost').textContent = `${cost.toLocaleString('ja-JP')}`;
    const chosen = sortGapporiPicks(gp.picks).map(gapporiKindName).join('・');
    const flagInfo = gapporiFlagInfo(table);
    el('gp-pick-info').textContent = haku
        ? (picks < GAPPORI_HAKU_MIN_PICKS
            ? `ハクは${GAPPORI_HAKU_MIN_PICKS}個以上の予想でだけ使えます。ハクのほかにお宝をあと${GAPPORI_HAKU_MIN_PICKS - picks}個選んでください (ハクと合わせて${GAPPORI_HAKU_MIN_PICKS}〜5個)`
            : !hakuRange ? 'この予想は次の回から買えます。'
                : `${sortGapporiPicks(hakuOthers).map(gapporiKindName).join('・')}・ハク (1口 ${gapporiPrice()}) ・ 倍率 ×${hakuRange.min}〜×${hakuRange.max} (ほかのお宝がそろって余った球があれば、いちばん高い倍率のお宝に化けて当たり)`)
        : flag
        ? `ドクロ旗 (単品・1口 ${flagInfo.price.toLocaleString('ja-JP')}) ・ 船長チャンスの JP ルーレットでドクロ旗に止まったら当たり。倍率はそのとき ×${flagInfo.oddsMin}〜×${flagInfo.oddsMax} を抽選`
        : picks < GAPPORI_PICKS_MIN
        ? `お宝をあと${GAPPORI_PICKS_MIN - picks}個選んでください (${GAPPORI_PICKS_MIN}〜${GAPPORI_PICKS_MAX}個。同じお宝を重ねてもよい)`
        : !odds || !gapporiPrice()
            ? 'この予想は次の回から買えます。'
            : `${chosen} (1口 ${gapporiPrice()}) ・ 倍率 ×${odds}`
                + (gapporiFeaturedFor(gapporiKey(gp.picks)) ? ` (おすすめ。通常 ×${gapporiFeaturedFor(gapporiKey(gp.picks)).baseOdds})` : '')
                + ` ・ 当たれば ${Math.round(cost * odds).toLocaleString('ja-JP')}`;
    el('gp-pick-info').classList.toggle('is-ready', Boolean(odds));
    el('gp-units-down').disabled = gp.units <= 1;
    el('gp-units-up').disabled = false;
    el('gp-buy-button').disabled = casino.busy || !casino.session || !isGapporiOpen(table) || !odds || !gapporiPrice()
        || cost > slotChips() || myGapporiTickets(table).length >= GAPPORI_MAX_TICKETS;
    renderGapporiStart();
    renderGapporiReset();
    renderGapporiFeatured();
    renderGapporiStamps();
}

/** 口数を 1以上の整数にして入れる (手で打った数もここで直す) */
function setGapporiUnits(value) {
    gp.units = Math.max(1, Math.min(GAPPORI_MAX_UNITS, Math.floor(Number(value)) || 1));
    el('gp-units').value = String(gp.units);
    renderGapporiControls();
}

/** −・＋: いまの口数から、GAPPORI_UNIT_STEPS の1つ前・1つ先の数へ (手で打った半端な数からでも) */
function stepGapporiUnits(direction) {
    const next = direction > 0
        ? GAPPORI_UNIT_STEPS.find(step => step > gp.units) ?? gp.units * 2
        : gp.units > GAPPORI_UNIT_STEPS[GAPPORI_UNIT_STEPS.length - 1]
            ? Math.max(GAPPORI_UNIT_STEPS[GAPPORI_UNIT_STEPS.length - 1], Math.floor(gp.units / 2))
            : [...GAPPORI_UNIT_STEPS].reverse().find(step => step < gp.units) ?? 1;
    setGapporiUnits(next);
}

/** 口数の欄に打っているあいだ: 1以上の整数なら代金と倍率の表示に使う (上限を超えた分は上限で数える) */
function inputGapporiUnits() {
    const value = Number(el('gp-units').value);
    if (!Number.isInteger(value) || value < 1) return;
    gp.units = Math.min(GAPPORI_MAX_UNITS, value);
    renderGapporiControls();
}

// ------------------------------------------------------------------
// スマホの画面の切り替え (券を買う / ルーレット)
// ------------------------------------------------------------------
function setGapporiScreen(screen) {
    gp.screen = screen;
    const section = el('gappori-table');
    if (!section) return;
    section.dataset.screen = screen;
    section.querySelectorAll('.gp-tabs [data-screen]').forEach(tab => {
        tab.setAttribute('aria-selected', String(tab.dataset.screen === screen));
    });
}

/** 受付中は「券を買う」、抽選が始まったら「ルーレット」へ。段階が変わったときだけ切り替える */
function followGapporiScreen(table) {
    const screen = table.phase === 'betting' ? 'buy' : 'wheel';
    const key = `${table.roundNo}:${screen}`;
    if (gp.screenKey === key) return;
    gp.screenKey = key;
    setGapporiScreen(screen);
}

/** JP ルーレットのお宝ゲットで当たりになった券の結果は、ルーレットを回して見せるまで伏せる */
function isGapporiJpRevealed(table) {
    return gp.jpShown === table.roundNo;
}

/** この券の当たり・はずれを出してよいか (結果が出ていて、JP ルーレットのお宝ゲットの券なら回し終わっている) */
function isGapporiTicketSettled(table, ticket, finished) {
    // JP ルーレットを回す回は、どの券も回し終わるまで伏せる (お宝ゲット・ドクロ旗・払い戻し2倍・もう1球で結果が変わる)
    return finished && (!table.result?.jackpot?.kind || isGapporiJpRevealed(table));
}

/**
 * 券のお宝の絵。同じお宝は、入った球の数だけ前から光らせる。
 * お宝ゲット (3球目のあとのチャンスと、JP ルーレットのお宝ゲット) で足したぶんは、足りない1つに点線の枠
 */
function gapporiTicketIcons(table, ticket, hits) {
    const granted = [table.chances.find(chance => chance.ticket === table.tickets.indexOf(ticket))?.choice || null];
    if (ticket.granted && isGapporiJpRevealed(table)) granted.push(ticket.granted);
    const icons = gapporiPickIcons(ticket.picks);
    const used = {};
    const grants = countGappori(granted.filter(Boolean));
    icons.querySelectorAll('.slot-symbol').forEach((node, i) => {
        const kind = ticket.picks[i];
        used[kind] = (used[kind] || 0) + 1;
        const hit = used[kind] <= (hits[kind] || 0);
        const grant = !hit && (grants[kind] || 0) > 0;
        if (grant) grants[kind] -= 1;
        node.classList.toggle('is-hit', hit);
        node.classList.toggle('is-granted', grant);
    });
    return icons;
}

/** 自分の券 (結果が出たら当たり・はずれと払い戻し) と、ほかの人の数。ルーレットの画面の全員の券もここで描く */
function renderGapporiTickets() {
    const table = gp.table;
    const list = el('gp-my-tickets');
    if (!table || !list) return;
    list.innerHTML = '';
    const mine = myGapporiTickets(table);
    const hits = gapporiShownHits(table);
    const finished = table.phase === 'result' && gp.shownBalls >= table.balls.length;
    if (!mine.length) {
        const item = document.createElement('li');
        item.className = 'is-none';
        item.textContent = isGapporiOpen(table) ? 'まだ買っていません。' : 'この回は買っていません。';
        list.appendChild(item);
    }
    mine.forEach(ticket => {
        const item = document.createElement('li');
        const info = document.createElement('span');
        info.className = 'gp-ticket-info';
        info.textContent = `${ticket.units}口 ${gapporiOddsLabel(table, ticket)}${ticket.featured ? ' ★' : ''}`;
        if (ticket.featured) info.title = '本日のおすすめ (倍率アップ)';
        const state = document.createElement('strong');
        state.className = 'gp-ticket-state';
        if (isGapporiTicketSettled(table, ticket, finished)) {
            state.textContent = ticket.win ? `+${ticket.payout.toLocaleString('ja-JP')}` : 'はずれ';
            item.classList.add(ticket.win ? 'is-win' : 'is-lose');
        } else {
            state.textContent = ticket.cost.toLocaleString('ja-JP');
        }
        item.append(gapporiTicketIcons(table, ticket, hits), info, state);
        list.appendChild(item);
    });
    const others = new Map();
    table.tickets.filter(ticket => ticket.name !== myName()).forEach(ticket => {
        others.set(ticket.name, (others.get(ticket.name) || 0) + 1);
    });
    el('gp-others').textContent = others.size
        ? `ほかの参加者: ${[...others.entries()].map(([name, count]) => `${name} ${count}枚`).join('、')}`
        : '';
    renderGapporiCrowd(table, hits, finished);
}

/** ルーレットの下: この回の全員の券を人ごとに (自分がいちばん上)。お宝と口数、結果が出たら払い戻しかはずれ */
function renderGapporiCrowd(table, hits, finished) {
    const box = el('gp-crowd');
    if (!box) return;
    box.innerHTML = '';
    const byName = new Map();
    table.tickets.forEach(ticket => {
        if (!byName.has(ticket.name)) byName.set(ticket.name, []);
        byName.get(ticket.name).push(ticket);
    });
    const me = myName();
    [...byName.keys()]
        .sort((a, b) => Number(b === me) - Number(a === me))
        .forEach(name => {
            const row = document.createElement('div');
            row.className = `gp-crowd-row${name === me ? ' is-me' : ''}`;
            const label = document.createElement('span');
            label.className = 'gp-crowd-name';
            label.textContent = name === me ? 'あなた' : name;
            row.appendChild(label);
            byName.get(name).forEach(ticket => {
                const chip = document.createElement('span');
                chip.className = 'gp-crowd-ticket';
                const settled = isGapporiTicketSettled(table, ticket, finished);
                if (settled) chip.classList.add(ticket.win ? 'is-win' : 'is-lose');
                chip.classList.toggle('is-featured', Boolean(ticket.featured));
                chip.title = `${ticket.picks.map(gapporiKindName).join('・')} ${ticket.units}口 ${gapporiOddsLabel(table, ticket)}`;
                const state = document.createElement('span');
                state.className = 'gp-crowd-state';
                state.textContent = settled
                    ? ticket.win ? `+${ticket.payout.toLocaleString('ja-JP')}` : 'はずれ'
                    : `${ticket.units}口`;
                chip.append(gapporiTicketIcons(table, ticket, hits), state);
                row.appendChild(chip);
            });
            box.appendChild(row);
        });
}

// ------------------------------------------------------------------
// 本日のおすすめ (券を買う画面。回ごとに 5・4・3・2個の予想を1つずつ、倍率が上がっている)
// ------------------------------------------------------------------
function gapporiFeaturedFor(key, table = gp.table) {
    return (table?.featured || []).find(item => item.key === key) || null;
}

function renderGapporiFeatured() {
    const box = el('gp-featured');
    if (!box) return;
    const table = gp.table;
    const featured = table?.featured || [];
    box.classList.toggle('hidden', !featured.length);
    const open = isGapporiOpen(table);
    const current = gp.picks.length ? gapporiKey(gp.picks) : '';
    // 受付の残り時間を出すたびに作り直すと押している途中のボタンが消えるので、変わったときだけ描く
    const signature = `${table?.roundNo}|${open}|${current}|${casino.busy}`;
    if (box.dataset.signature === signature) return;
    box.dataset.signature = signature;
    el('gp-featured-note').textContent = '倍率アップ中';
    const list = el('gp-featured-list');
    list.innerHTML = '';
    featured.forEach(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gp-featured-item';
        button.setAttribute('aria-pressed', String(item.key === current));
        button.setAttribute('aria-label', `${item.picks.map(gapporiKindName).join('・')} 倍率 ${item.odds} (通常 ${item.baseOdds})`);
        button.disabled = !open || casino.busy;
        const size = document.createElement('span');
        size.className = 'gp-featured-size';
        size.textContent = `${item.size}個`;
        const odds = document.createElement('span');
        odds.className = 'gp-featured-odds';
        const base = document.createElement('s');
        base.textContent = `×${item.baseOdds}`;
        const up = document.createElement('strong');
        up.textContent = `×${item.odds}`;
        odds.append(base, up);
        button.append(size, gapporiPickIcons(item.picks), odds);
        button.addEventListener('click', () => chooseGapporiFeatured(item));
        list.appendChild(button);
    });
}

function chooseGapporiFeatured(item) {
    if (!isGapporiOpen()) return;
    gp.picks = item.picks.slice();
    renderGapporiKinds();
    renderGapporiControls();
}

/** 自分の券のうち、チャンスが来ていてまだ選んでいないもの [{ ticket (この回の券の番号), picks }] */
function myPendingChances(table = gp.table) {
    if (!table || table.phase !== 'chance') return [];
    return table.chances
        .filter(chance => chance.name === myName() && !chance.choice)
        .map(chance => ({ ticket: chance.ticket, picks: table.tickets[chance.ticket]?.picks || [] }));
}

/** チャンス: チャンスが来た自分の券ごとに、その券でまだ足りないお宝から1つ選ぶ */
function renderGapporiChance() {
    const table = gp.table;
    const panel = el('gp-chance');
    if (!panel) return;
    const pending = gp.shownBalls >= 3 ? myPendingChances(table) : [];
    panel.classList.toggle('hidden', !pending.length);
    if (!pending.length) return;
    el('gp-chance-left').textContent = `あと${gapporiSecondsLeft(table.chanceEndsAt)}秒`;
    const options = el('gp-chance-options');
    const signature = `${table.roundNo}:${pending.map(item => item.ticket).join(',')}`;
    if (options.dataset.signature === signature) return;
    const first = !options.dataset.signature?.startsWith(`${table.roundNo}:`);
    options.dataset.signature = signature;
    options.innerHTML = '';
    const hits = gapporiShownHits(table);
    pending.forEach(({ ticket, picks }) => {
        const row = document.createElement('div');
        row.className = 'gp-chance-row';
        row.appendChild(gapporiPickIcons(picks));
        const short = Object.keys(gapporiShortfall(picks, hits));
        GAPPORI_ORDER.filter(kind => short.includes(kind)).forEach(kind => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'gp-chance-option';
            button.append(gapporiSymbol(kind));
            const name = document.createElement('span');
            name.textContent = gapporiKindName(kind);
            button.appendChild(name);
            button.addEventListener('click', () => chooseGapporiChance(ticket, kind));
            row.appendChild(button);
        });
        options.appendChild(row);
    });
    if (first) {
        flashScreen('gold');
        buzz([80, 40, 80, 40, 200]);
    }
}

function renderGapporiRecent() {
    const list = el('gp-recent');
    if (!list) return;
    list.innerHTML = '';
    (casino.session?.gappori?.recent || []).forEach(item => {
        const li = document.createElement('li');
        const net = item.returned - item.bet;
        li.className = `bj-pip ${item.jackpot > 0 ? 'is-blackjack' : net > 0 ? 'is-plus' : net < 0 ? 'is-minus' : 'is-even'}`;
        li.textContent = item.jackpot > 0 ? 'JP' : formatSigned(net);
        li.title = `券 ${item.tickets}枚 (当たり ${item.wins}) / 賭け ${item.bet} → 払戻 ${item.returned}`
            + (item.jackpot > 0 ? ` (ジャックポット ${item.jackpot})` : '');
        list.appendChild(li);
    });
}

/** ゲーム一覧のタイル: ジャックポットの額と、この回の参加人数 */
function renderGapporiTile() {
    const live = el('gp-tile-live');
    if (!live) return;
    const table = gp.table;
    if (!table) {
        live.textContent = '';
        return;
    }
    const players = new Set(table.tickets.map(ticket => ticket.name)).size;
    live.textContent = `JP ${table.jackpot.toLocaleString('ja-JP')}${players ? ` ・ いま${players}人` : ''}`;
    live.classList.toggle('is-busy', players > 0);
}

// ------------------------------------------------------------------
// 理想の賭け方 (結果のあと、ルーレットの上に出す)
// ------------------------------------------------------------------
/**
 * この回の結果で当たっていた予想を、倍率の高い順に。同じ倍率なら個数の多いほうを先にする。
 * おすすめは上がった倍率で数え、JP ルーレットのお宝ゲットが出た回はあと1球だった予想も、ドクロ旗に止まった回は
 * ドクロ旗 (単品) も入れる。3球目のあとのお宝ゲット (券ごとのチャンス) は数えない。
 * [{ picks, odds, price, payout (1口の払い戻し), featured, flag, byTreasure }]
 */
function gapporiIdealRanking(table) {
    const jackpot = table.result?.jackpot || {};
    // もう1球の回は6球目も入れて数える
    const balls = Number.isInteger(jackpot.extraBall) ? [...table.balls, jackpot.extraBall] : table.balls;
    const hits = countGappori(balls.map(index => table.board.pockets[index]).filter(kind => kind !== 'captain'));
    const payout2 = jackpot.kind === 'payout2' ? 2 : 1;   // 払い戻し2倍の回は倍率も2倍で並べる
    const featured = new Set((table.featured || []).map(item => item.key));
    const shortCount = picks => Object.values(gapporiShortfall(picks, hits)).reduce((sum, value) => sum + value, 0);
    const items = Object.entries(table.odds || {})
        .map(([key, odds]) => ({ key, picks: key.split('-'), odds: Number(odds) }))
        // 5球で当たった予想と、JP ルーレットのお宝ゲットが出た回は、あと1球だった予想も (お宝ゲットで当たりになる)
        .map(item => ({ ...item, short: shortCount(item.picks) }))
        .filter(item => item.short === 0 || (jackpot.kind === 'treasure' && item.short === 1))
        .map(item => {
            const price = Number(table.prices?.[item.picks.length]) || 0;
            return {
                ...item,
                odds: Math.round(item.odds * payout2 * 100) / 100,
                price,
                payout: Math.round(price * item.odds) * payout2,
                featured: featured.has(item.key),
                byTreasure: item.short === 1,
                doubled: payout2 > 1
            };
        });
    // JP ルーレットがドクロ旗に止まった回は、ドクロ旗 (単品) も (倍率はその回に引いたもの)
    if (jackpot.kind === GAPPORI_FLAG && jackpot.flagOdds) {
        const price = gapporiFlagInfo(table).price;
        items.push({ key: GAPPORI_FLAG, picks: [GAPPORI_FLAG], odds: jackpot.flagOdds, price, payout: price * jackpot.flagOdds, flag: true });
    }
    return items
        .sort((a, b) => b.odds - a.odds || b.picks.length - a.picks.length)
        .slice(0, GAPPORI_RANKING_SIZE);
}

function renderGapporiRanking() {
    const box = el('gp-ranking');
    const table = gp.table;
    if (!box) return;
    const show = Boolean(table) && table.phase === 'result' && gp.ranked === table.roundNo
        && gp.rankClosed !== table.roundNo && gp.shownBalls >= table.balls.length;
    box.classList.toggle('hidden', !show);
    if (!show || box.dataset.round === String(table.roundNo)) return;
    box.dataset.round = String(table.roundNo);
    const list = el('gp-ranking-list');
    list.innerHTML = '';
    gapporiIdealRanking(table).forEach((item, index) => {
        const row = document.createElement('li');
        row.className = `gp-rank-row is-rank-${index + 1}`;
        const rank = document.createElement('span');
        rank.className = 'gp-rank-no';
        rank.textContent = `${index + 1}位`;
        const odds = document.createElement('span');
        odds.className = 'gp-rank-odds';
        const multiplier = document.createElement('strong');
        multiplier.textContent = `×${item.odds}`;
        const payout = document.createElement('small');
        payout.textContent = `1口${item.price.toLocaleString('ja-JP')} → ${item.payout.toLocaleString('ja-JP')}`;
        odds.append(multiplier, payout);
        // おすすめ (倍率アップ)・ドクロ旗・JP ルーレットのお宝ゲットで当たりになる予想には印を付ける
        const tag = [item.flag ? 'ドクロ旗' : item.featured ? 'おすすめ' : item.byTreasure ? 'お宝ゲットで' : '', item.doubled ? '払戻2倍' : '']
            .filter(Boolean).join('・');
        if (tag) {
            const label = document.createElement('em');
            label.className = `gp-rank-tag${item.flag ? ' is-flag' : item.featured ? ' is-featured' : ''}`;
            label.textContent = tag;
            odds.prepend(label);
        }
        row.append(rank, gapporiPickIcons(item.picks), odds);
        list.appendChild(row);
    });
    restartClass(box, 'is-in');
}

/** 結果の演出が済んだら、少し置いてランキングを出す */
function scheduleGapporiRanking(roundNo, delay = GAPPORI_RANKING_DELAY_MS) {
    setTimeout(() => {
        if (gp.table?.roundNo !== roundNo || gp.table.phase !== 'result') return;
        gp.ranked = roundNo;
        renderGapporiRanking();
    }, delay);
}

// ------------------------------------------------------------------
// 結果の演出
// ------------------------------------------------------------------
/**
 * 5球が入り終わって結果が出たら、船長のチャンスタイム (カットイン → JP ルーレット → JP ならカットイン) と自分の当たりを見せる
 * (回ごとに1回)
 */
async function celebrateGapporiResult() {
    const table = gp.table;
    if (!table || table.phase !== 'result' || gp.celebrated === table.roundNo) return;
    if (gp.shownBalls < table.balls.length) return;
    // みんなの画面で同じ時刻に始める (サーバーが結果を出した時刻 + 少しの間。早く受け取った人はそこまで待つ)
    const startAt = Date.parse(table.result?.at || '') + (Number(table.result?.syncMs) || 0);
    if (Number.isFinite(startAt) && gapporiNow() < startAt) return;
    gp.celebrated = table.roundNo;
    const mine = myGapporiTickets(table);
    const payout = mine.reduce((sum, ticket) => sum + (ticket.payout || 0), 0);
    const cost = mine.reduce((sum, ticket) => sum + ticket.cost, 0);
    const jackpot = table.result?.jackpot || { captain: false, kind: null, won: false, amount: 0, shares: [], granted: [] };
    const myShare = jackpot.shares.find(share => share.name === myName())?.amount || 0;

    if (jackpot.captain && jackpot.kind && Array.isArray(jackpot.wheel)) {
        // 1つ目のカットイン: 船長チャンス (JP ルーレットへ)
        window.playGameSound?.('gpCaptain');
        strobeScreen(['red', 'gold', 'white']);
        buzz([120, 60, 120, 60, 400]);
        await showSlotOverlay('is-start', body => {
            body.append(
                modeText('p', 'slot-overlay-title', 'Captain'),
                modeText('p', 'slot-overlay-sub', '船長チャンス!! JPルーレット'),
                // JP ルーレットで増減する回 (2倍・1/2・JP±) は、増減する前の額を出す
                modeText('p', 'slot-overlay-count', `ジャックポット ${(jackpot.won ? jackpot.amount : (jackpot.boost || jackpot.shift) ? (jackpot.boost || jackpot.shift).before : table.jackpot).toLocaleString('ja-JP')}`)
            );
        }, { captain: 'stand' });
        // 盤面が JP ルーレットに変わって1回回る (同じ回のまま画面を開いていれば。卓は読み直すたびに別の物になるので回で見る)
        const sameRound = () => gp.table?.roundNo === table.roundNo && gp.table.phase === 'result';
        if (sameRound() && el('gp-wheel')) {
            setGapporiScreen('wheel');
            buildGapporiJpWheel(jackpot.wheel);
            await spinGapporiJpWheel(jackpot.index);
            // 止まったら、ハズレ以外 (JP・ドクロ旗・お宝ゲット・JP 2倍・JP 1/2) は当たりの球の音 (ハズレはハズレの音を下で鳴らす)
            if (jackpot.kind !== 'miss') window.playGameSound?.('gpBallHit');
            if (jackpot.kind === 'jackpot') {
                flashScreen('gold');
                buzz([120, 60, 120]);
            } else if (jackpot.boost) {
                const up = jackpot.boost.factor > 1;
                flashScreen(up ? 'gold' : 'red');
                buzz(up ? [120, 60, 120, 60, 300] : [300]);
                gp.boostShown = table.roundNo;
                renderGapporiStatus();
                showMessage(el('gp-message'), `${up ? '💰 JP 2倍！' : '💸 JP 1/2…'} ジャックポット ${jackpot.boost.before.toLocaleString('ja-JP')} → ${jackpot.boost.after.toLocaleString('ja-JP')} (持ち越し)`, up ? 'success' : 'info');
            } else if (jackpot.shift) {
                const up = jackpot.shift.delta >= 0;
                flashScreen(up ? 'gold' : 'red');
                gp.boostShown = table.roundNo;
                renderGapporiStatus();
                showMessage(el('gp-message'), `${up ? '💰 JP +' : '💸 JP −'}${Math.abs(jackpot.shift.delta).toLocaleString('ja-JP')}！ ジャックポット ${jackpot.shift.before.toLocaleString('ja-JP')} → ${jackpot.shift.after.toLocaleString('ja-JP')} (持ち越し)`, up ? 'success' : 'info');
            } else if (jackpot.kind === 'stamp') {
                flashScreen('gold');
                buzz([80, 40, 80]);
                const completed = (jackpot.stamped || []).filter(item => item.completed).map(item => item.name);
                showMessage(el('gp-message'), `📮 スタンプ！ この回に券を買った全員にスタンプを1つ押しました${completed.length ? ` (カードがいっぱいになってハク1回: ${completed.join('・')})` : ''}。`, 'success');
            } else if (jackpot.kind === 'payout2') {
                flashScreen('gold');
                buzz([80, 40, 80, 40, 200]);
                showMessage(el('gp-message'), '💰 払い戻し2倍！ この回の当たりの券の払い戻しが2倍になります。', 'success');
            } else if (jackpot.kind === 'extra') {
                flashScreen('gold');
                buzz([80, 40, 80]);
                showMessage(el('gp-message'), '🎱 もう1球！ 盤面に6球目が入ります。', 'success');
            } else if (jackpot.kind === GAPPORI_FLAG) {
                flashScreen('red');
                buzz([120, 60, 120, 60, 300]);
                showMessage(el('gp-message'), `☠️ ドクロ旗！ ドクロ旗の券が ×${jackpot.flagOdds} で当たり${jackpot.flagWinners?.length ? ` (${jackpot.flagWinners.length}枚)` : ' (この回はドクロ旗の券がありませんでした)'}。`, 'success');
            } else if (jackpot.kind === 'treasure') {
                flashScreen('gold');
                buzz([80, 40, 80, 40, 200]);
                showMessage(el('gp-message'), `🎁 お宝ゲット！ 全員の券で、あと1球で当たりだったお宝が「1球入ったこと」になりました${jackpot.granted.length ? ` (${jackpot.granted.length}枚が当たりに)` : ''}。`, 'success');
            } else {
                window.playGameSound?.('gpJackpotMiss');
                buzz([300]);
                showMessage(el('gp-message'), `ハズレ… ジャックポット ${table.jackpot.toLocaleString('ja-JP')} は持ち越しです。`, 'info');
            }
            await new Promise(resolve => setTimeout(resolve, prefersReducedMotion() ? 600 : GAPPORI_JP_HOLD_MS));
            if (jackpot.kind === 'extra' && Number.isInteger(jackpot.extraBall) && sameRound()) await dropGapporiExtraBall(table, jackpot.extraBall);
            gp.jpShown = table.roundNo;
            // 止めて見せたので、スタンプカード (とハクの回数) を新しい値で描き直す
            renderGapporiStamps();
            renderGapporiKinds();
            if (sameRound()) {
                restoreGapporiWheel(gp.table);
                renderGapporiTickets();
            }
        } else {
            gp.jpShown = table.roundNo;
        }
        if (jackpot.kind === GAPPORI_FLAG && jackpot.flagWinners?.length) {
            // 2つ目のカットイン: ドクロ旗 (当たったときに引いた倍率)
            const myFlag = jackpot.flagWinners.filter(item => item.name === myName()).reduce((sum, item) => sum + item.payout, 0);
            window.playGameSound?.('gpJackpotWin');
            strobeScreen(['red', 'white', 'red']);
            await showSlotOverlay('is-result', body => {
                const total = modeText('p', 'slot-overlay-total', myFlag ? '獲得 ' : '倍率 ');
                total.appendChild(modeText('strong', 'slot-overlay-won', myFlag ? myFlag.toLocaleString('ja-JP') : `×${jackpot.flagOdds}`));
                body.append(
                    modeText('p', 'slot-overlay-sub', `ドクロ旗!! ×${jackpot.flagOdds}`),
                    modeText('p', 'slot-overlay-title', 'Skull'),
                    total
                );
            }, { captain: 'laugh' });
        }
        if (jackpot.won) {
            // 2つ目のカットイン: ジャックポット
            window.playGameSound?.('gpJackpotWin');
            window.qjongTreasureRain?.preview(7000);
            strobeScreen(['white', 'gold', 'red', 'white']);
            buzz([200, 80, 200, 80, 600]);
            await showSlotOverlay('is-result', body => {
                const total = modeText('p', 'slot-overlay-total', '獲得 ');
                total.appendChild(modeText('strong', 'slot-overlay-won', (myShare || jackpot.amount).toLocaleString('ja-JP')));
                body.append(
                    modeText('p', 'slot-overlay-sub', myShare ? 'ジャックポット獲得!!' : 'ジャックポットが出ました'),
                    modeText('p', 'slot-overlay-title', 'Jackpot'),
                    total
                );
            }, { captain: 'laugh' });
        }
    } else {
        gp.jpShown = table.roundNo;
    }
    if (gp.table?.roundNo !== table.roundNo) return;

    // 全部の抽選 (5球と、船長の回は JP ルーレットも) が終わった
    window.playGameSound?.('gpFinish');

    if (payout > 0) {
        const big = payout >= cost * GAPPORI_BIG_WIN;
        restartClass(el('gp-wheel-wrap'), 'is-shake');
        burstCoins(Math.min(60, 12 + Math.round((payout / Math.max(cost, 1)) * 2)), el('gp-wheel-wrap'));
        if (big) {
            window.qjongTreasureRain?.preview(4500);
            strobeScreen(['white', 'gold', 'white']);
            buzz([200, 80, 200, 80, 500]);
        } else {
            flashScreen('white');
            buzz([80, 50, 140]);
        }
        showMessage(el('gp-message'), `🎉 当たり！ 払い戻し ${payout.toLocaleString('ja-JP')}`, 'success');
    } else if (mine.length && !jackpot.won) {
        showMessage(el('gp-message'), jackpot.kind === 'miss'
            ? `この回ははずれでした。JPルーレットもハズレ… ジャックポット ${table.jackpot.toLocaleString('ja-JP')} は持ち越しです。`
            : 'この回ははずれでした。', 'info');
    }

    scheduleGapporiRanking(table.roundNo);
    // 払い戻しが入った財布を読み直す
    if (mine.length) await sendGapporiTick();
}

// ------------------------------------------------------------------
// 卓を受け取る・読み直す・先へ進める
// ------------------------------------------------------------------
/** 届いた卓を反映する。新しい回なら盤面を描き直し、途中から開いたときは入り終わった球を演出なしで出す */
function receiveGapporiTable(table, now) {
    if (now) applyGapporiClock(now);
    if (!table) return;
    if (gp.table && table.seq < gp.table.seq && table.roundNo <= gp.table.roundNo) return;
    const newRound = !gp.table || table.roundNo !== gp.boardRound;
    gp.table = table;
    followGapporiScreen(table);
    if (newRound) {
        const firstLook = gp.boardRound === 0;
        if (el('gp-wheel')) buildGapporiWheel(table);
        // ゴールド盤の回が始まったら知らせる (開いたときにもう始まっていたときも)
        if (table.board.gold && el('gp-wheel')) {
            flashScreen('gold');
            showMessage(el('gp-message'), '✨ ゴールド盤！ この回はお宝が4種類だけで、同じお宝が最大6マス並びます。', 'success');
        }
        gp.shownBalls = firstLook ? gapporiDueBalls(table) : 0;
        gp.spinningFor = -1;
        el('gp-wheel-wrap')?.classList.remove('is-spinning');
        // 途中から開いたときは、最後に入った球のマスを針の下に合わせておく
        if (el('gp-wheel') && gp.shownBalls > 0) turnGapporiWheel(gapporiAngleFor(table.balls[gp.shownBalls - 1], 0), 0);
        el('gp-wheel')?.classList.remove('is-jp');
        if (firstLook && table.phase === 'result') {
            // 結果の途中から開いたときは、演出なしでランキングだけ出す
            gp.celebrated = table.roundNo;
            gp.ranked = table.roundNo;
            gp.jpShown = table.roundNo;
        }
        // 誰かが盤面をリセットした回は知らせる (開いたときにもうリセットされていたときは出さない)
        if (!firstLook && table.resetBy && table.phase === 'betting' && el('gp-wheel')) {
            const who = table.resetBy === myName() ? '' : `${table.resetBy}さんが`;
            showMessage(el('gp-message'), `🔄 ${who}盤面をリセットしました。新しい盤面です。`, 'success');
        }
        // 選びかけの予想は、新しい盤面にあるお宝だけ残す
        gp.picks = gp.picks.filter(kind => table.board.kinds.includes(kind));
        if (el('gp-chance-options')) el('gp-chance-options').innerHTML = '';
    }
    renderGapporiView();
}

function renderGapporiView() {
    if (!gp.table || !el('gp-wheel')) return;
    renderGapporiStatus();
    renderGapporiBalls();
    renderGapporiKinds();
    renderGapporiControls();
    renderGapporiTickets();
    renderGapporiStart();
    renderGapporiChance();
    renderGapporiRanking();
    renderGapporiTile();
}

async function pollGapporiTable() {
    if (gp.polling || document.hidden || routeGame() !== 'gappori') return;
    gp.polling = true;
    try {
        const doc = await getFirestoreDb().collection('gappori_public').doc('main').get();
        if (doc.exists) receiveGapporiTable(doc.data());
    } catch (error) {
        console.warn('宝探しの卓の読み込みに失敗:', error);
    } finally {
        gp.polling = false;
    }
}

async function sendGapporiTick() {
    try {
        const data = await callCasino('gpTick');
        applyGapporiClock(data.now);
        receiveGapporiTable(data.gappori);
        if (data.session) {
            casino.session = data.session;
            renderWallet();
            renderGapporiRecent();
        } else if (casino.session) {
            // チップが尽きて精算された (または時間切れで精算されていた)
            await refreshCasino();
        }
    } catch (error) {
        console.warn('宝探しの卓を進められませんでした:', error);
    }
}

/** いまの段階の締め切り (過ぎたら gpTick を送る) */
function gapporiDeadline(table) {
    if (table.phase === 'betting') return table.tickets.length ? table.bettingEndsAt : null;
    if (table.phase === 'drawing') return table.drawEndsAt;
    if (table.phase === 'chance') return table.chanceEndsAt;
    if (table.phase === 'result') return table.nextRoundAt;
    return null;
}

/**
 * 抽選中の音 (gappori-drawing-loop.mp3): 抽選が始まってから5球が出そろうまで繰り返して流す (お宝ゲットを選んでいるあいだも)。
 * 宝探しを閉じた・画面が裏に回った・結果が出そろったら止める。音がまだ読めていなければ、読めてから流す
 */
function updateGapporiDrawSound() {
    const table = gp.table;
    const drawing = Boolean(table) && gp.pollTimer && !document.hidden
        && (table.phase === 'drawing' || table.phase === 'chance' || (table.phase === 'result' && gp.shownBalls < table.balls.length));
    if (drawing && !gp.drawSoundStop && typeof startGameSoundLoop === 'function' && gameSound.buffers.has('gpDrawing')) {
        gp.drawSoundStop = startGameSoundLoop('gpDrawing');
    } else if (!drawing && gp.drawSoundStop) {
        gp.drawSoundStop();
        gp.drawSoundStop = null;
    }
}

/** 0.2秒ごと: 球を入れて見せ、残り時間を出し、締め切りを過ぎた卓を先へ進め、結果を見せる */
function tickGapporiClock() {
    const table = gp.table;
    if (!table) return;
    spinGapporiWheel();
    revealGapporiBalls();
    updateGapporiDrawSound();
    // 5球が出そろったら、結果を早く受け取れるよう卓を短い間隔で読み直す (演出を始める時刻をみんなでそろえるため)
    if (table.phase === 'drawing' && table.balls.length >= 5 && gp.shownBalls >= table.balls.length
        && Date.now() - (gp.fastPolledAt || 0) > GAPPORI_FAST_POLL_MS) {
        gp.fastPolledAt = Date.now();
        pollGapporiTable();
    }
    renderGapporiStatus();
    renderGapporiChance();
    if (table.phase === 'betting' && table.bettingEndsAt) renderGapporiControls();
    celebrateGapporiResult();
    const deadline = gapporiDeadline(table);
    if (!deadline || gp.ticked === deadline) return;
    if (gapporiNow() < Date.parse(deadline) + 300) return;
    // 画面を開いている全員が送っても、サーバー側で1回しか進まない。少しずらして送る
    gp.ticked = deadline;
    setTimeout(async () => {
        await sendGapporiTick();
        // 届くのが早すぎたり失敗したりして卓が進まなければ、少し待ってもう一度送る
        setTimeout(() => {
            if (gp.ticked === deadline) gp.ticked = '';
        }, 2000);
    }, Math.random() * 700);
}

// ------------------------------------------------------------------
// 操作
// ------------------------------------------------------------------
/** 「すぐ始める」: 券を買っているときだけ出す。押した人とまだの人がわかるようにする */
function renderGapporiStart() {
    const button = el('gp-start-button');
    if (!button) return;
    const table = gp.table;
    const mine = myGapporiTickets(table).length > 0;
    button.classList.toggle('hidden', !mine || !isGapporiOpen(table));
    if (!mine || !table) return;
    const players = [...new Set(table.tickets.map(ticket => ticket.name))];
    const waiting = players.filter(name => !(table.ready || []).includes(name));
    const pressed = (table.ready || []).includes(myName());
    button.disabled = casino.busy || pressed;
    button.textContent = pressed
        ? `ほかの人を待っています (あと${waiting.length}人)`
        : players.length > 1 ? `すぐ始める (${players.length}人全員が押したら始まります)` : 'すぐ始める';
}

async function startGapporiNow() {
    if (casino.busy) return;
    setCasinoBusy(true);
    try {
        const data = await callCasino('gpStart');
        applyGapporiClock(data.now);
        receiveGapporiTable(data.gappori);
    } catch (error) {
        showMessage(el('gp-message'), error.message, 'error');
    } finally {
        setCasinoBusy(false);
    }
}

/**
 * 「盤面をリセット」: 受付中で、この回にまだ誰も券を買っていないときだけ出す。
 * 1人1回 (使ったら、宝探しの券を買うまで押せない)
 */
function renderGapporiReset() {
    const button = el('gp-reset-button');
    if (!button) return;
    const table = gp.table;
    const show = Boolean(casino.session) && isGapporiOpen(table) && !table.tickets.length;
    button.classList.toggle('hidden', !show);
    if (!show) return;
    const used = Boolean(casino.session.gappori?.resetUsed);
    button.disabled = casino.busy || used;
    button.textContent = used ? '🔄 リセット済み' : '🔄 盤面をリセット';
}

async function resetGapporiBoard() {
    if (casino.busy || !window.confirm('盤面をリセットしますか？')) return;
    setCasinoBusy(true);
    try {
        const data = await callCasino('gpReset');
        applyGapporiClock(data.now);
        if (data.session) casino.session = data.session;
        receiveGapporiTable(data.gappori);
        renderWallet();
    } catch (error) {
        showMessage(el('gp-message'), error.message, 'error');
    } finally {
        setCasinoBusy(false);
    }
}

/** いま選んでいる予想と口数で、券を1枚買う */
async function buyGapporiTicket() {
    const picks = sortGapporiPicks(gp.picks);
    if (casino.busy || !casino.session || !(isGapporiFlag(picks) || isGapporiHaku(picks) || gp.table?.odds[gapporiKey(picks)])) return;
    const units = gp.units;
    const cost = gapporiCost();
    setCasinoBusy(true);
    try {
        const data = await callCasino('gpBuy', { picks, units });
        applyGapporiClock(data.now);
        if (data.session) casino.session = data.session;
        gp.picks = [];
        receiveGapporiTable(data.gappori);
        renderWallet();
        showMessage(el('gp-message'), `${picks.map(gapporiKindName).join('・')} ${units}口を買いました (代金 ${cost.toLocaleString('ja-JP')})`, 'success');
    } catch (error) {
        showMessage(el('gp-message'), error.message, 'error');
    } finally {
        setCasinoBusy(false);
    }
}

async function chooseGapporiChance(ticket, kind) {
    if (gp.choosing) return;
    gp.choosing = true;
    el('gp-chance-options').querySelectorAll('button').forEach(button => { button.disabled = true; });
    try {
        const data = await callCasino('gpChance', { ticket, kind });
        applyGapporiClock(data.now);
        receiveGapporiTable(data.gappori);
        showMessage(el('gp-message'), `${gapporiKindName(kind)}を「1球入ったこと」にしました。`, 'success');
    } catch (error) {
        showMessage(el('gp-message'), error.message, 'error');
    } finally {
        gp.choosing = false;
        // 選び終わっていない券が残っていれば、選び直せるように描き直す
        el('gp-chance-options').dataset.signature = '';
        renderGapporiChance();
    }
}

// ------------------------------------------------------------------
// 画面の出入り (game.js の renderRoute から呼ぶ)
// ------------------------------------------------------------------
function openGapporiTable() {
    renderGapporiView();
    renderGapporiRecent();
    if (!gp.pollTimer) {
        gp.pollTimer = setInterval(pollGapporiTable, GAPPORI_POLL_MS);
        gp.clockTimer = setInterval(tickGapporiClock, 200);
        pollGapporiTable();
    }
}

function closeGapporiTable() {
    if (gp.drawSoundStop) {
        gp.drawSoundStop();
        gp.drawSoundStop = null;
    }
    el('gp-chance')?.classList.add('hidden');
    clearInterval(gp.pollTimer);
    clearInterval(gp.clockTimer);
    gp.pollTimer = null;
    gp.clockTimer = null;
}

function initGappori() {
    if (!el('gp-wheel')) return;
    // お宝ゲットの札は画面の下に固定する。main は動きの transform を持ち、その中では main が基準になるので body へ移す
    document.body.appendChild(el('gp-chance'));
    document.querySelectorAll('.gp-tabs [data-screen]').forEach(tab => {
        tab.addEventListener('click', () => setGapporiScreen(tab.dataset.screen));
    });
    el('gp-units-down').addEventListener('click', () => stepGapporiUnits(-1));
    el('gp-units-up').addEventListener('click', () => stepGapporiUnits(1));
    el('gp-units').addEventListener('input', inputGapporiUnits);
    el('gp-units').addEventListener('change', () => setGapporiUnits(el('gp-units').value));
    el('gp-buy-button').addEventListener('click', buyGapporiTicket);
    el('gp-start-button').addEventListener('click', startGapporiNow);
    el('gp-reset-button').addEventListener('click', resetGapporiBoard);
    el('gp-ranking').addEventListener('click', () => {
        if (gp.table) gp.rankClosed = gp.table.roundNo;
        renderGapporiRanking();
    });
}
