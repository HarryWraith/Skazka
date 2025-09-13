// imap.js — performance-optimized version

// Base image
const img = { url: "skazka_export.webp", width: 2047, height: 2047 };
const bounds = [
  [0, 0],
  [img.height, img.width],
];

const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -4,
  maxZoom: 2,
  wheelPxPerZoomLevel: 180,
  zoomSnap: 0.25,
  zoomDelta: 0.25,
  markerZoomAnimation: false,
  fadeAnimation: false,
  maxBoundsViscosity: 0.2,
  preferCanvas: true,
  // Performance optimizations
  zoomControl: false, // Remove default zoom control to reduce DOM
  attributionControl: false, // Remove attribution to reduce DOM
});

// Visibility thresholds (kept exactly)
const VISIBILITY_PCT = {
  ruin: 0.8,
  town: 0.8,
  city: 0.6,
  kingdom: 0.5,
  poi: 0.8,
};
const KINGDOM_VIS_PCT = { pinMin: 0.3, pinMax: 0.85, areaMin: 0.3 };

// Pre-compute zoom thresholds once
function pctToZoom(pct) {
  const { minZoom, maxZoom } = map.options;
  return minZoom + pct * (maxZoom - minZoom);
}

let VIS_Z = {},
  KV_Z = {};
function recomputeVisZ() {
  VIS_Z = Object.fromEntries(
    Object.entries(VISIBILITY_PCT).map(([t, p]) => [t, pctToZoom(p)])
  );
  KV_Z = {
    pinMin: pctToZoom(KINGDOM_VIS_PCT.pinMin),
    pinMax: pctToZoom(KINGDOM_VIS_PCT.pinMax),
    areaMin: pctToZoom(KINGDOM_VIS_PCT.areaMin),
  };
}
recomputeVisZ();

const overlay = L.imageOverlay(img.url, bounds).addTo(map);
map.fitBounds(bounds);

// Dynamic max bounds with throttling
let boundsUpdateTimeout = null;
function refreshMaxBounds() {
  if (boundsUpdateTimeout) return;
  boundsUpdateTimeout = setTimeout(() => {
    const size = map.getSize();
    const padX = Math.ceil(size.x / 2);
    const padY = Math.ceil(size.y / 2);
    map.setMaxBounds([
      [-padY, -padX],
      [img.height + padY, img.width + padX],
    ]);
    boundsUpdateTimeout = null;
  }, 100);
}

map.whenReady(refreshMaxBounds);
map.on("resize zoomend", refreshMaxBounds);

// Optimize image overlay
const el = overlay.getElement();
if (el) {
  el.decoding = "sync";
  el.loading = "eager";
  try {
    el.fetchPriority = "high";
  } catch (e) {}
  el.style.willChange = "transform";
  // Additional performance hints
  el.style.imageRendering = "pixelated"; // For pixel-perfect scaling
}

// Pane setup with optimized z-index
map.createPane("areas");
map.getPane("areas").style.zIndex = 450;
map.createPane("effects");
map.getPane("effects").style.zIndex = 650;
map.getPane("effects").style.pointerEvents = "none";
map.createPane("tools");
map.getPane("tools").style.zIndex = 620;

// Use Canvas renderer for better performance with many features
const areasRenderer = L.canvas({ pane: "areas", padding: 0.5 });
const markerRenderer = L.canvas({ padding: 0.3 }); // For markers too

// Layers
const Cities = L.layerGroup().addTo(map);
const Towns = L.layerGroup().addTo(map);
const Ruins = L.layerGroup().addTo(map);
const POI = L.layerGroup().addTo(map);
const Kingdoms = L.layerGroup().addTo(map);

L.control
  .layers(
    null,
    { Cities, Towns, Ruins, POI, Kingdoms },
    { collapsed: false, position: "topleft" }
  )
  .addTo(map);

// Geoman with performance settings
map.whenReady(() => {
  if (map.pm && typeof map.pm.addControls === "function") {
    map.pm.addControls({
      position: "topleft",
      drawPolygon: true,
      drawPolyline: true,
      drawRectangle: true,
      drawMarker: false,
      drawCircle: false,
      drawCircleMarker: false,
      editMode: true,
      removalMode: true,
    });
    // Disable continuous mode for better performance
    map.pm.setGlobalOptions({ continueDrawing: false });
  }
});

// Optimized polygon creation handler
let isDrawing = false;
map.on("pm:drawstart", () => {
  isDrawing = true;
});
map.on("pm:drawend", () => {
  isDrawing = false;
});

map.on("pm:create", (e) => {
  if (e.shape !== "Polygon" || !e.layer) return;

  const latlngs = e.layer.getLatLngs()[0];
  const coordsYX = latlngs.map((ll) => [
    Math.round(ll.lat),
    Math.round(ll.lng),
  ]);

  console.log(JSON.stringify(coordsYX));

  // Use modern clipboard API with fallback
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(JSON.stringify(coordsYX)).catch(() => {});
  }

  const baseStyle = AREA_BASE_STYLE;
  const hoverStyle = {
    fillOpacity: Math.min((baseStyle.fillOpacity || 0) + 0.2, 0.9),
  };

  e.layer.remove();
  const poly = L.polygon(latlngs, {
    ...baseStyle,
    renderer: areasRenderer,
  }).addTo(Kingdoms);

  // Use passive event listeners for better performance
  poly.on("mouseover", () => poly.setStyle(hoverStyle), { passive: true });
  poly.on("mouseout", () => poly.setStyle(baseStyle), { passive: true });
});

// Pre-create and reuse icon instances
const iconCache = new Map();
function createIcon(type, className, html, size) {
  const key = `${type}-${size}`;
  if (iconCache.has(key)) return iconCache.get(key);

  const icon = L.divIcon({
    className,
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -Math.round(size * 0.45)],
  });

  iconCache.set(key, icon);
  return icon;
}

// Optimized icon creation
const CityIcon = L.divIcon({
  className: "skz-divicon-diamond",
  html: "<span class='gem' aria-hidden='true'></span>",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -12],
});

const TownIcon = createIcon("town", "pin pin--town", "<span></span>", 24);
const RuinIcon = createIcon("ruin", "pin pin--ruin", "<span></span>", 18);
const POIIcon = createIcon("poi", "pin pin--poi", "<span></span>", 18);
const KingdomIcon = createIcon(
  "kingdom",
  "pin pin--kingdom",
  "<span></span>",
  16
);

// Optimized spotlight icon
const SpotIcon = L.divIcon({
  className: "skz-burst",
  iconSize: [96, 96],
  iconAnchor: [48, 48],
  html: `<svg viewBox="0 0 100 100" aria-hidden="true">
    <g class="rays">
      ${Array.from({ length: 12 }, (_, i) => {
        const a = i * 30;
        return `<rect x="49" y="8" width="2" height="26" rx="1" transform="rotate(${a} 50 50)"></rect>`;
      }).join("")}
    </g>
    <circle class="ring" cx="50" cy="50" r="14"></circle>
    <circle class="flash" cx="50" cy="50" r="4"></circle>
  </svg>`,
});

// Lookups and storage
const layersByName = { Cities, Towns, Ruins, POI, Kingdoms };
const iconsByType = {
  city: CityIcon,
  town: TownIcon,
  ruin: RuinIcon,
  poi: POIIcon,
  kingdom: KingdomIcon,
};
const markerById = new Map();
const polygonById = new Map();

// Kingdom polygon styles
const AREA_BASE_STYLE = {
  color: "#d7c38b",
  weight: 2,
  fillColor: "#d7c38b",
  fillOpacity: 0,
  pane: "areas",
  // Performance optimizations
  smoothFactor: 2.0, // Increase for better performance
  noClip: false,
};

function buildAreaBaseStyle(p) {
  const base = { ...AREA_BASE_STYLE };
  if (p.stroke) base.color = p.stroke;
  if (p.fill) base.fillColor = p.fill;
  if (typeof p.fillOpacity === "number") base.fillOpacity = p.fillOpacity;
  if (typeof p.weight === "number") base.weight = p.weight;
  return base;
}

function buildAreaHoverStyle(p, baseStyle) {
  const baseOp =
    typeof baseStyle.fillOpacity === "number" ? baseStyle.fillOpacity : 0;
  return { fillOpacity: Math.min(baseOp + 0.2, 0.9) };
}

// Optimized data loading with better error handling
let places = [];
async function loadPlaces() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const res = await fetch("../data/places.json", {
      cache: "no-cache",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

    const data = await res.json();
    const raw = Array.isArray(data) ? data : data.places || [];

    places = raw.map((p) => ({
      ...p,
      type: (p.type || "").toLowerCase().trim(),
      layer: (p.layer || "").trim(),
    }));

    // Batch process places for better performance
    requestAnimationFrame(() => {
      places.forEach(addPlace);
      applyZoomVisibility();
      cullMarkersInView();
      if (typeof renderList === "function") renderList(places);
    });
  } catch (err) {
    if (err.name === "AbortError") {
      console.error("Request timeout loading places.json");
    } else {
      console.error("Failed to load ../data/places.json", err);
    }
  }
}

// Optimized place creation
function addPlace(p) {
  const layer = layersByName[p.layer] || map;
  const icon = iconsByType[p.type] || CityIcon;

  const m = L.marker([p.y, p.x], {
    title: p.name,
    icon,
    keyboard: false,
    bubblingMouseEvents: false,
    riseOnHover: false,
    // Use canvas renderer for better performance
    renderer: markerRenderer,
  }).addTo(layer);

  // Optimize popup content creation
  const url =
    p.href && p.href !== "#" ? new URL(p.href, document.baseURI).href : null;
  const popupContent = `<div class="skz-popup">
    <div class="t">${p.name}</div>
    <div class="d">${p.desc || ""}</div>
    ${
      url
        ? `<a href="${url}" target="_blank" rel="noopener">Open page →</a>`
        : ""
    }
  </div>`;

  m.bindPopup(popupContent, {
    className: "skz-popup-wrap",
    maxWidth: 280,
    autoPan: false,
  });

  // Optimize tooltip binding
  const wantsLabel = p.label || ["town", "poi", "kingdom"].includes(p.type);
  if (wantsLabel) {
    const labelClass = `skz-label skz-label--${p.type || "other"}`;
    m.bindTooltip(p.name, {
      permanent: true,
      direction: "top",
      className: labelClass,
    });
  }

  // Kingdom polygon with optimizations
  if (p.type === "kingdom" && Array.isArray(p.area) && p.area.length >= 3) {
    const baseStyle = buildAreaBaseStyle(p);
    const hoverStyle = buildAreaHoverStyle(p, baseStyle);

    const poly = L.polygon(p.area, {
      ...baseStyle,
      renderer: areasRenderer,
      smoothFactor: 2.0, // Higher for better performance
      interactive: false,
      pmIgnore: true,
      bubblingMouseEvents: false,
    }).addTo(Kingdoms);

    polygonById.set(p.id, poly);

    // Use passive event listeners
    const hlOn = () => poly.setStyle(hoverStyle);
    const hlOff = () => poly.setStyle(baseStyle);

    m.on("mouseover", hlOn, { passive: true });
    m.on("focus", hlOn, { passive: true });
    m.on("popupopen", hlOn, { passive: true });
    m.on("mouseout", hlOff, { passive: true });
    m.on("blur", hlOff, { passive: true });
    m.on("popupclose", hlOff, { passive: true });
  }

  markerById.set(p.id, m);
  return m;
}

// Optimized visibility logic with early returns
function isVisibleAtZoom(p, z) {
  const threshold = VIS_Z[p.type];
  return threshold == null || z >= threshold;
}

function setPlaceVisible(p, z) {
  const group = layersByName[p.layer] || map;
  const marker = markerById.get(p.id);
  if (!marker) return;

  if (p.type === "kingdom") {
    const pinOn = z >= KV_Z.pinMin && z < KV_Z.pinMax;
    const areaOn = z >= KV_Z.areaMin;
    const poly = polygonById.get(p.id);

    // Batch layer operations
    if (pinOn !== group.hasLayer(marker)) {
      pinOn ? group.addLayer(marker) : group.removeLayer(marker);
    }

    if (poly && areaOn !== Kingdoms.hasLayer(poly)) {
      areaOn ? Kingdoms.addLayer(poly) : Kingdoms.removeLayer(poly);
    }
    return;
  }

  const shouldBeVisible = isVisibleAtZoom(p, z);
  const isVisible = group.hasLayer(marker);

  if (shouldBeVisible !== isVisible) {
    shouldBeVisible ? group.addLayer(marker) : group.removeLayer(marker);
  }
}

function applyZoomVisibility() {
  const z = map.getZoom();
  // Batch operations by grouping similar visibility changes
  places.forEach((p) => setPlaceVisible(p, z));
}

// Heavily optimized viewport culling with spatial indexing
let _cullRAF = 0;
let lastBounds = null;
const CULL_THRESHOLD = 0.1; // Only update if bounds changed significantly

function cullMarkersInView() {
  if (_cullRAF) return;

  _cullRAF = requestAnimationFrame(() => {
    _cullRAF = 0;

    const currentBounds = map.getBounds();

    // Skip if bounds haven't changed much
    if (
      lastBounds &&
      boundsAreSimilar(lastBounds, currentBounds, CULL_THRESHOLD)
    ) {
      return;
    }
    lastBounds = currentBounds;

    const z = map.getZoom();
    const pad = 0.2;
    const view = currentBounds.pad(pad);

    // Batch operations
    const operations = [];

    for (const p of places) {
      const marker = markerById.get(p.id);
      if (!marker) continue;

      // Check zoom visibility first (cheaper)
      let zoomOn = isVisibleAtZoom(p, z);
      if (p.type === "kingdom") {
        zoomOn = z >= KV_Z.pinMin && z < KV_Z.pinMax;
      }

      const group = layersByName[p.layer] || map;
      const onMap = group.hasLayer(marker);

      if (!zoomOn) {
        if (onMap) operations.push({ action: "remove", group, marker });
        continue;
      }

      const shouldBeVisible = view.contains(marker.getLatLng());

      if (shouldBeVisible && !onMap) {
        operations.push({ action: "add", group, marker });
      } else if (!shouldBeVisible && onMap) {
        operations.push({ action: "remove", group, marker });
      }
    }

    // Execute batched operations
    operations.forEach(({ action, group, marker }) => {
      action === "add" ? group.addLayer(marker) : group.removeLayer(marker);
    });
  });
}

function boundsAreSimilar(bounds1, bounds2, threshold) {
  const sw1 = bounds1.getSouthWest();
  const ne1 = bounds1.getNorthEast();
  const sw2 = bounds2.getSouthWest();
  const ne2 = bounds2.getNorthEast();

  return (
    Math.abs(sw1.lat - sw2.lat) < threshold &&
    Math.abs(sw1.lng - sw2.lng) < threshold &&
    Math.abs(ne1.lat - ne2.lat) < threshold &&
    Math.abs(ne1.lng - ne2.lng) < threshold
  );
}

// Optimized drag handling
let dragPointerEvents = true;
const markerPane = map.getPane("markerPane");
const tooltipPane = map.getPane("tooltipPane");

map.on("dragstart", () => {
  if (dragPointerEvents) {
    dragPointerEvents = false;
    if (markerPane) markerPane.style.pointerEvents = "none";
    if (tooltipPane) tooltipPane.style.pointerEvents = "none";
  }
});

map.on("dragend", () => {
  if (!dragPointerEvents) {
    dragPointerEvents = true;
    if (markerPane) markerPane.style.pointerEvents = "";
    if (tooltipPane) tooltipPane.style.pointerEvents = "";
  }
  cullMarkersInView();
});

// Optimized search with debouncing
const $search = document.getElementById("skz-search");
const $list = document.getElementById("skz-list");

function renderList(items) {
  // Use DocumentFragment for better performance
  const fragment = document.createDocumentFragment();

  items.forEach((p) => {
    const li = document.createElement("li");
    li.dataset.id = p.id;
    li.innerHTML = `
      <span class="n">${p.name}</span>
      <span class="c">${p.layer}</span>
    `;
    fragment.appendChild(li);
  });

  $list.textContent = ""; // Clear faster than innerHTML
  $list.appendChild(fragment);
}

// Debounced search
let searchTimeout = null;
$search.addEventListener(
  "input",
  () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const q = $search.value.trim().toLowerCase();
      const filtered = !q
        ? places
        : places.filter((p) => {
            const searchText = `${p.name} ${p.desc || ""} ${
              p.layer
            }`.toLowerCase();
            return searchText.includes(q);
          });
      renderList(filtered);
    }, 150); // 150ms debounce
  },
  { passive: true }
);

// Rest of the code remains the same but with passive event listeners where applicable
function requiredZoomFor(p) {
  if (p.type === "kingdom") {
    const { pinMin, pinMax } = KV_Z;
    return pinMin + (pinMax - pinMin) * 0.4;
  }
  const z = VIS_Z[p.type];
  return z == null ? map.getZoom() : z;
}

let _spotMarker = null;
function spawnSpotlight(latlng) {
  if (_spotMarker) {
    map.removeLayer(_spotMarker);
    _spotMarker = null;
  }
  _spotMarker = L.marker(latlng, {
    icon: SpotIcon,
    interactive: false,
    pane: "effects",
  }).addTo(map);
  setTimeout(() => {
    if (_spotMarker) {
      map.removeLayer(_spotMarker);
      _spotMarker = null;
    }
  }, 2700);
}

function flyToWithHeadroom(latlng, zoom) {
  const z = zoom ?? map.getZoom();
  const px = Math.min(220, Math.max(120, Math.round(map.getSize().y * 0.22)));
  const pt = map.project(latlng, z);
  const adjusted = L.point(pt.x, pt.y + px);
  const ll = map.unproject(adjusted, z);
  map.flyTo(ll, z);
}

// Optimized list click handler
$list.addEventListener(
  "click",
  (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li) return;

    const p = places.find((x) => x.id === li.dataset.id);
    if (!p) return;

    const group = layersByName[p.layer];
    if (group && !map.hasLayer(group)) map.addLayer(group);

    const targetZ = Math.max(map.getZoom(), requiredZoomFor(p));
    const target = [p.y, p.x];

    setPlaceVisible(p, targetZ);

    const afterMove = () => {
      map.off("moveend", afterMove);
      cullMarkersInView();
      const m = markerById.get(p.id);
      if (m) m.openPopup();
      spawnSpotlight(target);
    };
    map.once("moveend", afterMove);

    flyToWithHeadroom(target, targetZ);
  },
  { passive: true }
);

// Optimized label scaling
const FREEZE_Z = 2,
  STATIC_SCALE = 0.7;
let scaleUpdateRAF = 0;

function updateFrozenLabelScale() {
  if (scaleUpdateRAF) return;

  scaleUpdateRAF = requestAnimationFrame(() => {
    scaleUpdateRAF = 0;
    const z = map.getZoom();
    let scale = 1;

    if (z < FREEZE_Z) {
      const mapScale = map.getZoomScale(z, FREEZE_Z);
      scale = STATIC_SCALE / mapScale;
    }

    document.documentElement.style.setProperty(
      "--skz-freeze-scale",
      scale.toFixed(3)
    );
  });
}

// Event handlers with optimizations
map.on("zoomend viewreset", () => {
  updateFrozenLabelScale();
  applyZoomVisibility();
  cullMarkersInView();
});

map.on("zoomlevelschange", () => {
  recomputeVisZ();
  applyZoomVisibility();
  cullMarkersInView();
});

// Throttled move handler
let moveTimeout = null;
map.on("move", () => {
  clearTimeout(moveTimeout);
  moveTimeout = setTimeout(cullMarkersInView, 100);
});

map.on("overlayadd overlayremove", cullMarkersInView);

// Initialize
map.whenReady(() => {
  updateFrozenLabelScale();
  cullMarkersInView();
  loadPlaces();

  // Pre-warm zoom pipeline
  const z = map.getZoom(),
    step = 0.5;
  map.setZoom(z + step, { animate: false });
  map.setZoom(z, { animate: false });
});

// Optimized coordinate logging
map.on(
  "click",
  (e) => {
    if (isDrawing) return;
    console.log("y, x =", Math.round(e.latlng.lat), Math.round(e.latlng.lng));
  },
  { passive: true }
);

/* =======================================================================
   === RULER (distance measure) — minimal, no naming collisions ===
   ======================================================================= */

// Holder for ruler artifacts (no pane option here—children set their own pane)
const RM_layer = L.layerGroup().addTo(map);

const RM = {
  active: false,
  pts: [],
  temp: null, // preview polyline (last point → cursor)
  line: null, // committed polyline (all points)
  label: null, // total length tooltip
  renderer: L.canvas({ pane: "tools", padding: 0.2 }),
  // ---- SCALE: change this to your world scale ----
  // unitsPerPx = miles per image-pixel (CRS.Simple)
  scale: { unitsPerPx: 1.9, unit: "miles" }, // ← adjust to your map
};

function rmSetScale(unitsPerPx, unitLabel) {
  const v = Number(unitsPerPx);
  if (!isFinite(v) || v <= 0) return;
  RM.scale.unitsPerPx = v;
  if (unitLabel) RM.scale.unit = String(unitLabel);
  if (RM.label) {
    const totalPx = rmTotalLen();
    RM.label.setContent(rmFormat(totalPx));
  }
}

function rmFormat(px) {
  const u = RM.scale.unitsPerPx;
  const unit = RM.scale.unit || "units";
  if (!u || u <= 0) return `${Math.round(px)} px`;
  const val = px * u;
  const pretty =
    val >= 100 ? Math.round(val) : val >= 10 ? val.toFixed(1) : val.toFixed(2);
  return `${Math.round(px)} px • ${pretty} ${unit}`;
}

function rmTotalLen(withCursor) {
  let total = 0;
  const arr = RM.pts.slice();
  if (withCursor) arr.push(withCursor);
  for (let i = 1; i < arr.length; i++) {
    const a = arr[i - 1],
      b = arr[i];
    total += Math.hypot(b.lat - a.lat, b.lng - a.lng);
  }
  return total;
}

function rmReset() {
  RM.pts = [];
  if (RM.temp) {
    RM.temp.remove();
    RM.temp = null;
  }
  if (RM.line) {
    RM.line.remove();
    RM.line = null;
  }
  if (RM.label) {
    RM.label.remove();
    RM.label = null;
  }
}

function rmUpdatePreview(cursorLL) {
  if (!RM.pts.length) return;
  const pts = RM.pts.slice();
  if (cursorLL) pts.push(cursorLL);

  if (RM.temp) RM.temp.setLatLngs(pts);
  else {
    RM.temp = L.polyline(pts, {
      color: "#ffd780",
      weight: 2,
      dashArray: "4,6",
      pane: "tools",
      renderer: RM.renderer,
    }).addTo(RM_layer);
  }

  const totalPx = rmTotalLen(cursorLL);
  const labelAt = cursorLL || RM.pts[RM.pts.length - 1];
  if (RM.label) {
    RM.label.setLatLng(labelAt).setContent(rmFormat(totalPx));
  } else {
    RM.label = L.tooltip({
      permanent: true,
      direction: "right",
      offset: [8, 0],
      pane: "tools",
      className: "rm-label",
    })
      .setContent(rmFormat(totalPx))
      .setLatLng(labelAt)
      .addTo(map); // <-- tooltips must be added to MAP, not a layerGroup
  }
}

function rmCommitPoint(ll) {
  RM.pts.push(ll);
  if (RM.line) RM.line.setLatLngs(RM.pts);
  else {
    RM.line = L.polyline(RM.pts, {
      color: "#ffd780",
      weight: 2,
      pane: "tools",
      renderer: RM.renderer,
    }).addTo(RM_layer);
  }
}

function rmOnMouseMove(e) {
  if (!RM.active) return;
  if (RM.pts.length) rmUpdatePreview(e.latlng);
}

function rmOnClick(e) {
  if (!RM.active) return;
  if (e.originalEvent) {
    if (typeof e.originalEvent.preventDefault === "function")
      e.originalEvent.preventDefault();
    if (typeof e.originalEvent.stopPropagation === "function")
      e.originalEvent.stopPropagation();
  }
  rmCommitPoint(e.latlng);
  rmUpdatePreview(null);
}

function rmOnUndo(e) {
  if (!RM.active) return;
  e.preventDefault();
  if (!RM.pts.length) return;
  RM.pts.pop();
  if (!RM.pts.length) {
    rmReset();
  } else {
    if (RM.line) RM.line.setLatLngs(RM.pts);
    rmUpdatePreview(null);
  }
}

function rmOnFinish() {
  if (!RM.active) return;
  if (RM.temp) {
    RM.temp.remove();
    RM.temp = null;
  } // keep final line+label
  rmToggle(false);
}

let _dblWasEnabled = map.doubleClickZoom.enabled();

function rmToggle(forceOn) {
  const turnOn = forceOn === true || (forceOn !== false && !RM.active);
  if (turnOn) {
    RM.active = true;
    rmReset();
    _dblWasEnabled = map.doubleClickZoom.enabled();
    map.doubleClickZoom.disable();
    map.getContainer().classList.add("is-measuring");
    map.on("mousemove", rmOnMouseMove);
    map.on("click", rmOnClick);
    map.on("contextmenu", rmOnUndo);
    map.on("dblclick", rmOnFinish);
    document.addEventListener("keydown", rmEsc);
  } else {
    RM.active = false;
    if (_dblWasEnabled) map.doubleClickZoom.enable();
    else map.doubleClickZoom.disable();
    map.getContainer().classList.remove("is-measuring");
    map.off("mousemove", rmOnMouseMove);
    map.off("click", rmOnClick);
    map.off("contextmenu", rmOnUndo);
    map.off("dblclick", rmOnFinish);
    document.removeEventListener("keydown", rmEsc);
  }
}

function rmEsc(ev) {
  if (ev.key === "Escape") {
    rmReset();
    rmToggle(false);
  }
}

// Small toggle control (📏) + right-click to set scale
const MeasureControl = L.Control.extend({
  options: { position: "topleft" },
  onAdd() {
    const c = L.DomUtil.create("div", "leaflet-bar rm-ctrl");
    const a = L.DomUtil.create("a", "", c);
    a.href = "#";
    a.title = "Measure distance (click to toggle)\nRight-click: set scale";
    a.textContent = "📏";
    L.DomEvent.on(a, "click", (e) => {
      L.DomEvent.stop(e);
      const willEnable = !RM.active;
      rmToggle(willEnable);
      c.classList[willEnable ? "add" : "remove"]("active");
    });
    // Right-click → quick scale prompt
    L.DomEvent.on(a, "contextmenu", (e) => {
      L.DomEvent.stop(e);
      const current = `${RM.scale.unitsPerPx} ${RM.scale.unit}`;
      const resp = prompt(
        'Enter scale as "<milesPerPx> <unit>"\nExample: 0.1 miles',
        current
      );
      if (!resp) return;
      const parts = resp.trim().split(/\s+/);
      const val = parseFloat(parts[0]);
      const unit = parts.slice(1).join(" ") || RM.scale.unit;
      rmSetScale(val, unit);
      scaleBar._update();
    });
    return c;
  },
});
map.addControl(new MeasureControl());

// == Fixed-width scalebar: constant pixels, changing value ==
const ScaleBar = L.Control.extend({
  options: {
    position: "bottomleft",
    pxWidth: 200, // << fixed visual width in CSS pixels
    maxFracDigitsSmall: 2, // formatting for small numbers
    maxFracDigitsMedium: 1, // formatting for mid-range numbers
  },
  onAdd(map) {
    this._map = map;
    this._el = L.DomUtil.create("div", "leaflet-control skz-scale");
    this._bar = L.DomUtil.create("div", "skz-scale__bar", this._el);
    this._lab = L.DomUtil.create("div", "skz-scale__label", this._el);

    // fixed visual width
    this._bar.style.width = this.options.pxWidth + "px";

    L.DomEvent.disableClickPropagation(this._el);
    map.on("zoomend viewreset resize", () => this._update());
    this._update();
    return this._el;
  },
  _update() {
    // units per *image* pixel (your custom scale)
    const uPerImgPx = RM.scale?.unitsPerPx ?? 1;

    // how many CSS screen px per image px at current zoom
    const screenPerImg = this._map.getZoomScale(this._map.getZoom(), 0);

    // units per CSS screen px
    const uPerScreenPx = uPerImgPx / screenPerImg;

    // total units represented by the fixed-width bar
    const units = this.options.pxWidth * uPerScreenPx;

    this._lab.textContent = `${formatUnits(units, this.options)} ${
      RM.scale?.unit || "units"
    }`;
  },
});

// friendly formatting with ~2–3 sig figs (no scientific notation)
function formatUnits(value, opts) {
  const abs = Math.abs(value);
  const nf = (maxFrac) =>
    new Intl.NumberFormat(undefined, {
      maximumFractionDigits: maxFrac,
      useGrouping: true,
    });

  if (abs < 1) return nf(3).format(value);
  if (abs < 10) return nf(opts.maxFracDigitsSmall).format(value); // e.g., 2.34
  if (abs < 100) return nf(opts.maxFracDigitsMedium).format(value); // e.g., 23.4
  return nf(0).format(value); // e.g., 234
}

const scaleBar = new ScaleBar().addTo(map);

// expose programmatic setter (updates scalebar too)
window.Skazka = window.Skazka || {};
window.Skazka.setRulerScale = function (uPerPx, unit) {
  rmSetScale(uPerPx, unit);
  scaleBar._update();
};
