# AntipodeFinder V6.4

V6 replaces the unreliable repeated ocean reverse-geocoding loop with a coastline-based geographic engine.

## Main fix

V5 searched many points around an ocean antipode and waited for a geocoder to return a country. That could remain stuck on “Searching...”.

V6 instead:

1. Loads Natural Earth country geometry through `world-atlas`.
2. Tests whether the exact antipode is on land.
3. If it is over water, calculates the closest point on all country coastlines.
4. Identifies the nearest country directly from the coastline geometry.
5. Uses reverse geocoding only to add a nearby named place.
6. Always exits the loading state with either a result or a clear “Unavailable” message.

## V6 result fields

- Exact antipode coordinates
- Land or ocean classification
- Approximate ocean name
- Nearest country
- Closest identified populated place or coastal area
- Approximate distance to coastline
- Region
- Continent
- Shareable result URL
- Copy and share controls

## Accuracy note

Country and coastline calculations use the Natural Earth 1:50m world dataset. Distances are geographic estimates suitable for an educational website, not legal, navigational, or surveying use. The closest named place depends on the public Photon/OpenStreetMap geocoder.

## Deployment

Replace your existing project files with this folder and run:

```bash
git add .
git commit -m "Launch AntipodeFinder V6 geographic engine"
git push
```

## External browser resources

V6 loads:

- Globe.gl
- TopoJSON Client
- Turf.js
- World Atlas country geometry
- Photon geocoding

Cloudflare Workers should serve the project normally because these resources are requested by the visitor's browser.


## V6.1 interface update

- Added a two-option segmented control inside the main finder:
  - Use my current location
  - Choose another location
- Removed the separate “Use my current location” button below the search bar.
- Selecting “Use my current location” immediately starts browser geolocation.
- Selecting “Choose another location” focuses the city/country/address search field.


## V6.2 location-button fix

- Fixed a JavaScript error caused by a listener targeting the removed `#locate-btn`.
- Connected the new “Use my current location” tab correctly.
- Added secure-context detection because browser geolocation requires HTTPS.
- Added clearer messages for denied permission, unavailable position, and timeout.
- Changed geolocation to a faster balanced accuracy mode.


## V6.3 globe-click location fix

- Globe clicks now reverse-geocode the starting coordinates before displaying the report.
- Starting city, region, country, and continent are populated whenever the geocoder has data.
- Shared URLs and manually entered coordinates receive the same metadata lookup.
- Added Niue and additional Pacific territories to Oceania classification.
- Prevented a town name from being repeated incorrectly as the region.


## V6.4 robust globe-click identification

- Globe clicks no longer depend only on Photon reverse geocoding.
- The app now checks the clicked coordinate against the country polygon dataset.
- Country and continent are still identified when no nearby city is returned.
- Region falls back to the country instead of remaining blank.
- Remote deserts and sparsely mapped areas return a useful result such as “Location in Sudan”.
