// 案件の前書き（[parseProject]）と定義を突き合わせる。
//
// 出すのは**警告ではなく助言**。名前の形と言葉の選び方は「書いたのに効かない」では
// なく**案件の好み**なので、CI を落としてはいけない（落とすと「hatake は好みを
// 押し付ける」になり、事実を言う警告まで読まれなくなる）。物差しを外から渡す
// `--rules` と同じ扱いで、[renderAdvice] が「案件の決めごとです」と言う。
//
// 同じ名前は絞り込み・列・入力欄の3か所に出る。3件並べると読めないので**名前ごとに
// 1件**にまとめ、代わりに**何か所あるか**を言う（黙って1か所だけ見せると、直す範囲を
// 見誤る）。

import { type Advice } from "./advise.js";
import { type AdviceRules, DEFAULT_RULES, enabled } from "./adviseRules.js";
import { type DefinitionRegistry } from "./refs.js";
import {
  pageActions,
  rawFormFields,
  searchFilters,
  tableColumns,
} from "./pageParts.js";
import {
  isPlaceholderName,
  matchesShape,
  NAMING_WORDS,
  nameWords,
  type NamingTarget,
  type ProjectDocument,
  toShape,
} from "./project.js";

/**
 * 前書きから来る助言の規則名（全部）。
 *
 * 引ける形で置いてあるのは、**規則名を止められる側**（定義の隣の `advise-off`）が
 * 「その名前は規則か」を確かめるため。組み込みの物差し（[BUILTIN_RULES]）と違って
 * こちらは表を持たないので、名前がここにしか無いと、止める側は知らない名前を弾けない。
 * この下の `rule:` と食い違っていないことは試験が見ている（片方だけ足すと落ちる）。
 */
export const PROJECT_ADVICE_RULES = [
  "project-glossary-name",
  "project-glossary-word",
  "project-logic-misplaced",
  "project-logic-unregistered",
  "project-logic-unused",
  "project-name-shape",
  "project-name-suffix",
];

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const dicts = (v: unknown): Dict[] => list(v).filter(isDict);

/** まとめる前の1件（`key` が同じものは1件にまとめる）。 */
interface Raw {
  /** まとめるための鍵（同じ名前の話は1件にする）。 */
  same: string;
  advice: Advice;
}

/**
 * 案件の決めごとと定義の食い違いを挙げる。
 *
 * [rules] を受けるのは `off` を効かせるため（案件の決めごとの中でも「用語の言い換えは
 * まだ揃えない」のように、止めたいものが出る）。
 */
export function findProjectAdvice(
  document: Dict,
  project: ProjectDocument,
  rules: AdviceRules = DEFAULT_RULES,
  options: { registry?: DefinitionRegistry } = {},
): Advice[] {
  const raw: Raw[] = [];
  // 登録済みの一覧を渡されたときだけ言う（知らないのに「登録が無い」は嘘になる）。
  checkUnregisteredLogic(project, options.registry, raw);
  const app = isDict(document.app) ? document.app : undefined;
  if (app !== undefined) {
    checkMenu(dicts(app.menu), "app.menu", project, raw);
    dicts(app.pages).forEach((page, index) =>
      checkPage(page, `app.pages[${index}]`, project, raw),
    );
    // 「宣言したのに呼んでいない」は**全画面が揃っているときだけ**言える
    // （1枚だけ渡されたら、他の画面で呼んでいるかもしれない）。
    checkUnusedLogic(document, project, raw);
  }
  if (isDict(document.page)) checkPage(document.page, "page", project, raw);
  return merge(raw).filter((one) => enabled(rules, one.rule));
}

/**
 * 同じ話を1件にまとめる（`同じ名前は他に N か所` を添える）。
 *
 * 場所は**最初に見つかった所**。全部並べるより「どの名前を直すか」が読めるほうが
 * 直しやすいが、**何か所あるか**は言う（1か所だと思って直すと残る）。
 */
function merge(raw: Raw[]): Advice[] {
  const order: string[] = [];
  const groups = new Map<string, Raw[]>();
  for (const one of raw) {
    const found = groups.get(one.same);
    if (found === undefined) {
      order.push(one.same);
      groups.set(one.same, [one]);
    } else {
      found.push(one);
    }
  }
  return order.map((same) => {
    const group = groups.get(same) ?? [];
    const first = group[0].advice;
    if (group.length === 1) return first;
    return {
      ...first,
      says: `${first.says}（同じ名前は他に ${group.length - 1} か所）`,
    };
  });
}

function checkMenu(
  items: Dict[],
  path: string,
  project: ProjectDocument,
  raw: Raw[],
): void {
  items.forEach((item, index) => {
    const where = `${path}[${index}]`;
    checkRoles(item, where, "menuItem", project, raw);
    checkLabel(item, where, "menuItem", project, raw);
    checkMenu(dicts(item.items), `${where}.items`, project, raw);
  });
}

/**
 * 定義が呼んでいる**登録名**を全部集める（ボタンのプラグインと、検証の名前）。
 *
 * どちらも「アプリ側に登録して足す」口なので、業務ロジックの置き場として宣言した名前と
 * 突き合わせられる。明細の行の中にも書けるので、素の document を素直に潜る。
 */
function calledNames(node: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) {
    for (const one of node) calledNames(one, found);
    return found;
  }
  if (!isDict(node)) return found;
  const plugin = str(node.plugin);
  if (plugin !== undefined) found.add(plugin);
  for (const rule of dicts(node.validators)) {
    const type = str(rule.type);
    if (type !== undefined) found.add(type);
  }
  for (const value of Object.values(node)) calledNames(value, found);
  return found;
}

/**
 * 宣言した業務ロジックと、定義の食い違いを言う。
 *
 * ここで見るのは**画面1枚ごと**の食い違い＝`server` / `outside` の担当だと書いたのに、
 * その画面から呼んでいる。呼んでいる場所が分かるので、場所つきで言える。
 *
 * 「宣言したのに呼んでいない」は [checkUnusedLogic]（`app:` のときだけ）。それ以外
 * （サーバが本当にその規則を持っているか）は見られないので、言わない。
 */
function checkLogic(
  page: Dict,
  path: string,
  project: ProjectDocument,
  raw: Raw[],
): void {
  if (project.logic.length === 0) return;
  const called = calledNames(page);

  for (const rule of project.logic) {
    const name = rule.name;
    if (name === undefined) continue;
    const used = called.has(name);

    if ((rule.where === "server" || rule.where === "outside") && used) {
      const word = rule.where === "server" ? "サーバ" : "枠組みの外";
      raw.push({
        same: `project-logic-misplaced ${name}`,
        advice: {
          rule: "project-logic-misplaced",
          where: path,
          says:
            `業務ロジック「${rule.what}」は**${word}の担当**と前書きに書いてあるのに、` +
            `この定義が ${name} を呼んでいます＝言っていることと書いたものが` +
            `食い違っています${rule.why === undefined ? "" : `（${rule.why}）`}。`,
          add:
            "画面からは**結果だけ**を出す（`readOnlyWhen` / `enabledWhen` で見せて、" +
            "判断は呼ばない）か、前書きの where を直す。",
          key: "plugin",
          node: "action",
        },
      });
    }
  }
}

/**
 * `plugin` の担当と宣言したのに、**アプリ側に登録が無い**。
 *
 * 「担当はアプリ側」と前書きに書き、定義から呼ぶ所も書いたのに**登録を忘れる**と、
 * 押しても何も起きない画面になる（押すまで気づけない）。定義が呼んでいるかは前から
 * 見られたので、残っていたのは「登録が在るか」＝材料は `--registry` で来る。
 *
 * 決めごと:
 *   ・**登録済みの一覧を渡されたときだけ言う。** 知らないのに「無い」と言うのは嘘
 *   ・**定義が呼んでいるかは見ない。** 呼んでいなくても登録漏れは登録漏れで、
 *     呼んでいない側は [checkUnusedLogic] の担当（2つの別の穴を1つの規則にしない）
 *   ・**逆は言わない。** 登録が在るのに前書きに宣言が無いのは普通のこと
 *     （アプリには前書きに書かない登録もある）
 */
function checkUnregisteredLogic(
  project: ProjectDocument,
  registry: DefinitionRegistry | undefined,
  raw: Raw[],
): void {
  const known = registry?.plugins;
  if (known === undefined) return;
  const registered = new Set(known);
  for (const rule of project.logic) {
    const name = rule.name;
    if (name === undefined || rule.where !== "plugin") continue;
    if (registered.has(name)) continue;
    raw.push({
      same: `project-logic-unregistered ${name}`,
      advice: {
        rule: "project-logic-unregistered",
        where: "app",
        says:
          `業務ロジック「${rule.what}」は ${name} をアプリ側に登録して足す担当と` +
          "前書きに書いてありますが、**渡された登録済みの一覧にありません**" +
          "＝そのボタンは押しても何も起きません。",
        add:
          `アプリ側で \`${name}\` を登録する` +
          "（名前が違うだけなら、前書きか登録のどちらかを直す）。",
        key: "plugin",
        node: "action",
      },
    });
  }
}

/**
 * `plugin` の担当と宣言したのに、**どこからも呼んでいない**。
 *
 * これは `app:`（全画面が1枚に入った定義）のときだけ言う。1画面だけ渡されて「呼んで
 * いない」と言うと、他の画面で呼んでいる名前まで毎回鳴る＝助言が読まれなくなる。
 */
function checkUnusedLogic(
  document: Dict,
  project: ProjectDocument,
  raw: Raw[],
): void {
  const called = calledNames(document);
  for (const rule of project.logic) {
    const name = rule.name;
    if (name === undefined || rule.where !== "plugin" || called.has(name)) continue;
    raw.push({
      same: `project-logic-unused ${name}`,
      advice: {
        rule: "project-logic-unused",
        where: "app",
        says:
          `業務ロジック「${rule.what}」は ${name} をアプリ側に登録して足す担当と` +
          "前書きに書いてありますが、**どの画面からも呼んでいません**。",
        add:
          `ボタンに \`{ type: plugin, plugin: ${name} }\` を書く` +
          "（もう要らないなら前書きから消す／担当が違うなら where を直す）。",
        key: "plugin",
        node: "action",
      },
    });
  }
}

function checkPage(
  page: Dict,
  path: string,
  project: ProjectDocument,
  raw: Raw[],
): void {
  // ページのノード名は種別で変わる（`crudPage` / `searchPage` …）。助言が挙げるキーが
  // 本当に書けるかを確かめる側（[unwritableAdvice]）が引くので、素の "page" は渡せない。
  const pageNode = `${str(page.type) ?? ""}Page`;
  checkLogic(page, path, project, raw);
  checkShape(str(page.id), "page", { where: path, node: pageNode, key: "id" }, project, raw);
  checkShape(
    str(page.repository),
    "repository",
    { where: path, node: pageNode, key: "repository" },
    project,
    raw,
  );

  for (const [parts, node] of [
    [tableColumns(page), "column"],
    [searchFilters(page), "filter"],
    [rawFormFields(page), "field"],
  ] as const) {
    for (const part of parts) {
      const where = `${path}.${part.path.join(".")}`;
      const name = str(part.node.field);
      checkShape(name, "field", { where, node, key: "field" }, project, raw);
      checkSuffix(part.node, where, node, project, raw);
      checkLabel(part.node, where, node, project, raw);
      // 絞り込みには roles が書けない（書ける所だけを見る）。
      if (node !== "filter") checkRoles(part.node, where, node, project, raw);
    }
  }

  // ウィザードのステップ id（案件が snake_case でも、雛形は camelCase を出す）。
  dicts(page.steps).forEach((step, index) =>
    checkShape(
      str(step.id),
      "step",
      { where: `${path}.steps[${index}]`, node: "wizardStep", key: "id" },
      project,
      raw,
    ),
  );

  // ダッシュボードのカード id。
  dicts(page.items).forEach((item, index) =>
    checkShape(
      str(item.id),
      "card",
      { where: `${path}.items[${index}]`, node: "dashboardItem", key: "id" },
      project,
      raw,
    ),
  );

  for (const part of pageActions(page)) {
    const where = `${path}.${part.path.join(".")}`;
    checkShape(
      str(part.node.id),
      "action",
      { where, node: "action", key: "id" },
      project,
      raw,
    );
    // プラグイン名（アプリ側に登録する字＝人が話す名前でもある）。
    checkShape(
      str(part.node.plugin),
      "plugin",
      { where, node: "action", key: "plugin" },
      project,
      raw,
    );
    checkLabel(part.node, where, "action", project, raw);
    checkRoles(part.node, where, "action", project, raw);
  }
}

interface Spot {
  where: string;
  node: string;
  key: string;
}

/** 名前が決めごとの形になっているか。 */
function checkShape(
  name: string | undefined,
  target: NamingTarget,
  spot: Spot,
  project: ProjectDocument,
  raw: Raw[],
): void {
  const shape = project.naming.shapes[target];
  if (name === undefined || shape === undefined) return;
  if (isPlaceholderName(name) || matchesShape(name, shape)) return;
  raw.push({
    same: `project-name-shape ${target} ${name}`,
    advice: {
      rule: "project-name-shape",
      where: spot.where,
      says:
        `${NAMING_WORDS[target]} "${name}" は、案件の決めごとの形（${shape}）に` +
        "なっていません。",
      // 役割は並びで書くキーなので、そう見えるように書く（`roles: admin` は通らない）。
      add:
        `\`${spot.key}: ${spot.key === "roles" ? `[${toShape(name, shape)}]` : toShape(name, shape)}\`` +
        ` に直す（決めごと: naming.${target} = ${shape}）。`,
      key: spot.key,
      node: spot.node,
    },
  });
}

/** その型の項目は、名前をこう終わらせる（`type: date` → `〜Date`）。 */
function checkSuffix(
  node: Dict,
  where: string,
  referenceNode: string,
  project: ProjectDocument,
  raw: Raw[],
): void {
  const name = str(node.field);
  const type = str(node.type);
  if (name === undefined || type === undefined || isPlaceholderName(name)) return;
  const ending = project.naming.suffix[type];
  if (ending === undefined || name.endsWith(ending)) return;
  raw.push({
    same: `project-name-suffix ${name}`,
    advice: {
      rule: "project-name-suffix",
      where,
      says:
        `\`type: ${type}\` の項目 "${name}" は、案件の決めごとでは名前を ` +
        `"${ending}" で終わらせます。`,
      // 足す字は決めない（`orderDay` → `orderDayDate` のような名前を作ってしまう）。
      add: `"${ending}" で終わる名前に直す（決めごと: naming.suffix.${type} = ${ending}）。`,
      key: "field",
      node: referenceNode,
    },
  });
}

/** 役割名の形（役割は書ける所が多いので、見るのは書いてある所だけ）。 */
function checkRoles(
  node: Dict,
  where: string,
  referenceNode: string,
  project: ProjectDocument,
  raw: Raw[],
): void {
  for (const role of list(node.roles)) {
    checkShape(
      str(role),
      "role",
      { where: `${where}.roles`, node: referenceNode, key: "roles" },
      project,
      raw,
    );
  }
}

/**
 * ラベルの言葉を用語辞書と突き合わせる。
 *
 * 2つ見る:
 *   ・**呼ばない言葉**が出ている（`avoid`）＝言い換えの揺れ。辞書に書いてある字そのもの
 *     なので推測ではない
 *   ・辞書の言葉なのに、項目名が辞書の名前から来ていない。こちらは**名前からの推測**
 *     （`guess`）＝「取引先名」に `partnerName` と付けるのは正しいので、辞書の名前と
 *     完全に一致するかでは見られない。辞書の名前の**最初の語**が入っているかを見る
 */
function checkLabel(
  node: Dict,
  where: string,
  referenceNode: string,
  project: ProjectDocument,
  raw: Raw[],
): void {
  const label = str(node.label);
  if (label === undefined) return;
  const name = str(node.field) ?? str(node.id);

  for (const entry of project.glossary) {
    for (const word of entry.avoid) {
      if (!label.includes(word)) continue;
      raw.push({
        same: `project-glossary-word ${entry.term} ${label}`,
        advice: {
          rule: "project-glossary-word",
          where,
          says:
            // ラベルがその言葉そのものなら、二度言わない（読みにくいだけ）。
            (label === word
              ? `ラベル「${label}」は、案件の決めごとでは`
              : `ラベル「${label}」に「${word}」が入っています。案件の決めごとでは`) +
            `「${entry.term}」と呼びます${entry.note === undefined ? "" : `（${entry.note}）`}。`,
          add: `「${entry.term}」で言い直す。`,
          key: "label",
          node: referenceNode,
        },
      });
    }

    const declared = entry.field;
    if (declared === undefined || name === undefined) continue;
    if (!label.includes(entry.term) || isPlaceholderName(name)) continue;
    const stem = nameWords(declared)[0];
    if (stem === undefined || nameWords(name).includes(stem)) continue;
    raw.push({
      same: `project-glossary-name ${entry.term} ${name}`,
      advice: {
        rule: "project-glossary-name",
        where,
        says:
          `ラベルは「${entry.term}」の話なのに、名前 "${name}" に用語辞書の名前` +
          `（${declared}）の語 "${stem}" が入っていません。`,
        add:
          `辞書の名前に合わせる（「${entry.term}」は \`${declared}\`）。` +
          `別の属性なら "${stem}" で始まる名前にする。`,
        key: str(node.field) === undefined ? "id" : "field",
        node: referenceNode,
        guess: true,
      },
    });
  }
}
