import { FormValidator, type ValidationResult } from "@hatake-fw/api";
import {
  ConditionModes,
  formFields,
  normalizeRecord,
  visibleWizardSteps,
  type WizardPageDefinition,
  type WizardStepDefinition,
  wizardForm,
  wizardStepForm,
} from "@hatake-fw/api/internal";

import { Notifier } from "./notifier.js";
import type { DataRecord, Repository } from "./repository.js";

/**
 * ウィザード（`kind: wizard`）の土台。ステップを歩きながら**1枚ずつ**検証して、
 * 最後に1回だけ保存する。
 *
 * [[submit]] まで何も書かない。途中の入力は [[draft]] に溜まる。鍵を渡せばその1件を
 * 直し、渡さなければ作る。
 */
export class WizardController extends Notifier {
  readonly definition: WizardPageDefinition;
  readonly repository: Repository;
  readonly recordKey: unknown;

  private readonly _validator: FormValidator;

  private _stepIndex = 0;
  private _loading = false;
  private _error: unknown = null;
  private _draft: DataRecord = {};
  private _validation: ValidationResult = { valid: true, errors: [] };
  private _submitting = false;
  private _savedRecord: DataRecord | null = null;

  constructor(options: {
    definition: WizardPageDefinition;
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

  get isEdit(): boolean {
    return this.recordKey !== undefined && this.recordKey !== null;
  }

  /** `{ mode: create }` / `{ mode: edit }` の判定。**出どころはここ1つ。** */
  get formMode(): string {
    return this.isEdit ? ConditionModes.edit : ConditionModes.create;
  }

  /** いま何歩目か（**見えているステップの中での**位置）。 */
  get stepIndex(): number {
    return this._stepIndex;
  }

  /**
   * いま歩くステップ（`steps[].visibleWhen` で隠れているものは入らない）。
   *
   * 見えるかどうかを決める所は1つ（`visibleWizardSteps`）。**ここまでに入れた値で
   * 決まる**ので、条件は前のステップで入れた値を見ることになる。
   */
  get steps(): WizardStepDefinition[] {
    return visibleWizardSteps(this.definition, this._draft, this.formMode);
  }

  /**
   * 出せるステップが1枚でも在るか。
   *
   * 条件で**全部隠れる**ことはありうる（書けてしまう）。そのとき黙って1枚目を出すと
   * 「条件が効いていない」ように見えるので、呼ぶ側が気づける形にしておく。
   */
  get hasStep(): boolean {
    return this.steps.length > 0;
  }

  /** いま出しているステップ（[[hasStep]] が true のときだけ）。 */
  get step(): WizardStepDefinition {
    const shown = this.steps;
    const at = Math.min(Math.max(this._stepIndex, 0), shown.length - 1);
    return shown[at];
  }

  get isFirstStep(): boolean {
    return this._stepIndex === 0;
  }
  get isLastStep(): boolean {
    return this._stepIndex >= this.steps.length - 1;
  }

  get loading(): boolean {
    return this._loading;
  }
  get error(): unknown {
    return this._error;
  }
  /** ここまでに入れたもの（歩いたステップをまたいで溜まる）。 */
  get draft(): DataRecord {
    return this._draft;
  }
  get validation(): ValidationResult {
    return this._validation;
  }
  get submitting(): boolean {
    return this._submitting;
  }
  get savedRecord(): DataRecord | null {
    return this._savedRecord;
  }

  /** 直すなら読む、作るなら既定値を置く。作ったあとに1回呼ぶ。 */
  async init(): Promise<void> {
    if (!this.isEdit) {
      const seeded: DataRecord = {};
      for (const field of formFields(wizardForm(this.definition))) {
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
   * **いまのステップだけ**検証して、通れば進む。`values` はどちらにせよ [[draft]] に
   * 混ぜるので、行ったり来たりしても入れたものが消えない。
   *
   * 進んだら true。
   */
  next(values: DataRecord): boolean {
    this._draft = { ...this._draft, ...values };
    const result = this._validator.validate(
      wizardStepForm(this.step),
      this._draft,
      this.formMode,
    );
    if (!result.valid) {
      this._validation = result;
      this.notify();
      return false;
    }
    this._validation = { valid: true, errors: [] };
    // 値を入れたことで見える／隠れるステップが変わるので、**進む先は入れたあとの
    // 並びで決める**（隠れたステップは飛ばす）。
    if (!this.isLastStep) this._stepIndex += 1;
    this.notify();
    return true;
  }

  /**
   * 1歩戻る（`values` は保つ）。**検証しない** — 書きかけのステップからは
   * 戻れないといけない。
   */
  back(values: DataRecord): void {
    this._draft = { ...this._draft, ...values };
    this._validation = { valid: true, errors: [] };
    if (!this.isFirstStep) this._stepIndex -= 1;
    this.notify();
  }

  /** いまのステップ → 全体 の順に検証して、通れば保存する。 */
  async submit(values: DataRecord): Promise<DataRecord | null> {
    this._draft = { ...this._draft, ...values };

    const stepResult = this._validator.validate(
      wizardStepForm(this.step),
      this._draft,
      this.formMode,
    );
    if (!stepResult.valid) {
      this._validation = stepResult;
      this.notify();
      return null;
    }

    const whole = wizardForm(this.definition);
    const normalized = normalizeRecord(whole, this._draft);
    const wholeResult = this._validator.validate(whole, normalized, this.formMode);
    if (!wholeResult.valid) {
      this._draft = normalized;
      this._validation = wholeResult;
      this._jumpToFirstErroredStep(wholeResult);
      this.notify();
      return null;
    }

    this._draft = normalized;
    this._submitting = true;
    this._validation = { valid: true, errors: [] };
    this.notify();
    try {
      this._savedRecord = this.isEdit
        ? await this.repository.update(this.recordKey, normalized)
        : await this.repository.create(normalized);
      return this._savedRecord;
    } catch (error) {
      this._error = error;
      return null;
    } finally {
      this._submitting = false;
      this.notify();
    }
  }

  /**
   * 保存で落ちた項目が前のステップに在るなら、そこまで戻る。
   *
   * 探すのは**見えているステップの並び**。定義の並びで探すと、隠れたステップの分だけ
   * 番号がずれて**別のステップに飛ぶ**。番号の空間を2つ混ぜない。
   */
  private _jumpToFirstErroredStep(result: ValidationResult): void {
    const shown = this.steps;
    for (const error of result.errors) {
      const at = shown.findIndex((step) =>
        step.fields.some((field) => field.field === error.field),
      );
      if (at >= 0 && at < this._stepIndex) {
        this._stepIndex = at;
        return;
      }
    }
  }
}
