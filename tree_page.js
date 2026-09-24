// src/tree_page.ts
(function() {
  const ids = ["f-region", "f-establishment", "f-captive", "f-coarse"];
  const controls = ids.map((id) => document.getElementById(id));
  if (controls.some((c) => !c)) return;
  const [region, establishment, captive, coarse] = controls;
  const count = document.getElementById("match-count");
  const reset = document.getElementById("f-reset");
  function matches(o) {
    if (region.value && o.dataset.region !== region.value) return false;
    if (establishment.value && o.dataset.establishment !== establishment.value) return false;
    if (captive.value && o.dataset.captive !== captive.value) return false;
    if (coarse.value && o.dataset.coarse !== coarse.value) return false;
    return true;
  }
  function apply() {
    const active = controls.some((c) => c.value);
    let visible = 0;
    document.querySelectorAll(".obs").forEach((o) => {
      const show = matches(o);
      o.classList.toggle("filtered", !show);
      if (show) visible += 1;
    });
    document.querySelectorAll(".tree details").forEach((d) => {
      const has = d.querySelector(".obs:not(.filtered)") !== null;
      d.classList.toggle("filtered", active && !has);
      if (active && has) d.open = true;
    });
    document.querySelectorAll(".leaf").forEach((l) => l.classList.toggle("filtered", active));
    count.textContent = active ? visible + " matching observations" : "";
  }
  controls.forEach((c) => c.addEventListener("change", apply));
  reset.addEventListener("click", () => {
    controls.forEach((c) => {
      c.value = "";
    });
    apply();
  });
  apply();
})();
(function() {
  const root = document.getElementById("blind-spots");
  if (!root) return;
  const config = JSON.parse(document.getElementById("bs-data").textContent);
  const observed = new Set(config.observed || []);
  const user = config.user;
  const button = document.getElementById("bs-locate");
  const status = document.getElementById("bs-status");
  const results = document.getElementById("bs-results");
  const RADIUS_KM = 100;
  const PER_GROUP = 10;
  const MONTH = (/* @__PURE__ */ new Date()).getMonth() + 1;
  const MONTH_NAMES = [
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
  const MONTH_NAME = MONTH_NAMES[MONTH - 1];
  const IN_SEASON_SHARE = 0.15;
  const API = "https://api.inaturalist.org/v1/observations/species_counts";
  const GROUPS = [
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
  function esc(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }
  async function countAt(query) {
    const response = await fetch(API + "?" + query + "&rank=species&per_page=0");
    if (!response.ok) throw new Error("HTTP " + response.status);
    return (await response.json()).total_results || 0;
  }
  async function topThisMonth(lat, lng, iconic) {
    const query = "lat=" + lat + "&lng=" + lng + "&radius=" + RADIUS_KM + "&iconic_taxa=" + iconic + "&rank=species&per_page=" + PER_GROUP + "&month=" + MONTH;
    const response = await fetch(API + "?" + query);
    if (!response.ok) throw new Error("HTTP " + response.status);
    return (await response.json()).results || [];
  }
  async function totalsFor(lat, lng, ids) {
    if (!ids.length) return {};
    const query = "lat=" + lat + "&lng=" + lng + "&radius=" + RADIUS_KM + "&taxon_id=" + ids.join(",") + "&rank=species&per_page=" + ids.length;
    const response = await fetch(API + "?" + query);
    if (!response.ok) throw new Error("HTTP " + response.status);
    const totals = {};
    for (const row of (await response.json()).results || []) totals[row.taxon.id] = row.count;
    return totals;
  }
  function itemHTML(row, share) {
    const taxon = row.taxon || {};
    const id = taxon.id;
    const have = observed.has(id);
    const href = "https://www.inaturalist.org/taxa/" + id;
    const common = esc(taxon.preferred_common_name || taxon.name || "?");
    const sci = esc(taxon.name || "");
    const photo = (taxon.default_photo || {}).square_url;
    const mark = have ? '<span class="bs-mark bs-have" title="on your life list">\u2713</span>' : '<span class="bs-mark bs-missing" title="not recorded yet">\u25CB</span>';
    const thumb = photo ? '<img class="bs-thumb" src="' + esc(photo) + '" alt="" loading="lazy">' : "";
    const season = share != null ? '<span class="bs-season' + (share >= IN_SEASON_SHARE ? " bs-season-hot" : "") + '" title="share of this species\u2019 yearly local sightings that fall in ' + MONTH_NAME + '">' + Math.round(share * 100) + "% in " + MONTH_NAME + "</span>" : "";
    const seen = row.count ? '<span class="bs-count">seen ' + row.count.toLocaleString() + "\xD7 here in " + MONTH_NAME + "</span>" : "";
    return '<li class="bs-item' + (have ? " bs-item-have" : "") + '">' + mark + '<a class="bs-link" href="' + href + '" target="_blank" rel="noopener">' + thumb + '<span class="bs-name">' + common + '</span></a><span class="bs-sci">' + sci + "</span>" + season + seen + "</li>";
  }
  async function load(lat, lng) {
    status.textContent = "Finding what\u2019s active near you in " + MONTH_NAME + "\u2026";
    results.innerHTML = "";
    try {
      const base = "lat=" + lat + "&lng=" + lng + "&radius=" + RADIUS_KM;
      const [total, missing] = await Promise.all([
        countAt(base),
        countAt(base + "&unobserved_by_user_id=" + encodeURIComponent(user))
      ]);
      const have = total - missing;
      status.textContent = have.toLocaleString() + " of " + total.toLocaleString() + " species within " + RADIUS_KM + " km on your list \xB7 showing what\u2019s out in " + MONTH_NAME;
    } catch (err) {
      status.textContent = "";
    }
    const groups = await Promise.all(GROUPS.map(async (pair) => {
      try {
        const rows = await topThisMonth(lat, lng, pair[0]);
        const totals = await totalsFor(lat, lng, rows.map((row) => row.taxon.id));
        return [pair[1], rows, totals];
      } catch (err) {
        return [pair[1], [], {}];
      }
    }));
    const html = [];
    for (const [label, rows, totals] of groups) {
      if (!rows.length) continue;
      html.push('<div class="bs-group"><h3>' + esc(label) + '</h3><ul class="bs-list">');
      for (const row of rows) {
        const total = totals[row.taxon.id];
        html.push(itemHTML(row, total ? row.count / total : null));
      }
      html.push("</ul></div>");
    }
    results.innerHTML = html.join("") || '<p class="bs-status">No species found near this location.</p>';
  }
  button.addEventListener("click", () => {
    if (!navigator.geolocation) {
      status.textContent = "This browser can\u2019t share a location.";
      return;
    }
    root.open = true;
    button.disabled = true;
    status.textContent = "Waiting for your location\u2026";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        button.disabled = false;
        load(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        button.disabled = false;
        status.textContent = "Couldn\u2019t get your location: " + err.message;
      },
      { enableHighAccuracy: false, timeout: 15e3, maximumAge: 6e5 }
    );
  });
})();
//# sourceMappingURL=tree_page.js.map
