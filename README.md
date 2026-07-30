# AntipodeFinder.com MVP

A responsive static website with:
- Interactive 3D Earth powered by Globe.GL
- Search autocomplete powered by Photon / OpenStreetMap data
- Browser geolocation
- Click-anywhere globe selection
- Antipode coordinate calculation
- Reverse place lookup
- Copyable result

## Run locally
Because browser geolocation and API requests work best from a web server, do not open `index.html` directly.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy
Upload the three site files to the web root of AntipodeFinder.com, or drag the folder into Netlify / Cloudflare Pages / GitHub Pages.

## Production notes
- Use HTTPS; browser geolocation generally requires a secure context.
- The demo calls the public Photon endpoint. For sustained production traffic, use a commercial geocoder or host your own Photon instance.
- Add privacy, terms, analytics, sitemap, robots.txt, and cookie controls as appropriate before monetization.
