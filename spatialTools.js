// spatialTools.js

import { map } from './mapInit.js';

// Global variables
let bufferCircle = null;
let facilityLayer = null;
let measureLine = null;
let measureMarker = null;
let nearestFacilityMarker = null;
let facilityData = null;

// Fetch and cache facility GeoJSON
fetch("http://localhost:8080/geoserver/health_facilities/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=health_facilities&outputFormat=application/json")
  .then((res) => res.json())
  .then((data) => {
    facilityData = data.features;
  })
  .catch(() => alert("Failed to load health facilities data."));

// Tool selection handler
document.getElementById("toolSelector").addEventListener("change", function () {
  const selectedTool = this.value;
  const output = document.getElementById("toolOutput");
  const infoBox = document.getElementById("bufferInfoBox");
  const listBox = document.getElementById("bufferFacilityList");
  const bufferInputBox = document.getElementById("bufferInputBox");

  [bufferCircle, facilityLayer, measureLine, measureMarker, nearestFacilityMarker].forEach(layer => {
    if (layer) map.removeLayer(layer);
  });

  map.off("click", onMapClickMeasureNearest);
  map.off("click", onMapClickFeatureInfo);

  infoBox.classList.add("hidden");
  listBox.innerHTML = "";
  output.innerHTML = "";
  bufferInputBox.classList.add("hidden");

  if (selectedTool === "buffer") {
    bufferInputBox.classList.remove("hidden");
    output.innerHTML = `<p>Enter buffer distance and click "Apply Buffer", then click on the map.</p>`;
  } else if (selectedTool === "nearestMeasure") {
    output.innerHTML = `<p>Click anywhere on the map to measure distance to the nearest health facility.</p>`;
    map.on("click", onMapClickMeasureNearest);
  } else if (selectedTool === "info") {
    output.innerHTML = `<p>Click on the map to get feature info.</p>`;
    map.on("click", onMapClickFeatureInfo);
  }
});

// === Buffer Tool Logic ===
document.getElementById("activateBuffer").addEventListener("click", () => {
  const bufferDistance = parseFloat(document.getElementById("bufferDistance").value);
  if (isNaN(bufferDistance) || bufferDistance <= 0) {
    alert("Please enter a valid distance in meters.");
    return;
  }

  const output = document.getElementById("toolOutput");
  output.innerHTML = `<p>Click on the map to draw a ${bufferDistance}m buffer.</p>`;

  map.once("click", function (e) {
    if (bufferCircle) map.removeLayer(bufferCircle);
    bufferCircle = L.circle(e.latlng, {
      radius: bufferDistance,
      color: "blue",
      fillOpacity: 0.2,
    }).addTo(map);

    const nearby = facilityData.filter(f => {
      if (f.geometry.type !== "Point") return false;
      const [lon, lat] = f.geometry.coordinates;
      return map.distance(e.latlng, L.latLng(lat, lon)) <= bufferDistance;
    });

    if (facilityLayer) map.removeLayer(facilityLayer);
    facilityLayer = L.geoJSON(nearby, {
      pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 5, color: "red", fillOpacity: 0.8 }),
      onEachFeature: (f, layer) => layer.bindPopup(`<b>${f.properties.name || "Hospital"}</b>`)
    }).addTo(map);

    const modal = document.getElementById("hospitalModal");
    const tbody = document.getElementById("modalHospitalList").querySelector("tbody");
    tbody.innerHTML = "";

    if (nearby.length > 0) {
      document.getElementById("hospitalCount").textContent = `${nearby.length} hospital${nearby.length > 1 ? "s" : ""} found within the buffer.`;
      nearby.forEach(f => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${f.properties.name || "Hospital"}</td><td>${f.properties.amenity || "Unknown"}</td>`;
        tbody.appendChild(tr);
      });
      modal.classList.remove("hidden");
    } else {
      alert("No hospitals found within this buffer.");
    }
  });
});

document.getElementById("closeModalBtn").addEventListener("click", () => {
  document.getElementById("hospitalModal").classList.add("hidden");
});

// === Nearest Facility Logic ===
function onMapClickMeasureNearest(e) {
  if (!facilityData || facilityData.length === 0) {
    alert("Health facility data not loaded.");
    return;
  }

  const clickLatLng = e.latlng;
  let nearest = null;
  let minDist = Infinity;

  facilityData.forEach((f) => {
    const [lon, lat] = f.geometry.coordinates;
    const dist = clickLatLng.distanceTo([lat, lon]);
    if (dist < minDist) {
      minDist = dist;
      nearest = f;
    }
  });

  if (!nearest) return;

  if (measureLine) map.removeLayer(measureLine);
  if (measureMarker) map.removeLayer(measureMarker);
  if (nearestFacilityMarker) map.removeLayer(nearestFacilityMarker);

  measureLine = L.polyline([clickLatLng, [nearest.geometry.coordinates[1], nearest.geometry.coordinates[0]]], {
    color: "green"
  }).addTo(map);

  measureMarker = L.marker(clickLatLng).addTo(map).bindPopup("You clicked here").openPopup();
  nearestFacilityMarker = L.marker([nearest.geometry.coordinates[1], nearest.geometry.coordinates[0]])
    .addTo(map)
    .bindPopup(`Nearest Facility:<br>${nearest.properties.name || "Unknown"}`).openPopup();

  const distText = minDist < 1000
    ? `${minDist.toFixed(1)} meters`
    : `${(minDist / 1000).toFixed(3)} km (${minDist.toFixed(1)} meters)`;

  document.getElementById("toolOutput").innerHTML = `<p>Distance to nearest health facility: <strong>${distText}</strong></p>`;
}

// === Feature Info Tool ===
function onMapClickFeatureInfo(e) {
  const lat = e.latlng.lat.toFixed(6);
  const lon = e.latlng.lng.toFixed(6);
  showFeatureInfoModal(`<p>Loading information at [${lat}, ${lon}]...</p>`);

  const fetchFeature = (layer) => fetch(
    `http://localhost:8080/geoserver/health_facilities/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${layer}&outputFormat=application/json&cql_filter=CONTAINS(geom,POINT(${lon}%20${lat}))`
  ).then(res => res.json());

  fetchFeature("province")
    .then(p => {
      const province = p.features[0].properties.province || "Unknown";
      return fetchFeature("district").then(d => ({
        province,
        district: d.features[0].properties.district || "Unknown"
      }));
    })
    .then(loc => fetchFeature("local_unit").then(lu => {
      const local = lu.features[0];
      const localName = local.properties.gapa_napa || "Unknown";
      const polygonWKT = geojsonToWKT(local.geometry);

      return fetch(`http://localhost:8080/geoserver/health_facilities/ows`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `service=WFS&version=1.0.0&request=GetFeature&typeName=health_facilities&outputFormat=application/json&cql_filter=INTERSECTS(geom,${encodeURIComponent(polygonWKT)})`
      }).then(res => res.json()).then(hf => ({
        ...loc,
        ...loc,
        localUnitName: localName,
        facilities: hf.features,
        ...loc
      }));
    }))
    .then(({ province, district, localUnitName, facilities }) => {
      let content = `
        <p><strong>Province:</strong> ${province}</p>
        <p><strong>District:</strong> ${district}</p>
        <p><strong>Local Unit:</strong> ${localUnitName}</p>
        <p><strong>Facilities:</strong> ${facilities.length}</p><ul>
      `;
      facilities.forEach(f => {
        content += `<li><strong>${f.properties.name}</strong> (${f.properties.amenity || "Unknown"})</li>`;
      });
      content += "</ul>";
      showFeatureInfoModal(content);
    })
    .catch((err) => showFeatureInfoModal(`<p>Error: ${err}</p>`));
}

// Show modal
function showFeatureInfoModal(htmlContent) {
  const modal = document.getElementById("featureInfoModal");
  document.getElementById("featureInfoContent").innerHTML = htmlContent;
  modal.classList.remove("hidden");
}

document.getElementById("closeFeatureInfoBtn").addEventListener("click", () => {
  document.getElementById("featureInfoModal").classList.add("hidden");
});

// Convert GeoJSON geometry to WKT
function geojsonToWKT(geometry) {
  if (geometry.type === "Polygon") return polygonToWKT(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return `MULTIPOLYGON(${geometry.coordinates.map(polygonToWKT).join(",")})`;
  return "";
}

function polygonToWKT(coords) {
  return `(${coords.map(ring => `(${ring.map(coord => coord.join(" ")).join(",")})`).join(",")})`;
}
