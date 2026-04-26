import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';

const app = admin.initializeApp();
const db = getFirestore(app, 'q-jong');
const MASTER_USERNAME = 'Kabocha';
const ALLOWED_ORIGINS = new Set([
  'https://q-jong.web.app',
  'https://q-jong.firebaseapp.com',
  'http://localhost:5000',
  'http://localhost:5002'
]);

function setCors(req, res) {
  const origin = req.get('origin') || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

function authUidFromUsername(username) {
  return encodeURIComponent(username).replace(/%/g, '_').slice(0, 120);
}

async function getStoredPassword(playerDoc, player) {
  const secretDoc = await db.collection('player_secrets').doc(playerDoc.id).get();
  if (secretDoc.exists) {
    return String(secretDoc.data().pass || '');
  }

  // 移行期間の後方互換。player_secrets 作成後は players.pass を削除する。
  return String(player.pass || '');
}

export const qjongLogin = onRequest({ region: 'asia-northeast1' }, async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
    return;
  }

  try {
    const { username, password } = req.body || {};
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '');

    if (!cleanUsername || !cleanPassword) {
      res.status(400).json({ status: 'error', message: 'ユーザー名とパスワードを入力してください。' });
      return;
    }

    const snapshot = await db.collection('players').where('name', '==', cleanUsername).limit(1).get();
    if (snapshot.empty) {
      res.status(401).json({ status: 'error', message: 'ユーザー名またはパスワードが違います。' });
      return;
    }

    const playerDoc = snapshot.docs[0];
    const player = playerDoc.data();
    const storedPassword = await getStoredPassword(playerDoc, player);
    if (storedPassword !== cleanPassword) {
      res.status(401).json({ status: 'error', message: 'ユーザー名またはパスワードが違います。' });
      return;
    }

    const isAdmin = cleanUsername === MASTER_USERNAME;
    const uid = authUidFromUsername(cleanUsername);
    const token = await admin.auth().createCustomToken(uid, {
      username: cleanUsername,
      admin: isAdmin
    });

    res.status(200).json({
      status: 'success',
      token,
      user: {
        name: player.name,
        score: player.score || 0,
        status: player.status || 'none',
        admin: isAdmin
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'error', message: `Firebase認証エラー: ${error.message}` });
  }
});
