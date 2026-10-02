// assets/js/home-captain.js
// ホームの見出しに公式キャラ (船長) を立たせ、吹き出しでひとこと言わせる。
//   絵は assets/img/captain/stand.png (背景透過。ハロウィンのあいだは halloween.png)。読めないあいだは何も出さない (見出しは今のまま)。
//   時計は真ん中のまま、船長は右下に時計にかからない大きさで立ち、吹き出しは船長の左上 (時計の上の空き) に出す。
//   言うことは main.js が渡すデータ (ランキング・借金・くじ) と manaba の未提出課題の数から作る。
//   航海 (大海賊の航海日誌) の出港の前日〜当日と、新しい章が始まってから VOYAGE_NOTICE_DAYS 日は、その知らせをいちばん先に言う
//   (章の日付と名前は voyage-rules.js = functions/voyage.js の写しから読む)。
//   ROTATE_MS ごとに次のひとことへ。船長か吹き出しをタップしても次へ (見出しのダブルタップの隠し要素には数えない)。

(function () {
    const hero = document.querySelector('header.hero');
    // 出し始める日 (common.js の CAPTAIN_REVEAL_AT) より前は何も出さない
    if (!hero || !isCaptainRevealed()) return;

    const STAND_SRC = captainStandSrc();
    const ROTATE_MS = 9000;
    const MAX_EVENT_LINES = 2;
    const VOYAGE_NOTICE_DAYS = 3;   // 新しい章が始まってから何日、航海の知らせを言うか
    const DAY_MS = 24 * 60 * 60 * 1000;
    // 公式キャラの船長は、航海 (大海賊の航海日誌) の主人公ハクと同じ人物
    const GREETINGS = [
        '今日も一勝負いくか？',
        '宝探しの船長マスに入ったら、ジャックポットのチャンスだ！',
        '成り上がりの最上段、見せてもらおうか！',
        '麻雀の結果は、ちゃんと記録しとけよ！'
    ];

    const wrap = document.createElement('div');
    wrap.className = 'hero-captain';
    wrap.hidden = true;
    const bubble = document.createElement('p');
    bubble.className = 'hero-captain-bubble';
    bubble.setAttribute('aria-live', 'polite');
    const art = document.createElement('img');
    art.className = 'hero-captain-art';
    art.alt = '船長';
    art.draggable = false;
    art.decoding = 'async';
    wrap.append(bubble, art);
    hero.appendChild(wrap);

    const state = {
        scores: [],
        debts: new Map(),
        events: [],
        manaba: 0,
        voyage: '',
        greeting: GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
        lines: [],
        index: 0,
        timer: 0
    };

    function myName() {
        try {
            return localStorage.getItem('authUsername') || '';
        } catch (error) {
            return '';
        }
    }

    function rateText(value) {
        return typeof formatRate === 'function' ? formatRate(value) : Number(value || 0).toLocaleString('ja-JP');
    }

    /** 航海の知らせ (無ければ '')。rules は voyage-rules.js */
    function voyageLine(rules, now = Date.now()) {
        const start = Date.parse(rules.VOYAGE_START);
        if (now < start) {
            if (now < start - 2 * DAY_MS) return '';
            const day = new Date(start).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short' });
            return `${day} 0:00、大海賊の航海日誌が出港するぞ！ ゲームの「航海」で待ってる！`;
        }
        if (rules.isVoyageOver(now)) return '';
        const chapter = rules.voyageChapterAt(now);
        if (!chapter || now - Date.parse(chapter.from) >= VOYAGE_NOTICE_DAYS * DAY_MS) return '';
        if (chapter.no >= 12) return '航海の最終日「冬至の夜」だ！ 今夜、扉が開くぞ！';
        return `航海の第${chapter.no}章「${chapter.title}」が始まったぞ！ 物語を見に来てくれ！`;
    }

    function buildLines() {
        const lines = [];
        if (state.voyage) lines.push(state.voyage);
        const me = myName();
        const ranked = state.scores
            .filter(player => typeof MAHJONG_CPU_NAME === 'undefined' || player.name !== MAHJONG_CPU_NAME)
            .sort((a, b) => b.score - a.score);
        const index = ranked.findIndex(player => player.name === me);
        if (index >= 0) {
            const rank = index + 1;
            const rate = rateText(ranked[index].score);
            if (rank === 1) lines.push(`${me}、いま1位だ！ レート ${rate}。このまま逃げ切れ！`);
            else if (rank === ranked.length) lines.push(`${me}、いま${rank}位だ (レート ${rate})。ここから巻き返すぞ！`);
            else lines.push(`${me}、いま${rank}位だ。レート ${rate}、上を狙え！`);
            const debt = state.debts.get(me) || 0;
            if (debt > 0) lines.push(`借金が ${rateText(debt)} 残ってるぞ。日付が変わると利息が付く！`);
        }
        if (state.manaba > 0) lines.push(`manaba の課題が ${state.manaba}件 残ってるぞ。締切に気をつけろ！`);
        lines.push(...state.events.slice(0, MAX_EVENT_LINES));
        lines.push(state.greeting);
        return lines;
    }

    function show(index) {
        if (!state.lines.length) return;
        state.index = ((index % state.lines.length) + state.lines.length) % state.lines.length;
        const text = state.lines[state.index];
        if (bubble.textContent === text) return;
        bubble.classList.remove('is-changing');
        void bubble.offsetWidth;
        bubble.classList.add('is-changing');
        bubble.textContent = text;
    }

    function schedule() {
        clearInterval(state.timer);
        state.timer = setInterval(() => show(state.index + 1), ROTATE_MS);
    }

    /** データが変わったら言うことを作り直す。いま言っていることが残っていれば、それを出したままにする */
    function refresh() {
        const current = state.lines[state.index];
        state.lines = buildLines();
        const keep = state.lines.indexOf(current);
        show(keep >= 0 ? keep : 0);
    }

    function next(event) {
        // 見出しのダブルタップ (音を鳴らす隠し要素) に数えない
        event.stopPropagation();
        show(state.index + 1);
        schedule();
    }

    art.addEventListener('click', next);
    bubble.addEventListener('click', next);
    art.addEventListener('load', () => {
        wrap.hidden = false;
        refresh();
        schedule();
    });
    art.addEventListener('error', () => wrap.remove());
    art.src = STAND_SRC;
    import('./voyage-rules.js')
        .then(rules => {
            state.voyage = voyageLine(rules);
            if (state.voyage && !wrap.hidden) refresh();
        })
        .catch(error => console.warn('航海のルールが読めません (知らせは出さない):', error));

    window.qjongCaptain = {
        /** main.js から: ランキング・借金・くじ */
        update({ scores = [], loans = null, lotteries = [], sportsBets = [] } = {}) {
            state.scores = [...scores];
            state.debts = typeof buildDebtMap === 'function' ? buildDebtMap(loans) : new Map();
            const now = new Date();
            state.events = [
                ...lotteries
                    .filter(lottery => lottery.status === 'OPEN' && new Date(lottery.purchaseDeadline) > now)
                    .map(lottery => `宝くじ「${lottery.name}」が出てるぞ！ 買うならマイページへ！`),
                ...sportsBets
                    .filter(bet => bet.status === 'OPEN')
                    .map(bet => `スポーツくじ「${bet.matchName}」が開催中だ！`)
            ];
            if (!wrap.hidden) refresh();
        },
        /** main.js から: manaba の未提出課題の数 */
        setManaba(count) {
            state.manaba = Math.max(0, Number(count) || 0);
            if (!wrap.hidden) refresh();
        }
    };
}());
