// ゲームタブの効果音 (assets/audio/)。ファイル名は何の音かがわかる名前にしてある (55.11。一覧は assets/audio/README.md)。
//   スロットのジャックポットタイム突入 / 成り上がりの JP・SJP ボタン・UP・JP と SJP の抽選中 (盤面が止まるまで繰り返す) /
//   宝探しの船長チャンスのカットイン・ジャックポット成功・失敗・抽選中 (5球が出そろうまで繰り返す)・
//   球が出たとき (自分の券のお宝なら当たりの音)・全部の抽選が終わったとき /
//   ブラックジャックでカードを配る。
//   どれも通信や回転のあと (タップの直後ではないとき) に鳴らすので、Web Audio で鳴らす。
//   ブラウザは操作があるまで音を出させないので、最初のタップ・クリック・キーで AudioContext を起こし、
//   そのときに音をまとめて読み込んでおく。読み込めない・鳴らせない環境では何もしない (エラーは出さない)。
//   iPhone はサイレントスイッチがオンだと鳴らない (ブラウザの仕様)。

const GAME_SOUNDS = {
    slotJackpot: 'assets/audio/slot-jackpot-time.mp3',
    nrJpButton: 'assets/audio/nariagari-jp-button.mp3',
    nrSjpButton: 'assets/audio/nariagari-sjp-button.mp3',
    nrUp: 'assets/audio/nariagari-up.mp3',
    gpCaptain: 'assets/audio/gappori-captain-cutin.mp3',
    gpJackpotWin: 'assets/audio/gappori-jackpot-win.mp3',
    gpJackpotMiss: 'assets/audio/gappori-jackpot-miss.mp3',
    bjDeal: 'assets/audio/blackjack-deal.mp3',
    nrJpSpin: 'assets/audio/nariagari-jp-spin-loop.mp3',
    nrSjpSpin: 'assets/audio/nariagari-sjp-spin-loop.mp3',
    gpDrawing: 'assets/audio/gappori-drawing-loop.mp3',
    gpBall: 'assets/audio/gappori-ball.mp3',
    gpBallHit: 'assets/audio/gappori-ball-hit.mp3',
    gpFinish: 'assets/audio/gappori-finish.mp3'
};
// 抽選中に流し続ける音の、繰り返す区間 [始め, 終わり] (秒)。出だしの一打と終わりの余韻は繰り返さない。
// 3つ目に秒数を書いたものは、つなぎ目をその長さで重ねて切り替える (クロスフェード)。区間の端で途切れない
const GAME_SOUND_LOOPS = {
    nrJpSpin: [1.75, 4.2],
    nrSjpSpin: [0.5, 4.0],
    // 宝探しの抽選中: 曲の終わりはフェードアウトと約1秒の無音なので繰り返さない。前半の4小節 (120拍/分で8秒) を、
    // 波形がいちばんよく重なる2点 (重なり 0.97) で繰り返す。mp3 の頭の遅延は読み込み方でずれることがあるので重ねて切り替える
    gpDrawing: [2.255, 10.2548, 0.04]
};
const GAME_SOUND_FADE_MS = 300;   // 流し続ける音を止めるときに小さくしていく長さ
const GAME_SOUND_VOLUME = 0.9;
const GAME_SOUND_LATE_MS = 1500;   // 読み込みが間に合わなかったとき、これより遅れたら鳴らさない (場面とずれるため)

const gameSound = { context: null, buffers: new Map(), loading: null };

function gameSoundContext() {
    if (gameSound.context) return gameSound.context;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    try {
        gameSound.context = new Context();
    } catch (error) {
        return null;
    }
    return gameSound.context;
}

/** 音をまとめて読み込む (1回だけ。読めなかった音はコンソールに出して飛ばす) */
function loadGameSounds() {
    if (gameSound.loading) return gameSound.loading;
    const context = gameSoundContext();
    if (!context) return Promise.resolve();
    gameSound.loading = Promise.all(Object.entries(GAME_SOUNDS).map(async ([name, src]) => {
        try {
            const response = await fetch(src);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.arrayBuffer();
            // 古い Safari は Promise を返さないので、コールバックの形で呼ぶ
            const buffer = await new Promise((resolve, reject) => context.decodeAudioData(data, resolve, reject));
            gameSound.buffers.set(name, buffer);
        } catch (error) {
            console.warn(`効果音 ${src} を読み込めませんでした:`, error);
        }
    }));
    return gameSound.loading;
}

/**
 * 操作のたびに、止まっていれば音を出せる状態に戻す (最初の1回と、アプリを裏に回して止まったとき)。
 * iPhone は操作の中で何か鳴らさないと起きないことがあるので、無音を一瞬だけ鳴らす
 */
function unlockGameSound() {
    const context = gameSoundContext();
    if (!context) return;
    if (context.state !== 'running') {
        context.resume().catch(() => {});
        try {
            const source = context.createBufferSource();
            source.buffer = context.createBuffer(1, 1, 22050);
            source.connect(context.destination);
            source.start(0);
        } catch (error) {
            // 鳴らせなくても次の操作でまた試す
        }
    }
    loadGameSounds();
}

['pointerdown', 'touchend', 'keydown'].forEach(type => {
    document.addEventListener(type, unlockGameSound, { capture: true, passive: true });
});

/**
 * 区間 [loopStart, loopEnd] を、つなぎ目を crossfade 秒だけ重ねながら繰り返す (出だしから鳴らす)。
 * 1回ごとに新しい再生を少し先に予約し、前の回の終わりを小さく・次の回の頭を大きくして入れ替える。止める関数を返す
 */
function startCrossfadeLoop(context, buffer, volume, loopStart, loopEnd, crossfade) {
    const master = context.createGain();
    master.gain.value = volume;
    master.connect(context.destination);
    const playing = new Set();
    let timer = null;
    let stopped = false;
    // offset から loopEnd まで鳴らす1回ぶん。頭 (offset > 0 のとき) と終わりを crossfade 秒で上げ下げする
    const schedule = (when, offset) => {
        const source = context.createBufferSource();
        source.buffer = buffer;
        const gain = context.createGain();
        const length = loopEnd - offset;
        if (offset > 0) {
            gain.gain.setValueAtTime(0, when);
            gain.gain.linearRampToValueAtTime(1, when + crossfade);
        } else {
            gain.gain.setValueAtTime(1, when);
        }
        gain.gain.setValueAtTime(1, when + length - crossfade);
        gain.gain.linearRampToValueAtTime(0, when + length);
        source.connect(gain);
        gain.connect(master);
        source.start(when, offset, length);
        playing.add(source);
        source.onended = () => playing.delete(source);
        return when + length - crossfade;   // 次の回を始める時刻 (この回の終わりの crossfade 秒前)
    };
    let nextAt = schedule(context.currentTime + 0.02, 0);
    const offset = Math.max(0, loopStart - crossfade);
    // 次の回は、始まる1秒前までに予約しておく
    const pump = () => {
        if (stopped) return;
        while (nextAt - context.currentTime < 1.5) nextAt = schedule(nextAt, offset);
        timer = setTimeout(pump, 500);
    };
    pump();
    return () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        const now = context.currentTime;
        const fade = GAME_SOUND_FADE_MS / 1000;
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0, now + fade);
        playing.forEach(source => {
            try { source.stop(now + fade + 0.05); } catch (error) { /* もう止まっている */ }
        });
    };
}

/**
 * 止めるまで流し続ける (出だしから鳴らし、GAME_SOUND_LOOPS の区間を繰り返す)。
 * 返した関数を呼ぶと、GAME_SOUND_FADE_MS で小さくして止める。鳴らせないときは何もしない関数を返す
 */
function startGameSoundLoop(name, volume = GAME_SOUND_VOLUME) {
    const context = gameSound.context;
    const buffer = gameSound.buffers.get(name);
    if (!context || !buffer) return () => {};
    if (context.state !== 'running') context.resume().catch(() => {});
    try {
        const [loopStartRaw, loopEndRaw, crossfade] = GAME_SOUND_LOOPS[name] || [0, buffer.duration];
        if (crossfade) {
            return startCrossfadeLoop(context, buffer, volume, loopStartRaw, Math.min(loopEndRaw, buffer.duration), crossfade);
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        const [loopStart, loopEnd] = [loopStartRaw, loopEndRaw];
        source.loop = true;
        source.loopStart = loopStart;
        source.loopEnd = Math.min(loopEnd, buffer.duration);
        const gain = context.createGain();
        gain.gain.value = volume;
        source.connect(gain);
        gain.connect(context.destination);
        source.start(0);
        let stopped = false;
        return () => {
            if (stopped) return;
            stopped = true;
            const now = context.currentTime;
            const fade = GAME_SOUND_FADE_MS / 1000;
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.linearRampToValueAtTime(0, now + fade);
            source.stop(now + fade + 0.05);
        };
    } catch (error) {
        console.warn(`効果音 ${name} を流せませんでした:`, error);
        return () => {};
    }
}

/** 効果音を鳴らす。まだ一度も操作が無い・読めなかったときは鳴らさない */
function playGameSound(name, volume = GAME_SOUND_VOLUME) {
    const context = gameSound.context;
    if (!context || !Object.hasOwn(GAME_SOUNDS, name)) return;
    if (context.state !== 'running') context.resume().catch(() => {});
    const play = buffer => {
        try {
            const source = context.createBufferSource();
            source.buffer = buffer;
            const gain = context.createGain();
            gain.gain.value = volume;
            source.connect(gain);
            gain.connect(context.destination);
            source.start(0);
        } catch (error) {
            console.warn(`効果音 ${name} を鳴らせませんでした:`, error);
        }
    };
    const buffer = gameSound.buffers.get(name);
    if (buffer) {
        play(buffer);
        return;
    }
    const askedAt = performance.now();
    loadGameSounds().then(() => {
        const loaded = gameSound.buffers.get(name);
        if (loaded && performance.now() - askedAt < GAME_SOUND_LATE_MS) play(loaded);
    });
}
