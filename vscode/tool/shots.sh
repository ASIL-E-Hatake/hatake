#!/usr/bin/env bash
# 手引き（docs/guide/vscode.ja.md）の画像を撮る。**手で撮らない**＝版を上げたら撮り直すだけ。
#
#   bash vscode/tool/shots.sh        … docs/guide/images/vscode/*.png を撮り直す
#
# code-server（ブラウザで動く VS Code）のコンテナに、固めた .vsix と設定を入れて開き、
# puppeteer で操作して撮る（test/shots.e2e.mjs）。手元に要るのは Docker と bash だけ。
# 先に `node vscode/tool/package.mjs` で .vsix を作っておくこと。
set -euo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
VERSION="$(node -p "require('$HERE/package.json').version" 2>/dev/null || sed -n 's/.*"version": "\(.*\)".*/\1/p' "$HERE/package.json" | head -1)"
VSIX="$HERE/hatake-vscode-$VERSION.vsix"
WORK="$HERE/dist/shots"
OUT="$ROOT/docs/guide/images/vscode"
NET=hatake-shots
CODE=hatake-shots-code

win() { (cd "$1" && pwd -W 2>/dev/null || pwd); }
[ -f "$VSIX" ] || { echo "先に node vscode/tool/package.mjs で $VSIX を作ってください" >&2; exit 1; }

# 撮影用の作業場（見本の定義と、言われることがある定義・書き間違えた定義）。
rm -rf "$WORK" && mkdir -p "$WORK/project/definitions" "$WORK/ext" "$OUT"
cp "$ROOT/spec/examples/customer_master.yaml" "$ROOT/spec/examples/roles_app.yaml" "$WORK/project/definitions/"
cat > "$WORK/project/definitions/order_cancel.yaml" <<'YAML'
page:
  type: crud
  id: order_cancel
  title: 受注の取消
  repository: orderRepository
  key: orderNo
  table:
    rowActions: [edit]
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: customerName, label: 取引先 }
      - { field: status, label: 状態, type: badge }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, type: text, required: true }
          - { field: customerName, label: 取引先, type: text }
  actions:
    - { id: cancel, type: delete, label: 取消 }
YAML
sed 's/  table:/  tabel:/' "$WORK/project/definitions/order_cancel.yaml" > "$WORK/project/definitions/typo.yaml"
: > "$WORK/project/definitions/new_page.yaml"
echo "v$VERSION" > "$WORK/project/hatake.version"
cp "$VSIX" "$WORK/ext/hatake.vsix"
cat > "$WORK/ext/settings.json" <<'JSON'
{
  "security.workspace.trust.enabled": false,
  "workbench.startupEditor": "none",
  "workbench.tips.enabled": false,
  "workbench.colorTheme": "Default Light Modern",
  "editor.minimap.enabled": false,
  "editor.fontSize": 14,
  "extensions.ignoreRecommendations": true,
  "telemetry.telemetryLevel": "off",
  "update.mode": "none",
  "chat.commandCenter.enabled": false,
  "workbench.secondarySideBar.defaultVisibility": "hidden"
}
JSON
chmod -R a+rwX "$WORK"

docker network inspect "$NET" > /dev/null 2>&1 || docker network create "$NET" > /dev/null
docker rm -f "$CODE" > /dev/null 2>&1 || true
docker run -d --name "$CODE" --network "$NET" \
  -v "$(win "$WORK/project"):/home/coder/project" \
  -v "$(win "$WORK/ext"):/x" \
  --entrypoint /bin/sh codercom/code-server:latest \
  -c 'mkdir -p ~/.local/share/code-server/User && cp /x/settings.json ~/.local/share/code-server/User/ &&
      code-server --install-extension /x/hatake.vsix &&
      exec code-server --auth none --bind-addr 0.0.0.0:8080 /home/coder/project' > /dev/null

cleanup() { docker rm -f "$CODE" > /dev/null 2>&1 || true; }
trap cleanup EXIT

# puppeteer は code-server と**同じネットワークの中から localhost で**開く（Webview は安全な
# 接続＝localhost か https でないと動かない仕組みを使うので、名前で開くと真っ白になる）。
docker run --rm --network "container:$CODE" \
  -v "$(win "$WORK/project"):/project" -v "$(win "$OUT"):/out" -v "$(win "$HERE/test"):/t:ro" \
  ghcr.io/puppeteer/puppeteer:latest \
  sh -c "cp /t/shots.e2e.mjs . && node shots.e2e.mjs http://localhost:8080 /project /out $VERSION"
