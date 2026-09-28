// @hatake-fw/react19 — hatake の定義を React 19 で描く。
//
// **業務の判断はここに1つも無い。** 何が必須か・いつ押せるか・2件目を作らないか、
// は全部 `@hatake-fw/runtime` が決めていて、ここは描くだけ。**Vue 版と同じクラス名・
// 同じ `data-hatake` の印**を出すので、案件の CSS も画面の試験もそのまま使える
// ＝ Renderer を差し替えても作り直しが要らない。
//
// 依存は React 本体だけ（`peerDependencies`）。見た目は
// `@hatake-fw/runtime/hatake.css` を読み込んで、CSS 変数で上書きする。
//
// ```tsx
// import { HatakePage, HatakeScope } from "@hatake-fw/react19";
// import "@hatake-fw/runtime/hatake.css";
//
// <HatakeScope registries={registries}><HatakePage definition={definition} /></HatakeScope>
// ```

export { HatakePage } from "./page.js";
export { HatakeScope, useController, useRegistries, type HatakeRegistries } from "./scope.js";

// 画面を自分で組み立てたいとき用（menu を自作する・1枚だけ埋め込む、など）。
export { HatakeCrudPage, HatakeSearchPage } from "./pages/list.js";
export { HatakeDetailPage, HatakeFormPage, HatakeWizardPage } from "./pages/form.js";
export { HatakeDashboardPage, HatakeReportPage } from "./pages/panel.js";

// 部品（案件の画面に混ぜて使う）。
export { HatakeField } from "./parts/field.js";
export { HatakePagination, HatakeSearch, HatakeTable } from "./parts/table.js";
