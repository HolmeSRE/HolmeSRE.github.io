(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const header = $(".site-header");
  const progress = $(".reading-progress");
  let ticking = false;
  const onScroll = () => {
    const y = window.scrollY;
    header.classList.toggle("is-scrolled", y > 8);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    ticking = false;
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(onScroll);
      }
    },
    { passive: true }
  );
  onScroll();

  const toggle = $(".menu-toggle");
  const mobileNav = $("#mobile-nav");
  const setMenu = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    mobileNav.hidden = !open;
  };
  toggle.addEventListener("click", () => setMenu(mobileNav.hidden));
  $$("a", mobileNav).forEach((a) => a.addEventListener("click", () => setMenu(false)));

  const sectionIds = ["motivation", "study", "haystack", "design", "method", "effectiveness", "efficiency", "ablation", "deployment", "lessons", "conclusion"];
  const navParent = { efficiency: "effectiveness", ablation: "effectiveness" };
  const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);
  const markActive = (id) => {
    const top = navParent[id] || id;
    $$(".main-nav a").forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${top}`));
    $$(".side-toc a").forEach((a) => {
      const href = a.getAttribute("href").slice(1);
      const isChild = a.classList.contains("side-toc-child");
      a.classList.toggle("is-active", isChild ? href === id : href === top && !navParent[href]);
    });
  };
  const spy = () => {
    const line = window.innerHeight * 0.32;
    let current = null;
    for (const s of sections) {
      if (s.getBoundingClientRect().top <= line) current = s.id;
    }
    if (current) markActive(current);
    else {
      $$(".main-nav a, .side-toc a").forEach((a) => a.classList.remove("is-active"));
    }
  };
  window.addEventListener("scroll", () => requestAnimationFrame(spy), { passive: true });
  spy();

  $$('[role="tablist"]').forEach((list) => {
    const tabs = $$('[role="tab"]', list);
    const activate = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
      const panel = document.getElementById(tab.getAttribute("aria-controls"));
      if (panel) panel.dispatchEvent(new CustomEvent("panelshown", { bubbles: true }));
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => activate(tab));
      tab.addEventListener("keydown", (e) => {
        let j = null;
        if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
        if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
        if (e.key === "Home") j = 0;
        if (e.key === "End") j = tabs.length - 1;
        if (j !== null) {
          e.preventDefault();
          activate(tabs[j], true);
        }
      });
    });
  });

  const box = $("#lightbox");
  const boxImg = $("#lightbox-img");
  const boxCap = $("#lightbox-caption");
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-lightbox]");
    if (!trigger) return;
    boxImg.src = trigger.dataset.lightbox;
    boxImg.alt = trigger.dataset.caption || "";
    boxCap.textContent = trigger.dataset.caption || "";
    if (typeof box.showModal === "function") box.showModal();
    else window.open(trigger.dataset.lightbox, "_blank");
  });
  $("#lightbox-close").addEventListener("click", () => box.close());
  box.addEventListener("click", (e) => {
    if (e.target === box) box.close();
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-visible");
        en.target.dispatchEvent(new CustomEvent("visible"));
        io.unobserve(en.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
  );
  $$(".reveal, .journey, [data-on-visible]").forEach((el) => io.observe(el));
  window.HolmeObserve = (el) => io.observe(el);

  const barIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        requestAnimationFrame(() => {
          el.style.width = `${el.dataset.w}%`;
        });
        barIO.unobserve(el);
      });
    },
    { threshold: 0.2 }
  );
  window.HolmeBars = (root = document) => $$("[data-w]", root).forEach((el) => barIO.observe(el));
  window.HolmeBars();

  const countUp = (el) => {
    const target = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.decimals || "0", 10);
    if (reduceMotion) {
      el.textContent = target.toFixed(dec);
      return;
    }
    const dur = 1400;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(dec);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        countUp(en.target);
        countIO.unobserve(en.target);
      }
    });
  });
  $$("[data-count]").forEach((el) => countIO.observe(el));

  const loopNodes = $$("#loop .teaser-node");
  if (loopNodes.length && !reduceMotion) {
    let k = 0;
    loopNodes[0].classList.add("is-live");
    setInterval(() => {
      loopNodes[k].classList.remove("is-live");
      k = (k + 1) % loopNodes.length;
      loopNodes[k].classList.add("is-live");
    }, 1800);
  }
})();
