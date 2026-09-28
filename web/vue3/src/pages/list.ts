import { FormatterRegistry } from "@hatake-fw/api";
import { formFields } from "@hatake-fw/api/internal";
import type { CrudPageDefinition, MasterPageDefinition, SearchPageDefinition } from "@hatake-fw/api/internal";
import { CrudController, CrudMode, type DataRecord, ListController } from "@hatake-fw/runtime";
import { computed, defineComponent, h, onMounted, ref, shallowRef, type PropType } from "vue";

import { HatakeField } from "../parts/field.js";
import { HatakePagination, HatakeSearch } from "../parts/search.js";
import { HatakeTable } from "../parts/table.js";
import { touch, useController, useRegistries } from "../scope.js";

/**
 * 検索画面（`kind: search`）— 読むだけの一覧。
 *
 * 押せるボタンも、並べ替えできる列も、1ページの件数も、**全部定義から来る**。
 */
export const HatakeSearchPage = defineComponent({
  name: "HatakeSearchPage",
  props: {
    definition: { type: Object as PropType<SearchPageDefinition>, required: true },
    roles: { type: Array as PropType<readonly string[]>, default: () => [] },
    formatters: { type: Object as PropType<FormatterRegistry>, default: () => new FormatterRegistry() },
  },
  setup(props) {
    const registries = useRegistries();
    const controller = new ListController({
      repository: registries.repositories.resolve(props.definition.repository),
      pageSize: props.definition.table.pagination.pageSize,
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
        ...errorOf(controller.error),
        h(HatakeTable, {
          table: props.definition.table,
          rows: controller.items,
          keyFields: props.definition.keyFields,
          owners: ownersOf(props.definition),
          roles: props.roles,
          formatters: props.formatters,
          sortField: controller.query.sortField,
          sortAscending: controller.query.sortAscending,
          onSort: (field: string, ascending: boolean) => void controller.sortBy(field, ascending),
        }),
        h(HatakePagination, {
          page: controller.page,
          pageCount: controller.pageCount,
          totalCount: controller.totalCount,
          onMove: (page: number) => void controller.setPage(page),
        }),
      ]);
    };
  },
});

/**
 * 一覧と入力を1枚で持つ画面（`kind: crud` / `master`）。
 *
 * **業務の判断は1つも持たない。** 既定値・必須・2件目を作らない・消せたか、は全部
 * `CrudController` が決めていて、ここは面を出し分けるだけ。
 */
export const HatakeCrudPage = defineComponent({
  name: "HatakeCrudPage",
  props: {
    definition: { type: Object as PropType<CrudPageDefinition | MasterPageDefinition>, required: true },
    roles: { type: Array as PropType<readonly string[]>, default: () => [] },
    formatters: { type: Object as PropType<FormatterRegistry>, default: () => new FormatterRegistry() },
  },
  setup(props) {
    const registries = useRegistries();
    const controller = new CrudController({
      definition: props.definition,
      repository: registries.repositories.resolve(props.definition.repository),
    });
    const { version } = useController(controller);
    const draft = shallowRef<DataRecord>({});
    onMounted(() => void controller.init());

    const startCreate = (): void => {
      controller.startCreate();
      draft.value = { ...controller.draft };
    };
    const startEdit = (row: DataRecord): void => {
      controller.startEdit(row);
      draft.value = { ...controller.draft };
    };

    return () => {
      touch(version);

      if (controller.mode !== CrudMode.list) {
        return h("div", { class: "hatake-page", "data-hatake": `page:${props.definition.id}` }, [
          h("h1", { class: "hatake-title" }, props.definition.title),
          ...errorOf(controller.error),
          h(
            "form",
            {
              class: "hatake-form",
              "data-hatake": "form",
              onSubmit: (event: Event) => {
                event.preventDefault();
                void controller.submitForm(draft.value);
              },
            },
            [
              ...formFields(props.definition.form).map((field) =>
                h(HatakeField, {
                  field,
                  record: draft.value,
                  errors: controller.validation.errors,
                  mode: controller.formMode,
                  disabled: controller.submitting,
                  onChange: (name: string, value: unknown) => {
                    draft.value = { ...draft.value, [name]: value };
                  },
                }),
              ),
              h("div", { class: "hatake-form-actions" }, [
                h(
                  "button",
                  {
                    class: "hatake-button hatake-button-primary",
                    type: "submit",
                    "data-hatake": "form:submit",
                    disabled: controller.submitting,
                  },
                  "保存",
                ),
                h(
                  "button",
                  {
                    class: "hatake-button",
                    type: "button",
                    "data-hatake": "form:cancel",
                    onClick: () => controller.cancelForm(),
                  },
                  "やめる",
                ),
              ]),
            ],
          ),
        ]);
      }

      return h("div", { class: "hatake-page", "data-hatake": `page:${props.definition.id}` }, [
        h("h1", { class: "hatake-title" }, props.definition.title),
        h(HatakeSearch, {
          search: "search" in props.definition ? props.definition.search : undefined,
          onSearch: (values: DataRecord) => void controller.search(values),
        }),
        h(
          "button",
          { class: "hatake-button hatake-button-primary", "data-hatake": "list:create", onClick: startCreate },
          "新規登録",
        ),
        ...errorOf(controller.error),
        h(HatakeTable, {
          table: props.definition.table,
          rows: controller.items,
          keyFields: props.definition.keyFields,
          owners: ownersOf(props.definition),
          roles: props.roles,
          formatters: props.formatters,
          sortField: controller.query.sortField,
          sortAscending: controller.query.sortAscending,
          onSort: (field: string, ascending: boolean) => void controller.sortBy(field, ascending),
          rowSlot: (row: DataRecord, key: unknown) =>
            h("span", { class: "hatake-row-buttons" }, [
              h(
                "button",
                {
                  class: "hatake-button",
                  "data-hatake": `edit:${String(key)}`,
                  onClick: () => startEdit(row),
                },
                "編集",
              ),
              h(
                "button",
                {
                  class: "hatake-button hatake-button-danger",
                  "data-hatake": `delete:${String(key)}`,
                  // **消す前に聞く。** 定義が `prompt` を持たなくても、消すのは聞く。
                  onClick: () => {
                    if (globalThis.confirm?.("この1件を削除します。よろしいですか？") !== false) {
                      void controller.deleteRecord(key);
                    }
                  },
                },
                "削除",
              ),
            ]),
        }),
        h(HatakePagination, {
          page: controller.page,
          pageCount: controller.pageCount,
          totalCount: controller.totalCount,
          onMove: (page: number) => void controller.setPage(page),
        }),
      ]);
    };
  },
});

/**
 * 失敗をそのまま出す。**黙って空の一覧を出さない**（この枠組みが避けたい形）。
 */
export function errorOf(error: unknown): ReturnType<typeof h>[] {
  if (error === null || error === undefined) return [];
  return [
    h(
      "p",
      { class: "hatake-field-message", role: "alert", "data-hatake": "error" },
      error instanceof Error ? error.message : String(error),
    ),
  ];
}

/**
 * **選択肢を持っているもの**を集める（入力項目＋絞り込み）。
 *
 * 一覧の字はここから引く。列そのものは選択肢を持たないので、渡さないと
 * 一覧だけ生の値（`active`）のまま出て、詳細と食い違う。
 */
function ownersOf(
  definition: CrudPageDefinition | MasterPageDefinition | SearchPageDefinition,
): { field: string; options?: { value: unknown; label: string }[] }[] {
  const fields = "form" in definition ? formFields(definition.form) : [];
  const filters = definition.search?.filters ?? [];
  return [...fields, ...filters];
}
