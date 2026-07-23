import 'package:hatake_core/hatake_core.dart';
import 'package:test/test.dart';

void main() {
  final fmt = FormatterRegistry();
  final conv = ConverterRegistry();

  group('currency', () {
    test('groups thousands', () {
      expect(fmt.format('currency', 1234567), '1,234,567');
    });
    test('symbol + decimals', () {
      expect(fmt.format('currency', 1234, {'symbol': '¥', 'decimals': 2}),
          '¥1,234.00');
    });
    test('negative styles', () {
      expect(fmt.format('currency', -1234, {'negative': 'triangle'}), '△1,234');
      expect(fmt.format('currency', -1234, {'negative': 'blackTriangle'}),
          '▲1,234');
      expect(fmt.format('currency', -1234, {'negative': 'paren'}), '(1,234)');
      expect(fmt.format('currency', -1234), '-1,234');
    });
  });

  group('percent', () {
    test('default 2 decimals', () {
      expect(fmt.format('percent', 12.34), '12.34%');
    });
    test('0 decimals', () {
      expect(fmt.format('percent', 12, {'decimals': 0}), '12%');
    });
    test('ratio multiplies by 100', () {
      expect(fmt.format('percent', 0.1234, {'ratio': true, 'decimals': 2}),
          '12.34%');
    });
  });

  group('date', () {
    final d = DateTime(2026, 7, 22);
    test('patterns', () {
      expect(fmt.format('date', d), '2026/07/22');
      expect(fmt.format('date', d, {'pattern': 'yyyy-MM-dd'}), '2026-07-22');
      expect(fmt.format('date', d, {'pattern': 'yyyy年M月d日'}), '2026年7月22日');
      expect(fmt.format('date', d, {'pattern': 'yyyyMMdd'}), '20260722');
    });
    test('parses ISO string input', () {
      expect(fmt.format('date', '2026-07-22'), '2026/07/22');
    });
  });

  group('wareki', () {
    test('long / short', () {
      final d = DateTime(2026, 7, 22);
      expect(fmt.format('wareki', d), '令和8年7月22日');
      expect(fmt.format('wareki', d, {'style': 'short'}), 'R8/07/22');
    });
    test('era boundaries', () {
      expect(fmt.format('wareki', DateTime(2019, 5, 1)), '令和元年5月1日');
      expect(fmt.format('wareki', DateTime(2019, 4, 30)), '平成31年4月30日');
    });
  });

  test('postal / mask', () {
    expect(fmt.format('postal', '1234567'), '123-4567');
    expect(fmt.format('mask', '000012341234'), '********1234');
  });

  group('converters', () {
    test('toHankaku / toZenkaku', () {
      expect(conv.convert('toHankaku', '１２３ＡＢ　'), '123AB ');
      expect(conv.convert('toZenkaku', '12 '), '１２　');
    });
    test('kana', () {
      expect(conv.convert('hiraToKata', 'あいう'), 'アイウ');
      expect(conv.convert('kataToHira', 'アイウ'), 'あいう');
    });
    test('spaces', () {
      expect(conv.convert('trim', '　 x 　'), 'x');
      expect(conv.convert('collapseSpaces', 'a　　b  c'), 'a b c');
    });
    test('parseNumber (full-width + commas)', () {
      expect(conv.convert('parseNumber', '１，２３４'), 1234);
    });
    test('convertAll chains', () {
      expect(conv.convertAll(['toHankaku', 'trim'], '　ＡＢ　'), 'AB');
    });
  });

  test('postalCode validator', () {
    final v = FormValidator();
    const form = FormDefinition(sections: [
      SectionDefinition(fields: [
        FieldDefinition(
          field: 'zip',
          label: '郵便番号',
          validators: [ValidatorDefinition(type: ValidatorTypes.postalCode)],
        ),
      ])
    ]);
    expect(v.validate(form, {'zip': '123-4567'}).isValid, isTrue);
    expect(v.validate(form, {'zip': '1234567'}).isValid, isTrue);
    expect(v.validate(form, {'zip': 'abc'}).forField('zip').single.message,
        '郵便番号の形式が正しくありません');
  });
}
