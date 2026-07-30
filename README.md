# AntipodeFinder V7.1

A corrected public-facing version of the V7 dashboard.

## What is operational

- Search by city, country, address, landmark, or coordinates
- Browser current location
- Clickable 3D globe
- Exact antipode coordinates
- Country polygon detection
- Nearest country and coastline calculation
- Approximate distance to land
- Ocean/land classification
- Real current temperature, weather description, local time, UTC offset, and day/night from Open-Meteo
- Recent searches
- Random explorer
- Famous-place explorer
- Shareable URLs
- Copy and share result
- Details modal

## Important V7.1 corrections

- Removed the premature Premium card.
- Removed placeholder labels such as “API ready” and “Ocean data”.
- Correctly separates:
  - Through-Earth distance: about 12,742 km
  - Surface antipodal distance: about 20,015 km
- Replaced ocean depth with the operational distance-to-land calculation.
- Unfinished tools are explicitly labeled “Coming soon”.
- Lowered and resized the globe to prevent overlap with the metrics.
- Added popular searches and a cleaner footer.

## Deployment

```bash
git add .
git commit -m "Launch AntipodeFinder V7.1"
git push
```

## External services

- Photon / OpenStreetMap for place search and reverse geocoding
- Open-Meteo for current weather and local timezone
- World Atlas + Turf.js for country and coastline analysis
- Globe.gl for the 3D Earth

## V7.1.1 sidebar cleanup

- Removed Travel Planner from the sidebar and Explore More section.
- Removed Tectonic Plates from the sidebar.
