const KRIPAN = { lat: 42.5918, lon: -2.5155, radiusMeters: 900 };
const STORAGE = {
  token: "kripan.cesiumToken",
  dataset: "kripan.historyDataset",
  houseOverrides: "kripan.houseOverrides",
  imagery: "kripan.imagery",
  simulation: "kripan.simulationMode",
  simulationSeed: "kripan.simulationSeed"
};

const state = {
  viewer: null,
  imageryLayer: null,
  entities: new Map(),
  houses: [],
  residents: [],
  selectedHouse: null,
  selectedResidentId: null,
  year: 2024,
  showUndated: true,
  orbiting: false,
  orbitFrame: null,
  orbitHeading: 0,
  importedDataset: null,
  houseOverrides: {},
  imageryMode: localStorage.getItem(STORAGE.imagery) || "aerial",
  simulateUndated: localStorage.getItem(STORAGE.simulation) !== "false",
  simulationSeed: Number(localStorage.getItem(STORAGE.simulationSeed)) || 4215918,
  timelinePlaying: false,
  timelineFrame: null,
  timelineStartTime: 0,
  timelineStartYear: 2024,
  timelineDurationMs: 18000,
  houseAnimationFrame: null,
  houseAnimationLastTime: 0
};

const el = Object.fromEntries([
  "loadingDot","statusTitle","statusDetail","yearSlider","yearOutput","periodLabel","visibleHouseCount",
  "showUndatedToggle","detailsPanel","houseEyebrow","houseTitle","houseSubtitle","houseQuality","residentsYear",
  "residentCount","currentResidents","familyTree","treeFocusLabel","closePanelButton","settingsButton","settingsDialog",
  "tokenInput","saveTokenButton","clearTokenButton","aerialButton","streetButton","importFileInput","importButton",
  "exportButton","importMessage","resetViewButton","orbitButton","historicalWash","houseForm","editHouseName",
  "editStreetName","editYearBuilt","editYearDemolished","editSourceRef","toast","simulationToggle",
  "playTimelineButton","rerollSimulationButton","simulationSeedLabel"
].map(id => [id, document.getElementById(id)]));

boot().catch(error => {
  console.error(error);
  setStatus("Map initialization failed", error.message, "error");
});

async function boot() {
  if (!window.Cesium) throw new Error("CesiumJS did not load. Check the network connection.");
  state.houseOverrides = readJsonStorage(STORAGE.houseOverrides, {});
  state.importedDataset = readJsonStorage(STORAGE.dataset, null) || await fetchJson("./data/history.json");
  state.residents = normalizeResidents(state.importedDataset?.residents || []);
  bindUi();
  await createViewer();
  resetView(false);
  await loadBuildings();
  updateTimeline();
}

function bindUi() {
  el.yearSlider.addEventListener("input", () => {
    stopTimelinePlayback();
    state.year = Number(el.yearSlider.value);
    if (!state.simulateUndated && state.year < 2024 && !el.showUndatedToggle.dataset.touched) {
      state.showUndated = false;
      el.showUndatedToggle.checked = false;
    }
    updateTimeline();
  });
  el.showUndatedToggle.addEventListener("change", () => {
    el.showUndatedToggle.dataset.touched = "true";
    state.showUndated = el.showUndatedToggle.checked;
    updateTimeline();
  });
  el.simulationToggle.addEventListener("change", () => {
    state.simulateUndated = el.simulationToggle.checked;
    localStorage.setItem(STORAGE.simulation, String(state.simulateUndated));
    updateSimulationUi();
    updateTimeline();
  });
  el.playTimelineButton.addEventListener("click", toggleTimelinePlayback);
  el.rerollSimulationButton.addEventListener("click", rerollSimulation);
  el.closePanelButton.addEventListener("click", closeDetails);
  el.settingsButton.addEventListener("click", openSettings);
  el.resetViewButton.addEventListener("click", () => resetView(true));
  el.orbitButton.addEventListener("click", toggleOrbit);
  el.saveTokenButton.addEventListener("click", saveToken);
  el.clearTokenButton.addEventListener("click", clearToken);
  el.aerialButton.addEventListener("click", () => setImageryMode("aerial"));
  el.streetButton.addEventListener("click", () => setImageryMode("street"));
  el.importButton.addEventListener("click", importDataset);
  el.exportButton.addEventListener("click", exportDataset);
  el.houseForm.addEventListener("submit", saveHouseOverride);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeDetails();
  });
  el.simulationToggle.checked = state.simulateUndated;
  updateSimulationUi();
}

async function createViewer() {
  const token = localStorage.getItem(STORAGE.token)?.trim();
  if (token) Cesium.Ion.defaultAccessToken = token;

  const baseLayer = createBaseLayer(state.imageryMode, Boolean(token));
  const options = {
    baseLayer,
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    infoBox: false,
    selectionIndicator: false,
    fullscreenButton: false,
    shouldAnimate: true
  };
  if (token) options.terrain = Cesium.Terrain.fromWorldTerrain({ requestVertexNormals: true });

  state.viewer = new Cesium.Viewer("cesiumContainer", options);
  state.imageryLayer = state.viewer.imageryLayers.get(0);
  state.viewer.scene.globe.depthTestAgainstTerrain = true;
  state.viewer.scene.globe.enableLighting = Boolean(token);
  state.viewer.scene.fog.enabled = true;
  state.viewer.scene.screenSpaceCameraController.minimumZoomDistance = 35;
  state.viewer.scene.screenSpaceCameraController.maximumZoomDistance = 9000;
  state.viewer.scene.skyAtmosphere.show = true;
  state.viewer.cesiumWidget.creditContainer.style.display = "block";

  const handler = new Cesium.ScreenSpaceEventHandler(state.viewer.scene.canvas);
  handler.setInputAction(event => {
    const picked = state.viewer.scene.pick(event.position);
    const entity = picked?.id;
    if (entity?.kripanHouseId) openHouse(entity.kripanHouseId);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  updateImageryButtons();
  applyHistoricalStyle();
}

function createBaseLayer(mode, hasToken) {
  if (hasToken) {
    const style = mode === "street" ? Cesium.IonWorldImageryStyle.ROAD : Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS;
    return Cesium.ImageryLayer.fromWorldImagery({ style });
  }
  return new Cesium.ImageryLayer(new Cesium.OpenStreetMapImageryProvider({
    url: "https://tile.openstreetmap.org/",
    credit: "© OpenStreetMap contributors"
  }));
}

async function setImageryMode(mode) {
  const token = localStorage.getItem(STORAGE.token)?.trim();
  if (mode === "aerial" && !token) {
    showToast("Add a Cesium ion token to use aerial imagery and World Terrain.");
    openSettings();
    return;
  }
  state.imageryMode = mode;
  localStorage.setItem(STORAGE.imagery, mode);
  const newLayer = createBaseLayer(mode, Boolean(token));
  state.viewer.imageryLayers.removeAll();
  state.viewer.imageryLayers.add(newLayer);
  state.imageryLayer = state.viewer.imageryLayers.get(0);
  updateImageryButtons();
  applyHistoricalStyle();
}

function updateImageryButtons() {
  el.aerialButton.classList.toggle("is-active", state.imageryMode === "aerial");
  el.streetButton.classList.toggle("is-active", state.imageryMode === "street");
}

async function loadBuildings() {
  setStatus("Loading Kripan building footprints…", "Querying OpenStreetMap through Overpass", "loading");
  const elements = await fetchOverpassBuildings();
  const importedHouses = new Map((state.importedDataset?.houses || []).map(h => [normalizeHouseId(h.id || h.osmId), h]));

  state.houses = elements
    .map(overpassWayToHouse)
    .filter(Boolean)
    .map(osmHouse => mergeHouseData(osmHouse, importedHouses.get(osmHouse.id), state.houseOverrides[osmHouse.id]))
    .map(house => ({ ...house, simulatedYearBuilt: simulatedYearForHouse(house.id, state.simulationSeed) }));

  for (const house of state.houses) addHouseEntity(house);

  const dated = state.houses.filter(h => Number.isFinite(h.yearBuilt)).length;
  const simulated = state.houses.length - dated;
  setStatus(
    `${state.houses.length} live OSM buildings loaded`,
    `${dated} evidence-dated · ${simulated} available for visual simulation`,
    "ok"
  );
}

async function fetchOverpassBuildings() {
  const query = `[out:json][timeout:35];way["building"](around:${KRIPAN.radiusMeters},${KRIPAN.lat},${KRIPAN.lon});out tags geom;`;
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter"
  ];
  let lastError;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: `data=${encodeURIComponent(query)}`
      });
      if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.elements)) throw new Error("Unexpected Overpass response");
      return data.elements;
    } catch (error) {
      lastError = error;
      console.warn("Overpass endpoint failed", endpoint, error);
    }
  }
  throw new Error(`Could not retrieve OSM footprints. ${lastError?.message || "All Overpass endpoints failed."}`);
}

function overpassWayToHouse(element) {
  if (element.type !== "way" || !Array.isArray(element.geometry) || element.geometry.length < 4) return null;
  const coordinates = element.geometry.map(p => [Number(p.lon), Number(p.lat)]);
  const first = coordinates[0], last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([...first]);
  const tags = element.tags || {};
  const center = polygonCentroid(coordinates);
  const parsedYear = parseYear(tags.start_date || tags["building:start_date"]);
  return {
    id: `way/${element.id}`,
    osmId: `way/${element.id}`,
    latitude: center[1],
    longitude: center[0],
    name: tags.name || tags["addr:housename"] || null,
    yearBuilt: parsedYear,
    yearDemolished: null,
    streetName: tags["addr:street"] || null,
    houseNumber: tags["addr:housenumber"] || null,
    levels: positiveNumber(tags["building:levels"]),
    heightMeters: positiveNumber(tags.height),
    buildingType: tags.building || "yes",
    coordinates,
    sourceRef: parsedYear ? `OpenStreetMap start_date=${tags.start_date || tags["building:start_date"]}` : null,
    yearConfidence: parsedYear ? "osm-tagged" : "unknown"
  };
}

function mergeHouseData(osm, imported, override) {
  const merged = { ...osm, ...(imported || {}), ...(override || {}) };
  merged.id = osm.id;
  merged.osmId = osm.osmId;
  merged.coordinates = osm.coordinates;
  merged.latitude = Number(imported?.latitude ?? osm.latitude);
  merged.longitude = Number(imported?.longitude ?? osm.longitude);
  merged.yearBuilt = nullableYear(merged.yearBuilt);
  merged.yearDemolished = nullableYear(merged.yearDemolished);
  return merged;
}

function addHouseEntity(house) {
  const flat = house.coordinates.flatMap(([lon, lat]) => [lon, lat]);
  const height = house.heightMeters || (house.levels ? house.levels * 3.1 : 7.5);
  const initialColor = house.yearBuilt ? colorForYear(house.yearBuilt, 1) : Cesium.Color.fromCssColorString("#a9a49a");
  const visual = {
    baseHeight: height,
    scale: 1,
    targetScale: 1,
    alpha: house.yearBuilt ? .84 : .40,
    targetAlpha: house.yearBuilt ? .84 : .40,
    color: initialColor
  };
  const entity = state.viewer.entities.add({
    id: `kripan-${house.id}`,
    name: house.name || house.streetName || house.id,
    polygon: {
      hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
      height: 0,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      extrudedHeight: new Cesium.CallbackProperty(() => visual.baseHeight * Math.max(0, visual.scale), false),
      extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
      material: new Cesium.ColorMaterialProperty(new Cesium.CallbackProperty(
        () => visual.color.withAlpha(Math.max(0, visual.alpha)),
        false
      )),
      outline: true,
      outlineColor: new Cesium.CallbackProperty(
        () => Cesium.Color.fromCssColorString("#e8ddc8").withAlpha(Math.max(0, visual.alpha * .66)),
        false
      ),
      closeTop: true,
      closeBottom: true
    },
    show: true
  });
  entity.kripanHouseId = house.id;
  entity.kripanVisual = visual;
  state.entities.set(house.id, entity);
}

function updateTimeline() {
  state.year = Number(el.yearSlider.value);
  el.yearOutput.value = String(state.year);
  el.periodLabel.textContent = periodForYear(state.year);
  el.residentsYear.textContent = String(state.year);
  let visible = 0;
  for (const house of state.houses) {
    const entity = state.entities.get(house.id);
    const hasVerifiedYear = Number.isFinite(house.yearBuilt);
    const effectiveYear = hasVerifiedYear ? house.yearBuilt : (state.simulateUndated ? house.simulatedYearBuilt : null);
    const datedVisible = Number.isFinite(effectiveYear) && effectiveYear <= state.year && (!house.yearDemolished || state.year < house.yearDemolished);
    const undatedVisible = !hasVerifiedYear && !state.simulateUndated && state.showUndated;
    const show = datedVisible || undatedVisible;
    if (entity) {
      const baseColor = hasVerifiedYear
        ? colorForYear(house.yearBuilt, 1)
        : state.simulateUndated
          ? simulationColorForYear(house.simulatedYearBuilt)
          : Cesium.Color.fromCssColorString("#a9a49a");
      const alpha = hasVerifiedYear ? .84 : (state.simulateUndated ? .64 : (state.year === 2024 ? .40 : .22));
      setHouseVisualTarget(entity, show, baseColor, alpha);
    }
    if (show) visible++;
  }
  el.visibleHouseCount.textContent = String(visible);
  applyHistoricalStyle();
  if (state.selectedHouse) renderHousePanel();
}

function setHouseVisualTarget(entity, show, color, alpha) {
  const visual = entity.kripanVisual;
  if (!visual) {
    entity.show = show;
    return;
  }
  visual.color = color;
  visual.targetScale = show ? 1 : 0;
  visual.targetAlpha = show ? alpha : 0;
  if (show) entity.show = true;
  ensureHouseAnimation();
}

function ensureHouseAnimation() {
  if (state.houseAnimationFrame) return;
  state.houseAnimationLastTime = performance.now();
  state.houseAnimationFrame = requestAnimationFrame(animateHouseTransitions);
}

function animateHouseTransitions(now) {
  const dt = Math.min(.05, Math.max(.001, (now - state.houseAnimationLastTime) / 1000));
  state.houseAnimationLastTime = now;
  const blend = 1 - Math.exp(-dt * 10);
  let active = false;

  for (const entity of state.entities.values()) {
    const visual = entity.kripanVisual;
    if (!visual) continue;
    visual.scale += (visual.targetScale - visual.scale) * blend;
    visual.alpha += (visual.targetAlpha - visual.alpha) * blend;
    const scaleGap = Math.abs(visual.targetScale - visual.scale);
    const alphaGap = Math.abs(visual.targetAlpha - visual.alpha);
    if (scaleGap > .004 || alphaGap > .004) active = true;
    if (visual.targetScale === 0 && visual.scale < .012 && visual.alpha < .012) {
      visual.scale = 0;
      visual.alpha = 0;
      entity.show = false;
    }
  }

  state.viewer?.scene.requestRender();
  if (active) {
    state.houseAnimationFrame = requestAnimationFrame(animateHouseTransitions);
  } else {
    state.houseAnimationFrame = null;
  }
}

function applyHistoricalStyle() {
  const t = smoothstep((state.year - 1500) / (2024 - 1500));
  if (state.imageryLayer) {
    state.imageryLayer.saturation = 0.05 + .95 * t;
    state.imageryLayer.brightness = .74 + .26 * t;
    state.imageryLayer.contrast = 1.26 - .26 * t;
    state.imageryLayer.gamma = .86 + .14 * t;
    state.imageryLayer.hue = .055 * (1 - t);
  }
  const alpha = .34 * (1 - t);
  el.historicalWash.style.background = `rgba(109, 65, 24, ${alpha.toFixed(3)})`;
  document.documentElement.style.setProperty("--accent", mixHex("#b88a47", "#d8b56b", t));
}

function openHouse(houseId) {
  state.selectedHouse = state.houses.find(h => h.id === houseId) || null;
  state.selectedResidentId = null;
  if (!state.selectedHouse) return;
  renderHousePanel();
  el.detailsPanel.classList.add("is-open");
  el.detailsPanel.setAttribute("aria-hidden", "false");
  document.body.classList.add("panel-open");
}

function closeDetails() {
  el.detailsPanel.classList.remove("is-open");
  el.detailsPanel.setAttribute("aria-hidden", "true");
  document.body.classList.remove("panel-open");
}

function renderHousePanel() {
  const house = state.selectedHouse;
  if (!house) return;
  const address = [house.streetName, house.houseNumber].filter(Boolean).join(" ");
  el.houseEyebrow.textContent = Number.isFinite(house.yearBuilt)
    ? `Built ${house.yearBuilt}`
    : state.simulateUndated
      ? `Simulated appearance ${house.simulatedYearBuilt}`
      : "Construction date unverified";
  el.houseTitle.textContent = house.name || address || `OSM ${house.id}`;
  el.houseSubtitle.textContent = [address, `${house.latitude.toFixed(5)}, ${house.longitude.toFixed(5)}`].filter(Boolean).join(" · ");
  el.houseQuality.textContent = houseQualityText(house);

  const occupants = residentsInHouseAtYear(house.id, state.year);
  el.residentCount.textContent = String(occupants.length);
  el.currentResidents.className = occupants.length ? "resident-list" : "resident-list empty-state";
  el.currentResidents.innerHTML = "";
  if (!occupants.length) {
    el.currentResidents.textContent = "No verified resident records are linked to this house for the selected year.";
  } else {
    for (const person of occupants) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `resident-card${state.selectedResidentId === person.id ? " is-active" : ""}`;
      button.innerHTML = `<strong>${escapeHtml(person.name)}</strong><span>${lifeLabel(person)} · ${locationLabel(person)}</span>`;
      button.addEventListener("click", () => {
        state.selectedResidentId = person.id;
        renderHousePanel();
      });
      el.currentResidents.appendChild(button);
    }
  }

  if (!state.selectedResidentId && occupants[0]) state.selectedResidentId = occupants[0].id;
  renderFamilyTree(state.selectedResidentId);
  fillHouseForm(house);
}

function renderFamilyTree(personId) {
  const person = state.residents.find(p => p.id === personId);
  el.familyTree.innerHTML = "";
  if (!person) {
    el.treeFocusLabel.textContent = "Choose a resident";
    el.familyTree.className = "family-tree empty-state";
    el.familyTree.textContent = "The tree appears after a resident record is selected.";
    return;
  }
  el.familyTree.className = "family-tree";
  el.treeFocusLabel.textContent = person.name;
  const parents = (person.parentIds || []).map(id => findResident(id)).filter(Boolean);
  const spouse = person.spouseId ? findResident(person.spouseId) : null;
  const children = state.residents.filter(p => (p.parentIds || []).includes(person.id));
  const household = [person, spouse].filter(Boolean);
  const relatedIds = new Set([...parents, ...household, ...children].map(p => p.id));
  const movedRelations = state.residents.filter(p => relatedIds.has(p.id) && p.currentLocation?.status === "moved");

  appendGeneration("Parents / ancestors", parents);
  appendGeneration("Household", household, person.id);
  appendGeneration("Children / descendants", children);
  if (movedRelations.length) appendGeneration("Moved away", movedRelations);

  function appendGeneration(label, people, focusId = null) {
    if (!people.length) return;
    const section = document.createElement("div");
    section.className = "tree-generation";
    section.innerHTML = `<div class="tree-generation-label">${escapeHtml(label)}</div>`;
    const nodes = document.createElement("div");
    nodes.className = "tree-nodes";
    for (const p of people) nodes.appendChild(personCard(p, p.id === focusId));
    section.appendChild(nodes);
    el.familyTree.appendChild(section);
  }
}

function personCard(person, focus = false) {
  const card = document.createElement("div");
  card.className = `person-card${focus ? " focus" : ""}${person.currentLocation?.status === "moved" ? " moved" : ""}`;
  const location = locationLabel(person);
  card.innerHTML = `<strong>${escapeHtml(person.name)}</strong><span>${lifeLabel(person)}</span><span class="location-badge">${escapeHtml(location)}</span>`;
  return card;
}

function residentsInHouseAtYear(houseId, year) {
  return state.residents.filter(person => {
    if (normalizeHouseId(person.houseId) !== houseId) return false;
    const movedIn = person.yearMovedIn ?? person.birthYear ?? 1500;
    const movedOut = person.yearMovedOut ?? Infinity;
    const born = person.birthYear ?? 1500;
    const died = person.deathYear ?? Infinity;
    return movedIn <= year && year <= movedOut && born <= year && year <= died;
  }).sort((a,b) => (a.birthYear || 9999) - (b.birthYear || 9999));
}

function fillHouseForm(house) {
  el.editHouseName.value = house.name || "";
  el.editStreetName.value = house.streetName || "";
  el.editYearBuilt.value = house.yearBuilt || "";
  el.editYearDemolished.value = house.yearDemolished || "";
  el.editSourceRef.value = house.sourceRef || "";
}

function saveHouseOverride(event) {
  event.preventDefault();
  if (!state.selectedHouse) return;
  const id = state.selectedHouse.id;
  const override = {
    name: el.editHouseName.value.trim() || null,
    streetName: el.editStreetName.value.trim() || null,
    yearBuilt: nullableYear(el.editYearBuilt.value),
    yearDemolished: nullableYear(el.editYearDemolished.value),
    sourceRef: el.editSourceRef.value.trim() || null,
    yearConfidence: el.editYearBuilt.value ? "local-curator" : "unknown"
  };
  state.houseOverrides[id] = override;
  localStorage.setItem(STORAGE.houseOverrides, JSON.stringify(state.houseOverrides));
  Object.assign(state.selectedHouse, override);
  state.selectedHouse.simulatedYearBuilt = simulatedYearForHouse(id, state.simulationSeed);
  updateTimeline();
  showToast("House record saved in this browser.");
}

function openSettings() {
  el.tokenInput.value = localStorage.getItem(STORAGE.token) || "";
  updateSimulationUi();
  el.settingsDialog.showModal();
}

function saveToken() {
  const token = el.tokenInput.value.trim();
  if (!token) return showToast("Paste a Cesium ion token first.");
  localStorage.setItem(STORAGE.token, token);
  location.reload();
}

function clearToken() {
  localStorage.removeItem(STORAGE.token);
  localStorage.setItem(STORAGE.imagery, "street");
  location.reload();
}

async function importDataset() {
  const file = el.importFileInput.files?.[0];
  if (!file) {
    el.importMessage.textContent = "Choose a JSON file first.";
    return;
  }
  try {
    const parsed = JSON.parse(await file.text());
    validateDataset(parsed);
    localStorage.setItem(STORAGE.dataset, JSON.stringify(parsed));
    el.importMessage.textContent = `${parsed.houses.length} house records and ${parsed.residents.length} resident records imported. Reloading…`;
    setTimeout(() => location.reload(), 450);
  } catch (error) {
    el.importMessage.textContent = `Import failed: ${error.message}`;
  }
}

function exportDataset() {
  const mergedHouses = state.houses
    .filter(h => h.yearBuilt || h.name || h.streetName || h.sourceRef)
    .map(({coordinates, levels, heightMeters, buildingType, houseNumber, simulatedYearBuilt, ...house}) => house);
  const payload = {
    dataset: {
      title: state.importedDataset?.dataset?.title || "Kripan historical dataset",
      version: state.importedDataset?.dataset?.version || "1.0.0",
      provenance: state.importedDataset?.dataset?.provenance || "Curated in the Kripan map app",
      updatedAt: new Date().toISOString().slice(0,10)
    },
    houses: mergedHouses,
    residents: state.residents
  };
  downloadJson(payload, `kripan-history-${new Date().toISOString().slice(0,10)}.json`);
}

function validateDataset(data) {
  if (!data || !Array.isArray(data.houses) || !Array.isArray(data.residents)) {
    throw new Error("The file must contain houses[] and residents[].");
  }
  const houseIds = new Set(data.houses.map(h => normalizeHouseId(h.id || h.osmId)));
  for (const resident of data.residents) {
    if (!resident.id || !resident.name || !resident.houseId) throw new Error("Every resident needs id, name and houseId.");
    if (!houseIds.has(normalizeHouseId(resident.houseId))) {
      console.warn(`Resident ${resident.id} refers to a house not included in the imported houses array.`);
    }
  }
}

function normalizeResidents(records) {
  return records.map(r => ({
    id: String(r.id),
    name: String(r.name || "Unnamed person"),
    birthYear: nullableYear(r.birthYear),
    deathYear: nullableYear(r.deathYear),
    houseId: normalizeHouseId(r.houseId),
    yearMovedIn: nullableYear(r.yearMovedIn),
    yearMovedOut: nullableYear(r.yearMovedOut),
    parentIds: Array.isArray(r.parentIds) ? r.parentIds.map(String) : [],
    spouseId: r.spouseId ? String(r.spouseId) : null,
    currentLocation: normalizeLocation(r.currentLocation),
    sources: Array.isArray(r.sources) ? r.sources : []
  }));
}

function normalizeLocation(location) {
  if (typeof location === "string") return { status: location, destination: null };
  return { status: location?.status || "village", destination: location?.destination || null };
}

function updateSimulationUi() {
  if (!el.simulationToggle) return;
  el.simulationToggle.checked = state.simulateUndated;
  el.showUndatedToggle.disabled = state.simulateUndated;
  el.showUndatedToggle.closest("label")?.classList.toggle("is-disabled", state.simulateUndated);
  if (el.simulationSeedLabel) el.simulationSeedLabel.textContent = `Simulation seed: ${state.simulationSeed}`;
}

function rerollSimulation() {
  state.simulationSeed = Math.floor(Date.now() % 2147483647);
  localStorage.setItem(STORAGE.simulationSeed, String(state.simulationSeed));
  for (const house of state.houses) {
    house.simulatedYearBuilt = simulatedYearForHouse(house.id, state.simulationSeed);
  }
  state.simulateUndated = true;
  localStorage.setItem(STORAGE.simulation, "true");
  updateSimulationUi();
  updateTimeline();
  showToast("A new deterministic visual simulation was generated.");
}

function toggleTimelinePlayback() {
  if (state.timelinePlaying) {
    stopTimelinePlayback();
    return;
  }
  if (state.year <= 1500) {
    el.yearSlider.value = "2024";
    state.year = 2024;
    updateTimeline();
  }
  state.timelinePlaying = true;
  state.timelineStartYear = state.year;
  state.timelineStartTime = performance.now();
  state.timelineDurationMs = Math.max(2200, 18000 * ((state.timelineStartYear - 1500) / 524));
  el.playTimelineButton.textContent = "❚❚ Pause";
  el.playTimelineButton.classList.add("is-active");
  state.timelineFrame = requestAnimationFrame(stepTimelinePlayback);
}

function stepTimelinePlayback(now) {
  if (!state.timelinePlaying) return;
  const progress = Math.min(1, (now - state.timelineStartTime) / state.timelineDurationMs);
  const nextYear = Math.round(state.timelineStartYear - (state.timelineStartYear - 1500) * progress);
  if (Number(el.yearSlider.value) !== nextYear) {
    el.yearSlider.value = String(nextYear);
    updateTimeline();
  }
  if (progress < 1) {
    state.timelineFrame = requestAnimationFrame(stepTimelinePlayback);
  } else {
    stopTimelinePlayback();
    showToast("Historical playback reached 1500.");
  }
}

function stopTimelinePlayback() {
  state.timelinePlaying = false;
  if (state.timelineFrame) cancelAnimationFrame(state.timelineFrame);
  state.timelineFrame = null;
  if (el.playTimelineButton) {
    el.playTimelineButton.textContent = "▶ Play backwards";
    el.playTimelineButton.classList.remove("is-active");
  }
}

function resetView(animated = true) {
  stopOrbit();
  const destination = Cesium.Cartesian3.fromDegrees(KRIPAN.lon, KRIPAN.lat, 1050);
  const orientation = { heading: Cesium.Math.toRadians(10), pitch: Cesium.Math.toRadians(-48), roll: 0 };
  if (animated) state.viewer.camera.flyTo({ destination, orientation, duration: 1.2 });
  else state.viewer.camera.setView({ destination, orientation });
}

function toggleOrbit() {
  state.orbiting ? stopOrbit() : startOrbit();
}

function startOrbit() {
  state.orbiting = true;
  el.orbitButton.classList.add("is-active");
  const center = Cesium.Cartesian3.fromDegrees(KRIPAN.lon, KRIPAN.lat, 0);
  const tick = () => {
    if (!state.orbiting) return;
    state.orbitHeading += .0015;
    state.viewer.camera.lookAt(center, new Cesium.HeadingPitchRange(state.orbitHeading, Cesium.Math.toRadians(-35), 900));
    state.orbitFrame = requestAnimationFrame(tick);
  };
  tick();
}

function stopOrbit() {
  state.orbiting = false;
  el.orbitButton?.classList.remove("is-active");
  if (state.orbitFrame) cancelAnimationFrame(state.orbitFrame);
  state.orbitFrame = null;
  if (state.viewer) state.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
}

function setStatus(title, detail, kind) {
  el.statusTitle.textContent = title;
  el.statusDetail.textContent = detail;
  el.loadingDot.className = `status-dot${kind === "loading" ? " is-loading" : kind === "error" ? " is-error" : ""}`;
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.remove("is-visible"), 2800);
}

function houseQualityText(house) {
  if (house.yearConfidence === "verified") return `Verified construction year. Source: ${house.sourceRef || "source retained in imported record"}.`;
  if (house.yearConfidence === "local-curator") return `Locally curated construction year. Source: ${house.sourceRef || "no citation entered yet"}.`;
  if (house.yearConfidence === "osm-tagged") return `Construction year comes from an OpenStreetMap start_date tag. Verify it against a primary source before publication.`;
  if (state.simulateUndated) return `This is a real OpenStreetMap footprint, but ${house.simulatedYearBuilt} is only a deterministic visual-simulation year. It is not historical evidence and changes when a new simulation is generated.`;
  return "This is a real OpenStreetMap footprint, but its construction year is unknown. It is shown as an undated current structure and is not assigned an invented historical date.";
}

function periodForYear(year) {
  if (year < 1600) return "Early modern village";
  if (year < 1700) return "Seventeenth century";
  if (year < 1800) return "Eighteenth century";
  if (year < 1900) return "Nineteenth century";
  if (year < 1950) return "Early twentieth century";
  if (year < 2000) return "Modern village";
  if (year < 2024) return "Contemporary village";
  return "Present day";
}

function colorForYear(year, alpha = 1) {
  const t = Math.max(0, Math.min(1, (year - 1500) / 524));
  const old = [151, 104, 55], modern = [211, 190, 145];
  const rgb = old.map((v, i) => Math.round(v + (modern[i] - v) * t));
  return new Cesium.Color(rgb[0]/255, rgb[1]/255, rgb[2]/255, alpha);
}

function simulationColorForYear(year) {
  const color = colorForYear(year, 1);
  return Cesium.Color.lerp(color, Cesium.Color.fromCssColorString("#8ba6a0"), .28, new Cesium.Color());
}

function simulatedYearForHouse(id, seed) {
  const hash = hashString(`${seed}:${id}`);
  const unit = (hash + .5) / 4294967296;
  const recentWeighted = Math.pow(unit, .42);
  const year = 1500 + recentWeighted * 524;
  return Math.max(1500, Math.min(2024, Math.round(year / 5) * 5));
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function lifeLabel(person) {
  return `${person.birthYear || "?"}–${person.deathYear || "present"}`;
}

function locationLabel(person) {
  const status = person.currentLocation?.status;
  if (status === "moved") return person.currentLocation.destination ? `Moved to ${person.currentLocation.destination}` : "Moved away";
  if (status === "deceased") return "Deceased";
  return "In Kripan";
}

function findResident(id) { return state.residents.find(p => p.id === id) || null; }
function nullableYear(value) { const n = Number(value); return Number.isInteger(n) && n >= 1000 && n <= 2100 ? n : null; }
function positiveNumber(value) { const n = Number.parseFloat(value); return Number.isFinite(n) && n > 0 ? n : null; }
function parseYear(value) { const match = String(value || "").match(/\b(1[0-9]{3}|20[0-2][0-9])\b/); return match ? Number(match[1]) : null; }
function normalizeHouseId(id) { if (id == null) return ""; const s = String(id); return /^\d+$/.test(s) ? `way/${s}` : s.replace(/^osm-/, ""); }
function smoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function polygonCentroid(coords) {
  let area = 0, x = 0, y = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x0,y0] = coords[i], [x1,y1] = coords[i+1];
    const f = x0*y1 - x1*y0; area += f; x += (x0+x1)*f; y += (y0+y1)*f;
  }
  if (Math.abs(area) < 1e-12) return coords[Math.floor(coords.length/2)];
  area *= .5; return [x/(6*area), y/(6*area)];
}
function mixHex(a,b,t) {
  const pa = a.match(/\w\w/g).map(x=>parseInt(x,16)), pb = b.match(/\w\w/g).map(x=>parseInt(x,16));
  return `#${pa.map((v,i)=>Math.round(v+(pb[i]-v)*t).toString(16).padStart(2,"0")).join("")}`;
}
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function readJsonStorage(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
async function fetchJson(url) { const response = await fetch(url); if (!response.ok) throw new Error(`Could not load ${url}`); return response.json(); }
function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
