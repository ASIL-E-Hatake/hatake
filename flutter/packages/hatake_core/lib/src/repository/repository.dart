import 'package:equatable/equatable.dart';

/// A record as seen by the framework — an untyped key/value map. The framework
/// is schema-driven; concrete typing is the user's concern in their repository.
///
/// Named [DataRecord] (not `Record`) to avoid colliding with the built-in
/// `dart:core` record type.
typedef DataRecord = Map<String, Object?>;

/// A query passed to a [Repository] for list / search operations.
class RepositoryQuery extends Equatable {
  /// Filter values keyed by field name (already resolved from the UI).
  final Map<String, Object?> filters;

  /// Zero-based page index.
  final int page;

  /// Number of items per page.
  final int pageSize;

  /// Field to sort by, or null for repository default order.
  final String? sortField;

  /// Sort direction; ignored when [sortField] is null.
  final bool sortAscending;

  const RepositoryQuery({
    this.filters = const {},
    this.page = 0,
    this.pageSize = 50,
    this.sortField,
    this.sortAscending = true,
  });

  RepositoryQuery copyWith({
    Map<String, Object?>? filters,
    int? page,
    int? pageSize,
    String? sortField,
    bool? sortAscending,
  }) {
    return RepositoryQuery(
      filters: filters ?? this.filters,
      page: page ?? this.page,
      pageSize: pageSize ?? this.pageSize,
      sortField: sortField ?? this.sortField,
      sortAscending: sortAscending ?? this.sortAscending,
    );
  }

  @override
  List<Object?> get props =>
      [filters, page, pageSize, sortField, sortAscending];
}

/// One page of results plus the total count for pagination.
class PageResult extends Equatable {
  final List<DataRecord> items;
  final int totalCount;

  const PageResult({required this.items, required this.totalCount});

  static const PageResult empty = PageResult(items: [], totalCount: 0);

  @override
  List<Object?> get props => [items, totalCount];
}

/// The data-access contract the framework depends on.
///
/// The framework knows nothing about HTTP, databases, or ORMs — it only calls
/// this interface. Implementations are provided by the user and resolved by a
/// key (see `CrudPageDefinition.repository`).
abstract interface class Repository {
  /// Search / list records for the given [query].
  Future<PageResult> search(RepositoryQuery query);

  /// Fetch a single record by its primary key, or null if not found.
  Future<DataRecord?> findByKey(Object key);

  /// Create a new record; returns the created record (server-assigned fields
  /// included).
  Future<DataRecord> create(DataRecord data);

  /// Update the record identified by [key]; returns the updated record.
  Future<DataRecord> update(Object key, DataRecord data);

  /// Delete the record identified by [key].
  Future<void> delete(Object key);
}
