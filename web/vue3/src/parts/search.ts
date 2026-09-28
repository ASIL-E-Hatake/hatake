import type { FilterDefinition, SearchDefinition } from "@hatake-fw/api";
import { FieldTypes, visibleOptions } from "@hatake-fw/api/internal";
import type { DataRecord } from "@hatake-fw/runtime";
import { defineComponent, h, ref, type PropType } from "vue";

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
            props.submitLabel,
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

/** ページ送り。**総件数から出した枚数の外には出さない。** */
export const HatakePagination = defineComponent({
  name: "HatakePagination",
  props: {
    page: { type: Number, required: true },
    pageCount: { type: Number, required: true },
    totalCount: { type: Number, required: true },
  },
  emits: {
    move: (_page: number) => true,
  },
  setup(props, { emit }) {
    return () => {
      if (props.pageCount <= 1) {
        return h("div", { class: "hatake-pagination", "data-hatake": "pagination" }, `${props.totalCount} 件`);
      }
      return h("div", { class: "hatake-pagination", "data-hatake": "pagination" }, [
        h(
          "button",
          {
            class: "hatake-button",
            "data-hatake": "pagination:prev",
            disabled: props.page <= 0,
            onClick: () => emit("move", props.page - 1),
          },
          "前へ",
        ),
        h("span", {}, `${props.page + 1} / ${props.pageCount} ページ（${props.totalCount} 件）`),
        h(
          "button",
          {
            class: "hatake-button",
            "data-hatake": "pagination:next",
            disabled: props.page >= props.pageCount - 1,
            onClick: () => emit("move", props.page + 1),
          },
          "次へ",
        ),
      ]);
    };
  },
});
