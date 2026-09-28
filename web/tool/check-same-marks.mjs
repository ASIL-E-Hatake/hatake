// **Vue と React が同じ印を出しているか。**
//
// 要素の見つけ方（`data-hatake="…"`）とクラス名（`hatake-…`）は[契約](../runtime/hatake.css)で、
// 案件の CSS と画面の試験がそこに乗っている。片方の Renderer だけ印を変えると、
// **もう片方に載せ替えた案件の試験と見た目が黙って壊れる**。しかも壊れるのは
// 案件側なので、こちらの CI には出ない。
//
// 見るのは字（ソース）で、描いた結果ではない。描いて比べるには両方の画面を8種類
// 揃えて動かすことになり、落ちたときに「印が違う」のか「描き方が違う」のかが
// 分からなくなる。**印が同じこと**だけをここで見て、振る舞いは各 Renderer の試験が見る。

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** その版のソースに出てくる印を全部集める。 */
function marksIn(pkg) {
  const marks = new Set();
  const classes = new Set();

  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      const src = readFileSync(path, "utf8");

      // 書き方は版で違う（Vue は `"data-hatake": \`…\``、React は `data-hatake="…"`）。
      // **正規表現で両方を当てにいくと外す**ので、印の字を見つけてから、そこより先の
      // 最初の引用符を開きとして閉じまでを取る。差し込み（`${…}`）は名前が揃って
      // いればよいので `*` に潰して比べる。
      for (let at = src.indexOf("data-hatake"); at !== -1; at = src.indexOf("data-hatake", at + 1)) {
        let rest = src.slice(at + "data-hatake".length, at + 200);

        // Vue は `"data-hatake": …` なので、**名前を閉じた引用符を先に捨てる**
        // （捨てないと、それを値の開きと読んで中身が滅茶苦茶になる）。
        if (rest[0] === '"' || rest[0] === "'") rest = rest.slice(1);
        // 区切り（`:` `=` `{` と空白）を越える。
        let from = 0;
        while (from < rest.length && /[\s:={]/.test(rest[from])) from += 1;

        const quote = rest[from];
        if (quote !== '"' && quote !== "'" && quote !== "`") continue;
        const closed = rest.indexOf(quote, from + 1);
        if (closed === -1) continue;

        const mark = rest.slice(from + 1, closed).replace(/\$\{[^}]*\}/g, "*").trim();

        // **覚え書きの中の字は拾わない。** 頭のコメントでも `data-hatake` に触れる
        // ので、印として在りうる形（小文字と `:` と `*`）だけを通す。ここを緩めると
        // 日本語の文がそのまま「印」として並んで、差分が読めなくなる。
        if (/^[a-z][a-z0-9-]*(:[A-Za-z0-9*_-]+)*$/.test(mark)) marks.add(mark);
      }
      for (const found of src.matchAll(/hatake-[a-z0-9-]+/g)) {
        classes.add(found[0]);
      }
    }
  };
  walk(join(ROOT, pkg, "src"));
  return { marks, classes };
}

const vue = marksIn("vue3");
const react = marksIn("react19");

const missing = (from, to) => [...from].filter((one) => !to.has(one)).sort();

const problems = [];
for (const [what, a, b] of [
  ["印（data-hatake）", vue.marks, react.marks],
  ["クラス名", vue.classes, react.classes],
]) {
  const onlyVue = missing(a, b);
  const onlyReact = missing(b, a);
  if (onlyVue.length > 0) problems.push(`${what}: Vue にだけ在る … ${onlyVue.join(", ")}`);
  if (onlyReact.length > 0) problems.push(`${what}: React にだけ在る … ${onlyReact.join(", ")}`);
}

// **数えられていること自体**も見る（歩き方を間違えたら黙って通る）。
if (vue.marks.size < 10 || react.marks.size < 10) {
  console.error(`✗ 印がほとんど見つかりません（Vue ${vue.marks.size} / React ${react.marks.size}）。`);
  console.error("  読む所か読み方が変わっています。");
  process.exit(1);
}

if (problems.length > 0) {
  console.error("✗ 2つの Renderer が違う印を出しています:");
  for (const one of problems) console.error(`  - ${one}`);
  console.error("");
  console.error("  印とクラス名は契約です（案件の CSS と画面の試験がここに乗っています）。");
  console.error("  片方だけ変えると、もう片方に載せ替えた案件が黙って壊れます。");
  process.exit(1);
}

console.log(
  `印 ${vue.marks.size} 種・クラス名 ${vue.classes.size} 種が、Vue と React で揃っています。`,
);
