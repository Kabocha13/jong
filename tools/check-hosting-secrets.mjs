// Hosting の predeploy チェック。
// firebase.json の public は "." なので、ローカルに無いファイルは本番から削除される。
// Git 管理外（.gitignore）の設定ファイルが手元に無いまま deploy すると本番が壊れるため、
// デプロイ前に存在と中身を確認する。

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

// 欠けたままデプロイするとサイトが壊れるファイル
const REQUIRED = [
    { path: 'assets/js/firebase-config.js', reason: 'Firebase が初期化できずログイン不可になります' },
];

// 欠けても他機能は動くが、本番から消えるので警告するファイル
const OPTIONAL = [];

const errors = [];
const warnings = [];

// この項目がプレースホルダのままなら致命的（それ以外は警告だけ）
const CRITICAL_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId', 'messagingSenderId', 'storageBucket'];

function checkPlaceholders(relPath, fatalList) {
    const body = readFileSync(resolve(root, relPath), 'utf8');
    for (const line of body.split('\n')) {
        const match = line.match(/^\s*([A-Za-z]+)\s*:\s*["'](YOUR_[A-Z0-9_]+)["']/);
        if (!match) continue;
        const [, key, placeholder] = match;
        const message = `${relPath}: ${key} が未設定です (${placeholder})`;
        if (CRITICAL_KEYS.includes(key)) {
            fatalList.push(message);
        } else {
            warnings.push(message);
        }
    }
}

for (const { path, reason } of REQUIRED) {
    if (!existsSync(resolve(root, path))) {
        errors.push(`${path} がありません → ${reason}`);
    } else {
        checkPlaceholders(path, errors);
    }
}

for (const { path, reason } of OPTIONAL) {
    if (!existsSync(resolve(root, path))) {
        warnings.push(`${path} がありません → ${reason}`);
    } else {
        checkPlaceholders(path, warnings);
    }
}

for (const warning of warnings) {
    console.warn(`⚠️  ${warning}`);
}

if (errors.length > 0) {
    console.error('\n❌ デプロイを中止しました。Git 管理外の設定ファイルを復元してください:\n');
    for (const error of errors) {
        console.error(`   - ${error}`);
    }
    console.error('\n   例: assets/js/firebase-config.example.js をコピーして値を埋める\n');
    process.exit(1);
}

console.log('✅ Git 管理外の設定ファイルを確認しました');
