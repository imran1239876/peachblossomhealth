/**
 * Homepage behaviour: the hero service explorer, scroll reveals, count-up
 * numbers and the one-open-at-a-time FAQ. Every section reads fully without
 * this script, and motion is skipped for visitors who prefer reduced motion
 * (the CSS cancels animations; this file just stops scheduling them).
 */

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = <T extends Element = HTMLElement>(
  sel: string,
  root: Document | Element = document,
) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(
  sel: string,
  root: Document | Element = document,
) => Array.from(root.querySelectorAll<T>(sel));

/* ---------- hero: service explorer ---------- */
function initHero() {
  const root = $("[data-hero]");
  if (!root) return;

  const slides = $$("[data-slide]", root);
  const items = $$<HTMLButtonElement>(".rail-item", root);
  const card = $("[data-card]", root);
  const field = {
    label: $("[data-card-label]", root),
    title: $("[data-card-title]", root),
    text: $("[data-card-text]", root),
    chip: $("[data-card-chip]", root),
    link: $<HTMLAnchorElement>("[data-card-link]", root),
  };
  let current = 0;
  let swapTimer = 0;
  let leaveTimer = 0;

  function fillCard(btn: HTMLButtonElement) {
    const {
      label = "",
      title = "",
      text = "",
      chip = "",
      link = "#",
    } = btn.dataset;
    if (field.label) field.label.textContent = label;
    if (field.title) field.title.textContent = title;
    if (field.text) field.text.textContent = text;
    if (field.chip) field.chip.textContent = chip;
    if (field.link) {
      field.link.href = link;
      field.link.setAttribute("aria-label", `Explore ${title}`);
    }
  }

  /** Restart the active bar's CSS animation, which is the rotation timer. */
  function restartBar(item: HTMLElement) {
    const bar = $(".bar i", item);
    if (!bar) return;
    bar.style.animation = "none";
    void bar.offsetWidth;
    bar.style.animation = "";
  }

  function select(i: number, fromUser = false) {
    root!.classList.add("is-started");
    if (i === current) {
      if (fromUser) restartBar(items[i]!);
      return;
    }
    const prev = slides[current];
    const next = slides[i];
    const btn = items[i];
    if (!next || !btn) return;

    items.forEach((item, k) => {
      const on = k === i;
      item.classList.toggle("is-active", on);
      item.classList.toggle("is-done", k < i);
      item.setAttribute("aria-selected", String(on));
      item.tabIndex = on ? 0 : -1;
    });

    // The outgoing photo stays underneath until the incoming one has wiped
    // over it, then drops back to the hidden state.
    window.clearTimeout(leaveTimer);
    slides.forEach((s) => s.classList.remove("is-leaving"));
    prev?.classList.replace("is-active", "is-leaving");
    next.classList.add("is-active");
    leaveTimer = window.setTimeout(
      () => prev?.classList.remove("is-leaving"),
      1100,
    );

    window.clearTimeout(swapTimer);
    if (reduce || !card) {
      fillCard(btn);
    } else {
      card.classList.add("is-swapping");
      swapTimer = window.setTimeout(() => {
        fillCard(btn);
        card.classList.remove("is-swapping");
      }, 300);
    }
    current = i;
  }

  items.forEach((item, k) => {
    item.addEventListener("click", () => select(k, true));
    item.addEventListener("keydown", (event) => {
      let n: number | null = null;
      if (event.key === "ArrowRight") n = (k + 1) % items.length;
      if (event.key === "ArrowLeft") n = (k - 1 + items.length) % items.length;
      if (n === null) return;
      event.preventDefault();
      items[n]?.focus();
      select(n, true);
    });
  });

  if (reduce) return;

  // The active rail bar finishing its 6s animation is the "next slide" tick.
  $("[data-rail]", root)?.addEventListener("animationend", (event) => {
    if (event.animationName === "pb-progress")
      select((current + 1) % slides.length);
  });

  // Pause while the visitor is exploring, or the tab is hidden.
  let hovering = false;
  const syncPause = () =>
    root.classList.toggle("is-paused", hovering || document.hidden);
  for (const el of [$("[data-stage]", root), $("[data-rail]", root)]) {
    if (!el) continue;
    for (const [on, off] of [
      ["mouseenter", "mouseleave"],
      ["focusin", "focusout"],
    ] as const) {
      el.addEventListener(on, () => {
        hovering = true;
        syncPause();
      });
      el.addEventListener(off, () => {
        hovering = false;
        syncPause();
      });
    }
  }
  document.addEventListener("visibilitychange", syncPause);

  // A glow and a little depth that follow the pointer.
  if (window.matchMedia("(pointer: fine)").matches) {
    let raf = 0;
    root.addEventListener("pointermove", (event) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = root.getBoundingClientRect();
        const x = event.clientX - r.left;
        const y = event.clientY - r.top;
        root.style.setProperty("--gx", `${x}px`);
        root.style.setProperty("--gy", `${y}px`);
        root.style.setProperty("--px", (x / r.width - 0.5).toFixed(3));
        root.style.setProperty("--py", (y / r.height - 0.5).toFixed(3));
      });
    });
    root.addEventListener("pointerleave", () => {
      root.style.setProperty("--px", "0");
      root.style.setProperty("--py", "0");
    });
  }
}

/* ---------- count-up numbers ---------- */
function countUp(el: HTMLElement) {
  const target = Number.parseInt(el.dataset.count ?? "", 10);
  if (Number.isNaN(target) || reduce) return;
  const suffix = (el.textContent ?? "").replace(/[0-9]/g, "");
  const duration = 1200;
  let start: number | null = null;
  const step = (t: number) => {
    start ??= t;
    const p = Math.min(1, (t - start) / duration);
    el.textContent = `${Math.round(target * (1 - Math.pow(1 - p, 3)))}${suffix}`;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- scroll reveals ---------- */
function initReveals() {
  const items = $$("[data-reveal]");
  if (reduce || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.classList.add("is-in");
        $$("[data-count]", el).forEach(countUp);
        io.unobserve(el);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  items.forEach((el) => io.observe(el));
  // Safety net: never leave content hidden.
  window.setTimeout(
    () => items.forEach((el) => el.classList.add("is-in")),
    6000,
  );
}

/* ---------- FAQ: one open at a time ---------- */
function initFaq() {
  const faqs = $$<HTMLDetailsElement>(".faq-item");
  for (const d of faqs) {
    d.addEventListener("toggle", () => {
      if (!d.open) return;
      for (const other of faqs) if (other !== d) other.open = false;
    });
  }
}

/* ---------- testimonials: arrows, counter and dots on a scroll-snap track ---------- */
function initReviews() {
  const root = $("[data-reviews]");
  const track = root && $("[data-reviews-track]", root);
  if (!root || !track) return;

  const slides = Array.from(track.children) as HTMLElement[];
  const dots = $$<HTMLButtonElement>("[data-reviews-dot]", root);
  const counter = $("[data-reviews-current]", root);
  let current = 0;

  const go = (i: number) => {
    const n = (i + slides.length) % slides.length;
    track.scrollTo({
      left: n * track.clientWidth,
      behavior: reduce ? "auto" : "smooth",
    });
  };

  const sync = () => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (i === current) return;
    current = i;
    if (counter) counter.textContent = String(i + 1).padStart(2, "0");
    dots.forEach((dot, k) => {
      dot.classList.toggle("is-active", k === i);
      if (k === i) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  };

  let raf = 0;
  track.addEventListener(
    "scroll",
    () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    },
    { passive: true },
  );
  $("[data-reviews-prev]", root)?.addEventListener("click", () =>
    go(current - 1),
  );
  $("[data-reviews-next]", root)?.addEventListener("click", () =>
    go(current + 1),
  );
  dots.forEach((dot, k) => dot.addEventListener("click", () => go(k)));
}

initHero();
initReveals();
initFaq();
initReviews();
