import 'package:hatake_material/hatake_material.dart';

/// A simple in-memory [Repository] for the order search / detail / entry pages.
///
/// The key field is `orderNo` (a string); rows also carry `customer`, `amount`
/// and **`lines`** — the child rows of the master-detail entry screen. Because
/// the aggregate is one record, header and lines are saved in a single call.
/// A real application would implement this against an HTTP API or database.
class OrderRepository implements Repository {
  final List<DataRecord> _rows;

  OrderRepository(List<DataRecord> rows) : _rows = [...rows];

  factory OrderRepository.seeded() {
    return OrderRepository(const [
      {
        'orderNo': 'SO-1001',
        'customer': '山田商事',
        'amount': 128000,
        'lines': [
          {'item': 'ノートPC', 'qty': 2, 'price': 60000, 'amount': 120000},
          {'item': 'マウス', 'qty': 4, 'price': 2000, 'amount': 8000},
        ],
      },
      {
        'orderNo': 'SO-1002',
        'customer': '佐藤物産',
        'amount': 54000,
        'lines': [
          {'item': '複合機トナー', 'qty': 6, 'price': 9000, 'amount': 54000},
        ],
      },
      {
        'orderNo': 'SO-1003',
        'customer': '鈴木工業',
        'amount': 320000,
        'lines': [
          {'item': '業務用サーバ', 'qty': 1, 'price': 280000, 'amount': 280000},
          {'item': '保守契約（年）', 'qty': 1, 'price': 40000, 'amount': 40000},
        ],
      },
    ]);
  }

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    Iterable<DataRecord> rows = _rows;

    final customer = query.filters['customer'];
    if (customer is String && customer.isNotEmpty) {
      rows = rows.where((r) => (r['customer'] as String).contains(customer));
    }

    final list = rows.toList();
    final sortField = query.sortField;
    if (sortField != null) {
      list.sort((a, b) {
        final cmp = (a[sortField]?.toString() ?? '')
            .compareTo(b[sortField]?.toString() ?? '');
        return query.sortAscending ? cmp : -cmp;
      });
    }

    final start = query.page * query.pageSize;
    final page = list.skip(start).take(query.pageSize).toList();
    return PageResult(items: page, totalCount: list.length);
  }

  @override
  Future<DataRecord?> findByKey(Object key) async {
    final matches = _rows.where((r) => r['orderNo'] == key);
    return matches.isEmpty ? null : matches.first;
  }

  @override
  Future<DataRecord> create(DataRecord data) async {
    _rows.add({...data});
    return {...data};
  }

  @override
  Future<DataRecord> update(Object key, DataRecord data) async {
    final record = {...data, 'orderNo': key};
    final index = _rows.indexWhere((r) => r['orderNo'] == key);
    if (index >= 0) {
      _rows[index] = record;
    } else {
      _rows.add(record);
    }
    return record;
  }

  @override
  Future<void> delete(Object key) async {
    _rows.removeWhere((r) => r['orderNo'] == key);
  }
}
