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
//      突き合わせる。手引きが腐る一番の形（消えたキー・綴り違い）はこれで捕まる。
//      囲みに `context:<ノード>`（`context:table`）と書いてあれば、**書ける場所**まで
//      見る（`filter` の下の `columns` は、キーは在るが書けない＝今までは通っていた）
//   3. ```bash に出てくる `hatake <コマンド> --旗`
//      … **`--help` に載っているか**を見て、**引く道具は実際に走らせる**
//
// 3 は「手引き ↔ help」の突き合わせでもある。docs にしか無い旗が出たら、**どちらかが
// 嘘**（旗が消えたか、help が書き忘れたか）。
//
// **走らせる所**（[RUNNABLE]）は「引く道具」だけに絞ってある。理由は3つ:
//   ・定義も紙も要らない＝手引きに載っている引数（キー名・規則名・やりたいこと）が
//     そのまま渡せる。道を渡す形（`page.yaml`）は、その場に無いので走らせられない
//   ・通信しないし、1バイトも書かない＝砂場が要らない
//   ・**AI が引く知識そのもの**＝ここが腐ると一番効く（キーが消えた・規則名が変わった
//     のに手引きは古い名前で引いている、が黙って通る）
// 判定は**終了コードだけ**（この道具はどれも「引けなかったら 1」を既に返す）＝
// **新しい物差しを作らない**。走らせなかったものは理由ごとに数えて出す（黙って飛ばさない）。
//
// 定義ではない hatake の紙（案件の前書き・意図の1枚）は、**その紙の読み手**にかける
// （DSL の語彙で見ると全部知らないキーになるので、`no-check` で外すと誰も見なくなる）。
//
// hatake の定義ではない YAML（`pubspec.yaml` / GitHub Actions）は、囲みの言語のうしろに
// `no-check` と書いて外す。**黙って飛ばさない**（何をなぜ飛ばしたかを必ず出す）。
//
// 使い方: node tool/check-docs.mjs [file|dir ...]   （既定は ../docs/**/*.md）
//
// **道具として渡せる形**にしてある＝ディレクトリを渡せば中の `.md` を全部読む。
// サイトの散文（`site/prose/**`）にも定義とコマンドが載っていて、そちらは誰も
// 突き合わせていない。読む人がいちばん多いのはサイトなので、同じ道具で読める形に
// しておく（**回すのはサイト側**＝フレームワークの CI で回すと、散文を直したときに
// こちらの CI が落ちる。境界は跨がない）。

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import {
  checkFragmentInContext,
  closestKey,
  describeFragmentFinding,
  parseIntent,
  parseProject,
} from "../dist/index.js";
import { runCli } from "../dist/cli.js";

/** 囲みの字。**この原本にも直接書かない**（自分の説明で自分を壊さないため）。 */
const FENCE = "`".repeat(3);

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
async function checkFragment(body, where, keys, open, problems, skipped, context) {
  const { parse } = await import("yaml");
  let node;
  try {
    node = parse(body);
  } catch {
    skipped.push(`${where}（yaml: YAML として読めない断片＝2か所の抜粋など）`);
    return false;
  }
  // 場所の印が在れば、**そこに書けるか**まで見る（キー名だけの突き合わせより強い＝
  // どこにも無いキーも、この道で同じことを言う）。知らない場所の名前は落とす。
  if (context !== undefined) {
    const found = checkFragmentInContext(node, context, reference());
    for (const one of found) {
      problems.push(`${where}: ${describeFragmentFinding(one)}`);
    }
    return true;
  }
  const unknown = [...keysIn(node, open)].filter((one) => !keys.has(one)).sort();
  if (unknown.length === 0) return false;
  const said = unknown.map((one) => {
    const near = closestKey(one, [...keys]);
    return near === null ? one : `${one}（${near} の間違い？）`;
  });
  problems.push(
    `${where}: DSL に無いキーが載っています: ${said.join(" / ")}` +
      `（hatake の定義でないなら、囲みに no-check:<理由> と書いてください）`,
  );
  return false;
}

/**
 * **走らせる道具**と、走らせるのに要る旗。
 *
 * ここに無い道具は走らせない（定義や紙を渡す形・通信する・書き込む）。値の `requires`
 * は「その旗が付いているときだけ走らせる」＝`ask` は表だけ見る形（`--kinds`）なら
 * 定義が要らない。
 */
const RUNNABLE = {
  reference: {},
  examples: {},
  pitfalls: {},
  rules: {},
  failures: {},
  where: {},
  ask: { requires: "kinds" },
  new: {},
};

/** 書き込む旗（手引きに載っていても走らせない）。 */
const WRITING_FLAGS = new Set(["write", "out"]);

/** 道（ファイル・ディレクトリ）を渡している引数か。 */
const looksLikePath = (arg) =>
  /[/\\]/.test(arg) || /\.(ya?ml|json|md|dart|ts|tsx|java|kt|txt|csv)$/.test(arg);

/**
 * 行を引数に割る（引用符の中の空白は割らない。行末の注釈は落とす）。
 *
 * 手引きのコマンドには説明が付いている（`hatake where 締め処理  # これは外`）。
 * 注釈を引数として渡すと「引けません」になるので、先に落とす。
 */
function tokens(text) {
  const found = [];
  // 行末の CR も落とす（この原本は CRLF なので、`.*$` が最後まで届かない）。
  const line = text.trim().replace(/\s+#.*$/, "");
  for (const match of line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) {
    found.push(match[1] ?? match[2] ?? match[3]);
  }
  return found;
}

/**
 * その1行を走らせてよいか。走らせないなら**理由**を返す。
 *
 * 理由は数えて出すためのもの（黙って飛ばさない）。
 */
function whyNotRun(name, args) {
  const rule = RUNNABLE[name];
  if (rule === undefined) return "引く道具ではない（定義や紙が要る・通信する・書き込む）";
  const flags = args.filter((one) => one.startsWith("--")).map((one) => one.slice(2).split("=")[0]);
  if (rule.requires !== undefined && !flags.includes(rule.requires)) {
    return `定義が要る形（--${rule.requires} なら走らせる）`;
  }
  if (flags.some((one) => WRITING_FLAGS.has(one))) return "書き込む形";
  // `hatake reference <key>` のような**置き換える所**は、そのままでは引けない
  // （手引きの書き方であって、腐っているのではない）。
  if (args.some((one) => one.includes("<"))) return "置き換える所（<…>）が書いてある";
  if (args.some((one) => !one.startsWith("--") && looksLikePath(one))) {
    return "道を渡す形（その場にファイルが無い）";
  }
  return null;
}

/**
 * 実際に走らせる。**終了コードだけ**を見る。
 *
 * 出力は捨てない（落ちたときに人へ見せる）。spec の紙は本物を読ませる＝手引きが
 * 引いている相手は、いま在る spec だから。
 */
function runDocCommand(name, args) {
  const said = [];
  const code = runCli([name, ...args], {
    out: (text) => said.push(text),
    err: (text) => said.push(text),
    readFile: (path) => readFileSync(path, "utf8"),
    writeFile: () => {
      throw new Error("手引きの実行では書き込みません");
    },
    listFiles: () => null,
  });
  return { code, said: said.join("\n") };
}

/**
 * `hatake <コマンド> … --旗` が `--help` に載っているか（引く道具は走らせる）。
 *
 * 旗は**コマンド名の直後だけに来るわけではない**（`explain page.yaml --roles`）。
 * だからコマンド名から**行の終わりまで**を見る。`|` や `&&` の先は別のコマンドなので、
 * そこで切る（他人の旗を hatake の旗として数えない）。
 */
function checkCommands(body, where, { commands, flags }, problems, ran) {
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
      if (!commands.has(name)) continue;
      // **引けるかを本当に確かめる。** 旗の名前が合っていても、引く先が消えていれば
      // 手引きは嘘になる（`hatake rules <消えた規則名>` は終了コード 1）。
      const args = tokens(rest);
      const why = whyNotRun(name, args);
      if (why !== null) {
        ran.skipped.set(why, (ran.skipped.get(why) ?? 0) + 1);
        continue;
      }
      const result = runDocCommand(name, args);
      ran.count += 1;
      if (result.code !== 0) {
        problems.push(
          `${where}: hatake ${name} ${args.join(" ")} は**引けません**` +
            `（終了コード ${result.code}）:\n    ${result.said.split("\n").join("\n    ")}`,
        );
      }
    }
  }
  return found;
}

async function main(argv) {
  // 提案（docs/proposals）は**これから作る DSL**を書く場所なので、いまの語彙で
  // 突き合わせない（提案が通ったら定義が動く＝順番が逆になる）。
  const isProposal = (path) => path.replace(/\\/g, "/").includes("/docs/proposals/");
  // ディレクトリを渡されたら中の `.md` を全部読む（黙って0枚にしない＝渡した所を
  // 読んでいないのに「食い違っていません」と言うのが、この道具で一番まずい嘘）。
  const given = argv.flatMap((one) => {
    const path = resolve(one);
    if (!existsSync(path)) {
      throw new Error(`${one} がありません（道を確かめてください）。`);
    }
    return statSync(path).isDirectory() ? markdownFiles(path) : [path];
  });
  // **渡されたなら、渡された所だけ**を読む（1枚も無くても既定の docs に落ちない
  // ＝落ちると「渡した所を読んでいないのに、食い違っていませんと言う」になる）。
  const files = (argv.length > 0 ? given : markdownFiles(DOCS)).filter(
    (one) => argv.length > 0 || !isProposal(one),
  );
  if (files.length === 0) {
    throw new Error("読む `.md` がありません（渡した所に `.md` が無い）。");
  }
  const ref = reference();
  const keys = knownKeys(ref);
  const open = openContainers(ref);
  const surface = published();
  const problems = [];
  const skipped = [];
  const counts = {
    whole: 0,
    preamble: 0,
    intent: 0,
    fragment: 0,
    // 断片のうち、**書ける場所まで**見たもの（`context:` の印が在る囲み）。
    placed: 0,
    command: 0,
  };
  // 走らせたコマンドと、走らせなかった理由（黙って飛ばさない）。
  const ran = { count: 0, skipped: new Map() };

  for (const path of files) {
    const text = readFileSync(path, "utf8");
    const where = relative(ROOT, path).replace(/\\/g, "/");
    for (const block of blocks(text)) {
      const at = `${where}:${block.line}`;
      // **囲みの中に囲みを書かない。** 抜き出す側（CI の断片実行・生成器）は行頭で
      // なくても囲みの字で切るので、塊が途中で終わる＝載せたものが走らない
      // （実際に落ちた）。図の囲みは道具に付けさせる（`hatake diagram --fenced`）。
      if (block.body.includes(FENCE)) {
        problems.push(
          `${at}: 囲みの中に囲みの字（${FENCE}）が在ります。行頭でなくても、塊を` +
            `抜き出す側はそこで切るので**載せたものが途中で終わります**。` +
            `図なら \`hatake diagram --fenced\`（道具が囲みを付ける）を使ってください。`,
        );
        continue;
      }
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
        // 場所の印（`yaml context:table`）。書ける場所まで見るための1語。
        const context = /(?:^|\s)context:([A-Za-z][\w.]*)/.exec(block.info)?.[1];
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
          if (context !== undefined) {
            // 丸ごとの定義は `validate` にかけている＝印は要らない（印が2つあると、
            // 弱いほうだけ見て「見た」と言い出す）。
            problems.push(
              `${at}: 丸ごとの定義に context の印は要りません` +
                `（validate にかけています）。`,
            );
          }
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
          const placed = await checkFragment(
            block.body,
            at,
            keys,
            open,
            problems,
            skipped,
            context,
          );
          if (placed) counts.placed += 1;
        }
      } else if (block.lang === "bash") {
        counts.command += checkCommands(block.body, at, surface, problems, ran);
      }
    }
  }

  console.log(
    `手引きを ${files.length} 枚読みました（提案は将来の DSL なので見ていません）` +
      `（定義 ${counts.whole}・前書き ${counts.preamble}・意図 ${counts.intent}・` +
      `断片 ${counts.fragment}（うち書ける場所まで見た ${counts.placed}）・` +
      `コマンド ${counts.command}・` +
      `飛ばした ${skipped.length}）。`,
  );
  for (const one of skipped) console.log(`   飛ばした: ${one}`);
  if (counts.fragment > counts.placed) {
    console.log(
      `   印の無い断片 ${counts.fragment - counts.placed} 個は**キー名だけ**を見ています` +
        "（囲みに context:<ノード> と書けば、その場所に書けるかまで見ます）。",
    );
  }
  console.log(
    `   引く道具を ${ran.count} 回**実際に走らせました**（終了コードだけを見ています）。`,
  );
  for (const [why, count] of [...ran.skipped].sort((a, b) => b[1] - a[1])) {
    console.log(`   走らせなかった: ${count} 回 … ${why}`);
  }
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
