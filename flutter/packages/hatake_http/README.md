# hatake_http

定義が宣言している **REST API と話す `Repository`**。opt-in アダプタで、依存は `hatake_core` だけ（Flutter も要らない）。

`hatake openapi` は定義から API 仕様を吐く。このパッケージはその仕様**そのまま**で通信するので、「サーバの仕様」と「クライアントの実装」が2つの推測ではなく、1つの宣言の言い直しになる。

## 3行で繋ぐ

```dart
final repositories = restRepositories(
  baseUrl: '/api',
  send: send,                                    // ↓ これだけ自分で書く
  collections: {'orderRepository': 'orders'},
);
HatakeScope(repositories: RepositoryRegistry(repositories), ...);
```

## 通信そのものは持たない

`send` は `HttpRequest → Future<HttpResponse>` の関数1つ。**依存を1つも増やさないため**にこうしてある（`package:http` を焼き付けると、dio を使いたい人・社内のインターセプタを通したい人・web で `fetch` を使いたい人に不要な依存が乗る）。

```dart
Future<HttpResponse> send(HttpRequest request) async {
  final response = await http.Client().send(
    http.Request(request.method, request.url)
      ..headers.addAll(request.headers)
      ..body = request.body ?? '',
  );
  return HttpResponse(response.statusCode, await response.stream.bytesToString());
}
```

## 話す形（`hatake openapi` が宣言しているもの）

```
GET    <collection>?page=&pageSize=&sortField=&sortAscending=&<絞り込み…>  → {items, totalCount}
POST   <collection>                                                        → 作ったレコード
GET    <collection>/{key}                                                  → 1件（404 は null）
PUT    <collection>/{key}                                                  → 直したレコード
DELETE <collection>/{key}                                                  → 204
```

* 絞り込みは**項目名そのまま**。空文字と `null` は送らない（`?status=` は「空文字に一致するもの」を頼むことになる）
* 範囲（`between`）と複数選択（`in`）は**同じ名前を2回**（配列の既定の書き方）
* キーは道の最後。記号は escape する（`C 1/2` → `C%201%2F2`）
* 名前が合っていることは [`spec/conformance/rest_query.json`](../../../spec/conformance/rest_query.json) が縛る。**片方だけ直しても失敗しない**のが怖い所で、サーバは知らない名前を黙って無視する＝画面は出るのに絞り込みが効かず、どこにもエラーが出ない

## 認証

トークンは**毎回聞く**（期限が切れるので、固定の地図では足りない）。

```dart
restRepositories(
  baseUrl: '/api',
  send: send,
  headers: () async => {'authorization': 'Bearer ${await session.token()}'},
  collections: {...},
);
```

`roles` は**画面の出し分けだけ**。本当の遮断は API 側の仕事で、それはこのパッケージの外。

## 失敗は型で返す

| 状況 | 何が飛ぶか |
|---|---|
| 401 / 403 | `RepositoryUnauthorizedException`（アプリがログインへ飛ばす） |
| 400 ＋ 検証の payload | `RepositoryValidationException`（`errors` が**項目名 → メッセージ**。フォームに戻せる） |
| その他の非 2xx | `RepositoryHttpException`（状態・何をしていたか・本文） |
| 宣言と違う形 | `RepositoryShapeException` |
| `findByKey` の 404 | 例外ではなく **null**（「無い」は答え） |

**宣言と違う形で落ちる**のは意図的。配列だけを返す API に黙って合わせると、`items` が読めず「0 件」＝空の画面になり、原因を通信まで遡れなくなる。

## 合わない API

無理に曲げないほうがよい。`Repository` は5つのメソッドしかない interface で、Framework は最初から HTTP を知らない。**手で書けばいい**（このパッケージも同じことをしているだけ）。

## 決めていないこと

- 再試行・timeout・キャッシュ・並列制御（`send` の中＝アプリの層でやること）
- 楽観ロック（`If-Match` / バージョン列）。DSL に版の概念が無いので、まだ持たない
- GraphQL / gRPC（`Repository` を手で書けば繋がる）
