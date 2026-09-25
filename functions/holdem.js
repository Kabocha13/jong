// テキサスホールデム (ノーリミット) の1ハンドぶんのルール (Firestore には触らない)。
// 乱数は呼び出し側から randomInt(n) → 0〜n-1 の整数 として受け取る。
//
// ルール
//   1デッキをハンドごとにシャッフル。ブラインドは SB / BB (holdem-table.js が決める)
//   プリフロップは BB の次の人から、フロップ以降はボタンの次の人から時計回り
//   レイズの最小額は「直前のレイズ幅」(なければ BB)。オールインは常にできる
//   ショーダウンは 7枚 (手札2 + ボード5) から最強の5枚。同じ強さなら山分け (端数はボタンの次の人から)
//   降りていない人が1人になればその場で決着 (カードは見せない)
//   サイドポットは、各人が出した額の段ごとに分けて配る
//
// round = {
//   no, phase: 'preflop' | 'flop' | 'turn' | 'river' | 'done',
//   players: [{ seat, uid, name, bot, hole, stack, committed, streetBet, folded, allIn, acted, shown, ... }],  席順
//   board: [cards],          配った分だけ (最大5枚)
//   button: players の添字,
//   turn: players の添字 | null,
//   currentBet, minRaise,    いまのストリートで一番多い賭け金と、次のレイズの最小幅
//   pot,                     全員が出した額の合計
//   log: [{ seq, seat, move, amount, pot, stack, street, delay }],   演出用の記録
//   seq, startedAt, finishedAt, winners, showdown
// }

export const HOLDEM_MOVES = ['fold', 'check', 'call', 'raise', 'allin'];
export const HOLDEM_STREETS = ['preflop', 'flop', 'turn', 'river'];

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['S', 'H', 'D', 'C'];
export const HOLDEM_CARDS = SUITS.flatMap(suit => RANKS.map(rank => `${rank}${suit}`));

export const HAND_NAMES = {
  9: 'ロイヤルフラッシュ',
  8: 'ストレートフラッシュ',
  7: 'フォーカード',
  6: 'フルハウス',
  5: 'フラッシュ',
  4: 'ストレート',
  3: 'スリーカード',
  2: 'ツーペア',
  1: 'ワンペア',
  0: 'ハイカード'
};

export class HoldemRuleError extends Error {}

/** "10H" → 数値 (2〜14。A は 14) */
export function cardValue(card) {
  return RANKS.indexOf(String(card).slice(0, -1)) + 2;
}

export function cardSuit(card) {
  return String(card).slice(-1);
}

// ------------------------------------------------------------------
// 役の評価
// ------------------------------------------------------------------
const FIVE_COMBOS_OF_7 = [];
for (let a = 0; a < 7; a++) {
  for (let b = a + 1; b < 7; b++) {
    for (let c = b + 1; c < 7; c++) {
      for (let d = c + 1; d < 7; d++) {
        for (let e = d + 1; e < 7; e++) FIVE_COMBOS_OF_7.push([a, b, c, d, e]);
      }
    }
  }
}

/**
 * 5枚の役を1つの数にする (大きいほど強い)。
 * 上位の桁が役の種類 (0〜9)、下位がキッカーの並び (15進で5桁)。
 */
export function scoreFive(cards) {
  const values = cards.map(cardValue).sort((x, y) => y - x);
  const suits = cards.map(cardSuit);
  const flush = suits.every(suit => suit === suits[0]);

  const counts = new Map();
  values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  // 枚数が多い順、同じ枚数なら数が大きい順
  const groups = Array.from(counts.entries()).sort((x, y) => y[1] - x[1] || y[0] - x[0]);

  let straightHigh = 0;
  if (groups.length === 5) {
    if (values[0] - values[4] === 4) straightHigh = values[0];
    else if (values[0] === 14 && values[1] === 5 && values[4] === 2) straightHigh = 5;   // A-2-3-4-5
  }

  let category;
  let kickers;
  if (straightHigh && flush) {
    category = straightHigh === 14 ? 9 : 8;
    kickers = [straightHigh];
  } else if (groups[0][1] === 4) {
    category = 7;
    kickers = [groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    category = 6;
    kickers = [groups[0][0], groups[1][0]];
  } else if (flush) {
    category = 5;
    kickers = values;
  } else if (straightHigh) {
    category = 4;
    kickers = [straightHigh];
  } else if (groups[0][1] === 3) {
    category = 3;
    kickers = [groups[0][0], groups[1][0], groups[2][0]];
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = 2;
    kickers = [groups[0][0], groups[1][0], groups[2][0]];
  } else if (groups[0][1] === 2) {
    category = 1;
    kickers = [groups[0][0], groups[1][0], groups[2][0], groups[3][0]];
  } else {
    category = 0;
    kickers = values;
  }

  let score = category;
  for (let i = 0; i < 5; i++) score = score * 15 + (kickers[i] || 0);
  return score;
}

/** 5〜7枚から最強の5枚を選ぶ。{ score, category, cards } */
export function bestHand(cards) {
  if (cards.length < 5) throw new HoldemRuleError('役を決めるには5枚以上必要です。');
  if (cards.length === 5) {
    const score = scoreFive(cards);
    return { score, category: Math.floor(score / 15 ** 5), cards: [...cards] };
  }
  let best = null;
  const combos = cards.length === 7 ? FIVE_COMBOS_OF_7 : combosOf(cards.length, 5);
  for (const combo of combos) {
    const hand = combo.map(index => cards[index]);
    const score = scoreFive(hand);
    if (!best || score > best.score) best = { score, cards: hand };
  }
  best.category = Math.floor(best.score / 15 ** 5);
  return best;
}

function combosOf(n, k) {
  const result = [];
  const walk = (start, picked) => {
    if (picked.length === k) {
      result.push([...picked]);
      return;
    }
    for (let i = start; i < n; i++) {
      picked.push(i);
      walk(i + 1, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return result;
}

export function handName(category) {
  return HAND_NAMES[category] || '';
}

// ------------------------------------------------------------------
// 配る
// ------------------------------------------------------------------
function roundCards(round) {
  return [...round.board, ...round.players.flatMap(player => player.hole)];
}

/** このハンドで配ったカードを除いた残りから1枚引く */
function drawCard(round, randomInt) {
  const used = new Set(roundCards(round));
  let index = randomInt(HOLDEM_CARDS.length - used.size);
  for (const card of HOLDEM_CARDS) {
    if (used.has(card)) continue;
    if (index === 0) return card;
    index -= 1;
  }
  throw new HoldemRuleError('カードが足りません。');
}

// ------------------------------------------------------------------
// 進行の補助
// ------------------------------------------------------------------
function activePlayers(round) {
  return round.players.filter(player => !player.folded);
}

/** まだ操作できる人 (降りておらず、オールインでもない) */
function canActPlayers(round) {
  return round.players.filter(player => !player.folded && !player.allIn);
}

function nextIndex(round, from, predicate) {
  const count = round.players.length;
  for (let step = 1; step <= count; step++) {
    const index = (from + step) % count;
    if (predicate(round.players[index])) return index;
  }
  return -1;
}

function streetIndex(round) {
  return HOLDEM_STREETS.indexOf(round.phase);
}

function logMove(round, player, move, amount, delay) {
  round.seq = (round.seq || 0) + 1;
  round.log.push({
    seq: round.seq,
    seat: player.seat,
    move,
    amount,
    pot: round.pot,
    stack: player.stack,
    bet: player.streetBet,
    street: round.phase,
    delay: delay || 0
  });
}

/** stack から amount (足りなければ全部) をポットへ出す。戻り値は実際に出した額 */
function commit(round, player, amount) {
  const paid = Math.min(amount, player.stack);
  player.stack -= paid;
  player.committed += paid;
  player.streetBet += paid;
  round.pot += paid;
  if (player.stack === 0) player.allIn = true;
  return paid;
}

// ------------------------------------------------------------------
// ハンドの開始
// ------------------------------------------------------------------
/**
 * entries は席順の [{ seat, uid, name, bot, stack }] (stack > 0)。button は entries の添字。
 * ブラインドを置き、2枚ずつ配って、最初に操作する人を決める。
 */
export function startHoldemRound(entries, { button, smallBlind, bigBlind, no, startedAt }, randomInt) {
  if (entries.length < 2) throw new HoldemRuleError('2人以上いないと始められません。');
  const round = {
    no,
    phase: 'preflop',
    players: entries.map(entry => ({
      seat: entry.seat,
      uid: entry.uid || null,
      name: entry.name,
      bot: entry.bot || null,
      hole: [],
      stack: entry.stack,
      committed: 0,
      streetBet: 0,
      folded: false,
      allIn: false,
      acted: false,
      shown: false,
      timedOut: false,
      result: null
    })),
    board: [],
    button,
    turn: null,
    currentBet: 0,
    minRaise: bigBlind,
    bigBlind,
    smallBlind,
    pot: 0,
    log: [],
    seq: 0,
    startedAt,
    finishedAt: null,
    winners: null,
    showdown: false
  };

  const count = round.players.length;
  const headsUp = count === 2;
  // ヘッズアップではボタンが SB
  const sbIndex = headsUp ? button : (button + 1) % count;
  const bbIndex = (sbIndex + 1) % count;
  const sb = round.players[sbIndex];
  const bb = round.players[bbIndex];
  sb.blind = 'SB';
  bb.blind = 'BB';
  commit(round, sb, smallBlind);
  logMove(round, sb, 'blind', sb.streetBet, 0);
  commit(round, bb, bigBlind);
  logMove(round, bb, 'blind', bb.streetBet, 0);
  round.currentBet = Math.max(sb.streetBet, bb.streetBet);

  for (let i = 0; i < 2; i++) {
    round.players.forEach(player => player.hole.push(drawCard(round, randomInt)));
  }

  // BB の次から。操作できる人が1人以下ならそのまま最後まで配る
  round.turn = nextIndex(round, bbIndex, player => !player.folded && !player.allIn);
  return settleStreetIfDone(round, randomInt);
}

// ------------------------------------------------------------------
// 操作
// ------------------------------------------------------------------
export function holdemTurnPlayer(round) {
  if (!round || round.phase === 'done' || round.turn === null || round.turn < 0) return null;
  return round.players[round.turn];
}

/** いま操作する人ができること。額は「そのストリートで合計いくらまで賭けるか (raise to)」 */
export function holdemActions(round) {
  const player = holdemTurnPlayer(round);
  if (!player) return null;
  const toCall = Math.min(round.currentBet - player.streetBet, player.stack);
  const maxTo = player.streetBet + player.stack;
  const minRaiseTo = round.currentBet + round.minRaise;
  const canRaise = maxTo > round.currentBet && player.stack > toCall;
  return {
    fold: true,
    check: toCall === 0,
    call: toCall > 0,
    toCall,
    raise: canRaise && maxTo >= minRaiseTo,
    minRaiseTo: Math.min(minRaiseTo, maxTo),
    maxRaiseTo: maxTo,
    allin: player.stack > 0,
    pot: round.pot
  };
}

/**
 * いまの番の人の操作を1つ適用する。round はその場で書き換える。
 * raise の amount は「そのストリートの合計額 (raise to)」。allin は残り全部。
 */
export function applyHoldemMove(round, move, rawAmount, randomInt, { delay = 0 } = {}) {
  const actions = holdemActions(round);
  if (!actions) throw new HoldemRuleError('進行中のハンドがありません。');
  if (!HOLDEM_MOVES.includes(move)) throw new HoldemRuleError('不明な操作です。');
  const player = round.players[round.turn];

  if (move === 'fold') {
    player.folded = true;
    player.acted = true;
    logMove(round, player, 'fold', 0, delay);
  } else if (move === 'check') {
    if (!actions.check) throw new HoldemRuleError('チェックはできません (賭け金が上がっています)。');
    player.acted = true;
    logMove(round, player, 'check', 0, delay);
  } else if (move === 'call') {
    if (!actions.call) throw new HoldemRuleError('コールする額がありません。');
    commit(round, player, actions.toCall);
    player.acted = true;
    logMove(round, player, 'call', player.streetBet, delay);
  } else {
    let to;
    if (move === 'allin') {
      to = actions.maxRaiseTo;
    } else {
      to = Number(rawAmount);
      if (!Number.isSafeInteger(to)) throw new HoldemRuleError('レイズ額は整数で指定してください。');
      if (!actions.raise) throw new HoldemRuleError('いまはレイズできません。');
      if (to < actions.minRaiseTo) throw new HoldemRuleError(`レイズは ${actions.minRaiseTo} 以上にしてください。`);
      if (to > actions.maxRaiseTo) throw new HoldemRuleError(`レイズは手元の ${actions.maxRaiseTo} までです。`);
    }
    if (to <= round.currentBet) {
      // オールインだが額が足りずコール扱い
      commit(round, player, to - player.streetBet);
      player.acted = true;
      logMove(round, player, 'allin', player.streetBet, delay);
    } else {
      const raiseBy = to - round.currentBet;
      commit(round, player, to - player.streetBet);
      // 最小幅に満たないオールインは、ほかの人のレイズ権を復活させない
      if (raiseBy >= round.minRaise) {
        round.minRaise = raiseBy;
        round.players.forEach(other => { if (other !== player) other.acted = false; });
      }
      round.currentBet = to;
      player.acted = true;
      logMove(round, player, player.allIn ? 'allin' : 'raise', to, delay);
    }
  }

  advanceTurn(round, randomInt);
  return round;
}

/** 番を次の人へ。全員が並んだらストリートを進める */
function advanceTurn(round, randomInt) {
  if (activePlayers(round).length <= 1) {
    return finishRound(round, randomInt);
  }
  const pending = canActPlayers(round).filter(player => !player.acted || player.streetBet < round.currentBet);
  if (pending.length) {
    round.turn = nextIndex(round, round.turn, player => !player.folded && !player.allIn
      && (!player.acted || player.streetBet < round.currentBet));
    return round;
  }
  return nextStreet(round, randomInt);
}

function nextStreet(round, randomInt) {
  const street = streetIndex(round);
  if (street >= 3) return finishRound(round, randomInt);
  round.players.forEach(player => {
    player.streetBet = 0;
    player.acted = false;
  });
  round.currentBet = 0;
  round.minRaise = round.bigBlind;
  round.phase = HOLDEM_STREETS[street + 1];
  const deal = round.phase === 'flop' ? 3 : 1;
  for (let i = 0; i < deal; i++) round.board.push(drawCard(round, randomInt));
  round.seq = (round.seq || 0) + 1;
  round.log.push({ seq: round.seq, seat: null, move: 'street', amount: 0, pot: round.pot, stack: 0, bet: 0, street: round.phase, delay: 0 });
  round.turn = nextIndex(round, round.button, player => !player.folded && !player.allIn);
  return settleStreetIfDone(round, randomInt);
}

/** 操作できる人が1人以下 (ほかは全員オールイン) なら、賭けは起きないので最後まで配る */
function settleStreetIfDone(round, randomInt) {
  if (round.phase === 'done') return round;
  const actors = canActPlayers(round);
  if (activePlayers(round).length <= 1) return finishRound(round, randomInt);
  // 1人だけ残っていて、その人がすでに一番多く出していれば賭けは起きない
  if (actors.length === 0 || (actors.length === 1 && actors[0].streetBet >= round.currentBet)) {
    round.turn = null;
    while (round.phase !== 'river' && round.phase !== 'done') {
      const street = streetIndex(round);
      round.phase = HOLDEM_STREETS[street + 1];
      const deal = round.phase === 'flop' ? 3 : 1;
      for (let i = 0; i < deal; i++) round.board.push(drawCard(round, randomInt));
      round.seq = (round.seq || 0) + 1;
      round.log.push({ seq: round.seq, seat: null, move: 'street', amount: 0, pot: round.pot, stack: 0, bet: 0, street: round.phase, delay: 0 });
    }
    return finishRound(round, randomInt);
  }
  if (round.turn < 0) round.turn = round.players.indexOf(actors[0]);
  return round;
}

// ------------------------------------------------------------------
// 決着
// ------------------------------------------------------------------
/** ボタンの次の人から数えた順番 (端数の配り先を決める) */
function orderFromButton(round) {
  const count = round.players.length;
  return round.players.map((player, index) => ({ player, order: (index - round.button - 1 + count * 2) % count }));
}

function finishRound(round, randomInt) {
  const alive = activePlayers(round);
  round.turn = null;
  round.players.forEach(player => { player.won = 0; });

  if (alive.length === 1) {
    // 全員降りた: 見せずに総取り
    alive[0].won = round.pot;
    round.winners = [{ seat: alive[0].seat, amount: round.pot, category: null, cards: null }];
    round.showdown = false;
  } else {
    // ボードが5枚になるまで配る (全員オールインで先に決着したときも)
    while (round.board.length < 5) round.board.push(drawCard(round, randomInt));
    round.showdown = true;
    const hands = new Map();
    alive.forEach(player => {
      player.shown = true;
      const best = bestHand([...player.hole, ...round.board]);
      player.hand = { category: best.category, cards: best.cards, score: best.score };
      hands.set(player, best.score);
    });
    const order = new Map(orderFromButton(round).map(({ player, order: o }) => [player, o]));
    const winners = new Map();
    // 出した額の段ごとにポットを分ける
    const levels = Array.from(new Set(alive.map(player => player.committed))).sort((x, y) => x - y);
    let previous = 0;
    let distributed = 0;
    let lastShare = [];
    const award = (share, amount) => {
      const each = Math.floor(amount / share.length);
      let rest = amount - each * share.length;
      share.forEach(player => {
        const extra = rest > 0 ? 1 : 0;
        rest -= extra;
        player.won += each + extra;
        winners.set(player, (winners.get(player) || 0) + each + extra);
      });
      distributed += amount;
    };
    levels.forEach(level => {
      const amount = round.players.reduce((sum, player) => sum + Math.max(0, Math.min(player.committed, level) - previous), 0);
      previous = level;
      const eligible = alive.filter(player => player.committed >= level);
      const top = Math.max(...eligible.map(player => hands.get(player)));
      lastShare = eligible.filter(player => hands.get(player) === top)
        .sort((x, y) => order.get(x) - order.get(y));
      if (amount > 0) award(lastShare, amount);
    });
    // 降りた人が誰よりも多く出していた分 (ふつうは起きない) は、いちばん上の段の勝者へ
    if (round.pot > distributed && lastShare.length) award(lastShare, round.pot - distributed);
    round.winners = Array.from(winners.entries())
      .sort((x, y) => y[1] - x[1])
      .map(([player, amount]) => ({ seat: player.seat, amount, category: player.hand.category, cards: player.hand.cards }));
  }

  round.players.forEach(player => {
    player.stack += player.won;
    player.result = player.folded ? 'fold' : player.won > 0 ? 'win' : 'lose';
    player.net = player.won - player.committed;
  });
  round.phase = 'done';
  return round;
}

/** 時間切れ: チェックできればチェック、できなければフォールド */
export function timeoutTurnPlayer(round, randomInt) {
  const actions = holdemActions(round);
  if (!actions) return round;
  const player = round.players[round.turn];
  player.timedOut = true;
  return applyHoldemMove(round, actions.check ? 'check' : 'fold', 0, randomInt);
}

// ------------------------------------------------------------------
// 見せる形
// ------------------------------------------------------------------
/**
 * ブラウザに返す形。ほかの人の手札は決着して見せた分だけ出す (自分の手札は holdem_hole から読む)。
 */
export function publicHoldemRound(round) {
  if (!round) return null;
  const turnPlayer = holdemTurnPlayer(round);
  return {
    no: round.no,
    phase: round.phase,
    seq: round.seq || 0,
    board: round.board,
    pot: round.pot,
    currentBet: round.currentBet,
    button: round.players[round.button]?.seat ?? null,
    turn: turnPlayer ? turnPlayer.seat : null,
    showdown: Boolean(round.showdown),
    players: round.players.map(player => ({
      seat: player.seat,
      name: player.name,
      bot: player.bot,
      blind: player.blind || null,
      hole: player.shown ? player.hole : null,
      stack: player.stack,
      committed: player.committed,
      streetBet: player.streetBet,
      folded: player.folded,
      allIn: player.allIn,
      timedOut: player.timedOut,
      result: player.result,
      net: player.result ? player.net : null,
      hand: player.shown && player.hand ? { category: player.hand.category, name: handName(player.hand.category), cards: player.hand.cards } : null
    })),
    winners: round.winners ? round.winners.map(winner => ({ ...winner, name: handName(winner.category) })) : null,
    log: round.log,
    actions: holdemActions(round),
    startedAt: round.startedAt,
    finishedAt: round.finishedAt
  };
}

/** 本人の直近の一覧に載せる要約 */
export function summarizeHoldemPlayer(round, player, at) {
  return {
    result: player.result,
    net: player.net,
    committed: player.committed,
    won: player.won,
    hand: player.hand ? handName(player.hand.category) : null,
    hole: player.hole,
    board: round.board,
    at
  };
}
