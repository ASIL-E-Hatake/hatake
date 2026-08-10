// サイトの生成・検証が読む素材を1か所で解決する。
// 素材はすべて他所（spec/ と docs/site/）が正で、ここでは読むだけ。依存パッケージなし。
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const siteRoot = join(repoRoot, 'site');

const readJson = (rel) => JSON.parse(readFileSync(join(repoRoot, rel), 'utf8'));

/** 台帳。サイトの目次であり、フレームワーク側からの唯一の申し送り。 */
export const topics = readJson('docs/site/topics.json');
/** JSON Schema から生成された DSL リファレンス。キーの型・既定値・書ける場所の正。 */
export const reference = readJson('spec/reference.json');
/** よくある間違い。トピックとはキー名で突き合わせる。 */
export const pitfalls = readJson('spec/pitfalls.json').pitfalls;
/** 例のカタログ。実ファイルは CI で検証済み。 */
export const examples = readJson('spec/examples/index.json').examples;

/** デモアプリの定義（生テキスト）。demo に書いたページ id が実在するかの照合に使う。 */
export const demoAppPath = 'flutter/packages/hatake_example/assets/sales_app.yaml';
export const demoAppSource = readFileSync(join(repoRoot, demoAppPath), 'utf8');

/** 散文（手書き）の置き場所。存在するかどうかが「ページ着手済み」の唯一の判定。 */
export const prosePath = (topic) => join(siteRoot, 'prose', topic.section, `${topic.id}.ja.md`);
export const hasProse = (topic) => existsSync(prosePath(topic));

/** そのキーが書けるノードと、ノードごとの定義（型・既定値・説明）を引く。 */
export function keyFacts(key) {
  const out = [];
  for (const [nodeName, node] of Object.entries(reference.nodes)) {
    for (const entry of node.keys ?? []) {
      if (entry.key === key) out.push({ node: nodeName, pageKinds: node.pageKinds ?? [], ...entry });
    }
  }
  return out;
}

/** キー名の交差でトピックに紐づくもの（手で列挙しない＝増えたら自動で載る）。 */
export const byKeyOverlap = (items, keys) =>
  items.filter((it) => (it.keys ?? []).some((k) => keys.includes(k)));
