// いま歩くステップはどれか（`steps[].visibleWhen`）。
//
// ウィザードは「次へ」で1歩ずつ進む。条件で丸ごと飛ばすステップが在るなら、
// **送り側（次へ／戻る／歩数の表示）も、検証も**そのステップを見なかったことにする
// 必要がある。片方だけだと、**誰にも見えないステップの必須で保存できない**画面が
// できる（しかも画面にはどこが悪いか出ない）。
//
// 検証の側は何も足していない＝ステップは区画（section）に開かれるので
// （[wizardStepForm] / [wizardForm]）、「隠れた区画は検証しない」が既にやっている。
// ここが決めるのは**送り側**の「どれを歩くか」だけ。
//
// 決めごと:
//   ・**判定は1か所**。Renderer も Controller もここに聞く（2つ持つと、見えない
//     ステップを検証する画面と、見えるのに飛ばす画面のどちらかが必ず生まれる）。
//   ・**空にはしない**。条件で全部隠れたときは、この関数は空を返す＝呼ぶ側が
//     「1枚も出せない」と分かる形にしておく（黙って1枚目を出すと、条件が効いて
//     いないように見える）。それが起きうる定義かどうかは、押す前に `validate` の
//     「永久に偽」が言う担当。

import { evaluateCondition } from "./conditionEvaluator.js";
import {
  type WizardPageDefinition,
  type WizardStepDefinition,
} from "./definition.js";

/**
 * いま見えているステップだけを、宣言順で返す。
 *
 * [record] はここまでに入力されたもの（ウィザードは1枚ずつ入れるので、条件が見るのは
 * **前のステップで入れた値**になる）。[mode] は `create` / `edit`（条件の `mode`）。
 */
export function visibleWizardSteps(
  page: WizardPageDefinition,
  record: Record<string, unknown>,
  mode?: string,
): WizardStepDefinition[] {
  return page.steps.filter((step) => isStepVisible(step, record, mode));
}

/** そのステップが見えるか（条件が無ければいつでも見える）。 */
export function isStepVisible(
  step: WizardStepDefinition,
  record: Record<string, unknown>,
  mode?: string,
): boolean {
  return (
    step.visibleWhen === undefined ||
    evaluateCondition(step.visibleWhen, record, mode)
  );
}
