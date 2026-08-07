// ページ定義の雛形。`hatake new <kind>` が出すもの。
//
// 狙いは「白紙から書かせない」こと。どの種別も**そのまま動く最小形**で、strict
// パースとスキーマ検証を通る（`scaffold.test.ts` が全種別で確認している）。
// 埋める場所だけ TODO_ にしてある。

/** 雛形を出せるページ種別。 */
export const scaffoldKinds = [
  "crud",
  "search",
  "master",
  "detail",
  "form",
  "wizard",
  "dashboard",
  "report",
] as const;

export interface ScaffoldOptions {
  id: string;
  title: string;
  /** Repository キー。省略時は id から作る（`order_search` → `orderRepository`）。 */
  repository?: string;
}

/** `order_search` → `orderRepository`（先頭の語をそのまま使う素直な変換）。 */
const repositoryKeyFor = (id: string): string => `${id.split("_")[0]}Repository`;

const searchBlock = (): string[] => [
  "  search:",
  "    layout: { columns: 2 }",
  "    filters:",
  "      - { field: name, label: 名称, type: text, operator: contains }",
];

const tableBlock = (
  options: { rowActions?: string; extraColumns?: string[] } = {},
): string[] => [
  "  table:",
  "    pagination: { pageSize: 50 }",
  ...(options.rowActions === undefined
    ? []
    : [`    rowActions: [${options.rowActions}]`]),
  "    columns:",
  "      - { field: code, label: コード, width: 140, sortable: true }",
  "      - { field: name, label: 名称 }",
  ...(options.extraColumns ?? []),
];

const formBlock = (): string[] => [
  "  form:",
  "    sections:",
  "      - title: 基本情報",
  "        layout: { columns: 2 }",
  "        fields:",
  "          - { field: code, label: コード, type: text, required: true, normalize: [toHankaku, trim] }",
  "          - { field: name, label: 名称, type: text, required: true }",
];

/**
 * [kind] の雛形 YAML。未知の種別は例外（CLI がそのまま表示する）。
 */
export function scaffold(kind: string, options: ScaffoldOptions): string {
  const repository = options.repository ?? repositoryKeyFor(options.id);
  const head = (repositoryComment: string): string[] => [
    'dsl_version: "1.0"',
    "page:",
    `  type: ${kind}`,
    `  id: ${options.id}`,
    `  title: ${options.title}`,
    `  repository: ${repository}   # ${repositoryComment}`,
  ];
  const page = head("RepositoryRegistry に登録するキー");
  const key = "  key: id                  # レコードの主キー項目名";

  switch (kind) {
    case "crud":
    case "master":
      return lines([
        ...page,
        key,
        ...searchBlock(),
        ...tableBlock({ rowActions: "edit, delete" }),
        ...formBlock(),
        "  actions:",
        "    - { id: create, type: create, label: 新規登録 }",
        "    - { id: csv, type: export, label: CSV出力 }",
      ]);
    case "search":
      return lines([
        ...page,
        key,
        ...searchBlock(),
        ...tableBlock({ rowActions: "detail" }),
        "  actions:",
        "    # 行から詳細へ。遷移先は app: の pages に置く",
        '    - { id: detail, type: navigate, label: 詳細, page: TODO_detail_page, params: { id: "$row.id" } }',
        "    - { id: csv, type: export, label: CSV出力 }",
      ]);
    case "detail":
      return lines([
        ...page,
        key,
        "  form:",
        "    sections:",
        "      - title: 基本情報",
        "        fields:",
        "          - { field: code, label: コード }",
        "          - { field: name, label: 名称 }",
      ]);
    case "form":
      return lines([...page, key, ...formBlock()]);
    case "wizard":
      return lines([
        ...page,
        key,
        "  steps:",
        "    # 「次へ」はそのステップの項目だけを検証する",
        "    - id: basic",
        "      title: 基本情報",
        "      layout: { columns: 2 }",
        "      fields:",
        "        - { field: code, label: コード, required: true, normalize: [toHankaku, trim] }",
        "        - { field: name, label: 名称, required: true }",
        "    - id: confirm",
        "      title: 確認",
        "      fields:",
        "        # 前のステップの入力を computed で見せる（読み取り表示）",
        '        - { field: summary, label: 内容, computed: { op: concat, fields: [code, name], separator: " / " } }',
      ]);
    case "dashboard":
      return lines([
        ...head("カードが repository を省いたときの既定"),
        "  layout: { columns: 4 }",
        "  items:",
        "    # value 省略時は count（件数）。集計は Repository が返した行の畳み込み",
        "    - { id: total, title: 件数 }",
        "    - id: amount",
        "      title: 金額",
        "      value: { aggregate: sum, field: amount }",
        "      format: currency",
        '      config: { symbol: "¥" }',
        "    - id: byGroup",
        "      type: chart",
        "      title: 内訳",
        "      span: 2",
        "      chart: { kind: bar, labelField: TODO_group_field, valueField: amount, aggregate: sum }",
      ]);
    case "report":
      return lines([
        ...page,
        ...searchBlock(),
        ...tableBlock({
          extraColumns: [
            "      - { field: amount, label: 金額, type: number, format: currency }",
          ],
        }),
        "  report:",
        "    paper: { size: A4, orientation: portrait }",
        "    rowsPerPage: 30          # 見出し・小計も1行として数える",
        "    sort: { field: TODO_group_field }   # groupBy はこの並びに依存する",
        "    groupBy:",
        "      - { field: TODO_group_field, label: 見出し }",
        "    totals:",
        "      - { field: amount, aggregate: sum }",
        "  actions:",
        "    - { id: csv, type: export, label: CSV出力, config: { bom: true } }",
      ]);
    default:
      throw new Error(
        `知らないページ種別 "${kind}" です（${scaffoldKinds.join(" | ")}）。`,
      );
  }
}

const lines = (parts: string[]): string => `${parts.join("\n")}\n`;
