import { FormatterRegistry } from "@hatake-fw/api";
import type { AppDefinition, PageDefinition } from "@hatake-fw/api";
import { isAllowed, menuIsGroup, type MenuItem } from "@hatake-fw/api/internal";
import { createAppRouter, type HatakeRouter, type RouteUrl } from "@hatake-fw/runtime";
import { defineComponent, h, onScopeDispose, type PropType, type VNode } from "vue";

import { HatakePage } from "./page.js";
import { touch, useController } from "./scope.js";

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
    const { router, stop } = createAppRouter(props.app, {
      navigation: props.navigation,
      syncUrl: props.syncUrl,
      url: props.url,
    });
    onScopeDispose(stop);
    const { version } = useController(router);

    return () => {
      touch(version);
      const current = router.current;
      const page = props.pages[current.pageId];

      return h("div", { class: "hatake-app", "data-hatake": `app:${props.app.id}` }, [
        h("nav", { class: "hatake-menu", "data-hatake": "menu" }, [
          h("div", { class: "hatake-brand" }, props.app.title),
          ...props.app.menu.map((item) => menuNode(item, props.roles, router)),
        ]),
        h("main", { class: "hatake-content" }, [
          ...(router.canPop
            ? [
                h(
                  "button",
                  { class: "hatake-button", "data-hatake": "back", onClick: () => router.pop() },
                  "戻る",
                ),
              ]
            : []),
          // **知らない画面は黙って白くしない。** 定義がメニューに載せているのに
          // 描けないのは、集めるときに落としたということ。
          page === undefined
            ? h(
                "p",
                { class: "hatake-field-message", role: "alert", "data-hatake": "page:missing" },
                `画面 "${current.pageId}" の定義が渡されていません（pages に足してください）。`,
              )
            : h(HatakePage, {
                key: `${current.pageId}:${JSON.stringify(current.params)}`,
                definition: page,
                recordKey: recordKeyFor(page, current.params),
                roles: props.roles,
                formatters: props.formatters,
              }),
        ]),
      ]);
    };
  },
});

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
function menuNode(item: MenuItem, roles: readonly string[], router: HatakeRouter): VNode | null {
  // **見えない項目は出さない。** 役割で絞るのは定義の仕事。
  if (!isAllowed(item.roles, roles)) return null;

  if (menuIsGroup(item)) {
    const children = item.children.map((one) => menuNode(one, roles, router)).filter((one) => one !== null);
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
      onClick: () => router.select(pageId),
    },
    item.label,
  );
}
