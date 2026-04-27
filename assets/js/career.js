// assets/js/career.js

// ============================================================
// 定数
// ============================================================
const POST_TYPES = {
    pass_doc:              { label: '📄 書類通過',      points: 20 },
    pass_interview_1:      { label: '💬 1次面接通過',   points: 30 },
    pass_interview_2:      { label: '💬 2次面接通過',   points: 30 },
    pass_interview_3:      { label: '💬 3次面接通過',   points: 30 },
    pass_interview_final:  { label: '💬 最終面接通過',  points: 30 },
    offer:                 { label: '🎉 内定',          points: 100 },
};
const OFFER_BONUS     = 100;  // 内定時に全員へ配布するボーナスP
const SPI_POINT_REWARD = 0.1;
const SPI_TOTAL_QUESTIONS = 200;

// ============================================================
// 状態
// ============================================================
let authenticatedUser = null;

// ============================================================
// DOM要素
// ============================================================
const AUTH_SECTION    = document.getElementById('auth-section');
const CAREER_CONTENT  = document.getElementById('career-content');
const AUTH_FORM       = document.getElementById('auth-form');
const AUTH_MESSAGE    = document.getElementById('auth-message');
const LOGOUT_BUTTON   = document.getElementById('logout-button');
const SPI_STATS       = document.getElementById('spi-stats');
const SPI_PROGRESS    = document.getElementById('spi-progress');
const SPI_QUESTION_META = document.getElementById('spi-question-meta');
const SPI_QUESTION_TEXT = document.getElementById('spi-question-text');
const SPI_CHOICE_LIST = document.getElementById('spi-choice-list');
const SPI_ANSWER_FORM = document.getElementById('spi-answer-form');
const SPI_NEXT_BUTTON = document.getElementById('spi-next-button');
const SPI_MESSAGE     = document.getElementById('spi-message');
let currentSpiQuestion = null;

// ============================================================
// SPI問題集
// ============================================================
const SPI_QUESTIONS = buildSpiQuestions();

function formatNumber(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function seededShuffle(items, seed) {
    const arr = [...items];
    let x = seed || 1;
    for (let i = arr.length - 1; i > 0; i--) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        const j = x % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function uniqueNumbers(values) {
    return [...new Set(values.map(v => Number(parseFloat(v).toFixed(1))))];
}

function makeNumericQuestion(id, category, prompt, answer, unit, explanation, distractors) {
    const choices = uniqueNumbers([answer, ...distractors])
        .filter(v => Number.isFinite(v))
        .slice(0, 4)
        .map(v => ({
            label: `${formatNumber(v)}${unit || ''}`,
            value: Number(parseFloat(v).toFixed(1))
        }));

    while (choices.length < 4) {
        const next = Number(parseFloat(answer + choices.length + 1).toFixed(1));
        if (!choices.some(choice => choice.value === next)) {
            choices.push({ label: `${formatNumber(next)}${unit || ''}`, value: next });
        }
    }

    const shuffled = seededShuffle(choices, id * 97);
    return {
        id: `spi-${String(id).padStart(3, '0')}`,
        category,
        prompt,
        choices: shuffled.map(choice => choice.label),
        answerIndex: shuffled.findIndex(choice => choice.value === Number(parseFloat(answer).toFixed(1))),
        explanation
    };
}

function makeChoiceQuestion(id, category, prompt, answer, choices, explanation) {
    const uniqueChoices = [...new Set([answer, ...choices])].slice(0, 4);
    const shuffled = seededShuffle(uniqueChoices, id * 131);
    return {
        id: `spi-${String(id).padStart(3, '0')}`,
        category,
        prompt,
        choices: shuffled,
        answerIndex: shuffled.indexOf(answer),
        explanation
    };
}

function buildSpiQuestions() {
    const questions = [];
    let id = 1;

    for (let i = 0; i < 30; i++, id++) {
        const a = 12 + i;
        const b = 3 + (i % 8);
        const c = 4 + (i % 7);
        const answer = a + b * c;
        questions.push(makeNumericQuestion(
            id,
            '計算',
            `${a} + ${b} × ${c} = ?`,
            answer,
            '',
            `掛け算を先に計算して、${b} × ${c} = ${b * c}。そこに ${a} を足します。`,
            [answer + b, answer - c, (a + b) * c]
        ));
    }

    for (let i = 0; i < 25; i++, id++) {
        const price = 1200 + i * 160;
        const percent = [5, 8, 10, 12, 15][i % 5];
        const answer = price * (100 - percent) / 100;
        questions.push(makeNumericQuestion(
            id,
            '割合',
            `${price}円の商品を${percent}%引きで買うと、支払額はいくらですか。`,
            answer,
            '円',
            `${percent}%引きなので、${price} × ${(100 - percent) / 100} を計算します。`,
            [price - percent, price * percent / 100, answer + 100, answer - 100]
        ));
    }

    for (let i = 0; i < 25; i++, id++) {
        const left = 2 + (i % 5);
        const right = 3 + (i % 7);
        const total = (left + right) * (8 + i);
        const answer = total * left / (left + right);
        questions.push(makeNumericQuestion(
            id,
            '比',
            `AとBの比が ${left}:${right}、合計が${total}のとき、Aはいくつですか。`,
            answer,
            '',
            `全体は${left + right}等分です。Aは ${total} × ${left} / ${left + right} です。`,
            [total * right / (left + right), answer + left, answer - right, total / (left + right)]
        ));
    }

    for (let i = 0; i < 25; i++, id++) {
        const speed = 40 + (i % 9) * 5;
        const time = 1.5 + (i % 5) * 0.5;
        const answer = speed * time;
        questions.push(makeNumericQuestion(
            id,
            '速さ',
            `時速${speed}kmで${formatNumber(time)}時間進むと、何km進みますか。`,
            answer,
            'km',
            `距離 = 速さ × 時間なので、${speed} × ${formatNumber(time)} を計算します。`,
            [answer + speed, answer - speed / 2, speed / time, answer + 10]
        ));
    }

    for (let i = 0; i < 25; i++, id++) {
        const a = 4 + (i % 6);
        const b = 6 + (i % 7);
        const answer = (a * b) / (a + b);
        questions.push(makeNumericQuestion(
            id,
            '仕事算',
            `Aは${a}時間、Bは${b}時間で同じ仕事を終えます。2人で行うと何時間かかりますか。`,
            Number(answer.toFixed(1)),
            '時間',
            `1時間あたりの仕事量は 1/${a} + 1/${b}。全体を割ると ${(answer).toFixed(1)} 時間です。`,
            [a + b, Math.abs(b - a), answer + 1, answer * 2]
        ));
    }

    for (let i = 0; i < 25; i++, id++) {
        const count = 4 + (i % 3);
        const base = 55 + i;
        const scores = Array.from({ length: count }, (_, idx) => base + idx * 4);
        const next = base + count * 4 + (i % 4);
        const answer = (scores.reduce((sum, value) => sum + value, 0) + next) / (count + 1);
        questions.push(makeNumericQuestion(
            id,
            '平均',
            `${scores.join('、')}、${next} の平均はいくつですか。`,
            Number(answer.toFixed(1)),
            '',
            `合計を個数で割ります。合計は${scores.reduce((sum, value) => sum + value, 0) + next}、個数は${count + 1}です。`,
            [answer + 2, answer - 2, next, base]
        ));
    }

    for (let i = 0; i < 25; i++, id++) {
        const start = 2 + (i % 6);
        const diff = 3 + (i % 5);
        const seq = [0, 1, 2, 3].map(n => start + diff * n);
        const answer = start + diff * 4;
        questions.push(makeNumericQuestion(
            id,
            '推論',
            `次の数列の空欄に入る数はどれですか。${seq.join('、')}、?`,
            answer,
            '',
            `一定の差 ${diff} で増えています。`,
            [answer + diff, answer - diff, answer + 1, answer - 1]
        ));
    }

    const verbalQuestions = [
        ['語句', '「慎重」の意味に最も近い語はどれですか。', '用心深い', ['大胆な', '曖昧な', '短時間の'], '慎重は、軽率に進めず注意深いことです。'],
        ['語句', '「迅速」の意味に最も近い語はどれですか。', 'すばやい', ['静かな', '詳しい', '新しい'], '迅速は、物事の進み方が速いことです。'],
        ['語句', '「妥当」の意味に最も近い語はどれですか。', '適切な', ['偶然の', '過剰な', '不明な'], '妥当は、条件や状況に合っていることです。'],
        ['語句', '「簡潔」の意味に最も近い語はどれですか。', '短くまとまった', ['派手な', '古くさい', '危険な'], '簡潔は、無駄がなく要点がまとまっていることです。'],
        ['語句', '「顕著」の意味に最も近い語はどれですか。', 'はっきり目立つ', ['少し遅い', '内側にある', 'よく似た'], '顕著は、目立ってはっきりしていることです。'],
        ['語句', '「維持」の意味に最も近い語はどれですか。', '保ち続ける', ['壊して作る', '一度だけ試す', '遠くへ運ぶ'], '維持は、同じ状態を保つことです。'],
        ['語句', '「示唆」の意味に最も近い語はどれですか。', 'それとなく示す', ['強く否定する', '完全に隠す', '大声で読む'], '示唆は、直接ではなく間接的に示すことです。'],
        ['語句', '「抑制」の意味に最も近い語はどれですか。', 'おさえる', ['広げる', '忘れる', '飾る'], '抑制は、勢いや行動をおさえることです。'],
        ['語句', '「貢献」の意味に最も近い語はどれですか。', '役に立つ働きをする', ['責任を避ける', '場所を移す', '形を変える'], '貢献は、ある目的や相手のために役立つことです。'],
        ['語句', '「柔軟」の意味に最も近い語はどれですか。', '状況に合わせられる', ['数字が多い', '必ず同じ', '声が小さい'], '柔軟は、変化に合わせて対応できることです。'],
        ['語句', '「客観」の意味に最も近い語はどれですか。', '事実にもとづく見方', ['個人の好み', '急な予定', '昔の習慣'], '客観は、個人の感情に寄りすぎず事実を見ることです。'],
        ['語句', '「抽象」の意味に最も近い語はどれですか。', '共通点を取り出す', ['細部だけを写す', '音を大きくする', '順番を逆にする'], '抽象は、個別の物事から共通する性質を取り出すことです。'],
        ['語句', '「合理」の意味に最も近い語はどれですか。', '筋道が通っている', ['感情的である', '偶然である', '古風である'], '合理は、理由や筋道にかなっていることです。'],
        ['語句', '「継続」の意味に最も近い語はどれですか。', '続ける', ['切り替える', '比べる', '隠す'], '継続は、途中でやめずに続けることです。'],
        ['語句', '「予測」の意味に最も近い語はどれですか。', '前もって見通す', ['後から記録する', '同時に並べる', '静かに待つ'], '予測は、将来をあらかじめ見通すことです。'],
        ['語句', '「補足」の意味に最も近い語はどれですか。', '足りない分を補う', ['全て捨てる', '先に進める', '細かく分ける'], '補足は、不足している情報などを付け加えることです。'],
        ['語句', '「推移」の意味に最も近い語はどれですか。', '移り変わり', ['固定された点', '同じ答え', '強い反発'], '推移は、状態が時間とともに変わることです。'],
        ['語句', '「把握」の意味に最も近い語はどれですか。', '内容をつかむ', ['音を消す', '色を変える', '順に並ぶ'], '把握は、物事の内容や状況を理解することです。'],
        ['語句', '「優先」の意味に最も近い語はどれですか。', '先に扱う', ['後に残す', '同じに混ぜる', '広く知らせる'], '優先は、他より先に扱うことです。'],
        ['語句', '「検討」の意味に最も近い語はどれですか。', 'よく調べ考える', ['急いで忘れる', '形だけ整える', '遠くから見る'], '検討は、よく調べて考えることです。']
    ];

    for (const [category, prompt, answer, choices, explanation] of verbalQuestions) {
        questions.push(makeChoiceQuestion(id, category, prompt, answer, choices, explanation));
        id++;
    }

    return questions.slice(0, SPI_TOTAL_QUESTIONS);
}

function normalizeSpiStats(player) {
    const stats = player && player.spiStats ? player.spiStats : {};
    const answeredIds = Array.isArray(stats.answeredQuestionIds) ? stats.answeredQuestionIds : [];
    const attempted = Number(stats.attempted || answeredIds.length || 0);
    const correct = Number(stats.correct || 0);
    return {
        attempted,
        correct,
        earnedPoints: Number(stats.earnedPoints || 0),
        answeredQuestionIds: answeredIds,
        lastAnsweredAt: stats.lastAnsweredAt || null
    };
}

function getSpiAccuracy(stats) {
    return stats.attempted > 0 ? (stats.correct / stats.attempted) * 100 : 0;
}

function getNextSpiQuestion(stats) {
    const answered = new Set(stats.answeredQuestionIds || []);
    return SPI_QUESTIONS.find(question => !answered.has(question.id)) || null;
}

function renderSpiStats(player) {
    const stats = normalizeSpiStats(player);
    const remaining = Math.max(0, SPI_TOTAL_QUESTIONS - stats.answeredQuestionIds.length);
    SPI_PROGRESS.textContent = `${stats.answeredQuestionIds.length} / ${SPI_TOTAL_QUESTIONS}`;
    SPI_STATS.innerHTML = `
        <div class="spi-stat-item"><span>正解率</span><strong>${getSpiAccuracy(stats).toFixed(1)}%</strong></div>
        <div class="spi-stat-item"><span>正解</span><strong>${stats.correct}</strong></div>
        <div class="spi-stat-item"><span>回答済み</span><strong>${stats.attempted}</strong></div>
        <div class="spi-stat-item"><span>獲得</span><strong>${stats.earnedPoints.toFixed(1)}P</strong></div>
        <div class="spi-stat-item"><span>残り</span><strong>${remaining}</strong></div>
    `;
}

function renderSpiQuestion(question) {
    currentSpiQuestion = question;
    SPI_MESSAGE.classList.add('hidden');
    SPI_NEXT_BUTTON.classList.add('hidden');
    SPI_ANSWER_FORM.classList.remove('hidden');

    if (!question) {
        SPI_QUESTION_META.textContent = '全問終了';
        SPI_QUESTION_TEXT.textContent = 'SPI問題集200問をすべて回答しました。';
        SPI_CHOICE_LIST.innerHTML = '';
        SPI_ANSWER_FORM.classList.add('hidden');
        return;
    }

    const number = SPI_QUESTIONS.findIndex(item => item.id === question.id) + 1;
    SPI_QUESTION_META.textContent = `Q${number} / ${SPI_TOTAL_QUESTIONS} · ${question.category}`;
    SPI_QUESTION_TEXT.textContent = question.prompt;
    SPI_CHOICE_LIST.innerHTML = question.choices.map((choice, index) => `
        <label class="spi-choice">
            <input type="radio" name="spi-answer" value="${index}" required>
            <span>${escapeHtml(choice)}</span>
        </label>
    `).join('');
}

function loadSpiQuizForPlayer(player) {
    renderSpiStats(player);
    renderSpiQuestion(getNextSpiQuestion(normalizeSpiStats(player)));
}

// ============================================================
// 認証
// ============================================================
async function attemptLogin(username, password, isAuto = false) {
    if (!isAuto) showMessage(AUTH_MESSAGE, '認証中...', 'info');

    try {
        await qjongSignIn(username, password);
        const allData = await fetchAllData();
        const user = allData.scores.find(p => p.name === username);
        if (!user) {
            if (!isAuto) showMessage(AUTH_MESSAGE, '❌ ユーザーデータが見つかりません。', 'error');
            return false;
        }
        authenticatedUser = { ...user };
        localStorage.setItem('authUsername', username);
        localStorage.setItem('authPassword', password);

        AUTH_SECTION.classList.add('hidden');
        CAREER_CONTENT.classList.remove('hidden');
        document.getElementById('authenticated-user-name').textContent = authenticatedUser.name;
        document.getElementById('current-score').textContent = authenticatedUser.score.toFixed(1);

        await renderAll();
        return true;
    } catch (err) {
        if (!isAuto) showMessage(AUTH_MESSAGE, `❌ エラー: ${err.message}`, 'error');
        return false;
    }
}

function handleLogout() {
    authenticatedUser = null;
    qjongSignOut();
    localStorage.removeItem('authUsername');
    localStorage.removeItem('authPassword');
    CAREER_CONTENT.classList.add('hidden');
    AUTH_SECTION.classList.remove('hidden');
    AUTH_FORM.reset();
    showMessage(AUTH_MESSAGE, '👋 ログアウトしました。', 'info');
}

AUTH_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    await attemptLogin(username, password, false);
});

LOGOUT_BUTTON.addEventListener('click', handleLogout);

SPI_ANSWER_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!authenticatedUser || !currentSpiQuestion) return;

    const selected = SPI_ANSWER_FORM.querySelector('input[name="spi-answer"]:checked');
    if (!selected) {
        showMessage(SPI_MESSAGE, '❌ 選択肢を選んでください。', 'error');
        return;
    }

    const submitBtn = SPI_ANSWER_FORM.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
        const selectedIndex = Number(selected.value);
        const isCorrect = selectedIndex === currentSpiQuestion.answerIndex;
        const currentData = await fetchAllData();
        const scoreMap = new Map(currentData.scores.map(player => [player.name, { ...player }]));
        const player = scoreMap.get(authenticatedUser.name);

        if (!player) {
            showMessage(SPI_MESSAGE, '❌ ユーザーデータが見つかりません。', 'error');
            return;
        }

        const stats = normalizeSpiStats(player);
        if (stats.answeredQuestionIds.includes(currentSpiQuestion.id)) {
            showMessage(SPI_MESSAGE, 'この問題はすでに回答済みです。次の問題へ進んでください。', 'info');
            renderSpiQuestion(getNextSpiQuestion(stats));
            return;
        }

        const nextStats = {
            attempted: stats.attempted + 1,
            correct: stats.correct + (isCorrect ? 1 : 0),
            earnedPoints: parseFloat((stats.earnedPoints + (isCorrect ? SPI_POINT_REWARD : 0)).toFixed(1)),
            answeredQuestionIds: [...stats.answeredQuestionIds, currentSpiQuestion.id],
            lastAnsweredAt: new Date().toISOString()
        };

        player.spiStats = nextStats;
        if (isCorrect) {
            player.score = parseFloat(((player.score || 0) + SPI_POINT_REWARD).toFixed(1));
        }
        scoreMap.set(player.name, player);

        const res = await updateAllData({
            ...currentData,
            scores: Array.from(scoreMap.values())
        });

        if (res.status !== 'success') {
            showMessage(SPI_MESSAGE, `❌ 保存エラー: ${res.message}`, 'error');
            return;
        }

        authenticatedUser = { ...player };
        document.getElementById('current-score').textContent = authenticatedUser.score.toFixed(1);
        renderSpiStats(authenticatedUser);

        const correctChoice = currentSpiQuestion.choices[currentSpiQuestion.answerIndex];
        if (isCorrect) {
            showMessage(SPI_MESSAGE, `✅ 正解です。+${SPI_POINT_REWARD.toFixed(1)}P 獲得！ ${currentSpiQuestion.explanation}`, 'success');
        } else {
            showMessage(SPI_MESSAGE, `❌ 不正解です。正解は「${correctChoice}」。${currentSpiQuestion.explanation}`, 'error');
        }

        SPI_ANSWER_FORM.classList.add('hidden');
        SPI_NEXT_BUTTON.classList.remove('hidden');
    } catch (err) {
        showMessage(SPI_MESSAGE, `❌ サーバーエラー: ${err.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
    }
});

SPI_NEXT_BUTTON.addEventListener('click', () => {
    if (!authenticatedUser) return;
    renderSpiQuestion(getNextSpiQuestion(normalizeSpiStats(authenticatedUser)));
});

// ============================================================
// 投稿フォーム
// ============================================================
document.getElementById('career-post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl  = document.getElementById('post-message');
    const type       = document.getElementById('post-type').value;
    const company    = document.getElementById('post-company').value.trim();
    const submitBtn  = e.target.querySelector('button[type="submit"]');

    if (!type || !company) {
        showMessage(messageEl, '❌ 種別と企業名を入力してください。', 'error');
        return;
    }

    submitBtn.disabled = true;
    try {
        const currentData = await fetchAllData();
        const postDef     = POST_TYPES[type];

        const newPost = {
            id:         `cp_${Date.now()}`,
            player:     authenticatedUser.name,
            type,
            company,
            postedAt:   new Date().toISOString(),
            points:     postDef.points,
        };

        // スコアをMapで管理
        const scoreMap = new Map(currentData.scores.map(s => [s.name, { ...s }]));

        // 投稿者にポイント付与
        if (postDef.points > 0) {
            const poster = scoreMap.get(authenticatedUser.name);
            if (poster) poster.score = parseFloat((poster.score + postDef.points).toFixed(1));
        }

        // 内定の場合、全員（投稿者含む）にボーナスP付与
        if (type === 'offer') {
            for (const [, player] of scoreMap) {
                player.score = parseFloat((player.score + OFFER_BONUS).toFixed(1));
            }
        }

        const newCareerPosts = [...(currentData.career_posts || []), newPost];

        const newData = {
            scores:               Array.from(scoreMap.values()),
            sports_bets:          currentData.sports_bets          || [],
            speedstorm_records:   currentData.speedstorm_records    || [],
            lotteries:            currentData.lotteries             || [],
            gift_codes:           currentData.gift_codes            || [],
            exercise_reports:     currentData.exercise_reports      || [],
            career_posts:         newCareerPosts,
        };

        const res = await updateAllData(newData);
        if (res.status === 'success') {
            let msg = `✅ 投稿しました。`;
            if (postDef.points > 0) msg += ` +${postDef.points}P 獲得！`;
            if (type === 'offer')    msg += ` 全員に ${OFFER_BONUS}P のボーナスが配布されました🎉`;
            showMessage(messageEl, msg, 'success');

            // 残高を更新
            const updated = Array.from(scoreMap.values()).find(s => s.name === authenticatedUser.name);
            if (updated) {
                authenticatedUser.score = updated.score;
                document.getElementById('current-score').textContent = authenticatedUser.score.toFixed(1);
            }

            e.target.reset();
            await renderAll();
        } else {
            showMessage(messageEl, `❌ 投稿エラー: ${res.message}`, 'error');
        }
    } catch (err) {
        showMessage(messageEl, `❌ サーバーエラー: ${err.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
    }
});

// ============================================================
// レンダリング
// ============================================================
async function renderAll() {
    const currentData = await fetchAllData();
    const latestUser = (currentData.scores || []).find(player => player.name === authenticatedUser.name);
    if (latestUser) {
        authenticatedUser = { ...latestUser };
        document.getElementById('current-score').textContent = authenticatedUser.score.toFixed(1);
        loadSpiQuizForPlayer(authenticatedUser);
    }
    renderTimeline(currentData.career_posts || []);
    renderRanking(currentData.career_posts || [], currentData.scores || []);
}

function renderTimeline(posts) {
    const container = document.getElementById('career-timeline-container');
    if (posts.length === 0) {
        container.innerHTML = '<p>まだ投稿がありません。</p>';
        return;
    }

    const sorted = [...posts].sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
    container.innerHTML = sorted.map(post => {
        const def  = POST_TYPES[post.type] || { label: post.type };
        const date = new Date(post.postedAt).toLocaleDateString('ja-JP');
        return `
        <div style="border-left:4px solid ${typeColor(post.type)};padding:10px 14px;margin-bottom:12px;background:#fafafa;border-radius:0 6px 6px 0;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                <span><strong>${escapeHtml(post.player)}</strong>　<span style="color:${typeColor(post.type)};font-weight:bold;">${def.label}</span></span>
                <span style="color:#888;font-size:0.85em;">${date}</span>
            </div>
            <p style="margin:4px 0 0;font-size:1em;">🏢 ${escapeHtml(post.company)}</p>
        </div>`;
    }).join('');
}

function renderRanking(posts, scores) {
    const container = document.getElementById('career-ranking-container');

    // プレイヤーごとに集計
    const stats = {};
    for (const post of posts) {
        if (!stats[post.player]) {
            stats[post.player] = { offers: 0, finalPassed: 0, interviews: 0, docPassed: 0 };
        }
        if (post.type === 'offer')                stats[post.player].offers++;
        else if (post.type === 'pass_interview_final') stats[post.player].finalPassed++;
        else if (post.type.startsWith('pass_interview_')) stats[post.player].interviews++;
        else if (post.type === 'pass_doc')         stats[post.player].docPassed++;
    }

    const players = Object.entries(stats).sort((a, b) => {
        const s = (p) => p[1].offers * 1000 + p[1].finalPassed * 100 + p[1].interviews * 10 + p[1].docPassed;
        return s(b) - s(a);
    });

    if (players.length === 0) {
        container.innerHTML = '<p>まだデータがありません。</p>';
        return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    container.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:0.9em;">
            <thead>
                <tr style="border-bottom:2px solid #ddd;text-align:left;">
                    <th style="padding:6px 4px;">順位</th>
                    <th style="padding:6px 4px;">名前</th>
                    <th style="padding:6px 4px;text-align:center;">内定</th>
                    <th style="padding:6px 4px;text-align:center;">最終通過</th>
                    <th style="padding:6px 4px;text-align:center;">面接通過</th>
                    <th style="padding:6px 4px;text-align:center;">書類通過</th>
                </tr>
            </thead>
            <tbody>
                ${players.map(([name, s], i) => `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:6px 4px;">${medals[i] || i + 1}</td>
                    <td style="padding:6px 4px;font-weight:bold;">${escapeHtml(name)}</td>
                    <td style="padding:6px 4px;text-align:center;">${s.offers > 0 ? `<span style="color:#e74c3c;font-weight:bold;">${s.offers}</span>` : '—'}</td>
                    <td style="padding:6px 4px;text-align:center;">${s.finalPassed || '—'}</td>
                    <td style="padding:6px 4px;text-align:center;">${s.interviews || '—'}</td>
                    <td style="padding:6px 4px;text-align:center;">${s.docPassed || '—'}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
}

function typeColor(type) {
    if (type === 'offer')                    return '#e74c3c';
    if (type === 'pass_interview_final')     return '#e67e22';
    if (type.startsWith('pass_interview_')) return '#3498db';
    if (type === 'pass_doc')                return '#27ae60';
    return '#95a5a6';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ============================================================
// 初期化
// ============================================================
window.onload = async () => {
    const savedUser = localStorage.getItem('authUsername');
    const savedPass = localStorage.getItem('authPassword');
    if (savedUser && savedPass) {
        await attemptLogin(savedUser, savedPass, true);
    }
};
