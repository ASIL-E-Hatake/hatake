import '../domain/era.dart';

/// A display formatter: turns a value into a display string using [options].
typedef Formatter = String Function(Object? value, Map<String, Object?> options);

num? _toNum(Object? v) {
  if (v is num) return v;
  if (v is String) return num.tryParse(v.replaceAll(',', ''));
  return null;
}

DateTime? _toDate(Object? v) {
  if (v is DateTime) return v;
  if (v is String && v.isNotEmpty) return DateTime.tryParse(v);
  return null;
}

int? _intOpt(Map<String, Object?> o, String key) => (o[key] as num?)?.toInt();

String _two(int v) => v.toString().padLeft(2, '0');

/// Groups the integer part with commas and applies fixed [decimals].
String _grouped(num value, int decimals) {
  final fixed = value.toStringAsFixed(decimals);
  final parts = fixed.split('.');
  final intPart = parts[0];
  final buf = StringBuffer();
  for (var i = 0; i < intPart.length; i++) {
    if (i > 0 && (intPart.length - i) % 3 == 0) buf.write(',');
    buf.write(intPart[i]);
  }
  return parts.length > 1 ? '$buf.${parts[1]}' : buf.toString();
}

String _formatDatePattern(DateTime d, String pattern) {
  return pattern
      .replaceAll('yyyy', d.year.toString().padLeft(4, '0'))
      .replaceAll('MM', _two(d.month))
      .replaceAll('dd', _two(d.day))
      .replaceAll('M', d.month.toString())
      .replaceAll('d', d.day.toString());
}

/// Built-in formatters. Names are shared across language editions.
final Map<String, Formatter> builtinFormatters = {
  // 金額: 1,234,567 / △1,234 / ▲1,234 / (1,234) / ¥1,234
  'currency': (value, o) {
    final n = _toNum(value);
    if (n == null) return value?.toString() ?? '';
    final decimals = _intOpt(o, 'decimals') ?? 0;
    final symbol = o['symbol'] as String? ?? '';
    final negative = o['negative'] as String? ?? 'minus';
    final body = symbol + _grouped(n.abs(), decimals);
    if (n < 0) {
      return switch (negative) {
        'triangle' => '△$body',
        'blackTriangle' => '▲$body',
        'paren' => '($body)',
        _ => '-$body',
      };
    }
    return body;
  },

  // パーセント: 12.34% / 12% / 12.3400%（ratio:true なら値を100倍）
  'percent': (value, o) {
    final n = _toNum(value);
    if (n == null) return value?.toString() ?? '';
    final decimals = _intOpt(o, 'decimals') ?? 2;
    final v = o['ratio'] == true ? n * 100 : n;
    return '${_grouped(v, decimals)}%';
  },

  // 日付: pattern で yyyy/MM/dd, yyyy-MM-dd, yyyy年M月d日, yyyyMMdd など
  'date': (value, o) {
    final d = _toDate(value);
    if (d == null) return value?.toString() ?? '';
    return _formatDatePattern(d, o['pattern'] as String? ?? 'yyyy/MM/dd');
  },

  // 和暦: 令和8年7月22日 (long) / R8/07/22 (short)。元号は eraOf と共有。
  'wareki': (value, o) {
    final d = _toDate(value);
    if (d == null) return value?.toString() ?? '';
    final ed = eraOf(d);
    if (ed == null) return _formatDatePattern(d, 'yyyy/MM/dd');
    if ((o['style'] as String? ?? 'long') == 'short') {
      return '${ed.abbr}${ed.year}/${_two(d.month)}/${_two(d.day)}';
    }
    final y = ed.year == 1 ? '元' : ed.year.toString();
    return '${ed.name}$y年${d.month}月${d.day}日';
  },

  // 郵便番号: 1234567 → 123-4567
  'postal': (value, o) {
    final digits = (value?.toString() ?? '').replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.length != 7) return value?.toString() ?? '';
    return '${digits.substring(0, 3)}-${digits.substring(3)}';
  },

  // マスク: 末尾 keep 桁だけ残す → ******1234
  'mask': (value, o) {
    final s = value?.toString() ?? '';
    final keep = _intOpt(o, 'keep') ?? 4;
    final ch = o['char'] as String? ?? '*';
    if (s.length <= keep) return s;
    return ch * (s.length - keep) + s.substring(s.length - keep);
  },
};

/// Resolves format names to implementations. Extensible via [register].
class FormatterRegistry {
  final Map<String, Formatter> _formatters;

  /// アプリが足したフォーマッタの名前だけ（組み込みは除く）。
  List<String> get customKeys => [
        for (final key in _formatters.keys)
          if (!builtinFormatters.containsKey(key)) key,
      ]..sort();

  FormatterRegistry([Map<String, Formatter>? custom])
      : _formatters = {...builtinFormatters, if (custom != null) ...custom};

  /// Formats [value] with the formatter named [name]. Unknown names fall back
  /// to `toString()`.
  String format(String name, Object? value,
      [Map<String, Object?> options = const {}]) {
    final f = _formatters[name];
    return f == null ? (value?.toString() ?? '') : f(value, options);
  }

  void register(String name, Formatter formatter) =>
      _formatters[name] = formatter;

  bool has(String name) => _formatters.containsKey(name);
}
