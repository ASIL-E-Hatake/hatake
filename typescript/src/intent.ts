// 「人が言ったこと」を機械可読な1枚にする（意図＝intent）。
//
// 定義から出せるものは全部出せるようになった（`explain` / `openapi` / `fixtures`）。
// けれど**言ったこと**は定義から出てこない ── 意図・理由・決めた人・そして
// **決まっていないこと**は、定義のどこにも書いていないから。
//
// だから設計書を「コードから生成」しても、言った言ってないは消えない。消せるのは
// **要求と定義の対応**を機械が突き合わせられるようにしたときだけ:
//
//   ・言ったのに入っていない（要求が指す相手が定義に無い）
//   ・**言っていないのに入っている**（どの要求からも来ていない項目・ボタン）
//   ・未定と言ったのに決まっている
//
// 決めごと:
//
// * **原文を要約しない。** `text` は人が言ったまま置く（要約すると読んだ側の解釈が
//   混ざる＝言った言ってないの原因そのもの）
// * **「決まっていない」を第一級で持つ**（`undecided`）。空欄と区別できないと、AI が
//   埋めたのか人が決めたのか後から分からない
// * **要求を定義から生成してはいけない。** 生成すれば必ず一致するので、突き合わせが
//   無意味になる（`--draft` で AI が起こす下書きは `source: ai-draft` と印を付け、
//   人が見たときに `confirmed` にする）
// * 機械が言えるのは**対応の有無**だけ。「意図どおりか」は人が読む（[traceIntent]）

import { parse as parseYamlText } from "yaml";

import { closestKey } from "./strictKeys.js";

/** この形式の版（定義の `dsl_version` と同じ考えで、後方互換のために持つ）。 */
export const INTENT_VERSION = "1.0";

/**
 * 要求が「定義のどこに落ちたか」を指す言葉。**閉じた集合**。
 *
 * 項目に付いた検証（`required` / `maxLength`）と、明細の行の項目は、その項目
 * （`field:<項目>`）の一部として数える。分けると1つの要求に3つ書くことになり、
 * 誰も書かなくなる。
 */
export const TARGET_KINDS = [
  "page",
  "field",
  "filter",
  "column",
  "action",
  "card",
  "repository",
  "role",
] as const;

export type TargetKind = (typeof TARGET_KINDS)[number];

/** 要求・決めごと・未決の1件。 */
export interface IntentItem {
  id: string;
  /** 人が言った文。**そのまま**（要約しない）。 */
  text: string;
  /** 定義のどこに落ちたか（`field:orderNo` の形）。 */
  covers: string[];
  /** なぜそう決めたか（決めごとに書く。理由の無い決めごとは後から誰も直せない）。 */
  why?: string;
  /** 誰が言ったか。 */
  by?: string;
  /**
   * いつ言ったか（ISO の日付。`"2026-09-08"` と**引用符付き**で書く）。
   *
   * キーが `on` ではないのは、YAML 1.1 で読む実装（PyYAML など）が `on:` を
   * **真偽値のキー**にしてしまうため（`yes` / `no` / `off` も同じ）。3版と
   * スキーマ検査の全部が同じ字を読めることのほうが、短い名前より大事。
   */
  at?: string;
  /** `human`（人が書いた）か `ai-draft`（AI が読み取った下書き）。 */
  source: "human" | "ai-draft";
  /** 下書きを人が確かめたか。`human` は最初から true。 */
  confirmed: boolean;
}

export interface IntentDocument {
  version: string;
  /** どの画面の話か（`app:` の中の1枚でもよい）。 */
  page?: string;
  asked: IntentItem[];
  decisions: IntentItem[];
  undecided: IntentItem[];
  /** 終わりの判定（人が読む・回す）。 */
  acceptance: string[];
}

export class IntentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntentParseError";
  }
}

const TOP_KEYS = [
  "$comment",
  "intent_version",
  "page",
  "asked",
  "decisions",
  "undecided",
  "acceptance",
];

const ITEM_KEYS = [
  "id",
  "text",
  "covers",
  "why",
  "by",
  "at",
  "source",
  "confirmed",
];

const isDict = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 知らないキーは黙って捨てない（捨てると「書いたのに効いていない」が起きる）。 */
function checkKeys(node: Record<string, unknown>, known: string[], at: string) {
  for (const key of Object.keys(node)) {
    if (known.includes(key)) continue;
    const near = closestKey(key, known);
    throw new IntentParseError(
      `${at} に知らないキー "${key}" があります` +
        (near === null ? "" : `（"${near}" の間違いでは？）`) +
        `。書けるのは ${known.join(" / ")} です。`,
    );
  }
}

/** `field:orderNo` を読む。種類が閉じた集合に無ければ落とす。 */
export function parseTarget(
  target: string,
  at: string,
): { kind: TargetKind; name: string } {
  const at_ = target.indexOf(":");
  const kind = at_ < 0 ? "" : target.slice(0, at_);
  const name = at_ < 0 ? "" : target.slice(at_ + 1);
  if (!(TARGET_KINDS as readonly string[]).includes(kind) || name === "") {
    throw new IntentParseError(
      `${at} の covers "${target}" が読めません。` +
        `「<種類>:<名前>」の形で、種類は ${TARGET_KINDS.join(" / ")} です。`,
    );
  }
  return { kind: kind as TargetKind, name };
}

function parseItem(
  raw: unknown,
  at: string,
  seen: Set<string>,
): IntentItem {
  if (!isDict(raw)) {
    throw new IntentParseError(`${at} は「id と text を持つもの」で書いてください。`);
  }
  checkKeys(raw, ITEM_KEYS, at);
  const id = raw.id;
  const text = raw.text;
  if (typeof id !== "string" || id === "") {
    throw new IntentParseError(`${at} に id がありません（R1 のような短い名前）。`);
  }
  if (typeof text !== "string" || text === "") {
    throw new IntentParseError(
      `${at}（${id}）に text がありません。**人が言ったまま**書いてください。`,
    );
  }
  if (seen.has(id)) {
    throw new IntentParseError(
      `id "${id}" が2回出てきます（PR や報告で指すものなので、重複させない）。`,
    );
  }
  seen.add(id);

  const covers: string[] = [];
  for (const one of Array.isArray(raw.covers) ? raw.covers : []) {
    if (typeof one !== "string") {
      throw new IntentParseError(`${id} の covers は文字列で書いてください。`);
    }
    parseTarget(one, id);
    covers.push(one);
  }
  if (raw.covers !== undefined && !Array.isArray(raw.covers)) {
    throw new IntentParseError(`${id} の covers は配列で書いてください。`);
  }

  const source = raw.source ?? "human";
  if (source !== "human" && source !== "ai-draft") {
    throw new IntentParseError(
      `${id} の source は human か ai-draft です（既定は human）。`,
    );
  }
  if (raw.confirmed !== undefined && typeof raw.confirmed !== "boolean") {
    throw new IntentParseError(`${id} の confirmed は true / false です。`);
  }

  return {
    id,
    text,
    covers,
    ...(typeof raw.why === "string" ? { why: raw.why } : {}),
    ...(typeof raw.by === "string" ? { by: raw.by } : {}),
    ...(raw.at === undefined ? {} : { at: String(raw.at) }),
    source,
    // 人が書いたものは最初から確かめ済み。下書きは明示されるまで未確認。
    confirmed:
      typeof raw.confirmed === "boolean"
        ? raw.confirmed
        : source === "human",
  };
}

function parseList(
  raw: unknown,
  name: string,
  seen: Set<string>,
): IntentItem[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new IntentParseError(`${name} は配列で書いてください。`);
  }
  return raw.map((one, index) => parseItem(one, `${name}[${index}]`, seen));
}

/**
 * 意図の1枚を読む（YAML / JSON）。**知らないキーは弾く**。
 *
 * 版が違うものは読まない（黙って読むと、新しい欄を無視した結果を「突き合わせ済み」と
 * 言ってしまう）。
 */
export function parseIntent(source: string): IntentDocument {
  const document: unknown = parseYamlText(source);
  if (!isDict(document)) {
    throw new IntentParseError("意図の文書が読めません（マップで書いてください）。");
  }
  checkKeys(document, TOP_KEYS, "文書の一番外");

  const version = document.intent_version;
  if (version !== undefined && String(version) !== INTENT_VERSION) {
    throw new IntentParseError(
      `intent_version "${String(version)}" は読めません（この道具は ${INTENT_VERSION}）。`,
    );
  }

  const acceptance: string[] = [];
  if (document.acceptance !== undefined) {
    if (!Array.isArray(document.acceptance)) {
      throw new IntentParseError("acceptance は配列で書いてください。");
    }
    for (const one of document.acceptance) {
      if (typeof one !== "string") {
        throw new IntentParseError(
          "acceptance は「終わりの判定」を1行ずつ、文字列で書いてください。",
        );
      }
      acceptance.push(one);
    }
  }

  const seen = new Set<string>();
  return {
    version: INTENT_VERSION,
    ...(typeof document.page === "string" ? { page: document.page } : {}),
    asked: parseList(document.asked, "asked", seen),
    decisions: parseList(document.decisions, "decisions", seen),
    undecided: parseList(document.undecided, "undecided", seen),
    acceptance,
  };
}

/** 要求と決めごと（＝定義に落ちているべきもの）。未決はここに入らない。 */
export const requirementsOf = (intent: IntentDocument): IntentItem[] => [
  ...intent.asked,
  ...intent.decisions,
];
