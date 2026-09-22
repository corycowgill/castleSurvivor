#!/bin/bash
# Usage: tools/run-trellis-batch.sh <batch>  — starts ComfyUI, runs the catalog batch through SD → rembg → Trellis → optimize, leaves ComfyUI running.
B=${1:?batch number}
cd /c/Users/coryc/ComfyUI && (./venv_trellis/Scripts/python.exe main.py --listen 127.0.0.1 --port 8188 > /c/Users/coryc/castleSurvivor/tools/reports/comfyui-batch$B.log 2>&1 &)
for i in $(seq 1 40); do curl -s -m 3 http://127.0.0.1:8188/system_stats >/dev/null && break; sleep 3; done
cd /c/Users/coryc/castleSurvivor
echo "=== batch $B $(date)"; python -u AssetFactory/scripts/batch_runner.py --batch $B 2>&1 | grep --line-buffered -v "Waiting\.\.\."
echo "=== done $(date)"
