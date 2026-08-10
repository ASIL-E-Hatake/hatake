// フレームワークとサイトを1つの PR で同時に触っていないかを見る。
//
// 境界は docs/site/protocol.ja.md に書いてあるが、文書は無視されうるのでここで機械的に止める。
// 例外的に同時変更が必要なとき（キー名の改名など）は ALLOW_CROSS_BOUNDARY=1 で通す。
import { execFileSync } from 'node:child_process';
import { repoRoot } from './lib/context.mjs';

const base = process.argv[2];
if (!base) {
  console.log('比較対象が渡されていないので越境チェックは省略（ローカル実行時は通常これ）');
  process.exit(0);
}

const changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

// docs/site/topics.json はフレームワーク側からの申し送りなので、フレームワーク変更と同居してよい。
const FRAMEWORK = /^(flutter|java|typescript|spec)\//;
const SITE = /^site\//;

const framework = changed.filter((f) => FRAMEWORK.test(f));
const site = changed.filter((f) => SITE.test(f));

if (framework.length > 0 && site.length > 0) {
  if (process.env.ALLOW_CROSS_BOUNDARY === '1') {
    console.log('越境しているが ALLOW_CROSS_BOUNDARY=1 が指定されているので通す');
    process.exit(0);
  }
  console.error('フレームワークとサイトを同じ PR で変更している。別々の PR に分ける。\n');
  console.error('  フレームワーク側:');
  for (const f of framework) console.error(`    ${f}`);
  console.error('  サイト側:');
  for (const f of site) console.error(`    ${f}`);
  console.error(
    '\n  フレームワーク側がサイトに伝えるのは docs/site/topics.json への1行だけ（契約: docs/site/protocol.ja.md）。\n' +
      '  どうしても同時に変える必要があるときは ALLOW_CROSS_BOUNDARY=1。',
  );
  process.exit(1);
}

console.log(`越境なし（変更 ${changed.length} 件）`);
