import { FormatterRegistry } from "@hatake-fw/api";
import { ActionTypes, formFields, recordKeyOf } from "@hatake-fw/api/internal";
import type {
  CrudPageDefinition,
  MasterPageDefinition,
  SearchPageDefinition,
} from "@hatake-fw/api/internal";
import {
  type ActionSurroundings,
  CrudController,
  CrudMode,
  type DataRecord,
  ListController,
  rowSlots,
  visibleSections,
  withComputed,
} from "@hatake-fw/runtime";
import { useEffect, useState, type ReactNode } from "react";

import { useActions } from "../parts/actions.js";
import { HatakeField } from "../parts/field.js";
import { Sections } from "../parts/sections.js";
import { HatakePagination, HatakeSearch, HatakeTable, type OptionOwner } from "../parts/table.js";
import { HatakeError, useController, useOnce, useRegistries } from "../scope.js";

/**
 * **選択肢を持っているもの**を集める（入力項目＋絞り込み）。
 *
 * 一覧の字はここから引く。列そのものは選択肢を持たないことがあるので、渡さないと
 * 一覧だけ生の値（`active`）のまま出て、詳細と食い違う。
 */
export function ownersOf(
  definition: CrudPageDefinition | MasterPageDefinition | SearchPageDefinition,
): OptionOwner[] {
  const fields = "form" in definition ? formFields(definition.form) : [];
  return [...fields, ...(definition.search?.filters ?? [])];
}

/** 検索画面（`kind: search`）— 読むだけの一覧。 */
export function HatakeSearchPage(props: {
  definition: SearchPageDefinition;
  roles?: readonly string[];
  formatters?: FormatterRegistry;
}): ReactNode {
  const registries = useRegistries();
  const controller = useOnce(
    () =>
      new ListController({
        repository: registries.repositories.resolve(props.definition.repository),
        pageSize: props.definition.table.pagination.pageSize,
        keyFields: props.definition.keyFields,
      }),
    [props.definition.id],
  );
  useController(controller);
  const bar = useActions({
    roles: props.roles ?? [],
    formatters: props.formatters,
    keyFields: props.definition.keyFields,
  });
  useEffect(() => {
    void controller.init();
  }, [controller]);

  /** 押したときに渡す「画面が持っているもの」。**押した時点**の値を渡す。 */
  const around = (record?: DataRecord): ActionSurroundings => ({
    controller,
    record,
    records: controller.selectedRows,
    keyFields: props.definition.keyFields,
    columns: props.definition.table.columns,
    owners: ownersOf(props.definition),
    fetchRows: (limit) => controller.fetchForExport(limit),
    fallbackName: props.definition.title,
    setSelection: (keys) => controller.setSelection(keys),
  });
  const rowActionIds = props.definition.table.rowActions;

  return (
    <div className="hatake-page" data-hatake={`page:${props.definition.id}`}>
      {/* 題と画面のボタンを1段に（Flutter 版と同じ置き方）。 */}
      <div className="hatake-page-header">
        <h1 className="hatake-title">{props.definition.title}</h1>
        {bar.top(props.definition.actions, rowActionIds, () => around(), {
          rows: controller.selectedRows,
        })}
      </div>
      <HatakeSearch search={props.definition.search} onSearch={(v) => void controller.search(v)} />
      <HatakeError error={controller.error} />
      <HatakeTable
        table={props.definition.table}
        rows={controller.items}
        keyFields={props.definition.keyFields}
        owners={ownersOf(props.definition)}
        roles={props.roles}
        formatters={props.formatters}
        sortField={controller.query.sortField}
        sortAscending={controller.query.sortAscending}
        selectable={bar.selectable(props.definition.actions)}
        selectedKeys={controller.selectedKeys}
        allSelected={controller.allSelected}
        onSelect={(key) => controller.toggleSelected(key)}
        onSelectAll={() => controller.toggleAllSelected()}
        onSort={(field, ascending) => void controller.sortBy(field, ascending)}
        rowSlot={
          rowSlots(rowActionIds, props.definition.actions, props.roles ?? []).length === 0
            ? undefined
            : (row) => bar.row(props.definition.actions, rowActionIds, row, () => around(row))
        }
      />
      <HatakePagination
        page={controller.page}
        pageCount={controller.pageCount}
        totalCount={controller.totalCount}
        enabled={props.definition.table.pagination.enabled}
        shown={controller.items.length}
        onMove={(page) => void controller.setPage(page)}
      />
      {bar.overlay()}
    </div>
  );
}

/**
 * 一覧と入力を1枚で持つ画面（`kind: crud` / `master`）。
 *
 * **業務の判断は1つも持たない。** 既定値・必須・2件目を作らない・消せたか、は全部
 * `CrudController` が決めていて、ここは面を出し分けるだけ。
 *
 * 置き方は Flutter 版と同じ（Vue 版とも同じ）:
 *
 *   ・入力は**一覧の上に重ねるダイアログ**（題は「新規登録」／「編集」）
 *   ・「新規登録」は**定義に `type: create` を書いたときだけ**。行の「編集」「削除」も
 *     **`table.rowActions` に書いたときだけ**（0.9.19 までは書いていなくても出していた）
 *   ・「削除」は `confirm` を書いていなくても**必ず聞く**
 *
 * **書きかけの入れ物は関数形で更新する**（`setDraft((prev) => …)`）。
 * `setDraft({ ...draft, … })` と書くと**描画時の `draft` を掴む**ので、同じ tick で
 * 2つの項目が変わると先の値が消えうる。Vue 側は ref を読み直すので起きない
 * ＝React だけの落とし穴。
 */
export function HatakeCrudPage(props: {
  definition: CrudPageDefinition | MasterPageDefinition;
  roles?: readonly string[];
  formatters?: FormatterRegistry;
}): ReactNode {
  const registries = useRegistries();
  const controller = useOnce(
    () =>
      new CrudController({
        definition: props.definition,
        repository: registries.repositories.resolve(props.definition.repository),
      }),
    [props.definition.id],
  );
  useController(controller);
  const roles = props.roles ?? [];
  const bar = useActions({ roles, formatters: props.formatters, keyFields: props.definition.keyFields });
  const [draft, setDraft] = useState<DataRecord>({});
  useEffect(() => {
    void controller.init();
  }, [controller]);

  const startCreate = (): void => {
    controller.startCreate();
    setDraft({ ...controller.draft });
  };
  const startEdit = (row: DataRecord): void => {
    controller.startEdit(row);
    setDraft({ ...controller.draft });
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
    record: record ?? (controller.mode === CrudMode.list ? undefined : draft),
    records: controller.selectedRows,
    keyFields: props.definition.keyFields,
    mode: controller.mode === CrudMode.list ? undefined : controller.formMode,
    columns: props.definition.table.columns,
    owners: ownersOf(props.definition),
    fetchRows: (limit) => controller.fetchForExport(limit),
    fallbackName: props.definition.title,
    onCreate: () => startCreate(),
    setSelection: (keys) => controller.setSelection(keys),
  });

  const rowActionIds = props.definition.table.rowActions;
  const hasRowButtons = rowSlots(rowActionIds, props.definition.actions, roles).length > 0;
  const fields = formFields(props.definition.form);
  const title = controller.mode === CrudMode.create ? "新規登録" : "編集";

  return (
    <div className="hatake-page" data-hatake={`page:${props.definition.id}`}>
      <div className="hatake-page-header">
        <h1 className="hatake-title">{props.definition.title}</h1>
        {/* 定義が書いたボタン（新規登録・出力・一括・遷移…）。**書いたものだけ**が出る。 */}
        {bar.top(props.definition.actions, rowActionIds, () => around(), {
          rows: controller.selectedRows,
        })}
      </div>
      <HatakeSearch
        search={"search" in props.definition ? props.definition.search : undefined}
        onSearch={(v) => void controller.search(v)}
      />
      {controller.mode === CrudMode.list ? <HatakeError error={controller.error} /> : null}
      <HatakeTable
        table={props.definition.table}
        rows={controller.items}
        keyFields={props.definition.keyFields}
        owners={ownersOf(props.definition)}
        roles={props.roles}
        formatters={props.formatters}
        sortField={controller.query.sortField}
        sortAscending={controller.query.sortAscending}
        selectable={bar.selectable(props.definition.actions)}
        selectedKeys={controller.selectedKeys}
        allSelected={controller.allSelected}
        onSelect={(key) => controller.toggleSelected(key)}
        onSelectAll={() => controller.toggleAllSelected()}
        onSort={(field, ascending) => void controller.sortBy(field, ascending)}
        rowSlot={
          hasRowButtons
            ? (row) =>
                bar.row(props.definition.actions, rowActionIds, row, () => around(row), {
                  edit: () => startEdit(row),
                  delete: () => void remove(row),
                })
            : undefined
        }
      />
      <HatakePagination
        page={controller.page}
        pageCount={controller.pageCount}
        totalCount={controller.totalCount}
        enabled={props.definition.table.pagination.enabled}
        shown={controller.items.length}
        onMove={(page) => void controller.setPage(page)}
      />
      {controller.mode === CrudMode.list ? null : (
        <div className="hatake-dialog-backdrop" data-hatake="form:dialog">
          <form
            className="hatake-dialog hatake-form"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            data-hatake="form"
            onSubmit={(event) => {
              event.preventDefault();
              void controller.submitForm(draft);
            }}
          >
            <h2 className="hatake-dialog-title">{title}</h2>
            <HatakeError error={controller.error} />
            <Sections
              sections={visibleSections(props.definition.form, draft, roles, controller.formMode)}
              render={(field) => (
                <HatakeField
                  field={field}
                  // **計算した項目は写しに埋める。** 下書きそのものに混ぜると、保存の
                  // ときに計算結果まで書き戻すことになる。
                  record={withComputed(fields, draft)}
                  errors={controller.validation.errors}
                  mode={controller.formMode}
                  disabled={controller.submitting}
                  onChange={(name, value) => setDraft((prev) => ({ ...prev, [name]: value }))}
                />
              )}
            />
            <div className="hatake-dialog-actions">
              <button
                className="hatake-button hatake-button-text"
                type="button"
                data-hatake="form:cancel"
                disabled={controller.submitting}
                onClick={() => controller.cancelForm()}
              >
                キャンセル
              </button>
              <button
                className="hatake-button hatake-button-primary"
                type="submit"
                data-hatake="form:submit"
                disabled={controller.submitting}
              >
                保存
              </button>
            </div>
          </form>
        </div>
      )}
      {bar.overlay()}
    </div>
  );
}
