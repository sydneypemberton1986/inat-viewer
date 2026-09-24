// src/grid_viewer.ts
var map = L.map("map").setView([30.2672, -97.7431], 10);
var satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 18,
  attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
});
var streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});
var topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
  maxZoom: 17,
  attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
});
satellite.addTo(map);
L.control.layers({
  "Satellite": satellite,
  "Street map (parks in green)": streets,
  "Topographic": topo
}, null, { position: "topleft" }).addTo(map);
map.createPane("gridPane");
map.getPane("gridPane").style.zIndex = "350";
map.getPane("gridPane").style.pointerEvents = "none";
map.createPane("gridShadowPane");
map.getPane("gridShadowPane").style.zIndex = "340";
map.getPane("gridShadowPane").style.pointerEvents = "none";
var iNatGridLayer = null;
var iNatShadowLayer = null;
var SHADOW_OPACITY = 0.15;
function renderGrid() {
  const username = document.getElementById("observer").value.trim();
  const nativeZoom = parseInt(document.getElementById("gridZoom").value, 10);
  if (!username) return;
  if (iNatGridLayer !== null) {
    map.removeLayer(iNatGridLayer);
  }
  if (iNatShadowLayer !== null) {
    map.removeLayer(iNatShadowLayer);
    iNatShadowLayer = null;
  }
  const apiUrl = `https://api.inaturalist.org/v1/grid/{z}/{x}/{y}.png?user_login=${encodeURIComponent(username)}&color=red`;
  const shadowZoom = nativeZoom - 1;
  if (shadowZoom >= 0) {
    iNatShadowLayer = L.tileLayer(apiUrl, {
      pane: "gridShadowPane",
      // below the main grid
      minNativeZoom: shadowZoom,
      maxNativeZoom: shadowZoom,
      maxZoom: 18,
      opacity: SHADOW_OPACITY,
      attribution: '&copy; <a href="https://www.inaturalist.org">iNaturalist</a>'
    }).addTo(map);
  }
  iNatGridLayer = L.tileLayer(apiUrl, {
    pane: "gridPane",
    // keep the grid above any selected basemap
    minNativeZoom: nativeZoom,
    // Prevents the grid from sizing up when zooming out
    maxNativeZoom: nativeZoom,
    // Prevents the grid from sizing down when zooming in
    maxZoom: 18,
    opacity: 0.7,
    attribution: '&copy; <a href="https://www.inaturalist.org">iNaturalist</a>'
  }).addTo(map);
}
renderGrid();
var watchId = null;
var meMarker = null;
var meAccuracy = null;
var following = false;
function setStatus(msg) {
  document.getElementById("status").innerText = msg;
}
function toggleTracking() {
  const btn = document.getElementById("trackBtn");
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    following = false;
    if (meMarker) {
      map.removeLayer(meMarker);
      meMarker = null;
    }
    if (meAccuracy) {
      map.removeLayer(meAccuracy);
      meAccuracy = null;
    }
    btn.innerText = "\u{1F4CD} Track My Location";
    setStatus("");
    return;
  }
  if (!("geolocation" in navigator)) {
    setStatus("Geolocation not supported by this browser.");
    return;
  }
  following = true;
  btn.innerText = "\u23F9 Stop Tracking";
  setStatus("Locating\u2026");
  watchId = navigator.geolocation.watchPosition(onPosition, onPosError, {
    enableHighAccuracy: true,
    maximumAge: 1e3,
    timeout: 15e3
  });
}
function onPosition(pos) {
  const { latitude, longitude, accuracy } = pos.coords;
  const latlng = [latitude, longitude];
  if (!meMarker) {
    meMarker = L.marker(latlng, {
      icon: L.divIcon({
        className: "",
        html: '<div class="me-dot"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })
    }).addTo(map);
    meAccuracy = L.circle(latlng, {
      radius: accuracy,
      color: "#1a73e8",
      weight: 1,
      fillOpacity: 0.1
    }).addTo(map);
  } else {
    meMarker.setLatLng(latlng);
    meAccuracy.setLatLng(latlng).setRadius(accuracy);
  }
  if (following) {
    map.setView(latlng, Math.max(map.getZoom(), 14));
  }
  setStatus("Accuracy: \xB1" + Math.round(accuracy) + " m");
}
function onPosError(err) {
  setStatus("Location error: " + err.message);
  following = false;
  document.getElementById("trackBtn").innerText = "\u{1F4CD} Track My Location";
}
map.on("dragstart", () => {
  following = false;
});
window.renderGrid = renderGrid;
window.toggleTracking = toggleTracking;
//# sourceMappingURL=grid_viewer.js.map
