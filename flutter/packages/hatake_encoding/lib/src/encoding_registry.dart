import 'dart:convert';
import 'dart:typed_data';

import 'japanese_codec.dart';

/// Resolves a charset *name* — the one a definition declared in
/// `config.charset` — to the bytes to write.
///
/// This is the piece an export sink needs: the framework says "this document is
/// meant to be cp932", the sink asks this for the bytes. Open by design, like
/// every other registry here: an integration that needs a charset we do not ship
/// registers its own without touching the framework.
class EncodingRegistry {
  final Map<String, Uint8List Function(String, String?)> _encoders;

  EncodingRegistry([Map<String, JapaneseCodec> custom = const {}])
      : _encoders = {
          for (final name in utf8Names) name: _utf8Encoder,
          for (final codec in JapaneseCodec.all)
            for (final name in _namesOf(codec)) name: _encoderOf(codec),
          for (final entry in custom.entries)
            _normalize(entry.key): _encoderOf(entry.value),
        };

  /// UTF-8 として扱う名前（既定。何も宣言しなければこれ）。
  static const Set<String> utf8Names = {'utf-8', 'utf8', 'utf_8'};

  /// 連携仕様書に出てくる別名。**同じ表を指す**（名前で挙動を変えたりはしない）。
  static const Map<String, List<String>> aliases = {
    'cp932': ['cp932', 'windows-31j', 'windows31j', 'ms932', 'msshiftjis'],
    'shift_jis': ['shift_jis', 'shift-jis', 'shiftjis', 'sjis', 'x-sjis'],
    'euc_jp': ['euc_jp', 'euc-jp', 'eucjp'],
  };

  static Iterable<String> _namesOf(JapaneseCodec codec) =>
      aliases[codec.name] ?? [codec.name];

  /// 大文字小文字・区切り（`-` / `_`）の違いは無視する（仕様書の表記はばらばら）。
  static String _normalize(String name) =>
      name.toLowerCase().replaceAll(RegExp(r'[\s_-]'), '');

  static Uint8List _utf8Encoder(String text, String? replacement) =>
      Uint8List.fromList(utf8.encode(text));

  static Uint8List Function(String, String?) _encoderOf(JapaneseCodec codec) =>
      (text, replacement) => codec.encode(text, replacement: replacement);

  Uint8List Function(String, String?)? _lookup(String name) {
    final normalized = _normalize(name);
    for (final entry in _encoders.entries) {
      if (_normalize(entry.key) == normalized) return entry.value;
    }
    return null;
  }

  /// この名前を扱えるか。
  bool knows(String charset) => _lookup(charset) != null;

  /// 扱える名前（別名を含む）。エラーメッセージに出す用。
  List<String> get known => _encoders.keys.toList()..sort();

  /// [text] を [charset] のバイト列にする。
  ///
  /// 知らない名前は例外にする（黙って UTF-8 で書くと、受け側で全部化ける）。
  /// 表に無い文字も既定では例外（[JapaneseCodec.encode] 参照）。
  Uint8List encode(String charset, String text, {String? replacement}) {
    final encoder = _lookup(charset);
    if (encoder == null) {
      throw ArgumentError.value(
        charset,
        'charset',
        '知らない文字コードです。扱えるのは ${known.join(" / ")}'
            '（EncodingRegistry に自分で登録もできます）',
      );
    }
    return encoder(text, replacement);
  }
}
