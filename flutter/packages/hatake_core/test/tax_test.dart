import 'package:hatake_core/hatake_core.dart';
import 'package:test/test.dart';

void main() {
  group('computeTax (外税 / exclusive)', () {
    test('basic 10%', () {
      expect(computeTax(1000, rate: 0.10),
          const TaxBreakdown(net: 1000, tax: 100, gross: 1100));
    });
    test('reduced 8%', () {
      expect(computeTax(1080, rate: 0.08),
          const TaxBreakdown(net: 1080, tax: 86, gross: 1166)); // 86.4 -> floor 86
    });
    test('rounding modes on .5', () {
      expect(computeTax(155, rate: 0.10, rounding: 'floor').tax, 15); // 15.5
      expect(computeTax(155, rate: 0.10, rounding: 'round').tax, 16);
      expect(computeTax(155, rate: 0.10, rounding: 'ceil').tax, 16);
    });
  });

  group('computeTax (内税 / inclusive)', () {
    test('exact', () {
      expect(computeTax(1080, rate: 0.08, included: true),
          const TaxBreakdown(net: 1000, tax: 80, gross: 1080));
    });
    test('with rounding on net', () {
      // 1000 / 1.1 = 909.09..; floor -> 909, tax = 91
      expect(computeTax(1000, rate: 0.10, included: true),
          const TaxBreakdown(net: 909, tax: 91, gross: 1000));
    });
  });
}
