/// ロールによる表示/非表示の出し分け（宣言的な UI レベルの権限制御）。
///
/// **認証・認可そのものは Framework の対象外**（CLAUDE.md）。ここで行うのは
/// 「定義に付いた許可ロール `roles` と、実行時に渡す現在ユーザのロール集合を
/// 突き合わせて、項目/アクションを出し分ける」だけ。誰がどのロールを持つか、
/// および本当のアクセス制御の強制は利用者/バックエンドの責務（Repository と同じ
/// 発想でロール集合を注入する）。
///
/// Dart / TypeScript / Java の3版で同じ判定にすること（conformance のため）。

/// [requiredRoles] が空なら誰でも許可（=ロール制限なし）。そうでなければ
/// [userRoles] のいずれかが [requiredRoles] に含まれるときだけ許可。
bool isAllowed(List<String> requiredRoles, Set<String> userRoles) {
  if (requiredRoles.isEmpty) return true;
  return requiredRoles.any(userRoles.contains);
}
