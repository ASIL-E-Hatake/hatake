import type { AppDefinition, FormatterRegistry, PageDefinition } from "@hatake-fw/api";
import { menuIsGroup, type MenuItem, visibleMenu } from "@hatake-fw/api/internal";
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
import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { HatakePage } from "./page.js";
import { Icon, SvgPath } from "./parts/icon.js";
import { HatakeAppScope, useController, useRegistries } from "./scope.js";

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
 *
 * 枠の決まり（Flutter 版の `app_shell.dart` / `app_tabs.dart` と同じ）:
 *
 *   ・`app.theme` は**外側の枠**に CSS 変数として当てる（案件は内側で上書きできる）
 *   ・`navigation: tabs` なら**タブ列**を出す。裏のタブは**消さずに隠す**＝戻って
 *     きたら検索条件も入力もそのまま（それがタブの本題）
 *   ・入力できる画面のタブを閉じるときは**聞く**。最後の1枚は閉じる口を出さない
 *   ・中で遷移したら**パン屑**を出す（押すとそこまで戻る）
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
  const registries = useRegistries();
  const made = useMemo(
    () =>
      createAppRouter(props.app, {
        navigation: props.navigation,
        syncUrl: props.syncUrl,
        url: props.url,
      }),
    [props.app.id],
  );
  // **文はアプリが持つ。** 画面が持つと、`onSuccess` で移った先で作り直されて
  // 「3件やりました」が出ないまま消える。
  const messages = useMemo(() => new MessageCenter(), [props.app.id]);
  useController(made.router);
  useController(messages);
  useEffect(() => made.stop, [made]);
  // 閉じる前に聞いているタブ（入力できる画面だけ）。
  const [closing, setClosing] = useState<number | null>(null);

  const router = made.router;
  const roles = props.roles ?? [];
  const theme = themeStyle(props.app.theme);
  const said = messages.message;

  /** メニューを押した。タブの上限なら**開かずにそう言う**（古いタブを勝手に閉じない）。 */
  const open = (pageId: string): void => {
    if (!router.select(pageId)) messages.say(TOO_MANY_TABS(HatakeRouter.maxTabs), false);
  };

  const close = (index: number): void => {
    const tab = router.tabs[index];
    if (tab === undefined) return;
    if (closingAsks(props.app, tab.current.pageId)) {
      setClosing(index);
      return;
    }
    router.closeTab(index);
  };

  const pageNode = (route: AppRoute): ReactNode => {
    const page = props.pages[route.pageId];
    // **知らない画面は黙って白くしない。**
    if (page === undefined) {
      return (
        <p className="hatake-field-message" role="alert" data-hatake="page:missing">
          画面 &quot;{route.pageId}&quot; の定義が渡されていません（pages に足してください）。
        </p>
      );
    }
    return (
      <HatakePage
        key={`${route.pageId}:${JSON.stringify(route.params)}`}
        definition={page}
        recordKey={recordKeyFor(page, route.params)}
        roles={props.roles}
        formatters={props.formatters}
      />
    );
  };

  return (
    <HatakeAppScope router={router} messages={messages}>
      <div
        className="hatake-theme"
        style={theme.variables as CSSProperties}
        data-hatake-brightness={theme.brightness}
        data-hatake-density={theme.density}
      >
        <div className="hatake-app" data-hatake={`app:${props.app.id}`}>
          <header className="hatake-appbar">
            <div className="hatake-brand">{props.app.title}</div>
          </header>
          <nav className="hatake-menu" data-hatake="menu">
            {/* 見えない項目は落としてから描く（項目の roles と、行き先の画面の roles）。 */}
            {visibleMenu(props.app.menu, roles, (id) => props.pages[id]).map((item) => (
              <MenuNode
                key={item.id ?? item.page ?? item.label}
                item={item}
                router={router}
                custom={registries.icons ?? {}}
                open={open}
              />
            ))}
          </nav>
          <main className="hatake-content">
            {router.tabsOpen ? <TabBar app={props.app} router={router} close={close} /> : null}
            {said === null ? null : (
              <p
                className={`hatake-message ${said.ok ? "hatake-message-ok" : "hatake-message-ng"}`}
                data-hatake={said.ok ? "action:done" : "action:failed"}
                role={said.ok ? "status" : "alert"}
                onClick={() => messages.clear()}
              >
                {said.text}
              </p>
            )}
            <Breadcrumb app={props.app} router={router} />
            {router.tabsOpen
              ? router.tabs.map((tab, index) => (
                  <div
                    key={tab.id}
                    className="hatake-tab-panel"
                    hidden={index !== router.frontTab}
                    data-hatake={`tab-panel:${tab.id}`}
                  >
                    {pageNode(tab.current)}
                  </div>
                ))
              : pageNode(router.current)}
          </main>
        </div>
        {closing === null ? null : (
          <CloseDialog
            title={pageTitle(props.app, router.tabs[closing]?.current.pageId ?? "")}
            answer={(ok) => {
              const index = closing;
              setClosing(null);
              if (ok) router.closeTab(index);
            }}
          />
        )}
      </div>
    </HatakeAppScope>
  );
}

/** タブ列。札は「いま見ている画面の題」、最後の1枚には閉じる口を出さない。 */
function TabBar(props: { app: AppDefinition; router: HatakeRouter; close: (index: number) => void }): ReactNode {
  const { app, router } = props;
  return (
    <div className="hatake-tabs" role="tablist" data-hatake="tabs">
      {router.tabs.map((tab, index) => {
        const front = index === router.frontTab;
        const title = pageTitle(app, tab.current.pageId);
        return (
          <div
            key={tab.id}
            className={front ? "hatake-tab hatake-tab-current" : "hatake-tab"}
            data-hatake={`tab:${tab.id}`}
          >
            <button
              className="hatake-tab-label"
              type="button"
              role="tab"
              aria-selected={front ? "true" : "false"}
              onClick={() => router.selectTab(index)}
            >
              {title}
            </button>
            {router.tabCount > 1 ? (
              <button
                className="hatake-tab-close"
                type="button"
                title="閉じる"
                aria-label={`${title} を閉じる`}
                data-hatake={`tab:${tab.id}:close`}
                onClick={() => props.close(index)}
              >
                <Icon name="close" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** パン屑。**中で遷移したときだけ**出す（1段目だけなら言うことが無い）。 */
function Breadcrumb(props: { app: AppDefinition; router: HatakeRouter }): ReactNode {
  const stack = props.router.stack;
  if (stack.length < 2) return null;
  return (
    <nav className="hatake-breadcrumb" aria-label="いまの位置" data-hatake="breadcrumb">
      <button
        className="hatake-icon-button"
        type="button"
        title="戻る"
        aria-label="戻る"
        data-hatake="back"
        onClick={() => props.router.pop()}
      >
        <Icon name="back" />
      </button>
      {stack.map((route, at) => {
        const label = pageTitle(props.app, route.pageId);
        const sep =
          at > 0 ? (
            <span className="hatake-crumb-sep" aria-hidden="true">
              ›
            </span>
          ) : null;
        return (
          <Fragment key={at}>
            {sep}
            {at === stack.length - 1 ? (
              <span className="hatake-crumb-current">{label}</span>
            ) : (
              <button
                className="hatake-crumb"
                type="button"
                data-hatake={`crumb:${route.pageId}`}
                onClick={() => props.router.popTo(at)}
              >
                {label}
              </button>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

/** 入力できる画面のタブを閉じる前に聞く（Flutter と同じ文）。 */
function CloseDialog(props: { title: string; answer: (ok: boolean) => void }): ReactNode {
  return (
    <div
      className="hatake-dialog-backdrop"
      data-hatake="tab:confirm-close"
      onClick={(event) => {
        if (event.target === event.currentTarget) props.answer(false);
      }}
    >
      <div className="hatake-dialog" role="dialog" aria-modal="true" aria-label={`「${props.title}」を閉じます`}>
        <h2 className="hatake-dialog-title">「{props.title}」を閉じます</h2>
        <p className="hatake-dialog-message">入力中のものは消えます。</p>
        <div className="hatake-dialog-actions">
          <button className="hatake-button hatake-button-text" type="button" onClick={() => props.answer(false)}>
            やめる
          </button>
          <button
            className="hatake-button hatake-button-text"
            type="button"
            data-hatake="tab:confirm-close:ok"
            onClick={() => props.answer(true)}
          >
            閉じる
          </button>
        </div>
      </div>
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

/**
 * メニューの1項目（束ねているなら見出しと中身）。**見えない項目は `visibleMenu` が
 * 先に落としてある**（項目の roles と、行き先の画面の roles）。
 */
function MenuNode(props: {
  item: MenuItem;
  router: HatakeRouter;
  custom: Readonly<Record<string, string>>;
  open: (pageId: string) => void;
}): ReactNode {
  const { item, router } = props;

  if (menuIsGroup(item)) {
    const children = item.children
      .map((one) => (
        <MenuNode
          key={one.id ?? one.page ?? one.label}
          item={one}
          router={router}
          custom={props.custom}
          open={props.open}
        />
      ));
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
      className={
        router.current.pageId === pageId ? "hatake-menu-item hatake-menu-current" : "hatake-menu-item"
      }
      data-hatake={`menu:${item.id ?? pageId}`}
      onClick={() => props.open(pageId)}
    >
      <SvgPath d={iconPath(item.icon, props.custom)} />
      {item.label}
    </button>
  );
}
