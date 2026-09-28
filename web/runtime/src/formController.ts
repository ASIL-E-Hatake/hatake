import { FormValidator, type ValidationResult } from "@hatake-fw/api";
import {
  ConditionModes,
  formFields,
  type FormPageDefinition,
  normalizeRecord,
  recordKeyOf,
} from "@hatake-fw/api/internal";

import { Notifier } from "./notifier.js";
import type { DataRecord, Repository } from "./repository.js";

/**
 * 入力画面（`kind: form`）1枚ぶんの土台。
 *
 * 鍵を渡せば**その1件を読んで直す**、渡さなければ**新しく作る**。Dart 側の
 * `FormController` と同じ振る舞い。
 *
 * **検証も整形もここには書かない。** `FormValidator` / `normalizeRecord` を呼ぶだけで、
 * 規則は `@hatake-fw/api` の1か所に在る＝画面・サーバ・3版で同じ答えになる。
 */
export class FormController extends Notifier {
  readonly definition: FormPageDefinition;
  readonly repository: Repository;
  readonly recordKey: unknown;

  private readonly _validator: FormValidator;

  private _loading = false;
  private _error: unknown = null;
  private _draft: DataRecord = {};
  private _validation: ValidationResult = { valid: true, errors: [] };
  private _submitting = false;
  private _savedRecord: DataRecord | null = null;

  constructor(options: {
    definition: FormPageDefinition;
    repository: Repository;
    recordKey?: unknown;
    validator?: FormValidator;
  }) {
    super();
    this.definition = options.definition;
    this.repository = options.repository;
    this.recordKey = options.recordKey;
    this._validator = options.validator ?? new FormValidator();
  }

  /** 既に在る1件を**開いた**のか。 */
  get isEdit(): boolean {
    return this.recordKey !== undefined && this.recordKey !== null;
  }

  /**
   * `{ mode: create }` / `{ mode: edit }` の判定に渡す値。
   *
   * Renderer と検証で同じものを使うため、**出どころはここ1つ**。
   */
  get formMode(): string {
    return this.isEdit ? ConditionModes.edit : ConditionModes.create;
  }

  /**
   * いまこの画面が相手にしている1件の鍵。開いたときの鍵か、**登録が通って
   * できた1件**の鍵。
   *
   * Repository に載っている明細（`subTable`）は親の鍵を外部キーとして要るので、
   * 親が保存できた瞬間から直せるようになる。**2回目の保存が2件目を作るのも
   * ここで止まる。**
   */
  get effectiveKey(): unknown {
    if (this.isEdit) return this.recordKey;
    if (this._savedRecord === null) return undefined;
    return recordKeyOf(this.definition.keyFields, this._savedRecord);
  }

  get loading(): boolean {
    return this._loading;
  }
  get error(): unknown {
    return this._error;
  }
  get draft(): DataRecord {
    return this._draft;
  }
  get validation(): ValidationResult {
    return this._validation;
  }
  get submitting(): boolean {
    return this._submitting;
  }
  /** 直近の登録・更新が通ってできた1件。 */
  get savedRecord(): DataRecord | null {
    return this._savedRecord;
  }

  /** 直すなら読む、作るなら既定値を置く。作ったあとに1回呼ぶ。 */
  async init(): Promise<void> {
    if (!this.isEdit) {
      const seeded: DataRecord = {};
      for (const field of formFields(this.definition.form)) {
        if (field.defaultValue !== undefined && field.defaultValue !== null) {
          seeded[field.field] = field.defaultValue;
        }
      }
      this._draft = seeded;
      this.notify();
      return;
    }
    this._loading = true;
    this._error = null;
    this.notify();
    try {
      this._draft = (await this.repository.findByKey(this.recordKey)) ?? {};
    } catch (error) {
      this._error = error;
      this._draft = {};
    } finally {
      this._loading = false;
      this.notify();
    }
  }

  /**
   * 検証して送る。**弾かれたらその場に留まる**（`validation` に出す）。
   * 通れば保存して `savedRecord` に出す。
   */
  async submit(values: DataRecord): Promise<DataRecord | null> {
    const normalized = normalizeRecord(this.definition.form, values);
    const result = this._validator.validate(this.definition.form, normalized, this.formMode);
    if (!result.valid) {
      this._validation = result;
      this.notify();
      return null;
    }
    this._submitting = true;
    this._validation = { valid: true, errors: [] };
    this.notify();
    try {
      // **できた1件の鍵**で分ける。登録のあとにもう一度押しても、2件目を作らずに
      // その1件を直す。
      const key = this.effectiveKey;
      this._savedRecord =
        key === undefined || key === null
          ? await this.repository.create(normalized)
          : await this.repository.update(key, normalized);
      return this._savedRecord;
    } catch (error) {
      this._error = error;
      return null;
    } finally {
      this._submitting = false;
      this.notify();
    }
  }
}
