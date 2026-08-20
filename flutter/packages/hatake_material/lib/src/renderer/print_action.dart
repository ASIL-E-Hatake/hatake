part of '../material_renderer.dart';

/// Runs a `print` action: gathers what goes on the paper and hands it to the
/// scope's [PrintSink].
///
/// The framework never makes the bytes. A PDF writer is a whole subsystem
/// (fonts, encodings, page trees) and most apps do not print at all, so it lives
/// in an opt-in adapter (`hatake_print`) that the *application* wires to the
/// sink. Without a sink this reports the fact instead of quietly doing nothing.
///
/// Returns whether the report reached the sink, so a declared `onSuccess` does
/// not claim success when there was nowhere to print.
Future<bool> _runPrintAction(
  BuildContext context,
  ActionDefinition action, {
  required ReportPageDefinition page,
  required List<DataRecord> rows,
  required FormatterRegistry formatters,
}) async {
  final scope = HatakeScope.of(context);
  final messenger = ScaffoldMessenger.of(context);
  final sink = scope.printSink;
  if (sink == null) {
    messenger.showSnackBar(SnackBar(
      content: Text('アクション "${action.id}" の出力先が未登録です'
          '（HatakeScope の printSink）'),
    ));
    return false;
  }
  try {
    await sink(PrintRequest(
      filename: _printFilename(action, page.title),
      page: page,
      rows: rows,
      // 紙も画面と同じものを見せる（役割で消える列は紙にも出さない）。絞るのは
      // アダプタ側＝どの列が見えるかを決める所を2つに増やさない。
      roles: scope.roles,
      formatters: formatters,
      config: action.config,
      actionId: action.id,
    ));
    return true;
  } catch (error) {
    messenger.showSnackBar(SnackBar(content: Text('印刷に失敗しました: $error')));
    return false;
  }
}

/// `config.filename` or the page title, with `.pdf` added when absent.
///
/// The extension is a *suggestion* to the sink — a sink that talks to a printer
/// ignores it, and one that writes another format renames it.
String _printFilename(ActionDefinition action, String fallbackName) {
  final name = action.config['filename']?.toString() ?? fallbackName;
  return name.contains('.') ? name : '$name.pdf';
}
