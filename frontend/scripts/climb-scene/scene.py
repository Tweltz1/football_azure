"""Animated "The Climb" background for the login and loading screens.
Regenerate with: python3 scene.py ../../src/assets/climb-scene.svg  (from this folder)"""
import sys
from gen import CREW, INK, body, head, arm_down, football, sleeve

W, H = 1600, 1000
PEAK = (1150, 250)
LBASE = (690, 1000)
RBASE = (1640, 1000)

def on_left(t):   # t=0 peak, t=1 base
    return (PEAK[0] + (LBASE[0]-PEAK[0])*t, PEAK[1] + (LBASE[1]-PEAK[1])*t)

def on_right(t):
    return (PEAK[0] + (RBASE[0]-PEAK[0])*t, PEAK[1] + (RBASE[1]-PEAK[1])*t)

def arm_up(g, x, y, s, side):
    sx = side*34
    d = f'M{sx} -128 Q{sx+side*30} -150 {sx+side*30} -196'
    return (f'<g transform="translate({x} {y}) scale({s})" stroke-linecap="round" fill="none">'
            f'<path d="{d}" stroke="{INK}" stroke-width="24"/><path d="{d}" stroke="{sleeve(g)}" stroke-width="15"/>'
            f'<circle cx="{sx+side*30}" cy="-200" r="10" fill="{g["skin"]}" stroke="{INK}" stroke-width="5"/></g>')

def guy(g, x, y, s, lean=0, arms="down"):
    parts = [body(g, x, y, s)]
    if arms == "up":
        parts += [arm_up(g, x, y, s, -1), arm_up(g, x, y, s, 1)]
    else:
        parts += [arm_down(g, x, y, s, -1), arm_down(g, x, y, s, 1)]
    parts.append(head(g, x, y, s))
    return f'<g transform="rotate({lean} {x} {y})">' + "".join(parts) + '</g>'

CSS = """
.bob{animation:bob 1.6s ease-in-out infinite}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
.twinkle{animation:tw 3s ease-in-out infinite}
@keyframes tw{0%,100%{opacity:.25}50%{opacity:1}}
.glow{animation:glow 2.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes glow{0%,100%{opacity:.35;transform:scale(.92)}50%{opacity:.8;transform:scale(1.06)}}
.swing{transform-box:view-box;animation:swing 2.8s ease-in-out infinite}
@keyframes swing{0%,100%{transform:rotate(7deg)}50%{transform:rotate(-7deg)}}
.fall{transform-box:fill-box;transform-origin:center;animation:fall 9s ease-in infinite}
@keyframes fall{0%,55%{transform:translate(0,0) rotate(0)}58%{transform:translate(-6px,0) rotate(-8deg)}61%{transform:translate(6px,0) rotate(8deg)}64%{transform:translate(0,-30px) rotate(0)}
 96%{transform:translate(520px,900px) rotate(900deg);opacity:1}97%,100%{transform:translate(520px,900px) rotate(900deg);opacity:0}}
.ahh{opacity:0;animation:ahh 9s linear infinite}
@keyframes ahh{0%,57%{opacity:0}59%,74%{opacity:1}76%,100%{opacity:0}}
.roll{transform-box:fill-box;transform-origin:center;animation:roll 6s linear infinite}
@keyframes roll{0%{transform:translate(0,0) rotate(0);opacity:0}5%{opacity:1}90%{opacity:1}100%{transform:translate(460px,700px) rotate(1080deg);opacity:0}}
.oip{opacity:0;transform-box:fill-box;transform-origin:center bottom;animation:oip 9s ease-out infinite}
@keyframes oip{0%,84%{opacity:0;transform:scale(.4)}86%{opacity:1;transform:scale(1.12)}88%,97%{opacity:1;transform:scale(1)}99%,100%{opacity:0;transform:scale(1)}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}.ahh,.oip{opacity:0}}
"""

def bubble(tx, ty, x, y, text, style=""):
    """'OIP!' style speech bubble with its top-left corner at (x, y) and its tail pointing at (tx, ty)."""
    w, h = 26 + 22*len(text), 58
    cx = min(max(tx, x + 26), x + w - 26)  # where the tail leaves the bubble
    edge = y + h if ty > y + h else y      # tail leaves the bottom, or the top
    if y <= ty <= y + h:                   # tail leaves a side
        sx = x if tx < x else x + w
        tail = f"M{sx} {ty-12} L{tx} {ty} L{sx} {ty+12}"
    else:
        tail = f"M{cx-12} {edge} L{tx} {ty} L{cx+12} {edge}"
    return (f'<g class="oip" style="{style}"><path d="{tail}" fill="#fff" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="22" fill="#fff" stroke="{INK}" stroke-width="5"/>'
            f'<path d="{tail}" fill="#fff" stroke="none"/>'
            f'<text x="{x + w/2}" y="{y + 40}" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="30" fill="{INK}" text-anchor="middle">{text}</text></g>')

def scene():
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" preserveAspectRatio="xMidYMax slice">',
         f'<style>{CSS}</style>',
         '''<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0b0e"/><stop offset=".5" stop-color="#2a1f6b"/><stop offset="1" stop-color="#7c5ce8"/></linearGradient>
<radialGradient id="tg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#ffe27a" stop-opacity="0"/></radialGradient></defs>''',
         f'<rect width="{W}" height="{H}" fill="url(#sky)"/>']
    for k,(x,y,d) in enumerate([(120,90,0),(300,180,.7),(520,70,1.4),(760,140,.3),(940,60,2),(1380,110,1.1),(1520,200,.5),(640,250,2.4),(1000,190,1.8),(220,300,1.2),(1460,40,2.7)]):
        o.append(f'<circle class="twinkle" style="animation-delay:{d}s" cx="{x}" cy="{y}" r="{3 if k%3 else 4}" fill="#fff"/>')
    o.append('<circle cx="380" cy="230" r="58" fill="#ffe9a8" opacity=".9"/>')
    # far range
    o.append(f'<path d="M-20 820 L160 600 L280 690 L430 520 L560 640 L700 560 L840 660 L900 620 L1000 700 L1300 520 L1450 640 L1620 560 L1620 1020 L-20 1020Z" fill="#33277f" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>')
    o.append(f'<path d="M430 520 L398 566 L420 560 L434 576 L452 552Z M1300 520 L1266 566 L1290 558 L1304 574 L1326 552Z" fill="#fff" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>')
    o.append(f'<path d="M-20 900 Q220 800 480 860 Q620 820 760 880 L760 1020 L-20 1020Z" fill="#241c5c" stroke="{INK}" stroke-width="6"/>')
    # big mountain
    o.append(f'<path d="M{LBASE[0]} 1010 L{PEAK[0]} {PEAK[1]} L{RBASE[0]} 1010Z" fill="#6d4aff" stroke="{INK}" stroke-width="8" stroke-linejoin="round"/>')
    o.append(f'<path d="M{PEAK[0]} {PEAK[1]} L1250 640 L1640 1010 L{RBASE[0]} 1010Z" fill="#000" opacity=".16"/>')
    px,py = PEAK
    o.append(f'<path d="M{px} {py} L{px-60} {py+100} L{px-30} {py+88} L{px-10} {py+118} L{px+16} {py+86} L{px+44} {py+108} L{px+66} {py+104}Z" fill="#fff" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>')
    for (fx,fy,r) in [(1120,560,20),(1240,620,-15),(990,760,10),(1320,820,25),(1150,860,-5),(900,940,15),(1450,950,-20)]:
        o.append(football(fx,fy,0.5,r))
    # trophy
    o.append(f'<circle class="glow" cx="{px}" cy="{py-110}" r="150" fill="url(#tg)"/>')
    o.append(f'''<g transform="translate({px} {py}) scale(.8)" stroke="{INK}" stroke-width="7" stroke-linejoin="round">
<rect x="-50" y="-26" width="100" height="26" rx="5" fill="#2a2a33"/><rect x="-14" y="-62" width="28" height="38" fill="#f3c33b"/>
<path d="M-62 -190 L62 -190 L56 -120 Q44 -70 0 -62 Q-44 -70 -56 -120Z" fill="#f3c33b"/>
<path d="M-60 -176 Q-108 -176 -96 -138 Q-86 -114 -52 -114 M60 -176 Q108 -176 96 -138 Q86 -114 52 -114" fill="none" stroke-width="12"/>
<path d="M-32 -170 Q-38 -120 -18 -90" stroke="#fff6c8" stroke-width="8" fill="none" stroke-linecap="round"/></g>''')
    # rolling footballs down the right face
    for k,(t,d) in enumerate([(0.08,0),(0.15,2.2),(0.1,4.1)]):
        x,y = on_right(t)
        o.append(f'<g class="roll" style="animation-delay:{d}s">{football(x+10, y-14, 0.42)}</g>')
    # climbers roped on the left face (pink-dress guy dangles at the bottom)
    climb_order = [9, 7, 4, 3, 2, 1, 0]
    pts = [on_left(0.14 + k*0.088) for k in range(len(climb_order))]
    end = on_left(0.14 + len(climb_order)*0.088)
    rope = "M" + " L".join(f"{x+4:.0f} {y-44:.0f}" for x,y in pts) + f" L{end[0]+4:.0f} {end[1]-44:.0f}"
    o.append(f'<path d="{rope}" fill="none" stroke="{INK}" stroke-width="9" stroke-linejoin="round"/><path d="{rope}" fill="none" stroke="#f3c33b" stroke-width="4" stroke-linejoin="round"/>')
    for k,(x,y) in enumerate(pts):
        o.append(f'<g class="bob" style="animation-delay:{k*0.23:.2f}s">{guy(CREW[climb_order[k]], round(x), round(y)+6, 0.46, -12)}</g>')
    # Upper climbers shout to the left (open sky); never over a teammate's face.
    for k, dur, delay in [(0, 7, 1.0), (2, 11, 4.5), (4, 9, 7.0)]:
        x, y = pts[k]
        o.append(bubble(round(x) - 28, round(y) - 96, round(x) - 140, round(y) - 176, "OIP!", f"animation-duration:{dur}s;animation-delay:{delay}s"))
    # dangling pink-dress guy, swinging from the end of the rope
    ex, ey = end[0]+4, end[1]-44
    hang = guy(CREW[5], ex, ey+120, 0.46, 0, arms="up")
    o.append(f'<g class="swing" style="transform-origin:{ex:.0f}px {ey:.0f}px"><path d="M{ex:.0f} {ey:.0f} L{ex:.0f} {ey+30:.0f}" stroke="#f3c33b" stroke-width="5"/>{hang}</g>')
    o.append(bubble(round(ex) + 30, round(ey) + 70, round(ex) + 66, round(ey) + 40, "OIP!", "animation-duration:10s;animation-delay:5.5s"))
    # fallers on the right face: slip, yell, tumble off
    for k,(gi,t,d) in enumerate([(8,0.18,0),(6,0.3,4.5)]):
        x,y = on_right(t)
        bx,by = x+30, y-160
        o.append(f'<g class="fall" style="animation-delay:{d}s">{guy(CREW[gi], round(x)-22, round(y)+30, 0.46, 14, arms="up")}'
                 f'<g class="ahh" style="animation-delay:{d}s"><path d="M{bx} {by} h130 a16 16 0 0 1 16 16 v34 a16 16 0 0 1 -16 16 h-96 l-22 18 l4 -18 h-16 a16 16 0 0 1 -16 -16 v-34 a16 16 0 0 1 16 -16z" transform="translate(-16 0)" fill="#fff" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>'
                 f'<text x="{bx+49}" y="{by+46}" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="30" fill="{INK}" text-anchor="middle">AHH!</text></g></g>')
    o.append('</svg>')
    return "".join(o)

if __name__ == "__main__":
    open(sys.argv[1], "w").write(scene())
