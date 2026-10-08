(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const SVGNS = "http://www.w3.org/2000/svg";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const svg = (tag, attrs = {}, parent) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  };
  const onVisible = (el, fn) => {
    if (!el) return;
    const io = new IntersectionObserver(
      (ens) => {
        if (ens.some((e) => e.isIntersecting)) {
          io.disconnect();
          fn();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
  };

  const tip = $("#tooltip");
  const showTip = (html, x, y) => {
    tip.innerHTML = html;
    const w = tip.offsetWidth || 200;
    const cx = Math.max(w / 2 + 8, Math.min(window.innerWidth - w / 2 - 8, x));
    tip.style.left = `${cx}px`;
    tip.style.top = `${Math.max(tip.offsetHeight + 24, y)}px`;
    tip.classList.add("is-on");
  };
  const hideTip = () => tip.classList.remove("is-on");
  const ttRows = (rows) => rows.map(([k, v]) => `<div class="tt-row"><span>${k}</span><span>${v}</span></div>`).join("");

  const TYPES = [
    {
      id: "policy",
      name: "Scheduling Policy Blockage",
      pct: 45.6,
      color: "#5b93c2",
      text: "var(--policy)",
      stage: "Filtering & scoring",
      desc: "Physical capacity is sufficient, but scheduling-policy constraints on node–workload attributes leave no feasible placement.",
    },
    {
      id: "resource",
      name: "Resource Provisioning Shortfall",
      pct: 33.1,
      color: "#df8762",
      text: "var(--resource)",
      stage: "Placement",
      desc: "Under the current cluster state, available unallocated resources cannot satisfy the task’s request.",
    },
    {
      id: "intent",
      name: "Scheduling Intent Irregularity",
      pct: 21.3,
      color: "#e8b54f",
      text: "var(--intent)",
      stage: "Admission",
      desc: "The workload specification itself is invalid or exceeds a logical quota, so the scheduler never attempts a placement.",
    },
  ];

  const PATTERNS = [
    { a: "SV", name: "Specification Violation", t: "intent", n: 6, d: "The submitted workload specification violates the platform API schema or required format: invalid fields, misspelled keys, type mismatches, or malformed structure." },
    { a: "QE", name: "Quota Exceeded", t: "intent", n: 66, d: "A valid request exceeds the namespace-level quota enforced for multi-tenant isolation. Even with ample physical capacity, admission checks block the request." },
    { a: "RF", name: "Resource Fragmentation", t: "resource", n: 45, d: "Aggregate free resources suffice, yet no single node offers a contiguous block large enough for the request: capacity is fragmented across nodes, a classic bin-packing inefficiency." },
    { a: "ER", name: "Excessive Reservation", t: "resource", n: 21, d: "Nodes reserve capacity for business lines or high-priority users. The scheduler judges feasibility on allocatable rather than total capacity, so an underutilized node can still be infeasible." },
    { a: "CDU", name: "Cross-Domain Unschedulability", t: "resource", n: 38, d: "The local cluster is saturated while interconnected clusters still have capacity, but no federation scheduling strategy offloads the workload to them." },
    { a: "GRI", name: "Global Resource Insufficiency", t: "resource", n: 11, d: "The workload’s cumulative demand exceeds the physical capacity of the whole infrastructure. No scheduling strategy or defragmentation can resolve it." },
    { a: "NSM", name: "Node Selector Mismatch", t: "policy", n: 41, d: "A nodeSelector restricts placement to nodes with specific labels, but no healthy, schedulable node carries them, so every candidate with free capacity is filtered out." },
    { a: "PAC", name: "Pod Affinity Conflict", t: "policy", n: 56, d: "Affinity or anti-affinity constraints between task instances cannot be satisfied under the current cluster state, e.g. a pod must co-locate with a service that is absent." },
    { a: "MTT", name: "Missing Taint Toleration", t: "policy", n: 40, d: "A node is tainted, e.g. dedicated, and the incoming task instance lacks the matching toleration, so even an idle node is treated as infeasible." },
    { a: "PNU", name: "Persistent Node Unschedulability", t: "policy", n: 8, d: "A NoSchedule mark set during maintenance is not rolled back, so a restored, healthy node stays excluded and schedulable capacity shrinks artificially." },
  ];
  const TYPE_BY_ID = Object.fromEntries(TYPES.map((t) => [t.id, t]));
  const LAYER = { intent: 1, resource: 2, policy: 3 };

  const TIERS = {
    compact: { label: "Compact open-weight", color: "#9aa7b6" },
    flash: { label: "Flash-tier", color: "#76a1cf" },
    flagship: { label: "Flagship", color: "#3a6798" },
    ours: { label: "Ours", color: "#a24b25" },
  };
  const M = (name, logo, size, params, tier, f1, avg, p, r, ef1, step, time, extra = {}) => ({ name, logo, size, params, tier, f1, avg, p, r, ef1, step, time, ...extra });
  const MODELS = [
    M("Qwen3.5-9B", "qwen", "9B", 9, "compact", [100.0, 86.21, 75.56, 0.0, 9.09, 18.6, 55.32, 38.89, 9.52, 0.0], 39.32, 96.69, 87.95, 92.11, 19.71, 12.2),
    M("Gemma4-12B", "google", "12B", 12, "compact", [27.27, 75.47, 52.46, 55.17, 0.0, 0.0, 45.28, 30.3, 33.33, 40.0], 35.93, 98.67, 44.58, 61.41, 15.94, 13.46),
    M("Qwen3.5-27B", "qwen", "27B", 27, "compact", [85.71, 96.88, 89.36, 21.05, 44.44, 19.75, 63.37, 72.73, 9.52, 85.71], 58.85, 99.4, 100.0, 99.7, 15.85, 20.28),
    M("Gemma4-31B", "google", "31B", 31, "compact", [26.67, 98.46, 76.71, 32.0, 59.26, 30.77, 65.57, 44.44, 33.33, 40.0], 50.72, 98.77, 72.29, 83.48, 20.32, 30.96),
    M("GLM-5.3-Flash", "glm", "320B", 320, "flash", [80.0, 88.14, 88.89, 80.0, 92.31, 70.59, 90.67, 77.42, 70.97, 85.71], 82.47, 99.66, 87.95, 93.44, 20.64, 84.56),
    M("Deepseek-V4-Flash", "deepseek", "284B", 284, "flash", [100.0, 95.24, 94.12, 80.0, 89.47, 84.21, 86.49, 87.13, 76.71, 76.19], 86.96, 99.66, 89.16, 94.12, 13.09, 74.59),
    M("MiMo-V2.6-Flash", "mimo", "309B", 309, "flash", [100.0, 93.55, 86.08, 80.0, 82.05, 84.21, 90.67, 88.0, 85.71, 85.71], 87.6, 100.0, 86.14, 92.56, 12.97, 60.57),
    M("Qwen-3.8-Flash", "qwen", "125B", 125, "flash", [100.0, 100.0, 96.55, 80.0, 86.36, 69.57, 93.51, 91.74, 91.89, 100.0], 90.96, 99.1, 99.4, 99.25, 13.16, 66.86),
    M("GLM-5.3", "glm", "744B", 744, "flagship", [85.71, 98.46, 95.35, 87.8, 83.72, 84.21, 96.2, 92.59, 93.33, 100.0], 91.74, 99.4, 99.4, 99.4, 15.77, 113.42),
    M("Deepseek-V4-Pro", "deepseek", "1.6T", 1600, "flagship", [100.0, 98.46, 97.73, 86.49, 82.76, 76.19, 96.2, 90.2, 91.89, 100.0], 91.99, 99.7, 98.8, 99.24, 13.33, 87.17),
    M("MiMo-V2.6-Pro", "mimo", "1T", 1000, "flagship", [100.0, 100.0, 95.35, 92.31, 86.36, 77.78, 93.51, 94.34, 90.41, 100.0], 93.01, 100.0, 100.0, 100.0, 14.94, 90.0),
    M("Qwen-3.8-Max", "qwen", "2.4T", 2400, "flagship", [100.0, 100.0, 94.38, 92.31, 83.72, 84.21, 96.2, 94.34, 91.89, 100.0], 93.71, 100.0, 100.0, 100.0, 14.02, 95.35),
    M("HolmeSRE-4B", "HolmeSRE", "4B", 4, "ours", [100.0, 100.0, 96.55, 92.31, 86.36, 76.19, 96.2, 92.31, 88.89, 100.0], 92.88, 100.0, 100.0, 100.0, 12.77, 5.77),
  ];
  const logoSrc = (m) => `assets/logos/${m.logo}.svg`;

  (function donut() {
    const host = $("#donut");
    const list = $("#type-list");
    if (!host || !list) return;
    const cx = 160,
      cy = 160,
      R = 142,
      r = 98,
      gap = 0.018;
    const arc = (a0, a1, rr0, rr1) => {
      const p = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const [x0, y0] = p(a0, rr1),
        [x1, y1] = p(a1, rr1),
        [x2, y2] = p(a1, rr0),
        [x3, y3] = p(a0, rr0);
      return `M${x0} ${y0}A${rr1} ${rr1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${rr0} ${rr0} 0 ${large} 0 ${x3} ${y3}Z`;
    };
    let a = -Math.PI / 2;
    const segs = TYPES.map((t) => {
      const span = (t.pct / 100) * Math.PI * 2;
      const s = { t, a0: a + gap / 2, a1: a + span - gap / 2 };
      a += span;
      return s;
    });
    const paths = segs.map((s) => {
      const path = svg("path", { fill: s.t.color, "data-id": s.t.id, tabindex: 0, role: "img", "aria-label": `${s.t.name}: ${s.t.pct}%` }, host);
      return path;
    });
    const labels = segs.map((s) => {
      const mid = (s.a0 + s.a1) / 2;
      const rad = (R + r) / 2;
      const txt = svg("text", { x: cx + rad * Math.cos(mid), y: cy + rad * Math.sin(mid) + 5, "text-anchor": "middle", fill: "#fff", "font-size": 15, "font-weight": 700, "font-family": "DM Sans, sans-serif", "pointer-events": "none", opacity: 0 }, host);
      txt.textContent = `${s.t.pct}%`;
      return txt;
    });

    list.innerHTML = TYPES.map(
      (t) => `<button class="type-item" type="button" data-id="${t.id}" style="--c:${t.color}">
        <span class="swatch"></span><h4>${t.name}</h4><span class="pct" style="color:${t.text}">${t.pct}%</span>
        <p><span class="stage">${t.stage}</span>${t.desc}</p></button>`
    ).join("");
    const items = $$(".type-item", list);
    const cVal = $("#donut-value"),
      cLab = $("#donut-label");

    const focus = (id) => {
      segs.forEach((s, i) => {
        const on = s.t.id === id;
        const mid = (s.a0 + s.a1) / 2;
        paths[i].style.transform = on ? `translate(${Math.cos(mid) * 7}px, ${Math.sin(mid) * 7}px)` : "";
        paths[i].style.opacity = id && !on ? 0.45 : 1;
      });
      items.forEach((it) => it.classList.toggle("is-hot", it.dataset.id === id));
      if (id) {
        const t = TYPE_BY_ID[id];
        cVal.textContent = `${t.pct}%`;
        cVal.style.color = t.text;
        cLab.textContent = t.name;
      } else {
        cVal.textContent = "169";
        cVal.style.color = "";
        cLab.textContent = "failed scheduling events";
      }
    };
    [...paths, ...items].forEach((el) => {
      el.addEventListener("mouseenter", () => focus(el.dataset.id));
      el.addEventListener("focus", () => focus(el.dataset.id));
      el.addEventListener("mouseleave", () => focus(null));
      el.addEventListener("blur", () => focus(null));
    });

    const draw = (p) => {
      const lim = -Math.PI / 2 + p * Math.PI * 2;
      segs.forEach((s, i) => {
        const a1 = Math.min(s.a1, lim);
        paths[i].setAttribute("d", a1 > s.a0 ? arc(s.a0, a1, r, R) : "");
        labels[i].setAttribute("opacity", lim >= s.a1 ? 1 : 0);
      });
    };
    draw(0);
    onVisible(host, () => {
      if (reduceMotion) return draw(1);
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / 1100);
        draw(1 - Math.pow(1 - p, 3));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  })();

  (function taxonomy() {
    const cols = $("#tax-columns");
    const detail = $("#tax-detail");
    if (!cols) return;
    const order = ["intent", "resource", "policy"];
    cols.innerHTML = order
      .map((id) => {
        const t = TYPE_BY_ID[id];
        const chips = PATTERNS.filter((p) => p.t === id)
          .map((p) => `<button class="tax-chip" type="button" data-a="${p.a}" aria-pressed="false" style="--c:${t.text}">${p.name}<b>${p.a}</b></button>`)
          .join("");
        return `<div class="tax-col" style="--c:${t.text};--bg:var(--${id}-bg)"><header><span>Layer ${LAYER[id]} · ${t.pct}%</span><h4>${t.name}</h4></header>${chips}</div>`;
      })
      .join("");
    const select = (a) => {
      const p = PATTERNS.find((x) => x.a === a);
      const t = TYPE_BY_ID[p.t];
      $$(".tax-chip", cols).forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.a === a)));
      detail.style.setProperty("--c", t.text);
      detail.style.setProperty("--bg", `var(--${p.t}-bg)`);
      detail.innerHTML = `<span class="abbr">${p.a}</span><h4>${p.name}</h4><span class="tax-type">${t.name}</span>
        <p>${p.d}</p>
        <div class="tax-meta"><div><strong>${p.n}</strong>events in the 332-event evaluation set</div><div><strong>${LAYER[p.t]}</strong>layer in the diagnostic topology</div></div>`;
    };
    cols.addEventListener("click", (e) => {
      const b = e.target.closest(".tax-chip");
      if (b) select(b.dataset.a);
    });
    select("PAC");
  })();

  (function burden() {
    const j = $("#journey");
    const ring = $("#recur-ring .ring-fg");
    if (!j || !ring) return;
    const C = 2 * Math.PI * 21;
    j.addEventListener("visible", () => {
      ring.style.strokeDasharray = `${C * 0.66} ${C}`;
    });
  })();

  (function haystack() {
    const CASE = window.HOLME_CASE;
    const tree = $("#tree");
    if (!CASE || !tree) return;

    const totals = { ...CASE.total, pages: Math.round(CASE.total.chars / 3000) };
    const statEls = $$("[data-case-stat]");
    statEls.forEach((el) => (el.textContent = fmt(totals[el.dataset.caseStat])));
    onVisible($("#haystack-stats"), () => {
      if (reduceMotion) return;
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / 1500);
        const e = 1 - Math.pow(1 - p, 3);
        statEls.forEach((el) => (el.textContent = fmt(Math.round(totals[el.dataset.caseStat] * e))));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    const ART = [
      { id: "workload_spec", name: "Workload specification", c: "var(--intent)" },
      { id: "namespace_quota", name: "Namespace quota", c: "#d6a440" },
      { id: "cluster_state", name: "Cluster state", c: "var(--resource)" },
      { id: "federation_policy", name: "Federation policy", c: "var(--policy)" },
    ];
    const listEl = $("#hs-artifacts");
    listEl.innerHTML =
      ART.map((a) => {
        const s = CASE.stats[a.id];
        const share = (s.chars / CASE.total.chars) * 100;
        return `<button class="artifact-btn" role="tab" type="button" data-id="${a.id}" aria-selected="false" style="--c:${a.c}">
          <span class="ab-name"><i></i>${a.name}</span>
          <span class="ab-meta">${fmt(s.chars)} chars · ${fmt(s.leaves)} leaves · depth ${s.depth}</span>
          <span class="ab-bar"><span style="width:${Math.max(1, share).toFixed(2)}%"></span></span>
          <span class="ab-meta">${share < 0.1 ? "<0.1" : share.toFixed(1)}% of the context</span>
        </button>`;
      }).join("") + `<p class="artifact-note">`+`Identifiers, field names and values are anonymized. The cluster state shows 3 of its ${fmt(CASE.stats.cluster_state.maxArray)} nodes in full.`+`</p>`;

    let current = null;
    const pathKey = (p) => p.join("\u0001");
    const fmtPath = (rootName, p) =>
      `<b>${rootName}</b>` +
      p
        .map((seg) => (typeof seg === "number" ? `[${seg}]` : /^[A-Za-z_$][\w$]*$/.test(seg) ? `.${esc(seg)}` : `["${esc(seg)}"]`))
        .join("");

    const prim = (v) => {
      if (v === null) return `<span class="z">null</span>`;
      if (typeof v === "string") {
        const s = v.length > 90 ? v.slice(0, 90) + "…" : v;
        return `<span class="s" title="${esc(v)}">"${esc(s)}"</span>`;
      }
      if (typeof v === "number") return `<span class="n">${v}</span>`;
      if (typeof v === "boolean") return `<span class="b">${v}</span>`;
      return esc(v);
    };
    const isBranch = (v) => v !== null && typeof v === "object";

    const renderChildren = (li) => {
      if (li._rendered) return;
      li._rendered = true;
      const v = li._value;
      const ul = document.createElement("ul");
      ul.setAttribute("role", "group");
      const entries = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
      for (const [k, x] of entries) ul.appendChild(renderNode(k, x, [...li._path, k]));
      li.appendChild(ul);
    };
    const setOpen = (li, open) => {
      if (open) renderChildren(li);
      li.classList.toggle("open", open);
      li.setAttribute("aria-expanded", String(open));
      const ul = li.querySelector(":scope > ul");
      if (ul) ul.hidden = !open;
    };
    const renderNode = (k, v, path) => {
      const li = document.createElement("li");
      li.setAttribute("role", "treeitem");
      li._path = path;
      current.index.set(pathKey(path), li);
      if (v && typeof v === "object" && !Array.isArray(v) && "__more__" in v) {
        li.innerHTML = `<div class="more-row">… ${fmt(v.__more__)} more nodes with the same structure, about ${fmt(Math.round(CASE.stats.cluster_state.chars / 1e5) / 10, 1)}M characters in total, omitted from this page.</div>`;
        return li;
      }
      const keyHtml = typeof k === "number" ? `<span class="k idx">${k}</span>:` : k === null ? "" : `<span class="k">"${esc(k)}"</span>:`;
      if (isBranch(v)) {
        li._value = v;
        const n = Array.isArray(v) ? v.length : Object.keys(v).length;
        const br = Array.isArray(v) ? ["[", "]"] : ["{", "}"];
        li.innerHTML = `<div class="row is-branch" tabindex="0"><span class="tw">▶</span>${keyHtml}<span class="z">${br[0]}${n ? "…" : ""}${br[1]}</span><span class="cnt">${fmt(n)} ${Array.isArray(v) ? (n === 1 ? "item" : "items") : n === 1 ? "key" : "keys"}</span></div>`;
        li.setAttribute("aria-expanded", "false");
      } else {
        li.innerHTML = `<div class="row"><span class="tw"></span>${keyHtml} ${prim(v)}</div>`;
      }
      return li;
    };

    const buildIndex = () => {
      const out = [];
      const walk = (v, p) => {
        if (isBranch(v)) {
          if (!Array.isArray(v) && "__more__" in v) return;
          const ents = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
          for (const [k, x] of ents) {
            const kp = [...p, k];
            if (typeof k === "string") out.push([kp, k.toLowerCase()]);
            if (!isBranch(x)) out.push([kp, String(x).toLowerCase()]);
            walk(x, kp);
          }
        }
      };
      walk(current.data, []);
      return out;
    };

    const rootName = (id) => ART.find((a) => a.id === id).name.toLowerCase().replace(/ /g, "_");
    const load = (id) => {
      $$(".artifact-btn", listEl).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.id === id)));
      current = { id, data: CASE.artifacts[id], index: new Map(), search: null };
      tree.innerHTML = "";
      const ul = document.createElement("ul");
      const root = renderNode(null, current.data, []);
      ul.appendChild(root);
      tree.appendChild(ul);
      setOpen(root, true);
      const dataLi = current.index.get(pathKey(["retrieved content"]));
      if (dataLi && dataLi._value) {
        setOpen(dataLi, true);
        const first = current.index.get(pathKey(["retrieved content", 0]));
        if (first && first._value) setOpen(first, true);
      }
      tree.scrollTop = 0;
      runSearch($("#tree-search").value);
      $("#tree-path").innerHTML = fmtPath(rootName(id), []);
    };

    tree.addEventListener("click", (e) => {
      const row = e.target.closest(".row.is-branch");
      if (!row) return;
      const li = row.parentElement;
      setOpen(li, !li.classList.contains("open"));
    });
    tree.addEventListener("keydown", (e) => {
      const row = e.target.closest(".row.is-branch");
      if (!row || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      const li = row.parentElement;
      setOpen(li, !li.classList.contains("open"));
    });
    tree.addEventListener("mouseover", (e) => {
      const li = e.target.closest("li");
      if (li && li._path && current) $("#tree-path").innerHTML = fmtPath(rootName(current.id), li._path);
    });
    listEl.addEventListener("click", (e) => {
      const b = e.target.closest(".artifact-btn");
      if (b) load(b.dataset.id);
    });

    const input = $("#tree-search"),
      prev = $("#tree-prev"),
      next = $("#tree-next"),
      count = $("#match-count");
    let hits = [],
      hitIdx = -1,
      lastHit = null;
    const reveal = (path) => {
      for (let i = 0; i <= path.length - 1; i++) {
        const li = current.index.get(pathKey(path.slice(0, i)));
        if (li && li._value) setOpen(li, true);
      }
      const target = current.index.get(pathKey(path));
      if (!target) return;
      const row = target.querySelector(":scope > .row") || target.firstElementChild;
      if (lastHit) lastHit.classList.remove("is-hit");
      row.classList.add("is-hit");
      lastHit = row;
      const r = row.getBoundingClientRect(),
        c = tree.getBoundingClientRect();
      tree.scrollTop += r.top - c.top - c.height / 2 + r.height / 2;
      $("#tree-path").innerHTML = fmtPath(rootName(current.id), path);
    };
    const go = (d) => {
      if (!hits.length) return;
      hitIdx = (hitIdx + d + hits.length) % hits.length;
      count.textContent = `${hitIdx + 1} / ${hits.length >= 500 ? "500+" : hits.length}`;
      reveal(hits[hitIdx]);
    };
    function runSearch(q) {
      q = (q || "").trim().toLowerCase();
      hits = [];
      hitIdx = -1;
      if (lastHit) lastHit.classList.remove("is-hit");
      if (q.length < 2) {
        count.textContent = q ? "type 2+ chars" : "";
        prev.disabled = next.disabled = true;
        return;
      }
      if (!current.search) current.search = buildIndex();
      const seen = new Set();
      for (const [p, text] of current.search) {
        if (text.includes(q)) {
          const key = pathKey(p);
          if (seen.has(key)) continue;
          seen.add(key);
          hits.push(p);
          if (hits.length >= 500) break;
        }
      }
      prev.disabled = next.disabled = hits.length === 0;
      count.textContent = hits.length ? `${hits.length >= 500 ? "500+" : hits.length} matches` : "no match";
      if (hits.length) go(1);
    }
    let deb;
    input.addEventListener("input", () => {
      clearTimeout(deb);
      deb = setTimeout(() => runSearch(input.value), 180);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        go(e.shiftKey ? -1 : 1);
      }
    });
    prev.addEventListener("click", () => go(-1));
    next.addEventListener("click", () => go(1));
    $("#tree-collapse").addEventListener("click", () => {
      input.value = "";
      load(current.id);
    });

    load("workload_spec");

  })();

  (function trace() {
    const body = $("#trace-body");
    if (!body) return;
    const S = {
      quota: {
        pod: "pod_abcd1234",
        steps: [
          { k: "user", who: "SRE", html: `Help me diagnose the failure for pod_uid: <b>"pod_abcd1234"</b>` },
          { k: "retrieve", who: "Retrieve", code: `retrieve(data=["pod_spec"], pod_uid="pod_abcd1234")` },
          { k: "tool", who: "Tool response", code: `{"logical_keys": ["pod/spec"]}` },
          { k: "diagnose", who: "Diagnosis", code: `diagnosis(keys=["pod/spec"],\n  instruction="Check whether the pod specification is valid.")` },
          { k: "tool", who: "Local fact", code: `"Pod configuration is valid"`, cls: "fact-ok" },
          { k: "retrieve", who: "Retrieve", code: `retrieve(data=["pod_request", "namespace_quota"],\n  pod_uid="pod_abcd1234")` },
          { k: "tool", who: "Tool response", code: `{"logical_keys": ["pod/request", "quota"]}` },
          { k: "diagnose", who: "Diagnosis", code: `diagnosis(keys=["pod/requests", "quota"],\n  instruction="Check whether quotas are exceeded.")` },
          { k: "tool", who: "Local fact", code: `"Quota Limitation"`, cls: "fact-bad", layer: ["intent", "hit"] },
          { k: "verdict", who: "Root cause", html: `<strong>Quota Exceeded (QE)</strong><br />Scheduling Intent Irregularity: admission blocks the request before any placement is attempted.` },
        ],
      },
    };
    const playBtn = $("#trace-play"),
      nextBtn = $("#trace-next"),
      replayBtn = $("#trace-replay");
    const bar = $("#trace-progress"),
      cnt = $("#trace-count");
    const layers = $$("#topo-progress span");
    let sc = "quota",
      i = 0,
      timer = null,
      playing = false;

    const setPlayUI = () => {
      playBtn.innerHTML = playing
        ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg><span>Pause</span>`
        : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg><span>Play</span>`;
      playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    };
    const update = () => {
      const n = S[sc].steps.length;
      bar.style.width = `${(i / n) * 100}%`;
      cnt.textContent = `${i} / ${n}`;
      nextBtn.disabled = i >= n;
    };
    const render = (st) => {
      const d = document.createElement("div");
      d.className = `msg ${st.k} ${st.cls || ""}`;
      d.innerHTML = `<div class="who"><i></i>${st.who}</div>${st.html ? `<div>${st.html}</div>` : ""}${st.code ? `<code>${esc(st.code)}</code>` : ""}`;
      body.appendChild(d);
      body.scrollTop = body.scrollHeight;
      if (st.layer) {
        const [id, state] = st.layer;
        layers.forEach((l) => {
          if (l.dataset.layer === id) l.className = state;
        });
      }
    };
    const stepOnce = () => {
      const steps = S[sc].steps;
      if (i >= steps.length) return stop();
      render(steps[i++]);
      update();
      if (i >= steps.length) stop();
    };
    const stop = () => {
      playing = false;
      clearInterval(timer);
      setPlayUI();
    };
    const play = () => {
      if (i >= S[sc].steps.length) reset();
      playing = true;
      setPlayUI();
      clearInterval(timer);
      timer = setInterval(stepOnce, 1150);
      stepOnce();
    };
    const reset = () => {
      body.innerHTML = "";
      i = 0;
      layers.forEach((l) => (l.className = ""));
      update();
    };
    playBtn.addEventListener("click", () => (playing ? stop() : play()));
    nextBtn.addEventListener("click", () => {
      stop();
      stepOnce();
    });
    replayBtn.addEventListener("click", () => {
      reset();
      play();
    });
    reset();
    setPlayUI();
    onVisible($("#trace"), () => {
      if (reduceMotion) {
        while (i < S[sc].steps.length) stepOnce();
      } else play();
    });
  })();

  (function tmdpo() {
    const host = $("#tmdpo-plot");
    const range = $("#lambda");
    if (!host || !range) return;
    const W = 460,
      L = 46,
      Rm = 14,
      pw = W - L - Rm;
    const panels = [
      { top: 14, h: 112, ymax: 6.5, ticks: [0, 2, 4, 6], f: (m, lam) => Math.log1p(Math.exp(-m / lam)), title: "Loss −log σ(m / λ)" },
      { top: 168, h: 92, ymax: 1.05, ticks: [0, 0.5, 1], f: (m, lam) => 1 / lam / (1 + Math.exp(m / lam)), title: "Gradient magnitude |∂ℓ/∂m|" },
    ];
    const xmin = -6,
      xmax = 6;
    const X = (m) => L + ((m - xmin) / (xmax - xmin)) * pw;
    const curves = [];
    panels.forEach((p, pi) => {
      const Y = (v) => p.top + p.h - (v / p.ymax) * p.h;
      p.Y = Y;
      p.ticks.forEach((t) => {
        svg("line", { x1: L, x2: W - Rm, y1: Y(t), y2: Y(t), class: "gridline" }, host);
        const tx = svg("text", { x: L - 8, y: Y(t) + 4, "text-anchor": "end", class: "axis" }, host);
        tx.innerHTML = `<tspan fill="#66717f" font-size="11">${t}</tspan>`;
      });
      svg("line", { x1: X(0), x2: X(0), y1: p.top, y2: p.top + p.h, stroke: "#cfd6de", "stroke-dasharray": "2 3" }, host);
      const title = svg("text", { x: L, y: p.top - 2, fill: "#16202c", "font-size": 11.5, "font-weight": 600 }, host);
      title.textContent = p.title;
      const base = svg("path", { fill: "none", stroke: "#97a0ab", "stroke-width": 1.8, "stroke-dasharray": "5 4" }, host);
      const mod = svg("path", { fill: "none", stroke: "#a24b25", "stroke-width": 2.6, "stroke-linecap": "round" }, host);
      const dot = svg("circle", { r: 4.5, fill: "#a24b25", stroke: "#fff", "stroke-width": 2 }, host);
      curves.push({ p, base, mod, dot, pi });
    });
    [-6, -3, 0, 3, 6].forEach((t) => {
      const tx = svg("text", { x: X(t), y: 280, "text-anchor": "middle", fill: "#66717f", "font-size": 11 }, host);
      tx.textContent = t;
    });
    const xl = svg("text", { x: L + pw / 2, y: 298, "text-anchor": "middle", fill: "#66717f", "font-size": 11 }, host);
    xl.textContent = "scaled preference margin  m = β · (log-ratio of yₚ − log-ratio of yₙ)";
    const legend = svg("g", { transform: `translate(${W - Rm - 170}, 26)` }, host);
    svg("line", { x1: 0, x2: 22, y1: 0, y2: 0, stroke: "#97a0ab", "stroke-width": 1.8, "stroke-dasharray": "5 4" }, legend);
    svg("text", { x: 28, y: 4, fill: "#66717f", "font-size": 11 }, legend).textContent = "Standard DPO (λ = 1)";
    svg("line", { x1: 0, x2: 22, y1: 18, y2: 18, stroke: "#a24b25", "stroke-width": 2.6 }, legend);
    const lgT = svg("text", { x: 28, y: 22, fill: "#a24b25", "font-size": 11, "font-weight": 600 }, legend);

    const path = (f, lam, Y) => {
      let d = "";
      for (let k = 0; k <= 120; k++) {
        const m = xmin + ((xmax - xmin) * k) / 120;
        d += `${k ? "L" : "M"}${X(m).toFixed(1)} ${Y(f(m, lam)).toFixed(1)}`;
      }
      return d;
    };
    const out = $("#lambda-out"),
      read = $("#grad-readout");
    const update = () => {
      const lam = parseFloat(range.value);
      curves.forEach(({ p, base, mod, dot }) => {
        base.setAttribute("d", path(p.f, 1, p.Y));
        mod.setAttribute("d", path(p.f, lam, p.Y));
        dot.setAttribute("cx", X(0));
        dot.setAttribute("cy", p.Y(p.f(0, lam)));
      });
      out.textContent = lam.toFixed(1);
      lgT.textContent = `TM-DPO (λ = ${lam.toFixed(1)})`;
      read.innerHTML =
        lam === 1
          ? "λ = 1 recovers standard DPO, used for fundamental outcome errors."
          : `At zero margin, the gradient is <strong>${(1 / lam).toFixed(2)}×</strong> that of standard DPO: a gentler push for right-answer-wrong-reason pairs.${lam === 2 ? " The paper uses λ = 2.0." : ""}`;
    };
    range.addEventListener("input", update);
    update();
  })();

  const heat = (v, lo = 0, hi = 100) => {
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    const stops = [
      [0, [251, 216, 205]],
      [0.5, [253, 244, 228]],
      [0.8, [226, 242, 232]],
      [1, [183, 223, 199]],
    ];
    let a = stops[0],
      b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++)
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        a = stops[i];
        b = stops[i + 1];
        break;
      }
    const u = (t - a[0]) / (b[0] - a[0] || 1);
    const c = a[1].map((x, i) => Math.round(x + (b[1][i] - x) * u));
    return `rgb(${c.join(",")})`;
  };
  const TIER_ORDER = ["compact", "flash", "flagship", "ours"];
  const TIER_ROW = { compact: "Compact open-weight models", flash: "Flash-tier models", flagship: "Flagship models", ours: "Ours" };
  const modelCell = (m) =>
    `<td class="model-col"><span class="model-name"><img src="${logoSrc(m)}" alt="" loading="lazy" />${m.name}${m.tier === "ours" ? "" : ""}<span class="size">${m.size}</span></span></td>`;

  function sortableTable(table, cfg) {
    let sort = null;
    const best = {};
    cfg.cols.forEach((c) => {
      if (!c.best) return;
      const vals = MODELS.map(c.get);
      best[c.key] = c.best === "min" ? Math.min(...vals) : Math.max(...vals);
    });
    const thead = () => {
      let h = "<thead>";
      if (cfg.groups) {
        h += `<tr class="groups"><th class="model-col"></th>${cfg.groups.map((g) => `<th colspan="${g.span}" class="${g.cls || ""}">${g.label}</th>`).join("")}</tr>`;
      }
      h += `<tr class="cols"><th class="model-col" scope="col"><button type="button" data-key="name" ${sort && sort.key === "name" ? `data-sort-dir="${sort.dir}"` : ""}>Model</button></th>`;
      h += cfg.cols
        .map((c) => `<th scope="col"><button type="button" data-key="${c.key}" ${sort && sort.key === c.key ? `data-sort-dir="${sort.dir}"` : ""}>${c.label}${c.sub ? `<small>${c.sub}</small>` : ""}</button></th>`)
        .join("");
      return h + "</tr></thead>";
    };
    const row = (m) => {
      const cells = cfg.cols
        .map((c) => {
          const v = c.get(m);
          const isBest = c.best && Math.abs(v - best[c.key]) < 1e-9;
          const style = c.heat && table.dataset.heat !== "off" ? ` style="--heat:${heat(v, c.heat[0], c.heat[1])}"` : "";
          return `<td class="${c.avg ? "avg" : "cell"}${isBest ? " best" : ""}"${c.avg ? "" : style}><span>${c.fmt ? c.fmt(v) : v.toFixed(2)}</span></td>`;
        })
        .join("");
      return `<tr class="m-row${m.tier === "ours" ? " ours" : ""}">${modelCell(m)}${cells}</tr>`;
    };
    const tbody = () => {
      let rows = MODELS.slice();
      let h = "<tbody>";
      if (!sort) {
        TIER_ORDER.forEach((t) => {
          const ms = rows.filter((m) => m.tier === t);
          if (t !== "ours") h += `<tr class="tier-row"><td colspan="${cfg.cols.length + 1}">${TIER_ROW[t]}</td></tr>`;
          h += ms.map(row).join("");
        });
      } else {
        const col = cfg.cols.find((c) => c.key === sort.key);
        const get = sort.key === "name" ? (m) => m.name : col.get;
        rows.sort((a, b) => {
          const x = get(a),
            y = get(b);
          const r = typeof x === "string" ? x.localeCompare(y) : x - y;
          return sort.dir === "asc" ? r : -r;
        });
        h += rows.map(row).join("");
      }
      return h + "</tbody>";
    };
    const cap = table.querySelector("caption");
    const render = () => {
      table.innerHTML = "";
      if (cap) table.appendChild(cap);
      table.insertAdjacentHTML("beforeend", thead() + tbody());
    };
    table.addEventListener("click", (e) => {
      const b = e.target.closest("th button");
      if (!b) return;
      const key = b.dataset.key;
      const col = cfg.cols.find((c) => c.key === key);
      const first = key === "name" ? "asc" : col && col.best === "min" ? "asc" : "desc";
      if (!sort || sort.key !== key) sort = { key, dir: first };
      else if (sort.dir === first) sort = { key, dir: first === "asc" ? "desc" : "asc" };
      else sort = null;
      render();
    });
    render();
    return { render };
  }

  (function leaderboards() {
    const lb = $("#lb");
    if (!lb) return;
    const ABBR = PATTERNS.map((p) => p.a);
    const cols = ABBR.map((a, i) => ({ key: a, label: a, sub: `(${PATTERNS[i].n})`, get: (m) => m.f1[i], best: "max", heat: [0, 100] }));
    cols.push({ key: "avg", label: "Avg", sub: "Macro-F1", get: (m) => m.avg, best: "max", avg: true });
    const t1 = sortableTable(lb, {
      cols,
      groups: [
        { span: 2, label: "Intent Irregularity (72)", cls: "g-intent" },
        { span: 4, label: "Resource Shortfall (115)", cls: "g-resource" },
        { span: 4, label: "Policy Blockage (145)", cls: "g-policy" },
        { span: 1, label: "" },
      ],
    });
    $("#lb-heat").addEventListener("change", (e) => {
      lb.dataset.heat = e.target.checked ? "on" : "off";
      t1.render();
    });

    const md = $("#md-table");
    sortableTable(md, {
      cols: [
        { key: "p", label: "Precision", get: (m) => m.p, best: "max", heat: [40, 100] },
        { key: "r", label: "Recall", get: (m) => m.r, best: "max", heat: [40, 100] },
        { key: "ef1", label: "F1-Score", get: (m) => m.ef1, best: "max", heat: [40, 100] },
        { key: "step", label: "Steps", sub: "lower is better", get: (m) => m.step, best: "min" },
        { key: "time", label: "Time (s)", sub: "lower is better", get: (m) => m.time, best: "min" },
      ],
    });

    const rb = $("#rank-bars");
    $("#rank-legend").innerHTML = TIER_ORDER.map((t) => `<span><i style="--c:${TIERS[t].color}"></i>${TIERS[t].label}</span>`).join("");
    rb.innerHTML = MODELS.slice()
      .sort((a, b) => b.avg - a.avg)
      .map(
        (m, k) => `<div class="bar-row${m.tier === "ours" ? " ours" : ""}">
          <span class="bar-label"><img src="${logoSrc(m)}" alt="" />${m.name}<small>${m.size}</small></span>
          <span class="bar-track"><span class="bar-fill" data-w="${m.avg}" style="--c:${TIERS[m.tier].color};transition-delay:${k * 40}ms"></span></span>
          <span class="bar-val">${m.avg.toFixed(2)}</span></div>`
      )
      .join("");
    window.HolmeBars && window.HolmeBars(rb);
  })();

  (function scatter() {
    const host = $("#scatter");
    if (!host) return;
    $("#scatter-legend").innerHTML = TIER_ORDER.map((t) => `<span><i style="--c:${TIERS[t].color}"></i>${TIERS[t].label}</span>`).join("");
    const W = 1000,
      H = 440,
      ml = 62,
      mr = 36,
      mt = 22,
      mb = 52;
    const pw = W - ml - mr,
      ph = H - mt - mb;
    const LABEL = {
      top: { "HolmeSRE-4B": "b", "Qwen-3.8-Max": "r", "MiMo-V2.6-Pro": "l", "Deepseek-V4-Pro": "b", "GLM-5.3": "r", "Qwen-3.8-Flash": "l", "MiMo-V2.6-Flash": "l", "Deepseek-V4-Flash": "r", "GLM-5.3-Flash": "r" },
      all: { "HolmeSRE-4B": "b", "Qwen-3.8-Max": "t", "GLM-5.3-Flash": "b", "Qwen3.5-9B": "r", "Gemma4-12B": "b", "Qwen3.5-27B": "r", "Gemma4-31B": "r" },
    };
    let view = "top";
    const rOf = (m) => 6 + 3 * Math.log10(m.params);
    const draw = () => {
      host.innerHTML = "";
      const ymin = view === "top" ? 80 : 30,
        ymax = view === "top" ? 95 : 100;
      const yt = view === "top" ? [80, 85, 90, 95] : [30, 40, 50, 60, 70, 80, 90, 100];
      const lx0 = Math.log10(4),
        lx1 = Math.log10(140);
      const X = (s) => ml + ((Math.log10(s) - lx0) / (lx1 - lx0)) * pw;
      const Y = (v) => mt + ph - ((v - ymin) / (ymax - ymin)) * ph;
      yt.forEach((t) => {
        svg("line", { x1: ml, x2: W - mr, y1: Y(t), y2: Y(t), class: "gridline" }, host);
        svg("text", { x: ml - 10, y: Y(t) + 4, "text-anchor": "end", fill: "#66717f", "font-size": 12 }, host).textContent = t;
      });
      [5, 10, 20, 50, 100].forEach((t) => {
        svg("line", { x1: X(t), x2: X(t), y1: mt, y2: mt + ph, class: "gridline" }, host);
        svg("text", { x: X(t), y: H - mb + 20, "text-anchor": "middle", fill: "#66717f", "font-size": 12 }, host).textContent = `${t} s`;
      });
      svg("text", { x: ml + pw / 2, y: H - 8, "text-anchor": "middle", fill: "#3b4656", "font-size": 12.5, "font-weight": 600 }, host).textContent = "Latency per troubleshooting run (log scale) →";
      const yl = svg("text", { x: 16, y: mt + ph / 2, "text-anchor": "middle", fill: "#3b4656", "font-size": 12.5, "font-weight": 600, transform: `rotate(-90 16 ${mt + ph / 2})` }, host);
      yl.textContent = "Macro-F1 (%) →";

      const g = svg("defs", {}, host);
      const lg = svg("linearGradient", { id: "corner", x1: 0, y1: 0, x2: 1, y2: 1 }, g);
      svg("stop", { offset: "0%", "stop-color": "#fbf1ea", "stop-opacity": 1 }, lg);
      svg("stop", { offset: "55%", "stop-color": "#fbf1ea", "stop-opacity": 0 }, lg);
      svg("rect", { x: ml, y: mt, width: pw * 0.5, height: ph * 0.6, fill: "url(#corner)" }, host);
      svg("text", { x: ml + 12, y: mt + 18, fill: "#a24b25", "font-size": 11, "font-weight": 700, "letter-spacing": 1.2 }, host).textContent = "BETTER ↖";

      const ours = MODELS.find((m) => m.tier === "ours");
      const qmax = MODELS.find((m) => m.name === "Qwen-3.8-Max");
      const cy = Y((ours.avg + qmax.avg) / 2);
      svg("line", { x1: X(ours.time) + rOf(ours) + 4, x2: X(qmax.time) - rOf(qmax) - 4, y1: Y(ours.avg), y2: Y(qmax.avg), stroke: "#a24b25", "stroke-width": 1.4, "stroke-dasharray": "5 5", opacity: 0.7 }, host);
      const mid = (X(ours.time) + X(qmax.time)) / 2;
      const lab = svg("text", { x: mid, y: cy - 10, "text-anchor": "middle", fill: "#a24b25", "font-size": 12.5, "font-weight": 700 }, host);
      lab.textContent = `${(qmax.time / ours.time).toFixed(1)}× lower latency, −${(qmax.avg - ours.avg).toFixed(2)} F1`;

      const pts = MODELS.filter((m) => m.avg >= ymin);
      pts
        .slice()
        .sort((a, b) => b.params - a.params)
        .forEach((m) => {
          const gx = svg("g", { class: "pt", transform: `translate(${X(m.time)},${Y(m.avg)})`, tabindex: 0, role: "img", "aria-label": `${m.name}: Macro-F1 ${m.avg}%, ${m.time} s` }, host);
          const r = rOf(m);
          const col = TIERS[m.tier].color;
          svg("circle", { r: r + 6, fill: col, opacity: 0.0, class: "halo" }, gx);
          svg("circle", { r, fill: m.tier === "ours" ? "#fbf1ea" : "#fff", stroke: col, "stroke-width": m.tier === "ours" ? 3 : 2 }, gx);
          const s = Math.min(16, r * 1.25);
          svg("image", { href: logoSrc(m), x: -s / 2, y: -s / 2, width: s, height: s }, gx);
          const pos = LABEL[view][m.name];
          if (pos) {
            const o = r + 7;
            const [dx, dy, anchor] = { r: [o, 4, "start"], l: [-o, 4, "end"], t: [0, -o - 2, "middle"], b: [0, o + 12, "middle"] }[pos];
            const t = svg("text", { x: dx, y: dy, "text-anchor": anchor, fill: m.tier === "ours" ? "#a24b25" : "#3b4656", "font-size": m.tier === "ours" ? 13.5 : 12, "font-weight": m.tier === "ours" ? 700 : 500 }, gx);
            t.textContent = m.tier === "ours" ? "HolmeSRE-4B (ours)" : m.name;
          }
          const html =
            `<b>${m.name}</b> <span class="tt-sub">· ${TIERS[m.tier].label} · ${m.size}</span>` +
            ttRows([
              ["Macro-F1", `${m.avg.toFixed(2)}%`],
              ["Latency", `${m.time.toFixed(2)} s`],
              ["Steps", m.step.toFixed(2)],
              ["Per-step", `${(m.time / m.step).toFixed(2)} s`],
              ["Event-level F1", `${m.ef1.toFixed(2)}%`],
            ]);
          gx.addEventListener("mousemove", (e) => showTip(html, e.clientX, e.clientY));
          gx.addEventListener("mouseleave", hideTip);
          gx.addEventListener("focus", () => {
            const b = gx.getBoundingClientRect();
            showTip(html, b.left + b.width / 2, b.top);
          });
          gx.addEventListener("blur", hideTip);
        });
      if (view === "top") {
        const hidden = MODELS.filter((m) => m.avg < ymin).length;
        svg("text", { x: W - mr, y: H - mb - 10, "text-anchor": "end", fill: "#97a0ab", "font-size": 11.5 }, host).textContent = `${hidden} compact models below 80% Macro-F1 hidden · switch to “All 13 models”`;
      }
    };
    $$("[data-view]").forEach((b) =>
      b.addEventListener("click", () => {
        view = b.dataset.view;
        $$("[data-view]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        draw();
      })
    );
    draw();
  })();

  (function ablation() {
    const stairs = $("#stairs");
    if (!stairs) return;
    const A = [
      { name: "Qwen3-4B", sub: "backbone", f1: 32.45, topo: 22.89, ef1: 83.42, step: 18.15, time: 8.28 },
      { name: "w/o IFT", sub: "TM-DPO only", f1: 69.9, topo: 59.34, ef1: 97.43, step: 16.58, time: 7.56 },
      { name: "w/o TM-DPO", sub: "IFT only", f1: 88.5, topo: 80.42, ef1: 99.7, step: 13.23, time: 6.04 },
      { name: "HolmeSRE", sub: "IFT + TM-DPO", f1: 92.88, topo: 84.64, ef1: 100.0, step: 12.77, time: 5.77, ours: true },
    ];
    stairs.innerHTML = A.map(
      (a, k) => `<div class="stair${a.ours ? " ours" : ""}">
        <div class="stair-cols">
          <div class="stair-col" data-h="${a.f1}" style="--c:${a.ours ? "#a24b25" : ["#dcc0b1", "#cf9a7e", "#bd7752"][k]};transition-delay:${k * 120}ms"><span>${a.f1.toFixed(2)}</span></div>
          <div class="stair-col topo" data-h="${a.topo}" style="--c:${a.ours ? "#3a72ad" : ["#c2d3e6", "#97b6d8", "#6f97c4"][k]};transition-delay:${k * 120 + 60}ms"><span>${a.topo.toFixed(2)}</span></div>
        </div>
        <div class="stair-label">${a.name}<small>${a.sub}</small></div></div>`
    ).join("");
    onVisible(stairs, () => {
      $$(".stair-col", stairs).forEach((c) => {
        c.style.height = `${(c.dataset.h / 100) * 82}%`;
      });
    });
    $("#abl-table").innerHTML =
      `<thead><tr><th>Variant</th><th>Macro-F1</th><th>Event F1</th><th>Topology</th><th>Steps</th><th>Time (s)</th></tr></thead><tbody>` +
      A.map((a) => `<tr class="${a.ours ? "ours" : ""}"><td>${a.name}</td><td>${a.f1.toFixed(2)}</td><td>${a.ef1.toFixed(2)}</td><td>${a.topo.toFixed(2)}%</td><td>${a.step.toFixed(2)}</td><td>${a.time.toFixed(2)}</td></tr>`).join("") +
      `</tbody>`;

    const V = [
      { k: "Macro-F1", s: "%, higher is better", oc: 22.01, us: 90.96, d: 2, hi: true },
      { k: "Event-level F1", s: "%, higher is better", oc: 91.98, us: 99.25, d: 2, hi: true },
      { k: "Input tokens", s: "average per run", oc: 53207.81, us: 6494.05, d: 0 },
      { k: "Output tokens", s: "average per run", oc: 18506.11, us: 2394.71, d: 0 },
      { k: "Steps", s: "interactions per run", oc: 29.39, us: 13.16, d: 2 },
      { k: "Latency", s: "seconds per run", oc: 800.16, us: 66.86, d: 2 },
    ];
    $("#vs-metrics").innerHTML = V.map((v) => {
      const mx = Math.max(v.oc, v.us);
      const ratio = v.hi ? `${(v.us - v.oc).toFixed(2)} points higher in HolmeSRE framework` : `<b>${(v.oc / v.us).toFixed(1)}×</b> more under OpenCode`;
      return `<div class="vs-metric"><span>${v.k}<small>${v.s}</small></span><div class="vs-bars">
        <div class="vs-bar oc"><span class="bar-track"><span class="bar-fill" data-w="${((v.oc / mx) * 100).toFixed(1)}"></span></span><b>${fmt(v.oc, v.d)}</b></div>
        <div class="vs-bar ours"><span class="bar-track"><span class="bar-fill" data-w="${((v.us / mx) * 100).toFixed(1)}"></span></span><b>${fmt(v.us, v.d)}</b></div>
        <span class="vs-ratio">${v.hi ? `<b class="good">+${(v.us - v.oc).toFixed(2)}</b> points in the HolmeSRE framework` : ratio}</span></div></div>`;
    }).join("");
    window.HolmeBars && window.HolmeBars($("#vs-metrics"));
  })();
})();
