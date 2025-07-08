let attributeFacilityData = null;
let attributeMap = null;
let filteredLayer = null;
let currentAreaLayer = null; // Track currently shown admin boundary layer

// Load GeoJSON health facilities using POST WFS
function loadFacilityData() {
  const xmlBody = `
    <GetFeature service="WFS" version="1.0.0" outputFormat="application/json"
      xmlns="http://www.opengis.net/wfs"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.opengis.net/wfs http://schemas.opengis.net/wfs/1.0.0/WFS-basic.xsd">
      <Query typeName="health_facilities" />
    </GetFeature>
  `;

  fetch("http://localhost:8080/geoserver/health_facilities/ows", {
    method: "POST",
    headers: {
      "Content-Type": "text/xml"
    },
    body: xmlBody
  })
    .then(res => res.json())
    .then(data => {
      attributeFacilityData = data.features;
    })
    .catch(() => alert("Failed to load health facility data."));
}

// Tool selector dropdown logic
function setupAttributeToolSelector() {
  const selector = document.getElementById("attributeSelector");

  selector.addEventListener("change", function () {
    const selected = this.value;

    // UI elements
    const searchBox = document.getElementById("attributeSearchBox");
    const filterBox = document.getElementById("filterTypeBox");
    const viewBox = document.getElementById("viewByAdminBox");
    const output = document.getElementById("attributeOutput");
    const searchList = document.getElementById("searchResultList");
    const filterCount = document.getElementById("filterResultCount");
    const countText = document.getElementById("adminFacilityCount");

    // Hide all UI panels and clear outputs
    searchBox.classList.add("hidden");
    filterBox.classList.add("hidden");
    viewBox.classList.add("hidden");
    output.innerHTML = "";
    searchList.innerHTML = "";
    filterCount.textContent = "";
    countText.textContent = "";

    // Remove existing layers if any
    if (filteredLayer) {
      attributeMap.removeLayer(filteredLayer);
      filteredLayer = null;
    }
    if (currentAreaLayer) {
      attributeMap.removeLayer(currentAreaLayer);
      currentAreaLayer = null;
    }

    // Show UI based on selected tool
    if (selected === "searchByName") {
      searchBox.classList.remove("hidden");
    } else if (selected === "filterByType") {
      filterBox.classList.remove("hidden");
    } else if (selected === "viewByAdmin") {
      viewBox.classList.remove("hidden");
    }
  });
}

// Search by facility name
function setupSearchByName() {
  document.getElementById("runFacilitySearch").addEventListener("click", () => {
    const nameInput = document.getElementById("facilityNameInput").value.trim().toLowerCase();
    const resultList = document.getElementById("searchResultList");
    resultList.innerHTML = "";

    if (!attributeFacilityData) return alert("Facility data not loaded.");
    if (!nameInput) return alert("Please enter a facility name.");

    const matches = attributeFacilityData.filter(f =>
      f.properties.name?.toLowerCase().includes(nameInput)
    );

    if (matches.length === 0) {
      resultList.innerHTML = "<li>No matching facility found.</li>";
      return;
    }

    matches.forEach(feature => {
      const li = document.createElement("li");
      li.textContent = feature.properties.name || "Unnamed";
      li.style.cursor = "pointer";
      li.addEventListener("click", () => {
        const [lon, lat] = feature.geometry.coordinates;
        const type = feature.properties.amenity || "Unknown";
        const latlng = L.latLng(lat, lon);

        attributeMap.flyTo(latlng, 15);
        L.popup()
          .setLatLng(latlng)
          .setContent(`<b>${feature.properties.name}</b><br>Type: ${type}`)
          .openOn(attributeMap);
      });
      resultList.appendChild(li);
    });
  });
}

// Filter facilities by type
function setupFilterByType() {
  document.getElementById("runTypeFilter").addEventListener("click", () => {
    const selectedType = document.getElementById("typeSelector").value;
    const resultCount = document.getElementById("filterResultCount");
    resultCount.textContent = "";

    if (!selectedType) return alert("Select a type.");
    if (!attributeFacilityData) return alert("Data not loaded.");

    const matched = attributeFacilityData.filter(f =>
      f.properties.amenity?.toLowerCase() === selectedType.toLowerCase()
    );

    if (filteredLayer) attributeMap.removeLayer(filteredLayer);

    filteredLayer = L.geoJSON(matched, {
      pointToLayer: (f, latlng) =>
        L.circleMarker(latlng, {
          radius: 6,
          color: "#e67e22",
          fillOpacity: 0.8,
        }),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(`<b>${feature.properties.name}</b><br>Type: ${feature.properties.amenity}`);
      },
    }).addTo(attributeMap);

    if (matched.length > 0) {
      resultCount.textContent = `${matched.length} facility(s) found.`;
      attributeMap.fitBounds(filteredLayer.getBounds());
    } else {
      resultCount.textContent = "No facilities found.";
    }
  });
}

// View facilities by administrative unit
function setupViewByAdmin() {
  const levelSelect = document.getElementById("adminLevelSelect");
  const nameBox = document.getElementById("adminNameSelectBox");
  const nameSelect = document.getElementById("adminNameSelect");
  const viewBtn = document.getElementById("viewAdminFacilitiesBtn");
  const countText = document.getElementById("adminFacilityCount");

  levelSelect.addEventListener("change", () => {
    const level = levelSelect.value;
    nameSelect.innerHTML = "";
    countText.textContent = "";
    nameBox.classList.add("hidden");

    if (!level) return;

    fetch(buildWFSUrl(level))
      .then(res => res.json())
      .then(data => {
        nameBox.classList.remove("hidden");

        data.features.forEach((f, i) => {
          const opt = document.createElement("option");
          opt.value = i;

          // Show the correct property name based on level
          if (level === "province") {
            opt.text = f.properties.province || "Unknown";
          } else if (level === "district") {
            opt.text = f.properties.district || "Unknown";
          } else if (level === "local_unit") {
            opt.text = f.properties.gapa_napa || "Unknown";
          } else {
            opt.text = "Unknown";
          }

          nameSelect.appendChild(opt);
        });

        nameSelect.dataset.features = JSON.stringify(data.features);
      })
      .catch(() => alert("Failed to load administrative boundaries."));
  });

  viewBtn.addEventListener("click", () => {
    const level = levelSelect.value;
    const features = JSON.parse(nameSelect.dataset.features || "[]");
    const selected = features[nameSelect.value];
    if (!selected) return;

    const geom = selected.geometry;
    const areaWKT = geojsonToWKT(geom);

    if (currentAreaLayer) attributeMap.removeLayer(currentAreaLayer);
    if (filteredLayer) attributeMap.removeLayer(filteredLayer);

    currentAreaLayer = L.geoJSON(geom, {
      style: {
        color: "#2980b9",
        weight: 2,
        fillOpacity: 0.1,
      },
    }).addTo(attributeMap);

    attributeMap.fitBounds(currentAreaLayer.getBounds());

    const formData = new URLSearchParams();
    formData.append("service", "WFS");
    formData.append("version", "1.0.0");
    formData.append("request", "GetFeature");
    formData.append("typeName", "health_facilities");
    formData.append("outputFormat", "application/json");
    formData.append("cql_filter", `INTERSECTS(geom, ${areaWKT})`);

    fetch("http://localhost:8080/geoserver/health_facilities/ows", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    })
      .then(res => res.json())
      .then(data => {
        filteredLayer = L.geoJSON(data.features, {
          pointToLayer: (f, latlng) =>
            L.circleMarker(latlng, {
              radius: 6,
              color: "#8e44ad",
              fillOpacity: 0.9,
            }),
          onEachFeature: (f, layer) => {
            layer.bindPopup(`<b>${f.properties.name}</b><br>Type: ${f.properties.amenity}`);
          },
        }).addTo(attributeMap);

        countText.textContent = `Facilities found: ${data.features.length}`;
      })
      .catch(err => {
        alert("Failed to fetch filtered facilities.");
        console.error(err);
      });
  });
}

// Utility function to build WFS URL for admin layers
function buildWFSUrl(layerName) {
  return `http://localhost:8080/geoserver/health_facilities/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${layerName}&outputFormat=application/json`;
}

// Convert GeoJSON geometry to WKT string (Polygon or MultiPolygon)
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

// Helper to convert polygon rings to WKT string
function polygonToWKT(coordinates) {
  const rings = coordinates
    .map(ring => "(" + ring.map(coord => coord.join(" ")).join(",") + ")")
    .join(",");
  return `(${rings})`;
}

// Initialize all attribute tools with the map
function initAttributeTools(map) {
  attributeMap = map;
  loadFacilityData();
  setupAttributeToolSelector();
  setupSearchByName();
  setupFilterByType();
  setupViewByAdmin();
}
