import 'package:hatake_core/hatake_core.dart';
import 'package:test/test.dart';

/// 値を文字にする所を1本にしたので、**順番と境目をここで固定する**。
///
/// 前はこの4行が6か所に写し取られていて、0.9.2 で選択肢の名前を足したときに
/// 直せたのは3か所だけだった。写し取りは単体試験では見つからない（どの写しも
/// 自分の中では正しい）ので、1本にしたうえで、その1本を縛る。
void main() {
  final formatters = FormatterRegistry();
  const owners = [
    FieldDefinition(
      field: 'status',
      label: '状態',
      options: [
        OptionItem(value: 'shipped', label: '出荷済'),
        OptionItem(value: 10, label: '十'),
      ],
    ),
  ];

  group('cellText の順番', () {
    test('format が書いてあれば、それが最優先（人が明示したものを曲げない）', () {
      const column = ColumnDefinition(
        field: 'amount',
        label: '金額',
        format: 'currency',
      );
      expect(cellText(formatters, owners, column, 1234), '1,234');
    });

    test('format が無ければ、選択肢の名前を出す（コードのまま出さない）', () {
      const column = ColumnDefinition(field: 'status', label: '状態');
      expect(cellText(formatters, owners, column, 'shipped'), '出荷済');
    });

    test('型が違っても同じものとして引く（YAML の 10 と REST の "10"）', () {
      const column = ColumnDefinition(field: 'status', label: '状態');
      expect(cellText(formatters, owners, column, '10'), '十');
    });

    test('選択肢に無い値は、そのまま出す（勝手に作らない）', () {
      const column = ColumnDefinition(field: 'status', label: '状態');
      expect(cellText(formatters, owners, column, 'unknown'), 'unknown');
    });

    test('入力項目も同じ口を通る（詳細画面が一覧と同じ字になる）', () {
      const field = FieldDefinition(field: 'status', label: '状態');
      expect(cellText(formatters, owners, field, 'shipped'), '出荷済');
    });
  });

  group('升に収まらないもの', () {
    test('並びと入れ子は空にする（`[{orderNo: …}]` を人に見せない）', () {
      // 詳細画面の明細が実際にこの字で出ていた。表として描くのが正しく、
      // 1つの升に押し込める相手ではないので、ここでは何も出さない。
      expect(textOf([
        {'lineNo': 1},
      ]), '');
      expect(textOf({'lineNo': 1}), '');
    });

    test('null は空。数と真偽はそのまま', () {
      expect(textOf(null), '');
      expect(textOf(0), '0');
      expect(textOf(false), 'false');
    });
  });

  group('CSV も画面と同じ字で落ちる', () {
    const columns = [ColumnDefinition(field: 'status', label: '状態')];
    final rows = <Map<String, Object?>>[
      {'status': 'shipped'},
    ];

    test('既定では選択肢の名前（前はここだけコードで落ちていた）', () {
      final csv = toCsv(columns, rows, formatters: formatters, owners: owners);
      expect(csv, contains('出荷済'));
      expect(csv, isNot(contains('shipped')));
    });

    test('raw は素の値（取り込み直す相手が居るので当てにいかない）', () {
      final csv = toCsv(
        columns,
        rows,
        options: const CsvOptions(raw: true),
        formatters: formatters,
        owners: owners,
      );
      expect(csv, contains('shipped'));
    });
  });
}
