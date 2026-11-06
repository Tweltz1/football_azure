"""Each guy's bit for the login intro (src/assets/crew/crew-NN-bit.svg): John points at his Colts
shirt, Evan goes cyborg, Bush's eye bleeds, Pat moons, Michael dabs, Chrome throws cash, Connor
winks by his '57, Ben spits like a llama, Weltz turns into a beaver, Logan wipes with a $100.
Every bit loops on a 3.2 s clock so it is mid-action whenever the picture shows.
Regenerate with: python3 gags.py ../../src/assets/crew  (from this folder)"""
import os, sys
from gen import CREW, INK, body, head, arm_down
from scene import arm_up

CYCLE = 3.2
SK = "#f1c7a5"

CSS = f"""
.on{{opacity:0;animation:on {CYCLE}s infinite}}
@keyframes on{{0%,22%{{opacity:0}}26%,84%{{opacity:1}}88%,100%{{opacity:0}}}}
.off{{animation:off {CYCLE}s infinite}}
@keyframes off{{0%,22%{{opacity:1}}26%,84%{{opacity:0}}88%,100%{{opacity:1}}}}
.wiggle{{transform-box:fill-box;transform-origin:center bottom;animation:wiggle .45s ease-in-out infinite alternate}}
@keyframes wiggle{{from{{transform:rotate(-5deg)}}to{{transform:rotate(5deg)}}}}
.poke{{animation:poke .5s ease-in-out infinite alternate}}
@keyframes poke{{from{{transform:translate(0,0)}}to{{transform:translate(-5px,3px)}}}}
.rub{{animation:rub .35s ease-in-out infinite alternate}}
@keyframes rub{{from{{transform:translateY(-6px)}}to{{transform:translateY(8px)}}}}
.drip{{animation:drip 1.1s ease-in infinite}}
@keyframes drip{{0%{{transform:translateY(0);opacity:0}}10%{{opacity:1}}100%{{transform:translateY(46px);opacity:0}}}}
.fly{{opacity:0;transform-box:fill-box;transform-origin:center;animation:fly {CYCLE / 2}s ease-out infinite}}
@keyframes fly{{0%{{opacity:0;transform:translate(0,0) rotate(0)}}10%{{opacity:1}}100%{{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(var(--r))}}}}
.spit{{opacity:0;animation:spit 1.2s ease-out infinite}}
@keyframes spit{{0%{{opacity:0;transform:translate(0,0)}}8%{{opacity:1}}100%{{opacity:0;transform:translate(120px,26px)}}}}
.bob{{animation:bob .8s ease-in-out infinite alternate}}
@keyframes bob{{from{{transform:translateY(0)}}to{{transform:translateY(-6px)}}}}
@media (prefers-reduced-motion: reduce){{*{{animation:none!important}}.on,.fly,.spit{{opacity:1}}.off{{opacity:0}}}}
"""

def arm(g, d, hx, hy, color=None):
    c = color or (g["skin"] if g["top"] in ("tank", "dress") else g.get("sleeve", g["topc"]))
    return (f'<g stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="{d}" stroke="{INK}" stroke-width="24"/>'
            f'<path d="{d}" stroke="{c}" stroke-width="15"/>'
            f'<circle cx="{hx}" cy="{hy}" r="10" fill="{g["skin"]}" stroke="{INK}" stroke-width="5"/></g>')

def bill(x, y, w=44, h=22, label="$", rot=0, cls="", style=""):
    return (f'<g class="{cls}" style="{style}"><g transform="translate({x} {y}) rotate({rot})">'
            f'<rect x="{-w/2}" y="{-h/2}" width="{w}" height="{h}" rx="3" fill="#7bc67b" stroke="{INK}" stroke-width="3"/>'
            f'<circle r="{h/2 - 4}" fill="none" stroke="#2f6b2f" stroke-width="2"/>'
            f'<text y="5" font-family="Arial Black,Arial,sans-serif" font-size="{h*0.55:.0f}" font-weight="900" fill="#2f6b2f" text-anchor="middle">{label}</text></g></g>')

def svg(parts):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-150 -290 300 310" width="300" height="310"><style>{CSS}</style>'
            '<ellipse cx="0" cy="2" rx="62" ry="12" fill="#000" opacity=".35"/>' + "".join(parts) + '</svg>')

def john(g):
    g = dict(g, mark="")
    shoe = ('<path d="M-15 -84 Q-19 -124 0 -124 Q19 -124 15 -84" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/>'
            + "".join(f'<circle cx="{x}" cy="{y}" r="2.2" fill="#2340c8"/>' for x, y in [(-14, -98), (-11, -114), (0, -120), (11, -114), (14, -98)]))
    point = arm(g, "M34 -128 Q62 -106 24 -102", 22, -102)
    return svg([body(g, 0, 0, 1), shoe, arm_down(g, 0, 0, 1, -1), head(g, 0, 0, 1), f'<g class="poke">{point}</g>'])

def evan(g):
    chrome = (f'<g class="on"><path d="M0 -200 L41.7 -200 A44 44 0 0 1 0 -142 Z" fill="#9aa3b5" stroke="{INK}" stroke-width="4"/>'
              f'<path d="M6 -190 H30 M6 -166 H22 V-156 M30 -150 V-170" stroke="#5c667a" stroke-width="3" fill="none"/>'
              f'<circle cx="15" cy="-184" r="13" fill="#ff2d2d" opacity=".35"/><circle cx="15" cy="-184" r="7" fill="#ff2d2d" stroke="{INK}" stroke-width="3"/>'
              f'<text x="64" y="-236" font-family="Courier New,monospace" font-weight="700" font-size="16" fill="#7dff9a">01</text>'
              f'<text x="-108" y="-212" font-family="Courier New,monospace" font-weight="700" font-size="16" fill="#7dff9a">10</text></g>')
    return svg([body(g, 0, 0, 1), arm_down(g, 0, 0, 1, -1), arm_down(g, 0, 0, 1, 1), head(g, 0, 0, 1), chrome])

def bush(g):
    blood = (f'<ellipse cx="-15" cy="-184" rx="7" ry="8" fill="#d22" stroke="{INK}" stroke-width="2"/>'
             f'<path d="M-15 -177 Q-17 -166 -14 -156" stroke="#d22" stroke-width="5" stroke-linecap="round" fill="none"/>'
             + "".join(f'<path class="drip" style="animation-delay:{d}s" d="M-14 -158 q-5 8 0 11 q5 -3 0 -11z" fill="#d22"/>' for d in (0, 0.55)))
    point = arm(g, "M-34 -128 Q-74 -150 -36 -186", -34, -188)
    return svg([body(g, 0, 0, 1), arm_down(g, 0, 0, 1, 1), head(g, 0, 0, 1), blood, f'<g class="poke">{point}</g>'])

def pat(g):
    front = f'<g class="off">{body(g, 0, 0, 1)}{arm_down(g, 0, 0, 1, -1)}{arm_down(g, 0, 0, 1, 1)}{head(g, 0, 0, 1)}</g>'
    sweat = g["bot"]
    rear = [f'<g class="on"><g stroke="{INK}" stroke-width="5" stroke-linejoin="round">']
    for lx in (-18, 18):  # bare legs, pants at the ankles
        rear.append(f'<rect x="{lx-12}" y="-74" width="24" height="64" rx="11" fill="{SK}"/>')
        rear.append(f'<rect x="{lx-17}" y="-34" width="34" height="22" rx="9" fill="{sweat}"/>')
        rear.append(f'<ellipse cx="{lx}" cy="-7" rx="21" ry="10" fill="#2a2a33"/>')
    rear.append('<g class="wiggle">')
    rear.append(f'<circle cx="-17" cy="-80" r="24" fill="{SK}"/><circle cx="17" cy="-80" r="24" fill="{SK}"/>')
    rear.append('<circle cx="-22" cy="-74" r="6" fill="#ff7f8f" opacity=".5" stroke="none"/><circle cx="22" cy="-74" r="6" fill="#ff7f8f" opacity=".5" stroke="none"/>')
    rear.append('</g>')
    rear.append(f'<rect x="-38" y="-142" width="76" height="50" rx="20" fill="{g["topc"]}"/>')
    rear.append(f'<path d="M-24 -142 Q0 -116 24 -142" fill="{g["topc"]}"/>')  # hood on the back
    rear.append('</g>')
    rear.append(arm(g, "M-34 -128 Q-64 -150 -64 -196", -64, -200))
    rear.append(arm(g, "M34 -128 Q64 -150 64 -196", 64, -200))
    rear.append(f'<g stroke="{INK}" stroke-width="5"><circle cx="-42" cy="-182" r="10" fill="{SK}"/><circle cx="42" cy="-182" r="10" fill="{SK}"/>'
                f'<circle cx="0" cy="-186" r="44" fill="#6b4a32"/>'
                f'<path d="M-45 -196 Q-46 -240 0 -240 Q46 -240 45 -196 Z" fill="{g["hatc"]}"/>'
                f'<path d="M-46 -198 Q0 -184 46 -198 Q48 -186 36 -182 Q0 -170 -36 -182 Q-48 -186 -46 -198Z" fill="{g["hatc"]}"/></g>')
    rear.append('</g>')
    return svg([front] + rear)

def michael(g):
    tilted = f'<g transform="rotate(-14 0 -140)">{head(g, 0, 0, 1)}</g>'
    straight = arm(g, "M34 -128 L104 -196", 106, -198)
    bent = arm(g, "M-34 -128 Q-58 -196 22 -206", 24, -206)
    return svg([body(g, 0, 0, 1), f'<g class="bob">{tilted}{straight}{bent}</g>',
                f'<text x="-118" y="-238" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="30" fill="#7bc67b" stroke="{INK}" stroke-width="2">$7</text>'])

def chrome(g):
    throw = arm_up(g, 0, 0, 1, 1)
    stack = bill(70, -214, rot=-20) + bill(62, -206, rot=10)
    flying = "".join(bill(70, -214, rot=0, cls="fly", style=f"--dx:{dx}px;--dy:{dy}px;--r:{r}deg;animation-delay:{d}s")
                     for dx, dy, r, d in [(60, -40, 200, 0), (-120, -30, -260, 0.3), (20, -70, 300, 0.6), (-60, -60, 160, 0.9), (90, 10, -220, 1.2)])
    return svg([body(g, 0, 0, 1), arm_down(g, 0, 0, 1, -1), head(g, 0, 0, 1), throw, stack, flying])

def connor(g):
    car = (f'<g stroke="{INK}" stroke-width="4" stroke-linejoin="round">'
           f'<path d="M-146 -24 L-146 -52 L-118 -56 L-96 -84 L-46 -84 L-28 -58 L-2 -56 L-2 -24 Z" fill="#d42a2a"/>'
           f'<path d="M-146 -52 L-150 -70 L-132 -56 Z" fill="#d42a2a"/>'
           f'<path d="M-92 -78 L-74 -78 L-74 -58 L-108 -58 Z M-68 -78 L-50 -78 L-36 -58 L-68 -58 Z" fill="#cfeff3"/>'
           f'<path d="M-146 -40 H-2" stroke="#e8e8e8" stroke-width="5"/>'
           f'<circle cx="-118" cy="-22" r="13" fill="#2a2a33"/><circle cx="-34" cy="-22" r="13" fill="#2a2a33"/>'
           f'<circle cx="-118" cy="-22" r="5" fill="#ddd"/><circle cx="-34" cy="-22" r="5" fill="#ddd"/>'
           f'<text x="-74" y="-30" font-family="Arial Black,Arial,sans-serif" font-size="13" font-weight="900" fill="{INK}" stroke="none" text-anchor="middle">57</text></g>')
    wink = (f'<g class="on"><circle cx="15" cy="-184" r="9" fill="{g["skin"]}"/>'
            f'<path d="M6 -183 Q15 -192 24 -183" stroke="{INK}" stroke-width="5" fill="none" stroke-linecap="round"/></g>')
    gun = arm(g, "M34 -128 Q74 -128 84 -150", 86, -152) + f'<path d="M90 -156 L104 -166" stroke="{INK}" stroke-width="7" stroke-linecap="round"/>'
    return svg([car, body(g, 0, 0, 1), arm_down(g, 0, 0, 1, -1), head(g, 0, 0, 1), wink, gun])

def ben(g):
    pucker = (f'<path d="M-17 -164 Q0 -140 17 -164 L17 -150 L-17 -150 Z" fill="{g["skin"]}"/>'
              f'<circle cx="-26" cy="-166" r="10" fill="#ff7f8f" opacity=".55"/><circle cx="26" cy="-166" r="10" fill="#ff7f8f" opacity=".55"/>'
              f'<ellipse cx="6" cy="-158" rx="7" ry="6" fill="#5a2a2a" stroke="{INK}" stroke-width="3"/>')
    spit = "".join(f'<g class="spit" style="animation-delay:{d}s"><ellipse cx="{14 + o}" cy="-158" rx="{r}" ry="{r*0.8:.1f}" fill="#dff3ff" stroke="#8fb8cf" stroke-width="2"/></g>'
                   for o, r, d in [(0, 7, 0), (10, 5, 0.15), (-4, 6, 0.6), (8, 4, 0.75)])
    return svg([body(g, 0, 0, 1), arm_down(g, 0, 0, 1, -1), arm_down(g, 0, 0, 1, 1), head(g, 0, 0, 1), pucker, spit])

def weltz(g):
    beaver = (f'<g class="on"><g stroke="{INK}" stroke-width="4">'
              f'<ellipse cx="54" cy="-24" rx="40" ry="16" fill="#5b3a26" transform="rotate(-20 54 -24)"/>'
              f'<circle cx="-36" cy="-214" r="11" fill="#8a5a3c"/><circle cx="36" cy="-214" r="11" fill="#8a5a3c"/>'
              f'<path d="M-42.8 -196 L42.8 -196 A44 44 0 1 1 -42.8 -196 Z" fill="#8a5a3c"/>'
              f'<ellipse cx="0" cy="-160" rx="22" ry="14" fill="#b07a54"/>'
              f'<ellipse cx="0" cy="-170" rx="8" ry="5" fill="#2a1a12"/>'
              f'<rect x="-9" y="-158" width="9" height="15" rx="2" fill="#fff6dc"/><rect x="0" y="-158" width="9" height="15" rx="2" fill="#fff6dc"/></g>'
              f'<circle cx="-15" cy="-186" r="5" fill="{INK}"/><circle cx="15" cy="-186" r="5" fill="{INK}"/>'
              f'<path d="M-12 -164 H-38 M-12 -160 L-36 -154 M12 -164 H38 M12 -160 L36 -154" stroke="{INK}" stroke-width="2"/></g>')
    return svg([body(g, 0, 0, 1), arm_up(g, 0, 0, 1, -1), arm_up(g, 0, 0, 1, 1), head(g, 0, 0, 1), beaver])

def logan(g):
    behind = arm(g, "M-34 -128 Q-66 -100 -46 -70", -46, -68)
    wipe = f'<g class="rub">{bill(-50, -66, w=48, h=24, label="100", rot=-10)}{behind}</g>'
    lines = f'<path d="M-92 -86 h-16 M-96 -70 h-20 M-92 -54 h-16" stroke="#cfc8ff" stroke-width="4" stroke-linecap="round"/>'
    return svg([body(g, 0, 0, 1), wipe, lines, arm_up(g, 0, 0, 1, 1), head(g, 0, 0, 1)])

BITS = [john, evan, bush, pat, michael, chrome, connor, ben, weltz, logan]

if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for i, (g, bit) in enumerate(zip(CREW, BITS)):
        with open(os.path.join(out, f"crew-{i + 1:02d}-bit.svg"), "w") as f:
            f.write(bit(g))
