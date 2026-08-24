import 'package:equatable/equatable.dart';

/// 1回で動かせる行数の上限（`action.maxRows`）。
///
/// 上限は**業務の決めごと**で、しかも役割で変わる（担当は20件・管理者は上限なし）。
/// だから定義に書ける形にしてある。
///
/// ```yaml
/// maxRows: 20                       # 全員 20 件
/// maxRows:                          # 役割ごと
///   default: 20
///   byRole: { manager: 100, admin: all }
/// ```
///
/// **複数の役割を持つ人には、一番ゆるい上限が効く。** `roles` で「どれか1つ当てはまれば
/// 見える」としているのと同じ考え方で、役割は足すもの＝持っているほど広がる。
class RowLimit extends Equatable {
  /// 役割で決まらないときの上限。**null = 上限なし**（`all`）。
  final int? rows;

  /// 役割ごとの上限。値が null なら「その役割は上限なし」。
  final Map<String, int?> byRole;

  const RowLimit({this.rows, this.byRole = const {}});

  /// 全員に同じ上限。
  const RowLimit.of(int rows) : this(rows: rows);

  /// [roles] を持つ人の上限。**null = 上限なし。**
  ///
  /// 当てはまる役割が複数あれば一番ゆるい方（大きい方、`all` があればそれ）を採る。
  /// 1つも当てはまらなければ [rows]。
  int? forRoles(Set<String> roles) {
    var matched = false;
    var widest = 0;
    for (final role in roles) {
      if (!byRole.containsKey(role)) continue;
      final limit = byRole[role];
      if (limit == null) return null; // all＝上限なし
      matched = true;
      if (limit > widest) widest = limit;
    }
    return matched ? widest : rows;
  }

  @override
  List<Object?> get props => [rows, byRole];
}
