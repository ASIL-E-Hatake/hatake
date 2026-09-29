import type { FieldDefinition, ValidationError } from "@hatake-fw/api";
import { evaluateCondition, FieldTypes, visibleOptions } from "@hatake-fw/api/internal";
import type { DataRecord } from "@hatake-fw/runtime";
import type { ReactNode } from "react";

/**
 * 項目1つ。**何を出すか・いつ読み取り専用か・必須かは、全部定義が決める。**
 *
 * 条件の判定は `evaluateCondition`（`@hatake-fw/api`）に任せる＝**サーバ側の検証と
 * まったく同じ関数**を通るので、画面とサーバで食い違わない。Vue 版と同じクラス名・
 * 同じ `data-hatake` の印を出すので、案件の CSS も画面の試験もそのまま使える。
 */
export function HatakeField(props: {
  field: FieldDefinition;
  record: DataRecord;
  errors?: readonly ValidationError[];
  /** `{ mode: create }` の判定に渡す値（controller の `formMode`）。 */
  mode?: string;
  disabled?: boolean;
  onChange: (field: string, value: unknown) => void;
}): ReactNode {
  const one = props.field;

  // **隠れている項目は描かない。** 検証も「この画面に無いもの」として扱うので、
  // ここで出すと「見えないのに必須」が起きる。
  if (!evaluateCondition(one.visibleWhen, props.record, props.mode)) return null;

  const errors = props.errors ?? [];
  // **条件が書かれているときだけ見る。** `evaluateCondition` は「条件が無ければ
  // 満たしている」と答える（表示の条件ではそれが正しい）ので、そのまま渡すと
  // **何も書いていない欄が全部「読むだけ・必須」になる**。実際そうなっていて、
  // 画面は普通に出るのに**どこにも入力できない**（見た目で気づけない）。
  // Dart 側（`form_fields.dart`）は最初からこう書いてある。
  const required =
    one.required ||
    (one.requiredWhen !== undefined &&
      evaluateCondition(one.requiredWhen, props.record, props.mode));
  const readOnly =
    one.readOnly ||
    (one.readOnlyWhen !== undefined &&
      evaluateCondition(one.readOnlyWhen, props.record, props.mode));
  const enabled =
    one.enabledWhen === undefined ||
    evaluateCondition(one.enabledWhen, props.record, props.mode) === true;

  const mine = errors.filter((error) => error.field === one.field);
  const value = props.record[one.field];
  const text = value === undefined || value === null ? "" : String(value);
  const send = (next: unknown): void => props.onChange(one.field, next);

  const shared: Shared = {
    id: `hatake-${one.field}`,
    // **要素の見つけ方は契約**（Renderer の中を読み解かせない）。
    "data-hatake": `field:${one.field}`,
    disabled: props.disabled === true || !enabled,
    readOnly,
    "aria-required": required ? true : undefined,
    "aria-invalid": mine.length > 0 ? true : undefined,
  };

  return (
    <div
      className={[
        "hatake-field",
        required ? "hatake-field-required-box" : "",
        mine.length > 0 ? "hatake-field-error" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <label
        className={`hatake-field-label${required ? " hatake-field-required" : ""}`}
        htmlFor={shared.id}
      >
        {one.label}
      </label>
      {control(one, value, text, shared, send, props.record)}
      {mine.map((error) => (
        <span key={error.message} className="hatake-field-message" data-hatake={`error:${one.field}`}>
          {error.message}
        </span>
      ))}
    </div>
  );
}

/** 入力要素に共通で載せるもの（**見つけ方の印**を含む）。 */
interface Shared {
  id: string;
  "data-hatake": string;
  disabled: boolean;
  readOnly: boolean;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
}

/** `type` ごとの入力要素。**知らない `type` は文字として出す**（黙って消さない）。 */
function control(
  one: FieldDefinition,
  value: unknown,
  text: string,
  shared: Shared,
  send: (next: unknown) => void,
  record: DataRecord,
): ReactNode {
  switch (one.type) {
    case FieldTypes.textarea:
      return <textarea {...shared} value={text} onChange={(e) => send(e.target.value)} />;

    case FieldTypes.number:
      return (
        <input
          {...shared}
          type="number"
          value={text}
          onChange={(e) =>
            // **空は空のまま渡す。** 0 に丸めると「入れていない」と「0 と入れた」が
            // 区別できなくなる（必須の判定が変わる）。
            send(e.target.value === "" ? null : Number(e.target.value))
          }
        />
      );

    case FieldTypes.checkbox:
      return (
        <input {...shared} type="checkbox" checked={value === true} onChange={(e) => send(e.target.checked)} />
      );

    case FieldTypes.select:
    case FieldTypes.radio: {
      // **選択肢は親の値で絞る**（`optionsFrom` の連動）。絞り方は定義側の1か所。
      const options = visibleOptions(one, record);
      if (one.type === FieldTypes.radio) {
        return (
          <div className="hatake-radio-group" data-hatake={`field:${one.field}`}>
            {options.map((option) => (
              <label key={String(option.value)} className="hatake-radio">
                <input
                  type="radio"
                  name={one.field}
                  value={String(option.value)}
                  checked={option.value === value}
                  disabled={shared.disabled}
                  onChange={() => send(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        );
      }
      return (
        <select
          {...shared}
          value={text}
          onChange={(e) =>
            send(options.find((option) => String(option.value) === e.target.value)?.value ?? null)
          }
        >
          <option value="">—</option>
          {options.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    case FieldTypes.date:
    case FieldTypes.dateTime:
    case FieldTypes.time:
      return (
        <input
          {...shared}
          type={one.type === FieldTypes.date ? "date" : one.type === FieldTypes.time ? "time" : "datetime-local"}
          value={text}
          onChange={(e) => send(e.target.value || null)}
        />
      );

    default:
      return <input {...shared} type="text" value={text} onChange={(e) => send(e.target.value)} />;
  }
}
