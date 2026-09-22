"""
Run batch Trellis GLB generation using the proven batch_trellis.py workflow.
Reads from AssetFactory/trellis_input/, outputs to AssetFactory/glb_raw/.
Uses 1024 texture size instead of 2048 — 2048 causes 50+ min per asset on 4060.
"""
import os
import sys

# Add the trellis directory so we can import the proven script's functions
sys.path.insert(0, r"C:\Users\coryc\trellis")

import batch_trellis

# Override paths to use our directories
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FACTORY_DIR = os.path.dirname(SCRIPT_DIR)

batch_trellis.INPUT_DIR = os.path.join(FACTORY_DIR, "trellis_input")
batch_trellis.OUTPUT_DIR = os.path.join(FACTORY_DIR, "glb_raw")
batch_trellis.COMFYUI_INPUT = r"C:\Users\coryc\ComfyUI\input"
batch_trellis.COMFYUI_OUTPUT = r"C:\Users\coryc\ComfyUI\output"

os.makedirs(batch_trellis.OUTPUT_DIR, exist_ok=True)

# Monkey-patch the workflow builder to use 1024 texture size instead of 2048
_original_build = batch_trellis.build_api_workflow

def build_api_workflow_1024(image_filename, asset_name):
    workflow = _original_build(image_filename, asset_name)
    # Node 260 is the PrimitiveInt for texture_size
    workflow["260"]["inputs"]["value"] = 1024
    return workflow

batch_trellis.build_api_workflow = build_api_workflow_1024

if __name__ == "__main__":
    batch_trellis.main()
