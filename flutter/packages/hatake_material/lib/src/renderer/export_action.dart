part of '../material_renderer.dart';

/// Runs an `export` action: builds the CSV from [columns] and the rows the page
/// supplies, then hands it to the scope's [ExportSink].
///
/// The framework produces the text and stops there — writing a file, starting a
/// download or opening a share sheet is platform I/O, so without a sink this
/// reports the fact instead of quietly doing nothing.
Future<void> _runExportAction(
  BuildContext context,
  ActionDefinition action, {
  required List<ColumnDefinition> columns,
  required Future<List<DataRecord>> Function(int limit) rows,
  required FormatterRegistry formatters,
  required String fallbackName,
}) async {
  final scope = HatakeScope.of(context);
  final messenger = ScaffoldMessenger.of(context);
  final sink = scope.exportSink;
  if (sink == null) {
    messenger.showSnackBar(SnackBar(
      content: Text('アクション "${action.id}" の出力先が未登録です'
          '（HatakeScope の exportSink）'),
    ));
    return;
  }
  // Never export a column the current user is not allowed to see.
  final visible =
      columns.where((c) => isAllowed(c.roles, scope.roles)).toList();
  final limit = action.config['limit'];

  try {
    final data = await rows(limit is num ? limit.toInt() : 10000);
    await sink(ExportRequest(
      filename: _exportFilename(action, fallbackName),
      mimeType: 'text/csv',
      text: toCsv(
        visible,
        data,
        options: CsvOptions.fromConfig(action.config),
        formatters: formatters,
      ),
      actionId: action.id,
    ));
  } catch (error) {
    messenger.showSnackBar(SnackBar(content: Text('出力に失敗しました: $error')));
  }
}

/// `config.filename` or the page title, with `.csv` added when absent.
String _exportFilename(ActionDefinition action, String fallbackName) {
  final name = action.config['filename']?.toString() ?? fallbackName;
  return name.contains('.') ? name : '$name.csv';
}
