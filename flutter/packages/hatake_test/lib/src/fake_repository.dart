import 'package:hatake/hatake.dart';

/// 覚えているだけの [Repository]。画面の試験のための偽物。
///
/// 画面の試験で本物のバックエンドを立てるわけにはいかないので、要るのは
/// 「行を持っていて・聞かれたことを覚えている」偽物。**聞かれたことを覚える**のが要で、
/// 「保存ボタンを押したら本当に create が呼ばれたか」を確かめられる（画面の見た目だけ
/// 見ていると、押しても何も起きていないことに気づけない）。
///
/// ```dart
/// final repo = FakeRepository([{'id': 1, 'code': 'SO-1'}]);
/// // …画面を出して保存を押す…
/// expect(repo.calls, contains('create'));
/// expect(repo.rows.last['code'], 'SO-2');
/// ```
class FakeRepository implements Repository {
  final List<DataRecord> _rows;

  /// 呼ばれた口の名前（`search` / `findByKey` / `create` / `update` / `delete`）。
  final List<String> calls = [];

  /// 渡された問い合わせ（絞り込み・並び・ページ）。
  final List<RepositoryQuery> queries = [];

  /// 鍵の項目名（定義の `key`）。既定は `id`。
  final String keyField;

  /// これを渡すと、どの口も投げる（画面がエラーをどう出すかを試すため）。
  final Object? failWith;

  FakeRepository([
    List<DataRecord>? rows,
    this.keyField = 'id',
    this.failWith,
  ]) : _rows = [for (final row in rows ?? const <DataRecord>[]) {...row}];

  /// いま持っている行（保存・削除のあとを確かめるための覗き口）。
  List<DataRecord> get rows => List.unmodifiable(_rows);

  void _check(String call) {
    calls.add(call);
    if (failWith != null) throw failWith!;
  }

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    _check('search');
    queries.add(query);
    // 絞り込みは「入力した値を含む行だけ」の素朴な実装（絞り込みが効いていることが
    // 見えれば足りる。本物の絞り込みは Repository を書く人の仕事）。
    var matched = [..._rows];
    for (final entry in query.filters.entries) {
      final needle = entry.value;
      if (needle == null || needle.toString().isEmpty) continue;
      matched = [
        for (final row in matched)
          if (row[entry.key]?.toString().contains(needle.toString()) ?? false)
            row,
      ];
    }
    final sort = query.sortField;
    if (sort != null) {
      matched.sort((a, b) {
        final left = a[sort]?.toString() ?? '';
        final right = b[sort]?.toString() ?? '';
        return query.sortAscending
            ? left.compareTo(right)
            : right.compareTo(left);
      });
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
    _check('findByKey($key)');
    for (final row in _rows) {
      if (row[keyField].toString() == key.toString()) return {...row};
    }
    return null;
  }

  @override
  Future<DataRecord> create(DataRecord data) async {
    _check('create');
    final row = {
      if (!data.containsKey(keyField)) keyField: _rows.length + 1,
      ...data,
    };
    _rows.add(row);
    return {...row};
  }

  @override
  Future<DataRecord> update(Object key, DataRecord data) async {
    _check('update($key)');
    final index = _rows.indexWhere(
      (row) => row[keyField].toString() == key.toString(),
    );
    if (index >= 0) _rows[index] = {..._rows[index], ...data};
    return {...data};
  }

  @override
  Future<void> delete(Object key) async {
    _check('delete($key)');
    _rows.removeWhere((row) => row[keyField].toString() == key.toString());
  }
}
