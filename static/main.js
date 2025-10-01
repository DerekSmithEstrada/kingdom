(function () {
  const BUILDING_TYPES = {
    woodcutter_camp: { name: "Woodcutter Camp", icon: "🪓", category: "Forestry" },
    lumber_hut: { name: "Lumber Hut", icon: "🏚️", category: "Forestry" },
    stone_quarry: { name: "Stone Quarry", icon: "⛏️", category: "Mining" },
    wheat_farm: { name: "Wheat Farm", icon: "🌾", category: "Agriculture" },
    brewery: { name: "Brewery", icon: "🍺", category: "Industry" },
  };

  const RESOURCE_INFO = {
    WOOD: { label: "Wood", icon: "🪵" },
    STONE: { label: "Stone", icon: "🪨" },
    GRAIN: { label: "Grain", icon: "🌾" },
    WATER: { label: "Water", icon: "💧" },
    GOLD: { label: "Gold", icon: "🪙" },
    HOPS: { label: "Hops", icon: "🍺" },
  };

  const state = {
    hud: null,
    buildings: [],
    jobs: null,
    trade: {},
    initialised: false,
  };

  const hudChips = document.getElementById("hud-chips");
  const hudStatus = document.getElementById("hud-status");
  const hudWarnings = document.getElementById("hud-warnings");

  const buildingList = document.getElementById("building-list");
  const buildingStatus = document.getElementById("buildings-status");
  const buildForm = document.getElementById("build-form");
  const buildSelect = document.getElementById("build-type");

  const jobsList = document.getElementById("jobs-list");
  const jobsStatus = document.getElementById("jobs-status");
  const jobsCount = document.getElementById("jobs-count");
  const workersAvailable = document.getElementById("workers-available");
  const workersAssigned = document.getElementById("workers-assigned");

  const tradeList = document.getElementById("trade-list");
  const tradeStatus = document.getElementById("trade-status");

  function setStatus(element, type, message) {
    if (!element) return;
    element.classList.remove("loading", "error");
    if (!type) {
      element.textContent = "";
      element.setAttribute("hidden", "hidden");
      return;
    }
    if (type === "loading") {
      element.classList.add("loading");
    } else if (type === "error") {
      element.classList.add("error");
    }
    element.textContent = message;
    element.removeAttribute("hidden");
  }

  function capitalise(value) {
    if (typeof value !== "string" || !value.length) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function formatTime(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(total / 60);
    const secs = Math.floor(total % 60);
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function formatNumber(value) {
    const num = Number(value) || 0;
    if (Math.abs(num) >= 100) {
      return Math.round(num);
    }
    return Number(num.toFixed(1));
  }

  function formatRate(value) {
    const num = Number(value) || 0;
    const rounded = Math.abs(num) >= 10 ? num.toFixed(1) : num.toFixed(2);
    return `${num > 0 ? "+" : ""}${rounded}`;
  }

  function statusInfo(code) {
    const map = {
      ok: { label: "Active", className: "is-active" },
      pausado: { label: "Paused", className: "is-paused" },
      falta_insumos: { label: "No inputs", className: "is-error" },
      capacidad_llena: { label: "Storage full", className: "is-error" },
      falta_mantenimiento: { label: "Maintenance", className: "is-error" },
    };
    return map[code] || { label: capitalise(code || "Unknown"), className: "" };
  }

  async function callApi(url, { method = "GET", body } = {}) {
    const options = {
      method,
      headers: { Accept: "application/json" },
    };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
      options.headers["Content-Type"] = "application/json";
    }
    const response = await fetch(url, options);
    let data;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }
    if (!response.ok) {
      const message = (data && data.error) || response.statusText;
      throw new Error(message || "Unexpected response");
    }
    if (data && data.ok === false) {
      throw new Error(data.error || "Operation failed");
    }
    return data || {};
  }

  function populateBuildOptions() {
    if (!buildSelect) return;
    buildSelect.innerHTML = "";
    const fragment = document.createDocumentFragment();
    Object.entries(BUILDING_TYPES).forEach(([value, meta]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = `${meta.icon} ${meta.name}`;
      fragment.appendChild(option);
    });
    buildSelect.appendChild(fragment);
  }

  function renderWarnings() {
    if (!hudWarnings) return;
    hudWarnings.innerHTML = "";
    const warnings = (state.hud && Array.isArray(state.hud.warnings)) ? state.hud.warnings : [];
    if (!warnings.length) {
      const item = document.createElement("li");
      item.className = "empty";
      item.textContent = "All systems stable";
      hudWarnings.appendChild(item);
      return;
    }
    warnings.forEach((warning) => {
      const item = document.createElement("li");
      item.textContent = warning;
      hudWarnings.appendChild(item);
    });
  }

  function renderHud() {
    if (!hudChips) return;
    if (!state.hud) {
      hudChips.innerHTML = "";
      setStatus(hudStatus, "loading", "Loading HUD…");
      return;
    }
    setStatus(hudStatus, null);
    hudChips.setAttribute("aria-busy", "false");
    hudChips.innerHTML = "";
    const chips = [];
    chips.push({ label: "Season", value: capitalise(state.hud.season || "-") });
    chips.push({ label: "Time left", value: formatTime(state.hud.time_left) });
    if (state.jobs) {
      const used = state.jobs.total_workers - state.jobs.available_workers;
      chips.push({ label: "Workers", value: `${used}/${state.jobs.total_workers}` });
    }
    const resources = Array.isArray(state.hud.resources) ? state.hud.resources : [];
    resources.forEach((resource) => {
      const info = RESOURCE_INFO[resource.key] || { label: capitalise(resource.key), icon: "📦" };
      const amount = formatNumber(resource.amount);
      const capacity = resource.capacity != null ? formatNumber(resource.capacity) : null;
      chips.push({
        label: `${info.icon} ${info.label}`,
        value: capacity != null ? `${amount}/${capacity}` : `${amount}`,
      });
    });
    const fragment = document.createDocumentFragment();
    chips.forEach((chip) => {
      const div = document.createElement("div");
      div.className = "chip";
      const label = document.createElement("span");
      label.textContent = chip.label;
      const value = document.createElement("span");
      value.className = "value";
      value.textContent = chip.value;
      div.appendChild(label);
      div.appendChild(value);
      fragment.appendChild(div);
    });
    hudChips.appendChild(fragment);
    renderWarnings();
  }

  function formatResourceMap(map) {
    const entries = Object.entries(map || {});
    if (!entries.length) {
      return "—";
    }
    return entries
      .map(([key, value]) => {
        const info = RESOURCE_INFO[key] || { label: capitalise(key), icon: "📦" };
        return `${info.icon} ${info.label}: ${formatNumber(value)}`;
      })
      .join("  ·  ");
  }

  function renderBuildings() {
    if (!buildingList) return;
    buildingList.innerHTML = "";
    if (!state.initialised) {
      setStatus(buildingStatus, "loading", "Loading buildings…");
      return;
    }
    if (!Array.isArray(state.buildings) || !state.buildings.length) {
      setStatus(buildingStatus, null);
      const empty = document.createElement("li");
      empty.className = "empty-placeholder";
      empty.textContent = "No buildings constructed yet. Use the selector above to build one.";
      buildingList.appendChild(empty);
      return;
    }
    setStatus(buildingStatus, null);
    const fragment = document.createDocumentFragment();
    state.buildings.forEach((building) => {
      const meta = BUILDING_TYPES[building.type] || { name: building.name, icon: "🏛️", category: capitalise(building.type) };
      const status = statusInfo(building.status);
      const listItem = document.createElement("li");
      listItem.className = "building-card";
      listItem.dataset.buildingId = String(building.id);
      listItem.innerHTML = `
        <article>
          <header class="building-card__header">
            <div class="flex items-start gap-3">
              <span class="icon-badge" role="img" aria-label="${meta.name} icon">${meta.icon}</span>
              <div>
                <h3 class="building-card__title">${meta.name}</h3>
                <p class="building-card__subtitle">ID #${building.id} · ${meta.category}</p>
              </div>
            </div>
            <span class="building-card__status ${status.className}">${status.label}</span>
          </header>
          <div class="stat-row">
            <span>Workers <strong>${building.active_workers}/${building.max_workers}</strong></span>
            <span>Cycle <strong>${formatNumber(building.cycle_time)}s</strong></span>
            <span>${building.enabled ? "Enabled" : "Disabled"}</span>
          </div>
          <div class="building-card__divider" aria-hidden="true"></div>
          <div class="building-card__resources">
            <span><span>Inputs</span><strong>${formatResourceMap(building.inputs)}</strong></span>
            <span><span>Outputs</span><strong>${formatResourceMap(building.outputs)}</strong></span>
            <span><span>Maintenance</span><strong>${formatResourceMap(building.maintenance)}</strong></span>
          </div>
          <div class="building-card__divider" aria-hidden="true"></div>
          <div class="action-row">
            <label class="flex items-center gap-2 text-xs text-slate-300">
              <span>Workers</span>
              <input
                type="number"
                min="0"
                step="1"
                value="${building.active_workers}"
                data-role="worker-input"
                aria-label="Workers assigned to ${meta.name}"
              />
            </label>
            <button type="button" data-action="set-workers">Apply</button>
            <button type="button" data-action="toggle" data-enabled="${building.enabled ? "true" : "false"}" class="button--ghost">
              ${building.enabled ? "Disable" : "Enable"}
            </button>
            <button type="button" data-action="demolish" class="button--danger">Demolish</button>
          </div>
        </article>
      `;
      fragment.appendChild(listItem);
    });
    buildingList.appendChild(fragment);
  }

  function renderJobs() {
    if (!jobsList) return;
    if (!state.initialised) {
      setStatus(jobsStatus, "loading", "Loading workers…");
      jobsList.innerHTML = "";
      return;
    }
    const jobsData = state.jobs;
    if (!jobsData) {
      setStatus(jobsStatus, "error", "Worker data unavailable");
      return;
    }
    setStatus(jobsStatus, null);
    const used = jobsData.total_workers - jobsData.available_workers;
    if (jobsCount) {
      jobsCount.textContent = `${used}/${jobsData.total_workers}`;
    }
    if (workersAvailable) {
      workersAvailable.textContent = `${jobsData.available_workers}`;
    }
    if (workersAssigned) {
      workersAssigned.textContent = `${used}`;
    }
    const assignments = jobsData.buildings || {};
    jobsList.innerHTML = "";
    const entries = Object.entries(assignments);
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "empty-placeholder";
      empty.textContent = "No workers assigned yet. Use the building cards to assign staff.";
      jobsList.appendChild(empty);
      return;
    }
    entries.forEach(([id, info]) => {
      const building = state.buildings.find((entry) => entry.id === Number(id));
      const meta = building ? (BUILDING_TYPES[building.type] || { name: building.name, icon: "🏛️" }) : { name: `Building #${id}`, icon: "🏛️" };
      const card = document.createElement("div");
      card.className = "job-card";
      card.innerHTML = `
        <header>
          <div class="flex items-center gap-2 text-slate-100">
            <span class="icon-badge icon-badge--sm" role="img" aria-label="${meta.name} icon">${meta.icon}</span>
            <span>${meta.name}</span>
          </div>
          <span class="text-xs uppercase tracking-[0.2em] text-slate-400">${info.assigned}/${building ? building.max_workers : info.max || info.assigned}</span>
        </header>
        <p class="text-xs text-slate-400">Building ID #${id}</p>
      `;
      jobsList.appendChild(card);
    });
  }

  function renderTrade() {
    if (!tradeList) return;
    if (!state.initialised) {
      setStatus(tradeStatus, "loading", "Loading trade…");
      tradeList.innerHTML = "";
      return;
    }
    const tradeData = state.trade || {};
    tradeList.innerHTML = "";
    const entries = Object.entries(tradeData);
    if (!entries.length) {
      setStatus(tradeStatus, null);
      const empty = document.createElement("div");
      empty.className = "empty-placeholder";
      empty.textContent = "Trade channels will appear once configured.";
      tradeList.appendChild(empty);
      return;
    }
    setStatus(tradeStatus, null);
    const fragment = document.createDocumentFragment();
    entries.forEach(([resourceKey, info]) => {
      const meta = RESOURCE_INFO[resourceKey] || { label: capitalise(resourceKey), icon: "📦" };
      const estimate = Number(info.estimate_per_min || 0);
      const row = document.createElement("div");
      row.className = "trade-row";
      row.dataset.resource = resourceKey;
      row.innerHTML = `
        <div class="flex items-center gap-3 text-sm font-semibold text-slate-100">
          <span class="icon-badge icon-badge--sm" role="img" aria-label="${meta.label} icon">${meta.icon}</span>
          <span>${meta.label}</span>
        </div>
        <div class="controls">
          <label>
            Mode
            <select data-trade-mode="${resourceKey}">
              <option value="pause" ${info.mode === "pause" ? "selected" : ""}>Pause</option>
              <option value="import" ${info.mode === "import" ? "selected" : ""}>Import</option>
              <option value="export" ${info.mode === "export" ? "selected" : ""}>Export</option>
            </select>
          </label>
          <label>
            Rate / min
            <input
              type="number"
              min="0"
              step="1"
              value="${formatNumber(info.rate_per_min)}"
              data-trade-rate="${resourceKey}"
            />
          </label>
          <div class="trade-row__meta">
            <span class="price-tag">${formatNumber(info.price || 0)} gold</span>
            <span class="estimate-tag ${estimate < 0 ? "negative" : ""}">${formatRate(estimate)} / min</span>
          </div>
        </div>
      `;
      fragment.appendChild(row);
    });
    tradeList.appendChild(fragment);
  }

  async function refreshAll() {
    if (!state.initialised) return;
    try {
      const [hudData, buildingData] = await Promise.all([
        callApi("/api/hud"),
        callApi("/api/buildings"),
      ]);
      state.hud = hudData.hud || state.hud;
      state.trade = hudData.trade || state.trade;
      state.buildings = buildingData.buildings || [];
      state.jobs = buildingData.jobs || hudData.jobs || state.jobs;
      renderHud();
      renderBuildings();
      renderJobs();
      renderTrade();
    } catch (error) {
      setStatus(hudStatus, "error", error.message || "Failed to refresh data");
    }
  }

  async function performAction(sectionElement, message, action, { refresh = true } = {}) {
    if (sectionElement) {
      setStatus(sectionElement, "loading", message);
    }
    try {
      await action();
      if (refresh) {
        await refreshAll();
      }
      if (sectionElement) {
        setStatus(sectionElement, null);
      }
    } catch (error) {
      if (sectionElement) {
        setStatus(sectionElement, "error", error.message || "Operation failed");
      }
      throw error;
    }
  }

  async function updateBuildingWorkers(buildingId, desired) {
    const building = state.buildings.find((entry) => entry.id === buildingId);
    if (!building) {
      throw new Error("Unknown building");
    }
    const clamped = Math.max(0, Math.min(Math.floor(desired), building.max_workers));
    const delta = clamped - building.active_workers;
    if (delta === 0) {
      return;
    }
    if (delta > 0) {
      await performAction(
        buildingStatus,
        "Assigning workers…",
        () => callApi("/api/actions/assign", { method: "POST", body: { id: buildingId, workers: delta } }),
        { refresh: false },
      );
    } else {
      await performAction(
        buildingStatus,
        "Unassigning workers…",
        () =>
          callApi("/api/actions/unassign", {
            method: "POST",
            body: { id: buildingId, workers: Math.abs(delta) },
          }),
        { refresh: false },
      );
    }
    await refreshAll();
  }

  function attachEventListeners() {
    if (buildForm) {
      buildForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!buildSelect) return;
        const type = buildSelect.value;
        if (!type) return;
        performAction(
          buildingStatus,
          "Constructing building…",
          () => callApi("/api/actions/build", { method: "POST", body: { type } }),
        ).catch(() => {});
      });
    }

    if (buildingList) {
      buildingList.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const item = button.closest("[data-building-id]");
        if (!item) return;
        const buildingId = Number(item.dataset.buildingId);
        if (!Number.isFinite(buildingId)) return;
        const action = button.dataset.action;
        if (action === "set-workers") {
          const input = item.querySelector("input[data-role=\"worker-input\"]");
          const desired = input ? Number(input.value) : 0;
          updateBuildingWorkers(buildingId, desired).catch(() => {});
        } else if (action === "toggle") {
          const enabled = button.dataset.enabled === "true";
          performAction(
            buildingStatus,
            enabled ? "Disabling building…" : "Enabling building…",
            () =>
              callApi("/api/actions/toggle", {
                method: "POST",
                body: { id: buildingId, enabled: !enabled },
              }),
          ).catch(() => {});
        } else if (action === "demolish") {
          performAction(
            buildingStatus,
            "Demolishing building…",
            () => callApi("/api/actions/demolish", { method: "POST", body: { id: buildingId } }),
          ).catch(() => {});
        }
      });
    }

    if (buildingList) {
      buildingList.addEventListener("change", (event) => {
        const input = event.target;
        if (!input.matches("input[data-role=\"worker-input\"]")) return;
        const item = input.closest("[data-building-id]");
        if (!item) return;
        const buildingId = Number(item.dataset.buildingId);
        const building = state.buildings.find((entry) => entry.id === buildingId);
        if (!building) return;
        const value = Math.max(0, Math.min(Number(input.value) || 0, building.max_workers));
        input.value = value;
      });
    }

    if (tradeList) {
      tradeList.addEventListener("change", (event) => {
        const target = event.target;
        if (target.matches("select[data-trade-mode]")) {
          const resource = target.dataset.tradeMode;
          const mode = target.value;
          performAction(
            tradeStatus,
            "Updating trade mode…",
            () => callApi("/api/actions/trade/mode", { method: "POST", body: { resource, mode } }),
          ).catch(() => {});
        }
        if (target.matches("input[data-trade-rate]")) {
          const resource = target.dataset.tradeRate;
          const rate = Math.max(0, Number(target.value) || 0);
          target.value = rate;
          performAction(
            tradeStatus,
            "Updating trade rate…",
            () => callApi("/api/actions/trade/rate", { method: "POST", body: { resource, rate } }),
          ).catch(() => {});
        }
      });
    }
  }

  async function bootstrap() {
    populateBuildOptions();
    setStatus(hudStatus, "loading", "Initialising game…");
    setStatus(buildingStatus, "loading", "Initialising game…");
    setStatus(jobsStatus, "loading", "Initialising game…");
    setStatus(tradeStatus, "loading", "Initialising game…");
    try {
      const data = await callApi("/api/init", { method: "POST" });
      state.hud = data.hud || null;
      state.buildings = data.buildings || [];
      state.jobs = data.jobs || null;
      state.trade = data.trade || {};
      state.initialised = true;
      renderHud();
      renderBuildings();
      renderJobs();
      renderTrade();
    } catch (error) {
      const message = error.message || "Failed to initialise game";
      setStatus(hudStatus, "error", message);
      setStatus(buildingStatus, "error", message);
      setStatus(jobsStatus, "error", message);
      setStatus(tradeStatus, "error", message);
      return;
    }
    await refreshAll();
  }

  attachEventListeners();
  bootstrap();
})();
