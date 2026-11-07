"""Hood Protocol app icon: the Hood League crew from the Hood League icon, hanging out in the basement.
Reuses the crew drawing code in frontend/scripts/climb-scene/gen.py.

  python3 tools/basement_icon.py out.svg          (from hood-protocol/)
Then render the SVG to a 1024x1024 PNG at App/Assets.xcassets/AppIcon.appiconset/AppIcon.png."""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "scripts", "climb-scene"))
from gen import INK, crew_line  # noqa: E402

WALL = "#b58c64"
WALL_DARK = "#9a7552"
PURPLE = "#8b6cff"


def window():
    # Night sky with the moon, framed in white
    stars = "".join(f'<circle cx="{x}" cy="{y}" r="5" fill="#fff"/>' for x, y in [(420, 250), (520, 300), (610, 230), (700, 330), (470, 360)])
    return ('<g transform="translate(0 40)">' + f'<rect x="380" y="200" width="420" height="230" rx="10" fill="url(#night)" stroke="{INK}" stroke-width="8"/>'
            f'<circle cx="720" cy="270" r="46" fill="#ffe9a8"/>' + stars +
            f'<path d="M590 204 L590 426 M384 315 L796 315" stroke="#f4f1ea" stroke-width="12"/>'
            f'<rect x="380" y="200" width="420" height="230" rx="10" fill="none" stroke="#f4f1ea" stroke-width="16"/>'
            f'<rect x="364" y="420" width="452" height="22" rx="6" fill="#f4f1ea" stroke="{INK}" stroke-width="6"/></g>')


def string_lights():
    colors = ["#ff6b6b", "#f5b84a", "#3ddc97", "#2f80ed", "#ff8bd0"]
    out = [f'<path d="M40 150 Q280 200 512 160 Q744 200 984 150" fill="none" stroke="{INK}" stroke-width="5"/>']
    for i in range(16):
        x = 70 + i * 58
        t = (x - 40) / 944
        y = 150 + 40 * (4 * t * (1 - t)) * (1 if t < 0.5 else 1) + (10 if i % 2 else 0)
        c = colors[i % len(colors)]
        out.append(f'<circle cx="{x}" cy="{y + 10}" r="22" fill="{c}" opacity=".35"/>'
                   f'<ellipse cx="{x}" cy="{y + 10}" rx="10" ry="13" fill="{c}" stroke="{INK}" stroke-width="4"/>')
    return "".join(out)


def lamp():
    return (f'<path d="M150 560 L150 800" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>'
            f'<circle cx="150" cy="560" r="120" fill="#ffd27a" opacity=".25"/>'
            f'<path d="M100 500 L200 500 L225 570 L75 570Z" fill="#f2d9a0" stroke="{INK}" stroke-width="7" stroke-linejoin="round"/>')


def couch():
    return (f'<rect x="230" y="560" width="600" height="150" rx="40" fill="#6a4c8f" stroke="{INK}" stroke-width="7"/>'
            f'<rect x="190" y="610" width="90" height="150" rx="36" fill="#5d4280" stroke="{INK}" stroke-width="7"/>'
            f'<rect x="780" y="610" width="90" height="150" rx="36" fill="#5d4280" stroke="{INK}" stroke-width="7"/>')


def cup(x, y, s=1, rot=0):
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})" stroke="{INK}" stroke-width="6" stroke-linejoin="round">'
            f'<path d="M-34 -50 L34 -50 L26 40 L-26 40Z" fill="#e0302e"/>'
            f'<path d="M-36 -52 L36 -52" stroke="#fff" stroke-width="10" stroke-linecap="round"/>'
            f'<path d="M-30 -20 L30 -20" stroke="#b02020" stroke-width="5"/></g>')


def icon():
    return "".join([
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">',
        '<defs><linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1440"/>'
        '<stop offset="1" stop-color="#5b3fd6"/></linearGradient>'
        '<clipPath id="circ"><circle cx="512" cy="512" r="470"/></clipPath></defs>',
        '<rect width="1024" height="1024" fill="#0a0b0e"/>',
        '<g clip-path="url(#circ)">',
        # Wood-paneled back wall with a purple LED strip
        f'<rect width="1024" height="1024" fill="{WALL}"/>',
        "".join(f'<path d="M{x} 0 L{x} 760" stroke="{WALL_DARK}" stroke-width="6"/>' for x in range(64, 1024, 96)),
        f'<rect x="0" y="96" width="1024" height="14" fill="{PURPLE}"/><rect x="0" y="86" width="1024" height="34" fill="{PURPLE}" opacity=".3"/>',
        string_lights(),
        window(),
        lamp(),
        couch(),
        # Carpet floor
        f'<path d="M-20 760 L1044 760 L1044 1050 L-20 1050Z" fill="#666c7a" stroke="{INK}" stroke-width="6"/>',
        f'<ellipse cx="512" cy="900" rx="430" ry="110" fill="#5b45a8" stroke="{INK}" stroke-width="6"/>',
        crew_line(530, 830, 0.92),
        # Red cups at their feet instead of footballs
        cup(512, 920, 0.8), cup(440, 930, 0.75, -12), cup(584, 930, 0.75, 12), cup(476, 885, 0.7, -6), cup(548, 885, 0.7, 6),
        '</g>',
        f'<circle cx="512" cy="512" r="470" fill="none" stroke="{INK}" stroke-width="14"/>',
        f'<circle cx="512" cy="512" r="486" fill="none" stroke="{PURPLE}" stroke-width="14"/>',
        '</svg>',
    ])


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "basement-icon.svg"
    with open(out, "w") as f:
        f.write(icon())
