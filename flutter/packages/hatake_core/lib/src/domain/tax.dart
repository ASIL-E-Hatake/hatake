import 'package:equatable/equatable.dart';

/// 税抜 (net) / 税額 (tax) / 税込 (gross) の内訳。すべて整数（円）。
class TaxBreakdown extends Equatable {
  /// 税抜金額。
  final int net;

  /// 税額。
  final int tax;

  /// 税込金額。
  final int gross;

  const TaxBreakdown({required this.net, required this.tax, required this.gross});

  @override
  List<Object?> get props => [net, tax, gross];

  @override
  String toString() => 'TaxBreakdown(net: $net, tax: $tax, gross: $gross)';
}

int _applyRounding(double value, String mode) {
  // 浮動小数の誤差（例: 1080/1.08 = 999.9999…）を消すため 1e-6 グリッドに
  // スナップしてから丸める。3言語で同じ実装にすること（conformance のため）。
  final v = (value * 1000000).round() / 1000000;
  return switch (mode) {
    'ceil' => v.ceil(),
    'round' => v.round(), // 四捨五入（.5 は切り上げ）
    _ => v.floor(), // 'floor'（切り捨て）が既定
  };
}

/// 消費税を計算して内訳を返す。
///
/// - [amount] … `included=false` なら税抜、`true` なら税込として扱う。
/// - [rate] … 税率（分数。10% = `0.1`、軽減 8% = `0.08`）。
/// - [included] … [amount] が税込かどうか。
/// - [rounding] … 端数処理。`floor`(切り捨て・既定) / `round`(四捨五入) / `ceil`(切り上げ)。
///   事業者ごとに異なるのでパラメータで指定する（ハードコードしない）。
///
/// 税込指定のときは [rounding] を税抜額に適用し、税額 = 税込 − 税抜 とする。
TaxBreakdown computeTax(
  num amount, {
  required num rate,
  bool included = false,
  String rounding = 'floor',
}) {
  final a = amount.toDouble();
  final r = rate.toDouble();
  if (included) {
    final gross = a.round();
    final net = _applyRounding(a / (1 + r), rounding);
    return TaxBreakdown(net: net, tax: gross - net, gross: gross);
  }
  final net = a.round();
  final tax = _applyRounding(a * r, rounding);
  return TaxBreakdown(net: net, tax: tax, gross: net + tax);
}
