#!/bin/bash
# Starts ComfyUI, regenerates the painterly decals, then runs Trellis catalog batch 8. Sequential on purpose (8 GB VRAM).
cd /c/Users/coryc/ComfyUI && (./venv_trellis/Scripts/python.exe main.py --listen 127.0.0.1 --port 8188 > /c/Users/coryc/castleSurvivor/tools/reports/comfyui-art.log 2>&1 &)
for i in $(seq 1 40); do curl -s -m 3 http://127.0.0.1:8188/system_stats >/dev/null && break; sleep 3; done
cd /c/Users/coryc/castleSurvivor
echo "=== decals $(date)"; node AssetFactory/scripts/gen-textures.mjs --set decals --force --only bones,cobblePatch,roots,rubble,cracks 2>&1 | grep -v -i "warning\|reparsing\|eliminate\|trace"
echo "=== batch 8 $(date)"; python AssetFactory/scripts/batch_runner.py --batch 8 2>&1 | grep -v "Waiting\.\.\."
echo "=== done $(date)"
