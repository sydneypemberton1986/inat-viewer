// src/range_viewer.ts
var RANGE_TILE_URL = "https://tiles.inaturalist.org/v1/taxon_ranges/{id}/{z}/{x}/{y}.png?color={color}";
var GRID_TILE_URL = "https://api.inaturalist.org/v1/grid/{z}/{x}/{y}.png?taxon_id={id}&color={color}";
var REMAINDER_TILE_URL = "https://api.inaturalist.org/v1/grid/{z}/{x}/{y}.png?taxon_id={id}&without_taxon_id={exclude}&color={color}";
var REMAINDER_COLOR = "#9aa0a6";
var API = "https://api.inaturalist.org/v1";
var PALETTE_LIGHTNESS = 0.7;
var PALETTE_CHROMA = 0.15;
var PALETTE_START_HUE = 25;
var MAX_CHILDREN = 12;
function oklchToHex(lightness, chroma, hueDegrees) {
  const hueRadians = hueDegrees * Math.PI / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return "#" + [lr, lg, lb].map(linearToHexChannel).join("");
}
function linearToHexChannel(value) {
  const encoded = value <= 31308e-7 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  const byte = Math.round(Math.min(1, Math.max(0, encoded)) * 255);
  return byte.toString(16).padStart(2, "0");
}
function generatePalette(count) {
  if (count <= 0) return [];
  const step = 360 / count;
  const palette = [];
  for (let i = 0; i < count; i++) {
    palette.push(oklchToHex(PALETTE_LIGHTNESS, PALETTE_CHROMA, PALETTE_START_HUE + i * step));
  }
  return palette;
}
var map = L.map("map", { worldCopyJump: true }).setView([15, -30], 3);
var esriAttribution = "Tiles &copy; Esri";
var grayBase = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 16,
  attribution: esriAttribution
});
var grayLabels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 16,
  attribution: ""
});
var light = L.layerGroup([grayBase, grayLabels]);
var streets = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19,
  attribution: esriAttribution
});
var satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 18,
  attribution: esriAttribution
});
light.addTo(map);
L.control.layers({ "Light": light, "Street map": streets, "Satellite": satellite }, null, { position: "topleft" }).addTo(map);
map.createPane("inatRemainderPane");
map.getPane("inatRemainderPane").style.zIndex = "390";
map.getPane("inatRemainderPane").style.pointerEvents = "none";
map.createPane("inatPane");
map.getPane("inatPane").style.zIndex = "400";
map.getPane("inatPane").style.pointerEvents = "none";
var currentMode = "observations";
var overlayOpacity = 0.65;
var wildOnly = false;
var researchOnly = false;
var HIGHLIGHT_OPACITY = 0.95;
var DIMMED_OPACITY = 0.1;
var entries = [];
var currentTaxon = null;
var childOffset = 0;
function setStatus(msg) {
  document.getElementById("status").innerText = msg || "";
}
function parseTaxonInput(raw) {
  const text = raw.trim();
  if (!text) return null;
  const urlMatch = text.match(/taxa\/(\d+)/);
  if (urlMatch) return { id: parseInt(urlMatch[1], 10) };
  if (/^\d+$/.test(text)) return { id: parseInt(text, 10) };
  return { query: text };
}
async function resolveTaxonId(parsed) {
  if (parsed.id) return parsed.id;
  const res = await fetch(`${API}/taxa/autocomplete?q=${encodeURIComponent(parsed.query)}&per_page=1`);
  const data = await res.json();
  if (!data.results || data.results.length === 0) return null;
  return data.results[0].id;
}
var AUTOCOMPLETE_DEBOUNCE_MS = 220;
var AUTOCOMPLETE_LIMIT = 8;
var suggestionItems = [];
var activeSuggestion = -1;
var suggestionTimer = null;
function onSearchInput() {
  const text = document.getElementById("taxonInput").value.trim();
  if (suggestionTimer) clearTimeout(suggestionTimer);
  if (!text || /^\d+$/.test(text) || /taxa\/\d+/.test(text)) {
    hideSuggestions();
    return;
  }
  suggestionTimer = setTimeout(() => fetchSuggestions(text), AUTOCOMPLETE_DEBOUNCE_MS);
}
async function fetchSuggestions(query) {
  try {
    const res = await fetch(`${API}/taxa/autocomplete?q=${encodeURIComponent(query)}&per_page=${AUTOCOMPLETE_LIMIT}`);
    const data = await res.json();
    if (document.getElementById("taxonInput").value.trim() !== query) return;
    renderSuggestions(data.results || []);
  } catch (err) {
    console.warn("autocomplete request failed", err);
  }
}
function suggestionRowMarkup(item) {
  const photo = item.default_photo && item.default_photo.square_url;
  const img = photo ? `<img src="${photo}" alt="">` : '<img alt="">';
  const common = item.preferred_common_name ? ` \u2014 ${item.preferred_common_name}` : "";
  const count = item.observations_count != null ? ` \xB7 ${item.observations_count.toLocaleString()} obs` : "";
  return `${img}<span class="s-text"><span class="s-name"><em>${item.name}</em>${common}</span><span class="s-meta">${item.rank}${count}</span></span>`;
}
function renderSuggestions(items) {
  suggestionItems = items;
  activeSuggestion = -1;
  const ul = document.getElementById("suggestions");
  if (!items.length) {
    hideSuggestions();
    return;
  }
  ul.innerHTML = "";
  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.innerHTML = suggestionRowMarkup(item);
    li.addEventListener("click", () => selectSuggestion(index));
    ul.appendChild(li);
  });
  ul.hidden = false;
}
function hideSuggestions() {
  suggestionItems = [];
  activeSuggestion = -1;
  const ul = document.getElementById("suggestions");
  ul.hidden = true;
  ul.innerHTML = "";
}
function selectSuggestion(index) {
  const item = suggestionItems[index];
  if (!item) return;
  document.getElementById("taxonInput").value = item.name;
  hideSuggestions();
  loadTaxonById(item.id);
}
function moveActiveSuggestion(delta) {
  const ul = document.getElementById("suggestions");
  const count = suggestionItems.length;
  if (!count) return;
  activeSuggestion = (activeSuggestion + delta + count) % count;
  Array.from(ul.children).forEach((li, i) => li.classList.toggle("active", i === activeSuggestion));
  ul.children[activeSuggestion].scrollIntoView({ block: "nearest" });
}
function onSearchKeydown(event) {
  const open = !document.getElementById("suggestions").hidden && suggestionItems.length > 0;
  if (open && event.key === "ArrowDown") {
    event.preventDefault();
    moveActiveSuggestion(1);
  } else if (open && event.key === "ArrowUp") {
    event.preventDefault();
    moveActiveSuggestion(-1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (open && activeSuggestion >= 0) selectSuggestion(activeSuggestion);
    else loadFromInput();
  } else if (event.key === "Escape") {
    hideSuggestions();
  }
}
function onDocumentMousedown(event) {
  const input = document.getElementById("taxonInput");
  const ul = document.getElementById("suggestions");
  if (event.target === input || ul.contains(event.target)) return;
  hideSuggestions();
}
document.addEventListener("mousedown", onDocumentMousedown);
async function fetchTaxon(id) {
  const res = await fetch(`${API}/taxa/${id}`);
  const data = await res.json();
  return data.results && data.results[0];
}
var MAX_FIT_LAT_SPAN = 130;
var MAX_FIT_LNG_SPAN = 220;
async function fitToTaxon(id) {
  try {
    const res = await fetch(`${API}/observations?taxon_id=${id}&per_page=0&return_bounds=true`);
    const data = await res.json();
    const b = data.total_bounds;
    if (!b || b.swlat == null) return;
    const latSpan = b.nelat - b.swlat;
    const lngSpan = b.nelng - b.swlng;
    if (latSpan > MAX_FIT_LAT_SPAN || lngSpan > MAX_FIT_LNG_SPAN) return;
    map.fitBounds([[b.swlat, b.swlng], [b.nelat, b.nelng]], { padding: [20, 20] });
  } catch (err) {
    console.warn("bounds lookup failed", err);
  }
}
function observationFilterParams() {
  const params = [];
  if (researchOnly) params.push("quality_grade=research");
  if (wildOnly) params.push("captive=false");
  return params.length ? "&" + params.join("&") : "";
}
function tileUrlFor(entry) {
  if (entry.isRemainder) {
    if (currentMode !== "observations") return null;
    return REMAINDER_TILE_URL.replace("{id}", entry.id).replace("{exclude}", entry.exclude).replace("{color}", encodeURIComponent(entry.color)) + observationFilterParams();
  }
  if (currentMode === "range") {
    return RANGE_TILE_URL.replace("{id}", entry.id).replace("{color}", encodeURIComponent(entry.color));
  }
  return GRID_TILE_URL.replace("{id}", entry.id).replace("{color}", encodeURIComponent(entry.color)) + observationFilterParams();
}
function makeLayer(entry) {
  const url = tileUrlFor(entry);
  if (!url) return null;
  return L.tileLayer(url, {
    pane: entry.isRemainder ? "inatRemainderPane" : "inatPane",
    opacity: overlayOpacity,
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.inaturalist.org">iNaturalist</a>'
  });
}
function addEntryLayer(entry) {
  if (entry.layer) return;
  const layer = makeLayer(entry);
  if (!layer) return;
  entry.layer = layer;
  layer.addTo(map);
}
function removeEntryLayer(entry) {
  if (!entry.layer) return;
  map.removeLayer(entry.layer);
  entry.layer = null;
}
function refreshLayers() {
  for (const entry of entries) {
    removeEntryLayer(entry);
    if (entry.enabled) addEntryLayer(entry);
  }
}
function toggleEntry(index, checked) {
  const entry = entries[index];
  entry.enabled = checked;
  if (checked) addEntryLayer(entry);
  else removeEntryLayer(entry);
}
function setMode(mode) {
  currentMode = mode;
  document.getElementById("modeNote").innerText = mode === "range" ? "Range polygons exist mainly at species level. Children without a range on file (often subspecies) show nothing here \u2014 switch to Observations to see them." : "Observation grid, colored per child taxon. Denser cells = more observations. This mode reaches subspecies.";
  renderLegend();
  refreshLayers();
}
function setWildOnly(checked) {
  wildOnly = checked;
  refreshLayers();
}
function setResearchOnly(checked) {
  researchOnly = checked;
  refreshLayers();
}
function setOpacity(val) {
  overlayOpacity = val / 100;
  document.getElementById("opacityVal").innerText = val;
  for (const entry of entries) {
    if (entry.layer) entry.layer.setOpacity(overlayOpacity);
  }
}
function highlightEntry(index) {
  entries.forEach((entry, i) => {
    if (entry.layer) entry.layer.setOpacity(i === index ? HIGHLIGHT_OPACITY : DIMMED_OPACITY);
  });
  const target = entries[index];
  if (target && target.layer && target.layer.bringToFront) target.layer.bringToFront();
}
function clearHighlight() {
  for (const entry of entries) {
    if (entry.layer) entry.layer.setOpacity(overlayOpacity);
  }
}
function renderBreadcrumb(taxon) {
  const el = document.getElementById("breadcrumb");
  const ancestors = taxon.ancestors || [];
  if (!ancestors.length) {
    el.innerHTML = "";
    return;
  }
  const parent = ancestors[ancestors.length - 1];
  el.innerHTML = `\u2191 <a data-id="${parent.id}">${parent.name}</a> <span class="sep">(${parent.rank})</span>`;
  const link = el.querySelector("a");
  link.addEventListener("click", () => loadTaxonById(parseInt(link.dataset.id, 10)));
}
function legendThumbMarkup(entry) {
  return entry.photo ? `<img class="legend-thumb" src="${entry.photo}" alt="">` : '<span class="legend-thumb"></span>';
}
function legendNameMarkup(entry) {
  if (entry.isRemainder) {
    return `<span class="legend-name"><span class="sci">${entry.name} <span style="color:#9a9a9a">(click to page through)</span></span></span>`;
  }
  const common = entry.common ? `<span class="common">${entry.common}</span>` : "";
  const rankLabel = entry.isParent ? "whole taxon" : entry.rank;
  return `<span class="legend-name"><span class="sci"><em>${entry.name}</em> <span style="color:#9a9a9a">(${rankLabel})</span></span>${common}</span>`;
}
function renderLegend() {
  const legend = document.getElementById("legend");
  legend.innerHTML = "";
  entries.forEach((entry, index) => {
    if (entry.isRemainder && currentMode !== "observations") return;
    const row = document.createElement("div");
    row.className = "legend-item" + (entry.isParent ? " parent" : "");
    const drillable = !entry.isParent && !entry.isRemainder;
    const pageable = entry.isRemainder;
    const title = drillable ? `View ${entry.name}` : pageable ? "Show the next taxa" : "";
    const content = drillable || pageable ? `<button type="button" class="drill" title="${title}">${legendThumbMarkup(entry)}${legendNameMarkup(entry)}</button>` : `<span class="nondrill">${legendThumbMarkup(entry)}${legendNameMarkup(entry)}</span>`;
    row.innerHTML = `<input type="checkbox" ${entry.enabled ? "checked" : ""} data-index="${index}" title="Toggle layer">
             <span class="swatch" style="background:${entry.color}"></span>
             ${content}`;
    row.querySelector("input").addEventListener("change", (e) => toggleEntry(index, e.target.checked));
    const drill = row.querySelector(".drill");
    if (drill) drill.addEventListener("click", () => drillable ? loadTaxonById(entry.id) : pageChildrenForward());
    row.addEventListener("mouseenter", () => highlightEntry(index));
    row.addEventListener("mouseleave", clearHighlight);
    legend.appendChild(row);
  });
  if (childOffset > 0) {
    const resetRow = document.createElement("div");
    resetRow.className = "legend-item";
    resetRow.innerHTML = '<button type="button" class="drill pager-reset">\u21A9 Back to most-observed</button>';
    resetRow.querySelector("button").addEventListener("click", resetChildren);
    legend.appendChild(resetRow);
  }
}
function activeChildrenByObservations(taxon) {
  const children = (taxon.children || []).filter((child) => child.is_active !== false);
  children.sort((a, b) => (b.observations_count || 0) - (a.observations_count || 0));
  return children;
}
function buildEntries(taxon) {
  const parentEntry = {
    id: taxon.id,
    name: taxon.name,
    rank: taxon.rank,
    common: taxon.preferred_common_name || "",
    photo: taxon.default_photo ? taxon.default_photo.square_url : null,
    color: "#555555",
    enabled: false,
    isParent: true,
    layer: null
  };
  const sorted = activeChildrenByObservations(taxon);
  const shown = sorted.slice(childOffset, childOffset + MAX_CHILDREN);
  const palette = generatePalette(shown.length);
  const childEntries = shown.map((child, i) => ({
    id: child.id,
    name: child.name,
    rank: child.rank,
    common: child.preferred_common_name || "",
    photo: child.default_photo ? child.default_photo.square_url : null,
    color: palette[i],
    enabled: true,
    isParent: false,
    layer: null
  }));
  const entries2 = [parentEntry, ...childEntries];
  const remainderCount = sorted.length - shown.length;
  if (remainderCount > 0) {
    entries2.push({
      id: taxon.id,
      exclude: shown.map((child) => child.id).join(","),
      name: `Other ${remainderCount} taxa`,
      rank: "remainder",
      common: "",
      color: REMAINDER_COLOR,
      enabled: true,
      isParent: false,
      isRemainder: true,
      layer: null
    });
  }
  return { entries: entries2, totalActive: sorted.length, shownCount: shown.length };
}
function applyChildWindow() {
  for (const entry of entries) removeEntryLayer(entry);
  const built = buildEntries(currentTaxon);
  entries = built.entries;
  if (built.totalActive === 0) {
    setStatus("This taxon has no child taxa \u2014 showing the taxon itself. Enable it in the legend.");
    entries[0].enabled = true;
  } else if (built.totalActive > built.shownCount || childOffset > 0) {
    const start = childOffset + 1;
    const end = childOffset + built.shownCount;
    setStatus(`Showing ${start}\u2013${end} of ${built.totalActive} child taxa by observations.`);
  } else {
    setStatus(`${built.shownCount} child ${built.shownCount === 1 ? "taxon" : "taxa"} loaded.`);
  }
  renderLegend();
  refreshLayers();
}
function pageChildrenForward() {
  if (!currentTaxon) return;
  const total = activeChildrenByObservations(currentTaxon).length;
  const next = childOffset + MAX_CHILDREN;
  childOffset = next >= total ? 0 : next;
  applyChildWindow();
}
function resetChildren() {
  childOffset = 0;
  applyChildWindow();
}
async function loadTaxonById(id) {
  setStatus("Loading\u2026");
  for (const entry of entries) removeEntryLayer(entry);
  entries = [];
  try {
    const taxon = await fetchTaxon(id);
    if (!taxon) {
      setStatus("Could not load taxon " + id + ".");
      return;
    }
    currentTaxon = taxon;
    childOffset = 0;
    document.getElementById("taxonInput").value = taxon.name;
    renderBreadcrumb(taxon);
    const common = taxon.preferred_common_name ? ` \u2014 ${taxon.preferred_common_name}` : "";
    const titlePhoto = taxon.default_photo ? taxon.default_photo.square_url : null;
    const titleThumb = titlePhoto ? `<img class="legend-thumb" src="${titlePhoto}" alt="">` : '<span class="legend-thumb"></span>';
    document.getElementById("taxonTitle").innerHTML = `${titleThumb}<span><strong><em>${taxon.name}</em></strong> (${taxon.rank})${common}</span>`;
    applyChildWindow();
    await fitToTaxon(id);
  } catch (err) {
    console.error(err);
    setStatus("Error loading taxon: " + err.message);
  }
}
async function loadFromInput() {
  const parsed = parseTaxonInput(document.getElementById("taxonInput").value);
  if (!parsed) {
    setStatus("Enter a taxon name, ID, or URL.");
    return;
  }
  hideSuggestions();
  try {
    const id = await resolveTaxonId(parsed);
    if (!id) {
      setStatus("No taxon found for that search.");
      return;
    }
    await loadTaxonById(id);
  } catch (err) {
    console.error(err);
    setStatus("Error resolving taxon: " + err.message);
  }
}
window.onSearchInput = onSearchInput;
window.onSearchKeydown = onSearchKeydown;
window.loadFromInput = loadFromInput;
window.setMode = setMode;
window.setWildOnly = setWildOnly;
window.setResearchOnly = setResearchOnly;
window.setOpacity = setOpacity;
setMode(currentMode);
loadFromInput();
//# sourceMappingURL=range_viewer.js.map
