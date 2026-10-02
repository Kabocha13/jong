// 航海を「何人が週に何回振るか」で全期間 (10/5〜12/21) 回し、JP の当たり方と最終秘宝の山分けを見る (Firestore には触らない)。
//   node tools/voyage-players-sim.mjs [人数=4] [1人の週の回数=10] [試行=1000]
//   JP は土台 VOYAGE_JP_BASE + 賭け金の 6%、最終秘宝は土台 VOYAGE_TREASURE_BASE + 賭け金の 8% (functions/voyage.js)。
import { randomInt } from 'node:crypto';
import {
  VOYAGE_BET, VOYAGE_CHAPTERS, VOYAGE_END, VOYAGE_JP_BASE, VOYAGE_JP_RATE, VOYAGE_START, VOYAGE_TREASURE_BASE, VOYAGE_TREASURE_RATE,
  playVoyage, splitVoyageTreasure, voyageJpAmount, voyageJpCentsAfterWin, voyageTreasureAmount
} from '../functions/voyage.js';

const players = Number(process.argv[2]) || 4;
const perWeek = Number(process.argv[3]) || 10;
const trials = Number(process.argv[4]) || 1000;
const DAY = 86400000;
const days = Math.round((Date.parse(VOYAGE_END) - Date.parse(VOYAGE_START)) / DAY);
const weeks = days / 7;
// 週の回数を月〜日に散らす (余りは前から1回ずつ)
const daily = Array.from({ length: 7 }, (_, i) => Math.floor(perWeek / 7) + (i < perWeek % 7 ? 1 : 0));
const chapterOn = day => {
  const at = Date.parse(VOYAGE_START) + day * DAY;
  let current = VOYAGE_CHAPTERS[0];
  for (const chapter of VOYAGE_CHAPTERS) if (Date.parse(chapter.from) <= at) current = chapter;
  return current;
};

const sum = { bet: 0, back: 0, jpPaid: 0, jpHits: 0, jpMax: 0, noJp: 0, treasure: 0, perHead: 0, laps: 0 };
const weeklyHits = Array.from({ length: Math.ceil(weeks) }, () => 0);
for (let t = 0; t < trials; t++) {
  let jpCents = 0;
  let treasureCents = 0;
  let hits = 0;
  const state = Array.from({ length: players }, () => ({ pos: 0, lapDebt: 0, laps: 0 }));
  for (let day = 0; day < days; day++) {
    const chapter = chapterOn(day);
    for (const p of state) {
      for (let i = 0; i < daily[day % 7]; i++) {
        const play = playVoyage({ chapter, bet: VOYAGE_BET, pos: p.pos, jp: voyageJpAmount(jpCents), lapDebt: p.lapDebt, randomInt });
        jpCents += VOYAGE_BET * VOYAGE_JP_RATE;
        treasureCents += VOYAGE_BET * VOYAGE_TREASURE_RATE;
        if (play.jpHit) {
          jpCents = voyageJpCentsAfterWin(jpCents, play.jpWon);
          hits += 1;
          weeklyHits[Math.floor(day / 7)] += 1;
          sum.jpPaid += play.jpWon;
          sum.jpMax = Math.max(sum.jpMax, play.jpWon);
        }
        p.pos = play.pos;
        p.lapDebt = play.lapDebt;
        p.laps += play.laps;
        sum.bet += VOYAGE_BET;
        sum.back += play.payout;
      }
    }
  }
  const treasure = voyageTreasureAmount(treasureCents);
  const split = splitVoyageTreasure(state.map((p, i) => ({ uid: String(i), player: String(i), laps: p.laps })), treasure);
  sum.treasure += treasure;
  sum.laps += split.total;
  sum.perHead += split.winners.reduce((s, w) => s + w.amount, 0) / players;
  sum.jpHits += hits;
  if (hits === 0) sum.noJp += 1;
}
const avg = v => Math.round(v / trials);
const rollsEach = Math.round(weeks * perWeek);
console.log(`${players}人 × 週${perWeek}回 × ${days}日 (${weeks.toFixed(1)}週) → 1人 約${rollsEach}回・賭け金 ${(rollsEach * VOYAGE_BET).toLocaleString()}、全員 ${(rollsEach * VOYAGE_BET * players).toLocaleString()}。${trials}試行の平均`);
console.log(`JP: 土台 ${VOYAGE_JP_BASE.toLocaleString()} + ${VOYAGE_JP_RATE}%  当選 ${(sum.jpHits / trials).toFixed(2)}回/期間 (${(sum.jpHits / trials / weeks).toFixed(2)}回/週)  1回の額 平均 ${avg(sum.jpPaid / Math.max(1, sum.jpHits / trials)).toLocaleString()} 最大 ${sum.jpMax.toLocaleString()}  誰も当たらない ${(sum.noJp / trials * 100).toFixed(1)}%  払出合計 ${avg(sum.jpPaid).toLocaleString()}`);
console.log(`最終秘宝: 土台 ${VOYAGE_TREASURE_BASE.toLocaleString()} + ${VOYAGE_TREASURE_RATE}%  総額 ${avg(sum.treasure).toLocaleString()}  1人 ${avg(sum.perHead).toLocaleString()}  周回合計 ${avg(sum.laps)}`);
console.log(`還元: 即時 ${((sum.back - sum.jpPaid) / sum.bet * 100).toFixed(1)}%  JP ${(sum.jpPaid / sum.bet * 100).toFixed(1)}%  秘宝 ${(sum.treasure / sum.bet * 100).toFixed(1)}%  合計 ${((sum.back + sum.treasure) / sum.bet * 100).toFixed(1)}%  (運営の負担 JP ${Math.round(sum.jpHits / trials * VOYAGE_JP_BASE).toLocaleString()} + 秘宝 ${VOYAGE_TREASURE_BASE.toLocaleString()})`);
console.log(`週ごとの JP 当選 (回/週): ${weeklyHits.map(h => (h / trials).toFixed(2)).join(' ')}`);
