#!/bin/bash
# Starts the up-to-date ComfyUI worktree (C:\Users\coryc\ComfyUI-audio, Stable Audio 3 support)
# on port 8189, sharing the Trellis venv and the main models folder (junction). Never run it
# alongside the Trellis pipeline or the playtest harness on this 16 GB machine.
cd /c/Users/coryc/ComfyUI-audio && (../ComfyUI/venv_trellis/Scripts/python.exe main.py --listen 127.0.0.1 --port 8189 --lowvram > /c/Users/coryc/castleSurvivor/tools/reports/comfyui-audio.log 2>&1 &)
for i in $(seq 1 40); do curl -s -m 3 http://127.0.0.1:8189/system_stats >/dev/null && echo "ComfyUI audio ready on 8189" && exit 0; sleep 3; done
echo "ComfyUI audio did not start; see tools/reports/comfyui-audio.log"; exit 1
