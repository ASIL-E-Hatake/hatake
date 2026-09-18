// **画面をまたいで見る助言**（1枚だけ読んでも分からないもの）。
//
// ここに在る2つは、どちらも「定義は通るのに、開いた画面が必ず空になる」種類です。
// 検証（事実）ではなく助言にしてあるのは、**そう作りたい場合が在り得る**から
// （鍵の無い入力画面＝新規作成は普通）。ただし詳細画面については、鍵が無ければ
// 何も出しようが無いので、かなり強い助言です。
//
// 見つけ方の元は実物です。見本の機能網羅アプリで
// `params: { itemCode: $row.itemCode }` と書いた所が「データがありません」になり、
// 押しても **API を1本も投げていない**ことで気づきました。
// 当時は `id` という名前の引数しか鍵として読んでいなかった（0.9.3 で直した）ので、
// **名前が合っていないと黙って空になる**のは今も同じです。

import { type Advice } from "./advise.js";
import { type AdviceRules, DEFAULT_RULES, enabled } from "./adviseRules.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const dicts = (v: unknown): Dict[] => (Array.isArray(v) ? v.filter(isDict) : []);
const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** 1件を指す画面（鍵が要る）。一覧の画面は鍵を取らない。 */
const SINGLE_RECORD = new Set(["detail", "form", "wizard"]);

/** その画面が鍵として読む名前（書いていなければ `id`）。 */
const keyNameOf = (page: Dict): string => str(page.key) ?? "id";

/** メニューの葉を全部（グループは畳んで辿る）。 */
function menuLeaves(items: unknown): Dict[] {
  const found: Dict[] = [];
  for (const one of dicts(items)) {
    if (one.items !== undefined) {
      found.push(...menuLeaves(one.items));
    } else {
      found.push(one);
    }
  }
  return found;
}

/**
 * app ぜんたいを見る助言。
 *
 * 単票の定義（`page:` 1枚）では何も言わない＝どちらの規則も**行き先**が要る。
 */
export function findAppAdvice(
  document: Dict,
  rules: AdviceRules = DEFAULT_RULES,
): Advice[] {
  const app = isDict(document.app) ? document.app : undefined;
  if (app === undefined) return [];
  const pages = dicts(app.pages);
  const byId = new Map<string, Dict>();
  for (const page of pages) {
    const id = str(page.id);
    if (id !== undefined) byId.set(id, page);
  }
  const found: Advice[] = [];
  checkNavigateKeys(pages, byId, found, rules);
  checkDetailInMenu(app, byId, found, rules);
  return found;
}

/**
 * 行き先が1件の画面なのに、**鍵になる引数を渡していない** navigate。
 *
 * 渡していても**名前が違えば**同じことになる（行き先は自分の `key` の名前か `id` で
 * 受け取る）。URL は変わるので動いたように見え、開いた画面だけが空になります。
 *
 * 入力（form / wizard）は、鍵が無いのが「新規」なので**何も渡していなければ言わない**。
 * 何か渡しているのに鍵の名前が無いときだけ言う＝渡したつもりで渡っていない形。
 */
function checkNavigateKeys(
  pages: Dict[],
  byId: Map<string, Dict>,
  found: Advice[],
  rules: AdviceRules,
): void {
  if (!enabled(rules, "navigate-without-key-param")) return;
  for (const page of pages) {
    const from = str(page.id);
    dicts(page.actions).forEach((action, index) => {
      if (str(action.type) !== "navigate") return;
      const targetId = str(action.page);
      if (targetId === undefined) return;
      const target = byId.get(targetId);
      if (target === undefined) return;
      const kind = str(target.type) ?? "";
      if (!SINGLE_RECORD.has(kind)) return;

      const params = isDict(action.params) ? action.params : undefined;
      const names = params === undefined ? [] : Object.keys(params);
      // 入力画面へ「何も渡さない」のは新規作成。これは意図なので言わない。
      if (kind !== "detail" && names.length === 0) return;

      const wanted = keyNameOf(target);
      if (names.includes(wanted) || names.includes("id")) return;

      const wrote =
        names.length === 0
          ? "`params` そのものがありません"
          : `いま渡しているのは ${names.map((one) => `\`${one}\``).join(" / ")} だけです`;
      found.push({
        rule: "navigate-without-key-param",
        where: `${from === undefined ? "page" : `app.pages[${pages.indexOf(page)}]`}.actions[${index}].params`,
        says:
          `「${str(action.label) ?? str(action.id) ?? "このボタン"}」は1件の画面` +
          `「${str(target.title) ?? targetId}」へ行きますが、**鍵になる値を渡していません**` +
          `（${wrote}）。行き先は \`${wanted}\` という名前で受け取るので、` +
          `URL は変わるのに**開いた画面は空**になります。`,
        add:
          `\`params\` に \`${wanted}\` を入れる` +
          `（一覧の行から渡すなら \`{ ${wanted}: $row.${wanted} }\`）。`,
        key: "params",
        node: "action",
        ...(from === undefined ? {} : { page: from }),
      });
    });
  }
}

/**
 * 詳細画面をメニューに直接置いている。
 *
 * メニューから開くときに**鍵を渡す場所が無い**ので、開いても必ず空になります。
 * 詳細は一覧の行から開くもの（`type: navigate` ＋ `params`）です。
 */
function checkDetailInMenu(
  app: Dict,
  byId: Map<string, Dict>,
  found: Advice[],
  rules: AdviceRules,
): void {
  if (!enabled(rules, "detail-page-in-menu")) return;
  for (const leaf of menuLeaves(app.menu)) {
    const targetId = str(leaf.page);
    if (targetId === undefined) continue;
    const target = byId.get(targetId);
    if (target === undefined || str(target.type) !== "detail") continue;
    found.push({
      rule: "detail-page-in-menu",
      where: `app.menu（${str(leaf.label) ?? targetId}）`,
      says:
        `メニューの「${str(leaf.label) ?? targetId}」は1件を読む画面` +
        `（\`type: detail\`）を直接開きます。メニューには**鍵を渡す場所が無い**ので、` +
        `開いても必ず「データがありません」になります。`,
      add:
        "メニューからは外して、一覧の行から開いてください" +
        `（\`type: navigate\` ＋ \`params: { ${keyNameOf(target)}: $row.${keyNameOf(target)} }\`）。`,
      key: "menu",
      node: "app",
      page: targetId,
    });
  }
}
