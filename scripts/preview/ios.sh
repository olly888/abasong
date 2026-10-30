#!/bin/sh
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
preview_status=$(curl -fsS --max-time 3 http://127.0.0.1:8081/status || true)
if [ "$preview_status" != "packager-status:running" ]; then
  echo "请先在另一个终端运行 ./scripts/dev preview:native" >&2
  exit 1
fi
xcode_developer=$(xcode-select -p)
xcode_contents=$(dirname "$xcode_developer")
if [ -d "$xcode_contents/Applications/DeviceHub.app" ]; then
  open "$xcode_contents/Applications/DeviceHub.app"
elif [ -d "$xcode_developer/Applications/Simulator.app" ]; then
  open "$xcode_developer/Applications/Simulator.app"
fi
export EXPO_PACKAGER_PROXY_URL=http://127.0.0.1:8081
exec "$repo_root/scripts/dev" --filter @abasong/mobile exec expo run:ios --device "${ABASONG_IOS_DEVICE:-iPhone 18 Pro}" --no-bundler "$@"
