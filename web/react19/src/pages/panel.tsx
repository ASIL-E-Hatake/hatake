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
import { Fragment, useEffect, type CSSProperties, type ReactNode } from "react";

import { useActions } from "../parts/actions.js";
import { Icon } from "../parts/icon.js";
import { HatakePagination, HatakeSearch } from "../parts/table.js";
import { HatakeError, useController, useOnce, useRegistries } from "../scope.js";

/**
 * ダッシュボード（`kind: dashboard`）。**カード1枚ずつが自分の状態を持つ**ので、
 * 1つの Repository が落ちても落ちるのはそのカードだけ。
 *
 * 並べ方は**定義の `layout.columns` と各カードの `span`**。数の字はカードの
 * `format`、表のカードはカードの `columns` で出す（Flutter 版・Vue 版と同じ）。
 */
export function HatakeDashboardPage(props: {
  definition: DashboardPageDefinition;
  roles?: readonly string[];
  formatters?: FormatterRegistry;
}): ReactNode {
  const registries = useRegistries();
  const roles = props.roles ?? [];
  const formatters = props.formatters ?? new FormatterRegistry();
  const controller = useOnce(
    () =>
      new DashboardController({
        definition: props.definition,
        repositories: registries.repositories,
        // **見せないカードは読みにも行かない**（絞るのは土台）。
        roles,
      }),
    [props.definition.id, roles.join(",")],
  );
  useController(controller);
  const bar = useActions({ roles, formatters: props.formatters });
  useEffect(() => {
    void controller.init();
  }, [controller]);
  const columns = dashboardColumns(props.definition);

  return (
    <div className="hatake-page" data-hatake={`page:${props.definition.id}`}>
      <div className="hatake-page-header">
        <h1 className="hatake-title">{props.definition.title}</h1>
        {/* ダッシュボードには**行が無い**ので、`type: export` は出せない（押すと
            「この画面では出力できません」と言う）。遷移と `plugin` は使える。 */}
        {bar.page(props.definition.actions, () => ({
          controller,
          fallbackName: props.definition.title,
        }))}
        <button
          className="hatake-icon-button"
          type="button"
          title="読み直す"
          aria-label="読み直す"
          data-hatake="dashboard:reload"
          onClick={() => void controller.load()}
        >
          <Icon name="refresh" />
        </button>
      </div>
      <HatakeSearch search={props.definition.search} onSearch={(v) => void controller.search(v)} />
      <div
        className="hatake-dashboard"
        style={{ "--hatake-dashboard-columns": String(columns) } as CSSProperties}
      >
        {controller.items.map((item) => (
          <section
            key={item.id}
            className="hatake-card"
            style={{ gridColumn: `span ${cardSpan(item, columns)}` }}
            data-hatake={`card:${item.id}`}
          >
            <h2 className="hatake-card-title">{item.title}</h2>
            <CardBody item={item} controller={controller} formatters={formatters} roles={roles} />
          </section>
        ))}
      </div>
      {bar.overlay()}
    </div>
  );
}

function CardBody(props: {
  item: DashboardItemDefinition;
  controller: DashboardController;
  formatters: FormatterRegistry;
  roles: readonly string[];
}): ReactNode {
  const { item, formatters } = props;
  const state = props.controller.stateOf(item);
  if (state.loading) return <p className="hatake-table-empty">読み込み中…</p>;
  // **落ちたカードは落ちたと言う。** 0 を出すと、事故と「本当に0件」が混ざる。
  if (state.error !== null) return <HatakeError error={state.error} />;

  switch (item.type) {
    case DashboardItemTypes.metric:
      return (
        <p className="hatake-metric" data-hatake={`metric:${item.id}`}>
          {dashboardValueText(formatters, item, state.value)}
        </p>
      );
    case DashboardItemTypes.chart:
      return <Chart item={item} buckets={state.buckets} formatters={formatters} />;
    case DashboardItemTypes.table:
      return <CardTable item={item} rows={state.rows} formatters={formatters} roles={props.roles} />;
    default:
      // **知らない種類は黙って空にしない**（プラグインで足したのに描かれていない）。
      return (
        <p className="hatake-field-message" role="alert" data-hatake={`card:${item.id}:unsupported`}>
          描き方を知らないカードです: type = {item.type}
        </p>
      );
  }
}

/** 表のカード。**列はカードの `columns`**（見えない列は出さない）、字は一覧と同じ `cellText`。 */
function CardTable(props: {
  item: DashboardItemDefinition;
  rows: readonly DataRecord[];
  formatters: FormatterRegistry;
  roles: readonly string[];
}): ReactNode {
  const columns = props.item.columns.filter((one) => isAllowed(one.roles, props.roles));
  if (props.rows.length === 0 || columns.length === 0) {
    return (
      <p className="hatake-table-empty" data-hatake={`rows:${props.item.id}`}>
        該当するデータがありません
      </p>
    );
  }
  return (
    <table className="hatake-table" data-hatake={`rows:${props.item.id}`}>
      <thead>
        <tr>
          {columns.map((one) => (
            <th key={one.field} className={one.type === ColumnTypes.number ? "hatake-cell-number" : undefined}>
              {one.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row, at) => (
          <tr key={at}>
            {columns.map((one) => (
              <td key={one.field} className={one.type === ColumnTypes.number ? "hatake-cell-number" : undefined}>
                {cellText(props.formatters, columns, one, row[one.field])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * 図のカード。**形は土台が組む**（`chartShape`）。ここは SVG に置くだけで、色は
 * CSS（`--hatake-chart-N`）。外の図ライブラリには乗らない。Vue 版と同じ形。
 */
function Chart(props: {
  item: DashboardItemDefinition;
  buckets: readonly AggregateBucket[];
  formatters: FormatterRegistry;
}): ReactNode {
  const { item } = props;
  const shape = chartShape(item.chart?.kind ?? "bar", props.buckets, (value) =>
    dashboardValueText(props.formatters, item, value),
  );
  if (shape.kind === "empty") {
    return (
      <p className="hatake-table-empty" data-hatake={`chart:${item.id}`}>
        該当するデータがありません
      </p>
    );
  }
  if (shape.kind === "unsupported") {
    return (
      <p className="hatake-field-message" role="alert" data-hatake={`chart:${item.id}`}>
        描き方を知らない図です: kind = {shape.name}
      </p>
    );
  }

  const svg = (children: ReactNode, width = CHART_WIDTH): ReactNode => (
    <svg className="hatake-chart" viewBox={`0 0 ${width} ${CHART_HEIGHT}`} role="img" aria-label={item.title} data-hatake={`chart:${item.id}`}>
      {children}
    </svg>
  );

  if (shape.kind === "pie") {
    return (
      <div>
        {svg(
          shape.slices.map((one, at) => <path key={at} className={`hatake-chart-c${one.colorIndex}`} d={one.path} />),
          CHART_HEIGHT,
        )}
        {/* 円は**凡例が無いと読めない**ので、軸の字の代わりに凡例を出す。 */}
        <ul className="hatake-chart-legend">
          {shape.slices.map((one, at) => (
            <li key={at}>
              <span
                className={`hatake-chart-swatch hatake-chart-c${one.colorIndex}`}
                style={{ background: `var(--hatake-chart-${one.colorIndex + 1})` }}
              />
              {`${one.label} ${one.valueText}`}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const axis = <line className="hatake-chart-axis" x1={0} x2={CHART_WIDTH} y1={shape.baseline} y2={shape.baseline} />;

  if (shape.kind === "line") {
    return svg(
      <>
        {axis}
        <polyline className="hatake-chart-line" points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")} />
        {shape.points.map((p, at) => (
          <Fragment key={at}>
            <circle className="hatake-chart-c0" cx={p.x} cy={p.y} r={3} />
            <text className="hatake-chart-value" x={p.x} y={p.y - 6} textAnchor="middle">
              {p.valueText}
            </text>
            <text className="hatake-chart-label" x={p.x} y={shape.labelY} textAnchor="middle">
              {p.label}
            </text>
          </Fragment>
        ))}
      </>,
    );
  }

  return svg(
    <>
      {axis}
      {shape.bars.map((b, at) => (
        <Fragment key={at}>
          <rect className={`hatake-chart-c${b.colorIndex}`} x={b.x} y={b.y} width={b.width} height={b.height} />
          <text className="hatake-chart-value" x={b.center} y={b.y - 3} textAnchor="middle">
            {b.valueText}
          </text>
          <text className="hatake-chart-label" x={b.center} y={shape.labelY} textAnchor="middle">
            {b.label}
          </text>
        </Fragment>
      ))}
    </>,
  );
}

/**
 * 帳票（`kind: report`）。**刷るものなので繰らない** — 条件を1回走らせて紙を組み、
 * ページ送りは組み上がった紙の枚数に対して起きる。
 */
export function HatakeReportPage(props: {
  definition: ReportPageDefinition;
  roles?: readonly string[];
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
  const bar = useActions({ roles: props.roles ?? [], formatters: props.formatters });
  const sheet = controller.sheet;

  /**
   * 帳票が持っているもの。
   *
   * **出すのも刷るのも、組んだ紙と同じ行から出す**（画面に出ている1枚ぶんではない）。
   */
  const around = (): ActionSurroundings => ({
    controller,
    columns: props.definition.table.columns,
    fetchRows: () => Promise.resolve(controller.rows),
    printDocument: () => (controller.hasRun ? controller.document : undefined),
    fallbackName: props.definition.title,
    reportPage: props.definition,
  });

  return (
    <div className="hatake-page" data-hatake={`page:${props.definition.id}`}>
      <div className="hatake-page-header">
        <h1 className="hatake-title">{props.definition.title}</h1>
        {bar.page(props.definition.actions, around)}
      </div>
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
      {bar.overlay()}
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

  // 小計・総計。字は `reportTotalLines`（Flutter・紙と同じ）＝列の書式を通し、同じ列に
  // 合計が2つ以上あれば1つ1行で積んで何の数かを添える。見出しの字も Flutter・紙と同じ。
  return (
    <tr {...shared}>
      <td>{block.kind === ReportBlockKinds.grandTotal ? "合計" : "小計"}</td>
      {columns.slice(1).map((one) => {
        const lines = reportTotalLines(props.definition.report, one.field, block, (value) =>
          cellText(props.formatters, columns, one, value),
        );
        return (
          <td key={one.field} className="hatake-cell-number">
            {lines.length <= 1 ? (lines[0] ?? "") : lines.map((line, k) => <div key={k}>{line}</div>)}
          </td>
        );
      })}
    </tr>
  );
}
