import 'package:hatake_core/hatake_core.dart';

import '../runtime/repository_registry.dart';

/// 定義から「それらしい行」を作る。**本番では使わない**（値は嘘なので）。
///
/// 貼られた定義を見せるだけの所（プレイグラウンド）と、画面の試験（`hatake_test`）で
/// 要るもの。どちらも「バックエンドを先に書け」とは言えない＝**定義そのものから**
/// 行を作る。項目名から型を推し量って値を作るので、値が正しいことは保証しない
/// （目的は、値が合っていることではなく**画面の形が見えること**）。
///
/// 本物のアプリは自分のバックエンドに対して [Repository] を実装する。
///
/// 元はデモの中（`playground_data.dart`）に埋まっていた。試験を書く人が同じものを
/// 書き直すことになるので、枠組み側に出した。

/// **定義が名指しした Repository すべて**が、作った行を返す登録を組む。
///
/// キーは定義に書いてあるまま拾う（どこの `repository:` でも）ので、貼られた定義が
/// 「登録が無い」で落ちずに描ける。
RepositoryRegistry sampleRepositories(Map<String, Object?> document) {
  final names = <String>{};
  final keys = <String>{};
  _walk(document, names, keys);
  final repository = _SampleRepository(names.toList());
  return RepositoryRegistry({
    for (final key in keys.isEmpty ? {'repository'} : keys) key: repository,
    // 貼られた定義が書き忘れていても、プレビューだけは出せるように。
    'repository': repository,
  });
}

/// Collects the field names and repository keys the document mentions.
void _walk(Object? node, Set<String> names, Set<String> keys) {
  if (node is Map) {
    for (final entry in node.entries) {
      final key = entry.key.toString();
      final value = entry.value;
      if (value is String) {
        // `field` / `labelField` / `valueField` / `parentKey` はどれも項目名。
        if (key == 'field' ||
            key == 'labelField' ||
            key == 'valueField' ||
            key == 'parentKey' ||
            key == 'key') {
          names.add(value);
        }
        if (key == 'repository') keys.add(value);
      }
      _walk(value, names, keys);
    }
    return;
  }
  if (node is List) {
    for (final item in node) {
      _walk(item, names, keys);
    }
  }
}

/// 項目名の一覧から、[count] 件の行を作る（`id` は 1 から）。
///
/// 画面の試験で「行が在る一覧」を出したいときの手っ取り早い入口。値は嘘なので、
/// **値を確かめる試験には使わない**（そのときは行を自分で書く）。
List<DataRecord> sampleRows(Iterable<String> fieldNames, {int count = 12}) => [
      for (var i = 1; i <= count; i++)
        {
          'id': i,
          for (final name in fieldNames) name: _sampleValue(name, i),
        },
    ];

/// 項目名から「それらしい値」を作る。型は定義側にあるが、ここは名前だけで
/// 十分（目的は、値が正しいことではなく画面の形が見えること）。
Object? _sampleValue(String name, int index) {
  final lower = name.toLowerCase();
  if (name == 'id') return index;
  if (lower.contains('date') || lower.contains('日')) {
    return '2026-0${(index % 9) + 1}-1${index % 9}';
  }
  if (lower.contains('amount') ||
      lower.contains('price') ||
      lower.contains('qty') ||
      lower.contains('count') ||
      lower.contains('金額') ||
      lower.contains('数量')) {
    return index * 12000;
  }
  if (lower.contains('flag') ||
      lower.startsWith('is') ||
      lower.contains('済')) {
    return index.isEven;
  }
  if (lower.contains('code') || lower.contains('no')) {
    return '${name.toUpperCase().substring(0, 1)}-${1000 + index}';
  }
  return '$name $index';
}

/// 定義が名指しした Repository の代わり。どの問い合わせにも、作った行を返す。
class _SampleRepository implements Repository {
  final List<String> names;

  _SampleRepository(this.names);

  late final List<DataRecord> _rows = sampleRows(names);

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    // 絞り込みは「入力した値を含む行だけ」の素朴な実装。検索欄が効いていることが
    // 見えれば十分（本物の絞り込みは Repository の実装者の仕事）。
    var matched = _rows;
    for (final entry in query.filters.entries) {
      final needle = entry.value;
      if (needle == null || needle.toString().isEmpty) continue;
      matched = matched
          .where((row) =>
              row[entry.key]?.toString().contains(needle.toString()) ?? false)
          .toList();
    }
    final from = query.page * query.pageSize;
    final to = (from + query.pageSize).clamp(0, matched.length);
    return PageResult(
      items: from >= matched.length ? const [] : matched.sublist(from, to),
      totalCount: matched.length,
    );
  }

  @override
  Future<DataRecord?> findByKey(Object key) async {
    for (final row in _rows) {
      if (row['id'].toString() == key.toString()) return row;
    }
    return _rows.first;
  }

  @override
  Future<DataRecord> create(DataRecord data) async {
    final row = {...data, 'id': _rows.length + 1};
    _rows.add(row);
    return row;
  }

  @override
  Future<DataRecord> update(Object key, DataRecord data) async {
    final index = _rows.indexWhere((r) => r['id'].toString() == key.toString());
    if (index >= 0) _rows[index] = {..._rows[index], ...data};
    return data;
  }

  @override
  Future<void> delete(Object key) async {
    _rows.removeWhere((r) => r['id'].toString() == key.toString());
  }
}
