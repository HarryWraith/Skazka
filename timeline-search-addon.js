/* ==========================================================================
   timeline-search-addon.js  (original working add-on)
   - Render-neutral: does NOT rebuild your timeline markup/CSS
   - Filters your existing cards by toggling `hidden`
   - Query: keywords, year:>=N, A..B ranges, epoch:yes/no
   - Sticky-at-start: sets --tl-stick-top to the bar’s initial viewport top
   - URL sync (?q=...) and '/' focuses the search field
   - Triggers Branches.scheduleBurst()/redraw() if present
   ========================================================================== */

(function () {
     /* ---------------------- tiny helpers ---------------------- */
     const $ = (s, r = document) => r.querySelector(s);
     const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
     const debounce = (fn, ms = 180) => {
          let t;
          return (...a) => {
               clearTimeout(t);
               t = setTimeout(() => fn(...a), ms);
          };
     };
     const Branches = (window && window.Branches) || {
          scheduleBurst() {},
          redraw() {},
     };

     /* ---------------------- query parsing ---------------------- */
     function parseQuery(q) {
          const out = {
               words: [],
               yearMin: -Infinity,
               yearMax: Infinity,
               epoch: null,
          };
          (String(q).trim().match(/\S+/g) || []).forEach((t) => {
               let m;
               if ((m = t.match(/^year:(>=|<=|=)(-?\d+)$/i))) {
                    const op = m[1],
                         v = parseInt(m[2], 10);
                    if (op === ">=") out.yearMin = Math.max(out.yearMin, v);
                    else if (op === "<=")
                         out.yearMax = Math.min(out.yearMax, v);
                    else out.yearMin = out.yearMax = v;
                    return;
               }
               if ((m = t.match(/^(-?\d+)\.\.(-?\d+)$/))) {
                    const a = parseInt(m[1], 10),
                         b = parseInt(m[2], 10);
                    out.yearMin = Math.max(out.yearMin, Math.min(a, b));
                    out.yearMax = Math.min(out.yearMax, Math.max(a, b));
                    return;
               }
               if ((m = t.match(/^epoch:(yes|no|true|false)$/i))) {
                    out.epoch = /^(yes|true)$/i.test(m[1]);
                    return;
               }
               out.words.push(t);
          });
          return out;
     }

     /* ---------------------- element readers ---------------------- */
     function firstIntInString(s) {
          if (!s) return NaN;
          const m = String(s).match(/-?\d+/);
          return m ? parseInt(m[0], 10) : NaN;
     }

     function getYearFor(el) {
          // Prefer attributes if present
          const att =
               el.getAttribute("data-year-num") ||
               el.getAttribute("data-year") ||
               (el.dataset ? el.dataset.yearNum || el.dataset.year : null);
          let y = firstIntInString(att);
          if (!isNaN(y)) return y;

          // Common child hooks
          const yEl = el.querySelector(".year, .tl-year, [data-role='year']");
          if (yEl) {
               y = firstIntInString(yEl.textContent);
               if (!isNaN(y)) return y;
          }

          // Fallback: first int anywhere in the card
          return firstIntInString(el.textContent);
     }

     function isEpoch(el) {
          if (el.hasAttribute("data-epoch")) {
               const v = el.getAttribute("data-epoch");
               return v === "1" || v === "true";
          }
          if (el.dataset && "epoch" in el.dataset)
               return (
                    String(el.dataset.epoch) === "1" ||
                    String(el.dataset.epoch) === "true"
               );
          if (
               el.classList.contains("epoch") ||
               el.classList.contains("is-epoch")
          )
               return true;
          const aria = (el.getAttribute("aria-label") || "").toLowerCase();
          return /epoch/.test(aria);
     }

     function getHaystack(el) {
          const titleEl = el.querySelector(".title, .tl-title, h3, h2");
          const detailEl = el.querySelector(".detail, .details, .tl-detail, p");
          let s = "";
          if (titleEl) s += " " + titleEl.textContent;
          if (detailEl) s += " " + detailEl.textContent;
          if (!s.trim()) s = el.textContent || "";
          return s.toLowerCase();
     }

     /* ---------------------- card selection ---------------------- */
     function getCards() {
          let cards = $$(".event");
          if (!cards.length) cards = $$(".tl-item");
          if (!cards.length) cards = $$("[data-role='event']");
          return cards;
     }

     /* ---------------------- search core ---------------------- */
     function matches(el, q) {
          const y = getYearFor(el);
          if (!isNaN(y) && (y < q.yearMin || y > q.yearMax)) return false;
          if (q.epoch !== null && isEpoch(el) !== q.epoch) return false;
          if (q.words.length) {
               const hay = getHaystack(el);
               for (const w of q.words)
                    if (!hay.includes(String(w).toLowerCase())) return false;
          }
          return true;
     }

     function applySearch(queryString) {
          const parsed = parseQuery(queryString);
          const cards = getCards();
          let shown = 0;
          for (const card of cards) {
               const ok = !queryString.trim() || matches(card, parsed);
               card.hidden = !ok;
               if (ok) shown++;
          }

          // Update count
          const countEl = $("#tl-count");
          if (countEl) {
               countEl.value = cards.length
                    ? shown
                         ? `${shown} / ${cards.length}`
                         : "No matches"
                    : "";
          }

          // Branch redraw if available
          try {
               Branches.scheduleBurst();
               Branches.redraw();
          } catch {}

          // Update URL (?q=)
          try {
               const url = new URL(location.href);
               if (queryString.trim()) url.searchParams.set("q", queryString);
               else url.searchParams.delete("q");
               history.replaceState(null, "", url.toString());
          } catch {}
     }

     /* ---------------------- sticky-at-start (original) ---------------------- */
     // Keep a --navbar-height var up to date (if you use .navbar)
     function observeNavbarHeight() {
          const setVar = (h) =>
               document.documentElement.style.setProperty(
                    "--navbar-height",
                    h + "px"
               );

          const compute = () => {
               const nav = document.querySelector(
                    ".navbar, nav, [data-nav], #navbar"
               );
               setVar(nav ? nav.getBoundingClientRect().height : 0);
          };

          compute();
          addEventListener("resize", compute);

          // Watch for navbar being injected/changed
          new MutationObserver(compute).observe(document.body, {
               childList: true,
               subtree: true,
          });
          const nav = document.querySelector(
               ".navbar, nav, [data-nav], #navbar"
          );
          if (nav) new ResizeObserver(compute).observe(nav);
     }

     // Set --tl-stick-top to the bar’s current viewport top
     function setStickyToStart() {
          const el = $("#tl-searchbar");
          if (!el) return;

          const update = () => {
               requestAnimationFrame(() => {
                    const rect = el.getBoundingClientRect();
                    const top = Math.max(0, Math.round(rect.top)); // stick exactly where it starts
                    document.documentElement.style.setProperty(
                         "--tl-stick-top",
                         top + "px"
                    );
               });
          };

          // Initial measurements (after layout settles)
          if (document.readyState === "complete") update();
          else {
               window.addEventListener("load", update, { once: true });
               requestAnimationFrame(update);
          }

          // Recalculate on resize
          window.addEventListener("resize", update);
     }

     /* ---------------------- boot ---------------------- */
     document.addEventListener("DOMContentLoaded", () => {
          observeNavbarHeight();
          setStickyToStart();

          const input = $("#tl-q");
          const clearBtn = $("#tl-clear");
          const params = new URLSearchParams(location.search);
          const initialQ = params.get("q") || "";
          if (input) input.value = initialQ;

          // Apply now (deep-linked ?q=)
          applySearch(initialQ);

          if (input)
               input.addEventListener(
                    "input",
                    debounce(() => applySearch(input.value), 150)
               );
          if (clearBtn && input) {
               clearBtn.addEventListener("click", () => {
                    input.value = "";
                    applySearch("");
                    input.focus();
               });
          }

          // Keyboard '/' to focus search
          document.addEventListener("keydown", (e) => {
               const tag = (
                    document.activeElement?.tagName || ""
               ).toLowerCase();
               if (e.key === "/" && tag !== "input" && tag !== "textarea") {
                    e.preventDefault();
                    input?.focus();
                    input?.select();
               }
          });
     });
})();
