// 宝探しの還元率を、球の入り方を全部数え上げて正確に出す (乱数を使わない。Firestore には触らない)。
//   node tools/gappori-return.mjs          いまの設定 (functions/gappori.js の GAPPORI_BASE_RETURNS) の還元率
//   node tools/gappori-return.mjs --solve  どの個数でも合計が GAPPORI_TARGET_RETURN になる配当の設計値を探す
//
//   盤面のマスの内訳 (GAPPORI_COMPOSITIONS) は毎回どれも同じ確率なので、内訳ごとに数えて平均する
//   (お宝の種類はどれでも確率が同じなので、ラベルは関係ない)。買える予想を全部1口ずつ買ったときの、
//   予想の個数ごとの「賭けた額に対する戻り」を出す (tools/gappori-sim.mjs と同じ数え方。本日のおすすめの倍率アップは含めない)。
//     配当        = 当たりの払い戻し (3球目のあとのお宝ゲットを含む。お宝ゲットで足すお宝は本番の自動選択と同じく、
//                   当たる見込みがいちばん大きいもの・同じならレアなもの)
//     お宝ゲット  = 船長マスの回の JP ルーレットでお宝ゲットが出て、あと1球で当たりだった券が当たりになった分
//     JP 積立     = 外れた券の代金のうちジャックポットに貯める分 × GAPPORI_JP_FUND_FACTOR (JP 2倍・1/2 のマスで増減するので、
//                   長い目で見て JP で戻る額。2倍と 1/2 が1マスずつなら貯めた額の2倍)

import {
  GAPPORI_BALLS,
  GAPPORI_BASE_RETURNS,
  GAPPORI_CHANCE_RATES,
  GAPPORI_COMPOSITIONS,
  GAPPORI_GOLD_COMPOSITIONS,
  GAPPORI_GOLD_RATE,
  GAPPORI_HAKU_MIN_PICKS,
  GAPPORI_HAKU_PER_CARD,
  GAPPORI_JP_STAMP,
  GAPPORI_PICKS_MAX,
  GAPPORI_STAMP_WIN_PICKS,
  GAPPORI_STAMPS_PER_CARD,
  GAPPORI_UNIT_PRICES,
  GAPPORI_FLAG_ODDS_MAX,
  GAPPORI_FLAG_ODDS_MIN,
  GAPPORI_JP_FLAG,
  GAPPORI_JP_EXTRA,
  GAPPORI_JP_EXTRA_BALLS,
  GAPPORI_JP_FUND_FACTOR,
  GAPPORI_JP_PAYOUT2,
  GAPPORI_FIRST_BALLS,
  GAPPORI_JACKPOT_LOST_RATE,
  GAPPORI_JP_TREASURE,
  GAPPORI_JP_WHEEL_COUNTS,
  GAPPORI_JP_WHEEL_POCKETS,
  GAPPORI_SYMBOLS,
  GAPPORI_TARGET_RETURN,
  gapporiBoostedOdds,
  gapporiOdds,
  gapporiPickCounts,
  gapporiPickKey,
  gapporiPickSets
} from '../functions/gappori.js';

const SIZES = [2, 3, 4, 5];
const JP_TREASURE_RATE = GAPPORI_JP_WHEEL_COUNTS[GAPPORI_JP_TREASURE] / GAPPORI_JP_WHEEL_POCKETS;
const JP_EXTRA_RATE = (GAPPORI_JP_WHEEL_COUNTS[GAPPORI_JP_EXTRA] || 0) / GAPPORI_JP_WHEEL_POCKETS;     // もう3球
const JP_PAYOUT2_RATE = (GAPPORI_JP_WHEEL_COUNTS[GAPPORI_JP_PAYOUT2] || 0) / GAPPORI_JP_WHEEL_POCKETS; // 払い戻し2倍
const JP_STAMP_RATE = (GAPPORI_JP_WHEEL_COUNTS[GAPPORI_JP_STAMP] || 0) / GAPPORI_JP_WHEEL_POCKETS;     // スタンプ
const CAPTAIN_RATE = GAPPORI_BALLS / (GAPPORI_COMPOSITIONS[0].reduce((sum, n) => sum + n, 0) + 1);      // 船長マスに球が入る回 (5/16)

function binom(n, k) {
  if (k < 0 || k > n) return 0;
  let value = 1;
  for (let i = 1; i <= k; i++) value = (value * (n - k + i)) / i;
  return value;
}

/** caps (分類ごとのマスの数) に total 球を入れたときの「分類ごとの球の数」をすべて。weight はその確率 */
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

const shortTotal = (have, need) => need.reduce((sum, value, i) => sum + Math.max(0, value - have[i]), 0);

/**
 * 盤面の内訳 1つぶん: 予想ごとの当たる確率 (チャンスなし Pn・あり Pc) と、JP ルーレットのお宝ゲットで当たりになる確率
 * (チャンスなし Jn・あり Jc。船長マスに球が入り、その時点であと1球だった券)。倍率に依らないので一度だけ数える
 */
function boardStats(sizes) {
  const kinds = GAPPORI_SYMBOLS.slice(0, sizes.length);
  const counts = Object.fromEntries(kinds.map((kind, i) => [kind, sizes[i]]));
  const board = { kinds, counts };
  const captain = kinds.length;   // 分類の最後が船長
  const caps = [...sizes, 1];
  const tickets = gapporiPickSets(board).map(picks => {
    const c = gapporiPickCounts(picks);
    return { key: gapporiPickKey(picks), size: picks.length, need: [...kinds.map(kind => c[kind] || 0), 0], Pn: 0, Pc: 0, Jn: 0, Jc: 0, Wn: 0, Wc: 0, Xn: 0, Xc: 0 };
  });
  hitVectors(caps, GAPPORI_FIRST_BALLS).forEach(first => {
    const rest = caps.map((cap, i) => cap - first.vector[i]);
    const lasts = hitVectors(rest, GAPPORI_BALLS - GAPPORI_FIRST_BALLS).map(last => {
      const sum = first.vector.map((h, i) => h + last.vector[i]);
      // もう3球 (船長の回だけ): 残りのマスから GAPPORI_JP_EXTRA_BALLS 球を引いたときの「分類ごとの球の数」
      const extras = sum[captain] > 0 ? hitVectors(caps.map((cap, i) => cap - sum[i]), GAPPORI_JP_EXTRA_BALLS) : [];
      return { sum, weight: first.weight * last.weight, extras };
    });
    tickets.forEach(ticket => {
      const short = [];
      for (let i = 0; i < kinds.length; i++) if (ticket.need[i] > first.vector[i]) short.push(i);
      // チャンスで足すお宝: 残り2球で当たる見込みがいちばん大きいもの (同じならレアなもの = 後ろの分類)
      let grant = -1;
      let bestWins = -1;
      short.forEach(i => {
        const need = ticket.need.slice();
        need[i] -= 1;
        const wins = lasts.reduce((p, last) => (shortTotal(last.sum, need) === 0 ? p + last.weight : p), 0);
        if (wins >= bestWins) {
          bestWins = wins;
          grant = i;
        }
      });
      lasts.forEach(last => {
        const shortN = shortTotal(last.sum, ticket.need);
        let shortC = shortN;
        if (grant >= 0) {
          const have = last.sum.slice();
          have[grant] += 1;
          shortC = shortTotal(have, ticket.need);
        }
        const captainHit = last.sum[captain] > 0;
        if (shortN === 0) ticket.Pn += last.weight;
        if (shortC === 0) ticket.Pc += last.weight;
        if (captainHit && shortN === 1) ticket.Jn += last.weight;
        if (captainHit && shortC === 1) ticket.Jc += last.weight;
        // 払い戻し2倍: 船長マスに入って、5球で当たっている
        if (captainHit && shortN === 0) ticket.Wn += last.weight;
        if (captainHit && shortC === 0) ticket.Wc += last.weight;
        // もう3球 (57.4〜。57.3 までは もう3球): 5球で外れていた券が、残りの11マスから引く3球 (6〜8球目) で足りる確率
        const extraHit = (short, have) => {
          if (short === 0 || short > GAPPORI_JP_EXTRA_BALLS) return 0;
          return last.extras.reduce((p, draw) => (shortTotal(have.map((h, i) => h + draw.vector[i]), ticket.need) === 0 ? p + draw.weight : p), 0);
        };
        if (captainHit) {
          ticket.Xn += last.weight * extraHit(shortN, last.sum);
          if (grant >= 0) {
            const have = last.sum.slice();
            have[grant] += 1;
            ticket.Xc += last.weight * extraHit(shortC, have);
          } else {
            ticket.Xc += last.weight * extraHit(shortC, last.sum);
          }
        }
      });
    });
  });
  return { board, tickets };
}

const STATS = GAPPORI_COMPOSITIONS.map(boardStats);
const GOLD_STATS = GAPPORI_GOLD_COMPOSITIONS.map(boardStats);   // ゴールド盤 (4種類・6マスまで)。105% には入れない

/**
 * ハク1回の値打ち (57.1〜。スタンプの値打ちを出すのに使う)。盤面ごとに、ハク以外のお宝の選び方 (2〜4個) を全部見て、
 * ハクの券 (値段は個数どおり) の払い戻しの期待値を5球の入り方の数え上げで出し、「期待値 − 値段」がいちばん大きい使い方の値を
 * その盤面のハクの値打ちにする (ただで1枚もらえる札なので、いちばん得な券に使うとして)。
 * ハクは、ほかのお宝がそろって余った球があれば、余った球のお宝のうち倍率がいちばん高いものに化ける (gapporiHakuResult と同じ)。
 * 3球目のあとのお宝ゲットと JP ルーレットのお宝ゲットは来ない。払い戻し2倍 (船長の回の 1/16) は入れ、もう3球は入れない (少しだけ低めに出る)
 */
function hakuValue(sizes, baseReturns) {
  const kinds = GAPPORI_SYMBOLS.slice(0, sizes.length);
  const counts = Object.fromEntries(kinds.map((kind, i) => [kind, sizes[i]]));
  const board = { kinds, counts };
  const odds = gapporiOdds(board, baseReturns);
  const caps = [...sizes, 1];
  const captain = kinds.length;
  const hits = hitVectors(caps, GAPPORI_BALLS);
  let best = 0;
  gapporiPickSets(board)
    .filter(picks => picks.length + 1 >= GAPPORI_HAKU_MIN_PICKS && picks.length + 1 <= GAPPORI_PICKS_MAX)
    .forEach(others => {
      const size = others.length + 1;
      const price = GAPPORI_UNIT_PRICES[size];
      const c = gapporiPickCounts(others);
      const need = kinds.map(kind => c[kind] || 0);
      let expected = 0;
      hits.forEach(({ vector, weight }) => {
        if (need.some((value, i) => vector[i] < value)) return;
        let top = 0;
        kinds.forEach((kind, i) => {
          if (vector[i] - need[i] < 1) return;
          const value = odds[gapporiPickKey([...others, kind])];
          if (value && value > top) top = value;
        });
        if (!top) return;
        // 払い戻し2倍: 船長マスに球が入った回の JP ルーレットで 1/16
        expected += weight * price * top * (1 + (vector[captain] > 0 ? JP_PAYOUT2_RATE : 0));
      });
      best = Math.max(best, expected - price);
    });
  return best;
}

/** ハク1回の値打ち (ふだんの盤面とゴールド盤を混ぜた平均) と、スタンプ1つの値打ち (GAPPORI_STAMPS_PER_CARD 個でハク GAPPORI_HAKU_PER_CARD 回。57.3 では3つでハク1回) */
function stampValue(baseReturns) {
  const mean = list => list.reduce((sum, value) => sum + value, 0) / list.length;
  const normal = mean(GAPPORI_COMPOSITIONS.map(sizes => hakuValue(sizes, baseReturns)));
  const gold = mean(GAPPORI_GOLD_COMPOSITIONS.map(sizes => hakuValue(sizes, baseReturns)));
  const haku = (1 - GAPPORI_GOLD_RATE) * normal + GAPPORI_GOLD_RATE * gold;
  return { haku, hakuNormal: normal, hakuGold: gold, stamp: haku * GAPPORI_HAKU_PER_CARD / GAPPORI_STAMPS_PER_CARD };
}

/**
 * 全部含めた還元率 (57.1〜): ふだんの盤面 (1 − GAPPORI_GOLD_RATE) とゴールド盤 (GAPPORI_GOLD_RATE) を混ぜ、
 * 配当・お宝ゲット (JP盤)・JP 積立に、おすすめ (その個数の予想を全部1口ずつ買って、うち1つがおすすめ)・払い戻し2倍・もう3球・
 * スタンプの値打ち (JP ルーレットのスタンプと、5個の予想が当たったときのスタンプ。1回に1枚の券を買ったとして、1つ = ハク3/10回) を足す
 */
function everything(baseReturns) {
  const normal = returnsFor(baseReturns);
  const gold = returnsFor(baseReturns, GOLD_STATS);
  const stamp = stampValue(baseReturns);
  const mix = (size, key) => (1 - GAPPORI_GOLD_RATE) * normal[size][key] + GAPPORI_GOLD_RATE * gold[size][key];
  return {
    stamp,
    sizes: Object.fromEntries(SIZES.map(size => {
      const core = mix(size, 'total');                               // 配当 + お宝ゲット (JP盤) + JP 積立
      const featured = mix(size, 'withFeatured') - core;             // おすすめの分
      const extras = mix(size, 'withExtras') - core;                 // 払い戻し2倍 + もう3球 (JP 積立の減りも込み)
      const price = GAPPORI_UNIT_PRICES[size];
      // スタンプ: JP ルーレットのスタンプは回ごと (船長の回 × 5/16)。5個の予想が当たった回はもう1つ (当たる確率は もう3球の分も入れる)
      const stampRounds = CAPTAIN_RATE * JP_STAMP_RATE;
      const hitAll = size === GAPPORI_STAMP_WIN_PICKS ? mix(size, 'hitAll') : 0;
      const winStamp = hitAll * stamp.stamp / price;          // 5個の予想が当たったときのスタンプ (券の値段あたり)
      const wheelStamp = stampRounds * stamp.stamp / price;   // JP ルーレットのスタンプ (回ごとなので、1口1枚のときの値段あたり)
      return [size, { core, featured, extras, winStamp, wheelStamp, hitAll, noStamp: core + featured + extras, total: core + featured + extras + winStamp + wheelStamp }];
    }))
  };
}

/** baseReturns のときの、予想の個数ごとの { bet, base, treasure, fund } (賭けた額あたり) */
function returnsFor(baseReturns, stats = STATS) {
  const sum = Object.fromEntries(SIZES.map(size => [size, { n: 0, base: 0, treasure: 0, fund: 0, hit: 0, hitAll: 0, featured: 0, withFeatured: 0, extras: 0, fundFull: 0 }]));
  stats.forEach(({ board, tickets }) => {
    const odds = gapporiOdds(board, baseReturns);
    // この盤面で、個数ごとの「おすすめに選ばれたときに増える分」の平均 (全部1口ずつ買ったとき、そのうち1つがおすすめ)
    const lift = Object.fromEntries(SIZES.map(size => [size, { n: 0, extra: 0 }]));
    tickets.forEach(ticket => {
      const c = GAPPORI_CHANCE_RATES[ticket.size];
      const p = (1 - c) * ticket.Pn + c * ticket.Pc + JP_TREASURE_RATE * ((1 - c) * ticket.Jn + c * ticket.Jc);
      lift[ticket.size].n += 1;
      lift[ticket.size].extra += (gapporiBoostedOdds(odds[ticket.key], ticket.size) - odds[ticket.key]) * p;
    });
    SIZES.forEach(size => { if (lift[size].n) sum[size].withFeatured += lift[size].extra / lift[size].n; });
    tickets.forEach(ticket => {
      const c = GAPPORI_CHANCE_RATES[ticket.size];
      const pWin = (1 - c) * ticket.Pn + c * ticket.Pc;
      // JP ルーレットのお宝ゲットで当たりになる分 (あと1球だった券)。105% に入れる
      const pJp = JP_TREASURE_RATE * ((1 - c) * ticket.Jn + c * ticket.Jc);
      // 105% に入れない分 (参考に出す): もう3球 (6球目で当たる) と払い戻し2倍 (5球で当たっていたら払い戻しがもう1回分)
      const pExtra = JP_EXTRA_RATE * ((1 - c) * ticket.Xn + c * ticket.Xc);
      const pDouble = JP_PAYOUT2_RATE * ((1 - c) * ticket.Wn + c * ticket.Wc);
      const s = sum[ticket.size];
      s.n += 1;
      s.base += odds[ticket.key] * pWin;
      s.treasure += odds[ticket.key] * pJp;
      s.extras += odds[ticket.key] * (pExtra + pDouble);
      s.fundFull += GAPPORI_JACKPOT_LOST_RATE * GAPPORI_JP_FUND_FACTOR * (1 - pWin - pJp - pExtra);
      s.fund += GAPPORI_JACKPOT_LOST_RATE * GAPPORI_JP_FUND_FACTOR * (1 - pWin - pJp);
      s.hit += pWin + pJp;
      s.hitAll += pWin + pJp + pExtra;   // もう3球で当たる分も入れた当たる確率 (5個の予想のスタンプに使う)
      // おすすめに選ばれたとき (どの予想も同じ確率で選ばれるので、平均がおすすめの券の還元率になる)
      s.featured += gapporiBoostedOdds(odds[ticket.key], ticket.size) * (pWin + pJp) + GAPPORI_JACKPOT_LOST_RATE * GAPPORI_JP_FUND_FACTOR * (1 - pWin - pJp);
    });
  });
  return Object.fromEntries(SIZES.map(size => {
    const s = sum[size];
    const base = s.base / s.n;
    const treasure = s.treasure / s.n;
    const fund = s.fund / s.n;
    return [size, { base, treasure, fund, total: base + treasure + fund, hit: s.hit / s.n, hitAll: s.hitAll / s.n, featured: s.featured / s.n, withFeatured: base + treasure + fund + s.withFeatured / s.n,
      withExtras: base + treasure + s.extras / s.n + s.fundFull / s.n }];
  }));
}

const pct = value => `${(value * 100).toFixed(2)}%`.padStart(8);
function print(baseReturns) {
  const result = returnsFor(baseReturns);
  SIZES.forEach(size => {
    const r = result[size];
    console.log(`${size}個  配当の設計値 ${baseReturns[size].toFixed(4)}  配当 ${pct(r.base)}  お宝ゲット(JP盤) ${pct(r.treasure)}  JP積立 ${pct(r.fund)}  合計 ${pct(r.total)}  当たる確率 ${pct(r.hit)}`);
  });
  console.log('参考 (105% に含めないもの):');
  const gold = returnsFor(baseReturns, GOLD_STATS);
  console.log(`  ゴールド盤 (${(GAPPORI_GOLD_RATE * 100).toFixed(0)}% の回。4種類・6マスまで): ${SIZES.map(size => `${size}個 ${pct(gold[size].total).trim()}`).join('・')}`);
  SIZES.forEach(size => console.log(`  ${size}個  おすすめの券だけ ${pct(result[size].featured)}  ・ ${size}個の予想を全部1口ずつ (うち1つがおすすめ) ${pct(result[size].withFeatured)}  ・ 払い戻し2倍ともう3球を入れると ${pct(result[size].withExtras)}`));
  // ドクロ旗 (単品): 船長マスに球が入り (5/16)、JP ルーレットがドクロ旗に止まったら (1/16) 当たり。倍率は ×最小〜×最大 から均等
  const captain = GAPPORI_BALLS / (GAPPORI_COMPOSITIONS[0].reduce((sum, n) => sum + n, 0) + 1);
  const flagHit = captain * (GAPPORI_JP_WHEEL_COUNTS[GAPPORI_JP_FLAG] / GAPPORI_JP_WHEEL_POCKETS);
  const flagOdds = (GAPPORI_FLAG_ODDS_MIN + GAPPORI_FLAG_ODDS_MAX) / 2;
  const flagFund = GAPPORI_JACKPOT_LOST_RATE * GAPPORI_JP_FUND_FACTOR * (1 - flagHit);
  console.log(`  ドクロ旗 (単品)  倍率 ×${GAPPORI_FLAG_ODDS_MIN}〜×${GAPPORI_FLAG_ODDS_MAX} (平均 ×${flagOdds})  配当 ${pct(flagHit * flagOdds)}  JP積立 ${pct(flagFund)}  合計 ${pct(flagHit * flagOdds + flagFund)}  当たる確率 ${pct(flagHit)}`);
  // 全部含めた還元率 (57.1〜)
  const all = everything(baseReturns);
  console.log(`全部含めた還元率 (ゴールド盤 ${(GAPPORI_GOLD_RATE * 100).toFixed(0)}% を混ぜ、おすすめ (全部1口ずつでうち1つ)・払い戻し2倍・もう3球・スタンプを入れる。ドクロ旗は別):`);
  console.log(`  ハク1回の値打ち ${all.stamp.haku.toFixed(1)} (ふだん ${all.stamp.hakuNormal.toFixed(1)}・ゴールド盤 ${all.stamp.hakuGold.toFixed(1)})・スタンプ1つ ${all.stamp.stamp.toFixed(1)} (${GAPPORI_STAMPS_PER_CARD}個でハク${GAPPORI_HAKU_PER_CARD}回)`);
  console.log(`  JP ルーレットのスタンプは ${pct(CAPTAIN_RATE * JP_STAMP_RATE).trim()} の回に、券を買った人みんなに1つ (賭けた額によらず 1回 ${(CAPTAIN_RATE * JP_STAMP_RATE * all.stamp.stamp).toFixed(2)} の値打ち)`);
  SIZES.forEach(size => {
    const r = all.sizes[size];
    console.log(`  ${size}個  配当+お宝ゲット+JP積立 ${pct(r.core)}  おすすめ ${pct(r.featured)}  2倍・もう3球 ${pct(r.extras)}  スタンプ以外の合計 ${pct(r.noStamp)}`
      + (size === GAPPORI_STAMP_WIN_PICKS ? `  5個の当たりのスタンプ ${pct(r.winStamp)} (当たる確率 ${pct(r.hitAll).trim()})  合計 ${pct(r.noStamp + r.winStamp)}` : '')
      + `  (1口1枚なら JP盤のスタンプ ${pct(r.wheelStamp).trim()} も)`);
  });
}

if (process.argv.includes('--dump')) {
  // 盤面の内訳ごとの確率を書き出す (ほかの方法で数えた値と比べる用)
  const index = Number(process.argv[process.argv.indexOf('--dump') + 1] || 0);
  const { tickets } = STATS[index];
  console.log(JSON.stringify({ comp: GAPPORI_COMPOSITIONS[index], tickets: tickets.map(t => [t.key, t.Pn, t.Pc, t.Jn, t.Jc, t.Wn, t.Wc, t.Xn, t.Xc]) }));
} else if (process.argv.includes('--solve')) {
  // 個数ごとに、合計が目標になる配当の設計値を二分法で探す (倍率は刻みで丸めるので、いちばん近い値)
  const solved = { ...GAPPORI_BASE_RETURNS };
  SIZES.forEach(size => {
    let lo = 0.5;
    let hi = 1.2;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const total = returnsFor({ ...solved, [size]: mid })[size].total;
      if (total < GAPPORI_TARGET_RETURN) lo = mid; else hi = mid;
    }
    // 丸めで合計が飛び飛びになるので、前後を 0.0001 刻みで見て目標にいちばん近い値にする
    const center = Math.round(((lo + hi) / 2) * 10000) / 10000;
    let best = center;
    let bestGap = Infinity;
    for (let step = -60; step <= 60; step++) {
      const value = Math.round((center + step / 10000) * 10000) / 10000;
      const gap = Math.abs(returnsFor({ ...solved, [size]: value })[size].total - GAPPORI_TARGET_RETURN);
      if (gap < bestGap - 1e-12) {
        bestGap = gap;
        best = value;
      }
    }
    solved[size] = best;
  });
  console.log(`目標 ${pct(GAPPORI_TARGET_RETURN)} の配当の設計値: ${JSON.stringify(solved)}`);
  print(solved);
} else {
  console.log(`いまの設定 (GAPPORI_BASE_RETURNS ${JSON.stringify(GAPPORI_BASE_RETURNS)})。盤面の内訳 ${GAPPORI_COMPOSITIONS.length}通り`);
  print(GAPPORI_BASE_RETURNS);
}
