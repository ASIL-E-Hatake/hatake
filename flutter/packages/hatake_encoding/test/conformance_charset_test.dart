import 'dart:convert';
import 'dart:io';

import 'package:hatake_encoding/hatake_encoding.dart';
import 'package:test/test.dart';

/// 共通の期待値（spec/conformance/charset.json）。Java 版も同じファイルを食う。
/// 出自は Python 標準ライブラリの codec なので、これに一致すれば「うちの表が
/// おかしい」ではなく「3者が同じ」と言える。
final _fixture = jsonDecode(
  File('../../../spec/conformance/charset.json').readAsStringSync(),
) as Map<String, Object?>;

JapaneseCodec _codecOf(String name) => switch (name) {
      'cp932' => JapaneseCodec.cp932,
      'shift_jis' => JapaneseCodec.shiftJis,
      'euc_jp' => JapaneseCodec.eucJp,
      _ => throw ArgumentError(name),
    };

void main() {
  group('conformance: charset', () {
    final counts = _fixture['counts'] as Map<String, Object?>;
    for (final entry in counts.entries) {
      test('${entry.key}: 表の大きさが期待どおり', () {
        // 生成が中途半端に終わっていたら、まずここで落ちる。
        expect(_codecOf(entry.key).characterCount, entry.value);
      });
    }

    for (final raw in _fixture['cases'] as List<Object?>) {
      final c = raw as Map<String, Object?>;
      final charset = c['charset'] as String;
      final text = c['text'] as String;
      final codec = _codecOf(charset);

      if (c.containsKey('unmappable')) {
        test('$charset: ${_label(text)} は変換できない', () {
          expect(
            () => codec.encode(text),
            throwsA(isA<UnmappableCharacterException>().having(
              (e) => e.character,
              'character',
              c['unmappable'],
            )),
          );
          expect(codec.canEncode(text), isFalse);
          // 置き換えを明示したときだけ通す。
          expect(codec.encode(text, replacement: '?'), isNotEmpty);
        });
        continue;
      }

      final expected = (c['bytes'] as List<Object?>).cast<int>();
      test('$charset: ${_label(text)}', () {
        expect(codec.encode(text), expected);
        expect(codec.canEncode(text), isTrue);
        // 往復できること（読む側も同じ表で成り立つ）。
        expect(codec.decode(expected), text);
      });
    }
  });

  group('文字コードの取り違え', () {
    // 実務で一番効く区別。ここが同じ挙動になっていたら片方が嘘。
    test('cp932 は通るが shift_jis は弾く文字がある', () {
      for (final character in ['①', '㈱', '髙', '～']) {
        expect(JapaneseCodec.cp932.canEncode(character), isTrue, reason: character);
        expect(JapaneseCodec.shiftJis.canEncode(character), isFalse,
            reason: character);
      }
    });

    test('同じ文字でも文字コードが違えばバイト列が違う', () {
      expect(JapaneseCodec.cp932.encode('あ'), [0x82, 0xA0]);
      expect(JapaneseCodec.eucJp.encode('あ'), [0xA4, 0xA2]);
    });

    test('cp932 は shift_jis を包む（2,331 文字多い）', () {
      expect(
        JapaneseCodec.cp932.characterCount -
            JapaneseCodec.shiftJis.characterCount,
        2331,
      );
      // 包む＝shift_jis で書ける文字は cp932 でも同じバイト列になる。
      for (final character in ['あ', 'ア', '漢', 'ｶ', 'A', '円']) {
        expect(
          JapaneseCodec.cp932.encode(character),
          JapaneseCodec.shiftJis.encode(character),
          reason: character,
        );
      }
    });
  });

  group('IBM 拡張の2通りのバイト列', () {
    // 同じ文字に2つのバイト列がある。書くのは Windows / Excel と同じ方（NEC選定
    // IBM 領域）。読むのは両方（他所で作られたデータは IBM 領域のことがある）。
    test('書くのは Windows と同じバイト列', () {
      expect(JapaneseCodec.cp932.encode('髙'), [0xFB, 0xFC]);
    });

    test('読むのは両方受ける', () {
      expect(JapaneseCodec.cp932.decode([0xFB, 0xFC]), '髙');
      expect(JapaneseCodec.cp932.decode([0xEE, 0xE0]), '髙');
    });

    test('別バイト列は cp932 だけの話（JIS X 0208 側には無い）', () {
      expect(() => JapaneseCodec.shiftJis.decode([0xEE, 0xE0]),
          throwsFormatException);
    });
  });

  group('decode', () {
    test('読めないバイトは黙って捨てずに落とす', () {
      // 0x80 は cp932 に無い（未定義）。化けた文字を1つ混ぜて返すより、言う。
      expect(() => JapaneseCodec.cp932.decode([0x80]), throwsFormatException);
    });

    test('半角カナは1バイトのまま往復する', () {
      final bytes = JapaneseCodec.cp932.encode('ｶﾀｶﾅ');
      expect(bytes.length, 4);
      expect(JapaneseCodec.cp932.decode(bytes), 'ｶﾀｶﾅ');
    });
  });
}

String _label(String text) =>
    text.replaceAll('\r', r'\r').replaceAll('\n', r'\n');
