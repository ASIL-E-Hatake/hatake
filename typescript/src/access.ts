// ロールによる表示/非表示の出し分け（宣言的な UI レベルの権限制御）。
// 認証・認可そのものは Framework の対象外。ここは許可ロールと現在ユーザの
// ロール集合を突き合わせるだけ。Dart / Java 版と同じ判定。

/**
 * requiredRoles が空なら誰でも許可。そうでなければ userRoles のいずれかが
 * requiredRoles に含まれるときだけ許可。
 */
export function isAllowed(
  requiredRoles: string[],
  userRoles: ReadonlySet<string> | readonly string[],
): boolean {
  if (requiredRoles.length === 0) return true;
  const set = userRoles instanceof Set ? userRoles : new Set(userRoles);
  return requiredRoles.some((r) => set.has(r));
}

/**
 * その人がこの画面を開けるか（画面自身の `roles`。0.9.22）。
 *
 * 入口（メニュー・遷移のボタン）の権限とは別に、**画面そのもの**に掛かる最後の門。
 * Dart 版の `canOpenPage` と同じ。サーバで素の定義から読むなら `canOpenPageIn`。
 */
export function canOpenPage(
  page: { readonly roles?: readonly string[] },
  userRoles: ReadonlySet<string> | readonly string[],
): boolean {
  return isAllowed([...(page.roles ?? [])], userRoles);
}

/**
 * メニューの項目1つを、その人に出すか（葉の判定）。
 *
 * 項目の `roles` と、**行き先の画面の `roles`** の両方を満たすときだけ。押しても
 * 「権限がありません」と出る項目は、壊れているのと同じに読まれる。行き先が分からない
 * （定義に無い）ときは項目の `roles` だけで決める。Dart 版の `menuItemOpens` と同じ。
 */
export function menuItemOpens(
  item: { readonly roles: string[] },
  userRoles: ReadonlySet<string> | readonly string[],
  target?: { readonly roles?: readonly string[] },
): boolean {
  return isAllowed(item.roles, userRoles) && (target === undefined || canOpenPage(target, userRoles));
}

interface MenuLike {
  readonly roles: string[];
  readonly page?: string;
  readonly children: readonly MenuLike[];
}

/**
 * その人に見せるメニュー（見えない項目を落とした木）。
 *
 * 葉は [menuItemOpens]、見出し（束）は自分の `roles` を満たして、**中身が1つでも残る**
 * ときだけ残す（中身が全部隠れた見出しを出すと、押せない見出しだけが並ぶ）。
 */
export function visibleMenu<T extends MenuLike>(
  menu: readonly T[],
  userRoles: ReadonlySet<string> | readonly string[],
  pageOf: (pageId: string) => { readonly roles?: readonly string[] } | undefined,
): T[] {
  const out: T[] = [];
  for (const item of menu) {
    if (item.children.length > 0) {
      if (!isAllowed(item.roles, userRoles)) continue;
      const children = visibleMenu(item.children as readonly T[], userRoles, pageOf);
      if (children.length > 0) out.push({ ...item, children });
      continue;
    }
    if (item.page === undefined) continue;
    if (menuItemOpens(item, userRoles, pageOf(item.page))) out.push(item);
  }
  return out;
}
