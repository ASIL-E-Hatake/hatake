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
