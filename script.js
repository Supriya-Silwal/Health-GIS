// Initialize the map centered on Nepal
const map = L.map("map").setView([28.2, 84.0], 7);





// Base maps
const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors",
});

const esriSat = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution: "Tiles © Esri",
  }
);

const openTopo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
  maxZoom: 17,
  attribution: "Map data: © OpenTopoMap (CC-BY-SA)",
});

const cartoLight = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  }
);

// Add default base map
osm.addTo(map);

// GeoServer WMS Layers
const provinces = L.tileLayer.wms(
  "http://localhost:8080/geoserver/health_facilities/wms",
  {
    layers: "province",
    format: "image/png",
    transparent: true,
    attribution: "Provinces",
  }
);

const districts = L.tileLayer.wms(
  "http://localhost:8080/geoserver/health_facilities/wms",
  {
    layers: "district",
    format: "image/png",
    transparent: true,
    attribution: "Districts",
  }
);

const localUnits = L.tileLayer.wms(
  "http://localhost:8080/geoserver/health_facilities/wms",
  {
    layers: "local_unit",
    format: "image/png",
    transparent: true,
    attribution: "Local Units",
  }
);

const healthFacilities = L.tileLayer.wms(
  "http://localhost:8080/geoserver/health_facilities/wms",
  {
    layers: "health_facilities",
    format: "image/png",
    transparent: true,
    attribution: "Health Facilities",
  }
);

// Layer controls
const baseMaps = {
  OpenStreetMap: osm,
  "Esri Satellite": esriSat,
  OpenTopoMap: openTopo,
  "CartoDB Positron": cartoLight,
};

const overlayMaps = {
  Provinces: provinces,
  Districts: districts,
  "Local Units": localUnits,
  "Health Facilities": healthFacilities,
};

L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);

// ===== Spatial Tools Logic =====
let bufferCircle = null;
let facilityLayer = null;

let measureLine = null;
let measureMarker = null;
let nearestFacilityMarker = null;

// Store facility data once loaded
let facilityData = null;

// Fetch health facilities GeoJSON once for measurement
fetch(
  "http://localhost:8080/geoserver/health_facilities/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=health_facilities&outputFormat=application/json"
)
  .then((res) => res.json())
  .then((data) => {
    facilityData = data.features;
  })
  .catch(() => alert("Failed to load health facilities data."));

// Tool selector event handler



document.getElementById("toolSelector").addEventListener("change", function () {
  const selectedTool = this.value;
  const output = document.getElementById("toolOutput");
  const infoBox = document.getElementById("bufferInfoBox");
  const listBox = document.getElementById("bufferFacilityList");
  const bufferInputBox = document.getElementById("bufferInputBox");

  // Clear previous drawings and handlers
  if (bufferCircle) map.removeLayer(bufferCircle);
  if (facilityLayer) map.removeLayer(facilityLayer);
  if (measureLine) map.removeLayer(measureLine);
  if (measureMarker) map.removeLayer(measureMarker);
  if (nearestFacilityMarker) map.removeLayer(nearestFacilityMarker);

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



// Buffer tool logic
document.getElementById("activateBuffer").addEventListener("click", () => {
  const distanceInput = document.getElementById("bufferDistance").value;
  const bufferDistance = parseFloat(distanceInput);

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

    // Find facilities within buffer distance
    fetch(
      "http://localhost:8080/geoserver/health_facilities/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=health_facilities&outputFormat=application/json"
    )
      .then((res) => res.json())
      .then((data) => {
        const features = data.features.filter((f) => {
          if (f.geometry.type !== "Point") return false;
          const [lon, lat] = f.geometry.coordinates;
          return map.distance(e.latlng, L.latLng(lat, lon)) <= bufferDistance;
        });

        if (facilityLayer) map.removeLayer(facilityLayer);

        facilityLayer = L.geoJSON(features, {
          pointToLayer: (f, latlng) =>
            L.circleMarker(latlng, {
              radius: 5,
              color: "red",
              fillOpacity: 0.8,
            }),
          onEachFeature: (f, layer) => {
            const name = f.properties.name || "Hospital";
            layer.bindPopup(`<b>${name}</b>`);
          },
        }).addTo(map);

        // Show modal with hospital list
        const modal = document.getElementById("hospitalModal");
        const table = document.getElementById("modalHospitalList");
        const tbody = table.querySelector("tbody");
        tbody.innerHTML = "";

        if (features.length > 0) {
          document.getElementById("hospitalCount").textContent = `${features.length} hospital${
            features.length > 1 ? "s" : ""
          } found within the buffer.`;

          features.forEach((f) => {
            const name = f.properties.name || "Hospital";
            const type = f.properties.amenity || "Unknown";

            const tr = document.createElement("tr");

            const tdName = document.createElement("td");
            tdName.textContent = name;

            const tdType = document.createElement("td");
            tdType.textContent = type;

            tr.appendChild(tdName);
            tr.appendChild(tdType);
            tbody.appendChild(tr);
          });

          modal.classList.remove("hidden");
        } else {
          alert("No hospitals found within this buffer.");
        }
      })
      .catch(() => alert("Failed to load hospital data."));
  });
});

// Close modal button
document.getElementById("closeModalBtn").addEventListener("click", () => {
  document.getElementById("hospitalModal").classList.add("hidden");
});

// Custom nearest facility distance measurement handler
function onMapClickMeasureNearest(e) {
  if (!facilityData || facilityData.length === 0) {
    alert("Health facility data not loaded.");
    return;
  }

  const clickLatLng = e.latlng;

  // Find nearest feature
  let nearestFeature = null;
  let minDistance = Infinity;

  facilityData.forEach((feature) => {
    if (feature.geometry.type !== "Point") return;
    const [lon, lat] = feature.geometry.coordinates;
    const facilityLatLng = L.latLng(lat, lon);
    const dist = clickLatLng.distanceTo(facilityLatLng); // meters
    if (dist < minDistance) {
      minDistance = dist;
      nearestFeature = feature;
    }
  });

  if (!nearestFeature) {
    alert("No health facilities found.");
    return;
  }

  // Clear previous markers/line
  if (measureLine) map.removeLayer(measureLine);
  if (measureMarker) map.removeLayer(measureMarker);
  if (nearestFacilityMarker) map.removeLayer(nearestFacilityMarker);

  // Draw line between clicked point and nearest facility
  measureLine = L.polyline(
    [clickLatLng, L.latLng(nearestFeature.geometry.coordinates[1], nearestFeature.geometry.coordinates[0])],
    { color: "green" }
  ).addTo(map);

  // Markers on both points
  measureMarker = L.marker(clickLatLng).addTo(map).bindPopup("You clicked here").openPopup();
  nearestFacilityMarker = L.marker([
    nearestFeature.geometry.coordinates[1],
    nearestFeature.geometry.coordinates[0],
  ])
    .addTo(map)
    .bindPopup(`Nearest Facility:<br>${nearestFeature.properties.name || "Unknown"}`)
    .openPopup();

  // Format distance nicely
  let distanceText = "";
  if (minDistance < 1000) {
    distanceText = `${minDistance.toFixed(1)} meters`;
  } else {
    distanceText = `${(minDistance / 1000).toFixed(3)} km (${minDistance.toFixed(1)} meters)`;
  }

  // Show result in output div
  document.getElementById("toolOutput").innerHTML = `<p>Distance to nearest health facility (${
    nearestFeature.properties.name || "Unknown"
  }): <strong>${distanceText}</strong></p>`;
}



// Helper: Build WFS URL with CQL_FILTER for point-in-polygon query
function buildWFSUrl(layerName, lat, lon) {
  return `http://localhost:8080/geoserver/health_facilities/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${layerName}&outputFormat=application/json&cql_filter=CONTAINS(geom, POINT(${lon}%20${lat}))`;
}

// Helper: Build WFS URL to get health facilities within polygon (local unit)
function buildHealthFacilitiesUrl(polygonWKT) {
  const encodedWKT = encodeURIComponent(polygonWKT);
  return `http://localhost:8080/geoserver/health_facilities/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=health_facilities&outputFormat=application/json&cql_filter=INTERSECTS(geom, ${encodedWKT})`;
}

// Show modal with content
function showFeatureInfoModal(htmlContent) {
  const modal = document.getElementById("featureInfoModal");
  const contentDiv = document.getElementById("featureInfoContent");
  contentDiv.innerHTML = htmlContent;
  modal.classList.remove("hidden");
}

// Close modal handler
document.getElementById("closeFeatureInfoBtn").addEventListener("click", () => {
  document.getElementById("featureInfoModal").classList.add("hidden");
});

// Main map click handler for Feature Info tool
function onMapClickFeatureInfo(e) {
  const lat = e.latlng.lat.toFixed(6);
  const lon = e.latlng.lng.toFixed(6);

  // Show loading message
  showFeatureInfoModal(`<p>Loading information at [${lat}, ${lon}]...</p>`);

  // Fetch Province containing point
  fetch(buildWFSUrl("province", lat, lon))
    .then((res) => res.json())
    .then((provinceData) => {
      if (!provinceData.features.length) throw "No province found";

      const province = provinceData.features[0].properties.province || "Unknown Province";

      // Fetch District containing point
      return fetch(buildWFSUrl("district", lat, lon))
        .then((res) => res.json())
        .then((districtData) => {
          if (!districtData.features.length) throw "No district found";

          const district = districtData.features[0].properties.district || "Unknown District";

          // Fetch Local Unit containing point
          return fetch(buildWFSUrl("local_unit", lat, lon))
            .then((res) => res.json())
            .then((localUnitData) => {
              if (!localUnitData.features.length) throw "No local unit found";

              const localUnitFeature = localUnitData.features[0];
              const localUnitName = localUnitFeature.properties.gapa_napa || "Unknown Local Unit";

              // Get polygon WKT of local unit for facility query
              // Assuming GeoJSON geometry, convert to WKT using helper function
              const polygonWKT = geojsonToWKT(localUnitFeature.geometry);

              // Fetch health facilities inside local unit polygon
             const wfsBody = `service=WFS&version=1.0.0&request=GetFeature&typeName=health_facilities&outputFormat=application/json&cql_filter=INTERSECTS(geom,${encodeURIComponent(polygonWKT)})`;

return fetch('http://localhost:8080/geoserver/health_facilities/ows', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: wfsBody
})
                .then((res) => res.json())
                .then((facilitiesData) => {
                  const facilities = facilitiesData.features;
                  const facilityCount = facilities.length;

                  let facilitiesHtml = "<ul>";
                  facilities.forEach((f) => {
                    const name = f.properties.name || "Unknown";
                    const type = f.properties.amenity || "Unknown";
                    facilitiesHtml += `<li><strong>${name}</strong> (${type})</li>`;
                  });
                  facilitiesHtml += "</ul>";

                  // Compose final HTML content
                  const htmlContent = `
                    <p><strong>Province:</strong> ${province}</p>
                    <p><strong>District:</strong> ${district}</p>
                    <p><strong>Local Level:</strong> ${localUnitName}</p>
                    <p><strong>Number of Health Facilities:</strong> ${facilityCount}</p>
                    <h4>Facilities:</h4>
                    ${facilityCount > 0 ? facilitiesHtml : "<p>No health facilities found.</p>"}
                  `;
                  showFeatureInfoModal(htmlContent);
                });
            });
        });
    })
    .catch((err) => {
      showFeatureInfoModal(`<p>Error fetching data: ${err}</p>`);
    });
}

// Helper: Convert GeoJSON Polygon/MultiPolygon to WKT string
function geojsonToWKT(geometry) {
  if (geometry.type === "Polygon") {
    return polygonToWKT(geometry.coordinates);
  } else if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates.map(polygonToWKT);
    return `MULTIPOLYGON(${polygons.join(",")})`;
  } else {
    return "";
  }
}

function polygonToWKT(coordinates) {
  const rings = coordinates
    .map(
      (ring) =>
        "(" +
        ring
          .map((coord) => coord.join(" "))
          .join(",") +
        ")"
    )
    .join(",");
  return `(${rings})`;
}

// Activate feature info tool logic
let featureInfoActive = false;



