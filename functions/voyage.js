// 航海 (大海賊の航海日誌) のルール (Firestore には触らない)。
//   2026/10/5 (月) 〜 12/21 (月) の期間限定。1周30マスのエンドレス双六で、毎週月曜 0:00 (JST) に章が進む
//   (11章 + 最終日の第12章。章は日付から決めるので、週ごとのデプロイは要らない)。
//   賭け金は VOYAGE_BET (10) で固定。「振る」と、サイコロの目だけコマが進み、止まったマスで払い戻しが決まる。
//   ジャックポットは VOYAGE_JP_BASE (1000) を土台に、賭け金の VOYAGE_JP_RATE % を上乗せして貯める
//   (船長マスで 1/VOYAGE_JP_ODDS で総取り。当たると土台の VOYAGE_JP_BASE から貯め直す)。
//   最終秘宝は VOYAGE_TREASURE_BASE (5000) を土台に、賭け金の VOYAGE_TREASURE_RATE % を上乗せして貯め、
//   12/22 0:10 に「周回の数」の比で全員に山分けする。土台の分は運営が出す (賭け金からは出ない)。
//   周回は港を通って1周するたびに1つ増える (港より手前へ押し戻されて通り直した分は数えない)。
//   取り分 (全員の周回の合計に対する自分の割合) は画面には出さない。
//   マスの中身は章ごとに変わる (第8章は目が 1〜3、第10章は盤が逆回り、第11・12章は船長チャンスが必ず当たる)。
//   還元率は 即時の配当 約99% (章ごとに 98〜100%)。JP 6% と最終秘宝 8% はその上に乗せる (全体で約113%。
//   ゲームの釣り合いより、その場で戻る手応えを優先した)。正確な値は tools/voyage-sim.mjs で測る。
//   船長マスに止まるのは 約28回に1回。4人が週10回ずつ振る想定 (週40回) で、JP は週に 0.7〜0.8 回ほど誰かが当てる。

export const VOYAGE_BET = 10;
export const VOYAGE_BETS = [VOYAGE_BET];
export const VOYAGE_SQUARES = 30;
export const VOYAGE_JP_RATE = 6;          // 賭け金のうちジャックポットに貯める割合 (%)
export const VOYAGE_JP_BASE = 1000;       // ジャックポットの土台 (運営が出す。当たるたびにここから貯め直す)
export const VOYAGE_TREASURE_RATE = 8;    // 賭け金のうち最終秘宝に貯める割合 (%)
export const VOYAGE_TREASURE_BASE = 5000; // 最終秘宝の土台 (運営が出す。これに賭け金の分が乗る)
export const VOYAGE_JP_ODDS = 2;          // 船長マスに止まったとき、この中の1で JP (1 なら必ず)
export const VOYAGE_PORT_MULT = 2;        // 港 (0番) にぴったり止まったときの倍率
export const VOYAGE_MAX_MOVES = 3;        // 1回で動く回数の上限 (もう1回・追い風の連鎖)
export const VOYAGE_RULES_VERSION = 3;
export const VOYAGE_START = '2026-10-05T00:00:00+09:00';   // 第1章の始まり
export const VOYAGE_END = '2026-12-22T00:00:00+09:00';     // ここからは振れない (12/21 いっぱいまで)
export const VOYAGE_FINAL_AT = '2026-12-22T00:10:00+09:00'; // 最終秘宝の山分け
export const VOYAGE_SOURCE = 'casino_voyage';

// マスの書き方:
//   port = 港 (0番。ぴったり止まると ×VOYAGE_PORT_MULT) / sea = 何もなし /
//   xN = 賭け金 × N が戻る (N は 0.5 刻み。x0.5 は半分だけ戻る) /
//   qA-B = ×? (A〜B の整数を均等に。A が 0 なら何も出ないこともある) /
//   riskM-K = ×M。ただし 1/K で空っぽ (0) / lossN = 賭け金に加えて、さらに 賭け金 × N を失う /
//   again = もう1回振る (無料) / fwdN = N マス進む (止まったマスも効く) /
//   backN = N マス戻る (戻った先は効かない) / captain = 船長チャンス (1/jpOdds で JP 総取り) /
//   gambleM-B = 半々で ×M か B マス戻る / duel = 半々で ×3 か 2 マス戻る
const B = {
  // 標準の並び (第1章)。港を 0 として時計回り
  standard: ['port', 'x1.5', 'x0.5', 'x2', 'x2', 'again', 'loss1', 'x1.5', 'back3', 'x3', 'x0.5', 'x2', 'captain', 'sea', 'x1.5',
    'fwd3', 'risk5-3', 'x2', 'loss1', 'q0-5', 'back3', 'x1.5', 'x1.5', 'again', 'x2', 'x0.5', 'loss1', 'x1.5', 'sea', 'x0.5']
};

/** 標準の並びから、いくつかのマスを入れ替えた並びを作る ({ 番号: マス }) */
function variant(changes) {
  const board = [...B.standard];
  Object.entries(changes).forEach(([index, square]) => { board[Number(index)] = square; });
  return board;
}

// 章。from は JST の月曜 0:00。dice は目の最大、reverse は逆回り、jpOdds は船長チャンスの当たりやすさ
export const VOYAGE_CHAPTERS = [
  { no: 1, from: '2026-10-05T00:00:00+09:00', title: '形見の金貨', place: 'SILI港', board: B.standard },
  { no: 2, from: '2026-10-12T00:00:00+09:00', title: '霧の海峡', place: '霧の海峡', fog: true, board: B.standard },
  // 商船団: 拿捕 (×6) を1つ
  { no: 3, from: '2026-10-19T00:00:00+09:00', title: '商船団', place: '商船の航路', board: variant({ 24: 'x6', 9: 'x1.5', 11: 'x1.5', 4: 'x0.5' }) },
  // 幽霊船 (ハロウィン): 呪いの金貨 (半々で ×10 か 5 マス戻る) を2つ
  { no: 4, from: '2026-10-26T00:00:00+09:00', title: '幽霊船', place: '幽霊船の海域', board: variant({ 16: 'gamble10-5', 24: 'gamble10-5', 9: 'loss1', 3: 'x1' }) },
  // 無人島: 掘る (×1〜20) を1つ
  { no: 5, from: '2026-11-02T00:00:00+09:00', title: '無人島', place: '無人島', board: variant({ 19: 'q1-20', 9: 'sea', 24: 'x0.5', 3: 'x0.5', 17: 'x0.5', 11: 'x1.5' }) },
  // 海軍の砲火: 砲撃 (1マス戻る) を3つ、逃げ切り (6マス進む) を1つ
  { no: 6, from: '2026-11-09T00:00:00+09:00', title: '海軍の砲火', place: '海軍の封鎖線', board: variant({ 7: 'back1', 21: 'back1', 27: 'back1', 15: 'fwd6', 13: 'x2', 28: 'x2', 25: 'x1.5' }) },
  // 人魚の入り江: 歌 (もう1回) を4つ
  { no: 7, from: '2026-11-16T00:00:00+09:00', title: '人魚の入り江', place: '人魚の入り江', board: variant({ 13: 'again', 28: 'again', 9: 'x1.5' }) },
  // 氷の海: 目は 1〜3 (進みが遅い)
  { no: 8, from: '2026-11-23T00:00:00+09:00', title: '氷の海', place: '氷の海', dice: 3, board: variant({ 13: 'x2', 28: 'x1.5' }) },
  // 決戦: 一騎打ち (半々で ×3 か 2 マス戻る) を3つ
  { no: 9, from: '2026-11-30T00:00:00+09:00', title: '決戦', place: '決戦の海', board: variant({ 3: 'duel', 17: 'duel', 13: 'duel', 25: 'sea' }) },
  // 逆さの地図: 盤が逆回り
  { no: 10, from: '2026-12-07T00:00:00+09:00', title: '逆さの地図', place: '帰路', reverse: true, board: variant({ 21: 'x1' }) },
  // 宝島は港だった: 船長チャンスが必ず当たる
  { no: 11, from: '2026-12-14T00:00:00+09:00', title: '宝島は港だった', place: 'SILI港 (ふたたび)', jpOdds: 1, board: B.standard },
  // 最終日 (冬至): 12/21 の1日だけ
  { no: 12, from: '2026-12-21T00:00:00+09:00', title: '冬至の夜', place: '酒場の地下', jpOdds: 1, board: B.standard }
];

export class VoyageRuleError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 章の番号 (1〜) から章を返す */
export function voyageChapterByNo(no) {
  return VOYAGE_CHAPTERS.find(chapter => chapter.no === Number(no)) || null;
}

/** いまの章。始まる前は null */
export function voyageChapterAt(now = Date.now()) {
  let current = null;
  for (const chapter of VOYAGE_CHAPTERS) {
    if (Date.parse(chapter.from) <= now) current = chapter;
  }
  return current;
}

export function isVoyageStarted(now = Date.now()) {
  return now >= Date.parse(VOYAGE_START);
}

export function isVoyageOver(now = Date.now()) {
  return now >= Date.parse(VOYAGE_END);
}

/** 画面へ返す章の情報 (盤面を含む) */
export function publicVoyageChapter(chapter) {
  if (!chapter) return null;
  return {
    no: chapter.no,
    title: chapter.title,
    place: chapter.place,
    from: chapter.from,
    dice: chapter.dice || 6,
    reverse: Boolean(chapter.reverse),
    fog: Boolean(chapter.fog),
    jpOdds: chapter.jpOdds || VOYAGE_JP_ODDS,
    board: chapter.board,
    total: VOYAGE_CHAPTERS.length
  };
}

/** いまのジャックポットの額 (土台 + 貯まった分)。jpCents は 1/100 単位で貯めた分 */
export function voyageJpAmount(jpCents) {
  return VOYAGE_JP_BASE + Math.floor(Math.max(0, Number(jpCents) || 0) / 100);
}

/** JP を won だけ払ったあとの貯まった分 (土台の分は貯まった分からは引かない) */
export function voyageJpCentsAfterWin(jpCents, won) {
  return Math.max(0, (Number(jpCents) || 0) - Math.max(0, won - VOYAGE_JP_BASE) * 100);
}

/** いまの最終秘宝の額 (土台 + 貯まった分)。treasureCents は 1/100 単位で貯めた分 */
export function voyageTreasureAmount(treasureCents) {
  return VOYAGE_TREASURE_BASE + Math.floor(Math.max(0, Number(treasureCents) || 0) / 100);
}

/** 周回の数 (港を通って1周するたびに1つ)。数でない値は 0 とみなす */
export function voyageLapCount(value) {
  if (Array.isArray(value)) return 0;
  return Math.max(0, Math.floor(Number(value) || 0));
}

/** マスの文字列を読む。{ type, value, ... } */
export function parseVoyageSquare(square) {
  const text = String(square || 'sea');
  let match;
  if (text === 'port' || text === 'sea' || text === 'again' || text === 'captain' || text === 'duel') return { type: text };
  if ((match = /^x(\d+(?:\.\d+)?)$/.exec(text))) return { type: 'x', value: Number(match[1]) };
  if ((match = /^q(\d+)-(\d+)$/.exec(text))) return { type: 'q', min: Number(match[1]), max: Number(match[2]) };
  if ((match = /^risk(\d+(?:\.\d+)?)-(\d+)$/.exec(text))) return { type: 'risk', value: Number(match[1]), odds: Number(match[2]) };
  if ((match = /^loss(\d+(?:\.\d+)?)$/.exec(text))) return { type: 'loss', value: Number(match[1]) };
  if ((match = /^fwd(\d+)$/.exec(text))) return { type: 'fwd', value: Number(match[1]) };
  if ((match = /^back(\d+)$/.exec(text))) return { type: 'back', value: Number(match[1]) };
  if ((match = /^gamble(\d+)-(\d+)$/.exec(text))) return { type: 'gamble', value: Number(match[1]), back: Number(match[2]) };
  return { type: 'sea' };
}

/**
 * pos から steps マス動いた先 (direction は +1 / −1)。
 * arrived は港 (0) に着いた (通った) か、left は港から出たか (押し戻されて港より手前へ戻ったかを見る)
 */
function moveOnBoard(pos, steps, direction) {
  let at = pos;
  let arrived = false;
  let left = false;
  const path = [];
  for (let i = 0; i < steps; i++) {
    if (at === 0) left = true;
    at = (at + direction + VOYAGE_SQUARES) % VOYAGE_SQUARES;
    path.push(at);
    if (at === 0) arrived = true;
  }
  return { to: at, path, arrived, left };
}

/** 賭け金 × 倍率 (整数) */
function voyagePay(bet, value) {
  return Math.round(bet * value);
}

/**
 * 1回ぶんを決める。chapter はいまの章、bet は賭け金、pos はいまの位置、jp はいまのジャックポット (払える額。土台込み = voyageJpAmount)、
 * lapDebt は「押し戻されて港より手前へ戻った回数」(次に港を通ったときは周回に数えず、これを返す)。randomInt(n) は 0〜n-1。
 * 返り値: { dice, moves: [{ dice?, from, to, path, lap, square, effect }], pos, laps, lapDebt, payout, multiplier, jpHit, jpWon }
 *   laps はこの1回で増えた周回の数、move.lap はその動きで周回が増えたか。
 *   payout は戻る額の合計 (罰 (loss) があるとマイナスにもなる)。
 *   effect: { type, value?, payout?, hit?, won?, back?, to? }
 *   moves は順に見せる。もう1回・追い風で続けて動いた分も moves に入る (上限 VOYAGE_MAX_MOVES)
 */
export function playVoyage({ chapter, bet, pos, jp, lapDebt = 0, randomInt }) {
  const dice = chapter.dice || 6;
  const direction = chapter.reverse ? -1 : 1;
  const jpOdds = chapter.jpOdds || VOYAGE_JP_ODDS;
  const moves = [];
  let at = pos;
  let laps = 0;
  let debt = Math.max(0, Math.floor(Number(lapDebt) || 0));
  let payout = 0;
  let jpHit = false;
  let jpWon = 0;
  let pending = { kind: 'dice' };   // 次の動き: dice (振る) / fwd (進む)

  // 押し戻す (back・呪いの金貨・一騎打ちで負け)。港より手前へ戻ったら、次に港を通ったときの分を借りにする
  const pushBack = steps => {
    const back = moveOnBoard(at, steps, -direction);
    if (back.left) debt += 1;
    at = back.to;
    return back;
  };

  for (let count = 0; count < VOYAGE_MAX_MOVES && pending; count++) {
    const steps = pending.kind === 'dice' ? 1 + randomInt(dice) : pending.steps;
    const moved = moveOnBoard(at, steps, direction);
    const move = { dice: pending.kind === 'dice' ? steps : null, from: at, to: moved.to, path: moved.path, lap: false, square: chapter.board[moved.to], effect: null };
    if (moved.arrived) {
      if (debt > 0) debt -= 1;
      else {
        laps += 1;
        move.lap = true;
      }
    }
    at = moved.to;
    pending = null;
    const square = parseVoyageSquare(move.square);
    switch (square.type) {
      case 'port': {
        const won = voyagePay(bet, VOYAGE_PORT_MULT);
        payout += won;
        move.effect = { type: 'port', value: VOYAGE_PORT_MULT, payout: won };
        break;
      }
      case 'x': {
        const won = voyagePay(bet, square.value);
        payout += won;
        move.effect = { type: 'x', value: square.value, payout: won };
        break;
      }
      case 'q': {
        const value = square.min + randomInt(square.max - square.min + 1);
        const won = voyagePay(bet, value);
        payout += won;
        move.effect = { type: 'q', min: square.min, max: square.max, value, payout: won };
        break;
      }
      case 'risk': {
        const hit = randomInt(square.odds) !== 0;
        const won = hit ? voyagePay(bet, square.value) : 0;
        payout += won;
        move.effect = { type: 'risk', hit, value: square.value, odds: square.odds, payout: won };
        break;
      }
      case 'loss': {
        const lost = voyagePay(bet, square.value);
        payout -= lost;
        move.effect = { type: 'loss', value: square.value, payout: -lost };
        break;
      }
      case 'again':
        move.effect = { type: 'again' };
        pending = { kind: 'dice' };
        break;
      case 'fwd':
        move.effect = { type: 'fwd', value: square.value };
        pending = { kind: 'fwd', steps: square.value };
        break;
      case 'back': {
        const back = pushBack(square.value);
        move.effect = { type: 'back', value: square.value, to: back.to, path: back.path };
        break;
      }
      case 'gamble': {
        if (randomInt(2) === 0) {
          const won = voyagePay(bet, square.value);
          payout += won;
          move.effect = { type: 'gamble', hit: true, value: square.value, payout: won };
        } else {
          const back = pushBack(square.back);
          move.effect = { type: 'gamble', hit: false, back: square.back, to: back.to, path: back.path };
        }
        break;
      }
      case 'duel': {
        if (randomInt(2) === 0) {
          const won = voyagePay(bet, 3);
          payout += won;
          move.effect = { type: 'duel', hit: true, value: 3, payout: won };
        } else {
          const back = pushBack(2);
          move.effect = { type: 'duel', hit: false, back: 2, to: back.to, path: back.path };
        }
        break;
      }
      case 'captain': {
        const hit = randomInt(jpOdds) === 0;
        const won = hit ? Math.max(0, Math.floor(jp)) : 0;
        if (hit) {
          jpHit = true;
          jpWon = won;
          payout += won;
        }
        move.effect = { type: 'captain', hit, odds: jpOdds, payout: won };
        break;
      }
      default:
        move.effect = { type: 'sea' };
    }
    moves.push(move);
  }
  // 上限で止まった「もう1回」「追い風」は、その場で終わり (effect はそのまま残して画面で「ここまで」と出す)
  const multiplier = bet > 0 ? Math.round(((payout - jpWon) / bet) * 100) / 100 : 0;
  return { dice: moves[0].dice, moves, pos: at, laps, lapDebt: debt, payout, multiplier, jpHit, jpWon };
}

/** 最終秘宝を周回の数の比で分ける。players: [{ uid, player, laps }]。返り値は amount > 0 の人だけ */
export function splitVoyageTreasure(players, treasure) {
  const shares = players.map(entry => ({
    uid: entry.uid,
    player: entry.player,
    laps: voyageLapCount(entry.laps)
  }));
  const total = shares.reduce((sum, entry) => sum + entry.laps, 0);
  if (total <= 0 || treasure <= 0) return { total, winners: [] };
  const winners = shares
    .map(entry => ({ ...entry, amount: Math.floor((treasure * entry.laps) / total) }))
    .filter(entry => entry.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.player.localeCompare(b.player));
  return { total, winners };
}
