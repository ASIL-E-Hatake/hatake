import 'package:hatake_material/hatake_material.dart';

/// A simple in-memory [Repository] for the order search / detail / entry pages.
///
/// The key field is `orderNo` (a string); rows also carry `customer`,
/// `orderDate`, `status`, `shipped`, `amount` and **`lines`** — the child rows
/// of the master-detail entry screen. Because the aggregate is one record,
/// header and lines are saved in a single call. A real application would
/// implement this against an HTTP API or database.
///
/// [search] shows how the multi-condition search area of `order_search` maps
/// onto a backend: text → contains, select/checkbox → equality, and a
/// `between` filter arriving as a 2-element `[from, to]` list.
class OrderRepository implements Repository {
  final List<DataRecord> _rows;

  OrderRepository(List<DataRecord> rows) : _rows = [...rows];

  factory OrderRepository.seeded() {
    return OrderRepository(const [
      {
        'orderNo': 'SO-1001',
        'customer': '山田商事',
        'orderDate': '2026-07-14',
        'status': '未出荷',
        'shipped': false,
        'amount': 128000,
        'lines': [
          {'item': 'ノートPC', 'qty': 2, 'price': 60000, 'amount': 120000},
          {'item': 'マウス', 'qty': 4, 'price': 2000, 'amount': 8000},
        ],
      },
      {
        'orderNo': 'SO-1002',
        'customer': '佐藤物産',
        'orderDate': '2026-07-28',
        'status': '出荷済',
        'shipped': true,
        'amount': 54000,
        'lines': [
          {'item': '複合機トナー', 'qty': 6, 'price': 9000, 'amount': 54000},
        ],
      },
      {
        'orderNo': 'SO-1003',
        'customer': '鈴木工業',
        'orderDate': '2026-08-03',
        'status': '未出荷',
        'shipped': false,
        'amount': 320000,
        'lines': [
          {'item': '業務用サーバ', 'qty': 1, 'price': 280000, 'amount': 280000},
          {'item': '保守契約（年）', 'qty': 1, 'price': 40000, 'amount': 40000},
        ],
      },
      {
        'orderNo': 'SO-1004',
        'customer': '山田商事',
        'orderDate': '2026-06-30',
        'status': '出荷済',
        'shipped': true,
        'amount': 96000,
        'lines': [
          {'item': '会議用モニタ', 'qty': 3, 'price': 32000, 'amount': 96000},
        ],
      },
    ]);
  }

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    Iterable<DataRecord> rows = _rows;

    // 顧客名: 部分一致 (operator: contains)
    final customer = query.filters['customer'];
    if (customer is String && customer.isNotEmpty) {
      rows = rows.where((r) => (r['customer'] as String).contains(customer));
    }

    // 状態: 一致 (type: select / operator: equals)
    final status = query.filters['status'];
    if (status != null) {
      rows = rows.where((r) => r['status'] == status);
    }

    // 出荷済: 三値の一致 (type: checkbox — 指定なしのときは絞り込まない)
    final shipped = query.filters['shipped'];
    if (shipped is bool) {
      rows = rows.where((r) => r['shipped'] == shipped);
    }

    // 受注日: [開始, 終了] の両端を含む範囲 (operator: between)。
    // どちらか一方だけの指定も来る（もう片方は null）。
    final orderDate = query.filters['orderDate'];
    if (orderDate is List && orderDate.length == 2) {
      rows = rows.where((r) => _inDateRange(
            r['orderDate']?.toString(),
            from: orderDate[0]?.toString(),
            to: orderDate[1]?.toString(),
          ));
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

  /// `yyyy-MM-dd` は辞書順＝日付順なので、そのまま比較すれば範囲判定できる。
  static bool _inDateRange(String? value, {String? from, String? to}) {
    if (value == null || value.isEmpty) return false;
    if (from != null && from.isNotEmpty && value.compareTo(from) < 0) {
      return false;
    }
    if (to != null && to.isNotEmpty && value.compareTo(to) > 0) return false;
    return true;
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
    final index = _rows.indexWhere((r) => r['orderNo'] == key);
    // 受注入力はヘッダ＋明細だけを送ってくるので、既存の項目（状態・受注日など）
    // は残したままマージする。
    final existing = index >= 0 ? _rows[index] : const <String, Object?>{};
    final record = {...existing, ...data, 'orderNo': key};
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
