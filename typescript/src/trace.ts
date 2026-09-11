// 言ったこと（[IntentDocument]）と、書いたもの（定義）を突き合わせる。
//
// 出せるのは**対応の有無**だけ。「意図どおりか」は言わない（それは人が読む）。
// 言えるのは4つで、値打ちの順に:
//
//   1. **言っていないのに入っている**（`orphan`）… どの要求からも来ていない項目・
//      ボタン。AI に書かせると必ず出る類で、しかも動くので気づけない
//   2. 言ったのに入っていない（`missing-target`）… 要求が指す相手が定義に無い
//   3. 未定と言ったのに決まっている（`undecided-but-decided`）
//   4. どこに落ちたか書いていない要求（`no-covers`）・人が見ていない下書き
//      （`unconfirmed`）
//
// 1 と 4 は**言うだけ**（既定では落とさない）。意図を後から書き始めた定義では最初から
// 全部出るので、落とすと道具ごと使われなくなる。2 と 3 は**確かに食い違っている**ので
// 落とす。`--require-intent` を渡したときだけ全部が落とす対象になる（CI 用）。

import {
  FieldTypes,
  formFields,
  wizardForm,
  type ActionDefinition,
  type FieldDefinition,
  type PageDefinition,
} from "./definition.js";
import {
  parseTarget,
  requirementsOf,
  type IntentDocument,
  type TargetKind,
} from "./intent.js";

/**
 * **由来を問う**種類。人が1つずつ「これが欲しい」と言うもの＝言っていないのに
 * 入っていたら疑うべきもの。
 *
 * `page` / `repository` / `role` は入れない。画面そのものは要求の全体だし、データの
 * 出どころと役割名は**業務が指定するもの**で、1件ずつ要求に紐づく性質のものではない
 * （並べると毎回同じ行が出て、報告そのものが読まれなくなる）。指したいときは
 * covers に書ける＝**指せるが、無くても言わない**。
 *
 * `logic` も入れない。前書きは**案件ぜんたい**の紙で、意図は**画面1枚**の紙なので、
 * 1枚の突き合わせで「どの要求からも来ていない」と言うと**他の画面の規則まで毎回鳴る**
 * （受注の締めが、商品照会の報告に並ぶ）。逆向き（言われたのに誰も担当していない）は
 * 1枚でも言えるので、そちらだけ言う。
 */
export const ORPHAN_KINDS: TargetKind[] = [
  "field",
  "filter",
  "column",
  "action",
  "card",
];

/** 突き合わせで出た1件。 */
export interface TraceFinding {
  kind:
    | "missing-target"
    | "undecided-but-decided"
    | "orphan"
    | "no-covers"
    | "unconfirmed";
  /** 要求の id（`orphan` は定義側の話なので無い）。 */
  id?: string;
  /** 相手（`field:orderNo`）。 */
  target?: string;
  /** 人に見せる1行。 */
  text: string;
}

export interface TraceResult {
  page: string;
  /**
   * 指せる相手（`field:orderNo` の形。並びは固定）。
   *
   * 定義から出るものに加えて、渡されれば**前書きに宣言した業務ロジック**
   * （`logic:<名前>`）も入る。
   */
  targets: string[];
  /** 要求＋決めごとの件数。 */
  requirements: number;
  /** 意図の1枚が在ったか（無ければ突き合わせは何も言えない）。 */
  hasIntent: boolean;
  findings: TraceFinding[];
  /** 終わりの判定（意図に書いてあるものをそのまま）。 */
  acceptance: string[];
}

const filtersOf = (page: PageDefinition) =>
  "search" in page && page.search !== undefined ? page.search.filters : [];

const columnsOf = (page: PageDefinition) =>
  "table" in page ? page.table.columns : [];

const cardsOf = (page: PageDefinition) => ("items" in page ? page.items : []);

const actionsOf = (page: PageDefinition): ActionDefinition[] =>
  "actions" in page ? page.actions : [];

/** 手で入れる項目（ステップ入力は枠を持たないので、ステップから畳む）。 */
function inputFields(page: PageDefinition): FieldDefinition[] {
  if (page.kind === "wizard") return formFields(wizardForm(page));
  return "form" in page ? formFields(page.form) : [];
}

/** 定義が名指ししている Repository（画面・カード・別テーブルの明細）。 */
function repositoriesOf(page: PageDefinition): string[] {
  const found: string[] = [];
  if ("repository" in page && typeof page.repository === "string") {
    found.push(page.repository);
  }
  for (const card of cardsOf(page)) {
    if (card.repository !== undefined) found.push(card.repository);
  }
  for (const field of inputFields(page)) {
    if (field.type === FieldTypes.subTable && field.source !== undefined) {
      found.push(field.source.repository);
    }
  }
  return found;
}

/** 定義に出てくる役割の名前（列・項目・ボタンに書いたもの）。 */
function rolesOf(page: PageDefinition): string[] {
  return [
    ...columnsOf(page).flatMap((one) => one.roles),
    ...inputFields(page).flatMap((one) => one.roles),
    ...actionsOf(page).flatMap((one) => one.roles),
  ];
}

/** 指せる相手1つと、その**業務の言葉**（指示文と突き合わせるのに要る）。 */
export interface TraceablePart {
  /** `field:orderNo` の形。 */
  target: string;
  /** 定義に書いてあるラベル（無い種類は名前そのもの）。 */
  label: string;
  /** 定義の中の名前（項目名・id・キー）。 */
  name: string;
}

/**
 * 定義の中で**指せる相手**を全部、業務の言葉つきで。並びは固定（毎回同じ順で
 * 読めるように）。
 *
 * 明細の行の項目は、その明細（`field:<項目>`）の一部として数える（分けると1つの
 * 要求に何行も書くことになり、誰も書かなくなる）。
 */
export function traceableParts(page: PageDefinition): TraceablePart[] {
  const found: TraceablePart[] = [
    { target: `page:${page.id}`, label: page.title, name: page.id },
    ...repositoriesOf(page).map((one) => ({
      target: `repository:${one}`,
      label: one,
      name: one,
    })),
    ...filtersOf(page).map((one) => ({
      target: `filter:${one.field}`,
      label: one.label,
      name: one.field,
    })),
    ...columnsOf(page).map((one) => ({
      target: `column:${one.field}`,
      label: one.label,
      name: one.field,
    })),
    ...inputFields(page).map((one) => ({
      target: `field:${one.field}`,
      label: one.label,
      name: one.field,
    })),
    ...actionsOf(page).map((one) => ({
      target: `action:${one.id}`,
      label: one.label,
      name: one.id,
    })),
    ...cardsOf(page).map((one) => ({
      target: `card:${one.id}`,
      label: one.title,
      name: one.id,
    })),
    ...rolesOf(page).map((one) => ({
      target: `role:${one}`,
      label: one,
      name: one,
    })),
  ];
  const seen = new Set<string>();
  return found.filter((one) => {
    if (seen.has(one.target)) return false;
    seen.add(one.target);
    return true;
  });
}

/** 定義の中で指せる相手（[traceableParts] の名前だけ）。 */
export const definitionTargets = (page: PageDefinition): string[] =>
  traceableParts(page).map((one) => one.target);

/**
 * 定義と意図を突き合わせる。
 *
 * [options.logic] は**案件の前書きに宣言した業務ロジックの名前**（`hatake.project.yaml`
 * の `logic[].name`）。渡すと `logic:<名前>` を指せる相手に加える＝定義に書けない規則
 * （締め・引当・承認）についても「言われたのに誰も担当していない」「宣言したのにどの
 * 要求からも来ていない」を言える。渡さなければ `logic:` は**指せない相手**として扱う
 * （前書きが無い案件で鳴らないように）。
 */
export function traceIntent(
  page: PageDefinition,
  intent?: IntentDocument,
  options: { logic?: string[] } = {},
): TraceResult {
  const targets = [
    ...definitionTargets(page),
    ...(options.logic ?? []).map((name) => `logic:${name}`),
  ];
  const known = new Set(targets);
  const findings: TraceFinding[] = [];

  if (intent === undefined) {
    return {
      page: page.id,
      targets,
      requirements: 0,
      hasIntent: false,
      findings,
      acceptance: [],
    };
  }

  const requirements = requirementsOf(intent);
  const covered = new Set<string>();

  for (const one of requirements) {
    for (const target of one.covers) {
      covered.add(target);
      if (known.has(target)) continue;
      // 業務ロジックは**定義ではなく前書き**に宣言するので、言い方を変える
      // （「定義にありません」と言われても、書く場所が違うので直せない）。
      const isLogic = target.startsWith("logic:");
      findings.push({
        kind: "missing-target",
        id: one.id,
        target,
        text: isLogic
          ? `${one.id}「${one.text}」が指している ${target} は、案件の前書きに` +
            "宣言がありません＝**誰も担当していません**（`hatake.project.yaml` の " +
            "`logic:` に、担当（definition / plugin / server / outside）を書く）。"
          : `${one.id}「${one.text}」が指している ${target} は定義にありません` +
            `＝言ったのに入っていない、か、名前が違います。`,
      });
    }
    if (one.covers.length === 0) {
      findings.push({
        kind: "no-covers",
        id: one.id,
        text:
          `${one.id}「${one.text}」は、定義のどこに落ちたか書いていません` +
          `（covers）。入っているかどうかを機械が言えません。`,
      });
    }
    if (!one.confirmed) {
      findings.push({
        kind: "unconfirmed",
        id: one.id,
        text:
          `${one.id}「${one.text}」は AI が読み取った下書きのままです` +
          `（人が見たら confirmed: true にしてください）。`,
      });
    }
  }

  // 未定と言ったのに、定義では決まっている。
  for (const one of intent.undecided) {
    for (const target of one.covers) {
      if (!known.has(target)) continue;
      findings.push({
        kind: "undecided-but-decided",
        id: one.id,
        target,
        text:
          `${one.id}「${one.text}」は未定のはずですが、定義には ${target} が` +
          `在ります＝誰かが決めています（人が決めたなら asked / decisions に移す）。`,
      });
    }
  }

  // 由来の無い定義（**言っていないのに入っている**）。
  for (const target of targets) {
    const { kind } = parseTarget(target, page.id);
    if (!ORPHAN_KINDS.includes(kind)) continue;
    if (covered.has(target)) continue;
    findings.push({
      kind: "orphan",
      target,
      text: `${target} は、どの要求からも来ていません。`,
    });
  }

  return {
    page: page.id,
    targets,
    requirements: requirements.length,
    hasIntent: true,
    findings,
    acceptance: intent.acceptance,
  };
}

/** 確かに食い違っているもの（既定で落とす対象）。 */
export const HARD_KINDS: TraceFinding["kind"][] = [
  "missing-target",
  "undecided-but-decided",
];

export const hardFindings = (result: TraceResult): TraceFinding[] =>
  result.findings.filter((one) => HARD_KINDS.includes(one.kind));

const HEADINGS: Record<TraceFinding["kind"], string> = {
  "missing-target": "言ったのに入っていない",
  "undecided-but-decided": "未定なのに決まっている",
  orphan: "由来の無い定義（言っていないのに入っている）",
  "no-covers": "どこに落ちたか書いていない要求",
  unconfirmed: "人が見ていない下書き",
};

/** 人が読む形（`--json` でないとき）。 */
export function traceLines(result: TraceResult): string[] {
  const lines: string[] = [];
  if (!result.hasIntent) {
    lines.push(
      `${result.page} には意図の1枚（intent）がありません。` +
        `定義の中に指せる相手は ${result.targets.length} 件あります` +
        `が、どれが誰の要求から来たのかは分かりません。`,
    );
    return lines;
  }
  lines.push(
    `${result.page}: 要求 ${result.requirements} 件 / ` +
      `定義の相手 ${result.targets.length} 件`,
  );
  for (const kind of [
    "missing-target",
    "undecided-but-decided",
    "orphan",
    "no-covers",
    "unconfirmed",
  ] as TraceFinding["kind"][]) {
    const found = result.findings.filter((one) => one.kind === kind);
    if (found.length === 0) continue;
    lines.push(`${HEADINGS[kind]}（${found.length} 件）:`);
    for (const one of found) lines.push(`  ・${one.text}`);
  }
  if (result.findings.length === 0) {
    lines.push("要求と定義は1対1です（言ったものは全部入り、余りもありません）。");
  }
  if (result.acceptance.length > 0) {
    lines.push("終わりの判定:");
    for (const one of result.acceptance) lines.push(`  ・${one}`);
  }
  return lines;
}
