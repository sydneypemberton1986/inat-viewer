// src/rarest.ts
var COUNTS_API = "https://api.inaturalist.org/v1/observations/species_counts";
var OBS_API = "https://api.inaturalist.org/v1/observations";
var PER_PAGE = 500;
var OBS_PER_PAGE = 200;
var ID_CHUNK = 100;
function setStatus(msg) {
  document.getElementById("status").innerText = msg;
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
async function fetchTaxa(username) {
  const results = [];
  let page = 1;
  let total = Infinity;
  while (results.length < total) {
    const url = `${COUNTS_API}?user_login=${encodeURIComponent(username)}&per_page=${PER_PAGE}&page=${page}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`iNat API returned ${resp.status}`);
    const data = await resp.json();
    total = data.total_results;
    results.push(...data.results);
    setStatus(`Ranking taxa\u2026 ${results.length} of ${total}`);
    if (!data.results.length) break;
    page += 1;
  }
  return results;
}
async function fetchObservations(username, taxa) {
  const byTaxon = {};
  for (const item of taxa) byTaxon[item.taxon.id] = item.taxon;
  const ids = taxa.map((t) => t.taxon.id);
  const rows = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    let page = 1;
    let total = Infinity;
    let got = 0;
    while (got < total) {
      const url = `${OBS_API}?user_login=${encodeURIComponent(username)}&taxon_id=${chunk.join(",")}&per_page=${OBS_PER_PAGE}&page=${page}&order_by=observed_on&order=desc`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`iNat API returned ${resp.status}`);
      const data = await resp.json();
      total = data.total_results;
      for (const obs of data.results) {
        const taxon = byTaxon[obs.taxon?.id];
        if (!taxon) continue;
        rows.push({ obs, taxon, global: taxon.observations_count });
      }
      got += data.results.length;
      setStatus(`Loading observations\u2026 ${rows.length}`);
      if (!data.results.length) break;
      page += 1;
    }
  }
  return rows;
}
async function loadRarest() {
  const username = document.getElementById("observer").value.trim();
  const limit = parseInt(document.getElementById("limit").value, 10);
  const list = document.getElementById("list");
  const btn = document.getElementById("loadBtn");
  if (!username) return;
  btn.disabled = true;
  list.innerHTML = "";
  setStatus("Loading\u2026");
  try {
    const taxa = await fetchTaxa(username);
    taxa.sort((a, b) => {
      const ga = a.taxon?.observations_count ?? Infinity;
      const gb = b.taxon?.observations_count ?? Infinity;
      if (ga !== gb) return ga - gb;
      return (a.taxon?.name || "").localeCompare(b.taxon?.name || "");
    });
    const topTaxa = limit > 0 ? taxa.slice(0, limit) : taxa;
    const rows = await fetchObservations(username, topTaxa);
    rows.sort((a, b) => {
      if (a.global !== b.global) return a.global - b.global;
      const n = (a.taxon.name || "").localeCompare(b.taxon.name || "");
      if (n) return n;
      return (b.obs.observed_on || "").localeCompare(a.obs.observed_on || "");
    });
    render(rows);
    setStatus(`${rows.length} observations across ${topTaxa.length} rarest taxa`);
  } catch (err) {
    setStatus("Error: " + err.message);
  } finally {
    btn.disabled = false;
  }
}
function validationBadge(grade) {
  if (grade === "research") return '<span class="badge badge-research">\u2713 Research Grade</span>';
  if (grade === "needs_id") return '<span class="badge badge-needsid">Needs ID</span>';
  return '<span class="badge badge-casual">Casual</span>';
}
function render(rows) {
  const list = document.getElementById("list");
  const html = rows.map((row, i) => {
    const obs = row.obs;
    const t = row.taxon;
    const common = t.preferred_common_name || t.name || "Unknown";
    const sci = t.name || "";
    const photo = obs.photos?.[0]?.url || t.default_photo?.square_url || "";
    const global = row.global;
    const href = `https://www.inaturalist.org/observations/${obs.id}`;
    const thumb = photo ? `<img class="thumb" src="${esc(photo)}" alt="" loading="lazy">` : `<div class="thumb"></div>`;
    const meta = [obs.observed_on || "no date", obs.place_guess || ""].filter(Boolean).map(esc).join(" &middot; ");
    return `<li class="rare-item">
            <span class="rank-num">${i + 1}</span>
            ${thumb}
            <span class="rare-main">
                <a class="rare-link" href="${esc(href)}" target="_blank" rel="noopener">${esc(common)}</a>
                <span class="sci">${esc(sci)}<span class="rank-label">${esc(t.rank || "")}</span></span>
                <span class="obs-meta">${meta}</span>
            </span>
            <span class="metrics">
                <span><span class="global">${global == null ? "\u2014" : global.toLocaleString()}</span> <span class="global-label">global obs</span></span>
                ${validationBadge(obs.quality_grade)}
            </span>
        </li>`;
  });
  list.innerHTML = html.join("");
}
window.loadRarest = loadRarest;
loadRarest();
//# sourceMappingURL=rarest.js.map
