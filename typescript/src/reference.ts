// 機械可読な DSL リファレンス。spec/hatake-page.schema.json から**導出**する。
//
// 定義を書くときに知りたいのは、だいたいこの5つだけ:
//   ・ここに何のキーを書けるか  ・型  ・既定値  ・取れる値  ・どのページ種別で有効か
// これを引ければ仕様書 800行を読む必要がない。人間なら索引を引くところを、AI は
// 毎回全文読みに行ってしまうので、引ける形で置いておく。
//
// 手で書かないことが唯一の価値。スキーマから機械的に作るので、スキーマを直せば
// リファレンスも直る（ズレたら CI が落ちる）。

/** スキーマは外から来る素の JSON なので、ここだけは緩く受ける。 */
type Json = Record<string, any>;

/** ノードに書けるキー1つ。 */
export interface ReferenceKey {
  key: string;
  /** `string` / `number` / `integer` / `boolean` / `array` / `object` / `any`（`|` 区切りもある）。 */
  type: string;
  required: boolean;
  /** 値が入れ子のノードなら、その名前。`oneOf` は複数（ページ種別など）。 */
  nodes?: string[];
  /** 配列キーの要素の型（要素がノードのときは `nodes` を見る）。 */
  items?: string;
  default?: unknown;
  /** 取れる値。配列キーなら**要素**が取れる値。 */
  values?: string[];
  /** true = `values` は組み込みの一覧で、Registry で足せる（開いた文字列）。 */
  open?: boolean;
  minimum?: number;
  description?: string;
}

/** 定義の中の1ノード（`page` / `table` / `column` …）。 */
export interface ReferenceNode {
  description?: string;
  /** 書けるキーが決まっているか（strict が閉じるノード）。false = 自由な入れ物。 */
  closed: boolean;
  /** このノードに到達できるページ種別。`app` 側だけのノードは空。 */
  pageKinds: string[];
  /** どのノードの下に書くか。 */
  parents: string[];
  keys: ReferenceKey[];
}

export interface ReferencePageKind {
  /** `page.type` に書く値。 */
  type: string;
  /** 対応するノード名。 */
  node: string;
  description?: string;
  required: string[];
}

export interface DslReference {
  dslVersion: string;
  generatedFrom: string;
  pageKinds: ReferencePageKind[];
  /** ノード名 → ノード。ドキュメント直下は `document`（strict のキー表では `""`）。 */
  nodes: Record<string, ReferenceNode>;
  /** キー名 → そのキーを書けるノード名。綴りから居場所を1発で引くための索引。 */
  keyIndex: Record<string, string[]>;
}

/** ドキュメント直下のノード名。 */
export const DOCUMENT_NODE = "document";

const isDict = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `#/$defs/column` → `column`。 */
const refName = (ref: string): string => ref.replace(/^#\/\$defs\//, "");

/** 言語をまたいでも同じ並びにするため、コード単位で比べる。 */
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * JSON Schema からリファレンスを作る。
 *
 * ノード名はスキーマの `$defs` と揃える。`$defs` に無い入れ子（`report.sort` など）は
 * `<親>.<キー>` になる（strict のキー表と同じ命名）。
 */
export function buildReference(schema: Json): DslReference {
  const defs: Json = schema.$defs ?? {};
  const nodes: Record<string, ReferenceNode> = {};
  const parents: Record<string, Set<string>> = {};
  /** ノード → 子ノード。ページ種別の到達判定に使う。 */
  const edges: Record<string, Set<string>> = {};

  const addEdge = (from: string, to: string): void => {
    (edges[from] ??= new Set()).add(to);
    (parents[to] ??= new Set()).add(from);
  };

  /** `$ref` を1段たどる。ref でなければそのまま返す。 */
  const deref = (prop: Json): { def: Json; name?: string } => {
    if (typeof prop.$ref === "string") {
      const name = refName(prop.$ref);
      return { def: defs[name] ?? {}, name };
    }
    return { def: prop };
  };

  function visit(name: string, def: Json): void {
    if (nodes[name] !== undefined) return; // 再帰（condition）と共有ノード対策
    const node: ReferenceNode = {
      description: def.description,
      closed: def.additionalProperties === false,
      pageKinds: [],
      parents: [],
      keys: [],
    };
    nodes[name] = node;

    const required: string[] = Array.isArray(def.required) ? def.required : [];
    for (const [key, raw] of Object.entries<Json>(def.properties ?? {})) {
      node.keys.push(keyOf(name, key, raw, required.includes(key)));
    }
  }

  function keyOf(
    parent: string,
    key: string,
    raw: Json,
    required: boolean,
  ): ReferenceKey {
    const { def } = deref(raw);
    // 説明は「使う側に書かれたもの」を優先する（同じ $ref を別の意味で使う）。
    const description = raw.description ?? def.description;
    const entry: ReferenceKey = {
      key,
      type: typeOf(def),
      required,
      description,
    };
    if (def.default !== undefined) entry.default = def.default;
    if (typeof def.minimum === "number") entry.minimum = def.minimum;

    // oneOf（ページ種別のように「どれか1つ」）。
    if (Array.isArray(def.oneOf)) {
      entry.type = "object";
      entry.nodes = childNodes(parent, key, def.oneOf);
      return entry;
    }

    if (def.type === "array") {
      const items: Json = def.items ?? {};
      if (items.$ref !== undefined || Array.isArray(items.oneOf)) {
        entry.nodes = childNodes(parent, key, items.oneOf ?? [items]);
      } else if (isObjectSchema(items)) {
        entry.nodes = childNodes(parent, key, [items]);
      } else {
        entry.items = typeOf(items);
        assignValues(entry, items);
      }
      return entry;
    }

    // 入れ子のノード。中身が自由な入れ物（config / params）でも1ノードとして
    // 引けるようにしておく（「ここは何を書いてもいい」も答えの1つなので）。
    if (isObjectSchema(def)) {
      entry.nodes = childNodes(parent, key, [raw]);
      return entry;
    }

    assignValues(entry, def);
    return entry;
  }

  /** 子ノードを登録して名前を返す。無名の入れ子は `<親>.<キー>` になる。 */
  function childNodes(parent: string, key: string, schemas: Json[]): string[] {
    const names: string[] = [];
    for (const child of schemas) {
      const { def, name } = deref(child);
      const nodeName = name ?? `${parent === DOCUMENT_NODE ? "" : `${parent}.`}${key}`;
      names.push(nodeName);
      addEdge(parent, nodeName);
      visit(nodeName, def);
    }
    return names;
  }

  visit(DOCUMENT_NODE, schema);

  // ページ種別。`page` の oneOf の順（= 仕様書・CLI の並び）をそのまま使う。
  const pageKinds: ReferencePageKind[] = (schema.properties?.page?.oneOf ?? [])
    .map((one: Json) => refName(one.$ref))
    .map((node: string) => ({
      type: String(defs[node]?.properties?.type?.enum?.[0] ?? node),
      node,
      description: defs[node]?.description,
      required: [...(defs[node]?.required ?? [])].sort(compare),
    }));

  // ページ種別ごとの到達ノードを塗る（そのキーがどの画面で有効かは、これで決まる）。
  for (const kind of pageKinds) {
    for (const reached of reachable(kind.node, edges)) {
      const node = nodes[reached];
      if (node !== undefined && !node.pageKinds.includes(kind.type)) {
        node.pageKinds.push(kind.type);
      }
    }
  }

  const keyIndex: Record<string, string[]> = {};
  for (const [name, node] of Object.entries(nodes)) {
    node.parents = [...(parents[name] ?? [])].sort(compare);
    node.pageKinds.sort(compare);
    for (const key of node.keys) (keyIndex[key.key] ??= []).push(name);
  }
  for (const list of Object.values(keyIndex)) list.sort(compare);

  return {
    dslVersion: String(schema.properties?.dsl_version?.default ?? "1.0"),
    generatedFrom: "spec/hatake-page.schema.json",
    pageKinds,
    nodes: sortKeys(nodes),
    keyIndex: sortKeys(keyIndex),
  };
}

/** 自分＋そこから辿れるノード全部（循環しても止まる）。 */
function reachable(start: string, edges: Record<string, Set<string>>): string[] {
  const seen = new Set<string>([start]);
  const stack = [start];
  while (stack.length > 0) {
    for (const next of edges[stack.pop()!] ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return [...seen];
}

const isObjectSchema = (def: Json): boolean =>
  def.type === "object" || def.properties !== undefined;

/** スキーマの `type` を1つの文字列にする。無ければ enum / 何でも可から決める。 */
function typeOf(def: Json): string {
  if (Array.isArray(def.type)) return def.type.join("|");
  if (typeof def.type === "string") return def.type;
  if (Array.isArray(def.oneOf)) return "object";
  if (Array.isArray(def.enum)) return "string";
  return "any";
}

/**
 * 取れる値。`enum` は閉じた集合、`examples` は「組み込みの一覧」＝ Registry で
 * 足せる開いた文字列（スキーマ側の約束）。
 */
function assignValues(entry: ReferenceKey, def: Json): void {
  if (Array.isArray(def.enum)) {
    entry.values = def.enum.map(String);
    entry.open = false;
    return;
  }
  if (Array.isArray(def.examples) && def.examples.length > 0) {
    entry.values = def.examples.map(String);
    entry.open = true;
  }
}

function sortKeys<T>(map: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => compare(a, b)),
  );
}

/** 名前1つの引き当て結果。ノード名・ページ種別・キー名を同時に見る。 */
export interface ReferenceLookup {
  name: string;
  node?: ReferenceNode & { name: string };
  pageKind?: ReferencePageKind;
  /** そのキーを書けるノードごとの定義。 */
  keys?: { node: string; key: ReferenceKey }[];
}

/**
 * 名前で引く。`report` のようにノード名とページ種別が同名のことがあるので、
 * 当たったものは全部返す（AI に「どっちの report か」を推測させない）。
 */
export function lookupReference(
  reference: DslReference,
  name: string,
): ReferenceLookup | null {
  const result: ReferenceLookup = { name };
  const node = reference.nodes[name];
  if (node !== undefined) result.node = { name, ...node };

  const pageKind = reference.pageKinds.find((k) => k.type === name);
  if (pageKind !== undefined) result.pageKind = pageKind;

  const holders = reference.keyIndex[name] ?? [];
  const keys = holders.flatMap((holder) => {
    const key = reference.nodes[holder]?.keys.find((k) => k.key === name);
    return key === undefined ? [] : [{ node: holder, key }];
  });
  if (keys.length > 0) result.keys = keys;

  return result.node || result.pageKind || result.keys ? result : null;
}

/**
 * 1つのページ種別で使えるところだけに絞ったリファレンス。
 * 「report ページに書けるものを全部見せて」を1ファイルで渡すため。
 */
export function filterByPageKind(
  reference: DslReference,
  kind: string,
): DslReference | null {
  const pageKind = reference.pageKinds.find((k) => k.type === kind);
  if (pageKind === undefined) return null;
  const nodes = Object.fromEntries(
    Object.entries(reference.nodes).filter(([, node]) =>
      node.pageKinds.includes(kind),
    ),
  );
  const keyIndex = Object.fromEntries(
    Object.entries(reference.keyIndex)
      .map(([key, holders]) => [key, holders.filter((h) => h in nodes)])
      .filter(([, holders]) => (holders as string[]).length > 0),
  );
  return { ...reference, pageKinds: [pageKind], nodes, keyIndex };
}
