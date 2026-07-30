const $ = (selector) => document.querySelector(selector);
const globeEl = $('#globe');
const statusEl = $('#status');
const resultEl = $('#result');
const suggestionsEl = $('#suggestions');
const searchInput = $('#place-search');

let current = { origin: null, antipode: null };
let suggestionTimer;

const world = Globe()(globeEl)
  .backgroundColor('rgba(0,0,0,0)')
  .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
  .showAtmosphere(true)
  .atmosphereColor('#48d9e6')
  .atmosphereAltitude(0.18)
  .pointAltitude(0.035)
  .pointRadius(0.38)
  .pointLabel(d => `<b>${escapeHtml(d.label)}</b><br>${formatCoords(d.lat, d.lng)}`)
  .arcColor(() => ['#47e6d2', '#ffbd59'])
  .arcAltitudeAutoScale(0.28)
  .arcStroke(0.65)
  .arcDashLength(0.5)
  .arcDashGap(0.18)
  .arcDashAnimateTime(1800)
  .onGlobeClick(({ lat, lng }) => selectLocation(lat, lng, 'Selected point'));

world.controls().autoRotate = true;
world.controls().autoRotateSpeed = 0.35;
world.controls().enableDamping = true;
world.pointOfView({ lat: 22, lng: 5, altitude: 2.2 }, 0);

function resizeGlobe() {
  world.width(globeEl.clientWidth).height(globeEl.clientHeight);
}
window.addEventListener('resize', resizeGlobe);
resizeGlobe();

function antipodeOf(lat, lng) {
  return {
    lat: -lat,
    lng: lng >= 0 ? lng - 180 : lng + 180
  };
}

function selectLocation(lat, lng, name = 'Selected point', detail = '') {
  const anti = antipodeOf(Number(lat), Number(lng));
  current = {
    origin: { lat: Number(lat), lng: Number(lng), name, detail },
    antipode: { ...anti, name: 'Opposite point', detail: 'Looking up the nearest named place…' }
  };

  world.controls().autoRotate = false;
  world.pointsData([
    { lat: current.origin.lat, lng: current.origin.lng, color: '#47e6d2', label: name },
    { lat: anti.lat, lng: anti.lng, color: '#ffbd59', label: 'Antipode' }
  ]).pointColor('color');
  world.arcsData([{ startLat: lat, startLng: lng, endLat: anti.lat, endLng: anti.lng }]);
  world.pointOfView({ lat, lng, altitude: 1.75 }, 900);

  renderResult();
  reverseLookup(anti.lat, anti.lng).then(place => {
    if (place) {
      current.antipode.name = place.name;
      current.antipode.detail = place.detail;
    } else {
      current.antipode.detail = 'This point may be in open ocean or far from a named place.';
    }
    renderResult();
  });
}

function renderResult() {
  const { origin, antipode } = current;
  if (!origin || !antipode) return;
  $('#origin-name').textContent = origin.name;
  $('#antipode-name').textContent = antipode.name;
  $('#origin-coords').textContent = formatCoords(origin.lat, origin.lng);
  $('#antipode-coords').textContent = formatCoords(antipode.lat, antipode.lng);
  $('#origin-detail').textContent = origin.detail || 'Your selected location';
  $('#antipode-detail').textContent = antipode.detail || 'Exact opposite point on Earth';
  resultEl.hidden = false;
}

function formatCoords(lat, lng) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

function placeLabel(props = {}) {
  return props.name || props.city || props.state || props.country || 'Selected location';
}

function placeDetail(props = {}) {
  return [props.city, props.state, props.country].filter((v, i, a) => v && a.indexOf(v) === i).join(', ');
}

async function searchPlaces(query) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Search service unavailable');
  const data = await response.json();
  return data.features || [];
}

async function reverseLookup(lat, lng) {
  try {
    const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const feature = data.features?.[0];
    if (!feature) return null;
    const props = feature.properties || {};
    return { name: placeLabel(props), detail: placeDetail(props) || 'Nearest named place' };
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
  features.forEach(feature => {
    const props = feature.properties || {};
    const [lng, lat] = feature.geometry.coordinates;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suggestion';
    btn.textContent = [props.name, props.city, props.state, props.country].filter((v, i, a) => v && a.indexOf(v) === i).join(', ');
    btn.addEventListener('click', () => {
      searchInput.value = btn.textContent;
      suggestionsEl.hidden = true;
      selectLocation(lat, lng, placeLabel(props), placeDetail(props));
      resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    suggestionsEl.appendChild(btn);
  });
  suggestionsEl.hidden = false;
}

searchInput.addEventListener('input', () => {
  clearTimeout(suggestionTimer);
  const q = searchInput.value.trim();
  if (q.length < 3) return renderSuggestions([]);
  suggestionTimer = setTimeout(async () => {
    try { renderSuggestions(await searchPlaces(q)); }
    catch { renderSuggestions([]); }
  }, 350);
});

$('#search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;
  statusEl.textContent = 'Searching…';
  try {
    const features = await searchPlaces(q);
    if (!features.length) throw new Error('No location found');
    const feature = features[0];
    const props = feature.properties || {};
    const [lng, lat] = feature.geometry.coordinates;
    selectLocation(lat, lng, placeLabel(props), placeDetail(props));
    suggestionsEl.hidden = true;
    statusEl.textContent = '';
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    statusEl.textContent = error.message === 'No location found' ? 'No matching location found. Try a nearby city.' : 'Location search is temporarily unavailable.';
  }
});

$('#locate-btn').addEventListener('click', () => {
  if (!navigator.geolocation) {
    statusEl.textContent = 'Geolocation is not supported by this browser.';
    return;
  }
  statusEl.textContent = 'Requesting your location…';
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    const place = await reverseLookup(coords.latitude, coords.longitude);
    selectLocation(coords.latitude, coords.longitude, place?.name || 'Your location', place?.detail || 'Detected by your device');
    statusEl.textContent = '';
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, () => {
    statusEl.textContent = 'Location access was unavailable. Search for your city instead.';
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
});

$('#share-btn').addEventListener('click', async () => {
  if (!current.origin) return;
  const text = `${current.origin.name}: ${formatCoords(current.origin.lat, current.origin.lng)} → antipode ${formatCoords(current.antipode.lat, current.antipode.lng)} (${current.antipode.name}) — AntipodeFinder.com`;
  try {
    await navigator.clipboard.writeText(text);
    $('#share-btn').textContent = 'Copied!';
    setTimeout(() => $('#share-btn').textContent = 'Copy result', 1600);
  } catch {
    statusEl.textContent = text;
  }
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.search-box')) suggestionsEl.hidden = true;
});

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

$('#year').textContent = new Date().getFullYear();
