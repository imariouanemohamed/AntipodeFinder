const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const globeElement = $("#globe");
const statusElement = $("#status");
const resultSection = $("#result-section");
const suggestionsElement = $("#suggestions");
const searchInput = $("#place-search");

let currentResult = { origin: null, antipode: null };
let activeLookup = 0;
let suggestionTimer;

const globe = Globe()(globeElement)
  .backgroundColor("rgba(0,0,0,0)")
  .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
  .bumpImageUrl("https://unpkg.com/three-globe/example/img/earth-topology.png")
  .showAtmosphere(true)
  .atmosphereColor("#56dfeb")
  .atmosphereAltitude(0.18)
  .pointAltitude(0.03)
  .pointRadius(0.34)
  .pointLabel(
    (point) =>
      `<strong>${escapeHtml(point.label)}</strong><br>${formatCoordinates(point.lat, point.lng)}`
  )
  .arcColor(() => ["#47e6d2", "#ffb95d"])
  .arcAltitudeAutoScale(0.32)
  .arcStroke(0.62)
  .arcDashLength(0.42)
  .arcDashGap(0.14)
  .arcDashAnimateTime(1700)
  .onGlobeClick(({ lat, lng }) => {
    chooseLocation(lat, lng, "Selected point");
  });

globe.controls().autoRotate = true;
globe.controls().autoRotateSpeed = 0.38;
globe.controls().enableDamping = true;
globe.pointOfView({ lat: 24, lng: -12, altitude: 2.1 }, 0);

function resizeGlobe() {
  globe.width(globeElement.clientWidth).height(globeElement.clientHeight);
}

window.addEventListener("resize", resizeGlobe);
resizeGlobe();

function calculateAntipode(lat, lng) {
  return {
    lat: -lat,
    lng: lng >= 0 ? lng - 180 : lng + 180
  };
}

function chooseLocation(lat, lng, name = "Selected point", detail = "", metadata = {}) {
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
        country: metadata.country || "Country not identified"
      }
    },
    antipode: {
      ...antipode,
      name: "Opposite point",
      detail: "Searching for the nearest named place.",
      metadata: {
        city: "Searching…",
        region: "Searching…",
        country: "Searching…"
      }
    }
  };

  globe.controls().autoRotate = false;

  globe
    .pointsData([
      {
        lat: latitude,
        lng: longitude,
        color: "#47e6d2",
        label: name
      },
      {
        lat: antipode.lat,
        lng: antipode.lng,
        color: "#ffb95d",
        label: "Antipode"
      }
    ])
    .pointColor("color");

  globe.arcsData([
    {
      startLat: latitude,
      startLng: longitude,
      endLat: antipode.lat,
      endLng: antipode.lng
    }
  ]);

  globe.pointOfView(
    { lat: latitude, lng: longitude, altitude: 1.68 },
    1050
  );

  renderResult();
  resultSection.hidden = false;

  window.setTimeout(() => {
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 260);

  reverseGeocode(antipode.lat, antipode.lng).then((place) => {
    if (lookupId !== activeLookup) return;

    if (place) {
      currentResult.antipode = {
        ...currentResult.antipode,
        name: place.name,
        detail: place.detail,
        metadata: place.metadata
      };
    } else {
      currentResult.antipode = {
        ...currentResult.antipode,
        name: "Open ocean",
        detail: "The exact point appears to be in open ocean or far from a named place.",
        metadata: {
          city: "Open ocean",
          region: "Remote marine area",
          country: "No country identified"
        }
      };
    }

    renderResult();
  });
}

function renderResult() {
  const { origin, antipode } = currentResult;
  if (!origin || !antipode) return;

  $("#result-origin-title").textContent = origin.name;
  $("#result-antipode-title").textContent = antipode.name;

  $("#origin-city").textContent = origin.metadata.city;
  $("#origin-detail").textContent = origin.detail;
  $("#origin-coords").textContent = formatCoordinates(origin.lat, origin.lng);
  $("#origin-region").textContent = origin.metadata.region;
  $("#origin-country").textContent = origin.metadata.country;

  $("#antipode-city").textContent = antipode.metadata.city;
  $("#antipode-detail").textContent = antipode.detail;
  $("#antipode-coords").textContent = formatCoordinates(antipode.lat, antipode.lng);
  $("#antipode-region").textContent = antipode.metadata.region;
  $("#antipode-country").textContent = antipode.metadata.country;
}

function formatCoordinates(lat, lng) {
  const latitudeDirection = lat >= 0 ? "N" : "S";
  const longitudeDirection = lng >= 0 ? "E" : "W";

  return `${Math.abs(lat).toFixed(4)}° ${latitudeDirection}, ${Math.abs(lng).toFixed(4)}° ${longitudeDirection}`;
}

function getPlaceName(properties = {}) {
  return (
    properties.name ||
    properties.city ||
    properties.county ||
    properties.state ||
    properties.country ||
    "Selected location"
  );
}

function getPlaceDetail(properties = {}) {
  return unique([
    properties.city,
    properties.state,
    properties.country
  ]).join(", ");
}

function getPlaceMetadata(properties = {}) {
  return {
    city:
      properties.city ||
      properties.name ||
      properties.county ||
      properties.district ||
      "Place not identified",
    region:
      properties.state ||
      properties.county ||
      properties.district ||
      "Region not identified",
    country: properties.country || "Country not identified"
  };
}

function unique(values) {
  return values.filter(
    (value, index, array) => value && array.indexOf(value) === index
  );
}

async function searchPlaces(query) {
  const response = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6`
  );

  if (!response.ok) {
    throw new Error("Search service unavailable");
  }

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
      detail: getPlaceDetail(properties) || "Nearest named place to the exact antipode.",
      metadata: getPlaceMetadata(properties)
    };
  } catch {
    return null;
  }
}

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
      properties.name,
      properties.city,
      properties.state,
      properties.country
    ]).join(", ");

    button.addEventListener("click", () => {
      searchInput.value = button.textContent;
      suggestionsElement.hidden = true;

      chooseLocation(
        lat,
        lng,
        getPlaceName(properties),
        getPlaceDetail(properties),
        getPlaceMetadata(properties)
      );
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

    if (!features.length) {
      throw new Error("No result");
    }

    const feature = features[0];
    const properties = feature.properties || {};
    const [lng, lat] = feature.geometry.coordinates;

    searchInput.value = unique([
      properties.name,
      properties.city,
      properties.state,
      properties.country
    ]).join(", ");

    suggestionsElement.hidden = true;
    showStatus("");

    chooseLocation(
      lat,
      lng,
      getPlaceName(properties),
      getPlaceDetail(properties),
      getPlaceMetadata(properties)
    );
  } catch (error) {
    showStatus(
      error.message === "No result"
        ? "No matching place was found. Try a nearby city or country."
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

  suggestionTimer = window.setTimeout(async () => {
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

$("#locate-btn").addEventListener("click", () => {
  if (!navigator.geolocation) {
    showStatus("Geolocation is not supported by this browser.");
    return;
  }

  showStatus("Requesting your location…");

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      const place = await reverseGeocode(coords.latitude, coords.longitude);

      showStatus("");

      chooseLocation(
        coords.latitude,
        coords.longitude,
        place?.name || "Your location",
        place?.detail || "Detected by your device.",
        place?.metadata || {}
      );
    },
    () => {
      showStatus("Location access was unavailable. Search for your city instead.");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    }
  );
});

$$("[data-place]").forEach((button) => {
  button.addEventListener("click", () => {
    searchInput.value = button.dataset.place;
    searchAndChoose(button.dataset.place);
  });
});

$("#new-search-btn").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
  window.setTimeout(() => {
    searchInput.focus();
    searchInput.select();
  }, 550);
});

$("#copy-btn").addEventListener("click", async () => {
  const { origin, antipode } = currentResult;
  if (!origin || !antipode) return;

  const text =
    `${origin.name} (${formatCoordinates(origin.lat, origin.lng)}) → ` +
    `${antipode.name} (${formatCoordinates(antipode.lat, antipode.lng)}) — ` +
    `AntipodeFinder.com`;

  try {
    await navigator.clipboard.writeText(text);
    $("#copy-btn").textContent = "Copied";

    window.setTimeout(() => {
      $("#copy-btn").textContent = "Copy result";
    }, 1500);
  } catch {
    showStatus(text);
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-panel")) {
    suggestionsElement.hidden = true;
  }
});

function showStatus(message) {
  statusElement.textContent = message;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
      })[character]
  );
}

$("#year").textContent = new Date().getFullYear();
