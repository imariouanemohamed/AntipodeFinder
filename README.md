# AntipodeFinder V8

## Main changes

- Enlarged and freed the globe so it is no longer squeezed between the information cards.
- Moved the globe upward and increased its visual scale.
- Reduced and compacted the location cards.
- Added real local time to both the origin and antipode cards.
- Replaced weather descriptions with current temperature only.
- Added explicit Day / Night status to both cards.
- Removed Time Difference from the sidebar and metric strip.
- Removed Ocean Explorer from the sidebar and Explore More section.
- Fixed live data loading: origin and antipode time, temperature, and day/night now load together.
- Retained nearest country, nearest place, coastline distance, exact coordinates, recent searches, Random Explorer, and Famous Places.

## Deployment

After replacing the old project files:

```bash
git add .
git commit -m "Launch AntipodeFinder V8"
git push origin main
```

## External services

- Open-Meteo: local time, current temperature, and day/night
- Photon / OpenStreetMap: search and reverse geocoding
- World Atlas + Turf.js: country and coastline analysis
- Globe.gl: interactive Earth
