import type { AppDefinition } from "@hatake-fw/api";
import { AppNavigations, menuIsGroup, type MenuItem } from "@hatake-fw/api/internal";

import { appRoute, HatakeRouter, routeFromUri, routeToUri, type AppRoute } from "./router.js";

/**
 * URL を読む／書く所。
 *
 * 枠組みが決めるのは**URL が何を言うか**（`routeToUri`）で、アドレス欄そのものは
 * 動く場所の話。だからここで境目にしてある＝**ブラウザ無しでも同期を試験できる**。
 */
export interface RouteUrl {
  /** 開かれたときの URL。無ければ undefined。 */
  readonly initial: string | undefined;
  /** 見せる。`replace` は履歴を増やさずに書き換える（最初の画面の道を明示するとき）。 */
  write(uri: string, replace?: boolean): void;
}

/**
 * 本物のアドレス欄（History API）。
 *
 * 戻る・進むも拾うので、押した人の期待どおりに画面が戻る。ブラウザの外
 * （試験・SSR）では何もしない口を渡す。
 */
export function browserRouteUrl(): RouteUrl {
  return {
    get initial(): string | undefined {
      if (typeof window === "undefined") return undefined;
      return `${window.location.pathname}${window.location.search}`;
    },
    write(uri: string, replace = false): void {
      if (typeof window === "undefined") return;
      if (replace) window.history.replaceState(null, "", uri);
      else window.history.pushState(null, "", uri);
    },
  };
}

/** 何も覚えない口（試験と、自分で routing を持っているアプリ用）。 */
export const silentRouteUrl: RouteUrl = {
  initial: undefined,
  write() {
    /* 何もしない */
  },
};

/** メニューを上から辿って、条件に合う**葉**を1つ返す。 */
function firstLeaf(menu: readonly MenuItem[], ok: (item: MenuItem) => boolean): MenuItem | undefined {
  for (const item of menu) {
    if (menuIsGroup(item)) {
      const found = firstLeaf(item.children, ok);
      if (found !== undefined) return found;
      continue;
    }
    if (ok(item)) return item;
  }
  return undefined;
}

/**
 * 最初に開く画面の id。
 *
 * `app.home` が在ればそれ（メニューの id でも画面 id でもよい）。無ければメニューの
 * 最初の葉、それも無ければ最初の画面。**家だけは必ず在る**ので、URL が当てに
 * ならないときの行き先になる。
 */
export function homePageId(app: AppDefinition): string {
  if (app.home !== undefined) {
    const match = firstLeaf(app.menu, (one) => one.id === app.home || one.page === app.home);
    return match?.page ?? app.home;
  }
  const first = firstLeaf(app.menu, () => true);
  return first?.page ?? (app.pages.length > 0 ? app.pages[0].id : "");
}

/** その画面がこのアプリに在るか。 */
export const appHasPage = (app: AppDefinition, pageId: string): boolean =>
  app.pages.some((one) => one.id === pageId);

/**
 * 定義から行き来を組み立て、**URL と画面を歩調を合わせる**。
 *
 * URL が指している画面が在ればそこから始め、無ければ家。`/` でも、他の版の画面でも、
 * 知らない id でも家に来る＝**必ず在ると分かっている唯一の画面**だから。
 *
 * 返す `stop()` を呼ぶと購読を外す（画面を閉じるとき）。
 */
export function createAppRouter(
  app: AppDefinition,
  options: {
    /** 画面をどう開くか。**定義より優先する**（PC はタブ、タブレットは遷移）。 */
    navigation?: string;
    /** URL と歩調を合わせるか。自前の routing を持つアプリは false。 */
    syncUrl?: boolean;
    url?: RouteUrl;
  } = {},
): { router: HatakeRouter; stop: () => void } {
  const url = options.url ?? browserRouteUrl();
  const sync = options.syncUrl ?? true;

  const initial = ((): AppRoute => {
    if (sync && url.initial !== undefined) {
      const found = routeFromUri(url.initial, (pageId) => appHasPage(app, pageId));
      if (found !== null) return found;
    }
    return appRoute(homePageId(app));
  })();

  const router = new HatakeRouter(
    initial,
    options.navigation ?? app.navigation ?? AppNavigations.single,
  );

  if (!sync) return { router, stop: () => router.dispose() };

  // 最初の画面の道を**明示する**（`/` のまま置くと、読み直したときに家に戻る）。
  url.write(routeToUri(router.current), true);
  const off = router.subscribe(() => url.write(routeToUri(router.current)));

  return { router, stop: () => off() };
}
