import 'package:equatable/equatable.dart';

import 'aggregate_ops.dart';
import 'paper_definition.dart';

/// A control break: rows whose [field] value changes start a new group.
///
/// Grouping is a **control break over consecutive rows**, exactly like a printed
/// form: the rows must already arrive in the right order (that is the
/// repository's job), so the same value appearing twice apart makes two groups.
class ReportGroup extends Equatable {
  /// Field whose change breaks the group.
  final String field;

  /// Heading label shown next to the group's value.
  final String label;

  /// Start a new sheet whenever this group changes.
  final bool pageBreak;

  const ReportGroup({
    required this.field,
    required this.label,
    this.pageBreak = false,
  });

  @override
  List<Object?> get props => [field, label, pageBreak];
}

/// One figure on the subtotal / grand-total lines.
///
/// Reuses the dashboard's aggregate vocabulary ([AggregateOps]), so `sum` means
/// the same thing on a report as on a metric card. Two totals may share a
/// [field] (e.g. `sum` and `count` of the same column).
class ReportTotal extends Equatable {
  final String field;

  /// Aggregate operation name ([AggregateOps] or a plugin's).
  final String aggregate;

  const ReportTotal({
    required this.field,
    this.aggregate = AggregateOps.sum,
  });

  @override
  List<Object?> get props => [field, aggregate];
}

/// The printing side of a `report` page: paper, how many lines fit on a sheet,
/// and the group / total structure. The detail columns come from the page's
/// `table`, so a report and a list of the same data stay in sync.
class ReportDefinition extends Equatable {
  final PaperDefinition paper;

  /// Lines per sheet. **Group headings and total lines count as lines**, which
  /// is what makes page breaks deterministic across languages.
  final int rowsPerPage;

  /// Control breaks, outermost first.
  final List<ReportGroup> groups;

  /// Figures on the subtotal / grand-total lines, in declaration order.
  final List<ReportTotal> totals;

  /// Rows to fetch for one run. A report is printed, not scrolled, so it reads
  /// one bounded chunk instead of paging.
  final int limit;

  /// Print order, passed to the repository. A report has no clickable headers,
  /// so this is the only place its order can be stated — and [groups] need the
  /// rows to arrive in it.
  final String? sortField;

  final bool sortAscending;

  const ReportDefinition({
    this.paper = const PaperDefinition(),
    this.rowsPerPage = 40,
    this.groups = const [],
    this.totals = const [],
    this.limit = 1000,
    this.sortField,
    this.sortAscending = true,
  });

  @override
  List<Object?> get props =>
      [paper, rowsPerPage, groups, totals, limit, sortField, sortAscending];
}
