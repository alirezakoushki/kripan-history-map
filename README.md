# Kripan Village Time Game — focused-board edition

A static CesiumJS web app that turns the real OpenStreetMap footprint of Kripan, Álava into a bounded miniature village time game.

## Player experience

- Opens directly over the detected centre of Kripan’s main building cluster.
- Keeps the globe and map outside the village board hidden.
- Uses a clean token-free map style; visitors are never asked for a Cesium token.
- Shows only compact game controls: centre, orbit, play/pause, year and house count.
- Animates buildings shrinking and disappearing as the timeline moves backwards.
- Shows larger miniature villagers walking and working on routes inside the village board.
- Changes illustrative professions by historical era.
- Uses colourful extruded walls and lighter roofs for a miniature-game appearance.
- Disables terrain, globe, building and character shadows.

## Public URL

The normal GitHub Pages URL is player mode.

## Historian/admin mode

Append `?admin=1` to the URL to reveal Archive Tools and local house-editing controls:

```text
https://USERNAME.github.io/kripan-history-map/?admin=1
```

The public player interface does not expose archival import/export controls.

## Deploy

Upload the contents of this folder to the root of the GitHub repository and replace the existing files. GitHub Pages can remain configured as:

```text
Branch: main
Folder: /(root)
```

No build command or API token is required.

## Data honesty

OpenStreetMap supplies current footprints and routes. Simulated construction years, occupations and unnamed walkers are illustrative placeholders, not historical claims. Verified construction dates and genealogical records should be imported with archival citations.
