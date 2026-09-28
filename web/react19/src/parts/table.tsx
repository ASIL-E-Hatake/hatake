import { FormatterRegistry } from "@hatake-fw/api";
import type { ColumnDefinition, FilterDefinition, SearchDefinition, TableDefinition } from "@hatake-fw/api";
import { cellText, ColumnTypes, FieldTypes, isAllowed, recordKeyOf, visibleOptions } from "@hatake-fw/api/internal";
import type { DataRecord } from "@hatake-fw/runtime";
import { useState, type ReactNode } from "react";

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
}): ReactNode {
  const formatters = props.formatters ?? new FormatterRegistry();
  const ascending = props.sortAscending ?? true;
  // **見えない列は出さない。** 役割で絞るのは定義の仕事（`roles`）。
  const columns = props.table.columns.filter((one) => isAllowed(one.roles, props.roles ?? []));

  const head = (
    <tr>
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
                colSpan={columns.length + (props.rowSlot === undefined ? 0 : 1)}
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
              return (
                <tr key={String(key)} data-hatake={`row:${String(key)}`}>
                  {columns.map((one) => (
                    <td
                      key={one.field}
                      className={one.type === ColumnTypes.number ? "hatake-cell-number" : undefined}
                      data-hatake={`cell:${one.field}`}
                    >
                      {cellText(formatters, [...(props.owners ?? [])], one, row[one.field])}
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
  const [values, setValues] = useState<DataRecord>({});
  if (props.search === undefined || props.search.filters.length === 0) return null;

  return (
    <form
      className="hatake-search"
      data-hatake="search"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSearch({ ...values });
      }}
    >
      {props.search.filters.map((one) => (
        <div key={one.field} className="hatake-field">
          <label className="hatake-field-label" htmlFor={`hatake-filter-${one.field}`}>
            {one.label}
          </label>
          {filter(one, values, (next) => setValues({ ...values, [one.field]: next }))}
        </div>
      ))}
      <button className="hatake-button hatake-button-primary" type="submit" data-hatake="search:submit">
        {props.submitLabel ?? "検索"}
      </button>
    </form>
  );
}

function filter(one: FilterDefinition, values: DataRecord, send: (next: unknown) => void): ReactNode {
  const value = values[one.field];
  const text = value === undefined || value === null ? "" : String(value);
  const id = `hatake-filter-${one.field}`;

  if (one.type === FieldTypes.select) {
    const options = visibleOptions(one, values);
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

/** ページ送り。**総件数から出した枚数の外には出さない。** */
export function HatakePagination(props: {
  page: number;
  pageCount: number;
  totalCount: number;
  onMove: (page: number) => void;
}): ReactNode {
  if (props.pageCount <= 1) {
    return (
      <div className="hatake-pagination" data-hatake="pagination">
        {props.totalCount} 件
      </div>
    );
  }
  return (
    <div className="hatake-pagination" data-hatake="pagination">
      <button
        className="hatake-button"
        data-hatake="pagination:prev"
        disabled={props.page <= 0}
        onClick={() => props.onMove(props.page - 1)}
      >
        前へ
      </button>
      <span>
        {props.page + 1} / {props.pageCount} ページ（{props.totalCount} 件）
      </span>
      <button
        className="hatake-button"
        data-hatake="pagination:next"
        disabled={props.page >= props.pageCount - 1}
        onClick={() => props.onMove(props.page + 1)}
      >
        次へ
      </button>
    </div>
  );
}
