// 航海のルール (functions/voyage.js) を、画面から読める assets/js/voyage-rules.js へそのまま写す (Hosting の predeploy)。
//   航海のデモ (voyage-demo.html) は本番と同じルールで1回ぶんを決めるので、ルールの元はサーバーの1つだけにしておく。
//   写したファイルは Git に入れない (.gitignore)。手元でデモを開くときは、先に node tools/copy-voyage-rules.mjs を走らせる。
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
copyFileSync(resolve(root, 'functions/voyage.js'), resolve(root, 'assets/js/voyage-rules.js'));
console.log('✅ functions/voyage.js を assets/js/voyage-rules.js へ写しました');
