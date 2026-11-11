// Talk Shops Team panel (Settings, owners only): staff list, roles, and email invites.
// The server enforces every rule (supabase/functions/_shared/shopStaff.ts); this only shows them.
(function () {
  "use strict";
  window.createShopTeam = function ({ esc, api, toast }) {
    const st = { data: null, loading: false, err: "", busy: false, lastLink: null };
    const ROLE = { owner: "Owner", tech: "Technician" };
    const fmt = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

    async function load(render) {
      if (st.loading) return;
      st.loading = true;
      try { st.data = await api("GET", "shop/staff"); st.err = ""; } catch (e) { st.err = e.message; }
      st.loading = false; render();
    }

    function member(m) {
      const who = m.name ? `<b>${esc(m.name)}</b>${m.email ? `<small>${esc(m.email)}</small>` : ""}` : `<b>${esc(m.email || "Shop owner")}</b>`;
      const tag = m.you ? ` <span class="pill">You</span>` : "";
      const fixed = m.primary || m.you;
      const role = fixed ? `<span class="pill ${m.role === "owner" ? "ok" : ""}">${m.primary ? "Main owner" : ROLE[m.role]}</span>`
        : `<select data-team-role="${esc(m.userId)}" aria-label="Role for ${esc(m.name || m.email)}">${Object.keys(ROLE).map((r) => `<option value="${r}" ${r === m.role ? "selected" : ""}>${ROLE[r]}</option>`).join("")}</select>`;
      // Devices signed in on this login in the last 14 days (each login works on up to 2).
      const dev = typeof m.devices === "number" ? `<small class="team-dev">${m.devices ? `Signed in on ${m.devices} device${m.devices === 1 ? "" : "s"}` : "Not signed in"}</small>` : "";
      const out = !fixed && m.devices ? `<button class="linkbtn" type="button" data-team-signout="${esc(m.userId)}">Sign out all devices</button>` : "";
      return `<li class="team-row"><span class="team-who">${who}${tag}${dev}</span><span class="team-role">${role}</span>
        <span class="team-act">${out}${fixed ? "" : `<button class="linkbtn danger" type="button" data-team-remove="${esc(m.userId)}">Remove</button>`}</span></li>`;
    }
    function invite(i) {
      return `<li class="team-row pending"><span class="team-who"><b>${esc(i.name || i.email)}</b>${i.name ? `<small>${esc(i.email)}</small>` : ""}</span>
        <span class="team-role"><span class="pill ${i.expired ? "bad" : "warn"}">${i.expired ? "Invite expired" : "Invited " + fmt(i.createdAt)}</span> ${ROLE[i.role]}</span>
        <span class="team-act"><button class="linkbtn" type="button" data-team-resend="${esc(i.id)}">Send again</button><button class="linkbtn danger" type="button" data-team-cancel="${esc(i.id)}">Cancel</button></span></li>`;
    }

    /** The panel. Loads the team the first time it's shown. */
    function panel(render) {
      if (!st.data && !st.loading && !st.err) setTimeout(() => load(render), 0);
      const d = st.data;
      const link = st.lastLink;
      return `<section class="panel team-panel" id="teamPanel">
        <h2 style="font-size:20px">Team</h2>
        <p class="muted" style="margin:0"><b>Owners</b> manage shop settings, saved prices, the plan and billing, final bills and the team, and send estimates for approval.
          <b>Technicians</b> work the cars: check-ins, stages, notes, photos, estimate lines, messages and How-to.</p>
        <p class="muted" style="margin:0">Give each person their own login. Their name goes on their notes, messages and time clock, and one login works on up to 2 devices at a time.</p>
        ${d?.limits ? `<p><strong>${d.members.length+d.invites.filter(i=>!i.expired).length} of ${d.limits.staff} staff seats used</strong> · up to ${d.limits.owners} owners. Pending invites reserve seats.</p>` : ""}
        ${st.err ? `<p class="form-err" role="alert">${esc(st.err)} <button class="linkbtn" type="button" data-team-retry>Try again</button></p>` : ""}
        ${d ? `<ul class="team-list">${d.members.map(member).join("")}${d.invites.map(invite).join("")}</ul>` : st.err ? "" : `<p class="muted" style="margin:0">Loading…</p>`}
        ${link ? `<div class="notice team-link" role="status"><span>${link.emailed ? `Invite emailed to <b>${esc(link.email)}</b>.` : `We couldn't email ${esc(link.email)}${link.note ? ` (${esc(link.note.replace(/[.\s]+$/, ""))})` : ""}. Send them this link yourself.`}
          You can also text them the link. It works once and expires in 7 days.</span>
          <span class="team-copy"><input readonly value="${esc(link.url)}" aria-label="Invite link" id="teamLinkIn"><button class="btn sm" type="button" data-team-copy>Copy link</button></span></div>` : ""}
        <form id="teamInviteForm" class="team-form" autocomplete="off">
          <h3>Invite Someone</h3>
          <div class="form-grid">
            <label class="field">Email<input id="tm-email" type="email" required maxlength="254" placeholder="tech@yourshop.com"></label>
            <label class="field">Name (optional)<input id="tm-name" maxlength="80" placeholder="Sam Lee"></label>
            <label class="field">Role<select id="tm-role"><option value="tech">Technician</option><option value="owner">Owner</option></select></label>
          </div>
          <div class="btn-row"><button class="btn primary" type="submit" ${st.busy ? "disabled" : ""}>Send Invite</button></div>
          <small class="muted">They sign in or create an account with that email, and your shop opens for them.</small>
        </form>
      </section>`;
    }

    async function run(fn, render, msg) {
      if (st.busy) return null;
      st.busy = true;
      try { const r = await fn(); st.data = r; st.err = ""; if (msg) toast(msg); return r; }
      catch (e) { toast(e.message); return null; }
      finally { st.busy = false; render(); }
    }
    async function send(email, name, role, render) {
      const r = await run(() => api("POST", "shop/staff/invite", { email, name, role }), render);
      if (r) { st.lastLink = { url: r.link, email, emailed: r.emailed, note: r.note }; render(); if (r.emailed) toast("Invite sent to " + email); }
      return r;
    }

    /** Click handler. True when the click was the Team panel's. */
    async function click(t, render) {
      if (t.hasAttribute("data-team-retry")) { st.err = ""; load(render); return true; }
      if (t.hasAttribute("data-team-copy")) {
        const v = st.lastLink?.url || "";
        try { await navigator.clipboard.writeText(v); toast("Link copied"); } catch (e) { const i = document.getElementById("teamLinkIn"); i?.select(); toast("Select the link and copy it"); }
        return true;
      }
      if (t.dataset.teamRemove) {
        const m = st.data?.members.find((x) => x.userId === t.dataset.teamRemove);
        if (!m || !window.confirm(`Remove ${m.name || m.email} from your shop? They won't be able to open your board anymore.`)) return true;
        await run(() => api("DELETE", "shop/staff/members/" + encodeURIComponent(m.userId)), render, "Removed");
        return true;
      }
      if (t.dataset.teamSignout) {
        const m = st.data?.members.find((x) => x.userId === t.dataset.teamSignout);
        if (!m || !window.confirm(`Sign ${m.name || m.email} out on every phone and computer? They can sign in again with their password.`)) return true;
        await run(() => api("POST", "shop/staff/members/" + encodeURIComponent(m.userId) + "/signout"), render, "Signed out on all devices");
        return true;
      }
      if (t.dataset.teamCancel) { await run(() => api("DELETE", "shop/staff/invites/" + encodeURIComponent(t.dataset.teamCancel)), render, "Invite canceled"); st.lastLink = null; render(); return true; }
      if (t.dataset.teamResend) {
        const i = st.data?.invites.find((x) => x.id === t.dataset.teamResend);
        if (i) await send(i.email, i.name, i.role, render);
        return true;
      }
      return false;
    }
    async function change(el, render) {
      if (!el.dataset.teamRole) return false;
      await run(() => api("POST", "shop/staff/members/" + encodeURIComponent(el.dataset.teamRole), { role: el.value }), render, "Role updated");
      return true;
    }
    async function submit(f, render) {
      if (f.id !== "teamInviteForm") return false;
      const email = f.querySelector("#tm-email").value.trim(), name = f.querySelector("#tm-name").value.trim(), role = f.querySelector("#tm-role").value;
      const r = await send(email, name, role, render);
      if (!r && document.getElementById("tm-email")) { document.getElementById("tm-email").value = email; document.getElementById("tm-name").value = name; document.getElementById("tm-role").value = role; }
      return true;
    }
    function reset() { st.data = null; st.err = ""; st.lastLink = null; }
    return { panel, click, change, submit, reset };
  };
})();
