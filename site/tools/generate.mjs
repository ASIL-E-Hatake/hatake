// 台帳＋spec/ から機能別ページを組み立てる。
//
// 手で書くのは散文（prose/）だけ。キー表・例・よくある間違い・デモへのリンクは
// ここで毎回作り直す。ページを手で編集させない＝生成物とスキーマがズレない。
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { assets } from './lib/assets.mjs';
import { demoLink, demoUrl } from './lib/site.mjs';
import {
  byKeyOverlap,
  demoAppSource,
  examples,
  hasProse,
  keyFacts,
  pitfalls,
  prosePath,
  reference,
  repoRoot,
  siteRoot,
  topics,
} from './lib/context.mjs';

const docsDir = join(siteRoot, 'docs');
const GITHUB_BLOB = 'https://github.com/ASIL-E-Hatake/hatake/blob/main';

// 表のセルに入れる文字列。`|` は列区切りになり、`<` は Vue がタグとして解釈して
// ビルドが落ちる（スキーマの説明文には `{ key: <value> }` のような記述がある）。
const esc = (s) =>
  String(s ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', ' ')
    .trim();
const fence = (lines, label) => [`\`\`\`yaml${label ? ` [${label}]` : ''}`, ...lines, '```'].join('\n');

/** キーの型を1セルで言い切る。入れ子はノード名を出して、その場所を追える形にする。 */
function typeCell(entry) {
  const parts = [`\`${entry.type ?? 'any'}\``];
  if (entry.items) parts.push(`of \`${esc(entry.items)}\``);
  if (entry.nodes?.length) parts.push(`→ ${entry.nodes.map((n) => `\`${n}\``).join(' / ')}`);
  if (entry.values?.length) parts.push(`（${entry.values.map((v) => `\`${v}\``).join(' / ')}${entry.open ? ' ほか' : ''}）`);
  return parts.join(' ');
}

function keyTable(keys) {
  const rows = [];
  for (const key of keys) {
    for (const fact of keyFacts(key)) {
      rows.push(
        `| \`${key}\` | \`${fact.node}\` | ${typeCell(fact)} | ${fact.required ? '必須' : '任意'} | ` +
          `${fact.default === undefined ? '—' : `\`${JSON.stringify(fact.default)}\``} | ` +
          `${fact.pageKinds.length ? fact.pageKinds.map((k) => `\`${k}\``).join(' ') : 'すべて'} | ` +
          `${esc(fact.description) || '—'} |`,
      );
    }
  }
  if (rows.length === 0) return '';
  return [
    '## 書けるキー',
    '',
    '| キー | 書く場所 | 型 | 必須 | 既定値 | 有効なページ種別 | 説明 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `<small>この表は [\`spec/reference.json\`](${GITHUB_BLOB}/spec/reference.json) から生成している（JSON Schema が正）。手元では \`npx hatake reference <キー名>\` で同じものが引ける。</small>`,
  ].join('\n');
}

function exampleList(keys) {
  const hits = byKeyOverlap(examples, keys);
  if (hits.length === 0) return '';
  const rows = hits.map(
    (e) =>
      `| [\`${e.file}\`](${GITHUB_BLOB}/spec/examples/${e.file}) | \`${e.kind}\` | ${esc(e.title)} | ${esc(e.task)} |`,
  );
  return [
    '## 近い例',
    '',
    '例は丸ごと写して直すのが一番速い。以下は CI で検証済み（そのまま動く形）。',
    '',
    '| ファイル | 種別 | 画面 | どういうときに使うか |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function pitfallList(keys) {
  const hits = byKeyOverlap(pitfalls, keys);
  if (hits.length === 0) return '';
  const blocks = hits.map((p) => {
    // 「コードで書いてしまう」「書き忘れる」類は、間違いのコード例が無い（bad が空）。
    // その場合は正しい書き方だけ出す。
    const code =
      p.bad && p.good
        ? ['::: code-group', '', fence(p.bad, '間違い'), '', fence(p.good, '正しい'), '', ':::']
        : p.good
          ? [fence(p.good, '正しい書き方')]
          : [];
    return [
      `### ${p.wrong.ja}`,
      '',
      `**なぜ駄目か** ${p.why.ja}`,
      '',
      `**こう直す** ${p.fix.ja}`,
      '',
      ...code,
    ].join('\n');
  });
  return [
    '## よくある間違い',
    '',
    ...blocks.flatMap((b) => [b, '']),
    `<small>[\`spec/pitfalls.json\`](${GITHUB_BLOB}/spec/pitfalls.json) から生成。各項目は CI で検証済み（間違いは本当に落ち、正しい方は本当に通る）。手元では \`npx hatake pitfalls <キー名>\`。</small>`,
  ].join('\n');
}

function demoSection(topic) {
  if (!topic.demo) return '';
  // 画面名はデモ定義から引く。id をそのまま出すと読み手に伝わらない。
  const title = new RegExp(`id:\\s*${topic.demo}\\b[\\s\\S]{0,200}?title:\\s*(.+)`).exec(demoAppSource);
  const name = title ? title[1].trim() : topic.demo;
  return ['## 実物を見る', '', `デモアプリの「${name}」がこれを使っている。 ${demoLink('デモを開く')}`].join('\n');
}

function page(topic) {
  const prose = hasProse(topic)
    ? readFileSync(prosePath(topic), 'utf8').trim()
    : [
        '::: warning 解説は準備中',
        'この機能の説明文はまだ書かれていない。以下のキー表・例・よくある間違いは',
        '定義スキーマから生成しているので、内容は最新で正しい。',
        ':::',
      ].join('\n');

  return [
    '---',
    `title: ${topic.title}`,
    `description: ${topic.blurb}`,
    '---',
    '',
    `# ${topic.title}`,
    '',
    `> ${topic.blurb}`,
    '',
    prose,
    '',
    keyTable(topic.keys ?? []),
    '',
    exampleList(topic.keys ?? []),
    '',
    pitfallList(topic.keys ?? []),
    '',
    demoSection(topic),
    '',
  ]
    .filter((part, i, all) => !(part === '' && all[i - 1] === ''))
    .join('\n');
}

function sectionIndex(section) {
  const rows = topics.topics
    .filter((t) => t.section === section.id)
    .map((t) => `| [${t.title}](/${section.id}/${t.id}) | ${esc(t.blurb)} | ${(t.keys ?? []).map((k) => `\`${k}\``).join(' ')} |`);
  return [
    '---',
    `title: ${section.title}`,
    '---',
    '',
    `# ${section.title}`,
    '',
    `> ${section.blurb}`,
    '',
    '| やりたいこと | 何ができるか | 関係するキー |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

// --- デモへのリンクが SPA ルータに乗っ取られる書き方をしていないか ---
// 乗っ取られると 404 になるが、ビルドも リンク検査も通ってしまう（デモはページではないので
// 検査対象外）。押すまで気づけないので、書いた時点で落とす。
function checkDemoLinks() {
  const bad = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (!['dsl', 'partials', 'public', '.vitepress'].includes(name)) walk(path);
        continue;
      }
      if (!name.endsWith('.md')) continue;
      const lines = readFileSync(path, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const where = `${relative(siteRoot, path).replaceAll('\\', '/')}:${i + 1}`;
        if (line.includes('](/demo/')) {
          bad.push(`${where}: Markdown のリンクではデモに飛べない → ${demoLink('リンク文字')} と書く`);
        }
        if (/link:\s*\/demo\//.test(line) && !/target/.test(lines.slice(i, i + 3).join(' '))) {
          bad.push(`${where}: デモへの link には target: _self を付ける`);
        }
      });
    }
  };
  walk(join(siteRoot, 'prose'));
  walk(docsDir);
  if (bad.length > 0) {
    console.error(`デモへのリンクの書き方が違う（押すと 404 になる。理由は tools/lib/site.mjs）:\n`);
    for (const b of bad) console.error(`  - ${b}`);
    process.exit(1);
  }
}
checkDemoLinks();

// --- 生成物を作り直す（毎回まるごと捨てる。手で足したファイルを残さない） ---
for (const section of topics.sections) {
  const dir = join(docsDir, section.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.md'), sectionIndex(section), 'utf8');
}
let count = 0;
for (const topic of topics.topics) {
  writeFileSync(join(docsDir, topic.section, `${topic.id}.md`), page(topic), 'utf8');
  count += 1;
}

// --- AI / 機械が取りに来る素材を、安定した URL に置く ---
// 中身の正はリポジトリのファイル。ここでは複製するだけ（書き換えない＝ズレない）。
const publicDir = join(docsDir, 'public');
rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });
for (const a of assets) copyFileSync(join(repoRoot, a.from), join(publicDir, a.to));

// AI ページに貼る素材一覧。大きさを載せるのは「何をどれだけ食うか」が分かるようにするため。
// 手で書くと必ず古くなるので生成する。
const kb = (path) => `${Math.max(1, Math.round(statSync(path).size / 1024))} KB`;
const partialsDir = join(docsDir, 'partials');
mkdirSync(partialsDir, { recursive: true });
writeFileSync(
  join(partialsDir, 'ai-assets.md'),
  [
    '| 素材 | 用途 | 大きさ |',
    '| --- | --- | --- |',
    ...assets.map((a) => `| [\`/${a.to}\`](/${a.to}) | ${a.use} | ${kb(join(publicDir, a.to))} |`),
    '',
  ].join('\n'),
  'utf8',
);

const pending = topics.topics.filter((t) => !hasProse(t)).length;
console.log(
  `生成: ${count} ページ / ${assets.length} 素材（DSL ${reference.dslVersion}）` +
    (pending > 0 ? `、うち解説未執筆 ${pending} 件（npm run site:todo）` : ''),
);
