#!/bin/bash
# Re-run every asset in AssetFactory/catalog/skipped.json that still has no GLB.
#
# batch_runner.py skips an asset permanently after a failure so a bad prompt cannot
# eat the whole night. Most entries in skipped.json are not bad prompts though -
# they are assets whose 120 s SD step timed out because something else (a browser
# harness, another model) had the machine. Those deserve another go once the box
# is quiet. Assets that fail again here are the real failures.
#
#   tools/rerun-skipped.sh            # everything still missing
#   tools/rerun-skipped.sh id,id      # just these
set -u
cd /c/Users/coryc/castleSurvivor
LOG=tools/reports/rerun-skipped.log

curl -s -m 5 http://127.0.0.1:8188/system_stats >/dev/null || {
  echo "ComfyUI is not up on 8188 - start it first" | tee -a $LOG; exit 1; }

IDS=${1:-$(node -e "
const fs=require('fs');
const skipped=JSON.parse(fs.readFileSync('AssetFactory/catalog/skipped.json','utf8'));
const todo=skipped.filter(id=>!fs.existsSync('Game3DAssets/'+id+'.glb'));
console.log(todo.join(','));")}

[ -z "$IDS" ] && { echo "nothing to re-run"; exit 0; }
echo "=== re-running $(echo $IDS | tr ',' '\n' | wc -l) skipped assets $(date) ===" | tee -a $LOG
echo "$IDS" | tee -a $LOG

# Clear the skip list first: an asset that fails again is re-added by the runner.
node -e "
const fs=require('fs'), p='AssetFactory/catalog/skipped.json';
const keep=JSON.parse(fs.readFileSync(p,'utf8')).filter(id=>fs.existsSync('Game3DAssets/'+id+'.glb'));
fs.writeFileSync(p, JSON.stringify(keep,null,2));"

for ID in $(echo $IDS | tr ',' ' '); do
  echo "--- $ID $(date)" | tee -a $LOG
  python -u AssetFactory/scripts/run_pipeline.py --ids $ID 2>&1 \
    | grep --line-buffered -v "Waiting\.\.\." | tee -a $LOG
  [ -f "Game3DAssets/$ID.glb" ] && echo "  OK $ID" | tee -a $LOG || echo "  STILL FAILING $ID" | tee -a $LOG
done
echo "=== re-run done $(date) ===" | tee -a $LOG
