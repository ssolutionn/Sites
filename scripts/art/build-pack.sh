#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
BLENDER_BIN="${BLENDER_BIN:-blender}"
for script in build_cozy_assets.py build_cozy_characters.py build_cozy_kitchen.py; do
  "$BLENDER_BIN" --background --factory-startup -t 2 --python-exit-code 1 --python "scripts/art/$script"
done
npm run models:sync
