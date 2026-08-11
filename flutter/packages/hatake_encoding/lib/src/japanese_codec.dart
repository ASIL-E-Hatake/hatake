import 'dart:convert';
import 'dart:typed_data';

import 'tables/cp932.g.dart' as cp932_table;
import 'tables/euc_jp.g.dart' as euc_jp_table;
import 'tables/shift_jis.g.dart' as shift_jis_table;

/// A character the target charset has no byte sequence for.
///
/// Thrown rather than replaced by default: a business system that receives `?`
/// where a customer name should be has silently lost data, and nobody notices
/// until the customer complains. Pass a `replacement` when you would rather
/// substitute (and say so in the interface spec).
class UnmappableCharacterException implements Exception {
  /// Charset that could not take it.
  final String charset;

  /// The character itself.
  final String character;

  /// Its position in the source text (in code points).
  final int offset;

  const UnmappableCharacterException({
    required this.charset,
    required this.character,
    required this.offset,
  });

  @override
  String toString() =>
      'UnmappableCharacterException: $charset に "$character" はありません'
      '（${offset + 1} 文字目）';
}

/// A byte-per-character-table codec for the Japanese charsets a business system
/// still has to produce.
///
/// The tables are generated from Python's own codecs (`tool/generate_tables.py`),
/// so this package has no runtime dependency and the bytes have a traceable
/// origin. Everything is looked up in a table, which is why one implementation
/// covers all three charsets.
class JapaneseCodec {
  /// Name used in a definition (`config.charset`).
  final String name;

  final String _units;
  final String _bytes;
  final String _aliases;

  JapaneseCodec._(this.name, this._units, this._bytes, this._aliases);

  /// **Windows / Excel の Shift_JIS**（別名 windows-31j / MS932）。
  ///
  /// 実務で「Shift_JIS で下さい」と言われたらほぼこれ。`①` `㈱` `髙`（IBM 拡張）や
  /// 全角チルダ `～`(U+FF5E) が通るのはこちらだけ。
  ///
  /// IBM 拡張の文字は**2通りのバイト列**を持つ（NEC選定 IBM 領域 0xFA〜0xFC と
  /// IBM 領域 0xED〜0xEE）。書くときは Windows / Excel と同じ前者を使い、読むときは
  /// 両方受ける（他所で作られたデータは後者のことがある）。
  static final JapaneseCodec cp932 = JapaneseCodec._(
    'cp932',
    cp932_table.cp932Units,
    cp932_table.cp932Bytes,
    cp932_table.cp932Aliases,
  );

  /// **JIS X 0208 の Shift_JIS**（厳密）。
  ///
  /// [cp932] より 2,331 文字少ない。「拡張文字が来たら弾きたい」＝受け側が
  /// 汎用機などで JIS X 0208 しか受けないときに選ぶ。
  static final JapaneseCodec shiftJis = JapaneseCodec._(
    'shift_jis',
    shift_jis_table.shiftJisUnits,
    shift_jis_table.shiftJisBytes,
    shift_jis_table.shiftJisAliases,
  );

  /// EUC-JP（JIS X 0208）。UNIX 系の連携で残っている。
  static final JapaneseCodec eucJp = JapaneseCodec._(
    'euc_jp',
    euc_jp_table.eucJpUnits,
    euc_jp_table.eucJpBytes,
    euc_jp_table.eucJpAliases,
  );

  /// 同梱の全部。
  static List<JapaneseCodec> get all => [cp932, shiftJis, eucJp];

  /// コードポイント → バイト列（1バイトなら値そのまま、2バイトなら上位<<8|下位）。
  late final Map<int, int> _toBytes = _buildToBytes();

  /// その逆＋「読めるが書かない」別バイト列。
  late final Map<int, int> _toUnits = {
    for (final entry in _toBytes.entries) entry.value: entry.key,
    ..._aliasTable(),
  };

  Map<int, int> _aliasTable() {
    final raw = base64Decode(_aliases);
    return {
      for (var i = 0; i + 3 < raw.length; i += 4)
        (raw[i] << 8) | raw[i + 1]: (raw[i + 2] << 8) | raw[i + 3],
    };
  }

  Map<int, int> _buildToBytes() {
    final units = base64Decode(_units);
    final bytes = base64Decode(_bytes);
    final table = <int, int>{};
    for (var i = 0; i + 1 < units.length; i += 2) {
      table[(units[i] << 8) | units[i + 1]] = (bytes[i] << 8) | bytes[i + 1];
    }
    return table;
  }

  /// この文字コードで表せる文字数（生成表の大きさ）。
  int get characterCount => _toBytes.length;

  /// [character] を表せるか。
  bool canEncode(String character) =>
      character.runes.every(_toBytes.containsKey);

  /// [text] をこの文字コードのバイト列にする。
  ///
  /// 表に無い文字が来たら [UnmappableCharacterException]。[replacement] を渡すと
  /// 代わりにその文字（表にあるもの。ふつうは `?`）に置き換える。
  Uint8List encode(String text, {String? replacement}) {
    final out = BytesBuilder(copy: false);
    var offset = 0;
    for (final rune in text.runes) {
      var value = _toBytes[rune];
      if (value == null) {
        final character = String.fromCharCode(rune);
        if (replacement == null) {
          throw UnmappableCharacterException(
            charset: name,
            character: character,
            offset: offset,
          );
        }
        value = _toBytes[replacement.runes.first];
        if (value == null) {
          throw UnmappableCharacterException(
            charset: name,
            character: replacement,
            offset: offset,
          );
        }
      }
      if (value <= 0xFF) {
        out.addByte(value);
      } else {
        out.addByte(value >> 8);
        out.addByte(value & 0xFF);
      }
      offset++;
    }
    return out.takeBytes();
  }

  /// バイト列を文字列に戻す。
  ///
  /// 1バイトで引けるならそれ、引けなければ2バイトで引く。この順で曖昧にならないのは、
  /// 表から C1 制御（U+0080..U+009F）を外してあるから＝1バイトとして引ける範囲と、
  /// 2バイト文字の先頭バイトの範囲が重ならない（`tool/generate_tables.py` 参照）。
  /// 途中で切れたファイルや別の文字コードのデータは [FormatException] になる。
  String decode(List<int> bytes) {
    final units = <int>[];
    for (var i = 0; i < bytes.length; i++) {
      final single = _toUnits[bytes[i]];
      if (single != null) {
        units.add(single);
        continue;
      }
      if (i + 1 < bytes.length) {
        final pair = _toUnits[(bytes[i] << 8) | bytes[i + 1]];
        if (pair != null) {
          units.add(pair);
          i++;
          continue;
        }
      }
      throw FormatException(
        '$name として読めないバイトです: 0x${bytes[i].toRadixString(16)}',
        bytes,
        i,
      );
    }
    return String.fromCharCodes(units);
  }
}
