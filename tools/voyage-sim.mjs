// 航海の還元率を章ごとに測る (Firestore には触らない)。
//   node tools/voyage-sim.mjs [回数]
//   即時の配当 (賭け金に対する払い戻し)、1回の結果の割合 (何も起きない・減る・増える)、1周するまでの平均の回数を出す。
//   JP (賭け金の 6%) と最終秘宝 (8%) は全部プレイヤーに戻るので、全体の還元率は 即時 + 14% になる
//   (JP・最終秘宝の土台は 0。人数と回数で見るなら tools/voyage-players-sim.mjs)
import { randomInt } from 'node:crypto';
import { VOYAGE_BET, VOYAGE_CHAPTERS, VOYAGE_JP_RATE, VOYAGE_TREASURE_RATE, playVoyage } from '../functions/voyage.js';

const rolls = Number(process.argv[2]) || 300000;
const bet = VOYAGE_BET;
const pct = (count) => `${((count / rolls) * 100).toFixed(0)}%`.padStart(4);
let grand = 0;
for (const chapter of VOYAGE_CHAPTERS) {
  let pos = 0;
  let lapDebt = 0;
  let paid = 0;
  let laps = 0;
  let nothing = 0;
  let penalty = 0;
  let down = 0;
  let up = 0;
  let captain = 0;
  for (let i = 0; i < rolls; i++) {
    const play = playVoyage({ chapter, bet, pos, jp: 0, lapDebt, randomInt });
    pos = play.pos;
    lapDebt = play.lapDebt;
    paid += play.payout;
    laps += play.laps;
    if (play.moves.every(move => move.effect?.type === 'sea')) nothing += 1;
    if (play.payout < 0) penalty += 1;
    if (play.payout < bet) down += 1;
    if (play.payout > bet) up += 1;
    if (play.moves.some(move => move.effect?.type === 'captain')) captain += 1;
  }
  const rate = paid / (rolls * bet);
  grand += rate;
  console.log(`第${String(chapter.no).padStart(2)}章 ${chapter.title.padEnd(8, '　')} 即時 ${(rate * 100).toFixed(2)}%  全体 ${((rate + (VOYAGE_JP_RATE + VOYAGE_TREASURE_RATE) / 100) * 100).toFixed(2)}%`
    + `  何も起きない ${pct(nothing)}  減る ${pct(down)} (罰 ${pct(penalty)})  増える ${pct(up)}  1周 ${(rolls / laps).toFixed(1)}回  船長 1/${(rolls / captain).toFixed(0)}`);
}
console.log(`平均 即時 ${((grand / VOYAGE_CHAPTERS.length) * 100).toFixed(2)}%`);
