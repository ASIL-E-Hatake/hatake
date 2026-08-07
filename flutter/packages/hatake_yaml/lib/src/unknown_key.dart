import 'parse_exception.dart';

/// 定義の中で見つかった知らないキー1つ。
class UnknownKey {
  /// そのキーを持つノードまでのパス（例 `page.form.sections[0].fields[2]`）。
  /// ドキュメント直下は空文字。
  final String path;

  /// 知らないキーそのもの。
  final String key;

  /// 一番近い既知キー（綴り間違いの指摘）。近いものが無ければ null。
  final String? suggestion;

  const UnknownKey({required this.path, required this.key, this.suggestion});

  /// 人にも AI にも読める1行。
  String describe() {
    final at = path.isEmpty ? 'ドキュメント直下' : path;
    final hint = suggestion == null ? '' : '（$suggestion の間違い？）';
    return '$at: 知らないキー "$key"$hint';
  }

  @override
  String toString() => describe();

  @override
  bool operator ==(Object other) =>
      other is UnknownKey &&
      other.path == path &&
      other.key == key &&
      other.suggestion == suggestion;

  @override
  int get hashCode => Object.hash(path, key, suggestion);
}

/// strict パースで知らないキーが見つかったときに投げる例外。
///
/// 1件目で止めず[keys]に全部入れる（1往復で直せるように）。
class UnknownKeysException extends DefinitionParseException {
  final List<UnknownKey> keys;

  UnknownKeysException(this.keys)
      : super(
          '知らないキーが ${keys.length} 件あります:\n'
              '${keys.map((k) => '  - ${k.describe()}').join('\n')}',
          path: keys.isEmpty ? null : keys.first.path,
        );
}

/// [key] に一番近い既知キー。大文字小文字を無視した編集距離が2以下のものだけ。
/// 同点はアルファベット順（言語をまたいで同じ答えにするため）。
String? closestKey(String key, Set<String> known) {
  final lower = key.toLowerCase();
  String? best;
  var bestDistance = 3;
  for (final candidate in known.toList()..sort()) {
    final distance = _editDistance(lower, candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/// Levenshtein 距離（2行だけ持つ素直な実装）。
int _editDistance(String a, String b) {
  if (a == b) return 0;
  if (a.isEmpty) return b.length;
  if (b.isEmpty) return a.length;
  var previous = List<int>.generate(b.length + 1, (i) => i);
  var current = List<int>.filled(b.length + 1, 0);
  for (var i = 1; i <= a.length; i++) {
    current[0] = i;
    for (var j = 1; j <= b.length; j++) {
      final cost = a.codeUnitAt(i - 1) == b.codeUnitAt(j - 1) ? 0 : 1;
      final deletion = previous[j] + 1;
      final insertion = current[j - 1] + 1;
      final substitution = previous[j - 1] + cost;
      current[j] = deletion < insertion
          ? (deletion < substitution ? deletion : substitution)
          : (insertion < substitution ? insertion : substitution);
    }
    final swap = previous;
    previous = current;
    current = swap;
  }
  return previous[b.length];
}
