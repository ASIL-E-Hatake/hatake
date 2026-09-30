import { FormatterRegistry } from "@hatake-fw/api";
import type { AppDefinition, PageDefinition } from "@hatake-fw/api";
import { isAllowed, menuIsGroup, type MenuItem } from "@hatake-fw/api/internal";
import {
  type AppRoute,
  closingAsks,
  createAppRouter,
  HatakeRouter,
  iconPath,
  MessageCenter,
  pageTitle,
  type RouteUrl,
  themeStyle,
  TOO_MANY_TABS,
} from "@hatake-fw/runtime";
import { defineComponent, h, onScopeDispose, shallowRef, type PropType, type VNode } from "vue";

import { HatakePage } from "./page.js";
import { icon } from "./parts/icon.js";
import { provideMessages, provideRouter, touch, useController, useRegistries } from "./scope.js";

/**
 * アプリ1本ぶんの入口。**案件が書くのはこれ1行。**
 *
 * ```ts
 * h(HatakeScope, { registries }, () => h(HatakeApp, { app: definition, pages }))
 * ```
 *
 * メニューも画面の行き来も URL の歩調合わせも、全部定義から決まる。**画面のコードは
 * 1行も要らない**のがこの枠組みの主張なので、ここが厚くなったら疑うべき所。
 *
 * `pages` を別に受けるのは、`parseAppYaml` が返す `app.pages` が**一覧だけ**
 * （id・種類・題）だからで、描くには1枚ずつの定義が要る。サーバから読むにせよ
 * 同梱するにせよ、集め方は案件の都合なのでここでは決めない。
 *
 * 枠の決まり（Flutter 版の `app_shell.dart` / `app_tabs.dart` と同じ）:
 *
 *   ・`app.theme` は**外側の枠**に CSS 変数として当てる（案件は内側で上書きできる）
 *   ・`navigation: tabs` なら**タブ列**を出す。裏のタブは**消さずに隠す**＝戻って
 *     きたら検索条件も入力もそのまま（それがタブの本題）
 *   ・入力できる画面のタブを閉じるときは**聞く**。最後の1枚は閉じる口を出さない
 *   ・中で遷移したら**パン屑**を出す（押すとそこまで戻る）
 */
export const HatakeApp = defineComponent({
  name: "HatakeApp",
  props: {
    app: { type: Object as PropType<AppDefinition>, required: true },
    /** 画面 id → その画面の定義。 */
    pages: { type: Object as PropType<Readonly<Record<string, PageDefinition>>>, required: true },
    /** いま見ている人の役割。**見せ方だけ**（本当の遮断はサーバ）。 */
    roles: { type: Array as PropType<readonly string[]>, default: () => [] },
    formatters: { type: Object as PropType<FormatterRegistry>, default: () => new FormatterRegistry() },
    /** 画面をどう開くか。**定義より優先する**（PC はタブ、タブレットは遷移）。 */
    navigation: { type: String, default: undefined },
    /** URL と歩調を合わせるか。自前の routing を持つアプリは false。 */
    syncUrl: { type: Boolean, default: true },
    url: { type: Object as PropType<RouteUrl>, default: undefined },
  },
  setup(props) {
    const registries = useRegistries();
    const { router, stop } = createAppRouter(props.app, {
      navigation: props.navigation,
      syncUrl: props.syncUrl,
      url: props.url,
    });
    onScopeDispose(stop);
    provideRouter(router);
    // **文はアプリが持つ。** 画面が持つと、`onSuccess` で移った先で作り直されて
    // 「3件やりました」が出ないまま消える（実際に消えた）。
    const messages = new MessageCenter();
    provideMessages(messages);
    const { version } = useController(router);
    const { version: said } = useController(messages);
    // 閉じる前に聞いているタブ（入力できる画面だけ）。
    const closing = shallowRef<number | null>(null);

    /** メニューを押した。タブの上限なら**開かずにそう言う**（古いタブを勝手に閉じない）。 */
    const open = (pageId: string): void => {
      if (!router.select(pageId)) messages.say(TOO_MANY_TABS(HatakeRouter.maxTabs), false);
    };

    const close = (index: number): void => {
      const tab = router.tabs[index];
      if (tab === undefined) return;
      if (closingAsks(props.app, tab.current.pageId)) {
        closing.value = index;
        return;
      }
      router.closeTab(index);
    };

    const pageNode = (route: AppRoute, key: string): VNode => {
      const page = props.pages[route.pageId];
      // **知らない画面は黙って白くしない。** 定義がメニューに載せているのに
      // 描けないのは、集めるときに落としたということ。
      if (page === undefined) {
        return h(
          "p",
          { key, class: "hatake-field-message", role: "alert", "data-hatake": "page:missing" },
          `画面 "${route.pageId}" の定義が渡されていません（pages に足してください）。`,
        );
      }
      return h(HatakePage, {
        key,
        definition: page,
        recordKey: recordKeyFor(page, route.params),
        roles: props.roles,
        formatters: props.formatters,
      });
    };

    return () => {
      touch(version);
      touch(said);
      const theme = themeStyle(props.app.theme);
      const custom = registries.icons ?? {};

      // 並べて開いていないなら、いつもの1枚だけ。
      const panels = router.tabsOpen
        ? router.tabs.map((tab, index) =>
            h(
              "div",
              {
                key: tab.id,
                class: "hatake-tab-panel",
                hidden: index !== router.frontTab,
                "data-hatake": `tab-panel:${tab.id}`,
              },
              [pageNode(tab.current, `${tab.current.pageId}:${JSON.stringify(tab.current.params)}`)],
            ),
          )
        : [pageNode(router.current, `${router.current.pageId}:${JSON.stringify(router.current.params)}`)];

      return h(
        "div",
        {
          class: "hatake-theme",
          style: theme.variables,
          "data-hatake-brightness": theme.brightness,
          "data-hatake-density": theme.density,
        },
        [
          h("div", { class: "hatake-app", "data-hatake": `app:${props.app.id}` }, [
            h("header", { class: "hatake-appbar" }, [h("div", { class: "hatake-brand" }, props.app.title)]),
            h("nav", { class: "hatake-menu", "data-hatake": "menu" }, [
              ...props.app.menu.map((item) => menuNode(item, props.roles, router, custom, open)),
            ]),
            h("main", { class: "hatake-content" }, [
              ...(router.tabsOpen ? [tabBar(props.app, router, close)] : []),
              ...messageNode(messages),
              ...breadcrumb(props.app, router),
              ...panels,
            ]),
          ]),
          closing.value === null
            ? null
            : closeDialog(
                pageTitle(props.app, router.tabs[closing.value]?.current.pageId ?? ""),
                (ok) => {
                  const index = closing.value;
                  closing.value = null;
                  if (ok && index !== null) router.closeTab(index);
                },
              ),
        ],
      );
    };
  },
});

/** タブ列。札は「いま見ている画面の題」、最後の1枚には閉じる口を出さない。 */
function tabBar(app: AppDefinition, router: HatakeRouter, close: (index: number) => void): VNode {
  return h(
    "div",
    { class: "hatake-tabs", role: "tablist", "data-hatake": "tabs" },
    router.tabs.map((tab, index) => {
      const front = index === router.frontTab;
      return h(
        "div",
        {
          key: tab.id,
          class: ["hatake-tab", front ? "hatake-tab-current" : null],
          "data-hatake": `tab:${tab.id}`,
        },
        [
          h(
            "button",
            {
              class: "hatake-tab-label",
              type: "button",
              role: "tab",
              "aria-selected": front ? "true" : "false",
              onClick: () => router.selectTab(index),
            },
            pageTitle(app, tab.current.pageId),
          ),
          router.tabCount > 1
            ? h(
                "button",
                {
                  class: "hatake-tab-close",
                  type: "button",
                  title: "閉じる",
                  "aria-label": `${pageTitle(app, tab.current.pageId)} を閉じる`,
                  "data-hatake": `tab:${tab.id}:close`,
                  onClick: () => close(index),
                },
                [icon("close")],
              )
            : null,
        ],
      );
    }),
  );
}

/** パン屑。**中で遷移したときだけ**出す（1段目だけなら言うことが無い）。 */
function breadcrumb(app: AppDefinition, router: HatakeRouter): VNode[] {
  const stack = router.stack;
  if (stack.length < 2) return [];
  const crumbs: VNode[] = [
    h(
      "button",
      {
        class: "hatake-icon-button",
        type: "button",
        title: "戻る",
        "aria-label": "戻る",
        "data-hatake": "back",
        onClick: () => router.pop(),
      },
      [icon("back")],
    ),
  ];
  stack.forEach((route, at) => {
    if (at > 0) crumbs.push(h("span", { class: "hatake-crumb-sep", "aria-hidden": "true" }, "›"));
    const label = pageTitle(app, route.pageId);
    crumbs.push(
      at === stack.length - 1
        ? h("span", { class: "hatake-crumb-current" }, label)
        : h(
            "button",
            {
              class: "hatake-crumb",
              type: "button",
              "data-hatake": `crumb:${route.pageId}`,
              onClick: () => router.popTo(at),
            },
            label,
          ),
    );
  });
  return [h("nav", { class: "hatake-breadcrumb", "aria-label": "いまの位置", "data-hatake": "breadcrumb" }, crumbs)];
}

/** 入力できる画面のタブを閉じる前に聞く（Flutter と同じ文）。 */
function closeDialog(title: string, answer: (ok: boolean) => void): VNode {
  return h(
    "div",
    {
      class: "hatake-dialog-backdrop",
      "data-hatake": "tab:confirm-close",
      onClick: (event: MouseEvent) => {
        if (event.target === event.currentTarget) answer(false);
      },
    },
    [
      h("div", { class: "hatake-dialog", role: "dialog", "aria-modal": "true", "aria-label": `「${title}」を閉じます` }, [
        h("h2", { class: "hatake-dialog-title" }, `「${title}」を閉じます`),
        h("p", { class: "hatake-dialog-message" }, "入力中のものは消えます。"),
        h("div", { class: "hatake-dialog-actions" }, [
          h("button", { class: "hatake-button hatake-button-text", type: "button", onClick: () => answer(false) }, "やめる"),
          h(
            "button",
            {
              class: "hatake-button hatake-button-text",
              type: "button",
              "data-hatake": "tab:confirm-close:ok",
              onClick: () => answer(true),
            },
            "閉じる",
          ),
        ]),
      ]),
    ],
  );
}

/** 押したあとの1行（押すと消える）。 */
function messageNode(messages: MessageCenter): VNode[] {
  const one = messages.message;
  if (one === null) return [];
  return [
    h(
      "p",
      {
        class: ["hatake-message", one.ok ? "hatake-message-ok" : "hatake-message-ng"],
        "data-hatake": one.ok ? "action:done" : "action:failed",
        role: one.ok ? "status" : "alert",
        onClick: () => messages.clear(),
      },
      one.text,
    ),
  ];
}

/**
 * 道の引数から、その画面の鍵を組み立てる。
 *
 * 画面は 0.9.3 から**自分の `key` の名前**で受け取るので、名前をそのまま渡せば届く。
 * 1つでも足りなければ undefined＝**取りに行かない**（足りない鍵で別の1件が開く）。
 */
function recordKeyFor(page: PageDefinition, params: Readonly<Record<string, unknown>>): unknown {
  const fields = "keyFields" in page ? page.keyFields : undefined;
  if (fields === undefined || fields.length === 0) return undefined;
  if (fields.length === 1) return params[fields[0]] ?? params["id"];
  const parts: Record<string, unknown> = {};
  for (const one of fields) {
    if (params[one] === undefined) return undefined;
    parts[one] = params[one];
  }
  return parts;
}

/** メニューの1項目（束ねているなら見出しと中身）。 */
function menuNode(
  item: MenuItem,
  roles: readonly string[],
  router: HatakeRouter,
  custom: Readonly<Record<string, string>>,
  open: (pageId: string) => void,
): VNode | null {
  // **見えない項目は出さない。** 役割で絞るのは定義の仕事。
  if (!isAllowed(item.roles, roles)) return null;

  if (menuIsGroup(item)) {
    const children = item.children
      .map((one) => menuNode(one, roles, router, custom, open))
      .filter((one) => one !== null);
    if (children.length === 0) return null;
    return h("div", { class: "hatake-menu-group" }, [
      h("div", { class: "hatake-menu-heading" }, item.label),
      ...children,
    ]);
  }

  const pageId = item.page;
  if (pageId === undefined) return null;
  return h(
    "button",
    {
      class: ["hatake-menu-item", router.current.pageId === pageId ? "hatake-menu-current" : null],
      "data-hatake": `menu:${item.id ?? pageId}`,
      onClick: () => open(pageId),
    },
    [h("svg", { class: "hatake-icon", viewBox: "0 0 24 24", "aria-hidden": "true" }, [h("path", { d: iconPath(item.icon, custom) })]), item.label],
  );
}
