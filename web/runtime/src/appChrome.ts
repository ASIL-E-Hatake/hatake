import type { AppDefinition } from "@hatake-fw/api";
import type { ThemeDefinition } from "@hatake-fw/api/internal";
import { Brightnesses, Densities } from "@hatake-fw/api/internal";

/**
 * アプリの枠（タブの札・閉じるときに聞くか・見た目の決めごと）。
 *
 * どれも**定義から決まる**ので、Vue と React で別々に決めると食い違う。Flutter 版の
 * `app_tabs.dart` / `material_theme.dart` と同じ規則。
 */

/**
 * タブの札・パン屑に出す名前＝**その中でいま見ている画面の題**。
 * 一覧（`app.pages`）に無ければ id のまま（黙って空にしない）。
 */
export function pageTitle(app: AppDefinition, pageId: string): string {
  return app.pages.find((one) => one.id === pageId)?.title ?? pageId;
}

/**
 * そのタブを閉じる前に聞くか。
 *
 * タブの中で何を入力したかは、枠からは見えない（画面の中の話）。見えないなら
 * 「消えるかもしれない」側に倒す＝**入力できる画面（form / wizard / crud / master）
 * だけ聞く**。変わっていなくても聞くのは、取りこぼしを作らないため。
 */
export function closingAsks(app: AppDefinition, pageId: string): boolean {
  const kind = app.pages.find((one) => one.id === pageId)?.type;
  return kind === "form" || kind === "wizard" || kind === "crud" || kind === "master";
}

/** タブを開けなかったときの言い方（Flutter と同じ文）。 */
export const TOO_MANY_TABS = (max: number): string =>
  `タブが多すぎます（${max} 枚まで）。使い終わったタブを閉じてください。`;

/** `app.theme` を CSS に渡す形。 */
export interface ThemeStyle {
  /** 枠の要素に当てる CSS 変数（`--hatake-*`）。書いていないものは入らない。 */
  readonly variables: Readonly<Record<string, string>>;
  /** `light` / `dark` / `system`。枠の `data-hatake-brightness` に入れる。 */
  readonly brightness: string;
  /** `comfortable` / `standard` / `compact`。枠の `data-hatake-density` に入れる。 */
  readonly density: string;
}

/**
 * `app.theme` を **CSS 変数**にする。
 *
 * 案件の CSS が勝てるように、**枠の要素に当てる**（`:root` ではない）。案件は
 * `.hatake-app { --hatake-color-primary: … }` と書けば上書きできる —— 定義が言うのは
 * 「その業務システムの既定」で、最後に決めるのは案件の側。
 *
 * 明るさと詰め具合は**変数ではなく印**で渡す（`[data-hatake-density="compact"]`）。
 * 1つの値で何本もの寸法が変わるので、CSS の側で束ねたほうが上書きしやすい。
 */
export function themeStyle(theme: ThemeDefinition | undefined): ThemeStyle {
  const variables: Record<string, string> = {};
  if (theme?.primaryColor !== undefined) variables["--hatake-color-primary"] = cssColor(theme.primaryColor);
  if (theme?.secondaryColor !== undefined) {
    variables["--hatake-color-secondary"] = cssColor(theme.secondaryColor);
  }
  if (theme?.radius !== undefined) variables["--hatake-radius"] = `${theme.radius}px`;
  if (theme?.fontFamily !== undefined && theme.fontFamily.trim() !== "") {
    // 書いた字体を先に、無ければいつもの並び（入っていない端末で字が消えないように）。
    variables["--hatake-font"] = `"${theme.fontFamily}", var(--hatake-font-fallback)`;
  }
  return {
    variables,
    brightness: theme?.brightness ?? Brightnesses.light,
    density: theme?.density ?? Densities.standard,
  };
}

/**
 * `#AARRGGBB`（Flutter の書き方）を CSS の `#RRGGBBAA` にする。`#RRGGBB` はそのまま。
 * 定義は両方を許している（`ThemeDefinition.primaryColor`）。
 */
function cssColor(value: string): string {
  const hex = value.trim();
  if (/^#[0-9a-fA-F]{8}$/.test(hex)) return `#${hex.slice(3)}${hex.slice(1, 3)}`;
  return hex;
}
