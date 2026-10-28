// ゲームタブ: 早押しクイズ (61.0〜。全員共通の1卓・最大6席。データベース工学の中間テスト対策)
// 問題・早押しの順番・採点・レートの増減は Cloud Function (casino の qzJoin / qzReady / qzBuzz / qzAnswer など) が決める。
// ほかの人の操作は、誰でも読める卓の写し (quiz_public/main) を読み直して反映する。答えと解説は結果が出るまで届かない。
// 締め切り (受付・早押し・解答・結果の表示) を過ぎたら、画面を開いている人が qzTick を送って先へ進める。
// 見た目は testsite.html (日本茶・和紙・青海波) を引き継ぐ: 掛軸に問題、座布団の席、湯呑みの時計、
// 正解は茶柱が立って「正解」の印、不正解は水面の波紋と「不正解」の印。
// 選択肢は最初から出し、問題文は openAt から charMs (0.1秒) ごとに1文字ずつ出す (サーバーの時刻で数えるので全員そろう)。
// 誰かが押したら、その時点で問題文を止める (サーバーが shown に残す)。間違えて次の人が押せるようになったら続きから出す。
// ジャンルは1戦ごとにデータベース工学と雑学を交互に出し、全員が「スキップ」を押すと次のジャンルへ移る (61.1〜)。

const QUIZ_POLL_MS = 900;           // 卓を読み直す間隔 (早押しなのでブラックジャックより短く)
const QUIZ_CHOICE_KEYS = ['A', 'B', 'C', 'D'];
const QUIZ_FONT_URL = 'https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;700;900&display=swap';

const quiz = {
    table: null,        // 最後に受け取った卓 (公開の形)
    offset: 0,          // サーバーの時刻 − 端末の時刻
    pollTimer: null,
    clockTimer: null,
    polling: false,
    busy: false,
    ticked: '',         // qzTick を送った締め切り (同じ締め切りに何度も送らない)
    seenQuestion: null, // 描いた問題の番号 (新しい問題が来たら筆で書くように出す)
    seenOutcome: null,  // 結果を見せた問題の番号
    seenMatch: null,    // 番付を見せた1戦の番号 (開いたときに出ていた1戦の番付は見せない)
    pendingChoice: null, // 解答を送っている途中の選択肢
    typed: -1,          // いま出している問題文の文字数 (1文字ずつ出す)
    typeTimer: null,
    seenSkip: null      // 知らせたジャンルのスキップ (lastSkip.at)
};

const EMPTY_QUIZ_TABLE = { phase: 'lobby', seq: -1, seats: Array(6).fill(null), match: null, question: null, lastMatch: null };

// ------------------------------------------------------------------
// 卓の読み方
// ------------------------------------------------------------------
function isQuizRoute() {
    return location.hash.slice(1) === 'quiz';
}

function quizMe() {
    return casino.me || localStorage.getItem('authUsername') || '';
}

function quizMySeat(table = quiz.table) {
    return table ? table.seats.findIndex(seat => seat && seat.name === quizMe()) : -1;
}

/** いまの1戦に参加している */
function isQuizPlayer(table = quiz.table) {
    return Boolean(table?.match?.participants.some(player => player.name === quizMe() && !player.left));
}

function quizServerNow() {
    return Date.now() + quiz.offset;
}

function applyQuizClock(iso) {
    const server = Date.parse(iso);
    if (Number.isFinite(server)) quiz.offset = server - Date.now();
}

function quizMsLeft(iso) {
    return iso ? Math.max(0, Date.parse(iso) - quizServerNow()) : 0;
}

function quizSigned(value) {
    const n = Math.round(Number(value) || 0);
    return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}`;
}

/** いま押せるか (参加者で、早押しの受付中で、まだこの問題で押していない) */
function canQuizBuzz(table = quiz.table) {
    const question = table?.question;
    if (!question || table.phase !== 'question' || !isQuizPlayer(table)) return false;
    if (quizServerNow() < Date.parse(question.openAt)) return false;
    return !question.buzzes.some(buzz => buzz.name === quizMe()) && question.buzzes.length < 2;
}

function isMyQuizAnswer(table = quiz.table) {
    return table?.phase === 'answering' && table.question?.answerer === quizMe();
}

/** ゲーム一覧のタイル */
function renderQuizTile() {
    const live = el('qz-tile-live');
    if (!live) return;
    const table = quiz.table;
    const seated = table ? table.seats.filter(Boolean).length : 0;
    live.textContent = !table ? '' : table.match ? `1戦の途中 (${table.match.index + 1}/${table.match.total}問)` : seated ? `いま卓に${seated}人` : '卓は空いています';
    live.classList.toggle('is-busy', seated > 0);
}

function quizTileBadge() {
    return isQuizPlayer() ? '参加中' : '';
}

// ------------------------------------------------------------------
// 音 (ファイルを使わず Web Audio で鳴らす。鳴らせない環境では何もしない)
// ------------------------------------------------------------------
function playQuizTone(kind) {
    const context = typeof gameSoundContext === 'function' ? gameSoundContext() : null;
    if (!context || context.state !== 'running') return;
    const notes = {
        buzz: [[988, 0, 0.09], [1319, 0.09, 0.22]],          // ピンポン
        correct: [[784, 0, 0.12], [988, 0.1, 0.12], [1319, 0.2, 0.35]],
        wrong: [[196, 0, 0.45]],                             // ブー
        timeout: [[440, 0, 0.18], [330, 0.18, 0.3]],
        open: [[660, 0, 0.08]]
    }[kind] || [];
    const start = context.currentTime + 0.01;
    notes.forEach(([frequency, at, length]) => {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = kind === 'wrong' ? 'square' : 'sine';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start + at);
        gain.gain.exponentialRampToValueAtTime(kind === 'wrong' ? 0.08 : 0.18, start + at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
        osc.connect(gain).connect(context.destination);
        osc.start(start + at);
        osc.stop(start + at + length + 0.05);
    });
}

// ------------------------------------------------------------------
// 描く
// ------------------------------------------------------------------
function quizSeatState(view, seat) {
    const question = view.question;
    if (!seat.inMatch) return view.match ? { label: '次の1戦から', tone: 'idle' } : seat.ready ? { label: '参加', tone: 'ready' } : { label: '待機', tone: 'idle' };
    if (question?.answerer === seat.name) return { label: '解答中', tone: 'answering' };
    const buzz = question?.buzzes.find(item => item.name === seat.name);
    if (buzz && buzz.correct === true) return { label: '正解', tone: 'correct' };
    if (buzz && buzz.correct === false) return { label: '不正解', tone: 'wrong' };
    return { label: '参加中', tone: 'playing' };
}

function renderQuizSeats(view) {
    const list = el('qz-seats');
    view.seats.forEach((seat, index) => {
        // 席の要素は作り直さず中身だけ入れ替える (浮かべている増減と押したときの灯りを消さないため)
        const li = list.children[index] || list.appendChild(document.createElement('li'));
        li.className = `qz-seat${li.classList.contains('is-buzzed') ? ' is-buzzed' : ''}`;
        li.dataset.seat = String(index);
        delete li.dataset.tone;
        [...li.children].forEach(child => { if (!child.classList.contains('qz-float')) child.remove(); });
        if (!seat) {
            li.classList.add('is-empty');
            const label = document.createElement('span');
            label.className = 'qz-seat-empty';
            label.textContent = `${index + 1}番 空席`;
            li.appendChild(label);
            if (quizMySeat(view) < 0 && casino.session) {
                const sit = document.createElement('button');
                sit.type = 'button';
                sit.className = 'qz-seat-sit';
                sit.dataset.qzSit = String(index);
                sit.textContent = 'ここに座る';
                sit.disabled = quiz.busy;
                li.appendChild(sit);
            }
            return;
        }
        const state = quizSeatState(view, seat);
        li.dataset.tone = state.tone;
        li.classList.toggle('is-me', seat.name === quizMe());
        const lamp = document.createElement('span');
        lamp.className = 'qz-seat-lamp';
        lamp.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.className = 'qz-seat-name';
        name.textContent = seat.name;
        const rate = document.createElement('span');
        rate.className = 'qz-seat-rate';
        rate.textContent = formatRate(seat.chips);
        const chip = document.createElement('span');
        chip.className = 'qz-seat-state';
        chip.textContent = state.label;
        li.append(lamp, name, rate, chip);
        if (seat.skip) {
            const skip = document.createElement('span');
            skip.className = 'qz-seat-skip';
            skip.textContent = 'スキップ';
            li.appendChild(skip);
        }
        if (seat.inMatch) {
            const delta = document.createElement('span');
            delta.className = `qz-seat-delta ${seat.delta > 0 ? 'is-plus' : seat.delta < 0 ? 'is-minus' : ''}`;
            delta.textContent = quizSigned(seat.delta);
            li.appendChild(delta);
        }
    });
}

/**
 * 問題文をいま何文字まで出すか (出題前は -1)。サーバー (quiz-table.js の quizTypedCount) と同じ数え方。
 * 押されて止めているあいだと結果では shown の文字数
 */
function quizTypedCount(view) {
    const question = view?.question;
    if (!question) return 0;
    const length = question.chars ?? [...question.text].length;
    if (question.shown !== null && question.shown !== undefined) return question.shown;
    const from = Date.parse(question.typeFrom || question.openAt);
    const base = question.typeBase || 0;
    const now = quizServerNow();
    if (now < from) return base > 0 ? base : -1;
    return Math.min(length, base + Math.floor((now - from) / (view.charMs || 100)) + 1);
}

/** 問題文を count 文字まで書く。止めているあいだは止めた印を付ける */
function writeQuizText(question, count) {
    const text = el('qz-question');
    const length = question.chars ?? [...question.text].length;
    const paused = question.shown !== null && question.shown !== undefined && count < length;
    text.textContent = [...question.text].slice(0, Math.max(0, count)).join('');
    text.classList.toggle('is-typing', !paused && count < length);
    text.classList.toggle('is-paused', paused);
}

/** 問題文を1文字ずつ出す (こまめに数え直し、増えたときだけ書き換える) */
function typeQuizQuestion() {
    const view = quiz.table;
    const question = view?.question;
    if (!question || !isQuizRoute()) return;
    const count = quizTypedCount(view);
    if (count === quiz.typed || count < 0) return;
    quiz.typed = count;
    el('qz-question').classList.remove('is-waiting');
    writeQuizText(question, count);
}

function renderQuizQuestion(view, fresh) {
    const question = view.question;
    const scroll = el('qz-scroll');
    const text = el('qz-question');
    const choices = el('qz-choices');
    const tags = el('qz-tags');
    const explain = el('qz-explain');
    const waiting = question && quizServerNow() < Date.parse(question.openAt);
    scroll.dataset.phase = view.phase;
    el('qz-progress').textContent = view.match ? `第${view.match.index + 1}問 / ${view.match.total}` : '受付中';
    el('qz-lecture').textContent = question ? question.lecture : '';

    if (!question) {
        text.textContent = view.lastMatch && !view.seats.some(seat => seat?.ready)
            ? '一戦おつかれさまでした。「参加する」で次の1戦へ'
            : '席に座って「参加する」を押すと1戦が始まります';
        text.classList.remove('is-brush');
        choices.innerHTML = '';
        tags.innerHTML = '';
        explain.classList.add('hidden');
        return;
    }
    const typed = quizTypedCount(view);
    text.classList.remove('is-brush');
    if (waiting) {
        text.textContent = '出題します…';
        text.classList.remove('is-typing', 'is-paused');
    } else {
        writeQuizText(question, typed);
    }
    text.classList.toggle('is-waiting', Boolean(waiting));
    quiz.typed = typed;
    tags.innerHTML = '';
    if (!waiting) {
        question.tags.forEach(tag => {
            const span = document.createElement('span');
            span.className = 'qz-tag';
            span.textContent = tag;
            tags.appendChild(span);
        });
    }

    const mine = isMyQuizAnswer(view);
    const revealed = view.phase === 'result' && question.answer !== null;
    choices.innerHTML = '';
    choices.classList.toggle('is-answering', mine);
    // 選択肢は出題の最初から出す (問題文は1文字ずつ)
    {
        question.choices.forEach((choice, index) => {
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'qz-choice';
            button.dataset.qzChoice = String(index);
            button.disabled = !mine || quiz.busy;
            const key = document.createElement('span');
            key.className = 'qz-choice-key';
            key.textContent = QUIZ_CHOICE_KEYS[index];
            const body = document.createElement('span');
            body.className = 'qz-choice-text';
            body.textContent = choice;
            button.append(key, body);
            const picked = question.buzzes.filter(buzz => buzz.choice === index);
            picked.forEach(buzz => {
                const who = document.createElement('span');
                who.className = `qz-choice-who ${buzz.correct ? 'is-correct' : 'is-wrong'}`;
                who.textContent = buzz.name;
                button.appendChild(who);
            });
            if (picked.some(buzz => buzz.correct === false)) button.classList.add('is-wrong');
            if (revealed && index === question.answer) button.classList.add('is-correct');
            if (quiz.pendingChoice === index && mine) button.classList.add('is-pending');
            li.appendChild(button);
            choices.appendChild(li);
        });
    }

    explain.classList.toggle('hidden', !revealed);
    if (revealed) {
        explain.innerHTML = '';
        const head = document.createElement('strong');
        head.textContent = `正解 ${QUIZ_CHOICE_KEYS[question.answer]}: ${question.choices[question.answer]}`;
        const body = document.createElement('p');
        body.textContent = question.explanation || '';
        explain.append(head, body);
    }
}

/** 正解・不正解・時間切れの印を押す (落款のように) */
function stampQuiz(kind, text) {
    const stamp = el('qz-stamp');
    stamp.className = `qz-stamp is-${kind}`;
    stamp.textContent = text;
    void stamp.offsetWidth;
    stamp.classList.add('is-show');
    clearTimeout(stamp._timer);
    stamp._timer = setTimeout(() => stamp.classList.add('hidden'), 2600);
}

/** 席の上にレートの増減を浮かべる */
function floatQuizDelta(name, delta) {
    if (!delta) return;
    const index = quiz.table?.seats.findIndex(seat => seat && seat.name === name);
    const seat = index >= 0 ? document.querySelector(`#qz-seats .qz-seat[data-seat="${index}"]`) : null;
    if (!seat) return;
    const float = document.createElement('span');
    float.className = `qz-float ${delta > 0 ? 'is-plus' : 'is-minus'}`;
    float.textContent = quizSigned(delta);
    seat.appendChild(float);
    setTimeout(() => float.remove(), 1800);
}

/** 席の人が押したとき、座布団の灯りと波紋 */
function flashQuizSeat(name) {
    const index = quiz.table?.seats.findIndex(seat => seat && seat.name === name);
    const seat = index >= 0 ? document.querySelector(`#qz-seats .qz-seat[data-seat="${index}"]`) : null;
    if (!seat) return;
    seat.classList.remove('is-buzzed');
    void seat.offsetWidth;
    seat.classList.add('is-buzzed');
}

function showQuizRanking(lastMatch) {
    const list = el('qz-ranking-list');
    list.innerHTML = '';
    lastMatch.ranking.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = item.name === quizMe() ? 'is-me' : '';
        li.style.animationDelay = `${0.25 + index * 0.12}s`;
        const rank = document.createElement('span');
        rank.className = 'qz-rank-no';
        rank.textContent = `${index + 1}`;
        const name = document.createElement('span');
        name.className = 'qz-rank-name';
        name.textContent = item.name + (item.left ? ' (途中で退席)' : '');
        const score = document.createElement('span');
        score.className = 'qz-rank-score';
        score.textContent = `${item.correct}正解 ${item.wrong}誤答`;
        const delta = document.createElement('strong');
        delta.className = item.delta > 0 ? 'is-plus' : item.delta < 0 ? 'is-minus' : '';
        delta.textContent = quizSigned(item.delta);
        li.append(rank, name, score, delta);
        list.appendChild(li);
    });
    el('qz-ranking').classList.remove('hidden');
}

/** 届いた卓 (view) と前の卓 (previous) を比べて、動き (押された・結果・1戦の終わり) を付ける。描いたあとに呼ぶ */
function animateQuizChanges(view, previous) {
    const question = view.question;
    const before = question && previous?.question?.no === question.no ? previous.question.buzzes : [];
    if (question && question.buzzes.length > before.length) {
        question.buzzes.slice(before.length).forEach(buzz => flashQuizSeat(buzz.name));
        playQuizTone('buzz');
    }
    // 1人目が間違えたとき (結果の前)
    if (question && view.phase !== 'result') {
        question.buzzes.forEach((buzz, index) => {
            if (buzz.correct === false && before[index]?.correct !== false) {
                stampQuiz('wrong', '不正解');
                playQuizTone('wrong');
                floatQuizDelta(buzz.name, buzz.delta);
            }
        });
    }
    if (question && view.phase === 'result' && quiz.seenOutcome !== question.no) {
        quiz.seenOutcome = question.no;
        if (question.outcome === 'correct') {
            const winner = question.buzzes[question.buzzes.length - 1];
            stampQuiz('correct', '正解');
            el('qz-scroll').classList.remove('is-chabashira');
            void el('qz-scroll').offsetWidth;
            el('qz-scroll').classList.add('is-chabashira');
            playQuizTone('correct');
            floatQuizDelta(winner.name, winner.delta);
        } else if (question.outcome === 'timeout') {
            stampQuiz('timeout', '時間切れ');
            playQuizTone('timeout');
            view.seats.forEach(seat => { if (seat?.inMatch) floatQuizDelta(seat.name, question.timeout); });
        } else {
            const last = question.buzzes[question.buzzes.length - 1];
            if (last && before[question.buzzes.length - 1]?.correct !== false) {
                stampQuiz('wrong', '不正解');
                playQuizTone('wrong');
                floatQuizDelta(last.name, last.delta);
            }
        }
    }
    if (view.lastSkip && quiz.seenSkip !== view.lastSkip.at) {
        quiz.seenSkip = view.lastSkip.at;
        const genre = (view.genres || []).find(item => item.key === view.lastSkip.genre);
        stampQuiz('skip', '次へ');
        showMessage(el('qz-message'), `全員がスキップしたので、ジャンルを「${genre ? genre.name : ''}」に変えました。`, 'info');
    }
    if (view.lastMatch && quiz.seenMatch !== view.lastMatch.no && !view.match) {
        const played = view.lastMatch.ranking.some(item => item.name === quizMe());
        if (played) {
            showQuizRanking(view.lastMatch);
            // 最近の1戦とレートを取り直す (この画面の操作で終わったとは限らないため)
            refreshQuizStatus();
        }
        quiz.seenMatch = view.lastMatch.no;
    }
}

function renderQuiz() {
    const view = quiz.table || EMPTY_QUIZ_TABLE;
    const fresh = Boolean(view.question) && quiz.seenQuestion !== view.question.no;
    renderQuizSeats(view);
    renderQuizQuestion(view, fresh);
    if (fresh) {
        quiz.seenQuestion = view.question.no;
        quiz.pendingChoice = null;
        el('qz-ranking').classList.add('hidden');
    }
    el('qz-subject').textContent = view.match ? view.subject : `次の1戦: ${view.subject || 'データベース工学'}`;
    el('qz-count').textContent = String(view.questionCount || 0);
    if (view.match) el('qz-match-size').textContent = String(view.match.total);
    renderQuizControls();
    renderQuizStatus();
    renderQuizTile();
}

/** 受け取った卓を反映する (古いものは捨てる) */
function receiveQuizTable(table, now) {
    if (now) applyQuizClock(now);
    if (!table) return;
    if (quiz.table && (table.seq ?? 0) < (quiz.table.seq ?? 0)) return;
    if (quiz.table && table.seq === quiz.table.seq && table.updatedAt === quiz.table.updatedAt) return;
    const first = !quiz.table;
    if (first) {
        // 開いたときに出ていた問題・結果・番付は、動きを付けずにそのまま出す
        quiz.seenQuestion = table.question ? table.question.no : null;
        quiz.seenOutcome = table.phase === 'result' && table.question ? table.question.no : null;
        quiz.seenMatch = table.lastMatch ? table.lastMatch.no : 0;
        quiz.seenSkip = table.lastSkip ? table.lastSkip.at : null;
    }
    const previous = quiz.table;
    quiz.table = table;
    if (!isQuizRoute()) {
        renderQuizTile();
        return;
    }
    renderQuiz();
    if (!first) animateQuizChanges(table, previous);
}

function renderQuizStatus() {
    const status = el('qz-status');
    const view = quiz.table;
    const timer = el('qz-timer');
    const tea = el('qz-timer-tea');
    const num = el('qz-timer-num');
    if (!view) {
        status.textContent = '';
        return;
    }
    const question = view.question;
    let text = '';
    let left = 0;
    let total = 0;
    let tone = '';
    const timing = view.timing || { lobbyMs: 15000, questionMs: 20000, answerMs: 10000, resultMs: 6000 };
    if (view.phase === 'lobby') {
        const seated = view.seats.filter(Boolean).length;
        const ready = view.seats.filter(seat => seat?.ready).length;
        if (view.lobbyEndsAt) {
            left = quizMsLeft(view.lobbyEndsAt);
            total = timing.lobbyMs;
            text = `${ready}/${seated}人が参加 — ${Math.ceil(left / 1000)}秒後に始めます (全員そろえばすぐ)`;
        } else {
            text = seated ? `受付中 (${seated}人) — 「参加する」を押すと始まります` : '卓は空いています。座ると1戦に参加できます。';
        }
    } else if (question && quizServerNow() < Date.parse(question.openAt)) {
        text = `第${view.match.index + 1}問 — まもなく出題`;
        tone = 'intro';
    } else if (view.phase === 'question') {
        left = quizMsLeft(question.endsAt);
        total = question.buzzes.length ? Math.max(left, 8000) : timing.questionMs;
        const second = question.buzzes.length === 1;
        text = isQuizPlayer(view)
            ? canQuizBuzz(view) ? (second ? 'もう1人だけ解答できます (正解 +5)。わかったら早押し！' : 'わかったら早押し！ (Space)') : '解答の権利はありません。ほかの人を待っています'
            : second ? 'もう1人だけ解答できます' : '早押し受付中';
        tone = 'open';
    } else if (view.phase === 'answering') {
        left = quizMsLeft(question.answerEndsAt);
        total = timing.answerMs;
        text = isMyQuizAnswer(view) ? `あなたの解答です — ${Math.ceil(left / 1000)}秒以内に選んでください (A〜D)` : `${question.answerer} さんが解答中…`;
        tone = isMyQuizAnswer(view) ? 'mine' : 'answering';
    } else if (view.phase === 'result') {
        left = quizMsLeft(view.resultEndsAt);
        total = timing.resultMs;
        const winner = question?.buzzes.find(buzz => buzz.correct);
        text = question?.outcome === 'correct' ? `${winner?.name} さんが正解 (${quizSigned(winner?.delta)})`
            : question?.outcome === 'timeout' ? `誰も答えず打ち切り — 参加者全員 ${quizSigned(question.timeout)}`
                : '正解者なし';
        text += view.match && view.match.index + 1 >= view.match.total ? ' — まもなく1戦の結果' : ' — まもなく次の問題';
    }
    status.textContent = text;
    status.dataset.tone = tone;
    const showTimer = total > 0 && left > 0;
    timer.classList.toggle('is-hidden', !showTimer);
    timer.dataset.tone = view.phase;
    if (showTimer) {
        tea.style.transform = `scaleY(${Math.min(1, left / total)})`;
        num.textContent = String(Math.ceil(left / 1000));
        timer.classList.toggle('is-hurry', left <= 5000 && view.phase !== 'result');
    }
    // 出題の待ち時間が明けたら1文字ずつ出し始める
    if (question && view.phase === 'question' && el('qz-question').classList.contains('is-waiting') && quizServerNow() >= Date.parse(question.openAt)) {
        typeQuizQuestion();
        playQuizTone('open');
    }
    renderQuizBuzz();
}

function renderQuizBuzz() {
    const view = quiz.table;
    const buzz = el('qz-buzz');
    const show = Boolean(view?.question) && isQuizPlayer(view) && ['question', 'answering'].includes(view.phase);
    buzz.classList.toggle('hidden', !show);
    buzz.disabled = quiz.busy || !canQuizBuzz(view);
    buzz.classList.toggle('is-live', !buzz.disabled);
}

function renderQuizControls() {
    const view = quiz.table || EMPTY_QUIZ_TABLE;
    const index = quizMySeat(view);
    const seat = index >= 0 ? view.seats[index] : null;
    const lobby = view.phase === 'lobby';
    const full = view.seats.every(Boolean);
    const locked = quiz.busy || !casino.session;
    el('qz-sit-button').classList.toggle('hidden', Boolean(seat) || !casino.session);
    el('qz-sit-button').disabled = locked || full;
    el('qz-sit-button').textContent = full ? '満席です' : '席に座る';
    el('qz-ready-button').classList.toggle('hidden', !seat || !lobby || seat.ready);
    el('qz-ready-button').disabled = locked;
    el('qz-unready-button').classList.toggle('hidden', !seat || !lobby || !seat.ready);
    el('qz-unready-button').disabled = locked;
    // ジャンルのスキップ (受付中は座っている人、1戦の途中は参加者)
    const voters = view.match ? view.match.participants.filter(player => !player.left) : view.seats.filter(Boolean);
    const canSkip = view.match ? isQuizPlayer(view) : Boolean(seat);
    const skipped = voters.some(player => player.name === quizMe() && player.skip);
    const votes = voters.filter(player => player.skip).length;
    const other = (view.genres || []).find(genre => genre.key !== (view.match ? view.genre : view.nextGenre));
    const skipButton = el('qz-skip-button');
    skipButton.classList.toggle('hidden', !canSkip);
    skipButton.disabled = locked;
    skipButton.classList.toggle('is-on', skipped);
    skipButton.textContent = skipped
        ? `スキップを取り消す (${votes}/${voters.length})`
        : `ジャンルをスキップ${other ? ` → ${other.name}` : ''} (${votes}/${voters.length})`;
    el('qz-leave-button').classList.toggle('hidden', !seat);
    el('qz-leave-button').disabled = locked || isMyQuizAnswer(view);
    document.querySelectorAll('#qz-seats [data-qz-sit]').forEach(button => { button.disabled = locked; });
    renderQuizBuzz();
}

function renderQuizRules() {
    const rewards = quiz.table?.rewards || { first: 10, second: 5, wrong: -15, timeout: -5 };
    const items = [
        '最大6人。席に座って「参加する」を押した人で1戦 (5問) を行う。全員が押すとすぐ、誰かが押してから15秒で始まる。',
        '「参加する」を押さないまま1戦が始まった人は、席から外れる (座ったままいなくなった人が残らないように)。',
        `問題が出たら早押し。押した人だけが4択から選べる (10秒)。1番目の正解 ${quizSigned(rewards.first)}・2番目の正解 ${quizSigned(rewards.second)}・不正解 (時間切れも) ${quizSigned(rewards.wrong)}。`,
        '1番目が間違えたら、まだ押していない人がもう1人だけ解答できる。',
        '選択肢は最初から出て、問題文は0.1秒ごとに1文字ずつ出る。出ている途中でも早押しでき、押した時点で問題文は止まる (解答する人も、止まったところまでで答える)。',
        '1番目が間違えたら、止まったところから問題文の続きが出る。全文は結果のときに出る。',
        `問題文が全部出てから20秒たっても誰も押さなければ打ち切りで、参加者全員 ${quizSigned(rewards.timeout)}。`,
        'レートは1問ごとにその場で動く。1日のプレイ回数には数えない。',
        'ジャンルは1戦ごとに「データベース工学」(第1〜6回の理解確認問題) と「雑学」(200問) を交互に出す。',
        '「ジャンルをスキップ」を全員が押すと次のジャンルへ移る (受付中は座っている全員、1戦の途中は参加者全員。途中なら決着していない問題は採点せずに次のジャンルの問題に替わる)。',
        '正解と解説は結果のときに出る。'
    ];
    const list = el('qz-rules');
    list.innerHTML = '';
    items.forEach(text => {
        const li = document.createElement('li');
        li.textContent = text;
        list.appendChild(li);
    });
}

function renderQuizRecent() {
    const list = el('qz-recent');
    list.innerHTML = '';
    const recent = casino.session?.quiz?.recent || [];
    if (!recent.length) {
        const li = document.createElement('li');
        li.className = 'qz-recent-empty';
        li.textContent = 'まだ1戦も遊んでいません';
        list.appendChild(li);
        return;
    }
    recent.forEach(item => {
        const li = document.createElement('li');
        li.className = item.delta > 0 ? 'is-plus' : item.delta < 0 ? 'is-minus' : '';
        li.textContent = `${item.rank}位/${item.players}人 ${item.correct}正解 ${quizSigned(item.delta)}`;
        li.title = formatClock(item.at);
        list.appendChild(li);
    });
}

// ------------------------------------------------------------------
// 締め切りと読み直し
// ------------------------------------------------------------------
function quizDeadline(table) {
    if (!table) return null;
    if (table.phase === 'lobby') return table.lobbyEndsAt;
    if (table.phase === 'question') return table.question?.endsAt;
    if (table.phase === 'answering') return table.question?.answerEndsAt;
    if (table.phase === 'result') return table.resultEndsAt;
    return null;
}

function tickQuizClock() {
    renderQuizStatus();
    const deadline = quizDeadline(quiz.table);
    if (!deadline || quiz.ticked === deadline) return;
    if (quizServerNow() < Date.parse(deadline) + 250) return;
    // 画面を開いている全員が送っても、サーバー側で1回しか進まない。少しずらして送る
    quiz.ticked = deadline;
    setTimeout(async () => {
        try {
            const data = await callCasino('qzTick');
            receiveQuizSession(data.session);
            receiveQuizTable(data.quiz, data.now);
        } catch (error) {
            console.warn('早押しクイズの時間切れ処理に失敗:', error);
        }
        setTimeout(() => {
            if (quiz.ticked === deadline) quiz.ticked = '';
        }, 2000);
    }, Math.random() * 500);
}

async function pollQuizTable() {
    if (quiz.polling || document.hidden || !isQuizRoute()) return;
    quiz.polling = true;
    try {
        const doc = await getFirestoreDb().collection('quiz_public').doc('main').get();
        if (doc.exists) receiveQuizTable(doc.data());
    } catch (error) {
        console.warn('早押しクイズの卓の読み込みに失敗:', error);
    } finally {
        quiz.polling = false;
    }
}

// ------------------------------------------------------------------
// 操作
// ------------------------------------------------------------------
async function sendQuiz(action, payload = {}) {
    if (quiz.busy) return null;
    quiz.busy = true;
    renderQuizControls();
    try {
        const data = await callCasino(action, payload);
        if (data.me) casino.me = data.me;
        receiveQuizSession(data.session);
        receiveQuizTable(data.quiz, data.now);
        return data;
    } catch (error) {
        showMessage(el('qz-message'), error.message, 'error');
        // 表示が古いせいで断られたときに備えて読み直す
        pollQuizTable();
        return null;
    } finally {
        quiz.busy = false;
        quiz.pendingChoice = null;
        renderQuiz();
    }
}

function buzzQuiz() {
    if (!canQuizBuzz()) return;
    const button = el('qz-buzz');
    button.classList.remove('is-pressed');
    void button.offsetWidth;
    button.classList.add('is-pressed');
    sendQuiz('qzBuzz', { no: quiz.table.question.no });
}

function answerQuiz(choice) {
    if (!isMyQuizAnswer() || quiz.busy) return;
    quiz.pendingChoice = choice;
    sendQuiz('qzAnswer', { no: quiz.table.question.no, choice });
}

function receiveQuizSession(session) {
    if (!session) return;
    casino.session = session;
    casino.score = session.score;
    renderQuizRecent();
}

/** 卓を進めてから、卓と自分の財布を取り直す */
function refreshQuizStatus() {
    return callCasino('qzStatus').then(data => {
        receiveQuizSession(data.session);
        receiveQuizTable(data.quiz, data.now);
    }).catch(error => console.warn('早押しクイズの読み込みに失敗:', error));
}

// ------------------------------------------------------------------
// 画面の出入り
// ------------------------------------------------------------------
function loadQuizFont() {
    if (document.getElementById('qz-font')) return;
    const link = document.createElement('link');
    link.id = 'qz-font';
    link.rel = 'stylesheet';
    link.href = QUIZ_FONT_URL;
    document.head.appendChild(link);
}

function openQuiz() {
    loadQuizFont();
    renderQuizRules();
    renderQuizRecent();
    renderQuiz();
    if (!quiz.pollTimer) {
        quiz.pollTimer = setInterval(pollQuizTable, QUIZ_POLL_MS);
        quiz.clockTimer = setInterval(tickQuizClock, 200);
        quiz.typeTimer = setInterval(typeQuizQuestion, 40);
        // 開いたときに一度サーバーで卓を進めておく (誰も開いていないあいだに過ぎた締め切りを片付ける)
        refreshQuizStatus();
    }
}

function closeQuiz() {
    clearInterval(quiz.pollTimer);
    clearInterval(quiz.clockTimer);
    clearInterval(quiz.typeTimer);
    quiz.typeTimer = null;
    quiz.pollTimer = null;
    quiz.clockTimer = null;
}

function initQuiz() {
    el('qz-sit-button').addEventListener('click', () => sendQuiz('qzJoin'));
    el('qz-ready-button').addEventListener('click', () => sendQuiz('qzReady', { ready: true }));
    el('qz-unready-button').addEventListener('click', () => sendQuiz('qzReady', { ready: false }));
    el('qz-leave-button').addEventListener('click', () => sendQuiz('qzLeave'));
    el('qz-skip-button').addEventListener('click', () => {
        const view = quiz.table;
        const voters = view?.match ? view.match.participants : view?.seats.filter(Boolean) || [];
        const skipped = voters.some(player => player && player.name === quizMe() && player.skip);
        sendQuiz('qzSkip', { skip: !skipped });
    });
    el('qz-buzz').addEventListener('click', buzzQuiz);
    el('qz-ranking-close').addEventListener('click', () => el('qz-ranking').classList.add('hidden'));
    el('qz-ranking').addEventListener('click', event => {
        if (event.target === el('qz-ranking')) el('qz-ranking').classList.add('hidden');
    });
    el('qz-seats').addEventListener('click', event => {
        const button = event.target.closest('[data-qz-sit]');
        if (button) sendQuiz('qzJoin', { seat: Number(button.dataset.qzSit) });
    });
    el('qz-choices').addEventListener('click', event => {
        const button = event.target.closest('[data-qz-choice]');
        if (button && !button.disabled) answerQuiz(Number(button.dataset.qzChoice));
    });
    // Space で早押し、A〜D (1〜4) で解答
    document.addEventListener('keydown', event => {
        if (!isQuizRoute() || event.repeat || event.target.closest('input, textarea, select')) return;
        if (event.code === 'Space') {
            if (canQuizBuzz()) {
                event.preventDefault();
                buzzQuiz();
            }
            return;
        }
        const key = event.key.toUpperCase();
        const index = QUIZ_CHOICE_KEYS.indexOf(key) >= 0 ? QUIZ_CHOICE_KEYS.indexOf(key) : ['1', '2', '3', '4'].indexOf(key);
        if (index >= 0 && isMyQuizAnswer()) {
            event.preventDefault();
            answerQuiz(index);
        }
    });
}
