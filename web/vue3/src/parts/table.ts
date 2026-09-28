import { FormatterRegistry } from "@hatake-fw/api";
import type { ColumnDefinition, TableDefinition } from "@hatake-fw/api";
import { cellText, ColumnTypes, isAllowed, recordKeyOf } from "@hatake-fw/api/internal";
import type { DataRecord } from "@hatake-fw/runtime";
import { defineComponent, h, type PropType } from "vue";

/**
 * 一覧の表。**列も、並べ替えできるかも、誰に見えるかも定義が決める。**
 *
 * 字にする所（`format` / 選択肢のラベル）は `cellText` に任せる。3版で同じ関数を
 * 通るので、**同じ定義なら Flutter と同じ字が出る**（0.9.4 でここを1か所にまとめた）。
 */
export const HatakeTable = defineComponent({
  name: "HatakeTable",
  props: {
    table: { type: Object as PropType<TableDefinition>, required: true },
    rows: { type: Array as PropType<readonly DataRecord[]>, required: true },
    keyFields: { type: Array as PropType<readonly string[]>, default: () => [] },
    /**
     * **選択肢を持っているもの**（入力項目・絞り込み）。
     *
     * 列そのものは選択肢を持たないので、`status` の値を「取引中」と出すには
     * こちらが要る。渡さないと一覧だけ `active` のまま出て、詳細と字が食い違う
     * （0.9.12 で見本が実際に踏んだ形）。
     */
    owners: {
      type: Array as PropType<readonly { field: string; options?: { value: unknown; label: string }[] }[]>,
      default: () => [],
    },
    /** いま見ている人の役割（列の出し分けに使う）。 */
    roles: { type: Array as PropType<readonly string[]>, default: () => [] },
    formatters: { type: Object as PropType<FormatterRegistry>, default: () => new FormatterRegistry() },
    sortField: { type: String, default: undefined },
    sortAscending: { type: Boolean, default: true },
    /** 行ごとに出すもの（編集・削除のボタンなど）。 */
    rowSlot: {
      type: Function as PropType<(row: DataRecord, key: unknown) => unknown>,
      default: undefined,
    },
    emptyText: { type: String, default: "該当するデータがありません" },
  },
  emits: {
    sort: (_field: string, _ascending: boolean) => true,
  },
  setup(props, { emit }) {
    return () => {
      // **見えない列は出さない。** 役割で絞るのは定義の仕事（`roles`）で、
      // ここは判定を `isAllowed` に任せるだけ。
      const columns = props.table.columns.filter((one) => isAllowed(one.roles, props.roles));

      const head = columns.map((one) =>
        h(
          "th",
          {
            class: one.type === ColumnTypes.number ? "hatake-cell-number" : null,
            style: one.width === undefined ? undefined : { width: `${one.width}px` },
            "data-hatake": `column:${one.field}`,
            ...(one.sortable
              ? {
                  role: "button",
                  tabindex: 0,
                  onClick: () =>
                    emit("sort", one.field, props.sortField === one.field ? !props.sortAscending : true),
                }
              : {}),
          },
          one.sortable ? `${one.label}${sortMark(one, props.sortField, props.sortAscending)}` : one.label,
        ),
      );
      if (props.rowSlot !== undefined) head.push(h("th", { class: "hatake-row-actions" }, ""));

      if (props.rows.length === 0) {
        return h("div", { class: "hatake-table-scroll" }, [
          h("table", { class: "hatake-table" }, [
            h("thead", h("tr", head)),
            h("tbody", h("tr", h("td", { colspan: head.length, class: "hatake-table-empty" }, props.emptyText))),
          ]),
        ]);
      }

      const body = props.rows.map((row) => {
        const key = recordKeyOf(props.keyFields, row);
        const cells = columns.map((one) =>
          h(
            "td",
            {
              class: one.type === ColumnTypes.number ? "hatake-cell-number" : null,
              "data-hatake": `cell:${one.field}`,
            },
            cellText(props.formatters, [...props.owners], one, row[one.field]),
          ),
        );
        if (props.rowSlot !== undefined) {
          cells.push(h("td", { class: "hatake-row-actions" }, props.rowSlot(row, key) as never));
        }
        // **行の見分けは定義の鍵**（並び順ではない）。並びで持つと、消したあとに
        // 別の行へ操作が当たる。
        return h("tr", { key: String(key), "data-hatake": `row:${String(key)}` }, cells);
      });

      return h("div", { class: "hatake-table-scroll" }, [
        h("table", { class: "hatake-table" }, [h("thead", h("tr", head)), h("tbody", body)]),
      ]);
    };
  },
});

const sortMark = (
  column: ColumnDefinition,
  sortField: string | undefined,
  ascending: boolean,
): string => (sortField !== column.field ? "" : ascending ? " ▲" : " ▼");
