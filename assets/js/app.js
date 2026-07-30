const $ = (selector) => document.querySelector(selector);

const globeElement = $("#globe");
const statusElement = $("#status");
const resultSection = $("#result-section");
const suggestionsElement = $("#suggestions");
const searchInput = $("#place-search");

let currentResult = { origin: null, antipode: null };
let activeLookup = 0;
let suggestionTimer;

const CONTINENTS = {
  MA: "Africa", NZ: "Oceania", AU: "Oceania", US: "North America",
  CA: "North America", MX: "North America", BR: "South America",
  AR: "South America", CL: "South America", CN: "Asia", JP: "Asia",
  IN: "Asia", RU: "Europe / Asia", ES: "Europe", FR: "Europe",
  GB: "Europe", DE: "Europe", IT: "Europe", ZA: "Africa",
  EG: "Africa", DZ: "Africa", TN: "Africa", PT: "Europe",
  ID: "Asia", PH: "Asia", TR: "Europe / Asia"
};

const globe = Globe()(globeElement)
  .backgroundColor("rgba(0,0,0,0)")
  .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
  .bumpImageUrl("https://unpkg.com/three-globe/example/img/earth-topology.png")
  .showAtmosphere(true)
  .atmosphereColor("#77d5ff")
  .atmosphereAltitude(0.22)
  .pointAltitude(0.035)
  .pointRadius(0.34)
  .pointLabel(
    (point) =>
      `<strong>${escapeHtml(point.label)}</strong><br>${formatCoordinates(point.lat, point.lng)}`
  )
  .arcColor(() => ["#1875ff", "#ff7a18"])
  .arcAltitudeAutoScale(0.32)
  .arcStroke(0.68)
  .arcDashLength(0.42)
  .arcDashGap(0.14)
  .arcDashAnimateTime(1700)
  .onGlobeClick(({ lat, lng }) => chooseLocation(lat, lng, "Selected point"));

globe.controls().autoRotate = true;
globe.controls().autoRotateSpeed = 0.32;
globe.controls().enableDamping = true;
globe.pointOfView({ lat: 20, lng: -20, altitude: 1.9 }, 0);

function resizeGlobe() {
  globe.width(globeElement.clientWidth).height(globeElement.clientHeight);
}
window.addEventListener("resize", resizeGlobe);
resizeGlobe();

function calculateAntipode(lat, lng) {
  return { lat: -lat, lng: lng >= 0 ? lng - 180 : lng + 180 };
}

async function chooseLocation(lat, lng, name = "Selected point", detail = "", metadata = {}) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    showStatus("These coordinates are not valid.");
    return;
  }

  const antipode = calculateAntipode(latitude, longitude);
  const lookupId = ++activeLookup;

  currentResult = {
    origin: {
      lat: latitude,
      lng: longitude,
      name,
      detail: detail || "Your selected location.",
      metadata: {
        city: metadata.city || name,
        region: metadata.region || "Region not identified",
        country: metadata.country || "Country not identified",
        countryCode: metadata.countryCode || "",
        continent: metadata.continent || continentFromCode(metadata.countryCode)
      }
    },
    antipode: {
      ...antipode,
      name: "Opposite point",
      detail: "Searching for geographic context.",
      metadata: {
        city: "Searching…",
        region: "Searching…",
        country: "Searching…",
        countryCode: "",
        continent: "Searching…"
      },
      nearest: {
        place: "Searching…",
        country: "Searching…",
        distanceKm: null,
        exactOnLand: false
      }
    }
  };

  globe.controls().autoRotate = false;
  globe.pointsData([
    { lat: latitude, lng: longitude, color: "#1875ff", label: name },
    { lat: antipode.lat, lng: antipode.lng, color: "#ff7a18", label: "Antipode" }
  ]).pointColor("color");

  globe.arcsData([{
    startLat: latitude, startLng: longitude,
    endLat: antipode.lat, endLng: antipode.lng
  }]);

  globe.pointOfView({ lat: latitude, lng: longitude, altitude: 1.65 }, 1100);

  renderResult();
  resultSection.hidden = false;

  const exactPlace = await reverseGeocode(antipode.lat, antipode.lng);
  if (lookupId !== activeLookup) return;

  if (exactPlace && exactPlace.metadata.country !== "Country not identified") {
    currentResult.antipode.name = exactPlace.name;
    currentResult.antipode.detail = exactPlace.detail || "The exact antipode is on or very near land.";
    currentResult.antipode.metadata = exactPlace.metadata;
    currentResult.antipode.nearest = {
      place: exactPlace.metadata.city || exactPlace.name,
      country: exactPlace.metadata.country,
      distanceKm: 0,
      exactOnLand: true
    };
    renderResult();
    updateShareUrl();
    return;
  }

  currentResult.antipode.name = "Open ocean";
  currentResult.antipode.detail = "The exact antipode is in open ocean. Searching outward for nearby land…";
  renderResult();

  const nearest = await findNearestLandContext(antipode.lat, antipode.lng, lookupId);
  if (lookupId !== activeLookup) return;

  if (nearest) {
    currentResult.antipode.metadata = nearest.place.metadata;
    currentResult.antipode.nearest = {
      place: nearest.place.metadata.city || nearest.place.name,
      country: nearest.place.metadata.country,
      distanceKm: nearest.distanceKm,
      exactOnLand: false
    };
    currentResult.antipode.detail =
      `The exact antipode is in open ocean. The nearest identified country is ${nearest.place.metadata.country}.`;
  } else {
    currentResult.antipode.metadata = {
      city: "Open ocean",
      region: "Remote marine area",
      country: "No nearby country identified",
      countryCode: "",
      continent: "Not identified"
    };
    currentResult.antipode.nearest = {
      place: "Not identified",
      country: "Not identified",
      distanceKm: null,
      exactOnLand: false
    };
    currentResult.antipode.detail =
      "The exact antipode is in a remote ocean area and nearby land could not be identified automatically.";
  }

  renderResult();
  updateShareUrl();
}

function renderResult() {
  const { origin, antipode } = currentResult;
  if (!origin || !antipode) return;

  $("#floating-origin-name").textContent = origin.metadata.city || origin.name;
  $("#floating-origin-coords").textContent = formatCoordinates(origin.lat, origin.lng);
  $("#floating-origin-country").textContent = origin.metadata.country;

  $("#floating-antipode-name").textContent =
    antipode.nearest?.exactOnLand ? antipode.metadata.city : antipode.name;
  $("#floating-antipode-coords").textContent = formatCoordinates(antipode.lat, antipode.lng);
  $("#floating-antipode-country").textContent =
    antipode.nearest?.country && antipode.nearest.country !== "Searching…"
      ? `Nearest: ${antipode.nearest.country}`
      : "Finding nearest country…";

  $("#result-origin-title").textContent = origin.name;
  $("#result-antipode-title").textContent = antipode.name;

  $("#origin-city").textContent = origin.metadata.city;
  $("#origin-detail").textContent = origin.detail;
  $("#origin-coords").textContent = formatCoordinates(origin.lat, origin.lng);
  $("#origin-region").textContent = origin.metadata.region;
  $("#origin-country").textContent = origin.metadata.country;
  $("#origin-continent").textContent = origin.metadata.continent || "Not identified";

  $("#antipode-city").textContent = antipode.name;
  $("#antipode-detail").textContent = antipode.detail;
  $("#antipode-coords").textContent = formatCoordinates(antipode.lat, antipode.lng);
  $("#antipode-location-type").textContent =
    antipode.nearest?.exactOnLand ? "Land" : "Open ocean";
  $("#antipode-country").textContent = antipode.nearest?.country || antipode.metadata.country;
  $("#antipode-nearest-place").textContent = antipode.nearest?.place || "Searching…";
  $("#antipode-nearest-distance").textContent =
    antipode.nearest?.distanceKm === 0
      ? "At the exact point"
      : Number.isFinite(antipode.nearest?.distanceKm)
        ? `Approximately ${Math.round(antipode.nearest.distanceKm)} km`
        : "Searching…";
  $("#antipode-region").textContent = antipode.metadata.region;
  $("#antipode-continent").textContent = antipode.metadata.continent || "Not identified";

  const nearestCountry = antipode.nearest?.country;
  const nearestPlace = antipode.nearest?.place;
  const distance = antipode.nearest?.distanceKm;

  if (antipode.nearest?.exactOnLand) {
    $("#result-summary").textContent =
      `The exact antipode of ${origin.name} is on land near ${nearestPlace}, ${nearestCountry}.`;
  } else if (nearestCountry && nearestCountry !== "Searching…" && Number.isFinite(distance)) {
    $("#result-summary").textContent =
      `The exact antipode of ${origin.name} lies in open ocean. The nearest identified country is ${nearestCountry}, with ${nearestPlace} approximately ${Math.round(distance)} km from the antipode coordinates.`;
  } else {
    $("#result-summary").textContent =
      `The exact antipode of ${origin.name} is being analysed for the nearest country and populated place.`;
  }
}

function formatCoordinates(lat, lng) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

function getPlaceName(properties = {}) {
  return properties.name || properties.city || properties.county ||
    properties.state || properties.country || "Selected location";
}

function getPlaceDetail(properties = {}) {
  return unique([properties.city, properties.state, properties.country]).join(", ");
}

function getPlaceMetadata(properties = {}) {
  const countryCode = String(properties.countrycode || properties.country_code || "").toUpperCase();
  return {
    city: properties.city || properties.name || properties.county ||
      properties.district || "Place not identified",
    region: properties.state || properties.county || properties.district ||
      "Region not identified",
    country: properties.country || "Country not identified",
    countryCode,
    continent: continentFromCode(countryCode)
  };
}

function continentFromCode(code = "") {
  return CONTINENTS[String(code).toUpperCase()] || "Not identified";
}

function unique(values) {
  return values.filter((value, index, array) => value && array.indexOf(value) === index);
}

async function searchPlaces(query) {
  const coordinateMatch = query.trim().match(
    /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/
  );

  if (coordinateMatch) {
    const lat = Number(coordinateMatch[1]);
    const lng = Number(coordinateMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return [{
        geometry: { coordinates: [lng, lat] },
        properties: { name: "Entered coordinates" }
      }];
    }
  }

  const response = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6`
  );
  if (!response.ok) throw new Error("Search service unavailable");
  const data = await response.json();
  return data.features || [];
}

async function reverseGeocode(lat, lng) {
  try {
    const response = await fetch(
      `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&limit=1`
    );
    if (!response.ok) return null;

    const data = await response.json();
    const feature = data.features?.[0];
    if (!feature) return null;

    const properties = feature.properties || {};
    return {
      name: getPlaceName(properties),
      detail: getPlaceDetail(properties) || "Nearest named place.",
      metadata: getPlaceMetadata(properties)
    };
  } catch {
    return null;
  }
}

async function findNearestLandContext(lat, lng, lookupId) {
  const radiiKm = [25, 50, 100, 150, 225, 325, 475, 700, 1000];
  const bearings = Array.from({ length: 16 }, (_, i) => i * 22.5);

  for (const radiusKm of radiiKm) {
    const candidates = bearings.map((bearing) => {
      const point = destinationPoint(lat, lng, radiusKm, bearing);
      return { ...point, radiusKm };
    });

    for (let i = 0; i < candidates.length; i += 4) {
      if (lookupId !== activeLookup) return null;

      const batch = candidates.slice(i, i + 4);
      const results = await Promise.all(
        batch.map(async (candidate) => ({
          candidate,
          place: await reverseGeocode(candidate.lat, candidate.lng)
        }))
      );

      const valid = results
        .filter((item) =>
          item.place &&
          item.place.metadata.country &&
          item.place.metadata.country !== "Country not identified"
        )
        .sort((a, b) => a.candidate.radiusKm - b.candidate.radiusKm);

      if (valid.length) {
        return {
          place: valid[0].place,
          distanceKm: haversineKm(
            lat, lng,
            valid[0].candidate.lat, valid[0].candidate.lng
          )
        };
      }

      await sleep(120);
    }
  }

  return null;
}

function destinationPoint(lat, lng, distanceKm, bearingDeg) {
  const radiusKm = 6371;
  const angular = distanceKm / radiusKm;
  const bearing = toRadians(bearingDeg);
  const lat1 = toRadians(lat);
  const lng1 = toRadians(lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
    Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
  );

  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
    Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    lat: toDegrees(lat2),
    lng: normalizeLongitude(toDegrees(lng2))
  };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const radiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) ** 2;

  return 2 * radiusKm * Math.asin(Math.sqrt(a));
}

const toRadians = (degrees) => degrees * Math.PI / 180;
const toDegrees = (radians) => radians * 180 / Math.PI;
const normalizeLongitude = (lng) => ((lng + 540) % 360) - 180;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function renderSuggestions(features) {
  suggestionsElement.innerHTML = "";
  if (!features.length) {
    suggestionsElement.hidden = true;
    return;
  }

  features.forEach((feature) => {
    const properties = feature.properties || {};
    const [lng, lat] = feature.geometry.coordinates;
    const button = document.createElement("button");

    button.type = "button";
    button.className = "suggestion";
    button.textContent = unique([
      properties.name, properties.city, properties.state, properties.country
    ]).join(", ") || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    button.addEventListener("click", async () => {
      searchInput.value = button.textContent;
      suggestionsElement.hidden = true;

      await chooseLocation(
        lat, lng,
        getPlaceName(properties),
        getPlaceDetail(properties),
        getPlaceMetadata(properties)
      );

      resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    suggestionsElement.appendChild(button);
  });

  suggestionsElement.hidden = false;
}

async function searchAndChoose(query) {
  const cleanQuery = query.trim();
  if (!cleanQuery) return;

  showStatus("Searching…");

  try {
    const features = await searchPlaces(cleanQuery);
    if (!features.length) throw new Error("No result");

    const feature = features[0];
    const properties = feature.properties || {};
    const [lng, lat] = feature.geometry.coordinates;

    searchInput.value = unique([
      properties.name, properties.city, properties.state, properties.country
    ]).join(", ") || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    suggestionsElement.hidden = true;
    showStatus("Finding the nearest country and populated place…");

    await chooseLocation(
      lat, lng,
      getPlaceName(properties),
      getPlaceDetail(properties),
      getPlaceMetadata(properties)
    );

    showStatus("");
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showStatus(
      error.message === "No result"
        ? "No matching place was found. Try a nearby city or coordinates."
        : "The location service is temporarily unavailable."
    );
  }
}

searchInput.addEventListener("input", () => {
  clearTimeout(suggestionTimer);
  const query = searchInput.value.trim();

  if (query.length < 3) {
    renderSuggestions([]);
    return;
  }

  suggestionTimer = setTimeout(async () => {
    try {
      renderSuggestions(await searchPlaces(query));
    } catch {
      renderSuggestions([]);
    }
  }, 330);
});

$("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  searchAndChoose(searchInput.value);
});

async function locateUser() {
  if (!navigator.geolocation) {
    showStatus("Geolocation is not supported by this browser.");
    return;
  }

  showStatus("Requesting your location…");

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      const place = await reverseGeocode(coords.latitude, coords.longitude);
      showStatus("Finding the nearest country and populated place…");

      await chooseLocation(
        coords.latitude,
        coords.longitude,
        place?.name || "Your location",
        place?.detail || "Detected by your device.",
        place?.metadata || {}
      );

      showStatus("");
      resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    () => showStatus("Location access was unavailable. Search for your city instead."),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}

$("#locate-btn").addEventListener("click", locateUser);
$("#header-location-btn").addEventListener("click", locateUser);

$("#new-search-btn").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => {
    searchInput.focus();
    searchInput.select();
  }, 500);
});

$("#copy-btn").addEventListener("click", async () => {
  const text = buildShareText();
  try {
    await navigator.clipboard.writeText(text);
    $("#copy-btn").textContent = "Copied";
    setTimeout(() => { $("#copy-btn").textContent = "Copy result"; }, 1500);
  } catch {
    showStatus(text);
  }
});

$("#share-btn").addEventListener("click", async () => {
  const url = updateShareUrl();
  const shareData = {
    title: "My antipode result",
    text: buildShareText(),
    url
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(url);
      $("#share-btn").textContent = "Link copied";
      setTimeout(() => { $("#share-btn").textContent = "Share link"; }, 1500);
    }
  } catch {
    // User may cancel the share dialog.
  }
});

function buildShareText() {
  const { origin, antipode } = currentResult;
  if (!origin || !antipode) return "AntipodeFinder.com";

  const nearest = antipode.nearest || {};
  return `${origin.name} (${formatCoordinates(origin.lat, origin.lng)}) → ` +
    `${antipode.name} (${formatCoordinates(antipode.lat, antipode.lng)}). ` +
    `Nearest country: ${nearest.country || "not identified"}. ` +
    `Closest place: ${nearest.place || "not identified"}.`;
}

function updateShareUrl() {
  const { origin } = currentResult;
  if (!origin) return window.location.href;

  const url = new URL(window.location.href);
  url.searchParams.set("lat", origin.lat.toFixed(6));
  url.searchParams.set("lng", origin.lng.toFixed(6));
  url.searchParams.set("name", origin.name);
  history.replaceState({}, "", url);
  return url.toString();
}

async function loadSharedLocation() {
  const params = new URLSearchParams(window.location.search);
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const name = params.get("name") || "Shared location";

  if (Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    searchInput.value = name;
    await chooseLocation(lat, lng, name);
  }
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-box")) suggestionsElement.hidden = true;
});

function showStatus(message) {
  statusElement.textContent = message;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

$("#year").textContent = new Date().getFullYear();
loadSharedLocation();
