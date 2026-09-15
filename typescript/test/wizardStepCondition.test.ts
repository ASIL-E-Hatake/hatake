import { describe, expect, it } from "vitest";
import {
  explainSource,
  FormValidator,
  isStepVisible,
  parsePageYaml,
  UnknownKeysError,
  visibleWizardSteps,
  wizardForm,
  wizardStepForm,
  type WizardPageDefinition,
} from "../src/index.js";

/**
 * ウィザードのステップ条件（`steps[].visibleWhen`）。
 *
 * 条件はどこにでも書けるのに**ステップだけ書けなかった**（語彙の穴）。埋めるときに
 * 守るのは「**送り側と検証側が同じ答えを持つ**」こと＝誰にも見えないステップの必須で
 * 保存できない画面を作らない。そのために、ステップは区画に開いて条件も一緒に渡す
 * （「隠れた区画は検証しない」を使い回す＝判定を2つ持たない）。
 */
const YAML = `dsl_version: "1.0"

page:
  type: wizard
  id: customer_wizard
  title: 顧客登録
  repository: customerRepository
  key: id
  steps:
    - id: basic
      title: 基本情報
      fields:
        - { field: kind, label: 区分, type: select, required: true,
            options: [{ value: corp, label: 法人 }, { value: person, label: 個人 }] }
    - id: billing
      title: 請求先
      visibleWhen: { field: kind, operator: equals, value: corp }
      fields:
        - { field: billTo, label: 請求先, required: true }
    - id: confirm
      title: 確認
      fields:
        - { field: memo, label: 備考 }
`;

const page = (): WizardPageDefinition =>
  parsePageYaml(YAML, { strict: true }) as WizardPageDefinition;

describe("ステップの出し分け", () => {
  it("読める（strict でも通る）", () => {
    const steps = page().steps;
    expect(steps[1].visibleWhen).toEqual({
      field: "kind",
      operator: "equals",
      value: "corp",
    });
    expect(steps[0].visibleWhen).toBeUndefined();
  });

  it("**歩くのは見えているステップだけ**（判定は1か所）", () => {
    const corp = visibleWizardSteps(page(), { kind: "corp" });
    expect(corp.map((one) => one.id)).toEqual(["basic", "billing", "confirm"]);
    const person = visibleWizardSteps(page(), { kind: "person" });
    expect(person.map((one) => one.id)).toEqual(["basic", "confirm"]);
    // 1件ずつでも同じ答え（送り側はこちらを使うこともある）。
    expect(isStepVisible(page().steps[1], { kind: "person" })).toBe(false);
  });

  it("**隠れたステップは検証しない**（そのステップだけを見るときも）", () => {
    const validator = new FormValidator();
    const billing = page().steps[1];
    // 個人なら、必須なのに鳴らない（誰にも見えていないので）。
    expect(
      validator.validate(wizardStepForm(billing), { kind: "person" }).errors,
    ).toEqual([]);
    // 法人なら鳴る。
    expect(
      validator
        .validate(wizardStepForm(billing), { kind: "corp" })
        .errors.map((one) => one.field),
    ).toEqual(["billTo"]);
  });

  it("**保存のときも飛ばす**（全部を1枚にした form でも同じ）", () => {
    const validator = new FormValidator();
    const whole = wizardForm(page());
    expect(
      validator.validate(whole, { kind: "person", memo: "" }).errors,
    ).toEqual([]);
    expect(
      validator
        .validate(whole, { kind: "corp" })
        .errors.map((one) => one.field),
    ).toEqual(["billTo"]);
  });

  it("条件はそのまま区画に載る（同じ規則を2つ書かない）", () => {
    const section = wizardForm(page()).sections[1];
    expect(section.visibleWhen).toEqual(page().steps[1].visibleWhen);
  });

  it("読み返しに出る（飛ばされるステップの理由が紙から消えない）", () => {
    const text = JSON.stringify(explainSource(YAML));
    expect(text).toContain("請求先");
    expect(text).toContain("区分");
    // 条件つきの題は、区画と同じ言い方で出る。
    expect(text).toMatch(/請求先[^"]*のときだけ/);
  });

  it("知らないキーは今までどおり弾く（穴を広げていない）", () => {
    const broken = YAML.replace("visibleWhen: {", "visibleIf: {");
    expect(() => parsePageYaml(broken, { strict: true })).toThrow(
      UnknownKeysError,
    );
  });
});
