import 'package:hatake_material/hatake_material.dart';

/// A simple in-memory [Repository] for the product master demo page.
///
/// Rows have `id` (key), `code` and `name`. A real application would implement
/// this against an HTTP API or database.
class ProductRepository implements Repository {
  final List<DataRecord> _rows;
  int _sequence;

  ProductRepository(List<DataRecord> rows)
      : _rows = [...rows],
        _sequence = rows.fold<int>(
          0,
          (max, r) => (r['id'] as int) > max ? r['id'] as int : max,
        );

  factory ProductRepository.seeded() {
    return ProductRepository(const [
      {'id': 1, 'code': 'P001', 'name': 'ノートPC'},
      {'id': 2, 'code': 'P002', 'name': 'ワイヤレスマウス'},
      {'id': 3, 'code': 'P003', 'name': '4Kモニター'},
    ]);
  }

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    Iterable<DataRecord> rows = _rows;

    final name = query.filters['name'];
    if (name is String && name.isNotEmpty) {
      rows = rows.where((r) => (r['name'] as String).contains(name));
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
    final matches = _rows.where((r) => r['id'] == key);
    return matches.isEmpty ? null : matches.first;
  }

  @override
  Future<DataRecord> create(DataRecord data) async {
    final record = {...data, 'id': ++_sequence};
    _rows.add(record);
    return record;
  }

  @override
  Future<DataRecord> update(Object key, DataRecord data) async {
    final record = {...data, 'id': key};
    final index = _rows.indexWhere((r) => r['id'] == key);
    if (index >= 0) {
      _rows[index] = record;
    } else {
      _rows.add(record);
    }
    return record;
  }

  @override
  Future<void> delete(Object key) async {
    _rows.removeWhere((r) => r['id'] == key);
  }
}
