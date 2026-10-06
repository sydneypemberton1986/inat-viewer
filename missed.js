// src/missed.ts
var COUNTS_API = "https://api.inaturalist.org/v1/observations/species_counts";
var RADIUS_KM = 100;
var PER_GROUP = 10;
var MONTH = (/* @__PURE__ */ new Date()).getMonth() + 1;
var MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var MONTH_NAME = MONTH_NAMES[MONTH - 1];
var IN_SEASON_SHARE = 0.15;
var GROUPS = [
  ["Aves", "Birds"],
  ["Mammalia", "Mammals"],
  ["Reptilia", "Reptiles"],
  ["Amphibia", "Amphibians"],
  ["Actinopterygii", "Fishes"],
  ["Mollusca", "Mollusks"],
  ["Arachnida", "Arachnids"],
  ["Insecta", "Insects"],
  ["Plantae", "Plants"],
  ["Fungi", "Fungi & Lichens"]
];
function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}
function esc(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}
async function countAt(query) {
  const response = await fetch(COUNTS_API + "?" + query + "&rank=species&per_page=0");
  if (!response.ok) throw new Error("HTTP " + response.status);
  return (await response.json()).total_results || 0;
}
async function topThisMonth(lat, lng, iconic) {
  const query = "lat=" + lat + "&lng=" + lng + "&radius=" + RADIUS_KM + "&iconic_taxa=" + iconic + "&rank=species&per_page=" + PER_GROUP + "&month=" + MONTH;
  const response = await fetch(COUNTS_API + "?" + query);
  if (!response.ok) throw new Error("HTTP " + response.status);
  return (await response.json()).results || [];
}
async function totalsFor(lat, lng, ids) {
  if (!ids.length) return {};
  const query = "lat=" + lat + "&lng=" + lng + "&radius=" + RADIUS_KM + "&taxon_id=" + ids.join(",") + "&rank=species&per_page=" + ids.length;
  const response = await fetch(COUNTS_API + "?" + query);
  if (!response.ok) throw new Error("HTTP " + response.status);
  const totals = {};
  for (const row of (await response.json()).results || []) totals[row.taxon.id] = row.count;
  return totals;
}
async function missingFor(ids, user) {
  if (!ids.length) return /* @__PURE__ */ new Set();
  const query = "taxon_id=" + ids.join(",") + "&unobserved_by_user_id=" + encodeURIComponent(user) + "&rank=species&per_page=" + ids.length;
  const response = await fetch(COUNTS_API + "?" + query);
  if (!response.ok) throw new Error("HTTP " + response.status);
  const missing = /* @__PURE__ */ new Set();
  for (const row of (await response.json()).results || []) missing.add(row.taxon.id);
  return missing;
}
function itemHTML(row, share, missing) {
  const taxon = row.taxon || {};
  const id = taxon.id;
  const have = !missing.has(id);
  const href = "https://www.inaturalist.org/taxa/" + id;
  const common = esc(taxon.preferred_common_name || taxon.name || "?");
  const sci = esc(taxon.name || "");
  const photo = (taxon.default_photo || {}).square_url;
  const mark = have ? "\u2713" : "\u25CB";
  const thumb = photo ? '<img src="' + esc(photo) + '" alt="" loading="lazy">' : "";
  const season = share != null && share >= IN_SEASON_SHARE ? '<span class="bs-season">' + Math.round(share * 100) + "% in " + MONTH_NAME + "</span>" : "";
  const seen = row.count ? '<span class="bs-count">' + row.count.toLocaleString() + "\xD7 here</span>" : "";
  const meta = season || seen ? '<span class="bs-meta">' + season + seen + "</span>" : "";
  return '<li class="bs-item' + (have ? " bs-item-have" : "") + '"><span class="bs-mark" title="' + (have ? "on your life list" : "not recorded yet") + '">' + mark + '</span><a class="bs-link" href="' + href + '" target="_blank" rel="noopener">' + thumb + '<span class="bs-name">' + common + '</span></a><span class="bs-sci">' + sci + "</span>" + meta + "</li>";
}
async function load(lat, lng, user) {
  const results = document.getElementById("bs-results");
  results.innerHTML = "";
  try {
    const base = "lat=" + lat + "&lng=" + lng + "&radius=" + RADIUS_KM;
    const [total, unseen] = await Promise.all([
      countAt(base),
      countAt(base + "&unobserved_by_user_id=" + encodeURIComponent(user))
    ]);
    const have = total - unseen;
    setStatus(have.toLocaleString() + " of " + total.toLocaleString() + " species within " + RADIUS_KM + " km on your list \xB7 showing what\u2019s out in " + MONTH_NAME);
  } catch {
    setStatus("");
  }
  const groups = await Promise.all(GROUPS.map(async ([iconic, label]) => {
    try {
      const rows = await topThisMonth(lat, lng, iconic);
      const ids = rows.map((row) => row.taxon.id);
      const [totals, missing] = await Promise.all([totalsFor(lat, lng, ids), missingFor(ids, user)]);
      return [label, rows, totals, missing];
    } catch {
      return [label, [], {}, /* @__PURE__ */ new Set()];
    }
  }));
  const html = [];
  for (const [label, rows, totals, missing] of groups) {
    if (!rows.length) continue;
    html.push('<div class="bs-group"><h3>' + esc(label) + '</h3><ul class="bs-list">');
    for (const row of rows) {
      const total = totals[row.taxon.id];
      html.push(itemHTML(row, total ? row.count / total : null, missing));
    }
    html.push("</ul></div>");
  }
  results.innerHTML = html.join("") || "<p>No species found near this location.</p>";
}
function run() {
  const username = document.getElementById("observer").value.trim();
  if (!username) return;
  if (!navigator.geolocation) {
    setStatus("This browser can\u2019t share a location.");
    return;
  }
  const button = document.getElementById("locateBtn");
  button.disabled = true;
  setStatus("Waiting for your location\u2026");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        setStatus("Finding what\u2019s active near you in " + MONTH_NAME + "\u2026");
        await load(pos.coords.latitude, pos.coords.longitude, username);
      } catch (err) {
        setStatus("Error: " + err.message);
      } finally {
        button.disabled = false;
      }
    },
    (err) => {
      button.disabled = false;
      setStatus("Couldn\u2019t get your location: " + err.message);
    },
    { enableHighAccuracy: false, timeout: 15e3, maximumAge: 6e5 }
  );
}
window.runBlindSpots = run;
//# sourceMappingURL=missed.js.map
