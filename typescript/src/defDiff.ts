// 定義を変えたときの影響範囲（API の形だけではない版）。
//
// [diffDto] は「呼び出しの契約が壊れるか」を見る。実際に事故になるのはそれだけでは
// なく、**画面から消えたもの**（列・ボタン・選択肢）と**権限の変化**、そして
// **アプリの構成**（ページが消えた・メニューから外れた）も同じくらい効く。
//
// 判定は3段:
//   breaking … 呼び出し側が壊れる（既存どおり、API の形の話）
//   caution  … 壊れないが**目で見て確かめてほしい**（消えた・狭まった・広がった）
//   safe     … 増えただけ
//
// caution を breaking と混ぜないのが要点。「列を消した」は普通にやることなので、
// 止める話ではなく**気づかせる話**。混ぜると全部無視されるようになる。

import { deriveDto } from "./dto.js";
import { diffDto, type DtoChange } from "./dtoDiff.js";
import { parsePageMap } from "./parse.js";

export type DiffImpact = "breaking" | "caution" | "safe";

/** どの層の話か。 */
export const DiffAreas = {
  /** 呼び出しの契約（`DtoSpec` の差分）。 */
  api: "api",
  /** 画面（列・選択肢・ボタン・条件）。 */
  ui: "ui",
  /** 権限（`roles`）。 */
  access: "access",
  /** アプリの構成（ページ・メニュー・初期ルート・テーマ）。 */
  app: "app",
} as const;

export type DiffArea = (typeof DiffAreas)[keyof typeof DiffAreas];

/** 変更1つ。 */
export interface DefinitionChange {
  area: DiffArea;
  /** 規則名（安定した識別子）。 */
  kind: string;
  /** どこの話か（`pages.order_search.table.columns.amount` のような道）。 */
  path: string;
  from?: string;
  to?: string;
  impact: DiffImpact;
  message: string;
}

export interface DefinitionDiff {
  /** 比べたもの（`page` か `app`）。 */
  kind: "page" | "app";
  /** 壊す変更（breaking）が1つも無いか。終了コードはこれで決まる。 */
  compatible: boolean;
  /** 目で見て確かめてほしい変更（caution）が1つも無いか。 */
  quiet: boolean;
  changes: DefinitionChange[];
}

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;
const dicts = (v: unknown): Dict[] => list(v).filter(isDict);

/**
 * 2つの定義（素の document）を比べる。
 *
 * 片方が `app:`、もう片方が `page:` のときは比べない（別物なので、差分ではなく
 * 指定間違い）。並びは「アプリ → ページごとに api → ui → access」で、同じ入力なら
 * 常に同じ順になる。
 */
export function diffDefinitions(before: Dict, after: Dict): DefinitionDiff {
  const beforeIsApp = isDict(before.app);
  const afterIsApp = isDict(after.app);
  if (beforeIsApp !== afterIsApp) {
    throw new Error(
      "片方が app、もう片方が単票のページ定義です。同じ種類のもの同士で比べてください。",
    );
  }

  const changes: DefinitionChange[] = beforeIsApp
    ? diffAppDocuments(before.app as Dict, after.app as Dict)
    : diffPageDocuments(before, after, "page");

  return {
    kind: beforeIsApp ? "app" : "page",
    compatible: !changes.some((c) => c.impact === "breaking"),
    quiet: !changes.some((c) => c.impact === "caution"),
    changes,
  };
}

function change(
  area: DiffArea,
  kind: string,
  path: string,
  impact: DiffImpact,
  message: string,
  from?: string,
  to?: string,
): DefinitionChange {
  return {
    area,
    kind,
    path,
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    impact,
    message,
  };
}

/** `DtoSpec` の差分を共通の形に移す（判定はそのまま持ってくる）。 */
function fromDto(dto: DtoChange, path: string): DefinitionChange {
  const where =
    dto.member === undefined ? dto.shape : `${dto.shape}.${dto.member}`;
  return change(
    "api",
    dto.kind,
    `${path}.${where}`,
    dto.breaking ? "breaking" : "safe",
    dto.message,
    dto.from,
    dto.to,
  );
}

// --- アプリ全体 -------------------------------------------------------------

function diffAppDocuments(before: Dict, after: Dict): DefinitionChange[] {
  const changes: DefinitionChange[] = [];

  const home = [str(before.home), str(after.home)];
  if (home[0] !== home[1]) {
    changes.push(
      change(
        "app",
        "home-changed",
        "app.home",
        "caution",
        `最初に開く画面が ${home[0] ?? "(先頭のページ)"} から ${home[1] ?? "(先頭のページ)"} に変わりました。`,
        home[0],
        home[1],
      ),
    );
  }

  if (JSON.stringify(before.theme ?? null) !== JSON.stringify(after.theme ?? null)) {
    changes.push(
      change("app", "theme-changed", "app.theme", "safe", "見た目（テーマ）が変わりました。"),
    );
  }

  changes.push(...diffMenu(before, after));
  changes.push(...diffPages(before, after));
  return changes;
}

/** メニューの道（`販売 > 受注入力`）→ ページ id。階層ごと畳んで比べる。 */
function menuPaths(items: Dict[], prefix: string[]): Map<string, string> {
  const paths = new Map<string, string>();
  for (const item of items) {
    // 見出しは `group`、葉は `label`。入れ子は `items`（書く側のキー）。
    const label = str(item.label) ?? str(item.group) ?? str(item.id) ?? "";
    const trail = [...prefix, label];
    const children = dicts(item.items);
    if (children.length > 0) {
      for (const [path, page] of menuPaths(children, trail)) paths.set(path, page);
    } else {
      paths.set(trail.join(" > "), str(item.page) ?? "");
    }
  }
  return paths;
}

function diffMenu(before: Dict, after: Dict): DefinitionChange[] {
  const changes: DefinitionChange[] = [];
  const from = menuPaths(dicts(before.menu), []);
  const to = menuPaths(dicts(after.menu), []);

  // 同じページを指す項目が別の道に移ったなら「消えた＋増えた」ではなく「移った」。
  const movedFrom = new Map<string, string>(); // page -> old path
  for (const [path, page] of from) {
    if (!to.has(path) && page !== "") movedFrom.set(page, path);
  }

  for (const [path, page] of from) {
    if (to.has(path)) continue;
    const movedTo = [...to].find(([p, q]) => q === page && !from.has(p));
    if (movedTo !== undefined) {
      changes.push(
        change(
          "app",
          "menu-moved",
          `app.menu.${path}`,
          "safe",
          `メニューの「${path}」が「${movedTo[0]}」に移りました。`,
          path,
          movedTo[0],
        ),
      );
      continue;
    }
    changes.push(
      change(
        "app",
        "menu-removed",
        `app.menu.${path}`,
        "caution",
        `メニューから「${path}」が無くなりました。${page === "" ? "" : `ページ ${page} は`}メニューから開けません。`,
      ),
    );
  }
  for (const [path, page] of to) {
    if (from.has(path)) continue;
    if (movedFrom.has(page)) continue; // 移動として報告済み
    changes.push(
      change(
        "app",
        "menu-added",
        `app.menu.${path}`,
        "safe",
        `メニューに「${path}」が増えました。`,
      ),
    );
  }
  return changes;
}

function pagesById(app: Dict): Map<string, Dict> {
  const pages = new Map<string, Dict>();
  for (const page of dicts(app.pages)) {
    const id = str(page.id);
    if (id !== undefined) pages.set(id, page);
  }
  return pages;
}

function diffPages(before: Dict, after: Dict): DefinitionChange[] {
  const changes: DefinitionChange[] = [];
  const from = pagesById(before);
  const to = pagesById(after);

  for (const [id, page] of from) {
    const next = to.get(id);
    if (next === undefined) {
      changes.push(
        change(
          "app",
          "page-removed",
          `app.pages.${id}`,
          "caution",
          `ページ ${id}（${str(page.title) ?? ""}）が無くなりました。遷移先やブックマークが開けません。`,
        ),
      );
      continue;
    }
    if (str(page.type) !== str(next.type)) {
      changes.push(
        change(
          "app",
          "page-kind-changed",
          `app.pages.${id}.type`,
          "caution",
          `ページ ${id} の種別が ${str(page.type)} から ${str(next.type)} に変わりました。画面の構成が別物になります。`,
          str(page.type),
          str(next.type),
        ),
      );
    }
    changes.push(...diffPageDocuments({ page }, { page: next }, `pages.${id}`));
  }
  for (const [id, page] of to) {
    if (from.has(id)) continue;
    changes.push(
      change(
        "app",
        "page-added",
        `app.pages.${id}`,
        "safe",
        `ページ ${id}（${str(page.title) ?? ""}）が増えました。`,
      ),
    );
  }
  return changes;
}

// --- ページ1枚 --------------------------------------------------------------

/** `{ page: … }` を包んだ document 2つを比べる（api ＋ ui ＋ access）。 */
function diffPageDocuments(
  before: Dict,
  after: Dict,
  path: string,
): DefinitionChange[] {
  const changes: DefinitionChange[] = [];
  const beforePage = isDict(before.page) ? before.page : {};
  const afterPage = isDict(after.page) ? after.page : {};

  // API の形は既存の判定に任せる（受け取る形と返す形で結論が非対称なので）。
  const dto = diffDto(
    deriveDto(parsePageMap(beforePage)),
    deriveDto(parsePageMap(afterPage)),
  );
  changes.push(...dto.changes.map((c) => fromDto(c, path)));
  changes.push(...diffUi(beforePage, afterPage, path));
  return changes;
}

/** 画面と権限の差分。API の形に出るもの（項目の増減）はここでは繰り返さない。 */
function diffUi(before: Dict, after: Dict, path: string): DefinitionChange[] {
  const changes: DefinitionChange[] = [];

  changes.push(...diffColumns(before, after, path));
  changes.push(...diffActions(before, after, path));
  changes.push(...diffFilters(before, after, path));
  changes.push(...diffFields(before, after, path));
  return changes;
}

const byField = (items: Dict[]): Map<string, Dict> => {
  const map = new Map<string, Dict>();
  for (const item of items) {
    const key = str(item.field);
    if (key !== undefined) map.set(key, item);
  }
  return map;
};

function tableColumns(page: Dict): Dict[] {
  const table = isDict(page.table) ? page.table : undefined;
  return table === undefined ? [] : dicts(table.columns);
}

function diffColumns(before: Dict, after: Dict, path: string): DefinitionChange[] {
  const changes: DefinitionChange[] = [];
  const from = byField(tableColumns(before));
  const to = byField(tableColumns(after));

  for (const [field, column] of from) {
    const next = to.get(field);
    if (next === undefined) {
      changes.push(
        change(
          "ui",
          "column-removed",
          `${path}.table.columns.${field}`,
          "caution",
          `一覧から列「${str(column.label) ?? field}」が消えました。画面に出なくなります。`,
        ),
      );
      continue;
    }
    if (str(column.format) !== str(next.format)) {
      changes.push(
        change(
          "ui",
          "column-format-changed",
          `${path}.table.columns.${field}.format`,
          "caution",
          `列「${str(column.label) ?? field}」の見せ方が ${str(column.format) ?? "(素の値)"} から ${str(next.format) ?? "(素の値)"} に変わりました。`,
          str(column.format),
          str(next.format),
        ),
      );
    }
    changes.push(
      ...diffRoles(column, next, `${path}.table.columns.${field}`, `列「${str(column.label) ?? field}」`),
    );
  }
  for (const [field, column] of to) {
    if (from.has(field)) continue;
    changes.push(
      change(
        "ui",
        "column-added",
        `${path}.table.columns.${field}`,
        "safe",
        `一覧に列「${str(column.label) ?? field}」が増えました。`,
      ),
    );
  }
  return changes;
}

function actionsById(page: Dict): Map<string, Dict> {
  const map = new Map<string, Dict>();
  for (const action of dicts(page.actions)) {
    const id = str(action.id);
    if (id !== undefined) map.set(id, action);
  }
  return map;
}

function diffActions(before: Dict, after: Dict, path: string): DefinitionChange[] {
  const changes: DefinitionChange[] = [];
  const from = actionsById(before);
  const to = actionsById(after);

  for (const [id, action] of from) {
    const at = `${path}.actions.${id}`;
    const next = to.get(id);
    if (next === undefined) {
      changes.push(
        change(
          "ui",
          "action-removed",
          at,
          "caution",
          `ボタン「${str(action.label) ?? id}」が無くなりました。行アクションに書いてあっても出ません。`,
        ),
      );
      continue;
    }
    if (str(action.type) !== str(next.type)) {
      changes.push(
        change(
          "ui",
          "action-type-changed",
          `${at}.type`,
          "caution",
          `ボタン「${str(action.label) ?? id}」の動きが ${str(action.type)} から ${str(next.type)} に変わりました。`,
          str(action.type),
          str(next.type),
        ),
      );
    }
    // 確認ダイアログが消えるのは、押した瞬間に実行されるようになるということ。
    if (isDict(action.confirm) && !isDict(next.confirm)) {
      changes.push(
        change(
          "ui",
          "confirm-removed",
          `${at}.confirm`,
          "caution",
          `ボタン「${str(action.label) ?? id}」の確認ダイアログが無くなりました。押した瞬間に実行されます` +
            `${str(next.type) === "delete" ? "（delete は宣言が無くても確認するので、文言が既定に戻るだけです）" : ""}。`,
        ),
      );
    }
    changes.push(
      ...diffRoles(action, next, at, `ボタン「${str(action.label) ?? id}」`),
    );
  }
  for (const [id, action] of to) {
    if (from.has(id)) continue;
    changes.push(
      change(
        "ui",
        "action-added",
        `${path}.actions.${id}`,
        "safe",
        `ボタン「${str(action.label) ?? id}」が増えました。`,
      ),
    );
  }
  return changes;
}

function searchFilters(page: Dict): Dict[] {
  const search = isDict(page.search) ? page.search : undefined;
  return search === undefined ? [] : dicts(search.filters);
}

function diffFilters(before: Dict, after: Dict, path: string): DefinitionChange[] {
  const changes: DefinitionChange[] = [];
  const from = byField(searchFilters(before));
  const to = byField(searchFilters(after));
  // 条件の増減は検索パラメータの形（queryParams）に出るので、ここでは繰り返さない。
  for (const [field, filter] of from) {
    const next = to.get(field);
    if (next === undefined) continue;
    const was = str(filter.operator) ?? "contains";
    const now = str(next.operator) ?? "contains";
    if (was !== now) {
      changes.push(
        change(
          "ui",
          "filter-operator-changed",
          `${path}.search.filters.${field}.operator`,
          "caution",
          `条件「${str(filter.label) ?? field}」の突合が ${was} から ${now} に変わりました。同じ入力で結果が変わります。`,
          was,
          now,
        ),
      );
    }
    changes.push(...diffOptions(filter, next, `${path}.search.filters.${field}`, `条件「${str(filter.label) ?? field}」`));
  }
  return changes;
}

/** フォーム（と wizard のステップ）の項目を項目名で引けるようにする。 */
function formFieldsOf(page: Dict): Map<string, Dict> {
  const fields: Dict[] = [];
  const form = isDict(page.form) ? page.form : undefined;
  if (form !== undefined) {
    for (const section of dicts(form.sections)) fields.push(...dicts(section.fields));
  }
  for (const step of dicts(page.steps)) fields.push(...dicts(step.fields));
  return byField(fields);
}

const CONDITION_KEYS = [
  "visibleWhen",
  "enabledWhen",
  "readOnlyWhen",
  "requiredWhen",
] as const;

function diffFields(before: Dict, after: Dict, path: string): DefinitionChange[] {
  const changes: DefinitionChange[] = [];
  const from = formFieldsOf(before);
  const to = formFieldsOf(after);
  // 項目の増減は受け取る形（request）に出るので、ここでは繰り返さない。
  for (const [field, item] of from) {
    const next = to.get(field);
    if (next === undefined) continue;
    const at = `${path}.form.fields.${field}`;
    const label = `項目「${str(item.label) ?? field}」`;

    for (const key of CONDITION_KEYS) {
      const was = JSON.stringify(item[key] ?? null);
      const now = JSON.stringify(next[key] ?? null);
      if (was === now) continue;
      changes.push(
        change(
          "ui",
          "condition-changed",
          `${at}.${key}`,
          "caution",
          `${label}の ${key} が変わりました。${
            now === "null"
              ? "条件が外れたので常にそうなります。"
              : was === "null"
                ? "条件が付いたので、満たさないときは今までと違う見え方になります。"
                : "出方が変わります。"
          }`,
          was === "null" ? undefined : was,
          now === "null" ? undefined : now,
        ),
      );
    }
    changes.push(...diffOptions(item, next, at, label));
    changes.push(...diffRoles(item, next, at, label));
  }
  return changes;
}

/** 選択肢の差分。**消えた選択肢**は、既存データの値が選べなくなる合図。 */
function diffOptions(
  before: Dict,
  after: Dict,
  path: string,
  label: string,
): DefinitionChange[] {
  const changes: DefinitionChange[] = [];
  const values = (owner: Dict): string[] =>
    dicts(owner.options).map((o) => JSON.stringify(o.value ?? null));
  const from = values(before);
  const to = new Set(values(after));
  const gone = from.filter((v) => !to.has(v));
  const added = [...to].filter((v) => !from.includes(v));

  if (gone.length > 0) {
    changes.push(
      change(
        "ui",
        "option-removed",
        `${path}.options`,
        "caution",
        `${label}の選択肢から ${gone.join(" / ")} が消えました。その値を持っている既存データは、開いても選び直せません。`,
        gone.join(" / "),
      ),
    );
  }
  if (added.length > 0) {
    changes.push(
      change(
        "ui",
        "option-added",
        `${path}.options`,
        "safe",
        `${label}の選択肢に ${added.join(" / ")} が増えました。`,
        undefined,
        added.join(" / "),
      ),
    );
  }
  return changes;
}

/**
 * 権限の差分。狭まる（見えなくなる人がいる）と広がる（見える人が増える）を分ける。
 * どちらも壊れはしないが、**どちらも確かめてほしい**（後者は見せすぎ）。
 */
function diffRoles(
  before: Dict,
  after: Dict,
  path: string,
  label: string,
): DefinitionChange[] {
  const roles = (owner: Dict): string[] =>
    list(owner.roles)
      .map((r) => str(r))
      .filter((r): r is string => r !== undefined)
      .sort();
  const from = roles(before);
  const to = roles(after);
  if (from.join(",") === to.join(",")) return [];

  const shown = (names: string[]): string =>
    names.length === 0 ? "全員" : names.join(" / ");

  // 空 = 制限なし（全員）。なので「空 → 何か」は狭まる、「何か → 空」は広がる。
  const all = (names: string[]): boolean => names.length === 0;
  let narrowed: boolean;
  let widened: boolean;
  if (all(from)) {
    narrowed = true; // 全員 → 誰かだけ
    widened = false;
  } else if (all(to)) {
    narrowed = false;
    widened = true; // 誰かだけ → 全員
  } else {
    narrowed = from.some((r) => !to.includes(r));
    widened = to.some((r) => !from.includes(r));
  }

  const kind =
    narrowed && !widened
      ? "roles-narrowed"
      : widened && !narrowed
        ? "roles-widened"
        : "roles-changed";
  const tail =
    kind === "roles-narrowed"
      ? "見えなくなる人がいます。"
      : kind === "roles-widened"
        ? "見える人が増えます（見せすぎていないか確かめてください）。"
        : "見える人の顔ぶれが変わります。";
  return [
    change(
      "access",
      kind,
      `${path}.roles`,
      "caution",
      `${label}を見られるロールが ${shown(from)} から ${shown(to)} に変わりました。${tail}`,
      shown(from),
      shown(to),
    ),
  ];
}
