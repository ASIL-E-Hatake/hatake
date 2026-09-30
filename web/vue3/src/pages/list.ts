import { FormatterRegistry } from "@hatake-fw/api";
import type { ActionDefinition } from "@hatake-fw/api/internal";
import { ActionScopes, ActionTypes, formFields, recordKeyOf } from "@hatake-fw/api/internal";
import type { CrudPageDefinition, MasterPageDefinition, SearchPageDefinition } from "@hatake-fw/api/internal";
import {
  CrudController,
  CrudMode,
  type ActionSurroundings,
  type DataRecord,
  ListController,
  rowSlots,
  visibleSections,
  withComputed,
} from "@hatake-fw/runtime";
import { defineComponent, h, onMounted, shallowRef, type PropType } from "vue";

import { useActions, type ActionBar } from "../parts/actions.js";
import { HatakeField } from "../parts/field.js";
import { sectionNodes } from "../parts/sections.js";
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
      keyFields: props.definition.keyFields,
    });
    const { version } = useController(controller);
    const bar = useActions({
      roles: props.roles,
      formatters: props.formatters,
      keyFields: props.definition.keyFields,
    });
    onMounted(() => void controller.init());

    /** 押したときに渡す「画面が持っているもの」。**押した時点**の値を渡す。 */
    const around = (record?: DataRecord): ActionSurroundings => ({
      controller,
      record,
      records: controller.selectedRows,
      keyFields: props.definition.keyFields,
      columns: props.definition.table.columns,
      owners: ownersOf(props.definition),
      fetchRows: (limit: number) => controller.fetchForExport(limit),
      fallbackName: props.definition.title,
      setSelection: (keys: readonly unknown[]) => controller.setSelection(keys),
    });

    return () => {
      touch(version);
      const rowActionIds = props.definition.table.rowActions;
      return h("div", { class: "hatake-page", "data-hatake": `page:${props.definition.id}` }, [
        // 題と画面のボタンを1段に（Flutter 版と同じ置き方）。
        h("div", { class: "hatake-page-header" }, [
          h("h1", { class: "hatake-title" }, props.definition.title),
          bar.top(props.definition.actions, rowActionIds, () => around(), {
            rows: controller.selectedRows,
          }),
        ]),
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
          selectable: selectable(props.definition.actions, bar),
          selectedKeys: controller.selectedKeys,
          allSelected: controller.allSelected,
          onSort: (field: string, ascending: boolean) => void controller.sortBy(field, ascending),
          onSelect: (key: unknown) => controller.toggleSelected(key),
          onSelectAll: () => controller.toggleAllSelected(),
          rowSlot:
            rowSlots(rowActionIds, props.definition.actions, props.roles).length === 0
              ? undefined
              : (row: DataRecord) => bar.row(props.definition.actions, rowActionIds, row, () => around(row)),
        }),
        h(HatakePagination, {
          page: controller.page,
          pageCount: controller.pageCount,
          totalCount: controller.totalCount,
          enabled: props.definition.table.pagination.enabled,
          shown: controller.items.length,
          onMove: (page: number) => void controller.setPage(page),
        }),
        bar.overlay(),
      ]);
    };
  },
});

/**
 * 一覧と入力を1枚で持つ画面（`kind: crud` / `master`）。
 *
 * **業務の判断は1つも持たない。** 既定値・必須・2件目を作らない・消せたか、は全部
 * `CrudController` が決めていて、ここは面を出し分けるだけ。
 *
 * 置き方は Flutter 版と同じ:
 *
 *   ・入力は**一覧の上に重ねるダイアログ**（題は「新規登録」／「編集」）。一覧は
 *     消さないので、閉じたら同じ位置・同じ条件に戻る
 *   ・「新規登録」は**定義に `type: create` を書いたときだけ**出る。行の「編集」「削除」も
 *     **`table.rowActions` に書いたときだけ**（0.9.19 までは書いていなくても出していた
 *     ＝`rowActions: []` の画面でも消せた）
 *   ・「削除」は `confirm` を書いていなくても**必ず聞く**（取り消せない唯一の操作）
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
    const bar = useActions({
      roles: props.roles,
      formatters: props.formatters,
      keyFields: props.definition.keyFields,
    });
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
    const remove = async (row: DataRecord): Promise<void> => {
      const declared = props.definition.actions.find((one) => one.type === ActionTypes.delete);
      if (!(await bar.confirmDelete(declared))) return;
      await controller.deleteRecord(recordKeyOf(props.definition.keyFields, row));
    };

    /** 押したときに渡す「画面が持っているもの」。 */
    const around = (record?: DataRecord): ActionSurroundings => ({
      controller,
      // 入力中は**いま入力されている値**で判定する（保存前の値で出し分ける）。
      record: record ?? (controller.mode === CrudMode.list ? undefined : draft.value),
      records: controller.selectedRows,
      keyFields: props.definition.keyFields,
      mode: controller.mode === CrudMode.list ? undefined : controller.formMode,
      columns: props.definition.table.columns,
      owners: ownersOf(props.definition),
      fetchRows: (limit: number) => controller.fetchForExport(limit),
      fallbackName: props.definition.title,
      onCreate: () => startCreate(),
      setSelection: (keys: readonly unknown[]) => controller.setSelection(keys),
    });

    /** 入力のダイアログ（一覧の上に重ねる）。 */
    const formDialog = (): ReturnType<typeof h> => {
      const fields = formFields(props.definition.form);
      const title = controller.mode === CrudMode.create ? "新規登録" : "編集";
      return h("div", { class: "hatake-dialog-backdrop", "data-hatake": "form:dialog" }, [
        h(
          "form",
          {
            class: "hatake-dialog hatake-form",
            role: "dialog",
            "aria-modal": "true",
            "aria-label": title,
            "data-hatake": "form",
            onSubmit: (event: Event) => {
              event.preventDefault();
              void controller.submitForm(draft.value);
            },
          },
          [
            h("h2", { class: "hatake-dialog-title" }, title),
            ...errorOf(controller.error),
            ...sectionNodes(visibleSections(props.definition.form, draft.value, props.roles, controller.formMode), (field) =>
              h(HatakeField, {
                field,
                // **計算した項目は写しに埋める。** 下書きそのものに混ぜると、保存の
                // ときに計算結果まで書き戻すことになる。
                record: withComputed(fields, draft.value),
                errors: controller.validation.errors,
                mode: controller.formMode,
                disabled: controller.submitting,
                onChange: (name: string, value: unknown) => {
                  draft.value = { ...draft.value, [name]: value };
                },
              }),
            ),
            h("div", { class: "hatake-dialog-actions" }, [
              h(
                "button",
                {
                  class: "hatake-button hatake-button-text",
                  type: "button",
                  "data-hatake": "form:cancel",
                  disabled: controller.submitting,
                  onClick: () => controller.cancelForm(),
                },
                "キャンセル",
              ),
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
            ]),
          ],
        ),
      ]);
    };

    return () => {
      touch(version);
      const rowActionIds = props.definition.table.rowActions;
      const hasRowButtons = rowSlots(rowActionIds, props.definition.actions, props.roles).length > 0;

      return h("div", { class: "hatake-page", "data-hatake": `page:${props.definition.id}` }, [
        h("div", { class: "hatake-page-header" }, [
          h("h1", { class: "hatake-title" }, props.definition.title),
          // 定義が書いたボタン（新規登録・出力・一括・遷移…）。**書いたものだけ**が出る。
          bar.top(props.definition.actions, rowActionIds, () => around(), {
            rows: controller.selectedRows,
          }),
        ]),
        h(HatakeSearch, {
          search: "search" in props.definition ? props.definition.search : undefined,
          onSearch: (values: DataRecord) => void controller.search(values),
        }),
        ...(controller.mode === CrudMode.list ? errorOf(controller.error) : []),
        h(HatakeTable, {
          table: props.definition.table,
          rows: controller.items,
          keyFields: props.definition.keyFields,
          owners: ownersOf(props.definition),
          roles: props.roles,
          formatters: props.formatters,
          sortField: controller.query.sortField,
          sortAscending: controller.query.sortAscending,
          selectable: selectable(props.definition.actions, bar),
          selectedKeys: controller.selectedKeys,
          allSelected: controller.allSelected,
          onSelect: (key: unknown) => controller.toggleSelected(key),
          onSelectAll: () => controller.toggleAllSelected(),
          onSort: (field: string, ascending: boolean) => void controller.sortBy(field, ascending),
          rowSlot: hasRowButtons
            ? (row: DataRecord) =>
                bar.row(props.definition.actions, rowActionIds, row, () => around(row), {
                  edit: () => startEdit(row),
                  delete: () => void remove(row),
                })
            : undefined,
        }),
        h(HatakePagination, {
          page: controller.page,
          pageCount: controller.pageCount,
          totalCount: controller.totalCount,
          enabled: props.definition.table.pagination.enabled,
          shown: controller.items.length,
          onMove: (page: number) => void controller.setPage(page),
        }),
        controller.mode === CrudMode.list ? null : formDialog(),
        bar.overlay(),
      ]);
    };
  },
});

/**
 * 行を選べるようにするか。
 *
 * **決めるのは定義**＝`scope: selection` のボタンが、その人に1つでも見えているか。
 * 見えていないのにチェック欄だけ出すと、選んでも何も起きない列が残る（押した人には
 * 壊れて見える）。
 */
function selectable(actions: readonly ActionDefinition[], bar: ActionBar): boolean {
  return bar.runner.visible(actions, ActionScopes.selection).length > 0;
}

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
