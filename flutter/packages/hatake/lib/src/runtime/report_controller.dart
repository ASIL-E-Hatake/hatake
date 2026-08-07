import 'package:flutter/foundation.dart';
import 'package:hatake_core/hatake_core.dart';

/// Renderer-independent runtime for a [ReportPageDefinition]: runs the output
/// conditions once and builds the [ReportDocument] from the rows.
///
/// A report is printed, not scrolled, so it reads one bounded chunk
/// (`report.limit`) instead of paging the repository. Paging happens afterwards,
/// over the built sheets ([sheetIndex]).
class ReportController extends ChangeNotifier {
  final ReportPageDefinition definition;
  final Repository repository;
  final AggregateRegistry aggregates;

  ReportController({
    required this.definition,
    required this.repository,
    AggregateRegistry? aggregates,
  }) : aggregates = aggregates ?? AggregateRegistry();

  bool _loading = false;
  bool get loading => _loading;

  Object? _error;
  Object? get error => _error;

  /// Whether the conditions have been run at all yet.
  bool _ran = false;
  bool get hasRun => _ran;

  List<DataRecord> _rows = const [];

  /// The rows the document was built from (also what an export writes).
  List<DataRecord> get rows => _rows;

  ReportDocument _document = ReportDocument.empty;
  ReportDocument get document => _document;

  int _sheetIndex = 0;

  /// Zero-based index of the sheet on screen.
  int get sheetIndex => _sheetIndex;

  int get totalPages => _document.totalPages;

  /// The sheet on screen, or null when the report has no rows.
  ReportSheet? get sheet =>
      _document.sheets.isEmpty ? null : _document.sheets[_sheetIndex];

  Map<String, Object?> _filters = const {};

  /// Output conditions currently applied.
  Map<String, Object?> get filters => _filters;

  /// Runs the report with the current conditions. Call once after construction.
  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final result = await repository.search(RepositoryQuery(
        filters: _filters,
        pageSize: definition.report.limit,
        // Groups are control breaks, so the print order matters to the output.
        sortField: definition.report.sortField,
        sortAscending: definition.report.sortAscending,
      ));
      _rows = result.items;
      _document = buildReport(
        definition.report,
        _rows,
        aggregates: aggregates,
      );
      _sheetIndex = 0;
    } catch (error) {
      _error = error;
      _rows = const [];
      _document = ReportDocument.empty;
    } finally {
      _ran = true;
      _loading = false;
      notifyListeners();
    }
  }

  /// Applies new output conditions and re-runs.
  Future<void> run(Map<String, Object?> filters) {
    _filters = filters;
    return load();
  }

  /// Moves to [index] (clamped to the sheets that exist).
  void setSheet(int index) {
    if (index < 0 || index >= totalPages || index == _sheetIndex) return;
    _sheetIndex = index;
    notifyListeners();
  }
}
