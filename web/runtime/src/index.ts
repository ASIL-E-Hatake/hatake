// @hatake-fw/runtime — 定義で画面を動かす土台（描く所は持たない）。
//
// **ここに業務の判断を全部寄せる。** Vue と React の Renderer はこの状態を読んで
// 描くだけにする。同じ判断を2回書くと必ず食い違い、食い違ったときに「どちらが
// 正しいか」を決める場所がどこにも無くなる（3版を conformance で縛っているのと
// 同じ理由）。
//
// 目安: Flutter 側の `hatake_material` は約6000行あるが**公開は7名**。Web の
// Renderer も各10名前後に収まるはずで、収まらないならそれは**土台に置くべきものが
// Renderer に漏れている合図**。
//
// 依存は `@hatake-fw/api` だけ（Vue / React は Renderer 側の peerDependencies）。
// 見た目は `@hatake-fw/runtime/hatake.css` を読み込んで、CSS 変数で上書きする。

// ── 外との境目 ────────────────────────────────────────────────
export {
  emptyPage,
  type DataRecord,
  type PageResult,
  type Repository,
  type RepositoryQuery,
  RepositoryRegistry,
  repositoryQuery,
} from "./repository.js";
export { FakeRepository } from "./fakeRepository.js";
export {
  type ActionContext,
  type ActionHandler,
  ActionOutcome,
  ActionRegistry,
  type FailedRow,
} from "./action.js";
export type { ExportRequest, ExportSink, PrintRequest, PrintSink } from "./sinks.js";

// ── ボタンを押したときに起きること（判断はここ。Renderer は描くだけ） ──
export {
  ActionRunner,
  confirmAsk,
  type ActionAsk,
  type ActionAsker,
  type ActionEnabled,
  type ActionMessage,
  type ActionProgress,
  type ActionSurroundings,
} from "./actionRunner.js";
export { type AppMessage, MessageCenter } from "./messages.js";
export { withComputed } from "./computedFields.js";
export { visibleSections, type VisibleSection } from "./formSections.js";
export { onPageTop, rowSlots, type RowSlot } from "./rowSlots.js";

// ── 見せ方の決めごと（数と形は土台、描くのは Renderer） ───────────
export { CHROME_ICONS, FALLBACK_ICON, iconPath, MENU_ICONS } from "./icons.js";
export {
  cardSpan,
  CHART_COLORS,
  CHART_HEIGHT,
  CHART_WIDTH,
  chartShape,
  dashboardColumns,
  dashboardValueText,
  DASHBOARD_GAP,
  MIN_CARD_WIDTH,
  type ChartBar,
  type ChartPoint,
  type ChartShape,
  type ChartSlice,
} from "./dashboardView.js";
export { closingAsks, pageTitle, themeStyle, TOO_MANY_TABS, type ThemeStyle } from "./appChrome.js";

// ── 画面ごとの土台 ────────────────────────────────────────────
export { ListController } from "./listController.js";
export { CrudController, CrudMode, type CrudLike } from "./crudController.js";
export { FormController } from "./formController.js";
export { DetailController } from "./detailController.js";
export { WizardController } from "./wizardController.js";
export { DashboardController, type DashboardItemState } from "./dashboardController.js";
export { ReportController } from "./reportController.js";
export { SubTableController } from "./subTableController.js";

// ── 画面の行き来 ──────────────────────────────────────────────
export {
  appRoute,
  HatakeRouter,
  resolveRouteParams,
  routeFromUri,
  routeToUri,
  type AppRoute,
  type AppTab,
} from "./router.js";
export {
  appHasPage,
  browserRouteUrl,
  createAppRouter,
  homePageId,
  silentRouteUrl,
  type RouteUrl,
} from "./app.js";

// ── 申告（動いているアプリが自分の登録を名乗る） ──────────────
export {
  RegistryKinds,
  registrySnapshot,
  registrySnapshotJson,
  registrySnapshotSource,
  type HatakeRegistries,
  type RegistryReporter,
} from "./registry.js";

// ── 変わったと伝える土台（Renderer が購読する） ────────────────
export { Notifier, type Unsubscribe } from "./notifier.js";
