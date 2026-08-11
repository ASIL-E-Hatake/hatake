import 'dart:async';

/// A file the framework produced and wants handed to the user.
///
/// The framework builds the bytes' *content*; it never writes files, downloads,
/// or shares — that is platform I/O and belongs to the application (see
/// [ExportSink]).
class ExportRequest {
  /// Suggested file name, including extension (e.g. `受注一覧.csv`).
  final String filename;

  /// MIME type of [text], with the charset when it is not UTF-8
  /// (e.g. `text/csv; charset=cp932`).
  final String mimeType;

  /// The document itself. Already carries a BOM when the definition asked for
  /// one *and* the charset is UTF-8, so writing UTF-8 bytes is enough by default.
  final String text;

  /// Charset the definition asked for (`config.charset`, default `utf-8`).
  ///
  /// **The framework does not convert.** It builds the text and says what the
  /// receiving system wants; turning that into bytes is this sink's job — see the
  /// `hatake_encoding` package for cp932 / Shift_JIS / EUC-JP.
  final String charset;

  /// The action that triggered the export, so a sink can read its `config`.
  final String actionId;

  const ExportRequest({
    required this.filename,
    required this.mimeType,
    required this.text,
    required this.actionId,
    this.charset = 'utf-8',
  });
}

/// Receives an [ExportRequest] and gets it to the user — a browser download, a
/// save dialog, a share sheet, an upload. Register one on `HatakeScope`; without
/// it, an `export` action reports that no sink is registered instead of quietly
/// doing nothing.
typedef ExportSink = FutureOr<void> Function(ExportRequest request);
