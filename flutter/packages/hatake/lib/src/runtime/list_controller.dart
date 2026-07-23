import 'package:flutter/foundation.dart';
import 'package:hatake_core/hatake_core.dart';

/// Renderer-independent read path shared by list-style pages (search, list,
/// and the list portion of CRUD). Owns query/paging/sort state and is the only
/// place that talks to the [Repository].
class ListController extends ChangeNotifier {
  final Repository repository;
  final int pageSize;

  ListController({required this.repository, required this.pageSize})
      : _query = RepositoryQuery(pageSize: pageSize);

  RepositoryQuery _query;
  RepositoryQuery get query => _query;

  bool _loading = false;
  bool get loading => _loading;

  Object? _error;
  Object? get error => _error;

  List<DataRecord> _items = const [];
  List<DataRecord> get items => _items;

  int _totalCount = 0;
  int get totalCount => _totalCount;

  int get page => _query.page;

  int get pageCount {
    if (pageSize <= 0) return 1;
    final count = (_totalCount + pageSize - 1) ~/ pageSize;
    return count < 1 ? 1 : count;
  }

  /// Loads the first page. Call once after construction.
  Future<void> init() => load();

  /// (Re)loads the current query from the repository.
  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final result = await repository.search(_query);
      _items = result.items;
      _totalCount = result.totalCount;
    } catch (error) {
      _error = error;
      _items = const [];
      _totalCount = 0;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Applies new filter values and reloads from the first page.
  Future<void> search(Map<String, Object?> filters) {
    _query = _query.copyWith(filters: filters, page: 0);
    return load();
  }

  /// Navigates to [page] (clamped to the valid range) and reloads.
  Future<void> setPage(int page) {
    if (page < 0 || page >= pageCount || page == _query.page) {
      return Future.value();
    }
    _query = _query.copyWith(page: page);
    return load();
  }

  /// Sorts by [field] and reloads.
  Future<void> sortBy(String field, {bool ascending = true}) {
    _query = _query.copyWith(sortField: field, sortAscending: ascending);
    return load();
  }

  /// Deletes the record identified by [key] and reloads, stepping back a page
  /// if the current one becomes empty.
  Future<void> deleteRecord(Object key) async {
    await repository.delete(key);
    if (_items.length <= 1 && _query.page > 0) {
      _query = _query.copyWith(page: _query.page - 1);
    }
    await load();
  }

  /// Records an error and notifies listeners. For use by subclasses.
  @protected
  void setError(Object? error) {
    _error = error;
    notifyListeners();
  }
}
