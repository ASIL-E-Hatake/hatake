// **アプリ全体の語彙**（`app.vocabularies`）を、書いてある所へ展開する。
//
// 業務のコード表（`shipped` → 出荷済）は、一覧・検索・詳細・帳票と**同じものが
// 何度も出てきます**。見本2本を数えたら、同じ並びを 3回・2回・3回 書いていました。
// 片方だけ直すと画面ごとに違う字が出て、しかも**直すまで誰も気づきません**。
//
//   app:
//     vocabularies:
//       - name: orderStatus
//         options:
//           - { value: shipped, label: 出荷済 }
//     pages:
//       - table:
//           columns:
//             - { field: status, label: 受注状態, optionsOf: orderStatus }
//
// **解決は読み込み時**です。生の定義を書き換えてから解析器に渡すので、
// Renderer も CSV も紙も、この仕組みを知らないまま正しく動きます。
//
// TypeScript / Java 版と同じ判断をすること（3版で同じ定義から同じ画面が出る）:
//   ・その場に書いた `options` が勝つ
//   ・引けない名前は**そのまま残す**（空の並びを置くと、検証にも出なくなる）
//   ・同じ名前が2回あれば、**先に書いたほう**が残る

/// `app.vocabularies` を名前で引ける形にする。
Map<String, List<Object?>> vocabulariesOf(Map<String, Object?> document) {
  final app = document['app'];
  final from = app is Map<String, Object?> ? app : document;
  final raw = from['vocabularies'];
  final found = <String, List<Object?>>{};
  if (raw is! List) return found;
  for (final one in raw) {
    if (one is! Map) continue;
    final name = one['name'];
    if (name is! String || found.containsKey(name)) continue;
    final options = one['options'];
    found[name] = options is List ? List<Object?>.from(options) : const [];
  }
  return found;
}

/// `optionsOf` を実体の並びに置き換えた定義を返す（**元は変えない**）。
Map<String, Object?> expandVocabularies(Map<String, Object?> document) {
  final found = vocabulariesOf(document);
  if (found.isEmpty) return document;
  return _walk(document, found) as Map<String, Object?>;
}

Object? _walk(Object? node, Map<String, List<Object?>> found) {
  if (node is List) return [for (final one in node) _walk(one, found)];
  if (node is! Map) return node;

  final out = <String, Object?>{};
  node.forEach((key, value) => out['$key'] = _walk(value, found));

  final name = out['optionsOf'];
  if (name is! String) return out;
  // その場に書いた並びが勝つ（両方書いてあるのは書き間違い）。
  if (out['options'] is List) return out;
  final options = found[name];
  if (options == null) return out;
  out['options'] = options;
  return out;
}
