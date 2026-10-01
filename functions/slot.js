// スロットのルール (Firestore には触らない)。
// 乱数は呼び出し側から randomInt(n) → 0〜n-1 の整数 として受け取る。
//
// ルール
//   3リール × 3段。ラインは 中段・上段・下段・右下がり・右上がり の5本で、賭け金1つで5本すべてに賭ける
//   1本のラインに同じ絵柄が3つ並ぶと、その絵柄の倍率 × 賭け金 を払い戻す (賭け金込み)。当たったラインの分を合計する
//   ドクロ旗 (wild) は真ん中のリールにだけあり、どの絵柄の代わりにもなる
//   リールは下の並びの輪で、止まる位置はリールごとに一様に選ぶ (演出で結果を変えない)
//
// 通常モードとジャックポットタイム (50.10〜)
//   通常モード: 真ん中のリールにドクロ旗が無い。還元率 94.89% / 何か当たる確率 19.66%
//   ジャックポットタイム: 3本ともジャックポットタイム用のリールに替わり、真ん中の4割近くがドクロ旗になる。
//   還元率 500.59% / 何か当たる確率 58.10%
//   通常モードで1回まわすごとに 0.15% でジャックポットタイムに入り、6〜16回 (一様) 続く。
//   天井 (プレイヤーには隠す。画面にもルールにも出さず、回数も画面へ返さない):
//   前のジャックポットタイムから通常モードで600回まわすと、そのあとは1回ごとに 10% で入る
//   ジャックポットタイム中の賭け金は、前のジャックポットタイムから通常モードで賭けた平均で固定
//   (通常は最低額で回し、ジャックポットタイムだけ大きく賭けて得をする、ということをさせないため)
//   全体の還元率 105.75% (slotOverallReturnRate() で確かめられる)。50.9 までは1モードで 99.14%、50.10 は 97.90%、
//   50.11 は 99.04%、50.12 は 109.45% だった

export const SLOT_ROWS = 3;

/** 3つ並んだときの倍率 (賭け金に対して。賭け金込み)。wild は3つ並ばない (真ん中のリールにしかない) */
export const SLOT_PAYS = {
  chest: 100,
  coin: 30,
  compass: 15,
  map: 12,
  rum: 5,
  parrot: 3,
  anchor: 2
};

export const SLOT_WILD = 'wild';

/** 各ラインが、左・中・右のリールで何段目 (0 = 上) を通るか */
export const SLOT_LINES = [
  [1, 1, 1],
  [0, 0, 0],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0]
];

// 通常モード (左・右 28)。錨8 オウム6 ラム3 地図3 羅針盤3 金貨3 宝箱2。
// 並びは同じ絵柄がなるべく続かないようにばらしてある
const LEFT_REEL = ['anchor', 'map', 'parrot', 'chest', 'anchor', 'compass', 'parrot', 'rum', 'anchor', 'coin', 'map', 'anchor', 'parrot', 'compass',
  'anchor', 'parrot', 'rum', 'chest', 'coin', 'anchor', 'map', 'parrot', 'anchor', 'compass', 'anchor', 'parrot', 'rum', 'coin'];
const RIGHT_REEL = ['anchor', 'map', 'parrot', 'anchor', 'chest', 'compass', 'parrot', 'anchor', 'rum', 'coin', 'anchor', 'map', 'parrot', 'anchor',
  'compass', 'parrot', 'rum', 'anchor', 'coin', 'chest', 'map', 'parrot', 'anchor', 'compass', 'anchor', 'parrot', 'rum', 'coin'];
// 通常モードの真ん中 (28)。錨9 オウム6 ラム3 地図2 羅針盤3 金貨3 宝箱2 (ドクロ旗なし)。
// 3本とも高い絵柄を多めにして、当たる回数を減らす代わりに1回の当たりを大きくしてある
const MIDDLE_REEL_NORMAL = ['anchor', 'compass', 'parrot', 'chest', 'anchor', 'coin', 'anchor', 'parrot', 'rum', 'anchor', 'compass', 'parrot', 'map', 'anchor',
  'coin', 'anchor', 'parrot', 'rum', 'chest', 'anchor', 'compass', 'parrot', 'anchor', 'coin', 'anchor', 'parrot', 'rum', 'map'];

// ジャックポットタイムは3本ともこのリールに替える。
// 左・右 (27): 錨12 オウム6 ラム1 地図1 羅針盤3 金貨1 宝箱3。錨を多くして左右が揃いやすくし、宝箱も多めにしてある
const LEFT_REEL_JACKPOT = ['chest', 'anchor', 'parrot', 'anchor', 'coin', 'anchor', 'parrot', 'compass', 'anchor', 'chest', 'anchor', 'parrot', 'anchor', 'rum',
  'anchor', 'parrot', 'compass', 'anchor', 'chest', 'anchor', 'parrot', 'anchor', 'map', 'anchor', 'parrot', 'compass', 'anchor'];
const RIGHT_REEL_JACKPOT = ['anchor', 'chest', 'parrot', 'anchor', 'chest', 'parrot', 'anchor', 'compass', 'anchor', 'coin', 'anchor', 'parrot', 'anchor', 'anchor',
  'parrot', 'anchor', 'rum', 'compass', 'anchor', 'chest', 'parrot', 'anchor', 'anchor', 'parrot', 'anchor', 'compass', 'map'];
// 真ん中 (28): ドクロ旗11 錨10 オウム2 ラム1 地図1 羅針盤1 金貨1 宝箱1。
// ドクロ旗は左右が揃えば当たるので、左右に多い錨を残して当たりやすくしてある (ドクロ旗どうしは隣り合わない)
const MIDDLE_REEL_JACKPOT = ['parrot', 'wild', 'anchor', 'compass', 'wild', 'anchor', 'wild', 'anchor', 'wild', 'anchor', 'rum', 'wild', 'anchor', 'wild',
  'coin', 'wild', 'anchor', 'wild', 'parrot', 'anchor', 'map', 'wild', 'anchor', 'wild', 'chest', 'anchor', 'wild', 'anchor'];

export const SLOT_REELS = {
  normal: [LEFT_REEL, MIDDLE_REEL_NORMAL, RIGHT_REEL],
  jackpot: [LEFT_REEL_JACKPOT, MIDDLE_REEL_JACKPOT, RIGHT_REEL_JACKPOT]
};

// ジャックポットタイムの入り方と長さ
export const SLOT_JACKPOT = {
  enterRate: 0.0015,    // 通常モードで1回まわすごとに入る確率
  ceiling: 600,         // 天井: 前のジャックポットタイムから通常モードでこの回数まわすと…
  ceilingRate: 0.1,     // …そのあとは1回ごとにこの確率で入る
  spinsMin: 6,          // ジャックポットタイムの長さ (この範囲から一様に選ぶ)
  spinsMax: 16
};
const RATE_SCALE = 1000000;   // 確率を整数の乱数で引くときの目の細かさ

/** 止まる位置 (各リールで窓の一番上に来る添字) から、見えている 3段 × 3列 の絵柄を返す */
export function slotGrid(stops, reels = SLOT_REELS.normal) {
  return Array.from({ length: SLOT_ROWS }, (_, row) => stops.map((stop, reel) => {
    const strip = reels[reel];
    return strip[(stop + row) % strip.length];
  }));
}

/** 1本のラインの3つの絵柄が揃っていれば、その絵柄 (揃っていなければ null) */
function lineSymbol(symbols) {
  const plain = symbols.filter(symbol => symbol !== SLOT_WILD);
  if (!plain.length) return null;
  return plain.every(symbol => symbol === plain[0]) ? plain[0] : null;
}

/** 見えている絵柄から、当たったラインと倍率の合計を出す */
export function judgeSlotGrid(grid) {
  const lines = [];
  SLOT_LINES.forEach((rows, line) => {
    const symbol = lineSymbol(rows.map((row, reel) => grid[row][reel]));
    if (symbol && SLOT_PAYS[symbol]) lines.push({ line, symbol, multiplier: SLOT_PAYS[symbol] });
  });
  return { lines, multiplier: lines.reduce((sum, item) => sum + item.multiplier, 0) };
}

/** 1回まわす。bet は検証済みの正の整数。mode は 'normal' か 'jackpot' */
export function spinSlot(bet, randomInt, mode = 'normal') {
  const reels = SLOT_REELS[mode] || SLOT_REELS.normal;
  const stops = reels.map(strip => randomInt(strip.length));
  const grid = slotGrid(stops, reels);
  const { lines, multiplier } = judgeSlotGrid(grid);
  return { stops, grid, lines, multiplier, bet, returned: bet * multiplier, mode };
}

// ------------------------------------------------------------------
// ジャックポットタイム
//   state = { mode, jackpotLeft, jackpotBet, spinsSinceJackpot, wageredSinceJackpot, jackpots }
//   (人ごとに1つ。カジノを精算しても引き継ぐ)
// ------------------------------------------------------------------
function toCount(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function normalizeSlotState(state) {
  const source = state && typeof state === 'object' ? state : {};
  const jackpotLeft = toCount(source.jackpotLeft);
  return {
    mode: jackpotLeft > 0 ? 'jackpot' : 'normal',
    jackpotLeft,
    jackpotBet: jackpotLeft > 0 ? Math.max(1, toCount(source.jackpotBet)) : 0,
    spinsSinceJackpot: toCount(source.spinsSinceJackpot),       // 前のジャックポットタイムから通常モードでまわした回数
    wageredSinceJackpot: toCount(source.wageredSinceJackpot),   // その間に賭けた合計
    jackpots: toCount(source.jackpots)                          // これまでに入った回数
  };
}

/** 次の通常モードの1回でジャックポットタイムに入る確率 (天井を過ぎていれば上がる) */
export function slotEnterRate(state) {
  return normalizeSlotState(state).spinsSinceJackpot >= SLOT_JACKPOT.ceiling ? SLOT_JACKPOT.ceilingRate : SLOT_JACKPOT.enterRate;
}

/**
 * スロットを1回。通常モードなら requestedBet で通常のリール、ジャックポットタイムなら固定の賭け金
 * (手持ちが足りなければ手持ちぶん) でドクロ旗の多いリールをまわす。
 * 通常モードの1回ごとにジャックポットタイムに入るかを引く (入ったら次の回から)。
 * 戻り値: { outcome, bet, state (次の状態), entered: { spins, bet } | null, finished (ジャックポットタイムが終わった) }
 */
export function playSlotRound(rawState, requestedBet, chips, randomInt) {
  const state = normalizeSlotState(rawState);
  if (state.mode === 'jackpot') {
    const bet = Math.max(1, Math.min(state.jackpotBet, chips));
    const outcome = spinSlot(bet, randomInt, 'jackpot');
    const jackpotLeft = state.jackpotLeft - 1;
    return {
      outcome,
      bet,
      state: { ...state, mode: jackpotLeft > 0 ? 'jackpot' : 'normal', jackpotLeft, jackpotBet: jackpotLeft > 0 ? state.jackpotBet : 0 },
      entered: null,
      finished: jackpotLeft === 0
    };
  }

  const bet = requestedBet;
  const outcome = spinSlot(bet, randomInt, 'normal');
  const spinsSinceJackpot = state.spinsSinceJackpot + 1;
  const wageredSinceJackpot = state.wageredSinceJackpot + bet;
  const rate = slotEnterRate(state);
  if (randomInt(RATE_SCALE) < Math.round(rate * RATE_SCALE)) {
    const spins = SLOT_JACKPOT.spinsMin + randomInt(SLOT_JACKPOT.spinsMax - SLOT_JACKPOT.spinsMin + 1);
    const jackpotBet = Math.max(1, Math.round(wageredSinceJackpot / spinsSinceJackpot));
    return {
      outcome,
      bet,
      state: { mode: 'jackpot', jackpotLeft: spins, jackpotBet, spinsSinceJackpot: 0, wageredSinceJackpot: 0, jackpots: state.jackpots + 1 },
      entered: { spins, bet: jackpotBet },
      finished: false
    };
  }
  return {
    outcome,
    bet,
    state: { ...state, spinsSinceJackpot, wageredSinceJackpot },
    entered: null,
    finished: false
  };
}

/** 画面に返す形。天井は隠すので、通常モードでまわした回数や入る確率は返さない */
export function publicSlotState(state) {
  const current = normalizeSlotState(state);
  return {
    mode: current.mode,
    jackpotLeft: current.jackpotLeft,
    jackpotBet: current.jackpotBet
  };
}

// ------------------------------------------------------------------
// 確かめ用
// ------------------------------------------------------------------
/** 全部の止まり方を数え上げた還元率と当たる確率 (mode ごと) */
export function slotReturnRate(mode = 'normal') {
  const reels = SLOT_REELS[mode];
  const [a, b, c] = reels.map(strip => strip.length);
  let total = 0;
  let hits = 0;
  for (let i = 0; i < a; i++) {
    for (let j = 0; j < b; j++) {
      for (let k = 0; k < c; k++) {
        const { multiplier } = judgeSlotGrid(slotGrid([i, j, k], reels));
        total += multiplier;
        if (multiplier > 0) hits += 1;
      }
    }
  }
  const count = a * b * c;
  return { rate: total / count, hitRate: hits / count };
}

/**
 * ジャックポットタイムも含めた全体の還元率 (賭け金が一定のとき)。
 * 通常モードで入るまでの平均の回数と、ジャックポットタイムの平均の長さで重みをつける
 */
export function slotOverallReturnRate() {
  const normal = slotReturnRate('normal');
  const jackpot = slotReturnRate('jackpot');
  const { enterRate, ceiling, ceilingRate, spinsMin, spinsMax } = SLOT_JACKPOT;
  const reachCeiling = Math.pow(1 - enterRate, ceiling);
  const normalSpins = (1 - reachCeiling) / enterRate + reachCeiling / ceilingRate;
  const jackpotSpins = (spinsMin + spinsMax) / 2;
  return {
    rate: (normalSpins * normal.rate + jackpotSpins * jackpot.rate) / (normalSpins + jackpotSpins),
    normal,
    jackpot,
    normalSpinsPerJackpot: normalSpins,
    reachCeilingRate: reachCeiling
  };
}
