// 「その画面のどこに何が並んでいるか」を取り出すだけの層。
//
// 助言（[findAdvice]）・当てる側（[applyAdvice]）・下書き（[withDrafts]）は、どれも
// 「入力できる項目を全部」「その項目の業務名」を欲しがる。同じ walk を3つ持つと、
// **どれか1つだけが `steps` を見ていない**のような食い違いが必ず出る（画面の種別で
// 項目の置き場所が変わるので、ここは間違えやすい）。なので1つだけ置く。
//
// 道は**画面からの相対**で返す（`form.sections[0].fields[2]`）。呼ぶ側が `page` にも
// `app.pages[3]` にも前置きできるように。

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const dicts = (v: unknown): Dict[] => list(v).filter(isDict);

/** 画面の中の場所（道は画面からの相対）。 */
export interface PagePart {
  node: Dict;
  path: (string | number)[];
}

/** 一覧の列（帳票の明細もここ＝列は table にしか無い）。 */
export const tableColumns = (page: Dict): PagePart[] => {
  const table = isDict(page.table) ? page.table : undefined;
  if (table === undefined) return [];
  return dicts(table.columns).map((node, index) => ({
    node,
    path: ["table", "columns", index],
  }));
};

/** 絞り込み。 */
export const searchFilters = (page: Dict): PagePart[] => {
  const search = isDict(page.search) ? page.search : undefined;
  if (search === undefined) return [];
  return dicts(search.filters).map((node, index) => ({
    node,
    path: ["search", "filters", index],
  }));
};

/**
 * 入力できる項目を全部（枠の中とステップの中を区別しない）。
 *
 * 見るのは**素の document**（解析後のモデルを歩く [formFields] とは別物。あちらは
 * 既定値で埋まった姿を見るので、「書いてあるか」を見るこちらとは答えが違う）。
 * `form` を持つのは crud / master / detail / form で、`steps` を持つのは wizard。
 * **どちらか片方しか見ない実装をすると、ウィザードだけ助言が出ない**（実際に起きる）。
 */
export function rawFormFields(page: Dict): PagePart[] {
  const found: PagePart[] = [];
  const form = isDict(page.form) ? page.form : undefined;
  if (form !== undefined) {
    dicts(form.sections).forEach((section, at) =>
      dicts(section.fields).forEach((node, index) =>
        found.push({ node, path: ["form", "sections", at, "fields", index] }),
      ),
    );
  }
  dicts(page.steps).forEach((step, at) =>
    dicts(step.fields).forEach((node, index) =>
      found.push({ node, path: ["steps", at, "fields", index] }),
    ),
  );
  return found;
}

/** ボタン。 */
export const pageActions = (page: Dict): PagePart[] =>
  dicts(page.actions).map((node, index) => ({ node, path: ["actions", index] }));

/**
 * その項目の**業務名**を定義の中から探す。
 *
 * 同じ項目が別の場所に出ていれば、そこに書いてあるラベルが正（一覧に出す列を新しく
 * 作るときに、画面に出る言葉を機械が作ってしまわないため）。
 */
export function labelFor(node: unknown, field: string): string | undefined {
  if (Array.isArray(node)) {
    for (const one of node) {
      const found = labelFor(one, field);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isDict(node)) return undefined;
  if (str(node.field) === field && str(node.label) !== undefined) return str(node.label);
  for (const value of Object.values(node)) {
    const found = labelFor(value, field);
    if (found !== undefined) return found;
  }
  return undefined;
}
