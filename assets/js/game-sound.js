// ゲームタブの効果音 (assets/audio/)。
//   スロットのジャックポットタイム突入 a.mp3 / 成り上がりの JP ボタン b.mp3・SJP ボタン c.mp3・UP d.mp3 /
//   宝探しの船長チャンスのカットイン e.mp3・ジャックポット成功 g.mp3・失敗 h.mp3 / ブラックジャックでカードを配る f.mp3 /
//   成り上がりの JP (第4弾) の抽選中 1.mp3・SJP (第5弾) の抽選中 2.mp3 (盤面が止まるまで繰り返す)。
//   どれも通信や回転のあと (タップの直後ではないとき) に鳴らすので、Web Audio で鳴らす。
//   ブラウザは操作があるまで音を出させないので、最初のタップ・クリック・キーで AudioContext を起こし、
//   そのときに音をまとめて読み込んでおく。読み込めない・鳴らせない環境では何もしない (エラーは出さない)。
//   iPhone はサイレントスイッチがオンだと鳴らない (ブラウザの仕様)。

const GAME_SOUNDS = {
    slotJackpot: 'assets/audio/a.mp3',
    nrJpButton: 'assets/audio/b.mp3',
    nrSjpButton: 'assets/audio/c.mp3',
    nrUp: 'assets/audio/d.mp3',
    gpCaptain: 'assets/audio/e.mp3',
    gpJackpotWin: 'assets/audio/g.mp3',
    gpJackpotMiss: 'assets/audio/h.mp3',
    bjDeal: 'assets/audio/f.mp3',
    nrJpSpin: 'assets/audio/1.mp3',
    nrSjpSpin: 'assets/audio/2.mp3'
};
// 抽選中に流し続ける音の、繰り返す区間 [始め, 終わり] (秒)。出だしの一打と終わりの余韻は繰り返さない
const GAME_SOUND_LOOPS = {
    nrJpSpin: [1.75, 4.2],
    nrSjpSpin: [0.5, 4.0]
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
 * 止めるまで流し続ける (出だしから鳴らし、GAME_SOUND_LOOPS の区間を繰り返す)。
 * 返した関数を呼ぶと、GAME_SOUND_FADE_MS で小さくして止める。鳴らせないときは何もしない関数を返す
 */
function startGameSoundLoop(name, volume = GAME_SOUND_VOLUME) {
    const context = gameSound.context;
    const buffer = gameSound.buffers.get(name);
    if (!context || !buffer) return () => {};
    if (context.state !== 'running') context.resume().catch(() => {});
    try {
        const source = context.createBufferSource();
        source.buffer = buffer;
        const [loopStart, loopEnd] = GAME_SOUND_LOOPS[name] || [0, buffer.duration];
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
