// 道具の**説明**が、実際の道具と合っているかを機械が見る。
//
// MCP の `description` と `inputSchema` は、人向けのコメントではなく**AI 向けの契約**。
// ところがここがズレても何も落ちない: モデルは宣言されていない引数を渡さないし、渡した
// 引数が黙って捨てられても分からない。**気づけない壊れ方**なので、機械で縛る。
//
// 見るのは4つ。
//   1. 宣言した引数と、`run` が**実際に読む**引数が一致しているか
//      （宣言だけあって読まない引数＝渡しても効かない。読むのに宣言が無い＝誰も渡せない）
//   2. 説明の中に出てくる道具名が実在するか（綴り違いの道具名を勧めると、AI は探しに行く）
//   3. どの道具も、最初に渡す使い方（INSTRUCTIONS）のどこかで名前が出ているか
//      （出てこない道具は「いつ使うか」が無いので、モデルは使わない）
//   4. 引数に説明が付いているか（型だけでは何を渡すか決まらない）
//
// 1 は `run` の中身を読んで確かめる。読み方が追えない形（`args` を丸ごと別の関数に渡す）
// が混ざっていたら、**それも問題として報告する**＝「見たけれど分からなかった」を
// 「問題なし」と混ぜない。

import { type McpTool } from "./mcpTools.js";

/**
 * 道具の説明の中に書ける道具名の形（綴り違いを拾うため、名前の形で探す）。
 *
 * `package:hatake_http` の形は除く。Dart のパッケージ名は道具名と同じ綴りになるので、
 * **説明の中では `package:` を付けて書く**（付いていない `hatake_…` は道具名として扱う）。
 */
const TOOL_WORD = /(?<!package:)\bhatake_[a-z_]+\b/g;

/**
 * `run` が実際に読む引数名。**読み方が追えなければ null**。
 *
 * 追うのは2つの形だけ:
 *   ・`args.source`
 *   ・`str(args, "source")` / `required(args, "source")`（第2引数が名前の呼び出し）
 * これ以外の形（`args` を丸ごと渡す・`args[key]` で引く）が残っていたら、機械には
 * 追えないので null を返す。追えない形を書かない縛りとして使う。
 */
export function argsRead(run: McpTool["run"]): Set<string> | null {
  const body = run.toString();
  const opens = body.indexOf("(");
  const closes = body.indexOf(")");
  if (opens < 0 || closes < opens) return null;
  const param = body.slice(opens + 1, closes).trim();
  if (param === "") return new Set(); // 引数を受けていない＝何も読まない
  if (!/^[A-Za-z_$][\w$]*$/.test(param)) return null; // 分解して受けている
  const keys = new Set<string>();
  let rest = body.slice(closes + 1);
  rest = rest.replace(
    new RegExp(`\\b${param}\\.([A-Za-z_$][\\w$]*)`, "g"),
    (_all, key: string) => {
      keys.add(key);
      return "READ";
    },
  );
  rest = rest.replace(
    new RegExp(`\\b${param}\\s*,\\s*["']([^"']+)["']`, "g"),
    (_all, key: string) => {
      keys.add(key);
      return "READ";
    },
  );
  return new RegExp(`\\b${param}\\b`).test(rest) ? null : keys;
}

/** 宣言した引数（`inputSchema.properties` のキー）。 */
function declared(tool: McpTool): string[] {
  const properties = tool.inputSchema.properties;
  return typeof properties === "object" && properties !== null
    ? Object.keys(properties as Record<string, unknown>)
    : [];
}

const propertyOf = (tool: McpTool, name: string): Record<string, unknown> => {
  const properties = (tool.inputSchema.properties ?? {}) as Record<string, unknown>;
  const found = properties[name];
  return typeof found === "object" && found !== null
    ? (found as Record<string, unknown>)
    : {};
};

/**
 * 説明と実物の食い違いを全部挙げる（空なら合っている）。
 *
 * 1件ずつ「どの道具の何がズレているか」を1行で言う。試験はこれが空であることだけを見る。
 */
export function checkToolContracts(tools: McpTool[], instructions: string): string[] {
  const problems: string[] = [];
  const names = new Set(tools.map((tool) => tool.name));
  const seen = new Set<string>();

  for (const tool of tools) {
    if (!/^hatake_[a-z][a-z_]*$/.test(tool.name)) {
      problems.push(`${tool.name}: 道具の名前は hatake_ で始まる小文字にする。`);
    }
    if (seen.has(tool.name)) problems.push(`${tool.name}: 同じ名前が2つある。`);
    seen.add(tool.name);
    if (tool.title.trim() === "") problems.push(`${tool.name}: title が空。`);
    if (tool.description.trim() === "") {
      problems.push(`${tool.name}: description が空（AI 向けの契約なので必ず書く）。`);
    }
    if (tool.inputSchema.type !== "object") {
      problems.push(`${tool.name}: inputSchema.type は object にする。`);
    }

    // 宣言した引数 ↔ run が読む引数。
    const declaredNames = declared(tool);
    const read = argsRead(tool.run);
    if (read === null) {
      problems.push(
        `${tool.name}: run が引数を読む形が機械から追えない` +
          `（args を丸ごと別の関数に渡していないか）。`,
      );
    } else {
      for (const name of declaredNames) {
        if (!read.has(name)) {
          problems.push(
            `${tool.name}: 引数 "${name}" を宣言しているのに run が読んでいない` +
              `（渡しても黙って捨てられる）。`,
          );
        }
      }
      for (const name of read) {
        if (!declaredNames.includes(name)) {
          problems.push(
            `${tool.name}: run が "${name}" を読んでいるのに宣言が無い（誰も渡せない）。`,
          );
        }
      }
    }

    // 必須の引数は、宣言の中にあること。
    for (const name of (tool.inputSchema.required ?? []) as string[]) {
      if (!declaredNames.includes(name)) {
        problems.push(`${tool.name}: required の "${name}" が properties に無い。`);
      }
    }

    // 引数の説明。何を渡すかは型では決まらない（enum で値が並んでいるものは除く）。
    for (const name of declaredNames) {
      const property = propertyOf(tool, name);
      if (property.description === undefined && property.enum === undefined) {
        problems.push(
          `${tool.name}: 引数 "${name}" に description が無い（何を渡すか型では決まらない）。`,
        );
      }
    }

    // 説明の中の道具名。
    for (const word of tool.description.match(TOOL_WORD) ?? []) {
      if (!names.has(word)) {
        problems.push(`${tool.name}: description の "${word}" という道具は無い。`);
      }
    }
  }

  // 最初に渡す使い方（INSTRUCTIONS）との突き合わせ。
  for (const word of instructions.match(TOOL_WORD) ?? []) {
    if (!names.has(word)) {
      problems.push(`INSTRUCTIONS の "${word}" という道具は無い。`);
    }
  }
  for (const tool of tools) {
    if (!instructions.includes(tool.name)) {
      problems.push(
        `${tool.name}: INSTRUCTIONS に出てこない` +
          `（いつ使うかが書かれていない道具は使われない）。`,
      );
    }
  }
  return problems;
}
