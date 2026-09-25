#!/bin/bash
# Bloodmarch asset run, two-phase. For each batch: every SD image first (SDXL loads
# once), then every Trellis mesh (Trellis loads once). One asset at a time through
# the single-asset path swapped both models in and out of the 8 GB card per asset,
# which was ~8 min each; split, it is ~45 s + ~3 min. The image pass also leaves
# the source PNGs to look at before any Trellis time is spent on them
# (tools/reports/bloodmarch-images-<batch>.png contact sheets, see --sheet).
#
# Starts ComfyUI on 8188 if it is not up. Waits for any running run_pipeline.py to
# finish first, so it can be launched while a previous run winds down.
#
# NOTHING ELSE MAY TOUCH THE GPU WHILE THIS RUNS: no playtest.mjs, no validate-glb,
# no view-anim. See tools/run-mirefen-assets.sh for why (silent asset loss).
#
#   tools/run-bloodmarch-assets.sh              # batches 13 14 9 5 10
#   tools/run-bloodmarch-assets.sh 14 9         # just these
#   tools/run-bloodmarch-assets.sh --art        # the ground art only
set -u
cd /c/Users/coryc/castleSurvivor
LOG=tools/reports/bloodmarch-assets.log
PY=python

pending_ids() {  # ids in a batch with no game GLB yet
  node -e "
const fs=require('fs'); const a=JSON.parse(fs.readFileSync('AssetFactory/catalog/assets.json','utf8'));
console.log(a.filter(x=>x.batch===$1 && x.status!=='rejected' && !fs.existsSync('Game3DAssets/'+x.id+'.glb')).map(x=>x.id).join(','));"
}
no_image_ids() {  # of those, the ones with no source image yet
  node -e "
const fs=require('fs'); const a=JSON.parse(fs.readFileSync('AssetFactory/catalog/assets.json','utf8'));
const dirs=fs.readdirSync('AssetFactory/source_images').map(d=>'AssetFactory/source_images/'+d);
console.log(a.filter(x=>x.batch===$1 && x.status!=='rejected' && !fs.existsSync('Game3DAssets/'+x.id+'.glb') && !dirs.some(d=>fs.existsSync(d+'/'+x.id+'.png'))).map(x=>x.id).join(','));"
}

# Wait for a previous single-asset run to finish (its process name is run_pipeline.py)
while powershell -NoProfile -Command "(Get-CimInstance Win32_Process | Where-Object { \$_.CommandLine -match 'run_pipeline.py' }).Count" 2>/dev/null | grep -qv '^0$'; do
  echo "waiting for a running run_pipeline.py to finish $(date +%H:%M)"; sleep 30
done

if ! curl -s -m 5 http://127.0.0.1:8188/system_stats >/dev/null; then
  (cd /c/Users/coryc/ComfyUI && (./venv_trellis/Scripts/python.exe main.py --listen 127.0.0.1 --port 8188 > /c/Users/coryc/castleSurvivor/tools/reports/comfyui-bloodmarch.log 2>&1 &))
  for i in $(seq 1 60); do curl -s -m 3 http://127.0.0.1:8188/system_stats >/dev/null && break; sleep 3; done
  curl -s -m 5 http://127.0.0.1:8188/system_stats >/dev/null || { echo "ComfyUI did not start" | tee -a $LOG; exit 1; }
fi

if [ "${1:-}" = "--art" ]; then
  echo "=== ground art $(date) ===" | tee -a $LOG
  node AssetFactory/scripts/gen-textures.mjs --only churnedMud,scorchedEarth,battleGrass,rubbleGround,ironMud,craterScorch,arrowStorm,shieldScatter,charredBeams,bootChurn,warStain,rubbleSpill,trampledTuft 2>&1 | grep -v -i "warning\|reparsing\|eliminate\|trace" | tee -a $LOG
  exit 0
fi

# --images: only the image passes (review the sheets first); --meshes: only the mesh passes
PHASE=all
case "${1:-}" in --images) PHASE=images; shift;; --meshes) PHASE=meshes; shift;; esac
BATCHES="${*:-13 14 9 5 10}"
# Nothing in skipped.json is a bad prompt; they were GPU contention. Clear it.
node -e "
const fs=require('fs'), p='AssetFactory/catalog/skipped.json';
const keep=JSON.parse(fs.readFileSync(p,'utf8')).filter(id=>fs.existsSync('Game3DAssets/'+id+'.glb'));
fs.writeFileSync(p, JSON.stringify(keep,null,2));"

for B in $BATCHES; do
  IDS=$(no_image_ids $B)
  if [ -n "$IDS" ] && [ "$PHASE" != meshes ]; then
    echo "=== batch $B images $(date) ===" | tee -a $LOG
    $PY -u AssetFactory/scripts/run_pipeline.py --ids "$IDS" --images-only 2>&1 | grep --line-buffered -v "Waiting\.\.\." | tee -a $LOG
    node tools/image-sheet.mjs $B 2>&1 | tee -a $LOG
  fi
  IDS=$(pending_ids $B)
  if [ -n "$IDS" ] && [ "$PHASE" != images ]; then
    echo "=== batch $B meshes $(date) ===" | tee -a $LOG
    $PY -u AssetFactory/scripts/run_pipeline.py --ids "$IDS" --glb-only 2>&1 | grep --line-buffered -v "Waiting\.\.\." | tee -a $LOG
  fi
  echo "=== batch $B done $(date) ===" | tee -a $LOG
  df -h /c | tail -1 | tee -a $LOG
done
echo "=== all batches done $(date) ===" | tee -a $LOG
