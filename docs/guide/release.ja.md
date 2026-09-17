# リリースと入れ方（レジストリに出さずに配る）

まだ npm / pub.dev / Maven Central には出していない。**git の tag だけで配る**。

なぜそうしているかは [1.0 の約束](../compat.ja.md)に書いた。ざっくり言うと、公開すると
**古い版が永久に生き残って直せなくなる**のに対し、git のうちは利用者を数えられるので
**間違えても一斉に直せる**。だから約束（版の落とし方・診断 id・終了コード）を踏んでみる
期間として使っている。

## 決めごと

- **tag は3版まとめて打つ。** Flutter / TypeScript / Java は同じ番号で出す
  （→ [版の足並み](../compat.ja.md#版の足並み)）
- **`main` を指させない。** 指されると、こちらが push した瞬間に相手が動く。
  ロールバックもできない
- **レジストリには出さない。** リリースのワークフローは GitHub Release に貼るだけで、
  publish する道を持っていない（間違って出ないように、道そのものを作っていない）

---

## 入れ方

### Flutter / Dart

`git:` で tag を指す。**`dependency_overrides` が要る**のがこの配り方の肝で、パッケージは
pub.dev 前提（`hatake_core: ^0.0.1`）で書いてあり、その中の overrides は**根のパッケージ
でしか効かない**ため、下に居る `hatake_*` は使う側が指し直す。

```yaml no-check:pubspec.yaml（hatake の定義ではない）
dependencies:
  hatake_material:
    git: { url: https://github.com/ASIL-E-Hatake/hatake.git, ref: v0.9.1, path: flutter/packages/hatake_material }

dependency_overrides:
  hatake:
    git: { url: https://github.com/ASIL-E-Hatake/hatake.git, ref: v0.9.1, path: flutter/packages/hatake }
  hatake_core:
    git: { url: https://github.com/ASIL-E-Hatake/hatake.git, ref: v0.9.1, path: flutter/packages/hatake_core }
```

書き忘れると `pub.dev に hatake_core が無い` で落ちる。**下に居るものを全部書く**のが
面倒だが、公開すればこの節ごと消える。

| 使うもの | 一緒に overrides に要るもの |
|---|---|
| `hatake_material`（画面） | `hatake` / `hatake_core` |
| `hatake_yaml`（YAML を読む） | `hatake_core` |
| `hatake_dsl` / `hatake_print` / `hatake_http` | `hatake_core` |
| `hatake_encoding` | （無し） |

### TypeScript（`@hatake-fw/api`）

[Releases](https://github.com/ASIL-E-Hatake/hatake/releases) に貼ってある `.tgz` を指す。

```bash
npm i -D https://github.com/ASIL-E-Hatake/hatake/releases/download/v0.9.1/hatake-fw-api-0.9.1.tgz
```

git の URL（`npm i github:…`）では入らない。理由は2つあって、**リポジトリの根に
`package.json` が無い**のと、**npm は subdir 指定に対応していない**から（pnpm / yarn は
できる）。tarball なら両方とも関係ないし、**`spec/` を同梱できる**のが大きい
（CLI と MCP は実行時に `spec/` を読むので、同梱しないと `--spec` を毎回渡すことになる）。

入れたあとは `npx hatake …` がそのまま効く（npx はレジストリより先にローカルの bin を見る）。

### Java

[JitPack](https://jitpack.io/) が tag を見てビルドする（`jitpack.yml` がモノレポのどこを
ビルドするかを指図している）。

```groovy no-check:build.gradle（hatake の定義ではない）
repositories {
    maven { url 'https://jitpack.io' }
}
dependencies {
    implementation 'com.github.ASIL-E-Hatake:hatake:v0.9.1'
}
```

> ⚠️ **v0.9.0 の JitPack は落ちたままです**（`java/gradlew` に実行ビットが入って
> いなかったため＝`./gradlew: Permission denied`）。tag の中身は動かせないので、
> **v0.9.0 で Java 版を使うなら、tag を clone して自分でビルド**してください:
>
> ```bash
> git clone --branch v0.9.0 --depth 1 https://github.com/ASIL-E-Hatake/hatake.git
> cd hatake/java && sh gradlew publishToMavenLocal -x test
> ```
>
> そのうえで `mavenLocal()` から `io.github.asil-e-hatake:hatake-core:0.9.0` を引きます。
> **v0.9.1 から直っています。** 座標は <https://jitpack.io/#ASIL-E-Hatake/hatake> で
> 実物を見て確かめてください（JitPack は最初の1回だけビルドに数分かかります）。

---

## 出す手順（人がやること）

1. `CHANGELOG.md` の「未リリース」に見出しを付ける（`## 0.9.1 — 2026-09-17`）
2. 版を3版そろえて上げる — `typescript/package.json` / `java/build.gradle` /
   `flutter/packages/*/pubspec.yaml`
3. `main` に入れる
4. tag を打って push する

```bash
git tag v0.9.1
git push origin v0.9.1
```

あとは [Release ワークフロー](../../.github/workflows/release.yml)が、

- tag と `package.json` の版が揃っているかを見て（違えば**貼る前に落ちる**）
- 固めて、リポジトリの外に入れて、叩いて（spec が引けるか・bin が張られているか）
- GitHub Release に `.tgz` を貼る

Java の JitPack は、誰かが最初に取りに来たときにビルドされる（tag を打っただけでは
走らない）。**打った直後に一度 <https://jitpack.io/#ASIL-E-Hatake/hatake> を開いて、
ビルドが緑になるか自分で確かめる**（放っておくと、最初の利用者が失敗を踏む）。

---

## 機械で確かめていること

手引きに書いた入れ方は、**書いただけでは必ず腐る**（読んだ人の所で初めて落ちる）。
だから CI が毎回やっている:

| 見るもの | どうやって |
|---|---|
| Dart の git 依存が本当に解決できる | 裸のクローンを作って `file://` で指し、`pub get` して**定義を1枚読ませる** |
| `dependency_overrides` が本当に要る | 書かない版も走らせて、**落ちること**を確かめる（落ちなくなったらこの手引きが古い） |
| TypeScript が配った形で動く | `npm pack` → **リポジトリの外**に `npm i` → `reference` / `examples` / `rules` を叩き、雛形を検証する |
| Java が配れる形になる | `publishToMavenLocal`（JitPack が叩くのと同じ口） |

リポジトリの中で試すと `spec/` が上に見つかってしまい、**同梱できていなくても通る**。
だから TypeScript の確認は必ず外でやる。
