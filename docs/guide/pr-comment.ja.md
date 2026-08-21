# 変更した画面を PR に貼る（GitHub Actions）

> **中身**: 定義を直した PR に、「画面がどう変わるか」を**日本語の説明で自動コメント**する仕掛け。
> **読むとき**: 定義を git で管理していて、レビューする人が DSL を読めない（読みたくない）とき。

## なぜ要るか

`hatake explain --diff --markdown` は**貼れる形**を出せる。けれど**貼る仕掛けが無ければ貼られない**。

diff は機械の言葉で出る。

```diff
-      - { field: billTo, label: 請求先 }
+      - { field: billTo, label: 請求先, requiredWhen: { field: kind, value: corp } }
```

これを読んでレビューできるのは DSL を知っている人だけで、しかも**「この変更で何が起きるか」は書いていない**。
説明はそこを言う。

```
項目「請求先」は、区分 が 法人 のときだけ必須になりました
```

## そのまま置ける Actions

`.github/workflows/explain-on-pr.yml` として置く。定義の場所（`DEFS`）だけ直せば動く。

```yaml
name: 画面の変化を PR に書く

on:
  pull_request:
    # 定義を触った PR だけで走る（触っていない PR にコメントは要らない）。
    paths: ["definitions/**.yaml"]

# 書き込むのはコメントだけ。
permissions:
  contents: read
  pull-requests: write

jobs:
  explain:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # 変更前と比べるので、枝分かれした所まで履歴が要る。
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with: { node-version: "22" }

      - name: hatake を入れる
        run: npm install --no-save @hatake/core

      - name: 変わった画面を説明する
        id: explain
        env:
          BASE: ${{ github.event.pull_request.base.sha }}
          DEFS: definitions
        run: |
          set -e
          : > body.md
          # この PR で変わった定義だけを回す（消えたファイルは説明できないので外す）。
          CHANGED=$(git diff --name-only --diff-filter=d "$BASE"...HEAD -- "$DEFS" | grep -E '\.(yaml|yml)$' || true)
          for file in $CHANGED; do
            # --if-changed: 見え方が変わっていなければ**何も出さない**
            # （キーの並べ替え・既定値の明示だけの変更でコメントを増やさない）。
            npx hatake explain --diff --git "$BASE...HEAD" "$file" \
              --markdown --if-changed > one.md || continue
            [ -s one.md ] || continue
            {
              echo "<details><summary><b>$file</b></summary>"
              echo
              cat one.md
              echo
              echo "</details>"
              echo
            } >> body.md
          done
          if [ -s body.md ]; then
            echo "changed=true" >> "$GITHUB_OUTPUT"
          else
            echo "changed=false" >> "$GITHUB_OUTPUT"
          fi

      - name: コメントを書く（あれば書き換える）
        if: steps.explain.outputs.changed == 'true'
        env:
          GH_TOKEN: ${{ github.token }}
          PR: ${{ github.event.pull_request.number }}
          REPO: ${{ github.repository }}
        run: |
          set -e
          # 目印。**同じコメントを書き換える**ために使う（PR が伸びるたびに
          # コメントが増えると、最後のどれが正しいのか読む人に分からない）。
          MARK='<!-- hatake-explain -->'
          { echo "$MARK"; echo; echo "## この PR で画面がどう変わるか"; echo; cat body.md; } > comment.md
          ID=$(gh api "repos/$REPO/issues/$PR/comments" --paginate \
                 --jq "map(select(.body | startswith(\"$MARK\"))) | last | .id // empty")
          if [ -n "$ID" ]; then
            gh api -X PATCH "repos/$REPO/issues/comments/$ID" -F body=@comment.md > /dev/null
            echo "書き換えました（comment $ID）"
          else
            gh api -X POST "repos/$REPO/issues/$PR/comments" -F body=@comment.md > /dev/null
            echo "書きました"
          fi
```

## 決めごと（そのまま使う理由）

| 何 | どうしている | なぜ |
| --- | --- | --- |
| コメントの数 | **1つだけ**（目印で探して書き換える） | 押すたびに増えると、最後のどれが正しいのか読む人に分からない |
| 変化が無いとき | **貼らない**（`--if-changed`） | キーの並べ替え・既定値の明示だけで通知が飛ぶと、次から読まれない |
| 消えたファイル | 外す（`--diff-filter=d`） | 消えた定義は説明できない（変更後が無い） |
| 終了コード | **変えない** | ここは読むための道具。止めるのは `hatake diff`（壊す変更で 1）と `hatake validate` |
| 権限 | `pull-requests: write` だけ | コメント以外は書かない |
| 比べる相手 | `base.sha`...HEAD（枝分かれした所） | `HEAD~1` だと「直前のコミットとの差」になり、PR 全体の変化にならない |

## 一緒に置くと効くもの

説明は**読む**ための道具なので、**止める**道具と組にする。

```yaml
      - name: 壊す変更なら落とす
        run: npx hatake diff --git "$BASE...HEAD" "$file" --caution-as-error

      - name: 書いたのに効かない指定があれば落とす
        run: npx hatake validate --warn-as-error "$file"
```

| 道具 | 役割 | 終了コード |
| --- | --- | --- |
| `explain --diff --markdown` | **画面の言葉で**変化を言う（人が読む） | 変えない |
| `diff` | API の形を壊すか・確かめてほしい変化か | 壊す変更で 1 |
| `validate --warn-as-error` | 書いたのに効かない指定 | 警告で 1 |

## 英語で貼る

`explain` は `--lang en` を取るが、**`--diff` はまだ日本語だけ**（渡すと落ちる）。
英語のレビューが要る PR では、変化の言い直しではなく**変更後の説明**を貼る。

```bash
npx hatake explain "$file" --lang en --markdown > body.md
```

## 貼れない環境（fork からの PR）

fork からの `pull_request` では `GITHUB_TOKEN` に書き込み権限が付かない（GitHub の仕様）。
コメントは貼れないので、**説明をログに出すだけ**にする。

```yaml
      - name: 説明をログに出す（fork からの PR）
        if: github.event.pull_request.head.repo.full_name != github.repository
        run: cat body.md
```

`pull_request_target` を使えば貼れるが、**fork のコードを信頼して動かすことになる**ので勧めない
（定義を読むだけの仕掛けに、その危険を持ち込む理由が無い）。
