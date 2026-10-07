#!/bin/sh
# JitPack が tag から Java 版を組むときの手順（jitpack.yml の install から呼ぶ）。
#
# **wrapper の jar が開けないときは、同じ版の Gradle を直接取ってきて組む。**
#
# JitPack で、ときどき次のように落ちる（v0.9.26 と v0.9.28 で踏んだ）:
#
#   Error: An unexpected error occurred while trying to open file
#          /home/jitpack/build/java/gradle/wrapper/gradle-wrapper.jar
#
# jar は 2026-09-16 から変わっておらず、git の中身は正しい（開ける・33 項目）。同じ jar で
# v0.9.27 は一発で通り、v0.9.26 は組み直しで通った＝**JitPack の側で、ときどき開けない**。
# 組み直しは人が JitPack で頼むしかないので、ここで逃げ道を持つ。
#
# 版は gradle-wrapper.properties から読む（版を2か所に書かない）。jar の状態はログに出す
# （次に起きたとき、何が起きていたかを後から見られるように）。
set -eu
cd "$(dirname "$0")"

TASKS="publishToMavenLocal -x test"
JAR=gradle/wrapper/gradle-wrapper.jar

echo "== wrapper の jar: $(wc -c < "$JAR" 2>/dev/null || echo '読めない') バイト"

# shellcheck disable=SC2086
if sh gradlew $TASKS; then
  exit 0
fi

echo "== gradlew で組めませんでした。同じ版の Gradle を直接取ってきて組みます。"
URL=$(sed -n 's/^distributionUrl=//p' gradle/wrapper/gradle-wrapper.properties | sed 's/\\:/:/g')
NAME=$(basename "$URL" | sed 's/-bin\.zip$//; s/-all\.zip$//')
WORK=$(mktemp -d)
echo "== $URL"
if command -v curl > /dev/null 2>&1; then
  curl -fsSL --retry 3 -o "$WORK/gradle.zip" "$URL"
else
  wget -q -O "$WORK/gradle.zip" "$URL"
fi
# unzip が無い環境でも動くように、JDK の jar で解く（実行ビットは付かないので sh で呼ぶ）。
(cd "$WORK" && jar xf gradle.zip)
# shellcheck disable=SC2086
sh "$WORK/$NAME/bin/gradle" $TASKS
