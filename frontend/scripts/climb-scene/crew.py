"""One standing, waving picture per crew member for the login intro (src/assets/crew/).
Regenerate with: python3 crew.py ../../src/assets/crew  (from this folder)"""
import os, sys
from gen import CREW, body, head, arm_down
from scene import arm_up

def portrait(g, both_up=False):
    parts = [body(g, 0, 0, 1)]
    parts.append(arm_up(g, 0, 0, 1, -1) if both_up else arm_down(g, 0, 0, 1, -1))
    parts.append(f'<g class="wave">{arm_up(g, 0, 0, 1, 1)}</g>')
    parts.append(head(g, 0, 0, 1))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-110 -270 220 290" width="220" height="290">'
            '<style>.wave{transform-box:view-box;transform-origin:34px -128px;animation:wave .9s ease-in-out infinite alternate}'
            '@keyframes wave{from{transform:rotate(-10deg)}to{transform:rotate(14deg)}}'
            '@media (prefers-reduced-motion: reduce){.wave{animation:none}}</style>'
            '<ellipse cx="0" cy="2" rx="62" ry="12" fill="#000" opacity=".35"/>' + "".join(parts) + '</svg>')

if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for i, g in enumerate(CREW):
        with open(os.path.join(out, f"crew-{i + 1:02d}.svg"), "w") as f:
            f.write(portrait(g, both_up=(g["top"] == "dress")))
