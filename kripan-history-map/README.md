# Kripan — Houses & Families Through Time

A static, deployable CesiumJS web app centered on the real village of Kripan, Álava, Spain (`42.5918, -2.5155`). It retrieves current building footprints live from OpenStreetMap through the Overpass API, extrudes them on a real 3D globe, and filters verified buildings and residents through a 1500–2024 timeline.

## What is implemented

- CesiumJS real 3D camera, tilt, orbit and geospatial coordinates.
- Cesium World Terrain and aerial imagery when a Cesium ion token is supplied.
- Real OpenStreetMap building footprints loaded through Overpass at runtime.
- 3D polygon extrusion using OSM building levels/height when available.
- Timeline filtering by `yearBuilt` and `yearDemolished`.
- Honest treatment of undated buildings: they remain marked as undated rather than receiving fabricated years.
- Sepia/desaturated early-century rendering that transitions to modern full-color imagery.
- House details, residents at the selected year, and a family relationship view.
- Browser-based curator overrides for house names, streets, years and source references.
- JSON import/export for archival datasets.
- Responsive desktop/mobile interface.

## Run locally

This app must be served over HTTP because browsers block local-file fetches.

```bash
cd kripan-history-map
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Deploy

The folder is static and can be deployed directly to GitHub Pages, Netlify, Cloudflare Pages, an Apache/Nginx directory, or a municipality's existing web server. No build step is required.

## Enable real terrain and aerial imagery

1. Create a Cesium ion account.
2. Create/copy an access token.
3. Open **Data & map** in the app.
4. Paste the token and select **Save & reload**.

Without a token, the app still uses a real OpenStreetMap street layer, but the globe uses an ellipsoid rather than Cesium World Terrain and aerial imagery is disabled.

## Historical data import

Use `data/import-template.json` as the schema. OSM building IDs are shown in the selected house title when a house has no name; use the `way/123456` value as the house `id`.

### House record

```json
{
  "id": "way/123456",
  "latitude": 42.5918,
  "longitude": -2.5155,
  "name": "Casa ...",
  "yearBuilt": 1724,
  "yearDemolished": null,
  "streetName": "...",
  "sourceRef": "Archive/cadastre/notarial citation",
  "yearConfidence": "verified"
}
```

### Resident record

```json
{
  "id": "person-0001",
  "name": "Full transcribed name",
  "birthYear": 1760,
  "deathYear": 1821,
  "houseId": "way/123456",
  "yearMovedIn": 1783,
  "yearMovedOut": null,
  "parentIds": ["person-0002", "person-0003"],
  "spouseId": "person-0004",
  "currentLocation": {
    "status": "deceased",
    "destination": null
  },
  "sources": [{
    "type": "baptism",
    "repository": "Historical Diocesan Archive of Vitoria-Gasteiz",
    "parish": "Kripan",
    "book": "...",
    "folio": "...",
    "recordDate": "1760-01-01"
  }]
}
```

`currentLocation.status` accepts `village`, `moved`, or `deceased`. For `moved`, add a destination.

## Evidence warning

Parish baptism, marriage and death registers can support resident identities, kinship, life dates and sometimes residence statements. They normally do **not**, by themselves, establish a physical building's construction year. Construction chronology should be separately supported by cadastral, municipal, notarial, architectural, tax, building-survey or equivalent primary evidence. The app keeps those provenance channels separate.

## Production recommendations

- Proxy/cache Overpass queries server-side for public traffic rather than sending every visitor directly to community endpoints.
- Add authenticated curator roles and a database instead of relying on browser local storage.
- Store archival image permissions and citations for every transcription.
- Add uncertainty ranges (`yearBuiltMin`, `yearBuiltMax`) where evidence is approximate.
- Review OpenStreetMap attribution and tile/Overpass usage policies before launch.
