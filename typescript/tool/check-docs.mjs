#!/usr/bin/env node
// 手引きに載せた定義とコマンドを、機械が読む。
//
// 文書に載せたものは**走らせないと必ず腐る**（読んだ人の所で初めて落ちる）。
// チュートリアルと PR コメントの断片は CI が走らせていたが、それ以外の手引き
// （cookbook / guide / getting-started …）は誰も見ていなかった。
//
// 見るのは3つ。
//
//   1. ```yaml の**丸ごとの定義**（`dsl_version:` / `page:` / `app:` で始まる）
//      … CLI の `validate` にそのままかける（手引きの完成形は通るはず）
//   2. ```yaml の**断片**（`columns:` だけ・`- { field: … }` だけ）
//      … 丸ごとは検証できないので、**キー名だけ**を DSL の語彙（spec/reference.json）と
//      突き合わせる。手引きが腐る一番の形（消えたキー・綴り違い）はこれで捕まる
//   3. ```bash に出てくる `hatake <コマンド> --旗`
//      … **`--help` に載っているか**だけを見る（走らせない）。走らせると `git clone` も
//      `probe` も動いてしまう。実際に走らせるものは CI に個別のステップで置いてある
//      （チュートリアル・PR コメント・意図・シナリオ…）
//
// 3 は「手引き ↔ help」の突き合わせでもある。docs にしか無い旗が出たら、**どちらかが
// 嘘**（旗が消えたか、help が書き忘れたか）。
//
// 定義ではない hatake の紙（案件の前書き・意図の1枚）は、**その紙の読み手**にかける
// （DSL の語彙で見ると全部知らないキーになるので、`no-check` で外すと誰も見なくなる）。
//
// hatake の定義ではない YAML（`pubspec.yaml` / GitHub Actions）は、囲みの言語のうしろに
// `no-check` と書いて外す。**黙って飛ばさない**（何をなぜ飛ばしたかを必ず出す）。
//
// 使い方: node tool/check-docs.mjs [file...]   （既定は ../docs/**/*.md）

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { closestKey, parseIntent, parseProject } from "../dist/index.js";
import { runCli } from "../dist/cli.js";

const ROOT = resolve(import.meta.dirname, "..", "..");
const DOCS = join(ROOT, "docs");
const REFERENCE = join(ROOT, "spec", "reference.json");

/** 囲みの塊（言語・情報・中身・行番号）。 */
function* blocks(text) {
  const fence = /^```([^\n]*)\n([\s\S]*?)^```/gm;
  for (const match of text.matchAll(fence)) {
    const info = match[1].trim();
    yield {
      lang: info.split(/\s+/)[0] ?? "",
      info,
      body: match[2],
      line: text.slice(0, match.index).split("\n").length,
    };
  }
}

const markdownFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });

/** 定義の語彙（キー名）。 */
const reference = () => JSON.parse(readFileSync(REFERENCE, "utf8"));

const knownKeys = (ref) => new Set(Object.keys(ref.keyIndex));

/**
 * **中身が自由な所**のキー名。ここから下は見ない（見ると必ず誤報になる）。
 *
 * もとは `spec/reference.json` の「閉じていないノード」（`closed: false`）＝`config` /
 * `params` / `computed` / `maxRows` / `byRole` …。条件（`visibleWhen` など）と
 * `validators` の中身も同じ扱いで、そこは DSL の語彙ではなくプラグインの語彙。
 *
 * 条件のキーだけは reference から機械的に引けないので名前で並べるが、**語彙に無い名前が
 * 混ざったら落とす**（キーが消えたのに黙って飛ばし続けるのを防ぐ）。
 */
function openContainers(ref) {
  const fromNodes = Object.entries(ref.nodes)
    .filter(([, node]) => node.closed === false)
    .map(([name]) => name.split(".").pop());
  const byName = [
    "validators",
    "visibleWhen",
    "requiredWhen",
    "enabledWhen",
    "readOnlyWhen",
    "where",
  ];
  const keys = knownKeys(ref);
  const gone = byName.filter((one) => !keys.has(one));
  if (gone.length > 0) {
    throw new Error(
      `見ないことにしているキーが DSL から消えています: ${gone.join(" / ")}` +
        `（この一覧を直してください）。`,
    );
  }
  return new Set([...fromNodes, ...byName]);
}

/**
 * CLI が**公開している**コマンドと旗（`--help` から読む）。
 *
 * ソースを読まないのは、手引きと突き合わせる相手は「公開しているもの」だから。
 * 読めなければ落とす（空の語彙で照合すると、何も言わないまま通ってしまう）。
 */
function published() {
  const lines = [];
  runCli(["--help"], {
    out: (text) => lines.push(text),
    err: () => {},
    readFile: () => "",
    writeFile: () => {},
    listFiles: () => null,
  });
  const help = lines.join("\n");
  const commands = new Set(
    [...help.matchAll(/^ {2}hatake ([a-z-]+)/gm)].map((one) => one[1]),
  );
  const flags = new Set([...help.matchAll(/--([a-z][a-z-]*)/g)].map((one) => one[1]));
  if (commands.size < 10 || flags.size < 20) {
    throw new Error(
      `--help からコマンドと旗を読めませんでした（${commands.size} / ${flags.size}）。`,
    );
  }
  return { commands, flags };
}

/** その塊の中の全部のキー名（中身が自由な所から下は見ない）。 */
function keysIn(node, open, found = new Set()) {
  if (Array.isArray(node)) {
    for (const one of node) keysIn(one, open, found);
  } else if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      found.add(key);
      if (open.has(key)) continue;
      keysIn(value, open, found);
    }
  }
  return found;
}

/** 丸ごとの定義は CLI にかける（プロセスは起こさない＝答えは CLI と同じもの）。 */
function checkDefinition(body, where, problems) {
  const messages = [];
  const code = runCli(["validate", "doc.yaml"], {
    out: (text) => messages.push(text),
    err: (text) => messages.push(text),
    readFile: (path) => {
      if (path === "doc.yaml") return body;
      throw new Error(`ENOENT: ${path}`);
    },
    writeFile: () => {},
    listFiles: () => null,
  });
  if (code !== 0) {
    problems.push(`${where}: 載せた定義が通りません:\n    ${messages.join("\n    ")}`);
  }
}

/**
 * 定義ではない紙（案件の前書き・意図の1枚）は、**その紙の読み手**にかける。
 *
 * DSL の語彙で見ると全部知らないキーになるので、`no-check` で外したくなる。けれど
 * 外すと誰も見ない＝手引きに載せた紙だけが腐る。読み手はもう在るので、それを呼ぶ。
 */
function checkPaper(body, where, problems, read, what) {
  try {
    read(body);
  } catch (error) {
    problems.push(`${where}: 載せた${what}が読めません: ${error.message}`);
  }
}

/**
 * 断片はキー名だけを見る（丸ごとは検証できないので、そこは言わない）。
 *
 * **YAML として読めない断片**（2か所の抜粋をつないで載せているもの）は、間違いとは
 * 限らないので**落とさない**。ただし黙って飛ばさず「見ていない」と言う。
 */
async function checkFragment(body, where, keys, open, problems, skipped) {
  const { parse } = await import("yaml");
  let node;
  try {
    node = parse(body);
  } catch {
    skipped.push(`${where}（yaml: YAML として読めない断片＝2か所の抜粋など）`);
    return;
  }
  const unknown = [...keysIn(node, open)].filter((one) => !keys.has(one)).sort();
  if (unknown.length === 0) return;
  const said = unknown.map((one) => {
    const near = closestKey(one, [...keys]);
    return near === null ? one : `${one}（${near} の間違い？）`;
  });
  problems.push(
    `${where}: DSL に無いキーが載っています: ${said.join(" / ")}` +
      `（hatake の定義でないなら、囲みに no-check:<理由> と書いてください）`,
  );
}

/**
 * `hatake <コマンド> … --旗` が `--help` に載っているか（走らせない）。
 *
 * 旗は**コマンド名の直後だけに来るわけではない**（`explain page.yaml --roles`）。
 * だからコマンド名から**行の終わりまで**を見る。`|` や `&&` の先は別のコマンドなので、
 * そこで切る（他人の旗を hatake の旗として数えない）。
 */
function checkCommands(body, where, { commands, flags }, problems) {
  let found = 0;
  // 行末の `\` で続く書き方は、1行に畳んでから見る。
  const lines = body.replace(/\\\n\s*/g, " ").split("\n");
  for (const line of lines) {
    // コマンド名は英字で始まる。`claude mcp add hatake -- node …` のような
    // 「別のコマンドの引数に hatake が出てくる」形を拾わないため。
    for (const match of line.matchAll(/\bhatake\s+([a-z][a-z-]*)/g)) {
      const name = match[1];
      found += 1;
      if (!commands.has(name)) {
        problems.push(`${where}: hatake に "${name}" というコマンドはありません。`);
      }
      const rest = line.slice(match.index + match[0].length).split(/[|;&>]/)[0];
      for (const flag of [...rest.matchAll(/--([a-z][a-z-]*)/g)].map((one) => one[1])) {
        if (!flags.has(flag)) {
          problems.push(
            `${where}: hatake ${name} に --${flag} という旗は、--help に載っていません` +
              `（旗が消えたか、help が書き忘れたか）。`,
          );
        }
      }
    }
  }
  return found;
}

async function main(argv) {
  // 提案（docs/proposals）は**これから作る DSL**を書く場所なので、いまの語彙で
  // 突き合わせない（提案が通ったら定義が動く＝順番が逆になる）。
  const isProposal = (path) => path.replace(/\\/g, "/").includes("/docs/proposals/");
  const files = (
    argv.length > 0 ? argv.map((one) => resolve(one)) : markdownFiles(DOCS)
  ).filter((one) => argv.length > 0 || !isProposal(one));
  const ref = reference();
  const keys = knownKeys(ref);
  const open = openContainers(ref);
  const surface = published();
  const problems = [];
  const skipped = [];
  const counts = { whole: 0, preamble: 0, intent: 0, fragment: 0, command: 0 };

  for (const path of files) {
    if (!statSync(path).isFile()) continue;
    const text = readFileSync(path, "utf8");
    const where = relative(ROOT, path).replace(/\\/g, "/");
    for (const block of blocks(text)) {
      const at = `${where}:${block.line}`;
      // 理由は残り全部（空白を含んでよい）。
      const noCheck = /no-check(?::\s*(.*))?$/.exec(block.info);
      if (noCheck !== null) {
        // 理由を書かせる（黙って外せる印にすると、いつか全部に付く）。
        const why = noCheck[1]?.trim();
        skipped.push(
          `${at}（${block.lang || "?"}: ${why || "理由が書いてありません"}）`,
        );
        if (!why) {
          problems.push(
            `${at}: no-check には理由を書いてください（no-check:<理由>）。`,
          );
        }
        continue;
      }
      if (block.lang === "yaml" || block.lang === "yml") {
        // `...` は「ここは省いた」の印（読む人にもそう見える）。抜粋は丸ごとでは
        // 通らないので見ない＝**印を2つ持たない**（no-check を書かせない）。
        if (/(^|[\s{,])\.\.\.($|[\s},])/.test(block.body)) {
          skipped.push(`${at}（yaml: ... で省いている抜粋）`);
          continue;
        }
        const stripped = block.body
          .split("\n")
          .filter((one) => !one.startsWith("#"))
          .join("\n")
          .trimStart();
        // 丸ごとと見るのは `dsl_version:` か `page:` から書いてある塊だけ。
        // `app:` の塊は**抜粋**が多い（ページを `…` で省く）ので、断片として見る
        // ＝丸ごとで見せたいなら `dsl_version:` から書く、という決めごとでもある。
        if (/^(dsl_version|page):/.test(stripped)) {
          counts.whole += 1;
          checkDefinition(block.body, at, problems);
        } else if (/^project_version:/.test(stripped)) {
          counts.preamble += 1;
          checkPaper(block.body, at, problems, parseProject, "案件の前書き");
        } else if (/^(intent_version|asked):/.test(stripped)) {
          // 意図の1枚（言われたこと）も定義ではない。同じ理由で、専用の読み手にかける。
          counts.intent += 1;
          checkPaper(block.body, at, problems, parseIntent, "意図の1枚");
        } else {
          counts.fragment += 1;
          await checkFragment(block.body, at, keys, open, problems, skipped);
        }
      } else if (block.lang === "bash") {
        counts.command += checkCommands(block.body, at, surface, problems);
      }
    }
  }

  console.log(
    `手引きを ${files.length} 枚読みました（提案は将来の DSL なので見ていません）` +
      `（定義 ${counts.whole}・前書き ${counts.preamble}・意図 ${counts.intent}・` +
      `断片 ${counts.fragment}・コマンド ${counts.command}・` +
      `飛ばした ${skipped.length}）。`,
  );
  for (const one of skipped) console.log(`   飛ばした: ${one}`);
  if (problems.length === 0) {
    console.log("手引きに載せたものは、いま在るものと食い違っていません。");
    return 0;
  }
  console.log("");
  console.log(`食い違いが ${problems.length} 件あります:`);
  for (const one of problems) console.log(` - ${one}`);
  return 1;
}

process.exitCode = await main(process.argv.slice(2));
