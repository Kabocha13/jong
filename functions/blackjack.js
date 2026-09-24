// ブラックジャックのルールだけを持つモジュール (Firestore には触らない)。
// 乱数は呼び出し側から randomInt(n) → 0〜n-1 の整数 として受け取る。
//
// ルール
//   6デッキを1勝負ごとにシャッフル (前の勝負で出たカードは戻る = カウンティングは効かない)
//   ディーラーはソフト17を含む17以上でスタンド。表が A / 10点札のときは裏をのぞき、BJならその場で決着
//   払い戻し (賭け金込み): 勝ち ×2 / ブラックジャック ×2.5 (端数切り捨て) / 引き分け ×1
//   ダブル: どの2枚からでも (スプリット後も可)。スプリット: 同じ点数の2枚、4手まで
//   A をスプリットした手は1枚ずつしか配らず、A+10点札でも 21 扱い (ブラックジャックではない)
//   インシュランス・サレンダーはなし

export const BLACKJACK_DECKS = 6;
export const BLACKJACK_MAX_HANDS = 4;
export const BLACKJACK_MOVES = ['hit', 'stand', 'double', 'split'];

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['S', 'H', 'D', 'C'];
const CARDS = SUITS.flatMap(suit => RANKS.map(rank => `${rank}${suit}`));

export class BlackjackRuleError extends Error {}

/** "10H" → "10" */
export function cardRank(card) {
  return String(card).slice(0, -1);
}

/** A は 1、絵札は 10 */
export function cardPoint(card) {
  const rank = cardRank(card);
  if (rank === 'A') return 1;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

/** A を 11 と数えても 21 を超えないときはソフト (A を1枚だけ 11 にする) */
export function handValue(cards) {
  let total = 0;
  let hasAce = false;
  cards.forEach(card => {
    const point = cardPoint(card);
    total += point;
    if (point === 1) hasAce = true;
  });
  const soft = hasAce && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

/** 最初の2枚で 21 (スプリットした手は含めない) */
function isNatural(cards) {
  return cards.length === 2 && handValue(cards).total === 21;
}

function isNaturalHand(hand) {
  return !hand.split && isNatural(hand.cards);
}

function roundCards(round) {
  return [...round.dealer, ...round.hands.flatMap(hand => hand.cards)];
}

/** 6デッキのうち、この勝負で配ったカードを除いた残りから1枚引く */
function drawCard(round, randomInt) {
  const used = new Map();
  roundCards(round).forEach(card => used.set(card, (used.get(card) || 0) + 1));
  const remaining = BLACKJACK_DECKS * CARDS.length - roundCards(round).length;
  let index = randomInt(remaining);
  for (const card of CARDS) {
    const left = BLACKJACK_DECKS - (used.get(card) || 0);
    if (index < left) return card;
    index -= left;
  }
  throw new Error('カードが足りません。');
}

function sumOf(values) {
  return values.reduce((sum, value) => sum + value, 0);
}

/** 1手ぶんの勝敗と払い戻し (賭け金込み) */
function judgeHand(hand, dealerCards) {
  const player = handValue(hand.cards).total;
  const dealer = handValue(dealerCards).total;
  const playerNatural = isNaturalHand(hand);
  const dealerNatural = isNatural(dealerCards);
  if (player > 21) return { result: 'bust', returned: 0 };
  if (playerNatural && dealerNatural) return { result: 'push', returned: hand.bet };
  if (playerNatural) return { result: 'blackjack', returned: hand.bet + Math.floor(hand.bet * 3 / 2) };
  if (dealerNatural) return { result: 'lose', returned: 0 };
  if (dealer > 21 || player > dealer) return { result: 'win', returned: hand.bet * 2 };
  if (player === dealer) return { result: 'push', returned: hand.bet };
  return { result: 'lose', returned: 0 };
}

/** 全部の手が終わったら、ディーラーが引いて勝敗をつける */
function finishRound(round, randomInt) {
  const naturalShowdown = isNatural(round.dealer) || round.hands.some(isNaturalHand);
  const hasLiveHand = round.hands.some(hand => handValue(hand.cards).total <= 21);
  // 全員バースト、またはナチュラルで決着した勝負ではディーラーは引かない
  if (hasLiveHand && !naturalShowdown) {
    while (handValue(round.dealer).total < 17) {
      round.dealer.push(drawCard(round, randomInt));
    }
  }
  round.hands.forEach(hand => Object.assign(hand, judgeHand(hand, round.dealer)));
  round.phase = 'done';
  round.active = round.hands.length;
  round.totalBet = sumOf(round.hands.map(hand => hand.bet));
  round.returned = sumOf(round.hands.map(hand => hand.returned));
  return round;
}

/**
 * 次に操作する手へ進める。スプリットで1枚になった手にはここで2枚目を配る。
 * A のスプリットと 21 になった手は操作を待たずに終える。
 */
function advance(round, randomInt) {
  while (round.active < round.hands.length) {
    const hand = round.hands[round.active];
    if (hand.cards.length === 1) {
      hand.cards.push(drawCard(round, randomInt));
      if (hand.splitAces || handValue(hand.cards).total === 21) hand.done = true;
    }
    if (!hand.done) return round;
    round.active += 1;
  }
  return finishRound(round, randomInt);
}

/** 賭け金 bet で1勝負を始める。ナチュラルがあればその場で決着した状態で返す */
export function startBlackjackRound(bet, randomInt, startedAt) {
  const hand = { cards: [], bet, doubled: false, split: false, splitAces: false, done: false };
  // seq は操作のたびに1つ進める。ブラウザから届いた操作が今の盤面に対するものかの確認に使う
  const round = { phase: 'player', hands: [hand], active: 0, dealer: [], seq: 0, startedAt };
  // 実際の配り順: プレイヤー → ディーラー表 → プレイヤー → ディーラー裏
  hand.cards.push(drawCard(round, randomInt));
  round.dealer.push(drawCard(round, randomInt));
  hand.cards.push(drawCard(round, randomInt));
  round.dealer.push(drawCard(round, randomInt));

  if (isNatural(hand.cards) || isNatural(round.dealer)) {
    hand.done = true;
    return finishRound(round, randomInt);
  }
  return round;
}

/** いま操作中の手でできること。chips は手元に残っているチップ (ダブル・スプリットの追加分に使う) */
export function blackjackActions(round, chips) {
  if (!round || round.phase !== 'player') return null;
  const hand = round.hands[round.active];
  const firstTwo = hand.cards.length === 2 && !hand.splitAces;
  const affordable = chips >= hand.bet;
  return {
    hit: !hand.splitAces,
    stand: true,
    double: firstTwo && affordable,
    split: firstTwo && affordable
      && round.hands.length < BLACKJACK_MAX_HANDS
      && cardPoint(hand.cards[0]) === cardPoint(hand.cards[1])
  };
}

/**
 * 操作を1つ適用する。round はその場で書き換える。
 * 戻り値の chips はダブル・スプリットで追加した賭け金を引いたあとの手元チップ
 * (払い戻しはまだ足していない。round.phase が 'done' になったら round.returned を足す)。
 */
export function applyBlackjackMove(round, move, chips, randomInt) {
  const actions = blackjackActions(round, chips);
  if (!actions) throw new BlackjackRuleError('進行中の勝負がありません。');
  if (!BLACKJACK_MOVES.includes(move) || !actions[move]) {
    throw new BlackjackRuleError('いまはその操作はできません。');
  }

  const hand = round.hands[round.active];
  let nextChips = chips;
  round.seq = (round.seq || 0) + 1;
  if (move === 'hit') {
    hand.cards.push(drawCard(round, randomInt));
    if (handValue(hand.cards).total >= 21) hand.done = true;
  } else if (move === 'stand') {
    hand.done = true;
  } else if (move === 'double') {
    nextChips -= hand.bet;
    hand.bet *= 2;
    hand.doubled = true;
    hand.cards.push(drawCard(round, randomInt));
    hand.done = true;
  } else if (move === 'split') {
    nextChips -= hand.bet;
    const [first, second] = hand.cards;
    const splitAces = cardRank(first) === 'A';
    Object.assign(hand, { cards: [first], split: true, splitAces });
    round.hands.splice(round.active + 1, 0, {
      cards: [second], bet: hand.bet, doubled: false, split: true, splitAces, done: false
    });
  }
  advance(round, randomInt);
  return { round, chips: nextChips };
}

/** 放置された勝負を、残りの手をすべてスタンドしたものとして決着させる */
export function standOutBlackjackRound(round, chips, randomInt) {
  let current = chips;
  while (round.phase === 'player') {
    current = applyBlackjackMove(round, 'stand', current, randomInt).chips;
  }
  return { round, chips: current };
}

/** ブラウザに返す形。勝負の途中はディーラーの裏札を null にして隠す */
export function publicBlackjackRound(round, chips) {
  if (!round) return null;
  const finished = round.phase === 'done';
  const dealerCards = finished ? round.dealer : [round.dealer[0], null];
  const hands = round.hands.map(hand => ({
    cards: hand.cards,
    bet: hand.bet,
    doubled: Boolean(hand.doubled),
    split: Boolean(hand.split),
    ...handValue(hand.cards),
    result: hand.result ?? null,
    returned: hand.returned ?? null
  }));
  const totalBet = sumOf(hands.map(hand => hand.bet));
  return {
    phase: round.phase,
    seq: round.seq || 0,
    active: finished ? null : round.active,
    hands,
    dealer: { cards: dealerCards, ...handValue(dealerCards.filter(Boolean)) },
    actions: blackjackActions(round, chips),
    totalBet,
    returned: finished ? round.returned : null,
    net: finished ? round.returned - totalBet : null
  };
}

/** 直近の勝負の一覧に載せる要約 */
export function summarizeBlackjackRound(round, at) {
  const results = round.hands.map(hand => hand.result);
  return {
    result: results.length === 1 ? results[0] : 'split',
    bet: round.totalBet,
    returned: round.returned,
    net: round.returned - round.totalBet,
    player: round.hands.map(hand => handValue(hand.cards).total),
    dealer: handValue(round.dealer).total,
    at
  };
}
