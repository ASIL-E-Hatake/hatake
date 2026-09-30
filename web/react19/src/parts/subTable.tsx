import { FormatterRegistry } from "@hatake-fw/api";
import { cellText, isAllowed } from "@hatake-fw/api/internal";
import type { ColumnDefinition, FieldDefinition } from "@hatake-fw/api/internal";
import { type DataRecord, OptionsFetcher } from "@hatake-fw/runtime";
import type { ReactNode } from "react";

import { useOnce, useRegistries } from "../scope.js";
import { HatakeField } from "./field.js";

/**
 * 明細（`type: subTable`）。**親1件にぶら下がる子の行**。
 *
 * 字にする所は一覧と**同じ `cellText`** を通す（一覧では「特別」なのに明細では
 * `special`、を作らない）。Vue 版と**同じ印・同じクラス名**を出す。
 *
 * 行を足す・消すは、**入力できる場所でだけ**出す（読むだけの画面に出すと、押せる
 * のに保存されないボタンになる）。入力する行の形は `fields` が在ればそれ、無ければ
 * `columns` から起こす —— DSL がそう決めている。
 */
export function HatakeSubTable(props: {
  field: FieldDefinition;
  /** 親のレコード（この項目の値が子の行）。 */
  record: DataRecord;
  roles?: readonly string[];
  formatters?: FormatterRegistry;
  /** 直せるか。読むだけの画面（`detail`）では false。 */
  editable?: boolean;
  onChange?: (field: string, rows: readonly DataRecord[]) => void;
}): ReactNode {
  // 明細の欄は行の数だけ並ぶので、選択肢の取り寄せは表で1つを共有する
  // （行の数だけ同じ一覧を引かない）。
  const registries = useRegistries();
  const fetcher = useOnce(() => new OptionsFetcher(registries.repositories), [registries]);
  const one = props.field;
  const formatters = props.formatters ?? new FormatterRegistry();
  const editable = props.editable === true;
  const columns = one.columns.filter((column) => isAllowed(column.roles, props.roles ?? []));
  const raw = props.record[one.field];
  const rows: DataRecord[] = Array.isArray(raw) ? (raw as DataRecord[]) : [];
  const send = (next: readonly DataRecord[]): void => props.onChange?.(one.field, next);
  // 入力する行の形。`fields` を書いていなければ列から起こす（DSL がそう決めている）。
  const rowFields = one.rowFields;

  return (
    <div className="hatake-field" data-hatake={`subtable:${one.field}`}>
      <span className="hatake-field-label">{one.label}</span>
      <div className="hatake-table-scroll">
        <table className="hatake-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.field}
                  className={column.type === "number" ? "hatake-cell-number" : undefined}
                  style={column.width === undefined ? undefined : { width: `${column.width}px` }}
                >
                  {column.label}
                </th>
              ))}
              {editable ? <th className="hatake-row-actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (editable ? 1 : 0)} className="hatake-table-empty">
                  明細はありません
                </td>
              </tr>
            ) : (
              rows.map((row, at) => (
                <tr key={at} data-hatake={`subrow:${one.field}:${at}`}>
                  {columns.map((column) => {
                    // 直せる場所では**入力に差し替える**（行の形は `fields`、無ければ
                    // 列から起こす）。
                    const input = editable
                      ? (rowFields.find((f) => f.field === column.field) ?? fieldFromColumn(column))
                      : undefined;
                    return (
                      <td
                        key={column.field}
                        className={
                          input === undefined && column.type === "number"
                            ? "hatake-cell-number"
                            : undefined
                        }
                        data-hatake={`subcell:${column.field}`}
                      >
                        {input === undefined ? (
                          cellText(formatters, rowFields, column, row[column.field])
                        ) : (
                          <HatakeField
                            field={{ ...input, label: "" }}
                            record={row}
                            fetcher={fetcher}
                            onChange={(name, value, copied) => {
                              const next = [...rows];
                              next[at] = { ...row, ...copied, [name]: value };
                              send(next);
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                  {editable ? (
                    <td className="hatake-row-actions">
                      <button
                        className="hatake-button hatake-button-danger"
                        type="button"
                        data-hatake={`subrow:remove:${one.field}:${at}`}
                        onClick={() => send(rows.filter((_, i) => i !== at))}
                      >
                        この行を消す
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editable ? (
        <button
          className="hatake-button"
          type="button"
          data-hatake={`subrow:add:${one.field}`}
          onClick={() => send([...rows, {}])}
        >
          行を足す
        </button>
      ) : null}
    </div>
  );
}

/**
 * 列から入力の形を起こす（`fields` を書いていないとき）。
 *
 * DSL が「無ければ列から起こす」と決めているので、ここで決め直さない。
 */
function fieldFromColumn(column: ColumnDefinition): FieldDefinition {
  return {
    field: column.field,
    label: column.label,
    type: column.type === "number" ? "number" : "text",
    required: false,
    readOnly: false,
    options: [],
    columns: [],
    rowFields: [],
    validators: [],
    roles: [],
    config: {},
  } as unknown as FieldDefinition;
}
