import { CHROME_ICONS } from "@hatake-fw/runtime";
import type { ReactNode } from "react";

/**
 * 枠組み自身のボタンに付ける絵（検索・読み直し・閉じる…）。
 *
 * 形は土台（`CHROME_ICONS`）が持っていて、ここは `<svg>` に置くだけ。**色は字の色**
 * （`fill: currentColor`）なので、ボタンの色を変えれば絵も付いてくる。Vue 版と同じ。
 */
export function Icon({ name }: { name: keyof typeof CHROME_ICONS }): ReactNode {
  return <SvgPath d={CHROME_ICONS[name]} />;
}

/** path 1本の絵（メニューの絵もこれで描く）。 */
export function SvgPath({ d }: { d: string }): ReactNode {
  return (
    <svg className="hatake-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
