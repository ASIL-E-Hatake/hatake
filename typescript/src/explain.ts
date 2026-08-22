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

import { type AppAccess } from "./appAccess.js";
import {
  accessLines,
  accessOverviewLines,
  type PageAccess,
} from "./explainAccess.js";
import {
  ACTION_TYPES,
  AGGREGATES,
  CHART_KINDS,
  COMPARE_WORDS,
  CONDITION_OPERATORS,
  CONVERTERS,
  FIELD_TYPES,
  FILTER_OPERATORS,
  FORMATTERS,
  type Lang,
  PAGE_KINDS,
  type Phrase,
  pick,
  say,
  VALIDATORS,
} from "./explainPhrases.js";
import { voice, type Voice } from "./explainVoice.js";
import {
  type ActionDefinition,
  ActionScopes,
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
  ValidatorTypes,
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
  /**
   * 何語で書いてあるか。
   *
   * 文書自身が持つ。持たせないと、出す側（[renderExplain] / [explainMarkdown]）が
   * **箇条書きの記号や件数の言い方**を選べず、日本語の文書に英語の飾りが付く。
   */
  lang: Lang;
}

/** 語彙の表から1語（無い値はそのまま出す＝ここで嘘をつかない）。 */
const wordOf = (
  table: Record<string, Phrase>,
  key: string | undefined,
  lang: Lang,
): string | undefined => {
  if (key === undefined) return undefined;
  const found = table[key];
  return found === undefined ? key : pick(found, lang);
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
    // 明細の行の項目も覚える（行を畳む計算が `of` で指すのは行の項目名なので、
    // 覚えていないと「明細 の amount の合計」と生の名前で出てしまう）。
    // 親の項目名と同じ名前なら**上書きしない**（親のほうが説明の主語になる）。
    if ("rowFields" in item) {
      for (const row of item.rowFields) {
        if (!vocabulary.labels.has(row.field)) {
          vocabulary.labels.set(row.field, row.label);
        }
      }
    }
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
  lang: Lang = "ja",
): string {
  if (condition === undefined) return "";
  const v = voice(lang);
  const mode = condition.mode;
  if (typeof mode === "string") {
    // 「だけ」は呼び出し側が付ける（…だけ出る／…だけ必須／…は直せない）。
    return mode === "create" ? v.onCreate : v.onEdit;
  }
  for (const [key, joiner] of [
    ["all", v.allJoiner],
    ["any", v.anyJoiner],
  ] as [string, string][]) {
    const parts = condition[key];
    if (Array.isArray(parts)) {
      const described = parts
        .map((p) => describeCondition(p as Record<string, unknown>, vocabulary, lang))
        .filter((text) => text !== "");
      if (described.length > 0) return described.join(joiner);
    }
  }
  if (condition.not !== undefined) {
    const inner = describeCondition(
      condition.not as Record<string, unknown>,
      vocabulary,
      lang,
    );
    return inner === "" ? "" : v.negated(inner);
  }

  const field = condition.field;
  if (typeof field !== "string") return "";
  const label = vocabulary.labels.get(field) ?? field;
  const operator = typeof condition.operator === "string" ? condition.operator : "equals";
  const raw = condition.value;
  const shown = Array.isArray(raw)
    ? raw.map((v2) => valueLabel(vocabulary, field, v2)).join(" / ")
    : valueLabel(vocabulary, field, raw);
  const phrase = CONDITION_OPERATORS[operator];
  if (phrase === undefined) {
    // 条件が理解しない演算子。ここで嘘をつかず、そう言う（警告でも出る）。
    return v.conditionUnusable(label, operator);
  }
  return `${label} ${say(phrase, lang, shown)}`;
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
  access?: PageAccess,
  lang: Lang = "ja",
): ExplainDocument {
  const v = voice(lang);
  const kind = PAGE_KINDS[page.kind];
  const kindWhat = kind === undefined ? page.kind : pick(kind.what, lang);
  const kindCannot =
    kind === undefined ? [] : kind.cannot.map((one) => pick(one, lang));
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
  // 以下、節の見出しと文はすべて [voice] から取る（日本語と英語で組み立ては1つ）。

  const sections: ExplainSection[] = [];
  const source: string[] = [];
  if ("repository" in page && page.repository !== undefined) {
    source.push(v.repositoryIs(page.repository));
  }
  if ("keyField" in page) {
    source.push(v.keyIs(page.keyField));
  }
  if (source.length > 0) sections.push({ title: v.data, lines: source });

  if ("search" in page && page.search !== undefined) {
    sections.push({
      title: v.filters,
      lines: page.search.filters.map((filter) =>
        describeFilter(filter, vocabulary, lang),
      ),
    });
  }
  if ("table" in page) sections.push(describeTable(page, lang));
  if (form !== undefined) sections.push(...describeForm(form, vocabulary, lang));
  if ("steps" in page) {
    sections.push({
      title: v.inputOrder,
      lines: page.steps.map((step, i) =>
        v.stepLine(i + 1, step.title, step.fields.length, step.description),
      ),
    });
    for (const step of page.steps) {
      sections.push(
        ...describeFields(step.fields, v.stepFields(step.title), vocabulary, lang),
      );
    }
  }
  if ("items" in page) {
    sections.push(describeDashboard(page.items, vocabulary.labels, lang));
  }
  if ("report" in page) sections.push(describeReport(page.report, lang));

  if (page.actions.length > 0) {
    const targets = navigateTargets(raw);
    sections.push({
      title: v.actions,
      lines: page.actions.map((action) =>
        describeAction(
          action,
          targets.get(action.id),
          // 一括は「一度に何件動くか」で危険度が変わる。件数の上限は表のページ送りで
          // 決まっているのに、定義を読んでも出てこないので、ここで言う。
          "table" in page ? page.table.pagination.pageSize : undefined,
          lang,
        ),
      ),
    });
  }
  const rowActions = "table" in page ? page.table.rowActions : [];
  if (rowActions.length > 0) {
    const labels = new Map(page.actions.map((a) => [a.id, a.label]));
    sections.push({
      title: v.rowActions,
      lines: rowActions.map((id) => {
        const builtin =
          id === "edit" ? v.openEdit : id === "delete" ? v.deleteRow : undefined;
        return labels.get(id) ?? builtin ?? v.undeclaredRowAction(id);
      }),
    });
  }

  // 「開ける人」は「画面の中で隠れるもの」より先に出す。**そこへ来られるか**が
  // 決まってからでないと、中で誰に何が見えるかの話は読めない。
  if (access !== undefined) {
    sections.push({ title: v.accessTitle, lines: accessLines(access, lang) });
  }
  const gated = collectRoles(page, lang);
  if (gated.length > 0) {
    sections.push({ title: v.gatedByRoles, lines: gated });
  }

  const cannot = [...kindCannot, ...impliedLimits(page, lang)];
  if (cannot.length > 0) sections.push({ title: v.cannotDo, lines: cannot });

  return {
    headline: v.pageHeadline(page.title, page.id, kindWhat),
    sections: sections.filter((s) => s.lines.length > 0),
    lang,
  };
}

function describeFilter(
  filter: FilterDefinition,
  vocabulary: Vocabulary,
  lang: Lang,
): string {
  const v = voice(lang);
  const operator = wordOf(FILTER_OPERATORS, filter.operator, lang) ?? filter.operator;
  const options =
    filter.options.length > 0
      ? v.clause(v.choicesAre(filter.options.map((o) => o.label)))
      : "";
  const linked =
    filter.optionsFrom !== undefined
      ? v.clause(
          v.narrowedByFilter(
            vocabulary.labels.get(filter.optionsFrom) ?? filter.optionsFrom,
          ),
        )
      : "";
  const fetched =
    filter.optionsSource !== undefined
      ? v.clause(v.choicesFrom(filter.optionsSource.repository))
      : "";
  return v.subject(filter.label, `${operator}${options}${linked}${fetched}`);
}

function describeTable(
  page: PageDefinition & {
    table: {
      columns: ColumnDefinition[];
      pagination: { enabled: boolean; pageSize: number };
    };
  },
  lang: Lang,
): ExplainSection {
  const v = voice(lang);
  const lines = page.table.columns.map((column) => {
    const notes = [
      ...(column.format === undefined
        ? []
        : [
            v.shownAs(
              FORMATTERS[column.format] === undefined
                ? v.formatFallback(column.format)
                : pick(FORMATTERS[column.format], lang),
            ),
          ]),
      ...(column.sortable ? [v.sortable] : []),
    ];
    return notes.length === 0 ? column.label : v.notesOf(column.label, notes);
  });
  // 帳票は印刷なので、一覧のページングの話はしない（`rowsPerPage` が別にある）。
  if (page.kind !== "report") {
    const pagination = page.table.pagination;
    lines.push(
      pagination.enabled ? v.paginates(pagination.pageSize) : v.noPaging,
    );
  }
  return {
    title: page.kind === "report" ? v.printColumns : v.listColumns,
    lines,
  };
}

function describeForm(
  form: FormDefinition,
  vocabulary: Vocabulary,
  lang: Lang,
): ExplainSection[] {
  const v = voice(lang);
  const sections: ExplainSection[] = [];
  for (const section of form.sections) {
    const title = section.title ?? v.formFields;
    const when = describeCondition(section.visibleWhen, vocabulary, lang);
    sections.push(
      ...describeFields(
        section.fields,
        when === "" ? title : v.sectionWhen(title, when),
        vocabulary,
        lang,
      ),
    );
  }
  return sections;
}

function describeFields(
  fields: FieldDefinition[],
  title: string,
  vocabulary: Vocabulary,
  lang: Lang,
): ExplainSection[] {
  if (fields.length === 0) return [];
  return [
    { title, lines: fields.map((field) => describeField(field, vocabulary, lang)) },
  ];
}

function describeField(
  field: FieldDefinition,
  vocabulary: Vocabulary,
  lang: Lang,
): string {
  const v = voice(lang);
  const notes: string[] = [];
  // text は既定なので言わない（語彙には在るが、書いていないのと同じ見え方なので）。
  const type =
    field.type === FieldTypes.text ? undefined : wordOf(FIELD_TYPES, field.type, lang);
  if (type !== undefined) notes.push(type);
  if (field.required) notes.push(v.required);
  const requiredWhen = describeCondition(field.requiredWhen, vocabulary, lang);
  if (requiredWhen !== "") notes.push(v.requiredWhen(requiredWhen));
  if (field.readOnly) notes.push(v.readOnly);
  const readOnlyWhen = describeCondition(field.readOnlyWhen, vocabulary, lang);
  if (readOnlyWhen !== "") notes.push(v.readOnlyWhen(readOnlyWhen));
  const visibleWhen = describeCondition(field.visibleWhen, vocabulary, lang);
  if (visibleWhen !== "") notes.push(v.visibleWhen(visibleWhen));
  const enabledWhen = describeCondition(field.enabledWhen, vocabulary, lang);
  if (enabledWhen !== "") notes.push(v.enabledWhen(enabledWhen));
  if (field.options.length > 0) {
    notes.push(v.choicesAre(field.options.map((o) => o.label)));
  }
  if (field.optionsFrom !== undefined) {
    notes.push(
      v.narrowedByField(
        vocabulary.labels.get(field.optionsFrom) ?? field.optionsFrom,
      ),
    );
  }
  if (field.optionsSource !== undefined) {
    notes.push(v.choicesFrom(field.optionsSource.repository));
  }
  const rules = field.validators
    .map((rule) => describeValidator(rule, vocabulary, lang))
    .filter((r) => r !== "");
  if (rules.length > 0) notes.push(rules.join(v.ruleSeparator));
  if (field.normalize.length > 0) {
    notes.push(
      v.normalizedBy(
        field.normalize.map((n) => wordOf(CONVERTERS, n, lang) ?? n),
      ),
    );
  }
  if (field.computed !== undefined) {
    notes.push(describeComputed(field.computed, vocabulary, lang));
  }
  if (field.format !== undefined) {
    notes.push(
      v.shownAs(
        FORMATTERS[field.format] === undefined
          ? v.formatFallback(field.format)
          : pick(FORMATTERS[field.format], lang),
      ),
    );
  }
  if (field.type === FieldTypes.subTable) {
    const rows = (field.rowFields.length > 0 ? field.rowFields : field.columns).map(
      (row) => row.label,
    );
    if (rows.length > 0) notes.push(v.subRowIs(rows));
    notes.push(
      field.source === undefined
        ? v.subRowsInline
        : v.subRowsSeparate(field.source.repository),
    );
  }
  if (field.roles.length > 0) notes.push(v.visibleToRoles(field.roles));
  return notes.length === 0
    ? field.label
    : v.subject(field.label, notes.join(v.noteSeparator));
}

/**
 * 計算項目の言い方。
 *
 * **何から計算するのか**が読めないと、レビューでは「自動で計算する」以上のことが
 * 分からない。明細の行を畳む形（`field` + `of`）だけは、畳む相手を名前で言う。
 */
function describeComputed(
  computed: Record<string, unknown>,
  vocabulary: Vocabulary,
  lang: Lang,
): string {
  const v = voice(lang);
  const target = typeof computed.field === "string" ? computed.field : undefined;
  const op = typeof computed.op === "string" ? computed.op : "";
  if (target === undefined) return v.computedField;
  const table = vocabulary.labels.get(target) ?? target;
  const of = typeof computed.of === "string" ? computed.of : undefined;
  const ofLabel = of === undefined ? undefined : (vocabulary.labels.get(of) ?? of);
  const main = ((): string | undefined => {
    // 並べる（文字を作る）と畳む（数を作る）は別。読む人には別の言い方で言う。
    if (op === "join") {
      return ofLabel === undefined ? undefined : v.joinsRows(table, ofLabel);
    }
    if (AGGREGATES[op] === undefined) return undefined;
    if (op === "count") return v.foldsRowCount(table);
    if (ofLabel === undefined) return undefined;
    return v.foldsRows(table, ofLabel, pick(AGGREGATES[op], lang));
  })();
  if (main === undefined) return v.computedField;
  // 絞ってから畳むなら、**何で絞ったか**も言う（合計が合わない相談のほとんどはこれ）。
  const where =
    typeof computed.where === "object" &&
    computed.where !== null &&
    !Array.isArray(computed.where)
      ? describeCondition(computed.where as Record<string, unknown>, vocabulary, lang)
      : "";
  return where === "" ? main : [main, v.onlyRows(where)].join(v.noteSeparator);
}

const describeValidator = (
  rule: ValidatorDefinition,
  vocabulary: Vocabulary,
  lang: Lang,
): string => {
  const phrase = VALIDATORS[rule.type];
  if (phrase === undefined) return voice(lang).unknownRule(rule.type);
  // 項目間の検証は「相手のラベル＋突合の言い方」で文にする（相手を項目名で言うと、
  // DSL を知らない人には読めない）。
  if (rule.type === ValidatorTypes.compare) {
    return say(phrase, lang, compareTarget(rule, vocabulary, lang));
  }
  return say(phrase, lang, rule.params.value);
};

/** 項目間の検証の言い方（「開始日 以上」「明細 の合計 と同じ値」）。 */
function compareTarget(
  rule: ValidatorDefinition,
  vocabulary: Vocabulary,
  lang: Lang,
): string {
  const v = voice(lang);
  const target = typeof rule.params.field === "string" ? rule.params.field : "";
  if (target === "") return v.compareNoTarget;
  const label = vocabulary.labels.get(target) ?? target;
  const aggregate =
    typeof rule.params.aggregate === "string" ? rule.params.aggregate : undefined;
  const folded =
    aggregate === undefined
      ? label
      : v.compareAggregate(label, wordOf(AGGREGATES, aggregate, lang) ?? aggregate);
  // 絞ってから比べるなら、**何で絞ったか**も言う（言わないと、通った理由が読めない）。
  const where =
    aggregate !== undefined &&
    typeof rule.params.where === "object" &&
    rule.params.where !== null &&
    !Array.isArray(rule.params.where)
      ? describeCondition(
          rule.params.where as Record<string, unknown>,
          vocabulary,
          lang,
        )
      : "";
  const shown = where === "" ? folded : v.foldedRowsOnly(folded, v.onlyRows(where));
  const operator =
    typeof rule.params.operator === "string" ? rule.params.operator : "gte";
  const phrase = COMPARE_WORDS[operator];
  return phrase === undefined
    ? v.compareUnusable(shown, operator)
    : say(phrase, lang, shown);
}

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

function describeAction(
  action: ActionDefinition,
  target: string | undefined,
  pageSize: number | undefined,
  lang: Lang,
): string {
  const v = voice(lang);
  const what = wordOf(ACTION_TYPES, action.type, lang) ?? action.type;
  const to =
    action.type === ActionTypes.navigate && target !== undefined
      ? v.goesTo(target)
      : action.type === ActionTypes.plugin && action.plugin !== undefined
        ? v.viaPlugin(action.plugin)
        : "";
  const on =
    action.scope !== ActionScopes.selection
      ? ""
      : v.clause(
          pageSize === undefined ? v.onSelection : v.onSelectionUpTo(pageSize),
        );
  const asks =
    action.prompt !== undefined
      ? v.clause(v.asksFor(action.prompt.fields.map((f) => f.label)))
      : "";
  const confirm =
    action.prompt !== undefined
      // 聞くダイアログの OK が確認そのもの（2枚は出さない）。
      ? ""
      : action.confirm !== undefined
        ? v.clause(v.confirms)
        : action.type === ActionTypes.delete
          ? v.clause(v.confirmsDelete)
          : "";
  const after =
    action.onSuccess?.page !== undefined
      ? v.clause(v.thenGoTo(action.onSuccess.page))
      : action.onSuccess?.message !== undefined
        ? v.clause(v.thenSay(action.onSuccess.message))
        : "";
  const onError =
    action.onError !== undefined
      ? v.clause(v.onFailSay(action.onError.message))
      : "";
  const roles =
    action.roles.length > 0 ? v.clause(v.onlyForRoles(action.roles)) : "";
  return v.subject(
    action.label,
    `${what}${to}${on}${asks}${confirm}${after}${onError}${roles}`,
  );
}

function describeDashboard(
  items: DashboardItemDefinition[],
  labels: Map<string, string>,
  lang: Lang,
): ExplainSection {
  const v = voice(lang);
  const named = (field: string | undefined): string =>
    field === undefined ? "" : v.ofField(labels.get(field) ?? field);
  return {
    title: v.dashboardCards,
    lines: items.map((item) => {
      const what =
        item.chart !== undefined
          ? v.chartOf(
              wordOf(CHART_KINDS, item.chart.kind, lang) ?? item.chart.kind,
              labels.get(item.chart.labelField) ?? item.chart.labelField,
            )
          : item.columns.length > 0
            ? v.cardList(item.columns.map((c) => c.label))
            : item.value === undefined
              ? v.cardCount // metric で value を省くと件数になる
              : `${
                  wordOf(AGGREGATES, item.value.aggregate, lang) ??
                  item.value.aggregate
                }${named(item.value.field)}`;
      const from =
        item.repository === undefined ? "" : v.fromRepository(item.repository);
      const tap = item.action === undefined ? "" : v.tapRuns(item.action);
      return v.subject(item.title, `${what}${from}${tap}`);
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
}, lang: Lang): ExplainSection {
  const v = voice(lang);
  const lines = [
    v.paperIs(
      report.paper.size,
      report.paper.orientation === "landscape",
      report.rowsPerPage,
    ),
  ];
  if (report.sortField !== undefined) {
    lines.push(v.printedInOrder(report.sortField, report.sortAscending));
  }
  for (const group of report.groups) {
    lines.push(v.subtotalAt(group.label, group.field, group.pageBreak));
  }
  if (report.totals.length > 0) {
    lines.push(
      v.totalsAre(
        report.totals.map((t) =>
          v.totalOf(t.field, wordOf(AGGREGATES, t.aggregate, lang) ?? t.aggregate),
        ),
      ),
    );
  }
  lines.push(v.takesAtMost(report.limit));
  return { title: v.reportLayout, lines };
}

/** roles が付いているものを、見える人の話としてまとめる。 */
function collectRoles(page: PageDefinition, lang: Lang): string[] {
  const v = voice(lang);
  const lines: string[] = [];
  const push = (what: string, roles: string[]): void => {
    if (roles.length > 0) lines.push(v.subject(what, v.onlyRoles(roles)));
  };
  if ("table" in page) {
    for (const column of page.table.columns) {
      push(v.gatedColumn(column.label), column.roles);
    }
  }
  for (const action of page.actions) {
    push(v.gatedAction(action.label), action.roles);
  }
  if ("form" in page) {
    for (const section of page.form.sections) {
      for (const field of section.fields) {
        push(v.gatedField(field.label), field.roles);
      }
    }
  }
  return lines;
}

/**
 * 定義から読み取れる「できないこと」。書いていないから出来ない、という類。
 *
 * ページ種別の説明で既に言っていること（照会専用・読み取り専用）は繰り返さない。
 */
function impliedLimits(page: PageDefinition, lang: Lang): string[] {
  const v = voice(lang);
  const limits: string[] = [];
  const readOnlyKind =
    page.kind === "search" ||
    page.kind === "detail" ||
    page.kind === "dashboard" ||
    page.kind === "report";
  if (readOnlyKind) return limits;
  const ids = new Set(page.actions.map((a) => a.type));
  if ("form" in page && !ids.has(ActionTypes.create)) {
    limits.push(v.noCreateButton);
  }
  if ("table" in page && !page.table.rowActions.includes("delete") && !ids.has(ActionTypes.delete)) {
    limits.push(v.noDelete);
  }
  if ("search" in page && page.search === undefined && "table" in page) {
    limits.push(v.noFilters);
  }
  return limits;
}

/** アプリ全体（`app:`）の説明。ページは1行ずつで、詳しくは1枚ずつ引く。 */
export function explainApp(
  app: AppDefinition,
  access?: AppAccess,
  lang: Lang = "ja",
): ExplainDocument {
  const v = voice(lang);
  // 入れ子は道（`マスタ > 商品`）で表す。字下げは箇条書きの中で読みにくいので。
  const menu: string[] = [];
  const walk = (items: MenuItem[], trail: string[]): void => {
    for (const item of items) {
      const path = [...trail, item.label].join(" > ");
      if (menuIsGroup(item)) {
        walk(item.children, [...trail, item.label]);
      } else {
        menu.push(v.menuLine(path, item.page ?? v.noMenuTarget));
      }
    }
  };
  walk(app.menu, []);

  return {
    headline: v.appHeadline(app.title, app.id, app.pages.length),
    sections: [
      {
        title: v.menu,
        lines: menu.length > 0 ? menu : [v.noMenu],
      },
      {
        title: v.screens,
        lines: app.pages.map((page) =>
          v.screenLine(
            page.title,
            page.id,
            PAGE_KINDS[page.type] === undefined
              ? page.type
              : pick(PAGE_KINDS[page.type].what, lang),
          ),
        ),
      },
      {
        title: v.firstScreen,
        lines: [app.home ?? v.homeUnset],
      },
      {
        title: v.accessOverviewTitle,
        lines:
          access === undefined
            ? []
            : accessOverviewLines(
                access,
                app.pages.map((page) => ({ id: page.id, title: page.title })),
                lang,
              ),
      },
      {
        title: v.look,
        lines: app.theme === undefined ? [] : [v.hasTheme],
      },
      {
        title: v.readOneByOne,
        lines: [`hatake explain <file> --page <id>`],
      },
    ].filter((s) => s.lines.length > 0),
    lang,
  };
}

/** 人が読む形に落とす。箇条書きの記号は文書の言語に合わせる。 */
export function renderExplain(document: ExplainDocument): string {
  const bullet = voice(document.lang).bullet;
  const out = [document.headline, ""];
  for (const section of document.sections) {
    out.push(`## ${section.title}`);
    for (const line of section.lines) out.push(`${bullet}${line}`);
    out.push("");
  }
  return out.join("\n").trimEnd();
}
