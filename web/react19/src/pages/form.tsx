import { FormatterRegistry } from "@hatake-fw/api";
import { cellText, FieldTypes, formFields, isAllowed } from "@hatake-fw/api/internal";
import type {
  DetailPageDefinition,
  FormPageDefinition,
  WizardPageDefinition,
} from "@hatake-fw/api/internal";
import {
  type ActionSurroundings,
  type DataRecord,
  DetailController,
  FormController,
  visibleSections,
  WizardController,
  withComputed,
} from "@hatake-fw/runtime";
import { useEffect, useState, type ReactNode } from "react";

import { useActions } from "../parts/actions.js";
import { HatakeField } from "../parts/field.js";
import { Sections } from "../parts/sections.js";
import { HatakeSubTable } from "../parts/subTable.js";
import { HatakeError, useController, useOnce, useRegistries } from "../scope.js";

/** 入力だけの画面（`kind: form`）。鍵が在れば直す、無ければ作る。 */
export function HatakeFormPage(props: {
  definition: FormPageDefinition;
  recordKey?: unknown;
  roles?: readonly string[];
  formatters?: FormatterRegistry;
  onSaved?: (record: DataRecord) => void;
}): ReactNode {
  const registries = useRegistries();
  const controller = useOnce(
    () =>
      new FormController({
        definition: props.definition,
        repository: registries.repositories.resolve(props.definition.repository),
        recordKey: props.recordKey,
      }),
    [props.definition.id, String(props.recordKey)],
  );
  useController(controller);
  const bar = useActions({ roles: props.roles ?? [], formatters: props.formatters });
  const [draft, setDraft] = useState<DataRecord>({});
  useEffect(() => {
    void controller.init().then(() => setDraft({ ...controller.draft }));
  }, [controller]);

  // **いま入力されている値**で判定する（保存前の値で出し分ける）。
  const around = (): ActionSurroundings => ({
    controller,
    record: draft,
    mode: controller.formMode,
    fallbackName: props.definition.title,
  });

  return (
    <div className="hatake-page" data-hatake={`page:${props.definition.id}`}>
      <div className="hatake-page-header">
        <h1 className="hatake-title">{props.definition.title}</h1>
        {bar.page(props.definition.actions, around, {
          record: draft,
          mode: controller.formMode,
        })}
      </div>
      <HatakeError error={controller.error} />
      <form
        className="hatake-form"
        data-hatake="form"
        onSubmit={(event) => {
          event.preventDefault();
          void controller.submit(draft).then((saved) => {
            if (saved === null) return;
            // 保存できたと**言う**（黙って終わると、押せたのか分からない）。
            bar.runner.messages.say("保存しました", true);
            props.onSaved?.(saved);
          });
        }}
      >
        <Sections
          sections={visibleSections(props.definition.form, draft, props.roles ?? [], controller.formMode)}
          render={(field) =>
          field.type === FieldTypes.subTable ? (
            <HatakeSubTable
              key={field.field}
              field={field}
              record={draft}
              roles={props.roles}
              formatters={props.formatters}
              editable
              onChange={(name, rows) => setDraft((prev) => ({ ...prev, [name]: [...rows] }))}
            />
          ) : (
            <HatakeField
              key={field.field}
              field={field}
              // **計算した項目は写しに埋める。** 下書きそのものに混ぜると、保存の
              // ときに計算結果まで書き戻すことになる。
              record={withComputed(formFields(props.definition.form), draft)}
              errors={controller.validation.errors}
              mode={controller.formMode}
              disabled={controller.submitting}
              onChange={(name, value) => setDraft((prev) => ({ ...prev, [name]: value }))}
            />
          )
          }
        />
        <div className="hatake-form-actions">
          <button
            className="hatake-button hatake-button-primary"
            type="submit"
            data-hatake="form:submit"
            disabled={controller.submitting || controller.loading}
          >
            保存
          </button>
        </div>
      </form>
      {bar.overlay()}
    </div>
  );
}

/**
 * 詳細画面（`kind: detail`）— 読むだけ。
 *
 * 字にする所は一覧と**同じ `cellText`** を通す。ここを別に書くと、一覧では「出荷済」
 * なのに詳細では `shipped` と出る（0.9.12 で見本が実際に踏んだ形）。
 */
export function HatakeDetailPage(props: {
  definition: DetailPageDefinition;
  recordKey?: unknown;
  roles?: readonly string[];
  formatters?: FormatterRegistry;
}): ReactNode {
  const registries = useRegistries();
  const formatters = props.formatters ?? new FormatterRegistry();
  const controller = useOnce(
    () =>
      new DetailController({
        repository: registries.repositories.resolve(props.definition.repository),
        recordKey: props.recordKey,
      }),
    [props.definition.id, String(props.recordKey)],
  );
  useController(controller);
  const bar = useActions({ roles: props.roles ?? [], formatters: props.formatters });
  useEffect(() => {
    void controller.init();
  }, [controller]);

  const fields = formFields(props.definition.form);
  // **計算した項目をここで埋める。** 埋めないと「合計」「上位3件」が空のまま出て、
  // 定義に書いてあるのに効いていないように見える。
  const record = controller.record === null ? null : withComputed(fields, controller.record);

  return (
    <div className="hatake-page" data-hatake={`page:${props.definition.id}`}>
      <div className="hatake-page-header">
        <h1 className="hatake-title">{props.definition.title}</h1>
        {/* 読むだけの画面のボタンは、**いま開いているレコード**で判定する。 */}
        {bar.page(
          props.definition.actions,
          () => ({ controller, record: record ?? undefined, fallbackName: props.definition.title }),
          { record: record ?? undefined },
        )}
      </div>
      <HatakeError error={controller.error} />
      {record === null ? (
        <p className="hatake-table-empty">
          {controller.loading ? "読み込み中…" : "該当するデータがありません"}
        </p>
      ) : (
        <div className="hatake-detail-sections">
          {/* 区画ごとに題を置く（Flutter 版と同じ）。**その人に見せない項目は出さない**。 */}
          {visibleSections(props.definition.form, record, props.roles ?? []).map((section, at) => (
            <section key={at} className="hatake-section">
              {section.title === undefined ? null : <h3 className="hatake-section-title">{section.title}</h3>}
              <dl className="hatake-detail">
                {section.fields.map((one) =>
                  // 明細は**表で出す**（`、` で繋いだ1行にすると、列も整形も消える）。
                  // 見出しは表の側が出すので `dt` は置かない（同じ字が2回並ぶ）。
                  one.type === FieldTypes.subTable ? (
                    <dd key={one.field} className="hatake-detail-wide" data-hatake={`value:${one.field}`}>
                      <HatakeSubTable
                        field={one}
                        record={record}
                        roles={props.roles}
                        formatters={props.formatters}
                      />
                    </dd>
                  ) : (
                    <div key={one.field}>
                      <dt className="hatake-field-label">{one.label}</dt>
                      <dd data-hatake={`value:${one.field}`}>
                        {cellText(formatters, fields, one, record[one.field])}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            </section>
          ))}
        </div>
      )}
      {bar.overlay()}
    </div>
  );
}

/**
 * ウィザード（`kind: wizard`）。**1枚ずつ検証して、最後に1回だけ保存する。**
 *
 * 1枚も出せないとき（条件で全部隠れた）に黙って1枚目を出さないのが要点。それを
 * やると「条件が効いていない」ように見えて、原因に辿り着けない。
 */
export function HatakeWizardPage(props: {
  definition: WizardPageDefinition;
  recordKey?: unknown;
  roles?: readonly string[];
  formatters?: FormatterRegistry;
  onSaved?: (record: DataRecord) => void;
}): ReactNode {
  const registries = useRegistries();
  const controller = useOnce(
    () =>
      new WizardController({
        definition: props.definition,
        repository: registries.repositories.resolve(props.definition.repository),
        recordKey: props.recordKey,
      }),
    [props.definition.id, String(props.recordKey)],
  );
  useController(controller);
  const bar = useActions({ roles: props.roles ?? [], formatters: props.formatters });
  const [draft, setDraft] = useState<DataRecord>({});
  useEffect(() => {
    void controller.init().then(() => setDraft({ ...controller.draft }));
  }, [controller]);

  const around = (): ActionSurroundings => ({
    controller,
    record: draft,
    mode: controller.formMode,
    fallbackName: props.definition.title,
  });

  if (!controller.hasStep) {
    return (
      <div className="hatake-page" data-hatake={`page:${props.definition.id}`}>
        <h1 className="hatake-title">{props.definition.title}</h1>
        <p className="hatake-field-message" role="alert" data-hatake="wizard:no-step">
          出せるステップが1枚もありません（ステップの出し分けの条件を見直してください）。
        </p>
      </div>
    );
  }

  const step = controller.step;

  return (
    <div className="hatake-page" data-hatake={`page:${props.definition.id}`}>
      <div className="hatake-page-header">
        <h1 className="hatake-title">{props.definition.title}</h1>
        {/* ウィザードにも画面のボタンが書ける（`wizardPage.actions`）。ステップの
            「戻る／次へ」とは別もので、**いま入力されている値**で判定する。 */}
        {bar.page(props.definition.actions, around, {
          record: draft,
          mode: controller.formMode,
        })}
      </div>
      <ol className="hatake-steps" data-hatake="wizard:steps">
        {controller.steps.map((one, at) => (
          <li
            key={one.id}
            className={at === controller.stepIndex ? "hatake-step-current" : undefined}
            aria-current={at === controller.stepIndex ? "step" : undefined}
          >
            <span className="hatake-step-number">{at + 1}</span>
            {one.title}
          </li>
        ))}
      </ol>
      <HatakeError error={controller.error} />
      <form
        className="hatake-form"
        data-hatake="form"
        onSubmit={(event) => {
          event.preventDefault();
          if (controller.isLastStep) {
            void controller.submit(draft).then((saved) => {
              if (saved === null) return;
              bar.runner.messages.say("保存しました", true);
              props.onSaved?.(saved);
            });
          } else {
            controller.next(draft);
            setDraft({ ...controller.draft });
          }
        }}
      >
        {/* ステップの題を見出しにも出す（Flutter 版と同じ）。 */}
        <h3 className="hatake-section-title">{step.title}</h3>
        {step.description === undefined ? null : <p className="hatake-step-note">{step.description}</p>}
        {step.fields.filter((field) => isAllowed(field.roles, props.roles ?? [])).map((field) => (
          <HatakeField
            key={field.field}
            field={field}
            record={withComputed(step.fields, draft)}
            errors={controller.validation.errors}
            mode={controller.formMode}
            disabled={controller.submitting}
            onChange={(name, value) => setDraft((prev) => ({ ...prev, [name]: value }))}
          />
        ))}
        <div className="hatake-form-actions">
          <button
            className="hatake-button"
            type="button"
            data-hatake="wizard:back"
            disabled={controller.isFirstStep}
            // **戻るときは検証しない**（書きかけのステップから戻れないと詰む）。
            onClick={() => {
              controller.back(draft);
              setDraft({ ...controller.draft });
            }}
          >
            戻る
          </button>
          <button
            className="hatake-button hatake-button-primary"
            type="submit"
            data-hatake={controller.isLastStep ? "wizard:submit" : "wizard:next"}
            disabled={controller.submitting}
          >
            {controller.isLastStep ? "保存" : "次へ"}
          </button>
        </div>
      </form>
      {bar.overlay()}
    </div>
  );
}
