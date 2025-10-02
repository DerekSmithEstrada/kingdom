(function () {
  const STORAGE_KEY = "idle-village-state-v1";

  const resourceLabels = {
    happiness: "Happiness",
    population: "Population",
    gold: "Gold",
    wood: "Wood",
    planks: "Planks",
    stone: "Stone",
    tools: "Tools",
    wheat: "Wheat",
    ore: "Ore",
    seeds: "Seeds",
  };

  const buildingCatalog = {
    woodcutter_camp: {
      slug: "woodcutter-camp",
      name: "Woodcutter Camp",
      icon: "🪓",
      category: "wood",
      capacityPerBuilding: 2,
      inputs: {},
      outputs: { wood: 1 },
      maintenance: { gold: 0.01 },
    },
    lumber_hut: {
      slug: "lumber-hut",
      name: "Lumber Hut",
      icon: "🏚️",
      category: "wood",
      capacityPerBuilding: 2,
      inputs: { wood: 2 },
      outputs: { planks: 1 },
      maintenance: { gold: 0.02 },
    },
    miner: {
      slug: "stone-quarry",
      name: "Stone Quarry",
      icon: "⛏️",
      category: "stone",
      capacityPerBuilding: 3,
      inputs: {},
      outputs: { stone: 1, ore: 0.2 },
      maintenance: { gold: 0.05 },
    },
    farmer: {
      slug: "wheat-farm",
      name: "Wheat Farm",
      icon: "🌾",
      category: "crops",
      capacityPerBuilding: 2,
      inputs: { seeds: 1 },
      outputs: { wheat: 3 },
      maintenance: { gold: 0.03 },
    },
  };

  const buildingTypeBySlug = {};
  Object.entries(buildingCatalog).forEach(([typeKey, definition]) => {
    buildingTypeBySlug[definition.slug] = typeKey;
  });

  function createReport(status, consumed, produced, reason, detail) {
    return {
      status: status || "inactive",
      reason: reason || (status === "produced" ? "cycle_complete" : status || "inactive"),
      detail: detail || null,
      consumed: consumed ? { ...consumed } : {},
      produced: produced ? { ...produced } : {},
    };
  }

  function createBuildingState(typeKey, overrides) {
    const definition = buildingCatalog[typeKey];
    const slug = definition ? definition.slug : typeKey;
    const report = overrides && overrides.productionReport;
    const active = Number(overrides && overrides.active) || 0;
    const initialStatus =
      overrides && overrides.productionReport && overrides.productionReport.status
        ? overrides.productionReport.status
        : active > 0
        ? "produced"
        : "inactive";
    return {
      id: slug,
      type: typeKey,
      name: (overrides && overrides.name) || (definition && definition.name) || slug,
      category: (overrides && overrides.category) || (definition && definition.category) || "general",
      built: Number.isFinite(overrides && overrides.built)
        ? Number(overrides.built)
        : 0,
      active: active,
      capacityPerBuilding: Number.isFinite(overrides && overrides.capacityPerBuilding)
        ? Number(overrides.capacityPerBuilding)
        : definition && definition.capacityPerBuilding
        ? definition.capacityPerBuilding
        : 1,
      icon: (overrides && overrides.icon) || (definition && definition.icon) || "🏠",
      inputs: {
        ...(definition ? definition.inputs : {}),
        ...(overrides && overrides.inputs ? overrides.inputs : {}),
      },
      outputs: {
        ...(definition ? definition.outputs : {}),
        ...(overrides && overrides.outputs ? overrides.outputs : {}),
      },
      maintenance: {
        ...(definition ? definition.maintenance : {}),
        ...(overrides && overrides.maintenance ? overrides.maintenance : {}),
      },
      productionReport: report
        ? createReport(report.status, report.consumed, report.produced, report.reason, report.detail)
        : createReport(initialStatus, definition ? definition.inputs : {}, definition ? definition.outputs : {}),
    };
  }

  const defaultState = {
    resources: {
      happiness: 82,
      gold: 320,
      wood: 210,
      planks: 46,
      stone: 138,
      tools: 12,
      wheat: 75,
    },
    population: {
      total: 20,
    },
    buildings: [
      createBuildingState("woodcutter_camp", {
        built: 1,
        active: 1,
        productionReport: createReport("produced", {}, { wood: 1 }),
      }),
      createBuildingState("lumber_hut", {
        built: 2,
        active: 4,
        productionReport: createReport("produced", { wood: 2 }, { planks: 1 }),
      }),
      createBuildingState("miner", {
        built: 1,
        active: 3,
        productionReport: createReport("produced", {}, { stone: 1, ore: 0.2 }),
      }),
      createBuildingState("farmer", {
        built: 0,
        active: 0,
        productionReport: createReport("inactive", { seeds: 1 }, { wheat: 3 }, "inactive", null),
      }),
    ],
    jobs: [
      { id: "forester", name: "Forester", assigned: 4, max: 6, icon: "🌲" },
      { id: "miner", name: "Miner", assigned: 3, max: 5, icon: "⛏️" },
      { id: "farmer", name: "Farmer", assigned: 5, max: 6, icon: "🧑‍🌾" },
      { id: "artisan", name: "Artisan", assigned: 3, max: 5, icon: "🛠️" },
    ],
    trade: [
      { id: "gold", label: "Gold", export: 8, import: 2, icon: "🪙" },
      { id: "planks", label: "Planks", export: 4, import: 3, icon: "🪵" },
      { id: "tools", label: "Tools", export: 2, import: 1, icon: "🛠️" },
      { id: "wheat", label: "Wheat", export: 5, import: 6, icon: "🌾" },
    ],
    season: {
      season_name: "Spring",
      season_index: 0,
      progress: 0,
      color_hex: "#38BDF8",
    },
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return clone(defaultState);
      }
      const parsed = JSON.parse(raw);
      return {
        resources: { ...defaultState.resources, ...parsed.resources },
        population: { ...defaultState.population, ...parsed.population },
        buildings: Array.isArray(parsed.buildings) && parsed.buildings.length
          ? parsed.buildings
          : clone(defaultState.buildings),
        jobs: Array.isArray(parsed.jobs) && parsed.jobs.length
          ? parsed.jobs
          : clone(defaultState.jobs),
        trade: Array.isArray(parsed.trade) && parsed.trade.length
          ? parsed.trade
          : clone(defaultState.trade),
        season: parsed.season
          ? { ...defaultState.season, ...parsed.season }
          : clone(defaultState.season),
      };
    } catch (error) {
      console.warn("Idle Village: failed to load state", error);
      return clone(defaultState);
    }
  }

  let state = loadState();

  if (!state.season) {
    state.season = clone(defaultState.season);
  }

  state.buildings = Array.isArray(state.buildings)
    ? state.buildings.map((entry) => normaliseBuildingEntry(entry)).filter(Boolean)
    : [];
  state.jobs = Array.isArray(state.jobs) ? state.jobs : clone(defaultState.jobs);
  state.trade = Array.isArray(state.trade) ? state.trade : clone(defaultState.trade);
  state.resources = state.resources || clone(defaultState.resources);
  state.population = state.population || clone(defaultState.population);

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Idle Village: failed to save state", error);
    }
  }

  function normaliseNumeric(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normaliseResourceRecord(record, fallback) {
    const source = record && typeof record === "object" ? record : fallback || {};
    const result = {};
    Object.entries(source).forEach(([key, amount]) => {
      const numeric = Number(amount);
      if (Number.isFinite(numeric)) {
        result[key] = numeric;
      }
    });
    return result;
  }

  function normaliseReport(report, typeKey, inputs, outputs) {
    if (!report || typeof report !== "object") {
      return createReport("inactive", inputs, outputs, "inactive", null);
    }
    return createReport(
      report.status,
      report.consumed || report.inputs || inputs,
      report.produced || report.outputs || outputs,
      report.reason,
      report.detail
    );
  }

  function normaliseBuildingEntry(raw) {
    if (!raw) return null;
    const rawId = raw.id ?? raw.slug ?? raw.type ?? raw.type_key;
    const slugCandidate = typeof raw.slug === "string" ? raw.slug : undefined;
    const inferredType =
      raw.type ||
      raw.type_key ||
      buildingTypeBySlug[String(slugCandidate || "")] ||
      buildingTypeBySlug[String(rawId || "")];
    const definition = inferredType ? buildingCatalog[inferredType] : undefined;
    const slug = definition?.slug || slugCandidate || (typeof rawId === "string" ? rawId : undefined);
    const id = raw.id != null ? String(raw.id) : slug || String(Date.now());
    const category = raw.category || definition?.category || "general";
    const name = raw.name || definition?.name || slug || id;
    const icon = raw.icon || definition?.icon || "🏠";
    const built =
      raw.built === true
        ? 1
        : raw.built === false
        ? 0
        : normaliseNumeric(raw.built, definition ? 1 : 0);
    const active = normaliseNumeric(
      raw.active ?? raw.active_workers ?? raw.assigned_workers ?? raw.activeWorkers,
      0
    );
    const capacityPerBuilding = Math.max(
      1,
      normaliseNumeric(
        raw.capacityPerBuilding ?? raw.max_workers ?? raw.capacity ?? definition?.capacityPerBuilding,
        definition?.capacityPerBuilding || 1
      )
    );
    const inputs = normaliseResourceRecord(raw.inputs, definition?.inputs);
    const outputs = normaliseResourceRecord(raw.outputs, definition?.outputs);
    const maintenance = normaliseResourceRecord(raw.maintenance, definition?.maintenance);
    const reportSource = raw.productionReport || raw.production_report || raw.last_report;
    const productionReport = normaliseReport(reportSource, inferredType, inputs, outputs);

    return {
      id,
      slug: slug || id,
      type: inferredType || raw.type || raw.type_key || buildingTypeBySlug[id] || slug || id,
      name,
      category,
      built: Math.max(0, built),
      active: Math.max(0, active),
      capacityPerBuilding,
      icon,
      inputs,
      outputs,
      maintenance,
      productionReport,
    };
  }

  function updateBuildingReportFromState(building) {
    if (!building) return;
    const definition = buildingCatalog[building.type] || buildingCatalog[buildingTypeBySlug[building.slug || ""]];
    const baseInputs = {
      ...(definition ? definition.inputs : {}),
      ...(building.inputs || {}),
    };
    const baseOutputs = {
      ...(definition ? definition.outputs : {}),
      ...(building.outputs || {}),
    };
    const currentReport =
      building.productionReport && typeof building.productionReport === "object"
        ? building.productionReport
        : createReport("inactive", baseInputs, baseOutputs, "inactive", null);
    const consumed = Object.keys(currentReport.consumed || {}).length
      ? { ...currentReport.consumed }
      : { ...baseInputs };
    const produced = Object.keys(currentReport.produced || {}).length
      ? { ...currentReport.produced }
      : { ...baseOutputs };

    if (building.built <= 0 || building.active <= 0) {
      const detail = building.built <= 0 ? "not_built" : "no_workers";
      building.productionReport = createReport("inactive", consumed, produced, "inactive", detail);
      return;
    }

    if (currentReport.status === "stalled") {
      building.productionReport = {
        status: "stalled",
        reason: currentReport.reason || "missing_input",
        detail: currentReport.detail || null,
        consumed,
        produced,
      };
      return;
    }

    building.productionReport = createReport("produced", consumed, produced, "cycle_complete", null);
  }

  const buildingContainers = {
    wood: document.querySelector('[data-category="wood"]'),
    stone: document.querySelector('[data-category="stone"]'),
    crops: document.querySelector('[data-category="crops"]'),
  };

  const jobsList = document.getElementById("jobs-list");
  const tradeList = document.getElementById("trade-list");
  const jobsCountLabel = document.getElementById("jobs-count");
  const seasonLabel = document.getElementById("season-label");
  const seasonFill = document.getElementById("season-fill");

  const buildingViews = new Map();
  const jobViews = new Map();
  const tradeViews = new Map();

  function getCapacity(building) {
    return building.built * building.capacityPerBuilding;
  }

  function getTotalAssigned() {
    const buildingWorkers = state.buildings.reduce((total, building) => total + Number(building.active || 0), 0);
    const jobWorkers = state.jobs.reduce((total, job) => total + Number(job.assigned || 0), 0);
    return buildingWorkers + jobWorkers;
  }

  function countStalledBuildings() {
    return state.buildings.reduce((total, building) => {
      return building && building.productionReport && building.productionReport.status === "stalled"
        ? total + 1
        : total;
    }, 0);
  }

  function formatNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "0";
    }
    const abs = Math.abs(numeric);
    let maximumFractionDigits = 0;
    if (abs < 1) {
      maximumFractionDigits = 3;
    } else if (abs < 10) {
      maximumFractionDigits = 2;
    } else if (abs < 100) {
      maximumFractionDigits = 1;
    }
    return numeric.toLocaleString(undefined, { maximumFractionDigits });
  }

  function formatResourceName(key) {
    if (!key) return "";
    const lookup = resourceLabels[key];
    if (lookup) return lookup;
    const withSpaces = key.replace(/[_-]+/g, " ");
    return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
  }

  function normaliseIOEntries(record) {
    if (!record) return [];
    if (Array.isArray(record)) {
      return record
        .map((entry) => {
          const key = entry?.resource || entry?.key;
          const amount = Number(entry?.amount ?? entry?.value);
          if (!key || !Number.isFinite(amount)) return null;
          return { key: String(key), amount };
        })
        .filter(Boolean);
    }
    if (typeof record === "object") {
      return Object.entries(record)
        .map(([key, value]) => {
          const amount = Number(value);
          if (!Number.isFinite(amount)) return null;
          return { key: String(key), amount };
        })
        .filter(Boolean);
    }
    return [];
  }

  function entriesToMap(entries) {
    const map = new Map();
    entries.forEach((entry) => {
      map.set(String(entry.key), Number(entry.amount));
    });
    return map;
  }

  function updateChips() {
    const chipElements = document.querySelectorAll(".chip");
    const assigned = getTotalAssigned();
    chipElements.forEach((chip) => {
      const resourceKey = chip.dataset.resource;
      const valueSpan = chip.querySelector(".value");
      if (!valueSpan) return;
      switch (resourceKey) {
        case "happiness":
          valueSpan.textContent = `${state.resources.happiness}%`;
          break;
        case "population":
          valueSpan.textContent = `${assigned}/${state.population.total}`;
          break;
        case "stalled":
          valueSpan.textContent = String(countStalledBuildings());
          break;
        default:
          if (state.resources[resourceKey] !== undefined) {
            valueSpan.textContent = formatNumber(state.resources[resourceKey]);
          }
          break;
      }
    });
  }

  function renderSeason(season) {
    if (!season || !seasonLabel || !seasonFill) return;
    if (typeof season.season_name === "string" && season.season_name) {
      seasonLabel.textContent = season.season_name;
    }
    const progress = Math.max(0, Math.min(1, Number(season.progress) || 0));
    seasonFill.style.width = `${(progress * 100).toFixed(2)}%`;
    if (typeof season.color_hex === "string" && season.color_hex) {
      seasonFill.style.backgroundColor = season.color_hex;
    }
  }

  function updateSeasonState(season) {
    if (!season) return;
    const snapshot = {
      season_name:
        typeof season.season_name === "string" && season.season_name
          ? season.season_name
          : state.season.season_name,
      season_index:
        typeof season.season_index === "number"
          ? season.season_index
          : state.season.season_index,
      progress: Math.max(0, Math.min(1, Number(season.progress) || 0)),
      color_hex:
        typeof season.color_hex === "string" && season.color_hex
          ? season.color_hex
          : state.season.color_hex,
    };
    state.season = snapshot;
    renderSeason(snapshot);
    saveState();
  }

  function updateIOList(container, cache, entries, options) {
    if (!container) return;
    const { prefix, baseClass, status, missingKey, role, reportMap, treatInactive = true, treatZero = true } = options;
    const seen = new Set();
    entries.forEach((entry) => {
      const key = String(entry.key);
      const amount = Number(entry.amount);
      if (!Number.isFinite(amount)) return;
      seen.add(key);
      let pill = cache.get(key);
      if (!pill) {
        pill = document.createElement("span");
        pill.dataset.resourceKey = key;
        pill.className = `io-pill ${baseClass}`;
        container.appendChild(pill);
        cache.set(key, pill);
      }
      pill.className = `io-pill ${baseClass}`;
      const displayAmount = Math.abs(amount);
      const formattedAmount = formatNumber(displayAmount);
      const resourceName = formatResourceName(key);
      pill.textContent = `${prefix}${formattedAmount} ${resourceName}`;
      const reportedAmount = reportMap && reportMap.has(key) ? Math.abs(reportMap.get(key)) : null;
      const missing = Boolean(missingKey && missingKey === key);
      const inactive = treatInactive && status !== "produced" && status !== "active";
      const zeroOutput = treatZero && reportedAmount !== null && reportedAmount <= 0;
      const shouldMarkInactive = !missing && (inactive || zeroOutput);
      if (missing) {
        pill.classList.add("io-pill--missing");
      } else if (shouldMarkInactive) {
        pill.classList.add("io-pill--inactive");
      }
      const ariaDisabled = missing || shouldMarkInactive;
      pill.setAttribute("aria-disabled", ariaDisabled ? "true" : "false");
      const actualAmount = reportedAmount !== null ? reportedAmount : displayAmount;
      const baseLabel = `${role} ${formatNumber(actualAmount)} ${resourceName}`;
      let ariaLabel = baseLabel;
      if (missing) {
        ariaLabel = `${baseLabel} (missing input)`;
      } else if (shouldMarkInactive) {
        ariaLabel = `${baseLabel} (inactive)`;
      }
      pill.setAttribute("aria-label", ariaLabel);
    });
    cache.forEach((pill, key) => {
      if (!seen.has(key)) {
        pill.remove();
        cache.delete(key);
      }
    });
  }

  function renderBuildingIO(view, building) {
    if (!view) return;
    const report = building.productionReport || createReport("inactive", building.inputs, building.outputs, "inactive", null);
    const inputs = normaliseIOEntries(building.inputs);
    const outputs = normaliseIOEntries(building.outputs);
    const consumedMap = entriesToMap(normaliseIOEntries(report.consumed));
    const producedMap = entriesToMap(normaliseIOEntries(report.produced));
    const missingKey =
      report.status === "stalled" && report.reason === "missing_input" && typeof report.detail === "string"
        ? String(report.detail)
        : null;
    updateIOList(view.inputsContainer, view.inputPills, inputs, {
      prefix: "−",
      baseClass: "io-pill--input",
      status: report.status,
      missingKey,
      role: "Consumes",
      reportMap: consumedMap,
      treatZero: true,
    });
    updateIOList(view.outputsContainer, view.outputPills, outputs, {
      prefix: "+",
      baseClass: "io-pill--output",
      status: report.status,
      missingKey: null,
      role: "Produces",
      reportMap: producedMap,
      treatZero: true,
    });
  }

  function updateBuildingStatus(view, building) {
    if (!view) return;
    const report = building.productionReport || createReport("inactive", building.inputs, building.outputs, "inactive", null);
    const status = report.status || "inactive";
    let label = "Inactive";
    let detail = "";
    if (status === "produced") {
      label = "Producing";
    } else if (status === "stalled") {
      label = "Stalled";
      if (report.reason === "missing_input" && report.detail) {
        detail = `Missing ${formatResourceName(report.detail)}`;
      } else if (report.reason === "no_capacity") {
        detail = "Storage full";
      } else if (report.detail) {
        detail = String(report.detail);
      }
    } else {
      if (building.built <= 0 || report.detail === "not_built") {
        detail = "No structures built";
      } else if (building.active <= 0 || report.detail === "no_workers") {
        detail = "No workers assigned";
      } else if (report.reason && report.reason !== "inactive") {
        detail = formatResourceName(report.reason);
      }
    }
    view.statusChip.textContent = label;
    view.statusChip.className = "status-chip";
    if (status === "stalled") {
      view.statusChip.classList.add("status-chip--stalled");
    } else if (status === "inactive") {
      view.statusChip.classList.add("status-chip--inactive");
    }
    view.statusDetail.textContent = detail || "";
    view.statusDetail.style.display = detail ? "inline" : "none";
    view.card.classList.toggle("is-stalled", status === "stalled");
    view.card.classList.toggle("is-inactive", status === "inactive");
  }

  function setButtonAccessibility(button, baseLabel, disabled, disabledReason) {
    if (!button) return;
    button.disabled = Boolean(disabled);
    button.setAttribute("aria-disabled", disabled ? "true" : "false");
    if (baseLabel) {
      const finalLabel = disabled && disabledReason ? `${baseLabel} (disabled: ${disabledReason})` : baseLabel;
      button.setAttribute("aria-label", finalLabel);
    }
  }

  function setInputAccessibility(input, baseLabel, disabled, disabledReason) {
    if (!input) return;
    input.disabled = Boolean(disabled);
    input.setAttribute("aria-disabled", disabled ? "true" : "false");
    if (baseLabel) {
      const finalLabel = disabled && disabledReason ? `${baseLabel} (disabled: ${disabledReason})` : baseLabel;
      input.setAttribute("aria-label", finalLabel);
    }
  }

  function updateBuildingControls(view, building) {
    if (!view) return;
    const capacity = getCapacity(building);
    const totalAssigned = getTotalAssigned();
    const assignedElsewhere = totalAssigned - building.active;
    const available = Math.max(0, state.population.total - assignedElsewhere);
    const freeWorkers = Math.max(0, available - building.active);
    const remainingSlots = Math.max(0, capacity - building.active);
    const canAssign = building.built > 0 && remainingSlots > 0 && freeWorkers > 0;
    let assignReason = "";
    if (building.built <= 0) {
      assignReason = "No buildings constructed";
    } else if (remainingSlots <= 0) {
      assignReason = "Capacity reached";
    } else if (freeWorkers <= 0) {
      assignReason = "No available villagers";
    }
    setButtonAccessibility(view.buildButton, `Build ${building.name}`, false);
    setButtonAccessibility(
      view.demolishButton,
      `Demolish ${building.name}`,
      building.built <= 0,
      building.built <= 0 ? "No structures to demolish" : ""
    );
    setButtonAccessibility(view.assignButton, `Assign workers to ${building.name}`, !canAssign, assignReason || "");
    const disableInput = building.built <= 0;
    setInputAccessibility(view.assignInput, `${building.name} workers`, disableInput, "No buildings constructed");
    if (!disableInput) {
      view.assignInput.max = capacity;
    }
  }

  function ensureBuildingView(building) {
    if (!building) return null;
    let view = buildingViews.get(building.id);
    const categoryKey = building.category || (buildingCatalog[building.type]?.category ?? "wood");
    const container = buildingContainers[categoryKey];
    if (!container) return null;
    if (!view) {
      const listItem = document.createElement("li");
      listItem.dataset.buildingId = building.id;
      listItem.innerHTML = `
        <article class="building-card" data-building-id="${building.id}">
          <span class="icon-badge" role="img" aria-label="${building.name} icon"></span>
          <div class="building-meta">
            <div class="flex items-start justify-between gap-2">
              <h3 class="text-base font-semibold text-slate-100" data-field="name"></h3>
              <span class="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500" data-field="category"></span>
            </div>
            <div class="stat-row">
              <span>Built <strong data-field="built"></strong></span>
              <span>Active <strong data-field="active"></strong></span>
              <span>Capacity <strong data-field="capacity"></strong></span>
            </div>
            <div class="io-grid">
              <div class="io-column">
                <span class="io-title">Consumes</span>
                <div class="io-pills" data-io-inputs></div>
              </div>
              <div class="io-column">
                <span class="io-title">Produces</span>
                <div class="io-pills" data-io-outputs></div>
              </div>
            </div>
            <div class="status-row" data-status-row>
              <span class="status-chip status-chip--inactive" data-status-chip>Inactive</span>
              <span class="status-detail" data-status-detail></span>
            </div>
            <div class="bar" aria-hidden="true"></div>
            <div class="action-row">
              <button type="button" data-action="build" data-building-id="${building.id}">Build</button>
              <button type="button" data-action="demolish" data-building-id="${building.id}">Demolish</button>
              <label class="flex items-center gap-2 text-xs text-slate-300">
                <span>Workers</span>
                <input type="number" min="0" step="1" data-building-input="${building.id}" />
              </label>
              <button type="button" data-action="assign" data-building-id="${building.id}">Assign</button>
            </div>
          </div>
        </article>
      `;
      container.appendChild(listItem);
      const card = listItem.querySelector(".building-card");
      view = {
        root: listItem,
        card,
        icon: card.querySelector(".icon-badge"),
        name: card.querySelector('[data-field="name"]'),
        category: card.querySelector('[data-field="category"]'),
        builtValue: card.querySelector('[data-field="built"]'),
        activeValue: card.querySelector('[data-field="active"]'),
        capacityValue: card.querySelector('[data-field="capacity"]'),
        statusChip: card.querySelector('[data-status-chip]'),
        statusDetail: card.querySelector('[data-status-detail]'),
        inputsContainer: card.querySelector('[data-io-inputs]'),
        outputsContainer: card.querySelector('[data-io-outputs]'),
        buildButton: card.querySelector('button[data-action="build"]'),
        demolishButton: card.querySelector('button[data-action="demolish"]'),
        assignButton: card.querySelector('button[data-action="assign"]'),
        assignInput: card.querySelector(`input[data-building-input="${building.id}"]`),
        inputPills: new Map(),
        outputPills: new Map(),
      };
      buildingViews.set(building.id, view);
    }
    if (view.root.parentElement !== container) {
      container.appendChild(view.root);
    }
    return view;
  }

  function updateBuildingView(view, building) {
    if (!view) return;
    view.icon.textContent = building.icon;
    view.icon.setAttribute("aria-label", `${building.name} icon`);
    view.name.textContent = building.name;
    view.category.textContent = building.category;
    view.builtValue.textContent = formatNumber(building.built);
    view.activeValue.textContent = formatNumber(building.active);
    view.capacityValue.textContent = formatNumber(getCapacity(building));
    if (document.activeElement !== view.assignInput) {
      view.assignInput.value = building.active;
    }
    renderBuildingIO(view, building);
    updateBuildingStatus(view, building);
    updateBuildingControls(view, building);
  }

  function renderBuildings() {
    const seen = new Set();
    state.buildings.forEach((building) => {
      updateBuildingReportFromState(building);
      const view = ensureBuildingView(building);
      if (!view) return;
      seen.add(building.id);
      updateBuildingView(view, building);
    });
    buildingViews.forEach((view, key) => {
      if (!seen.has(key)) {
        if (view.root.parentElement) {
          view.root.parentElement.removeChild(view.root);
        }
        buildingViews.delete(key);
      }
    });
  }

  function ensureJobView(job) {
    if (!job) return null;
    let view = jobViews.get(job.id);
    if (!view) {
      const card = document.createElement("div");
      card.className = "job-card";
      card.dataset.jobId = job.id;
      card.innerHTML = `
        <header>
          <div class="flex items-center gap-2 text-slate-100">
            <span class="icon-badge icon-badge--sm" role="img" aria-label="${job.name} icon"></span>
            <span data-field="name"></span>
          </div>
          <span class="text-xs uppercase tracking-[0.2em] text-slate-400" data-field="count"></span>
        </header>
        <div class="controls">
          <button type="button" data-action="job-decrement" data-job-id="${job.id}">-</button>
          <input type="number" min="0" data-job-input="${job.id}" />
          <button type="button" data-action="job-increment" data-job-id="${job.id}">+</button>
        </div>
      `;
      jobsList.appendChild(card);
      view = {
        root: card,
        icon: card.querySelector(".icon-badge"),
        name: card.querySelector('[data-field="name"]'),
        count: card.querySelector('[data-field="count"]'),
        decrement: card.querySelector('button[data-action="job-decrement"]'),
        increment: card.querySelector('button[data-action="job-increment"]'),
        input: card.querySelector(`input[data-job-input="${job.id}"]`),
      };
      jobViews.set(job.id, view);
    }
    if (view.root.parentElement !== jobsList) {
      jobsList.appendChild(view.root);
    }
    return view;
  }

  function updateJobView(view, job) {
    if (!view) return;
    view.icon.textContent = job.icon || "";
    view.icon.setAttribute("aria-label", `${job.name} icon`);
    view.name.textContent = job.name;
    view.count.textContent = `${job.assigned}/${job.max}`;
    view.input.max = job.max;
    if (document.activeElement !== view.input) {
      view.input.value = job.assigned;
    }
    setInputAccessibility(view.input, `${job.name} workers`, false, "");
    const otherAssigned = getTotalAssigned() - job.assigned;
    const available = Math.max(0, state.population.total - otherAssigned);
    const freeWorkers = Math.max(0, available - job.assigned);
    const canDecrease = job.assigned > 0;
    const canIncrease = job.assigned < job.max && freeWorkers > 0;
    const increaseReason =
      job.assigned >= job.max
        ? "Max capacity reached"
        : freeWorkers <= 0
        ? "No available villagers"
        : "";
    setButtonAccessibility(view.decrement, `Decrease ${job.name} workers`, !canDecrease, "No workers assigned");
    setButtonAccessibility(view.increment, `Increase ${job.name} workers`, !canIncrease, increaseReason);
  }

  function renderJobs() {
    const seen = new Set();
    state.jobs.forEach((job) => {
      const view = ensureJobView(job);
      if (!view) return;
      seen.add(job.id);
      updateJobView(view, job);
    });
    jobViews.forEach((view, key) => {
      if (!seen.has(key)) {
        if (view.root.parentElement) {
          view.root.parentElement.removeChild(view.root);
        }
        jobViews.delete(key);
      }
    });
  }

  function ensureTradeView(item) {
    if (!item) return null;
    let view = tradeViews.get(item.id);
    if (!view) {
      const row = document.createElement("div");
      row.className = "trade-row";
      row.dataset.tradeId = item.id;
      row.innerHTML = `
        <div class="flex items-center gap-3 text-sm font-semibold text-slate-100">
          <span class="icon-badge icon-badge--sm" role="img" aria-label="${item.label} icon"></span>
          <span data-field="label"></span>
        </div>
        <div class="controls">
          <button type="button" class="export" data-action="trade-export" data-trade-id="${item.id}">Export</button>
          <button type="button" class="import" data-action="trade-import" data-trade-id="${item.id}">Import</button>
          <label class="flex flex-1 items-center gap-2 text-xs text-slate-300">
            <span>Export</span>
            <input type="range" min="0" max="100" step="1" data-trade-slider="${item.id}" />
          </label>
          <label class="flex items-center gap-2 text-xs text-slate-300">
            <span>Import</span>
            <input type="number" min="0" step="1" data-trade-input="${item.id}" />
          </label>
        </div>
        <div class="balance" data-field="balance"></div>
      `;
      tradeList.appendChild(row);
      view = {
        root: row,
        icon: row.querySelector(".icon-badge"),
        label: row.querySelector('[data-field="label"]'),
        exportButton: row.querySelector("button.export"),
        importButton: row.querySelector("button.import"),
        slider: row.querySelector(`input[data-trade-slider="${item.id}"]`),
        input: row.querySelector(`input[data-trade-input="${item.id}"]`),
        balance: row.querySelector('[data-field="balance"]'),
      };
      tradeViews.set(item.id, view);
    }
    if (view.root.parentElement !== tradeList) {
      tradeList.appendChild(view.root);
    }
    return view;
  }

  function updateTradeView(view, item) {
    if (!view) return;
    view.icon.textContent = item.icon || "";
    view.icon.setAttribute("aria-label", `${item.label} icon`);
    view.label.textContent = item.label;
    if (document.activeElement !== view.slider) {
      view.slider.value = item.export;
    }
    if (document.activeElement !== view.input) {
      view.input.value = item.import;
    }
    view.slider.setAttribute("aria-label", `${item.label} export preference`);
    view.input.setAttribute("aria-label", `${item.label} import quantity`);
    setButtonAccessibility(view.exportButton, `Increase ${item.label} exports`, false);
    setButtonAccessibility(view.importButton, `Increase ${item.label} imports`, false);
    const balance = Number(item.export) - Number(item.import);
    const formattedBalance = formatNumber(balance);
    view.balance.textContent = `Balance ${balance > 0 ? "+" : ""}${formattedBalance}`;
    view.balance.classList.toggle("positive", balance > 0);
    view.balance.classList.toggle("negative", balance < 0);
  }

  function renderTrade() {
    const seen = new Set();
    state.trade.forEach((item) => {
      const view = ensureTradeView(item);
      if (!view) return;
      seen.add(item.id);
      updateTradeView(view, item);
    });
    tradeViews.forEach((view, key) => {
      if (!seen.has(key)) {
        if (view.root.parentElement) {
          view.root.parentElement.removeChild(view.root);
        }
        tradeViews.delete(key);
      }
    });
  }

  function updateJobsCount() {
    const assigned = getTotalAssigned();
    const total = state.population.total;
    jobsCountLabel.textContent = `${assigned}/${total}`;
    updateChips();
  }

  function adjustBuildingCount(buildingId, delta) {
    const building = state.buildings.find((entry) => entry.id === buildingId);
    if (!building) return;
    building.built = Math.max(0, Number(building.built || 0) + Number(delta || 0));
    const capacity = getCapacity(building);
    if (building.active > capacity) {
      building.active = capacity;
    }
    updateBuildingReportFromState(building);
    saveState();
    renderBuildings();
    renderJobs();
    updateJobsCount();
  }

  function assignBuildingWorkers(buildingId, requested) {
    const building = state.buildings.find((entry) => entry.id === buildingId);
    if (!building) return;
    const capacity = getCapacity(building);
    const sanitized = Math.max(0, Math.min(capacity, Number.isFinite(requested) ? requested : 0));
    const assignedElsewhere = getTotalAssigned() - building.active;
    const available = Math.max(0, state.population.total - assignedElsewhere);
    const finalValue = Math.min(sanitized, available);
    building.active = finalValue;
    updateBuildingReportFromState(building);
    saveState();
    renderBuildings();
    renderJobs();
    updateJobsCount();
  }

  function adjustJob(jobId, delta) {
    const job = state.jobs.find((entry) => entry.id === jobId);
    if (!job) return;
    const otherAssigned = getTotalAssigned() - job.assigned;
    const available = Math.max(0, state.population.total - otherAssigned);
    const desired = Number(job.assigned || 0) + Number(delta || 0);
    const limited = Math.min(job.max, Math.max(0, desired));
    job.assigned = Math.min(limited, available);
    saveState();
    renderJobs();
    updateJobsCount();
  }

  function setJob(jobId, value) {
    const job = state.jobs.find((entry) => entry.id === jobId);
    if (!job) return;
    const otherAssigned = getTotalAssigned() - job.assigned;
    const available = Math.max(0, state.population.total - otherAssigned);
    const sanitized = Math.max(0, Math.min(job.max, Number(value)));
    job.assigned = Math.min(sanitized, available);
    saveState();
    renderJobs();
    updateJobsCount();
  }

  function adjustTrade(itemId, changes) {
    const item = state.trade.find((entry) => entry.id === itemId);
    if (!item) return;
    if (typeof changes.export === "number") {
      item.export = Math.max(0, changes.export);
    }
    if (typeof changes.import === "number") {
      item.import = Math.max(0, changes.import);
    }
    saveState();
    renderTrade();
  }

  function mergeProductionReports(reports) {
    if (!reports || typeof reports !== "object") return;
    const reportMap = new Map();
    if (Array.isArray(reports)) {
      reports.forEach((entry) => {
        if (!entry) return;
        const key =
          entry.id != null
            ? String(entry.id)
            : entry.building_id != null
            ? String(entry.building_id)
            : entry.slug || entry.type || null;
        if (!key) return;
        reportMap.set(String(key), entry);
      });
    } else {
      Object.entries(reports).forEach(([key, value]) => {
        if (!value) return;
        reportMap.set(String(key), value);
      });
    }
    state.buildings.forEach((building) => {
      const keysToCheck = [String(building.id), building.type, building.slug];
      let reportData = null;
      for (const candidate of keysToCheck) {
        if (candidate && reportMap.has(candidate)) {
          reportData = reportMap.get(candidate);
          break;
        }
      }
      if (reportData) {
        building.productionReport = createReport(
          reportData.status,
          reportData.consumed || reportData.inputs,
          reportData.produced || reportData.outputs,
          reportData.reason,
          reportData.detail
        );
      }
      updateBuildingReportFromState(building);
    });
  }

  function mergeBuildingSnapshots(buildingsSnapshot) {
    if (!Array.isArray(buildingsSnapshot)) return;
    state.buildings = buildingsSnapshot
      .map((entry) => normaliseBuildingEntry(entry))
      .filter(Boolean);
  }

  function handleServerPayload(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.season) {
      updateSeasonState(payload.season);
    }
    if (Array.isArray(payload.buildings)) {
      mergeBuildingSnapshots(payload.buildings);
    }
    if (payload.production_report) {
      mergeProductionReports(payload.production_report);
    }
    renderBuildings();
    renderJobs();
    updateJobsCount();
    renderTrade();
    saveState();
  }

  function handleBuildingActions(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, buildingId } = button.dataset;
    if (!buildingId) return;
    if (action === "build") {
      adjustBuildingCount(buildingId, 1);
    } else if (action === "demolish") {
      adjustBuildingCount(buildingId, -1);
    } else if (action === "assign") {
      const input = document.querySelector(`[data-building-input="${buildingId}"]`);
      const desired = input ? Number(input.value) : 0;
      assignBuildingWorkers(buildingId, desired);
    }
  }

  function handleBuildingInput(event) {
    const input = event.target;
    if (!input.matches("input[data-building-input]")) return;
    const buildingId = input.dataset.buildingInput;
    const value = Number(input.value);
    const building = state.buildings.find((entry) => entry.id === buildingId);
    if (!building) return;
    const capacity = getCapacity(building);
    const sanitized = Math.max(0, Math.min(capacity, Number.isFinite(value) ? value : 0));
    input.value = sanitized;
  }

  function handleJobActions(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, jobId } = button.dataset;
    if (!jobId) return;
    if (action === "job-increment") {
      adjustJob(jobId, 1);
    } else if (action === "job-decrement") {
      adjustJob(jobId, -1);
    }
  }

  function handleJobInput(event) {
    const input = event.target;
    if (!input.matches("input[data-job-input]")) return;
    const jobId = input.dataset.jobInput;
    const value = Number(input.value);
    if (!Number.isFinite(value)) {
      input.value = 0;
      return;
    }
    setJob(jobId, value);
  }

  function handleTradeActions(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, tradeId } = button.dataset;
    const item = state.trade.find((entry) => entry.id === tradeId);
    if (!item) return;
    if (action === "trade-export") {
      adjustTrade(tradeId, { export: item.export + 1 });
    } else if (action === "trade-import") {
      adjustTrade(tradeId, { import: item.import + 1 });
    }
  }

  function handleTradeInputs(event) {
    const target = event.target;
    if (target.matches("input[data-trade-slider]")) {
      const tradeId = target.dataset.tradeSlider;
      adjustTrade(tradeId, { export: Number(target.value) });
    }
    if (target.matches("input[data-trade-input]")) {
      const tradeId = target.dataset.tradeInput;
      adjustTrade(tradeId, { import: Number(target.value) });
    }
  }

  async function fetchJson(url, options) {
    if (typeof fetch !== "function") return null;
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async function loadSeasonFromStateEndpoint() {
    const payload = await fetchJson("/api/state");
    if (payload) {
      handleServerPayload(payload);
      return true;
    }
    return false;
  }

  async function initialiseSeasonSync() {
    const loaded = await loadSeasonFromStateEndpoint();
    if (loaded) {
      return;
    }
    const initPayload = await fetchJson("/api/init", { method: "POST" });
    if (initPayload) {
      handleServerPayload(initPayload);
    }
    await loadSeasonFromStateEndpoint();
  }

  function startSeasonTickLoop() {
    if (typeof fetch !== "function") return;
    let ticking = false;
    const performTick = async () => {
      if (ticking) {
        return;
      }
      ticking = true;
      const payload = await fetchJson("/api/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dt: 1 }),
      });
      if (payload) {
        handleServerPayload(payload);
      }
      ticking = false;
    };
    setInterval(performTick, 5000);
  }

  function attachAccordion() {
    const triggers = document.querySelectorAll(".accordion-trigger");
    triggers.forEach((trigger, index) => {
      const accordion = trigger.closest(".accordion");
      if (!accordion) return;
      trigger.addEventListener("click", () => {
        accordion.classList.toggle("open");
      });
      if (index === 0) {
        accordion.classList.add("open");
      }
    });
  }

  document.getElementById("building-accordion").addEventListener("click", handleBuildingActions);
  document.getElementById("building-accordion").addEventListener("change", handleBuildingInput);
  jobsList.addEventListener("click", handleJobActions);
  jobsList.addEventListener("change", handleJobInput);
  tradeList.addEventListener("click", handleTradeActions);
  tradeList.addEventListener("input", handleTradeInputs);

  renderBuildings();
  renderJobs();
  renderTrade();
  attachAccordion();
  updateJobsCount();
  updateChips();
  renderSeason(state.season);
  initialiseSeasonSync().then(startSeasonTickLoop);
})();
