import 'dart:async';

/// A file the framework produced and wants handed to the user.
///
/// The framework builds the bytes' *content*; it never writes files, downloads,
/// or shares — that is platform I/O and belongs to the application (see
/// [ExportSink]).
class ExportRequest {
  /// Suggested file name, including extension (e.g. `受注一覧.csv`).
  final String filename;

  /// MIME type of [text] (e.g. `text/csv`).
  final String mimeType;

  /// The document itself. Already carries a BOM when the definition asked for
  /// one, so writing it as UTF-8 is enough.
  final String text;

  /// The action that triggered the export, so a sink can read its `config`.
  final String actionId;

  const ExportRequest({
    required this.filename,
    required this.mimeType,
    required this.text,
    required this.actionId,
  });
}

/// Receives an [ExportRequest] and gets it to the user — a browser download, a
/// save dialog, a share sheet, an upload. Register one on `HatakeScope`; without
/// it, an `export` action reports that no sink is registered instead of quietly
/// doing nothing.
typedef ExportSink = FutureOr<void> Function(ExportRequest request);
