import { FormValidator, type ValidationResult } from "@hatake-fw/api";
import {
  ConditionModes,
  type CrudPageDefinition,
  filterDefaults,
  formFields,
  type MasterPageDefinition,
  normalizeRecord,
  recordKeyOf,
} from "@hatake-fw/api/internal";

import { ListController } from "./listController.js";
import type { DataRecord, Repository } from "./repository.js";

/**
 * 一覧と入力を1枚で持つ画面。Dart 側の `CrudLike` に当たる（TypeScript には
 * まとめた型が無かったので、ここで名乗る）。
 */
export type CrudLike = CrudPageDefinition | MasterPageDefinition;

/** いま CRUD 画面が見せている面。 */
export const CrudMode = {
  list: "list",
  create: "create",
  edit: "edit",
} as const;
export type CrudMode = (typeof CrudMode)[keyof typeof CrudMode];

/**
 * 一覧と入力を1枚で持つ画面（`crud` / `master`）の土台。
 *
 * [[ListController]] に入力の流れを足したもの。**Renderer は状態を読んでここの
 * メソッドを呼ぶだけ**で、業務の判断も Repository も持たない。
 */
export class CrudController extends ListController {
  readonly definition: CrudLike;

  private readonly _validator: FormValidator;

  private _mode: CrudMode = CrudMode.list;
  private _editingKey: unknown = undefined;
  private _draft: DataRecord = {};
  private _validation: ValidationResult = { valid: true, errors: [] };
  private _submitting = false;

  constructor(options: {
    definition: CrudLike;
    repository: Repository;
    validator?: FormValidator;
    /** その日（試験で日を決めるため。省略すると今日）。検索欄の既定値を解くのに使う。 */
    today?: Date;
  }) {
    super({
      repository: options.repository,
      pageSize: options.definition.table.pagination.pageSize,
      keyFields: options.definition.keyFields,
      // 最初の一覧は検索欄の既定値（`filter.defaultValue`）で読む。
      filters: filterDefaults(options.definition.search, options.today ?? new Date()),
    });
    this.definition = options.definition;
    this._validator = options.validator ?? new FormValidator();
  }

  get mode(): CrudMode {
    return this._mode;
  }

  /**
   * `{ mode: create }` / `{ mode: edit }` の判定に渡す値。
   *
   * Renderer と検証で同じものを使うため、**出どころはここ1つ**（ズレると
   * 「見えているのに検証されない項目」ができる）。
   */
  get formMode(): string {
    return this._mode === CrudMode.edit ? ConditionModes.edit : ConditionModes.create;
  }

  /** いま作っている／直している1件。作るなら既定値、直すなら選んだ行の写し。 */
  get draft(): DataRecord {
    return this._draft;
  }
  get validation(): ValidationResult {
    return this._validation;
  }
  get submitting(): boolean {
    return this._submitting;
  }

  /** 新しく作りはじめる（既定値を置く）。 */
  startCreate(): void {
    this._mode = CrudMode.create;
    this._editingKey = undefined;
    this._validation = { valid: true, errors: [] };
    const seeded: DataRecord = {};
    for (const field of formFields(this.definition.form)) {
      if (field.defaultValue !== undefined && field.defaultValue !== null) {
        seeded[field.field] = field.defaultValue;
      }
    }
    this._draft = seeded;
    this.notify();
  }

  /** 1件を直しはじめる。**写しを持つ**ので、やめれば元に戻る。 */
  startEdit(record: DataRecord): void {
    this._mode = CrudMode.edit;
    this._editingKey = recordKeyOf(this.definition.keyFields, record);
    this._validation = { valid: true, errors: [] };
    this._draft = { ...record };
    this.notify();
  }

  /** 書きかけを捨てて一覧に戻る。 */
  cancelForm(): void {
    this._mode = CrudMode.list;
    this._validation = { valid: true, errors: [] };
    this.notify();
  }

  /**
   * 検証して送る。**弾かれたら入力の面に留まる**。通れば保存して読み直し、
   * 一覧に戻る。
   */
  async submitForm(values: DataRecord): Promise<void> {
    // 送る前に整える（全角→半角・前後の空白）。項目ごとの `normalize` が決める。
    const normalized = normalizeRecord(this.definition.form, values);
    const result = this._validator.validate(this.definition.form, normalized, this.formMode);
    if (!result.valid) {
      this._validation = result;
      this.notify();
      return;
    }

    this._submitting = true;
    this._validation = { valid: true, errors: [] };
    this.notify();
    try {
      if (this._mode === CrudMode.edit && this._editingKey !== undefined) {
        await this.repository.update(this._editingKey, normalized);
      } else {
        await this.repository.create(normalized);
      }
      this._mode = CrudMode.list;
      await this.load();
    } catch (error) {
      this.setError(error);
    } finally {
      this._submitting = false;
      this.notify();
    }
  }
}
