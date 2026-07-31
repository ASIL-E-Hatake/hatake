import 'package:hatake_core/hatake_core.dart';
import 'package:test/test.dart';

void main() {
  group('fiscal (startMonth=4)', () {
    test('year', () {
      expect(fiscalYear('2026-04-01'), 2026);
      expect(fiscalYear('2026-03-31'), 2025);
      expect(fiscalYear('2026-03-31', startMonth: 1), 2026); // 暦年始まり
    });
    test('quarter', () {
      expect(fiscalQuarter('2026-04-01'), 1);
      expect(fiscalQuarter('2026-07-01'), 2);
      expect(fiscalQuarter('2026-12-31'), 3);
      expect(fiscalQuarter('2027-01-01'), 4);
    });
    test('half', () {
      expect(fiscalHalf('2026-04-01'), 1);
      expect(fiscalHalf('2026-10-01'), 2);
    });
  });

  group('age / tenure', () {
    test('ageAt', () {
      expect(ageAt('1990-01-01', '2026-01-01'), 36);
      expect(ageAt('1990-06-15', '2026-06-14'), 35); // 誕生日未達
    });
    test('tenure years/months', () {
      expect(tenure('2020-04-01', '2026-07-15'),
          const Tenure(years: 6, months: 3));
      expect(tenure('2020-04-20', '2026-07-15'),
          const Tenure(years: 6, months: 2)); // 日未達で1ヶ月引く
    });
  });

  group('era (元号算出)', () {
    test('境界日で切り替わる', () {
      expect(eraOf('2019-05-01'), const EraDate(name: '令和', abbr: 'R', year: 1));
      expect(eraOf('2019-04-30'),
          const EraDate(name: '平成', abbr: 'H', year: 31)); // 改元前日
      expect(eraOf('2026-07-31'), const EraDate(name: '令和', abbr: 'R', year: 8));
    });
    test('明治より前は null', () {
      expect(eraOf('1868-10-22'), isNull);
    });
    test('DateTime も受け取れる', () {
      expect(eraOf(DateTime(1989, 1, 8)),
          const EraDate(name: '平成', abbr: 'H', year: 1));
    });
  });

  group('invoice (税率別合計)', () {
    test('税率ごとに合計してから丸める（明細ごとではない）', () {
      // 105×3 を先に合算(315)して 8% → floor(25.2)=25。明細ごとなら floor(8.4)×3=24。
      final inv = computeInvoice(const [
        InvoiceLine(amount: 105, rate: 0.08),
        InvoiceLine(amount: 105, rate: 0.08),
        InvoiceLine(amount: 105, rate: 0.08),
      ]);
      expect(inv.byRate.single,
          const TaxRateSubtotal(rate: 0.08, net: 315, tax: 25, gross: 340));
      expect(inv.total, const TaxBreakdown(net: 315, tax: 25, gross: 340));
    });
    test('複数税率は昇順で並ぶ', () {
      final inv = computeInvoice(const [
        InvoiceLine(amount: 1000, rate: 0.10),
        InvoiceLine(amount: 1000, rate: 0.08),
        InvoiceLine(amount: 2000, rate: 0.10),
      ]);
      expect(inv.byRate.map((r) => r.rate).toList(), [0.08, 0.10]);
      expect(inv.total, const TaxBreakdown(net: 4000, tax: 380, gross: 4380));
    });
  });

  group('business day (2024-01-01 is Monday)', () {
    test('isBusinessDay', () {
      expect(isBusinessDay('2024-01-05'), isTrue); // 金
      expect(isBusinessDay('2024-01-06'), isFalse); // 土
      expect(isBusinessDay('2024-01-08'), isTrue); // 月
      expect(isBusinessDay('2024-01-08', holidays: {'2024-01-08'}), isFalse);
    });
    test('next / prev skip weekends and holidays', () {
      expect(nextBusinessDay('2024-01-05'), '2024-01-08'); // 金→(土日)→月
      expect(nextBusinessDay('2024-01-05', holidays: {'2024-01-08'}),
          '2024-01-09'); // →祝→火
      expect(prevBusinessDay('2024-01-08'), '2024-01-05'); // 月→(日土)→金
    });
  });
}
