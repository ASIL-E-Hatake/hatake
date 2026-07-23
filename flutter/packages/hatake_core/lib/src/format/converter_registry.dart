/// An input converter / normalizer: transforms a value (usually before
/// validation or persistence). Returns the converted value.
typedef Converter = Object? Function(Object? value, Map<String, Object?> options);

String _mapRunes(String s, int Function(int) f) {
  final buf = StringBuffer();
  for (final r in s.runes) {
    buf.writeCharCode(f(r));
  }
  return buf.toString();
}

/// Full-width ASCII (！-～) and full-width space → half-width.
String _toHankaku(String s) => _mapRunes(s, (r) {
      if (r >= 0xFF01 && r <= 0xFF5E) return r - 0xFEE0;
      if (r == 0x3000) return 0x20;
      return r;
    });

/// Half-width ASCII printable and space → full-width.
String _toZenkaku(String s) => _mapRunes(s, (r) {
      if (r >= 0x21 && r <= 0x7E) return r + 0xFEE0;
      if (r == 0x20) return 0x3000;
      return r;
    });

/// Built-in converters. Names are shared across language editions.
final Map<String, Converter> builtinConverters = {
  // 全角英数記号・全角スペース → 半角
  'toHankaku': (v, o) => v is String ? _toHankaku(v) : v,
  // 半角英数記号・スペース → 全角
  'toZenkaku': (v, o) => v is String ? _toZenkaku(v) : v,
  // ひらがな → カタカナ
  'hiraToKata': (v, o) =>
      v is String ? _mapRunes(v, (r) => r >= 0x3041 && r <= 0x3096 ? r + 0x60 : r) : v,
  // カタカナ → ひらがな
  'kataToHira': (v, o) =>
      v is String ? _mapRunes(v, (r) => r >= 0x30A1 && r <= 0x30F6 ? r - 0x60 : r) : v,
  // 前後の空白（全角含む）を除去
  'trim': (v, o) =>
      v is String ? v.replaceAll(RegExp(r'^[\s　]+|[\s　]+$'), '') : v,
  // 連続する空白（全角含む）を半角スペース1つに圧縮
  'collapseSpaces': (v, o) =>
      v is String ? v.replaceAll(RegExp(r'[\s　]+'), ' ') : v,
  // 数値変換: １，２３４ → 1234（全角→半角＋カンマ除去して数値化）
  'parseNumber': (v, o) {
    if (v is num) return v;
    if (v is! String) return v;
    final cleaned = _toHankaku(v).replaceAll(',', '').trim();
    return num.tryParse(cleaned) ?? v;
  },
};

/// Resolves converter names to implementations. Extensible via [register].
class ConverterRegistry {
  final Map<String, Converter> _converters;

  ConverterRegistry([Map<String, Converter>? custom])
      : _converters = {...builtinConverters, if (custom != null) ...custom};

  /// Applies the converter named [name]. Unknown names return the value as-is.
  Object? convert(String name, Object? value,
      [Map<String, Object?> options = const {}]) {
    final c = _converters[name];
    return c == null ? value : c(value, options);
  }

  /// Applies a chain of converters in order.
  Object? convertAll(List<String> names, Object? value) {
    var current = value;
    for (final name in names) {
      current = convert(name, current);
    }
    return current;
  }

  void register(String name, Converter converter) =>
      _converters[name] = converter;

  bool has(String name) => _converters.containsKey(name);
}
