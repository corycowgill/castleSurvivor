#!/bin/bash
# Mirefen asset run: batch 11 (the swamp itself) then 12 (the fen-folk camp and
# the three landmarks), through SD -> rembg -> Trellis 2 -> normalise -> optimise.
# Assumes ComfyUI is ALREADY up on 8188; it never starts a second one, because two
# ComfyUI processes on an 8 GB card is a hang.
#
# NOTHING ELSE MAY TOUCH THE GPU WHILE THIS RUNS. A headless-Chrome tool
# (playtest.mjs, validate-glb.mjs, coop-verify.mjs, mirefen-verify.mjs) starves
# ComfyUI past run_pipeline.py's SD deadline; batch_runner skips an asset for good
# after two failures, so a contention blip is indistinguishable from a bad prompt.
# Eleven of Emberreach's batch 5 were lost exactly this way.
set -u
cd /c/Users/coryc/castleSurvivor
LOG=tools/reports/mirefen-assets.log

curl -s -m 5 http://127.0.0.1:8188/system_stats >/dev/null || {
  echo "ComfyUI is not up on 8188 - start it first" | tee -a $LOG; exit 1; }

for B in 11 12; do
  echo "=== batch $B start $(date) ===" | tee -a $LOG
  python -u AssetFactory/scripts/batch_runner.py --batch $B 2>&1 \
    | grep --line-buffered -v "Waiting\.\.\." | tee -a $LOG
  echo "=== batch $B done $(date) ===" | tee -a $LOG
  # The pipeline keeps a raw GLB, an optimised GLB and a source PNG per asset, and
  # ComfyUI keeps its own copy of everything in output/.
  df -h /c | tail -1 | tee -a $LOG
done
echo "=== all batches done $(date) ===" | tee -a $LOG
