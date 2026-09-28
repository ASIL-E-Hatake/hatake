import { FormatterRegistry } from "@hatake-fw/api";
import { cellText, formFields } from "@hatake-fw/api/internal";
import type { DetailPageDefinition, FormPageDefinition, WizardPageDefinition } from "@hatake-fw/api/internal";
import { type DataRecord, DetailController, FormController, WizardController } from "@hatake-fw/runtime";
import { defineComponent, h, onMounted, shallowRef, type PropType } from "vue";

import { HatakeField } from "../parts/field.js";
import { touch, useController, useRegistries } from "../scope.js";
import { errorOf } from "./list.js";

/** 入力だけの画面（`kind: form`）。鍵が在れば直す、無ければ作る。 */
export const HatakeFormPage = defineComponent({
  name: "HatakeFormPage",
  props: {
    definition: { type: Object as PropType<FormPageDefinition>, required: true },
    recordKey: { type: null as unknown as PropType<unknown>, default: undefined },
  },
  emits: {
    saved: (_record: DataRecord) => true,
  },
  setup(props, { emit }) {
    const registries = useRegistries();
    const controller = new FormController({
      definition: props.definition,
      repository: registries.repositories.resolve(props.definition.repository),
      recordKey: props.recordKey,
    });
    const { version } = useController(controller);
    const draft = shallowRef<DataRecord>({});
    onMounted(async () => {
      await controller.init();
      draft.value = { ...controller.draft };
    });

    return () => {
      touch(version);
      return h("div", { class: "hatake-page", "data-hatake": `page:${props.definition.id}` }, [
        h("h1", { class: "hatake-title" }, props.definition.title),
        ...errorOf(controller.error),
        h(
          "form",
          {
            class: "hatake-form",
            "data-hatake": "form",
            onSubmit: async (event: Event) => {
              event.preventDefault();
              const saved = await controller.submit(draft.value);
              if (saved !== null) emit("saved", saved);
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
          ],
        ),
      ]);
    };
  },
});

/**
 * 詳細画面（`kind: detail`）— 読むだけ。
 *
 * 字にする所は一覧と**同じ `cellText`** を通す（0.9.4 で1か所にまとめた）。
 * ここを別に書くと、一覧では「出荷済」なのに詳細では `shipped` と出る、が起きる
 * （実際に 0.9.12 の見本で踏んだ）。
 */
export const HatakeDetailPage = defineComponent({
  name: "HatakeDetailPage",
  props: {
    definition: { type: Object as PropType<DetailPageDefinition>, required: true },
    recordKey: { type: null as unknown as PropType<unknown>, default: undefined },
    formatters: { type: Object as PropType<FormatterRegistry>, default: () => new FormatterRegistry() },
  },
  setup(props) {
    const registries = useRegistries();
    const controller = new DetailController({
      repository: registries.repositories.resolve(props.definition.repository),
      recordKey: props.recordKey,
    });
    const { version } = useController(controller);
    onMounted(() => void controller.init());

    return () => {
      touch(version);
      const record = controller.record;
      const fields = formFields(props.definition.form);
      return h("div", { class: "hatake-page", "data-hatake": `page:${props.definition.id}` }, [
        h("h1", { class: "hatake-title" }, props.definition.title),
        ...errorOf(controller.error),
        record === null
          ? h("p", { class: "hatake-table-empty" }, controller.loading ? "読み込み中…" : "該当するデータがありません")
          : h(
              "dl",
              { class: "hatake-detail" },
              fields.flatMap((one) => [
                h("dt", { class: "hatake-field-label" }, one.label),
                h(
                  "dd",
                  { "data-hatake": `value:${one.field}` },
                  cellText(props.formatters, fields, one, record[one.field]),
                ),
              ]),
            ),
      ]);
    };
  },
});

/**
 * ウィザード（`kind: wizard`）。**1枚ずつ検証して、最後に1回だけ保存する。**
 *
 * 1枚も出せないとき（条件で全部隠れた）に黙って1枚目を出さないのが要点。
 * それをやると「条件が効いていない」ように見えて、原因に辿り着けない。
 */
export const HatakeWizardPage = defineComponent({
  name: "HatakeWizardPage",
  props: {
    definition: { type: Object as PropType<WizardPageDefinition>, required: true },
    recordKey: { type: null as unknown as PropType<unknown>, default: undefined },
  },
  emits: {
    saved: (_record: DataRecord) => true,
  },
  setup(props, { emit }) {
    const registries = useRegistries();
    const controller = new WizardController({
      definition: props.definition,
      repository: registries.repositories.resolve(props.definition.repository),
      recordKey: props.recordKey,
    });
    const { version } = useController(controller);
    const draft = shallowRef<DataRecord>({});
    onMounted(async () => {
      await controller.init();
      draft.value = { ...controller.draft };
    });

    return () => {
      touch(version);

      if (!controller.hasStep) {
        return h("div", { class: "hatake-page", "data-hatake": `page:${props.definition.id}` }, [
          h("h1", { class: "hatake-title" }, props.definition.title),
          h(
            "p",
            { class: "hatake-field-message", role: "alert", "data-hatake": "wizard:no-step" },
            "出せるステップが1枚もありません（ステップの出し分けの条件を見直してください）。",
          ),
        ]);
      }

      const step = controller.step;
      return h("div", { class: "hatake-page", "data-hatake": `page:${props.definition.id}` }, [
        h("h1", { class: "hatake-title" }, props.definition.title),
        h(
          "ol",
          { class: "hatake-steps", "data-hatake": "wizard:steps" },
          controller.steps.map((one, at) =>
            h("li", { class: at === controller.stepIndex ? "hatake-step-current" : null }, one.title),
          ),
        ),
        ...errorOf(controller.error),
        h(
          "form",
          {
            class: "hatake-form",
            "data-hatake": "form",
            onSubmit: async (event: Event) => {
              event.preventDefault();
              if (controller.isLastStep) {
                const saved = await controller.submit(draft.value);
                if (saved !== null) emit("saved", saved);
              } else {
                controller.next(draft.value);
                draft.value = { ...controller.draft };
              }
            },
          },
          [
            ...(step.description === undefined ? [] : [h("p", { class: "hatake-step-note" }, step.description)]),
            ...step.fields.map((field) =>
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
                  class: "hatake-button",
                  type: "button",
                  "data-hatake": "wizard:back",
                  disabled: controller.isFirstStep,
                  // **戻るときは検証しない**（書きかけのステップから戻れないと詰む）。
                  onClick: () => {
                    controller.back(draft.value);
                    draft.value = { ...controller.draft };
                  },
                },
                "戻る",
              ),
              h(
                "button",
                {
                  class: "hatake-button hatake-button-primary",
                  type: "submit",
                  "data-hatake": controller.isLastStep ? "wizard:submit" : "wizard:next",
                  disabled: controller.submitting,
                },
                controller.isLastStep ? "保存" : "次へ",
              ),
            ]),
          ],
        ),
      ]);
    };
  },
});
