// Crawlr — Mumbai bar deals + crawl planner. No build step; data lives in data/bars.json.
(function () {
  "use strict";

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  // ---- time: a "bar day" runs 06:00 → 06:00, so 1am Saturday counts as Friday night ----
  const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const bd = (m) => (((m - 360) % 1440) + 1440) % 1440;          // clock minutes → bar-day minutes
  const clock = (t) => (t + 360) % 1440;                            // bar-day minutes → clock minutes
  const fmt = (m) => { m = ((m % 1440) + 1440) % 1440; let h = Math.floor(m / 60), mm = m % 60; const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12; return h + (mm ? ":" + String(mm).padStart(2, "0") : "") + ap; };
  const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const dur = (m) => m < 60 ? m + " min" : Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "");
  const daysLabel = (d) => d.length === 7 ? "daily" : d.join() === "1,2,3,4,5" ? "Mon–Fri" : d.join() === "0,6" ? "Sat–Sun" : d.map((x) => DAYS[x]).join(", ");

  function istNow() {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    const m = (+p.hour % 24) * 60 + +p.minute;
    let day = DAYS.indexOf(p.weekday);
    if (m < 360) day = (day + 6) % 7;
    return { day, t: bd(m) };
  }

  // A deal window in bar-day minutes. End of 0 (midnight-ish wrap to 06:00) is treated as end of night.
  function win(deal) { const s = bd(toMin(deal.s)); let e = bd(toMin(deal.e)); if (e <= s) e = 1440; return [s, e]; }
  function status(deal, day, t) {
    if (!deal.days.includes(day)) return null;
    const [s, e] = win(deal);
    if (t >= s && t < e) return { k: "on", left: e - t, s, e };
    if (t < s) return { k: "later", inn: s - t, s, e };
    return { k: "done", s, e };
  }
  const RANK = { on: 0, later: 1, done: 2 };

  function km(a, b) {
    const R = 6371, r = Math.PI / 180, dl = (b[0] - a[0]) * r, dg = (b[1] - a[1]) * r;
    const x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dg / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  // Rough Mumbai cab time: road distance ~1.4× straight line, ~18 km/h average, +5 min to find a cab.
  const cabMin = (d) => Math.round(5 + (d * 1.4) / 18 * 60);
  const kmLabel = (d) => d < 1 ? "<1 km" : d.toFixed(1) + " km";
  const mapsUrl = (b, o) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(b.name + " " + o.label + " Mumbai");

  const dealsFor = (b, o) => b.deals.filter((d) => !d.only || d.only.includes(o.area));

  // ---- state ----
  let DATA = null;
  const st = {
    live: true, day: 0, t: 0,
    area: store.get("crawlr.area", "Bandra West"),
    f: store.get("crawlr.filter", "all"),
    tab: "deals",
    crawl: store.get("crawlr.crawl", [])       // [{bar, outlet}] ids/index
  };

  function sync() { if (st.live) { const n = istNow(); st.day = n.day; st.t = n.t; } }

  // ---- deals list ----
  function bestFor(b) {
    const here = DATA.areas[st.area];
    let best = null;
    b.outlets.forEach((o, oi) => {
      for (const d of dealsFor(b, o)) {
        if (st.f !== "all" && !(d.tags || []).includes(st.f)) continue;
        const s = status(d, st.day, st.t); if (!s) continue;
        const dist = here ? km(here, o.ll) : 0;
        const cand = { b, o, oi, d, s, dist };
        if (!best || RANK[s.k] < RANK[best.s.k] ||
            (RANK[s.k] === RANK[best.s.k] && (s.k === "later" ? s.inn < best.s.inn || (s.inn === best.s.inn && dist < best.dist) : dist < best.dist))) best = cand;
      }
    });
    return best;
  }

  function renderDeals() {
    const rows = DATA.bars.map(bestFor).filter(Boolean)
      .sort((a, b) => RANK[a.s.k] - RANK[b.s.k] || (a.s.k === "later" ? a.s.inn - b.s.inn : 0) || a.dist - b.dist);
    const on = rows.filter((r) => r.s.k === "on"), later = rows.filter((r) => r.s.k === "later"), done = rows.filter((r) => r.s.k === "done");
    $("summary").textContent = rows.length
      ? `${on.length} on at ${fmt(clock(st.t))} on ${DAYS_LONG[st.day]}${later.length ? `, ${later.length} starting later` : ""}. Nearest to ${st.area} first.`
      : "";
    const sect = (title, list) => list.length ? `<div class="group">${title}</div>` + list.map(row).join("") : "";
    $("list").innerHTML = rows.length
      ? sect("On now", on) + sect("Later tonight", later) + sect("Finished for today", done)
      : `<p class="empty">No deals ${st.f === "all" ? "" : "of this kind "}on ${DAYS_LONG[st.day]}. Try another day or filter.</p>`;
  }

  function row({ b, o, oi, d, s, dist }) {
    const lab = s.k === "on" ? `On · ${dur(s.left)} left` : s.k === "later" ? `Starts in ${dur(s.inn)}` : "Over";
    const pct = (m) => (m / 1440 * 100).toFixed(2) + "%";
    const inCrawl = st.crawl.some((c) => c.bar === b.id);
    const others = b.outlets.length > 1;
    const here = DATA.areas[st.area];
    const outletList = others ? `<details><summary>${b.outlets.length} outlets</summary><ul class="outlets">${
      b.outlets.map((x) => ({ x, d: here ? km(here, x.ll) : 0 })).sort((p, q) => p.d - q.d)
        .map(({ x, d: dd }) => `<li><span>${esc(x.area)} · ${esc(x.label)}${x.status !== "open" ? " · unconfirmed" : ""}${dealsFor(b, x).length ? "" : " · no deal listed"}</span><span>${kmLabel(dd)} · <a href="${mapsUrl(b, x)}" target="_blank" rel="noopener">Map</a></span></li>`).join("")
    }</ul></details>` : "";
    return `<article class="row ${s.k === "done" ? "past" : ""}">
      <div>
        <div class="name">${esc(b.name)}</div>
        <div class="where">${esc(o.area)} · ${esc(o.label)} · ${kmLabel(dist)}</div>
        <div class="deal">${esc(d.text)}</div>
        <div class="meta">${d.approx ? "From about " : ""}${fmt(toMin(d.s))}–${fmt(toMin(d.e))} · ${daysLabel(d.days)}</div>
      </div>
      <div class="status ${s.k}">${lab}</div>
      <div class="bar" aria-hidden="true"><i style="left:${pct(s.s)};width:${pct(s.e - s.s)}"></i><b style="left:${pct(st.t)}"></b></div>
      <div class="foot">
        <button class="add" type="button" data-add="${b.id}" data-o="${oi}" aria-pressed="${inCrawl}">${inCrawl ? "In crawl" : "+ Add to crawl"}</button>
        ${others ? "" : `<a href="${mapsUrl(b, o)}" target="_blank" rel="noopener">Map</a>`}
        <span>${d.conf === "recent" ? "Seen recently" : "Older report"} · ${esc(d.src)}</span>
        ${o.status !== "open" ? `<span class="warn">Hours not listed on Google, call first</span>` : ""}
        ${d.note ? `<span>${esc(d.note)}</span>` : ""}
      </div>
      ${outletList}
    </article>`;
  }

  // ---- crawl ----
  function planCrawl(n, stay, incUnconf) {
    let pos = DATA.areas[st.area], t = st.t;
    const used = new Set(), stops = [];
    for (let i = 0; i < n; i++) {
      let best = null;
      for (const b of DATA.bars) {
        if (used.has(b.id)) continue;
        b.outlets.forEach((o, oi) => {
          if (o.status !== "open" && !incUnconf) return;
          const dist = km(pos, o.ll), travel = i === 0 && dist < 0.5 ? 0 : cabMin(dist), arrive = t + travel;
          for (const d of dealsFor(b, o)) {
            const s = status(d, st.day, arrive); if (!s || s.k === "done") continue;
            const wait = s.k === "later" ? s.inn : 0;
            if (wait > 45) continue;
            if (s.k === "on" && s.left < 30) continue;                   // don't arrive for the last few minutes
            const perkPenalty = (d.tags || []).includes("perk") ? 15 : 0; // prefer real discounts
            const score = travel + wait * 1.5 + perkPenalty;
            if (!best || score < best.score) best = { b, o, oi, d, dist, travel, arrive, start: arrive + wait, score };
          }
        });
      }
      if (!best) break;
      used.add(best.b.id);
      stops.push(best);
      pos = best.o.ll; t = best.start + stay;
      if (t >= 1440) break;
    }
    return stops;
  }

  // Lay out a hand-picked crawl in deal-time order, from the start area.
  function layoutManual(stay) {
    let pos = DATA.areas[st.area], t = st.t;
    const picks = st.crawl.map((c) => {
      const b = DATA.bars.find((x) => x.id === c.bar); if (!b) return null;
      const o = b.outlets[c.outlet] || b.outlets[0];
      const ds = dealsFor(b, o).map((d) => ({ d, s: status(d, st.day, st.t) })).filter((x) => x.s);
      ds.sort((x, y) => x.s.s - y.s.s);
      return { b, o, oi: b.outlets.indexOf(o), d: ds[0] ? ds[0].d : null, ws: ds[0] ? ds[0].s.s : 9999 };
    }).filter(Boolean).sort((a, b) => a.ws - b.ws);
    return picks.map((p) => {
      const dist = km(pos, p.o.ll), travel = cabMin(dist), arrive = t + travel;
      const start = p.d ? Math.max(arrive, win(p.d)[0]) : arrive;
      pos = p.o.ll; t = start + stay;
      return { ...p, dist, travel, arrive, start };
    });
  }

  function renderCrawl(stops, auto) {
    $("crawlCount").textContent = st.crawl.length || "";
    const out = $("crawlOut");
    if (!stops.length) {
      out.innerHTML = auto
        ? `<p class="note">Couldn't find a bar with a deal running near ${esc(st.area)} around ${fmt(clock(st.t))} on ${DAYS_LONG[st.day]}. Try an earlier time, another day, or include unconfirmed bars.</p>`
        : `<p class="note">Your crawl is empty. Plan one above, or tap “Add to crawl” on any deal.</p>`;
      return;
    }
    const stay = +$("stay").value;
    const pts = [DATA.areas[st.area], ...stops.map((s) => s.o.ll)].map((p) => p.join(","));
    const route = "https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=" + pts[0] + "&destination=" + pts[pts.length - 1] +
      (pts.length > 2 ? "&waypoints=" + encodeURIComponent(pts.slice(1, -1).join("|")) : "");
    const end = stops[stops.length - 1].start + stay;
    out.innerHTML = `<ol class="stops">${stops.map((s, i) => {
      const st2 = s.d ? status(s.d, st.day, s.start) : null;
      const warn = !s.d ? "No deal on this day" : st2 && st2.k === "done" ? "Deal is over by the time you arrive" : "";
      return `<li class="stop">
        <div><div class="name">${esc(s.b.name)}</div>
          <div class="where">${esc(s.o.area)} · ${esc(s.o.label)}</div>
          <div class="deal">${s.d ? esc(s.d.text) : ""}</div>
          ${warn ? `<div class="meta" style="color:var(--warn)">${warn}</div>` : s.d ? `<div class="meta">Deal ${fmt(toMin(s.d.s))}–${fmt(toMin(s.d.e))}</div>` : ""}
          ${s.o.status !== "open" ? `<div class="meta" style="color:var(--warn)">Hours not listed on Google, call first</div>` : ""}
        </div>
        <div style="text-align:right"><div class="time">${fmt(clock(s.start))}</div><button class="rm" type="button" data-rm="${s.b.id}">Remove</button></div>
        <div class="hop">${i === 0 ? "from " + esc(st.area) : "then"} · ${kmLabel(s.dist)} · ~${s.travel} min by cab</div>
      </li>`; }).join("")}</ol>
      <p class="note">${stops.length} stops, ${fmt(clock(stops[0].start))} to about ${fmt(clock(end))}. Cab times are rough estimates.</p>
      <a class="route" href="${route}" target="_blank" rel="noopener">Open the route in Google Maps ↗</a>`;
  }

  function showCrawl(auto) {
    const stay = +$("stay").value;
    if (auto) {
      const stops = planCrawl(+$("stops").value, stay, $("incUnconf").checked);
      st.crawl = stops.map((s) => ({ bar: s.b.id, outlet: s.oi }));
      store.set("crawlr.crawl", st.crawl);
      renderCrawl(stops, true);
    } else {
      renderCrawl(layoutManual(stay), false);
    }
  }

  // ---- controls ----
  function renderControls() {
    $("day").value = st.day;
    $("time").value = hhmm(clock(st.t));
    $("nowBtn").hidden = st.live;
    document.querySelectorAll("[data-f]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.f === st.f));
    const isDeals = st.tab === "deals";
    $("tabDeals").setAttribute("aria-selected", isDeals); $("tabCrawl").setAttribute("aria-selected", !isDeals);
    $("deals").hidden = !isDeals; $("crawl").hidden = isDeals;
  }
  function render() {
    sync(); renderControls();
    if (st.tab === "deals") renderDeals(); else showCrawl(false);
    $("crawlCount").textContent = st.crawl.length || "";
  }

  function wire() {
    $("day").innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) => `<option value="${d}">${DAYS_LONG[d]}</option>`).join("");
    $("area").innerHTML = Object.keys(DATA.areas).map((a) => `<option>${esc(a)}</option>`).join("");
    if (!DATA.areas[st.area]) st.area = "Bandra West";
    $("area").value = st.area;
    $("day").addEventListener("change", (e) => { st.live = false; st.day = +e.target.value; render(); });
    $("time").addEventListener("change", (e) => { if (!e.target.value) return; st.live = false; st.t = bd(toMin(e.target.value)); render(); });
    $("nowBtn").addEventListener("click", () => { st.live = true; render(); });
    $("area").addEventListener("change", (e) => { st.area = e.target.value; store.set("crawlr.area", st.area); render(); });
    document.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { st.f = b.dataset.f; store.set("crawlr.filter", st.f); render(); }));
    $("tabDeals").addEventListener("click", () => { st.tab = "deals"; render(); });
    $("tabCrawl").addEventListener("click", () => { st.tab = "crawl"; render(); });
    $("planBtn").addEventListener("click", () => showCrawl(true));
    $("stay").addEventListener("change", () => showCrawl(false));
    document.addEventListener("click", (e) => {
      const add = e.target.closest("[data-add]");
      if (add) {
        const id = add.dataset.add, i = st.crawl.findIndex((c) => c.bar === id);
        if (i >= 0) st.crawl.splice(i, 1); else st.crawl.push({ bar: id, outlet: +add.dataset.o });
        store.set("crawlr.crawl", st.crawl); render(); return;
      }
      const rm = e.target.closest("[data-rm]");
      if (rm) { st.crawl = st.crawl.filter((c) => c.bar !== rm.dataset.rm); store.set("crawlr.crawl", st.crawl); render(); }
    });
    setInterval(() => { if (st.live) render(); }, 60000);
  }

  // Expose pure helpers for tests (Node) and boot in the browser.
  if (typeof module !== "undefined") { module.exports = { bd, clock, status, win, planCrawl: (d, s, n, stay, inc) => { DATA = d; Object.assign(st, s); return planCrawl(n, stay, inc); } }; return; }
  fetch("data/bars.json").then((r) => r.json()).then((d) => {
    DATA = d;
    $("updated").textContent = "Bar list last checked " + new Date(d.updated).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) + ".";
    wire(); render();
  }).catch(() => { $("summary").textContent = "Couldn't load the bar list. Refresh to try again."; });
})();
