import { FormatterRegistry } from "@hatake-fw/api";
import { cellText, formFields } from "@hatake-fw/api/internal";
import type {
  DetailPageDefinition,
  FormPageDefinition,
  WizardPageDefinition,
} from "@hatake-fw/api/internal";
import { type DataRecord, DetailController, FormController, WizardController } from "@hatake-fw/runtime";
import { useEffect, useState, type ReactNode } from "react";

import { HatakeField } from "../parts/field.js";
import { HatakeError, useController, useOnce, useRegistries } from "../scope.js";

/** 入力だけの画面（`kind: form`）。鍵が在れば直す、無ければ作る。 */
export function HatakeFormPage(props: {
  definition: FormPageDefinition;
  recordKey?: unknown;
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
  const [draft, setDraft] = useState<DataRecord>({});
  useEffect(() => {
    void controller.init().then(() => setDraft({ ...controller.draft }));
  }, [controller]);

  return (
    <div className="hatake-page" data-hatake={`page:${props.definition.id}`}>
      <h1 className="hatake-title">{props.definition.title}</h1>
      <HatakeError error={controller.error} />
      <form
        className="hatake-form"
        data-hatake="form"
        onSubmit={(event) => {
          event.preventDefault();
          void controller.submit(draft).then((saved) => {
            if (saved !== null) props.onSaved?.(saved);
          });
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
        <button
          className="hatake-button hatake-button-primary"
          type="submit"
          data-hatake="form:submit"
          disabled={controller.submitting}
        >
          保存
        </button>
      </form>
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
  useEffect(() => {
    void controller.init();
  }, [controller]);

  const record = controller.record;
  const fields = formFields(props.definition.form);

  return (
    <div className="hatake-page" data-hatake={`page:${props.definition.id}`}>
      <h1 className="hatake-title">{props.definition.title}</h1>
      <HatakeError error={controller.error} />
      {record === null ? (
        <p className="hatake-table-empty">
          {controller.loading ? "読み込み中…" : "該当するデータがありません"}
        </p>
      ) : (
        <dl className="hatake-detail">
          {fields.map((one) => (
            <div key={one.field}>
              <dt className="hatake-field-label">{one.label}</dt>
              <dd data-hatake={`value:${one.field}`}>
                {cellText(formatters, fields, one, record[one.field])}
              </dd>
            </div>
          ))}
        </dl>
      )}
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
  const [draft, setDraft] = useState<DataRecord>({});
  useEffect(() => {
    void controller.init().then(() => setDraft({ ...controller.draft }));
  }, [controller]);

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
      <h1 className="hatake-title">{props.definition.title}</h1>
      <ol className="hatake-steps" data-hatake="wizard:steps">
        {controller.steps.map((one, at) => (
          <li key={one.id} className={at === controller.stepIndex ? "hatake-step-current" : undefined}>
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
              if (saved !== null) props.onSaved?.(saved);
            });
          } else {
            controller.next(draft);
            setDraft({ ...controller.draft });
          }
        }}
      >
        {step.description === undefined ? null : <p className="hatake-step-note">{step.description}</p>}
        {step.fields.map((field) => (
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
    </div>
  );
}
