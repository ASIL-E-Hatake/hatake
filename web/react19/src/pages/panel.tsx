import { type ColumnDefinition, FormatterRegistry } from "@hatake-fw/api";
import { cellText, DashboardItemTypes, ReportBlockKinds } from "@hatake-fw/api/internal";
import type {
  DashboardItemDefinition,
  DashboardPageDefinition,
  ReportBlock,
  ReportPageDefinition,
} from "@hatake-fw/api/internal";
import { DashboardController, ReportController } from "@hatake-fw/runtime";
import { useEffect, type ReactNode } from "react";

import { HatakePagination, HatakeSearch } from "../parts/table.js";
import { HatakeError, useController, useOnce, useRegistries } from "../scope.js";

/**
 * ダッシュボード（`kind: dashboard`）。**カード1枚ずつが自分の状態を持つ**ので、
 * 1つの Repository が落ちても落ちるのはそのカードだけ。
 */
export function HatakeDashboardPage(props: {
  definition: DashboardPageDefinition;
  formatters?: FormatterRegistry;
}): ReactNode {
  const registries = useRegistries();
  const controller = useOnce(
    () =>
      new DashboardController({
        definition: props.definition,
        repositories: registries.repositories,
      }),
    [props.definition.id],
  );
  useController(controller);
  useEffect(() => {
    void controller.init();
  }, [controller]);

  return (
    <div className="hatake-page" data-hatake={`page:${props.definition.id}`}>
      <h1 className="hatake-title">{props.definition.title}</h1>
      <HatakeSearch search={props.definition.search} onSearch={(v) => void controller.search(v)} />
      <div className="hatake-dashboard">
        {props.definition.items.map((item) => (
          <section
            key={item.id}
            className="hatake-card"
            style={{ gridColumn: `span ${item.span}` }}
            data-hatake={`card:${item.id}`}
          >
            <h2 className="hatake-card-title">{item.title}</h2>
            {cardBody(item, controller)}
          </section>
        ))}
      </div>
    </div>
  );
}

function cardBody(item: DashboardItemDefinition, controller: DashboardController): ReactNode {
  const state = controller.stateOf(item);
  if (state.loading) return <p className="hatake-table-empty">読み込み中…</p>;
  // **落ちたカードは落ちたと言う。** 0 を出すと、事故と「本当に0件」が混ざる。
  if (state.error !== null) return <HatakeError error={state.error} />;

  switch (item.type) {
    case DashboardItemTypes.metric:
      return (
        <p className="hatake-metric" data-hatake={`metric:${item.id}`}>
          {state.value === null ? "—" : String(state.value)}
        </p>
      );
    case DashboardItemTypes.chart:
      return (
        <ul className="hatake-chart" data-hatake={`chart:${item.id}`}>
          {state.buckets.map((bucket) => (
            <li key={bucket.label}>
              <span className="hatake-chart-label">{bucket.label}</span>
              <span className="hatake-chart-value hatake-cell-number">{String(bucket.value ?? "—")}</span>
            </li>
          ))}
        </ul>
      );
    default:
      return (
        <ul className="hatake-card-rows" data-hatake={`rows:${item.id}`}>
          {state.rows.map((row, at) => (
            <li key={at}>{Object.values(row).map(String).join(" / ")}</li>
          ))}
        </ul>
      );
  }
}

/**
 * 帳票（`kind: report`）。**刷るものなので繰らない** — 条件を1回走らせて紙を組み、
 * ページ送りは組み上がった紙の枚数に対して起きる。
 */
export function HatakeReportPage(props: {
  definition: ReportPageDefinition;
  formatters?: FormatterRegistry;
}): ReactNode {
  const registries = useRegistries();
  const formatters = props.formatters ?? new FormatterRegistry();
  const controller = useOnce(
    () =>
      new ReportController({
        definition: props.definition,
        repository: registries.repositories.resolve(props.definition.repository),
      }),
    [props.definition.id],
  );
  useController(controller);
  const sheet = controller.sheet;

  return (
    <div className="hatake-page" data-hatake={`page:${props.definition.id}`}>
      <h1 className="hatake-title">{props.definition.title}</h1>
      <HatakeSearch
        search={props.definition.search}
        submitLabel="出力"
        onSearch={(v) => void controller.run(v)}
      />
      <HatakeError error={controller.error} />
      {/* **押す前に空の紙を出さない**（出すと「0件だった」と読めてしまう）。 */}
      {!controller.hasRun ? (
        <p className="hatake-table-empty">条件を入れて「出力」を押してください。</p>
      ) : sheet === null ? (
        <p className="hatake-table-empty">該当するデータがありません</p>
      ) : (
        <div className="hatake-sheet" data-hatake="sheet">
          <table className="hatake-table">
            <tbody>
              {sheet.blocks.map((block, at) => (
                <ReportRow key={at} block={block} definition={props.definition} formatters={formatters} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {controller.hasRun && controller.totalPages > 1 ? (
        <HatakePagination
          page={controller.sheetIndex}
          pageCount={controller.totalPages}
          totalCount={controller.rows.length}
          onMove={(page) => controller.setSheet(page)}
        />
      ) : null}
    </div>
  );
}

/**
 * 紙の1行。**種類で出し分ける**（見出し・明細・小計・総計）。
 *
 * 明細の列は画面の `table` から来る（一覧と帳票が食い違わないように）。小計と総計の
 * 値は `report.totals` と**同じ並び**で来るので、列の位置に合わせて置く。
 */
function ReportRow(props: {
  block: ReportBlock;
  definition: ReportPageDefinition;
  formatters: FormatterRegistry;
}): ReactNode {
  const columns: ColumnDefinition[] = props.definition.table.columns;
  const block = props.block;
  const shared = { "data-hatake": `block:${block.kind}`, className: `hatake-${block.kind}` };

  if (block.kind === ReportBlockKinds.detail) {
    return (
      <tr {...shared}>
        {columns.map((one) => (
          <td key={one.field} className={one.type === "number" ? "hatake-cell-number" : undefined}>
            {cellText(props.formatters, columns, one, block.row[one.field])}
          </td>
        ))}
      </tr>
    );
  }

  if (block.kind === ReportBlockKinds.groupHeader) {
    return (
      <tr {...shared}>
        <td colSpan={columns.length}>
          {block.label}: {String(block.value ?? "")}
        </td>
      </tr>
    );
  }

  const totals = props.definition.report.totals;
  return (
    <tr {...shared}>
      <td>{block.kind === ReportBlockKinds.grandTotal ? "総計" : "小計"}</td>
      {columns.slice(1).map((one) => {
        const at = totals.findIndex((total) => total.field === one.field);
        return (
          <td key={one.field} className="hatake-cell-number">
            {at < 0 ? "" : String(block.totals[at] ?? "")}
          </td>
        );
      })}
    </tr>
  );
}
