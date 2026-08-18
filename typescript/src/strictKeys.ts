// 未知キーの検出（strict パース）。Dart / Java 版と同結果。
//
// 既定のパーサは知らないキーを黙って捨てる。人間には「書いたのに効かない」、
// AI には「間違いに気づけない」形で刺さるので、機械で言えるようにする。
//
// 厳しさは spec/hatake-page.schema.json と完全に同じ:
// `additionalProperties: false` のノードだけを閉じ、config / validators /
// computed / visibleWhen のような自由な入れ物の中は見ない。

/** 定義の中で見つかった知らないキー1つ。 */
export interface UnknownKey {
  /** そのキーを持つノードまでのパス（ドキュメント直下は空文字）。 */
  path: string;
  key: string;
  /** 一番近い既知キー（綴り間違いの指摘）。無ければ null。 */
  suggestion: string | null;
}

/**
 * 閉じたノードごとの既知キー。名前は JSON Schema の `$defs` と揃えている
 * （`<親>.<キー>` はスキーマ側で入れ子に直接書かれているもの）。
 */
export const strictKeyTable: Record<string, string[]> = {
  "": ["dsl_version", "page", "app"],
  app: ["id", "title", "home", "theme", "menu", "pages"],
  theme: [
    "primaryColor", "secondaryColor", "brightness", "density", "fontFamily",
    "radius", "config",
  ],
  menuItem: ["id", "label", "group", "icon", "page", "items", "roles"],
  crudPage: ["type", "id", "title", "repository", "key", "search", "table", "form", "actions"],
  masterPage: ["type", "id", "title", "repository", "key", "search", "table", "form", "actions"],
  searchPage: ["type", "id", "title", "repository", "key", "search", "table", "actions"],
  detailPage: ["type", "id", "title", "repository", "key", "form", "actions"],
  formPage: ["type", "id", "title", "repository", "key", "form", "actions"],
  wizardPage: ["type", "id", "title", "repository", "key", "steps", "actions"],
  wizardStep: ["id", "title", "description", "layout", "fields"],
  dashboardPage: ["type", "id", "title", "repository", "layout", "search", "items", "actions"],
  dashboardItem: [
    "id", "title", "type", "repository", "span", "filters", "limit", "sort",
    "value", "format", "config", "columns", "chart", "action", "roles",
  ],
  "dashboardItem.sort": ["field", "ascending"],
  dashboardValue: ["aggregate", "field"],
  chart: ["kind", "labelField", "valueField", "aggregate"],
  reportPage: ["type", "id", "title", "repository", "search", "table", "report", "actions"],
  report: ["paper", "rowsPerPage", "limit", "sort", "groupBy", "totals"],
  "report.sort": ["field", "ascending"],
  paper: ["size", "orientation"],
  reportGroup: ["field", "label", "pageBreak"],
  reportTotal: ["field", "aggregate"],
  search: ["layout", "filters"],
  filter: [
    "field", "label", "type", "operator", "options", "optionsFrom",
    "optionsSource", "config",
  ],
  table: ["columns", "pagination", "rowActions"],
  column: ["field", "label", "type", "width", "sortable", "format", "config", "roles"],
  pagination: ["pageSize", "enabled"],
  form: ["sections"],
  section: ["title", "layout", "fields", "visibleWhen"],
  field: [
    "field", "label", "type", "required", "requiredWhen", "readOnly",
    "readOnlyWhen", "defaultValue",
    "validators", "options", "optionsFrom", "optionsSource", "format",
    "normalize", "config", "visibleWhen", "enabledWhen", "computed", "roles",
    "columns", "fields", "source",
  ],
  optionsSource: ["repository", "value", "label", "parentKey", "limit"],
  subTableSource: ["repository", "parentKey", "key", "pageSize"],
  action: [
    "id", "type", "label", "plugin", "page", "params", "confirm", "onSuccess",
    "config", "roles",
  ],
  confirm: ["title", "message", "okLabel", "cancelLabel", "danger"],
  actionSuccess: ["message", "page", "params"],
  option: ["value", "label", "when"],
  layout: ["columns"],
};

/** 子ノードへの道。`[]` 付きはそのノードの配列。無いキーは葉／自由な入れ物。 */
const children: Record<string, Record<string, string>> = {
  "": { app: "app", page: "page" },
  app: { theme: "theme", menu: "menuItem[]", pages: "page[]" },
  menuItem: { items: "menuItem[]" },
  action: { confirm: "confirm", onSuccess: "actionSuccess" },
  crudPage: { search: "search", table: "table", form: "form", actions: "action[]" },
  masterPage: { search: "search", table: "table", form: "form", actions: "action[]" },
  searchPage: { search: "search", table: "table", actions: "action[]" },
  detailPage: { form: "form", actions: "action[]" },
  formPage: { form: "form", actions: "action[]" },
  wizardPage: { steps: "wizardStep[]", actions: "action[]" },
  wizardStep: { layout: "layout", fields: "field[]" },
  dashboardPage: {
    layout: "layout",
    search: "search",
    items: "dashboardItem[]",
    actions: "action[]",
  },
  dashboardItem: {
    sort: "dashboardItem.sort",
    value: "dashboardValue",
    chart: "chart",
    columns: "column[]",
  },
  reportPage: { search: "search", table: "table", report: "report", actions: "action[]" },
  report: {
    paper: "paper",
    sort: "report.sort",
    groupBy: "reportGroup[]",
    totals: "reportTotal[]",
  },
  search: { layout: "layout", filters: "filter[]" },
  filter: { options: "option[]", optionsSource: "optionsSource" },
  table: { columns: "column[]", pagination: "pagination" },
  form: { sections: "section[]" },
  section: { layout: "layout", fields: "field[]" },
  field: {
    options: "option[]",
    optionsSource: "optionsSource",
    columns: "column[]",
    fields: "field[]",
    source: "subTableSource",
  },
};

/** page.type → 閉じたページノード名。未知の種別は undefined（種別エラーの領分）。 */
const pageNodes: Record<string, string> = {
  crud: "crudPage",
  master: "masterPage",
  search: "searchPage",
  detail: "detailPage",
  form: "formPage",
  wizard: "wizardPage",
  dashboard: "dashboardPage",
  report: "reportPage",
};

const isDict = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * document の中の未知キーを全部返す。1件目で止めない（1往復で直せるように）。
 * 並びは (path, key) の昇順。
 */
export function findUnknownKeys(
  document: Record<string, unknown>,
): UnknownKey[] {
  const found: UnknownKey[] = [];
  walkNodes(document, ({ path, dict, known }) => {
    for (const key of Object.keys(dict)) {
      if (known.includes(key)) continue;
      found.push({ path, key, suggestion: closestKey(key, known) });
    }
  });
  found.sort((a, b) =>
    a.path === b.path ? compare(a.key, b.key) : compare(a.path, b.path),
  );
  return found;
}

/** 訪ねた「閉じたノード」1つ。 */
export interface NodeVisit {
  /** ノード名（`column` / `crudPage` / ドキュメント直下は `""`）。 */
  node: string;
  /** そのノードまでの道（`page.table.columns[0]`）。 */
  path: string;
  dict: Record<string, unknown>;
  /** そこに書ける既知キー。 */
  known: string[];
}

/**
 * document の中の「閉じたノード」を上から順に訪ねる。
 *
 * 未知キーの検出（[findUnknownKeys]）と、キーの既定値との突き合わせ（最小化）が
 * **同じ道の付け方**をするために切り出してある。未知キーの下には降りない（そこは
 * 何のノードか決められないので、間違った表で見ることになる）。
 */
export function walkNodes(
  document: Record<string, unknown>,
  visit: (found: NodeVisit) => void,
): void {
  walk("", document, "", visit);
}

/** 言語をまたいで同じ順序にするため、コード単位で比べる。 */
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function walk(
  node: string,
  value: unknown,
  path: string,
  visit: (found: NodeVisit) => void,
): void {
  if (!isDict(value)) return;
  const resolved =
    node === "page" ? pageNodes[String(value.type)] : node;
  if (resolved === undefined) return; // 未知のページ種別
  const known = strictKeyTable[resolved];
  if (known === undefined) return;
  visit({ node: resolved, path, dict: value, known });

  for (const [key, child] of Object.entries(value)) {
    if (!known.includes(key)) continue; // 未知キーの下には降りない
    const target = children[resolved]?.[key];
    if (target === undefined) continue; // 葉、または自由な入れ物
    const childPath = path === "" ? key : `${path}.${key}`;
    if (target.endsWith("[]")) {
      const childNode = target.slice(0, -2);
      if (Array.isArray(child)) {
        child.forEach((item, i) =>
          walk(childNode, item, `${childPath}[${i}]`, visit),
        );
      }
    } else {
      walk(target, child, childPath, visit);
    }
  }
}

/**
 * key に一番近い既知キー。大文字小文字を無視した編集距離が2以下のものだけ。
 * 同点はアルファベット順（言語をまたいで同じ答えにするため）。
 */
export function closestKey(key: string, known: string[]): string | null {
  const lower = key.toLowerCase();
  let best: string | null = null;
  let bestDistance = 3;
  for (const candidate of [...known].sort(compare)) {
    const distance = editDistance(lower, candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/**
 * 「これしかない」と言える一番近い名前。無ければ null。
 *
 * [closestKey] との違いは**同点を許さない**こと。提案（「もしかして X ですか」）は
 * 同点でも1つ選んでよいが、**書き換え**は候補が2つある時点で機械の仕事ではない
 * （`aprove` に対して `approve` と `improve` が同距離なら、人が選ぶ）。
 */
export function soleClosestKey(key: string, known: string[]): string | null {
  const lower = key.toLowerCase();
  let best: string | null = null;
  let bestDistance = 3;
  let ties = 0;
  for (const candidate of known) {
    const distance = editDistance(lower, candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
      ties = 1;
    } else if (distance === bestDistance && candidate !== best) {
      ties++;
    }
  }
  return ties === 1 ? best : null;
}

/** Levenshtein 距離（2行だけ持つ素直な実装）。 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length];
}
