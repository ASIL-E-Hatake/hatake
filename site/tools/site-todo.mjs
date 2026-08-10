// 「解説がまだ無いトピック」を出す。これが引き継ぎ文書そのもの。
//
// 状態はどのファイルにも保存しない。散文ファイルが在るか無いかだけで判定するので、
// 両方のチャットが同じファイルを書き合って衝突する余地が無い。
// 落とさない（未着手は正常な状態）。--json は spawn_task に渡す文面を組むため。
import { relative } from 'node:path';
import { byKeyOverlap, examples, hasProse, pitfalls, prosePath, repoRoot, topics } from './lib/context.mjs';

const asJson = process.argv.includes('--json');

const pending = topics.topics
  .filter((t) => !hasProse(t))
  .map((t) => ({
    id: t.id,
    section: t.section,
    title: t.title,
    blurb: t.blurb,
    keys: t.keys ?? [],
    demo: t.demo ?? null,
    prose: relative(repoRoot, prosePath(t)).replaceAll('\\', '/'),
    pitfalls: byKeyOverlap(pitfalls, t.keys ?? []).map((p) => p.id),
    examples: byKeyOverlap(examples, t.keys ?? []).map((e) => e.file),
  }));

if (asJson) {
  console.log(JSON.stringify({ pending, done: topics.topics.length - pending.length }, null, 2));
  process.exit(0);
}

const done = topics.topics.length - pending.length;
console.log(`解説あり ${done} / ${topics.topics.length} トピック\n`);

if (pending.length === 0) {
  console.log('キューは空。全トピックに解説がある。');
  process.exit(0);
}

console.log(`解説がまだ無いトピック（${pending.length} 件）:`);
for (const t of pending) {
  console.log(`\n  ${t.id}  ${t.title}`);
  console.log(`    ${t.blurb}`);
  console.log(`    キー: ${t.keys.join(', ') || '（なし）'}`);
  if (t.pitfalls.length > 0) console.log(`    自動で載る間違い: ${t.pitfalls.join(', ')}`);
  if (t.examples.length > 0) console.log(`    自動で載る例: ${t.examples.join(', ')}`);
  console.log(`    書く場所: ${t.prose}`);
}
console.log(
  '\n散文は「何ができるか / いつ使うか」だけ書く。' +
    'キー表・例・よくある間違い・デモへのリンクは生成されるので書かない。',
);
