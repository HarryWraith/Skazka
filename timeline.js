// timeline.js — Skazka timeline (epochs + modal for expanded descriptions)

/* ---------------- Utilities ---------------- */
const escapeHTML = (s = "") =>
     s.replace(
          /[&<>"']/g,
          (ch) =>
               ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;",
               }[ch])
     );

/* ---------------- JSON normalizer ---------------- */
function normalizeData(raw) {
     const list = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.events)
          ? raw.events
          : Array.isArray(raw?.timeline)
          ? raw.timeline
          : [];

     return list.map((i) => ({
          year: i.year ?? i.date ?? i.when ?? "",
          title: i.title ?? i.name ?? i.heading ?? "",
          detail: i.detail ?? i.details ?? i.text ?? i.description ?? "",
          html: !!i.html,
          epoch: !!(
               i.epoch ||
               i.is_epoch ||
               (typeof i.kind === "string" && i.kind.toLowerCase() === "epoch")
          ),
          expanded: i.expanded ?? "",
          expanded_html: !!i.expanded_html,
     }));
}

/* ---------------- Modal (accessible, namespaced) ---------------- */
const SkzModal = (() => {
     let root, dialog, titleEl, bodyEl, closeBtn, lastFocus;

     function ensure() {
          if (root) return;
          root = document.createElement("div");
          root.id = "skz-tl-modal-root";
          root.innerHTML = `
      <div class="skz-modal-backdrop" data-close="1"></div>
      <div class="skz-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="skz-modal-title">
        <div class="skz-modal-head">
          <h3 id="skz-modal-title" class="skz-modal-title"></h3>
          <button type="button" class="skz-modal-close" aria-label="Close">×</button>
        </div>
        <div class="skz-modal-body"></div>
      </div>
    `;
          document.body.appendChild(root);
          dialog = root.querySelector(".skz-modal-dialog");
          titleEl = root.querySelector(".skz-modal-title");
          bodyEl = root.querySelector(".skz-modal-body");
          closeBtn = root.querySelector(".skz-modal-close");

          root.addEventListener("click", (e) => {
               if (e.target.dataset.close) close();
          });
          closeBtn.addEventListener("click", close);
          document.addEventListener("keydown", (e) => {
               if (!root.classList.contains("open")) return;
               if (e.key === "Escape") close();
               // focus trap
               if (e.key === "Tab") {
                    const f = dialog.querySelectorAll(
                         'a[href],button,textarea,input,select,[tabindex]:not([tabindex="-1"])'
                    );
                    if (!f.length) return;
                    const first = f[0],
                         last = f[f.length - 1];
                    if (e.shiftKey && document.activeElement === first) {
                         e.preventDefault();
                         last.focus();
                    } else if (!e.shiftKey && document.activeElement === last) {
                         e.preventDefault();
                         first.focus();
                    }
               }
          });
     }

     function open({ title = "", content = "" } = {}) {
          ensure();
          lastFocus = document.activeElement;
          titleEl.textContent = title;
          bodyEl.innerHTML = content;
          root.classList.add("open");
          document.body.classList.add("skz-modal-open");
          closeBtn.focus();
     }

     function close() {
          if (!root) return;
          root.classList.remove("open");
          document.body.classList.remove("skz-modal-open");
          if (lastFocus && lastFocus.focus) lastFocus.focus();
     }

     return { open, close };
})();

/* ---------------- DOM builders ---------------- */
function makeEvent(
     { year, title, detail, html, epoch, expanded, expanded_html },
     idx
) {
     const ev = document.createElement("div");
     ev.className = "event";
     if (epoch) ev.classList.add("event--epoch");
     ev.dataset.id = idx;

     const safeYear = escapeHTML(String(year));
     const safeTitle = escapeHTML(String(title));

     ev.innerHTML = `
    <div class="event-header" tabindex="0" role="button" aria-expanded="false" aria-label="Toggle event ${safeTitle}">
      <span class="event-year">${safeYear}</span>
      <div class="event-title">${safeTitle}</div>
      <span class="rune" aria-hidden="true"></span>
    </div>
    <div class="event-details"></div>
  `;

     const header = ev.querySelector(".event-header");
     const detailsEl = ev.querySelector(".event-details");

     // Decorative ornaments only for epoch cards
     if (epoch) {
          const l = document.createElement("span"),
               r = document.createElement("span");
          l.className = "ornament ornament--left";
          r.className = "ornament ornament--right";
          l.setAttribute("aria-hidden", "true");
          r.setAttribute("aria-hidden", "true");
          header.append(l, r);
     }

     // Inline summary text
     detailsEl.innerHTML = html
          ? String(detail)
          : escapeHTML(String(detail)).replace(/\n/g, "<br>");

     // “More…” only if expanded content exists — place it at the END of details
     if (expanded && String(expanded).trim().length) {
          const wrap = document.createElement("div");
          wrap.className = "skz-tl-morewrap";

          const moreBtn = document.createElement("button");
          moreBtn.type = "button";
          moreBtn.className = "skz-tl-more";
          moreBtn.setAttribute("aria-label", `Open details for ${safeTitle}`);
          moreBtn.textContent = "More…";

          // avoid header toggle/page-jump
          moreBtn.addEventListener("mousedown", (e) => e.preventDefault());
          moreBtn.addEventListener("click", (e) => {
               e.preventDefault();
               e.stopPropagation();

               const content = expanded_html
                    ? String(expanded)
                    : escapeHTML(String(expanded)).replace(/\n/g, "<br>");

               SkzModal.open({ title: safeTitle, content });
          });

          wrap.appendChild(moreBtn);
          detailsEl.appendChild(wrap);
     }

     // Default OPEN
     ev.classList.add("open");
     header.setAttribute("aria-expanded", "true");
     requestAnimationFrame(() => {
          detailsEl.style.maxHeight = detailsEl.scrollHeight + "px";
          Branches.scheduleBurst();
     });

     // Toggle inline summary (and naturally hide the button when collapsed)
     const toggle = () => {
          const opening = !ev.classList.contains("open");
          if (opening) {
               ev.classList.add("open");
               header.setAttribute("aria-expanded", "true");
               detailsEl.style.maxHeight = detailsEl.scrollHeight + "px";
          } else {
               ev.classList.remove("open");
               header.setAttribute("aria-expanded", "false");
               detailsEl.style.maxHeight = "0px";
          }
          Branches.scheduleBurst();
     };
     header.addEventListener("click", toggle);
     header.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
               e.preventDefault();
               toggle();
          }
     });

     return ev;
}

/* ---------------- Render + reveal ---------------- */
function renderTimeline(list) {
     const host = document.getElementById("timeline");
     if (!host) return;

     host.querySelectorAll(".event").forEach((n) => n.remove());
     const frag = document.createDocumentFragment();
     list.forEach((item, i) => frag.appendChild(makeEvent(item, i)));
     host.appendChild(frag);

     const outer = document.querySelector(".timeline");
     if (outer) outer.classList.add("reveal-ready");

     const cards = host.querySelectorAll(".event");
     if ("IntersectionObserver" in window) {
          const io = new IntersectionObserver(
               (entries) => {
                    entries.forEach((e) => {
                         if (e.isIntersecting) {
                              e.target.classList.add("in-view");
                              io.unobserve(e.target);
                         }
                    });
               },
               { threshold: 0.15 }
          );
          cards.forEach((c) => io.observe(c));
     } else {
          cards.forEach((c) => c.classList.add("in-view"));
     }

     if ("MutationObserver" in window) {
          const mo = new MutationObserver(() => Branches.scheduleBurst());
          mo.observe(host, {
               childList: true,
               subtree: true,
               characterData: true,
          });
     }

     Branches.scheduleBurst();
}

/* ---------------- Curved branches (SVG underlay) ---------------- */
const Branches = (() => {
     let drawQueued = false;

     function ensureSvg(tl) {
          let svg = tl.querySelector("#tl-branches");
          if (!svg) {
               svg = document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "svg"
               );
               svg.id = "tl-branches";
               svg.setAttribute("preserveAspectRatio", "none");
               tl.prepend(svg);
          }
          return svg;
     }

     function draw() {
          const tl = document.querySelector(".timeline");
          if (!tl) return;

          const svg = ensureSvg(tl);

          const rect = tl.getBoundingClientRect();
          const W = Math.round(tl.clientWidth || rect.width || 0);
          const H = Math.max(
               tl.scrollHeight,
               tl.clientHeight,
               Math.round(rect.height)
          );
          svg.setAttribute("width", W);
          svg.setAttribute("height", H);
          svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

          while (svg.firstChild) svg.removeChild(svg.firstChild);

          const centerX = Math.round(W / 2);
          const headers = tl.querySelectorAll(".event .event-header");

          const rectTL = tl.getBoundingClientRect();
          headers.forEach((header) => {
               const hRect = header.getBoundingClientRect();
               const titleEl = header.querySelector(".event-title");

               const y = titleEl
                    ? titleEl.getBoundingClientRect().top -
                      rectTL.top +
                      titleEl.getBoundingClientRect().height / 2
                    : hRect.top - rectTL.top + hRect.height / 2;

               const left = hRect.left - rectTL.left;
               const right = hRect.right - rectTL.left;
               const onRight = (left + right) / 2 > centerX;

               const endX = onRight ? left : right;
               const startX = centerX;

               const dx = Math.abs(endX - startX);
               const CURVE = Math.max(80, Math.min(160, dx * 0.75));
               const s = onRight ? 1 : -1;

               const c1x = startX + s * CURVE * 0.55;
               const c2x = endX - s * CURVE * 0.25;

               const path = document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "path"
               );
               path.setAttribute(
                    "d",
                    `M ${startX},${y} C ${c1x},${y} ${c2x},${y} ${endX},${y}`
               );
               path.setAttribute(
                    "class",
                    header.closest(".event")?.classList.contains("event--epoch")
                         ? "branch branch--epoch"
                         : "branch"
               );
               svg.appendChild(path);
          });
     }

     function rafDraw() {
          if (drawQueued) return;
          drawQueued = true;
          requestAnimationFrame(() => {
               drawQueued = false;
               draw();
          });
     }

     function scheduleBurst() {
          rafDraw();
          setTimeout(rafDraw, 0);
          setTimeout(rafDraw, 120);
          setTimeout(rafDraw, 360);
          if (window.requestIdleCallback) requestIdleCallback(() => rafDraw());
          if (document.fonts?.ready) document.fonts.ready.then(rafDraw);
     }

     function watch() {
          const tl = document.querySelector(".timeline");
          if (!tl) return;
          tl.addEventListener("tl:rendered", scheduleBurst);
          window.addEventListener("load", scheduleBurst);
          document.addEventListener("visibilitychange", () => {
               if (!document.hidden) scheduleBurst();
          });
          window.addEventListener("resize", scheduleBurst);
          window.addEventListener("scroll", scheduleBurst, { passive: true });
          if ("ResizeObserver" in window) {
               const ro = new ResizeObserver(() => scheduleBurst());
               ro.observe(tl);
          }
     }

     return { watch, scheduleBurst };
})();

/* ---------------- Boot ---------------- */
document.addEventListener("DOMContentLoaded", async () => {
     Branches.watch();
     try {
          const res = await fetch("data/timeline.json", { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = normalizeData(await res.json());
          renderTimeline(data);
     } catch (err) {
          console.error("Failed to load timeline.json:", err);
          const host = document.getElementById("timeline");
          if (host) {
               const msg = document.createElement("p");
               msg.style.color = "var(--sb-dim)";
               msg.style.marginTop = "1rem";
               msg.textContent = "Timeline failed to load.";
               host.appendChild(msg);
          }
          Branches.scheduleBurst();
     }
});
