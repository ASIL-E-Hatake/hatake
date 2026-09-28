import { type ColumnDefinition, FormatterRegistry } from "@hatake-fw/api";
import { cellText, DashboardItemTypes, ReportBlockKinds } from "@hatake-fw/api/internal";
import type {
  DashboardItemDefinition,
  DashboardPageDefinition,
  ReportBlock,
  ReportPageDefinition,
} from "@hatake-fw/api/internal";
import { DashboardController, type DataRecord, ReportController } from "@hatake-fw/runtime";
import { defineComponent, h, onMounted, type PropType } from "vue";

import { HatakePagination, HatakeSearch } from "../parts/search.js";
import { touch, useController, useRegistries } from "../scope.js";
import { errorOf } from "./list.js";

/**
 * ダッシュボード（`kind: dashboard`）。**カード1枚ずつが自分の状態を持つ**ので、
 * 1つの Repository が落ちても落ちるのはそのカードだけ。
 */
export const HatakeDashboardPage = defineComponent({
  name: "HatakeDashboardPage",
  props: {
    definition: { type: Object as PropType<DashboardPageDefinition>, required: true },
    formatters: { type: Object as PropType<FormatterRegistry>, default: () => new FormatterRegistry() },
  },
  setup(props) {
    const registries = useRegistries();
    const controller = new DashboardController({
      definition: props.definition,
      repositories: registries.repositories,
    });
    const { version } = useController(controller);
    onMounted(() => void controller.init());

    return () => {
      touch(version);
      return h("div", { class: "hatake-page", "data-hatake": `page:${props.definition.id}` }, [
        h("h1", { class: "hatake-title" }, props.definition.title),
        h(HatakeSearch, {
          search: props.definition.search,
          onSearch: (values: DataRecord) => void controller.search(values),
        }),
        h(
          "div",
          { class: "hatake-dashboard" },
          props.definition.items.map((item) => card(item, controller, props.formatters)),
        ),
      ]);
    };
  },
});

function card(
  item: DashboardItemDefinition,
  controller: DashboardController,
  formatters: FormatterRegistry,
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
          state.value === null ? "—" : String(state.value),
        );
      case DashboardItemTypes.chart:
        return h(
          "ul",
          { class: "hatake-chart", "data-hatake": `chart:${item.id}` },
          state.buckets.map((bucket) =>
            h("li", {}, [
              h("span", { class: "hatake-chart-label" }, bucket.label),
              h("span", { class: "hatake-chart-value hatake-cell-number" }, String(bucket.value ?? "—")),
            ]),
          ),
        );
      default:
        return h(
          "ul",
          { class: "hatake-card-rows", "data-hatake": `rows:${item.id}` },
          state.rows.map((row) => h("li", {}, Object.values(row).map(String).join(" / "))),
        );
    }
  };

  return h(
    "section",
    {
      class: "hatake-card",
      style: { gridColumn: `span ${item.span}` },
      "data-hatake": `card:${item.id}`,
    },
    [h("h2", { class: "hatake-card-title" }, item.title), body()],
  );
}

/**
 * 帳票（`kind: report`）。**刷るものなので繰らない** — 条件を1回走らせて紙を組み、
 * ページ送りは組み上がった紙の枚数に対して起きる。
 */
export const HatakeReportPage = defineComponent({
  name: "HatakeReportPage",
  props: {
    definition: { type: Object as PropType<ReportPageDefinition>, required: true },
    formatters: { type: Object as PropType<FormatterRegistry>, default: () => new FormatterRegistry() },
  },
  setup(props) {
    const registries = useRegistries();
    const controller = new ReportController({
      definition: props.definition,
      repository: registries.repositories.resolve(props.definition.repository),
    });
    const { version } = useController(controller);

    return () => {
      touch(version);
      const sheet = controller.sheet;
      return h("div", { class: "hatake-page", "data-hatake": `page:${props.definition.id}` }, [
        h("h1", { class: "hatake-title" }, props.definition.title),
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

  // 小計・総計。**位置で対応する**ので、合計を出す列だけ埋めて他は空ける。
  const totals = definition.report.totals;
  return h("tr", attrs, [
    h("td", {}, block.kind === ReportBlockKinds.grandTotal ? "総計" : "小計"),
    ...columns.slice(1).map((one) => {
      const at = totals.findIndex((total) => total.field === one.field);
      return h(
        "td",
        { class: "hatake-cell-number" },
        at < 0 ? "" : String(block.totals[at] ?? ""),
      );
    }),
  ]);
}
