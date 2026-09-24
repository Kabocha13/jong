// スロットの1回ぶんのルール (Firestore には触らない)。
// 乱数は呼び出し側から randomInt(n) → 0〜n-1 の整数 として受け取る。
//
// ルール
//   3リール × 3段。ラインは 中段・上段・下段・右下がり・右上がり の5本で、賭け金1つで5本すべてに賭ける
//   1本のラインに同じ絵柄が3つ並ぶと、その絵柄の倍率 × 賭け金 を払い戻す (賭け金込み)。当たったラインの分を合計する
//   ドクロ旗 (wild) は真ん中のリールにだけあり、どの絵柄の代わりにもなる
//   リールは下の並びの輪で、止まる位置はリールごとに一様に選ぶ (演出で結果を変えない)
//   還元率 95.97% / 1回あたり何か当たる確率 26.98% (tools なしで確かめるときは slotReturnRate() を使う)

export const SLOT_ROWS = 3;

/** 3つ並んだときの倍率 (賭け金に対して。賭け金込み)。wild は3つ並ばない (真ん中のリールにしかない) */
export const SLOT_PAYS = {
  chest: 100,
  coin: 30,
  compass: 15,
  map: 8,
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

// 絵柄の枚数 (左・右のリール): 錨9 オウム7 ラム3 地図3 羅針盤3 金貨2 宝箱1 = 28
// 真ん中のリールはこれにドクロ旗1枚を足した 29。並びは同じ絵柄がなるべく続かないようにばらしてある
export const SLOT_REELS = [
  ['anchor', 'parrot', 'anchor', 'rum', 'map', 'compass', 'parrot', 'coin', 'anchor', 'parrot', 'anchor', 'anchor', 'parrot', 'rum',
    'map', 'compass', 'chest', 'anchor', 'parrot', 'anchor', 'coin', 'parrot', 'anchor', 'rum', 'map', 'compass', 'parrot', 'anchor'],
  ['parrot', 'compass', 'anchor', 'parrot', 'rum', 'anchor', 'coin', 'map', 'parrot', 'anchor', 'compass', 'anchor', 'parrot', 'wild',
    'rum', 'anchor', 'parrot', 'map', 'anchor', 'compass', 'parrot', 'coin', 'anchor', 'chest', 'rum', 'anchor', 'parrot', 'map', 'anchor'],
  ['parrot', 'anchor', 'compass', 'anchor', 'parrot', 'map', 'rum', 'anchor', 'parrot', 'compass', 'anchor', 'coin', 'parrot', 'anchor',
    'map', 'chest', 'parrot', 'rum', 'anchor', 'anchor', 'compass', 'parrot', 'anchor', 'map', 'parrot', 'coin', 'rum', 'anchor']
];

/** 止まる位置 (各リールで窓の一番上に来る添字) から、見えている 3段 × 3列 の絵柄を返す */
export function slotGrid(stops) {
  return Array.from({ length: SLOT_ROWS }, (_, row) => stops.map((stop, reel) => {
    const strip = SLOT_REELS[reel];
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

/** 1回まわす。bet は検証済みの正の整数 */
export function spinSlot(bet, randomInt) {
  const stops = SLOT_REELS.map(strip => randomInt(strip.length));
  const grid = slotGrid(stops);
  const { lines, multiplier } = judgeSlotGrid(grid);
  return { stops, grid, lines, multiplier, bet, returned: bet * multiplier };
}

/** 全部の止まり方を数え上げた還元率と当たる確率 (確認用) */
export function slotReturnRate() {
  const [a, b, c] = SLOT_REELS.map(strip => strip.length);
  let total = 0;
  let hits = 0;
  for (let i = 0; i < a; i++) {
    for (let j = 0; j < b; j++) {
      for (let k = 0; k < c; k++) {
        const { multiplier } = judgeSlotGrid(slotGrid([i, j, k]));
        total += multiplier;
        if (multiplier > 0) hits += 1;
      }
    }
  }
  const count = a * b * c;
  return { rate: total / count, hitRate: hits / count };
}
