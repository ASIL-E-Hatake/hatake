import type { FilterDefinition, SearchDefinition } from "@hatake-fw/api";
import { FieldTypes, pagerView, visibleOptions } from "@hatake-fw/api/internal";
import type { DataRecord } from "@hatake-fw/runtime";
import { defineComponent, h, ref, type PropType } from "vue";

import { icon } from "./icon.js";

/**
 * 検索欄。**通す条件は定義に書いてあるものだけ**（`buildQuery` と同じ考え方）。
 *
 * ここで先回りして値を整えない。整え方が定義側と食い違うと、画面と API で違う結果が出る。
 */
export const HatakeSearch = defineComponent({
  name: "HatakeSearch",
  props: {
    search: { type: Object as PropType<SearchDefinition | undefined>, default: undefined },
    submitLabel: { type: String, default: "検索" },
  },
  emits: {
    search: (_values: DataRecord) => true,
  },
  setup(props, { emit }) {
    const values = ref<DataRecord>({});

    return () => {
      const search = props.search;
      if (search === undefined || search.filters.length === 0) return null;

      const run = (): void => {
        emit("search", { ...values.value });
      };

      return h(
        "form",
        {
          class: "hatake-search",
          "data-hatake": "search",
          // 列の数は定義（`search.layout.columns`）。1以下なら1枠 220px で並べる。
          ...(search.columns > 1
            ? { "data-hatake-columns": String(search.columns), style: { "--hatake-search-columns": String(search.columns) } }
            : {}),
          onSubmit: (event: Event) => {
            event.preventDefault();
            run();
          },
        },
        [
          ...search.filters.map((one) => filter(one, values.value, (next) => {
            values.value = { ...values.value, [one.field]: next };
          })),
          h(
            "button",
            { class: "hatake-button hatake-button-primary", type: "submit", "data-hatake": "search:submit" },
            [icon("search"), props.submitLabel],
          ),
        ],
      );
    };
  },
});

function filter(
  one: FilterDefinition,
  values: DataRecord,
  send: (next: unknown) => void,
): ReturnType<typeof h> {
  const value = values[one.field];
  const text = value === undefined || value === null ? "" : String(value);
  const shared = {
    id: `hatake-filter-${one.field}`,
    "data-hatake": `filter:${one.field}`,
    placeholder: one.label,
  };

  const control =
    one.type === FieldTypes.select
      ? h(
          "select",
          {
            ...shared,
            value: text,
            onChange: (event: Event) => {
              const picked = (event.target as HTMLSelectElement).value;
              const options = visibleOptions(one, values);
              send(options.find((option) => String(option.value) === picked)?.value ?? null);
            },
          },
          [
            h("option", { value: "" }, "—"),
            ...visibleOptions(one, values).map((option) =>
              h("option", { value: String(option.value) }, option.label),
            ),
          ],
        )
      : h("input", {
          ...shared,
          type: one.type === FieldTypes.number ? "number" : one.type === FieldTypes.date ? "date" : "text",
          value: text,
          onInput: (event: Event) => {
            const raw = (event.target as HTMLInputElement).value;
            send(raw === "" ? null : one.type === FieldTypes.number ? Number(raw) : raw);
          },
        });

  return h("div", { class: "hatake-field" }, [
    h("label", { class: "hatake-field-label", for: shared.id }, one.label),
    control,
  ]);
}

/**
 * ページ送り。**総件数から出した枚数の外には出さない。**
 *
 * `enabled: false`（`table.pagination.enabled`）なら送る口を出さず、`shown`（届いた
 * 行数）で出しきれていなければそう言う。字と出す／出さないは `pagerView` が決める。
 */
export const HatakePagination = defineComponent({
  name: "HatakePagination",
  props: {
    page: { type: Number, required: true },
    pageCount: { type: Number, required: true },
    totalCount: { type: Number, required: true },
    enabled: { type: Boolean, default: true },
    shown: { type: Number, default: undefined },
  },
  emits: {
    move: (_page: number) => true,
  },
  setup(props, { emit }) {
    return () => {
      // 置き方は Flutter 版と同じ（右寄せで「全 N 件 ‹ 1 / 3 ›」）。1ページで足りる
      // ときは送る口を出さない（押しても何も起きないボタンは、壊れていると読まれる）。
      const view = pagerView(
        { enabled: props.enabled },
        props.totalCount,
        props.shown ?? props.totalCount,
      );
      const total = h("span", { class: "hatake-pagination-total" }, view.text);
      if (!view.paged || props.pageCount <= 1) {
        return h("div", { class: "hatake-pagination", "data-hatake": "pagination" }, [total]);
      }
      return h("div", { class: "hatake-pagination", "data-hatake": "pagination" }, [
        total,
        h(
          "button",
          {
            class: "hatake-icon-button",
            type: "button",
            title: "前のページ",
            "aria-label": "前のページ",
            "data-hatake": "pagination:prev",
            disabled: props.page <= 0,
            onClick: () => emit("move", props.page - 1),
          },
          [icon("chevronLeft")],
        ),
        h("span", {}, `${props.page + 1} / ${props.pageCount}`),
        h(
          "button",
          {
            class: "hatake-icon-button",
            type: "button",
            title: "次のページ",
            "aria-label": "次のページ",
            "data-hatake": "pagination:next",
            disabled: props.page >= props.pageCount - 1,
            onClick: () => emit("move", props.page + 1),
          },
          [icon("chevron")],
        ),
      ]);
    };
  },
});
