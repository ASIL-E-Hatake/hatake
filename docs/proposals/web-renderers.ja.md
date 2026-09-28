# 提案：Web の Renderer（Vue / React）

定義から画面を出す先を Flutter 以外にも広げる。**Renderer を交換できる**というのは
最初から言っていたことなので、それを本当にやる回。

1.0 の条件がこれで広がる（→ [1.0 の条件](#10-の条件)）。

## 先に結論

作るのは **Renderer 2つ**ではなく、**土台1つ＋ Renderer 2つ**。土台を厚くするほど
Renderer が薄くなり、**1.0 で凍らせる面が小さくなる**。

```
定義（YAML）
  ↓  @hatake-fw/api         … 読む・検証する（**そのまま使える**。下記）
  ↓  @hatake-fw/runtime     … 画面を動かす土台（controller・registry・router）
  ↓  @hatake-fw/vue3 / react19 … 描くだけ
Vue / React のコンポーネント
```

**依存は増やさない。** 外から持ってくるのは Vue と React 本体だけ（それも
`peerDependencies`）。見た目は**素の CSS** で、利用者が CSS 変数で上書きできる形にする
（→ [見た目](#見た目素の-css-と上書き)）。

## なぜ層を分けるか

Flutter 側が実績を持っている。`hatake_material` は**約6000行**あるが、
**公開しているのは7名だけ**（`MaterialRenderer` / `MaterialFieldBuilder` /
`MaterialDashboardItemBuilder` / `MaterialFieldContext` /
`MaterialDashboardItemContext` / `materialThemeOf` / `unwiredReason`）。

業務の判断（何が必須か・いつ押せるか・何件まで一度に動かせるか）が全部下の層に
在るので、Renderer は**描くだけ**になっている。だから凍らせても困っていない。

逆に土台が薄いと、同じ判断を Vue と React に**2回**書くことになる。書けば必ず
食い違い、食い違ったときに「どちらが正しいか」を決める場所がどこにも無い。
3版を conformance で縛っているのと同じ理由で、ここは1か所に寄せる。

## 層ごとの中身

Flutter の `hatake` パッケージ（公開48名）を「フレームワークに依るか」で仕分けると、
**依らないものが約36、依るものが約12**だった。

### 依らない ＝ `@hatake-fw/runtime`（土台）

| 束 | 中身 |
|---|---|
| 状態を持つもの | `ListController` / `CrudController` / `FormController` / `DetailController` / `DashboardController` / `WizardController` / `ReportController` / `SubTableController`(+Factory) / `CrudMode` / `DashboardItemState` |
| 外との境目 | `RepositoryRegistry` / `ActionRegistry` / `ActionContext` / `ActionHandler` / `ActionOutcome` / `ExportSink` / `ExportRequest` / `PrintSink` / `PrintRequest` / `FailedRow` |
| 申告 | `RegistryKinds` / `RegistryReporter` / `registrySnapshot` / `registrySnapshotJson` / `registrySnapshotSource` |
| 道 | `AppRoute` / `AppTab` / `RouteUrl` / `SystemRouteUrl` / `resolveRouteParams` / `routeFromUri` / `routeToUri` |

**ここが本体。** 1件ずつ Flutter 側の振る舞いに合わせる必要があるので、いちばん手間が
かかる。ただし**書くのは1回**で、Vue と React が同じものを使う。

### 依る ＝ `@hatake-fw/vue3` / `@hatake-fw/react19`

`HatakeApp` / `HatakeScope` / `HatakePageView` と、画面の種類ごとの View
（`HatakeSearchView` / `HatakeCrudView` / `HatakeDetailView` / `HatakeFormView` /
`HatakeWizardView` / `HatakeDashboardView` / `HatakeReportView`）、それに
`Renderer` の口。**約12**。

Flutter で `hatake_material` が7名に収まっているので、ここも**各10名前後**に収めたい。
収まらないなら、それは土台に置くべきものが Renderer に漏れている合図。

### `@hatake-fw/core` は切り出さない（測って分かった）

当初は「`api` は CLI・MCP・probe まで入っているからブラウザに持っていけない」と
見ていたが、**測ったら違った**。

    約束している面（index）から辿れるファイル: 36
    そのうち node: を使っている所:            0

0.9.14 で口を2つに分けたとき、**約束する面に「呼ぶ相手が業務のコード」という線を
引いた**結果、そこから辿れるものは自然にブラウザで動くものだけになっていた。CLI も
MCP も probe も `internal` 側なので、`index` からは辿れない。

したがって **Renderer は `@hatake-fw/api` をそのまま使う**。パッケージを1つ増やさずに
済むので、その方が良い（依存も段取りも減る）。**将来 `index` に `node:` を引くものを
足したらこれが崩れる**ので、[公開面の台帳](../compat.ja.md#公開-api)の試験に
「index から node: を辿れない」を足しておく。

### HTTP は別（`@hatake-fw/http`）

Flutter が `hatake_http`（`RestRepository` ほか10名）を別パッケージにしているのと
同じ形。**枠組みは HTTP を知らない**という線を、パッケージの切り方でも守る。

## パッケージと名前

| パッケージ | 役割 | Flutter で言うと |
|---|---|---|
| `@hatake-fw/runtime` | 画面を動かす土台 | `hatake` |
| `@hatake-fw/http` | REST の Repository | `hatake_http` |
| `@hatake-fw/vue3` | Vue 3 の Renderer | `hatake_material` |
| `@hatake-fw/react19` | React 19 の Renderer | 同上 |
| `@hatake-fw/test` | 試験の道具（要素の見つけ方の契約） | `hatake_test` |
| `@hatake-fw/api` | いまのまま（道具・CLI・MCP） | ― |

### 版は名前に入れる

**`@hatake-fw/vue3` / `@hatake-fw/react19`。** ホストのメジャー版を名前に入れる。
Vue 4 が来たら `@hatake-fw/vue4` という**別パッケージ**を出す。

こうする理由は2つ。

1. **ホストの版に引っ張られない。** Vue 3 の案件と Vue 4 の案件が並走できる。
   名前を役割だけにして自分の major で表すやり方（`vue-router` 方式）だと、
   Vue 3 の案件は古い major に取り残される。
2. **[版の足並み](../compat.ja.md#版の足並み)と衝突しない。** `vue3` と `react19` が
   同じ番号（例：1.0.0）を名乗れる。役割だけの名前にすると、`@hatake-fw/vue` が 2.x
   で core が 1.5、のように番号が割れる。

これは[名前の決めごと](../compat.ja.md#名前の決めごと)（`@hatake-fw/<役割>`）の例外なので、
そちらにも書く。**Dart 側には版を入れない**（Flutter の Material に競合するメジャーが無い）。

## 見た目：素の CSS と上書き

**依存を1つも足さない。** Vuetify / MUI のような既存の UI ライブラリには乗らない。
乗ると速いが、**その版にも引っ張られる**（`hatake_material` が Material に乗っているのと
同じ話）。名前にホストの版を入れてまで引っ張られないようにしたのに、見た目で別の版に
縛られては意味が無い。

代わりに **CSS 変数で上書きできる素の CSS** にする（Ionic と同じ考え方）。

```css
:root {
  --hatake-color-primary: #3f51b5;
  --hatake-color-danger:  #c62828;
  --hatake-space:         8px;
  --hatake-radius:        6px;
  --hatake-font:          system-ui, sans-serif;
  --hatake-table-stripe:  #fafafa;
}
```

利用者が上書きする道は2つ。

1. **CSS 変数を差し替える**（`:root` か、囲みの要素に当てる）。ここがいちばん多い
2. **クラス名を狙う**（`.hatake-table th { … }`）。細かく変えたいとき

**1枚の CSS を Vue と React で共有する。** 置き場は `@hatake-fw/runtime`
（`@hatake-fw/runtime/hatake.css`）。Vue と React で**同じクラス名を出す**ので、
案件の見た目を作り直さずに Renderer を差し替えられる。

**クラス名は契約。** `hatake-table` / `hatake-field` のような名前は、[要素の
見つけ方](#何で縛るか)と同じく公開された約束として扱う（断りなく変えない）。
Renderer の都合で名前を変えると、案件の CSS が黙って効かなくなる。

## 何で縛るか

新しい版（エディション）ではないので、パーサも収束テストも要らない。読むのは
`@hatake-fw/core` が1か所でやる。代わりに縛るのはここ。

**① 土台は conformance を通す。** `spec/conformance/*.json` が見ているのは
「この定義とこの値なら、必須はどれ・計算はいくつ・押せるか」で、それは全部
`FormController` / `CrudController` の仕事。**3版と同じフィクスチャを土台に通す。**

**② シナリオがそのまま回る。** `hatake run --scenario` の期待（`errors` / `computed` /
`enabled` / `hidden` / `required`）は土台の振る舞いそのもの。見本アプリのシナリオ53件が
Flutter と同じ答えを返すことを、Vue/React でも確かめられる。

**③ 要素の見つけ方を契約にする。** Flutter は `hatake_test` の `HatakeFind` で
「編集ボタンはこう探す」を公開している（Renderer の中を読み解かせない＝AI が当てずっぽうに
ならない）。Web 側も同じものが要る。DOM なら `data-hatake="edit:1"` のような印を
**Renderer の勝手ではなく契約として**決める。

**④ 公開面の台帳。** [0.9.15 で3版に入れた](../compat.ja.md#公開-api)仕掛けを、
npm のパッケージが増えるぶんにも効かせる。いまの `spec/public-api.ts.json` は
`@hatake-fw/api` 1つ分の形なので、**Dart と同じ「パッケージごと」の形**に変える。

## 1.0 の条件

凍結チェックリスト（8/8）は済んでいるが、**別のレーンとして「Vue と React が
8種類の画面を描ける」が 1.0 の条件に入った**。

8種類は `crud` / `search` / `master` / `detail` / `form` / `wizard` / `dashboard` /
`report`。

**凍らせる前に実案件で使う。** 1.0 で公開 API が凍るので、書きたての Renderer を
そのまま凍らせない。見本（hatake-example）に Vue/React 版を足して、使用感を見てから出す。

## 決めていないこと（人が決める所）

| # | 問い | いまの当て |
|---|---|---|
| 1 | 土台の名前は `@hatake-fw/runtime` でいいか | 他の案は `client`（HTTP と紛らわしい）・`app`（役割が広すぎる）。Flutter 側は無印 `hatake` だが、npm で `@hatake-fw/hatake` は名乗れない |
| 2 | React は 19 だけか、18 も出すか | 18 も要るなら `@hatake-fw/react18` を別に出す。**案件の実情で決まる話**なので、聞かないと分からない |
| 4 | 見本のどれに足すか | kitchen-sink（DSL 網羅・Renderer の抜けがいちばん出る）は確定として、業務アプリ側にも足すか |

## 進め方

「8種類そろって 1.0」は動かさないが、**途中で実物に当てる回**を挟む。

| # | やること | なぜ |
|---|---|---|
| 1 | `@hatake-fw/runtime`（土台）と 1 枚の CSS | 本体。conformance とシナリオで縛る |
| 3 | **Vue で search / crud / form だけ描いて kitchen-sink に当てる** | **土台の間違いは Renderer を1つ書き切るまで見えない。**8種類を先に全部書いてから直すと、直しが8箇所に散る |
| 4 | 出た直しを土台に戻す | ここで土台が固まる |
| 5 | Vue を8種類に伸ばす | |
| 6 | React を8種類 | 土台が固まっていれば、写す作業に近くなるはず |
| 7 | 見本に Vue/React 版を足して使用感を見る | 凍らせる前に実物で使う |
| 8 | 1.0 | |
