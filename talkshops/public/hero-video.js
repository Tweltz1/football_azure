// Homepage hero: muted background clips of real repair shops, cross-fading in a loop.
// Clips are free-to-use Pexels videos (pexels.com/license), trimmed to 6s at 720p:
// 1 8987071, 2 32033211, 3 8987078, 4 8987028, 5 14514799 (pexels.com/video/<id>/).
// Reduced motion or Data Saver: the still poster only.
(function () {
  "use strict";
  const CLIPS = [1, 2, 3, 4, 5].map((n) => "/hero/shop-" + n + ".mp4");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.connection && navigator.connection.saveData);

  function mount(hero) {
    if (hero.querySelector(".hero-video")) return;
    const box = document.createElement("div");
    box.className = "hero-video";
    box.setAttribute("aria-hidden", "true");
    hero.prepend(box);
    if (still) return;
    const vids = [0, 1].map(() => {
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto";
      v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
      box.appendChild(v);
      return v;
    });
    let i = 0, cur = 0;
    vids[0].src = CLIPS[0];
    vids[1].src = CLIPS[1];
    const show = (k) => { vids[k].classList.add("on"); vids[1 - k].classList.remove("on"); };
    function next() {
      const nk = 1 - cur;
      i = (i + 1) % CLIPS.length;
      const v = vids[nk];
      v.currentTime = 0;
      const p = v.play();
      if (p) p.catch(() => {});
      show(nk);
      const old = vids[cur];
      cur = nk;
      // Once faded out, load the clip after this one into the hidden player.
      setTimeout(() => { old.pause(); old.src = CLIPS[(i + 1) % CLIPS.length]; old.load(); }, 1300);
    }
    vids.forEach((v, k) => v.addEventListener("timeupdate", () => {
      if (k === cur && v.duration && v.currentTime > v.duration - 1.1 && !v.dataset.handed) { v.dataset.handed = "1"; next(); }
    }));
    vids.forEach((v) => v.addEventListener("play", () => { delete v.dataset.handed; }));
    vids[0].addEventListener("playing", () => box.classList.add("live"), { once: true });
    const p = vids[0].play();
    if (p) p.catch(() => {});
    show(0);
  }

  function scan() { const h = document.querySelector(".front-hero"); if (h) mount(h); }
  const app = document.getElementById("app");
  if (app) new MutationObserver(scan).observe(app, { childList: true });
  scan();
})();
