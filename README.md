# AntipodeFinder V5

Bright production-style redesign with richer antipode information.

## Included files

- `index.html`
- `assets/css/styles.css`
- `assets/js/app.js`

## New in V5

- New headline: “What’s on the other side of Earth?”
- Exact antipode coordinates
- Ocean/land indication
- Estimated nearest country
- Estimated nearest populated place
- Approximate distance to identified nearby land/place
- Continent field
- Shareable URL parameters
- Copy result and Share link buttons
- Direct coordinate search, such as `34.02, -6.84`
- Existing city search, suggestions, geolocation, globe click, markers, and animated arc

## Important accuracy note

The nearest-country feature performs a progressive radial search using public reverse-geocoding results. It is useful for discovery, but the distance is approximate and may identify the nearest named feature rather than the mathematically exact coastline point.

## Installation

Replace the matching files in your project and test locally.

```bash
git add .
git commit -m "Launch AntipodeFinder V5"
git push
```
