/// The page the car's browser shows (see CarScreen). Plain HTML + JavaScript, no outside files.
enum CarScreenPage {
    static let html = #"""
<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stork View</title>
<style>
:root{--navy:#0f1c33;--ink:#e9eef8;--dim:#9fb0cc;--mint:#82deba;--peach:#ff9e85;--sun:#ffd173}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--navy);color:var(--ink);font:500 22px/1.35 -apple-system,system-ui,Segoe UI,Roboto,sans-serif}
main{display:flex;gap:24px;height:100%;padding:24px}
#pic{flex:1 1 62%;position:relative;border-radius:28px;background:#081224;overflow:hidden;display:flex;align-items:center;justify-content:center}
#pic img{width:100%;height:100%;object-fit:contain;transition:transform .2s}
#pic .note{position:absolute;left:16px;bottom:16px;background:rgba(0,0,0,.6);padding:8px 16px;border-radius:999px;font-size:18px}
#ph{color:var(--dim);text-align:center;padding:24px}
aside{flex:1 1 38%;display:flex;flex-direction:column;gap:20px;min-width:280px}
.card{background:rgba(255,255,255,.07);border-radius:28px;padding:28px}
#mood{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
#emoji{font-size:110px;line-height:1}#title{font-size:64px;font-weight:800;margin-top:12px}#since{color:var(--dim);font-size:28px}
#mood.crying{background:rgba(255,110,90,.35)}#mood.offline{opacity:.7}
.row{display:flex;justify-content:space-between;align-items:center;gap:12px}
button{font:inherit;font-weight:700;border:0;border-radius:18px;padding:16px 22px;background:var(--mint);color:var(--navy)}
button.off{background:rgba(255,255,255,.14);color:var(--ink)}
small{color:var(--dim);font-size:17px}
#start,#ask{position:fixed;inset:0;background:rgba(8,18,36,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;text-align:center;padding:24px}
#ask input{font:800 56px monospace;width:5.5ch;text-align:center;border-radius:18px;border:0;padding:8px}
.hide{display:none!important}
#park{position:fixed;width:2px;height:2px;opacity:.01;pointer-events:none;bottom:0;right:0}
@media (max-width:800px){main{flex-direction:column}#pic{flex:0 0 52vh}}
</style></head><body>
<main>
  <div id="pic"><img id="img" alt="Back seat" class="hide"><div id="ph">Waiting for the picture...</div><div id="note" class="note hide"></div></div>
  <aside>
    <div id="mood" class="card offline"><div id="emoji">📵</div><div id="title">Connecting</div><div id="since"></div></div>
    <div class="card row"><span>Baby's sound</span><button id="snd" class="off">Off</button></div>
    <small>Stork View. Glance only, like a mirror. Live picture while parked; while driving, a still photo every 5 seconds. Never leave a child alone in a car.</small>
  </aside>
</main>
<div id="start"><div style="font-size:90px">🍼</div><div style="font-size:34px;font-weight:800">Stork View</div><button id="go">Tap to start</button></div>
<div id="ask" class="hide"><div style="font-size:30px;font-weight:800">Type the car screen code shown in Stork View on your iPhone</div><input id="codein" inputmode="numeric" maxlength="4"><button id="codego">Show the back seat</button><small id="askmsg"></small></div>
<video id="park" muted playsinline loop autoplay src="data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMzbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAl10cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHVbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABgG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAUBzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAK/+EAFmdCwArZHsBEAAADAAQAAAMAEDxImSABAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAAqAAAAKgAAAABhzdHRzAAAAAAAAAAEAAAAEAAAgAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAEAAAAAQAAACRzdHN6AAAAAAAAAAAAAAAEAAACgwAAAAoAAAAKAAAACQAAABRzdGNvAAAAAAAAAAEAAANjAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2MC4xNi4xMDAAAAAIZnJlZQAAAqhtZGF0AAACcAYF//9s3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTAgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MToweDExMSBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MCBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0wIHdlaWdodHA9MCBrZXlpbnQ9MjUwIGtleWludF9taW49MiBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAAtliIQFPJigAD+/gAAAAAZBmjgKeoAAAAAGQZpUAp6gAAAABUGaYBL1"></video>
<script>
var q=new URLSearchParams(location.search),code=q.get('c')||'';
try{if(!code)code=localStorage.getItem('storkCode')||'';}catch(e){}
var $=function(i){return document.getElementById(i)};
var img=$('img'),park=$('park'),parked=false,lastT=-1,stillSince=0,st=null,started=false;
var EMOJI={quiet:'😴',moving:'👋',noise:'🔊',fussing:'😣',crying:'😭',offline:'📵'};
var ctx=null,soundOn=false,seq=0,nextAt=0,soundTold=false;
function api(p){return p+(p.indexOf('?')<0?'?':'&')+'c='+encodeURIComponent(code)+'&t='+Date.now()}
function askCode(msg){$('ask').classList.remove('hide');$('askmsg').textContent=msg||''}
$('codego').onclick=function(){code=$('codein').value.replace(/\D/g,'');try{localStorage.setItem('storkCode',code)}catch(e){}$('ask').classList.add('hide');poll()};
$('go').onclick=function(){started=true;$('start').classList.add('hide');try{park.play()}catch(e){}
  try{ctx=new (window.AudioContext||window.webkitAudioContext)()}catch(e){}};
$('snd').onclick=function(){setSound(!soundOn)};
function setSound(on){soundOn=on&&!!ctx;$('snd').textContent=soundOn?'On':'Off';$('snd').className=soundOn?'':'off';if(soundOn){ctx.resume();nextAt=0}}
// Park check: Tesla pauses every video once the car leaves Park. A tiny hidden video that keeps
// playing means the car is parked; if it stops, we treat the car as driving.
setInterval(function(){
  var t=park.currentTime;
  if(!park.paused&&t!==lastT){stillSince=Date.now();parked=true}
  else if(Date.now()-stillSince>1500){parked=false;if(started){var p=park.play();if(p&&p.catch)p.catch(function(){})}}
  lastT=t;
},500);
function fmt(s){s=Math.max(0,Math.floor(s));var m=Math.floor(s/60),r=s%60;return m+':'+(r<10?'0':'')+r}
function show(){
  if(!st)return;
  var m=st.mood;$('mood').className='card '+m;$('emoji').textContent=EMOJI[m]||'🍼';
  $('title').textContent=st.title;
  $('since').textContent=st.since?('for '+fmt(Date.now()/1000-st.since)):'';
  if(!soundTold&&ctx){soundTold=true;if(!st.phoneSound)setSound(true)}
}
function chime(){if(!ctx)return;try{var o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=880;g.gain.setValueAtTime(.25,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+1.2);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+1.2)}catch(e){}}
function poll(){
  fetch(api('/status')).then(function(r){if(r.status===401){askCode('');throw 0}if(r.status===429){askCode('Too many wrong codes. Wait a few minutes.');throw 0}return r.json()})
  .then(function(s){var was=st&&st.mood;st=s;if(s.mood==='crying'&&was&&was!=='crying')chime();show()})
  .catch(function(){if(!st||st.mood!=='offline'){st={mood:'offline',title:'Phone not reachable',since:0}}show()});
}
setInterval(poll,1000);setInterval(show,1000);
// Picture: live (about 2 a second) while parked; one still photo every 5 seconds while driving.
var lastPic=0,loading=false,gotPic=0;
img.onload=function(){loading=false;gotPic=Date.now();img.classList.remove('hide');$('ph').classList.add('hide')};
img.onerror=function(){loading=false};
setInterval(function(){
  if(!started||loading||!st)return;
  var note=$('note'),now=Date.now();
  if(st.mood==='offline'||st.paused){img.classList.add('hide');$('ph').classList.remove('hide');
    $('ph').textContent=st.paused?'Picture paused. The camera phone may be locked.':'Waiting for the picture...';note.classList.add('hide');return}
  var every=parked?400:5000;
  if(now-lastPic>=every){lastPic=now;loading=true;img.src=api('/frame.jpg')}
  img.style.transform='rotate('+((st.turns||0)*90)+'deg)';
  if(parked){note.classList.add('hide')}else{note.classList.remove('hide');note.textContent='Driving: photo every 5 s, updated '+Math.round((now-gotPic)/1000)+' s ago'}
},200);
// Sound: short pieces of 16 kHz sound from the phone, played back to back.
setInterval(function(){
  if(!soundOn||!ctx)return;
  fetch(api('/sound?after='+seq)).then(function(r){var s=parseInt(r.headers.get('X-Seq')||'0',10);if(s<seq)nextAt=0;seq=s;return r.arrayBuffer()}).then(function(b){
    var n=b.byteLength>>1;if(!n)return;var v=new DataView(b),buf=ctx.createBuffer(1,n,16000),ch=buf.getChannelData(0);
    for(var i=0;i<n;i++)ch[i]=v.getInt16(i*2,true)/32768;
    var src=ctx.createBufferSource();src.buffer=buf;src.connect(ctx.destination);
    var now=ctx.currentTime;if(nextAt<now||nextAt-now>1.2)nextAt=now+.15;src.start(nextAt);nextAt+=buf.duration;
  }).catch(function(){});
},300);
if(!code)askCode('');poll();
</script></body></html>
"""#
}
