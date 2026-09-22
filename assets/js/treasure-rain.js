// assets/js/treasure-rain.js
// 13時13分のあいだだけ、金銀財宝が画面上部から降ってくる。
// 時刻は端末のローカル時間で判定する (ヘッダーの時計と同じ基準)。

(function () {
    const TREASURE_HOUR = 13;
    const TREASURE_MINUTE = 13;
    const PIECE_COUNT = 56;
    const GEM_COLORS = ['ruby', 'sapphire', 'emerald'];

    // モーション低減を選んでいる人には降らせない
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion && reducedMotion.matches) return;

    let container = null;

    function isTreasureMinute(now = new Date()) {
        return now.getHours() === TREASURE_HOUR && now.getMinutes() === TREASURE_MINUTE;
    }

    function randomBetween(min, max) {
        return min + Math.random() * (max - min);
    }

    function createPiece() {
        const piece = document.createElement('span');

        // 金貨を主役にし、銀貨と宝石を散らす
        const roll = Math.random();
        if (roll < 0.58) {
            piece.className = 'treasure-piece treasure-coin';
        } else if (roll < 0.84) {
            piece.className = 'treasure-piece treasure-coin is-silver';
        } else {
            const gem = GEM_COLORS[Math.floor(Math.random() * GEM_COLORS.length)];
            piece.className = `treasure-piece treasure-gem is-${gem}`;
        }

        const duration = randomBetween(2.6, 5.6);
        piece.style.setProperty('--size', `${randomBetween(12, 30).toFixed(1)}px`);
        piece.style.setProperty('--drift', `${randomBetween(-14, 14).toFixed(1)}vw`);
        piece.style.setProperty('--spin', `${randomBetween(-900, 900).toFixed(0)}deg`);
        piece.style.setProperty('--flip', `${360 * Math.ceil(randomBetween(1, 3))}deg`);
        piece.style.left = `${randomBetween(0, 100).toFixed(2)}%`;
        piece.style.animationDuration = `${duration.toFixed(2)}s`;
        // 負のdelayで途中から始めるので、開始直後から画面全体に降っている状態になる
        piece.style.animationDelay = `-${randomBetween(0, duration).toFixed(2)}s`;

        return piece;
    }

    function start() {
        if (container) return;

        container = document.createElement('div');
        container.className = 'treasure-rain';
        // 装飾なので読み上げず、出席登録などのタップも一切邪魔しない
        container.setAttribute('aria-hidden', 'true');

        const fragment = document.createDocumentFragment();
        for (let i = 0; i < PIECE_COUNT; i++) {
            fragment.appendChild(createPiece());
        }
        container.appendChild(fragment);
        document.body.appendChild(container);
    }

    function stop() {
        if (!container) return;
        container.remove();
        container = null;
    }

    function tick() {
        if (isTreasureMinute()) {
            start();
        } else {
            stop();
        }
    }

    function begin() {
        tick();
        setInterval(tick, 1000);
    }

    // 13:13 を待たずに見た目を確認するための入口。
    // コンソールで qjongTreasureRain.preview() と打つと8秒だけ降る。
    window.qjongTreasureRain = {
        start,
        stop,
        preview(durationMs = 8000) {
            start();
            setTimeout(() => {
                if (!isTreasureMinute()) stop();
            }, durationMs);
        }
    };

    if (document.body) {
        begin();
    } else {
        document.addEventListener('DOMContentLoaded', begin);
    }
}());
