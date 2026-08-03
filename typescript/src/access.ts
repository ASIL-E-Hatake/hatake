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
