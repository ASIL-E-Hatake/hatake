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

  /// **子の行を1件に指す項目**（定義に書いた順）。2つ以上なら複合キー。
  /// DSL キー: `key`。
  final List<String> keyFields;

  /// Rows per page.
  final int pageSize;

  const SubTableSource({
    required this.repository,
    required this.parentKey,
    this.keyFields = const ['id'],
    this.pageSize = 20,
  });

  @override
  List<Object?> get props => [repository, parentKey, keyFields, pageSize];
}
