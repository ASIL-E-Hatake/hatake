import { FormValidator, type FieldDefinition, type FormDefinition, type ValidationResult } from "@hatake-fw/api";
import { ConditionModes, recordKeyOf, type SubTableSource } from "@hatake-fw/api/internal";

import { Notifier } from "./notifier.js";
import type { DataRecord, Repository } from "./repository.js";

/**
 * Repository に載っている明細（`subTable` に `source` が在る形）の土台。
 * 親1件ぶんの子行をページで繰り、**1行ずつ**保存する。
 *
 * 子行は `source.parentKey` で親に結ばれるので、**まだ鍵の無い親には行を持てない**。
 * そのとき [[canEdit]] は false で、Renderer は「先に親を保存してください」と言う
 * ——黙って空の表を出すと、入れられない理由が画面から読み取れない。
 */
export class SubTableController extends Notifier {
  readonly field: FieldDefinition;
  readonly repository: Repository;
  /** 親の鍵。まだ保存していなければ undefined。 */
  readonly parentKey: unknown;

  private readonly _validator: FormValidator;
  private readonly _rowForm: FormDefinition;

  private _loading = false;
  private _error: unknown = null;
  private _rows: readonly DataRecord[] = [];
  private _totalCount = 0;
  private _page = 0;
  private _saving = false;

  constructor(options: {
    field: FieldDefinition;
    repository: Repository;
    parentKey: unknown;
    validator?: FormValidator;
  }) {
    super();
    if (options.field.source === undefined) {
      throw new Error(
        `SubTableController には \`source\` の在る項目が要ります（${options.field.field}）。`,
      );
    }
    this.field = options.field;
    this.repository = options.repository;
    this.parentKey = options.parentKey;
    this._validator = options.validator ?? new FormValidator();
    // **行の編集も普通のフォームとして扱う。** そうすれば行の `required` /
    // `validators` / `computed` が画面のフォームとまったく同じ振る舞いになる。
    this._rowForm = { sections: [{ columns: 1, fields: options.field.rowFields ?? [] }] };
  }

  get source(): SubTableSource {
    return this.field.source as SubTableSource;
  }

  /** そもそも並べて直せるか（**親が先に在ること**）。 */
  get canEdit(): boolean {
    return this.parentKey !== undefined && this.parentKey !== null;
  }

  get loading(): boolean {
    return this._loading;
  }
  get error(): unknown {
    return this._error;
  }
  get rows(): readonly DataRecord[] {
    return this._rows;
  }
  get totalCount(): number {
    return this._totalCount;
  }
  get page(): number {
    return this._page;
  }
  get pageSize(): number {
    return this.source.pageSize;
  }
  get pageCount(): number {
    return this._totalCount === 0 ? 1 : Math.ceil(this._totalCount / this.pageSize);
  }
  get saving(): boolean {
    return this._saving;
  }

  /** いまのページを読む。作ったあとに1回呼ぶ。 */
  async load(): Promise<void> {
    if (!this.canEdit) {
      this._rows = [];
      this._totalCount = 0;
      this.notify();
      return;
    }
    this._loading = true;
    this._error = null;
    this.notify();
    try {
      const result = await this.repository.search({
        filters: { [this.source.parentKey]: this.parentKey },
        page: this._page,
        pageSize: this.pageSize,
        sortAscending: true,
      });
      this._rows = result.items;
      this._totalCount = result.totalCount;
    } catch (error) {
      this._error = error;
      this._rows = [];
      this._totalCount = 0;
    } finally {
      this._loading = false;
      this.notify();
    }
  }

  async setPage(page: number): Promise<void> {
    if (page < 0 || page === this._page) return;
    this._page = page;
    await this.load();
  }

  /**
   * 行を検証して、通れば保存する（鍵が無ければ作る・在れば直す）。
   *
   * 検証の結果を返すので、弾かれたときに**行の編集を開いたままにできる**。
   */
  async saveRow(row: DataRecord): Promise<ValidationResult> {
    // 行の mode は**行の鍵**で決まる（親を編集中でも、足した行は新規）。
    const key = recordKeyOf(this.source.keyFields, row);
    const result = this._validator.validate(
      this._rowForm,
      row,
      key === undefined || key === null ? ConditionModes.create : ConditionModes.edit,
    );
    if (!result.valid) return result;

    this._saving = true;
    this._error = null;
    this.notify();
    let saved = false;
    try {
      const data = { ...row, [this.source.parentKey]: this.parentKey };
      if (key === undefined || key === null) {
        await this.repository.create(data);
      } else {
        await this.repository.update(key, data);
      }
      saved = true;
    } catch (error) {
      this._error = error;
    } finally {
      this._saving = false;
    }
    // **通ったときだけ読み直す。** 読み直すと、いま掴んだ失敗が消える。
    if (saved) {
      await this.load();
    } else {
      this.notify();
    }
    return result;
  }

  async deleteRow(row: DataRecord): Promise<void> {
    const key = recordKeyOf(this.source.keyFields, row);
    if (key === undefined || key === null) return;
    this._error = null;
    try {
      await this.repository.delete(key);
    } catch (error) {
      this._error = error;
      this.notify();
      return;
    }
    await this.load();
  }
}
