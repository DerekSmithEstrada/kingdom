(function () {
  const STORAGE_KEY = "idle-village-state-v1";

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
    warnings: [],
    buildings: [
      {
        id: "woodcutter-camp",
        name: "Woodcutter Camp",
        category: "wood",
        built: 1,
        active: 1,
        capacityPerBuilding: 2,
        icon: "🪓",
        pending_eta: 18,
        consumes: [
          { resource: "tools", amount: 0.5 },
          { resource: "wheat", amount: 1 },
        ],
      },
      {
        id: "lumber-hut",
        name: "Lumber Hut",
        category: "wood",
        built: 2,
        active: 4,
        capacityPerBuilding: 2,
        icon: "🏚️",
        pending_eta: 24,
        consumes: [
          { resource: "wood", amount: 3 },
          { resource: "tools", amount: 0.25 },
        ],
      },
      {
        id: "stone-quarry",
        name: "Stone Quarry",
        category: "stone",
        built: 1,
        active: 3,
        capacityPerBuilding: 3,
        icon: "⛏️",
        pending_eta: 32,
        consumes: [
          { resource: "tools", amount: 0.75 },
        ],
      },
      {
        id: "wheat-farm",
        name: "Wheat Farm",
        category: "crops",
        built: 0,
        active: 0,
        capacityPerBuilding: 2,
        icon: "🌾",
        pending_eta: 12,
        consumes: [
          { resource: "tools", amount: 0.3 },
        ],
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

  const RESOURCE_METADATA = {
    happiness: { label: "Happiness", icon: "😊" },
    population: { label: "Population", icon: "👤" },
    gold: { label: "Gold", icon: "🪙" },
    wood: { label: "Wood", icon: "🪵" },
    planks: { label: "Planks", icon: "🧱" },
    stone: { label: "Stone", icon: "🪨" },
    tools: { label: "Tools", icon: "🛠️" },
    wheat: { label: "Wheat", icon: "🌾" },
    hops: { label: "Hops", icon: "🍺" },
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
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
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

  const jobsList = document.getElementById("jobs-list");
  const tradeList = document.getElementById("trade-list");
  const tradePanel = document.getElementById("trade");
  const jobsCountLabel = document.getElementById("jobs-count");
  const seasonLabel = document.getElementById("season-label");
  const seasonFill = document.getElementById("season-fill");
  const warningsContainer = document.getElementById("warning-chips");

  function getResourceMeta(resourceKey) {
    if (!resourceKey) {
      return { label: "", icon: "" };
    }
    const meta = RESOURCE_METADATA[resourceKey];
    if (meta) {
      return meta;
    }
    const label = resourceKey.replace(/[-_]/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
    return { label, icon: "" };
  }

  function formatAmount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "0";
    }
    const rounded = Math.round(numeric);
    if (Math.abs(numeric - rounded) < 1e-3) {
      return String(rounded);
    }
    return numeric.toFixed(1);
  }

  function buildConsumesMarkup(building) {
    if (!building || !Array.isArray(building.consumes) || building.consumes.length === 0) {
      return "";
    }
    const pendingEta = Number(building.pending_eta);
    const etaAttribute = Number.isFinite(pendingEta) ? ` data-io-eta="${pendingEta}"` : "";
    const pills = building.consumes
      .filter((entry) => entry && entry.resource)
      .map((entry) => {
        const meta = getResourceMeta(entry.resource);
        const amount = Number(entry.amount) || 0;
        const label = entry.label || meta.label || entry.resource;
        const icon = entry.icon || meta.icon || "";
        const iconText = icon ? `${icon} ` : "";
        return `
          <div class="io-pill group" data-io-resource="${entry.resource}" data-io-amount="${amount}"${etaAttribute}>
            <span class="io-pill-label">${iconText}${label}</span>
            <div class="tooltip io-tooltip">
              <div class="tooltip-arrow"></div>
              <div class="tooltip-content io-tooltip-content"></div>
            </div>
          </div>
        `;
      })
      .join("");

    if (!pills) {
      return "";
    }

    return `
      <div class="io-section" data-building-io="${building.id}">
        <h4 class="io-section-title">Consumes</h4>
        <div class="io-pill-list">
          ${pills}
        </div>
      </div>
    `;
  }

  function renderWarnings() {
    if (!warningsContainer) return;
    warningsContainer.innerHTML = "";
    const warnings = Array.isArray(state.warnings) ? state.warnings : [];
    if (!warnings.length) {
      warningsContainer.classList.add("hidden");
      return;
    }
    warningsContainer.classList.remove("hidden");
    warnings.forEach((warning) => {
      const chip = document.createElement("div");
      chip.className = "chip chip--warning";
      const resourceKey = warning.resource || warning.resource_key || warning.key || "";
      if (resourceKey) {
        chip.dataset.warningResource = resourceKey;
      }
      const meta = getResourceMeta(resourceKey);
      const message = warning.message || warning.text || `Falta: ${meta.label || resourceKey}`;

      const messageWrapper = document.createElement("div");
      messageWrapper.className = "flex flex-col gap-1";
      const messageSpan = document.createElement("span");
      const prefix = warning.icon || meta.icon || "⚠️";
      messageSpan.textContent = `${prefix} ${message}`;
      messageWrapper.appendChild(messageSpan);
      chip.appendChild(messageWrapper);

      const actions = document.createElement("div");
      actions.className = "chip-actions";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip-button";
      button.dataset.action = "auto-import";
      if (resourceKey) {
        button.dataset.resource = resourceKey;
      }
      button.textContent = "Importar";
      actions.appendChild(button);
      chip.appendChild(actions);

      warningsContainer.appendChild(chip);
    });
  }

  function refreshIoTooltips() {
    const inventory = state.resources || {};
    const pillNodes = document.querySelectorAll(".io-pill");
    pillNodes.forEach((pill) => {
      const resourceKey = pill.dataset.ioResource;
      if (!resourceKey) return;
      const required = Number(pill.dataset.ioAmount) || 0;
      const eta = Number(pill.dataset.ioEta);
      const tooltipContent = pill.querySelector(".io-tooltip-content");
      const stock = Number(inventory[resourceKey]) || 0;
      const etaText = Number.isFinite(eta) ? `${eta.toFixed(1)}s` : "—";
      if (tooltipContent) {
        tooltipContent.textContent = `Necesita ${formatAmount(required)}/ciclo. Stock actual: ${formatAmount(stock)}. ETA para siguiente ciclo: ${etaText}`;
      }
      if (stock + 1e-9 < required) {
        pill.classList.add("io-pill--warning");
      } else {
        pill.classList.remove("io-pill--warning");
      }
    });
    if (warningsContainer) {
      const chips = warningsContainer.querySelectorAll(".chip--warning");
      chips.forEach((chip) => {
        const resourceKey = chip.dataset.warningResource;
        if (!resourceKey) return;
        const relatedPill = document.querySelector(`.io-pill[data-io-resource="${resourceKey}"]`);
        if (relatedPill && relatedPill.classList.contains("io-pill--warning")) {
          chip.classList.remove("chip--resolved");
        } else {
          chip.classList.add("chip--resolved");
        }
      });
    }
  }

  function focusTradeForResource(resourceKey) {
    if (!resourceKey || !tradeList) return;
    const tradeRow = tradeList.querySelector(`[data-trade-id="${resourceKey}"]`);
    if (!tradeRow) return;
    if (tradePanel && typeof tradePanel.scrollIntoView === "function") {
      tradePanel.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (typeof tradeRow.scrollIntoView === "function") {
      tradeRow.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const slider = tradeRow.querySelector(`input[data-trade-import-slider="${resourceKey}"]`);
    if (!slider) return;
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const mid = Math.round(min + (max - min) * 0.5);
    slider.value = String(mid);
    const display = tradeRow.querySelector(`[data-trade-import-display="${resourceKey}"]`);
    if (display) {
      display.textContent = String(mid);
    }
    if (typeof slider.focus === "function") {
      slider.focus();
    }
    tradeRow.classList.add("trade-row--highlight");
    window.setTimeout(() => {
      tradeRow.classList.remove("trade-row--highlight");
    }, 1500);
  }

  function handleWarningActions(event) {
    const button = event.target.closest('button[data-action="auto-import"]');
    if (!button) return;
    const { resource } = button.dataset;
    focusTradeForResource(resource);
  }

  function updateTradeRangeDisplays() {
    if (!tradeList) return;
    const sliders = tradeList.querySelectorAll('input[data-trade-import-slider]');
    sliders.forEach((slider) => {
      const tradeId = slider.dataset.tradeImportSlider;
      if (!tradeId) return;
      const parent = slider.parentElement;
      if (!parent) return;
      const display = parent.querySelector(`[data-trade-import-display="${tradeId}"]`);
      if (display) {
        display.textContent = slider.value;
      }
    });
  }

  if (warningsContainer) {
    warningsContainer.addEventListener("click", handleWarningActions);
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
    refreshIoTooltips();
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

  function renderBuildings() {
    Object.values(buildingContainers).forEach((container) => {
      if (container) container.innerHTML = "";
    });

    state.buildings.forEach((building) => {
      const container = buildingContainers[building.category];
      if (!container) return;
      const capacity = getCapacity(building);
      const article = document.createElement("li");
      const consumesMarkup = buildConsumesMarkup(building);
      article.innerHTML = `
        <article class="building-card" data-building-id="${building.id}">
          <span class="icon-badge" role="img" aria-label="${building.name} icon">${building.icon}</span>
          <div class="building-meta">
            <div class="flex items-start justify-between gap-2">
              <h3 class="text-base font-semibold text-slate-100">${building.name}</h3>
              <span class="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">${building.category}</span>
            </div>
            <div class="stat-row">
              <span>Built <strong>${building.built}</strong></span>
              <span>Active <strong>${building.active}</strong></span>
              <span>Capacity <strong>${capacity}</strong></span>
            </div>
            <div class="bar" aria-hidden="true"></div>
            <div class="action-row">
              <button type="button" data-action="build" data-building-id="${building.id}">Build</button>
              <button type="button" data-action="demolish" data-building-id="${building.id}">Demolish</button>
              <label class="flex items-center gap-2 text-xs text-slate-300">
                <span>Workers</span>
                <input type="number" min="0" step="1" value="${building.active}" data-building-input="${building.id}" />
              </label>
              <button type="button" data-action="assign" data-building-id="${building.id}">Assign</button>
            </div>
            ${consumesMarkup}
          </div>
        </article>
      `;
      container.appendChild(article);
    });
    refreshIoTooltips();
  }

  function renderJobs() {
    jobsList.innerHTML = "";
    state.jobs.forEach((job) => {
      const card = document.createElement("div");
      card.className = "job-card";
      card.dataset.jobId = job.id;
      card.innerHTML = `
        <header>
          <div class="flex items-center gap-2 text-slate-100">
            <span class="icon-badge icon-badge--sm" role="img" aria-label="${job.name} icon">${job.icon}</span>
            <span>${job.name}</span>
          </div>
          <span class="text-xs uppercase tracking-[0.2em] text-slate-400">${job.assigned}/${job.max}</span>
        </header>
        <div class="controls">
          <button type="button" data-action="job-decrement" data-job-id="${job.id}">-</button>
          <input type="number" min="0" max="${job.max}" value="${job.assigned}" data-job-input="${job.id}" />
          <button type="button" data-action="job-increment" data-job-id="${job.id}">+</button>
        </div>
      `;
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
          <label class="flex items-center gap-2 text-xs text-slate-300">
            <span>Import</span>
            <input type="range" min="0" max="100" step="1" value="${item.import}" data-trade-import-slider="${item.id}" />
            <span class="trade-range-value" data-trade-import-display="${item.id}">${item.import}</span>
          </label>
        </div>
        <div class="balance ${balance > 0 ? "positive" : balance < 0 ? "negative" : ""}">
          Balance ${balance > 0 ? "+" : ""}${balance}
        </div>
      `;
      tradeList.appendChild(row);
    });
    updateTradeRangeDisplays();
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
    if (target.matches("input[data-trade-import-slider]")) {
      const tradeId = target.dataset.tradeImportSlider;
      if (tradeId) {
        const parent = target.parentElement;
        if (parent) {
          const display = parent.querySelector(`[data-trade-import-display="${tradeId}"]`);
          if (display) {
            display.textContent = target.value;
          }
        }
      }
      adjustTrade(tradeId, { import: Number(target.value) });
      const row = target.closest(".trade-row");
      if (row) {
        row.classList.remove("trade-row--highlight");
      }
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
    if (payload && payload.season) {
      updateSeasonState(payload.season);
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
    if (initPayload && initPayload.season) {
      updateSeasonState(initPayload.season);
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
      if (payload && payload.season) {
        updateSeasonState(payload.season);
      }
      refreshIoTooltips();
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
  renderWarnings();
  attachAccordion();
  updateJobsCount();
  updateChips();
  renderSeason(state.season);
  initialiseSeasonSync().then(startSeasonTickLoop);
})();
