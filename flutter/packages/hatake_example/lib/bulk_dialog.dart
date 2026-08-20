import 'package:flutter/material.dart';
import 'package:hatake_material/hatake_material.dart';

/// `scope: selection` のアクションが受け取った行を見せる。デモ専用。
///
/// Framework がやるのは「どの行が選ばれたか」を渡すところまで。**まとめて何をするか
/// は業務**なので、本物のアプリはここで API を1回呼ぶ（件数ぶんの往復にしない）。
class BulkDialog extends StatelessWidget {
  final ActionDefinition action;
  final List<DataRecord> records;

  const BulkDialog({super.key, required this.action, required this.records});

  static Future<void> show(ActionContext ctx) {
    return showDialog<void>(
      context: ctx.buildContext,
      builder: (_) => BulkDialog(action: ctx.action, records: ctx.records),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: Text('${action.label} — ${records.length} 件'),
      content: SizedBox(
        width: 480,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Framework が渡すのは「選ばれた行」までです（キーではなく行そのもの＝'
              '状態や金額で判断できる）。まとめて何をするかは業務なので、本物の'
              'アプリはここで API を1回呼びます。',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.outline),
            ),
            const SizedBox(height: 12),
            for (final record in records)
              Text(
                '${record['orderNo']}  ${record['customer']}  ${record['status']}',
                key: Key('demo.bulk.${record['orderNo']}'),
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontFamilyFallback: ['Courier New', 'monospace'],
                  fontSize: 13,
                ),
              ),
          ],
        ),
      ),
      actions: [
        FilledButton(
          key: const Key('demo.bulk.close'),
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('閉じる'),
        ),
      ],
    );
  }
}
