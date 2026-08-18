// 転んだ定義から「最小の再現」を作る。
//
// [harvestFailures] が出す候補には、人が書く欄が残る。そのうち**いちばん手間なのが最小の
// 再現づくり**（当たった定義から要らない所を削って、その診断だけが出る形にする）。削るのは
// 機械のほうが速いので、下書きまでは機械が作る。
//
// 守るもの（[keep]）は「意味」ではなく**診断**。目当ての診断が出続けていて、かつ**新しい
// 診断が出ていない**限り削る。減るのは歓迎（他の間違いが混ざっていない形になる）。
//
// 削り終わってから匿名化する（先に匿名化すると、ラベルに依る診断があったときに嘘の再現に
// なる）。置き換えるのは自由文（`label` / `title` / `description`）だけ。**識別子は残す**
// ので、客先の語彙が id や項目名に入っている場合は人が書き換える必要がある。候補の
// `todo` にそう書いてある。
//
// 出力は定義の本文なので、`harvest` では**既定で作らない**（`--repro`）。「定義そのものは
// 持ち出さない」が既定であることは変えない。

import { stringify as stringifyYaml } from "yaml";
import { parseAppMap } from "./appParse.js";
import { parsePageMap } from "./parse.js";
import { shrink } from "./shrink.js";
import { findUnknownKeys } from "./strictKeys.js";
import { findWarnings } from "./warnings.js";
import { type DefinitionRegistry } from "./refs.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** その定義で出ている診断の名前（警告の規則名と未知キー名）。 */
export function diagnosesOf(
  document: Dict,
  registry?: DefinitionRegistry,
): Set<string> {
  return new Set([
    ...findWarnings(document, { registry }).map((warning) => warning.rule),
    ...findUnknownKeys(document).map((unknown) => unknown.key),
  ]);
}

/** 構造として読めるか（読めない形まで削ってしまわないための門）。 */
function readable(document: Dict): boolean {
  try {
    // strict では読まない。未知キーの再現は strict では読めないのが**正しい**ので。
    if (isDict(document.app)) parseAppMap(document);
    else parsePageMap(document);
    return true;
  } catch {
    return false;
  }
}

/** 自由文のキー。ここだけ記号に置き換える。 */
const FREE_TEXT = new Set(["label", "title", "description"]);

/**
 * 自由文を記号に置き換える。同じ文字列は同じ記号にする（対応が読める形を保つ）。
 *
 * `title` は画面名にも枠名にも使われるので、区別せず通し番号にしている。ここで凝るより、
 * 人が最後に書き換えるほうが速い。
 */
export function anonymize<T>(document: T): T {
  const seen = new Map<string, string>();
  const rename = (value: string): string => {
    const known = seen.get(value);
    if (known !== undefined) return known;
    const name = `名前${seen.size + 1}`;
    seen.set(value, name);
    return name;
  };
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!isDict(value)) return value;
    const out: Dict = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] =
        FREE_TEXT.has(key) && typeof child === "string"
          ? rename(child)
          : walk(child);
    }
    return out;
  };
  return walk(structuredClone(document)) as T;
}

export interface Repro {
  /** 最小の再現（YAML の行。`failures.json` の `wrote` と同じ形）。 */
  wrote: string[];
  /** 元の定義から削った箇所の数。 */
  removed: number;
  /** 削ったあとに出ている診断（目当てのものだけになっているか確かめる用）。 */
  diagnoses: string[];
}

/**
 * [target] の診断が出続ける最小形を作る。
 *
 * 目当ての診断が最初から出ていない定義を渡されたら null（呼び違いなので黙って何か返さない）。
 */
export function reproOf(
  document: Dict,
  target: string,
  options: { registry?: DefinitionRegistry; anonymize?: boolean } = {},
): Repro | null {
  const before = diagnosesOf(document, options.registry);
  if (!before.has(target)) return null;

  const keep = (candidate: Dict): boolean => {
    if (!readable(candidate)) return false;
    const now = diagnosesOf(candidate, options.registry);
    if (!now.has(target)) return false;
    // 新しい診断が出たら、それは別の転び方を混ぜたということ。
    for (const name of now) if (!before.has(name)) return false;
    return true;
  };

  const shrunk = shrink(document, keep);
  const scrubbed =
    options.anonymize === false ? shrunk.document : anonymize(shrunk.document);
  // 出す形は `failures.json` と同じ「行の配列」。lineWidth 0 = 折り返さない。
  const yaml = stringifyYaml(scrubbed, { lineWidth: 0 }).trimEnd();
  return {
    wrote: yaml.split("\n"),
    removed: shrunk.removed.length,
    diagnoses: [...diagnosesOf(scrubbed, options.registry)].sort(),
  };
}
