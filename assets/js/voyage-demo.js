// assets/js/voyage-demo.js
// 航海 (大海賊の航海日誌) の第1章だけを試すデモ (voyage-demo.html)。
//   画面と演出は本番と同じ game-voyage.js をそのまま使い、game.js の代わりに casino・callCasino などをここで用意する。
//   1回ぶんはサーバーではなく、この画面の中で本番と同じルール (functions/voyage.js の写しの voyage-rules.js) で決める
//   (Firestore・Cloud Functions には触らない。レート・本番のジャックポット・最終秘宝は動かない)。
//   voyage-rules.js は Hosting の predeploy (tools/copy-voyage-rules.mjs) が作る。
//   チップは練習用で、ページを開き直すと最初から。物語は開くたびに見せる (本番の「見た章」の記録には触らない)。

const VG_DEMO_CHIPS = 1000;          // 練習用チップ (尽きたらこの額を足す)
const VG_DEMO_JP_SEED = 2000;        // ジャックポットの始まりの額 (デモ用。本番は 0 から全員の賭け金で貯まる)
const VG_DEMO_RECENT_LIMIT = 12;

let rules = null;                    // functions/voyage.js の写し
let demoChapters = [];               // 画面へ渡す章の一覧 (publicVoyageChapter の形)

const casino = {
    ready: true,
    me: 'あなた',
    score: 0,
    session: null,
    busy: false
};

const el = id => document.getElementById(id);

function formatClock(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ------------------------------------------------------------------
// デモの状態 (サーバーの財布・voyage_public・voyage_players の代わり)
// ------------------------------------------------------------------
let demo = null;

function resetDemoState() {
    demo = {
        buyIn: VG_DEMO_CHIPS,
        chips: VG_DEMO_CHIPS,
        rolls: 0,
        pos: 0,
        laps: 0,
        lapDebt: 0,
        wagered: 0,
        jpWon: 0,
        bestWin: 0,
        jpCents: VG_DEMO_JP_SEED * 100,
        treasureCents: 0,
        jpHistory: [],
        recent: [],
        startedAt: new Date().toISOString()
    };
}

function demoSession() {
    return {
        game: 'voyage',
        buyIn: demo.buyIn,
        chips: demo.chips,
        vgRolls: demo.rolls,
        startedAt: demo.startedAt,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        voyage: { recent: demo.recent }
    };
}

/** status の voyage と同じ形 (functions/index.js の readVoyageStatus)。日付に関係なく第1章の途中にする */
function demoVoyageInfo() {
    return {
        now: new Date().toISOString(),
        started: true,
        over: false,
        start: rules.VOYAGE_START,
        end: rules.VOYAGE_END,
        finalAt: rules.VOYAGE_FINAL_AT,
        chapter: demoChapters[0],
        chapters: demoChapters,
        state: {
            jp: Math.floor(demo.jpCents / 100),
            treasure: Math.floor(demo.treasureCents / 100),
            rolls: demo.rolls,
            wagered: demo.wagered,
            players: demo.rolls > 0 ? 1 : 0,
            lastJp: demo.jpHistory[0] || null,
            jpHistory: demo.jpHistory,
            final: null
        },
        me: {
            pos: demo.pos,
            rolls: demo.rolls,
            wagered: demo.wagered,
            laps: demo.laps,
            jpWon: demo.jpWon,
            bestWin: demo.bestWin,
            last: null
        }
    };
}

/** vgRoll の代わり (functions/index.js の casinoVoyageRoll と同じ順で状態を進める) */
function demoRoll(bet) {
    if (bet !== rules.VOYAGE_BET) throw new Error(`航海の賭け金は ${rules.VOYAGE_BET} で固定です。`);
    if (bet > demo.chips) throw new Error(`手元のチップ (${demo.chips}) を超えて賭けることはできません。`);
    const at = new Date().toISOString();
    const chapter = rules.voyageChapterByNo(1);
    const play = rules.playVoyage({
        chapter, bet, pos: demo.pos, jp: Math.floor(demo.jpCents / 100), lapDebt: demo.lapDebt,
        randomInt: n => Math.floor(Math.random() * n)
    });

    demo.jpCents += bet * rules.VOYAGE_JP_RATE;
    demo.treasureCents += bet * rules.VOYAGE_TREASURE_RATE;
    if (play.jpHit) demo.jpCents = Math.max(0, demo.jpCents - play.jpWon * 100);

    demo.laps += play.laps;
    demo.lapDebt = play.lapDebt;
    demo.wagered += bet;
    demo.pos = play.pos;
    demo.rolls += 1;
    demo.jpWon += play.jpWon;
    demo.bestWin = Math.max(demo.bestWin, play.payout);
    demo.chips = Math.max(0, demo.chips - bet + play.payout);
    if (play.jpHit) demo.jpHistory = [{ player: casino.me, amount: play.jpWon, chapter: chapter.no, at }, ...demo.jpHistory].slice(0, 10);
    const summary = { bet, returned: play.payout, multiplier: play.multiplier, dice: play.dice, square: play.moves[play.moves.length - 1].square, jp: play.jpHit, at };
    demo.recent = [summary, ...demo.recent].slice(0, VG_DEMO_RECENT_LIMIT);

    const result = { id: `demo${demo.rolls}`, bet, chapter: chapter.no, ...play, lapsTotal: demo.laps, at };
    if (demo.chips <= 0) return { result, session: null, settled: { reason: 'broke', demo: true }, voyage: demoVoyageInfo() };
    return { result, session: demoSession(), voyage: demoVoyageInfo() };
}

// ------------------------------------------------------------------
// game.js の代わり (game-voyage.js が呼ぶもの)
// ------------------------------------------------------------------
async function callCasino(action, payload = {}) {
    if (action === 'vgStatus') return { voyage: demoVoyageInfo() };
    if (action === 'vgRoll') return demoRoll(Number(payload.bet));
    throw new Error('デモでは使えません。');
}

function settledMessage(settled) {
    if (!settled) return '';
    return `練習用チップを ${VG_DEMO_CHIPS.toLocaleString('ja-JP')} 足しました (航海の続きはそのまま)。`;
}

/** チップが尽きたとき: 練習用チップを足して続ける */
async function refreshCasino() {
    if (!casino.session) {
        demo.chips += VG_DEMO_CHIPS;
        demo.buyIn += VG_DEMO_CHIPS;
        casino.session = demoSession();
    }
    renderWallet();
    renderVoyageControls();
}

function renderWallet() {
    const net = demo.chips - demo.buyIn;
    el('vg-demo-chips').textContent = demo.chips.toLocaleString('ja-JP');
    const netEl = el('vg-demo-net');
    netEl.textContent = `${net > 0 ? '+' : net < 0 ? '−' : '±'}${Math.abs(net).toLocaleString('ja-JP')}`;
    netEl.dataset.sign = net > 0 ? 'plus' : net < 0 ? 'minus' : 'zero';
    el('vg-demo-rolls').textContent = `${demo.rolls}回`;
}

function setCasinoBusy(busy) {
    casino.busy = busy;
    el('vg-demo-reset').disabled = busy;
    renderVoyageControls();
}

// 本番だけのふるまいを止める: 管理者の欄・「見た章」の記録・共有の分 (Firestore) の読み直し
vgIsMaster = () => false;
vgHasSeen = () => false;
vgMarkSeen = () => {};
pollVoyagePublic = async () => {};

function resetDemo() {
    if (casino.busy || vg.playing || vg.storyOpen) return;
    if (vg.auto) stopVoyageAuto();
    resetDemoState();
    casino.session = demoSession();
    vg.pos = 0;
    receiveVoyage(demoVoyageInfo());
    setVoyageResult('Bon Voyage', 'is-idle');
    el('vg-result-detail').textContent = '';
    setVoyageFace('smile');
    setVoyageStatus('「振る」で出航');
    renderWallet();
    renderVoyageControls();
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        rules = await import('./voyage-rules.js');
    } catch (error) {
        console.error('航海のルール (voyage-rules.js) が読めません:', error);
        el('vg-status').textContent = 'ルールが読み込めませんでした';
        return;
    }
    demoChapters = rules.VOYAGE_CHAPTERS.map(rules.publicVoyageChapter);
    resetDemoState();
    casino.session = demoSession();
    el('vg-demo-jp-seed').textContent = VG_DEMO_JP_SEED.toLocaleString('ja-JP');
    el('vg-demo-reset').addEventListener('click', resetDemo);
    initVoyage();
    receiveVoyage(demoVoyageInfo());
    renderWallet();
    openVoyageTable();
});
