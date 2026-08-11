// 一覧・帳票の CSV 出力。列 + 行 → 文字列。
//
// 「画面に出ている表をそのまま渡す」のが基本なので、既定では列の `format` を
// 通した表記で書き出す（金額は ¥1,000 のまま）。Excel で計算させたいときは
// `raw: true`。文字コード変換（Shift_JIS 等）は Framework の外＝出力先の責務。
//
// Dart / TS / Java の3版で同じ文字列になるよう実装をそろえること（conformance）。

import '../definition/column_definition.dart';
import '../format/formatter_registry.dart';

/// CSV の書き方。既定は Excel（日本語 Windows）で開くのが楽な組み合わせ。
class CsvOptions {
  /// 見出し行（列ラベル）を出すか。
  final bool header;

  /// 区切り文字。タブ区切りにしたいときは `'\t'`。
  final String delimiter;

  /// 改行。`crlf`（既定）か `lf`。
  final String newline;

  /// 先頭に BOM を付けるか（Excel の文字化け対策）。
  ///
  /// UTF-8 のときだけ効く（[wantsBom]）。Shift_JIS などに BOM は無いので、
  /// 付けると先頭のセルにゴミが3バイト入る。
  final bool bom;

  /// `format` を通さず生の値を書くか。
  final bool raw;

  /// 出力先に渡す文字コードの名前（既定 `utf-8`）。
  ///
  /// **変換はここではしない。** Framework は文字列を作るところまでで、バイト列に
  /// するのは出力先（`exportSink`）の責務。名前を運ぶことで、出力先が
  /// `hatake_encoding` などで変換できる。実務で「Shift_JIS」と言われたら
  /// ふつう `cp932`（Windows / Excel の Shift_JIS）を指す。
  final String charset;

  const CsvOptions({
    this.header = true,
    this.delimiter = ',',
    this.newline = 'crlf',
    this.bom = false,
    this.raw = false,
    this.charset = utf8Charset,
  });

  /// 既定の文字コード名。
  static const String utf8Charset = 'utf-8';

  /// DSL の `config`（`export` アクション）から読む。
  factory CsvOptions.fromConfig(Map<String, Object?> config) {
    return CsvOptions(
      header: config['header'] is bool ? config['header'] as bool : true,
      delimiter: config['delimiter']?.toString() ?? ',',
      newline: config['newline']?.toString() ?? 'crlf',
      bom: config['bom'] == true,
      raw: config['raw'] == true,
      charset: config['charset']?.toString() ?? utf8Charset,
    );
  }

  /// UTF-8 か（表記ゆれを吸収する）。
  bool get isUtf8 =>
      const {'utf-8', 'utf8', 'utf_8'}.contains(charset.toLowerCase());

  /// 実際に BOM を付けるか。宣言されていて、かつ UTF-8 のときだけ。
  bool get wantsBom => bom && isUtf8;

  String get lineBreak => newline == 'lf' ? '\n' : '\r\n';
}

/// [rows] を [columns] の順に CSV へ書き出す。
///
/// 列が無ければ空文字（出すものが無い）。値の中の区切り・引用符・改行は
/// 引用して守り、引用符は2つに重ねる（RFC 4180）。
String toCsv(
  List<ColumnDefinition> columns,
  List<Map<String, Object?>> rows, {
  CsvOptions options = const CsvOptions(),
  FormatterRegistry? formatters,
}) {
  if (columns.isEmpty) return '';
  final registry = formatters ?? FormatterRegistry();
  final buffer = StringBuffer();
  if (options.wantsBom) buffer.write('\u{FEFF}');

  void writeLine(List<String> cells) {
    for (var i = 0; i < cells.length; i++) {
      if (i > 0) buffer.write(options.delimiter);
      buffer.write(_escape(cells[i], options.delimiter));
    }
    buffer.write(options.lineBreak);
  }

  if (options.header) {
    writeLine([for (final column in columns) column.label]);
  }
  for (final row in rows) {
    writeLine([
      for (final column in columns) _cell(column, row[column.field], options, registry),
    ]);
  }
  return buffer.toString();
}

String _cell(
  ColumnDefinition column,
  Object? value,
  CsvOptions options,
  FormatterRegistry formatters,
) {
  if (!options.raw && column.format != null) {
    return formatters.format(column.format!, value, column.config);
  }
  return value?.toString() ?? '';
}

/// 引用が要るのは区切り・引用符・改行を含むときだけ。
String _escape(String value, String delimiter) {
  final needsQuotes = value.contains(delimiter) ||
      value.contains('"') ||
      value.contains('\n') ||
      value.contains('\r');
  if (!needsQuotes) return value;
  return '"${value.replaceAll('"', '""')}"';
}
