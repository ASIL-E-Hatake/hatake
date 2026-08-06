import 'package:hatake_material/hatake_material.dart';

/// An in-memory [Repository] for **child rows kept in their own table** — the
/// `subTable` `source` variant (受注明細).
///
/// Rows carry their own key `lineNo` plus the parent key `orderNo`. The grid
/// asks for one page at a time filtered by the parent, so this repository only
/// has to honour `filters['orderNo']`, `page` and `pageSize`. Adding, editing
/// and deleting a row are ordinary single-record calls — the parent (受注ヘッダ)
/// is never touched.
class OrderLineRepository implements Repository {
  final List<DataRecord> _rows;
  int _nextLineNo;

  OrderLineRepository(List<DataRecord> rows)
      : _rows = [...rows],
        _nextLineNo = rows.length + 1;

  /// Seeds a deliberately long 明細 (受注 SO-1003) so paging is visible in the
  /// demo, plus a few rows for the other orders.
  factory OrderLineRepository.seeded() {
    const catalog = [
      ('業務用サーバ', 280000),
      ('保守契約（年）', 40000),
      ('ラックマウントキット', 18000),
      ('UPS（無停電電源）', 62000),
      ('LANケーブル 5m', 800),
      ('スイッチ 24ポート', 47000),
      ('SSD 1TB', 21000),
      ('メモリ 32GB', 34000),
      ('KVMコンソール', 88000),
      ('設置作業費', 55000),
      ('初期設定費', 35000),
      ('データ移行費', 120000),
    ];

    final rows = <DataRecord>[];
    var lineNo = 1;
    // 12 品目 × 2 周 = 24 行。pageSize 10 なので 3 ページになる。
    for (var round = 0; round < 2; round++) {
      for (final (item, price) in catalog) {
        final qty = (lineNo % 4) + 1;
        rows.add({
          'lineNo': lineNo++,
          'orderNo': 'SO-1003',
          'item': round == 0 ? item : '$item（追加分）',
          'qty': qty,
          'price': price,
          'amount': qty * price,
        });
      }
    }
    rows.addAll([
      {
        'lineNo': lineNo++,
        'orderNo': 'SO-1001',
        'item': 'ノートPC',
        'qty': 2,
        'price': 60000,
        'amount': 120000,
      },
      {
        'lineNo': lineNo++,
        'orderNo': 'SO-1001',
        'item': 'マウス',
        'qty': 4,
        'price': 2000,
        'amount': 8000,
      },
    ]);
    return OrderLineRepository(rows);
  }

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    // 親キーで絞る。`source.parentKey: orderNo` がこのフィルタ名になる。
    final parent = query.filters['orderNo'];
    final mine = _rows.where((r) => r['orderNo'] == parent).toList();
    mine.sort((a, b) => (a['lineNo'] as int).compareTo(b['lineNo'] as int));

    final start = query.page * query.pageSize;
    if (start >= mine.length) {
      return PageResult(items: const [], totalCount: mine.length);
    }
    return PageResult(
      items: mine.skip(start).take(query.pageSize).toList(),
      totalCount: mine.length,
    );
  }

  @override
  Future<DataRecord?> findByKey(Object key) async {
    final matches = _rows.where((r) => r['lineNo'] == key);
    return matches.isEmpty ? null : matches.first;
  }

  @override
  Future<DataRecord> create(DataRecord data) async {
    final row = {...data, 'lineNo': _nextLineNo++};
    _rows.add(row);
    return row;
  }

  @override
  Future<DataRecord> update(Object key, DataRecord data) async {
    final index = _rows.indexWhere((r) => r['lineNo'] == key);
    final existing = index >= 0 ? _rows[index] : const <String, Object?>{};
    final row = {...existing, ...data, 'lineNo': key};
    if (index >= 0) {
      _rows[index] = row;
    } else {
      _rows.add(row);
    }
    return row;
  }

  @override
  Future<void> delete(Object key) async {
    _rows.removeWhere((r) => r['lineNo'] == key);
  }
}
