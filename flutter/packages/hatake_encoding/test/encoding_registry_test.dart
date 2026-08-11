import 'dart:convert';

import 'package:hatake_encoding/hatake_encoding.dart';
import 'package:test/test.dart';

void main() {
  final encodings = EncodingRegistry();

  test('宣言された名前をそのまま渡せる（これが出力先の入口）', () {
    expect(encodings.encode('cp932', 'あ'), [0x82, 0xA0]);
    expect(encodings.encode('euc_jp', 'あ'), [0xA4, 0xA2]);
    // 既定は UTF-8。何も宣言しなければこれが来る。
    expect(encodings.encode('utf-8', 'あ'), utf8.encode('あ'));
  });

  test('連携仕様書の表記ゆれを吸収する', () {
    // 「Windows-31J」「MS932」「SJIS」…全部同じものを指して来る。
    for (final name in ['CP932', 'windows-31j', 'MS932', 'Windows 31J']) {
      expect(encodings.encode(name, 'あ'), [0x82, 0xA0], reason: name);
    }
    for (final name in ['Shift_JIS', 'shift-jis', 'SJIS']) {
      expect(encodings.encode(name, 'あ'), [0x82, 0xA0], reason: name);
    }
    for (final name in ['EUC-JP', 'eucjp']) {
      expect(encodings.encode(name, 'あ'), [0xA4, 0xA2], reason: name);
    }
    // ただし別名で挙動は変えない（shift_jis は拡張文字を弾く）。
    expect(() => encodings.encode('SJIS', '①'),
        throwsA(isA<UnmappableCharacterException>()));
    expect(encodings.encode('MS932', '①'), [0x87, 0x40]);
  });

  test('知らない名前は黙って UTF-8 にしない', () {
    // 黙って UTF-8 で書くと、受け側で全部化ける。落として気づかせる。
    expect(
      () => encodings.encode('iso-2022-jp', 'あ'),
      throwsA(isA<ArgumentError>().having(
        (e) => e.message.toString(),
        'message',
        allOf(contains('知らない文字コード'), contains('cp932')),
      )),
    );
    expect(encodings.knows('iso-2022-jp'), isFalse);
    expect(encodings.knows('utf8'), isTrue);
  });

  test('独自の文字コードを登録できる（本体を触らずに）', () {
    final custom = EncodingRegistry({'x-legacy': JapaneseCodec.shiftJis});
    expect(custom.encode('x-legacy', 'あ'), [0x82, 0xA0]);
    expect(custom.knows('x-legacy'), isTrue);
    // 既定の分は消えない。
    expect(custom.knows('cp932'), isTrue);
  });

  test('置き換え文字は明示したときだけ効く', () {
    expect(() => encodings.encode('shift_jis', '髙島屋'),
        throwsA(isA<UnmappableCharacterException>()));
    expect(
      encodings.encode('shift_jis', '髙島屋', replacement: '?'),
      encodings.encode('shift_jis', '?島屋'),
    );
  });
}
