import { type ColumnDefinition, FormatterRegistry } from "@hatake-fw/api";
import { cellText, ColumnTypes, DashboardItemTypes, isAllowed, ReportBlockKinds, reportTotalLines } from "@hatake-fw/api/internal";
import type {
  AggregateBucket,
  DashboardItemDefinition,
  DashboardPageDefinition,
  ReportBlock,
  ReportPageDefinition,
} from "@hatake-fw/api/internal";
import {
  type ActionSurroundings,
  cardSpan,
  CHART_HEIGHT,
  CHART_WIDTH,
  chartShape,
  dashboardColumns,
  DashboardController,
  dashboardValueText,
  type DataRecord,
  ReportController,
} from "@hatake-fw/runtime";
import { defineComponent, h, onMounted, type PropType } from "vue";

import { useActions } from "../parts/actions.js";
import { icon } from "../parts/icon.js";
import { HatakePagination, HatakeSearch } from "../parts/search.js";
import { touch, useController, useRegistries } from "../scope.js";
import { errorOf } from "./list.js";

/**
 * ダッシュボード（`kind: dashboard`）。**カード1枚ずつが自分の状態を持つ**ので、
 * 1つの Repository が落ちても落ちるのはそのカードだけ。
 *
 * 並べ方は**定義の `layout.columns` と各カードの `span`**。数の字はカードの
 * `format`、表のカードはカードの `columns` で出す（Flutter 版と同じ）。0.9.19 までは
 * どれも読んでいなかった（12列決め打ち・素の数・行を丸ごと繋いで `[object Object]`）。
 */
export const HatakeDashboardPage = defineComponent({
  name: "HatakeDashboardPage",
  props: {
    definition: { type: Object as PropType<DashboardPageDefinition>, required: true },
    roles: { type: Array as PropType<readonly string[]>, default: () => [] },
    formatters: { type: Object as PropType<FormatterRegistry>, default: () => new FormatterRegistry() },
  },
  setup(props) {
    const registries = useRegistries();
    const controller = new DashboardController({
      definition: props.definition,
      repositories: registries.repositories,
      // **見せないカードは読みにも行かない**（絞るのは土台）。
      roles: props.roles,
    });
    const { version } = useController(controller);
    const bar = useActions({ roles: props.roles, formatters: props.formatters });
    onMounted(() => void controller.init());

    return () => {
      touch(version);
      const columns = dashboardColumns(props.definition);
      return h("div", { class: "hatake-page", "data-hatake": `page:${props.definition.id}` }, [
        h("div", { class: "hatake-page-header" }, [
          h("h1", { class: "hatake-title" }, props.definition.title),
          // ダッシュボードには**行が無い**ので、`type: export` は出せない（押すと
          // 「この画面では出力できません」と言う）。遷移と `plugin` は使える。
          bar.page(props.definition.actions, () => ({
            controller,
            fallbackName: props.definition.title,
          })),
          h(
            "button",
            {
              class: "hatake-icon-button",
              type: "button",
              title: "読み直す",
              "aria-label": "読み直す",
              "data-hatake": "dashboard:reload",
              onClick: () => void controller.load(),
            },
            [icon("refresh")],
          ),
        ]),
        h(HatakeSearch, {
          search: props.definition.search,
          onSearch: (values: DataRecord) => void controller.search(values),
        }),
        h(
          "div",
          {
            class: "hatake-dashboard",
            style: { "--hatake-dashboard-columns": String(columns) },
          },
          controller.items.map((item) => card(item, columns, controller, props.formatters, props.roles)),
        ),
        bar.overlay(),
      ]);
    };
  },
});

function card(
  item: DashboardItemDefinition,
  columns: number,
  controller: DashboardController,
  formatters: FormatterRegistry,
  roles: readonly string[],
): ReturnType<typeof h> {
  const state = controller.stateOf(item);
  const body = (): ReturnType<typeof h> => {
    if (state.loading) return h("p", { class: "hatake-table-empty" }, "読み込み中…");
    // **落ちたカードは落ちたと言う。** 0 を出すと、事故と「本当に0件」が混ざる。
    if (state.error !== null) return errorOf(state.error)[0];

    switch (item.type) {
      case DashboardItemTypes.metric:
        return h(
          "p",
          { class: "hatake-metric", "data-hatake": `metric:${item.id}` },
          dashboardValueText(formatters, item, state.value),
        );
      case DashboardItemTypes.chart:
        return chart(item, state.buckets, formatters);
      case DashboardItemTypes.table:
        return cardTable(item, state.rows, formatters, roles);
      default:
        // **知らない種類は黙って空にしない**（プラグインで足したのに描かれていない）。
        return h(
          "p",
          { class: "hatake-field-message", role: "alert", "data-hatake": `card:${item.id}:unsupported` },
          `描き方を知らないカードです: type = ${item.type}`,
        );
    }
  };

  return h(
    "section",
    {
      class: "hatake-card",
      style: { gridColumn: `span ${cardSpan(item, columns)}` },
      "data-hatake": `card:${item.id}`,
    },
    [h("h2", { class: "hatake-card-title" }, item.title), body()],
  );
}

/**
 * 表のカード。**列はカードの `columns`**（見えない列は出さない）、字は一覧と同じ
 * `cellText` を通す。
 */
function cardTable(
  item: DashboardItemDefinition,
  rows: readonly DataRecord[],
  formatters: FormatterRegistry,
  roles: readonly string[],
): ReturnType<typeof h> {
  const columns = item.columns.filter((one) => isAllowed(one.roles, roles));
  if (rows.length === 0 || columns.length === 0) {
    return h("p", { class: "hatake-table-empty", "data-hatake": `rows:${item.id}` }, "該当するデータがありません");
  }
  return h("table", { class: "hatake-table", "data-hatake": `rows:${item.id}` }, [
    h(
      "thead",
      h(
        "tr",
        columns.map((one) =>
          h("th", { class: one.type === ColumnTypes.number ? "hatake-cell-number" : null }, one.label),
        ),
      ),
    ),
    h(
      "tbody",
      rows.map((row, at) =>
        h(
          "tr",
          { key: at },
          columns.map((one) =>
            h(
              "td",
              { class: one.type === ColumnTypes.number ? "hatake-cell-number" : null },
              cellText(formatters, columns, one, row[one.field]),
            ),
          ),
        ),
      ),
    ),
  ]);
}

/**
 * 図のカード。**形は土台が組む**（`chartShape`）。ここは SVG に置くだけで、色は
 * CSS（`--hatake-chart-N`）。外の図ライブラリには乗らない。
 */
function chart(
  item: DashboardItemDefinition,
  buckets: readonly AggregateBucket[],
  formatters: FormatterRegistry,
): ReturnType<typeof h> {
  const shape = chartShape(item.chart?.kind ?? "bar", buckets, (value) =>
    dashboardValueText(formatters, item, value),
  );
  const mark = { "data-hatake": `chart:${item.id}` };
  if (shape.kind === "empty") return h("p", { class: "hatake-table-empty", ...mark }, "該当するデータがありません");
  if (shape.kind === "unsupported") {
    return h("p", { class: "hatake-field-message", role: "alert", ...mark }, `描き方を知らない図です: kind = ${shape.name}`);
  }

  const svg = (children: ReturnType<typeof h>[], width = CHART_WIDTH) =>
    h(
      "svg",
      {
        class: "hatake-chart",
        viewBox: `0 0 ${width} ${CHART_HEIGHT}`,
        role: "img",
        "aria-label": item.title,
        ...mark,
      },
      children,
    );

  if (shape.kind === "pie") {
    return h("div", {}, [
      svg(
        shape.slices.map((one) => h("path", { class: `hatake-chart-c${one.colorIndex}`, d: one.path })),
        CHART_HEIGHT,
      ),
      // 円は**凡例が無いと読めない**ので、軸の字の代わりに凡例を出す。
      h(
        "ul",
        { class: "hatake-chart-legend" },
        shape.slices.map((one) =>
          h("li", {}, [
            h("span", { class: `hatake-chart-swatch hatake-chart-c${one.colorIndex}`, style: { background: `var(--hatake-chart-${one.colorIndex + 1})` } }),
            `${one.label} ${one.valueText}`,
          ]),
        ),
      ),
    ]);
  }

  const axis = h("line", { class: "hatake-chart-axis", x1: 0, x2: CHART_WIDTH, y1: shape.baseline, y2: shape.baseline });

  if (shape.kind === "line") {
    return svg([
      axis,
      h("polyline", { class: "hatake-chart-line", points: shape.points.map((p) => `${p.x},${p.y}`).join(" ") }),
      ...shape.points.flatMap((p) => [
        h("circle", { class: "hatake-chart-c0", cx: p.x, cy: p.y, r: 3 }),
        h("text", { class: "hatake-chart-value", x: p.x, y: p.y - 6, "text-anchor": "middle" }, p.valueText),
        h("text", { class: "hatake-chart-label", x: p.x, y: shape.labelY, "text-anchor": "middle" }, p.label),
      ]),
    ]);
  }

  return svg([
    axis,
    ...shape.bars.flatMap((b) => [
      h("rect", { class: `hatake-chart-c${b.colorIndex}`, x: b.x, y: b.y, width: b.width, height: b.height }),
      h("text", { class: "hatake-chart-value", x: b.center, y: b.y - 3, "text-anchor": "middle" }, b.valueText),
      h("text", { class: "hatake-chart-label", x: b.center, y: shape.labelY, "text-anchor": "middle" }, b.label),
    ]),
  ]);
}

/**
 * 帳票（`kind: report`）。**刷るものなので繰らない** — 条件を1回走らせて紙を組み、
 * ページ送りは組み上がった紙の枚数に対して起きる。
 */
export const HatakeReportPage = defineComponent({
  name: "HatakeReportPage",
  props: {
    definition: { type: Object as PropType<ReportPageDefinition>, required: true },
    roles: { type: Array as PropType<readonly string[]>, default: () => [] },
    formatters: { type: Object as PropType<FormatterRegistry>, default: () => new FormatterRegistry() },
  },
  setup(props) {
    const registries = useRegistries();
    const controller = new ReportController({
      definition: props.definition,
      repository: registries.repositories.resolve(props.definition.repository),
    });
    const { version } = useController(controller);
    const bar = useActions({ roles: props.roles, formatters: props.formatters });

    /**
     * 帳票が持っているもの。
     *
     * **出すのも刷るのも、組んだ紙と同じ行から出す**（画面に出ている1枚ぶんではない）。
     * 条件を走らせる前は行が無いので、押しても「出力できません」ではなく空が出る
     * ——それを避けるため、走らせる前はボタンを押しても紙が無いと言う。
     */
    const around = (): ActionSurroundings => ({
      controller,
      columns: props.definition.table.columns,
      fetchRows: () => Promise.resolve(controller.rows),
      printDocument: () => (controller.hasRun ? controller.document : undefined),
      fallbackName: props.definition.title,
      reportPage: props.definition,
    });

    return () => {
      touch(version);
      const sheet = controller.sheet;
      return h("div", { class: "hatake-page", "data-hatake": `page:${props.definition.id}` }, [
        h("div", { class: "hatake-page-header" }, [
          h("h1", { class: "hatake-title" }, props.definition.title),
          bar.page(props.definition.actions, around),
        ]),
        h(HatakeSearch, {
          search: props.definition.search,
          submitLabel: "出力",
          onSearch: (values: DataRecord) => void controller.run(values),
        }),
        ...errorOf(controller.error),
        // **押す前に空の紙を出さない**（出すと「0件だった」と読めてしまう）。
        !controller.hasRun
          ? h("p", { class: "hatake-table-empty" }, "条件を入れて「出力」を押してください。")
          : sheet === null
            ? h("p", { class: "hatake-table-empty" }, "該当するデータがありません")
            : h("div", { class: "hatake-sheet", "data-hatake": "sheet" }, [
                h(
                  "table",
                  { class: "hatake-table" },
                  sheet.blocks.map((block) => reportRow(block, props.definition, props.formatters)),
                ),
              ]),
        controller.hasRun && controller.totalPages > 1
          ? h(HatakePagination, {
              page: controller.sheetIndex,
              pageCount: controller.totalPages,
              totalCount: controller.rows.length,
              onMove: (page: number) => controller.setSheet(page),
            })
          : null,
        bar.overlay(),
      ]);
    };
  },
});

/**
 * 紙の1行。**種類で出し分ける**（見出し・明細・小計・総計）。
 *
 * 小計と総計の値は `report.totals` と**同じ並び**で来る（項目名ではなく位置で
 * 対応する）ので、列の位置に合わせて置く。
 */
function reportRow(
  block: ReportBlock,
  definition: ReportPageDefinition,
  formatters: FormatterRegistry,
): ReturnType<typeof h> {
  // **明細の列は画面の `table` から来る**（一覧と帳票が食い違わないように）。
  const columns: ColumnDefinition[] = definition.table.columns;
  const attrs = { "data-hatake": `block:${block.kind}`, class: `hatake-${block.kind}` };

  if (block.kind === ReportBlockKinds.detail) {
    return h(
      "tr",
      attrs,
      columns.map((one) =>
        h(
          "td",
          { class: one.type === "number" ? "hatake-cell-number" : null },
          cellText(formatters, columns, one, block.row[one.field]),
        ),
      ),
    );
  }

  if (block.kind === ReportBlockKinds.groupHeader) {
    return h("tr", attrs, [
      h("td", { colspan: columns.length }, `${block.label}: ${String(block.value ?? "")}`),
    ]);
  }

  // 小計・総計。字は `reportTotalLines`（Flutter・紙と同じ）＝列の書式を通し、同じ列に
  // 合計が2つ以上あれば1つ1行で積んで何の数かを添える。0.9.20 までは1つ目だけを
  // 書式なしで出していた（「6360」だけで件数が消える）。見出しの字も Flutter・紙と同じ。
  return h("tr", attrs, [
    h("td", {}, block.kind === ReportBlockKinds.grandTotal ? "合計" : "小計"),
    ...columns.slice(1).map((one) => {
      const lines = reportTotalLines(definition.report, one.field, block, (value) =>
        cellText(formatters, columns, one, value),
      );
      return h(
        "td",
        { class: "hatake-cell-number" },
        lines.length <= 1 ? (lines[0] ?? "") : lines.map((line) => h("div", {}, line)),
      );
    }),
  ]);
}
