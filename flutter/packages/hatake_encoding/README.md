# hatake_encoding

文字コード変換の **opt-in アダプタ**。cp932（Windows / Excel の Shift_JIS）・Shift_JIS（JIS X 0208）・EUC-JP。

Framework は CSV などの**文字列を作るところまで**で、ファイルを書くのは出力先（`HatakeScope(exportSink:)`）の責務。文字コード変換も同じ理由でこちら側にある。使わない人が 9,000 文字の変換表を抱えないよう、別パッケージにしてある。

## 使う

定義側は「どの文字コードで欲しいか」を言うだけ。

```yaml
actions:
  - id: csv
    type: export
    label: CSV出力（Shift_JIS）
    config: { filename: 受注一覧, charset: cp932 }
```

出力先が、その名前でバイト列にする。

```dart
final encodings = EncodingRegistry();

HatakeScope(
  exportSink: (request) async {
    // request.charset に定義の宣言が入っている（既定は utf-8）。
    final bytes = encodings.encode(request.charset, request.text);
    await save(request.filename, bytes);   // ダウンロード / 保存 / 送信
  },
  ...
);
```

## `cp932` と `shift_jis` は別物

**実務で「Shift_JIS で下さい」と言われたら、ほぼ `cp932`。**

| | cp932 | shift_jis |
|---|---|---|
| 別名 | windows-31j / MS932 | JIS X 0208 |
| 書ける文字 | 9,401 | 7,070 |
| `①` `㈱`（NEC 特殊文字） | ✅ | ❌ |
| `髙` `﨑`（IBM 拡張） | ✅ | ❌ |
| `～`(U+FF5E 全角チルダ) | ✅ | ❌ |

Excel が書き出した CSV には `①` や `～` が普通に混ざる。そこで `shift_jis`（厳密）を選ぶと変換で落ちる。逆に**受け側が汎用機で JIS X 0208 しか受けない**なら、`shift_jis` を選んで「拡張文字が来たら弾く」のが正しい。どちらを選ぶかは相手の仕様の話なので、選べるようにしてある。

`Windows-31J` `MS932` `SJIS` `EUC-JP` のような**表記ゆれは吸収する**（大文字小文字・区切り記号は無視）。ただし別名で挙動は変えない。

## 変換できない文字

既定で例外（[UnmappableCharacterException]）。黙って `?` に化けさせない。

```dart
encodings.encode('shift_jis', '髙島屋');                    // 例外
encodings.encode('shift_jis', '髙島屋', replacement: '?');  // ?島屋
```

顧客名が `?` になって渡ったことに誰も気づかない、が一番困る。置き換えるなら**そう決めて書く**（連携仕様にも書く）。

## 変換表の出自

`lib/src/tables/*.g.dart` は生成物。**Python 標準ライブラリの codec** から書き出している。

```bash
python tool/generate_tables.py
```

このパッケージに実行時の依存は無い（表を持っているだけ）。正しさは3者の突き合わせで担保している。

| | 何を確かめるか |
|---|---|
| Python | 表の出自（生成元） |
| Dart（このパッケージ） | 生成表を使った実装が期待どおりか |
| Java（JVM の `Charset`） | **独立した実装**と同じバイト列になるか |

期待値は [`spec/conformance/charset.json`](../../../spec/conformance/charset.json)。Dart と Java が同じファイルを食う。手で書けない表は、独立した実装と突き合わせるしかない。

### IBM 拡張は同じ文字に2通りのバイト列がある

`髙` は cp932 で `FB FC`（NEC選定 IBM 領域）と `EE E0`（IBM 領域）の両方。**書くのは Windows / Excel と同じ `FB FC`、読むのは両方受ける**（他所で作られたデータは後者のことがある）。

## 対応していないもの

- **ISO-2022-JP（JISコード）**: メール用。エスケープシーケンスで状態を持つので、表引きでは書けない。需要が出たら別に作る
- **JIS X 0212（補助漢字）/ JIS X 0213**: `euc_jis_2004` 等。同じ作り方で足せる
- **BMP 外の文字**（`𠮷` などサロゲートペア）: どの日本語コードにも無いので変換できない（例外になる）
