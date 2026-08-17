// 定義を「この画面は何をするか」に開く。
//
// 読み手は**DSL を知らない人**。AI に定義を書かせるほど、書けたものを人がレビューする
// 手段が要る。YAML を読める人だけがレビューできる状態は、AI First の逆をやっている。
//
// 出すのは画面単位の説明で、キーの説明はしない（それは reference.json の担当）。
// 「何が出るか」「何ができるか」「何ができないか」「誰に見えるか」の4つに寄せる。
//
// 機械が拾えない間違い（条件の向きを間違えた・意図と違う項目を必須にした）は、
// 警告では捕まえられない。それを人が読んで気づくための出力でもある
// （spec/failures.json の diagnosis が空の件が、まさにそれ）。

import {
  type ActionDefinition,
  ActionTypes,
  type AppDefinition,
  type ColumnDefinition,
  type DashboardItemDefinition,
  type FieldDefinition,
  FieldTypes,
  type FilterDefinition,
  type FormDefinition,
  menuIsGroup,
  type MenuItem,
  type PageDefinition,
  type SectionDefinition,
  type ValidatorDefinition,
} from "./definition.js";

/** 説明のひとまとまり（見出し＋行）。行はそのまま人に見せる文。 */
export interface ExplainSection {
  title: string;
  lines: string[];
}

export interface ExplainDocument {
  /** 1行で何の画面か。 */
  headline: string;
  sections: ExplainSection[];
}

/** ページ種別 → その画面が何をするものか。 */
const PAGE_KINDS: Record<string, { what: string; cannot: string[] }> = {
  crud: {
    what: "検索して一覧に出し、その場で登録・修正・削除までできる画面",
    cannot: [],
  },
  master: {
    what: "マスタをメンテナンスする画面（検索・一覧・登録・修正・削除）",
    cannot: [],
  },
  search: {
    what: "検索して一覧を見るだけの画面",
    cannot: ["登録・修正・削除はできない（照会専用）"],
  },
  detail: {
    what: "1件の内容を読むだけの画面",
    cannot: ["この画面では書き換えられない（読み取り専用）"],
  },
  form: {
    what: "1件を入力する画面（新規と編集の両方）",
    cannot: ["一覧は無い（開く先は呼び出し側が決める）"],
  },
  wizard: {
    what: "入力をステップに分けた画面",
    cannot: ["途中では保存しない（最後にまとめて1回）"],
  },
  dashboard: {
    what: "数字とグラフのカードを並べて見せる画面",
    cannot: ["ここからデータは書き換えられない"],
  },
  report: {
    what: "印刷向けの帳票",
    cannot: ["画面から書き換えはできない"],
  },
};

/** 検索の突合 → 日本語。 */
const OPERATORS: Record<string, string> = {
  equals: "完全一致",
  notEquals: "一致しないもの",
  contains: "部分一致",
  startsWith: "前方一致",
  endsWith: "後方一致",
  gt: "より大きい",
  gte: "以上",
  lt: "より小さい",
  lte: "以下",
  between: "期間・範囲（開始と終了の2つ）",
  in: "いずれかに一致",
};

/** 条件の演算子 → 日本語（`{field} が …`）。 */
const CONDITIONS: Record<string, (value: string) => string> = {
  equals: (v) => `が ${v} のとき`,
  notEquals: (v) => `が ${v} でないとき`,
  gt: (v) => `が ${v} より大きいとき`,
  gte: (v) => `が ${v} 以上のとき`,
  lt: (v) => `が ${v} より小さいとき`,
  lte: (v) => `が ${v} 以下のとき`,
  contains: (v) => `に ${v} を含むとき`,
  in: (v) => `が ${v} のどれかのとき`,
  isEmpty: () => "が空のとき",
  isNotEmpty: () => "が入っているとき",
};

/** 項目の型 → 入力の見え方。text は既定なので言わない。 */
const FIELD_TYPES: Record<string, string> = {
  textarea: "複数行",
  number: "数値",
  select: "選択",
  multiSelect: "複数選択",
  checkbox: "チェックボックス",
  radio: "ラジオ",
  date: "日付",
  dateTime: "日時",
  time: "時刻",
  subTable: "明細（表で複数行）",
};

const VALIDATORS: Record<string, (params: Record<string, unknown>) => string> = {
  required: () => "必須",
  maxLength: (p) => `${p.value} 文字以内`,
  minLength: (p) => `${p.value} 文字以上`,
  min: (p) => `${p.value} 以上`,
  max: (p) => `${p.value} 以下`,
  pattern: () => "決まった書式",
  email: () => "メールアドレスの形",
  postalCode: () => "郵便番号の形",
  numeric: () => "数字だけ",
};

/** フォーマッタ → 見え方。**例を見せる**のがレビューには一番早い。 */
const FORMATTERS: Record<string, string> = {
  currency: "¥1,234,567 のように",
  percent: "12.3% のように",
  date: "2026/07/22 のように",
  wareki: "令和8年7月22日 のように",
  postal: "123-4567 のように",
  mask: "一部を隠して",
};

const CONVERTERS: Record<string, string> = {
  toHankaku: "全角→半角",
  toZenkaku: "半角→全角",
  hiraToKata: "ひらがな→カタカナ",
  kataToHira: "カタカナ→ひらがな",
  trim: "前後の空白を落とす",
  collapseSpaces: "連続した空白を1つに",
  parseNumber: "数値に直す",
};

const ACTIONS: Record<string, string> = {
  create: "新規入力を開く",
  edit: "編集を開く",
  delete: "削除する",
  navigate: "別の画面へ移る",
  export: "内容をファイルに出す",
  plugin: "アプリ側の処理を呼ぶ",
};

const AGGREGATES: Record<string, string> = {
  count: "件数",
  sum: "合計",
  avg: "平均",
  min: "最小",
  max: "最大",
};

/** 項目名 → ラベル、と 項目名 → (値 → 選択肢のラベル)。条件を人の言葉にするため。 */
interface Vocabulary {
  labels: Map<string, string>;
  options: Map<string, Map<string, string>>;
}

const emptyVocabulary = (): Vocabulary => ({
  labels: new Map(),
  options: new Map(),
});

function learn(vocabulary: Vocabulary, items: (FieldDefinition | FilterDefinition | ColumnDefinition)[]): void {
  for (const item of items) {
    vocabulary.labels.set(item.field, item.label);
    const options = "options" in item ? item.options : [];
    if (options.length > 0) {
      vocabulary.options.set(
        item.field,
        new Map(options.map((o) => [String(o.value), o.label])),
      );
    }
    if ("rowFields" in item) learn(vocabulary, item.rowFields);
  }
}

/** 条件を日本語にする。`{ mode: create }` は状態の話なので別扱い。 */
export function describeCondition(
  condition: Record<string, unknown> | undefined,
  vocabulary: Vocabulary = emptyVocabulary(),
): string {
  if (condition === undefined) return "";
  const mode = condition.mode;
  if (typeof mode === "string") {
    // 「だけ」は呼び出し側が付ける（…だけ出る／…だけ必須／…は直せない）。
    return mode === "create" ? "新規のとき" : "編集のとき";
  }
  for (const [key, joiner] of [
    ["all", "かつ"],
    ["any", "または"],
  ] as const) {
    const parts = condition[key];
    if (Array.isArray(parts)) {
      const described = parts
        .map((p) => describeCondition(p as Record<string, unknown>, vocabulary))
        .filter((text) => text !== "");
      if (described.length > 0) return described.join(`、${joiner} `);
    }
  }
  if (condition.not !== undefined) {
    const inner = describeCondition(
      condition.not as Record<string, unknown>,
      vocabulary,
    );
    return inner === "" ? "" : `${inner}の逆`;
  }

  const field = condition.field;
  if (typeof field !== "string") return "";
  const label = vocabulary.labels.get(field) ?? field;
  const operator = typeof condition.operator === "string" ? condition.operator : "equals";
  const raw = condition.value;
  const shown = Array.isArray(raw)
    ? raw.map((v) => valueLabel(vocabulary, field, v)).join(" / ")
    : valueLabel(vocabulary, field, raw);
  const phrase = CONDITIONS[operator];
  if (phrase === undefined) {
    // 条件が理解しない演算子。ここで嘘をつかず、そう言う（警告でも出る）。
    return `${label} の条件（${operator} は条件では使えません）`;
  }
  return `${label} ${phrase(shown)}`;
}

const valueLabel = (
  vocabulary: Vocabulary,
  field: string,
  value: unknown,
): string => vocabulary.options.get(field)?.get(String(value)) ?? String(value);

/**
 * 説明を組み立てる。ページ1枚ぶん。
 *
 * [raw] は素の `page:` の中身。解析後のモデルが**落としている**もの（`navigate` の
 * 行き先＝`action.page`。TypeScript 版はバックエンド用なので持っていない）を補うため
 * だけに使う。無しでも説明は出るが、遷移先が言えなくなる。
 */
export function explainPage(
  page: PageDefinition,
  raw: Record<string, unknown> = {},
): ExplainDocument {
  const kind = PAGE_KINDS[page.kind] ?? { what: page.kind, cannot: [] };
  const vocabulary = emptyVocabulary();
  const form = "form" in page ? page.form : undefined;
  if (form !== undefined) {
    for (const section of form.sections) learn(vocabulary, section.fields);
  }
  if ("steps" in page) {
    for (const step of page.steps) learn(vocabulary, step.fields);
  }
  if ("table" in page) learn(vocabulary, page.table.columns);
  if (page.kind !== "dashboard" && "search" in page && page.search !== undefined) {
    learn(vocabulary, page.search.filters);
  }

  const sections: ExplainSection[] = [];
  const source: string[] = [];
  if ("repository" in page && page.repository !== undefined) {
    source.push(`データの出どころは ${page.repository}（アプリ側が用意する）。`);
  }
  if ("keyField" in page) {
    source.push(`1件を指すキーは ${page.keyField}。`);
  }
  if (source.length > 0) sections.push({ title: "データ", lines: source });

  if ("search" in page && page.search !== undefined) {
    sections.push({
      title: "絞り込める条件",
      lines: page.search.filters.map((filter) =>
        describeFilter(filter, vocabulary),
      ),
    });
  }
  if ("table" in page) sections.push(describeTable(page));
  if (form !== undefined) sections.push(...describeForm(form, vocabulary));
  if ("steps" in page) {
    sections.push({
      title: "入力の順番",
      lines: page.steps.map(
        (step, i) =>
          `${i + 1}. ${step.title}（${step.fields.length} 項目）` +
          (step.description === undefined ? "" : ` — ${step.description}`),
      ),
    });
    for (const step of page.steps) {
      sections.push(...describeFields(step.fields, `${step.title}の項目`, vocabulary));
    }
  }
  if ("items" in page) {
    sections.push(describeDashboard(page.items, vocabulary.labels));
  }
  if ("report" in page) sections.push(describeReport(page.report));

  if (page.actions.length > 0) {
    const targets = navigateTargets(raw);
    sections.push({
      title: "できる操作",
      lines: page.actions.map((action) =>
        describeAction(action, targets.get(action.id)),
      ),
    });
  }
  const rowActions = "table" in page ? page.table.rowActions : [];
  if (rowActions.length > 0) {
    const labels = new Map(page.actions.map((a) => [a.id, a.label]));
    sections.push({
      title: "行ごとの操作（一覧の各行に出る）",
      lines: rowActions.map((id) => {
        const builtin =
          id === "edit" ? "編集を開く" : id === "delete" ? "削除する" : undefined;
        return labels.get(id) ?? builtin ?? `${id}（対応するボタンの宣言が無い）`;
      }),
    });
  }

  const gated = collectRoles(page);
  if (gated.length > 0) sections.push({ title: "誰に見えるか", lines: gated });

  const cannot = [...kind.cannot, ...impliedLimits(page)];
  if (cannot.length > 0) sections.push({ title: "この画面でできないこと", lines: cannot });

  return {
    headline: `${page.title}（${page.id}）— ${kind.what}`,
    sections: sections.filter((s) => s.lines.length > 0),
  };
}

function describeFilter(filter: FilterDefinition, vocabulary: Vocabulary): string {
  const operator = OPERATORS[filter.operator] ?? filter.operator;
  const options =
    filter.options.length > 0
      ? `。選べるのは ${filter.options.map((o) => o.label).join(" / ")}`
      : "";
  const linked =
    filter.optionsFrom !== undefined
      ? `。${
          vocabulary.labels.get(filter.optionsFrom) ?? filter.optionsFrom
        }を選ぶと、それに合うものだけになる`
      : "";
  const fetched =
    filter.optionsSource !== undefined
      ? `。選択肢は ${filter.optionsSource.repository} から引く`
      : "";
  return `${filter.label} … ${operator}${options}${linked}${fetched}`;
}

function describeTable(page: PageDefinition & { table: { columns: ColumnDefinition[]; pagination: { enabled: boolean; pageSize: number } } }): ExplainSection {
  const lines = page.table.columns.map((column) => {
    const notes = [
      ...(column.format === undefined
        ? []
        : [`${FORMATTERS[column.format] ?? `${column.format} で`}見せる`]),
      ...(column.sortable ? ["並べ替えできる"] : []),
    ];
    return notes.length === 0
      ? column.label
      : `${column.label}（${notes.join("、")}）`;
  });
  // 帳票は印刷なので、一覧のページングの話はしない（`rowsPerPage` が別にある）。
  if (page.kind !== "report") {
    const pagination = page.table.pagination;
    lines.push(
      pagination.enabled
        ? `${pagination.pageSize} 件ずつページングする`
        : "ページングしない（全件そのまま出す）",
    );
  }
  return {
    title: page.kind === "report" ? "印刷する列" : "一覧に出る列",
    lines,
  };
}

function describeForm(form: FormDefinition, vocabulary: Vocabulary): ExplainSection[] {
  const sections: ExplainSection[] = [];
  for (const section of form.sections) {
    const title = section.title ?? "入力する項目";
    const when = describeCondition(section.visibleWhen, vocabulary);
    sections.push(
      ...describeFields(
        section.fields,
        when === "" ? title : `${title}（${when}だけ出る枠）`,
        vocabulary,
      ),
    );
  }
  return sections;
}

function describeFields(
  fields: FieldDefinition[],
  title: string,
  vocabulary: Vocabulary,
): ExplainSection[] {
  if (fields.length === 0) return [];
  return [{ title, lines: fields.map((field) => describeField(field, vocabulary)) }];
}

function describeField(field: FieldDefinition, vocabulary: Vocabulary): string {
  const notes: string[] = [];
  const type = FIELD_TYPES[field.type];
  if (type !== undefined) notes.push(type);
  if (field.required) notes.push("必須");
  const requiredWhen = describeCondition(field.requiredWhen, vocabulary);
  if (requiredWhen !== "") notes.push(`${requiredWhen}だけ必須`);
  if (field.readOnly) notes.push("読み取り専用");
  const readOnlyWhen = describeCondition(field.readOnlyWhen, vocabulary);
  if (readOnlyWhen !== "") notes.push(`${readOnlyWhen}は直せない`);
  const visibleWhen = describeCondition(field.visibleWhen, vocabulary);
  if (visibleWhen !== "") notes.push(`${visibleWhen}だけ出る`);
  const enabledWhen = describeCondition(field.enabledWhen, vocabulary);
  if (enabledWhen !== "") notes.push(`${enabledWhen}だけ触れる`);
  if (field.options.length > 0) {
    notes.push(`選べるのは ${field.options.map((o) => o.label).join(" / ")}`);
  }
  if (field.optionsFrom !== undefined) {
    notes.push(
      `${vocabulary.labels.get(field.optionsFrom) ?? field.optionsFrom}に合う選択肢だけ出す`,
    );
  }
  if (field.optionsSource !== undefined) {
    notes.push(`選択肢は ${field.optionsSource.repository} から引く`);
  }
  const rules = field.validators.map(describeValidator).filter((r) => r !== "");
  if (rules.length > 0) notes.push(rules.join("・"));
  if (field.normalize.length > 0) {
    notes.push(
      `保存前に整える（${field.normalize.map((n) => CONVERTERS[n] ?? n).join("・")}）`,
    );
  }
  if (field.computed !== undefined) {
    notes.push("他の項目から自動で計算する（手では入れない）");
  }
  if (field.format !== undefined) {
    notes.push(`${FORMATTERS[field.format] ?? `${field.format} で`}見せる`);
  }
  if (field.type === FieldTypes.subTable) {
    const rows = (field.rowFields.length > 0 ? field.rowFields : field.columns).map(
      (row) => row.label,
    );
    if (rows.length > 0) notes.push(`1行は ${rows.join("・")}`);
    notes.push(
      field.source === undefined
        ? "行はこのレコードと一緒に保存する"
        : `行は ${field.source.repository} に別で持つ（ページングする）`,
    );
  }
  if (field.roles.length > 0) notes.push(`${field.roles.join(" / ")} だけに見える`);
  return notes.length === 0 ? field.label : `${field.label} … ${notes.join("、")}`;
}

const describeValidator = (rule: ValidatorDefinition): string =>
  VALIDATORS[rule.type]?.(rule.params) ?? `${rule.type} の規則`;

/** 素の定義から「アクション id → 遷移先ページ id」を拾う。 */
function navigateTargets(raw: Record<string, unknown>): Map<string, string> {
  const found = new Map<string, string>();
  const actions = Array.isArray(raw.actions) ? raw.actions : [];
  for (const entry of actions) {
    if (typeof entry !== "object" || entry === null) continue;
    const action = entry as Record<string, unknown>;
    if (typeof action.id === "string" && typeof action.page === "string") {
      found.set(action.id, action.page);
    }
  }
  return found;
}

function describeAction(action: ActionDefinition, target?: string): string {
  const what = ACTIONS[action.type] ?? `${action.type}`;
  const to =
    action.type === ActionTypes.navigate && target !== undefined
      ? `（${target} へ）`
      : action.type === ActionTypes.plugin && action.plugin !== undefined
        ? `（${action.plugin}）`
        : "";
  const confirm =
    action.confirm !== undefined
      ? "。押すと確認を出す"
      : action.type === ActionTypes.delete
        ? "。押すと確認を出す（削除は既定で確認する）"
        : "";
  const after =
    action.onSuccess?.page !== undefined
      ? `。終わったら ${action.onSuccess.page} へ移る`
      : action.onSuccess?.message !== undefined
        ? `。終わったら「${action.onSuccess.message}」と出す`
        : "";
  const roles =
    action.roles.length > 0 ? `。${action.roles.join(" / ")} だけに出る` : "";
  return `${action.label} … ${what}${to}${confirm}${after}${roles}`;
}

function describeDashboard(
  items: DashboardItemDefinition[],
  labels: Map<string, string>,
): ExplainSection {
  const named = (field: string | undefined): string =>
    field === undefined ? "" : `（${labels.get(field) ?? field}）`;
  return {
    title: "並ぶカード",
    lines: items.map((item) => {
      const what =
        item.chart !== undefined
          ? `${item.chart.kind} のグラフ（${
              labels.get(item.chart.labelField) ?? item.chart.labelField
            }ごと）`
          : item.columns.length > 0
            ? `一覧（${item.columns.map((c) => c.label).join("・")}）`
            : item.value === undefined
              ? "件数" // metric で value を省くと件数になる
              : `${AGGREGATES[item.value.aggregate] ?? item.value.aggregate}${named(
                  item.value.field,
                )}`;
      const from = item.repository === undefined ? "" : `、${item.repository} から`;
      const tap = item.action === undefined ? "" : `、押すと ${item.action} を実行`;
      return `${item.title} … ${what}${from}${tap}`;
    }),
  };
}

function describeReport(report: {
  paper: { size: string; orientation: string };
  rowsPerPage: number;
  groups: { label: string; field: string; pageBreak: boolean }[];
  totals: { field: string; aggregate: string }[];
  sortField?: string;
  sortAscending: boolean;
  limit: number;
}): ExplainSection {
  const lines = [
    `用紙は ${report.paper.size} の${
      report.paper.orientation === "landscape" ? "横" : "縦"
    }、1枚に ${report.rowsPerPage} 行`,
  ];
  if (report.sortField !== undefined) {
    lines.push(
      `${report.sortField} の${report.sortAscending ? "昇順" : "降順"}で並べて印刷する`,
    );
  }
  for (const group of report.groups) {
    lines.push(
      `${group.label}（${group.field}）が変わるところで小計を出す` +
        (group.pageBreak ? "。変わったら改ページする" : ""),
    );
  }
  if (report.totals.length > 0) {
    lines.push(
      `合計を出すのは ${report.totals
        .map((t) => `${t.field}（${AGGREGATES[t.aggregate] ?? t.aggregate}）`)
        .join("、")}`,
    );
  }
  lines.push(`1回に取るのは ${report.limit} 行まで`);
  return { title: "帳票の体裁", lines };
}

/** roles が付いているものを、見える人の話としてまとめる。 */
function collectRoles(page: PageDefinition): string[] {
  const lines: string[] = [];
  const push = (what: string, roles: string[]): void => {
    if (roles.length > 0) lines.push(`${what} … ${roles.join(" / ")} だけ`);
  };
  if ("table" in page) {
    for (const column of page.table.columns) push(`列「${column.label}」`, column.roles);
  }
  for (const action of page.actions) push(`ボタン「${action.label}」`, action.roles);
  if ("form" in page) {
    for (const section of page.form.sections) {
      for (const field of section.fields) push(`項目「${field.label}」`, field.roles);
    }
  }
  return lines;
}

/**
 * 定義から読み取れる「できないこと」。書いていないから出来ない、という類。
 *
 * ページ種別の説明で既に言っていること（照会専用・読み取り専用）は繰り返さない。
 */
function impliedLimits(page: PageDefinition): string[] {
  const limits: string[] = [];
  const readOnlyKind =
    page.kind === "search" ||
    page.kind === "detail" ||
    page.kind === "dashboard" ||
    page.kind === "report";
  if (readOnlyKind) return limits;
  const ids = new Set(page.actions.map((a) => a.type));
  if ("form" in page && !ids.has(ActionTypes.create)) {
    limits.push("新規登録のボタンは無い（入力画面は他から開く）");
  }
  if ("table" in page && !page.table.rowActions.includes("delete") && !ids.has(ActionTypes.delete)) {
    limits.push("削除はできない（削除のボタンが無い）");
  }
  if ("search" in page && page.search === undefined && "table" in page) {
    limits.push("絞り込みの条件は無い（一覧は全件から始まる）");
  }
  return limits;
}

/** アプリ全体（`app:`）の説明。ページは1行ずつで、詳しくは1枚ずつ引く。 */
export function explainApp(app: AppDefinition): ExplainDocument {
  // 入れ子は道（`マスタ > 商品`）で表す。字下げは箇条書きの中で読みにくいので。
  const menu: string[] = [];
  const walk = (items: MenuItem[], trail: string[]): void => {
    for (const item of items) {
      const path = [...trail, item.label].join(" > ");
      if (menuIsGroup(item)) {
        walk(item.children, [...trail, item.label]);
      } else {
        menu.push(`${path} → ${item.page ?? "(行き先なし)"}`);
      }
    }
  };
  walk(app.menu, []);

  return {
    headline: `${app.title}（${app.id}）— ${app.pages.length} 枚の画面をメニューで束ねたアプリ`,
    sections: [
      {
        title: "メニュー",
        lines: menu.length > 0 ? menu : ["メニューは無い（ページを直接開く）"],
      },
      {
        title: "画面",
        lines: app.pages.map(
          (page) =>
            `${page.title}（${page.id}）… ${
              PAGE_KINDS[page.type]?.what ?? page.type
            }`,
        ),
      },
      {
        title: "最初に開く画面",
        lines: [app.home ?? "指定なし（先頭のページ）"],
      },
      {
        title: "見た目",
        lines:
          app.theme === undefined
            ? []
            : ["テーマの指定がある（色・明暗・密度など）"],
      },
      {
        title: "1枚ずつ詳しく読むには",
        lines: [`hatake explain <file> --page <id>`],
      },
    ].filter((s) => s.lines.length > 0),
  };
}

/** 人が読む形に落とす。 */
export function renderExplain(document: ExplainDocument): string {
  const out = [document.headline, ""];
  for (const section of document.sections) {
    out.push(`## ${section.title}`);
    for (const line of section.lines) out.push(`  ・${line}`);
    out.push("");
  }
  return out.join("\n").trimEnd();
}
