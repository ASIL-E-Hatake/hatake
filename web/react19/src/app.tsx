import type { AppDefinition, FormatterRegistry, PageDefinition } from "@hatake-fw/api";
import { isAllowed, menuIsGroup, type MenuItem } from "@hatake-fw/api/internal";
import { createAppRouter, type HatakeRouter, type RouteUrl } from "@hatake-fw/runtime";
import { useEffect, useMemo, type ReactNode } from "react";

import { HatakePage } from "./page.js";
import { useController } from "./scope.js";

/**
 * アプリ1本ぶんの入口。**案件が書くのはこれ1行。**
 *
 * ```tsx
 * <HatakeScope registries={registries}>
 *   <HatakeApp app={definition} pages={pages} />
 * </HatakeScope>
 * ```
 *
 * メニューも画面の行き来も URL の歩調合わせも、全部定義から決まる。Vue 版と
 * **同じ印・同じクラス名**を出すので、案件の見た目と画面の試験はそのまま使える。
 *
 * `pages` を別に受けるのは、`parseAppYaml` が返す `app.pages` が**一覧だけ**
 * （id・種類・題）だからで、描くには1枚ずつの定義が要る。集め方は案件の都合。
 */
export function HatakeApp(props: {
  app: AppDefinition;
  /** 画面 id → その画面の定義。 */
  pages: Readonly<Record<string, PageDefinition>>;
  /** いま見ている人の役割。**見せ方だけ**（本当の遮断はサーバ）。 */
  roles?: readonly string[];
  formatters?: FormatterRegistry;
  /** 画面をどう開くか。**定義より優先する**。 */
  navigation?: string;
  /** URL と歩調を合わせるか。 */
  syncUrl?: boolean;
  url?: RouteUrl;
}): ReactNode {
  const made = useMemo(
    () =>
      createAppRouter(props.app, {
        navigation: props.navigation,
        syncUrl: props.syncUrl,
        url: props.url,
      }),
    [props.app.id],
  );
  useController(made.router);
  useEffect(() => made.stop, [made]);

  const current = made.router.current;
  const page = props.pages[current.pageId];

  return (
    <div className="hatake-app" data-hatake={`app:${props.app.id}`}>
      <nav className="hatake-menu" data-hatake="menu">
        <div className="hatake-brand">{props.app.title}</div>
        {props.app.menu.map((item) => (
          <MenuNode key={item.id ?? item.page ?? item.label} item={item} roles={props.roles ?? []} router={made.router} />
        ))}
      </nav>
      <main className="hatake-content">
        {made.router.canPop ? (
          <button className="hatake-button" data-hatake="back" onClick={() => made.router.pop()}>
            戻る
          </button>
        ) : null}
        {/* **知らない画面は黙って白くしない。** */}
        {page === undefined ? (
          <p className="hatake-field-message" role="alert" data-hatake="page:missing">
            画面 &quot;{current.pageId}&quot; の定義が渡されていません（pages に足してください）。
          </p>
        ) : (
          <HatakePage
            key={`${current.pageId}:${JSON.stringify(current.params)}`}
            definition={page}
            recordKey={recordKeyFor(page, current.params)}
            roles={props.roles}
            formatters={props.formatters}
          />
        )}
      </main>
    </div>
  );
}

/**
 * 道の引数から、その画面の鍵を組み立てる。
 *
 * 画面は 0.9.3 から**自分の `key` の名前**で受け取る。1つでも足りなければ
 * undefined＝**取りに行かない**（足りない鍵で別の1件が開く）。
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
function MenuNode(props: { item: MenuItem; roles: readonly string[]; router: HatakeRouter }): ReactNode {
  const { item, roles, router } = props;
  // **見えない項目は出さない。** 役割で絞るのは定義の仕事。
  if (!isAllowed(item.roles, roles)) return null;

  if (menuIsGroup(item)) {
    const children = item.children
      .filter((one) => isAllowed(one.roles, roles))
      .map((one) => <MenuNode key={one.id ?? one.page ?? one.label} item={one} roles={roles} router={router} />);
    if (children.length === 0) return null;
    return (
      <div className="hatake-menu-group">
        <div className="hatake-menu-heading">{item.label}</div>
        {children}
      </div>
    );
  }

  const pageId = item.page;
  if (pageId === undefined) return null;
  return (
    <button
      className={`hatake-menu-item${router.current.pageId === pageId ? " hatake-menu-current" : ""}`}
      data-hatake={`menu:${item.id ?? pageId}`}
      onClick={() => router.select(pageId)}
    >
      {item.label}
    </button>
  );
}
