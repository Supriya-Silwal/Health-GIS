// mapInit.js

// Initialize the map centered on Nepal
const map = L.map("map").setView([28.2, 84.0], 7);

initAttributeTools(map);


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

// WMS overlays
const provinces = L.tileLayer.wms("http://localhost:8080/geoserver/health_facilities/wms", {
  layers: "province",
  styles: "province_nofill",
  format: "image/png",
  transparent: true,
  attribution: "Provinces",
});

const districts = L.tileLayer.wms("http://localhost:8080/geoserver/health_facilities/wms", {
  layers: "district",
  styles: "district_nofill",
  format: "image/png",
  transparent: true,
  attribution: "Districts",
});

const localUnits = L.tileLayer.wms("http://localhost:8080/geoserver/health_facilities/wms", {
  layers: "local_unit",
  styles: "local_nofill",
  format: "image/png",
  transparent: true,
  attribution: "Local Units",
});

const healthFacilities = L.tileLayer.wms("http://localhost:8080/geoserver/health_facilities/wms", {
  layers: "health_facilities",
  // styles: "hospital_icon",
  format: "image/png",
  transparent: true,
  attribution: "Health Facilities",
});

// Layer control
const baseMaps = {
  OpenStreetMap: osm,
  "Esri Satellite": esriSat,
  OpenTopoMap: openTopo,
  "CartoDB Positron": cartoLight,
};

const overlayMaps = {
  "Health Facilities": healthFacilities,
  "Local Units": localUnits,
  Districts: districts,
  Provinces: provinces,
  
  
  
};

L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);

// Export for use in spatialTools.js
export { map };
