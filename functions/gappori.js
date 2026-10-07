// 宝探しのルール (Firestore には触らない)。
// 乱数は呼び出し側から randomInt(n) → 0〜n-1 の整数 として受け取る。
//
// ルール
//   回る盤面に16マス。15マスにお宝の絵柄 (毎回10種類から5種類。55.5 までは6種類)、1マスは船長。
//   2% の回はゴールド盤 (56.1〜): お宝は4種類だけで、1種類6マスまで (ルーレットは金色)。
//   絵柄ごとのマスの数も毎回変わるが、レア度の順 (錨 ≥ オウム ≥ 舵輪 ≥ ラム酒 ≥ 望遠鏡 ≥ 宝の地図 ≥ 羅針盤 ≥ 大砲 ≥ 金貨 ≥ 宝箱) は守る。
//   ドクロ旗 (55.5〜。54.19〜55.4 は盤面に出る「海賊旗」だった) は盤面には出さず、単品でだけ賭ける (1口 GAPPORI_FLAG_PRICE)。
//   船長マスの回の JP ルーレットのドクロ旗のマスに止まったら当たりで、倍率はそのとき ×50〜×99 から均等に1つ引く (55.6 までは ×1〜×99)
//   (その回のドクロ旗の券は全部同じ倍率)。当たる確率は ドクロ旗のマスの数 × 5/16 ÷ 16 (56.6〜は3マスで ≒ 5.86%、還元率は 約455% (配当 436.5% + JP 積立 18.8%)。55.5 の1マスのときは 約155%)。
//   同じ絵柄のマスは盤面の上でまとまって並ぶ (並ぶ順と船長マスの位置は毎回ランダム)。
//   5球がそれぞれ別のマスに入る。絵柄を2〜5個予想して何口でも買え (1口の値段は予想の個数で決まる)、
//   同じ絵柄を何個選んでもよい (その絵柄のマスの数まで。錨を2つ選んだら「錨のマスに2球」の予想)。
//   予想した絵柄ごとに、選んだ数だけ球が入れば当たり。配当の倍率は、その盤面での当たる確率から決める。
//   チャンス: 券ごとに、予想の個数で決まる確率 (GAPPORI_CHANCE_RATES) で、3球の時点でその券のまだ足りない絵柄を
//   1つ選び、「1球入ったこと」にできる (その券だけ。盤面は変わらない)。
//   船長マスに球が入るとチャンスタイム。5球が入ったあと、盤面が JP ルーレット (56.6〜: JP 1・お宝ゲット 2・ドクロ旗 3・
//   JP 2倍 1・JP 1/2 1・もう1球 2・スタンプ 6。以下は 56.5 までの内訳の経緯。16マス。JP 1マス・お宝ゲット 1マス・
//   ドクロ旗 1マス (55.5〜)・JP 2倍 1マス・JP 1/2 2マス (55.8〜。1/2 は 55.10 で2マスに)・
//   払い戻し2倍・もう1球・JP+???・JP−??? 1マスずつ (55.17〜)・ドクロ旗は 55.18 から 2マス・
//   スタンプ 5マス (55.19〜。55.21 で JP+??・JP−?? の2マスもスタンプにした。ハズレは無い)。generateGapporiJpWheel) に変わって1回だけ回る (55.2)。
//     JP 2倍・JP 1/2: 貯まっているジャックポット (この回の積立のあと) を2倍・半分にして持ち越す。
//     払い戻し2倍 (55.17〜): その回の当たりの券の払い戻しが2倍。
//     もう1球 (55.17〜): 盤面に6球目を入れる (まだ入っていないマスから)。その回の全員の券に効く。
//     JP+??? / JP−??? (55.17〜): ジャックポットに 100〜500 を足す / 引く (0 より下げない)。
//     JP+?? / JP−?? (55.18〜55.20。55.21 でスタンプにした): ジャックポットに 10〜99 を足す / 引く。
//     スタンプ (55.19〜。55.18 までのハズレ): その回に券を買った全員のスタンプカードに1つ押す。3つでハクを1回使える (56.3〜。56.2 までは10個で3回)。
//     ドクロ旗: ドクロ旗の券 (単品) が当たり。倍率は ×50〜×99 から引く。
//     JP: ジャックポットが当たり、その回に券を買った人で均等に分ける (54.5 まで賭けた額に応じて分けていた)。
//     お宝ゲット: 3球目のあとのお宝ゲットと同じで、その回の全員の券ごとに、まだ足りないお宝を1つ「1球入ったこと」にする
//       (球はもう残っていないので、あと1球で当たりだった券だけが当たりになる。選ぶのは自動。gapporiJpTreasureChoice)。
//     ハズレ: 何も起きない。ジャックポットは持ち越し。
//   (55.1 までは、船長マスで 5%〜50% (外れるたびに上がる) の確率でジャックポットを引いていた)
//   ジャックポットは外れた券の代金の GAPPORI_JACKPOT_LOST_RATE を 0 から貯めたもの
//   (外れた券は賭けの約91% なので、賭けの約9% がジャックポットで戻る)。
//   還元率は 配当 GAPPORI_BASE_RETURNS (チャンスも含めて) + JP 積立 (× GAPPORI_JP_FUND_FACTOR) + JP ルーレットのお宝ゲット = どの個数でも GAPPORI_TARGET_RETURN (105%)
//   (正確な値は tools/gappori-sim.mjs で測る)

/** 盤面に並べる絵柄。レア度の順 (前ほど多く、後ろほど少なく並べる)。舵輪・望遠鏡・大砲は 54.19 で足した (海賊旗は 55.5 でドクロ旗にして外した) */
export const GAPPORI_SYMBOLS = ['anchor', 'parrot', 'helm', 'rum', 'telescope', 'map', 'compass', 'cannon', 'coin', 'chest'];
// ドクロ旗 (盤面には出さず、単品でだけ賭ける。JP ルーレットのドクロ旗のマスで当たり)
export const GAPPORI_FLAG = 'flag';
export const GAPPORI_FLAG_PRICE = 1000;      // 1口の値段
export const GAPPORI_FLAG_ODDS_MIN = 50;     // 当たったときに引く倍率の範囲 (均等。55.7 で ×1〜 → ×50〜)
export const GAPPORI_FLAG_ODDS_MAX = 99;
export const GAPPORI_CAPTAIN = 'captain';
const GAPPORI_NAMES = {
  anchor: '錨', parrot: 'オウム', helm: '舵輪', rum: 'ラム酒', telescope: '望遠鏡', map: '宝の地図',
  compass: '羅針盤', cannon: '大砲', coin: '金貨', chest: '宝箱', flag: 'ドクロ旗'
};
export const GAPPORI_KINDS = 5;              // 1回の盤面に並べる絵柄の種類 (55.6 で 6 → 5)
export const GAPPORI_SYMBOL_POCKETS = 15;    // 絵柄のマス (ほかに船長が1マス)
export const GAPPORI_MAX_PER_KIND = 5;       // 1つの絵柄のマスの数の上限 (55.16 で 4 → 5。内訳は 5通り → 12通り)
export const GAPPORI_BALLS = 5;
// ジャックポットが貯まってきたら、船長マスに球が入りやすくする (55.22〜。内部だけの調整で、プレイヤーには見せない)
export const GAPPORI_CAPTAIN_BOOST_FROM = 3000;   // これを超えたら重みを上げ始める
export const GAPPORI_CAPTAIN_BOOST_FULL = 30000;  // ここで最大の重み
export const GAPPORI_CAPTAIN_BOOST_MAX = 3;       // 最大で、ほかのマスの何倍入りやすくするか
export const GAPPORI_FIRST_BALLS = 3;        // チャンスはこの数の球が入ったあと
export const GAPPORI_PICKS_MIN = 2;
export const GAPPORI_PICKS_MAX = 5;
// 1口の値段 (予想の個数ごと)。倍率はこの値段に対してかかる
export const GAPPORI_UNIT_PRICES = { 2: 10, 3: 50, 4: 100, 5: 200 };
// 1枚の券で買える口数の上限は 55.20 で無くした (54.x〜55.19 は 50口)。使えるレートの範囲でいくらでも買える
export const GAPPORI_MAX_TICKETS = 20;       // 1回に1人が買える券 (セット) の数
// 配当の設計値 (予想の個数ごと。3球目のあとのお宝ゲットも含めた、払い戻しの期待値 ÷ 賭けた額)。
// 配当 + JP ルーレットのお宝ゲット + JP 積立 (外れた券の代金の1割) が、どの個数でもちょうど GAPPORI_TARGET_RETURN に
// なるよう tools/gappori-return.mjs で決めた値 (本日のおすすめの倍率アップは含めない)
export const GAPPORI_TARGET_RETURN = 1.05;
export const GAPPORI_BASE_RETURNS = { 2: 0.8717, 3: 0.7963, 4: 0.7418, 5: 0.7166 };   // 合計 2個 105.17%・3個 105.01%・4個 105.00%・5個 105.00% (おすすめ・ドクロ旗・もう1球は含めない。倍率の刻みで、これがいちばん近い)
// (56.6 で JP ルーレットを入れ替えて、お宝ゲット 2マス・JP 1/2 1マス (JP 積立が長い目で2倍戻る) になったので下げた。56.5 までは 0.9607・0.9155・0.8835・0.8685)
export const GAPPORI_JACKPOT_LOST_RATE = 0.1;  // 外れた券の代金のうち、ジャックポットに貯める割合
// JP ルーレット (船長マスに球が入った回の最後に、盤面が変わって1回だけ回る)。16マスのうち JP 1マス・お宝ゲット 1マス、残りはハズレ
export const GAPPORI_JP_WHEEL_POCKETS = 16;
export const GAPPORI_JP_JACKPOT = 'jackpot';
export const GAPPORI_JP_TREASURE = 'treasure';
export const GAPPORI_JP_MISS = 'miss';
export const GAPPORI_JP_FLAG = 'flag';          // ドクロ旗のマス (55.5〜)。止まったらドクロ旗の券が当たり
export const GAPPORI_JP_DOUBLE = 'double';      // JP 2倍のマス (55.8〜)。貯まっているジャックポットを2倍にして持ち越す
export const GAPPORI_JP_HALF = 'half';          // JP 1/2 のマス (55.8〜)。貯まっているジャックポットを半分にして持ち越す
export const GAPPORI_JP_PAYOUT2 = 'payout2';    // 払い戻し2倍のマス (55.17〜)。その回の当たりの券の払い戻しが2倍
export const GAPPORI_JP_EXTRA = 'extra';        // もう1球のマス (55.17〜)。盤面に6球目を入れ、その回の全員の券に効く
export const GAPPORI_JP_PLUS = 'plus';          // JP+??? のマス (55.17〜)。ジャックポットに 100〜500 を足す
export const GAPPORI_JP_MINUS = 'minus';        // JP−??? のマス (55.17〜)。ジャックポットから 100〜500 を引く (0 より下げない)
export const GAPPORI_JP_STAMP = 'stamp';        // スタンプのマス (55.19〜)。その回に券を買った全員のスタンプカードに1つ押す
// スタンプカード (55.19〜): スタンプが GAPPORI_STAMPS_PER_CARD 貯まると、ハクを GAPPORI_HAKU_PER_CARD 回使える (カードは 0 からやり直し)。
// 56.3 で「10個でハク3回」から「3つでハク1回」にした (貯まっていた分は口座を読むときに数え直す)
export const GAPPORI_STAMPS_PER_CARD = 3;    // 56.3 で 10 → 3
export const GAPPORI_HAKU_PER_CARD = 1;      // 56.3 で 3 → 1

/** スタンプカードを数え直す: GAPPORI_STAMPS_PER_CARD 貯まるごとにハクを GAPPORI_HAKU_PER_CARD 回にする (account を書き換える) */
export function settleGapporiStampCard(account) {
  let stamps = Math.max(0, Math.floor(Number(account.gpStamps) || 0));
  let haku = Math.max(0, Math.floor(Number(account.gpHaku) || 0));
  let completed = 0;
  while (stamps >= GAPPORI_STAMPS_PER_CARD) {
    stamps -= GAPPORI_STAMPS_PER_CARD;
    haku += GAPPORI_HAKU_PER_CARD;
    completed += 1;
  }
  account.gpStamps = stamps;
  account.gpHaku = haku;
  return completed;
}
// ハク (55.19〜): 予想の1つとして選べる「どのお宝の球でもOK」の札。ほかのお宝がそろい、余った球 (船長以外) があれば当たりで、
// 余った球のお宝のうち倍率がいちばん高くなるものに化ける。1枚の券に1つ・1回の抽選で1枚まで。値段は個数どおり。
// ハクも1個に数えて GAPPORI_HAKU_MIN_PICKS 個以上の予想でだけ使える (55.24〜。2個の予想では使えない)
export const GAPPORI_HAKU = 'haku';
export const GAPPORI_HAKU_MIN_PICKS = 3;
export const GAPPORI_JP_PLUS_SMALL = 'plussmall';    // JP+?? のマス (55.18〜)。ジャックポットに 10〜99 を足す
export const GAPPORI_JP_MINUS_SMALL = 'minussmall';  // JP−?? のマス (55.18〜)。ジャックポットから 10〜99 を引く (0 より下げない)
// JP±??? と JP±?? で動かす額の範囲 (均等)
export const GAPPORI_JP_SHIFT_RANGES = {
  [GAPPORI_JP_PLUS]: [100, 500], [GAPPORI_JP_MINUS]: [100, 500],
  [GAPPORI_JP_PLUS_SMALL]: [10, 99], [GAPPORI_JP_MINUS_SMALL]: [10, 99]
};
// 56.6 で入れ替えた: 払い戻し2倍 → ドクロ旗、JP+???・JP−??? → もう1球・お宝ゲット、JP 1/2 の1つ → スタンプ
// (55.17〜56.5 は JP 1・お宝ゲット 1・ドクロ旗 2・JP 2倍 1・JP 1/2 2・払い戻し2倍 1・もう1球 1・JP+??? 1・JP−??? 1・スタンプ 5)。
// 払い戻し2倍・JP±??? の処理は残してある (マスを戻せばまた使える)
export const GAPPORI_JP_WHEEL_COUNTS = {
  [GAPPORI_JP_JACKPOT]: 1, [GAPPORI_JP_TREASURE]: 2, [GAPPORI_JP_FLAG]: 3, [GAPPORI_JP_DOUBLE]: 1, [GAPPORI_JP_HALF]: 1,
  [GAPPORI_JP_EXTRA]: 2,
  [GAPPORI_JP_STAMP]: 6   // ハズレは 0
};
// JP 2倍・1/2 があると、ジャックポットは長い目で見て貯めた額の何倍が戻るか。止まる確率を JP a・2倍 d・1/2 h とすると
// 船長の回ごとの増え方の期待値から a / (a − d + h/2) (2倍1マス・1/2 2マスなら釣り合って 1倍。1マスずつなら 2倍。tools/gappori-return.mjs で使う)
export const GAPPORI_JP_FUND_FACTOR = (() => {
  const rate = kind => (GAPPORI_JP_WHEEL_COUNTS[kind] || 0) / GAPPORI_JP_WHEEL_POCKETS;
  return rate(GAPPORI_JP_JACKPOT) / (rate(GAPPORI_JP_JACKPOT) - rate(GAPPORI_JP_DOUBLE) + rate(GAPPORI_JP_HALF) / 2);
})();
// ジャックポットが当たる確率 (JP のマスの数 / マスの数 = 1/16)。船長マスに球が入るのは 5/16 の回なので、約51回に1回当たる
export const GAPPORI_JACKPOT_RATE = GAPPORI_JP_WHEEL_COUNTS[GAPPORI_JP_JACKPOT] / GAPPORI_JP_WHEEL_POCKETS;
// チャンスの確率 (券ごと。予想の個数で決まる)。倍率はこの確率も含めて計算する
export const GAPPORI_CHANCE_RATES = { 2: 0.025, 3: 0.05, 4: 0.075, 5: 0.15 };
// 本日のおすすめ: 回ごとに、予想の個数 (5・4・3・2) ごとに1つずつ選び、その予想の倍率だけ GAPPORI_FEATURED_BOOST 倍にする
// (刻みに合わせて丸め、少なくとも1刻みは上げる)。おすすめだけを買ったときの配当の還元率は 90% × 1.1 = 約99%
export const GAPPORI_FEATURED_SIZES = [5, 4, 3, 2];
export const GAPPORI_FEATURED_BOOST = 1.1;

export class GapporiRuleError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 15マスの内訳の候補: GAPPORI_KINDS 種類で合計15、1種類1〜GAPPORI_MAX_PER_KIND マス、レア度の順に多い→少ない (同じ数は可) */
function compositions(parts = GAPPORI_KINDS, total = GAPPORI_SYMBOL_POCKETS, max = GAPPORI_MAX_PER_KIND) {
  if (parts === 1) return total >= 1 && total <= max ? [[total]] : [];
  const out = [];
  for (let first = Math.min(max, total - (parts - 1)); first >= 1; first--) {
    compositions(parts - 1, total - first, first).forEach(rest => out.push([first, ...rest]));
  }
  return out;
}
export const GAPPORI_COMPOSITIONS = compositions();
// ゴールド盤 (56.1〜): 毎回 GAPPORI_GOLD_RATE の確率で、お宝を GAPPORI_GOLD_KINDS 種類だけにし、1種類 GAPPORI_GOLD_MAX_PER_KIND マスまで許す。
// 画面はルーレットを金色にする。倍率はふだんと同じくその盤面の当たる確率から作る (還元率 105% の計算には入れない)
export const GAPPORI_GOLD_RATE = 0.02;
export const GAPPORI_GOLD_KINDS = 4;
export const GAPPORI_GOLD_MAX_PER_KIND = 6;
export const GAPPORI_GOLD_COMPOSITIONS = compositions(GAPPORI_GOLD_KINDS, GAPPORI_SYMBOL_POCKETS, GAPPORI_GOLD_MAX_PER_KIND);
const GAPPORI_GOLD_SCALE = 10000;   // ゴールド盤の確率を整数の乱数で引くときの目の細かさ

function shuffle(list, randomInt) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 1回ぶんの盤面。kinds は並べる GAPPORI_KINDS 種類 (全部の絵柄から毎回選び、レア度の順に並べる)、counts は絵柄ごとのマスの数、
 * pockets は盤面を時計回りに見たマスの並び (16)。同じ絵柄はまとめて並べ、絵柄の順と船長の位置はランダム
 */
export function generateGapporiBoard(randomInt) {
  const gold = randomInt(GAPPORI_GOLD_SCALE) < Math.round(GAPPORI_GOLD_RATE * GAPPORI_GOLD_SCALE);
  const kinds = shuffle(GAPPORI_SYMBOLS, randomInt).slice(0, gold ? GAPPORI_GOLD_KINDS : GAPPORI_KINDS)
    .sort((a, b) => GAPPORI_SYMBOLS.indexOf(a) - GAPPORI_SYMBOLS.indexOf(b));
  const choices = gold ? GAPPORI_GOLD_COMPOSITIONS : GAPPORI_COMPOSITIONS;
  const sizes = choices[randomInt(choices.length)];
  const counts = Object.fromEntries(kinds.map((kind, index) => [kind, sizes[index]]));
  const groups = shuffle([...kinds.map(kind => Array(counts[kind]).fill(kind)), [GAPPORI_CAPTAIN]], randomInt);
  const ring = groups.flat();
  // 盤面のどこから並べ始めるかもランダムにする (いつも同じ位置から並ばないように)
  const offset = randomInt(ring.length);
  const pockets = [...ring.slice(offset), ...ring.slice(0, offset)];
  return gold ? { kinds, counts, pockets, gold: true } : { kinds, counts, pockets };
}

/**
 * JP ルーレットの盤面 (16マス。JP・お宝ゲット・ドクロ旗・JP 2倍が1つずつ・JP 1/2 が2つ・残りはハズレ)。並びは毎回ランダム。
 * 返り値: { pockets: [kind × 16], index: 止まるマス, kind: 止まったマスの中身 }
 */
export function generateGapporiJpWheel(randomInt) {
  const fixed = Object.entries(GAPPORI_JP_WHEEL_COUNTS).flatMap(([kind, count]) => Array(count).fill(kind));
  const pockets = shuffle([...fixed, ...Array(GAPPORI_JP_WHEEL_POCKETS - fixed.length).fill(GAPPORI_JP_MISS)], randomInt);
  const index = randomInt(pockets.length);
  return { pockets, index, kind: pockets[index] };
}

/** JP±??? (100〜500)・JP±?? (10〜99) で動かす額 (マスごとの範囲 GAPPORI_JP_SHIFT_RANGES から均等に1つ) */
export function drawGapporiJpShift(randomInt, kind) {
  const [min, max] = GAPPORI_JP_SHIFT_RANGES[kind];
  return min + randomInt(max - min + 1);
}

/** ジャックポットを足すマスか (JP+???・JP+??) */
export function isGapporiJpPlus(kind) {
  return kind === GAPPORI_JP_PLUS || kind === GAPPORI_JP_PLUS_SMALL;
}

/** ハクを入れた予想か */
export function isGapporiHakuPicks(picks) {
  return Array.isArray(picks) && picks.includes(GAPPORI_HAKU);
}

/**
 * ハクの券の結果。balls は入った球 (もう1球の6球目を含む)、odds はその回の配当表。
 * ハク以外のお宝がそろっていて、余った球 (船長以外) があれば、そのお宝のうち倍率がいちばん高くなるものに化けて当たり。
 * 返り値: { kind (化けたお宝), key, odds } / 当たらなければ null
 */
export function gapporiHakuResult(board, balls, picks, odds) {
  const others = picks.filter(kind => kind !== GAPPORI_HAKU);
  const hits = gapporiHitCounts(board, balls);
  const need = gapporiPickCounts(others);
  if (Object.entries(need).some(([kind, count]) => (hits[kind] || 0) < count)) return null;
  let best = null;
  board.kinds.forEach(kind => {
    if ((hits[kind] || 0) - (need[kind] || 0) < 1) return;   // 余った球が無い
    const key = gapporiPickKey([...others, kind]);
    if (!odds[key]) return;
    if (!best || odds[key] > best.odds) best = { kind, key, odds: odds[key] };
  });
  return best;
}

/** ハクの券の倍率の幅 (化けうるお宝ごとの倍率の最小と最大)。others はハク以外のお宝。無ければ null */
export function gapporiHakuOddsRange(board, odds, others) {
  const values = board.kinds
    .map(kind => odds[gapporiPickKey([...others, kind])])
    .filter(Boolean);
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
}

/** ドクロ旗の券 (単品) か */
export function isGapporiFlagPicks(picks) {
  return Array.isArray(picks) && picks.length === 1 && picks[0] === GAPPORI_FLAG;
}

/** ドクロ旗が当たったときの倍率 (GAPPORI_FLAG_ODDS_MIN〜GAPPORI_FLAG_ODDS_MAX = ×50〜×99 から均等に1つ) */
export function drawGapporiFlagOdds(randomInt) {
  return GAPPORI_FLAG_ODDS_MIN + randomInt(GAPPORI_FLAG_ODDS_MAX - GAPPORI_FLAG_ODDS_MIN + 1);
}

/** 1口の値段 */
export function gapporiUnitPrice(picks) {
  return isGapporiFlagPicks(picks) ? GAPPORI_FLAG_PRICE : GAPPORI_UNIT_PRICES[picks.length];
}

/** 予想を決まった形にする (レア度の順。同じ絵柄は続けて並べる) */
function sortPicks(picks) {
  return picks.slice().sort((a, b) => GAPPORI_SYMBOLS.indexOf(a) - GAPPORI_SYMBOLS.indexOf(b));
}

/** 券の見分けと配当表の引き当てに使うキー。例: 'anchor-anchor-parrot' */
export function gapporiPickKey(picks) {
  return sortPicks(picks).join('-');
}

/** 予想した絵柄ごとの個数 { kind: 個数 } */
export function gapporiPickCounts(picks) {
  const counts = {};
  picks.forEach(kind => { counts[kind] = (counts[kind] || 0) + 1; });
  return counts;
}

/** 予想できる組み合わせ (2〜5個。同じ絵柄はその絵柄のマスの数まで) をすべて */
export function gapporiPickSets(board) {
  const out = [];
  const walk = (index, picks) => {
    if (picks.length >= GAPPORI_PICKS_MIN) out.push(picks);
    if (picks.length === GAPPORI_PICKS_MAX) return;
    for (let i = index; i < board.kinds.length; i++) {
      const kind = board.kinds[i];
      if (picks.filter(item => item === kind).length >= board.counts[kind]) continue;
      walk(i, [...picks, kind]);
    }
  };
  walk(0, []);
  return out;
}

const BINOM = [];
function binom(n, k) {
  if (k < 0 || k > n) return 0;
  BINOM[n] = BINOM[n] || [];
  if (BINOM[n][k] === undefined) {
    let value = 1;
    for (let i = 1; i <= k; i++) value = (value * (n - k + i)) / i;
    BINOM[n][k] = value;
  }
  return BINOM[n][k];
}

/** caps (分類ごとのマスの数) に total 球を入れたときの「分類ごとの球の数」をすべて。weight はその起こりやすさ */
function hitVectors(caps, total) {
  const pockets = caps.reduce((sum, cap) => sum + cap, 0);
  const out = [];
  const walk = (index, left, vector) => {
    if (index === caps.length) {
      if (left === 0) out.push({ vector, weight: vector.reduce((w, h, i) => w * binom(caps[i], h), 1) / binom(pockets, total) });
      return;
    }
    for (let h = 0; h <= Math.min(left, caps[index]); h++) walk(index + 1, left - h, [...vector, h]);
  };
  walk(0, total, []);
  return out;
}

/**
 * 盤面ごとの当たる確率。絵柄ごとに何球入ったかで数え上げる (最初の3球 × 残り2球)。
 * normal はチャンスなし、chance はチャンスあり (残り2球で当たりやすくなる絵柄を「1球入ったこと」にする)。
 * 戻り値: { [key]: { normal, chance } }
 */
export function gapporiProbabilities(board) {
  const caps = [...board.kinds.map(kind => board.counts[kind]), 1];   // 最後は船長
  const kindCount = board.kinds.length;
  const sets = gapporiPickSets(board).map(picks => {
    const counts = gapporiPickCounts(picks);
    return { key: gapporiPickKey(picks), need: board.kinds.map(kind => counts[kind] || 0), normal: 0, chance: 0 };
  });
  const covers = (sum, need) => need.every((value, i) => sum[i] >= value);
  hitVectors(caps, GAPPORI_FIRST_BALLS).forEach(first => {
    const rest = caps.map((cap, i) => cap - first.vector[i]);
    const lasts = hitVectors(rest, GAPPORI_BALLS - GAPPORI_FIRST_BALLS)
      .map(last => ({ sum: first.vector.map((h, i) => h + last.vector[i]), weight: last.weight }));
    sets.forEach(set => {
      const win = need => lasts.reduce((p, last) => (covers(last.sum, need) ? p + last.weight : p), 0);
      set.normal += first.weight * win(set.need);
      const short = [];
      for (let i = 0; i < kindCount; i++) if (set.need[i] > first.vector[i]) short.push(i);
      if (!short.length) {
        set.chance += first.weight;
        return;
      }
      let best = 0;
      short.forEach(i => {
        const need = set.need.slice();
        need[i] -= 1;
        best = Math.max(best, win(need));
      });
      set.chance += first.weight * best;
    });
  });
  return Object.fromEntries(sets.map(set => [set.key, { normal: set.normal, chance: set.chance }]));
}

/**
 * 倍率の刻み。1口あたりの払い戻し (値段 × 倍率) が必ず整数になる細かさで四捨五入する。
 * 10倍未満は 1/値段 (ただし 0.01 より細かくしない)、10倍以上は 0.1。
 * 例: 2個 (1口 10) は 0.1 刻み、3個 (1口 50) は 0.02 刻み、4個・5個 (1口 100・200) は 0.01 刻み
 */
function oddsStep(value, price) {
  return value < 10 ? Math.max(0.01, 1 / price) : 0.1;
}

function roundOdds(value, price) {
  const step = oddsStep(value, price);
  return Math.round(Math.round(value / step) * step * 100) / 100;
}

/** 配当の倍率 (賭けた額に対する払い戻し。賭け金込み)。baseReturns は予想の個数ごとの配当の設計値 (試算用に差し替えられる) */
export function gapporiOdds(board, baseReturns = GAPPORI_BASE_RETURNS) {
  const probabilities = gapporiProbabilities(board);
  return Object.fromEntries(Object.entries(probabilities).map(([key, p]) => {
    const size = key.split('-').length;
    const chanceShare = GAPPORI_CHANCE_RATES[size];
    const effective = (1 - chanceShare) * p.normal + chanceShare * p.chance;
    const price = GAPPORI_UNIT_PRICES[size];
    return [key, Math.max(1, roundOdds(baseReturns[size] / effective, price))];
  }));
}

/** 入った球の絵柄 (船長を除く。同じ絵柄に2球なら2つ並ぶ) */
export function gapporiHitList(board, balls) {
  return balls.map(index => board.pockets[index]).filter(kind => kind !== GAPPORI_CAPTAIN);
}

/** 絵柄ごとに入った球の数 { kind: 個数 } */
export function gapporiHitCounts(board, balls) {
  return gapporiPickCounts(gapporiHitList(board, balls));
}

/** チャンスで「1球入ったこと」にした絵柄 (1つ、または並び) を、絵柄ごとの数にして足す */
function addGranted(hits, granted) {
  (Array.isArray(granted) ? granted : [granted]).filter(Boolean).forEach(kind => { hits[kind] = (hits[kind] || 0) + 1; });
  return hits;
}

/**
 * 予想のうち、まだ足りない絵柄ごとの数。granted はチャンスで「1球入ったこと」にした絵柄
 * (3球目のあとのお宝ゲットと JP ルーレットのお宝ゲットの両方なら並びで渡す)
 */
export function gapporiShortfall(board, balls, picks, granted = null) {
  const hits = addGranted(gapporiHitCounts(board, balls), granted);
  const short = {};
  Object.entries(gapporiPickCounts(picks)).forEach(([kind, need]) => {
    if (need > (hits[kind] || 0)) short[kind] = need - (hits[kind] || 0);
  });
  return short;
}

/** 券が当たったか */
export function isGapporiWin(board, balls, picks, granted = null) {
  return Object.keys(gapporiShortfall(board, balls, picks, granted)).length === 0;
}

/** 球を1つ選ぶ (まだ入っていないマスから一様に) */
export function drawGapporiBall(board, balls, randomInt, captainWeight = 1) {
  const free = board.pockets.map((_, index) => index).filter(index => !balls.includes(index));
  if (captainWeight === 1) return free[randomInt(free.length)];
  // 船長マスだけ重みを付けて引く (重みは 1/100 単位の整数にして、整数の乱数で引く)
  const weights = free.map(index => (board.pockets[index] === GAPPORI_CAPTAIN ? Math.round(captainWeight * 100) : 100));
  let r = randomInt(weights.reduce((sum, weight) => sum + weight, 0));
  for (let i = 0; i < free.length; i++) {
    r -= weights[i];
    if (r < 0) return free[i];
  }
  return free[free.length - 1];
}

/**
 * 船長マスの重み (内部だけの調整。画面・ルールの説明・公開の写しには出さない)。
 * ジャックポットが GAPPORI_CAPTAIN_BOOST_FROM を超えたら少しずつ上げ、GAPPORI_CAPTAIN_BOOST_FULL で GAPPORI_CAPTAIN_BOOST_MAX 倍。
 * 5球のどれかが船長に入る確率は 1倍で 31%・2倍で 約51%・3倍で 約65%
 */
export function gapporiCaptainWeight(jackpot) {
  const amount = Number(jackpot) || 0;
  if (amount <= GAPPORI_CAPTAIN_BOOST_FROM) return 1;
  const t = Math.min(1, (amount - GAPPORI_CAPTAIN_BOOST_FROM) / (GAPPORI_CAPTAIN_BOOST_FULL - GAPPORI_CAPTAIN_BOOST_FROM));
  return 1 + t * (GAPPORI_CAPTAIN_BOOST_MAX - 1);
}

/**
 * チャンスで「1球入ったこと」にする絵柄を、本人が選ばなかったときに決める。
 * tickets は本人の券 ({ picks, cost, odds })。足りない絵柄のうち、残り2球の入り方を全部数えて、
 * 払い戻しの見込みがいちばん大きくなるもの
 */
export function gapporiAutoChance(board, balls, tickets) {
  const candidates = [...new Set(tickets.flatMap(ticket => Object.keys(gapporiShortfall(board, balls, ticket.picks))))];
  if (!candidates.length) return null;
  const free = board.pockets.map((_, index) => index).filter(index => !balls.includes(index));
  const pairs = [];
  for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) pairs.push([free[i], free[j]]);
  const expected = kind => tickets.reduce((sum, ticket) => {
    const wins = pairs.filter(pair => isGapporiWin(board, [...balls, ...pair], ticket.picks, kind)).length;
    return sum + ticket.cost * ticket.odds * (wins / pairs.length);
  }, 0);
  return candidates
    .sort((a, b) => GAPPORI_SYMBOLS.indexOf(b) - GAPPORI_SYMBOLS.indexOf(a))
    .reduce((best, kind) => (expected(kind) > expected(best) ? kind : best));
}

/**
 * JP ルーレットのお宝ゲット (5球が入ったあと) で「1球入ったこと」にする絵柄。granted は 3球目のあとのお宝ゲットで足した絵柄。
 * 球はもう残っていないので、足すと当たりになる絵柄 (あと1球で当たりだった券) を返す。無ければ null (足しても当たらない)
 */
export function gapporiJpTreasureChoice(board, balls, picks, granted = null) {
  if (isGapporiFlagPicks(picks)) return null;   // ドクロ旗は球では当たらない
  const short = gapporiShortfall(board, balls, picks, granted);
  const kinds = Object.keys(short);
  if (kinds.length !== 1 || short[kinds[0]] !== 1) return null;
  return kinds[0];
}

/** 予想を検証して、決まった形 (レア度の順) にする */
export function normalizeGapporiPicks(board, rawPicks) {
  const picks = Array.isArray(rawPicks) ? rawPicks.map(String) : [];
  if (picks.includes(GAPPORI_FLAG)) {
    if (picks.length !== 1) throw new GapporiRuleError(400, 'ドクロ旗はほかのお宝と組み合わせず、単品でだけ賭けられます。');
    return [GAPPORI_FLAG];
  }
  if (picks.length < GAPPORI_PICKS_MIN || picks.length > GAPPORI_PICKS_MAX) {
    throw new GapporiRuleError(400, `お宝は${GAPPORI_PICKS_MIN}〜${GAPPORI_PICKS_MAX}個選んでください。`);
  }
  if (picks.some(kind => !board.kinds.includes(kind))) {
    throw new GapporiRuleError(400, 'この回の盤面に無いお宝が含まれています。');
  }
  const over = Object.entries(gapporiPickCounts(picks)).find(([kind, count]) => count > board.counts[kind]);
  if (over) {
    const [kind] = over;
    throw new GapporiRuleError(400, `${GAPPORI_NAMES[kind]}はこの盤面に${board.counts[kind]}マスしかないので、${board.counts[kind]}個までしか選べません。`);
  }
  return sortPicks(picks);
}

/** おすすめの倍率 (ふだんの倍率 × GAPPORI_FEATURED_BOOST を刻みで丸め、少なくとも1刻みは上げる) */
export function gapporiBoostedOdds(baseOdds, size) {
  const price = GAPPORI_UNIT_PRICES[size];
  const raised = roundOdds(baseOdds * GAPPORI_FEATURED_BOOST, price);
  return raised > baseOdds ? raised : roundOdds(baseOdds + oddsStep(baseOdds, price), price);
}

/**
 * 本日のおすすめを選び、その倍率を上げた配当表を返す。odds は gapporiOdds の配当表 (書き換えない)。
 * 返り値: { odds (おすすめの倍率を上げた配当表), featured: [{ size, key, picks, baseOdds, odds }] (5個 → 2個の順) }
 */
export function gapporiFeatured(board, odds, randomInt) {
  const sets = gapporiPickSets(board);
  const boosted = { ...odds };
  const featured = [];
  GAPPORI_FEATURED_SIZES.forEach(size => {
    const keys = sets.filter(picks => picks.length === size).map(gapporiPickKey).filter(key => odds[key]);
    if (!keys.length) return;
    const key = keys[randomInt(keys.length)];
    const baseOdds = odds[key];
    const next = gapporiBoostedOdds(baseOdds, size);
    boosted[key] = next;
    featured.push({ size, key, picks: key.split('-'), baseOdds, odds: next });
  });
  return { odds: boosted, featured };
}
