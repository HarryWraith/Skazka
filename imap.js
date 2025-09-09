// imap.js — cleaned + polylines re-enabled

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
  maxBoundsViscosity: 0.8,
  preferCanvas: true,
});

// Visibility thresholds (kept exactly)
const VISIBILITY_PCT = {
  ruin: 0.8,
  town: 0.8,
  city: 0.6,
  kingdom: 0.5,
  poi: 0.8,
};
// Kingdom pin/label band + polygon threshold
const KINGDOM_VIS_PCT = { pinMin: 0.3, pinMax: 0.85, areaMin: 0.3 };

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

// Dynamic max bounds (edge zoom comfort)
function refreshMaxBounds() {
  const size = map.getSize();
  const padX = Math.ceil(size.x / 2);
  const padY = Math.ceil(size.y / 2);
  map.setMaxBounds([
    [-padY, -padX],
    [img.height + padY, img.width + padX],
  ]);
}
map.whenReady(refreshMaxBounds);
map.on("resize zoomend", refreshMaxBounds);

const el = overlay.getElement();
if (el) {
  el.decoding = "sync";
  el.loading = "eager";
  try {
    el.fetchPriority = "high";
  } catch {}
  el.style.willChange = "transform";
}

// Pane for area polygons (below markers)
map.createPane("areas");
map.getPane("areas").style.zIndex = 450;

// Pane for area polygons (drawn below markers)
map.createPane("areas");
map.getPane("areas").style.zIndex = 450; // markerPane is ~600

// Use a single Canvas for all kingdom polygons in that pane
const areasRenderer = L.canvas({ pane: "areas", padding: 0.5 });

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

// Geoman toolbar (under layer checkboxes)
map.whenReady(() => {
  if (map.pm && typeof map.pm.addControls === "function") {
    map.pm.addControls({
      position: "topleft",
      drawPolygon: true,
      drawPolyline: true, // ✅ re-enabled
      drawRectangle: true,
      drawMarker: false,
      drawCircle: false,
      drawCircleMarker: false,
      editMode: true,
      removalMode: true,
    });
  }
});

// Export polygon coords on create (for kingdoms)
map.on("pm:create", (e) => {
  if (e.shape !== "Polygon" || !e.layer) return;
  const latlngs = e.layer.getLatLngs()[0];
  const coordsYX = latlngs.map((ll) => [
    Math.round(ll.lat),
    Math.round(ll.lng),
  ]);
  const json = JSON.stringify(coordsYX);
  console.log(json);
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(json).catch(() => {});
  }

  const baseStyle = AREA_BASE_STYLE;
  const hoverStyle = {
    fillOpacity: Math.min((baseStyle.fillOpacity || 0) + 0.2, 0.9),
  };

  e.layer.remove();
  const poly = L.polygon(latlngs, baseStyle).addTo(Kingdoms);
  poly.on("mouseover", () => poly.setStyle(hoverStyle));
  poly.on("mouseout", () => poly.setStyle(baseStyle));
});

let isDrawing = false;
map.on("pm:drawstart", () => {
  isDrawing = true;
});
map.on("pm:drawend", () => {
  isDrawing = false;
});

// Icons
const CityIcon = L.divIcon({
  className: "skz-divicon-diamond",
  html: "<span class='gem' aria-hidden='true'></span>",
  iconSize: [10, 10],
  iconAnchor: [5, 9],
  popupAnchor: [0, -10],
});
const TownIcon = L.divIcon({
  className: "pin pin--town",
  html: "<span></span>",
  iconSize: [10, 10],
  iconAnchor: [5, 5],
  popupAnchor: [0, -8],
});
const RuinIcon = L.divIcon({
  className: "pin pin--ruin",
  html: "<span></span>",
  iconSize: [10, 10],
  iconAnchor: [5, 5],
  popupAnchor: [0, -8],
});
const POIIcon = L.divIcon({
  className: "pin pin--poi",
  html: "<span></span>",
  iconSize: [10, 10],
  iconAnchor: [5, 5],
  popupAnchor: [0, -8],
});
const KingdomIcon = L.divIcon({
  className: "pin pin--kingdom",
  html: "<span></span>",
  iconSize: [10, 10],
  iconAnchor: [5, 5],
  popupAnchor: [0, -8],
});

// Lookups
const layersByName = { Cities, Towns, Ruins, POI, Kingdoms };
const iconsByType = {
  city: CityIcon,
  town: TownIcon,
  ruin: RuinIcon,
  poi: POIIcon,
  kingdom: KingdomIcon,
};

// Storage maps
const markerById = new Map();
const hitById = new Map();
const polygonById = new Map();

// Kingdom polygon styles/helpers
const AREA_BASE_STYLE = {
  color: "#d7c38b",
  weight: 2,
  fillColor: "#d7c38b",
  fillOpacity: 0,
  pane: "areas",
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
    typeof baseStyle.fillOpacity === "number"
      ? baseStyle.fillOpacity
      : AREA_BASE_STYLE.fillOpacity ?? 0;
  return { fillOpacity: Math.min(baseOp + 0.2, 0.9) };
}

// Data load
let places = [];
async function loadPlaces() {
  try {
    const res = await fetch("../data/places.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    const data = await res.json();

    const raw = Array.isArray(data) ? data : data.places || [];
    places = raw.map((p) => ({
      ...p,
      type: (p.type || "").toLowerCase().trim(),
      layer: (p.layer || "").trim(),
    }));

    places.forEach(addPlace);
    applyZoomVisibility();

    if (typeof renderList === "function") renderList(places);
  } catch (err) {
    console.error("Failed to load ../data/places.json", err);
  }
}
loadPlaces();

// Create markers
function addPlace(p) {
  const layer = layersByName[p.layer] || map;
  const icon = iconsByType[p.type] || CityIcon;

  const m = L.marker([p.y, p.x], {
    title: p.name,
    icon,
    riseOnHover: true,
  }).addTo(layer);

  const url =
    p.href && p.href !== "#" ? new URL(p.href, document.baseURI).href : null;
  m.bindPopup(
    '<div class="skz-popup">' +
      '<div class="t">' +
      p.name +
      "</div>" +
      '<div class="d">' +
      (p.desc || "") +
      "</div>" +
      (url
        ? '<a href="' + url + '" target="_blank" rel="noopener">Open page →</a>'
        : "") +
      "</div>",
    { className: "skz-popup-wrap", maxWidth: 280, keepInView: true }
  );

  const wantsLabel =
    p.label || p.type === "town" || p.type === "poi" || p.type === "kingdom";
  if (wantsLabel) {
    const labelClass = `skz-label skz-label--${p.type || "other"}`;
    m.bindTooltip(p.name, {
      permanent: true,
      direction: "top",
      className: labelClass,
    });
  }

  // big invisible hit area for touch
  const hit = L.circleMarker([p.y, p.x], {
    radius: 16,
    stroke: false,
    fillOpacity: 0,
    fillColor: "#000",
    interactive: true,
  }).addTo(layer);
  hit.on("click", () => m.openPopup());
  hit.on("mouseover", () => m.fire("mouseover"));
  hit.on("mouseout", () => m.fire("mouseout"));

  // Kingdom polygon
  if (p.type === "kingdom" && Array.isArray(p.area) && p.area.length >= 3) {
    const baseStyle = buildAreaBaseStyle(p);
    const hoverStyle = buildAreaHoverStyle(p, baseStyle);

    // Canvas renderer + simplification + non-interactive (we highlight via the pin)
    const poly = L.polygon(p.area, {
      ...baseStyle,
      renderer: areasRenderer,
      smoothFactor: 1.5, // reduce vertices at draw time
      interactive: false, // big perf win; we still highlight via the marker
      pmIgnore: true, // don't let Geoman attach handlers unless editing
      bubblingMouseEvents: false,
    }).addTo(Kingdoms);

    polygonById.set(p.id, poly);

    // Keep the highlight wired from the MARKER only
    const hlOn = () => poly.setStyle(hoverStyle);
    const hlOff = () => poly.setStyle(baseStyle);

    m.on("mouseover", hlOn);
    m.on("focus", hlOn);
    m.on("popupopen", hlOn);
    m.on("mouseout", hlOff);
    m.on("blur", hlOff);
    m.on("popupclose", hlOff);

    // (No polygon mouseover/mouseout listeners — we set interactive:false)
  }

  markerById.set(p.id, m);
  hitById.set(p.id, hit);
  return m;
}

// Visibility logic
function isVisibleAtZoom(p, z) {
  const t = VIS_Z[p.type];
  if (t == null) return true;
  return z >= t;
}
function setPlaceVisible(p, z) {
  const group = layersByName[p.layer] || map;
  const marker = markerById.get(p.id);
  const hit = hitById.get(p.id);
  const poly = polygonById.get(p.id);

  if (!marker) return;

  if (p.type === "kingdom") {
    const pinOn = z >= KV_Z.pinMin && z < KV_Z.pinMax;
    const areaOn = z >= KV_Z.areaMin;

    if (pinOn) {
      if (!group.hasLayer(marker)) group.addLayer(marker);
      if (hit && !group.hasLayer(hit)) group.addLayer(hit);
    } else {
      if (group.hasLayer(marker)) group.removeLayer(marker);
      if (hit && group.hasLayer(hit)) group.removeLayer(hit);
    }

    if (poly) {
      if (areaOn && !Kingdoms.hasLayer(poly)) Kingdoms.addLayer(poly);
      if (!areaOn && Kingdoms.hasLayer(poly)) Kingdoms.removeLayer(poly);
    }
    return;
  }

  const on = isVisibleAtZoom(p, z);
  if (on) {
    if (!group.hasLayer(marker)) group.addLayer(marker);
    if (hit && !group.hasLayer(hit)) group.addLayer(hit);
  } else {
    if (group.hasLayer(marker)) group.removeLayer(marker);
    if (hit && group.hasLayer(hit)) group.removeLayer(hit);
  }
}
function applyZoomVisibility() {
  const z = map.getZoom();
  places.forEach((p) => setPlaceVisible(p, z));
}

// === Search / list ===
const $search = document.getElementById("skz-search");
const $list = document.getElementById("skz-list");

function renderList(items) {
  $list.innerHTML = items
    .map(
      (p) => `
    <li data-id="${p.id}">
      <span class="n">${p.name}</span>
      <span class="c">${p.layer}</span>
    </li>
  `
    )
    .join("");
}
renderList(places);

// Pick a zoom inside the kingdom band; otherwise type min
function requiredZoomFor(p) {
  if (p.type === "kingdom") {
    const { pinMin, pinMax } = KV_Z;
    return pinMin + (pinMax - pinMin) * 0.4;
  }
  const z = VIS_Z[p.type];
  return z == null ? map.getZoom() : z;
}

// Search click → ensure layer on, zoom, open popup
$list.addEventListener("click", (e) => {
  const li = e.target.closest("li[data-id]");
  if (!li) return;
  const p = places.find((x) => x.id === li.dataset.id);
  if (!p) return;

  const group = layersByName[p.layer];
  if (group && !map.hasLayer(group)) map.addLayer(group);

  const targetZ = Math.max(map.getZoom(), requiredZoomFor(p));
  const target = [p.y, p.x];

  setPlaceVisible(p, targetZ);

  const openAfterMove = () => {
    map.off("moveend", openAfterMove);
    markerById.get(p.id)?.openPopup();
  };
  map.once("moveend", openAfterMove);
  map.flyTo(target, targetZ);
});

$search.addEventListener("input", () => {
  const q = $search.value.trim().toLowerCase();
  const filtered = !q
    ? places
    : places.filter((p) =>
        (p.name + " " + (p.desc || "") + " " + p.layer)
          .toLowerCase()
          .includes(q)
      );
  renderList(filtered);
});

// Label freeze after zoom
const FREEZE_Z = 2,
  STATIC_SCALE = 0.7;
function updateFrozenLabelScale() {
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
}
map.on("zoomend viewreset", updateFrozenLabelScale);
map.whenReady(updateFrozenLabelScale);

// Pre-warm zoom pipeline
map.whenReady(() => {
  const z = map.getZoom(),
    step = 0.5;
  map.setZoom(z + step, { animate: false });
  map.setZoom(z, { animate: false });
});

// Re-apply visibility on zoom & layer toggles
map.on("zoomend viewreset", applyZoomVisibility);
map.on("zoomlevelschange", () => {
  recomputeVisZ();
  applyZoomVisibility();
});
map.on("overlayadd overlayremove", applyZoomVisibility);

// Helper: click to log coords
map.on("click", (e) => {
  if (isDrawing) return;
  console.log("y, x =", Math.round(e.latlng.lat), Math.round(e.latlng.lng));
});
