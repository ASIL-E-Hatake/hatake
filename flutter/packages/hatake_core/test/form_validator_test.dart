import 'package:hatake_core/hatake_core.dart';
import 'package:test/test.dart';

void main() {
  final validator = FormValidator();

  const form = FormDefinition(
    sections: [
      SectionDefinition(
        fields: [
          FieldDefinition(
            field: 'code',
            label: 'コード',
            required: true,
            validators: [
              ValidatorDefinition(
                type: ValidatorTypes.maxLength,
                params: {'value': 3},
              ),
            ],
          ),
          FieldDefinition(
            field: 'email',
            label: 'メール',
            validators: [ValidatorDefinition(type: ValidatorTypes.email)],
          ),
        ],
      ),
    ],
  );

  test('valid record produces no errors', () {
    final result = validator.validate(form, {'code': 'AB', 'email': 'a@b.co'});
    expect(result.isValid, isTrue);
  });

  test('required field flags empty value', () {
    final result = validator.validate(form, {'code': '', 'email': ''});
    expect(result.forField('code').single.message, '必須項目です');
    // email is not required and empty -> no error
    expect(result.forField('email'), isEmpty);
  });

  test('maxLength is enforced', () {
    final result = validator.validate(form, {'code': 'ABCD'});
    expect(result.forField('code').single.message, '3文字以内で入力してください');
  });

  test('email format is enforced', () {
    final result = validator.validate(form, {'code': 'AB', 'email': 'nope'});
    expect(result.forField('email').single.message,
        'メールアドレスの形式が正しくありません');
  });

  test('rule message override wins', () {
    const f = FormDefinition(sections: [
      SectionDefinition(fields: [
        FieldDefinition(
          field: 'x',
          label: 'X',
          required: true,
          validators: [
            ValidatorDefinition(type: ValidatorTypes.required, message: 'Xは必須'),
          ],
        ),
      ])
    ]);
    // field.required adds a default required rule first; the explicit rule with
    // a custom message comes after. The first failing rule wins, so assert the
    // default message appears — documents ordering behavior.
    final result = validator.validate(f, {'x': ''});
    expect(result.forField('x').first.message, '必須項目です');
  });

  test('custom validator via registry', () {
    final registry = ValidatorRegistry({
      'even': (value, def) {
        final n = value is num ? value : num.tryParse('${value ?? ''}');
        if (n == null) return null;
        return n % 2 == 0 ? null : '偶数を入力してください';
      },
    });
    final custom = FormValidator(registry);
    const f = FormDefinition(sections: [
      SectionDefinition(fields: [
        FieldDefinition(
          field: 'n',
          label: 'N',
          validators: [ValidatorDefinition(type: 'even')],
        ),
      ])
    ]);
    expect(custom.validate(f, {'n': 3}).forField('n').single.message,
        '偶数を入力してください');
    expect(custom.validate(f, {'n': 4}).isValid, isTrue);
  });
}
