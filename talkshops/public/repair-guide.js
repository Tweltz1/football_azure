// Original Talk Shops illustrations. Artwork dedicated to the public domain under CC0 1.0.
(() => {
  "use strict";
  // Each panel uses its own local coordinates so it can also be read on a narrow screen.
  function path(d, color = "#234353", width = 4) {
    return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  function box(x,y,w,h,fill,r=4) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
  }
  function ring(x,y,r,fill,stroke="#234353") {
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  }
  const teal="#197667", amber="#ae5730", metal="#91a8ae", pale="#e2ece8";
  function pads(thickness) {
    return box(69,12,13,66,metal,2)+box(44,21,7,49,"#344f5d",2)+box(51,24,thickness,43,amber,1)+box(99,21,7,49,"#344f5d",2)+box(99-thickness,24,thickness,43,amber,1);
  }
  function circuit(color) {
    return box(12,19,28,18,pale)+path("M15 18h21")+path("M26 38v12h47V28h33m-33 22v16h33",color,6)+box(108,19,12,19,metal)+box(108,56,12,19,metal);
  }
  function wheel(angle,x,y) {
    return `<g transform="translate(${x} ${y}) rotate(${angle})">${box(-7,-13,14,26,"#324c59",4)}${path("M-2 -9v18m5-18v18","#9eb4b7",1.3)}</g>`;
  }
  function axle(angle) {
    return path("M44 46h60","#9bb2b5",7)+wheel(angle,43,46)+wheel(-angle,104,46)+path("M73 72V20m-5 6 5-6 5 6",teal,2);
  }
  function filter(dirty) {
    const pleats=Array.from({length:9},(_,i)=>path(`M${39+i*8} 26v40`,dirty?"#a98b6b":"#68a89a",4)).join("");
    return box(28,18,90,58,"#344f5d",6)+box(33,23,80,48,dirty?"#dbc9ac":"#e1f0df",2)+pleats+(dirty?path("m42 34 7 3m12 16 6-2m17-18 3 4m15 18-6 3",amber,4):"");
  }
  function belt(cracks) {
    const body=path("M25 58q50-36 96-18", "#344f5d",18)+path("M24 53q50-36 99-18",metal,2);
    return body+(cracks?path("m48 37 4 6-1 6m16-18 4 8-2 4m17-15 4 6-2 5","#e6ac86",2.5):"");
  }
  function strut(bounce) {
    return path("M47 14v10m0 25v26",metal,7)+box(42,42,10,26,"#385564")+path("M37 24h20l-21 6 21 6-21 6 21 6-20 5",teal,3)+path("M72 48h63","#adbfbe",1)+path(bounce?"M72 47q6-40 13 0t13 0t13 0t13 0":"M72 47q6-40 13 0t12 0q5-9 11 0t10 0h15",amber,2.5);
  }
  function sump(fresh) {
    return path("M24 28h98l-10 38H53L36 53Z", "#37545d",4)+path("M40 43h73l-6 18H55Z",fresh?"#d5a125":"#705744",9)+box(76,70,18,4,metal,1);
  }
  function plug(spark) {
    return box(66,10,17,28,"#f3e4c3")+path("M63 19h23m-23 6h23m-23 6h23",metal,3)+box(60,36,29,10,metal)+box(65,46,19,15,"#bfa277")+path("M73 60v6m10-6v14h-9", "#37545d",3)+(spark?path("m74 65-4 4h5l-3 4",amber,2):"");
  }
  function battery(power) {
    return box(29,30,84,44,"#344f5d")+box(37,24,15,7,metal,1)+box(92,24,15,7,metal,1)+path("M37 42h11m-5-5v10m48-5h12","#eff5ee",2)+[0,1,2,3].map(i=>box(49+i*12,53,8,13,i<(power?4:1)?(power?teal:"#eb9a6d"):"#657b81",1)).join("");
  }
  function rotation(moved) {
    return box(51,12,46,68,pale,13)+[[45,26],[103,26],[45,66],[103,66]].map(([x,y],i)=>wheel(0,x,y)+((moved?i===2:i===0)?ring(x,y,4,"#e9aa74",amber):"")).join("")+path("M70 27v37m-5-6 5 6 5-6",teal,2);
  }
  const topics = [
    ["brakes","Brake pads and rotors",/\b(brake pads?|brake rotors?|pads? and rotors?)\b/i,"Thin lining",pads(4),"Fresh lining",pads(16),"The pads squeeze the spinning rotor to slow the wheel. New pads restore the layer of friction material that wears away."],
    ["brake-fluid","Brake fluid exchange",/\bbrake fluid\b/i,"Old fluid",circuit("#977952"),"Fresh fluid",circuit(teal),"Brake fluid carries pedal pressure through lines to the brakes. An exchange replaces old fluid throughout the circuit."],
    ["alignment","Wheel alignment",/\balignment\b/i,"Toe out of spec",axle(16),"Toe adjusted",axle(1),"Viewed from above, toe is the direction the wheels point. The shop measures wheel angles and adjusts them to the vehicle’s specifications."],
    ["struts","Shocks and struts",/\b(struts?|shock absorbers?|shocks)\b/i,"More bouncing",strut(true),"Motion settles",strut(false),"A damper controls how quickly the suspension settles after a bump. The curve illustrates the wheel’s motion over time."],
    ["spark","Spark plugs",/\bspark plugs?\b/i,"Plug tip",plug(false),"Spark at gap",plug(true),"The ignition coil supplies voltage to the plug. A spark jumps the small gap at its tip to ignite the air and fuel mixture."],
    ["air-filter","Air filter replacement",/\b(?:engine |cabin )?air filters?\b/i,"Loaded pleats",filter(true),"New filter",filter(false),"Pleated material catches dust while air flows through it. An engine filter serves the engine intake. A cabin filter serves the passenger compartment."],
    ["belt","Serpentine belt",/\b(serpentine|accessory drive) belts?\b/i,"Surface cracks",belt(true),"Intact belt",belt(false),"The belt transfers engine rotation to accessories such as the alternator. Cracks are one example of wear the shop may find."],
    ["oil","Engine oil change",/\b(?:motor |engine |synthetic )?oil (?:and filter )?change\b/i,"Used oil",sump(false),"Refilled sump",sump(true),"The oil pan holds the engine’s supply of lubricant. During an oil change, the shop drains the used oil and refills with the specified grade."],
    ["rotation","Tire rotation",/\b(?:tire|tyre) rotation\b/i,"Before rotation",rotation(false),"After rotation",rotation(true),"The marked wheel shows one possible move from front to rear. Moving tires between approved positions helps distribute wear."],
    ["battery","12-volt battery replacement",/\b(?:12[- ]?v(?:olt)? |starting |car )?battery replacement\b|\breplace (?:the )?(?:12[- ]?v(?:olt)? )?battery\b/i,"Weak battery",battery(false),"Replacement",battery(true),"The starting battery provides a burst of power for the starter motor. A shop can test its ability to deliver that power under load."]
  ];
  function figure([id,title,pattern,left,a,right,b,explanation]) {
    return `<figure class="repair-figure"><svg viewBox="0 0 320 124" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="124" rx="10" fill="#f0f5f3"/><rect x="161" width="159" height="124" rx="10" fill="#e5f1eb"/><g transform="translate(5 3)">${a}</g><g transform="translate(166 3)">${b}</g><g fill="#203c47" font-family="system-ui,sans-serif" font-weight="600" font-size="13" text-anchor="middle"><text x="80" y="107">${left}</text><text x="240" y="107">${right}</text></g></svg><figcaption>${explanation}</figcaption></figure>`;
  }
  const symbols = {
  "piston": "M12 30H101V63H12Z M18 35H44V58H18Z M46 35V58 M52 35V58 M53 43H115V50H53 M70 30V20H84V30",
  "disc": "M65 13A33 33 0 1 0 65.1 13Z M65 27A19 19 0 1 0 65.1 27Z M65 40A6 6 0 1 0 65.1 40Z M91 22Q108 32 102 55L92 54Q98 36 85 29Z",
  "hose": "M11 57C37 57 26 24 52 24S68 64 91 55L111 45 M13 64C41 65 34 32 52 32S67 73 94 62L115 52 M12 52L18 68 M108 42L117 55",
  "tube": "M11 57H40Q49 57 49 48V33Q49 23 61 23H110 M11 66H41Q58 66 58 52V35Q58 32 63 32H110 M13 52V70 M107 19V36",
  "diaphragm": "M29 52Q30 22 60 19Q93 19 96 52Z M27 56H99 M35 59Q64 78 90 59 M64 19V9 M60 64V75 M39 52Q63 34 87 52",
  "cable": "M12 61L43 52Q55 48 62 35T96 22L110 21 M24 63L45 57Q60 53 67 39T98 27 M15 58L19 66 M95 17L99 32",
  "lever": "M22 58Q18 52 25 47L94 20Q102 17 106 24T99 36L57 52L36 66Q27 71 22 58Z M28 54L32 53 M94 28L98 27",
  "shoes": "M49 14Q0 43 48 77L54 67Q20 44 56 24Z M77 16Q123 44 79 76L72 66Q104 43 70 26Z",
  "drum": "M61 14A32 32 0 1 0 61.1 14Z M61 22A24 24 0 1 0 61.1 22Z M61 40A6 6 0 1 0 61.1 40Z M84 23L94 28Q123 58 87 76L69 78",
  "bearing": "M62 12A34 34 0 1 0 62.1 12Z M62 30A16 16 0 1 0 62.1 30Z M62 16a5 5 0 1 0 .1 0 M62 66a5 5 0 1 0 .1 0 M37 41a5 5 0 1 0 .1 0 M87 41a5 5 0 1 0 .1 0",
  "hub": "M38 30Q48 15 77 17L97 35L94 59L70 75L42 68L26 48Z M63 30A15 15 0 1 0 63.1 30Z M40 39l3-2 M82 35l3 2 M76 61l3-1 M45 58l3 1",
  "gear": "M47 18L54 18L56 11H68L70 18L77 20L83 15L92 23L88 30L92 37L100 38V50L92 52L89 59L94 66L84 74L77 69L70 72L68 79H56L54 72L47 70L40 75L31 66L36 59L32 52L25 50V38L32 36L35 30L31 22L40 15Z M63 30A15 15 0 1 0 63.1 30Z",
  "sensor": "M18 23H43L55 32L48 46L33 43L18 35Z M49 47L71 64L78 55L56 38 M18 26L9 21 M80 48Q93 53 89 66 M89 43Q107 52 101 71",
  "joint": "M30 29Q26 66 59 71Q95 71 95 35L83 33Q84 58 61 59Q42 59 43 33Z M62 31A13 13 0 1 0 62.1 31Z M58 29V13H68V30",
  "rack": "M15 52H110V63H15Z M24 52V46L29 41L34 46L39 41L44 46L49 41L54 46L59 41L64 46L69 41L74 46L79 41L84 46L89 41L94 46V52 M62 13A12 12 0 1 0 62.1 13Z",
  "bushing": "M58 17A29 29 0 1 0 58.1 17Z M58 31A15 15 0 1 0 58.1 31Z M58 39A7 7 0 1 0 58.1 39Z M67 18L85 25Q115 48 84 69L65 75",
  "link": "M23 56L83 25 M31 66L93 35 M24 50A10 10 0 1 0 24.1 50Z M94 15A10 10 0 1 0 94.1 15Z",
  "bar": "M14 57L29 30Q32 26 37 26H87Q93 26 96 32L110 59 M20 60L34 35Q36 33 40 33H84Q87 33 90 38L104 62",
  "spring": "M43 17H81L38 27Q30 31 42 34L84 40L39 47Q30 50 42 54L83 60L40 68H78",
  "pump": "M44 28Q84 7 94 42Q102 73 69 73Q43 72 40 53H18V42H42Z M85 25V16H109V27H96 M68 37A11 11 0 1 0 68.1 37Z",
  "core": "M18 23H106V67H18Z M28 23V67 M97 23V67 M33 29H91M33 36H91M33 43H91M33 50H91M33 57H91 M9 29H18 M106 61H116",
  "fan": "M64 39a8 8 0 1 0 .1 0 M57 39Q32 23 58 13Q76 10 67 37 M73 44Q91 18 104 42Q106 57 74 51 M64 56Q76 80 54 78Q38 74 55 53 M53 47Q27 64 22 44Q20 27 53 40",
  "impeller": "M62 16A30 30 0 1 0 62.1 16Z M61 39a7 7 0 1 0 .1 0 M56 39Q35 35 39 29 M65 39Q60 19 69 20 M70 45Q86 32 88 41 M64 53Q82 62 73 68 M55 49Q40 61 37 51",
  "valve": "M13 40H44L60 48L44 56H13 M112 40H81L65 48L81 56H112 M62 46V22 M46 21H79 M49 29H74L53 34H73",
  "tank": "M40 18H72V28H86L97 40V69H26V37L40 29Z M37 18V12H75V18 M31 51Q45 45 59 51T90 51",
  "gauge": "M24 66A40 40 0 1 1 101 66Z M62 55L84 34 M32 48L39 49 M48 26L52 33 M78 25L75 32 M94 47L86 50",
  "gasket": "M19 28L34 18H95L107 30V60L93 70H32L18 58Z M29 34L39 27H89L97 35V55L88 61H37L28 54Z M24 28h1 M99 60h1",
  "cover": "M17 58H109V66H17Z M26 58L33 34Q34 28 43 28H80Q89 28 92 34L101 58 M42 37H79 M37 48H84",
  "pan": "M13 29H112V37H104L94 64H46L26 49L23 36H13Z M51 57H88 M71 67H85",
  "seal": "M57 14A32 32 0 1 0 57.1 14Z M57 27A19 19 0 1 0 57.1 27Z M57 32A14 14 0 1 0 57.1 32Z M75 20L89 29Q111 55 79 71",
  "shaft": "M15 34H38V39H85V30H104V62H85V54H38V59H15Z M19 38V54 M25 38V54 M31 38V54 M93 35V57 M98 35V57",
  "cam": "M13 41H112V51H13Z M35 42Q37 8 49 18Q56 23 51 42 M69 52Q69 76 80 72Q89 66 85 52",
  "belt": "M27 31L87 20Q111 21 108 43Q106 56 92 60L38 72Q15 70 16 51Q16 37 27 31Z M31 38L89 27Q104 29 101 42Q100 50 89 53L37 65Q21 64 23 51Q24 43 31 38Z",
  "chain": "M16 46Q17 34 30 34H43Q58 34 58 46T43 58H30Q16 58 16 46Z M67 46Q67 34 81 34H94Q109 34 109 46T94 58H81Q67 58 67 46Z M39 46H84",
  "drop": "M62 12Q51 32 42 46Q31 68 51 75Q70 83 81 65Q88 52 76 35Z M49 59Q48 67 57 69",
  "nozzle": "M30 16L57 24L53 35L71 43L65 57L43 49L36 62L23 56L33 33L24 28Z M62 54L79 62L82 55L70 49 M86 61L101 65 M83 66L96 76",
  "spray": "M16 40H43V51H16Z M43 42L51 45L43 49 M59 40L83 25 M61 46H106 M59 52L83 68 M87 23L97 17 M88 71L98 77",
  "filter": "M16 23H110V68H16Z M23 29L30 61L37 29L44 61L51 29L58 61L65 29L72 61L79 29L86 61L93 29L100 61",
  "butterfly": "M17 22H111 M17 69H111 M62 24A22 22 0 1 0 62.1 24Z M45 34L79 59 M47 30L81 56",
  "wave": "M11 48H26L32 31L43 66L52 24L63 65L73 33L79 51H89L95 44L101 50H115",
  "honeycomb": "M16 32L34 19H92L110 32V60L92 71H34L16 60Z M41 27L48 31V40L41 44L34 40V31Z M57 36L64 40V49L57 53L50 49V40Z M41 46L48 50V59L41 63L34 59V50Z M75 26L83 30V40L75 44L68 40V30Z M75 46L83 50V59L75 63L68 59V50Z",
  "rotor": "M12 43H111V50H12Z M40 27L50 22H75L87 30V61L76 68H51L39 60Z M46 33L54 55L62 31L69 57L78 33",
  "battery": "M18 29H108V71H18Z M29 29V20H44V29 M81 29V20H96V29 M29 44H44 M36 37V51 M82 44H96",
  "motor": "M27 30L36 23H84L96 32V60L85 67H39L27 59Z M96 41H112V50H96 M38 33V57 M45 33V57 M51 33V57 M18 39H26",
  "clamp": "M50 25Q29 25 29 45T50 66Q67 66 74 52L105 58L109 47L76 39Q72 27 59 25L59 35Q70 41 63 51Q54 64 43 53Q32 41 49 35Z",
  "braid": "M13 36L108 49L106 60L12 47Z M26 38L36 50 M39 40L49 52 M52 42L62 54 M65 44L75 56 M78 46L88 58 M29 49L40 40 M50 52L61 43 M72 55L83 46",
  "coil": "M15 59H29V33Q29 22 36 26Q42 30 40 47Q38 58 33 51Q29 42 39 32Q49 21 54 28Q61 38 54 51Q47 58 47 46Q47 34 60 27Q69 22 72 31Q77 43 70 51Q64 57 64 46Q64 33 79 27Q92 22 92 39V58H111",
  "plug": "M52 12H70V33H76V41L83 45V54H44V45L51 41Z M50 56H75V67H50Z M56 68V75 M74 68V80H62 M50 25H73 M50 31H73",
  "fuse": "M32 19H93V56H32Z M40 56V75H49V56 M76 56V75H85V56 M43 46V32H54L61 41L69 31H81V46",
  "boot": "M13 39H31L39 30L46 56L55 22L63 62L72 16L81 67L91 22L99 34H110V54H99L91 69H81L73 73L63 67H56L45 62H36L29 53H13Z",
  "cross": "M50 18H75V34H94V57H75V74H50V57H31V34H50Z M56 39H69V53H56Z",
  "wheel": "M63 12A34 34 0 1 0 63.1 12Z M63 22A24 24 0 1 0 63.1 22Z M63 39A7 7 0 1 0 63.1 39Z M63 24V38 M68 50L81 60 M56 51L45 63",
  "weight": "M27 36Q63 19 99 36L95 55Q63 43 31 55Z M53 27V19H75V27 M40 34L43 47 M83 34L80 47",
  "stud": "M16 29H32V62H16Z M32 37H102L111 43V50L102 55H32 M56 37L49 55 M68 37L61 55 M80 37L73 55 M92 37L85 55 M103 38L97 54",
  "chamber": "M13 42H28Q33 22 48 22H78Q96 22 98 38H112V47H98Q97 67 80 67H47Q30 67 28 51H13Z M40 38H64V56H85 M47 30V52 M76 32V46",
  "blade": "M12 53Q64 26 114 45L112 52Q64 35 15 60Z M57 37L60 28L74 27L77 38",
  "glass": "M16 66L30 26Q60 17 96 26L110 66Q63 57 16 66Z M43 50L57 32 M54 51L64 38",
  "lamp": "M51 54Q28 33 48 19Q65 8 78 21Q94 37 74 54L72 62H53Z M53 66H72 M56 72H69 M57 53L54 36L62 40L70 36L66 54",
  "mirror": "M86 13Q36 20 34 44Q34 66 86 77 M41 40L85 24 M39 46H105 M41 53L85 68"
};
  const repairs = [
    ["Brakes and wheel hubs", "Brake caliper", "caliper replacement,brake calipers", ["piston", "Caliper piston"], ["disc", "Brake rotor"], "Hydraulic pressure pushes the piston outward. The caliper squeezes the pads against the rotor to slow the wheel."],
    ["Brakes and wheel hubs", "Brake hose", "brake hoses,flex hose replacement", ["hose", "Flexible hose"], ["piston", "Caliper"], "The hose flexes as the wheel steers and travels over bumps while carrying pressurized brake fluid to the caliper."],
    ["Brakes and wheel hubs", "Brake line", "brake lines,brake pipe", ["tube", "Rigid line"], ["hose", "Wheel hose"], "A formed metal tube carries brake fluid along the body. A flexible hose takes over where the wheel needs to move."],
    ["Brakes and wheel hubs", "Brake master cylinder", "master cylinder replacement", ["piston", "Master cylinder"], ["tube", "Brake lines"], "Pedal movement pushes pistons inside the master cylinder. Their movement creates hydraulic pressure in the brake circuits."],
    ["Brakes and wheel hubs", "Brake booster", "power brake booster", ["diaphragm", "Booster"], ["piston", "Master cylinder"], "On a vacuum-assisted system, a pressure difference across the diaphragm adds force to the pushrod as the driver presses the pedal."],
    ["Brakes and wheel hubs", "Parking brake cable", "handbrake cable", ["cable", "Inner cable"], ["lever", "Brake lever"], "The inner cable slides within a fixed sleeve, pulling a lever at the rear brake to hold the vehicle when parked."],
    ["Brakes and wheel hubs", "Brake shoes", "drum brake shoes,brake shoe replacement", ["shoes", "Curved shoes"], ["drum", "Brake drum"], "Inside a drum brake, the friction shoes press outward against the rotating drum. Replacement renews the lining on the shoes."],
    ["Brakes and wheel hubs", "Wheel cylinder", "wheel cylinders", ["piston", "Wheel cylinder"], ["shoes", "Brake shoes"], "Fluid pressure moves two small pistons apart. Each piston pushes a shoe toward the inside of the drum."],
    ["Brakes and wheel hubs", "Wheel bearing", "wheel bearings,hub bearing", ["bearing", "Rolling elements"], ["hub", "Wheel hub"], "The bearing carries vehicle weight while letting the hub rotate. Damaged rolling surfaces can make a rumbling sound as speed increases."],
    ["Brakes and wheel hubs", "Wheel speed sensor", "wheel speed sensors,abs sensor", ["gear", "Encoder ring"], ["sensor", "Speed sensor"], "The sensor reads a changing pattern at the rotating wheel. The brake controller uses that signal to track wheel speed."],
    ["Steering and suspension", "Outer tie rod end", "outer tie rods,outer tie rod ends", ["joint", "Ball stud"], ["lever", "Steering arm"], "The outer tie rod pivots at the steering arm while transmitting the rack’s side-to-side motion to turn the wheel."],
    ["Steering and suspension", "Inner tie rod", "inner tie rods", ["rack", "Steering rack"], ["joint", "Inner joint"], "The inner joint connects a tie rod to the steering rack and allows the suspension to move through its travel."],
    ["Steering and suspension", "Ball joint", "ball joints", ["joint", "Ball and socket"], ["lever", "Control arm"], "A spherical stud pivots inside its socket, allowing the wheel assembly to steer and move up and down relative to the arm."],
    ["Steering and suspension", "Control arm bushing", "control arm bushings", ["bushing", "Rubber bushing"], ["lever", "Control arm"], "Rubber between two sleeves allows a controlled amount of movement at the arm’s mounting point and cushions vibration."],
    ["Steering and suspension", "Sway bar link", "sway bar links,stabilizer link,stabilizer links", ["link", "End link"], ["bar", "Anti-roll bar"], "The link transfers suspension movement to the anti-roll bar. The bar twists when the left and right sides move differently."],
    ["Steering and suspension", "Sway bar bushing", "sway bar bushings,stabilizer bar bushing", ["bushing", "Support bushing"], ["bar", "Anti-roll bar"], "The bushing supports the bar against the body while allowing it to twist as the vehicle corners."],
    ["Steering and suspension", "Coil spring", "coil springs", ["spring", "Coil spring"], ["lever", "Suspension arm"], "The spring supports the vehicle and compresses as the wheel rises. Its shape and rate help determine ride height."],
    ["Steering and suspension", "Strut mount", "strut mounts,strut top mount", ["bushing", "Upper mount"], ["spring", "Strut assembly"], "The upper mount joins the strut to the vehicle body. On many front struts, a bearing here also allows the assembly to turn."],
    ["Steering and suspension", "Power steering pump", "power steering pumps", ["pump", "Hydraulic pump"], ["rack", "Steering rack"], "On hydraulic steering systems, the pump supplies fluid flow that the steering gear uses to assist the driver."],
    ["Steering and suspension", "Steering rack", "rack and pinion,rack & pinion", ["gear", "Pinion gear"], ["rack", "Toothed rack"], "The steering shaft turns a small gear that moves the rack sideways. The rack moves the tie rods to steer the wheels."],
    ["Cooling system", "Radiator replacement", "radiator assembly,replace radiator", ["core", "Radiator core"], ["fan", "Outside air"], "Coolant flows through narrow tubes. Fins between the tubes expose a large surface to air so heat can escape."],
    ["Cooling system", "Radiator hose", "radiator hoses,upper radiator hose,lower radiator hose", ["hose", "Coolant hose"], ["core", "Radiator"], "A molded hose connects the engine and radiator while allowing movement between them. Replacement restores a sealed coolant path."],
    ["Cooling system", "Water pump", "coolant pump", ["impeller", "Impeller"], ["tube", "Coolant passages"], "The rotating impeller circulates coolant through the engine and cooling circuit to carry heat away."],
    ["Cooling system", "Engine thermostat", "coolant thermostat,thermostat replacement", ["valve", "Thermostat"], ["core", "Radiator"], "As coolant warms, the thermostat opens the path to the radiator. This regulates how much engine heat reaches the outside air."],
    ["Cooling system", "Radiator fan", "cooling fan assembly,engine cooling fan", ["fan", "Fan blades"], ["core", "Radiator fins"], "The fan draws or pushes air through the radiator when road speed alone does not provide enough airflow."],
    ["Cooling system", "Coolant reservoir", "coolant expansion tank,overflow tank", ["tank", "Reservoir"], ["hose", "Coolant hose"], "The tank accommodates coolant as it expands with heat. A sealed tank or recovery system returns coolant as the engine cools."],
    ["Cooling system", "Radiator cap", "coolant pressure cap", ["valve", "Spring valve"], ["tank", "Filler neck"], "A calibrated spring valve controls cooling-system pressure. The cap seals at the filler neck until the valve’s opening pressure is reached."],
    ["Cooling system", "Heater core", "heater matrix", ["core", "Heater core"], ["fan", "Cabin airflow"], "Hot engine coolant passes through a small heat exchanger. Air flowing over its fins carries heat into the cabin."],
    ["Cooling system", "Coolant temperature sensor", "engine coolant temp sensor,ect sensor", ["sensor", "Temperature probe"], ["gauge", "Temperature signal"], "The probe responds to coolant temperature. Electronics use its signal for functions such as engine management and fan control."],
    ["Cooling system", "Coolant exchange", "coolant flush,antifreeze flush", ["tank", "Fresh coolant"], ["tube", "Cooling circuit"], "The service replaces old coolant with the specified mixture to renew freeze and corrosion protection in the cooling circuit."],
    ["Engine and lubrication", "Valve cover gasket", "rocker cover gasket", ["gasket", "Cover gasket"], ["cover", "Valve cover"], "A shaped seal sits between the valve cover and cylinder head. Replacing it addresses oil escaping from that joint."],
    ["Engine and lubrication", "Oil pan gasket", "sump gasket", ["gasket", "Pan seal"], ["pan", "Oil pan"], "The seal follows the edge of the oil pan where it meets the engine. A new seal closes the joint against oil leaks."],
    ["Engine and lubrication", "Crankshaft seal", "front main seal,rear main seal", ["seal", "Sealing lip"], ["shaft", "Crankshaft"], "A flexible lip hugs the spinning crankshaft so oil stays inside the engine while the shaft turns."],
    ["Engine and lubrication", "Camshaft seal", "camshaft seals,cam seal", ["seal", "Sealing lip"], ["cam", "Camshaft"], "The seal rides on the rotating camshaft at its exit from the head, keeping engine oil behind the sealing lip."],
    ["Engine and lubrication", "Oil pressure sensor", "oil pressure switch,sender unit oil pressure", ["sensor", "Pressure sensor"], ["gauge", "Oil pressure"], "The sensor responds to oil-gallery pressure. Depending on the design, it feeds a warning lamp, gauge or control module."],
    ["Engine and lubrication", "Oil cooler", "engine oil cooler", ["core", "Oil cooler"], ["tube", "Oil passages"], "Oil passes through a heat exchanger that transfers heat to air or coolant. Separate passages keep the fluids apart."],
    ["Engine and lubrication", "Timing belt", "cam belt,cambelt", ["belt", "Toothed belt"], ["gear", "Cam sprocket"], "Teeth on the belt engage matching sprockets, keeping camshaft and crankshaft rotation synchronized as the valves open and close."],
    ["Engine and lubrication", "Timing chain", "cam chain", ["chain", "Timing chain"], ["gear", "Timing sprocket"], "Linked metal sections engage sprocket teeth. The chain maintains the timed relationship between crankshaft and camshaft."],
    ["Engine and lubrication", "Engine mount", "motor mount,engine mounts", ["bushing", "Rubber mount"], ["cover", "Engine bracket"], "The mount supports the engine while its flexible section reduces vibration transferred into the vehicle body."],
    ["Engine and lubrication", "PCV valve", "positive crankcase ventilation valve", ["valve", "PCV valve"], ["tube", "Intake passage"], "The valve meters crankcase vapors into the intake so the engine can burn them and maintain controlled crankcase ventilation."],
    ["Fuel, intake and emissions", "Fuel pump", "fuel pump module", ["pump", "Fuel pump"], ["tube", "Supply line"], "The pump moves fuel from the tank toward the engine. The fuel system relies on the specified supply pressure and flow."],
    ["Fuel, intake and emissions", "Fuel injector", "fuel injectors", ["nozzle", "Injector tip"], ["spray", "Fuel spray"], "A controlled valve at the injector meters a small quantity of fuel into the intake port or combustion chamber."],
    ["Fuel, intake and emissions", "Fuel filter", "fuel filters", ["filter", "Filter media"], ["nozzle", "Fuel injector"], "Fuel passes through filter material that traps particles before they reach downstream components such as the injectors."],
    ["Fuel, intake and emissions", "Throttle body", "throttle plate cleaning", ["butterfly", "Throttle plate"], ["tube", "Intake passage"], "A plate pivots inside the throttle bore to change the opening available for intake air. Deposits can build up near the plate’s edge."],
    ["Fuel, intake and emissions", "Mass airflow sensor", "mass air flow sensor,maf sensor", ["sensor", "Sensing element"], ["tube", "Intake duct"], "The sensor measures incoming air mass. The engine controller uses that reading when calculating how much fuel to deliver."],
    ["Fuel, intake and emissions", "Intake manifold gasket", "intake manifold gaskets", ["gasket", "Manifold gasket"], ["tube", "Intake runner"], "The gasket seals the intake runners to the cylinder head so air follows the intended path into each cylinder."],
    ["Fuel, intake and emissions", "Oxygen sensor", "oxygen sensors,o2 sensor,lambda sensor", ["sensor", "Exhaust probe"], ["wave", "Sensor signal"], "The probe responds to oxygen in the exhaust. Its position determines whether the signal helps control fueling or monitor the catalyst."],
    ["Fuel, intake and emissions", "Catalytic converter", "catalyst replacement", ["honeycomb", "Coated channels"], ["tube", "Exhaust flow"], "Exhaust passes through many catalyst-coated channels. Their large surface supports reactions that reduce harmful emissions."],
    ["Fuel, intake and emissions", "EVAP purge valve", "purge solenoid,canister purge valve", ["valve", "Purge valve"], ["tube", "Intake manifold"], "The valve controls when stored fuel vapor can travel from the charcoal canister into the engine intake."],
    ["Fuel, intake and emissions", "EGR valve", "exhaust gas recirculation valve", ["valve", "EGR valve"], ["tube", "Intake passage"], "The valve meters exhaust gas back into the intake under selected conditions to help control combustion temperature and emissions."],
    ["Electrical and starting", "Alternator replacement", "replace alternator,alternator assembly", ["rotor", "Spinning rotor"], ["battery", "Battery"], "The engine turns the alternator rotor. The alternator supplies electrical power and recharges the battery while the engine runs."],
    ["Electrical and starting", "Starter motor", "starter replacement,starter assembly", ["motor", "Starter motor"], ["gear", "Flywheel gear"], "A small starter gear engages a large gear attached to the engine. The motor turns the engine until combustion takes over."],
    ["Electrical and starting", "Battery terminal", "battery terminals,battery clamp", ["clamp", "Terminal clamp"], ["battery", "Battery post"], "The clamp fastens the cable to the battery post. A sound connection allows high current to pass with little voltage loss."],
    ["Electrical and starting", "Battery cable", "battery cables", ["cable", "Heavy cable"], ["battery", "Battery"], "Heavy conductors carry starting current between the battery, starter and return path. A damaged connection can restrict current flow."],
    ["Electrical and starting", "Ground strap", "engine ground cable,ground straps", ["braid", "Braided strap"], ["cover", "Body connection"], "A flexible conductor connects engine and body electrically while allowing engine movement, completing a low-resistance current path."],
    ["Electrical and starting", "Ignition coil", "ignition coils,coil pack", ["coil", "Coil windings"], ["plug", "Spark plug"], "The coil transforms electrical energy into the high voltage needed for a spark to jump the plug gap."],
    ["Electrical and starting", "Crankshaft position sensor", "crank sensor,ckp sensor", ["gear", "Trigger wheel"], ["sensor", "Crank sensor"], "As the crankshaft turns, a patterned wheel passes the sensor. Its pulses let the controller track engine speed and position."],
    ["Electrical and starting", "Camshaft position sensor", "cam sensor,cmp sensor", ["cam", "Camshaft target"], ["sensor", "Cam sensor"], "The sensor reads a target on the camshaft. Its signal identifies the engine’s phase within the combustion cycle."],
    ["Electrical and starting", "Horn replacement", "replace horn,horn assembly", ["coil", "Electromagnet"], ["diaphragm", "Sound diaphragm"], "In a common electric horn, current drives an electromagnet that vibrates a diaphragm to produce sound."],
    ["Electrical and starting", "Fuse replacement", "blown fuse,replace fuse", ["fuse", "Fusible link"], ["cable", "Protected circuit"], "The narrow link opens if excessive current flows. A correctly rated replacement restores continuity after the cause is addressed."],
    ["Transmission and driveline", "CV axle", "cv shaft,cv axles,half shaft", ["joint", "CV joint"], ["shaft", "Axle shaft"], "The shaft transmits torque to a driven wheel. Its constant-velocity joints allow the wheel to move with the suspension."],
    ["Transmission and driveline", "CV boot", "cv boots,axle boot", ["boot", "Pleated boot"], ["joint", "CV joint"], "The flexible boot follows joint movement while holding grease inside and keeping water and grit out."],
    ["Transmission and driveline", "Universal joint", "u joint,u-joint,universal joints", ["cross", "Joint cross"], ["shaft", "Driveshaft"], "A cross on four bearings allows torque to pass between shafts that meet at an angle."],
    ["Transmission and driveline", "Driveshaft support bearing", "carrier bearing,center support bearing", ["bearing", "Center bearing"], ["shaft", "Driveshaft"], "A bearing and support bracket hold a multi-piece driveshaft in position while allowing it to rotate."],
    ["Transmission and driveline", "Differential fluid service", "differential fluid change,differential oil change", ["gear", "Differential gears"], ["drop", "Gear lubricant"], "The lubricant coats loaded gear teeth and bearings. Changing it renews the specified oil in the axle housing."],
    ["Transmission and driveline", "Differential cover gasket", "differential cover seal", ["gasket", "Cover seal"], ["cover", "Axle cover"], "A sealed joint at the rear cover retains lubricant inside the differential housing."],
    ["Transmission and driveline", "Transmission pan gasket", "transmission sump gasket", ["gasket", "Pan gasket"], ["pan", "Transmission pan"], "The gasket seals the transmission fluid pan against the case and prevents fluid escaping at the perimeter."],
    ["Transmission and driveline", "Transmission filter", "transmission filters", ["filter", "Fluid filter"], ["pump", "Transmission pump"], "The filter traps debris in transmission fluid as it circulates through the hydraulic system."],
    ["Transmission and driveline", "Clutch master cylinder", "clutch master", ["piston", "Master cylinder"], ["tube", "Clutch line"], "Pressing the clutch pedal moves a piston that sends hydraulic pressure toward the clutch release mechanism."],
    ["Transmission and driveline", "Clutch slave cylinder", "clutch slave", ["piston", "Slave cylinder"], ["lever", "Release mechanism"], "Hydraulic pressure moves the slave piston, turning fluid pressure into the motion used to release the clutch."],
    ["Heating and air conditioning", "AC compressor", "a/c compressor,air conditioning compressor", ["pump", "Compressor"], ["core", "Condenser"], "The compressor raises the pressure and temperature of refrigerant vapor and sends it toward the condenser."],
    ["Heating and air conditioning", "AC condenser", "a/c condenser,air conditioning condenser", ["core", "Condenser fins"], ["fan", "Outside airflow"], "Air crossing the condenser carries heat away so high-pressure refrigerant vapor can condense into liquid."],
    ["Heating and air conditioning", "AC evaporator", "a/c evaporator,evaporator core", ["core", "Evaporator"], ["fan", "Cabin airflow"], "Refrigerant absorbs heat as it boils inside the evaporator. Cabin air passing over its fins cools down."],
    ["Heating and air conditioning", "AC expansion valve", "a/c expansion valve,thermal expansion valve", ["valve", "Metering valve"], ["core", "Evaporator"], "The valve meters refrigerant into the low-pressure side of the system at the evaporator entrance."],
    ["Heating and air conditioning", "Blower motor", "heater blower motor", ["motor", "Blower motor"], ["fan", "Blower wheel"], "The electric motor spins the blower wheel to push air through the climate-control housing and cabin vents."],
    ["Heating and air conditioning", "Blower motor resistor", "blower resistor", ["coil", "Resistor element"], ["motor", "Blower motor"], "On resistor-controlled systems, different resistance paths change the voltage available to the motor at lower fan speeds."],
    ["Heating and air conditioning", "Blend door actuator", "temperature door actuator", ["motor", "Small actuator"], ["butterfly", "Blend door"], "The actuator moves a door inside the HVAC housing to change how much air passes through the heater core."],
    ["Heating and air conditioning", "Heater hose", "heater hoses", ["hose", "Heater hose"], ["core", "Heater core"], "These hoses carry engine coolant to and from the heater core so heat can be transferred into cabin air."],
    ["Heating and air conditioning", "AC receiver drier", "receiver dryer,receiver drier,receiver-drier", ["tank", "Receiver"], ["filter", "Desiccant bed"], "The receiver stores liquid refrigerant. Its desiccant captures moisture before refrigerant reaches the metering device."],
    ["Heating and air conditioning", "AC pressure sensor", "a/c pressure sensor,refrigerant pressure sensor", ["sensor", "Pressure sensor"], ["gauge", "Pressure signal"], "The sensor measures refrigerant pressure and sends a signal used to manage compressor and fan operation."],
    ["Wheels, fluids and exhaust", "TPMS sensor", "tire pressure sensor,tpms sensors", ["sensor", "Wheel sensor"], ["wave", "Radio signal"], "A direct tire-pressure sensor measures pressure inside the tire and transmits readings to the vehicle."],
    ["Wheels, fluids and exhaust", "Tire valve stem", "tyre valve stem,tire valve stems", ["valve", "Valve core"], ["wheel", "Wheel rim"], "The stem seals in the rim. Its spring-loaded core lets air enter during inflation and closes to retain pressure."],
    ["Wheels, fluids and exhaust", "Wheel balance", "tire balance,wheel balancing,tire balancing", ["wheel", "Wheel assembly"], ["weight", "Balance weight"], "A balancing machine measures mass imbalance. Small weights offset the heavy spots to reduce vibration while the wheel spins."],
    ["Wheels, fluids and exhaust", "Wheel stud", "wheel studs,lug stud", ["stud", "Press-fit stud"], ["hub", "Hub flange"], "The stud anchors in the hub. A lug nut threads onto it to clamp the wheel against the hub face."],
    ["Wheels, fluids and exhaust", "Muffler replacement", "replace muffler,rear muffler", ["chamber", "Muffler chambers"], ["wave", "Sound waves"], "Internal chambers or sound-absorbing material reduce exhaust noise while allowing gas to continue toward the tailpipe."],
    ["Wheels, fluids and exhaust", "Exhaust flex pipe", "exhaust flex joint,flex pipe replacement", ["braid", "Flexible section"], ["tube", "Exhaust pipe"], "A flexible joint allows engine movement and thermal expansion without forcing the entire exhaust pipe to move rigidly."],
    ["Wheels, fluids and exhaust", "Exhaust manifold gasket", "exhaust manifold gaskets", ["gasket", "Port gasket"], ["tube", "Exhaust runner"], "The gasket seals the exhaust ports at the head to the manifold so hot gas enters the runners without leaking at the joint."],
    ["Wheels, fluids and exhaust", "Exhaust hanger", "exhaust hangers,muffler hanger", ["bushing", "Rubber isolator"], ["tube", "Exhaust pipe"], "The hanger supports the exhaust while its flexible rubber section isolates vibration from the body."],
    ["Wheels, fluids and exhaust", "Transmission fluid exchange", "transmission fluid change,atf change", ["drop", "Specified fluid"], ["gear", "Transmission"], "This service replaces used transmission fluid. The correct fluid provides lubrication and the friction behavior the unit was designed for."],
    ["Wheels, fluids and exhaust", "Transfer case fluid", "transfer case service", ["gear", "Transfer gears"], ["drop", "Case lubricant"], "The transfer case directs torque to multiple axles. Its specified fluid lubricates internal parts as the drivetrain works."],
    ["Visibility, doors and body", "Wiper blade replacement", "wiper blades,windshield wipers", ["blade", "Rubber edge"], ["glass", "Windshield"], "The flexible blade edge follows the glass and sweeps water away as the wiper arm travels across the windshield."],
    ["Visibility, doors and body", "Wiper motor", "windshield wiper motor", ["motor", "Wiper motor"], ["link", "Wiper linkage"], "The motor drives a linkage that converts continuous rotation into the back-and-forth sweep of the wiper arms."],
    ["Visibility, doors and body", "Washer pump", "windshield washer pump", ["pump", "Washer pump"], ["spray", "Washer jets"], "A small electric pump moves cleaning fluid from the reservoir to the jets near the windshield."],
    ["Visibility, doors and body", "Washer nozzle", "washer jets,washer nozzles", ["nozzle", "Washer nozzle"], ["spray", "Spray pattern"], "The nozzle shapes incoming washer fluid into jets or a fan that spreads across the glass."],
    ["Visibility, doors and body", "Window regulator", "window regulators", ["cable", "Lift mechanism"], ["glass", "Door glass"], "The regulator guides the glass up and down. In a cable design, a moving carrier supports the bottom edge of the window."],
    ["Visibility, doors and body", "Power window motor", "window lift motor", ["motor", "Window motor"], ["gear", "Regulator drive"], "The motor turns a geared drive connected to the regulator. Reversing motor direction raises or lowers the glass."],
    ["Visibility, doors and body", "Door lock actuator", "power lock actuator", ["motor", "Lock actuator"], ["lever", "Latch lever"], "An electrical command moves the actuator, which shifts the latch mechanism between locked and unlocked positions."],
    ["Visibility, doors and body", "Liftgate strut", "hatch struts,liftgate supports,tailgate strut", ["piston", "Gas spring"], ["lever", "Hatch hinge"], "Pressurized gas pushes on a piston rod to help lift the hatch and support it when open."],
    ["Visibility, doors and body", "Headlight bulb", "headlamp bulb,headlight bulbs", ["lamp", "Light source"], ["mirror", "Reflector"], "In a replaceable-bulb headlamp, the reflector or projector directs light onto the road. The bulb must sit at the intended focal point."],
    ["Visibility, doors and body", "Door weatherstrip", "door weather seal,door weatherstripping", ["seal", "Rubber seal"], ["cover", "Door frame"], "The flexible seal compresses against the frame when the door closes, helping keep out water and wind noise."]
  ];
  const originalGroups = ["Brakes and wheel hubs","Brakes and wheel hubs","Steering and suspension","Steering and suspension","Electrical and starting","Fuel, intake and emissions","Engine and lubrication","Engine and lubrication","Wheels, fluids and exhaust","Electrical and starting"];
  const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const entries = topics.map((topic,i)=>({
    id:topic[0], title:topic[1], group:originalGroups[i], aliases:[],
    matches:text=>topic[2].test(text), illustration:()=>figure(topic)
  }));
  function componentPanel([symbol,label],index) {
    const x = index ? 168 : 4;
    return `<g transform="translate(${x} 0)"><rect x="0" y="4" width="148" height="111" rx="11" fill="${index?"#e1efe9":"#ebf1f3"}"/><g transform="translate(12 4)" fill="none" stroke="${index?"#176956":"#2c5166"}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="${symbols[symbol]}"/></g><text x="74" y="101" text-anchor="middle" fill="#203c47" font-family="system-ui,sans-serif" font-weight="600" font-size="12">${label}</text></g>`;
  }
  for(const [group,title,terms,left,right,explanation] of repairs) {
    const aliases=[title,...terms.split(",")].map(normalize);
    const id=aliases[0].replace(/ /g,"-");
    entries.push({id,title,group,aliases,
      matches:(_,normalized)=>aliases.some(term=>normalized.includes(" "+term+" ")),
      illustration:()=>`<figure class="repair-figure"><svg viewBox="0 0 320 120" role="img" aria-label="${left[1]} and ${right[1]}">${componentPanel(left,0)}${componentPanel(right,1)}<path d="M144 49h32" stroke="#78938a" stroke-width="2" stroke-dasharray="3 3"/></svg><figcaption>${explanation}</figcaption></figure>`
    });
  }
  window.repairGuideFor = item => {
    const normalized=" "+normalize(item)+" ";
    const matches=entries.filter(e=>e.matches(item||"",normalized));
    // Prefer the specific component when its name contains a shorter matching alias.
    return matches.filter(e=>!e.aliases.some(a=>matches.some(other=>other!==e &&
      other.aliases.some(b=>b!==a && normalized.includes(" "+b+" ") && (" "+b+" ").includes(" "+a+" "))))).map(e=>
      `<details class="repair-details"><summary>Illustrated guide · ${e.title}</summary>${e.illustration()}<a href="/repair-guide.html#${e.id}" target="_blank" rel="noopener">View larger diagram</a></details>`).join("");
  };
  const list=document.getElementById("repair-library");
  if(!list) return;
  const search=document.getElementById("guide-query"), system=document.getElementById("guide-system");
  const groups=[...new Set(entries.map(e=>e.group))].sort();
  for(const group of groups) system.add(new Option(group,group));
  function show() {
    const words=normalize(search.value).split(" ").filter(Boolean);
    const visible=entries.filter(e=>(!system.value||e.group===system.value) &&
      words.every(w=>normalize([e.title,e.group,...e.aliases].join(" ")).includes(w)));
    list.innerHTML=groups.map(group=>{
      const members=visible.filter(e=>e.group===group);
      if(!members.length) return "";
      return `<h2 class="guide-group">${group}</h2>`+members.map(e=>
        `<article id="${e.id}"><h3>${e.title}</h3>${e.illustration()}</article>`).join("");
    }).join("");
    document.getElementById("guide-count").textContent=visible.length ? visible.length+" of "+entries.length+" guides" : "No matching guides. Try another part name or vehicle system.";
  }
  search.addEventListener("input",show);
  system.addEventListener("change",show);
  show();
  if(location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
})();
