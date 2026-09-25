// ホールデムの相手役 (6人の船員)。強さと性格を変えて、同じ動きにならないようにしている。
//   プリフロップは Chen 式で手札の強さを 0〜1 にし、性格ごとの境目で 参加 / レイズ / 降りる を決める
//   フロップ以降はモンテカルロで勝率を見積もり (腕前が低いほど見積もりがぶれる)、
//   ポットオッズと性格 (攻撃性・ブラフ・粘り・罠) で 賭ける / コール / レイズ / 降りる を決める
// 乱数はここでは暗号用でなくてよいので Math.random (テストでは差し替え可)。
// 配るカードは holdem.js が呼び出し側の randomInt で引く。

import { HOLDEM_CARDS, bestHand, cardSuit, cardValue } from './holdem.js';

/**
 * 性格
 *   short  席に出す短い名前
 *   tight  高いほど参加する手が狭い
 *   aggro  高いほど賭け・レイズを選ぶ
 *   bluff  弱い手で賭け・レイズする頻度
 *   sticky 高いほど降りない (ポットオッズに合わなくてもコールする)
 *   skill  勝率の見積もりの正確さ (低いほどぶれる)
 *   trap   強い手で わざとチェック・コールする頻度
 *   sizing 賭ける額の目安 (ポットに対する割合)
 *   pace   考える時間の目安 (ms。画面での演出用)
 */
export const HOLDEM_BOTS = [
  {
    id: 'pip', short: 'ピップ', seat: 0, name: '見習いピップ', title: '船員見習い', style: '初心者',
    desc: '手の強さをよく読み違える。ときどき突拍子もない賭けをする',
    tight: 0.35, aggro: 0.4, bluff: 0.25, sticky: 0.5, skill: 0.2, trap: 0.1, sizing: 0.55, pace: 1500
  },
  {
    id: 'captain', short: '黒ひげ', seat: 1, name: '船長 黒ひげ', title: '船長', style: '堅実・攻撃的',
    desc: '参加する手は選ぶが、入ったら強気。位置を活かし、たまに鋭いブラフを打つ',
    tight: 0.75, aggro: 0.75, bluff: 0.3, sticky: 0.3, skill: 0.92, trap: 0.25, sizing: 0.7, pace: 1200
  },
  {
    id: 'compass', short: 'コンパス', seat: 2, name: '航海士 コンパス', title: '航海士', style: '超堅実',
    desc: 'めったに参加せず、レイズしたときは本物。ブラフはほぼしない',
    tight: 0.95, aggro: 0.45, bluff: 0.05, sticky: 0.15, skill: 0.75, trap: 0.15, sizing: 0.6, pace: 1000
  },
  {
    id: 'gunner', short: 'ガンツ', seat: 3, name: '砲手 ガンツ', title: '砲手', style: '超攻撃的',
    desc: 'なんでもレイズ、しょっちゅうブラフ。勢いはあるが読みは荒い',
    tight: 0.15, aggro: 0.95, bluff: 0.7, sticky: 0.55, skill: 0.45, trap: 0.05, sizing: 0.9, pace: 700
  },
  {
    id: 'cook', short: 'ボンゴ', seat: 4, name: 'コック ボンゴ', title: '料理長', style: 'コール魔',
    desc: '賭けられてもなかなか降りない。自分からはあまりレイズしない',
    tight: 0.3, aggro: 0.15, bluff: 0.05, sticky: 0.95, skill: 0.5, trap: 0.1, sizing: 0.5, pace: 1300
  },
  {
    id: 'silver', short: 'シルバー', seat: 5, name: '賭博師 シルバー', title: '賭博師', style: 'トリッキー',
    desc: '強い手は隠して罠を張り、怖いボードではブラフを仕掛ける。読みは鋭い',
    tight: 0.55, aggro: 0.65, bluff: 0.45, sticky: 0.35, skill: 0.85, trap: 0.45, sizing: 0.65, pace: 1600
  }
];

export const HOLDEM_BOT_BY_ID = new Map(HOLDEM_BOTS.map(bot => [bot.id, bot]));

/** 席の空きに入る船員 (家の席が空いている人) */
export function botForSeat(seat) {
  return HOLDEM_BOTS.find(bot => bot.seat === seat) || null;
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** 平均0・標準偏差 sigma の正規乱数 (Box–Muller) */
function gaussian(rng, sigma) {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
}

// ------------------------------------------------------------------
// プリフロップ: Chen 式
// ------------------------------------------------------------------
/** Chen 式の点数 (AA=20, AKs=12, 72o≒-1) */
export function chenScore(hole) {
  const [a, b] = hole.map(cardValue).sort((x, y) => y - x);
  const suited = cardSuit(hole[0]) === cardSuit(hole[1]);
  const high = value => (value === 14 ? 10 : value === 13 ? 8 : value === 12 ? 7 : value === 11 ? 6 : value / 2);
  let score = high(a);
  if (a === b) {
    score = Math.max(5, score * 2);
  } else {
    if (suited) score += 2;
    const gap = a - b - 1;
    score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
    if (gap <= 1 && a < 12) score += 1;
  }
  return Math.ceil(score);
}

/** 手札の強さを 0〜1 に (Chen の -1〜20 を伸ばす) */
export function preflopStrength(hole) {
  return clamp((chenScore(hole) + 1) / 21, 0, 1);
}

// ------------------------------------------------------------------
// フロップ以降: モンテカルロで勝率を見積もる
// ------------------------------------------------------------------
/**
 * hole と board から、opponents 人の相手がランダムな手札のときの勝率 (引き分けは人数で割る)。
 */
export function estimateEquity(hole, board, opponents, trials, rng = Math.random) {
  const known = new Set([...hole, ...board]);
  const deck = HOLDEM_CARDS.filter(card => !known.has(card));
  const boardNeed = 5 - board.length;
  const opp = Math.max(1, Math.min(opponents, 5));
  let total = 0;
  for (let t = 0; t < trials; t++) {
    // 必要な枚数だけ部分的にシャッフルする
    const need = boardNeed + opp * 2;
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const fullBoard = board.concat(deck.slice(0, boardNeed));
    const hero = bestHand([...hole, ...fullBoard]).score;
    let beaten = false;
    let ties = 0;
    for (let o = 0; o < opp; o++) {
      const start = boardNeed + o * 2;
      const score = bestHand([deck[start], deck[start + 1], ...fullBoard]).score;
      if (score > hero) {
        beaten = true;
        break;
      }
      if (score === hero) ties += 1;
    }
    if (!beaten) total += 1 / (ties + 1);
  }
  return total / trials;
}

/** ボードの怖さ 0〜1 (フラッシュ・ストレートが見えるほど、ペアがあるほど高い) */
function boardScare(board) {
  if (board.length < 3) return 0;
  const suits = new Map();
  board.forEach(card => suits.set(cardSuit(card), (suits.get(cardSuit(card)) || 0) + 1));
  const maxSuit = Math.max(...suits.values());
  const values = Array.from(new Set(board.map(cardValue))).sort((x, y) => x - y);
  let connected = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      if (values[j] - values[i] <= 4) connected += 1;
    }
  }
  const paired = values.length < board.length;
  let scare = 0;
  if (maxSuit >= 3) scare += 0.4;
  else if (maxSuit === 2) scare += 0.1;
  if (connected >= 4) scare += 0.35;
  else if (connected >= 2) scare += 0.15;
  if (paired) scare += 0.2;
  if (board.some(card => cardValue(card) === 14)) scare += 0.1;
  return clamp(scare, 0, 1);
}

// ------------------------------------------------------------------
// 判断
// ------------------------------------------------------------------
/** 自分より後に動く人の数から見た位置 (0 = 一番早い, 1 = 一番遅い) */
function lateness(round, player) {
  const count = round.players.length;
  const me = round.players.indexOf(player);
  const active = round.players.filter(other => !other.folded);
  if (active.length <= 1) return 1;
  // ボタンが最後。プリフロップは BB が最後だが、位置の感覚としてはボタン基準で十分
  const order = index => (index - round.button - 1 + count * 2) % count;
  const after = active.filter(other => order(round.players.indexOf(other)) > order(me)).length;
  return 1 - after / (active.length - 1);
}

function raiseTo(actions, round, fraction) {
  const potAfterCall = round.pot + actions.toCall;
  const size = Math.max(round.minRaise, Math.round(potAfterCall * fraction));
  return clamp(round.currentBet + size, actions.minRaiseTo, actions.maxRaiseTo);
}

function betOrRaise(actions, round, bot, rng, fraction) {
  if (!actions.raise) return actions.allin ? { move: 'allin' } : { move: actions.call ? 'call' : 'check' };
  const jitter = 0.75 + rng() * 0.5;
  const to = raiseTo(actions, round, fraction * jitter);
  // 残りの大半を出すならオールイン
  if (to >= actions.maxRaiseTo * 0.7 || actions.maxRaiseTo - to < round.bigBlind * 2) return { move: 'allin' };
  return { move: 'raise', amount: to };
}

function decidePreflop(round, player, bot, actions, rng) {
  let s = preflopStrength(player.hole);
  s = clamp(s + gaussian(rng, 0.14 * (1 - bot.skill)), 0, 1);
  const late = lateness(round, player);
  const bb = round.bigBlind;
  const raised = round.currentBet > bb;
  const raises = round.log.filter(entry => entry.street === 'preflop' && (entry.move === 'raise' || entry.move === 'allin')).length;
  const limpers = round.players.filter(other => other !== player && !other.folded && other.committed > 0 && !other.blind).length;
  const stackBB = (player.stack + player.streetBet) / bb;

  // 性格と位置で境目を決める
  const open = 0.3 + 0.28 * bot.tight - 0.09 * late;
  const call = open - 0.06 - 0.06 * bot.sticky;
  const threeBet = 0.72 - 0.12 * bot.aggro + 0.06 * bot.tight;

  if (!raised) {
    if (s >= open + 0.04) {
      if (rng() < 0.55 + 0.45 * bot.aggro) return betOrRaise(actions, round, bot, rng, 0.9 + 0.3 * limpers);
      return { move: actions.call ? 'call' : 'check' };
    }
    if (s >= call) {
      if (rng() < 0.2 * bot.aggro) return betOrRaise(actions, round, bot, rng, 0.9);
      return { move: actions.call ? 'call' : 'check' };
    }
    if (actions.check) return rng() < 0.15 * bot.aggro ? betOrRaise(actions, round, bot, rng, 0.9) : { move: 'check' };
    // 遅い位置からのスチール
    if (late >= 0.7 && rng() < 0.35 * bot.bluff) return betOrRaise(actions, round, bot, rng, 1.0);
    // 安いコール (粘る人はつい入ってしまう)
    if (actions.toCall <= bb && rng() < 0.4 * bot.sticky) return { move: 'call' };
    return { move: 'fold' };
  }

  // レイズされている
  const big = actions.toCall > round.pot * 0.6 || raises >= 2;
  const need = call + 0.1 + (big ? 0.1 : 0) + 0.05 * raises;
  if (s >= threeBet + 0.06 * raises) {
    if (stackBB < 15) return { move: 'allin' };
    if (rng() < 0.5 + 0.5 * bot.aggro) return betOrRaise(actions, round, bot, rng, 1.0);
    return { move: 'call' };
  }
  if (s >= need) {
    if (stackBB < 10 && s >= 0.55) return { move: 'allin' };
    if (rng() < 0.15 * bot.aggro && raises < 2) return betOrRaise(actions, round, bot, rng, 1.0);
    return { move: 'call' };
  }
  const oddsCall = actions.toCall / (round.pot + actions.toCall);
  if (oddsCall < 0.25 && rng() < 0.5 * bot.sticky + 0.1) return { move: 'call' };
  if (raises < 2 && rng() < 0.12 * bot.bluff) return betOrRaise(actions, round, bot, rng, 1.0);
  return { move: 'fold' };
}

function decidePostflop(round, player, bot, actions, rng, equity) {
  const opponents = round.players.filter(other => other !== player && !other.folded).length;
  const late = lateness(round, player);
  const scare = boardScare(round.board);
  const street = round.phase;
  const potOdds = actions.toCall > 0 ? actions.toCall / (round.pot + actions.toCall) : 0;
  const stackToPot = (player.stack + player.streetBet) / Math.max(1, round.pot);
  const raisesHere = round.log.filter(entry => entry.street === street && (entry.move === 'raise' || entry.move === 'allin')).length;
  const e = equity;

  if (actions.toCall === 0) {
    // 賭けるかチェックか
    if (e >= 0.8) {
      const slow = street !== 'river' && opponents <= 2 && rng() < bot.trap * 0.7;
      return slow ? { move: 'check' } : betOrRaise(actions, round, bot, rng, bot.sizing + 0.2);
    }
    if (e >= 0.62) {
      return rng() < 0.45 + 0.5 * bot.aggro ? betOrRaise(actions, round, bot, rng, bot.sizing) : { move: 'check' };
    }
    if (e >= 0.45) {
      return rng() < 0.15 + 0.3 * bot.aggro ? betOrRaise(actions, round, bot, rng, bot.sizing * 0.8) : { move: 'check' };
    }
    // 弱い手のブラフ: 相手が少なく、遅い位置で、怖いボードほど打つ
    const chance = bot.bluff * (0.45 / opponents) * (0.6 + 0.6 * late) * (0.7 + 0.6 * scare);
    if (rng() < chance) return betOrRaise(actions, round, bot, rng, bot.sizing * 0.9);
    return { move: 'check' };
  }

  // 賭けられている
  const bigBet = actions.toCall >= round.pot * 0.7;
  let margin = 0.03 - 0.1 * bot.sticky + (bigBet ? 0.06 * bot.skill : 0) + 0.03 * raisesHere + 0.02 * (opponents - 1);
  const required = clamp(potOdds + margin, 0.05, 0.95);

  if (e >= 0.8) {
    const slow = street !== 'river' && rng() < bot.trap * 0.6;
    if (slow) return { move: 'call' };
    return rng() < 0.55 + 0.45 * bot.aggro ? betOrRaise(actions, round, bot, rng, bot.sizing + 0.2) : { move: 'call' };
  }
  if (e >= 0.62) {
    if (stackToPot < 1.5 && rng() < 0.6) return { move: 'allin' };
    return rng() < 0.2 + 0.35 * bot.aggro && raisesHere < 2 ? betOrRaise(actions, round, bot, rng, bot.sizing) : { move: 'call' };
  }
  if (e >= required) {
    // ドロー気味の手でのセミブラフ
    if (e < 0.5 && street !== 'river' && raisesHere < 2 && rng() < 0.3 * bot.bluff * bot.aggro) {
      return betOrRaise(actions, round, bot, rng, bot.sizing);
    }
    if (stackToPot < 1 && e >= 0.5 && rng() < 0.5) return { move: 'allin' };
    return { move: 'call' };
  }
  // 合わないコール
  if (actions.toCall <= round.pot * 0.25 && rng() < 0.55 * bot.sticky) return { move: 'call' };
  if (bigBet && rng() < 0.2 * bot.sticky) return { move: 'call' };
  // ブラフレイズ (怖いボードで、相手が少ないとき)
  if (raisesHere < 2 && opponents <= 2 && !bigBet && rng() < bot.bluff * 0.18 * (0.5 + scare)) {
    return betOrRaise(actions, round, bot, rng, 1.0);
  }
  return { move: 'fold' };
}

/** 考える時間 (ms)。降りるのは早く、レイズは長め。性格の pace が基準 */
function thinkDelay(bot, move, rng) {
  const factor = move === 'fold' ? 0.6 : move === 'check' ? 0.7 : move === 'call' ? 0.9 : 1.15;
  return Math.round(bot.pace * factor * (0.7 + rng() * 0.6));
}

/**
 * いま番の bot の操作を決める。戻り値は { move, amount?, delay }。
 * round.players の player.equity に、ストリートごとの勝率の見積もりを残す (同じストリートでは使い回す)。
 */
export function decideBotMove(round, player, actions, rng = Math.random, trials = 90) {
  const bot = HOLDEM_BOT_BY_ID.get(player.bot);
  if (!bot) throw new Error(`不明な船員です: ${player.bot}`);
  let decision;
  if (round.phase === 'preflop') {
    decision = decidePreflop(round, player, bot, actions, rng);
  } else {
    const opponents = round.players.filter(other => other !== player && !other.folded).length;
    if (!player.equity || player.equity.street !== round.phase) {
      const raw = estimateEquity(player.hole, round.board, opponents, trials, rng);
      const noisy = clamp(raw + gaussian(rng, 0.16 * (1 - bot.skill)), 0, 1);
      player.equity = { street: round.phase, raw, value: noisy };
    }
    decision = decidePostflop(round, player, bot, actions, rng, player.equity.value);
  }
  // できない操作に落ちたら近いものに直す
  if (decision.move === 'check' && !actions.check) decision = { move: actions.call ? 'call' : 'fold' };
  if (decision.move === 'call' && !actions.call) decision = { move: 'check' };
  if (decision.move === 'raise' && !actions.raise) decision = { move: actions.allin ? 'allin' : 'call' };
  if (decision.move === 'allin' && !actions.allin) decision = { move: actions.check ? 'check' : 'fold' };
  decision.delay = thinkDelay(bot, decision.move, rng);
  return decision;
}
