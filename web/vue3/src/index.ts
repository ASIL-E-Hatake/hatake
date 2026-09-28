// @hatake-fw/vue3 — hatake の定義を Vue 3 で描く。
//
// **業務の判断はここに1つも無い。** 何が必須か・いつ押せるか・2件目を作らないか、
// は全部 `@hatake-fw/runtime` が決めていて、ここは描くだけ。Flutter 側の
// `hatake_material` が約6000行あって**公開7名**なのと同じ形を狙っている。
//
// 依存は Vue 本体だけ（`peerDependencies`）。見た目は
// `@hatake-fw/runtime/hatake.css` を読み込んで、CSS 変数で上書きする。
//
// ```ts
// import { HatakePage, HatakeScope } from "@hatake-fw/vue3";
// import "@hatake-fw/runtime/hatake.css";
//
// h(HatakeScope, { registries }, () => h(HatakePage, { definition }))
// ```
//
// **ここに足すときの線引きは `@hatake-fw/api` と同じ3つ。** 増えるようなら、
// たいてい土台（runtime）に置くべきものが漏れている。

export { HatakePage } from "./page.js";
export { HatakeScope, useController, useRegistries, type HatakeRegistries } from "./scope.js";

// 画面を自分で組み立てたいとき用（menu を自作する・1枚だけ埋め込む、など）。
export { HatakeCrudPage, HatakeSearchPage } from "./pages/list.js";
export { HatakeDetailPage, HatakeFormPage, HatakeWizardPage } from "./pages/form.js";
export { HatakeDashboardPage, HatakeReportPage } from "./pages/panel.js";

// 部品（案件の画面に混ぜて使う）。
export { HatakeField } from "./parts/field.js";
export { HatakeTable } from "./parts/table.js";
export { HatakePagination, HatakeSearch } from "./parts/search.js";
