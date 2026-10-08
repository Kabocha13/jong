// ゲームタブ: 成り上がり (1人ずつ遊ぶ5段のルーレット)
//   第1弾から順に回し、UP に止まると次の弾へ (第4弾 = JP、第5弾 = SJP)。終了で払い戻しなし、×N で賭け金 × N。
//   1回ぶんの結果 (各弾の並び・止まるマス・×? の倍率・払い戻し) は Cloud Function (casino の nrSpin) が最初にすべて決め、
//   画面はそれを順に回して見せる。第2弾・第3弾は UP の2秒後に自動で、第4弾・第5弾は画面の真ん中の大きなボタンで回す。
//   第1弾の並びは画面で作って nrSpin に送る (止まるマスはサーバーが等確率に決めるので、並びで有利にはならない)。
//   途中で閉じても払い戻しは入っている。第4弾以上まで行った回は、次に開いたときに第4弾のボタンから続きを見せる。
//   オートは結果が出たら少し間を置いて次を回す。第4弾・第5弾のボタンはオートでも押さず、押してもらうまで待つ。
//   閃光・金貨・震え・画面いっぱいの演出は game-slot.js のものを使う。財布 (使えるレート) の表示は game.js。

const NR_BETS = [1, 2, 5, 10, 20, 50, 100, 500, 1000, 5000];   // サーバーの NARIAGARI_BETS と同じ
const NR_BET_STORAGE_KEY = 'nariagariBet';
const NR_SHOWN_STORAGE_KEY = 'nariagariShown';       // 最後まで見せた回の id (続きを見せるかどうか)
// 弾ごとのマス (サーバーの NARIAGARI_STAGES と同じ)。q はその弾の ×? の範囲
const NR_STAGES = [
    { pockets: ['up', 'up', 'up', 'up', 'up', 'end', 'end', 'end', 'end', 'end', 'end', 'end', 'end', 'end', 'end'] },
    { pockets: ['up', 'up', 'up', 'end', 'end', 'end', 'x1', 'x2', 'x2', 'x3', 'q', 'q'], q: [1, 5] },
    { pockets: ['up', 'x3', 'x3', 'x6', 'x6', 'q'], q: [3, 10] },
    { pockets: ['up', 'x6', 'x6', 'x12', 'q'], q: [6, 16] },
    { pockets: ['x100', 'x15', 'x30', 'q'], q: [15, 50] }
];
const NR_STAGE_NAMES = ['第1弾', '第2弾', '第3弾', 'JP 第4弾', 'SJP 第5弾'];
const NR_HUB_NAMES = ['1弾', '2弾', '3弾', 'JP', 'SJP'];
// 回し方。speed は最高の速さ (度/秒)、ms は回す長さの範囲 (止める位置までの端数で最大1周ぶん伸びる)、
// slow はゆっくりになっていく長さ、curve はゆっくりになり方 (3: 最後にぐっと遅くなる / 2: 一定の割合でだんだん遅くなる)。
// 第1〜3弾は同じ速さで平均およそ10秒。第4弾 (JP) は平均15秒・第5弾 (SJP) は平均20秒で、ほとんどの時間をかけてだんだん遅くなる
const NR_SPINS = [
    { speed: 300, ms: [7500, 11500], slow: 4000, curve: 3 },
    { speed: 300, ms: [7500, 11500], slow: 4000, curve: 3 },
    { speed: 300, ms: [7500, 11500], slow: 4000, curve: 3 },
    { speed: 240, ms: [13000, 15500], slow: 12000, curve: 2 },
    { speed: 220, ms: [17900, 20500], slow: 16000, curve: 2 }
];
const NR_ACCEL_MS = 500;        // 回し始めて最高の速さになるまで
const NR_NEXT_MS = 2000;        // 第2弾・第3弾: UP に止まってから次を回し始めるまで
const NR_BIG_MULTIPLIER = 30;   // この倍率以上の当たりは大きく祝う
const NR_AUTO_GAP_MS = 800;        // オート: 結果が出てから次を回すまで
const NR_AUTO_WIN_GAP_MS = 1800;   // オート: 当たったときは結果を長めに見せる

const nr = {
    bet: 10,
    open: false,
    playing: false,      // 1回ぶんを見せている途中
    stage: 0,            // いま出している弾 (0 から)
    layout: null,        // いま出している弾の並び
    angle: 0,            // 盤面の角度 (度。時計回り)
    motion: null,        // 回している途中の動き
    waitButton: null,    // 第4弾・第5弾のボタンが押されるのを待っているときの { stage, resolve }
    auto: false,         // オート (第4弾・第5弾のボタンは自分で押す)
    autoTimer: null      // オートで次を回すまでのタイマー
};

function nrChips() {
    return casino.session ? casino.session.chips : 0;
}

function nrPocketLabel(pocket) {
    if (pocket === 'up') return 'UP';
    if (pocket === 'end') return '終了';
    if (pocket === 'q') return '×?';
    return `×${pocket.slice(1)}`;
}

function nrPocketType(pocket) {
    if (pocket === 'up' || pocket === 'end' || pocket === 'q') return pocket;
    return Number(pocket.slice(1)) >= 100 ? 'top' : 'mult';
}

/** 第1弾の並びを作る (サーバーと同じ決まり: UP どうしは円の端と端も含めて隣り合わせない) */
function shuffleNariagariLayout(stageIndex) {
    const pockets = NR_STAGES[stageIndex].pockets;
    for (let attempt = 0; attempt < 1000; attempt++) {
        const layout = [...pockets];
        for (let i = layout.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [layout[i], layout[j]] = [layout[j], layout[i]];
        }
        if (layout.every((pocket, i) => !(pocket === 'up' && layout[(i + 1) % layout.length] === 'up'))) return layout;
    }
    return [...pockets];
}

// ------------------------------------------------------------------
// 盤面
// ------------------------------------------------------------------
/** 弾 stageIndex の盤面を layout の並びで描く (マスの色は conic-gradient、文字はマスごとに回して置く) */
function renderNariagariWheel(stageIndex, layout, enter = false) {
    nr.stage = stageIndex;
    nr.layout = layout;
    const wrap = el('nr-wheel-wrap');
    const wheel = el('nr-wheel');
    const seg = 360 / layout.length;
    wrap.className = `nr-wheel-wrap is-stage-${stageIndex + 1}`;
    wrap.style.setProperty('--nr-seg', `${seg}deg`);
    const stops = layout.map((pocket, i) => `var(--nr-${nrPocketType(pocket)}) ${(i * seg).toFixed(3)}deg ${((i + 1) * seg).toFixed(3)}deg`);
    wheel.style.background = `radial-gradient(circle, transparent 52%, rgba(0, 0, 0, 0.28) 100%), conic-gradient(${stops.join(', ')})`;
    wheel.innerHTML = '';
    layout.forEach((pocket, i) => {
        const label = document.createElement('span');
        label.className = `nr-label is-${nrPocketType(pocket)}`;
        label.style.setProperty('--at', `${((i + 0.5) * seg).toFixed(3)}deg`);
        label.textContent = nrPocketLabel(pocket);
        wheel.appendChild(label);
    });
    // 角度は回した分だけ増えていくので、描き直すときに 0〜360 に戻す (見た目は変わらない)
    nr.angle = ((nr.angle % 360) + 360) % 360;
    turnNariagariWheel(nr.angle);
    setNariagariHub(NR_HUB_NAMES[stageIndex]);
    renderNariagariTower(stageIndex);
    wrap.setAttribute('aria-label', `${NR_STAGE_NAMES[stageIndex]}のルーレット`);
    if (enter) restartClass(wrap, 'is-enter');
}

/** 盤面を angle 度に回す。文字は --spin で戻して上向きのままにする */
function turnNariagariWheel(angle) {
    const wheel = el('nr-wheel');
    wheel.style.transform = `rotate(${angle}deg)`;
    wheel.style.setProperty('--spin', `${angle}deg`);
}

function setNariagariHub(text, tone = '') {
    const hub = el('nr-hub');
    hub.className = `nr-hub ${tone}`.trim();
    hub.textContent = text;
}

/** 右の塔: 着いた弾を光らせ、いまの弾を強く光らせる */
function renderNariagariTower(current, reached = current) {
    document.querySelectorAll('#nr-tower [data-stage]').forEach(tier => {
        const stage = Number(tier.dataset.stage) - 1;
        tier.classList.toggle('is-current', stage === current);
        tier.classList.toggle('is-reached', stage <= reached);
    });
}

function setNariagariStatus(text) {
    el('nr-status').textContent = text;
}

function setNariagariResult(text, tone = '') {
    const result = el('nr-result');
    result.className = `slot-result ${tone}`.trim();
    result.textContent = text;
}

// 回す動き: 0.5秒で最高の速さになり、そのまま回って、止める位置が決まったら最後の slow ミリ秒でゆっくり止まる。
// ゆっくりになるあいだの速さは 最高の速さ × (1 − 経った割合)^(curve − 1) (curve 2 は一定の割合で、3 は最後ほどぐっと遅くなる)
function nrFreeAngle(motion, t) {
    const dt = Math.max(0, t - motion.t0);
    return dt < NR_ACCEL_MS
        ? motion.a0 + (motion.speed * dt * dt) / (2 * NR_ACCEL_MS)
        : motion.a0 + motion.speed * (dt - NR_ACCEL_MS / 2);
}

function nrAngleAt(motion, t) {
    const land = motion.land;
    if (!land || t < land.at) return nrFreeAngle(motion, t);
    const u = Math.min(1, (t - land.at) / land.ms);
    return land.from + (motion.speed * land.ms * (1 - (1 - u) ** land.curve)) / land.curve;
}

/** 止める時刻が来た: 止める角度にぴったり合わせて終える (描画の合間とタイマーのどちらから呼ばれてもよい) */
function finishNariagariMotion(motion) {
    if (nr.motion !== motion || !motion.land) return;
    cancelAnimationFrame(motion.raf);
    clearTimeout(motion.timer);
    nr.motion = null;
    nr.angle = motion.land.to;
    turnNariagariWheel(nr.angle);
    el('nr-wheel-wrap').classList.remove('is-spinning');
    motion.land.resolve();
}

/** 盤面を回し始める (止める位置はあとで landNariagariWheel で決める) */
function startNariagariWheel(stageIndex) {
    if (nr.motion) {
        cancelAnimationFrame(nr.motion.raf);
        clearTimeout(nr.motion.timer);
    }
    const motion = { t0: performance.now(), a0: nr.angle, speed: NR_SPINS[stageIndex].speed / 1000, land: null, raf: 0, timer: 0 };
    nr.motion = motion;
    el('nr-wheel-wrap').classList.add('is-spinning');
    const frame = now => {
        if (nr.motion !== motion) return;
        if (motion.land && now >= motion.land.at + motion.land.ms) {
            finishNariagariMotion(motion);
            return;
        }
        nr.angle = nrAngleAt(motion, now);
        turnNariagariWheel(nr.angle);
        motion.raf = requestAnimationFrame(frame);
    };
    motion.raf = requestAnimationFrame(frame);
}

/**
 * 回している盤面を、マス stop が上の針の下に来るように止める。回し始めてからおよそ total ミリ秒で止まる
 * (止める位置までの端数のぶん、最大1周ぶん長くなる)。止まったら解決する
 */
function landNariagariWheel(stop, total) {
    const motion = nr.motion;
    const seg = 360 / nr.layout.length;
    // マスの真ん中から少しずらして止める (毎回まったく同じ位置に止まらないように)
    const target = -(stop + 0.5) * seg + (Math.random() - 0.5) * seg * 0.6;
    if (!motion || prefersReducedMotion()) {
        if (motion) {
            cancelAnimationFrame(motion.raf);
            clearTimeout(motion.timer);
        }
        nr.motion = null;
        nr.angle = target;
        turnNariagariWheel(nr.angle);
        el('nr-wheel-wrap').classList.remove('is-spinning');
        return Promise.resolve();
    }
    const { slow, curve } = NR_SPINS[nr.stage];
    let at = Math.max(performance.now() + 50, motion.t0 + NR_ACCEL_MS, motion.t0 + total - slow);
    const end = nrFreeAngle(motion, at) + (motion.speed * slow) / curve;
    at += ((((target - end) % 360) + 360) % 360) / motion.speed;
    return new Promise(resolve => {
        const from = nrFreeAngle(motion, at);
        motion.land = { at, ms: slow, curve, from, to: from + (motion.speed * slow) / curve, resolve };
        // 画面が裏に回るなどして描画が止まっていても、止める時刻には止める
        motion.timer = setTimeout(() => finishNariagariMotion(motion), Math.max(0, at + slow - performance.now()) + 30);
    });
}

/** 通信に失敗したときなど: 回している盤面をその場で止める */
function stopNariagariWheel() {
    if (!nr.motion) return;
    cancelAnimationFrame(nr.motion.raf);
    clearTimeout(nr.motion.timer);
    nr.motion = null;
    el('nr-wheel-wrap').classList.remove('is-spinning');
}

/** 弾 stageIndex を回して、マス stop で止める */
async function spinNariagariStage(stageIndex, stop) {
    const [min, max] = NR_SPINS[stageIndex].ms;
    if (prefersReducedMotion()) return landNariagariWheel(stop, 0);
    startNariagariWheel(stageIndex);
    return landNariagariWheel(stop, min + Math.random() * (max - min));
}

/** ×? に止まったとき: 真ん中で数字を回してから倍率を見せる */
async function revealNariagariQ(stageIndex, value) {
    const [min, max] = NR_STAGES[stageIndex].q;
    if (!prefersReducedMotion()) {
        let wait = 40;
        while (wait < 260) {
            setNariagariHub(`×${min + Math.floor(Math.random() * (max - min + 1))}`, 'is-rolling');
            await delay(wait);
            wait *= 1.12;
        }
    }
    setNariagariHub(`×${value}`, 'is-value');
    flashScreen('gold');
    buzz([60, 40, 120]);
    await delay(500);
}

// ------------------------------------------------------------------
// 第4弾・第5弾のボタン (画面の真ん中に大きく出す。押すと解決する)
// ------------------------------------------------------------------
function waitNariagariButton(stageIndex) {
    return new Promise(resolve => {
        nr.waitButton = { stage: stageIndex, resolve };
        renderNariagariBigButton();
    });
}

function renderNariagariBigButton() {
    const overlay = el('nr-big');
    if (!overlay) return;
    const waiting = nr.waitButton;
    // ほかの画面へ移っているあいだは隠す (戻ったらまた出す)
    overlay.classList.toggle('hidden', !waiting || !nr.open);
    if (!waiting) return;
    const sjp = waiting.stage >= 4;
    overlay.classList.toggle('is-sjp', sjp);
    el('nr-big-button').classList.toggle('is-sjp', sjp);
    el('nr-big-sub').textContent = sjp ? 'SJP 第5弾' : 'JP 第4弾';
}

function pressNariagariBigButton() {
    const waiting = nr.waitButton;
    if (!waiting) return;
    nr.waitButton = null;
    renderNariagariBigButton();
    window.playGameSound?.(waiting.stage >= 4 ? 'nrSjpButton' : 'nrJpButton');
    buzz(80);
    waiting.resolve();
}

// ------------------------------------------------------------------
// 1回ぶんを見せる
// ------------------------------------------------------------------
/** 第4弾 (JP)・第5弾 (SJP) に着いたときの画面いっぱいの演出 */
async function celebrateNariagariReach(stageIndex) {
    if (stageIndex >= 4) {
        window.qjongTreasureRain?.preview(7000);
        strobeScreen(['white', 'gold', 'red', 'white', 'gold']);
        buzz([200, 80, 200, 80, 200, 80, 600]);
        await showSlotOverlay('is-result nr-overlay-sjp', body => {
            body.append(
                modeText('p', 'slot-overlay-sub', '最上段 第5弾!!'),
                modeText('p', 'slot-overlay-title', 'Super'),
                modeText('p', 'slot-overlay-title is-second', 'Jackpot')
            );
        }, { captain: 'laugh' });
        return;
    }
    strobeScreen(['red', 'gold', 'white']);
    buzz([120, 60, 120, 60, 400]);
    await showSlotOverlay('is-start nr-overlay-jp', body => {
        body.append(
            modeText('p', 'slot-overlay-title', 'Jackpot'),
            modeText('p', 'slot-overlay-sub', 'JP 第4弾 突入!!')
        );
    }, { captain: 'surprised' });
}

/** 払い戻しを数え上げて見せる */
async function countNariagariWin(multiplier, payout, tone) {
    const head = `×${multiplier}  WIN `;
    if (prefersReducedMotion() || payout <= 10) {
        setNariagariResult(`${head}${payout.toLocaleString('ja-JP')}`, tone);
        return;
    }
    const steps = Math.min(24, payout);
    for (let i = 1; i <= steps; i++) {
        setNariagariResult(`${head}${Math.round((payout * i) / steps).toLocaleString('ja-JP')}`, tone);
        await delay(40);
    }
}

/** 止まった弾が最後 (終了か ×N): 結果を見せる */
async function finishNariagariPlay(play, stageIndex, step) {
    if (step.pocket === 'end') {
        el('nr-wheel-wrap').classList.add('is-dim');
        setNariagariHub('終了', 'is-end');
        setNariagariResult('終了', 'is-miss');
        setNariagariStatus(`${NR_STAGE_NAMES[stageIndex]}で終了`);
        return;
    }
    if (step.pocket === 'q') await revealNariagariQ(stageIndex, step.value);
    else setNariagariHub(`×${play.multiplier}`, 'is-value');
    const big = play.multiplier >= NR_BIG_MULTIPLIER || stageIndex >= 3;
    restartClass(el('nr-wheel-wrap'), 'is-shake');
    burstCoins(Math.min(60, 10 + play.multiplier * 2), el('nr-wheel-wrap'));
    if (big) {
        window.qjongTreasureRain?.preview(4500);
        strobeScreen(['white', 'gold', 'white']);
        buzz([200, 80, 200, 80, 500]);
    } else {
        flashScreen('white');
        buzz([80, 50, 140]);
    }
    setNariagariStatus(`${NR_STAGE_NAMES[stageIndex]} ×${play.multiplier}`);
    await countNariagariWin(play.multiplier, play.payout, big ? 'is-big' : 'is-win');
    el('nr-result-detail').textContent = `賭け ${play.bet.toLocaleString('ja-JP')} → 払い戻し ${play.payout.toLocaleString('ja-JP')}`;
    if (stageIndex >= 3) {
        const total = modeText('p', 'slot-overlay-total', '獲得 ');
        total.appendChild(modeText('strong', 'slot-overlay-won', play.payout.toLocaleString('ja-JP')));
        await showSlotOverlay('is-result', body => {
            body.append(
                modeText('p', 'slot-overlay-sub', `${NR_STAGE_NAMES[stageIndex]} ×${play.multiplier}`),
                modeText('p', 'slot-overlay-title', stageIndex >= 4 ? 'SJP' : 'JP'),
                total
            );
        });
    }
}

/**
 * play (サーバーが決めた1回ぶん) を順に回して見せる。from は見せ始める弾 (続きから見せるときは 3 = 第4弾)。
 * 第1弾は呼ぶ前に回し始めている (通信のあいだも回しておくため)
 */
async function presentNariagariPlay(play, from = 0) {
    for (let index = from; index < play.stages.length; index++) {
        const step = play.stages[index];
        if (index > 0 && index === from) {
            // 続きから: いきなり第4弾 (か第5弾) を出す
            renderNariagariWheel(index, step.layout, true);
        }
        if (index >= 3) {
            // オート中でも、ここは自分で押す
            setNariagariStatus(`${NR_STAGE_NAMES[index]}  ボタンを押して回す`);
            await waitNariagariButton(index);
        }
        setNariagariStatus(`${NR_STAGE_NAMES[index]} 回転中…`);
        setNariagariHub(NR_HUB_NAMES[index]);
        // JP・SJP の抽選中は、盤面が止まるまで音を流し続ける (nariagari-jp-spin-loop.mp3・nariagari-sjp-spin-loop.mp3)
        const stopSpinSound = index >= 3 && !prefersReducedMotion()
            ? (window.startGameSoundLoop?.(index >= 4 ? 'nrSjpSpin' : 'nrJpSpin') || (() => {}))
            : () => {};
        if (index === 0) await landNariagariWheel(step.stop, NR_SPINS[0].ms[0] + Math.random() * (NR_SPINS[0].ms[1] - NR_SPINS[0].ms[0]));
        else await spinNariagariStage(index, step.stop);
        stopSpinSound();
        if (step.pocket !== 'up') {
            await finishNariagariPlay(play, index, step);
            return;
        }
        // UP: 次の弾へ
        el('nr-wheel-wrap').classList.add('is-up');
        setNariagariHub('UP!', 'is-up');
        window.playGameSound?.('nrUp');
        flashScreen('gold');
        buzz([80, 40, 80]);
        renderNariagariTower(index, index + 1);
        const next = play.stages[index + 1];
        if (index + 1 < 3) {
            setNariagariStatus(`UP!  2秒後に${NR_STAGE_NAMES[index + 1]}`);
            await delay(NR_NEXT_MS / 2);
            renderNariagariWheel(index + 1, next.layout, true);
            await delay(NR_NEXT_MS / 2);
        } else {
            setNariagariStatus(`UP!  ${NR_STAGE_NAMES[index + 1]}へ`);
            await delay(900);
            await celebrateNariagariReach(index + 1);
            renderNariagariWheel(index + 1, next.layout, true);
        }
    }
}

/** 見せ終えたあと: 最後まで見せた回として覚える */
function doneNariagariPlay(play) {
    try { localStorage.setItem(NR_SHOWN_STORAGE_KEY, play.id); } catch (error) { /* 無視 */ }
}

// ------------------------------------------------------------------
// 賭け金と「回す」
// ------------------------------------------------------------------
function fitNariagariBet() {
    const chips = nrChips();
    if (nr.bet <= chips) return;
    const fits = NR_BETS.filter(bet => bet <= chips);
    nr.bet = fits.length ? fits[fits.length - 1] : NR_BETS[0];
}

function stepNariagariBet(direction) {
    const index = NR_BETS.indexOf(nr.bet);
    const next = NR_BETS[index + direction];
    if (!next || next > nrChips()) return;
    nr.bet = next;
    try { localStorage.setItem(NR_BET_STORAGE_KEY, String(nr.bet)); } catch (error) { /* 無視 */ }
    renderNariagariControls();
}

function renderNariagariControls() {
    if (!el('nr-spin-button')) return;
    const locked = casino.busy || !casino.session || nr.playing;
    el('nr-bet').textContent = nr.bet.toLocaleString('ja-JP');
    el('nr-bet-down').disabled = locked || nr.bet <= NR_BETS[0];
    el('nr-bet-up').disabled = locked || !NR_BETS.some(bet => bet > nr.bet && bet <= nrChips());
    // オート中のボタンは、回している最中でも押せる「オートを止める」にする
    el('nr-spin-button').disabled = nr.auto ? false : locked || nr.bet > nrChips();
    el('nr-spin-button').textContent = nr.auto ? 'オートを止める' : '回す';
    el('nr-spin-button').classList.toggle('is-auto', nr.auto);
    el('nr-auto').checked = nr.auto;
    el('nr-auto').disabled = !casino.session;
}

function stopNariagariAuto() {
    nr.auto = false;
    clearTimeout(nr.autoTimer);
    nr.autoTimer = null;
    renderNariagariControls();
}

/** オート: wait ミリ秒後に次を回す (手元が賭け金に足りなければ止める) */
function queueNariagariAuto(wait) {
    clearTimeout(nr.autoTimer);
    if (!nr.auto || !nr.open) return;
    nr.autoTimer = setTimeout(() => {
        nr.autoTimer = null;
        if (!nr.auto || !nr.open) return;
        if (nr.bet > nrChips()) {
            stopNariagariAuto();
            showMessage(el('nr-message'), '使えるレートが賭け金に足りないので、オートを止めました。', 'info');
            return;
        }
        spinNariagari();
    }, wait);
}

async function spinNariagari() {
    if (casino.busy || !casino.session || nr.playing || nr.bet > nrChips()) return;
    const bet = nr.bet;
    nr.playing = true;
    setCasinoBusy(true);
    el('nr-spin-button').setAttribute('aria-busy', 'true');
    // 前の回の盤面が残っていれば、新しい並びの第1弾に戻してすぐ回し始める (通信のあいだも回しておく)
    const layout = nr.stage === 0 && nr.layout && !el('nr-wheel-wrap').classList.contains('is-dim') ? nr.layout : shuffleNariagariLayout(0);
    renderNariagariWheel(0, layout, nr.stage !== 0);
    setNariagariResult('');
    el('nr-result-detail').textContent = '';
    setNariagariStatus(`${NR_STAGE_NAMES[0]} 回転中…`);
    if (!prefersReducedMotion()) startNariagariWheel(0);
    let data = null;
    let wait = NR_AUTO_GAP_MS;
    try {
        data = await callCasino('nrSpin', { bet, layout });
        if (data.expired) {
            stopNariagariAuto();
            stopNariagariWheel();
            await refreshCasino();
            showMessage(el('casino-message'), settledMessage(data.settled), 'info');
            return;
        }
        const play = data.result;
        // サーバーが並びを作り直していたら (古い画面など)、その並びで描き直す
        if (play.stages[0].layout.join() !== layout.join()) renderNariagariWheel(0, play.stages[0].layout);
        await presentNariagariPlay(play);
        doneNariagariPlay(play);
        if (play.payout > 0) wait = NR_AUTO_WIN_GAP_MS;
        if (data.settled) {
            // チップが尽きてサーバー側で精算済み
            stopNariagariAuto();
            casino.session = null;
            showMessage(el('nr-message'), `チップがなくなりました。${settledMessage(data.settled)}`, 'info');
            await delay(2500);
            await refreshCasino();
            showMessage(el('casino-message'), settledMessage(data.settled), 'info');
            return;
        }
        casino.session = data.session;
        fitNariagariBet();
        renderWallet();
        setNariagariStatus('賭け金を決めて「回す」');
    } catch (error) {
        stopNariagariAuto();
        stopNariagariWheel();
        setNariagariStatus('');
        showMessage(el('nr-message'), error.message, 'error');
        await refreshCasino().catch(() => {});
    } finally {
        el('nr-spin-button').removeAttribute('aria-busy');
        nr.playing = false;
        setCasinoBusy(false);
        queueNariagariAuto(wait);
    }
}

/** 第4弾以上まで行ったのに、まだ最後まで見せていない回 (画面を閉じたなど) */
function pendingNariagariPlay() {
    const last = casino.session?.nariagari?.last;
    if (!last || last.top < 4) return null;
    let shown = '';
    try { shown = localStorage.getItem(NR_SHOWN_STORAGE_KEY) || ''; } catch (error) { /* 無視 */ }
    return last.id === shown ? null : last;
}

/** 続きを見せる (払い戻しはもう手元チップに入っている) */
async function resumeNariagari(play) {
    nr.playing = true;
    setCasinoBusy(true);
    setNariagariResult('');
    el('nr-result-detail').textContent = '';
    try {
        await presentNariagariPlay(play, 3);
        doneNariagariPlay(play);
        setNariagariStatus('賭け金を決めて「回す」');
    } finally {
        nr.playing = false;
        setCasinoBusy(false);
        renderWallet();
    }
}

// ------------------------------------------------------------------
// 画面の出入りと組み立て
// ------------------------------------------------------------------
function openNariagariTable() {
    nr.open = true;
    if (!nr.layout) {
        renderNariagariWheel(0, shuffleNariagariLayout(0));
        setNariagariResult('Good Luck', 'is-idle');
        setNariagariStatus('賭け金を決めて「回す」');
    }
    fitNariagariBet();
    renderNariagariControls();
    renderNariagariBigButton();
    const pending = nr.playing ? null : pendingNariagariPlay();
    if (pending) {
        setNariagariStatus('前の回の続きがあります');
        resumeNariagari(pending);
    }
}

function closeNariagariTable() {
    nr.open = false;
    if (nr.auto) stopNariagariAuto();
    renderNariagariBigButton();
}

/** ゲーム一覧のタイルの札: 続きがあるとき */
function nariagariTileBadge() {
    return !nr.playing && pendingNariagariPlay() ? '続きがあります' : '';
}

function initNariagari() {
    if (!el('nr-wheel')) return;
    try {
        const saved = Number(localStorage.getItem(NR_BET_STORAGE_KEY));
        if (NR_BETS.includes(saved)) nr.bet = saved;
    } catch (error) {
        // 保存できない環境では既定値のまま
    }
    // 大きなボタンは画面の真ん中に固定する。main は入場の動きの transform を持ち、その中では main が基準になるので body へ移す
    document.body.appendChild(el('nr-big'));
    el('nr-bet-down').addEventListener('click', () => stepNariagariBet(-1));
    el('nr-bet-up').addEventListener('click', () => stepNariagariBet(1));
    el('nr-spin-button').addEventListener('click', () => {
        if (nr.auto) {
            stopNariagariAuto();
            return;
        }
        spinNariagari();
    });
    el('nr-auto').addEventListener('change', event => {
        nr.auto = event.target.checked;
        renderNariagariControls();
        if (!nr.auto) {
            stopNariagariAuto();
            return;
        }
        // 回していなければすぐ始める (回している途中なら、その回が終わってから続ける)
        if (!casino.busy && !nr.playing) spinNariagari();
    });
    el('nr-big-button').addEventListener('click', pressNariagariBigButton);
}
