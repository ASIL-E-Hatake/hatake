import 'dart:async';

import 'package:hatake_core/hatake_core.dart';

/// A report the definition asked to print, handed over the moment the button
/// was pressed.
///
/// The framework gathers **what goes on the paper** — the report definition, the
/// rows it is showing, the roles that decide which columns exist, the formatters
/// that decide how a value reads — and stops there. Turning that into bytes (a
/// PDF, a printer's control codes) is an opt-in adapter's job, and getting those
/// bytes to a printer or a file is platform I/O: both belong to the application
/// (see [PrintSink]).
///
/// That boundary is why this carries ingredients instead of a document: the
/// framework never depends on a print adapter, so an app that does not print
/// pays nothing. `hatake_print` turns this into a PDF in one call:
///
/// ```dart
/// printSink: (request) async {
///   final bytes = reportPdf(
///     request.page,
///     request.rows,
///     formatters: request.formatters,
///     roles: request.roles,
///   );
///   await save(request.filename, bytes);
/// }
/// ```
class PrintRequest {
  /// Suggested file name, including extension (e.g. `受注一覧.pdf`). From the
  /// action's `config.filename`, or the page title.
  final String filename;

  /// The report to print — paper, groups, totals, column widths.
  final ReportPageDefinition page;

  /// The rows to print: exactly the ones the page is showing, already read and
  /// bounded by `report.limit`. Printing re-reads nothing, so the paper holds
  /// what the screen held.
  final List<DataRecord> rows;

  /// Roles of the current user. Columns declared with `roles` the user does not
  /// have must stay off the paper too — pass this through to the adapter rather
  /// than filtering here, so one place decides what is visible.
  final Set<String> roles;

  /// Formatters the renderer uses, including any the application registered, so
  /// a number reads the same on paper as it does on screen.
  final FormatterRegistry formatters;

  /// The action's `config`, verbatim. The framework reads `filename` and nothing
  /// else: paper trays, fonts and duplex are the adapter's vocabulary, so they
  /// pass through untouched instead of being invented here.
  final Map<String, Object?> config;

  /// The action that asked to print, so a sink can tell two buttons apart.
  final String actionId;

  const PrintRequest({
    required this.filename,
    required this.page,
    required this.rows,
    required this.formatters,
    required this.actionId,
    this.roles = const {},
    this.config = const {},
  });
}

/// Receives a [PrintRequest] and gets it onto paper — a PDF the browser
/// downloads, a file a batch writes, a printer, a preview dialog. Register one on
/// `HatakeScope`; without it a `print` action says so instead of quietly doing
/// nothing.
typedef PrintSink = FutureOr<void> Function(PrintRequest request);
