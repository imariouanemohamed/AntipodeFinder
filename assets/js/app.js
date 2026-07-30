const $ = (selector) => document.querySelector(selector);

const globeElement = $("#globe");
const statusElement = $("#status");
const resultSection = $("#result-section");
const suggestionsElement = $("#suggestions");
const searchInput = $("#place-search");

let currentResult = { origin: null, antipode: null };
let activeLookup = 0;
let suggestionTimer;
let geographicEnginePromise;

const COUNTRY_DATA_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

const CONTINENT_BY_CODE = {
  MA: "Africa", DZ: "Africa", TN: "Africa", EG: "Africa", ZA: "Africa",
  NG: "Africa", KE: "Africa", ET: "Africa", GH: "Africa", SN: "Africa",
  NZ: "Oceania", AU: "Oceania", FJ: "Oceania", PG: "Oceania",
  US: "North America", CA: "North America", MX: "North America",
  BR: "South America", AR: "South America", CL: "South America",
  PE: "South America", CO: "South America",
  CN: "Asia", JP: "Asia", IN: "Asia", ID: "Asia", PH: "Asia",
  KR: "Asia", SA: "Asia", AE: "Asia", TH: "Asia", VN: "Asia",
  ES: "Europe", FR: "Europe", GB: "Europe", DE: "Europe",
  IT: "Europe", PT: "Europe", NL: "Europe", BE: "Europe",
  TR: "Europe / Asia", RU: "Europe / Asia"
};

const OCEANIA_COUNTRIES = new Set([
  "Australia", "New Zealand", "Fiji", "Papua New Guinea", "Solomon Islands",
  "Vanuatu", "Samoa", "Tonga", "Kiribati", "Micronesia", "Palau",
  "Marshall Islands", "Nauru", "Tuvalu", "New Caledonia", "Niue",
  "Cook Islands", "French Polynesia", "American Samoa", "Guam",
  "Northern Mariana Islands", "Wallis and Futuna"
]);

const AFRICA_COUNTRIES = new Set([
  "Morocco", "Algeria", "Tunisia", "Libya", "Egypt", "South Africa",
  "Namibia", "Botswana", "Zimbabwe", "Mozambique", "Madagascar",
  "Kenya", "Tanzania", "Ethiopia", "Somalia", "Sudan", "South Sudan",
  "Nigeria", "Ghana", "Senegal", "Mali", "Mauritania", "Niger",
  "Chad", "Cameroon", "Angola", "Zambia", "Uganda", "Rwanda",
  "Burundi", "Gabon", "Congo", "Democratic Republic of the Congo"
]);

const SOUTH_AMERICA_COUNTRIES = new Set([
  "Brazil", "Argentina", "Chile", "Peru", "Bolivia", "Paraguay",
  "Uruguay", "Colombia", "Venezuela", "Ecuador", "Guyana", "Suriname"
]);

const NORTH_AMERICA_COUNTRIES = new Set([
  "United States of America", "United States", "Canada", "Mexico",
  "Greenland", "Cuba", "Haiti", "Dominican Republic", "Jamaica",
  "Guatemala", "Belize", "Honduras", "El Salvador", "Nicaragua",
  "Costa Rica", "Panama", "The Bahamas"
]);

const EUROPE_COUNTRIES = new Set([
  "France", "Spain", "Portugal", "Germany", "Italy", "United Kingdom",
  "Ireland", "Belgium", "Netherlands", "Luxembourg", "Switzerland",
  "Austria", "Poland", "Czechia", "Slovakia", "Hungary", "Romania",
  "Bulgaria", "Greece", "Norway", "Sweden", "Finland", "Denmark",
  "Iceland", "Ukraine", "Belarus", "Moldova", "Croatia", "Serbia",
  "Bosnia and Herzegovina", "Slovenia", "Albania", "North Macedonia",
  "Montenegro", "Estonia", "Latvia", "Lithuania"
]);

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

/* -------------------------------------------------------------------------- */
/* V6 geographic engine                                                       */
/* -------------------------------------------------------------------------- */

async function loadGeographicEngine() {
  if (geographicEnginePromise) return geographicEnginePromise;

  geographicEnginePromise = (async () => {
    if (!window.topojson || !window.turf) {
      throw new Error("Geographic libraries did not load.");
    }

    const response = await fetchWithTimeout(COUNTRY_DATA_URL, {}, 15000);
    if (!response.ok) throw new Error("Country coastline data is unavailable.");

    const topology = await response.json();
    const collection = window.topojson.feature(
      topology,
      topology.objects.countries
    );

    const countries = collection.features
      .filter((feature) => feature?.geometry)
      .map((feature) => {
        const name =
          feature.properties?.name ||
          feature.properties?.NAME ||
          feature.properties?.admin ||
          "Unknown country";

        return {
          feature,
          name,
          continent: continentFromCountry(name),
          lines: geometryToLines(feature),
          center: safeCentroid(feature)
        };
      });

    return { countries };
  })();

  return geographicEnginePromise;
}

function geometryToLines(feature) {
  try {
    const converted = turf.polygonToLine(feature);
    const lines = [];

    turf.flattenEach(converted, (line) => {
      if (line?.geometry?.coordinates?.length) lines.push(line);
    });

    return lines;
  } catch {
    return [];
  }
}

function safeCentroid(feature) {
  try {
    return turf.centroid(feature);
  } catch {
    return null;
  }
}

function findContainingCountry(point, countries) {
  for (const country of countries) {
    try {
      if (turf.booleanPointInPolygon(point, country.feature)) return country;
    } catch {
      // Ignore invalid small geometries.
    }
  }
  return null;
}

async function analyseOriginLocation(lat, lng) {
  let reversePlace = null;

  try {
    reversePlace = await reverseGeocode(lat, lng);
  } catch {
    reversePlace = null;
  }

  let polygonCountry = null;

  try {
    const engine = await loadGeographicEngine();
    polygonCountry = findContainingCountry(
      turf.point([lng, lat]),
      engine.countries
    );
  } catch {
    polygonCountry = null;
  }

  const reverseCountry = reversePlace?.metadata?.country;
  const country =
    reverseCountry && reverseCountry !== "Country not identified"
      ? reverseCountry
      : polygonCountry?.name || "Country not identified";

  const city =
    reversePlace?.metadata?.city &&
    reversePlace.metadata.city !== "Place not identified"
      ? reversePlace.metadata.city
      : reversePlace?.name &&
        !["Selected point", "Shared location", "Entered coordinates"].includes(reversePlace.name)
        ? reversePlace.name
        : country !== "Country not identified"
          ? `Location in ${country}`
          : "Selected point";

  let region = reversePlace?.metadata?.region || "";

  if (
    !region ||
    region === "Region not identified" ||
    region === city
  ) {
    region =
      country !== "Country not identified"
        ? country
        : "Region not identified";
  }

  const countryCode = reversePlace?.metadata?.countryCode || "";
  const continent =
    reversePlace?.metadata?.continent &&
    reversePlace.metadata.continent !== "Not identified"
      ? reversePlace.metadata.continent
      : polygonCountry?.continent ||
        continentFromCode(countryCode, country);

  return {
    name: city,
    detail:
      reversePlace?.detail ||
      (country !== "Country not identified"
        ? `Selected coordinates in ${country}.`
        : "Your selected coordinates."),
    metadata: {
      city,
      region,
      country,
      countryCode,
      continent
    }
  };
}

function findNearestCountryAndCoast(point, countries) {
  let best = null;

  for (const country of countries) {
    for (const line of country.lines) {
      try {
        const nearest = turf.nearestPointOnLine(line, point, { units: "kilometers" });
        const distance =
          Number(nearest.properties?.dist) ||
          turf.distance(point, nearest, { units: "kilometers" });

        if (!best || distance < best.distanceKm) {
          best = {
            country,
            coastPoint: nearest,
            distanceKm: distance
          };
        }
      } catch {
        // Continue with remaining coastline segments.
      }
    }
  }

  return best;
}

async function analyseAntipode(lat, lng, lookupId) {
  const engine = await loadGeographicEngine();
  if (lookupId !== activeLookup) return null;

  const point = turf.point([lng, lat]);
  const containingCountry = findContainingCountry(point, engine.countries);

  if (containingCountry) {
    const exactPlace = await reverseGeocode(lat, lng);

    return {
      exactOnLand: true,
      locationType: "Land",
      oceanName: "",
      country: containingCountry.name,
      continent: containingCountry.continent,
      distanceKm: 0,
      coastCoordinates: { lat, lng },
      place:
        exactPlace?.metadata?.city ||
        exactPlace?.name ||
        `A location in ${containingCountry.name}`,
      region:
        exactPlace?.metadata?.region ||
        containingCountry.name,
      detail:
        `The exact antipode is on land in ${containingCountry.name}.`
    };
  }

  const nearest = findNearestCountryAndCoast(point, engine.countries);
  if (!nearest) throw new Error("Nearest coastline could not be calculated.");

  const coastLng = nearest.coastPoint.geometry.coordinates[0];
  const coastLat = nearest.coastPoint.geometry.coordinates[1];
  const nearbyPlace = await findNearbyNamedPlace(
    coastLat,
    coastLng,
    nearest.country
  );

  return {
    exactOnLand: false,
    locationType: classifyOcean(lat, lng),
    oceanName: classifyOcean(lat, lng),
    country: nearest.country.name,
    continent: nearest.country.continent,
    distanceKm: nearest.distanceKm,
    coastCoordinates: { lat: coastLat, lng: coastLng },
    place:
      nearbyPlace?.metadata?.city ||
      nearbyPlace?.name ||
      `Nearest coast of ${nearest.country.name}`,
    region:
      nearbyPlace?.metadata?.region ||
      `Coast of ${nearest.country.name}`,
    detail:
      `The exact antipode lies in ${classifyOcean(lat, lng)}. ` +
      `The nearest coastline belongs to ${nearest.country.name}.`
  };
}

async function findNearbyNamedPlace(coastLat, coastLng, country) {
  const direct = await reverseGeocode(coastLat, coastLng);
  if (hasUsefulPlaceName(direct)) return direct;

  if (!country.center) return direct;

  try {
    const coastPoint = turf.point([coastLng, coastLat]);
    const centerPoint = country.center;

    for (const distanceKm of [8, 20, 45]) {
      const bearing = turf.bearing(coastPoint, centerPoint);
      const inland = turf.destination(
        coastPoint,
        distanceKm,
        bearing,
        { units: "kilometers" }
      );

      if (!turf.booleanPointInPolygon(inland, country.feature)) continue;

      const [lng, lat] = inland.geometry.coordinates;
      const place = await reverseGeocode(lat, lng);
      if (hasUsefulPlaceName(place)) return place;
    }
  } catch {
    // The exact nearest country and distance still remain available.
  }

  return direct;
}

function hasUsefulPlaceName(place) {
  if (!place) return false;
  const city = place.metadata?.city || "";
  return ![
    "", "Place not identified", "Country not identified",
    "Region not identified"
  ].includes(city);
}

function classifyOcean(lat, lng) {
  if (lat <= -60) return "Southern Ocean";
  if (lat >= 66) return "Arctic Ocean";

  const normalizedLng = normalizeLongitude(lng);

  if (lat >= 30 && normalizedLng >= -6 && normalizedLng <= 43) {
    return "Mediterranean region";
  }

  if (
    normalizedLng >= 20 &&
    normalizedLng <= 120 &&
    lat < 30 &&
    lat > -60
  ) {
    return lat >= 0 ? "North Indian Ocean" : "South Indian Ocean";
  }

  if (
    normalizedLng >= -70 &&
    normalizedLng <= 20 &&
    lat > -60
  ) {
    return lat >= 0 ? "North Atlantic Ocean" : "South Atlantic Ocean";
  }

  return lat >= 0 ? "North Pacific Ocean" : "South Pacific Ocean";
}

function continentFromCountry(name) {
  if (OCEANIA_COUNTRIES.has(name)) return "Oceania";
  if (AFRICA_COUNTRIES.has(name)) return "Africa";
  if (SOUTH_AMERICA_COUNTRIES.has(name)) return "South America";
  if (NORTH_AMERICA_COUNTRIES.has(name)) return "North America";
  if (EUROPE_COUNTRIES.has(name)) return "Europe";

  if (name === "Russia" || name === "Turkey" || name === "Kazakhstan") {
    return "Europe / Asia";
  }

  return "Asia";
}

/* -------------------------------------------------------------------------- */
/* Search and result rendering                                                */
/* -------------------------------------------------------------------------- */

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

  const lookupId = ++activeLookup;

  /*
   * Globe clicks and shared coordinates do not initially contain city,
   * region, or country metadata. Reverse-geocode the starting point first
   * so its report is as complete as a typed search result.
   */
  const needsOriginLookup =
    !metadata.country ||
    metadata.country === "Country not identified" ||
    name === "Selected point" ||
    name === "Shared location" ||
    name === "Entered coordinates";

  if (needsOriginLookup) {
    showStatus("Identifying the selected location…");
    const identifiedOrigin = await analyseOriginLocation(
      latitude,
      longitude
    );

    if (lookupId !== activeLookup) return;

    if (identifiedOrigin) {
      name = identifiedOrigin.name || name;
      detail = identifiedOrigin.detail || detail;
      metadata = {
        ...metadata,
        ...identifiedOrigin.metadata
      };
    }
  }

  const antipode = calculateAntipode(latitude, longitude);

  currentResult = {
    origin: {
      lat: latitude,
      lng: longitude,
      name,
      detail: detail || "Your selected location.",
      metadata: {
        city:
          metadata.city && metadata.city !== "Place not identified"
            ? metadata.city
            : name,
        region:
          metadata.region && metadata.region !== "Region not identified"
            ? metadata.region
            : metadata.country || "Region not identified",
        country: metadata.country || "Country not identified",
        countryCode: metadata.countryCode || "",
        continent:
          metadata.continent && metadata.continent !== "Not identified"
            ? metadata.continent
            : continentFromCode(metadata.countryCode)
      }
    },
    antipode: {
      ...antipode,
      name: "Analysing location",
      detail: "Loading coastline data and calculating the nearest land…",
      metadata: {
        city: "Calculating…",
        region: "Calculating…",
        country: "Calculating…",
        countryCode: "",
        continent: "Calculating…"
      },
      nearest: {
        place: "Calculating…",
        country: "Calculating…",
        distanceKm: null,
        exactOnLand: false
      },
      locationType: "Calculating…"
    }
  };

  globe.controls().autoRotate = false;
  globe.pointsData([
    { lat: latitude, lng: longitude, color: "#1875ff", label: name },
    { lat: antipode.lat, lng: antipode.lng, color: "#ff7a18", label: "Antipode" }
  ]).pointColor("color");

  globe.arcsData([{
    startLat: latitude,
    startLng: longitude,
    endLat: antipode.lat,
    endLng: antipode.lng
  }]);

  globe.pointOfView({ lat: latitude, lng: longitude, altitude: 1.65 }, 1100);

  renderResult();
  resultSection.hidden = false;
  showStatus("Calculating the nearest country, coastline, and populated place…");

  try {
    const analysis = await analyseAntipode(antipode.lat, antipode.lng, lookupId);
    if (!analysis || lookupId !== activeLookup) return;

    currentResult.antipode.name =
      analysis.exactOnLand ? analysis.place : analysis.locationType;
    currentResult.antipode.detail = analysis.detail;
    currentResult.antipode.locationType = analysis.locationType;
    currentResult.antipode.metadata = {
      city: analysis.place,
      region: analysis.region,
      country: analysis.country,
      countryCode: "",
      continent: analysis.continent
    };
    currentResult.antipode.nearest = {
      place: analysis.place,
      country: analysis.country,
      distanceKm: analysis.distanceKm,
      exactOnLand: analysis.exactOnLand
    };

    showStatus("");
  } catch (error) {
    if (lookupId !== activeLookup) return;

    console.error(error);
    currentResult.antipode.name = classifyOcean(antipode.lat, antipode.lng);
    currentResult.antipode.detail =
      "The exact antipode is in open ocean. The geographic data service could not finish the nearest-land calculation.";
    currentResult.antipode.locationType = classifyOcean(antipode.lat, antipode.lng);
    currentResult.antipode.metadata = {
      city: "Unavailable",
      region: "Unavailable",
      country: "Unavailable",
      countryCode: "",
      continent: "Unavailable"
    };
    currentResult.antipode.nearest = {
      place: "Unavailable",
      country: "Unavailable",
      distanceKm: null,
      exactOnLand: false
    };

    showStatus("The result loaded, but nearest-land data is temporarily unavailable.");
  } finally {
    if (lookupId === activeLookup) {
      renderResult();
      updateShareUrl();
    }
  }
}

function renderResult() {
  const { origin, antipode } = currentResult;
  if (!origin || !antipode) return;

  $("#floating-origin-name").textContent = origin.metadata.city || origin.name;
  $("#floating-origin-coords").textContent = formatCoordinates(origin.lat, origin.lng);
  $("#floating-origin-country").textContent = origin.metadata.country;

  $("#floating-antipode-name").textContent = antipode.name;
  $("#floating-antipode-coords").textContent = formatCoordinates(antipode.lat, antipode.lng);
  $("#floating-antipode-country").textContent =
    antipode.nearest?.country &&
    !["Calculating…", "Unavailable"].includes(antipode.nearest.country)
      ? `Nearest: ${antipode.nearest.country}`
      : antipode.nearest?.country || "Calculating…";

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
    antipode.locationType ||
    (antipode.nearest?.exactOnLand ? "Land" : "Open ocean");
  $("#antipode-country").textContent =
    antipode.nearest?.country || antipode.metadata.country;
  $("#antipode-nearest-place").textContent =
    antipode.nearest?.place || "Calculating…";

  $("#antipode-nearest-distance").textContent =
    antipode.nearest?.distanceKm === 0
      ? "At the exact point"
      : Number.isFinite(antipode.nearest?.distanceKm)
        ? `Approximately ${Math.round(antipode.nearest.distanceKm)} km to land`
        : antipode.nearest?.country === "Unavailable"
          ? "Unavailable"
          : "Calculating…";

  $("#antipode-region").textContent = antipode.metadata.region;
  $("#antipode-continent").textContent =
    antipode.metadata.continent || "Not identified";

  const nearestCountry = antipode.nearest?.country;
  const nearestPlace = antipode.nearest?.place;
  const distance = antipode.nearest?.distanceKm;

  if (antipode.nearest?.exactOnLand) {
    $("#result-summary").textContent =
      `The exact antipode of ${origin.name} is on land near ${nearestPlace}, ${nearestCountry}.`;
  } else if (
    nearestCountry &&
    !["Calculating…", "Unavailable"].includes(nearestCountry) &&
    Number.isFinite(distance)
  ) {
    $("#result-summary").textContent =
      `The exact antipode of ${origin.name} lies in ${antipode.locationType}. ` +
      `The nearest country is ${nearestCountry}. Its coastline is approximately ` +
      `${Math.round(distance)} km from the exact antipode, and the nearest identified place is ${nearestPlace}.`;
  } else if (nearestCountry === "Unavailable") {
    $("#result-summary").textContent =
      `The exact antipode of ${origin.name} lies in ${antipode.locationType}. ` +
      `Nearest-land information is temporarily unavailable.`;
  } else {
    $("#result-summary").textContent =
      `The exact antipode of ${origin.name} is being analysed using country and coastline data.`;
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
  return unique([
    properties.city,
    properties.state,
    properties.country
  ]).join(", ");
}

function getPlaceMetadata(properties = {}) {
  const countryCode = String(
    properties.countrycode || properties.country_code || ""
  ).toUpperCase();

  const city =
    properties.city ||
    properties.town ||
    properties.village ||
    properties.hamlet ||
    properties.name ||
    properties.county ||
    properties.district ||
    "Place not identified";

  let region =
    properties.state ||
    properties.region ||
    properties.province ||
    properties.county ||
    properties.district ||
    "";

  if (!region || region === city) {
    region = properties.country || "Region not identified";
  }

  return {
    city,
    region,
    country: properties.country || "Country not identified",
    countryCode,
    continent: continentFromCode(countryCode, properties.country || "")
  };
}

function continentFromCode(code = "", countryName = "") {
  const byCode = CONTINENT_BY_CODE[String(code).toUpperCase()];
  if (byCode) return byCode;
  if (countryName) return continentFromCountry(countryName);
  return "Not identified";
}

function unique(values) {
  return values.filter(
    (value, index, array) =>
      value && array.indexOf(value) === index
  );
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

  const response = await fetchWithTimeout(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6`,
    {},
    10000
  );

  if (!response.ok) throw new Error("Search service unavailable");
  const data = await response.json();
  return data.features || [];
}

async function reverseGeocode(lat, lng) {
  try {
    const response = await fetchWithTimeout(
      `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&limit=1`,
      {},
      9000
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

async function fetchWithTimeout(resource, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(resource, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
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
    button.textContent =
      unique([
        properties.name,
        properties.city,
        properties.state,
        properties.country
      ]).join(", ") || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    button.addEventListener("click", async () => {
      searchInput.value = button.textContent;
      suggestionsElement.hidden = true;

      await chooseLocation(
        lat,
        lng,
        getPlaceName(properties),
        getPlaceDetail(properties),
        getPlaceMetadata(properties)
      );

      resultSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
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

    searchInput.value =
      unique([
        properties.name,
        properties.city,
        properties.state,
        properties.country
      ]).join(", ") || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    suggestionsElement.hidden = true;

    await chooseLocation(
      lat,
      lng,
      getPlaceName(properties),
      getPlaceDetail(properties),
      getPlaceMetadata(properties)
    );

    resultSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
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
  if (!window.isSecureContext) {
    showStatus("Current location requires HTTPS. Open the live AntipodeFinder.com website rather than a local file.");
    return;
  }

  if (!navigator.geolocation) {
    showStatus("Geolocation is not supported by this browser.");
    return;
  }

  showStatus("Allow location access in your browser to continue…");

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      showStatus("Location found. Calculating your antipode…");

      const place = await reverseGeocode(
        coords.latitude,
        coords.longitude
      );

      await chooseLocation(
        coords.latitude,
        coords.longitude,
        place?.name || "Your current location",
        place?.detail || "Detected by your device.",
        place?.metadata || {}
      );

      resultSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    },
    (error) => {
      const messages = {
        1: "Location permission was denied. Click the lock icon beside the website address, allow Location, then try again.",
        2: "Your position could not be determined. Check that device location services are enabled.",
        3: "Finding your location took too long. Try again or search for your city."
      };

      showStatus(
        messages[error.code] ||
        "Location access failed. Search for your city instead."
      );

      currentLocationTab?.classList.remove("active");
      searchLocationTab?.classList.add("active");
      currentLocationTab?.setAttribute("aria-selected", "false");
      searchLocationTab?.setAttribute("aria-selected", "true");
    },
    {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 600000
    }
  );
}

const currentLocationTab = $("#current-location-tab");
const searchLocationTab = $("#search-location-tab");
const headerLocationButton = $("#header-location-btn");

function setFinderMode(mode) {
  const useCurrentLocation = mode === "current";

  currentLocationTab?.classList.toggle("active", useCurrentLocation);
  searchLocationTab?.classList.toggle("active", !useCurrentLocation);

  currentLocationTab?.setAttribute("aria-selected", String(useCurrentLocation));
  searchLocationTab?.setAttribute("aria-selected", String(!useCurrentLocation));

  if (useCurrentLocation) {
    locateUser();
  } else {
    searchInput.focus();
  }
}

currentLocationTab?.addEventListener("click", () => setFinderMode("current"));
searchLocationTab?.addEventListener("click", () => setFinderMode("search"));
headerLocationButton?.addEventListener("click", () => setFinderMode("current"));

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
    setTimeout(() => {
      $("#copy-btn").textContent = "Copy result";
    }, 1500);
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
      setTimeout(() => {
        $("#share-btn").textContent = "Share link";
      }, 1500);
    }
  } catch {
    // The user may cancel the system share dialog.
  }
});

function buildShareText() {
  const { origin, antipode } = currentResult;
  if (!origin || !antipode) return "AntipodeFinder.com";

  const nearest = antipode.nearest || {};

  return `${origin.name} (${formatCoordinates(origin.lat, origin.lng)}) → ` +
    `${antipode.name} (${formatCoordinates(antipode.lat, antipode.lng)}). ` +
    `Nearest country: ${nearest.country || "not identified"}. ` +
    `Closest identified place: ${nearest.place || "not identified"}.`;
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

  if (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  ) {
    searchInput.value = name;
    await chooseLocation(lat, lng, name);
  }
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-box")) {
    suggestionsElement.hidden = true;
  }
});

function showStatus(message) {
  statusElement.textContent = message;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    })[character]
  );
}

const normalizeLongitude = (lng) => ((lng + 540) % 360) - 180;

$("#year").textContent = new Date().getFullYear();

/* Start downloading the coastline engine early, without blocking the page. */
loadGeographicEngine().catch((error) => {
  console.warn("V6 geographic engine preload failed:", error);
});

loadSharedLocation();
