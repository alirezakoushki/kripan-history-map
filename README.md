# Kripan Village Time Machine

A static CesiumJS web app centered on the real village of Kripan, Álava, Spain (`42.5918, -2.5155`). It loads current OpenStreetMap buildings and local paths through Overpass, extrudes the real footprints in 3D, and presents the village as a small animated historical game board.

## New game-style features

- The camera remains centered on Kripan instead of allowing visitors to roam across an open globe.
- A soft mask hides the surrounding map and leaves the village as the visible game board.
- Miniature animated villagers walk along real current OpenStreetMap routes.
- Villagers periodically stop and perform a simple working animation.
- Profession sets change by era as the timeline moves between 1500 and 2024.
- Imported residents can drive named workers when their records include a profession and occupation years.
- Houses still shrink and disappear when the selected year predates their verified or simulated construction year.
- Terrain lighting, building shadows, the dark historical overlay, fog and Cesium shadows are disabled.
- A compact village-life HUD shows the selected era, number of visible miniature people and representative professions.

## Important historical limitation

The animated professions are illustrative era-based roles. They are not claims that a named person performed that occupation in Kripan.

Current OpenStreetMap roads are used as animation paths. They must not be interpreted as a verified reconstruction of the street network in earlier centuries.

A miniature becomes archival rather than illustrative only when an imported resident record contains a supported `profession`, relevant occupation dates, and source citations. Building chronology remains separate and should be supported by cadastral, municipal, notarial, architectural or equivalent evidence.

## Run locally

The app must be served over HTTP:

```bash
cd kripan-village-game
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Deploy to GitHub Pages

Upload the files inside this folder directly to the root of your GitHub repository:

```text
index.html
app.js
styles.css
README.md
data/
```

Then use:

```text
Settings → Pages → Deploy from a branch → main → /(root)
```

No build step is required.

## Update an existing GitHub deployment

Replace these files in the repository root:

```text
index.html
app.js
styles.css
README.md
```

Also upload the updated `data/import-template.json` when you want the occupation fields in the example schema.

## Cesium token

A Cesium ion token enables Cesium World Terrain and aerial imagery. Open **Data & map**, paste the token and reload. Without a token, the app uses the real OpenStreetMap street layer over an ellipsoid.

## Timeline simulation

**Play backwards** animates 2024 to 1500. Verified houses use their recorded `yearBuilt`. Undated current OSM footprints can use stable pseudo-random appearance years when **Animate estimated history** is enabled.

Those simulated years are excluded from exported archival datasets. Use **Data & map → Generate a new pattern** to change both the building sequence and the illustrative village-life arrangement.

## Occupation-enabled resident record

The standard resident fields remain supported. These optional fields connect a verified person to a miniature worker:

```json
{
  "id": "person-0001",
  "name": "Transcribed full name",
  "birthYear": 1760,
  "deathYear": 1821,
  "houseId": "way/123456",
  "yearMovedIn": 1783,
  "yearMovedOut": null,
  "parentIds": [],
  "spouseId": null,
  "profession": "Vintner",
  "professionIcon": "🍇",
  "professionColor": "#744c64",
  "occupationStartYear": 1780,
  "occupationEndYear": 1815,
  "currentLocation": {
    "status": "deceased",
    "destination": null
  },
  "sources": []
}
```

`professionIcon` and `professionColor` are visual fields. The source citation should support the profession itself and, where possible, its date range.

## Production recommendations

- Cache or proxy Overpass requests for public traffic instead of having every visitor query community endpoints directly.
- Host curated historical data in a database with authenticated editor roles rather than relying on browser local storage.
- Replace illustrative roles with archival occupation records gradually.
- Create historically reconstructed routes only when supported by maps, cadastral plans or other primary evidence.
- Review OpenStreetMap attribution and tile/Overpass usage requirements before municipal publication.
