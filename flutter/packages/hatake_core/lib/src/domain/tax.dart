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

/// 請求明細の1行（金額 [amount] と 税率 [rate]）。
class InvoiceLine {
  /// 金額（[TaxBreakdown] と同じく `included` の解釈に従う）。
  final num amount;

  /// 税率（分数。10% = `0.1`、軽減 8% = `0.08`）。
  final num rate;

  const InvoiceLine({required this.amount, required this.rate});
}

/// 税率ごとの小計（[computeInvoice] の内訳の1件）。
class TaxRateSubtotal extends Equatable {
  /// 税率。
  final num rate;

  /// 税抜合計。
  final int net;

  /// 税額合計。
  final int tax;

  /// 税込合計。
  final int gross;

  const TaxRateSubtotal({
    required this.rate,
    required this.net,
    required this.tax,
    required this.gross,
  });

  @override
  List<Object?> get props => [rate, net, tax, gross];

  @override
  String toString() =>
      'TaxRateSubtotal(rate: $rate, net: $net, tax: $tax, gross: $gross)';
}

/// 税率別合計（適格請求書向け）。[byRate] は税率の昇順、[total] は全体合計。
class TaxInvoice extends Equatable {
  /// 税率ごとの小計（税率の昇順）。
  final List<TaxRateSubtotal> byRate;

  /// 全体合計。
  final TaxBreakdown total;

  const TaxInvoice({required this.byRate, required this.total});

  @override
  List<Object?> get props => [byRate, total];

  @override
  String toString() => 'TaxInvoice(byRate: $byRate, total: $total)';
}

/// 適格請求書（インボイス）向けに、明細を税率ごとに合計して内訳を返す。
///
/// **税率ごとに一度だけ**端数処理する（明細ごとに丸めない）のが適格請求書の
/// ルール。同一税率の金額を先に合算してから [computeTax] を1回適用する。
///
/// - [lines] … 明細（各行 [InvoiceLine]）。
/// - [included] … 金額が税込かどうか（全行に適用）。
/// - [rounding] … 端数処理。`floor`(既定) / `round` / `ceil`。
TaxInvoice computeInvoice(
  List<InvoiceLine> lines, {
  bool included = false,
  String rounding = 'floor',
}) {
  final sums = <num, num>{};
  for (final l in lines) {
    sums[l.rate] = (sums[l.rate] ?? 0) + l.amount;
  }
  final rates = sums.keys.toList()..sort((a, b) => a.compareTo(b));
  final byRate = <TaxRateSubtotal>[];
  var totalNet = 0, totalTax = 0, totalGross = 0;
  for (final rate in rates) {
    final b = computeTax(sums[rate]!,
        rate: rate, included: included, rounding: rounding);
    byRate.add(TaxRateSubtotal(
        rate: rate, net: b.net, tax: b.tax, gross: b.gross));
    totalNet += b.net;
    totalTax += b.tax;
    totalGross += b.gross;
  }
  return TaxInvoice(
    byRate: byRate,
    total: TaxBreakdown(net: totalNet, tax: totalTax, gross: totalGross),
  );
}
