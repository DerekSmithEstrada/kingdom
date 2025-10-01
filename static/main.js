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
    buildings: [
      {
        id: "woodcutter-camp",
        name: "Woodcutter Camp",
        category: "wood",
        built: 1,
        active: 1,
        capacityPerBuilding: 2,
        icon: "🪓",
      },
      {
        id: "lumber-hut",
        name: "Lumber Hut",
        category: "wood",
        built: 2,
        active: 4,
        capacityPerBuilding: 2,
        icon: "🏚️",
      },
      {
        id: "stone-quarry",
        name: "Stone Quarry",
        category: "stone",
        built: 1,
        active: 3,
        capacityPerBuilding: 3,
        icon: "⛏️",
      },
      {
        id: "wheat-farm",
        name: "Wheat Farm",
        category: "crops",
        built: 0,
        active: 0,
        capacityPerBuilding: 2,
        icon: "🌾",
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
  const jobsCountLabel = document.getElementById("jobs-count");
  const seasonLabel = document.getElementById("season-label");
  const seasonFill = document.getElementById("season-fill");

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

  function renderBuildings() {
    Object.values(buildingContainers).forEach((container) => {
      if (container) container.innerHTML = "";
    });

    state.buildings.forEach((building) => {
      const container = buildingContainers[building.category];
      if (!container) return;
      const capacity = getCapacity(building);
      const article = document.createElement("li");
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
          </div>
        </article>
      `;
      container.appendChild(article);
    });
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
