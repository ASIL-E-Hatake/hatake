import 'package:hatake_core/hatake_core.dart';
import 'package:test/test.dart';

void main() {
  test('FormNormalizer applies converter chains per field', () {
    const form = FormDefinition(sections: [
      SectionDefinition(fields: [
        FieldDefinition(
          field: 'code',
          label: 'コード',
          normalize: ['toHankaku', 'trim'],
        ),
        FieldDefinition(field: 'name', label: '名前'), // no normalize
      ])
    ]);

    final out = FormNormalizer().normalize(form, {
      'code': '　ＡＢ１２　',
      'name': '　x　',
    });

    expect(out['code'], 'AB12');
    expect(out['name'], '　x　'); // untouched (no normalize declared)
  });

  test('leaves absent fields alone', () {
    const form = FormDefinition(sections: [
      SectionDefinition(fields: [
        FieldDefinition(field: 'code', label: 'コード', normalize: ['toHankaku']),
      ])
    ]);
    final out = FormNormalizer().normalize(form, {'other': 1});
    expect(out.containsKey('code'), isFalse);
    expect(out['other'], 1);
  });
}
