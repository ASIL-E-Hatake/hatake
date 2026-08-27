part of '../material_renderer.dart';

/// 一括を**区切って実行する**（`batchSize`）。進み具合を出して、区切りで止められる。
///
/// なぜ枠組みが回すのか: 1回で全部渡してしまうと、**枠組みには途中の状態が分からない**
/// （何件終わったのかを知っているのはハンドラの中だけ）。だから「進み具合を出す」も
/// 「途中で止める」も、区切りが在るときだけできる機能になる。逆に区切りを枠組みが持つと、
/// 進み具合・中断・区切りごとの報告の合算が**ハンドラの手間ゼロ**で付いてくる。
///
/// 嘘をつかないための決めごと:
///   ・**中断は「まだ送っていない分を送らない」だけ。** 既に送った区切りは動いている
///     （取り消しではない）。だから報告では「実行した」と「送っていない」を別に数える。
///   ・**区切りが失敗したら、残りは送らない。** 同じ理由で失敗し続ける可能性が高く、
///     現場が止める手段が無いまま100件ぶん失敗し続けるのが一番まずい。
///   ・**押した人が見るのは1回ぶんの結果。** 何回に分けて送ったかは枠組みの都合なので、
///     報告には出さない（区切りごとの報告は足し合わせる）。
///   ・**閉じるボタンは出さない。** 消えたダイアログの裏で走り続けるのが分からないので、
///     終わるか、止めるか、のどちらかでしか閉じない。

/// 区切りごとの実行を、押した人に見せながら進める。
class _BulkRunner {
  final BuildContext context;
  final ActionDefinition action;
  final List<DataRecord> records;
  final int batchSize;

  /// 1区切りぶんを実行して、その区切りの報告を返す（例外はそのまま投げる）。
  final Future<ActionOutcome> Function(List<DataRecord> batch) runBatch;

  _BulkRunner({
    required this.context,
    required this.action,
    required this.records,
    required this.batchSize,
    required this.runBatch,
  });

  final ValueNotifier<int> _done = ValueNotifier<int>(0);
  bool _cancelled = false;

  /// 区切りに割る（最後の区切りは端数）。
  List<List<DataRecord>> get _batches {
    final out = <List<DataRecord>>[];
    for (var at = 0; at < records.length; at += batchSize) {
      out.add(records.sublist(at, math.min(at + batchSize, records.length)));
    }
    return out;
  }

  /// 実行する。返すのは**合算した報告**（送らなかったぶんは `skipped`）。
  Future<ActionOutcome> run() async {
    final dialog = _show();
    var outcome = const ActionOutcome();
    var sent = 0;
    try {
      for (final batch in _batches) {
        if (_cancelled) break;
        try {
          outcome = outcome.merge(await runBatch(batch));
        } catch (error) {
          // この区切りは失敗。残りは送らない（同じ理由で失敗し続ける方が悪い）。
          _close(dialog);
          rethrow;
        }
        sent += batch.length;
        _done.value = sent;
      }
    } finally {
      _close(dialog);
    }
    return outcome.withSkipped(records.length - sent);
  }

  /// 進み具合のダイアログ。**閉じるボタンは出さない**（終わるか、止めるか）。
  Future<void>? _show() {
    if (!context.mounted) return null;
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        key: const Key('hatake.bulkProgress'),
        title: Text(action.label),
        content: ValueListenableBuilder<int>(
          valueListenable: _done,
          builder: (context, done, _) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 件数を先に出す（棒だけでは「あと何件か」が読めない）。
              Text('$done / ${records.length} 件'),
              const SizedBox(height: 12),
              LinearProgressIndicator(
                value: records.isEmpty ? 0 : done / records.length,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            key: const Key('hatake.bulkProgress.cancel'),
            onPressed: () {
              // 送った分は動いている＝取り消しではない、と分かる言い方にする。
              _cancelled = true;
            },
            child: const Text('中断（ここまでは実行されます）'),
          ),
        ],
      ),
    );
  }

  void _close(Future<void>? dialog) {
    if (dialog == null) return;
    final navigator = Navigator.maybeOf(context);
    if (navigator != null && navigator.canPop()) navigator.pop();
  }
}
