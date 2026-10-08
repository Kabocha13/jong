// HL (ハイアンドロー。58.3〜)。トークンを手に入れるためのゲーム。Firestore には触らない (index.js から呼ぶ)。
//
// ルール
//   1回 HL_COST (300,000) のレートを払う (その場でレートから引く。戻らない)。
//   52枚のトランプをよく混ぜ、1枚目を表に出す。次のカードが「上 (High)」か「下 (Low)」かを当てるのを HL_ROUNDS (10) 回続ける
//   (当てたカードが次の比べる元になる)。数字は A (1) がいちばん小さく、K (13) がいちばん大きい。マークは関係なく、同じ数字ははずれ。
//   HL_WINS_FOR_TOKEN (5) 回以上当てたら、トークンを1つ手に入れる (players の tokens)。
//   残っているカードの多いほうを選ぶいちばん良い当て方なら、5回以上当たる確率は約98.4% (勝ち数の平均は約7.3回)。
//   山札の残り (これから出るカード) は Cloud Functions の中 (hl_games) だけに持ち、画面には出たカードしか渡さない。
//   途中でやめても、続きから遊べる (終わるまで次の1回は始められない)。

export class HlError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const HL_COST = 300000;
export const HL_ROUNDS = 10;
export const HL_WINS_FOR_TOKEN = 5;
// トークンの特典 (持っている数で増える): 1つで永久Pro会員 (58.3〜)、2つで借金の信用 MAX (59.0〜。信用枠がいつも上限)
export const TOKEN_PRO_FOREVER = 1;
export const TOKEN_TRUST_MAX = 2;

/** players のトークンの数 */
export function playerTokens(player) {
  return Math.max(0, Math.floor(Number(player?.tokens) || 0));
}
const HL_SUITS = 4;
const HL_RANKS = 13;

/** 新しい1回。山札は 52枚を混ぜて、使う 1 + HL_ROUNDS 枚だけ持つ。カードは { rank (1〜13), suit (0〜3) } */
export function newHlGame(randomInt, nowIso) {
  const deck = [];
  for (let rank = 1; rank <= HL_RANKS; rank++) {
    for (let suit = 0; suit < HL_SUITS; suit++) deck.push({ rank, suit });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return {
    deck: deck.slice(0, HL_ROUNDS + 1),
    round: 0,          // 当て終わった回数
    wins: 0,
    guesses: [],       // [{ guess: 'high' | 'low', win }]
    startedAt: nowIso,
    finishedAt: null,
    token: false       // トークンを手に入れたか (終わったときに決まる)
  };
}

export function isHlFinished(game) {
  return Boolean(game) && game.round >= HL_ROUNDS;
}

/** 1回当てる。guess は 'high' か 'low'。戻り値は進めたあとの game (元の game は書き換えない) */
export function guessHl(game, rawGuess) {
  if (!game || isHlFinished(game)) throw new HlError(409, 'いま遊んでいる High&Low がありません。');
  const guess = String(rawGuess || '');
  if (guess !== 'high' && guess !== 'low') throw new HlError(400, '「High」か「Low」を選んでください。');
  const current = game.deck[game.round];
  const next = game.deck[game.round + 1];
  const win = guess === 'high' ? next.rank > current.rank : next.rank < current.rank;
  const round = game.round + 1;
  const wins = game.wins + (win ? 1 : 0);
  return {
    ...game,
    round,
    wins,
    guesses: [...game.guesses, { guess, win }],
    token: round >= HL_ROUNDS ? wins >= HL_WINS_FOR_TOKEN : false
  };
}

/** 画面に返す形 (これから出るカードは含めない) */
export function publicHlGame(game) {
  if (!game) return null;
  const finished = isHlFinished(game);
  return {
    round: game.round,
    rounds: HL_ROUNDS,
    wins: game.wins,
    need: HL_WINS_FOR_TOKEN,
    cards: game.deck.slice(0, game.round + 1),   // 出たカード (いちばん後ろがいまのカード)
    guesses: game.guesses,
    finished,
    token: finished ? Boolean(game.token) : false,
    startedAt: game.startedAt || null,
    finishedAt: game.finishedAt || null
  };
}
