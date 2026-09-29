import { AppNavigations } from "@hatake-fw/api/internal";

import { Notifier } from "./notifier.js";

/** 道の1段：画面 id と、解決済みの引数。 */
export interface AppRoute {
  readonly pageId: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export const appRoute = (pageId: string, params: Readonly<Record<string, unknown>> = {}): AppRoute => ({
  pageId,
  params,
});

/** 開いているタブ1枚（読む側に見せる形）。 */
export interface AppTab {
  readonly id: number;
  readonly current: AppRoute;
  readonly depth: number;
}

/**
 * 画面の行き来。**外の routing ライブラリに乗らない**（依存を足さない方針そのもので、
 * 持っているのは「どの画面を、どの引数で、どの順に開いたか」だけ）。
 *
 * メニューで選んだら入れ替え（[[go]]）、遷移のボタンは重ねる（[[push]]）ので戻れる。
 *
 * **タブで使うときは、積み重ねがタブごとに1本ずつ在る。** `single`（既定）のときは
 * 1本だけなので、[[current]] / [[push]] / [[go]] / [[pop]] の意味はいままでと同じ
 * ＝前面のタブに対する操作。Dart 側の `HatakeRouter` と同じ振る舞い。
 */
export class HatakeRouter extends Notifier {
  /** タブ1枚につき積み重ね1本。`single` のときは1本だけ。 */
  private readonly _tabs: AppRoute[][];
  private readonly _ids: number[];
  private _front = 0;
  private _nextId = 1;

  readonly navigation: string;

  /** これ以上は開かない。**際限なく開けると、どれが作業中か分からなくなる。** */
  static readonly maxTabs = 10;

  constructor(initial: AppRoute, navigation: string = AppNavigations.single) {
    super();
    this._tabs = [[initial]];
    this._ids = [0];
    this.navigation = navigation;
  }

  get tabsOpen(): boolean {
    return this.navigation === AppNavigations.tabs;
  }
  get tabCount(): number {
    return this._tabs.length;
  }
  get frontTab(): number {
    return this._front;
  }
  private get _stack(): AppRoute[] {
    return this._tabs[this._front];
  }
  get current(): AppRoute {
    return this._stack[this._stack.length - 1];
  }
  get canPop(): boolean {
    return this._stack.length > 1;
  }
  get depth(): number {
    return this._stack.length;
  }
  /** いまの積み重ね（パンくず用）。 */
  get stack(): readonly AppRoute[] {
    return [...this._stack];
  }
  /** 開いているタブ（読む側に見せる形）。 */
  get tabs(): readonly AppTab[] {
    return this._tabs.map((stack, at) => ({
      id: this._ids[at],
      current: stack[stack.length - 1],
      depth: stack.length,
    }));
  }

  /**
   * メニューで選んだとき。
   *
   * `single` なら入れ替え。タブなら**同じ画面が開いていればそれを前に出す**
   * （同じものを2枚開いて別々に直せると、どちらが正か分からない）。上限に達して
   * いたら**開かない**＝false を返すので、呼んだ側が言える。
   */
  select(pageId: string, params: Readonly<Record<string, unknown>> = {}): boolean {
    if (!this.tabsOpen) {
      this.go(pageId, params);
      return true;
    }
    return this._focusOrOpen(pageId, params);
  }

  /**
   * 遷移のボタンを押したとき。
   *
   * `newTab` は定義の `action.open: tab`。並べる場所が無ければ（`single`）無視して
   * いままで通り重ねる＝**書いても壊れない**（効かないことは `validate` が言う）。
   */
  navigate(pageId: string, params: Readonly<Record<string, unknown>> = {}, newTab = false): boolean {
    if (!this.tabsOpen || !newTab) {
      this.push(pageId, params);
      return true;
    }
    return this._focusOrOpen(pageId, params);
  }

  private _focusOrOpen(pageId: string, params: Readonly<Record<string, unknown>>): boolean {
    for (let at = 0; at < this._tabs.length; at += 1) {
      const route = this._tabs[at][this._tabs[at].length - 1];
      if (route.pageId === pageId && sameParams(route.params, params)) {
        if (this._front !== at) {
          this._front = at;
          this.notify();
        }
        return true;
      }
    }
    if (this._tabs.length >= HatakeRouter.maxTabs) return false;
    this._tabs.push([appRoute(pageId, params)]);
    this._ids.push(this._nextId++);
    this._front = this._tabs.length - 1;
    this.notify();
    return true;
  }

  selectTab(index: number): void {
    if (index < 0 || index >= this._tabs.length || index === this._front) return;
    this._front = index;
    this.notify();
  }

  /**
   * タブを閉じる。**最後の1枚は閉じない**（画面が無くなるので）。
   *
   * 閉じたら隣が前に出る（右より左＝いま見ていたものに近い方）。
   */
  closeTab(index: number): boolean {
    if (this._tabs.length <= 1 || index < 0 || index >= this._tabs.length) return false;
    this._tabs.splice(index, 1);
    this._ids.splice(index, 1);
    if (this._front > index || this._front >= this._tabs.length) this._front -= 1;
    this.notify();
    return true;
  }

  /** 重ねる（戻れば前の画面に返る）。 */
  push(pageId: string, params: Readonly<Record<string, unknown>> = {}): void {
    this._stack.push(appRoute(pageId, params));
    this.notify();
  }

  /** 積み重ねごと入れ替える（メニューで選んだとき）。 */
  go(pageId: string, params: Readonly<Record<string, unknown>> = {}): void {
    this._stack.length = 0;
    this._stack.push(appRoute(pageId, params));
    this.notify();
  }

  /** 1つ戻る（根しか無ければ何もしない）。 */
  pop(): void {
    if (!this.canPop) return;
    this._stack.pop();
    this.notify();
  }

  /** そこまで戻る（パンくずを押したとき）。 */
  popTo(index: number): void {
    if (index < 0 || index >= this._stack.length - 1) return;
    this._stack.length = index + 1;
    this.notify();
  }
}

/**
 * 同じ遷移先か（画面 id が同じでも、`params` が違えば別のもの）。
 *
 * 受注 SO-1 と SO-2 は別のタブ。同じ SO-1 をもう一度開いたら、開いているタブを前に出す。
 */
function sameParams(a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => key in b && b[key] === a[key]);
}

/**
 * 道を URL にする：`/<画面 id>` ＋ 引数は問い合わせ文字列。
 *
 * **わざと平ら**にしてある。道は画面 id 1つであって、入れ子にすると定義が持って
 * いない階層を作り出すことになる。引数を問い合わせ側に置くのは、道が読めるままで、
 * 引数の欠けが画面 id をずらさないため。
 *
 * ```
 * { pageId: "order_detail", params: { orderNo: "SO-1001" } }
 *   ↔ /order_detail?orderNo=SO-1001
 * ```
 */
export function routeToUri(route: AppRoute): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(route.params)) {
    if (value !== null && value !== undefined) params.append(key, String(value));
  }
  const query = params.toString();
  return `/${route.pageId}${query === "" ? "" : `?${query}`}`;
}

/**
 * その URL が指している道。この案件のどの画面でもなければ null。
 *
 * `knows` は画面 id が在るかを答える（渡さなければ1区切りなら何でも受ける）。
 * `/`・深い道・知らない id には **null が正直な答え**で、代わりに何を開くかは
 * 呼んだ側が決める（家がどこかは呼んだ側しか知らない）。
 *
 * **引数は文字で返る。** URL に型は無いし、当てにいくと大事な値ほど壊れる
 * （`0012` は取引先コードであって 12 ではない）。URL から鍵を受け取る Repository は
 * どのみち文字を受け取る。
 */
export function routeFromUri(uri: string, knows?: (pageId: string) => boolean): AppRoute | null {
  const url = new URL(uri, "http://hatake.invalid");
  const segments = url.pathname.split("/").filter((one) => one !== "");
  if (segments.length !== 1) return null;
  const pageId = segments[0];
  if (knows !== undefined && !knows(pageId)) return null;
  const params: Record<string, unknown> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return appRoute(pageId, params);
}

/**
 * 道の引数の雛形を、行に当てて解決する。
 *
 * `$row.項目` / `$record.項目` は `record[項目]` になり、それ以外はそのまま通る。
 */
export function resolveRouteParams(
  params: Readonly<Record<string, unknown>> | undefined,
  record: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  if (params === undefined) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && (value.startsWith("$row.") || value.startsWith("$record."))) {
      out[key] = record?.[value.slice(value.indexOf(".") + 1)];
    } else {
      out[key] = value;
    }
  }
  return out;
}
