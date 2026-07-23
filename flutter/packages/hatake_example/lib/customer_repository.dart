import 'package:hatake_material/hatake_material.dart';

/// A simple in-memory [Repository] used by the example app.
///
/// A real application would implement this against an HTTP API or database —
/// the framework only depends on the [Repository] interface.
class CustomerRepository implements Repository {
  final List<DataRecord> _rows;
  int _sequence;

  CustomerRepository(List<DataRecord> rows)
      : _rows = [...rows],
        _sequence = rows.fold<int>(
          0,
          (max, r) => (r['id'] as int) > max ? r['id'] as int : max,
        );

  static const List<String> _names = [
    '山田', '佐藤', '鈴木', '田中', '高橋', '伊藤', '渡辺', '中村',
  ];

  factory CustomerRepository.seeded() {
    final rows = <DataRecord>[
      for (var i = 1; i <= 23; i++)
        {
          'id': i,
          'code': 'C${i.toString().padLeft(3, '0')}',
          'name': '${_names[i % _names.length]}商事',
          'status': i % 3 == 0 ? 'inactive' : 'active',
          'updatedAt': '2026-07-${((i % 28) + 1).toString().padLeft(2, '0')}',
        },
    ];
    return CustomerRepository(rows);
  }

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    Iterable<DataRecord> rows = _rows;

    final name = query.filters['name'];
    if (name is String && name.isNotEmpty) {
      rows = rows.where((r) => (r['name'] as String).contains(name));
    }
    final status = query.filters['status'];
    if (status != null) {
      rows = rows.where((r) => r['status'] == status);
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
