import type { FieldDefinition, ValidationError } from "@hatake-fw/api";
import {
  evaluateCondition,
  FieldTypes,
  visibleOptions,
} from "@hatake-fw/api/internal";
import type { DataRecord } from "@hatake-fw/runtime";
import { defineComponent, h, type PropType, type VNode } from "vue";

/**
 * 項目1つ。**何を出すか・いつ読み取り専用か・必須かは、全部定義が決める。**
 *
 * ここが持っているのは「`type` に対してどの入力要素を出すか」だけ。条件の判定は
 * `evaluateCondition`（`@hatake-fw/api`）に任せていて、**サーバ側の検証とまったく
 * 同じ関数**を通る＝画面とサーバで食い違わない。
 *
 * クラス名は[契約](../../../runtime/hatake.css)。案件の CSS はこれを狙う。
 */
export const HatakeField = defineComponent({
  name: "HatakeField",
  props: {
    field: { type: Object as PropType<FieldDefinition>, required: true },
    record: { type: Object as PropType<DataRecord>, required: true },
    errors: { type: Array as PropType<readonly ValidationError[]>, default: () => [] },
    /** `{ mode: create }` の判定に渡す値（controller の `formMode`）。 */
    mode: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
  },
  emits: {
    change: (_field: string, _value: unknown) => true,
  },
  setup(props, { emit }) {
    return () => {
      const one = props.field;

      // **隠れている項目は描かない。** 検証も「この画面に無いもの」として扱うので、
      // ここで出すと「見えているのに検証されない」の逆（見えないのに必須）が起きる。
      if (!evaluateCondition(one.visibleWhen, props.record, props.mode)) return null;

      const required =
        one.required || evaluateCondition(one.requiredWhen, props.record, props.mode) === true;
      const readOnly =
        one.readOnly || evaluateCondition(one.readOnlyWhen, props.record, props.mode) === true;
      const enabled =
        one.enabledWhen === undefined ||
        evaluateCondition(one.enabledWhen, props.record, props.mode) === true;

      const mine = props.errors.filter((error) => error.field === one.field);
      const value = props.record[one.field];

      const shared = {
        id: `hatake-${one.field}`,
        // **要素の見つけ方は契約**（Renderer の中を読み解かせない）。
        "data-hatake": `field:${one.field}`,
        disabled: props.disabled || !enabled,
        readonly: readOnly,
        "aria-required": required ? "true" : undefined,
        "aria-invalid": mine.length > 0 ? "true" : undefined,
      };

      const send = (next: unknown): void => emit("change", one.field, next);

      return h(
        "div",
        {
          class: [
            "hatake-field",
            required ? "hatake-field-required-box" : null,
            mine.length > 0 ? "hatake-field-error" : null,
          ],
        },
        [
          h(
            "label",
            {
              class: ["hatake-field-label", required ? "hatake-field-required" : null],
              for: shared.id,
            },
            one.label,
          ),
          input(one, value, shared, send, props.record),
          ...mine.map((error) =>
            h("span", { class: "hatake-field-message", "data-hatake": `error:${one.field}` }, error.message),
          ),
        ],
      );
    };
  },
});

/** `type` ごとの入力要素。**知らない `type` は文字として出す**（黙って消さない）。 */
function input(
  one: FieldDefinition,
  value: unknown,
  shared: Record<string, unknown>,
  send: (next: unknown) => void,
  record: DataRecord,
): VNode {
  const text = value === undefined || value === null ? "" : String(value);

  switch (one.type) {
    case FieldTypes.textarea:
      return h("textarea", {
        ...shared,
        value: text,
        onInput: (event: Event) => send((event.target as HTMLTextAreaElement).value),
      });

    case FieldTypes.number:
      return h("input", {
        ...shared,
        type: "number",
        value: text,
        onInput: (event: Event) => {
          const raw = (event.target as HTMLInputElement).value;
          // **空は空のまま渡す。** 0 に丸めると「入れていない」と「0 と入れた」が
          // 区別できなくなる（必須の判定が変わる）。
          send(raw === "" ? null : Number(raw));
        },
      });

    case FieldTypes.checkbox:
      return h("input", {
        ...shared,
        type: "checkbox",
        checked: value === true,
        onChange: (event: Event) => send((event.target as HTMLInputElement).checked),
      });

    case FieldTypes.select:
    case FieldTypes.radio: {
      // **選択肢は親の値で絞る**（`optionsFrom` の連動）。絞り方は定義側の1か所。
      const options = visibleOptions(one, record);
      if (one.type === FieldTypes.radio) {
        return h(
          "div",
          { class: "hatake-radio-group", "data-hatake": `field:${one.field}` },
          options.map((option) =>
            h("label", { class: "hatake-radio" }, [
              h("input", {
                type: "radio",
                name: one.field,
                value: String(option.value),
                checked: option.value === value,
                disabled: shared.disabled,
                onChange: () => send(option.value),
              }),
              option.label,
            ]),
          ),
        );
      }
      return h(
        "select",
        {
          ...shared,
          value: text,
          onChange: (event: Event) => {
            const picked = (event.target as HTMLSelectElement).value;
            send(options.find((option) => String(option.value) === picked)?.value ?? null);
          },
        },
        [
          h("option", { value: "" }, "—"),
          ...options.map((option) => h("option", { value: String(option.value) }, option.label)),
        ],
      );
    }

    case FieldTypes.date:
      return h("input", {
        ...shared,
        type: "date",
        value: text,
        onInput: (event: Event) => send((event.target as HTMLInputElement).value || null),
      });

    case FieldTypes.dateTime:
      return h("input", {
        ...shared,
        type: "datetime-local",
        value: text,
        onInput: (event: Event) => send((event.target as HTMLInputElement).value || null),
      });

    case FieldTypes.time:
      return h("input", {
        ...shared,
        type: "time",
        value: text,
        onInput: (event: Event) => send((event.target as HTMLInputElement).value || null),
      });

    default:
      return h("input", {
        ...shared,
        type: "text",
        value: text,
        onInput: (event: Event) => send((event.target as HTMLInputElement).value),
      });
  }
}
