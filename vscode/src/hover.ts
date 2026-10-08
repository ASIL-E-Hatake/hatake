// カーソルの下のキー（または値）を `reference` で引いて、説明にする。
//
// VS Code に依らない純関数（試験から直に呼ぶ）。引く口は MCP の hatake_reference と同じ
// （呼ぶ側が道具の答えを渡す）。キーでも値でも引ける（0.9.30〜: `maxLength` → validator.type）。

import { isMap, isScalar, isSeq, parseDocument, type Node } from "yaml";

/** カーソル（文字の位置）の下にある、キーか値の字。無ければ undefined。 */
export function wordAt(source: string, offset: number): string | undefined {
  const document = parseDocument(source);
  let hit: string | undefined;
  const visit = (node: unknown): void => {
    if (isMap(node)) {
      for (const pair of node.items) {
        const key = pair.key as Node | undefined;
        const range = key?.range;
        if (isScalar(key) && range != null && offset >= range[0] && offset <= range[1]) hit = String(key.value);
        visit(pair.value);
      }
    } else if (isSeq(node)) {
      for (const item of node.items) visit(item);
    } else if (isScalar(node) && node.range != null && typeof node.value === "string") {
      const range = node.range;
      if (offset >= range[0] && offset <= range[1]) hit = node.value;
    }
  };
  visit(document.contents);
  return hit;
}

interface Lookup {
  name: string;
  node?: { name: string; description?: string };
  pageKind?: { type: string; description?: string };
  keys?: { node: string; key: { key: string; type: string; default?: unknown; values?: string[]; open?: boolean; description?: string } }[];
  values?: { node: string; key: string; open: boolean }[];
}

/** reference の答え（JSON）を、説明の Markdown にする。 */
export function hoverMarkdown(lookup: Lookup): string {
  const lines: string[] = [];
  for (const one of lookup.keys ?? []) {
    const k = one.key;
    lines.push(`**${k.key}**（${one.node} のキー）: \`${k.type}\``);
    if (k.default !== undefined) lines.push(`既定: \`${JSON.stringify(k.default)}\``);
    if (k.values !== undefined && k.values.length > 0) {
      lines.push(`取れる値${k.open ? "（組み込みの一覧・プラグインで足せる）" : ""}: ${k.values.map((v) => `\`${v}\``).join(" / ")}`);
    }
    if (k.description !== undefined) lines.push(k.description);
    lines.push("");
  }
  for (const one of lookup.values ?? []) {
    lines.push(`**${lookup.name}** は \`${one.node}.${one.key}\` に書く値${one.open ? "（組み込みの一覧・プラグインで足せる）" : ""}`);
  }
  if (lookup.pageKind !== undefined) lines.push(`**${lookup.pageKind.type}**（ページ種別）${lookup.pageKind.description ? `: ${lookup.pageKind.description}` : ""}`);
  if (lookup.node !== undefined && lookup.keys === undefined) lines.push(`**${lookup.node.name}**（ノード）${lookup.node.description ? `: ${lookup.node.description}` : ""}`);
  return lines.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
