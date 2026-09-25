#!/usr/bin/env node
// **版の足並み**（docs/compat.ja.md）を機械で見る。
//
// 約束は2つあって、どちらも**破っても静かに壊れる**:
//
//   1. 3版（Flutter / TypeScript / Java）は**同じ番号**で出す。
//      揃っていないと「Flutter 1.2 と TS 0.8 は組み合わせていいのか」に誰も答えられない
//      （収束テストで同じ答えを保証しているのに、番号でその保証が読めなくなる）。
//   2. 配る Dart パッケージの CHANGELOG は**その版に触れている**。
//      pub がそう要求するので、放っておくと `pub publish` が**出す瞬間に**落ちる。
//      実際、0.9.0 に上げたときに Release がここで止まった。
//
// 1 は誰も見ていなかった。2 は `pub publish --dry-run` が見ているが、**依存の無い
// 1枚（hatake_core）だけ**なので、他の9枚は出すまで分からない。ここで全部見る。
//
// 使い方: node tool/check-versions.mjs

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const fail = [];
const say = (line) => console.log(line);

/** pubspec / build.gradle から版だけ抜く（YAML も Gradle も読まずに1行で足りる）。 */
const versionIn = (path, pattern) => {
  const found = pattern.exec(readFileSync(path, "utf8"));
  return found === null ? undefined : found[1];
};

// --- 1. 3版が同じ番号か --------------------------------------------------
const editions = {
  TypeScript: JSON.parse(readFileSync(join(ROOT, "typescript/package.json"), "utf8")).version,
  Java: versionIn(join(ROOT, "java/build.gradle"), /^version = '([^']+)'/m),
  "Flutter (hatake_core)": versionIn(
    join(ROOT, "flutter/packages/hatake_core/pubspec.yaml"),
    /^version:\s*(\S+)/m,
  ),
};

const numbers = [...new Set(Object.values(editions))];
say("版:");
for (const [name, version] of Object.entries(editions)) say(`  ${name} … ${version ?? "（読めません）"}`);
if (numbers.length !== 1 || numbers[0] === undefined) {
  fail.push(
    "3版の番号が揃っていません（docs/compat.ja.md の「版の足並み」）。" +
      "揃っていないと、どの組み合わせが動くのか誰も言えなくなります。",
  );
}

// --- 1.5. リポジトリの CHANGELOG が、名乗っている版より先に進んでいないか ----
//
// **版を上げ忘れても、ここまでは誰も気づきませんでした。** リポジトリの CHANGELOG
// には 0.9.4〜0.9.11 の8節が積まれているのに、3版は 0.9.3 のままでタグも v0.9.3 止まり
// ── それでもこの点検は通っていました（3版が揃っていて、その版の節が在ったので）。
//
// 上げ忘れたまま配ると、**利用者から見て「直したはずのものが入っていない」**に
// なります。CHANGELOG のいちばん上が、名乗っている版と同じであることまで見ます。
{
  const top = /^## (\d+\.\d+\.\d+)/m.exec(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8"));
  const declared = numbers[0];
  if (top !== null && declared !== undefined && top[1] !== declared) {
    const order = (one) => one.split(".").map(Number);
    const [a, b] = [order(top[1]), order(declared)];
    const newer = a.some((part, at) => part > b[at] && a.slice(0, at).every((x, i) => x === b[i]));
    fail.push(
      newer
        ? `CHANGELOG のいちばん上は ${top[1]} ですが、3版は ${declared} を名乗っています` +
          "（版を上げ忘れています。上げないと、直したものが利用者に届きません）"
        : `CHANGELOG のいちばん上は ${top[1]} で、3版が名乗る ${declared} より古いです` +
          "（版を上げたら CHANGELOG にも1節足してください）",
    );
  }
}

// --- 2. 配る Dart パッケージの CHANGELOG がその版に触れているか ----------
const packages = join(ROOT, "flutter/packages");
let checked = 0;
for (const name of readdirSync(packages).sort()) {
  const dir = join(packages, name);
  const pubspec = join(dir, "pubspec.yaml");
  if (!existsSync(pubspec)) continue;
  const source = readFileSync(pubspec, "utf8");
  if (/^publish_to:\s*none/m.test(source)) continue; // 配らないものは見ない

  const version = versionIn(pubspec, /^version:\s*(\S+)/m);
  const changelog = join(dir, "CHANGELOG.md");
  if (!existsSync(changelog)) {
    fail.push(`${name}: CHANGELOG.md がありません（pub は配るときに要求します）`);
    continue;
  }
  if (!readFileSync(changelog, "utf8").includes(`## ${version}`)) {
    fail.push(
      `${name}: CHANGELOG.md に "## ${version}" がありません` +
        "（pub publish がここで落ちます。版を上げたら CHANGELOG にも1節足してください）",
    );
    continue;
  }
  if (version !== numbers[0]) {
    fail.push(`${name}: 版が ${version} で、ほかの版（${numbers[0]}）と揃っていません`);
    continue;
  }
  checked += 1;
}
say(`配る Dart パッケージ: ${checked} 枚（CHANGELOG がその版に触れている）`);

if (fail.length > 0) {
  console.error("");
  for (const one of fail) console.error(`✗ ${one}`);
  process.exit(1);
}
say("版の足並みは揃っています。");
