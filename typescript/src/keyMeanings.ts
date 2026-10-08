// 意味で引かれる名前の表（spec/key-meanings.json）。
//
// AI はキーの名前を知らないとき、やりたいことの**意味**から名前を推し量って引く。初見試験では
// 「作ったあとは変えられない」を書こうとして immutable / editable / editOnly を引き（0.9.30・
// 0.9.31）、hatake_where にも「作成後に変更不可の項目」を引いて、どれも空振りした（正しいのは
// readOnlyWhen）。綴りの近さでも値でも当たらないので、表で添える。
//
// 添えるのは空振りしたときだけ。空振りした名前のまま黙って当てた答えは返さない（「DSL に無い
// 名前」とは必ず言う＝書いた名前のまま定義に残すと、知らないキーとして黙って捨てられる）。

import type { DslReference } from "./reference.js";
import { closestKey } from "./strictKeys.js";

export interface KeyMeaning {
  id: string;
  /** 推し量られやすい名前と、日本語の言い方。 */
  words: string[];
  /** 本当のキー（reference に在るもの）。 */
  keys: string[];
  /** 何をするキーか。 */
  says: string;
  /** 書き方の1行。 */
  example: string;
}

export interface KeyMeaningTable {
  meanings: KeyMeaning[];
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : [];

export function parseKeyMeanings(raw: unknown): KeyMeaningTable {
  const list = (raw as { meanings?: unknown } | null)?.meanings;
  if (!Array.isArray(list)) return { meanings: [] };
  return {
    meanings: list.map((one: Record<string, unknown>) => ({
      id: String(one.id ?? ""),
      words: strings(one.words),
      keys: strings(one.keys),
      says: String(one.says ?? ""),
      example: String(one.example ?? ""),
    })),
  };
}

/** 大文字小文字・区切り（`_` `-` 空白）を無視して比べる形。 */
const fold = (text: string): string => text.toLowerCase().replace(/[\s_-]+/g, "");

/** 英字だけの言葉か（英字の名前は丸ごと一致、日本語の言い方は含まれていれば当てる）。 */
const isAscii = (text: string): boolean => /^[\x20-\x7e]*$/.test(text);

/**
 * 名前（か言い方）から、意味の近い行を引く。英字の名前は丸ごと一致（`editOnly` ＝ `editonly`）、
 * 日本語は言い方が含まれていれば当てる（「作成後に変更不可の項目」→「変更不可」）。
 */
export function meaningsOf(table: KeyMeaningTable, text: string): KeyMeaning[] {
  const wanted = fold(text);
  if (wanted === "") return [];
  return table.meanings.filter((one) =>
    one.words.some((word) => (isAscii(word) ? fold(word) === wanted : wanted.includes(fold(word)))),
  );
}

/** 意味の近いキーを添える文（空振りの答えの後ろに付ける）。無ければ空。 */
export function meaningHint(found: KeyMeaning[], how: "mcp" | "cli"): string {
  if (found.length === 0) return "";
  const lines = found.map(
    (one) => `${one.keys.join(" / ")}（${one.says} 例: \`${one.example}\`）`,
  );
  const next = how === "mcp" ? `hatake_reference に name: ${found[0].keys[0]}` : `hatake reference ${found[0].keys[0]}`;
  return ` 意味の近いキー: ${lines.join("／")}。${next} で引けます。`;
}

/**
 * reference で引けなかったときの答え。綴りの近い名前（`readonyWhen` → `readOnlyWhen`）と、
 * 意味の近いキー（`immutable` → `readOnlyWhen`）を添える。
 */
export function referenceMiss(
  reference: DslReference,
  name: string,
  table: KeyMeaningTable,
  how: "mcp" | "cli",
): string {
  const spelled = closestKey(name, [...Object.keys(reference.nodes), ...Object.keys(reference.keyIndex)]);
  const hint = meaningHint(meaningsOf(table, name), how);
  if (how === "cli") {
    return `"${name}" はリファレンスにありません${spelled === null ? "" : `（${spelled} の間違い？）`}。${hint}`;
  }
  const near = spelled === null ? "" : ` 綴りの近い名前: ${spelled}。`;
  return `"${name}" は DSL に無い名前です。${near}${hint} キー名の一覧は name を省いて（目次の）keyIndex を見てください。`;
}
