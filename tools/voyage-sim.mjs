// 航海の還元率を章ごとに測る (Firestore には触らない)。
//   node tools/voyage-sim.mjs [回数]
//   即時の配当 (賭け金に対する払い戻し) と、港を通過するまでの平均の回数を出す。
//   JP (賭け金の 6%) と最終秘宝 (8%) は全部プレイヤーに戻るので、全体の還元率は 即時 + 14% になる
import { randomInt } from 'node:crypto';
import { VOYAGE_CHAPTERS, VOYAGE_JP_RATE, VOYAGE_TREASURE_RATE, playVoyage } from '../functions/voyage.js';

const rolls = Number(process.argv[2]) || 300000;
let grand = 0;
for (const chapter of VOYAGE_CHAPTERS) {
  let pos = 0;
  let paid = 0;
  let laps = 0;
  let captain = 0;
  let maxMoves = 0;
  for (let i = 0; i < rolls; i++) {
    const play = playVoyage({ chapter, bet: 100, pos, jp: 0, randomInt });
    pos = play.pos;
    paid += play.payout;
    laps += play.laps;
    if (play.moves.some(move => move.effect?.type === 'captain')) captain += 1;
    if (play.moves.length >= 3) maxMoves += 1;
  }
  const rate = paid / (rolls * 100);
  grand += rate;
  console.log(`第${String(chapter.no).padStart(2)}章 ${chapter.title.padEnd(8, '　')} 即時 ${(rate * 100).toFixed(2)}%  全体 ${((rate + (VOYAGE_JP_RATE + VOYAGE_TREASURE_RATE) / 100) * 100).toFixed(2)}%  1周 ${(rolls / laps).toFixed(1)}回  船長 1/${(rolls / captain).toFixed(0)}  3回動く ${((maxMoves / rolls) * 100).toFixed(2)}%`);
}
console.log(`平均 即時 ${((grand / VOYAGE_CHAPTERS.length) * 100).toFixed(2)}%`);
