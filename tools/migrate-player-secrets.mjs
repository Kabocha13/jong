import fs from 'node:fs/promises';

const PROJECT_ID = 'q-jong';
const DATABASE_ID = 'q-jong';
const ADMIN_USERNAME = process.env.QJONG_ADMIN_USERNAME || 'Kabocha';

function firestoreBaseUrl() {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
}

function functionsBaseUrl(region) {
  return `https://${region}-${PROJECT_ID}.cloudfunctions.net`;
}

async function readFirebaseConfig() {
  const source = await fs.readFile(new URL('../assets/js/firebase-config.js', import.meta.url), 'utf8');
  const match = source.match(/window\.QJONG_FIREBASE_CONFIG\s*=\s*(\{[\s\S]*?\});/);
  if (!match) throw new Error('assets/js/firebase-config.js から Firebase 設定を読めませんでした。');
  return Function(`"use strict"; return (${match[1]});`)();
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {});
  return undefined;
}

function fromFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  return { mapValue: { fields: toFirestoreFields(value) } };
}

function toFirestoreFields(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, toFirestoreValue(value)]));
}

function docIdFromName(name) {
  return String(name).trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 120) || 'unknown';
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function getPlayers() {
  const data = await fetchJson(`${firestoreBaseUrl()}/players`);
  return (data.documents || []).map(doc => ({
    id: doc.name.split('/').pop(),
    data: fromFirestoreFields(doc.fields || {})
  }));
}

async function getIdToken(config, adminPassword) {
  const loginData = await fetchJson(`${functionsBaseUrl(config.functionsRegion || 'asia-northeast1')}/qjongLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: adminPassword })
  });

  const authData = await fetchJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Referer: 'https://q-jong.web.app/'
      },
      body: JSON.stringify({ token: loginData.token, returnSecureToken: true })
    }
  );
  return authData.idToken;
}

async function setSecret(player, idToken) {
  const body = {
    fields: toFirestoreFields({
      name: player.data.name,
      pass: String(player.data.pass),
      updatedAt: new Date().toISOString()
    })
  };
  await fetchJson(`${firestoreBaseUrl()}/player_secrets/${player.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

async function removePublicPassword(player, idToken) {
  const cleaned = { ...player.data };
  delete cleaned.pass;

  await fetchJson(`${firestoreBaseUrl()}/players/${player.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: toFirestoreFields(cleaned) })
  });
}

async function main() {
  const config = await readFirebaseConfig();
  const players = await getPlayers();
  const playersWithPasswords = players.filter(player => typeof player.data.pass === 'string' && player.data.pass);

  if (playersWithPasswords.length === 0) {
    console.log('players.pass は見つかりませんでした。移行済みの可能性があります。');
    return;
  }

  const admin = playersWithPasswords.find(player => player.data.name === ADMIN_USERNAME);
  if (!admin) {
    throw new Error(`${ADMIN_USERNAME} の公開パスワードが見つからないため、管理者トークンを取得できません。`);
  }

  const idToken = await getIdToken(config, admin.data.pass);
  for (const player of playersWithPasswords) {
    await setSecret(player, idToken);
    await removePublicPassword(player, idToken);
    console.log(`${player.data.name}: player_secrets に移行し、players.pass を削除しました。`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
