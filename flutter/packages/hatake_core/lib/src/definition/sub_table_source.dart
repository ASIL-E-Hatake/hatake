import 'package:equatable/equatable.dart';

/// Where a `subTable`'s child rows come from when they are **not** embedded in
/// the parent record: their own repository, paged and linked by a foreign key.
///
/// Presence of a source changes the field's semantics (see `dsl-spec`): rows are
/// fetched with `search({parentKey: <parent key>}, page, pageSize)`, saved one at
/// a time, and the parent's `FormValidator` skips the field entirely because its
/// value does not live in the record.
class SubTableSource extends Equatable {
  /// Repository key for the child rows.
  final String repository;

  /// Child field holding the parent key. Passed as the search filter
  /// `{parentKey: <parent key value>}`.
  final String parentKey;

  /// Primary-key field of a child row, used to update/delete it.
  /// DSL key: `key`.
  final String keyField;

  /// Rows per page.
  final int pageSize;

  const SubTableSource({
    required this.repository,
    required this.parentKey,
    this.keyField = 'id',
    this.pageSize = 20,
  });

  @override
  List<Object?> get props => [repository, parentKey, keyField, pageSize];
}
