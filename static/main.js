(function () {
  const STORAGE_KEY = "idle-village-state-v1";

  const resourceIconMap = {
    gold: "🪙",
    wood: "🪵",
    planks: "🪚",
    plank: "🪚",
    stone: "🪨",
    tools: "🛠️",
    wheat: "🌾",
    grain: "🌾",
    ore: "⛏️",
    seeds: "🌱",
    water: "💧",
    hops: "🍺",
    happiness: "😊",
  };

  const numberFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });

  function normaliseKey(value) {
    if (typeof value !== "string") {
      return null;
    }
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  }

  function normaliseResourceKey(resource) {
    if (typeof resource !== "string") {
      return null;
    }
    return resource.trim().toLowerCase();
  }

  function normaliseResourceMap(value) {
    if (!value || typeof value !== "object") {
      return {};
    }
    const entries = Array.isArray(value) ? value : Object.entries(value);
    return entries.reduce((acc, entry) => {
      const [rawKey, rawAmount] = entry;
      if (typeof rawKey !== "string") {
        return acc;
      }
      const key = rawKey.toLowerCase();
      const amount = Number(rawAmount);
      acc[key] = Number.isFinite(amount) ? amount : 0;
      return acc;
    }, {});
  }

  function normaliseReport(report) {
    if (!report || typeof report !== "object") {
      return {
        status: null,
        reason: null,
        detail: null,
        consumed: {},
        produced: {},
      };
    }
    return {
      status: typeof report.status === "string" ? report.status : null,
      reason: typeof report.reason === "string" ? report.reason : null,
      detail: report.detail === undefined ? null : report.detail,
      consumed: normaliseResourceMap(report.consumed),
      produced: normaliseResourceMap(report.produced),
    };
  }

  function normaliseBuilding(building) {
    if (!building || typeof building !== "object") {
      return null;
    }
    const inputs = normaliseResourceMap(
      building.inputs || building.input || building.inputs_per_cycle
    );
    const outputs = normaliseResourceMap(
      building.outputs || building.output || building.outputs_per_cycle
    );
    const effectiveRate = Number(building.effective_rate);
    const cycleTime = Number(
      building.cycle_time || building.cycle_time_sec || building.cycleTime
    );
    const pendingEta = Number(building.pending_eta);
    const activeValue = Number(building.active);
    const activeWorkers = Number.isFinite(activeValue)
      ? activeValue
      : Number.isFinite(Number(building.active_workers))
      ? Number(building.active_workers)
      : Number.isFinite(Number(building.assigned_workers))
      ? Number(building.assigned_workers)
      : 0;
    const builtValue = Number(building.built);
    const builtCount = Number.isFinite(builtValue)
      ? builtValue
      : Number.isFinite(Number(building.built_count))
      ? Number(building.built_count)
      : 0;
    const capacityValue = Number(building.capacityPerBuilding);
    const maxWorkersValue = Number(building.max_workers);
    const derivedCapacity = Number.isFinite(capacityValue) && capacityValue > 0
      ? capacityValue
      : Number.isFinite(maxWorkersValue) && maxWorkersValue > 0
      ? maxWorkersValue
      : capacityValue;
    const typeKey =
      typeof building.type === "string"
        ? building.type
        : typeof building.type_key === "string"
        ? building.type_key
        : typeof building.typeKey === "string"
        ? building.typeKey
        : typeof building.id === "string"
        ? building.id
        : null;
    const normalised = {
      inputs,
      outputs,
      can_produce:
        typeof building.can_produce === "boolean" ? building.can_produce : false,
      reason: typeof building.reason === "string" ? building.reason : null,
      effective_rate: Number.isFinite(effectiveRate) ? effectiveRate : 0,
      pending_eta: Number.isFinite(pendingEta) ? pendingEta : null,
      last_report: normaliseReport(building.last_report || building.production_report),
      cycle_time: Number.isFinite(cycleTime) ? cycleTime : 60,
      type: typeKey,
      active: Number.isFinite(activeWorkers) ? activeWorkers : 0,
      built: Number.isFinite(builtCount) ? builtCount : 0,
      capacityPerBuilding:
        Number.isFinite(derivedCapacity) && derivedCapacity > 0
          ? derivedCapacity
          : typeof building.capacityPerBuilding === "number"
          ? building.capacityPerBuilding
          : 0,
    };

    return { ...building, ...normalised };
  }

  function normaliseState(snapshot) {
    const next = { ...snapshot };
    next.buildings = Array.isArray(snapshot.buildings)
      ? snapshot.buildings
          .map((building) => normaliseBuilding(building))
          .filter(Boolean)
      : [];
    return next;
  }

  function formatAmount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "0";
    }
    return numberFormatter.format(numeric);
  }

  function formatResourceKey(key) {
    if (typeof key !== "string") {
      return "";
    }
    return key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function createIoItem(resource) {
    const item = document.createElement("li");
    item.className = "io-item";
    item.dataset.resource = resource;

    const icon = document.createElement("span");
    icon.className = "io-icon";
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = resourceIconMap[resource] || "📦";

    const amount = document.createElement("span");
    amount.className = "io-amount";

    item.append(icon, amount);

    return { element: item, icon, amount };
  }

  function syncAriaDisabled(control, disabled) {
    const isDisabled = Boolean(disabled);
    control.disabled = isDisabled;
    control.setAttribute("aria-disabled", isDisabled ? "true" : "false");
  }

  function getResourceStock(resource) {
    if (!resource) return 0;
    const key = resource.toLowerCase();
    const value = state.resources[key];
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function resolveMissingResource(building) {
    if (!building) return null;
    const detail = building.last_report && building.last_report.detail;
    if (typeof detail === "string" && detail) {
      return detail.toLowerCase();
    }
    if (detail && typeof detail === "object" && typeof detail.value === "string") {
      return detail.value.toLowerCase();
    }
    const entries = Object.entries(building.inputs || {});
    for (const [resource, rawAmount] of entries) {
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        continue;
      }
      if (getResourceStock(resource) + 1e-9 < amount) {
        return resource.toLowerCase();
      }
    }
    return null;
  }

  function getWorkerDisableState(building) {
    const reason = building && building.reason;
    if (reason === "missing_input") {
      const missing = resolveMissingResource(building);
      const label = missing ? formatResourceKey(missing) : "insumos";
      return {
        disabled: true,
        tooltip: `No puedes asignar más trabajadores: falta ${label}.`,
      };
    }
    if (reason === "no_capacity") {
      return {
        disabled: true,
        tooltip: "No hay capacidad disponible para producir más.",
      };
    }
    return { disabled: false, tooltip: "" };
  }

  function logState() {
    if (typeof console !== "undefined" && typeof console.log === "function") {
      console.log("Idle Village state", state);
    }
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
      {
        id: "woodcutter-camp",
        type: "woodcutter_camp",
        job: "forester",
        name: "Woodcutter Camp",
        category: "wood",
        built: 1,
        active: 1,
        capacityPerBuilding: 2,
        icon: "🪓",
        inputs: {},
        outputs: { wood: 1 },
        effective_rate: 1,
        can_produce: true,
        reason: null,
        pending_eta: null,
        last_report: {
          status: "running",
          reason: null,
          detail: null,
          consumed: {},
          produced: { wood: 1 },
        },
        cycle_time: 2,
      },
      {
        id: "lumber-hut",
        type: "lumber_hut",
        job: "artisan",
        name: "Lumber Hut",
        category: "wood",
        built: 2,
        active: 4,
        capacityPerBuilding: 2,
        icon: "🏚️",
        inputs: { wood: 2 },
        outputs: { planks: 1 },
        effective_rate: 0.5,
        can_produce: true,
        reason: null,
        pending_eta: null,
        last_report: {
          status: "running",
          reason: null,
          detail: null,
          consumed: { wood: 2 },
          produced: { planks: 1 },
        },
        cycle_time: 4,
      },
      {
        id: "stone-quarry",
        type: "miner",
        job: "miner",
        name: "Stone Quarry",
        category: "stone",
        built: 1,
        active: 3,
        capacityPerBuilding: 3,
        icon: "⛏️",
        inputs: {},
        outputs: { stone: 1 },
        effective_rate: 0.75,
        can_produce: true,
        reason: null,
        pending_eta: null,
        last_report: {
          status: "running",
          reason: null,
          detail: null,
          consumed: {},
          produced: { stone: 1 },
        },
        cycle_time: 5,
      },
      {
        id: "wheat-farm",
        type: "farmer",
        job: "farmer",
        name: "Wheat Farm",
        category: "crops",
        built: 0,
        active: 0,
        capacityPerBuilding: 2,
        icon: "🌾",
        inputs: { seeds: 1 },
        outputs: { wheat: 3 },
        effective_rate: 0,
        can_produce: false,
        reason: "inactive",
        pending_eta: null,
        last_report: {
          status: "inactive",
          reason: "inactive",
          detail: null,
          consumed: {},
          produced: {},
        },
        cycle_time: 8,
      },
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

  let state = normaliseState(loadState());

  logState();

  if (!state.season) {
    state.season = clone(defaultState.season);
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Idle Village: failed to save state", error);
    }
  }

  const buildingContainers = {
    wood: document.querySelector('[data-category="wood"]'),
    stone: document.querySelector('[data-category="stone"]'),
    crops: document.querySelector('[data-category="crops"]'),
  };

  const buildingElementMap = new Map();

  const jobsList = document.getElementById("jobs-list");
  const tradeList = document.getElementById("trade-list");
  const jobsCountLabel = document.getElementById("jobs-count");
  const seasonLabel = document.getElementById("season-label");
  const seasonFill = document.getElementById("season-fill");

  const jobsPanel = document.getElementById("jobs");
  let resourceFilterChip = null;
  let resourceFilterLabel = null;
  const jobPillData = new WeakMap();
  let activeResourceFilter = null;
  let jobResourceTooltip = null;
  let jobResourceTooltipTitle = null;
  let jobResourceTooltipList = null;
  let jobResourceTooltipHeading = null;
  let tooltipTarget = null;
  let tooltipHideTimer = null;

  if (jobsPanel && jobsList) {
    const panelHeader = jobsPanel.querySelector(".panel-header");
    const chip = document.createElement("div");
    chip.id = "resource-filter-chip";
    chip.className = "resource-filter-chip";
    chip.hidden = true;
    chip.innerHTML = `
      <span class="resource-filter-chip__label"></span>
      <button type="button" class="resource-filter-chip__clear" data-action="clear-resource-filter">Quitar filtro</button>
    `;
    if (panelHeader && panelHeader.parentNode) {
      panelHeader.after(chip);
    } else {
      jobsPanel.insertBefore(chip, jobsList);
    }
    resourceFilterChip = chip;
    resourceFilterLabel = chip.querySelector(".resource-filter-chip__label");
    const clearButton = chip.querySelector(".resource-filter-chip__clear");
    if (clearButton) {
      clearButton.addEventListener("click", () => {
        clearResourceFilter();
      });
    }
  }

  if (typeof document !== "undefined") {
    jobResourceTooltip = document.createElement("div");
    jobResourceTooltip.className = "job-resource-tooltip";
    jobResourceTooltip.setAttribute("role", "tooltip");
    jobResourceTooltip.dataset.visible = "false";
    jobResourceTooltip.hidden = true;

    jobResourceTooltipTitle = document.createElement("p");
    jobResourceTooltipTitle.className = "job-resource-tooltip__title";

    jobResourceTooltipHeading = document.createElement("p");
    jobResourceTooltipHeading.className = "job-resource-tooltip__heading";
    jobResourceTooltipHeading.textContent = "Edificios involucrados";

    jobResourceTooltipList = document.createElement("ul");
    jobResourceTooltipList.className = "job-resource-tooltip__list";

    jobResourceTooltip.append(jobResourceTooltipTitle, jobResourceTooltipHeading, jobResourceTooltipList);
    if (document.body) {
      document.body.appendChild(jobResourceTooltip);
    } else {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          if (document.body) {
            document.body.appendChild(jobResourceTooltip);
          }
        },
        { once: true }
      );
    }
  }

  function getCapacity(building) {
    return building.built * building.capacityPerBuilding;
  }

  function getTotalAssigned() {
    const buildingWorkers = state.buildings.reduce((total, building) => total + Number(building.active || 0), 0);
    const jobWorkers = state.jobs.reduce((total, job) => total + Number(job.assigned || 0), 0);
    return buildingWorkers + jobWorkers;
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
        default:
          if (state.resources[resourceKey] !== undefined) {
            valueSpan.textContent = state.resources[resourceKey];
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

  function createJobLookups() {
    const idSet = new Set();
    const aliasMap = new Map();
    const jobKeyMap = new Map();

    state.jobs.forEach((job) => {
      const idKey = normaliseKey(job.id);
      if (!idKey) {
        return;
      }
      idSet.add(idKey);
      aliasMap.set(idKey, idKey);
      jobKeyMap.set(idKey, idKey);
      if (typeof job.name === "string") {
        const nameKey = normaliseKey(job.name);
        if (nameKey) {
          aliasMap.set(nameKey, idKey);
          jobKeyMap.set(nameKey, idKey);
        }
      }
    });

    function registerAlias(alias, jobKey) {
      const aliasKey = normaliseKey(alias);
      const lookupKey = normaliseKey(jobKey);
      if (!aliasKey || !lookupKey) {
        return;
      }
      const resolved = jobKeyMap.get(lookupKey);
      if (!resolved) {
        return;
      }
      aliasMap.set(aliasKey, resolved);
    }

    registerAlias("woodcutter_camp", "forester");
    registerAlias("woodcuttercamp", "forester");
    registerAlias("woodcutter", "forester");
    registerAlias("wood", "forester");
    registerAlias("lumber_hut", "artisan");
    registerAlias("lumberhut", "artisan");
    registerAlias("lumber", "artisan");
    registerAlias("artisan_workshop", "artisan");
    registerAlias("stone_quarry", "miner");
    registerAlias("quarry", "miner");
    registerAlias("stone", "miner");
    registerAlias("wheat_farm", "farmer");
    registerAlias("grain_farm", "farmer");
    registerAlias("farm", "farmer");
    registerAlias("crops", "farmer");

    return { idSet, aliasMap };
  }

  function getBuildingJobKey(building, lookups) {
    if (!building || !lookups) {
      return null;
    }
    const { idSet, aliasMap } = lookups;
    const candidates = [];
    const jobFields = [
      "job",
      "job_type",
      "jobType",
      "job_id",
      "jobId",
      "profession",
      "profession_type",
      "worker_type",
      "workerType",
      "role",
    ];

    jobFields.forEach((field) => {
      const value = building[field];
      if (typeof value === "string") {
        candidates.push(value);
      }
    });

    if (typeof building.type === "string") {
      candidates.push(building.type);
    }
    if (typeof building.id === "string") {
      candidates.push(building.id);
    }
    if (typeof building.category === "string") {
      candidates.push(building.category);
    }
    if (typeof building.name === "string") {
      candidates.push(building.name);
    }

    for (const candidate of candidates) {
      const key = normaliseKey(candidate);
      if (!key) continue;
      if (idSet.has(key)) {
        return key;
      }
      if (aliasMap.has(key)) {
        return aliasMap.get(key);
      }
    }

    for (const candidate of candidates) {
      const key = normaliseKey(candidate);
      if (!key) continue;
      for (const jobId of idSet) {
        if (key.includes(jobId)) {
          return jobId;
        }
      }
      for (const [aliasKey, jobId] of aliasMap.entries()) {
        if (key.includes(aliasKey)) {
          return jobId;
        }
      }
    }

    return null;
  }

  function getBuildingCyclesPerMinute(building) {
    if (!building) return 0;
    const effectiveRate = Number(building.effective_rate);
    const cycleTime = Number(building.cycle_time);
    if (!Number.isFinite(effectiveRate) || !Number.isFinite(cycleTime) || cycleTime <= 0) {
      return 0;
    }
    return Math.max(0, effectiveRate) * (60 / cycleTime);
  }

  function aggregateResourceTotals(map, building, resources, cyclesPerMinute, direction) {
    if (!resources || typeof resources !== "object") {
      return;
    }
    Object.entries(resources).forEach(([resource, amount]) => {
      const key = normaliseResourceKey(resource);
      const perCycle = Number(amount);
      if (!key || !Number.isFinite(perCycle) || perCycle === 0) {
        return;
      }
      const perMinute = perCycle * cyclesPerMinute * direction;
      if (!Number.isFinite(perMinute) || Math.abs(perMinute) <= 1e-9) {
        return;
      }
      let entry = map.get(key);
      if (!entry) {
        entry = { total: 0, buildings: new Map() };
        map.set(key, entry);
      }
      entry.total += perMinute;
      const existing = entry.buildings.get(building.id);
      const nextAmount = (existing ? existing.amount : 0) + perMinute;
      entry.buildings.set(building.id, {
        id: building.id,
        name: building.name || formatResourceKey(building.id),
        amount: nextAmount,
      });
    });
  }

  function calculateJobResourceBreakdown(jobId, lookups) {
    const normalizedJobId = normaliseKey(jobId);
    if (!normalizedJobId) {
      return new Map();
    }
    const jobLookups = lookups || createJobLookups();
    if (!jobLookups.idSet.has(normalizedJobId)) {
      return new Map();
    }
    const totals = new Map();
    state.buildings.forEach((building) => {
      const buildingJob = getBuildingJobKey(building, jobLookups);
      if (buildingJob !== normalizedJobId) {
        return;
      }
      const cyclesPerMinute = getBuildingCyclesPerMinute(building);
      if (cyclesPerMinute <= 0) {
        return;
      }
      aggregateResourceTotals(totals, building, building.outputs, cyclesPerMinute, 1);
      aggregateResourceTotals(totals, building, building.inputs, cyclesPerMinute, -1);
    });
    return totals;
  }

  function formatPerMinuteRate(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "≈0/min";
    }
    const magnitude = Math.abs(numeric);
    if (magnitude < 0.01) {
      return "≈0/min";
    }
    const sign = numeric >= 0 ? "+" : "−";
    return `${sign}${formatAmount(magnitude)}/min`;
  }

  const JOB_RESOURCE_EPSILON = 1e-6;

  function createJobResourceEntries(job, lookups) {
    const breakdown = calculateJobResourceBreakdown(job.id, lookups);
    const entries = Array.from(breakdown.entries()).map(([resource, data]) => ({
      resource,
      total: data.total,
      buildings: data.buildings,
    }));
    return entries
      .filter((entry) => Math.abs(entry.total) > JOB_RESOURCE_EPSILON)
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }

  function updateJobResourceStrip(container, job, lookups) {
    if (!container) {
      return;
    }
    container.innerHTML = "";
    const entries = createJobResourceEntries(job, lookups);
    if (!entries.length) {
      container.hidden = true;
      return;
    }

    container.hidden = false;
    entries.forEach((entry) => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "job-resource-pill";
      pill.dataset.jobResourcePill = job.id;
      pill.dataset.resource = entry.resource;
      pill.dataset.action = "job-resource-filter";
      pill.dataset.jobId = job.id;

      if (entry.total >= 0) {
        pill.classList.add("job-resource-pill--positive");
      } else {
        pill.classList.add("job-resource-pill--negative");
      }

      const icon = document.createElement("span");
      icon.className = "job-resource-pill__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = resourceIconMap[entry.resource] || "📦";

      const amount = document.createElement("span");
      amount.className = "job-resource-pill__amount";
      amount.textContent = formatPerMinuteRate(entry.total);

      pill.append(icon, amount);
      pill.setAttribute(
        "aria-label",
        `${job.name}: ${formatResourceKey(entry.resource)} ${formatPerMinuteRate(entry.total)}`
      );

      container.appendChild(pill);
      jobPillData.set(pill, {
        jobId: job.id,
        resource: entry.resource,
        total: entry.total,
        buildings: entry.buildings,
      });
    });
  }

  function createStat(labelText) {
    const wrapper = document.createElement("span");
    wrapper.innerHTML = `${labelText} <strong></strong>`;
    const value = wrapper.querySelector("strong");
    return { wrapper, value };
  }

  function createIoRow(labelText) {
    const row = document.createElement("div");
    row.className = "io-row";
    const label = document.createElement("span");
    label.className = "io-label";
    label.textContent = labelText;
    const values = document.createElement("div");
    values.className = "io-values";
    const list = document.createElement("ul");
    list.className = "io-list";
    const empty = document.createElement("span");
    empty.className = "io-empty";
    empty.textContent = "—";
    values.append(list, empty);
    row.append(label, values);
    return { row, list, empty };
  }

  function createBuildingCard(building) {
    const listItem = document.createElement("li");
    listItem.className = "building-list-item";
    listItem.dataset.buildingId = building.id;

    const article = document.createElement("article");
    article.className = "building-card";
    article.dataset.buildingId = building.id;

    const iconBadge = document.createElement("span");
    iconBadge.className = "icon-badge";
    iconBadge.setAttribute("role", "img");
    iconBadge.setAttribute("aria-label", `${building.name} icon`);
    iconBadge.textContent = building.icon;

    const meta = document.createElement("div");
    meta.className = "building-meta";

    const headerRow = document.createElement("div");
    headerRow.className = "flex items-start justify-between gap-2";
    const nameHeading = document.createElement("h3");
    nameHeading.className = "text-base font-semibold text-slate-100";
    nameHeading.textContent = building.name;
    const categoryLabel = document.createElement("span");
    categoryLabel.className = "text-[0.65rem] uppercase tracking-[0.2em] text-slate-500";
    categoryLabel.textContent = building.category;
    headerRow.append(nameHeading, categoryLabel);

    const statusContainer = document.createElement("div");
    statusContainer.className = "building-status-row";
    statusContainer.style.display = "none";

    const statRow = document.createElement("div");
    statRow.className = "stat-row";
    const builtStat = createStat("Built");
    const activeStat = createStat("Active");
    const capacityStat = createStat("Capacity");
    statRow.append(builtStat.wrapper, activeStat.wrapper, capacityStat.wrapper);

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.setAttribute("aria-hidden", "true");

    const ioSection = document.createElement("div");
    ioSection.className = "io-section";
    const consumes = createIoRow("Consumes");
    const produces = createIoRow("Produces");
    ioSection.append(consumes.row, produces.row);

    const actionRow = document.createElement("div");
    actionRow.className = "action-row";

    const buildButton = document.createElement("button");
    buildButton.type = "button";
    buildButton.dataset.action = "build";
    buildButton.dataset.buildingId = building.id;
    buildButton.textContent = "Build";

    const demolishButton = document.createElement("button");
    demolishButton.type = "button";
    demolishButton.dataset.action = "demolish";
    demolishButton.dataset.buildingId = building.id;
    demolishButton.textContent = "Demolish";

    const workerGroup = document.createElement("div");
    workerGroup.className = "worker-group";

    const workerLabel = document.createElement("span");
    workerLabel.className = "worker-label";
    workerLabel.textContent = "Workers";

    const workerControls = document.createElement("div");
    workerControls.className = "worker-controls";

    const decrementButton = document.createElement("button");
    decrementButton.type = "button";
    decrementButton.dataset.action = "worker-decrement";
    decrementButton.dataset.buildingId = building.id;
    decrementButton.textContent = "−";

    const workerInput = document.createElement("input");
    workerInput.type = "number";
    workerInput.min = "0";
    workerInput.step = "1";
    workerInput.value = String(building.active || 0);
    workerInput.dataset.buildingInput = building.id;

    const incrementButton = document.createElement("button");
    incrementButton.type = "button";
    incrementButton.dataset.action = "worker-increment";
    incrementButton.dataset.buildingId = building.id;
    incrementButton.textContent = "+";

    workerControls.append(decrementButton, workerInput, incrementButton);
    workerGroup.append(workerLabel, workerControls);

    const assignButton = document.createElement("button");
    assignButton.type = "button";
    assignButton.dataset.action = "assign";
    assignButton.dataset.buildingId = building.id;
    assignButton.textContent = "Assign";

    actionRow.append(buildButton, demolishButton, workerGroup, assignButton);

    meta.append(headerRow, statusContainer, statRow, bar, ioSection, actionRow);
    article.append(iconBadge, meta);
    listItem.appendChild(article);

    return {
      root: listItem,
      article,
      iconBadge,
      nameHeading,
      categoryLabel,
      statusContainer,
      statusKey: null,
      builtValue: builtStat.value,
      activeValue: activeStat.value,
      capacityValue: capacityStat.value,
      workerInput,
      assignButton,
      incrementButton,
      decrementButton,
      consumesList: consumes.list,
      consumesEmpty: consumes.empty,
      consumesItems: new Map(),
      producesList: produces.list,
      producesEmpty: produces.empty,
      producesItems: new Map(),
    };
  }

  function updateIoList(listElement, emptyElement, itemsMap, resources, updater) {
    const entries = Object.entries(resources || {}).filter(([, amount]) => {
      const numeric = Number(amount);
      return Number.isFinite(numeric) && numeric !== 0;
    });

    if (!entries.length) {
      emptyElement.style.display = "inline-flex";
      listElement.style.display = "none";
      itemsMap.forEach((item) => {
        item.element.remove();
      });
      itemsMap.clear();
      return;
    }

    emptyElement.style.display = "none";
    listElement.style.display = "flex";

    const seen = new Set();
    entries.forEach(([resource, amount]) => {
      const key = typeof resource === "string" ? resource.toLowerCase() : resource;
      let item = itemsMap.get(key);
      if (!item) {
        item = createIoItem(key);
        itemsMap.set(key, item);
      }
      listElement.appendChild(item.element);
      seen.add(key);
      const ariaLabel = updater(item, key, Number(amount));
      if (typeof ariaLabel === "string" && ariaLabel.trim()) {
        item.element.setAttribute("aria-label", ariaLabel);
      } else {
        item.element.removeAttribute("aria-label");
      }
    });

    itemsMap.forEach((item, key) => {
      if (!seen.has(key)) {
        item.element.remove();
        itemsMap.delete(key);
      }
    });
  }

  function updateBuildingIo(entry, building) {
    updateIoList(
      entry.consumesList,
      entry.consumesEmpty,
      entry.consumesItems,
      building.inputs,
      (item, resource, amount) => {
        const perCycle = Number(amount) || 0;
        const stock = getResourceStock(resource);
        const etaValue = Number(building.pending_eta);
        const etaText = Number.isFinite(etaValue)
          ? `${formatAmount(Math.max(0, etaValue))}s`
          : "—";
        item.icon.textContent = resourceIconMap[resource] || "📦";
        item.amount.textContent = formatAmount(perCycle);
        const labelText = `Necesita ${formatAmount(
          perCycle
        )}/ciclo. Stock actual: ${formatAmount(
          stock
        )}. ETA para siguiente ciclo: ${etaText}`;
        item.element.title = labelText;
        item.element.classList.toggle("io-item-warning", stock + 1e-9 < perCycle);
        return `${formatResourceKey(resource)} — ${labelText}`;
      }
    );

    const cyclesPerMinute =
      building.cycle_time > 0
        ? Math.max(0, Number(building.effective_rate) || 0) *
          (60 / Number(building.cycle_time))
        : 0;

    updateIoList(
      entry.producesList,
      entry.producesEmpty,
      entry.producesItems,
      building.outputs,
      (item, resource, amount) => {
        const perCycle = Number(amount) || 0;
        const perMinute = perCycle * cyclesPerMinute;
        item.icon.textContent = resourceIconMap[resource] || "📦";
        item.amount.textContent = formatAmount(perCycle);
        const labelText = `${formatResourceKey(
          resource
        )}: ${formatAmount(perCycle)} por ciclo • ${formatAmount(
          perMinute
        )} por minuto`;
        item.element.title = labelText;
        item.element.classList.remove("io-item-warning");
        return labelText;
      }
    );
  }

  function updateBuildingStatus(entry, building) {
    const reason = typeof building.reason === "string" ? building.reason : null;
    let statusKey = reason || "";
    let missingResource = null;
    if (reason === "missing_input") {
      missingResource = resolveMissingResource(building);
      statusKey += `:${missingResource || ""}`;
    }

    if (statusKey === entry.statusKey) {
      return;
    }

    entry.statusKey = statusKey;
    entry.statusContainer.innerHTML = "";

    if (!reason) {
      entry.statusContainer.style.display = "none";
      return;
    }

    entry.statusContainer.style.display = "flex";

    const chip = document.createElement("span");
    chip.className = "status-chip";
    let variant = "neutral";
    let labelText = formatResourceKey(reason);

    switch (reason) {
      case "missing_input": {
        variant = "warning";
        const label = missingResource ? formatResourceKey(missingResource) : "Recurso";
        labelText = `Falta: ${label}`;
        break;
      }
      case "no_capacity":
        variant = "warning";
        labelText = "Sin capacidad";
        break;
      case "inactive":
        variant = "info";
        labelText = "Inactivo";
        break;
      case "no_workers":
        variant = "info";
        labelText = "Sin trabajadores";
        break;
      default:
        break;
    }

    chip.classList.add(`status-chip--${variant}`);

    const labelSpan = document.createElement("span");
    labelSpan.className = "status-chip__label";
    labelSpan.textContent = labelText;
    chip.appendChild(labelSpan);

    if (reason === "missing_input") {
      const importButton = document.createElement("button");
      importButton.type = "button";
      importButton.className = "status-chip__action";
      importButton.dataset.action = "trigger-import";
      importButton.dataset.buildingId = building.id;
      syncAriaDisabled(importButton, false);
      if (missingResource) {
        importButton.dataset.resource = missingResource;
        importButton.title = "Abrir comercio para importar este recurso.";
      } else {
        syncAriaDisabled(importButton, true);
        importButton.title = "No se puede determinar el recurso faltante.";
      }
      importButton.textContent = "Importar";
      chip.appendChild(importButton);
    }

    entry.statusContainer.appendChild(chip);
  }

  function updateWorkerControls(entry, building) {
    const capacity = getCapacity(building);
    const activeWorkers = Math.max(0, Number(building.active) || 0);
    entry.workerInput.max = String(capacity);
    entry.workerInput.value = String(Math.min(capacity, activeWorkers));
    entry.workerInput.dataset.buildingInput = building.id;

    entry.decrementButton.dataset.buildingId = building.id;
    entry.incrementButton.dataset.buildingId = building.id;
    entry.assignButton.dataset.buildingId = building.id;

    syncAriaDisabled(entry.decrementButton, activeWorkers <= 0);

    const disableState = getWorkerDisableState(building);
    syncAriaDisabled(entry.assignButton, disableState.disabled);
    syncAriaDisabled(entry.incrementButton, disableState.disabled);
    if (disableState.disabled) {
      entry.assignButton.title = disableState.tooltip;
      entry.incrementButton.title = disableState.tooltip;
    } else {
      entry.assignButton.removeAttribute("title");
      entry.incrementButton.removeAttribute("title");
    }
  }

  function updateBuildingCard(entry, building) {
    entry.root.dataset.buildingId = building.id;
    entry.article.dataset.buildingId = building.id;
    entry.iconBadge.textContent = building.icon;
    entry.iconBadge.setAttribute("aria-label", `${building.name} icon`);
    entry.nameHeading.textContent = building.name;
    entry.categoryLabel.textContent = building.category;

    entry.builtValue.textContent = formatAmount(building.built || 0);
    entry.activeValue.textContent = formatAmount(building.active || 0);
    entry.capacityValue.textContent = formatAmount(getCapacity(building));

    updateWorkerControls(entry, building);
    updateBuildingStatus(entry, building);
    updateBuildingIo(entry, building);
  }

  function renderBuildings() {
    state.buildings = state.buildings
      .map((building) => normaliseBuilding(building))
      .filter(Boolean);

    const seen = new Set();

    state.buildings.forEach((building) => {
      const container = buildingContainers[building.category];
      if (!container) {
        const existing = buildingElementMap.get(building.id);
        if (existing) {
          existing.root.remove();
          buildingElementMap.delete(building.id);
        }
        return;
      }

      let entry = buildingElementMap.get(building.id);
      if (!entry) {
        entry = createBuildingCard(building);
        buildingElementMap.set(building.id, entry);
      }

      container.appendChild(entry.root);
      updateBuildingCard(entry, building);
      seen.add(building.id);
    });

    buildingElementMap.forEach((entry, buildingId) => {
      if (!seen.has(buildingId)) {
        entry.root.remove();
        buildingElementMap.delete(buildingId);
      }
    });

    applyActiveResourceFilter();
  }

  function triggerImportAction(resourceKey) {
    const tradePanel = document.getElementById("trade");
    if (tradePanel) {
      if (!tradePanel.hasAttribute("tabindex")) {
        tradePanel.setAttribute("tabindex", "-1");
      }
      tradePanel.classList.add("panel-highlight");
      tradePanel.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => {
        tradePanel.classList.remove("panel-highlight");
      }, 1200);
    }

    const normalizedResource =
      typeof resourceKey === "string" ? resourceKey.toLowerCase() : null;
    const tradeEntry = normalizedResource
      ? state.trade.find((entry) => entry.id === normalizedResource)
      : null;

    if (tradeEntry) {
      const targetValue = 50;
      if (tradeEntry.import !== targetValue) {
        adjustTrade(tradeEntry.id, { import: targetValue });
      } else {
        renderTrade();
      }
    } else if (tradePanel) {
      tradePanel.focus({ preventScroll: true });
    }

    window.setTimeout(() => {
      if (tradePanel) {
        tradePanel.focus({ preventScroll: true });
      }
      if (!tradeEntry) {
        return;
      }
      const slider = tradeList.querySelector(
        `[data-trade-import-slider="${tradeEntry.id}"]`
      );
      if (slider) {
        slider.focus();
        return;
      }
      const input = tradeList.querySelector(
        `[data-trade-input="${tradeEntry.id}"]`
      );
      if (input) {
        input.focus();
        if (typeof input.select === "function") {
          input.select();
        }
      }
    }, 120);
  }

  function renderJobs() {
    hideJobResourceTooltip(true);
    jobsList.innerHTML = "";
    const jobLookups = createJobLookups();
    state.jobs.forEach((job) => {
      const card = document.createElement("div");
      card.className = "job-card";
      card.dataset.jobId = job.id;

      const header = document.createElement("header");
      const titleGroup = document.createElement("div");
      titleGroup.className = "flex items-center gap-2 text-slate-100";

      const icon = document.createElement("span");
      icon.className = "icon-badge icon-badge--sm";
      icon.setAttribute("role", "img");
      icon.setAttribute("aria-label", `${job.name} icon`);
      icon.textContent = job.icon;

      const name = document.createElement("span");
      name.textContent = job.name;
      titleGroup.append(icon, name);

      const counter = document.createElement("span");
      counter.className = "text-xs uppercase tracking-[0.2em] text-slate-400";
      counter.textContent = `${job.assigned}/${job.max}`;

      header.append(titleGroup, counter);

      const resourceStrip = document.createElement("div");
      resourceStrip.className = "job-resource-strip";
      resourceStrip.dataset.jobResourceStrip = job.id;
      updateJobResourceStrip(resourceStrip, job, jobLookups);

      const controls = document.createElement("div");
      controls.className = "controls";

      const decrement = document.createElement("button");
      decrement.type = "button";
      decrement.dataset.action = "job-decrement";
      decrement.dataset.jobId = job.id;
      decrement.textContent = "-";

      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = String(job.max);
      input.value = String(job.assigned);
      input.dataset.jobInput = job.id;

      const increment = document.createElement("button");
      increment.type = "button";
      increment.dataset.action = "job-increment";
      increment.dataset.jobId = job.id;
      increment.textContent = "+";

      controls.append(decrement, input, increment);

      card.append(header, resourceStrip, controls);
      jobsList.appendChild(card);
    });
  }

  function renderTrade() {
    tradeList.innerHTML = "";
    state.trade.forEach((item) => {
      const balance = item.export - item.import;
      const row = document.createElement("div");
      row.className = "trade-row";
      row.dataset.tradeId = item.id;
      row.innerHTML = `
        <div class="flex items-center gap-3 text-sm font-semibold text-slate-100">
          <span class="icon-badge icon-badge--sm" role="img" aria-label="${item.label} icon">${item.icon}</span>
          <span>${item.label}</span>
        </div>
        <div class="controls">
          <button type="button" class="export" data-action="trade-export" data-trade-id="${item.id}">Export</button>
          <button type="button" class="import" data-action="trade-import" data-trade-id="${item.id}">Import</button>
          <label class="flex flex-1 items-center gap-2 text-xs text-slate-300">
            <span>Export</span>
            <input type="range" min="0" max="100" step="1" value="${item.export}" data-trade-slider="${item.id}" />
          </label>
          <label class="flex flex-1 items-center gap-2 text-xs text-slate-300">
            <span>Import</span>
            <input type="range" min="0" max="100" step="1" value="${item.import}" data-trade-import-slider="${item.id}" />
          </label>
          <label class="flex items-center gap-2 text-xs text-slate-300">
            <span>Cantidad</span>
            <input type="number" min="0" step="1" value="${item.import}" data-trade-input="${item.id}" />
          </label>
        </div>
        <div class="balance ${balance > 0 ? "positive" : balance < 0 ? "negative" : ""}">
          Balance ${balance > 0 ? "+" : ""}${balance}
        </div>
      `;
      tradeList.appendChild(row);
    });
  }

  function updateResourceFilterChip(resourceKey, count) {
    if (!resourceFilterChip || !resourceFilterLabel) {
      return;
    }
    if (!resourceKey) {
      resourceFilterChip.hidden = true;
      resourceFilterChip.removeAttribute("data-resource");
      resourceFilterLabel.textContent = "";
      return;
    }
    resourceFilterChip.hidden = false;
    resourceFilterChip.dataset.resource = resourceKey;
    const label = formatResourceKey(resourceKey);
    const suffix = count === 1 ? "edificio" : "edificios";
    resourceFilterLabel.textContent = `Filtro: ${label} (${count} ${suffix})`;
  }

  function applyActiveResourceFilter(options = {}) {
    const { scrollToFirst = false } = options;
    if (!activeResourceFilter) {
      buildingElementMap.forEach((entry) => {
        entry.article.classList.remove("building-card--highlighted", "building-card--dimmed");
      });
      updateResourceFilterChip(null, 0);
      return;
    }

    const normalized = normaliseResourceKey(activeResourceFilter);
    if (!normalized) {
      activeResourceFilter = null;
      applyActiveResourceFilter();
      return;
    }

    const matchingIds = new Set();
    state.buildings.forEach((building) => {
      const inputs = building && typeof building.inputs === "object" ? building.inputs : {};
      for (const [resource, amount] of Object.entries(inputs)) {
        if (normaliseResourceKey(resource) === normalized && Number(amount) > 0) {
          matchingIds.add(building.id);
          break;
        }
      }
    });

    buildingElementMap.forEach((entry, buildingId) => {
      const isMatch = matchingIds.has(buildingId);
      const shouldDim = matchingIds.size > 0 && !isMatch;
      entry.article.classList.toggle("building-card--highlighted", isMatch);
      entry.article.classList.toggle("building-card--dimmed", shouldDim);
    });

    if (matchingIds.size === 0) {
      buildingElementMap.forEach((entry) => {
        entry.article.classList.remove("building-card--dimmed");
      });
    }

    updateResourceFilterChip(normalized, matchingIds.size);

    if (scrollToFirst && matchingIds.size > 0) {
      const firstId = matchingIds.values().next().value;
      const target = buildingElementMap.get(firstId);
      if (target && target.article && typeof target.article.scrollIntoView === "function") {
        target.article.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  function activateResourceFilter(resourceKey) {
    const normalized = normaliseResourceKey(resourceKey);
    if (!normalized) {
      return;
    }
    if (activeResourceFilter === normalized) {
      clearResourceFilter();
      return;
    }
    activeResourceFilter = normalized;
    applyActiveResourceFilter({ scrollToFirst: true });
  }

  function clearResourceFilter() {
    if (!activeResourceFilter) {
      updateResourceFilterChip(null, 0);
      buildingElementMap.forEach((entry) => {
        entry.article.classList.remove("building-card--highlighted", "building-card--dimmed");
      });
      hideJobResourceTooltip(true);
      return;
    }
    activeResourceFilter = null;
    applyActiveResourceFilter();
    hideJobResourceTooltip(true);
  }

  function positionJobResourceTooltip(target) {
    if (!jobResourceTooltip || !target) {
      return;
    }
    const rect = target.getBoundingClientRect();
    const scrollX = typeof window !== "undefined" ? window.scrollX || window.pageXOffset || 0 : 0;
    const scrollY = typeof window !== "undefined" ? window.scrollY || window.pageYOffset || 0 : 0;
    const viewportWidth =
      typeof document !== "undefined" && document.documentElement
        ? document.documentElement.clientWidth
        : typeof window !== "undefined"
        ? window.innerWidth
        : 0;

    const schedule = (() => {
      if (typeof window !== "undefined") {
        if (typeof window.requestAnimationFrame === "function") {
          return window.requestAnimationFrame.bind(window);
        }
        if (typeof window.setTimeout === "function") {
          return (callback) => window.setTimeout(callback, 0);
        }
      }
      return (callback) => setTimeout(callback, 0);
    })();

    schedule(() => {
      if (!jobResourceTooltip) {
        return;
      }
      const tooltipRect = jobResourceTooltip.getBoundingClientRect();
      const top = scrollY + rect.bottom + 10;
      const minLeft = scrollX + 8;
      const maxLeft = scrollX + viewportWidth - tooltipRect.width - 8;
      let left = scrollX + rect.left + rect.width / 2 - tooltipRect.width / 2;
      if (Number.isFinite(minLeft) && Number.isFinite(maxLeft)) {
        left = Math.max(minLeft, Math.min(left, maxLeft));
      }
      jobResourceTooltip.style.top = `${top}px`;
      jobResourceTooltip.style.left = `${left}px`;
      jobResourceTooltip.dataset.visible = "true";
    });
  }

  function showJobResourceTooltip(target) {
    if (!jobResourceTooltip || !jobResourceTooltipList || !jobResourceTooltipTitle) {
      return;
    }
    const data = jobPillData.get(target);
    if (!data) {
      return;
    }

    if (tooltipHideTimer && typeof window !== "undefined") {
      window.clearTimeout(tooltipHideTimer);
      tooltipHideTimer = null;
    }

    tooltipTarget = target;
    jobResourceTooltipTitle.textContent = formatResourceKey(data.resource);
    jobResourceTooltipList.innerHTML = "";

    const items = Array.from(data.buildings.values()).filter((item) =>
      Math.abs(item.amount) > JOB_RESOURCE_EPSILON
    );
    items.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    if (!items.length) {
      const empty = document.createElement("li");
      empty.className = "job-resource-tooltip__empty";
      empty.textContent = "Sin edificios activos";
      jobResourceTooltipList.appendChild(empty);
    } else {
      items.forEach((item) => {
        const listItem = document.createElement("li");
        listItem.className = "job-resource-tooltip__item";
        listItem.classList.add(
          item.amount >= 0
            ? "job-resource-tooltip__item--positive"
            : "job-resource-tooltip__item--negative"
        );

        const name = document.createElement("span");
        name.className = "job-resource-tooltip__name";
        name.textContent = item.name;

        const value = document.createElement("span");
        value.className = "job-resource-tooltip__value";
        value.textContent = formatPerMinuteRate(item.amount);

        listItem.append(name, value);
        jobResourceTooltipList.appendChild(listItem);
      });
    }

    jobResourceTooltip.hidden = false;
    jobResourceTooltip.dataset.visible = "false";
    positionJobResourceTooltip(target);
  }

  function hideJobResourceTooltip(immediate = false) {
    if (!jobResourceTooltip) {
      return;
    }
    if (tooltipHideTimer && typeof window !== "undefined") {
      window.clearTimeout(tooltipHideTimer);
      tooltipHideTimer = null;
    }
    if (jobResourceTooltip.hidden) {
      tooltipTarget = null;
      return;
    }
    jobResourceTooltip.dataset.visible = "false";
    const finalize = () => {
      if (jobResourceTooltip) {
        jobResourceTooltip.hidden = true;
      }
      tooltipTarget = null;
      tooltipHideTimer = null;
    };
    if (immediate || typeof window === "undefined") {
      finalize();
      return;
    }
    tooltipHideTimer = window.setTimeout(finalize, 120);
  }

  function handleJobResourceHover(event) {
    const pill = event.target.closest("[data-job-resource-pill]");
    if (!pill || !jobsList.contains(pill)) {
      return;
    }
    showJobResourceTooltip(pill);
  }

  function handleJobResourceLeave(event) {
    const pill = event.target.closest("[data-job-resource-pill]");
    if (!pill) {
      return;
    }
    const related = event.relatedTarget;
    if (related && pill.contains(related)) {
      return;
    }
    if (tooltipTarget === pill) {
      hideJobResourceTooltip();
    }
  }

  function handleJobResourceFocus(event) {
    const pill = event.target.closest("[data-job-resource-pill]");
    if (!pill || !jobsList.contains(pill)) {
      return;
    }
    showJobResourceTooltip(pill);
  }

  function handleJobResourceBlur(event) {
    const pill = event.target.closest("[data-job-resource-pill]");
    if (!pill) {
      return;
    }
    const related = event.relatedTarget &&
      typeof event.relatedTarget.closest === "function"
      ? event.relatedTarget.closest("[data-job-resource-pill]")
      : null;
    if (related) {
      return;
    }
    if (tooltipTarget === pill) {
      hideJobResourceTooltip();
    }
  }

  function handleGlobalScroll() {
    if (tooltipTarget) {
      hideJobResourceTooltip(true);
    }
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
    const nextBuilt = Math.max(0, building.built + delta);
    building.built = nextBuilt;
    const capacity = getCapacity(building);
    if (building.active > capacity) {
      building.active = capacity;
    }
    saveState();
    renderBuildings();
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
    saveState();
    renderBuildings();
    updateJobsCount();
  }

  function adjustJob(jobId, delta) {
    const job = state.jobs.find((entry) => entry.id === jobId);
    if (!job) return;
    const otherAssigned = getTotalAssigned() - job.assigned;
    const available = Math.max(0, state.population.total - otherAssigned);
    const desired = job.assigned + delta;
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
    } else if (action === "worker-increment" || action === "worker-decrement") {
      const building = state.buildings.find((entry) => entry.id === buildingId);
      if (!building) return;
      const delta = action === "worker-increment" ? 1 : -1;
      const desired = (Number(building.active) || 0) + delta;
      assignBuildingWorkers(buildingId, desired);
    } else if (action === "trigger-import") {
      const { resource } = button.dataset;
      triggerImportAction(resource);
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
    const { action } = button.dataset;
    if (action === "job-resource-filter") {
      const { resource } = button.dataset;
      if (resource) {
        activateResourceFilter(resource);
        hideJobResourceTooltip(true);
      }
      return;
    }
    const { jobId } = button.dataset;
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
    if (target.matches("input[data-trade-import-slider]")) {
      const tradeId = target.dataset.tradeImportSlider;
      adjustTrade(tradeId, { import: Number(target.value) });
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

  function updateResourcesFromPayload(payload) {
    if (!payload || typeof payload.resources !== "object" || payload.resources === null) {
      return false;
    }
    let changed = false;
    Object.entries(payload.resources).forEach(([key, value]) => {
      if (typeof key !== "string") {
        return;
      }
      const normalizedKey = key.toLowerCase();
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      if (state.resources[normalizedKey] !== numeric) {
        state.resources[normalizedKey] = numeric;
        changed = true;
      }
    });
    return changed;
  }

  function updateBuildingsFromPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return false;
    }

    const resourcesUpdated = updateResourcesFromPayload(payload);

    const remoteBuildings = Array.isArray(payload.buildings)
      ? payload.buildings.map((building) => normaliseBuilding(building)).filter(Boolean)
      : [];

    let buildingsUpdated = false;

    remoteBuildings.forEach((remote) => {
      const remoteKey = remote.type || remote.id || remote.name;
      if (!remoteKey) {
        return;
      }
      const match = state.buildings.find((local) => {
        const localKey = local.type || local.id || local.name;
        if (!localKey) {
          return false;
        }
        return localKey === remoteKey;
      });
      if (!match) {
        return;
      }
      Object.assign(match, {
        inputs: remote.inputs,
        outputs: remote.outputs,
        can_produce: remote.can_produce,
        reason: remote.reason,
        effective_rate: remote.effective_rate,
        pending_eta: remote.pending_eta,
        last_report: remote.last_report,
        cycle_time: remote.cycle_time,
      });
      buildingsUpdated = true;
    });

    if (buildingsUpdated) {
      renderBuildings();
      updateJobsCount();
      saveState();
      logState();
      return true;
    }

    if (resourcesUpdated) {
      renderBuildings();
      updateChips();
      saveState();
      logState();
      return true;
    }

    return false;
  }

  async function loadSeasonFromStateEndpoint() {
    const payload = await fetchJson("/api/state");
    if (!payload) {
      return false;
    }
    if (payload.season) {
      updateSeasonState(payload.season);
    }
    updateBuildingsFromPayload(payload);
    return Boolean(payload.season);
  }

  async function initialiseSeasonSync() {
    const loaded = await loadSeasonFromStateEndpoint();
    if (loaded) {
      return;
    }
    const initPayload = await fetchJson("/api/init", { method: "POST" });
    if (initPayload) {
      if (initPayload.season) {
        updateSeasonState(initPayload.season);
      }
      updateBuildingsFromPayload(initPayload);
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
        if (payload.season) {
          updateSeasonState(payload.season);
        }
        updateBuildingsFromPayload(payload);
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
  jobsList.addEventListener("mouseover", handleJobResourceHover);
  jobsList.addEventListener("mouseout", handleJobResourceLeave);
  jobsList.addEventListener("focusin", handleJobResourceFocus);
  jobsList.addEventListener("focusout", handleJobResourceBlur);

  if (typeof window !== "undefined") {
    window.addEventListener("scroll", handleGlobalScroll, { passive: true });
    window.addEventListener("resize", handleGlobalScroll);
  }
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
