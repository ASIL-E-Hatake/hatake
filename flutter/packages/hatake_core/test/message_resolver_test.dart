import 'package:hatake_core/hatake_core.dart';
import 'package:test/test.dart';

void main() {
  group('MessageResolver', () {
    test('既定は日本語（従来の固定文言と一致）', () {
      final m = MessageResolver();
      expect(m.resolve('required'), '必須項目です');
      expect(m.resolve('maxLength', {'value': 3}), '3文字以内で入力してください');
    });

    test('未知キーはキー名にフォールバック', () {
      expect(MessageResolver().resolve('nope'), 'nope');
    });

    test('ロケール上書き・切替ができる', () {
      final m = MessageResolver(
        locale: 'en',
        messages: {
          'en': {'required': 'Required', 'maxLength': 'Max {value} chars'},
        },
      );
      expect(m.resolve('required'), 'Required');
      expect(m.resolve('maxLength', {'value': 3}), 'Max 3 chars');
      // en に無いキーは ja にフォールバック
      expect(m.resolve('email'), 'メールアドレスの形式が正しくありません');
      // 同じテーブルのままロケールだけ ja に戻す
      expect(m.withLocale('ja').resolve('required'), '必須項目です');
    });
  });

  group('ValidatorRegistry の i18n', () {
    test('既定（日本語）は変わらない', () {
      final r = ValidatorRegistry();
      expect(
        r.run('', const ValidatorDefinition(type: ValidatorTypes.required)),
        '必須項目です',
      );
    });

    test('リゾルバ注入で英語メッセージになる', () {
      final r = ValidatorRegistry(
        null,
        MessageResolver(
          locale: 'en',
          messages: {
            'en': {'required': 'Required', 'maxLength': 'Max {value} chars'},
          },
        ),
      );
      expect(
        r.run('', const ValidatorDefinition(type: ValidatorTypes.required)),
        'Required',
      );
      expect(
        r.run(
          'ABCD',
          const ValidatorDefinition(
              type: ValidatorTypes.maxLength, params: {'value': 3}),
        ),
        'Max 3 chars',
      );
    });

    test('ルール個別の message 上書きはロケールより優先（従来どおり）', () {
      // message 上書きは FormValidator 側で解決されるため、ここでは
      // ValidatorDefinition.message が保持されることだけ確認する。
      const def = ValidatorDefinition(
          type: ValidatorTypes.required, message: 'カスタム');
      expect(def.message, 'カスタム');
    });
  });
}
