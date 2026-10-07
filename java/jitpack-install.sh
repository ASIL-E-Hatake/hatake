#!/bin/sh
# JitPack が tag から Java 版を組むときの手順（jitpack.yml の install から呼ぶ）。
#
# **落ちたら少し待って組み直す（最大3回）。落ちた回は、箱の様子をログに残す。**
#
# JitPack で、ときどき Java が jar を開けずに落ちる（v0.9.26 / v0.9.28 / v0.9.29）:
#
#   Error: An unexpected error occurred while trying to open file
#          /home/jitpack/build/java/gradle/wrapper/gradle-wrapper.jar
#
# 分かっていること:
#   ・jar は正しい（git の中身・大きさ 43764 バイト・開ける）。直前にシェルからは読めている
#   ・JitPack と同じ JDK（OpenJDK 21.0.2）と JAVA_TOOL_OPTIONS で、手元の Docker では通る
#   ・0.9.29 では「同じ版の Gradle を直接取ってきて組む」逃げ道を入れたが、取ってきた Gradle
#     の jar（gradle-instrumentation-agent）も同じように読めずに落ちた＝**この jar に限らず、
#     その回の箱で Java が jar を読めていない**
#   ・JitPack の画面で頼み直す（Get it）と、そのうち通る
# 分かっていないこと: 箱の何が足りないのか（メモリ・開けるファイルの数・ディスク）。
# なので、組み直しを箱の中でやり、**落ちた回の様子を残す**（次に当たりを付けるため）。
set -u
cd "$(dirname "$0")"

TASKS="publishToMavenLocal -x test"
TRIES=3
WAIT=20

show() {
  echo "== 箱の様子"
  echo "   jar: $(wc -c < gradle/wrapper/gradle-wrapper.jar 2>/dev/null || echo '読めない') バイト" \
       "$(sha256sum gradle/wrapper/gradle-wrapper.jar 2>/dev/null | cut -c1-16)"
  echo "   開けるファイルの数: $(ulimit -n)  プロセスの数: $(ulimit -u 2>/dev/null || echo '?')"
  for f in /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.current \
           /sys/fs/cgroup/memory/memory.limit_in_bytes /sys/fs/cgroup/memory/memory.usage_in_bytes; do
    [ -r "$f" ] && echo "   $f: $(cat "$f")"
  done
  grep -E '^(MemTotal|MemAvailable|CommitLimit|Committed_AS):' /proc/meminfo 2>/dev/null | sed 's/^/   /'
  df -h . /tmp 2>/dev/null | sed 's/^/   /'
  java -version 2>&1 | grep -v '^Picked up' | head -1 | sed 's/^/   /'
}

n=1
while [ "$n" -le "$TRIES" ]; do
  echo "== 組む（$n / $TRIES 回目）"
  # shellcheck disable=SC2086
  if sh gradlew $TASKS; then
    exit 0
  fi
  show
  if [ "$n" -lt "$TRIES" ]; then
    echo "== $WAIT 秒待って組み直します。"
    sleep "$WAIT"
  fi
  n=$((n + 1))
done

echo "== $TRIES 回とも組めませんでした。JitPack の画面で失敗したビルドを消して頼み直してください" \
     "（JitPack は失敗も覚えているので、消さないと同じ結果を返し続けます）。"
exit 1
