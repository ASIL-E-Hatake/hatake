// 台帳がスキーマから取り残されていないかを見る。CI で落とすためのもの。
//
// 落とす条件:
//   1. reference.json の keyIndex にあるキーが、どのトピックにも internal にも入っていない
//      → 機能を足したのにサイトに載っていない状態。これを通すと台帳が形骸化する。
//   2. 台帳の参照が解決しない（知らないキー・知らないセクション・id 重複・実在しない demo ページ）
import { demoAppPath, demoAppSource, reference, topics } from './lib/context.mjs';

const errors = [];
const claimed = new Set(topics.internal ?? []);
const sectionIds = new Set(topics.sections.map((s) => s.id));
const seenIds = new Set();

for (const topic of topics.topics) {
  const at = `topics[${topic.id}]`;
  if (seenIds.has(topic.id)) errors.push(`${at}: id が重複している`);
  seenIds.add(topic.id);
  if (!sectionIds.has(topic.section)) errors.push(`${at}: 知らない section "${topic.section}"`);
  if (!topic.title || !topic.blurb) errors.push(`${at}: title と blurb は必須`);

  for (const key of topic.keys ?? []) {
    if (!reference.keyIndex[key]) {
      errors.push(`${at}: 知らないキー "${key}"（reference.json に無い＝綴り間違いか、消えたキー）`);
    }
    claimed.add(key);
  }

  // デモへのリンクは「実在するページ」だけ。消えた画面に飛ばさないため。
  if (topic.demo && !new RegExp(`id:\\s*${topic.demo}\\b`).test(demoAppSource)) {
    errors.push(`${at}: demo "${topic.demo}" が ${demoAppPath} に無い`);
  }
}

const orphans = Object.keys(reference.keyIndex).filter((key) => !claimed.has(key));
if (orphans.length > 0) {
  errors.push(
    `どのトピックにも載っていないキーが ${orphans.length} 件ある: ${orphans.join(', ')}\n` +
      '  → docs/site/topics.json の該当トピックの keys に足す（新しい機能なら新しいトピックを1件作る）。\n' +
      '     ページに出さないキーは internal に入れる。契約は docs/site/protocol.ja.md。',
  );
}

if (errors.length > 0) {
  console.error('台帳とスキーマがズレている:\n');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const total = Object.keys(reference.keyIndex).length;
console.log(`台帳OK: ${topics.topics.length} トピックで ${total} キーを網羅（DSL ${reference.dslVersion}）`);
