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
  window.repairGuideFor = (item) => topics.filter(t=>t[2].test(item||"")).map(t=>`<details class="repair-details"><summary>Illustrated guide · ${t[1]}</summary>${figure(t)}<a href="/repair-guide.html#${t[0]}" target="_blank" rel="noopener">View larger diagram</a></details>`).join("");
  const list=document.getElementById("repair-library");
  if(list) list.innerHTML=topics.map(t=>`<article id="${t[0]}"><h2>${t[1]}</h2>${figure(t)}</article>`).join("");
})();
