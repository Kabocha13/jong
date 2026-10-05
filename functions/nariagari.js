// 成り上がりのルール (Firestore には触らない)。
//   5段のルーレットを第1弾から順に回す。どのマスにも同じ確率で止まる。
//   UP に止まると次の弾へ進む (第4弾 = JP、第5弾 = SJP)。終了は払い戻しなし。
//   ×N に止まったら賭け金 × N を払い戻して終わり (×1 は賭け金がそのまま戻る)。
//   ×? は止まったときに、弾ごとの範囲から均等に倍率を決める。
//   マスの並びは回ごとにシャッフルし、UP どうしは円の端と端も含めて隣り合わせない。
//   ×? の範囲は 2弾 1〜6・3弾 3〜12・4弾 6〜20・5弾 15〜50。還元率は 99.69%
//   (2弾で止まる分 41.67%・3弾 35.42%・4弾 10.28%・5弾 12.33%)。
//   到達する確率は 2弾 1/3・3弾 1/12・4弾 (JP) 1/72・5弾 (SJP) 1/360。×100 は 1/1440。

export const NARIAGARI_BETS = [1, 2, 5, 10, 20, 50, 100, 500, 1000, 5000];

// 弾ごとのマス。'up' / 'end' / 'x<倍率>' / 'q' (×?)。q はその弾の ×? の範囲 [最小, 最大]
export const NARIAGARI_STAGES = [
  { pockets: ['up', 'up', 'up', 'up', 'up', 'end', 'end', 'end', 'end', 'end', 'end', 'end', 'end', 'end', 'end'] },
  { pockets: ['up', 'up', 'up', 'end', 'end', 'end', 'x1', 'x2', 'x2', 'x3', 'q', 'q'], q: [1, 6] },
  { pockets: ['up', 'x3', 'x3', 'x6', 'x6', 'q'], q: [3, 12] },
  { pockets: ['up', 'x6', 'x6', 'x12', 'q'], q: [6, 20] },
  { pockets: ['x100', 'x15', 'x30', 'q'], q: [15, 50] }
];

export const NARIAGARI_JP_STAGE = 4;    // ここまで来たら JP
export const NARIAGARI_SJP_STAGE = 5;   // ここまで来たら SJP (最上段)

function countPockets(list) {
  const counts = new Map();
  list.forEach(pocket => counts.set(pocket, (counts.get(pocket) || 0) + 1));
  return counts;
}

/** 弾 (0 から) の並びとして正しいか: マスの中身が同じで、UP どうしが (円の端と端も) 隣り合っていない */
export function isNariagariLayoutValid(stageIndex, layout) {
  const stage = NARIAGARI_STAGES[stageIndex];
  if (!stage || !Array.isArray(layout) || layout.length !== stage.pockets.length) return false;
  const want = countPockets(stage.pockets);
  const got = countPockets(layout);
  if (got.size !== want.size || [...want].some(([pocket, count]) => got.get(pocket) !== count)) return false;
  return layout.every((pocket, i) => !(pocket === 'up' && layout[(i + 1) % layout.length] === 'up'));
}

/** 弾のマスをシャッフルする (UP どうしは隣り合わせない)。条件に合うまで引き直す */
export function shuffleNariagariLayout(stageIndex, randomInt) {
  const pockets = NARIAGARI_STAGES[stageIndex].pockets;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const layout = [...pockets];
    for (let i = layout.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [layout[i], layout[j]] = [layout[j], layout[i]];
    }
    if (isNariagariLayoutValid(stageIndex, layout)) return layout;
  }
  // 引き直しで外れ続けることは実際には起こらない (第1弾でも1回に約13%で通る)。念のため UP を間を空けて差し込む
  const others = pockets.filter(pocket => pocket !== 'up');
  const ups = pockets.length - others.length;
  const layout = [];
  others.forEach((pocket, i) => {
    if (i % Math.max(1, Math.floor(others.length / Math.max(1, ups))) === 0 && layout.filter(p => p === 'up').length < ups) layout.push('up');
    layout.push(pocket);
  });
  return layout;
}

/** マスの倍率 ('x6' → 6)。UP・終了・×? は null */
export function nariagariPocketMultiplier(pocket) {
  return /^x\d+$/.test(pocket) ? Number(pocket.slice(1)) : null;
}

/**
 * 1回ぶんを最後まで決める。layout1 は画面が見せている第1弾の並び (正しくなければここで作り直す)。
 * 返り値: { stages: [{ layout, stop, pocket, value? }], top (着いた弾 1〜5), multiplier, payout }
 */
export function playNariagari(bet, randomInt, layout1 = null) {
  const stages = [];
  let multiplier = 0;
  for (let index = 0; index < NARIAGARI_STAGES.length; index++) {
    const layout = index === 0 && isNariagariLayoutValid(0, layout1) ? [...layout1] : shuffleNariagariLayout(index, randomInt);
    const stop = randomInt(layout.length);
    const pocket = layout[stop];
    const step = { layout, stop, pocket };
    stages.push(step);
    if (pocket === 'up') continue;
    if (pocket === 'q') {
      const [min, max] = NARIAGARI_STAGES[index].q;
      step.value = min + randomInt(max - min + 1);
      multiplier = step.value;
    } else {
      multiplier = nariagariPocketMultiplier(pocket) || 0;
    }
    break;
  }
  return { stages, top: stages.length, multiplier, payout: bet * multiplier };
}

/** 還元率の正確な値 (×? は範囲の平均)。テストと説明用 */
export function nariagariReturnRate() {
  let value = 0;
  for (let index = NARIAGARI_STAGES.length - 1; index >= 0; index--) {
    const stage = NARIAGARI_STAGES[index];
    const n = stage.pockets.length;
    const qMean = stage.q ? (stage.q[0] + stage.q[1]) / 2 : 0;
    const paid = stage.pockets.reduce((sum, pocket) => sum + (pocket === 'q' ? qMean : nariagariPocketMultiplier(pocket) || 0), 0);
    const ups = stage.pockets.filter(pocket => pocket === 'up').length;
    value = paid / n + (ups / n) * value;
  }
  return value;
}
