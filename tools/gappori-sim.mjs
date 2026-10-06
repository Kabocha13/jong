// 宝探しの還元率を測る (Firestore には触らない)。
//   node tools/gappori-sim.mjs [回数=20000] [--featured]  (--featured で本日のおすすめの倍率アップも入れる。ふだんは入れない)
//   回ごとに盤面と配当 (本日のおすすめの倍率アップを含む) を作り、買える予想を全部1口ずつ買ったことにして5球を入れる。
//   3球目のあとのお宝ゲット (券ごとに GAPPORI_CHANCE_RATES。選ぶのは自動) と、船長マスの回の JP ルーレット
//   (JP 1/16・お宝ゲット 1/16) も本番と同じ流れ (functions/gappori.js) で引く。
//   出すのは予想の個数 (2〜5) ごとの、賭けた額に対する
//     配当        = 当たりの払い戻し (3球目のあとのお宝ゲットを含む。設計値は GAPPORI_BASE_RETURNS、--featured のときはおすすめの ×1.1 も)
//     お宝ゲット  = JP ルーレットのお宝ゲットで当たりになった分
//     JP          = 外れた券の代金のうちジャックポットに貯める分 (貯まった分は全部 JP で戻るので、長い目で見た戻り)
//   と、その合計。全体は買える予想を全部1口ずつ買ったときの額の比 (5個の券が高いので 5個に寄る)。
import { randomInt } from 'node:crypto';
import {
  GAPPORI_BALLS, GAPPORI_CAPTAIN, GAPPORI_CHANCE_RATES, GAPPORI_FIRST_BALLS, GAPPORI_JACKPOT_LOST_RATE, GAPPORI_JP_JACKPOT,
  GAPPORI_JP_TREASURE, GAPPORI_UNIT_PRICES,
  drawGapporiBall, gapporiAutoChance, gapporiFeatured, gapporiJpTreasureChoice, gapporiOdds, gapporiPickKey, gapporiPickSets,
  gapporiShortfall, generateGapporiBoard, generateGapporiJpWheel, isGapporiWin
} from '../functions/gappori.js';

const rounds = Number(process.argv.find(arg => /^\d+$/.test(arg))) || 20000;
const CHANCE_SCALE = 1000;
const sizes = [2, 3, 4, 5];
const sum = Object.fromEntries(sizes.map(size => [size, { bet: 0, payout: 0, treasure: 0, lost: 0, tickets: 0, wins: 0, treasureWins: 0 }]));
let captainRounds = 0;
let jpRounds = 0;
let treasureRounds = 0;

for (let r = 0; r < rounds; r++) {
  const board = generateGapporiBoard(randomInt);
  const odds = process.argv.includes('--featured') ? gapporiFeatured(board, gapporiOdds(board), randomInt).odds : gapporiOdds(board);
  const tickets = gapporiPickSets(board).map(picks => {
    const key = gapporiPickKey(picks);
    const cost = GAPPORI_UNIT_PRICES[picks.length];
    return { picks, key, cost, odds: odds[key], chance: null, jp: null };
  });
  const balls = [];
  for (let i = 0; i < GAPPORI_FIRST_BALLS; i++) balls.push(drawGapporiBall(board, balls, randomInt));
  // 3球目のあとのお宝ゲット (券ごと。選ぶのは本番の自動選択と同じ)
  tickets.forEach(ticket => {
    if (!Object.keys(gapporiShortfall(board, balls, ticket.picks)).length) return;
    if (randomInt(CHANCE_SCALE) >= Math.round(GAPPORI_CHANCE_RATES[ticket.picks.length] * CHANCE_SCALE)) return;
    ticket.chance = gapporiAutoChance(board, balls, [ticket]);
  });
  for (let i = GAPPORI_FIRST_BALLS; i < GAPPORI_BALLS; i++) balls.push(drawGapporiBall(board, balls, randomInt));
  tickets.forEach(ticket => { ticket.win = isGapporiWin(board, balls, ticket.picks, ticket.chance); });

  // 船長マスの回は JP ルーレット
  const captain = balls.some(index => board.pockets[index] === GAPPORI_CAPTAIN);
  let kind = null;
  if (captain) {
    captainRounds += 1;
    kind = generateGapporiJpWheel(randomInt).kind;
    if (kind === GAPPORI_JP_JACKPOT) jpRounds += 1;
    if (kind === GAPPORI_JP_TREASURE) {
      treasureRounds += 1;
      tickets.forEach(ticket => {
        if (ticket.win) return;
        ticket.jp = gapporiJpTreasureChoice(board, balls, ticket.picks, ticket.chance);
        if (ticket.jp) ticket.win = true;
      });
    }
  }

  tickets.forEach(ticket => {
    const s = sum[ticket.picks.length];
    const payout = ticket.win ? Math.round(ticket.cost * ticket.odds) : 0;
    s.bet += ticket.cost;
    s.tickets += 1;
    if (ticket.win) s.wins += 1;
    if (ticket.jp) {
      s.treasure += payout;
      s.treasureWins += 1;
    } else {
      s.payout += payout;
    }
    if (!ticket.win) s.lost += ticket.cost;
  });
}

const pct = value => `${(value * 100).toFixed(2)}%`.padStart(8);
const line = (label, s) => {
  const base = s.payout / s.bet;
  const treasure = s.treasure / s.bet;
  const jp = (s.lost * GAPPORI_JACKPOT_LOST_RATE) / s.bet;
  console.log(`${label}  配当 ${pct(base)}  お宝ゲット(JP盤) ${pct(treasure)}  JP積立 ${pct(jp)}  合計 ${pct(base + treasure + jp)}`
    + `  当たり ${pct(s.wins / s.tickets)} (うちお宝ゲット(JP盤) ${pct(s.treasureWins / s.tickets)})`);
};
console.log(`${rounds}回。買える予想を全部1口ずつ (1口 2個 ${GAPPORI_UNIT_PRICES[2]}・3個 ${GAPPORI_UNIT_PRICES[3]}・4個 ${GAPPORI_UNIT_PRICES[4]}・5個 ${GAPPORI_UNIT_PRICES[5]})`);
sizes.forEach(size => line(`${size}個`, sum[size]));
const all = Object.values(sum).reduce((acc, s) => {
  Object.keys(acc).forEach(key => { acc[key] += s[key]; });
  return acc;
}, { bet: 0, payout: 0, treasure: 0, lost: 0, tickets: 0, wins: 0, treasureWins: 0 });
line('全体', all);
console.log(`船長マスの回 ${pct(captainRounds / rounds)} (5/16 = 31.25%)  JP ${pct(jpRounds / rounds)} (約${(rounds / Math.max(1, jpRounds)).toFixed(0)}回に1回)  お宝ゲット(JP盤) ${pct(treasureRounds / rounds)}`);
