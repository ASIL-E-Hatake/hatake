// 定義を「意味を変えずに短くする」。
//
// AI に書かせた定義は冗長になる（既定値をわざわざ書く・空の配列を置く）。冗長な定義は
// レビューが重くなり、次に AI が読むときのコンテキストも太る。
//
// 安全のために**門を2つ**通す。
//   1. 落とす候補は「スキーマの既定値と同じ値」と「空の配列・空のオブジェクト」だけ。
//      既定値は [DslReference]（スキーマから毎回作る）から引くので、手で書いた表が古く
//      なることがない。必須キーは候補にしない（スキーマ検証に落ちる形にしないため）。
//   2. 1つ落とすたびに**解析後のモデルが1バイトも変わらないこと**を確かめる。変わったら
//      戻す。つまり「既定値だと思っていたものが実は違った」ときは何も起きない。
//
// なぜモデルで見るか: 意味は解析後のモデルが持っている。パーサの既定値がスキーマと
// 食い違っていた場合、この門は**落とすのをやめる**側に倒れる（＝壊さない）。
//
// **落とす所だけを文字列から切る**。Document を作り直して書き戻すと、コメントは残っても
// 折り返しや空白が全部変わって差分が読めなくなる（改行コードも変わる）。最小化の目的は
// レビューを軽くすることなので、出力は「落とした行が消えただけ」でなければ意味がない。
//
// 切ったあとに**もう一度読んでモデルが一致すること**を確かめる。合わなければ何も返さずに
// 落とす（壊れた定義を書き出すより、最小化しないほうが良い）。

import {
  isMap,
  isScalar,
  type Node,
  parseDocument,
  parse as parseYamlText,
  type Pair,
} from "yaml";
import { parseAppMap, parseAppYaml } from "./appParse.js";
import { parsePageMap, parsePageYaml } from "./parse.js";
import { type DslReference } from "./reference.js";
import { type Path, shrink } from "./shrink.js";
import { walkNodes } from "./strictKeys.js";

type Dict = Record<string, unknown>;

/** 落とした指定1つ。 */
export interface Dropped {
  /** 場所（`page.table.columns[0].sortable`）。 */
  where: string;
  key: string;
  /** 落とした値（JSON）。 */
  value: string;
  /** なぜ落とせたか。 */
  why: "既定値と同じ" | "空";
}

export interface MinimizeResult {
  /** 最小化した定義（コメントはそのまま）。 */
  source: string;
  dropped: Dropped[];
  /** 行数（前と後）。短くなったことを1目で見せるため。 */
  lines: { before: number; after: number };
}

/** ドキュメント直下のノードは、strict のキー表では空文字。 */
const DOCUMENT = "";

/**
 * 落としてはいけないキー。
 *
 * `dsl_version` は既定値と同じでも残す。DSL のバージョンは**必ず持つ**のが決めごとで、
 * 「書いていない＝1.0 のつもり」に倒すと、2.0 が出たときに読み方が変わってしまう。
 */
const KEEP = new Set(["dsl_version"]);

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** キーの並び順に依らない JSON（モデルの一致を見るため）。 */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isDict(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** ノードの道 から ノード名。既定値を引くのに、その場所が何のノードかが要る。 */
function nodesByPath(document: Dict): Map<string, string> {
  const found = new Map<string, string>();
  walkNodes(document, ({ node, path }) => found.set(path, node));
  return found;
}

/** ノード名 から キー名 から 既定値（必須キーは入れない）。 */
function defaultsOf(reference: DslReference): Map<string, Map<string, unknown>> {
  const table = new Map<string, Map<string, unknown>>();
  for (const [name, node] of Object.entries(reference.nodes)) {
    const keys = new Map<string, unknown>();
    for (const key of node.keys) {
      if (key.default === undefined || key.required) continue;
      keys.set(key.key, key.default);
    }
    // リファレンスは直下を `document` と呼び、strict のキー表は空文字で呼ぶ。
    table.set(name === "document" ? DOCUMENT : name, keys);
  }
  return table;
}

const isEmpty = (value: unknown): boolean =>
  (Array.isArray(value) && value.length === 0) ||
  (isDict(value) && Object.keys(value).length === 0);

/** 親（そのキーを持つノード）までの道。 */
const parentText = (path: Path): string =>
  path
    .slice(0, -1)
    .map((step) => (typeof step === "number" ? `[${step}]` : `.${step}`))
    .join("")
    .replace(/^\./, "");

/**
 * 定義を最小化する。
 *
 * 書き間違いのある定義は最小化しない（常に strict で読む）。**知らないキーを黙って
 * 落とす道具**になってしまうと、綴り間違いが「短くなった」として消えて、書いたつもりの
 * 指定が無かったことになる。
 */
export function minimizeSource(
  source: string,
  reference: DslReference,
): MinimizeResult {
  // 1周で全部は落ちない。同じ行に並んでいる指定は、切る範囲が重なると片方しか
  // 落とせないので（例: `{ …, sortable: false, roles: [] }`）、落ちなくなるまで回す。
  let current = source;
  const dropped: Dropped[] = [];
  for (let round = 0; round < 4; round++) {
    const pass = onePass(current, reference);
    if (pass.dropped.length === 0) break;
    dropped.push(...pass.dropped);
    current = pass.source;
  }
  return {
    source: current,
    dropped,
    lines: { before: countLines(source), after: countLines(current) },
  };
}

function onePass(source: string, reference: DslReference): MinimizeResult {
  const isApp = /^\s*app\s*:/m.test(source);
  if (isApp) parseAppYaml(source, { strict: true });
  else parsePageYaml(source, { strict: true });

  const raw = parseYamlText(source) as Dict;
  const model = (document: Dict): string =>
    stable(isApp ? parseAppMap(document) : parsePageMap(document));
  const baseline = model(raw);

  const nodes = nodesByPath(raw);
  const defaults = defaultsOf(reference);
  const reasons = new Map<string, Dropped["why"]>();

  const result = shrink(raw, (candidate) => model(candidate) === baseline, {
    pick: ({ node, path, key }) => {
      if (key === undefined || KEEP.has(key)) return false;
      const owner = nodes.get(parentText(path));
      if (owner === undefined) return false; // 未知キーの下（触らない）
      const known = defaults.get(owner);
      if (known === undefined) return false;
      if (isEmpty(node)) {
        reasons.set(path.join(" "), "空");
        return true;
      }
      if (!known.has(key)) return false;
      if (stable(known.get(key)) !== stable(node)) return false;
      reasons.set(path.join(" "), "既定値と同じ");
      return true;
    },
  });

  // 受け入れた削除を、元の文字列から切り出す。後ろから切る（前を切ると位置がずれる）。
  const document = parseDocument(source);
  const cuts: { at: [number, number]; dropped: Dropped }[] = [];
  for (const removal of result.removed) {
    const span = spanOf(document, removal.path, source);
    if (span === null) continue; // 場所を文字列の上で特定できないものは触らない
    cuts.push({
      at: span,
      dropped: {
        where: removal.where,
        key: removal.key ?? "",
        value: JSON.stringify(valueAt(raw, removal.path)),
        why: reasons.get(removal.path.join(" ")) ?? "空",
      },
    });
  }
  // 後ろから切る。範囲が重なるものは飛ばす（次の周回で落ちる）。
  cuts.sort((a, b) => b.at[0] - a.at[0]);
  let minimized = source;
  const applied: Dropped[] = [];
  let limit = source.length;
  for (const cut of cuts) {
    if (cut.at[1] > limit) continue; // 直前に切った範囲と重なっている
    minimized = minimized.slice(0, cut.at[0]) + minimized.slice(cut.at[1]);
    applied.push(cut.dropped);
    limit = cut.at[0];
  }

  // 切った結果が元と同じ意味であること。ここが最後の門で、通らなければ何もしない
  // （壊れた定義を書き出すより、最小化しないほうがいい）。
  if (applied.length > 0 && !same(minimized, model, baseline)) {
    return {
      source,
      dropped: [],
      lines: { before: countLines(source), after: countLines(source) },
    };
  }

  return {
    source: minimized,
    dropped: applied,
    lines: { before: countLines(source), after: countLines(minimized) },
  };
}

/** 切ったあとの文字列が、元と同じモデルに読めるか（読めなければ false）。 */
function same(
  text: string,
  model: (document: Dict) => string,
  baseline: string,
): boolean {
  try {
    return model(parseYamlText(text) as Dict) === baseline;
  } catch {
    return false;
  }
}

/**
 * そのキーが文字列のどこからどこまでか。
 *
 * ブロックなら**行ごと**（前の字下げと後ろの改行まで。同じ行の後ろにコメントが付いて
 * いれば、それはそのキーの説明なので一緒に消す）。フローなら**その場だけ**を切って、
 * 続くカンマ（最後の要素なら前のカンマ）も落とす。
 */
function spanOf(
  document: ReturnType<typeof parseDocument>,
  path: Path,
  source: string,
): [number, number] | null {
  const pair = pairOf(document, path);
  if (pair === null) return null;
  const key = pair.pair.key as Node | null;
  const value = pair.pair.value as Node | null;
  const from = key?.range?.[0];
  const to = value?.range?.[1] ?? key?.range?.[1];
  if (from === undefined || to === undefined) return null;

  const spaceBefore = (at: number): number => {
    let start = at;
    while (start > 0 && /[ \t]/.test(source[start - 1])) start--;
    return start;
  };

  if (pair.flow) {
    let end = to;
    while (end < source.length && /[ \t]/.test(source[end])) end++;
    if (source[end] === ",") {
      end++;
      while (end < source.length && /[ \t]/.test(source[end])) end++;
      // 続きが次の行なら、行末に空白を残さないよう前の空白も一緒に切る。
      return [/^\r?\n/.test(source.slice(end)) ? spaceBefore(from) : from, end];
    }
    // 最後の要素。前のカンマまで戻して切る。
    let start = from;
    while (start > 0 && /[ \t\r\n]/.test(source[start - 1])) start--;
    if (source[start - 1] === ",") return [start - 1, to];
    return [from, to];
  }

  // ブロック。行頭（字下げの先頭）から、行末の改行までを消す。
  const start = spaceBefore(from);
  // 改行の直後でなければ行頭ではない（想定外なので触らない）。CRLF も見る。
  if (start > 0 && !/[\n\r]/.test(source[start - 1])) return null;
  let end = to;
  while (end < source.length && source[end] !== "\n") end++;
  // 後ろに残るのが空白かコメントだけなら行ごと消せる。値らしきものが続くなら触らない。
  if (!/^[ \t\r]*(#.*?)?\r?$/.test(source.slice(to, end))) return null;
  return [start, Math.min(end + 1, source.length)];
}

/** その道にあるキーと値の組（と、フローの中かどうか）。 */
function pairOf(
  document: ReturnType<typeof parseDocument>,
  path: Path,
): { pair: Pair; flow: boolean } | null {
  const parent =
    path.length > 1 ? document.getIn(path.slice(0, -1), true) : document.contents;
  if (!isMap(parent)) return null;
  const name = path[path.length - 1];
  for (const item of parent.items) {
    if (isScalar(item.key) && item.key.value === name) {
      return { pair: item, flow: parent.flow === true };
    }
  }
  return null;
}

const countLines = (text: string): number => text.trimEnd().split("\n").length;

/** 元の定義から、その場所の値を取る（報告に載せるため）。 */
function valueAt(document: Dict, path: Path): unknown {
  let value: unknown = document;
  for (const step of path) {
    if (Array.isArray(value) && typeof step === "number") value = value[step];
    else if (isDict(value) && typeof step === "string") value = value[step];
    else return undefined;
  }
  return value;
}

/** 人が読む形。落としたものを全部並べる（黙って短くしない）。 */
export function renderMinimize(result: MinimizeResult): string {
  if (result.dropped.length === 0) {
    return "落とせる指定はありません（既定値と同じ指定・空の指定は入っていません）。";
  }
  return [
    `${result.dropped.length} 件の指定を落としました（${result.lines.before} 行 から ${result.lines.after} 行）:`,
    ...result.dropped.map((one) => `  ${one.where} = ${one.value}   （${one.why}）`),
    "",
    "※ 解析後のモデルが1バイトも変わらないことを1件ずつ確かめています（変わるものは落としません）。",
  ].join("\n");
}
