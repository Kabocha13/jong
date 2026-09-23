// 指定した日 (JST) の麻雀結果を、今の計算式 (×1.75・1位は最低+1) で計算し直し、
// 「新しい式での変動 − 実際の変動」の差額だけを今のレートに足す。
//
//   node tools/recalc-mahjong-rates.mjs --date 2026-09-23           # 確認だけ (書き込まない)
//   node tools/recalc-mahjong-rates.mjs --date 2026-09-23 --apply   # 反映する
//
// 認証は Application Default Credentials を使う
// (gcloud auth application-default login か GOOGLE_APPLICATION_CREDENTIALS=鍵.json)。
// 反映後は管理画面の「📈 レート推移グラフ」から作り直すこと。
//
// 計算式は assets/js/master.js の麻雀フォームと揃えておくこと。

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'q-jong';
const DATABASE_ID = 'q-jong';
const RECALC_SOURCE = 'mahjong_recalc';

const MAHJONG_CPU_NAME = '3mahjong';
const MAHJONG_CPU_RATE = 3000;
const MAHJONG_SCORE_UNIT = 1000;
const MAHJONG_RATE_DIFF_DIVISOR = 40;
const MAHJONG_RATE_MULTIPLIER = 1.75;
const MAHJONG_TOP_MIN_RATE_CHANGE = 1;
const MAHJONG_RULES = {
  '四人麻雀': { startingScore: 30000, uma: [30, 10, -10, -30] },
  '三人麻雀': { startingScore: 35000, uma: [30, 0, -30] }
};

function parseArgs(argv) {
  const args = { date: '', apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--date') args.date = argv[++i] || '';
    else if (argv[i] === '--apply') args.apply = true;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error('--date YYYY-MM-DD を指定してください。');
  }
  return args;
}

function normalizeRate(value) {
  const number = Number(value);
  return Math.max(0, Math.round(Number.isFinite(number) ? number : 0));
}

function toDocId(value) {
  return encodeURIComponent(String(value ?? '').trim())
    .replace(/\./g, '%2E')
    .replace(/\//g, '%2F');
}

function getJstDateKey(isoString) {
  return new Date(new Date(isoString).getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

/** "四人麻雀 A 45000 / B 30000 / ..." → { label, results: [{ name, score }] } (得点の高い順) */
function parseMahjongReason(reason) {
  const text = String(reason || '').trim();
  const label = Object.keys(MAHJONG_RULES).find(key => text.startsWith(`${key} `));
  if (!label) return null;
  const results = text.slice(label.length + 1).split(' / ').map(segment => {
    const match = segment.trim().match(/^(.+)\s(-?\d+)$/);
    return match ? { name: match[1], score: Number(match[2]) } : null;
  });
  if (results.some(result => !result)) return null;
  if (results.length !== MAHJONG_RULES[label].uma.length) return null;
  return { label, results };
}

/** master.js の麻雀フォームと同じ式 */
function computeRateChanges(rule, results, seatRates) {
  const tableAverageRate = seatRates.reduce((sum, rate) => sum + rate, 0) / results.length;
  return results.map((result, i) => {
    const scoreDifference = (result.score - rule.startingScore) / MAHJONG_SCORE_UNIT;
    const rateDiffBonus = (tableAverageRate - seatRates[i]) / MAHJONG_RATE_DIFF_DIVISOR;
    const raw = Math.round((scoreDifference + rule.uma[i] + rateDiffBonus) * MAHJONG_RATE_MULTIPLIER);
    const isTop = result.score === results[0].score;
    return isTop ? Math.max(raw, MAHJONG_TOP_MIN_RATE_CHANGE) : raw;
  });
}

/** 権限エラーの切り分け用に、使っている鍵のアカウントとプロジェクトを出す (秘密鍵は出さない) */
function describeCredentials() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) {
    console.log('認証: gcloud の Application Default Credentials');
    return;
  }
  try {
    const key = JSON.parse(readFileSync(keyPath, 'utf8'));
    console.log(`認証: ${key.client_email || '(client_email なし)'} / プロジェクト ${key.project_id || '(不明)'}`);
    if (key.project_id && key.project_id !== PROJECT_ID) {
      console.log(`⚠ この鍵は ${PROJECT_ID} ではなく ${key.project_id} のものです。`);
    }
  } catch (error) {
    console.log(`認証: ${keyPath} を読めませんでした (${error.message})`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  describeCredentials();
  const app = initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore(app, DATABASE_ID);

  const historySnapshot = await db.collection('point_history').get();
  const entries = historySnapshot.docs.map(doc => doc.data());

  const alreadyApplied = entries.some(entry => (
    entry.source === RECALC_SOURCE && String(entry.reason || '').includes(args.date)
  ));
  if (alreadyApplied) {
    console.log(`${args.date} の再計算はすでに反映済みです。二重反映を防ぐため中止します。`);
    return;
  }

  // 1対局 = 同じ createdAt・同じ reason の mahjong ログの集まり
  const matches = new Map();
  entries
    .filter(entry => entry.source === 'mahjong' && entry.createdAt && getJstDateKey(entry.createdAt) === args.date)
    .forEach(entry => {
      const key = `${entry.createdAt}\n${entry.reason}`;
      if (!matches.has(key)) matches.set(key, { createdAt: entry.createdAt, reason: entry.reason, logs: new Map() });
      matches.get(key).logs.set(entry.player, entry);
    });

  const sortedMatches = Array.from(matches.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (sortedMatches.length === 0) {
    console.log(`${args.date} の麻雀ログは見つかりませんでした。`);
    return;
  }

  const totalDiff = new Map();
  let skipped = 0;

  for (const match of sortedMatches) {
    const time = new Date(match.createdAt).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const parsed = parseMahjongReason(match.reason);
    if (!parsed) {
      console.log(`\n[${time}] スキップ: 得点が読めないログです (${match.reason || '理由なし'})`);
      skipped++;
      continue;
    }

    // 対局前レートはログの beforeScore。変動0だった人はログが無いので計算できない。
    const missing = parsed.results
      .filter(result => result.name !== MAHJONG_CPU_NAME && !match.logs.has(result.name))
      .map(result => result.name);
    if (missing.length > 0) {
      console.log(`\n[${time}] スキップ: 対局前レートが分からない人がいます (${missing.join(', ')})`);
      skipped++;
      continue;
    }

    const rule = MAHJONG_RULES[parsed.label];
    const seatRates = parsed.results.map(result => (
      result.name === MAHJONG_CPU_NAME ? MAHJONG_CPU_RATE : normalizeRate(match.logs.get(result.name).beforeScore)
    ));
    const newChanges = computeRateChanges(rule, parsed.results, seatRates);

    console.log(`\n[${time}] ${match.reason}`);
    parsed.results.forEach((result, i) => {
      if (result.name === MAHJONG_CPU_NAME) return;
      const log = match.logs.get(result.name);
      const oldChange = normalizeRate(log.afterScore) - normalizeRate(log.beforeScore);
      // 0 未満には下げられないので、新しい変動も 0 で止める
      const newChange = normalizeRate(seatRates[i] + newChanges[i]) - seatRates[i];
      const diff = newChange - oldChange;
      totalDiff.set(result.name, (totalDiff.get(result.name) || 0) + diff);
      console.log(`  ${i + 1}位 ${result.name} (対局前 ${seatRates[i]}): 実際 ${oldChange >= 0 ? '+' : ''}${oldChange} → 新 ${newChange >= 0 ? '+' : ''}${newChange} (差額 ${diff >= 0 ? '+' : ''}${diff})`);
    });
  }

  console.log(`\n=== ${args.date} 反映額 (対局 ${sortedMatches.length - skipped} 件 / スキップ ${skipped} 件) ===`);
  const playersRef = db.collection('players');
  const playerDocs = new Map();
  for (const name of totalDiff.keys()) {
    const doc = await playersRef.doc(toDocId(name)).get();
    playerDocs.set(name, doc);
    const current = doc.exists ? normalizeRate(doc.data().score) : null;
    const diff = totalDiff.get(name);
    console.log(`  ${name}: ${current ?? '(プレイヤーなし)'} → ${current === null ? '-' : normalizeRate(current + diff)} (${diff >= 0 ? '+' : ''}${diff})`);
  }

  if (!args.apply) {
    console.log('\n確認のみです。反映するには --apply をつけて実行してください。');
    return;
  }

  const at = new Date().toISOString();
  await db.runTransaction(async transaction => {
    const snapshots = new Map();
    for (const name of totalDiff.keys()) {
      snapshots.set(name, await transaction.get(playersRef.doc(toDocId(name))));
    }
    for (const [name, diff] of totalDiff) {
      const snapshot = snapshots.get(name);
      if (!snapshot.exists || diff === 0) continue;
      const beforeScore = normalizeRate(snapshot.data().score);
      const afterScore = normalizeRate(beforeScore + diff);
      transaction.update(snapshot.ref, { score: afterScore });
      transaction.set(db.collection('point_history').doc(toDocId(`ph_${at}_${name}_recalc`)), {
        id: toDocId(`ph_${at}_${name}_recalc`),
        player: name,
        beforeScore,
        afterScore,
        delta: afterScore - beforeScore,
        source: RECALC_SOURCE,
        reason: `${args.date} の麻雀結果を新しい計算式 (×${MAHJONG_RATE_MULTIPLIER}・1位最低+${MAHJONG_TOP_MIN_RATE_CHANGE}) で再計算`,
        actor: 'tools/recalc-mahjong-rates',
        createdAt: at
      });
    }
  });
  console.log('\n反映しました。管理画面の「📈 レート推移グラフ」から作り直してください。');
}

main().catch(error => {
  console.error(error.message || error);
  if (error.code === 7) {
    console.error('→ 上の「認証:」のアカウントに、IAM で「Cloud Datastore ユーザー」ロールを付けてください。');
  }
  process.exit(1);
});
