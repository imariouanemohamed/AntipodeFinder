const $ = (selector) => document.querySelector(selector);

const globeEl = $('#globe');
const statusEl = $('#status');
const resultEl = $('#result');
const suggestionsEl = $('#suggestions');
const searchInput = $('#place-search');

let current = {
  origin: null,
  antipode: null
};

let suggestionTimer;

const world = Globe()(globeEl)
  .backgroundColor('rgba(0,0,0,0)')
  .globeImageUrl(
    'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
  )
  .bumpImageUrl(
    'https://unpkg.com/three-globe/example/img/earth-topology.png'
  )
  .showAtmosphere(true)
  .atmosphereColor('#48d9e6')
  .atmosphereAltitude(0.18)
  .pointAltitude(0.035)
  .pointRadius(0.38)
  .pointLabel(
    (point) =>
      `<b>${escapeHtml(point.label)}</b><br>${formatCoords(
        point.lat,
        point.lng
      )}`
  )
  .arcColor(() => ['#47e6d2', '#ffbd59'])
  .arcAltitudeAutoScale(0.28)
  .arcStroke(0.65)
  .arcDashLength(0.5)
  .arcDashGap(0.18)
  .arcDashAnimateTime(1800)
  .onGlobeClick(({ lat, lng }) => {
    selectLocation(lat, lng, 'Selected point');
  });

world.controls().autoRotate = true;
world.controls().autoRotateSpeed = 0.35;
world.controls().enableDamping = true;

world.pointOfView(
  {
    lat: 22,
    lng: 5,
    altitude: 2.2
  },
  0
);

function resizeGlobe() {
  world
    .width(globeEl.clientWidth)
    .height(globeEl.clientHeight);
}

window.addEventListener('resize', resizeGlobe);
resizeGlobe();

function antipodeOf(lat, lng) {
  return {
    lat: -lat,
    lng: lng >= 0 ? lng - 180 : lng + 180
  };
}

function selectLocation(
  lat,
  lng,
  name = 'Selected point',
  detail = '',
  metadata = {}
) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  const anti = antipodeOf(latitude, longitude);

  current = {
    origin: {
      lat: latitude,
      lng: longitude,
      name,
      detail,
      metadata: {
        city: metadata.city || name,
        region: metadata.region || 'Not identified',
        country: metadata.country || 'Not identified'
      }
    },

    antipode: {
      ...anti,
      name: 'Opposite point',
      detail: 'Looking up the nearest named place…',
      metadata: {
        city: 'Searching…',
        region: 'Searching…',
        country: 'Searching…'
      }
    }
  };

  world.controls().autoRotate = false;

  world
    .pointsData([
      {
        lat: current.origin.lat,
        lng: current.origin.lng,
        color: '#47e6d2',
        label: name
      },
      {
        lat: anti.lat,
        lng: anti.lng,
        color: '#ffbd59',
        label: 'Antipode'
      }
    ])
    .pointColor('color');

  world.arcsData([
    {
      startLat: latitude,
      startLng: longitude,
      endLat: anti.lat,
      endLng: anti.lng
    }
  ]);

  world.pointOfView(
    {
      lat: latitude,
      lng: longitude,
      altitude: 1.75
    },
    900
  );

  renderResult();

  reverseLookup(anti.lat, anti.lng).then((place) => {
    if (place) {
      current.antipode.name = place.name;
      current.antipode.detail = place.detail;
      current.antipode.metadata = place.metadata;
    } else {
      current.antipode.detail =
        'This point may be in open ocean or far from a named place.';

      current.antipode.metadata = {
        city: 'No nearby named place',
        region: 'Open ocean or remote area',
        country: 'Not identified'
      };
    }

    renderResult();
  });
}

function renderResult() {
  const { origin, antipode } = current;

  if (!origin || !antipode) {
    return;
  }

  $('#origin-name').textContent = origin.name;
  $('#antipode-name').textContent = antipode.name;

  $('#origin-coords').textContent = formatCoords(
    origin.lat,
    origin.lng
  );

  $('#antipode-coords').textContent = formatCoords(
    antipode.lat,
    antipode.lng
  );

  $('#origin-detail').textContent =
    origin.detail || 'Your selected location';

  $('#antipode-detail').textContent =
    antipode.detail || 'Exact opposite point on Earth';

  $('#origin-city').textContent =
    origin.metadata?.city || 'Not identified';

  $('#origin-region').textContent =
    origin.metadata?.region || 'Not identified';

  $('#origin-country').textContent =
    origin.metadata?.country || 'Not identified';

  $('#antipode-city').textContent =
    antipode.metadata?.city || 'Not identified';

  $('#antipode-region').textContent =
    antipode.metadata?.region || 'Not identified';

  $('#antipode-country').textContent =
    antipode.metadata?.country || 'Not identified';

  resultEl.hidden = false;
}

function formatCoords(lat, lng) {
  const northSouth = lat >= 0 ? 'N' : 'S';
  const eastWest = lng >= 0 ? 'E' : 'W';

  return `${Math.abs(lat).toFixed(4)}° ${northSouth}, ${Math.abs(
    lng
  ).toFixed(4)}° ${eastWest}`;
}

function placeLabel(properties = {}) {
  return (
    properties.name ||
    properties.city ||
    properties.state ||
    properties.country ||
    'Selected location'
  );
}

function placeDetail(properties = {}) {
  return [
    properties.city,
    properties.state,
    properties.country
  ]
    .filter(
      (value, index, array) =>
        value && array.indexOf(value) === index
    )
    .join(', ');
}

function placeMetadata(properties = {}) {
  return {
    city:
      properties.city ||
      properties.name ||
      properties.county ||
      properties.district ||
      'Not identified',

    region:
      properties.state ||
      properties.county ||
      properties.district ||
      'Not identified',

    country:
      properties.country ||
      'Not identified'
  };
}

async function searchPlaces(query) {
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}` +
    '&limit=5';

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Search service unavailable');
  }

  const data = await response.json();

  return data.features || [];
}

async function reverseLookup(lat, lng) {
  try {
    const url =
      `https://photon.komoot.io/reverse?lat=${lat}` +
      `&lon=${lng}&limit=1`;

    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const feature = data.features?.[0];

    if (!feature) {
      return null;
    }

    const properties = feature.properties || {};

    return {
      name: placeLabel(properties),
      detail:
        placeDetail(properties) || 'Nearest named place',
      metadata: placeMetadata(properties)
    };
  } catch {
    return null;
  }
}

function renderSuggestions(features) {
  suggestionsEl.innerHTML = '';

  if (!features.length) {
    suggestionsEl.hidden = true;
    return;
  }

  features.forEach((feature) => {
    const properties = feature.properties || {};
    const [lng, lat] = feature.geometry.coordinates;

    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'suggestion';

    button.textContent = [
      properties.name,
      properties.city,
      properties.state,
      properties.country
    ]
      .filter(
        (value, index, array) =>
          value && array.indexOf(value) === index
      )
      .join(', ');

    button.addEventListener('click', () => {
      searchInput.value = button.textContent;
      suggestionsEl.hidden = true;

      selectLocation(
        lat,
        lng,
        placeLabel(properties),
        placeDetail(properties),
        placeMetadata(properties)
      );

      resultEl.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    });

    suggestionsEl.appendChild(button);
  });

  suggestionsEl.hidden = false;
}

searchInput.addEventListener('input', () => {
  clearTimeout(suggestionTimer);

  const query = searchInput.value.trim();

  if (query.length < 3) {
    renderSuggestions([]);
    return;
  }

  suggestionTimer = setTimeout(async () => {
    try {
      const features = await searchPlaces(query);
      renderSuggestions(features);
    } catch {
      renderSuggestions([]);
    }
  }, 350);
});

$('#search-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  const query = searchInput.value.trim();

  if (!query) {
    return;
  }

  statusEl.textContent = 'Searching…';

  try {
    const features = await searchPlaces(query);

    if (!features.length) {
      throw new Error('No location found');
    }

    const feature = features[0];
    const properties = feature.properties || {};
    const [lng, lat] = feature.geometry.coordinates;

    selectLocation(
      lat,
      lng,
      placeLabel(properties),
      placeDetail(properties),
      placeMetadata(properties)
    );

    suggestionsEl.hidden = true;
    statusEl.textContent = '';

    resultEl.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  } catch (error) {
    statusEl.textContent =
      error.message === 'No location found'
        ? 'No matching location found. Try a nearby city.'
        : 'Location search is temporarily unavailable.';
  }
});

$('#locate-btn').addEventListener('click', () => {
  if (!navigator.geolocation) {
    statusEl.textContent =
      'Geolocation is not supported by this browser.';
    return;
  }

  statusEl.textContent = 'Requesting your location…';

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      const place = await reverseLookup(
        coords.latitude,
        coords.longitude
      );

      selectLocation(
        coords.latitude,
        coords.longitude,
        place?.name || 'Your location',
        place?.detail || 'Detected by your device',
        place?.metadata || {}
      );

      statusEl.textContent = '';

      resultEl.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    },

    () => {
      statusEl.textContent =
        'Location access was unavailable. Search for your city instead.';
    },

    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    }
  );
});

$('#share-btn').addEventListener('click', async () => {
  if (!current.origin) {
    return;
  }

  const text =
    `${current.origin.name}: ` +
    `${formatCoords(current.origin.lat, current.origin.lng)} ` +
    `→ antipode ${formatCoords(
      current.antipode.lat,
      current.antipode.lng
    )} (${current.antipode.name}) — AntipodeFinder.com`;

  try {
    await navigator.clipboard.writeText(text);

    $('#share-btn').textContent = 'Copied!';

    setTimeout(() => {
      $('#share-btn').textContent = 'Copy result';
    }, 1600);
  } catch {
    statusEl.textContent = text;
  }
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.search-box')) {
    suggestionsEl.hidden = true;
  }
});

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      })[character]
  );
}

$('#year').textContent = new Date().getFullYear();