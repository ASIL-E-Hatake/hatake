import 'package:hatake_core/hatake_core.dart';
import 'package:test/test.dart';

/// **1件を指す値**の作り方と比べ方。
///
/// ここが緩いと、一括処理が数え違えます。鍵は画面の中で「選んだ行の集まり」
/// （`Set`）として持ち回っているので、値で比べられないと**同じ行を2回選べて**
/// しまうからです。素の `Map` を使わずに [RecordKey] を置いたのはこのためです。
void main() {
  group('鍵を作る', () {
    test('単一なら素の値（いままでと同じ＝Repository を直さなくてよい）', () {
      expect(recordKeyOf(['orderNo'], {'orderNo': 'SO-1'}), 'SO-1');
    });

    test('複合なら RecordKey（書いた順のまま）', () {
      final key = recordKeyOf(['orderNo', 'lineNo'], {
        'lineNo': 2,
        'orderNo': 'SO-1',
        'customer': '山田商事',
      });
      expect(key, isA<RecordKey>());
      // 行の中の並びではなく**定義に書いた順**（URL の道の順がこれで決まる）。
      expect((key! as RecordKey).fields, ['orderNo', 'lineNo']);
      expect((key as RecordKey).values, ['SO-1', 2]);
    });

    test('1つでも欠けていたら null（その行は指せない）', () {
      // 欠けたまま組み立てると、別の行に当たる鍵を作ってしまう。
      expect(recordKeyOf(['orderNo', 'lineNo'], {'orderNo': 'SO-1'}), isNull);
    });

    test('項目が無ければ null', () {
      expect(recordKeyOf([], {'orderNo': 'SO-1'}), isNull);
    });
  });

  group('値で比べる', () {
    test('同じ中身なら等しい（素の Map はここで別物になる）', () {
      const a = RecordKey({'orderNo': 'SO-1', 'lineNo': 2});
      const b = RecordKey({'orderNo': 'SO-1', 'lineNo': 2});
      expect(a, b);
      expect({a}.contains(b), isTrue);
      // 集まりに入れても1つにまとまる（＝同じ行を2回選べない）。
      final set = <RecordKey>{}..addAll([a, b]);
      expect(set, hasLength(1));
    });

    test('並びが違えば別の鍵（URL の道が変わるので等しいと言ってはいけない）', () {
      const a = RecordKey({'orderNo': 'SO-1', 'lineNo': 2});
      const b = RecordKey({'lineNo': 2, 'orderNo': 'SO-1'});
      expect(a, isNot(b));
    });

    test('値が違えば別の鍵', () {
      const a = RecordKey({'orderNo': 'SO-1', 'lineNo': 2});
      const b = RecordKey({'orderNo': 'SO-1', 'lineNo': 3});
      expect(a, isNot(b));
    });
  });

  group('画面の引数にほどく／組み立てる', () {
    test('単一は項目名そのままで渡る', () {
      expect(recordKeyParams(['orderNo'], 'SO-1'), {'orderNo': 'SO-1'});
    });

    test('複合は項目ごとに1つずつ渡る', () {
      const key = RecordKey({'orderNo': 'SO-1', 'lineNo': 2});
      expect(recordKeyParams(['orderNo', 'lineNo'], key),
          {'orderNo': 'SO-1', 'lineNo': 2});
    });

    test('ほどいて組み立て直すと元に戻る', () {
      const fields = ['orderNo', 'lineNo'];
      const key = RecordKey({'orderNo': 'SO-1', 'lineNo': 2});
      expect(recordKeyFromParams(fields, recordKeyParams(fields, key)), key);
    });

    test('単一は `id` でも受ける（`key` を省いた画面の既定なので壊さない）', () {
      expect(recordKeyFromParams(['orderNo'], {'id': 'SO-1'}), 'SO-1');
    });

    test('複合は1つでも足りなければ null（取りに行かない）', () {
      // 足りないまま取りに行くと、別の1件が開く。
      expect(
        recordKeyFromParams(['orderNo', 'lineNo'], {'orderNo': 'SO-1'}),
        isNull,
      );
    });
  });
}
