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
const SPI_BANK_VERSION = 'spi-v2';

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

function getSpiDomain(category) {
    return ['語句', '二語関係', '空欄補充', '文意把握'].includes(category) ? '言語' : '非言語';
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
        id: `${SPI_BANK_VERSION}-${String(id).padStart(3, '0')}`,
        domain: getSpiDomain(category),
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
        id: `${SPI_BANK_VERSION}-${String(id).padStart(3, '0')}`,
        domain: getSpiDomain(category),
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

    for (let i = 0; i < 20; i++, id++) {
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

    for (let i = 0; i < 20; i++, id++) {
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

    for (let i = 0; i < 20; i++, id++) {
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

    for (let i = 0; i < 20; i++, id++) {
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

    for (let i = 0; i < 20; i++, id++) {
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
        ['語句', '「検討」の意味に最も近い語はどれですか。', 'よく調べ考える', ['急いで忘れる', '形だけ整える', '遠くから見る'], '検討は、よく調べて考えることです。'],
        ['語句', '「精査」の意味に最も近い語はどれですか。', '詳しく調べる', ['すぐ決める', '広く配る', '静かに置く'], '精査は、細かい点まで詳しく調べることです。'],
        ['語句', '「促進」の意味に最も近い語はどれですか。', '進みを早める', ['動きを止める', '順番を戻す', '意味を隠す'], '促進は、物事が進むように働きかけることです。'],
        ['語句', '「代替」の意味に最も近い語はどれですか。', '別のもので代える', ['同じ場所に置く', '大きく広げる', '細かく分ける'], '代替は、あるものの代わりに別のものを用いることです。'],
        ['語句', '「概略」の意味に最も近い語はどれですか。', 'おおまかな内容', ['最終の結論', '細部の記録', '反対の意見'], '概略は、全体を大まかにまとめた内容です。'],
        ['語句', '「均衡」の意味に最も近い語はどれですか。', 'つり合い', ['不足', '急増', '例外'], '均衡は、力や量などがつり合っている状態です。']
    ];

    for (const [category, prompt, answer, choices, explanation] of verbalQuestions) {
        questions.push(makeChoiceQuestion(id, category, prompt, answer, choices, explanation));
        id++;
    }

    const relationQuestions = [
        ['本：読書', '道具と行為', ['材料と完成品', '原因と結果', '全体と部分'], '本は読書に使う対象です。'],
        ['包丁：料理', '道具と行為', ['反対語', '同義語', '場所と人'], '包丁は料理に使う道具です。'],
        ['種：植物', '原因と結果', ['道具と行為', '同義語', '全体と部分'], '種から植物が育ちます。'],
        ['努力：成果', '原因と結果', ['同義語', '反対語', '場所と人'], '努力が成果につながります。'],
        ['車輪：自動車', '部分と全体', ['道具と行為', '原因と結果', '同義語'], '車輪は自動車を構成する部分です。'],
        ['ページ：本', '部分と全体', ['反対語', '材料と完成品', '場所と人'], 'ページは本の一部分です。'],
        ['教師：学校', '人と場所', ['道具と行為', '原因と結果', '同義語'], '教師は学校に関係する人です。'],
        ['医師：病院', '人と場所', ['部分と全体', '反対語', '材料と完成品'], '医師は病院に関係する人です。'],
        ['綿：布', '材料と完成品', ['道具と行為', '人と場所', '同義語'], '綿は布の材料になります。'],
        ['小麦：パン', '材料と完成品', ['反対語', '部分と全体', '原因と結果'], '小麦はパンの材料になります。'],
        ['増加：減少', '反対語', ['同義語', '道具と行為', '部分と全体'], '増加と減少は反対の意味です。'],
        ['開始：終了', '反対語', ['材料と完成品', '原因と結果', '人と場所'], '開始と終了は反対の意味です。'],
        ['保存：保管', '同義語', ['反対語', '道具と行為', '部分と全体'], '保存と保管は近い意味です。'],
        ['迅速：素早い', '同義語', ['原因と結果', '材料と完成品', '人と場所'], '迅速と素早いは近い意味です。'],
        ['地図：道案内', '道具と行為', ['反対語', '材料と完成品', '部分と全体'], '地図は道案内に使われます。'],
        ['鍵：施錠', '道具と行為', ['同義語', '人と場所', '原因と結果'], '鍵は施錠に使う道具です。'],
        ['練習：上達', '原因と結果', ['部分と全体', '反対語', '材料と完成品'], '練習によって上達が起こります。'],
        ['雨：増水', '原因と結果', ['同義語', '道具と行為', '人と場所'], '雨が原因で川などが増水します。'],
        ['枝：木', '部分と全体', ['材料と完成品', '反対語', '場所と人'], '枝は木の一部分です。'],
        ['文字：文章', '部分と全体', ['同義語', '原因と結果', '道具と行為'], '文字が集まって文章になります。'],
        ['駅員：駅', '人と場所', ['反対語', '材料と完成品', '原因と結果'], '駅員は駅に関係する人です。'],
        ['店員：店舗', '人と場所', ['同義語', '道具と行為', '部分と全体'], '店員は店舗に関係する人です。'],
        ['木材：家具', '材料と完成品', ['原因と結果', '反対語', '人と場所'], '木材は家具の材料になります。'],
        ['粘土：陶器', '材料と完成品', ['同義語', '道具と行為', '部分と全体'], '粘土は陶器の材料になります。'],
        ['拡大：縮小', '反対語', ['原因と結果', '人と場所', '同義語'], '拡大と縮小は反対の意味です。']
    ];

    for (const [prompt, answer, choices, explanation] of relationQuestions) {
        questions.push(makeChoiceQuestion(id, '二語関係', `「${prompt}」と同じ関係を表すものはどれですか。`, answer, choices, explanation));
        id++;
    }

    const fillBlankQuestions = [
        ['会議では、結論だけでなくそこに至る____も共有する必要がある。', '過程', ['騒音', '装飾', '余白'], '結論に至る道筋なので「過程」が適切です。'],
        ['新しい制度を導入する前に、現場への____を確認した。', '影響', ['温度', '番号', '模様'], '制度が現場に与えるものは「影響」です。'],
        ['限られた時間で成果を出すには、作業の____を決めることが重要だ。', '優先順位', ['郵便番号', '明暗', '材料名'], '何から先に行うかを決めるので「優先順位」です。'],
        ['資料の数字に誤りがないか、提出前に____した。', '確認', ['乾燥', '発芽', '移動'], '誤りがないか見る行為は「確認」です。'],
        ['意見が分かれたため、双方の主張を____して整理した。', '比較', ['冷却', '保管', '着色'], '複数の主張の違いを見るので「比較」です。'],
        ['計画を進めるには、目的を明確に____する必要がある。', '定義', ['削除', '分解', '運搬'], '目的の意味や範囲を明らかにするのは「定義」です。'],
        ['応募書類では、経験を具体的な成果に____して伝えるとよい。', '結びつけて', ['遠ざけて', '塗り替えて', '隠して'], '経験と成果の関係を示すので「結びつけて」です。'],
        ['問題の原因を探るため、まず事実を____した。', '収集', ['燃焼', '凍結', '装飾'], '原因分析のために事実を集めるので「収集」です。'],
        ['急な変更にも対応できるよう、計画には____を持たせた。', '余裕', ['摩擦', '沈黙', '密度'], '変更に対応するには時間や資源のゆとりが必要です。'],
        ['説明が長くなったため、要点を____にまとめた。', '簡潔', ['不透明', '過剰', '遠方'], '要点を短くまとめる様子は「簡潔」です。'],
        ['目標との差を把握するため、現在の状況を____した。', '分析', ['祝福', '染色', '降下'], '状況を分けて調べるので「分析」です。'],
        ['判断に迷ったときは、基準に____して考える。', '照らして', ['背けて', '沈めて', '乾かして'], '基準と照合して考える表現です。'],
        ['初めての相手にも伝わるよう、専門用語を____した。', '言い換えた', ['埋め立てた', '凍らせた', '丸めた'], '難しい言葉を別の表現にすることです。'],
        ['複数の案から、費用と効果の____が最もよいものを選んだ。', 'バランス', ['騒音', '方角', '湿度'], '費用と効果のつり合いを見るので「バランス」です。'],
        ['失敗の再発を防ぐため、手順を____した。', '見直し', ['装飾', '隠蔽', '拡散'], '再発防止には手順を改めて検討します。'],
        ['利用者の声をもとに、サービスを____した。', '改善', ['蒸発', '分離', '停止'], 'よりよくすることは「改善」です。'],
        ['情報が不足している場合、結論を急がず____するべきだ。', '保留', ['断定', '消去', '装飾'], '判断を一旦待つことは「保留」です。'],
        ['役割が曖昧だと、作業の____が発生しやすい。', '重複', ['透明', '燃料', '遠近'], '同じ作業を複数人が行うことは「重複」です。'],
        ['成果を安定させるには、作業手順を____することが有効だ。', '標準化', ['偶然化', '感情化', '装飾化'], '誰でも同じ手順で行えるようにすることです。'],
        ['相手の立場を考え、伝え方を____した。', '調整', ['粉砕', '冷凍', '削除'], '状況に合わせて変えることは「調整」です。'],
        ['計画の遅れを早期に見つけるため、進捗を____した。', '管理', ['漂白', '遮断', '反転'], '進み具合を把握し制御するのは「管理」です。'],
        ['課題の重要度を見極め、対応の____を決めた。', '順序', ['香り', '重さ', '色彩'], '対応する順番なので「順序」です。'],
        ['曖昧な表現を避け、条件を____に示した。', '明確', ['巨大', '突然', '静寂'], 'はっきり示すことは「明確」です。'],
        ['相手の発言の意図を____してから回答した。', '把握', ['散布', '沈殿', '装着'], '意図を理解することは「把握」です。'],
        ['不確実な要素が多いため、複数の____を用意した。', '選択肢', ['気温', '色鉛筆', '空白'], '複数の可能な案なので「選択肢」です。']
    ];

    for (const [prompt, answer, choices, explanation] of fillBlankQuestions) {
        questions.push(makeChoiceQuestion(id, '空欄補充', prompt, answer, choices, explanation));
        id++;
    }

    const comprehensionQuestions = [
        ['短時間で全てを完璧に仕上げるより、重要な部分から確実に終える方が成果につながる。', '優先度をつけて取り組むべきだ', ['全てを同時に始めるべきだ', '重要な作業は後回しでよい', '完璧さだけが唯一の基準だ'], '重要な部分から確実に終えることが主旨です。'],
        ['意見が異なる相手と話すときは、先に相手の前提を確認すると議論がかみ合いやすい。', '前提の確認が対話を助ける', ['異論は避けるべきだ', '結論だけを急ぐべきだ', '相手の話を省略すべきだ'], '前提を確認する効果を述べています。'],
        ['新しい方法は便利でも、利用者が理解できなければ十分に活用されない。', '使いやすさには理解しやすさも必要だ', ['便利なら説明は不要だ', '利用者の理解は関係ない', '新しい方法は必ず失敗する'], '理解できることが活用につながります。'],
        ['数字だけを見ると好調でも、背景を確認しなければ判断を誤ることがある。', '数値の背景も確認すべきだ', ['数字は常に不要だ', '好調なら分析は不要だ', '背景は結論後に隠すべきだ'], '数字の背景を見る重要性が主旨です。'],
        ['経験の浅い人に任せる場合は、目的と判断基準を共有すると自律的に動きやすい。', '目的と基準の共有が自律を支える', ['細部だけを指示すればよい', '経験が浅い人には任せない', '判断基準は隠すべきだ'], '自律的に動くための共有事項を述べています。'],
        ['計画は立てるだけでなく、状況に応じて修正してこそ役に立つ。', '計画は柔軟に見直す必要がある', ['一度決めた計画は絶対に変えない', '計画は不要である', '修正は常に悪い'], '状況に応じた修正の必要性が主旨です。'],
        ['情報を多く集めても、目的に合わなければ判断材料としては弱い。', '目的に合う情報が重要だ', ['情報は多いほど必ずよい', '目的は後から決める', '判断材料は不要だ'], '量より目的適合性を重視しています。'],
        ['注意を受けたとき、内容を確認して行動を変えれば成長につながる。', '指摘を改善に生かすことが大切だ', ['注意は無視するべきだ', '行動は変えない方がよい', '確認は不要だ'], '注意を改善に使うことが主旨です。'],
        ['役割分担が明確だと、作業の抜け漏れや重複を減らせる。', '役割の明確化は効率化につながる', ['役割は曖昧な方がよい', '重複は常に必要だ', '作業は一人で行うべきだ'], '役割分担の効果を述べています。'],
        ['短い説明でも、相手が必要とする情報が含まれていれば十分に伝わる。', '説明は相手に必要な情報を含むことが大切だ', ['長ければ必ず伝わる', '相手の必要情報は無関係だ', '短い説明は必ず不足する'], '相手に必要な情報の有無が重要です。'],
        ['失敗を共有すると、個人を責めるためではなく再発防止の材料になる。', '失敗共有は再発防止に役立つ', ['失敗は隠すべきだ', '共有は責任追及だけが目的だ', '再発防止には関係ない'], '再発防止の材料になることが主旨です。'],
        ['成果が出た方法でも、環境が変われば同じ結果になるとは限らない。', '成功方法も状況に応じて見直す必要がある', ['成功方法は永久に同じ結果を出す', '環境変化は無視できる', '成果が出た方法は使えない'], '環境変化による見直しが必要です。'],
        ['相手に依頼するときは、期限と期待する成果を明確にすると認識のずれが減る。', '依頼では期限と成果を明確にするべきだ', ['依頼内容は曖昧でよい', '期限は伝えない方がよい', '成果の共有は不要だ'], '認識ずれを減らす方法を述べています。'],
        ['課題を細かく分けると、どこから着手すべきか判断しやすくなる。', '課題分解は着手判断を助ける', ['課題は大きいままがよい', '判断は難しくなる', '着手順は不要だ'], '課題を分ける効果が主旨です。'],
        ['一度で理解されない説明は、相手の反応を見て言い換えることも必要だ。', '相手に合わせて説明を調整するべきだ', ['同じ説明を繰り返すだけでよい', '反応は見なくてよい', '言い換えは避けるべきだ'], '相手の反応に応じた調整が大切です。'],
        ['忙しいときほど、作業を始める前に段取りを確認すると手戻りを減らせる。', '事前の段取り確認が手戻りを減らす', ['忙しいときは確認を省くべきだ', '手戻りは増えるほどよい', '段取りは作業後に決める'], '段取り確認の効果を述べています。'],
        ['同じ情報でも、相手の知識量によって伝え方を変える必要がある。', '相手に応じた説明が必要だ', ['誰にでも同じ表現が最適だ', '知識量は関係ない', '情報は伝えない方がよい'], '相手の知識量に合わせることが主旨です。'],
        ['目標が具体的だと、進捗を確認しやすく改善点も見つけやすい。', '具体的な目標は改善に役立つ', ['目標は曖昧な方がよい', '進捗確認はできなくなる', '改善点は不要だ'], '具体性と改善の関係を述べています。'],
        ['他者の成功事例は、そのまま真似るより自分の状況に合わせて取り入れる方がよい。', '成功事例は状況に合わせて活用する', ['必ずそのまま真似る', '成功事例は無価値だ', '自分の状況は考えない'], '状況に合わせた活用が主旨です。'],
        ['確認の回数を増やすだけではなく、確認する観点を決めることが品質向上につながる。', '確認の観点を決めることが重要だ', ['回数だけが重要だ', '観点は不要だ', '品質とは関係ない'], '確認の観点を決める重要性を述べています。'],
        ['問題が起きたときは、誰が悪いかより、なぜ起きたかを考える方が改善につながる。', '原因に注目することが改善につながる', ['責任追及だけが重要だ', '原因は考えない', '改善は不要だ'], '原因分析の重要性が主旨です。'],
        ['慣れた作業でも、条件が変わった場合は手順を確認する必要がある。', '条件変化時は手順確認が必要だ', ['慣れた作業は確認不要だ', '条件は常に同じだ', '手順は存在しない'], '条件が変わると確認が必要です。'],
        ['伝達ミスを防ぐには、口頭だけでなく記録を残すことも有効だ。', '記録は伝達ミス防止に役立つ', ['口頭だけで十分だ', '記録は常に害になる', '伝達ミスは防げない'], '記録を残す効果が主旨です。'],
        ['新しい案を評価するときは、利点だけでなく実行時の負担も考える必要がある。', '案の評価では負担も考慮するべきだ', ['利点だけ見ればよい', '実行負担は無関係だ', '新しい案は評価しない'], '利点と負担の両面を見ることが必要です。'],
        ['期限に間に合わせるには、完了条件を先に決めておくと迷いが少なくなる。', '完了条件の明確化が進行を助ける', ['完了条件は最後に考える', '迷いは増えるほどよい', '期限は不要だ'], '完了条件を先に決める効果が主旨です。']
    ];

    for (const [prompt, answer, choices, explanation] of comprehensionQuestions) {
        questions.push(makeChoiceQuestion(id, '文意把握', prompt, answer, choices, explanation));
        id++;
    }

    return questions.slice(0, SPI_TOTAL_QUESTIONS);
}

function normalizeSpiStats(player) {
    const stats = player && player.spiStats ? player.spiStats : {};
    if (stats.bankVersion !== SPI_BANK_VERSION) {
        return {
            bankVersion: SPI_BANK_VERSION,
            attempted: 0,
            correct: 0,
            earnedPoints: 0,
            answeredQuestionIds: [],
            lastAnsweredAt: null
        };
    }
    const answeredIds = Array.isArray(stats.answeredQuestionIds) ? stats.answeredQuestionIds : [];
    const attempted = Number(stats.attempted || answeredIds.length || 0);
    const correct = Number(stats.correct || 0);
    return {
        bankVersion: SPI_BANK_VERSION,
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

function normalizeSpiQuestionStats(stats) {
    return Array.isArray(stats) ? stats : [];
}

async function saveSpiQuestionAnswerStat(question, isCorrect) {
    const existingStats = await fetchSpiQuestionStats().catch(error => {
        console.warn('SPI集計の取得に失敗しました。ポイント付与は継続します。', error);
        return [];
    });
    const nextStats = normalizeSpiQuestionStats(existingStats).map(item => ({ ...item }));
    const index = nextStats.findIndex(item => item.id === question.id);
    const current = index >= 0 ? nextStats[index] : {
        id: question.id,
        domain: question.domain,
        category: question.category,
        prompt: question.prompt,
        attempts: 0,
        correct: 0
    };

    const updated = {
        ...current,
        domain: question.domain,
        category: question.category,
        prompt: question.prompt,
        attempts: Number(current.attempts || 0) + 1,
        correct: Number(current.correct || 0) + (isCorrect ? 1 : 0),
        updatedAt: new Date().toISOString()
    };

    await saveSpiQuestionStat(updated).catch(error => {
        console.warn('SPI集計の保存に失敗しました。ポイント付与は完了しています。', error);
    });
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
            bankVersion: SPI_BANK_VERSION,
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
        await saveSpiQuestionAnswerStat(currentSpiQuestion, isCorrect);
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
