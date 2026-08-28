// アプリ側が「登録済みのもの」の一覧を、実装のソースから作る。
//
// [collectRefs] が定義の側から「何が要るか」を出すのに対して、こちらは実装の側から
// 「何が在るか」を出す。突き合わせれば、名前の食い違いが機械で分かる。
//
// **言語のパーサは持たない。** 見るのは「登録している所に、その場で書いてある文字列」
// だけ。変数や関数から組み立てている登録は**読めない**ので、黙って落とさずに
// [RegistryScan.unreadable] に出す。読めなかったものを黙って落とすと、
// 「登録してあるのに未登録と言われる」嘘の警告になり、仕組みごと信用されなくなる。
//
// 対応する書き方:
//   Dart / TypeScript … `XxxRegistry({ 'name': … })` と 名前付き引数 `fieldBuilders: { … }`
//   Java              … `new XxxRegistry(Map.of("name", …))` / `Map.ofEntries(Map.entry(…))`

import { type DefinitionRegistry, type RefKind } from "./refs.js";
import { UNWIRED_REPOSITORY } from "./wireKinds.js";

/**
 * 「まだ埋めていない」の目印。
 *
 * `wire` が足す TODO は `throw UnimplementedError('名前: 何をするか')` なので、それが
 * 残っているかどうかは**その場で読める**。手書きの空実装まで見つけようとすると
 * （空の関数・null を返すだけ）業務として正しいものまで「埋めていない」と言うことに
 * なるので、**道具が書いた目印と、3言語の定番**だけを見る。
 */
const NOT_FILLED = new RegExp(
  [
    "UnimplementedError",
    "UnsupportedOperationException",
    "NotImplementedError",
    "TODO[(]",
    // Repository だけは値がクラスなので、目印がクラス名になる。
    UNWIRED_REPOSITORY,
  ].join("|"),
);

/** その値が「まだ埋めていない」と読めるか。 */
export const looksUnfilled = (value: string): boolean => NOT_FILLED.test(value);

/** 読み取れた登録1箇所。 */
export interface RegistrationSite {
  kind: RefKind;
  file: string;
  /** 1 始まりの行番号。 */
  line: number;
  /**
   * その登録が終わる行（1 始まり・その行を含む）。
   *
   * **名前が「登録の中」に書かれているのか「コードの中で使われている」のかを分ける**
   * のに使う（`refs --unused` が、定義から使われていない登録を消してよいか判断する）。
   */
  endLine: number;
  /** その場で読み取れた名前（宣言順）。 */
  names: string[];
  /**
   * 名前は在るが、中身が**まだ埋まっていない**もの（`names` の部分集合）。
   *
   * 登録が在ることと動くことは別。`wire --merge` が足した直後は全部ここに入る。
   */
  pending: string[];
}

/** 読み取れなかった登録1箇所。 */
export interface UnreadableRegistration {
  kind: RefKind;
  file: string;
  line: number;
  /** なぜ読めないか（そのまま人に見せる）。 */
  reason: string;
}

export interface RegistryScan {
  /** 読み取れた名前だけを種類ごとにまとめたもの（重複なし・名前順）。 */
  registry: DefinitionRegistry;
  sites: RegistrationSite[];
  /** ここが空でなければ、[registry] は**不完全**。 */
  unreadable: UnreadableRegistration[];
}

/** 走査するソース1つ。 */
export interface SourceFile {
  path: string;
  source: string;
}

/**
 * 登録の書き方。`call` が呼び出しの名前、`named` なら名前付き引数。
 *
 * 名前は3言語で揃えてあるので、1つの表で足りる（Java の `Aggregates` だけ別名）。
 */
const REGISTRATIONS: { kind: RefKind; name: string; named?: boolean }[] = [
  { kind: "repositories", name: "RepositoryRegistry" },
  // REST で組んだ形（`restRepositories(collections: {'orderRepository': 'orders'})`）。
  // ここを読まないと、`wire --base` で組んだ配線は**全部「言えない」**になる
  // （`restRepositories(…)` は関数呼び出しなので読めない）。名前は collections の
  // キーに書いてあるので、そこは読める。
  { kind: "repositories", name: "collections", named: true },
  { kind: "plugins", name: "ActionRegistry" },
  { kind: "validators", name: "ValidatorRegistry" },
  { kind: "formatters", name: "FormatterRegistry" },
  { kind: "converters", name: "ConverterRegistry" },
  { kind: "computedOps", name: "ComputedRegistry" },
  { kind: "aggregates", name: "AggregateRegistry" },
  { kind: "aggregates", name: "Aggregates" }, // Java 版の名前
  { kind: "fieldTypes", name: "fieldBuilders", named: true },
  { kind: "dashboardItemTypes", name: "dashboardItemBuilders", named: true },
];

/**
 * 名前の**集まり**をその場で読むもの（役割の語彙）。
 *
 * ほかの登録が「名前 → 実装」の対応表なのに対して、これは名前だけが並ぶ
 * （`knownRoles: {'staff', 'manager'}`）。読む相手を `roles:`（いま見ている人の役割）に
 * しないのが要点で、あれは**その時のログイン状態**なので、突き合わせに使うと
 * 「staff で動かしたら manager はアプリに無い」と言い出す。
 */
const NAME_SET_REGISTRATIONS: { kind: RefKind; name: string }[] = [
  { kind: "roles", name: "knownRoles" },
];

/**
 * 「書いてあれば在る」だけの登録。
 *
 * 出力先（sink）は名前と値の対応表ではなく**関数を1つ渡す**書き方なので、
 * `HatakeScope(exportSink: (request) async { … })` のように名前付き引数が
 * 在るかどうかだけが問題になる。中身は読まない（読む必要が無い）。
 */
const PRESENCE_REGISTRATIONS: { kind: RefKind; name: string }[] = [
  { kind: "sinks", name: "exportSink" },
  { kind: "sinks", name: "printSink" },
];

/** 走査できるソースの拡張子。 */
export const SCANNABLE_EXTENSIONS = [".dart", ".ts", ".tsx", ".java", ".kt"];

export function scanRegistrations(files: SourceFile[]): RegistryScan {
  const sites: RegistrationSite[] = [];
  const unreadable: UnreadableRegistration[] = [];

  for (const file of files) {
    // コメントは先に消す。消さないと**コメントアウトした登録**を「登録済み」と
    // 数えてしまい、一覧が嘘になる。
    const source = stripComments(file.source);
    for (const registration of REGISTRATIONS) {
      for (const at of findCalls(source, registration.name, registration.named)) {
        const line = lineOf(source, at.start);
        const read = readNames(
          source,
          at.argsFrom,
          registration.named === true,
          registration.name,
        );
        if (read.skip === true) continue;
        // 引数なし・空の登録は「何も足していない」だけで、「アプリには何も無い」の
        // 証拠にはならない（別の場所で登録しているかもしれない）。見なかったことに
        // する＝その種類は突き合わせの対象にならない（嘘の警告を出さない側に倒す）。
        if (read.reason === undefined && read.names.length === 0) continue;
        if (read.reason !== undefined) {
          unreadable.push({
            kind: registration.kind,
            file: file.path,
            line,
            reason: read.reason,
          });
          continue;
        }
        sites.push({
          kind: registration.kind,
          file: file.path,
          line,
          endLine: lineOf(source, endOf(source, at.argsFrom, registration.named === true)),
          names: read.names,
          pending: read.pending ?? [],
        });
      }
    }
    for (const registration of NAME_SET_REGISTRATIONS) {
      for (const at of findCalls(source, registration.name, true)) {
        const line = lineOf(source, at.start);
        const read = readNameSet(source, at.argsFrom, registration.name);
        if (read.skip === true) continue;
        if (read.reason === undefined && read.names.length === 0) continue;
        if (read.reason !== undefined) {
          unreadable.push({
            kind: registration.kind,
            file: file.path,
            line,
            reason: read.reason,
          });
          continue;
        }
        sites.push({
          kind: registration.kind,
          file: file.path,
          line,
          endLine: lineOf(source, endOf(source, at.argsFrom, true)),
          names: read.names,
          pending: [],
        });
      }
    }
    for (const registration of PRESENCE_REGISTRATIONS) {
      for (const at of findCalls(source, registration.name, true)) {
        // 出す口は名前と値の対応表ではなく関数1つ。値は次の一番外側のカンマまで。
        const end = endOf(source, at.argsFrom, true);
        const value = source.slice(at.argsFrom, end + 1);
        sites.push({
          kind: registration.kind,
          file: file.path,
          line: lineOf(source, at.start),
          endLine: lineOf(source, end),
          names: [registration.name],
          pending: looksUnfilled(value) ? [registration.name] : [],
        });
      }
    }
  }

  const registry: DefinitionRegistry = {};
  for (const site of sites) {
    const names = new Set([...(registry[site.kind] ?? []), ...site.names]);
    registry[site.kind] = [...names].sort();
  }
  return { registry, sites, unreadable };
}

/** 見つけた呼び出し1つ（`start` は名前の位置、`argsFrom` は中身の開始位置）。 */
interface CallSite {
  start: number;
  argsFrom: number;
}

/**
 * `Name(` / `name:` を探す。
 *
 * 前が英数字・`.`・`$` なら別物（`RepositoryRegistry.empty(` や `myFieldBuilders:`）。
 */
function findCalls(
  source: string,
  name: string,
  named: boolean | undefined,
): CallSite[] {
  const found: CallSite[] = [];
  const opener = named === true ? ":" : "(";
  let from = 0;
  for (;;) {
    const at = source.indexOf(name, from);
    if (at < 0) return found;
    from = at + name.length;
    const before = at === 0 ? "" : source[at - 1];
    if (/[A-Za-z0-9_$.]/.test(before)) continue;
    const after = skipSpace(source, at + name.length);
    if (source[after] !== opener) continue;
    found.push({ start: at, argsFrom: after + 1 });
  }
}

const skipSpace = (source: string, at: number): number => {
  let i = at;
  while (i < source.length && /\s/.test(source[i])) i++;
  return i;
};

const lineOf = (source: string, at: number): number =>
  source.slice(0, at).split("\n").length;

/**
 * その登録が終わる位置。
 *
 * 名前付き引数（`fieldBuilders: { … }` / `collections: { … }`）は**引数リストではない**
 * ので、閉じ括弧を探す起点が違う。ここを間違えると終わりがファイル末尾まで伸びて、
 * 「登録の外に残っている TODO」も「コードの中で使われている名前」も全部
 * **登録の中**に見えてしまう（数えるものが静かに 0 件になる）。
 */
function endOf(source: string, argsFrom: number, named: boolean): number {
  if (!named) return close(source, argsFrom - 1);
  let at = skipSpace(source, argsFrom);
  // Dart の型引数つき map リテラル（`<String, X>{ … }`）。
  if (source[at] === "<") at = skipSpace(source, close(source, at) + 1);
  if (source[at] === "{" || source[at] === "(" || source[at] === "[") {
    return close(source, at);
  }
  // 値が式のとき（出す口の `(request) async => …`）は、一番外側のカンマまで。
  const comma = topLevelIndexOf(source.slice(argsFrom), ",");
  return comma < 0 ? source.length - 1 : argsFrom + comma;
}

/** 読み取り結果。`reason` があれば読めなかった。 */
interface ReadResult {
  names: string[];
  /** 中身が「まだ埋めていない」と読める名前。 */
  pending?: string[];
  reason?: string;
  /** 登録ではなく素通し（`fieldBuilders: fieldBuilders`）なので、無かったことにする。 */
  skip?: boolean;
}

/**
 * 登録の中身から名前を読む。
 *
 * `named` のときは引数リストではなく値そのものが来る（`fieldBuilders: { … }`）。
 */
function readNames(
  source: string,
  from: number,
  named: boolean,
  name: string,
): ReadResult {
  const at = skipSpace(source, from);

  // `fieldBuilders: fieldBuilders` / `fieldBuilders: widget.fieldBuilders` は
  // 受け取ったものを渡しているだけ（Renderer の中でよく出る）。登録箇所ではないので、
  // 読めない扱いにもしない。
  if (named && new RegExp(`${SELF_PASS.source}${name}\\b`).test(source.slice(at))) {
    return { names: [], skip: true };
  }

  // 呼び出しではなく**宣言**（コンストラクタの仮引数）なら登録ではない。これを見ないと、
  // フレームワーク自身のソースを走査したときに全部「読めない」になってしまう。
  if (!named && looksLikeDeclaration(source, from)) return { names: [], skip: true };

  // Dart の `<String, X>{ … }`（型引数つきの map リテラル）。
  const start = source[at] === "<" ? skipSpace(source, close(source, at) + 1) : at;

  // `new ValidatorRegistry(null, messages)` のように「独自のものは無い」と明示して
  // いる形。引数なしと同じで、その種類について何も言っていない。
  if (/^null\s*[,)]/.test(source.slice(start))) return { names: [] };

  if (source[start] === "{") return readMapLiteral(source, start);
  if (named) {
    return {
      names: [],
      reason: "値が map リテラルではありません（変数や関数の戻り値は読めません）",
    };
  }
  const java = findJavaMapCall(source, start);
  if (java !== null) {
    return java.name === "of"
      ? readJavaMapOf(source, java.args)
      : readJavaEntries(source, java.args);
  }
  if (source[start] === ")") return { names: [] }; // 引数なし＝組み込みだけ
  return {
    names: [],
    reason: "引数が map リテラルではありません（変数や関数の戻り値は読めません）",
  };
}

/**
 * 名前だけが並ぶ値を読む（`{'a', 'b'}` / `['a', 'b']` / `Set.of("a", "b")`）。
 *
 * **同じファイルの中の変数なら1回だけ辿る**（`static const _roles = {…};` に書いて
 * `knownRoles: _roles` と渡すのが Dart では普通の形）。それ以上は辿らない＝辿るほど
 * 「読めたつもりで違うものを読む」危険が増えるので、読めないなら読めないと言う。
 */
function readNameSet(source: string, from: number, name: string): ReadResult {
  const at = skipSpace(source, from);
  if (new RegExp(`${SELF_PASS.source}${name}\\b`).test(source.slice(at))) {
    return { names: [], skip: true }; // 受け取ったものを渡しているだけ
  }
  return readCollection(source, at, true);
}

/** 集まりの中身を読む。[hop] のときだけ、同じファイルの変数を1回辿る。 */
function readCollection(source: string, from: number, hop: boolean): ReadResult {
  let at = skipSpace(source, from);
  // Dart / Java の飾り（`const {…}` / `<String>{…}` / `new HashSet<>(…)`）。
  for (const word of ["const", "final", "new"]) {
    if (new RegExp(`^${word}\\b`).test(source.slice(at))) {
      at = skipSpace(source, at + word.length);
    }
  }
  if (source[at] === "<") at = skipSpace(source, close(source, at) + 1);
  if (source[at] === "{" || source[at] === "[" || source[at] === "(") {
    return readStrings(source, at);
  }
  // 集まりを作る呼び出しだけ読む（`Set.of("a")` / `new Set([…])`）。**それ以外の
  // 呼び出しは読めない**＝`session.allRoles()` を空の集まりとして読むと、「アプリは
  // 役割を1つも配っていない」という嘘になる。
  const call = /^([A-Za-z_$][\w$.]*)\s*(?:<[^>]*>)?\s*\(/.exec(source.slice(at));
  if (call !== null && COLLECTION_CALLS.test(call[1])) {
    const open = at + call[0].length - 1;
    // `new Set(['a'])` は括弧の中がさらに配列。中の1つだけを見る。
    const inner = splitTop(source, open);
    if (inner.length === 1 && /^\s*[[{]/.test(inner[0])) {
      return readCollection(source, at + call[0].length, false);
    }
    return readStrings(source, open);
  }
  const word = /^[A-Za-z_$][\w$]*/.exec(source.slice(at));
  if (hop && word !== null) {
    const found = declaredCollection(source, word[0]);
    if (found !== null) return readCollection(source, found, false);
  }
  return {
    names: [],
    reason: "その場に名前が並んでいません（変数や関数の戻り値は読めません）",
  };
}

/** 集まりをその場で作る呼び出しの名前（3言語ぶんの定番だけ）。 */
const COLLECTION_CALLS = /(^|\.)(Set|HashSet|LinkedHashSet|List|ArrayList|asList|of)$/;

/** 同じファイルの `… <name> = ` の右辺の位置（無ければ null）。 */
function declaredCollection(source: string, name: string): number | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*`).exec(source);
  return match === null ? null : match.index + match[0].length;
}

/** 括弧の中に並んでいる文字列リテラルを読む。 */
function readStrings(source: string, at: number): ReadResult {
  const names: string[] = [];
  for (const raw of splitTop(source, at)) {
    const text = raw.trim();
    if (text === "") continue;
    const value = literal(text);
    if (value === null) {
      return {
        names: [],
        reason: `文字列リテラルではありません: ${short(text)}`,
      };
    }
    names.push(value);
  }
  return { names };
}

/** `widget.` のような受け手の前置き（素通しの判定に使う）。 */
const SELF_PASS = /^(?:[A-Za-z_$][\w$]*\s*\.\s*)*/;

/**
 * 仮引数の並びに見えるか（`this.x` / `[Map<..>? custom]` / `Map<..> custom`）。
 *
 * 「型のあとに名前」だけの並びは呼び出しでは書けないので、宣言と見てよい。
 */
function looksLikeDeclaration(source: string, argsFrom: number): boolean {
  const text = source.slice(argsFrom, close(source, argsFrom - 1)).trim();
  if (text.startsWith("this.")) return true; // Dart: Registry(this._map)
  if (text.startsWith("[")) return true; // Dart: Registry([Map<..>? custom])
  return /^[A-Za-z_$][\w$<>,.?\s[\]]*\s[A-Za-z_$][\w$]*$/.test(text);
}

/** `{ 'a': …, "b": … }` のキーを読む（値は「埋まっているか」だけ見る）。 */
function readMapLiteral(source: string, at: number): ReadResult {
  const names: string[] = [];
  const pending: string[] = [];
  for (const entry of splitTop(source, at)) {
    const text = entry.trim();
    if (text === "") continue;
    if (text.startsWith("...")) {
      return { names: [], reason: "他の map を展開しています（中身が読めません）" };
    }
    const colon = topLevelIndexOf(text, ":");
    if (colon < 0) {
      return { names: [], reason: `map の要素として読めません: ${short(text)}` };
    }
    const key = literal(text.slice(0, colon).trim());
    if (key === null) {
      return {
        names: [],
        reason: `キーが文字列リテラルではありません: ${short(text.slice(0, colon))}`,
      };
    }
    names.push(key);
    if (looksUnfilled(text.slice(colon + 1))) pending.push(key);
  }
  return { names, pending };
}

/**
 * `Map.of(` / `Map.ofEntries(` の開始を探す。
 *
 * 実際の Java では型を明示した `Map.<String, Validator>of(…)` がよく出る（型推論が
 * 効かない位置があるので）。static import した `of(…)` も同じ扱い。
 */
function findJavaMapCall(
  source: string,
  at: number,
): { name: string; args: number } | null {
  let i = at;
  if (source.startsWith("Map", i)) {
    i = skipSpace(source, i + 3);
    if (source[i] !== ".") return null;
    i = skipSpace(source, i + 1);
    if (source[i] === "<") i = skipSpace(source, close(source, i) + 1);
  }
  const match = /^(ofEntries|of)\s*\(/.exec(source.slice(i));
  if (match === null) return null;
  return { name: match[1], args: i + match[0].length - 1 };
}

/** `Map.of("a", x, "b", y)` の偶数番目を読む。 */
function readJavaMapOf(source: string, at: number): ReadResult {
  const args = splitTop(source, at);
  if (args.length % 2 !== 0) {
    return { names: [], reason: "Map.of の引数が偶数ではありません" };
  }
  const names: string[] = [];
  const pending: string[] = [];
  for (let i = 0; i < args.length; i += 2) {
    const key = literal(args[i].trim());
    if (key === null) {
      return {
        names: [],
        reason: `キーが文字列リテラルではありません: ${short(args[i])}`,
      };
    }
    names.push(key);
    if (looksUnfilled(args[i + 1] ?? "")) pending.push(key);
  }
  return { names, pending };
}

/** `Map.ofEntries(Map.entry("a", x), …)` の第1引数を読む。 */
function readJavaEntries(source: string, at: number): ReadResult {
  const names: string[] = [];
  const pending: string[] = [];
  for (const raw of splitTop(source, at)) {
    const text = raw.trim();
    if (text === "") continue;
    const open = text.indexOf("(");
    if (open < 0 || !/(^|\.)entry$/.test(text.slice(0, open).trim())) {
      return { names: [], reason: `entry として読めません: ${short(text)}` };
    }
    const parts = splitTop(text, open);
    const key = literal(parts[0]?.trim() ?? "");
    if (key === null) {
      return { names: [], reason: `キーが文字列リテラルではありません: ${short(text)}` };
    }
    names.push(key);
    if (looksUnfilled(parts.slice(1).join(","))) pending.push(key);
  }
  return { names, pending };
}

/** 文字列リテラルなら中身、そうでなければ null（`r'…'` のような接頭辞も許す）。 */
function literal(text: string): string | null {
  const match = /^[A-Za-z]?(['"])((?:[^\\]|\\.)*?)\1$/.exec(text.trim());
  return match === null ? null : match[2];
}

const short = (text: string): string => {
  const one = text.trim().replace(/\s+/g, " ");
  return one.length > 40 ? `${one.slice(0, 40)}…` : one;
};

/**
 * `at` の括弧/波括弧の中を、**一番外側のカンマ**で切って返す。
 *
 * 入れ子の括弧・文字列の中のカンマでは切らない（そこが手書きの肝）。
 */
function splitTop(source: string, at: number): string[] {
  const end = close(source, at);
  const body = source.slice(at + 1, end);
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote !== null) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    // `<` `>` は数えない。`n < 2` や `=>` `->` で釣り合わないので、数えると
    // かえって切る位置がズレる（ズレたときは「読めない」に落ちるので安全側）。
    else if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  const last = body.slice(start);
  if (last.trim() !== "") parts.push(last);
  return parts;
}

/** 文字列の中の、入れ子になっていない位置の [needle]。 */
function topLevelIndexOf(text: string, needle: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote !== null) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === needle && depth === 0) return i;
  }
  return -1;
}

/** [at] の開き括弧に対応する閉じ括弧の位置（無ければ末尾）。 */
function close(source: string, at: number): number {
  const open = source[at];
  const shut = open === "(" ? ")" : open === "{" ? "}" : open === "<" ? ">" : "]";
  let depth = 0;
  let quote: string | null = null;
  for (let i = at; i < source.length; i++) {
    const c = source[i];
    if (quote !== null) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === open) depth++;
    else if (c === shut) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length - 1;
}

/**
 * コメントを空白に置き換える（位置と行番号を保つため、消さずに空白で埋める）。
 *
 * 文字列の中の `//` は消さない。ここを間違えると URL でソースが壊れる。
 */
export function stripComments(source: string): string {
  const out = source.split("");
  let quote: string | null = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote !== null) {
      if (c === "\\") i++;
      else if (c === quote || c === "\n") quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") out[i++] = " ";
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end < 0 ? source.length : end + 2;
      // 行番号を保つため、改行はそのまま残す。
      for (; i < stop; i++) if (out[i] !== "\n") out[i] = " ";
      i--;
      continue;
    }
  }
  return out.join("");
}
