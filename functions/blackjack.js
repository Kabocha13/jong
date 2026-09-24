// ブラックジャックの1勝負ぶんのルール (Firestore には触らない)。
// 1つのディーラーに対して、席順に並んだ複数のプレイヤーが同時に勝負する。
// 乱数は呼び出し側から randomInt(n) → 0〜n-1 の整数 として受け取る。
//
// ルール
//   6デッキを1勝負ごとにシャッフル (前の勝負で出たカードは戻る = カウンティングは効かない)
//   配り順は 各プレイヤー1枚 → ディーラー表 → 各プレイヤー2枚目 → ディーラー裏
//   ディーラーはソフト17を含む17以上でスタンド。裏をのぞいてBJならその場で全員決着
//   払い戻し (賭け金込み): 勝ち ×2 / ブラックジャック ×2.5 (端数切り捨て) / 引き分け ×1
//   ダブル: どの2枚からでも (スプリット後も可)。スプリット: 同じ点数の2枚、1人4手まで
//   A をスプリットした手は1枚ずつしか配らず、A+10点札でも 21 扱い (ブラックジャックではない)
//   インシュランス・サレンダーはなし
//
// round = {
//   phase: 'player' | 'done',
//   players: [{ seat, uid, name, hands: [hand] }],   席順
//   turn: { player, hand } | null,                    いま操作する手 (players と hands の添字)
//   dealer: [cards],                                  2枚目が裏札
//   seq,                                              操作のたびに1つ進む番号
//   startedAt
// }
// hand = { cards, bet, doubled, split, splitAces, done, result?, returned? }

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

/** 最初の2枚で 21 */
function isNatural(cards) {
  return cards.length === 2 && handValue(cards).total === 21;
}

/** スプリットした手の 21 はブラックジャックにしない */
function isNaturalHand(hand) {
  return !hand.split && isNatural(hand.cards);
}

function allHands(round) {
  return round.players.flatMap(player => player.hands);
}

function roundCards(round) {
  return [...round.dealer, ...allHands(round).flatMap(hand => hand.cards)];
}

/** 6デッキのうち、この勝負で配ったカードを除いた残りから1枚引く */
function drawCard(round, randomInt) {
  const dealt = roundCards(round);
  const used = new Map();
  dealt.forEach(card => used.set(card, (used.get(card) || 0) + 1));
  let index = randomInt(BLACKJACK_DECKS * CARDS.length - dealt.length);
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

function newHand(bet) {
  return { cards: [], bet, doubled: false, split: false, splitAces: false, done: false };
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

/** 全員の手が終わったら、ディーラーが引いて勝敗をつける */
function finishRound(round, randomInt) {
  const hands = allHands(round);
  // バーストもナチュラルもしていない手が1つでも残っていれば、ディーラーは17まで引く
  const contested = !isNatural(round.dealer)
    && hands.some(hand => handValue(hand.cards).total <= 21 && !isNaturalHand(hand));
  if (contested) {
    while (handValue(round.dealer).total < 17) {
      round.dealer.push(drawCard(round, randomInt));
    }
  }
  hands.forEach(hand => Object.assign(hand, judgeHand(hand, round.dealer)));
  round.phase = 'done';
  round.turn = null;
  return round;
}

/**
 * 次に操作する手へ進める。スプリットで1枚になった手にはここで2枚目を配る。
 * A のスプリットと 21 になった手は操作を待たずに終え、全員終われば決着させる。
 */
function advance(round, randomInt) {
  while (round.turn.player < round.players.length) {
    const player = round.players[round.turn.player];
    while (round.turn.hand < player.hands.length) {
      const hand = player.hands[round.turn.hand];
      if (hand.cards.length === 1) {
        hand.cards.push(drawCard(round, randomInt));
        if (hand.splitAces || handValue(hand.cards).total === 21) hand.done = true;
      }
      if (!hand.done) return round;
      round.turn.hand += 1;
    }
    round.turn = { player: round.turn.player + 1, hand: 0 };
  }
  return finishRound(round, randomInt);
}

/**
 * 勝負を始める。entries は席順の [{ seat, uid, name, bet }]。
 * ディーラーがBJならその場で全員決着した状態で返す。
 */
export function startBlackjackRound(entries, randomInt, startedAt) {
  if (!entries.length) throw new BlackjackRuleError('賭けている人がいません。');
  const round = {
    phase: 'player',
    players: entries.map(({ seat, uid, name, bet }) => ({ seat, uid, name, hands: [newHand(bet)] })),
    turn: null,
    dealer: [],
    seq: 0,
    startedAt
  };
  round.players.forEach(player => player.hands[0].cards.push(drawCard(round, randomInt)));
  round.dealer.push(drawCard(round, randomInt));
  round.players.forEach(player => player.hands[0].cards.push(drawCard(round, randomInt)));
  round.dealer.push(drawCard(round, randomInt));

  const dealerNatural = isNatural(round.dealer);
  round.players.forEach(player => {
    const hand = player.hands[0];
    if (dealerNatural || isNatural(hand.cards)) hand.done = true;
  });
  if (dealerNatural) return finishRound(round, randomInt);
  round.turn = { player: 0, hand: 0 };
  return advance(round, randomInt);
}

/** いま操作する人 (勝負が終わっていれば null) */
export function blackjackTurnPlayer(round) {
  if (!round || round.phase !== 'player' || !round.turn) return null;
  return round.players[round.turn.player];
}

/** いま操作中の手でできること。chips はその人の手元に残っているチップ (ダブル・スプリットの追加分) */
export function blackjackActions(round, chips) {
  const player = blackjackTurnPlayer(round);
  if (!player) return null;
  const hand = player.hands[round.turn.hand];
  const firstTwo = hand.cards.length === 2 && !hand.splitAces;
  const affordable = chips >= hand.bet;
  return {
    hit: !hand.splitAces,
    stand: true,
    double: firstTwo && affordable,
    split: firstTwo && affordable
      && player.hands.length < BLACKJACK_MAX_HANDS
      && cardPoint(hand.cards[0]) === cardPoint(hand.cards[1])
  };
}

/**
 * いまの番の人の操作を1つ適用する。round はその場で書き換える。
 * 戻り値の chips はダブル・スプリットで追加した賭け金を引いたあとの、その人の手元チップ。
 */
export function applyBlackjackMove(round, move, chips, randomInt) {
  const actions = blackjackActions(round, chips);
  if (!actions) throw new BlackjackRuleError('進行中の勝負がありません。');
  if (!BLACKJACK_MOVES.includes(move) || !actions[move]) {
    throw new BlackjackRuleError('いまはその操作はできません。');
  }

  const player = round.players[round.turn.player];
  const hand = player.hands[round.turn.hand];
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
    player.hands.splice(round.turn.hand + 1, 0, {
      ...newHand(hand.bet), cards: [second], split: true, splitAces
    });
  }
  advance(round, randomInt);
  return { round, chips: nextChips };
}

/** いまの番の人が時間切れのとき、その人の残りの手をすべてスタンドにして次の人へ回す */
export function standOutTurnPlayer(round, randomInt) {
  const current = round.turn ? round.turn.player : -1;
  while (round.phase === 'player' && round.turn.player === current) {
    applyBlackjackMove(round, 'stand', 0, randomInt);
  }
  return round;
}

/** 1人ぶんの賭け金の合計と払い戻し (決着前の払い戻しは null) */
export function blackjackPlayerTotals(player) {
  const bet = sumOf(player.hands.map(hand => hand.bet));
  const finished = player.hands.every(hand => hand.result);
  const returned = finished ? sumOf(player.hands.map(hand => hand.returned)) : null;
  return { bet, returned, net: finished ? returned - bet : null };
}

/**
 * ブラウザに返す形。勝負の途中はディーラーの裏札を null にして隠す。
 * turnChips は いまの番の人の手元チップ (ダブル・スプリットができるかの判定用)。
 */
export function publicBlackjackRound(round, turnChips = 0) {
  if (!round) return null;
  const finished = round.phase === 'done';
  const dealerCards = finished ? round.dealer : [round.dealer[0], null];
  const turnPlayer = blackjackTurnPlayer(round);
  return {
    phase: round.phase,
    seq: round.seq || 0,
    no: round.no || 0,
    turn: turnPlayer ? { seat: turnPlayer.seat, hand: round.turn.hand } : null,
    players: round.players.map(player => ({
      seat: player.seat,
      name: player.name,
      hands: player.hands.map(hand => ({
        cards: hand.cards,
        bet: hand.bet,
        doubled: Boolean(hand.doubled),
        split: Boolean(hand.split),
        ...handValue(hand.cards),
        result: hand.result ?? null,
        returned: hand.returned ?? null
      })),
      ...blackjackPlayerTotals(player)
    })),
    dealer: { cards: dealerCards, ...handValue(dealerCards.filter(Boolean)) },
    actions: blackjackActions(round, turnChips)
  };
}

/** 本人の直近の勝負の一覧に載せる要約 */
export function summarizeBlackjackPlayer(round, player, at) {
  const { bet, returned } = blackjackPlayerTotals(player);
  return {
    result: player.hands.length === 1 ? player.hands[0].result : 'split',
    bet,
    returned,
    net: returned - bet,
    player: player.hands.map(hand => handValue(hand.cards).total),
    dealer: handValue(round.dealer).total,
    at
  };
}
