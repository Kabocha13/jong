// 航海 (大海賊の航海日誌) の物語。章ごとのアニメ風の寸劇と、それを見せる仕組み。
//   台本 (VG_EPISODES) は「拍 (beat)」の並び。背景・人物の出入り・効果は自動で進み、台詞・字幕・題字はタップで進む。
//   登場人物: ハク (船長。表情は assets/img/voyage/face-*.png)、ポン (オウム parrot.png)、
//   チュン (赤ひげの前船長 = 海軍提督)、ハツ (緑旗の女海賊 = ハクの姉)。チュン・ハツは絵が無いあいだは影 (シルエット) で出し、
//   assets/img/voyage/chun.png・hatsu.png を置けばそれを使う。背景は bg-01.jpg〜bg-12.jpg (無いあいだは章ごとの色)。
//   拍の書き方:
//     { title, sub }            題字 (章の名前)
//     { bg: 1 }                 背景を章 n のものに
//     { caption: '…' }          字幕 (ナレーション)
//     { enter: 'haku', side: 'left', face: 'smile' } / { exit: 'haku' }
//     { say: 'haku', text: '…', face: 'angry' }   台詞 (face はハクの表情)
//     { fx: 'flash' | 'shake' | 'lightning' | 'dark' | 'fog' | 'red' | 'coins' | 'gold' }
//     { pause: ms }
//     { next: '…' }             次回予告 (終わり)。{ fin: '…' } は最終回の結び
//   game-voyage.js からは hasVoyageEpisode(no) と playVoyageEpisode(no) (Promise) を使う。

const VG_CAST = {
    haku: { name: 'ハク', kind: 'face', tone: 'gold' },
    pon: { name: 'ポン', kind: 'img', src: 'assets/img/voyage/parrot.png', tone: 'red' },
    chun: { name: 'チュン', kind: 'silhouette', src: 'assets/img/voyage/chun.png', tile: '中', tone: 'red' },
    hatsu: { name: 'ハツ', kind: 'silhouette', src: 'assets/img/voyage/hatsu.png', tile: '發', tone: 'green' },
    mob: { name: '酒場の男', kind: 'silhouette', src: '', tile: '', tone: 'grey' }
};
const VG_TYPE_MS = 34;   // 台詞を1文字ずつ出す速さ

const VG_EPISODES = {
    1: { title: '第1章', sub: '形見の金貨', beats: [
        { bg: 1 },
        { title: '第1章', sub: '形見の金貨' },
        { caption: '港町。船長チュンが海に消えて、ちょうど一年。' },
        { enter: 'haku', side: 'left', face: 'smile' },
        { say: 'haku', face: 'smile', text: '一年か。早いもんだな、チュン。' },
        { enter: 'pon', side: 'right' },
        { say: 'pon', text: '「ハクハ、オレノ、ムスコ、ジャナイ」' },
        { say: 'haku', face: 'angry', text: 'またそれか。チュンの口癖を覚えすぎだぞ、ポン。' },
        { say: 'haku', face: 'sad', text: '形見はこの金貨一枚。「1715」……お前が何を探していたのか、俺は結局聞けなかった。' },
        { fx: 'coins' },
        { say: 'haku', face: 'angry', text: '決めた。俺が探す。チュンの航路を、この金貨の行き先を。' },
        { exit: 'pon' },
        { caption: '酒場の隅。男が金貨を見て、グラスを置いた。' },
        { enter: 'mob', side: 'right' },
        { say: 'mob', text: '……あの金貨。間違いない。' },
        { say: 'mob', text: '提督にお知らせしろ。「金貨1715」が、港に出た。' },
        { fx: 'dark' },
        { next: '第2章「霧の海峡」── 霧の向こうの旗艦に、見覚えのある赤ひげが' }
    ] },
    2: { title: '第2章', sub: '霧の海峡', beats: [
        { bg: 2 },
        { title: '第2章', sub: '霧の海峡' },
        { fx: 'fog' },
        { caption: '出港三日目。海峡は深い霧に沈んでいた。' },
        { enter: 'haku', side: 'left', face: 'surprise' },
        { say: 'haku', face: 'surprise', text: '後ろだ。帆の影が……ひとつ、ふたつ。艦隊だ。' },
        { enter: 'pon', side: 'right' },
        { say: 'pon', text: '「ミギ、ニジュウド。イワ、ヨケロ」' },
        { say: 'haku', face: 'surprise', text: '……今の。チュンの声だったぞ。' },
        { say: 'pon', text: '「ハク、シンジロ」' },
        { say: 'haku', face: 'angry', text: '面舵二十度！ 信じるぞ、ポン！' },
        { fx: 'shake' },
        { caption: '岩礁すれすれ。艦隊の追跡が止まった。' },
        { say: 'haku', face: 'laugh', text: '抜けた！ お前、本当に何者なんだ、ポン。' },
        { caption: '霧が晴れる。旗艦の艦橋に、男がひとり。' },
        { exit: 'pon' },
        { fx: 'lightning' },
        { enter: 'chun', side: 'right' },
        { say: 'haku', face: 'surprise', text: '……赤ひげ。嘘だろ。死んだはずの、チュン──' },
        { next: '第3章「商船団」── 拿捕した商船の書類。署名は「提督 チュン」' }
    ] },
    3: { title: '第3章', sub: '商船団', beats: [
        { bg: 3 },
        { title: '第3章', sub: '商船団' },
        { caption: '一週間後。航路で商船団と鉢合わせた。' },
        { enter: 'haku', side: 'left', face: 'smile' },
        { say: 'haku', face: 'smile', text: '荷は奪わない。通してやる。……と言いたいが、積荷は改めさせてもらう。' },
        { enter: 'pon', side: 'right' },
        { say: 'pon', text: '「カネ、カネ、カネ」' },
        { say: 'haku', face: 'angry', text: 'お前は黙ってろ。' },
        { caption: '積荷は、海軍の機密書類だった。' },
        { say: 'haku', face: 'surprise', text: '「金貨1715を持つ者を生け捕れ。殺すな」……俺のことか。' },
        { say: 'haku', face: 'angry', text: '殺すな、だと？ 海賊に優しい海軍があるか。' },
        { caption: '書類の最後の行。' },
        { fx: 'flash' },
        { say: 'haku', face: 'angry', text: '署名──「提督 チュン」。' },
        { say: 'haku', face: 'sad', text: '生きてたんだな。生きてて、海軍にいて、俺を追ってる。' },
        { say: 'pon', text: '「ハク、マモル」' },
        { say: 'haku', face: 'sad', text: '何を守るって？ ……誰を。' },
        { next: '第4章「幽霊船」── 流れ着いた船の名は、チュンの旧船' }
    ] },
    4: { title: '第4章', sub: '幽霊船', beats: [
        { bg: 4 },
        { title: '第4章', sub: '幽霊船' },
        { fx: 'lightning' },
        { caption: '十月の終わり。嵐の夜、灯りのない船が漂っていた。' },
        { enter: 'haku', side: 'left', face: 'surprise' },
        { say: 'haku', face: 'surprise', text: '船名が読める。「レッドビアード号」……チュンの船だ。' },
        { enter: 'pon', side: 'right' },
        { say: 'pon', text: '「カエレ、カエレ」' },
        { say: 'haku', face: 'angry', text: '帰れるか。乗り込むぞ。' },
        { fx: 'dark' },
        { caption: '船室。チュンの日記が残されていた。' },
        { say: 'haku', face: 'smile', text: '「海軍は私の過去を知った。私を使ってハクを捕らえる気だ。ならば、私が死ねばいい」' },
        { say: 'haku', face: 'surprise', text: '「死を偽る。ハクを守るために。あの子はまだ、知らなくていい」' },
        { say: 'haku', face: 'sad', text: '守るためって……俺に黙って、死んだことにしたのか。' },
        { fx: 'shake' },
        { say: 'haku', face: 'surprise', text: '最後のページが、破られてる。' },
        { say: 'pon', text: '「サイゴノ ページ。ワタシガ、タベ──」' },
        { say: 'haku', face: 'angry', text: '食べたのか！？' },
        { next: '第5章「無人島」── 金貨の骸骨の目に光を通すと、島影が浮かぶ' }
    ] },
    5: { title: '第5章', sub: '無人島', beats: [
        { bg: 5 },
        { title: '第5章', sub: '無人島' },
        { caption: '日記にあった緯度。目印は「骸骨の目」。' },
        { enter: 'haku', side: 'left', face: 'smile' },
        { say: 'haku', face: 'surprise', text: '金貨を灯りにかざすと……骸骨の目から光が漏れる。島だ。この影の形の島。' },
        { fx: 'flash' },
        { caption: '三日後、無人島。' },
        { enter: 'pon', side: 'right' },
        { say: 'haku', face: 'laugh', text: '掘れ掘れ！ チュンの秘密はここだ！' },
        { say: 'pon', text: '「カラ。カラ」' },
        { say: 'haku', face: 'surprise', text: '……空っぽ。穴の底に、何もない。' },
        { caption: 'いや、ひとつだけ。' },
        { fx: 'red' },
        { say: 'haku', face: 'angry', text: '短剣。緑の旗の紋──「緑旗のハツ」。先回りされた。' },
        { say: 'haku', face: 'angry', text: 'ハツ。チュンの元・一等航海士。なんであいつが、ここを知ってる。' },
        { next: '第6章「海軍の砲火」── チュン艦隊と正面衝突。ポンが撃たれる' }
    ] },
    6: { title: '第6章', sub: '海軍の砲火', beats: [
        { bg: 6 },
        { title: '第6章', sub: '海軍の砲火' },
        { caption: '無人島を出た翌朝。水平線いっぱいの艦隊。' },
        { enter: 'haku', side: 'left', face: 'angry' },
        { enter: 'chun', side: 'right' },
        { say: 'chun', text: 'ハク。金貨を渡せ。渡せば船は沈めない。' },
        { say: 'haku', face: 'angry', text: '死んだふりして海軍に戻って、今さら父親づらか！' },
        { say: 'chun', text: '父親？ ……お前は、俺の息子じゃない。' },
        { fx: 'shake' },
        { say: 'haku', face: 'surprise', text: '……え。' },
        { say: 'chun', text: '撃て。' },
        { fx: 'lightning' },
        { exit: 'chun' },
        { caption: '砲弾が帆柱を折る。赤い羽根が、海へ落ちた。' },
        { say: 'haku', face: 'sad', text: 'ポン！！ ポン──！' },
        { fx: 'dark' },
        { caption: '嵐に紛れて離脱。ポンは、海に消えた。' },
        { exit: 'haku' },
        { caption: 'その夜。沈むオウムをすくい上げた手があった。緑の旗の船。' },
        { enter: 'hatsu', side: 'right' },
        { say: 'hatsu', text: '……チュンの鳥じゃない。まだ生きてる？' },
        { next: '第7章「人魚の入り江」── 敵のはずのハツが語る、もうひとつの真実' }
    ] },
    7: { title: '第7章', sub: '人魚の入り江', beats: [
        { bg: 7 },
        { title: '第7章', sub: '人魚の入り江' },
        { caption: '傷ついた船で逃げ込んだ入り江。そこに、緑の旗がいた。' },
        { enter: 'haku', side: 'left', face: 'angry' },
        { enter: 'hatsu', side: 'right' },
        { say: 'hatsu', text: '鳥を返しに来た。礼はいらない。……ついでに、話をしよう。' },
        { say: 'haku', face: 'angry', text: '短剣を置いていったのはお前だな。あの島で何を掘った。' },
        { say: 'hatsu', text: '何も。あそこは最初から空だった。チュンが掘り返したのは、私たちが生まれる前よ。' },
        { say: 'haku', face: 'angry', text: 'チュンは海軍に寝返った。それだけの話だ。' },
        { say: 'hatsu', text: '逆よ。チュンは寝返ってなんかいない。「海軍にいた男が、海賊になった」の。' },
        { say: 'haku', face: 'surprise', text: '……' },
        { say: 'hatsu', text: 'チュンは最初から海軍の提督。妻を亡くして、娘と赤ん坊を残して海に出た。その赤ん坊が──' },
        { say: 'haku', face: 'sad', text: 'やめろ。' },
        { fx: 'gold' },
        { say: 'hatsu', text: '私はあんたの姉よ、ハク。' },
        { next: '第8章「氷の海」── 姉弟で北へ。ポンが新しい言葉を喋る' }
    ] },
    8: { title: '第8章', sub: '氷の海', beats: [
        { bg: 8 },
        { title: '第8章', sub: '氷の海' },
        { caption: '姉弟で北へ。流氷が、船を押し戻す。' },
        { enter: 'haku', side: 'left', face: 'sad' },
        { enter: 'hatsu', side: 'right' },
        { say: 'hatsu', text: '母さんが死んで、父さん──チュンは壊れた。海軍の仕事で、何年も家に帰らなかった。' },
        { say: 'hatsu', text: 'だから私はあんたを連れて家を出た。七つの私と、赤ん坊のあんたで。' },
        { say: 'haku', face: 'sad', text: 'それで海賊に拾われた、と思ってた。拾ったのは、チュン本人だったのか。' },
        { say: 'hatsu', text: '自分の子を取り戻すために、提督は海賊になった。それがチュン。' },
        { say: 'haku', face: 'surprise', text: 'じゃあ「俺の息子じゃない」ってのは……' },
        { say: 'hatsu', text: '海軍の前で言わなきゃ、あんたは人質にされてた。' },
        { exit: 'hatsu' },
        { caption: '氷の夜。羽根の生えそろったポンが、初めて違う言葉を喋った。' },
        { enter: 'pon', side: 'right' },
        { say: 'pon', text: '「タカラハ、サイショカラ──」' },
        { say: 'haku', face: 'surprise', text: '最初から、何だ？ ポン、続きは！' },
        { say: 'pon', text: '「……」' },
        { next: '第9章「決戦」── ハツがハクを裏切る' }
    ] },
    9: { title: '第9章', sub: '決戦', beats: [
        { bg: 9 },
        { title: '第9章', sub: '決戦' },
        { caption: '十一月の終わり。南へ戻る海で、再び艦隊に囲まれた。' },
        { enter: 'haku', side: 'left', face: 'angry' },
        { enter: 'chun', side: 'right' },
        { say: 'chun', text: '二度目はない。金貨を。' },
        { say: 'haku', face: 'angry', text: '来い！ 一騎打ちだ、チュン！' },
        { fx: 'shake' },
        { caption: '剣が交わる。だが、背後で──' },
        { exit: 'chun' },
        { enter: 'hatsu', side: 'right' },
        { say: 'hatsu', text: 'ごめんね、ハク。' },
        { fx: 'red' },
        { say: 'haku', face: 'surprise', text: 'ハツ……？' },
        { caption: 'ハツはハクから金貨を奪い、チュンに差し出した。' },
        { say: 'hatsu', text: '提督。金貨1715。約束の報酬を。' },
        { exit: 'hatsu' },
        { enter: 'chun', side: 'right' },
        { say: 'chun', text: '……よくやった。' },
        { fx: 'dark' },
        { exit: 'chun' },
        { caption: 'ハクは牢へ。格子の向こうで、ハツが囁いた。' },
        { enter: 'hatsu', side: 'right' },
        { say: 'hatsu', text: 'ねえ。金貨、よく見た？ 数字は年号じゃない。あんたが毎晩飲んでた、酒場の看板よ。' },
        { next: '第10章「逆さの地図」── 「1715」の正体。盤が逆回りになる' }
    ] },
    10: { title: '第10章', sub: '逆さの地図', beats: [
        { bg: 10 },
        { title: '第10章', sub: '逆さの地図' },
        { fx: 'dark' },
        { caption: '牢の中。ハツの言葉が回る。' },
        { enter: 'haku', side: 'left', face: 'sad' },
        { say: 'haku', face: 'sad', text: '酒場の看板……「1715」。創業の年だとばかり思ってた。' },
        { say: 'haku', face: 'surprise', text: '違う。金貨の縁の刻み目──三十。俺たちが回ってきた海の数だ。' },
        { fx: 'flash' },
        { say: 'haku', face: 'surprise', text: '地図は円だったんだ。どこまで行っても港に帰る。宝は──出発した場所。' },
        { caption: '格子が、音を立てて開いた。' },
        { enter: 'hatsu', side: 'right' },
        { say: 'hatsu', text: '芝居に付き合わせて悪かったわね。チュンを港へ誘き出すには、これしかなかった。' },
        { say: 'haku', face: 'angry', text: '殴りたい。' },
        { say: 'haku', face: 'laugh', text: '……けど、ありがとう。' },
        { say: 'hatsu', text: '船は港へ向けてある。風は逆。帰り道よ。' },
        { caption: '海賊船は、来た道を逆にたどり始めた。' },
        { next: '第11章「宝島は港だった」── 酒場の地下で、三人と一羽が対峙する' }
    ] },
    11: { title: '第11章', sub: '宝島は港だった', beats: [
        { bg: 11 },
        { title: '第11章', sub: '宝島は港だった' },
        { caption: '十二月。港町。酒場「1715」の地下。' },
        { enter: 'haku', side: 'left', face: 'smile' },
        { say: 'haku', face: 'surprise', text: '樽の下……床板が違う。ここだ。' },
        { fx: 'flash' },
        { caption: '石段の先に、鉄の扉。そして、先客。' },
        { enter: 'chun', side: 'right' },
        { say: 'chun', text: '……早かったな。' },
        { say: 'haku', face: 'angry', text: '父さん。' },
        { say: 'chun', text: '…………' },
        { enter: 'hatsu', side: 'right' },
        { say: 'hatsu', text: '二人とも、剣を下ろして。' },
        { say: 'chun', text: '俺はこの宝を、海軍にもお前たちにも渡したくなかった。だから死んだことにした。' },
        { say: 'chun', text: '一七一五年に沈んだ艦隊の金。これを追った者はみんな死んだ。……母さんも。' },
        { say: 'haku', face: 'sad', text: '母さんが……' },
        { fx: 'gold' },
        { say: 'chun', text: '俺が守りたかったのは金じゃない。お前たち二人だ。……言うのが、遅すぎたが。' },
        { exit: 'hatsu' },
        { enter: 'pon', side: 'right' },
        { say: 'pon', text: '「タカラハ、サイショカラ、ココニ」' },
        { caption: '冬至まで、あと七日。' },
        { next: '最終日「冬至の夜」── 扉が開く' }
    ] },
    12: { title: '最終日', sub: '冬至の夜', beats: [
        { bg: 12 },
        { title: '最終日', sub: '冬至の夜' },
        { caption: '十二月二十一日。一年でいちばん長い夜。' },
        { enter: 'haku', side: 'left', face: 'smile' },
        { say: 'haku', face: 'smile', text: '鍵は金貨だった。骸骨の目に、はめる。' },
        { fx: 'flash' },
        { fx: 'coins' },
        { caption: '扉の向こう。一七一五年の金が、ランタンの光で燃えるように光った。' },
        { say: 'haku', face: 'laugh', text: '……でかい。' },
        { enter: 'hatsu', side: 'right' },
        { say: 'hatsu', text: '山分けよ。航海した分だけ。それが海賊のやり方。' },
        { exit: 'hatsu' },
        { enter: 'chun', side: 'right' },
        { say: 'chun', text: '海軍は辞めてきた。提督の席より、お前たちと同じ船のほうがいい。' },
        { say: 'haku', face: 'smile', text: '乗せてやる。見習いからだ。' },
        { say: 'chun', text: '……生意気な。' },
        { exit: 'chun' },
        { enter: 'pon', side: 'right' },
        { say: 'pon', text: '「ツギハ、ドコヘ」' },
        { say: 'haku', face: 'laugh', text: '風の向くほうへ。──出港！' },
        { fx: 'gold' },
        { fin: '大海賊の航海日誌 ─ 完 ─\n最終秘宝は 12/22 0:10 に、航海した分の比で山分けされます。ご乗船ありがとうございました。' }
    ] }
};

function hasVoyageEpisode(no) {
    return Object.hasOwn(VG_EPISODES, Number(no));
}

function vgEpisodeTitle(no) {
    const episode = VG_EPISODES[Number(no)];
    return episode ? `${episode.title} ${episode.sub}` : '';
}

/** 人物の要素を作る (絵が無ければ影) */
function vgCreateActor(id) {
    const cast = VG_CAST[id];
    const figure = document.createElement('figure');
    figure.className = `vg-actor is-${id} is-${cast.tone}`;
    figure.dataset.actor = id;
    if (cast.kind === 'face') {
        const img = document.createElement('img');
        img.className = 'vg-actor-img';
        img.src = 'assets/img/voyage/face-smile.png';
        img.alt = cast.name;
        figure.appendChild(img);
    } else if (cast.kind === 'img') {
        const img = document.createElement('img');
        img.className = 'vg-actor-img';
        img.src = cast.src;
        img.alt = cast.name;
        figure.appendChild(img);
    } else {
        const sil = document.createElement('div');
        sil.className = 'vg-sil';
        sil.innerHTML = '<span class="vg-sil-hat"></span><span class="vg-sil-head"></span><span class="vg-sil-body"></span>';
        if (cast.tile) sil.appendChild(modeText('span', 'vg-sil-tile', cast.tile));
        figure.appendChild(sil);
        if (cast.src) {
            // 絵が置かれていればそれを使い、影は消す
            const img = document.createElement('img');
            img.className = 'vg-actor-img hidden';
            img.alt = cast.name;
            img.addEventListener('load', () => { img.classList.remove('hidden'); sil.classList.add('hidden'); });
            img.addEventListener('error', () => img.remove());
            img.src = cast.src;
            figure.appendChild(img);
        }
    }
    figure.appendChild(modeText('figcaption', 'vg-actor-name', cast.name));
    return figure;
}

/**
 * 章 no の物語を画面いっぱいに見せる。終わるかスキップされたら解決する。
 * タップで進む (文字を出している途中なら全部出す)。「スキップ」で閉じる
 */
function playVoyageEpisode(no) {
    const episode = VG_EPISODES[Number(no)];
    if (!episode) return Promise.resolve();
    return new Promise(resolve => {
        const root = document.createElement('div');
        root.className = 'vg-story';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', vgEpisodeTitle(no));
        root.innerHTML = `
            <div class="vg-story-bg" aria-hidden="true"><img class="vg-story-bg-img" alt=""><div class="vg-story-bg-veil"></div></div>
            <div class="vg-story-fx" aria-hidden="true"></div>
            <div class="vg-story-stage" aria-hidden="true"></div>
            <div class="vg-story-title hidden"><p class="vg-story-title-no"></p><p class="vg-story-title-sub"></p></div>
            <p class="vg-story-caption hidden"></p>
            <div class="vg-story-box hidden"><p class="vg-story-name"></p><p class="vg-story-text"></p><span class="vg-story-more" aria-hidden="true">▼</span></div>
            <div class="vg-story-end hidden"><p class="vg-story-end-head"></p><p class="vg-story-end-text"></p></div>
            <button type="button" class="vg-story-skip">スキップ</button>
            <p class="vg-story-hint">タップで進む</p>`;
        document.body.appendChild(root);
        document.body.classList.add('vg-story-open');

        const bgImg = root.querySelector('.vg-story-bg-img');
        const stage = root.querySelector('.vg-story-stage');
        const titleBox = root.querySelector('.vg-story-title');
        const caption = root.querySelector('.vg-story-caption');
        const box = root.querySelector('.vg-story-box');
        const nameEl = root.querySelector('.vg-story-name');
        const textEl = root.querySelector('.vg-story-text');
        const endBox = root.querySelector('.vg-story-end');
        const fxLayer = root.querySelector('.vg-story-fx');
        const actors = new Map();
        let index = 0;
        let typing = null;       // 文字を出している途中の { text, resolveNow }
        let waiting = false;     // タップ待ち
        let closed = false;

        const close = () => {
            if (closed) return;
            closed = true;
            root.classList.add('is-leaving');
            document.body.classList.remove('vg-story-open');
            setTimeout(() => {
                root.remove();
                resolve();
            }, 320);
        };

        const setBg = n => {
            root.dataset.chapter = String(n);
            bgImg.classList.remove('is-ready');
            bgImg.onload = () => bgImg.classList.add('is-ready');
            bgImg.onerror = () => bgImg.classList.remove('is-ready');
            bgImg.src = `assets/img/voyage/bg-${String(n).padStart(2, '0')}.jpg`;
            restartClass(root.querySelector('.vg-story-bg'), 'is-pan');
        };

        const setFace = (id, face) => {
            const actor = actors.get(id);
            if (!actor || VG_CAST[id].kind !== 'face' || !face) return;
            const img = actor.querySelector('.vg-actor-img');
            if (!img.src.endsWith(`face-${face}.png`)) img.src = `assets/img/voyage/face-${face}.png`;
        };

        const enter = (id, side = 'left', face = null) => {
            let actor = actors.get(id);
            if (!actor) {
                actor = vgCreateActor(id);
                actors.set(id, actor);
                stage.appendChild(actor);
            }
            actor.dataset.side = side;
            actor.classList.remove('is-out');
            restartClass(actor, 'is-in');
            setFace(id, face);
        };

        const exit = id => {
            const actor = actors.get(id);
            if (!actor) return;
            actor.classList.add('is-out');
            actors.delete(id);
            setTimeout(() => actor.remove(), 500);
        };

        const spotlight = id => {
            actors.forEach((actor, key) => {
                actor.classList.toggle('is-speaking', key === id);
                actor.classList.toggle('is-dim', Boolean(id) && key !== id);
            });
            if (id) restartClass(actors.get(id), 'is-bounce');
        };

        const runFx = kind => {
            if (prefersReducedMotion() && kind !== 'dark' && kind !== 'fog') return;
            const node = document.createElement('div');
            node.className = `vg-story-fx-item is-${kind}`;
            fxLayer.appendChild(node);
            if (kind === 'shake') restartClass(root, 'is-shake');
            if (kind === 'coins') burstCoins(50, stage);
            if (kind === 'lightning') buzz([60, 40, 120]);
            setTimeout(() => node.remove(), kind === 'fog' || kind === 'dark' ? 6000 : 1200);
        };

        const typeText = text => new Promise(resolveTyping => {
            textEl.textContent = '';
            box.classList.remove('is-done');
            if (prefersReducedMotion()) {
                textEl.textContent = text;
                box.classList.add('is-done');
                resolveTyping();
                return;
            }
            let i = 0;
            const finish = () => {
                clearInterval(timer);
                textEl.textContent = text;
                box.classList.add('is-done');
                typing = null;
                resolveTyping();
            };
            const timer = setInterval(() => {
                i += 1;
                textEl.textContent = text.slice(0, i);
                if (i >= text.length) finish();
            }, VG_TYPE_MS);
            typing = { finish };
        });

        const hideAll = () => {
            titleBox.classList.add('hidden');
            caption.classList.add('hidden');
            box.classList.add('hidden');
            endBox.classList.add('hidden');
        };

        /** 次の拍へ。自動で進む拍は続けて処理し、タップ待ちの拍で止まる */
        const step = async () => {
            while (!closed && index < episode.beats.length) {
                const beat = episode.beats[index++];
                if (beat.bg) { setBg(beat.bg); continue; }
                if (beat.enter) { enter(beat.enter, beat.side, beat.face); continue; }
                if (beat.exit) { exit(beat.exit); continue; }
                if (beat.fx) { runFx(beat.fx); await delay(beat.fx === 'lightning' || beat.fx === 'flash' ? 500 : 250); continue; }
                if (beat.pause) { await delay(beat.pause); continue; }
                if (beat.title) {
                    hideAll();
                    spotlight(null);
                    titleBox.querySelector('.vg-story-title-no').textContent = beat.title;
                    titleBox.querySelector('.vg-story-title-sub').textContent = beat.sub || '';
                    titleBox.classList.remove('hidden');
                    restartClass(titleBox, 'is-in');
                    window.playGameSound?.('nrUp');
                    waiting = true;
                    return;
                }
                if (beat.caption) {
                    hideAll();
                    spotlight(null);
                    caption.textContent = beat.caption;
                    caption.classList.remove('hidden');
                    restartClass(caption, 'is-in');
                    waiting = true;
                    return;
                }
                if (beat.say) {
                    hideAll();
                    if (!actors.has(beat.say)) enter(beat.say, beat.say === 'haku' ? 'left' : 'right', beat.face);
                    setFace(beat.say, beat.face);
                    spotlight(beat.say);
                    box.classList.remove('hidden');
                    box.dataset.actor = beat.say;
                    nameEl.textContent = VG_CAST[beat.say].name;
                    waiting = true;
                    await typeText(beat.text);
                    return;
                }
                if (beat.next || beat.fin) {
                    hideAll();
                    spotlight(null);
                    endBox.querySelector('.vg-story-end-head').textContent = beat.fin ? '' : 'つづく';
                    endBox.querySelector('.vg-story-end-text').textContent = beat.next || beat.fin;
                    endBox.classList.toggle('is-fin', Boolean(beat.fin));
                    endBox.classList.remove('hidden');
                    restartClass(endBox, 'is-in');
                    if (beat.fin) window.qjongTreasureRain?.preview(6000);
                    waiting = true;
                    return;
                }
            }
            if (!closed) close();
        };

        root.addEventListener('click', event => {
            if (event.target.closest('.vg-story-skip')) {
                close();
                return;
            }
            if (typing) {
                typing.finish();
                return;
            }
            if (!waiting) return;
            waiting = false;
            if (index >= episode.beats.length) {
                close();
                return;
            }
            step();
        });
        root.querySelector('.vg-story-skip').addEventListener('click', close);
        step();
    });
}
