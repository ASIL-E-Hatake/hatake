import { FormatterRegistry } from "@hatake-fw/api";
import { formFields } from "@hatake-fw/api/internal";
import type {
  CrudPageDefinition,
  MasterPageDefinition,
  SearchPageDefinition,
} from "@hatake-fw/api/internal";
import { CrudController, CrudMode, type DataRecord, ListController } from "@hatake-fw/runtime";
import { useEffect, useState, type ReactNode } from "react";

import { HatakeField } from "../parts/field.js";
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
      }),
    [props.definition.id],
  );
  useController(controller);
  useEffect(() => {
    void controller.init();
  }, [controller]);

  return (
    <div className="hatake-page" data-hatake={`page:${props.definition.id}`}>
      <h1 className="hatake-title">{props.definition.title}</h1>
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
        onSort={(field, ascending) => void controller.sortBy(field, ascending)}
      />
      <HatakePagination
        page={controller.page}
        pageCount={controller.pageCount}
        totalCount={controller.totalCount}
        onMove={(page) => void controller.setPage(page)}
      />
    </div>
  );
}

/**
 * 一覧と入力を1枚で持つ画面（`kind: crud` / `master`）。
 *
 * **業務の判断は1つも持たない。** 既定値・必須・2件目を作らない・消せたか、は全部
 * `CrudController` が決めていて、ここは面を出し分けるだけ。
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
  const [draft, setDraft] = useState<DataRecord>({});
  useEffect(() => {
    void controller.init();
  }, [controller]);

  if (controller.mode !== CrudMode.list) {
    return (
      <div className="hatake-page" data-hatake={`page:${props.definition.id}`}>
        <h1 className="hatake-title">{props.definition.title}</h1>
        <HatakeError error={controller.error} />
        <form
          className="hatake-form"
          data-hatake="form"
          onSubmit={(event) => {
            event.preventDefault();
            void controller.submitForm(draft);
          }}
        >
          {formFields(props.definition.form).map((field) => (
            <HatakeField
              key={field.field}
              field={field}
              record={draft}
              errors={controller.validation.errors}
              mode={controller.formMode}
              disabled={controller.submitting}
              onChange={(name, value) => setDraft((prev) => ({ ...prev, [name]: value }))}
            />
          ))}
          <div className="hatake-form-actions">
            <button
              className="hatake-button hatake-button-primary"
              type="submit"
              data-hatake="form:submit"
              disabled={controller.submitting}
            >
              保存
            </button>
            <button
              className="hatake-button"
              type="button"
              data-hatake="form:cancel"
              onClick={() => controller.cancelForm()}
            >
              やめる
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="hatake-page" data-hatake={`page:${props.definition.id}`}>
      <h1 className="hatake-title">{props.definition.title}</h1>
      <HatakeSearch
        search={"search" in props.definition ? props.definition.search : undefined}
        onSearch={(v) => void controller.search(v)}
      />
      <button
        className="hatake-button hatake-button-primary"
        data-hatake="list:create"
        onClick={() => {
          controller.startCreate();
          setDraft({ ...controller.draft });
        }}
      >
        新規登録
      </button>
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
        onSort={(field, ascending) => void controller.sortBy(field, ascending)}
        rowSlot={(row, key) => (
          <span className="hatake-row-buttons">
            <button
              className="hatake-button"
              data-hatake={`edit:${String(key)}`}
              onClick={() => {
                controller.startEdit(row);
                setDraft({ ...row });
              }}
            >
              編集
            </button>
            <button
              className="hatake-button hatake-button-danger"
              data-hatake={`delete:${String(key)}`}
              // **消す前に聞く。** 定義が `prompt` を持たなくても、消すのは聞く。
              onClick={() => {
                if (globalThis.confirm?.("この1件を削除します。よろしいですか？") !== false) {
                  void controller.deleteRecord(key);
                }
              }}
            >
              削除
            </button>
          </span>
        )}
      />
      <HatakePagination
        page={controller.page}
        pageCount={controller.pageCount}
        totalCount={controller.totalCount}
        onMove={(page) => void controller.setPage(page)}
      />
    </div>
  );
}
