import { FormatterRegistry } from "@hatake-fw/api";
import { cellText, FieldTypes, formFields } from "@hatake-fw/api/internal";
import type { DetailPageDefinition, FormPageDefinition, WizardPageDefinition } from "@hatake-fw/api/internal";
import {
  type ActionSurroundings,
  type DataRecord,
  DetailController,
  FormController,
  WizardController,
  withComputed,
} from "@hatake-fw/runtime";
import { defineComponent, h, onMounted, shallowRef, type PropType } from "vue";

import { useActions } from "../parts/actions.js";
import { HatakeField } from "../parts/field.js";
import { HatakeSubTable } from "../parts/subTable.js";
import { touch, useController, useRegistries } from "../scope.js";
import { errorOf } from "./list.js";

/** 入力だけの画面（`kind: form`）。鍵が在れば直す、無ければ作る。 */
export const HatakeFormPage = defineComponent({
  name: "HatakeFormPage",
  props: {
    definition: { type: Object as PropType<FormPageDefinition>, required: true },
    recordKey: { type: null as unknown as PropType<unknown>, default: undefined as unknown },
    roles: { type: Array as PropType<readonly string[]>, default: () => [] },
    formatters: { type: Object as PropType<FormatterRegistry>, default: () => new FormatterRegistry() },
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
    const bar = useActions({ roles: props.roles, formatters: props.formatters });
    const draft = shallowRef<DataRecord>({});
    onMounted(async () => {
      await controller.init();
      draft.value = { ...controller.draft };
    });

    // **いま入力されている値**で判定する（保存前の値で出し分ける）。
    const around = (): ActionSurroundings => ({
      controller,
      record: draft.value,
      mode: controller.formMode,
      fallbackName: props.definition.title,
    });

    return () => {
      touch(version);
      return h("div", { class: "hatake-page", "data-hatake": `page:${props.definition.id}` }, [
        h("h1", { class: "hatake-title" }, props.definition.title),
        bar.page(props.definition.actions, around, {
          record: draft.value,
          mode: controller.formMode,
        }),
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
            // **計算した項目は写しに埋める。** 下書きそのものに混ぜると、保存の
            // ときに計算結果まで書き戻すことになる。
            ...formFields(props.definition.form).map((field) =>
              field.type === FieldTypes.subTable
                ? h(HatakeSubTable, {
                    field,
                    record: draft.value,
                    roles: props.roles,
                    formatters: props.formatters,
                    editable: true,
                    onChange: (name: string, rows: readonly DataRecord[]) => {
                      draft.value = { ...draft.value, [name]: [...rows] };
                    },
                  })
                : h(HatakeField, {
                    field,
                    record: withComputed(formFields(props.definition.form), draft.value),
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
        bar.overlay(),
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
    recordKey: { type: null as unknown as PropType<unknown>, default: undefined as unknown },
    roles: { type: Array as PropType<readonly string[]>, default: () => [] },
    formatters: { type: Object as PropType<FormatterRegistry>, default: () => new FormatterRegistry() },
  },
  setup(props) {
    const registries = useRegistries();
    const controller = new DetailController({
      repository: registries.repositories.resolve(props.definition.repository),
      recordKey: props.recordKey,
    });
    const { version } = useController(controller);
    const bar = useActions({ roles: props.roles, formatters: props.formatters });
    onMounted(() => void controller.init());

    return () => {
      touch(version);
      const fields = formFields(props.definition.form);
      // **計算した項目をここで埋める。** 埋めないと「合計」「上位3件」が空のまま
      // 出て、定義に書いてあるのに効いていないように見える。
      const record =
        controller.record === null ? null : withComputed(fields, controller.record);
      return h("div", { class: "hatake-page", "data-hatake": `page:${props.definition.id}` }, [
        h("h1", { class: "hatake-title" }, props.definition.title),
        // 読むだけの画面のボタンは、**いま開いているレコード**で判定する。
        bar.page(
          props.definition.actions,
          () => ({ controller, record: record ?? undefined, fallbackName: props.definition.title }),
          { record: record ?? undefined },
        ),
        ...errorOf(controller.error),
        record === null
          ? h("p", { class: "hatake-table-empty" }, controller.loading ? "読み込み中…" : "該当するデータがありません")
          : h(
              "dl",
              { class: "hatake-detail" },
              fields.flatMap((one) =>
                // 明細は**表で出す**（`、` で繋いだ1行にすると、列も整形も消える）。
                one.type === FieldTypes.subTable
                  ? [
                      // **見出しは表の側が出す**（`dt` にも出すと同じ字が2回並ぶ）。
                      h("dd", { class: "hatake-detail-wide", "data-hatake": `value:${one.field}` }, [
                        h(HatakeSubTable, {
                          field: one,
                          record,
                          roles: props.roles,
                          formatters: props.formatters,
                        }),
                      ]),
                    ]
                  : [
                      h("dt", { class: "hatake-field-label" }, one.label),
                      h(
                        "dd",
                        { "data-hatake": `value:${one.field}` },
                        cellText(props.formatters, fields, one, record[one.field]),
                      ),
                    ],
              ),
            ),
        bar.overlay(),
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
    recordKey: { type: null as unknown as PropType<unknown>, default: undefined as unknown },
    roles: { type: Array as PropType<readonly string[]>, default: () => [] },
    formatters: { type: Object as PropType<FormatterRegistry>, default: () => new FormatterRegistry() },
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
    const bar = useActions({ roles: props.roles, formatters: props.formatters });
    const draft = shallowRef<DataRecord>({});
    onMounted(async () => {
      await controller.init();
      draft.value = { ...controller.draft };
    });

    const around = (): ActionSurroundings => ({
      controller,
      record: draft.value,
      mode: controller.formMode,
      fallbackName: props.definition.title,
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
        // ウィザードにも画面のボタンが書ける（`wizardPage.actions`）。ステップの
        // 「戻る／次へ」とは別もので、**いま入力されている値**で判定する。
        bar.page(props.definition.actions, around, {
          record: draft.value,
          mode: controller.formMode,
        }),
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
                record: withComputed(step.fields, draft.value),
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
        bar.overlay(),
      ]);
    };
  },
});
