"""Layout audit for the generated maps: what a knight can reach, where a kiting
player gets penned, and where the loot is.

    python3 tools/map-audit.py                 # all five maps
    python3 tools/map-audit.py map.mirefen.json

Per map:
  free / reachable   walkable ground (knight radius 0.5 against every obstacle and
                     barrier), and how much of it connects to the spawn
  caches             supply chests, and any the knight cannot get to
  pens               1-unit cells where less than 35% of the ground within 6 units
                     is reachable: where a kiting player gets cornered. The five
                     worst 20-unit blocks are listed by centre
  loot grid          breakables (the game's own list from assets-extra.js, plus
                     barrels and chests) per 50-unit block, rows north to south

Written for PLAN 50.18, where it found the orc camp's one-gate palisade and
Mirefen's 17 breakables against 180-390 on every other map.
"""
import collections
import json
import os
import re
import sys
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPS = ['map.json', 'map.darkwood.json', 'map.emberreach.json', 'map.mirefen.json', 'map.bloodmarch.json']
KNIGHT_R = 0.5
PEN_R, PEN_OPEN = 6, 0.35


def breakable_keys():
    src = open(os.path.join(ROOT, 'assets-extra.js'), encoding='utf8').read()
    keys = set(re.findall(r'"key": "([^"]+)"[^}]*?"breakable": true', src, re.S))
    return keys | {'barrel', 'chest'}


def audit(path, breakables):
    d = json.load(open(path))
    W = d['worldSize']
    N = 2 * W
    obs = [(o['x'], o['z'], o['radius']) for o in d['objects'] if o.get('obstacle') and o.get('radius', 0) > 0]
    obs += [(b['x'], b['z'], b['r']) for b in d.get('barriers', [])]
    blocked = [[False] * N for _ in range(N)]
    for x, z, r in obs:
        R = r + KNIGHT_R
        for gx in range(max(0, int(x - R + W) - 1), min(N, int(x + R + W) + 2)):
            for gz in range(max(0, int(z - R + W) - 1), min(N, int(z + R + W) + 2)):
                if (gx - W + 0.5 - x) ** 2 + (gz - W + 0.5 - z) ** 2 <= R * R:
                    blocked[gx][gz] = True

    sx, sz = int(d.get('spawnX', 0) + W), int(d.get('spawnZ', 0) + W)
    seen = [[False] * N for _ in range(N)]
    seen[sx][sz] = True
    q, reach = deque([(sx, sz)]), 0
    while q:
        x, z = q.popleft()
        reach += 1
        for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = x + dx, z + dz
            if 0 <= a < N and 0 <= b < N and not blocked[a][b] and not seen[a][b]:
                seen[a][b] = True
                q.append((a, b))
    free = sum(not blocked[x][z] for x in range(N) for z in range(N))

    chests = [(o['x'], o['z']) for o in d['objects'] if o['key'] == 'chest']
    def reachable(px, pz):
        gx, gz = int(px + W), int(pz + W)
        return any(0 <= gx + a < N and 0 <= gz + b < N and seen[gx + a][gz + b]
                   for a in range(-2, 3) for b in range(-2, 3))
    stranded = [c for c in chests if not reachable(*c)]

    disc = [(a, b) for a in range(-PEN_R, PEN_R + 1) for b in range(-PEN_R, PEN_R + 1) if a * a + b * b <= PEN_R * PEN_R]
    pens = []
    for x in range(0, N, 2):
        for z in range(0, N, 2):
            if not seen[x][z]:
                continue
            ok = sum(1 for a, b in disc if 0 <= x + a < N and 0 <= z + b < N and seen[x + a][z + b])
            if ok / len(disc) < PEN_OPEN:
                pens.append((x - W, z - W))
    worst = collections.Counter((int((x + W) // 20), int((z + W) // 20)) for x, z in pens).most_common(5)

    loot = [o for o in d['objects'] if o['key'] in breakables]
    grid = collections.Counter((int((o['x'] + W) // 50), int((o['z'] + W) // 50)) for o in loot)

    print(f"{os.path.basename(path)}")
    print(f"  free {100 * free / N / N:.0f}%  reachable {100 * reach / max(free, 1):.0f}% of free")
    print(f"  caches {len(chests)}" + (f"  UNREACHABLE {stranded}" if stranded else ''))
    print(f"  pens {len(pens)}  worst 20u blocks (centre x, z, cells): "
          + ', '.join(f'({bx * 20 - W + 10}, {bz * 20 - W + 10}, {n})' for (bx, bz), n in worst))
    print(f"  breakables {len(loot)}, per 50u block north to south:")
    for row in range(N // 50):
        print('    ' + ' '.join(f'{grid[(col, row)]:4d}' for col in range(N // 50)))


if __name__ == '__main__':
    keys = breakable_keys()
    for p in (sys.argv[1:] or [os.path.join(ROOT, m) for m in MAPS]):
        audit(p, keys)
