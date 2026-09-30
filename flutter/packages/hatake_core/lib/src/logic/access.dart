// ロールによる表示/非表示の出し分け（宣言的な UI レベルの権限制御）。
//
// **認証・認可そのものは Framework の対象外**（CLAUDE.md）。ここで行うのは
// 「定義に付いた許可ロール `roles` と、実行時に渡す現在ユーザのロール集合を
// 突き合わせて、項目/アクションを出し分ける」だけ。誰がどのロールを持つか、
// および本当のアクセス制御の強制は利用者/バックエンドの責務（Repository と同じ
// 発想でロール集合を注入する）。
//
// Dart / TypeScript / Java の3版で同じ判定にすること（conformance のため）。

import '../definition/menu_item.dart';
import '../definition/page_definition.dart';

/// [requiredRoles] が空なら誰でも許可（=ロール制限なし）。そうでなければ
/// [userRoles] のいずれかが [requiredRoles] に含まれるときだけ許可。
bool isAllowed(List<String> requiredRoles, Set<String> userRoles) {
  if (requiredRoles.isEmpty) return true;
  return requiredRoles.any(userRoles.contains);
}

/// その人がこの画面を開けるか（画面自身の `roles`。0.9.22）。
///
/// 入口（メニュー・遷移のボタン）の権限とは別に、**画面そのもの**に掛かる最後の門。
/// URL で直に来ても、この答えが false なら中身を出さない。サーバは同じ判定を
/// TS の `canOpenPageIn` / Java の `ServerAccess.canOpenPage` で読む（素の定義から）。
bool canOpenPage(PageDefinition page, Set<String> userRoles) =>
    isAllowed(page.roles, userRoles);

/// メニューの項目1つを、その人に出すか。
///
/// 項目の `roles` と、**行き先の画面の `roles`** の両方を満たすときだけ。押しても
/// 「権限がありません」と出る項目は、壊れているのと同じに読まれる。[target] が null
/// （行き先の画面が定義に無い）ときは項目の `roles` だけで決める（無い画面は検証が言う）。
bool menuItemOpens(
  MenuItem item,
  Set<String> userRoles,
  PageDefinition? target,
) =>
    isAllowed(item.roles, userRoles) &&
    (target == null || canOpenPage(target, userRoles));
