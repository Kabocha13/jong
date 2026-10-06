// 宝探しのルール (Firestore には触らない)。
// 乱数は呼び出し側から randomInt(n) → 0〜n-1 の整数 として受け取る。
//
// ルール
//   回る盤面に16マス。15マスにお宝の絵柄 (毎回11種類から6種類)、1マスは船長。
//   絵柄ごとのマスの数も毎回変わるが、レア度の順 (錨 ≥ オウム ≥ 舵輪 ≥ ラム酒 ≥ 望遠鏡 ≥ 宝の地図 ≥ 羅針盤 ≥ 大砲 ≥ 金貨 ≥ 海賊旗 ≥ 宝箱) は守る。
//   同じ絵柄のマスは盤面の上でまとまって並ぶ (並ぶ順と船長マスの位置は毎回ランダム)。
//   5球がそれぞれ別のマスに入る。絵柄を2〜5個予想して何口でも買え (1口の値段は予想の個数で決まる)、
//   同じ絵柄を何個選んでもよい (その絵柄のマスの数まで。錨を2つ選んだら「錨のマスに2球」の予想)。
//   予想した絵柄ごとに、選んだ数だけ球が入れば当たり。配当の倍率は、その盤面での当たる確率から決める。
//   チャンス: 券ごとに、予想の個数で決まる確率 (GAPPORI_CHANCE_RATES) で、3球の時点でその券のまだ足りない絵柄を
//   1つ選び、「1球入ったこと」にできる (その券だけ。盤面は変わらない)。
//   船長マスに球が入るとチャンスタイム。gapporiJackpotRate の確率でジャックポットが当たり、
//   その回に賭けた人で均等に分ける (54.5 まで賭けた額に応じて分けていた)。確率は最初 5% で、
//   船長マスで外れるたびに上がり、100回外れたあとで 50% になる (それより上がらない。当たったら 5% に戻る)。ジャックポットは外れた券の代金の GAPPORI_JACKPOT_LOST_RATE を
//   0 から貯めたもの (外れた券は賭けの約91% なので、賭けの約9% がジャックポットで戻る)。
//   還元率は 配当 GAPPORI_BASE_RETURN (チャンスも含めて) + ジャックポット 約9% = 約99%

/** 絵柄。レア度の順 (前ほど多く、後ろほど少なく並べる)。舵輪・望遠鏡・大砲・海賊旗は 54.19 で足した */
export const GAPPORI_SYMBOLS = ['anchor', 'parrot', 'helm', 'rum', 'telescope', 'map', 'compass', 'cannon', 'coin', 'flag', 'chest'];
export const GAPPORI_CAPTAIN = 'captain';
const GAPPORI_NAMES = {
  anchor: '錨', parrot: 'オウム', helm: '舵輪', rum: 'ラム酒', telescope: '望遠鏡', map: '宝の地図',
  compass: '羅針盤', cannon: '大砲', coin: '金貨', flag: '海賊旗', chest: '宝箱'
};
export const GAPPORI_KINDS = 6;              // 1回の盤面に並べる絵柄の種類
export const GAPPORI_SYMBOL_POCKETS = 15;    // 絵柄のマス (ほかに船長が1マス)
export const GAPPORI_MAX_PER_KIND = 4;       // 1つの絵柄のマスの数の上限
export const GAPPORI_BALLS = 5;
export const GAPPORI_FIRST_BALLS = 3;        // チャンスはこの数の球が入ったあと
export const GAPPORI_PICKS_MIN = 2;
export const GAPPORI_PICKS_MAX = 5;
// 1口の値段 (予想の個数ごと)。倍率はこの値段に対してかかる
export const GAPPORI_UNIT_PRICES = { 2: 10, 3: 50, 4: 100, 5: 200 };
export const GAPPORI_MAX_UNITS = 50;         // 1枚の券で買える口数
export const GAPPORI_MAX_TICKETS = 20;       // 1回に1人が買える券 (セット) の数
export const GAPPORI_BASE_RETURN = 0.90;
export const GAPPORI_JACKPOT_LOST_RATE = 0.1;  // 外れた券の代金のうち、ジャックポットに貯める割合
// 船長マスに入ったときにジャックポットが当たる確率。続けて外れた回数 (misses) で上がる。
// 0回 5% → 100回 50% まで直線で上げる (平均で船長マス 約11.6回 = 約37回に1回当たる)
export const GAPPORI_JACKPOT_BASE_RATE = 0.05;
export const GAPPORI_JACKPOT_MAX_RATE = 0.5;
export const GAPPORI_JACKPOT_RAMP_MISSES = 100;
export const GAPPORI_JACKPOT_SCALE = 10000;   // 確率を整数の乱数で引くときの目の細かさ
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

/** 15マスの内訳の候補: 6種類で合計15、1種類1〜4マス、レア度の順に多い→少ない (同じ数は可) */
function compositions(parts = GAPPORI_KINDS, total = GAPPORI_SYMBOL_POCKETS, max = GAPPORI_MAX_PER_KIND) {
  if (parts === 1) return total >= 1 && total <= max ? [[total]] : [];
  const out = [];
  for (let first = Math.min(max, total - (parts - 1)); first >= 1; first--) {
    compositions(parts - 1, total - first, first).forEach(rest => out.push([first, ...rest]));
  }
  return out;
}
export const GAPPORI_COMPOSITIONS = compositions();

function shuffle(list, randomInt) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 1回ぶんの盤面。kinds は並べる6種類 (全部の絵柄から毎回選び、レア度の順に並べる)、counts は絵柄ごとのマスの数、
 * pockets は盤面を時計回りに見たマスの並び (16)。同じ絵柄はまとめて並べ、絵柄の順と船長の位置はランダム
 */
export function generateGapporiBoard(randomInt) {
  const kinds = shuffle(GAPPORI_SYMBOLS, randomInt).slice(0, GAPPORI_KINDS)
    .sort((a, b) => GAPPORI_SYMBOLS.indexOf(a) - GAPPORI_SYMBOLS.indexOf(b));
  const sizes = GAPPORI_COMPOSITIONS[randomInt(GAPPORI_COMPOSITIONS.length)];
  const counts = Object.fromEntries(kinds.map((kind, index) => [kind, sizes[index]]));
  const groups = shuffle([...kinds.map(kind => Array(counts[kind]).fill(kind)), [GAPPORI_CAPTAIN]], randomInt);
  const ring = groups.flat();
  // 盤面のどこから並べ始めるかもランダムにする (いつも同じ位置から並ばないように)
  const offset = randomInt(ring.length);
  const pockets = [...ring.slice(offset), ...ring.slice(0, offset)];
  return { kinds, counts, pockets };
}

/** ジャックポットの当たる確率 (0〜1)。misses は船長マスで続けて外れた回数 */
export function gapporiJackpotRate(misses) {
  const n = Math.max(0, Math.floor(Number(misses) || 0));
  const step = (GAPPORI_JACKPOT_MAX_RATE - GAPPORI_JACKPOT_BASE_RATE) / GAPPORI_JACKPOT_RAMP_MISSES;
  return Math.min(GAPPORI_JACKPOT_MAX_RATE, GAPPORI_JACKPOT_BASE_RATE + step * n);
}

/** 1口の値段 */
export function gapporiUnitPrice(picks) {
  return GAPPORI_UNIT_PRICES[picks.length];
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

/** 配当の倍率 (賭けた額に対する払い戻し。賭け金込み) */
export function gapporiOdds(board) {
  const probabilities = gapporiProbabilities(board);
  return Object.fromEntries(Object.entries(probabilities).map(([key, p]) => {
    const size = key.split('-').length;
    const chanceShare = GAPPORI_CHANCE_RATES[size];
    const effective = (1 - chanceShare) * p.normal + chanceShare * p.chance;
    const price = GAPPORI_UNIT_PRICES[size];
    return [key, Math.max(1, roundOdds(GAPPORI_BASE_RETURN / effective, price))];
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

/** 予想のうち、まだ足りない絵柄ごとの数。granted はチャンスで「1球入ったこと」にした絵柄 */
export function gapporiShortfall(board, balls, picks, granted = null) {
  const hits = gapporiHitCounts(board, balls);
  if (granted) hits[granted] = (hits[granted] || 0) + 1;
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
export function drawGapporiBall(board, balls, randomInt) {
  const free = board.pockets.map((_, index) => index).filter(index => !balls.includes(index));
  return free[randomInt(free.length)];
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

/** 予想を検証して、決まった形 (レア度の順) にする */
export function normalizeGapporiPicks(board, rawPicks) {
  const picks = Array.isArray(rawPicks) ? rawPicks.map(String) : [];
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
    const price = GAPPORI_UNIT_PRICES[size];
    const raised = roundOdds(baseOdds * GAPPORI_FEATURED_BOOST, price);
    const next = raised > baseOdds ? raised : roundOdds(baseOdds + oddsStep(baseOdds, price), price);
    boosted[key] = next;
    featured.push({ size, key, picks: key.split('-'), baseOdds, odds: next });
  });
  return { odds: boosted, featured };
}
