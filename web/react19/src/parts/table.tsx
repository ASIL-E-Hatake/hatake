import { FormatterRegistry } from "@hatake-fw/api";
import type { ColumnDefinition, FilterDefinition, SearchDefinition, TableDefinition } from "@hatake-fw/api";
import { cellText, ColumnTypes, FieldTypes, filterDefaults, isAllowed, pagerView, recordKeyOf } from "@hatake-fw/api/internal";
import { type DataRecord, OptionsFetcher } from "@hatake-fw/runtime";
import { useState, type ReactNode } from "react";

import { useController, useOnce, useRegistries } from "../scope.js";
import { Icon } from "./icon.js";

/** 選択肢を持っているもの（入力項目・絞り込み）。列そのものは持たないことがある。 */
export type OptionOwner = { field: string; options?: { value: unknown; label: string }[] };

/**
 * 一覧の表。**列も、並べ替えできるかも、誰に見えるかも定義が決める。**
 *
 * 字にする所は `cellText` に任せる＝3版で同じ関数を通るので、**同じ定義なら
 * Flutter / Vue と同じ字が出る**（0.9.15 で共有フィクスチャに載せた所）。
 */
export function HatakeTable(props: {
  table: TableDefinition;
  rows: readonly DataRecord[];
  keyFields?: readonly string[];
  /** 選択肢の持ち主（列は選択肢を持たないので、ラベルを出すにはこれが要る）。 */
  owners?: readonly OptionOwner[];
  /** いま見ている人の役割（列の出し分けに使う）。 */
  roles?: readonly string[];
  formatters?: FormatterRegistry;
  sortField?: string;
  sortAscending?: boolean;
  onSort?: (field: string, ascending: boolean) => void;
  rowSlot?: (row: DataRecord, key: unknown) => ReactNode;
  emptyText?: string;
  /**
   * 行を選べるようにするか。
   *
   * **決めるのは定義**（`scope: selection` のボタンが1つでも在るか）で、ここは
   * 渡されたとおりに出すだけ。選べるのに実行するボタンが無い画面を作らない
   * ＝チェック欄だけ在って何も起きない、が一番たちが悪い。
   */
  selectable?: boolean;
  /** いま選ばれている鍵（このページに出ているぶん）。 */
  selectedKeys?: readonly unknown[];
  allSelected?: boolean;
  onSelect?: (key: unknown) => void;
  onSelectAll?: () => void;
}): ReactNode {
  const formatters = props.formatters ?? new FormatterRegistry();
  const ascending = props.sortAscending ?? true;
  // 名前を引く列（`column.optionsSource`）の名前の表。表で1回だけ引いて覚える。
  const registries = useRegistries();
  const lookups = useOnce(() => new OptionsFetcher(registries.repositories), [registries]);
  useController(lookups);
  // **見えない列は出さない。** 役割で絞るのは定義の仕事（`roles`）。名前を引く列は、
  // 引いた表を列の選択肢にする（引く順は `cellText` のまま）。
  const columns = props.table.columns
    .filter((one) => isAllowed(one.roles, props.roles ?? []))
    .map((one) => (one.optionsSource === undefined ? one : { ...one, options: lookups.optionsFor(one, {}) }));

  const picked = new Set((props.selectedKeys ?? []).map(String));

  const head = (
    <tr>
      {props.selectable !== true ? null : (
        <th className="hatake-select">
          <input
            type="checkbox"
            data-hatake="select:all"
            aria-label="このページを全部選ぶ"
            checked={props.allSelected === true}
            onChange={() => props.onSelectAll?.()}
          />
        </th>
      )}
      {columns.map((one) => (
        <th
          key={one.field}
          className={one.type === ColumnTypes.number ? "hatake-cell-number" : undefined}
          style={one.width === undefined ? undefined : { width: `${one.width}px` }}
          data-hatake={`column:${one.field}`}
          {...(one.sortable
            ? {
                role: "button",
                tabIndex: 0,
                onClick: () =>
                  props.onSort?.(one.field, props.sortField === one.field ? !ascending : true),
              }
            : {})}
        >
          {one.label}
          {mark(one, props.sortField, ascending)}
        </th>
      ))}
      {props.rowSlot === undefined ? null : <th className="hatake-row-actions" />}
    </tr>
  );

  return (
    <div className="hatake-table-scroll">
      <table className="hatake-table">
        <thead>{head}</thead>
        <tbody>
          {props.rows.length === 0 ? (
            <tr>
              <td
                colSpan={
                  columns.length +
                  (props.rowSlot === undefined ? 0 : 1) +
                  (props.selectable === true ? 1 : 0)
                }
                className="hatake-table-empty"
              >
                {props.emptyText ?? "該当するデータがありません"}
              </td>
            </tr>
          ) : (
            props.rows.map((row) => {
              // **行の見分けは定義の鍵**（並び順ではない）。並びで持つと、消したあとに
              // 別の行へ操作が当たる。
              const key = recordKeyOf(props.keyFields ?? [], row);
              const mine = picked.has(String(key));
              return (
                <tr
                  key={String(key)}
                  className={props.selectable === true && mine ? "hatake-row-selected" : undefined}
                  data-hatake={`row:${String(key)}`}
                >
                  {props.selectable !== true ? null : (
                    <td className="hatake-select">
                      <input
                        type="checkbox"
                        data-hatake={`select:${String(key)}`}
                        aria-label={`${String(key)} を選ぶ`}
                        checked={mine}
                        onChange={() => props.onSelect?.(key)}
                      />
                    </td>
                  )}
                  {columns.map((one) => (
                    <td
                      key={one.field}
                      className={one.type === ColumnTypes.number ? "hatake-cell-number" : undefined}
                      data-hatake={`cell:${one.field}`}
                    >
                      <Cell
                        column={one}
                        value={row[one.field]}
                        text={cellText(formatters, [...(props.owners ?? [])], one, row[one.field])}
                      />
                    </td>
                  ))}
                  {props.rowSlot === undefined ? null : (
                    <td className="hatake-row-actions">{props.rowSlot(row, key)}</td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 列の型で見せ方を変える（字にするのは `cellText` ただ1か所）。Flutter 版と同じ:
 * `badge` は札、`boolean` は ✓ / ×。Vue 版と同じ印・クラス名。
 */
function Cell(props: { column: ColumnDefinition; value: unknown; text: string }): ReactNode {
  if (props.column.type === ColumnTypes.badge) {
    return props.text === "" ? props.text : <span className="hatake-badge">{props.text}</span>;
  }
  if (props.column.type === ColumnTypes.boolean) {
    const yes = props.value === true;
    return (
      <span className="hatake-boolean" role="img" aria-label={yes ? "はい" : "いいえ"}>
        <Icon name={yes ? "check" : "close"} />
      </span>
    );
  }
  return props.text;
}

const mark = (column: ColumnDefinition, sortField: string | undefined, ascending: boolean): string =>
  !column.sortable || sortField !== column.field ? "" : ascending ? " ▲" : " ▼";

/**
 * 検索欄。**通す条件は定義に書いてあるものだけ**（`buildQuery` と同じ考え方）。
 *
 * ここで先回りして値を整えない。整え方が定義側と食い違うと、画面と API で違う結果が出る。
 */
export function HatakeSearch(props: {
  search?: SearchDefinition;
  submitLabel?: string;
  onSearch: (values: DataRecord) => void;
}): ReactNode {
  // 既定値（`filter.defaultValue`）で埋めて始める。一覧の最初の読み込みも同じ値
  // （`filterDefaults`）なので、入力欄と一覧が食い違わない。
  const [values, setValues] = useState<DataRecord>(() => filterDefaults(props.search));
  // 選択肢の取り寄せ（`optionsSource`）。入力フォームと同じ規則（Flutter と同じ）。
  const registries = useRegistries();
  const fetcher = useOnce(() => new OptionsFetcher(registries.repositories), [registries]);
  useController(fetcher);
  if (props.search === undefined || props.search.filters.length === 0) return null;

  return (
    <form
      className="hatake-search"
      data-hatake="search"
      // 列の数は定義（`search.layout.columns`）。1以下なら1枠 220px で並べる。
      {...(props.search.columns > 1
        ? {
            "data-hatake-columns": String(props.search.columns),
            style: { "--hatake-search-columns": String(props.search.columns) } as Record<string, string>,
          }
        : {})}
      onSubmit={(event) => {
        event.preventDefault();
        props.onSearch({ ...values });
      }}
    >
      {props.search.filters.map((one) =>
        one.operator === "between" ? (
          <Range key={one.field} one={one} values={values} send={(next) => setValues({ ...values, [one.field]: next })} />
        ) : (
          <div key={one.field} className="hatake-field">
            <label className="hatake-field-label" htmlFor={`hatake-filter-${one.field}`}>
              {one.label}
            </label>
            {filter(one, values, fetcher, (next) => setValues({ ...values, [one.field]: next }))}
          </div>
        ),
      )}
      <button className="hatake-button hatake-button-primary" type="submit" data-hatake="search:submit">
        <Icon name="search" />
        {props.submitLabel ?? "検索"}
      </button>
    </form>
  );
}

/** 1つの入力欄（範囲の片側にも使う）。 */
function Input(props: {
  one: FilterDefinition;
  value: unknown;
  mark: string;
  id: string;
  send: (next: unknown) => void;
}): ReactNode {
  const { one } = props;
  return (
    <input
      id={props.id}
      data-hatake={props.mark}
      placeholder={one.label}
      type={one.type === FieldTypes.number ? "number" : one.type === FieldTypes.date ? "date" : "text"}
      value={props.value === undefined || props.value === null ? "" : String(props.value)}
      onChange={(e) =>
        props.send(e.target.value === "" ? null : one.type === FieldTypes.number ? Number(e.target.value) : e.target.value)
      }
    />
  );
}

/**
 * 範囲（`between`）。「から」「まで」の2つの欄で、値は `[from, to]`（Flutter と同じ）。
 * 両方とも空なら条件にしない。
 */
function Range(props: { one: FilterDefinition; values: DataRecord; send: (next: unknown) => void }): ReactNode {
  const { one } = props;
  const raw = props.values[one.field];
  const pair = Array.isArray(raw) ? (raw as unknown[]) : [null, null];
  const put = (at: 0 | 1) => (next: unknown) => {
    const both = at === 0 ? [next, pair[1] ?? null] : [pair[0] ?? null, next];
    props.send(both[0] === null && both[1] === null ? null : both);
  };
  return (
    <div className="hatake-field">
      <label className="hatake-field-label" htmlFor={`hatake-filter-${one.field}-from`}>
        {one.label}
      </label>
      <div className="hatake-range">
        <Input one={one} value={pair[0]} mark={`filter:${one.field}:from`} id={`hatake-filter-${one.field}-from`} send={put(0)} />
        <span className="hatake-range-sep">〜</span>
        <Input one={one} value={pair[1]} mark={`filter:${one.field}:to`} id={`hatake-filter-${one.field}-to`} send={put(1)} />
      </div>
    </div>
  );
}

function filter(
  one: FilterDefinition,
  values: DataRecord,
  fetcher: OptionsFetcher,
  send: (next: unknown) => void,
): ReactNode {
  const value = values[one.field];
  const text = value === undefined || value === null ? "" : String(value);
  const id = `hatake-filter-${one.field}`;

  if (one.type === FieldTypes.select) {
    const options = fetcher.optionsFor(one, values);
    return (
      <select
        id={id}
        data-hatake={`filter:${one.field}`}
        value={text}
        onChange={(e) => send(options.find((o) => String(o.value) === e.target.value)?.value ?? null)}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      id={id}
      data-hatake={`filter:${one.field}`}
      placeholder={one.label}
      type={one.type === FieldTypes.number ? "number" : one.type === FieldTypes.date ? "date" : "text"}
      value={text}
      onChange={(e) =>
        send(e.target.value === "" ? null : one.type === FieldTypes.number ? Number(e.target.value) : e.target.value)
      }
    />
  );
}

/**
 * ページ送り。**総件数から出した枚数の外には出さない。**
 *
 * `enabled: false`（`table.pagination.enabled`）なら送る口を出さず、`shown`（届いた
 * 行数）で出しきれていなければそう言う。字と出す／出さないは `pagerView` が決める。
 */
export function HatakePagination(props: {
  page: number;
  pageCount: number;
  totalCount: number;
  enabled?: boolean;
  shown?: number;
  onMove: (page: number) => void;
}): ReactNode {
  // 置き方は Flutter 版と同じ（右寄せで「全 N 件 ‹ 1 / 3 ›」）。1ページで足りる
  // ときは送る口を出さない（押しても何も起きないボタンは、壊れていると読まれる）。
  const view = pagerView(
    { enabled: props.enabled ?? true },
    props.totalCount,
    props.shown ?? props.totalCount,
  );
  const total = <span className="hatake-pagination-total">{view.text}</span>;
  if (!view.paged || props.pageCount <= 1) {
    return (
      <div className="hatake-pagination" data-hatake="pagination">
        {total}
      </div>
    );
  }
  return (
    <div className="hatake-pagination" data-hatake="pagination">
      {total}
      <button
        className="hatake-icon-button"
        type="button"
        title="前のページ"
        aria-label="前のページ"
        data-hatake="pagination:prev"
        disabled={props.page <= 0}
        onClick={() => props.onMove(props.page - 1)}
      >
        <Icon name="chevronLeft" />
      </button>
      <span>
        {props.page + 1} / {props.pageCount}
      </span>
      <button
        className="hatake-icon-button"
        type="button"
        title="次のページ"
        aria-label="次のページ"
        data-hatake="pagination:next"
        disabled={props.page >= props.pageCount - 1}
        onClick={() => props.onMove(props.page + 1)}
      >
        <Icon name="chevron" />
      </button>
    </div>
  );
}
