// 既にある配線に、**足りない登録だけ**を足す（`hatake wire --merge`）。
//
// `wire` は下書きを出す道具だが、2回目からは使われない: 画面を1枚増やして再生成すると、
// **手で埋めた中身が全部消える**。だから人は「足りない登録を自分で探して手で足す」に
// 戻り、登録漏れ（＝押しても何も起きないボタン・空の一覧）が現場に残る。
//
// 決めごと4つ。
//
// 1. **足すだけ。消さない・並べ替えない・整形しない。** 手で書いた中身が1バイトも
//    変わらないことが、この道具が使われる条件。要らなくなった登録は言うだけ
//    （消すかどうかは業務の判断。`refs --unused` と同じ立場）。
// 2. **足すものが無ければ、渡されたものと1バイトも同じ**を返す（`--write` しても
//    ファイルの日付だけが変わる、を作らない）。
// 3. **読めない形なら何もしない。** Dart を構文解析する道具ではないので、目印
//    （`HatakeScope(` と `child:`）が無ければ理由を言って落ちる。壊れた Dart を
//    書き出すほうが、何もしないより悪い。
// 4. **手で書き換えてある所は触らない。** 独自の Renderer を使っている配線に
//    `formatters:` を差し込もうとはせず、「ここは手で」と言う。
//
// 名前と形の表は [WIRE_KINDS]（`wire` と同じもの）。別に持つと「出す名前と探す名前が
// 違う」が起きる。

import { collectRefs, type RefKind, refsNeedingRegistration } from "./refs.js";
import { collectionOf } from "./wire.js";
import {
  UNWIRED_REPOSITORY,
  WIRE_KINDS,
  WIRE_SINKS,
  wireStub,
} from "./wireKinds.js";
import { mapEntry, mapLiteral } from "./wireMap.js";

type Dict = Record<string, unknown>;

export interface WireMergeOptions {
  /** REST で組んである配線に足すときの、集合の名前の上書き。 */
  collections?: Record<string, string>;
}

export interface WireMergeResult {
  /** 出す Dart。足すものが無ければ渡されたものと同一。 */
  code: string;
  /** 足した名前（Dart の引数名 → 名前）。 */
  added: Record<string, string[]>;
  /** まるごと足した登録（引数名）。 */
  created: string[];
  /** 定義が要求していないのに書いてある名前。**消さない**（言うだけ）。 */
  leftover: Record<string, string[]>;
  /** 触らなかった所と理由。 */
  untouched: string[];
}

/** 目印が無い＝hatake の配線ではない（か、原形を留めていない）。 */
export class NotWiringError extends Error {
  constructor(what: string) {
    super(
      `${what} が見つからないので、足す場所が決められません。` +
        "hatake wire が出した配線か、`HatakeScope(` と `child:` を持つコードを渡してください" +
        "（Dart を解析する道具ではないので、目印が無いときは何もしません）。",
    );
  }
}

/**
 * 文字列・コメントを飛ばしながら、`open` に対応する閉じ括弧の位置を返す。
 *
 * Dart の文字列には `'${request.filename} を書く'` のように**波括弧が入る**ので、
 * 素朴な数え上げでは閉じ位置を間違える（そして壊れた Dart を書き出す）。
 */
function matchingClose(text: string, open: number): number {
  const pairs: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
  const closer = pairs[text[open]];
  if (closer === undefined) return -1;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      i = endOfString(text, i);
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? text.length : nl;
      continue;
    }
    if (c in pairs) depth++;
    else if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (depth === 0) return c === closer ? i : -1;
    }
  }
  return -1;
}

/** 文字列リテラルの終わり（補間の中の括弧も飛ばす）。 */
function endOfString(text: string, start: number): number {
  const quote = text[start];
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "$" && text[i + 1] === "{") {
      const close = matchingClose(text, i + 1);
      if (close === -1) return text.length;
      i = close;
      continue;
    }
    if (c === quote) return i;
    if (c === "\n") return i - 1; // 閉じ忘れ。行末で切る（無限に進まない）。
  }
  return text.length;
}

/** map の中の**鍵だけ**を拾う（値の中の文字列は数えない）。 */
function keysOf(text: string, open: number, close: number): string[] {
  const found: string[] = [];
  let depth = 0;
  for (let i = open; i < close; i++) {
    const c = text[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? close : nl;
      continue;
    }
    if (c === "{" || c === "(" || c === "[") {
      depth++;
      continue;
    }
    if (c === "}" || c === ")" || c === "]") {
      depth--;
      continue;
    }
    if (c !== "'" && c !== '"') continue;
    const end = endOfString(text, i);
    if (depth === 1) {
      const after = text.slice(end + 1).match(/^\s*:/);
      if (after !== null) found.push(text.slice(i + 1, end));
    }
    i = end;
  }
  return found;
}

/** `<field>:` の位置（行頭から探す＝値の中の同じ名前を拾わない）。 */
function fieldAt(text: string, field: string): number {
  const found = new RegExp(`^[ \\t]*${field}\\s*:`, "m").exec(text);
  return found === null ? -1 : found.index + found[0].indexOf(field);
}

/** その位置の行のインデント。 */
function indentAt(text: string, at: number): string {
  const start = text.lastIndexOf("\n", at) + 1;
  return /^[ \t]*/.exec(text.slice(start, at))?.[0] ?? "";
}

/** `<field>:` の値として最初に出てくる map の範囲。無ければ null。 */
function mapAfter(
  text: string,
  field: number,
): { open: number; close: number } | null {
  const colon = text.indexOf(":", field);
  if (colon === -1) return null;
  const open = text.indexOf("{", colon);
  if (open === -1) return null;
  // 同じ引数の中に在ることの確認: 途中に `;` や次の引数の始まりが無いこと。
  if (/[;]/.test(text.slice(colon, open))) return null;
  const close = matchingClose(text, open);
  return close === -1 ? null : { open, close };
}

/**
 * map の閉じ括弧の直前に、`'name': value,` を差し込む。
 *
 * 行の形（80桁での折り返し）は [mapEntry]＝**出すときと同じ**。既にある行のインデントを
 * 見て合わせるので、手で並べ直した配線にも馴染む。
 */
function insertIntoMap(
  text: string,
  range: { open: number; close: number },
  names: string[],
  entry: (name: string) => string,
): string {
  const closeLineStart = text.lastIndexOf("\n", range.close) + 1;
  // 空の map（`{}`）は1行なので、開いてから足す。
  if (closeLineStart <= range.open) {
    const indent = `${indentAt(text, range.open)}  `;
    const body = names.map((name) => mapEntry(name, entry(name), indent)).join("\n");
    return `${text.slice(0, range.open + 1)}\n${body}\n${indentAt(
      text,
      range.open,
    )}${text.slice(range.close)}`;
  }
  const indent = `${indentAt(text, range.close)}  `;
  const body = names
    .map((name) => `${mapEntry(name, entry(name), indent)}\n`)
    .join("");
  return `${text.slice(0, closeLineStart)}${body}${text.slice(closeLineStart)}`;
}

/** `child:` の行の前に差し込む（HatakeScope の引数として必ず在る目印）。 */
function insertBeforeChild(text: string, lines: string[]): string {
  const child = fieldAt(text, "child");
  if (child === -1) throw new NotWiringError("`child:`");
  const lineStart = text.lastIndexOf("\n", child) + 1;
  const indent = indentAt(text, child);
  const body = lines.map((line) => `${indent}${line}\n`).join("");
  return `${text.slice(0, lineStart)}${body}${text.slice(lineStart)}`;
}

/** [mergeWiring] が1種類ぶんに対してやること。 */
interface MergeSpec {
  /** Dart の引数名。 */
  field: string;
  /** 定義が要求している名前。 */
  wanted: string[];
  /** 1件ぶんの値。 */
  entry: (name: string) => string;
  /** `renderer` は `MaterialRenderer(...)` の中に入れる。 */
  where: "scope" | "renderer";
  /** 無い所に足すときの見出し。 */
  comment: string[];
  /** 引数そのものが無いときに丸ごと作る形。渡さなければ作らない。 */
  block?: (missing: string[]) => string[];
}

/**
 * 既にある配線に、定義が要求している登録のうち**足りない分だけ**を足す。
 *
 * 返す `code` は、足すものが無ければ渡されたものと同一。
 */
export function mergeWiring(
  existing: string,
  document: Dict,
  options: WireMergeOptions = {},
): WireMergeResult {
  if (!existing.includes("HatakeScope(")) throw new NotWiringError("`HatakeScope(`");
  if (fieldAt(existing, "child") === -1) throw new NotWiringError("`child:`");

  const needs = refsNeedingRegistration(collectRefs(document));
  const named = (need: RefKind): string[] => needs[need] ?? [];

  let code = existing;
  const added: Record<string, string[]> = {};
  const created: string[] = [];
  const leftover: Record<string, string[]> = {};
  const untouched: string[] = [];

  /**
   * `renderer: const MaterialRenderer(),` を引数が書ける形に開く。
   *
   * 独自の Renderer を使っているなら**触らない**（差し込むと壊れる）。
   */
  const openRenderer = (): boolean => {
    const at = fieldAt(code, "renderer");
    if (at === -1) {
      untouched.push("renderer: が無いので、見せ方まわりの登録は足していません");
      return false;
    }
    const eol = code.indexOf("\n", at);
    const line = code.slice(at, eol === -1 ? code.length : eol);
    if (/MaterialRenderer\($/.test(line.trim())) return true; // 既に開いている
    if (!/const MaterialRenderer\(\),?$/.test(line.trim())) {
      untouched.push(
        `renderer: は手で書いてあるので触っていません（${line.trim()}）` +
          "＝見せ方まわりの登録はそこに手で足してください",
      );
      return false;
    }
    const indent = indentAt(code, at);
    code = `${code.slice(0, at)}renderer: MaterialRenderer(\n${indent}),${code.slice(
      at + line.length,
    )}`;
    return true;
  };

  /** `MaterialRenderer(...)` の引数として差し込む。 */
  const insertRendererArg = (lines: string[]): boolean => {
    if (!openRenderer()) return false;
    const at = fieldAt(code, "renderer");
    const open = code.indexOf("(", at);
    const close = matchingClose(code, open);
    if (close === -1) return false;
    const lineStart = code.lastIndexOf("\n", close) + 1;
    const indent = `${indentAt(code, at)}  `;
    const body = lines.map((line) => `${indent}${line}\n`).join("");
    code = `${code.slice(0, lineStart)}${body}${code.slice(lineStart)}`;
    return true;
  };

  const merge = (spec: MergeSpec): void => {
    const at = fieldAt(code, spec.field);
    if (at === -1) {
      if (spec.wanted.length === 0 || spec.block === undefined) return;
      const lines = [...spec.comment, ...spec.block(spec.wanted)];
      if (spec.where === "renderer") {
        if (!insertRendererArg(lines)) return;
      } else {
        code = insertBeforeChild(code, lines);
      }
      created.push(spec.field);
      // 丸ごと作ったときも**名前**を残す（引数名だけでは「誰が何を埋めるのか」の
      // 一覧が作れない＝`--todo` が最初の1回で空になる）。
      added[spec.field] = [...spec.wanted];
      return;
    }
    const range = mapAfter(code, at);
    if (range === null) {
      untouched.push(`${spec.field}: は map ではないので触っていません（手で書いた形です）`);
      return;
    }
    const have = keysOf(code, range.open, range.close);
    const extra = have.filter((name) => !spec.wanted.includes(name));
    if (extra.length > 0) leftover[spec.field] = extra;
    const missing = spec.wanted.filter((name) => !have.includes(name));
    if (missing.length === 0) return;
    code = insertIntoMap(code, range, missing, spec.entry);
    added[spec.field] = missing;
  };

  // Repository は形が2つある（REST で組んだ `collections:` と、自分で書く形）。
  const repositories = named("repositories");
  const collection = (name: string): string =>
    `'${options.collections?.[name] ?? collectionOf(name)}'`;
  if (fieldAt(code, "collections") !== -1) {
    // REST で組んである配線。足すのは集合の名前（推測。当たっていなければ直す）。
    merge({
      field: "collections",
      wanted: repositories,
      entry: collection,
      where: "scope",
      comment: [],
    });
  } else {
    merge({
      field: "repositories",
      wanted: repositories,
      entry: (name) => `${UNWIRED_REPOSITORY}('${name}')`,
      where: "scope",
      comment: ["// 定義が名前を挙げた Repository。中身はアプリが書く（5メソッド）。"],
      block: (missing) => [
        `repositories: const RepositoryRegistry(${mapLiteral(
          missing.map(
            (name) =>
              [name, `${UNWIRED_REPOSITORY}('${name}')`] as [string, string],
          ),
          "        ",
        )}),`,
      ],
    });
  }

  for (const kind of WIRE_KINDS) {
    const indent = kind.where === "renderer" ? "          " : "        ";
    merge({
      field: kind.field,
      wanted: named(kind.need),
      entry: (name) => wireStub(kind, name),
      where: kind.where,
      comment: kind.comment,
      block: (missing) => {
        const body = mapLiteral(
          missing.map((name) => [name, wireStub(kind, name)] as [string, string]),
          indent,
        );
        return [
          kind.registry === undefined
            ? `${kind.field}: ${body},`
            : `${kind.field}: ${kind.registry}(${body}),`,
        ];
      },
    });
  }

  // 出す口は関数1つ＝在るか無いかだけ。
  for (const sink of named("sinks")) {
    const spec = WIRE_SINKS[sink];
    if (spec === undefined) continue;
    if (fieldAt(code, sink) !== -1) continue;
    code = insertBeforeChild(code, [...spec.comment, ...spec.body]);
    created.push(sink);
  }

  return { code, added, created, leftover, untouched };
}

/** 何をしたかを人が読む形で。 */
export function renderWireMerge(result: WireMergeResult): string {
  const lines: string[] = [];
  for (const [field, names] of Object.entries(result.added)) {
    const whole = result.created.includes(field) ? "（丸ごと）" : "";
    lines.push(`足した ${field}${whole}: ${names.join(" / ")}`);
  }
  for (const field of result.created) {
    // 名前を持たない登録（出す口）は引数名だけ。
    if (result.added[field] === undefined) lines.push(`足した ${field}（丸ごと）`);
  }
  if (lines.length === 0) lines.push("足すものはありませんでした（1バイトも変えていません）。");
  for (const one of result.untouched) lines.push(`触っていない ${one}`);
  const leftover = Object.entries(result.leftover);
  if (leftover.length > 0) {
    lines.push("");
    lines.push("定義が要求していないのに書いてあるもの（**消していません**）:");
    for (const [field, names] of leftover) {
      lines.push(`  ${field}: ${names.join(" / ")}`);
    }
    lines.push(
      "  ※ 消すかどうかは業務の判断なので触りません（アプリの他の場所から使っている" +
        "こともあります）。`hatake refs --unused` と同じ立場です。",
    );
  }
  if (Object.keys(result.added).length > 0 || result.created.length > 0) {
    lines.push("");
    lines.push(
      "足した所は TODO（UnimplementedError）です。埋めるまでは実行時に落ちます" +
        "＝黙って何もしない、にはなりません。",
    );
  }
  return lines.join("\n");
}
