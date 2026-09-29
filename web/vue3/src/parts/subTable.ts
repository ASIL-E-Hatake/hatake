import { FormatterRegistry } from "@hatake-fw/api";
import { cellText, isAllowed } from "@hatake-fw/api/internal";
import type { FieldDefinition } from "@hatake-fw/api/internal";
import type { DataRecord } from "@hatake-fw/runtime";
import { defineComponent, h, type PropType } from "vue";

import { HatakeField } from "./field.js";

/**
 * 明細（`type: subTable`）。**親1件にぶら下がる子の行**。
 *
 * 字にする所は一覧と**同じ `cellText`** を通す（一覧では「特別」なのに明細では
 * `special`、を作らない）。
 *
 * 行を足す・消すは、**入力できる場所でだけ**出す（読むだけの画面に出すと、押せる
 * のに保存されないボタンになる）。入力する行の形は `fields` が在ればそれ、無ければ
 * `columns` から起こす —— DSL がそう決めている。
 */
export const HatakeSubTable = defineComponent({
  name: "HatakeSubTable",
  props: {
    field: { type: Object as PropType<FieldDefinition>, required: true },
    /** 親のレコード（この項目の値が子の行）。 */
    record: { type: Object as PropType<DataRecord>, required: true },
    roles: { type: Array as PropType<readonly string[]>, default: () => [] },
    formatters: { type: Object as PropType<FormatterRegistry>, default: () => new FormatterRegistry() },
    /** 直せるか。読むだけの画面（`detail`）では false。 */
    editable: { type: Boolean, default: false },
  },
  emits: {
    change: (_field: string, _rows: readonly DataRecord[]) => true,
  },
  setup(props, { emit }) {
    return () => {
      const one = props.field;
      const columns = one.columns.filter((column) => isAllowed(column.roles, props.roles));
      const raw = props.record[one.field];
      const rows: DataRecord[] = Array.isArray(raw) ? (raw as DataRecord[]) : [];

      const send = (next: readonly DataRecord[]): void => emit("change", one.field, next);
      // 入力する行の形。`fields` を書いていなければ列から起こす（DSL がそう決めている）。
      const rowFields: FieldDefinition[] = one.rowFields;

      const head = columns.map((column) =>
        h(
          "th",
          {
            class: column.type === "number" ? "hatake-cell-number" : null,
            style: column.width === undefined ? undefined : { width: `${column.width}px` },
          },
          column.label,
        ),
      );
      if (props.editable) head.push(h("th", { class: "hatake-row-actions" }, ""));

      const body =
        rows.length === 0
          ? [
              h(
                "tr",
                h(
                  "td",
                  { colspan: head.length, class: "hatake-table-empty" },
                  "明細はありません",
                ),
              ),
            ]
          : rows.map((row, at) =>
              h("tr", { key: at, "data-hatake": `subrow:${one.field}:${at}` }, [
                ...columns.map((column) => {
                  // 直せる場所では**入力に差し替える**（行の形は `fields`、無ければ
                  // 列から起こす）。
                  const input =
                    props.editable
                      ? (rowFields.find((f) => f.field === column.field) ??
                        fieldFromColumn(column))
                      : undefined;
                  if (input === undefined) {
                    return h(
                      "td",
                      {
                        class: column.type === "number" ? "hatake-cell-number" : null,
                        "data-hatake": `subcell:${column.field}`,
                      },
                      cellText(props.formatters, rowFields, column, row[column.field]),
                    );
                  }
                  return h("td", { "data-hatake": `subcell:${column.field}` }, [
                    h(HatakeField, {
                      field: { ...input, label: "" },
                      record: row,
                      onChange: (name: string, value: unknown) => {
                        const next = [...rows];
                        next[at] = { ...row, [name]: value };
                        send(next);
                      },
                    }),
                  ]);
                }),
                ...(props.editable
                  ? [
                      h("td", { class: "hatake-row-actions" }, [
                        h(
                          "button",
                          {
                            class: "hatake-button hatake-button-danger",
                            type: "button",
                            "data-hatake": `subrow:remove:${one.field}:${at}`,
                            onClick: () => send(rows.filter((_, i) => i !== at)),
                          },
                          "この行を消す",
                        ),
                      ]),
                    ]
                  : []),
              ]),
            );

      return h("div", { class: "hatake-field", "data-hatake": `subtable:${one.field}` }, [
        h("span", { class: "hatake-field-label" }, one.label),
        h("div", { class: "hatake-table-scroll" }, [
          h("table", { class: "hatake-table" }, [h("thead", h("tr", head)), h("tbody", body)]),
        ]),
        ...(props.editable
          ? [
              h(
                "button",
                {
                  class: "hatake-button",
                  type: "button",
                  "data-hatake": `subrow:add:${one.field}`,
                  onClick: () => send([...rows, {}]),
                },
                "行を足す",
              ),
            ]
          : []),
      ]);
    };
  },
});

/**
 * 列から入力の形を起こす（`fields` を書いていないとき）。
 *
 * DSL が「無ければ列から起こす」と決めているので、ここで決め直さない。
 */
function fieldFromColumn(column: {
  field: string;
  label: string;
  type?: string;
}): FieldDefinition {
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
