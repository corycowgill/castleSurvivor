#!/bin/bash
# Emberreach asset run: batch 5 (war debris, long overdue) then 9 (volcanic + ogre camp)
# then 10 (hero landmarks), through SD -> rembg -> Trellis 2 -> normalise -> optimise.
# Assumes ComfyUI is ALREADY up on 8188 (tools/run-art-batch.sh style start); it never
# starts a second one, because two ComfyUI processes on an 8 GB card is a hang.
set -u
cd /c/Users/coryc/castleSurvivor
LOG=tools/reports/emberreach-assets.log

curl -s -m 5 http://127.0.0.1:8188/system_stats >/dev/null || {
  echo "ComfyUI is not up on 8188 - start it first" | tee -a $LOG; exit 1; }

for B in 5 9 10; do
  echo "=== batch $B start $(date) ===" | tee -a $LOG
  python -u AssetFactory/scripts/batch_runner.py --batch $B 2>&1 \
    | grep --line-buffered -v "Waiting\.\.\." | tee -a $LOG
  echo "=== batch $B done $(date) ===" | tee -a $LOG
  # Free disk check: the pipeline keeps a raw GLB, an optimised GLB and a source PNG
  # per asset, and ComfyUI keeps its own copy of everything in output/.
  df -h /c | tail -1 | tee -a $LOG
done
echo "=== all batches done $(date) ===" | tee -a $LOG
