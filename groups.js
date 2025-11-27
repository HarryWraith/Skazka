// groups.js v3 — simple groups renderer with multiline summary support
// JSON per entry: id, type, name, aliases[], summary(str|str[]), operation[], area, services[],
//                 legality, power, membership, images{icon}

(() => {
     const mount = document.getElementById("groups-grid");
     if (!mount) return;

     const html = document.documentElement;
     const TYPE_ATTR = (
          html.getAttribute("data-group-type") ?? "all"
     ).toLowerCase();
     const DATA_URL = html.getAttribute("data-data-url") ?? "data/groups.json";

     const normalizeType = (s) =>
          String(s ?? "")
               .toLowerCase()
               .replace(/s\b$/, ""); // "cults"->"cult"

     // ——— helpers ———
     const el = (tag, attrs = {}, children = []) => {
          const n = document.createElement(tag);
          for (const [k, v] of Object.entries(attrs)) {
               if (v == null) continue;
               if (k === "class") n.className = v;
               else n.setAttribute(k, v);
          }
          (Array.isArray(children) ? children : [children]).forEach((c) => {
               if (c == null || c === false) return;
               n.append(typeof c === "string" ? document.createTextNode(c) : c);
          });
          return n;
     };

     // Accepts string with newlines OR array of strings -> array of <p>
     const toParas = (value) => {
          const parts = Array.isArray(value)
               ? value
               : String(value ?? "").split(/\r?\n+/);
          return parts
               .map((s) => s.trim())
               .filter(Boolean)
               .map((s) => el("p", {}, s));
     };

     const chips = (items = []) =>
          items?.length
               ? el(
                      "div",
                      { class: "chip-row tl-detail" },
                      items.map((i) => el("span", { class: "chip" }, i))
                 )
               : null;

     const facts = (g) => {
          const rows = [
               ["Area", g.area],
               ["Legality", g.legality],
               ["Power", g.power],
               ["Membership", g.membership],
          ];
          const tbody = el("tbody");
          for (const [th, td] of rows)
               tbody.append(
                    el("tr", {}, [el("th", {}, th), el("td", {}, td ?? "—")])
               );
          return el(
               "div",
               { class: "facts tl-detail" },
               el("table", { class: "materials-table" }, tbody)
          );
     };

     const card = (g) => {
          // debug: confirm what summary we received for this item
          // (remove this if you don't want console noise)
          console.debug("[groups.js v3] summary for", g.name, "=>", g.summary);

          const header = el("div", { class: "group-card__header" }, [
               g.images?.icon
                    ? el("img", {
                           class: "group-card__icon",
                           src: g.images.icon,
                           alt: `${g.name} icon`,
                      })
                    : el("div"),
               el("div", { class: "group-card__titlewrap" }, [
                    el("h3", { class: "tb-title tl-title" }, g.name),
                    g.aliases?.length
                         ? el(
                                "span",
                                { class: "group-card__aliases" },
                                `— also known as ${g.aliases.join(", ")}`
                           )
                         : null,
               ]),
          ]);

          const summaryBlock =
               g.summary && toParas(g.summary).length
                    ? el(
                           "div",
                           { class: "group-card__summary tl-detail" },
                           toParas(g.summary)
                      )
                    : null;

          return el(
               "article",
               {
                    class: "tb-panel tl-item group-card",
                    "data-legal": (g.legality ?? "").toLowerCase(),
                    "data-power": (g.power ?? "").toLowerCase(),
               },
               [
                    header,
                    summaryBlock, // <— summary appears right under header
                    chips(g.operation ?? []),
                    chips(g.services ?? []),
                    facts(g),
               ]
          );
     };

     const render = (list) => {
          mount.innerHTML = "";
          for (const g of list) mount.append(card(g));
     };

     const kickSearch = () => {
          const q = document.getElementById("tl-q");
          if (!q) return;
          const label =
               TYPE_ATTR === "all" || !TYPE_ATTR ? "groups" : TYPE_ATTR;
          if (!q.placeholder.toLowerCase().includes(label))
               q.placeholder = `Search ${label}…`;
          q.dispatchEvent(new Event("input", { bubbles: true }));
     };

     (async () => {
          try {
               const res = await fetch(DATA_URL, {
                    credentials: "same-origin",
               });
               const raw = await res.json();
               const all = Array.isArray(raw) ? raw : raw.groups ?? [];

               const t = normalizeType(TYPE_ATTR);
               const list =
                    t === "" || t === "all" || t === "group"
                         ? all
                         : all.filter((g) => normalizeType(g.type) === t);

               render(list);
               kickSearch();
               window.addEventListener("load", kickSearch, { once: true });
          } catch (err) {
               console.error("groups.js failed:", err);
               mount.innerHTML =
                    "<article class='tb-panel'><p>Failed to load groups.</p></article>";
          }
     })();
})();
