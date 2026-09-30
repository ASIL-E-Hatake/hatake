import { CHROME_ICONS } from "@hatake-fw/runtime";
import { h, type VNode } from "vue";

/**
 * 枠組み自身のボタンに付ける絵（検索・読み直し・閉じる…）。
 *
 * 形は土台（`CHROME_ICONS`）が持っていて、ここは `<svg>` に置くだけ。**色は字の色**
 * （`fill: currentColor`）なので、ボタンの色を変えれば絵も付いてくる。
 */
export function icon(name: keyof typeof CHROME_ICONS): VNode {
  return h("svg", { class: "hatake-icon", viewBox: "0 0 24 24", "aria-hidden": "true" }, [
    h("path", { d: CHROME_ICONS[name] }),
  ]);
}
