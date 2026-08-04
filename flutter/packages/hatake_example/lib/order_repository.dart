import 'package:hatake_material/hatake_material.dart';

/// A simple in-memory [Repository] for the order search / detail demo pages.
///
/// The key field is `orderNo` (a string); rows also carry `customer` and
/// `amount`. A real application would implement this against an HTTP API or
/// database.
class OrderRepository implements Repository {
  final List<DataRecord> _rows;

  OrderRepository(List<DataRecord> rows) : _rows = [...rows];

  factory OrderRepository.seeded() {
    return OrderRepository(const [
      {'orderNo': 'SO-1001', 'customer': '山田商事', 'amount': 128000},
      {'orderNo': 'SO-1002', 'customer': '佐藤物産', 'amount': 54000},
      {'orderNo': 'SO-1003', 'customer': '鈴木工業', 'amount': 320000},
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
