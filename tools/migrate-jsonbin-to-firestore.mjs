import fs from 'node:fs';
import process from 'node:process';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const [, , jsonPath, serviceAccountPath] = process.argv;

if (!jsonPath || !serviceAccountPath) {
  console.error('Usage: npm run migrate:firebase -- ./jsonbin-backup.json ./serviceAccountKey.json');
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
const record = source.record || source;

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: `${serviceAccount.project_id}.appspot.com`
});

const databaseId = process.env.FIRESTORE_DATABASE_ID || serviceAccount.project_id;
const db = getFirestore(app, databaseId);
console.log(`Using Firestore database: ${databaseId}`);

const collections = {
  scores: 'players',
  sports_bets: 'sports_bets',
  speedstorm_records: 'speedstorm_records',
  lotteries: 'lotteries',
  gift_codes: 'gift_codes',
  exercise_reports: 'exercise_reports',
  career_posts: 'career_posts'
};

function toDocId(value) {
  const raw = String(value ?? '').trim();
  return encodeURIComponent(raw || `item_${Date.now()}_${Math.random().toString(36).slice(2)}`)
    .replace(/\./g, '%2E')
    .replace(/\//g, '%2F');
}

function getItemDocId(key, item, index) {
  if (key === 'scores') return toDocId(item.name || `player_${index}`);
  if (key === 'sports_bets') return toDocId(item.betId ?? item.id ?? `bet_${index}`);
  if (key === 'lotteries') return toDocId(item.lotteryId ?? item.id ?? `lottery_${index}`);
  if (key === 'gift_codes') return toDocId(item.code ?? item.name ?? item.id ?? `gift_${index}`);
  if (key === 'exercise_reports') return toDocId(item.id ?? `exercise_${index}`);
  if (key === 'career_posts') return toDocId(item.id ?? `career_${index}`);
  if (key === 'speedstorm_records') return toDocId(item.id ?? item.player ?? `speedstorm_${index}`);
  return toDocId(item.id ?? index);
}

async function replaceCollection(key, items = []) {
  const collectionName = collections[key];
  const collectionRef = db.collection(collectionName);
  const existing = await collectionRef.get();
  const nextIds = new Set();
  let batch = db.batch();
  let opCount = 0;

  for (const doc of existing.docs) {
    batch.delete(doc.ref);
    opCount++;
    if (opCount >= 450) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }

  items.forEach((item, index) => {
    const docId = getItemDocId(key, item, index);
    nextIds.add(docId);
    batch.set(collectionRef.doc(docId), item);
    opCount++;
  });

  if (opCount > 0) {
    await batch.commit();
  }

  console.log(`${collectionName}: ${nextIds.size} docs`);
}

for (const key of Object.keys(collections)) {
  await replaceCollection(key, record[key] || []);
}

await db.collection('settings').doc('app').set({
  special_theme: record.special_theme ?? null,
  migratedAt: new Date().toISOString()
}, { merge: true });

if (record.territory_battle) {
  await db.collection('territory_battle').doc('current').set(record.territory_battle);
}

console.log('Migration complete.');
