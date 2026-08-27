import 'package:equatable/equatable.dart';

/// 1回のハンドラ呼び出しに渡す件数（`action.batchSize`）。
///
/// 区切る件数は**現場の事情**で変わる（回線の細い拠点は小さく、社内は大きく）。
/// だから上限（`maxRows`）と同じように、役割ごとに書ける形にしてある。
///
/// ```yaml
/// batchSize: 20                     # 全員 20 件ずつ
/// batchSize:                        # 役割ごと
///   default: 20
///   byRole: { branch: 5, admin: 100 }
/// ```
///
/// **当てはまる役割が複数あれば、一番小さい件数が効く（`maxRows` とは逆）。** 上限は
/// 「やっていいことの広さ」なので役割を持つほど広がるが、区切りは「1回に押し付ける量」
/// なので、安全な方に倒す（大きすぎる区切りは、待たされた末に落ちる）。
///
/// `all`（区切らない）は無い。区切らない＝進み具合も中断も無い、というのは
/// `batchSize` を書かないことで既に言える。
class BatchSize extends Equatable {
  /// 役割で決まらないときの件数。
  final int rows;

  /// 役割ごとの件数。
  final Map<String, int> byRole;

  const BatchSize({required this.rows, this.byRole = const {}});

  /// 全員に同じ件数。
  const BatchSize.of(int rows) : this(rows: rows);

  /// [roles] を持つ人に1回で渡す件数。
  ///
  /// 当てはまる役割が複数あれば**一番小さい**方。1つも当てはまらなければ [rows]。
  int forRoles(Set<String> roles) {
    int? smallest;
    for (final role in roles) {
      final size = byRole[role];
      if (size == null) continue;
      if (smallest == null || size < smallest) smallest = size;
    }
    return smallest ?? rows;
  }

  @override
  List<Object?> get props => [rows, byRole];
}
