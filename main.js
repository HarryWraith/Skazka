// /assets/js/main.js
(function () {
  // ---------- utilities ----------
  function inject(url, mountId, onload) {
    const mount = document.getElementById(mountId);
    if (!mount) return Promise.resolve(false);

    return fetch(url, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.text();
      })
      .then((html) => {
        mount.innerHTML = html;
        if (typeof onload === "function") onload(mount);
        return true;
      })
      .catch((err) => {
        console.error(`Failed to load ${url}:`, err);
        return false;
      });
  }

  // ---------- boot (navbar + footer) ----------
  document.addEventListener("DOMContentLoaded", () => {
    // NAVBAR
    inject("/navbar.html", "navbar", () => {
      if (window.initNavbar) window.initNavbar();
    });

    // FOOTER
    inject("/footer.html", "footer");
  })();
})();

// ---------- Voices of Skazka carousel ----------
(function () {
  const MQ = "(max-width: 767px)";

  function findVoicesRoot() {
    // Prefer the section wrapper if present
    const root =
      document.getElementById("voicesCarousel") ||
      document.querySelector("section.skz-fc") ||
      document.querySelector(".skz-fc-stage")?.closest("section, .skz-fc");
    return root || null;
  }

  function teardownVoicesCarousel(root) {
    if (!root) return;
    const stage = root.querySelector(".skz-fc-stage");
    const slides = root.querySelectorAll(".skz-fc-slide");
    const navs = root.querySelectorAll(".skz-fc-nav");

    stage?.classList.remove("is-ready");
    slides.forEach((s) =>
      s.classList.remove("skz-active", "skz-prev", "skz-next")
    );
    navs.forEach((n) => n.removeAttribute("disabled"));
  }

  function initVoicesCarousel(root) {
    if (!root) return;

    const stage = root.querySelector(".skz-fc-stage");
    const slides = Array.from(root.querySelectorAll(".skz-fc-slide"));
    if (!stage || !slides.length) return;

    const btnPrev = root.querySelector(".skz-fc-prev");
    const btnNext = root.querySelector(".skz-fc-next");

    // Avoid rebinding if we’ve already initialized once
    if (root.dataset.bound === "1") {
      apply(); // re-apply state on re-entry to desktop
      return;
    }
    root.dataset.bound = "1";

    let i = 0;

    function apply() {
      const n = slides.length;
      const prev = (i - 1 + n) % n;
      const next = (i + 1) % n;

      slides.forEach((s, idx) => {
        s.classList.remove("skz-active", "skz-prev", "skz-next");
        if (idx === i) s.classList.add("skz-active");
        else if (idx === prev) s.classList.add("skz-prev");
        else if (idx === next) s.classList.add("skz-next");
      });

      stage.classList.add("is-ready");
    }

    function go(delta) {
      i = (i + delta + slides.length) % slides.length;
      apply();
    }

    // Buttons (bind once)
    btnPrev?.addEventListener("click", () => go(-1));
    btnNext?.addEventListener("click", () => go(+1));

    // Click on active slide -> follow link
    root.addEventListener("click", (e) => {
      const slide = e.target.closest(".skz-fc-slide");
      if (!slide || !slide.classList.contains("skz-active")) return;
      const href =
        slide.dataset.href || slide.querySelector("a")?.getAttribute("href");
      if (href) window.location.href = href;
    });

    // Keyboard
    root.setAttribute("tabindex", "0");
    root.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(+1);
      }
    });

    // Wait for fonts/images so sizing is perfect, then apply
    function settleThenApply() {
      apply();
      if (document.fonts?.ready) {
        document.fonts.ready.then(apply).catch(() => {});
      }
      const imgs = root.querySelectorAll("img");
      let pending = imgs.length;
      if (!pending) return;
      imgs.forEach((img) => {
        if (img.complete) {
          if (--pending === 0) apply();
        } else {
          img.addEventListener(
            "load",
            () => {
              if (--pending === 0) apply();
            },
            { once: true }
          );
          img.addEventListener(
            "error",
            () => {
              if (--pending === 0) apply();
            },
            { once: true }
          );
        }
      });
    }

    // Expose apply so we can re-apply if needed (optional)
    root._skzApply = apply;

    settleThenApply();

    // Start at slide 0
    apply();
  }

  // Boot / responsive toggle
  function start() {
    const root = findVoicesRoot();
    if (!root) return;

    if (window.matchMedia(MQ).matches) {
      // Mobile: no carousel behavior (per your design)
      teardownVoicesCarousel(root);
    } else {
      initVoicesCarousel(root);
      // If already bound, re-apply state to ensure correct classes
      if (root.dataset.bound === "1" && typeof root._skzApply === "function") {
        root._skzApply();
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  // Re-evaluate when crossing the mobile breakpoint
  window.matchMedia(MQ).addEventListener("change", start);
})();
