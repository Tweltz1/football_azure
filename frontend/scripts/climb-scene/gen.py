import sys, math
OUT = sys.argv[1] if len(sys.argv) > 1 else "."
INK = "#16122b"
SK = ["#f1c7a5", "#eabf9b", "#f4cfb0", "#e8b892"]

CREW = [
 dict(skin=SK[0], hat="back", hatc="#8e1d2c", top="tank", topc="#2340c8", bot="#1b1b22", shorts=True, mark="C"),
 dict(skin=SK[1], hat="cap", hatc="#1f2a44", hood="#a9abb2", top="hoodie", topc="#a9abb2", bot="#9a9ca3", beard=True),
 dict(skin=SK[2], hat="cap", hatc="#c9b98a", top="tee", topc="#6d6a70", bot="#26304f"),
 dict(skin=SK[0], hat="back", hatc="#e7b94a", top="hoodie", topc="#1c1e26", bot="#a3a5ab", text="SCIENCE"),
 dict(skin=SK[3], hat="cap", hatc="#203731", top="packers", topc="#203731", bot="#3a3f4a", shades=True, stache=True),
 dict(skin=SK[2], hat=None, hair="#2b1d16", top="dress", topc="#d1237a", bot=None),
 dict(skin=SK[1], hat="cap", hatc="#24242a", top="hoodie", topc="#d33b3b", bot="#1b1b22", beard=True, text="CUSTER"),
 dict(skin=SK[0], hat="cap", hatc="#b07a4c", top="tee", topc="#7a7c62", bot="#1b1b22"),
 dict(skin=SK[2], hat="cap", hatc="#2a3a30", top="jersey", topc="#1f5a3b", bot="#d8c39a", shorts=True),
 dict(skin=SK[1], hat="cap", hatc="#24242a", top="packzip", topc="#8f9298", sleeve="#1f5a3b", bot="#b4b6bb"),
]

def sleeve(g):
    if g["top"] in ("tank", "dress"): return g["skin"]
    return g.get("sleeve", g["topc"])

def body(g, x, y, s):
    o = [f'<g transform="translate({x} {y}) scale({s})" stroke="{INK}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">']
    # legs
    legc = g["bot"] or g["skin"]
    for lx in (-18, 18):
        if g["top"] == "dress":
            o.append(f'<rect x="{lx-12}" y="-70" width="24" height="62" rx="11" fill="{g["skin"]}"/>')
            o.append(f'<rect x="{lx-12}" y="-24" width="24" height="16" rx="4" fill="#ffffff"/>')
        elif g.get("shorts"):
            o.append(f'<rect x="{lx-12}" y="-50" width="24" height="42" rx="11" fill="{g["skin"]}"/>')
            o.append(f'<rect x="{lx-16}" y="-74" width="32" height="38" rx="9" fill="{legc}"/>')
        else:
            o.append(f'<rect x="{lx-14}" y="-74" width="28" height="68" rx="12" fill="{legc}"/>')
        o.append(f'<ellipse cx="{lx+ (3 if lx>0 else -3)}" cy="-7" rx="21" ry="10" fill="#2a2a33"/>')
    # torso
    t, c = g["top"], g["topc"]
    if t == "dress":
        o.append(f'<path d="M-30 -140 L30 -140 L44 -58 Q0 -50 -44 -58 Z" fill="{c}"/>')
        for i,(sx,sy) in enumerate([(-18,-120),(10,-110),(-6,-92),(22,-80),(-26,-74),(4,-70),(-14,-100),(26,-128)]):
            o.append(f'<circle cx="{sx}" cy="{sy}" r="3" fill="#ffd1ea" stroke="none"/>')
        o.append(f'<path d="M-24 -142 L32 -66" stroke="#ffb3d6" stroke-width="14" stroke-linecap="butt"/>')
        o.append(f'<path d="M-24 -142 L32 -66" stroke="{INK}" stroke-width="2" fill="none" opacity=".0"/>')
    else:
        o.append(f'<rect x="-38" y="-142" width="76" height="80" rx="20" fill="{c}"/>')
        if t == "tank":
            o.append(f'<path d="M-38 -128 Q-24 -126 -22 -142 M38 -128 Q24 -126 22 -142" fill="{g["skin"]}"/>')
            o.append(f'<text x="0" y="-98" font-family="Arial Black,Arial" font-weight="900" font-size="22" fill="#fff" stroke="none" text-anchor="middle">{g["mark"]}</text>')
        if t == "hoodie":
            o.append(f'<path d="M-8 -136 L-10 -112 M8 -136 L10 -112" stroke="#eee" stroke-width="3"/>')
            o.append(f'<rect x="-24" y="-96" width="48" height="22" rx="8" fill="{c}" stroke-width="3"/>')
            if g.get("text"):
                col = "#ffffff"
                o.append(f'<text x="0" y="-114" font-family="Arial Black,Arial" font-weight="900" font-size="13" fill="{col}" stroke="none" text-anchor="middle">{g["text"]}</text>')
        if t == "zip":
            o.append(f'<path d="M0 -142 L0 -112" stroke="#d9dce6" stroke-width="3"/><path d="M-14 -142 L0 -132 L14 -142" fill="none" stroke-width="3"/>')
        if t == "jersey":
            o.append(f'<path d="M-14 -142 L0 -130 L14 -142" fill="#f3c33b" stroke-width="3"/>')
            o.append(f'<text x="0" y="-86" font-family="Arial Black,Arial" font-weight="900" font-size="40" fill="#ffffff" stroke="{INK}" stroke-width="2" text-anchor="middle">17</text>')
        if t == "packers":
            o.append(f'<path d="M-14 -142 L0 -130 L14 -142" fill="#ffb612" stroke-width="3"/>')
            o.append(f'<path d="M-38 -76 H38 M-38 -70 H38" stroke="#ffb612" stroke-width="4"/>')
            o.append(f'<text x="0" y="-86" font-family="Arial Black,Arial" font-weight="900" font-size="40" fill="#ffb612" stroke="{INK}" stroke-width="2" text-anchor="middle">12</text>')
        if t == "packzip":
            o.append(f'<rect x="-38" y="-142" width="76" height="30" rx="14" fill="{g["sleeve"]}" stroke-width="0"/>')
            o.append(f'<rect x="-38" y="-142" width="76" height="80" rx="20" fill="none"/>')
            o.append(f'<path d="M0 -142 L0 -110" stroke="#f3c33b" stroke-width="3"/>')
    o.append('</g>')
    return "".join(o)

def arm_down(g, x, y, s, side):
    sx = side*36
    return (f'<g transform="translate({x} {y}) scale({s})" stroke="{INK}" stroke-width="5" stroke-linecap="round" fill="none">'
            f'<path d="M{sx} -128 Q{sx+side*14} -100 {sx+side*8} -74" stroke="{INK}" stroke-width="24"/>'
            f'<path d="M{sx} -128 Q{sx+side*14} -100 {sx+side*8} -74" stroke="{sleeve(g)}" stroke-width="15"/>'
            f'<circle cx="{sx+side*8}" cy="-70" r="10" fill="{g["skin"]}"/></g>')

def arm_hug(g, x, y, s, nx):
    # from own right shoulder over neighbour's far shoulder; nx relative distance in unscaled units
    d = f'M30 -132 Q{nx*0.6} -150 {nx+34} -136'
    return (f'<g transform="translate({x} {y}) scale({s})" stroke-linecap="round" fill="none">'
            f'<path d="{d}" stroke="{INK}" stroke-width="25"/><path d="{d}" stroke="{sleeve(g)}" stroke-width="15"/>'
            f'<circle cx="{nx+36}" cy="-134" r="10" fill="{g["skin"]}" stroke="{INK}" stroke-width="5"/></g>')

def head(g, x, y, s):
    o = [f'<g transform="translate({x} {y}) scale({s})" stroke="{INK}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">']
    if g.get("hood"):
        o.append(f'<circle cx="0" cy="-186" r="52" fill="{g["hood"]}"/>')
    o.append(f'<circle cx="-42" cy="-182" r="10" fill="{g["skin"]}"/><circle cx="42" cy="-182" r="10" fill="{g["skin"]}"/>')
    o.append(f'<circle cx="0" cy="-186" r="44" fill="{g["skin"]}"/>')
    if g.get("beard"):
        o.append(f'<path d="M-38 -172 Q-30 -136 0 -134 Q30 -136 38 -172 Q20 -150 0 -152 Q-20 -150 -38 -172Z" fill="#8a5a3c" opacity=".55" stroke="none"/>')
    if g["hat"] is None:
        o.append(f'<path d="M-44 -186 Q-48 -236 0 -234 Q46 -234 44 -190 Q30 -206 6 -206 Q-20 -214 -44 -186Z" fill="{g["hair"]}"/>')
    else:
        o.append(f'<path d="M-45 -196 Q-46 -240 0 -240 Q46 -240 45 -196 Z" fill="{g["hatc"]}"/>')
        o.append(f'<circle cx="0" cy="-240" r="5" fill="{g["hatc"]}"/>')
        if g["hat"] == "cap":
            o.append(f'<path d="M-50 -196 Q0 -212 50 -196 Q52 -186 40 -184 Q0 -194 -40 -184 Q-52 -186 -50 -196Z" fill="{g["hatc"]}"/>')
        else:
            o.append(f'<rect x="-14" y="-204" width="28" height="10" rx="4" fill="#e9e3d0" stroke-width="3"/>')
    if g.get("shades"):
        o.append(f'<rect x="-30" y="-194" width="24" height="16" rx="6" fill="#111"/><rect x="6" y="-194" width="24" height="16" rx="6" fill="#111"/><path d="M-6 -188 L6 -188"/>')
    else:
        o.append(f'<ellipse cx="-15" cy="-184" rx="5" ry="7" fill="{INK}" stroke="none"/><ellipse cx="15" cy="-184" rx="5" ry="7" fill="{INK}" stroke="none"/>')
    o.append(f'<circle cx="-26" cy="-168" r="7" fill="#ff7f8f" opacity=".45" stroke="none"/><circle cx="26" cy="-168" r="7" fill="#ff7f8f" opacity=".45" stroke="none"/>')
    if g.get("stache"):
        o.append(f'<path d="M-16 -166 Q-8 -172 0 -166 Q8 -172 16 -166 Q8 -160 0 -164 Q-8 -160 -16 -166Z" fill="#3a2418" stroke-width="2"/>')
    o.append(f'<path d="M-15 -160 Q0 -144 15 -160 Z" fill="#fff" stroke-width="4"/>')
    o.append('</g>')
    return "".join(o)

def crew_line(cx, base, s, spacing=84, hug=True):
    n = len(CREW); xs = [cx + (i-(n-1)/2)*spacing*s for i in range(n)]
    out = []
    # back arms first (edge arms down)
    for i,g in enumerate(CREW):
        out.append(body(g, xs[i], base, s))
    out.append(arm_down(CREW[0], xs[0], base, s, -1))
    out.append(arm_down(CREW[-1], xs[-1], base, s, 1))
    if hug:
        for i in range(n-1):
            out.append(arm_hug(CREW[i], xs[i], base, s, spacing))
    for i,g in enumerate(CREW):
        out.append(head(g, xs[i], base, s))
    return "".join(out)

def football(cx, cy, s=1, rot=0):
    return (f'<g transform="translate({cx} {cy}) rotate({rot}) scale({s})" stroke="{INK}" stroke-width="5" stroke-linecap="round">'
            f'<path d="M-60 0 Q0 -46 60 0 Q0 46 -60 0Z" fill="#8a4b25"/>'
            f'<path d="M-40 -14 Q-46 0 -40 14 M40 -14 Q46 0 40 14" stroke="#fff" stroke-width="5" fill="none"/>'
            f'<path d="M-20 -4 L20 -4" stroke="#fff" stroke-width="5"/>'
            + "".join(f'<path d="M{x} -12 L{x} 4" stroke="#fff" stroke-width="4"/>' for x in (-14,-5,4,13)) + '</g>')

DEFS = '''<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1440"/><stop offset=".55" stop-color="#5b3fd6"/><stop offset="1" stop-color="#b4a2ff"/></linearGradient>
<clipPath id="circ"><circle cx="512" cy="512" r="470"/></clipPath>
</defs>'''

def mountains():
    return f'''
<path d="M-20 700 L150 470 L230 540 L360 360 L470 500 L560 420 L700 300 L820 470 L900 410 L1050 620 L1050 1050 L-20 1050Z" fill="#3b2c8f" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>
<path d="M360 360 L318 420 L345 412 L362 432 L384 404 L400 418Z M700 300 L650 372 L680 362 L700 386 L724 360 L752 378Z M150 470 L124 506 L148 500 L164 512 L176 492Z" fill="#fff" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>
<path d="M-20 780 Q200 650 380 700 Q560 620 760 690 Q920 640 1050 720 L1050 1050 L-20 1050Z" fill="#2b2170" stroke="{INK}" stroke-width="6"/>'''

def scene_summit(text=True):
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">{DEFS}',
         f'<rect width="1024" height="1024" fill="#0a0b0e"/>',
         f'<g clip-path="url(#circ)"><rect width="1024" height="1024" fill="url(#sky)"/>',
         '<circle cx="800" cy="200" r="60" fill="#ffe9a8" opacity=".9"/>',
         '<path d="M140 210 q30 -30 60 0 q30 -20 50 8 q-60 10 -110 -8Z M580 150 q30 -26 60 0 q24 -14 44 8 q-56 8 -104 -8Z" fill="#fff" opacity=".8"/>',
         mountains(),
         f'<path d="M40 1000 Q90 790 300 770 Q512 740 724 770 Q934 790 984 1000Z" fill="#8a7a6a" stroke="{INK}" stroke-width="6"/>',
         f'<path d="M120 900 l20 -6 M300 850 l24 4 M700 860 l18 -6 M860 910 l20 4" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>',
         # flag pole with football flag
         f'<path d="M150 790 L150 520" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>',
         f'<path d="M154 524 L290 556 L154 600Z" fill="#8b6cff" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>',
         football(205, 560, 0.55, 8),
         crew_line(530, 830, 0.92),
         # football pile at their feet
         football(512, 900, 0.75), football(436, 905, 0.75, -10), football(588, 905, 0.75, 10), football(474, 864, 0.7, -5), football(550, 864, 0.7, 5),
         '</g>',
         f'<circle cx="512" cy="512" r="470" fill="none" stroke="{INK}" stroke-width="14"/><circle cx="512" cy="512" r="486" fill="none" stroke="#8b6cff" stroke-width="14"/>']
    if text:
        o.append(f'<g><path d="M200 930 L824 930 L800 990 L224 990Z" fill="#6d4aff" stroke="{INK}" stroke-width="8" stroke-linejoin="round"/>'
                 f'<text x="512" y="976" font-family="Arial Black,Arial" font-weight="900" font-size="48" letter-spacing="4" fill="#fff" text-anchor="middle">HOOD LEAGUE</text></g>')
    o.append('</svg>')
    return "".join(o)

def climber(g, x, y, s, lean=-12):
    # standing figure leaning into the slope, arms down, rope at waist
    return (f'<g transform="rotate({lean} {x} {y})">' + body(g, x, y, s) + arm_down(g, x, y, s, -1) + arm_down(g, x, y, s, 1) + head(g, x, y, s) + '</g>')

def scene_climb(text=True):
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">{DEFS}',
         f'<rect width="1024" height="1024" fill="url(#sky)"/>',
         '<circle cx="180" cy="190" r="56" fill="#ffe9a8" opacity=".9"/>',
         f'<path d="M-20 760 L180 560 L300 640 L420 520 L520 600 L700 420 L1050 700 L1050 1050 L-20 1050Z" fill="#3b2c8f" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>',
         # big mountain
         f'<path d="M40 1040 L600 250 L1000 1040Z" fill="#6d4aff" stroke="{INK}" stroke-width="8" stroke-linejoin="round"/>',
         f'<path d="M600 250 L640 640 L1000 1040 Z" fill="#000" opacity=".16"/>',
         f'<path d="M600 250 L520 362 L556 350 L580 384 L612 346 L648 372 L676 356Z" fill="#fff" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>',
    ]
    # footballs scattered on mountain
    for (fx,fy,r) in [(560,520,20),(700,620,-15),(480,700,10),(760,800,25),(620,820,-5),(400,860,15),(860,920,-20),(300,960,5),(560,960,12),(700,980,-12)]:
        o.append(football(fx,fy,0.55,r))
    # trophy at summit
    o.append(f'''<g transform="translate(600 250)" stroke="{INK}" stroke-width="7" stroke-linejoin="round">
<rect x="-50" y="-26" width="100" height="26" rx="5" fill="#2a2a33"/>
<rect x="-14" y="-62" width="28" height="38" fill="#f3c33b"/>
<path d="M-62 -190 L62 -190 L56 -120 Q44 -70 0 -62 Q-44 -70 -56 -120Z" fill="#f3c33b"/>
<path d="M-60 -176 Q-108 -176 -96 -138 Q-86 -114 -52 -114 M60 -176 Q108 -176 96 -138 Q86 -114 52 -114" fill="none" stroke-width="12"/>
<path d="M-32 -170 Q-38 -120 -18 -90" stroke="#fff6c8" stroke-width="8" fill="none" stroke-linecap="round"/>
</g>''')
    # climbers up left ridge from (100,990) toward (560,320)
    pts = []
    n = len(CREW)
    order = [9,8,7,6,5,3,2,1,0,4]  # pink-dress guy last, dragged at the back
    for k in range(n):
        t = 0.2 + k*0.07 + (0.035 if k==n-1 else 0)
        x = 40 + (600-40)*(1-t) ; y = 1040 + (250-1040)*(1-t)
        pts.append((x,y))
    # rope
    rope = "M" + " L".join(f"{x+4} {y-50}" for x,y in pts)
    o.append(f'<path d="{rope}" fill="none" stroke="{INK}" stroke-width="9" stroke-linejoin="round"/><path d="{rope}" fill="none" stroke="#f3c33b" stroke-width="4" stroke-linejoin="round"/>')
    for k,(x,y) in enumerate(pts):
        lean = -14 if k < n-1 else 10
        o.append(climber(CREW[order[k]], x, y+6, 0.5, lean))
    if text:
        o.append(f'<path d="M200 930 L824 930 L800 990 L224 990Z" fill="#0a0b0e" stroke="#8b6cff" stroke-width="6" stroke-linejoin="round"/>'
                 f'<text x="512" y="976" font-family="Arial Black,Arial" font-weight="900" font-size="48" letter-spacing="4" fill="#fff" text-anchor="middle">HOOD LEAGUE</text>')
    o.append('</svg>')
    return "".join(o)

if __name__ == "__main__":
    open(f"{OUT}/concept-a-summit-crew.svg","w").write(scene_summit())
    open(f"{OUT}/concept-a-summit-crew-icon.svg","w").write(scene_summit(False))
    open(f"{OUT}/concept-b-the-climb.svg","w").write(scene_climb())
    open(f"{OUT}/concept-b-the-climb-icon.svg","w").write(scene_climb(False))
