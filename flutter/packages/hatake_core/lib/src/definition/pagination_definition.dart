import 'package:equatable/equatable.dart';

/// Pagination settings for a table.
class PaginationDefinition extends Equatable {
  final int pageSize;

  /// Whether pagination is enabled at all.
  final bool enabled;

  const PaginationDefinition({this.pageSize = 50, this.enabled = true});

  static const PaginationDefinition disabled =
      PaginationDefinition(enabled: false);

  @override
  List<Object?> get props => [pageSize, enabled];
}
