// 案件ごとの決めごと（「この場所には必ずこのキーを書く」）を当てる。
//
// 組み込みの助言は「業務システムで大抵こうなる」という一般論だが、現場の決めごとは会社ごと。
// それを**規則を書く言語を作らずに**渡せるようにしたのがこれ。見られるのは「どの場所の・
// どのキーが・書かれているか」だけで、条件式は書けない（書けるようにすると設定が小さな
// プログラムになり、読める人が減る）。
//
// 場所の言い方は組み込みの助言と同じ道（`app.pages[2].table.columns[3].sortable`）。
// 報告の形も同じなので、読む側から見て「組み込みか案件の決めごとか」は規則名でしか違わない。

import { type Advice } from "./advise.js";
import { type AdviceRules, enabled, type RequireNode, type RequireRule } from "./adviseRules.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const dicts = (v: unknown): Dict[] => (Array.isArray(v) ? v.filter(isDict) : []);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** 見る場所1つ（その節点と、そこまでの道）。 */
interface Spot {
  path: string;
  node: Dict;
}

/** 場所の呼び方（報告の文に出る）。 */
const NODE_WORDS: Record<RequireNode, string> = {
  page: "画面",
  column: "一覧の列",
  filter: "絞り込みの条件",
  field: "入力の項目",
  action: "ボタン",
};

/**
 * 「1つも書かれていない」を言うときの場所。
 *
 * 個別の節点ではなくまとまりを指す（列が10本あって1本も並べ替えできないとき、10件出すのは
 * 助言としてうるさい）。
 */
const groupPath = (node: RequireNode, path: string, kind: string): string => {
  switch (node) {
    case "page":
      return path;
    case "column":
      return `${path}.table.columns`;
    case "filter":
      return `${path}.search.filters`;
    case "field":
      return kind === "wizard" ? `${path}.steps` : `${path}.form`;
    case "action":
      return `${path}.actions`;
  }
};

/** リファレンスのノード名（挙げるキーが本当に書けるかを確かめるのに使う）。 */
const referenceNode = (node: RequireNode, kind: string): string =>
  node === "page" ? `${kind}Page` : node;

/** その場所の節点を全部（道つきで）。 */
function nodesOf(page: Dict, path: string, node: RequireNode): Spot[] {
  switch (node) {
    case "page":
      return [{ path, node: page }];
    case "column": {
      const table = isDict(page.table) ? page.table : {};
      return dicts(table.columns).map((column, i) => ({
        path: `${path}.table.columns[${i}]`,
        node: column,
      }));
    }
    case "filter": {
      const search = isDict(page.search) ? page.search : {};
      return dicts(search.filters).map((filter, i) => ({
        path: `${path}.search.filters[${i}]`,
        node: filter,
      }));
    }
    case "field": {
      const spots: Spot[] = [];
      const form = isDict(page.form) ? page.form : undefined;
      if (form !== undefined) {
        dicts(form.sections).forEach((section, s) =>
          dicts(section.fields).forEach((field, f) =>
            spots.push({ path: `${path}.form.sections[${s}].fields[${f}]`, node: field }),
          ),
        );
      }
      dicts(page.steps).forEach((step, s) =>
        dicts(step.fields).forEach((field, f) =>
          spots.push({ path: `${path}.steps[${s}].fields[${f}]`, node: field }),
        ),
      );
      return spots;
    }
    case "action":
      return dicts(page.actions).map((action, i) => ({
        path: `${path}.actions[${i}]`,
        node: action,
      }));
  }
}

/**
 * 書いてあるか。
 *
 * 空で書いてあるものは**書いていない**と見る（`roles: []` は「誰にも見せない」ではなく
 * 「まだ決めていない」なので、決めごととしては未記入）。
 */
function written(value: unknown): boolean {
  if (value === undefined || value === null || value === false || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isDict(value)) return Object.keys(value).length > 0;
  return true;
}

/** `when` で絞る（その節点の値が全部一致するものだけ見る）。 */
const matches = (node: Dict, when: RequireRule["when"]): boolean =>
  when === undefined ||
  Object.entries(when).every(([key, value]) => node[key] === value);

/** 案件の決めごとを1ページぶん当てる。 */
export function checkRequired(
  page: Dict,
  path: string,
  found: Advice[],
  rules: AdviceRules,
): void {
  const kind = str(page.type) ?? "";
  for (const rule of rules.require) {
    if (!enabled(rules, rule.rule)) continue;
    if (rule.pages !== undefined && !rule.pages.includes(kind)) continue;
    const spots = nodesOf(page, path, rule.node).filter((spot) =>
      matches(spot.node, rule.when),
    );
    // 見る場所そのものが無いときは黙る（一覧の無い画面に「列に書け」は言えない）。
    if (spots.length === 0) continue;
    const missing = spots.filter((spot) => !written(spot.node[rule.key]));
    const word = NODE_WORDS[rule.node];
    const node = referenceNode(rule.node, kind);

    if (rule.every === true) {
      for (const spot of missing) {
        found.push({
          rule: rule.rule,
          where: `${spot.path}.${rule.key}`,
          says:
            rule.says ??
            `${word}（${str(spot.node.field) ?? str(spot.node.id) ?? spot.path}）に ` +
              `${rule.key} がありません。この案件では全部に書くことになっています。`,
          add: rule.add ?? `\`${rule.key}\` を書く。`,
          key: rule.key,
          node,
        });
      }
      continue;
    }
    if (missing.length < spots.length) continue; // 1つでも書いてあればよい
    found.push({
      rule: rule.rule,
      where: groupPath(rule.node, path, kind),
      says:
        rule.says ??
        `${word}のどれにも ${rule.key} がありません。この案件では書くことになっています。`,
      add: rule.add ?? `どれかに \`${rule.key}\` を書く。`,
      key: rule.key,
      node,
    });
  }
}
