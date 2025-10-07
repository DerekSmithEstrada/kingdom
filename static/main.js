(function () {
  const STORAGE_KEY = "idle-village-state-v1";

  const searchParams =
    typeof window !== "undefined"
      ? (() => {
          try {
            return new URLSearchParams(window.location.search);
          } catch (error) {
            return null;
          }
        })()
      : null;

  function parseFlag(value) {
    if (typeof value !== "string") {
      return false;
    }
    const normalised = value.trim().toLowerCase();
    if (!normalised) {
      return false;
    }
    if (["0", "false", "no", "off"].includes(normalised)) {
      return false;
    }
    return ["1", "true", "yes", "on"].includes(normalised);
  }

  const verifyModeEnabled = searchParams ? parseFlag(searchParams.get("verify")) : false;

  const shouldForceReset =
    verifyModeEnabled || (searchParams ? parseFlag(searchParams.get("reset")) : false);

  const stackedFlagFromQuery = searchParams
    ? parseFlag(searchParams.get("stacked"))
    : false;

  const featureFlags = {
    UI_STACKED_VIEW: stackedFlagFromQuery,
  };

  const stackedWarnings = new Set();

  const verifyState = (() => {
    const base = {
      enabled: Boolean(verifyModeEnabled),
      log: [],
      definitions: [
        { key: "firstRequest", label: "Primer request = POST /api/init?reset=1" },
        { key: "initialResources", label: "Recursos visibles en 0 en primer render" },
        { key: "woodcutterVisible", label: "Sólo Woodcutter Camp, workers=0" },
        { key: "woodGain", label: "Con 1 worker y 10 ticks: Wood +1.0 (±0.01)" },
        { key: "otherResourcesZero", label: "Otros recursos permanecen en 0" },
      ],
      checks: new Map(),
      rowElements: new Map(),
      overlay: null,
      firstRequest: null,
      latestResources: null,
    };

    base.definitions.forEach((definition) => {
      base.checks.set(definition.key, {
        key: definition.key,
        label: definition.label,
        status: "pending",
        detail: "",
      });
    });

    return base;
  })();

  if (verifyState.enabled && typeof window !== "undefined") {
    window.__verifyLog = verifyState.log;
  }

  function cloneForLog(value) {
    if (value === null || value === undefined) {
      return value;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function stringifyDetail(detail) {
    if (detail === null || detail === undefined) {
      return "";
    }
    if (typeof detail === "string") {
      return detail;
    }
    try {
      return JSON.stringify(detail);
    } catch (error) {
      return String(detail);
    }
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).replace(/[&<>"']/g, (match) => {
      switch (match) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return "&#39;";
      }
    });
  }

  function warnStack(key, detail) {
    if (!featureFlags.UI_STACKED_VIEW) {
      return;
    }
    const token = `${key}:${detail || ""}`;
    if (stackedWarnings.has(token)) {
      return;
    }
    stackedWarnings.add(token);
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn("[Idle Village][Stacked]", key, detail);
    }
  }

  function pushVerifyLog(step, detail) {
    if (!verifyState.enabled) {
      return;
    }
    const entry = {
      step,
      detail: cloneForLog(detail),
      timestamp: new Date().toISOString(),
    };
    verifyState.log.push(entry);
    if (typeof console !== "undefined") {
      const logger =
        typeof console.debug === "function" ? console.debug : console.log;
      if (typeof logger === "function") {
        logger.call(console, "[Idle Village][VERIFY]", step, detail);
      }
    }
  }

  function applyVerifyCheckToRow(key) {
    if (!verifyState.enabled) {
      return;
    }
    const entry = verifyState.checks.get(key);
    const elements = verifyState.rowElements.get(key);
    if (!entry || !elements) {
      return;
    }
    const { row, statusCell } = elements;
    statusCell.classList.remove(
      "verify-overlay__status--pass",
      "verify-overlay__status--fail"
    );
    row.classList.remove(
      "verify-overlay__row--pass",
      "verify-overlay__row--fail"
    );
    if (entry.status === "pass") {
      statusCell.textContent = "PASS";
      statusCell.classList.add("verify-overlay__status--pass");
      row.classList.add("verify-overlay__row--pass");
    } else if (entry.status === "fail") {
      statusCell.textContent = "FAIL";
      statusCell.classList.add("verify-overlay__status--fail");
      row.classList.add("verify-overlay__row--fail");
    } else {
      statusCell.textContent = "—";
    }
    if (entry.detail) {
      statusCell.title = entry.detail;
    } else {
      statusCell.removeAttribute("title");
    }
  }

  function updateVerifyCheck(key, pass, detail) {
    if (!verifyState.enabled) {
      return;
    }
    const entry = verifyState.checks.get(key);
    if (!entry) {
      return;
    }
    if (pass === null) {
      entry.status = "pending";
    } else {
      entry.status = pass ? "pass" : "fail";
    }
    entry.detail = stringifyDetail(detail);
    applyVerifyCheckToRow(key);
    if (pass === null) {
      pushVerifyLog("check-pending", { key, detail: entry.detail });
    } else {
      pushVerifyLog(pass ? "check-pass" : "check-fail", {
        key,
        detail: entry.detail,
      });
    }
  }

  function ensureVerifyOverlay() {
    if (!verifyState.enabled || typeof document === "undefined") {
      return;
    }
    if (verifyState.overlay) {
      return;
    }
    const overlay = document.createElement("aside");
    overlay.className = "verify-overlay";

    const header = document.createElement("div");
    header.className = "verify-overlay__header";

    const title = document.createElement("span");
    title.className = "verify-overlay__title";
    title.textContent = "Modo verificación";

    const consoleButton = document.createElement("button");
    consoleButton.type = "button";
    consoleButton.className = "verify-overlay__console";
    consoleButton.textContent = "Ver consola";
    consoleButton.addEventListener("click", () => {
      pushVerifyLog("console-requested", { entries: verifyState.log.length });
      if (typeof console !== "undefined") {
        if (typeof console.table === "function") {
          console.table(verifyState.log);
        } else if (typeof console.log === "function") {
          console.log("Idle Village verification log", verifyState.log);
        }
      }
    });

    header.append(title, consoleButton);

    const table = document.createElement("table");
    table.className = "verify-overlay__table";
    const tbody = document.createElement("tbody");

    verifyState.definitions.forEach((definition) => {
      const row = document.createElement("tr");
      row.className = "verify-overlay__row";
      row.dataset.checkKey = definition.key;

      const labelCell = document.createElement("td");
      labelCell.className = "verify-overlay__label";
      labelCell.textContent = definition.label;

      const statusCell = document.createElement("td");
      statusCell.className = "verify-overlay__status";
      statusCell.textContent = "—";

      row.append(labelCell, statusCell);
      tbody.appendChild(row);
      verifyState.rowElements.set(definition.key, { row, statusCell });
      applyVerifyCheckToRow(definition.key);
    });

    table.appendChild(tbody);
    overlay.append(header, table);
    document.body.appendChild(overlay);
    verifyState.overlay = overlay;
  }

  if (verifyState.enabled) {
    pushVerifyLog("verify-mode", { shouldForceReset });
    ensureVerifyOverlay();
  }

  if (verifyState.enabled && typeof fetch === "function") {
    const originalFetch = fetch.bind(window);
    window.fetch = async function patchedFetch(resource, options = {}) {
      const method = options && options.method ? String(options.method).toUpperCase() : "GET";
      const requestUrl =
        typeof resource === "string"
          ? resource
          : resource && typeof resource.url === "string"
          ? resource.url
          : "";
      let path = requestUrl;
      if (typeof requestUrl === "string" && requestUrl) {
        try {
          const parsed = new URL(requestUrl, window.location.origin);
          path = `${parsed.pathname}${parsed.search}`;
        } catch (error) {
          path = requestUrl;
        }
      }

      if (!verifyState.firstRequest) {
        verifyState.firstRequest = { method, path };
        const matches = method === "POST" && path === "/api/init?reset=1";
        updateVerifyCheck("firstRequest", matches, `Observado ${method} ${path}`);
        pushVerifyLog("first-request", { method, path });
      }

      try {
        const response = await originalFetch(resource, options);
        if (!response.ok) {
          pushVerifyLog("fetch-nok", {
            method,
            path,
            status: response.status,
          });
        }
        return response;
      } catch (error) {
        pushVerifyLog("fetch-error", {
          method,
          path,
          message: error && error.message ? error.message : String(error),
        });
        throw error;
      }
    };
  }

  const persistedSnapshot = (() => {
    if (typeof window === "undefined") {
      return null;
    }
    if (shouldForceReset) {
      pushVerifyLog("cache-reset", { key: STORAGE_KEY });
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        pushVerifyLog("cache-reset-error", {
          message: error && error.message ? error.message : String(error),
        });
        if (typeof console !== "undefined" && typeof console.warn === "function") {
          console.warn("Idle Village: failed to purge cached state", error);
        }
      }
      return null;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (error) {
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn("Idle Village: failed to load state", error);
      }
      return null;
    }
  })();

  const hasPersistedState = Boolean(persistedSnapshot);

  const resourceIconMap = {
    gold: "🪙",
    wood: "🪵",
    sticks: "🥢",
    planks: "🪚",
    plank: "🪚",
    stone: "🪨",
    stones: "🪨",
    tools: "🛠️",
    wheat: "🌾",
    grain: "🌾",
    ore: "⛏️",
    seeds: "🌱",
    water: "💧",
    hops: "🍺",
    happiness: "😊",
  };

  const WOODCUTTER_RATE_PER_SECOND = 0.01;

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
    const candidateId =
      typeof building.id === "string" && building.id
        ? normaliseKey(building.id)
        : null;
    const inputs = normaliseResourceMap(
      building.inputs || building.input || building.inputs_per_cycle
    );
    const outputs = normaliseResourceMap(
      building.outputs || building.output || building.outputs_per_cycle
    );
    const storage = normaliseResourceMap(
      building.storage || building.capacity_map || {}
    );
    const cost = normaliseResourceMap(building.cost);
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
    const perMinuteValue = Number(building.produces_per_min);
    const producesUnit =
      typeof building.produces_unit === "string" ? building.produces_unit : null;
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
    const normalisedId =
      candidateId ||
      (typeof typeKey === "string" && typeKey
        ? normaliseKey(typeKey)
        : null);

    const categoryKey =
      typeof building.category === "string" && building.category.trim()
        ? building.category.trim().toLowerCase()
        : "general";
    const categoryLabel =
      typeof building.category_label === "string" && building.category_label.trim()
        ? building.category_label.trim()
        : categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
    const icon =
      typeof building.icon === "string" && building.icon.trim()
        ? building.icon
        : "🏗️";
    const jobId =
      typeof building.job === "string" && building.job.trim()
        ? building.job.trim()
        : null;
    const jobName =
      typeof building.job_name === "string" && building.job_name.trim()
        ? building.job_name.trim()
        : jobId
        ? formatResourceKey(jobId)
        : null;
    const jobIcon =
      typeof building.job_icon === "string" && building.job_icon.trim()
        ? building.job_icon
        : null;
    const buildLabel =
      typeof building.build_label === "string" && building.build_label.trim()
        ? building.build_label.trim()
        : typeof building.name === "string"
        ? building.name
        : jobName || null;
    const perWorkerOutputs = normaliseResourceMap(
      building.per_worker_output_rate || building.perWorkerOutputRate
    );
    const perWorkerInputs = normaliseResourceMap(
      building.per_worker_input_rate || building.perWorkerInputRate
    );
    const role =
      typeof building.role === "string" && building.role.trim()
        ? building.role.trim().toLowerCase()
        : null;
    const levelValue = Number(building.level);
    const level = Number.isFinite(levelValue) ? Math.max(1, Math.round(levelValue)) : 1;
    const outputsPerWorker = normaliseResourceMap(
      building.outputs_per_worker || building.outputsPerWorker || perWorkerOutputs
    );
    const inputsPerWorker = normaliseResourceMap(
      building.inputs_per_worker || building.inputsPerWorker || perWorkerInputs
    );

    const normalised = {
      inputs,
      outputs,
      storage,
      can_produce:
        typeof building.can_produce === "boolean" ? building.can_produce : false,
      reason: typeof building.reason === "string" ? building.reason : null,
      effective_rate: Number.isFinite(effectiveRate) ? effectiveRate : 0,
      pending_eta: Number.isFinite(pendingEta) ? pendingEta : null,
      last_report: normaliseReport(building.last_report || building.production_report),
      cycle_time: Number.isFinite(cycleTime) ? cycleTime : 60,
      type: typeKey,
      id:
        typeof normalisedId === "string" && normalisedId
          ? normalisedId
          : building.id,
      active: Number.isFinite(activeWorkers) ? activeWorkers : 0,
      built: Number.isFinite(builtCount) ? builtCount : 0,
      capacityPerBuilding:
        Number.isFinite(derivedCapacity) && derivedCapacity > 0
          ? derivedCapacity
          : typeof building.capacityPerBuilding === "number"
          ? building.capacityPerBuilding
          : 0,
      category: categoryKey,
      category_label: categoryLabel,
      icon,
      job: jobId,
      job_name: jobName,
      job_icon: jobIcon,
      build_label: buildLabel,
      per_worker_output_rate: perWorkerOutputs,
      per_worker_input_rate: perWorkerInputs,
      outputs_per_worker: outputsPerWorker,
      inputs_per_worker: inputsPerWorker,
      role,
      level,
    };

    if (Number.isFinite(perMinuteValue)) {
      normalised.produces_per_min = perMinuteValue;
    }
    if (producesUnit) {
      normalised.produces_unit = producesUnit;
    }
    if (Object.keys(cost).length > 0) {
      normalised.cost = cost;
    }

    return { ...building, ...normalised };
  }

  function normalisePopulation(snapshot) {
    const base = { current: 0, capacity: 0, available: 0, total: 0 };
    if (!snapshot || typeof snapshot !== "object") {
      return { ...base };
    }
    const rawCurrent = Number(
      snapshot.current !== undefined ? snapshot.current : snapshot.total
    );
    const rawCapacity = Number(
      snapshot.capacity !== undefined
        ? snapshot.capacity
        : snapshot.max !== undefined
        ? snapshot.max
        : snapshot.total !== undefined
        ? snapshot.total
        : rawCurrent
    );
    const current = Number.isFinite(rawCurrent) && rawCurrent > 0 ? Math.floor(rawCurrent) : 0;
    const capacityValue = Number.isFinite(rawCapacity) && rawCapacity > 0 ? Math.floor(rawCapacity) : 0;
    const normalisedCapacity = Math.max(capacityValue, current);
    const rawAvailable = Number(
      snapshot.available !== undefined
        ? snapshot.available
        : snapshot.free !== undefined
        ? snapshot.free
        : snapshot.unassigned !== undefined
        ? snapshot.unassigned
        : snapshot.current !== undefined
        ? snapshot.current
        : rawCurrent
    );
    const available = Number.isFinite(rawAvailable)
      ? Math.max(0, Math.min(current, Math.floor(rawAvailable)))
      : current;
    return {
      current,
      capacity: normalisedCapacity,
      available,
      total: current,
    };
  }

  function normaliseUiState(snapshot) {
    const base = clone(defaultUiState);
    if (!snapshot || typeof snapshot !== "object") {
      return base;
    }
    const next = { ...base, ...snapshot };
    const buildingUi = snapshot.buildings || {};
    next.buildings = { ...base.buildings, ...buildingUi };
    const stackedFilters = buildingUi.stackedFilters || next.buildings.stackedFilters || {};
    const minLevelValue = Number(stackedFilters.minLevel);
    next.buildings.stackedFilters = {
      onlyActive: Boolean(stackedFilters.onlyActive),
      minLevel: Number.isFinite(minLevelValue)
        ? Math.max(0, Math.min(10, Math.floor(minLevelValue)))
        : 0,
      requireInputsOk: Boolean(stackedFilters.requireInputsOk),
    };
    next.buildings.viewMode =
      next.buildings.viewMode === "stacked" ? "stacked" : "classic";
    const filters = buildingUi.filters || {};
    next.buildings.filters = {
      ...base.buildings.filters,
      ...filters,
      status: {
        ...base.buildings.filters.status,
        ...(filters.status || {}),
      },
    };
    const density = next.buildings.density === "detailed" ? "detailed" : "compact";
    next.buildings.density = density;
    const sort = typeof next.buildings.sort === "string" ? next.buildings.sort : "efficiency";
    next.buildings.sort = sort;
    const levelValue = next.buildings.filters.level;
    if (levelValue !== null) {
      const numericLevel = Number(levelValue);
      next.buildings.filters.level = Number.isFinite(numericLevel)
        ? Math.max(1, Math.min(5, Math.round(numericLevel)))
        : null;
    }
    next.buildings.filters.category =
      typeof next.buildings.filters.category === "string"
        ? next.buildings.filters.category.toLowerCase()
        : "all";
    next.buildings.filters.showObsolete = Boolean(next.buildings.filters.showObsolete);
    if (!Array.isArray(next.favorites)) {
      next.favorites = [];
    }
    next.favorites = Array.from(
      new Set(
        next.favorites
          .map((value) => (typeof value === "string" ? value : String(value)))
          .filter(Boolean)
      )
    );
    return next;
  }

  function normaliseState(snapshot) {
    const next = { ...snapshot };
    next.buildings = Array.isArray(snapshot.buildings)
      ? snapshot.buildings
          .map((building) => normaliseBuilding(building))
          .filter(Boolean)
      : [];
    next.population = normalisePopulation(snapshot.population || next.population);
    next.ui = normaliseUiState(snapshot.ui || snapshot.UI || snapshot.Ui);
    return next;
  }

  function extractPayloadVersion(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const rawVersion =
      payload.version !== undefined
        ? payload.version
        : payload.state_version !== undefined
        ? payload.state_version
        : payload.stateVersion !== undefined
        ? payload.stateVersion
        : null;
    const numeric = Number(rawVersion);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function extractPayloadMetadata(payload, fallbackVersion = null) {
    if (!payload || typeof payload !== "object") {
      return { serverTime: null, version: fallbackVersion, requestId: null };
    }
    const rawServerTime =
      payload.server_time !== undefined ? payload.server_time : payload.serverTime;
    let serverTime = null;
    if (typeof rawServerTime === "string") {
      const parsed = Date.parse(rawServerTime);
      if (!Number.isNaN(parsed)) {
        serverTime = parsed;
      }
    }
    const rawVersion =
      payload.version !== undefined
        ? payload.version
        : payload.state_version !== undefined
        ? payload.state_version
        : payload.stateVersion !== undefined
        ? payload.stateVersion
        : fallbackVersion;
    const numericVersion = Number(rawVersion);
    const version = Number.isFinite(numericVersion)
      ? numericVersion
      : fallbackVersion;
    const rawRequestId =
      payload.request_id !== undefined ? payload.request_id : payload.requestId;
    const requestId =
      typeof rawRequestId === "string" && rawRequestId.trim()
        ? rawRequestId.trim()
        : null;
    return { serverTime, version, requestId };
  }

  function compareMetadata(next, current) {
    if (!next) {
      return 0;
    }
    if (next.serverTime !== null && current.serverTime !== null) {
      if (next.serverTime > current.serverTime) {
        return 1;
      }
      if (next.serverTime < current.serverTime) {
        return -1;
      }
    } else if (next.serverTime !== null && current.serverTime === null) {
      return 1;
    }

    if (next.version !== null && current.version !== null) {
      if (next.version > current.version) {
        return 1;
      }
      if (next.version < current.version) {
        return -1;
      }
    } else if (next.version !== null && current.version === null) {
      return 1;
    }

    if (next.requestId && current.requestId) {
      if (next.requestId === current.requestId) {
        return 0;
      }
      return next.requestId > current.requestId ? 1 : -1;
    }
    if (next.requestId && !current.requestId) {
      return 1;
    }
    if (!next.requestId && current.requestId) {
      return -1;
    }
    return 0;
  }

  function evaluatePayloadFreshness(payload) {
    const payloadVersion = extractPayloadVersion(payload);
    const metadata = extractPayloadMetadata(payload, payloadVersion);
    const comparison = compareMetadata(metadata, latestSyncMeta);
    if (comparison < 0) {
      return { accept: false, version: payloadVersion };
    }
    if (comparison >= 0) {
      latestSyncMeta = {
        serverTime:
          metadata.serverTime !== null
            ? metadata.serverTime
            : latestSyncMeta.serverTime,
        version:
          metadata.version !== null
            ? metadata.version
            : latestSyncMeta.version,
        requestId: metadata.requestId || latestSyncMeta.requestId,
      };
    }
    const resolvedVersion =
      metadata.version !== null ? metadata.version : payloadVersion;
    if (resolvedVersion !== null) {
      latestPublicVersion = Math.max(latestPublicVersion, resolvedVersion);
    }
    return { accept: true, version: resolvedVersion };
  }

  function resolveBuildingElementKey(buildingId) {
    if (buildingElementMap.has(buildingId)) {
      return buildingId;
    }
    const numericId = Number(buildingId);
    if (!Number.isNaN(numericId) && buildingElementMap.has(numericId)) {
      return numericId;
    }
    const stringId = String(buildingId);
    if (buildingElementMap.has(stringId)) {
      return stringId;
    }
    return buildingId;
  }

  function findBuildingById(buildingId) {
    const targetString = String(buildingId);
    const numericId = Number(buildingId);
    return state.buildings.find((candidate) => {
      if (!candidate) return false;
      if (candidate.id === buildingId) {
        return true;
      }
      if (String(candidate.id) === targetString) {
        return true;
      }
      if (!Number.isNaN(numericId) && Number(candidate.id) === numericId) {
        return true;
      }
      return false;
    });
  }

  function setWorkerRequestPending(buildingId, pending) {
    const key = String(buildingId);
    if (pending) {
      pendingWorkerRequests.add(key);
    } else {
      pendingWorkerRequests.delete(key);
    }
    const resolvedKey = resolveBuildingElementKey(buildingId);
    const entry = buildingElementMap.get(resolvedKey);
    if (!entry) {
      return;
    }
    const building = findBuildingById(buildingId);
    if (building) {
      updateWorkerControls(entry, building);
    }
  }

  function setWorkerFeedback(entry, message, options = {}) {
    if (!entry || !entry.workerFeedback) {
      return;
    }
    const { variant = "info", state = "" } = options;
    const element = entry.workerFeedback;
    if (!message) {
      element.textContent = "";
      element.hidden = true;
      delete element.dataset.variant;
      delete element.dataset.state;
      return;
    }
    element.textContent = String(message);
    element.hidden = false;
    element.dataset.variant = variant;
    if (state) {
      element.dataset.state = state;
    } else {
      delete element.dataset.state;
    }
  }

  function findPrimaryBuildingForJob(jobId) {
    if (typeof jobId !== "string" || !jobId) {
      return null;
    }
    const normalized = jobId.toLowerCase();
    const mappedType = JOB_BUILDING_MAP[normalized];
    return (
      state.buildings.find((building) => {
        if (!building) return false;
        if (
          typeof building.job === "string" &&
          building.job.toLowerCase() === normalized
        ) {
          return true;
        }
        if (
          mappedType &&
          typeof building.type === "string" &&
          building.type.toLowerCase() === mappedType.toLowerCase()
        ) {
          return true;
        }
        return false;
      }) || null
    );
  }

  function getBuildingAssignedWorkers(building) {
    if (!building) {
      return 0;
    }
    const candidates = [
      Number(building.active),
      Number(building.active_workers),
      Number(building.workers),
    ];
    const value = candidates.find((candidate) => Number.isFinite(candidate));
    return value !== undefined ? Math.max(0, Math.floor(value)) : 0;
  }

  function formatAmount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "0";
    }
    return numberFormatter.format(numeric);
  }

  function toDisplayInt(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return Math.floor(numeric);
  }

  function formatInventoryValue(value) {
    return numberFormatter.format(toDisplayInt(value));
  }

  function formatPerSecondRate(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "0";
    }
    const precision = Math.abs(numeric) >= 1 ? 1 : 2;
    return Number(numeric.toFixed(precision)).toString();
  }

  function formatRateList(map, direction) {
    if (!map || typeof map !== "object") {
      return [];
    }
    return Object.entries(map)
      .map(([resource, amount]) => {
        const numeric = Number(amount);
        if (!Number.isFinite(numeric) || numeric === 0) {
          return null;
        }
        const label = formatResourceKey(resource);
        const sign = direction === "input" ? "−" : "+";
        return `${sign}${formatPerSecondRate(Math.abs(numeric))} ${label}/s`;
      })
      .filter(Boolean);
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
    const builtValue = building ? Number(building.built) : 0;
    if (!Number.isFinite(builtValue) || builtValue <= 0) {
      return {
        disabled: true,
        tooltip: "Build this structure before assigning workers.",
      };
    }
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

  function logWorkerAction({ action, url, status, requestId, syncingCleared }) {
    if (typeof console === "undefined") {
      return;
    }
    const logger =
      typeof console.info === "function" ? console.info : console.log;
    if (typeof logger !== "function") {
      return;
    }
    const parts = [
      "[Idle Village][workers]",
      `action=${action}`,
      `url=${url}`,
      `status=${status !== undefined && status !== null ? status : "n/a"}`,
      `request_id=${requestId || "n/a"}`,
      `syncing_cleared=${syncingCleared ? "true" : "false"}`,
    ];
    logger.call(console, parts.join(" "));
  }

  const defaultState = {
    resources: {
      happiness: 0,
      gold: 10,
      wood: 0,
      sticks: 0,
      planks: 0,
      stone: 0,
      tools: 0,
      wheat: 0,
      ore: 0,
      seeds: 0,
      water: 0,
      hops: 0,
    },
    population: {
      current: 4,
      capacity: 20,
      available: 4,
      total: 4,
    },
    buildings: [
      {
        id: "woodcutter_camp",
        type: "woodcutter_camp",
        job: "forester",
        job_name: "Forester",
        job_icon: "🌲",
        name: "Woodcutter Camp",
        category: "wood",
        category_label: "Wood",
        build_label: "Woodcutter Camp",
        role: "wood_producer",
        level: 2,
        built: 1,
        active: 0,
        capacityPerBuilding: 30,
        max_workers: 2,
        storage: { wood: 30 },
        cost: { wood: 10, gold: 5 },
        icon: "🪓",
        inputs: {},
        outputs: { wood: 0.01 },
        per_worker_output_rate: { wood: 0.01 },
        per_worker_input_rate: { sticks: 0.04, stone: 0.04 },
        produces_per_min: 0,
        produces_unit: "wood/min",
        effective_rate: 0,
        can_produce: false,
        reason: "no_workers",
        pending_eta: null,
        last_report: {
          status: "inactive",
          reason: "inactive",
          detail: null,
          consumed: {},
          produced: {},
        },
        cycle_time: 1,
      },
      {
        id: "stick_gathering_tent",
        type: "stick_gathering_tent",
        job: "stick_gatherer",
        job_name: "Stick Gatherer",
        job_icon: "🥢",
        name: "Stick-gathering Tent",
        category: "wood",
        category_label: "Wood",
        build_label: "Stick-gathering Tent",
        role: "stick_gatherer",
        level: 1,
        built: 0,
        active: 0,
        capacityPerBuilding: 30,
        max_workers: 3,
        storage: { sticks: 30 },
        cost: { gold: 1 },
        icon: "🥢",
        inputs: {},
        outputs: { sticks: 0.01 },
        per_worker_output_rate: { sticks: 0.01 },
        per_worker_input_rate: {},
        produces_per_min: 0,
        produces_unit: "sticks/min",
        effective_rate: 0,
        can_produce: false,
        reason: "no_workers",
        pending_eta: null,
        last_report: {
          status: "inactive",
          reason: "inactive",
          detail: null,
          consumed: {},
          produced: {},
        },
        cycle_time: 1,
      },
      {
        id: "stone_gathering_tent",
        type: "stone_gathering_tent",
        job: "stone_gatherer",
        job_name: "Stone Gatherer",
        job_icon: "🪨",
        name: "Stone-gathering Tent",
        category: "stone",
        category_label: "Stone",
        build_label: "Stone-gathering Tent",
        role: "stone_producer",
        level: 1,
        built: 0,
        active: 0,
        capacityPerBuilding: 30,
        max_workers: 3,
        storage: { stone: 30 },
        cost: { gold: 2 },
        icon: "🪨",
        inputs: {},
        outputs: { stone: 0.01 },
        per_worker_output_rate: { stone: 0.01 },
        per_worker_input_rate: {},
        produces_per_min: 0,
        produces_unit: "stone/min",
        effective_rate: 0,
        can_produce: false,
        reason: "no_workers",
        pending_eta: null,
        last_report: {
          status: "inactive",
          reason: "inactive",
          detail: null,
          consumed: {},
          produced: {},
        },
        cycle_time: 1,
      },
    ],
    jobs: [
      {
        id: "forester",
        name: "Forester",
        assigned: 0,
        max: 2,
        icon: "🌲",
        perWorkerOutputs: { wood: 0.01 },
        perWorkerInputs: { sticks: 0.04, stone: 0.04 },
      },
      {
        id: "stick_gatherer",
        name: "Stick Gatherer",
        assigned: 0,
        max: 3,
        icon: "🥢",
        perWorkerOutputs: { sticks: 0.01 },
        perWorkerInputs: {},
      },
      {
        id: "stone_gatherer",
        name: "Stone Gatherer",
        assigned: 0,
        max: 3,
        icon: "🪨",
        perWorkerOutputs: { stone: 0.01 },
        perWorkerInputs: {},
      },
    ],
    trade: [
      { id: "gold", label: "Gold", export: 0, import: 0, icon: "🪙" },
      { id: "wood", label: "Wood", export: 0, import: 0, icon: "🪵" },
    ],
    season: {
      season_name: "Spring",
      season_index: 0,
      progress: 0,
      color_hex: "#38BDF8",
    },
    ui: {
      buildings: {
        density: "compact",
        sort: "efficiency",
        viewMode: "classic",
        stackedFilters: {
          onlyActive: false,
          minLevel: 0,
          requireInputsOk: false,
        },
        filters: {
          category: "all",
          level: null,
          status: {
            buildable: false,
            built: false,
            workers: false,
            favorites: false,
          },
          showObsolete: false,
        },
      },
      favorites: [],
    },
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  const defaultUiState = clone(defaultState.ui);

  function loadState() {
    const source = persistedSnapshot || defaultState;
    return clone(source);
  }

  let state = normaliseState(loadState());
  let latestPublicVersion = Number.NEGATIVE_INFINITY;
  let latestSyncMeta = {
    serverTime: null,
    version: null,
    requestId: null,
  };

  logState();

  if (!state.season) {
    state.season = clone(defaultState.season);
  }

  function ensureUiState() {
    if (!state.ui) {
      state.ui = clone(defaultUiState);
      return state.ui;
    }
    state.ui = normaliseUiState(state.ui);
    return state.ui;
  }

  function getBuildingUiState() {
    const ui = ensureUiState();
    if (!ui.buildings) {
      ui.buildings = clone(defaultUiState.buildings);
    }
    if (!ui.buildings.stackedFilters) {
      ui.buildings.stackedFilters = clone(
        defaultUiState.buildings.stackedFilters
      );
    }
    return ui.buildings;
  }

  function getFavoritesSet() {
    const ui = ensureUiState();
    if (!Array.isArray(ui.favorites)) {
      ui.favorites = [];
    }
    return new Set(ui.favorites);
  }

  function isFavorite(buildingId) {
    const set = getFavoritesSet();
    return set.has(String(buildingId));
  }

  function setFavorite(buildingId, shouldFavorite) {
    const ui = ensureUiState();
    const key = String(buildingId);
    const current = new Set(ui.favorites || []);
    if (shouldFavorite) {
      current.add(key);
    } else {
      current.delete(key);
    }
    ui.favorites = Array.from(current);
  }

  function saveState() {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn("Idle Village: failed to save state", error);
      }
    }
  }

  const buildingGrid = document.getElementById("buildings-grid");
  const buildingFiltersRoot = document.getElementById("building-filters");
  const categoryChipsContainer = document.getElementById("building-category-chips");
  const levelChipsContainer = document.getElementById("building-level-chips");
  const statusChipsContainer = document.getElementById("building-status-chips");
  const densityToggle = document.getElementById("building-density-toggle");
  const sortSelect = document.getElementById("building-sort");
  const obsoleteToggle = document.getElementById("building-obsolete-toggle");
  const stackedRoot = document.getElementById("buildings-stacked");
  const stackedControls = document.getElementById("stacked-controls");
  const stackedFilterActive = document.getElementById("stacked-filter-active");
  const stackedFilterLevel = document.getElementById("stacked-filter-level");
  const stackedFilterInputs = document.getElementById("stacked-filter-inputs");
  const stackedHeaderControls = document.getElementById("stacked-header-controls");
  const stackedFlagCheckbox = document.getElementById("stacked-flag-checkbox");
  const stackedViewToggle = document.getElementById("stacked-view-toggle");

  const villagePanel = document.getElementById("view-village");
  const villageMapRoot = document.getElementById("village-map");
  const villageMapGrid = document.getElementById("village-grid");
  const villageOverlay = document.getElementById("village-overlay");
  const villageLogisticsLegend = document.getElementById("village-logistics-legend");
  const villageModeButtons = villagePanel
    ? Array.from(villagePanel.querySelectorAll("[data-village-mode]"))
    : [];
  const villageCompactToggle = document.getElementById("village-compact-toggle");
  const villageCompactLabel = villagePanel
    ? villagePanel.querySelector("[data-village-compact-label]")
    : null;
  const villageHudDisplays = villagePanel
    ? {
        villagers: villagePanel.querySelector('[data-village-hud="villagers"]'),
        free: villagePanel.querySelector('[data-village-hud="free"]'),
        buildings: villagePanel.querySelector('[data-village-hud="buildings"]'),
        gold: villagePanel.querySelector('[data-village-hud="gold"]'),
      }
    : {
        villagers: null,
        free: null,
        buildings: null,
        gold: null,
      };
  const villageDetail = document.getElementById("village-detail");
  const villageDetailPlaceholder = villageDetail
    ? villageDetail.querySelector("[data-village-detail-placeholder]")
    : null;
  const villageDetailContent = villageDetail
    ? villageDetail.querySelector("[data-village-detail-content]")
    : null;
  const villageDetailIcon = villageDetail
    ? villageDetail.querySelector("[data-village-detail-icon]")
    : null;
  const villageDetailName = villageDetail
    ? villageDetail.querySelector("[data-village-detail-name]")
    : null;
  const villageDetailSubtitle = villageDetail
    ? villageDetail.querySelector("[data-village-detail-subtitle]")
    : null;
  const villageProgressBar = villageDetail
    ? villageDetail.querySelector("[data-village-progress-bar]")
    : null;
  const villageDetailWorkers = villageDetail
    ? villageDetail.querySelector("[data-village-detail-workers]")
    : null;
  const villageDetailProduction = villageDetail
    ? villageDetail.querySelector("[data-village-detail-production]")
    : null;
  const villageDetailStorage = villageDetail
    ? villageDetail.querySelector("[data-village-detail-storage]")
    : null;
  const villageDetailInputs = villageDetail
    ? villageDetail.querySelector("[data-village-detail-inputs]")
    : null;
  const villageDetailOutputs = villageDetail
    ? villageDetail.querySelector("[data-village-detail-outputs]")
    : null;

  const VILLAGE_MODES = ["buildings", "chains", "logistics", "population"];
  const VILLAGE_SVG_NS = "http://www.w3.org/2000/svg";

  const villageState = {
    mode: "buildings",
    compact: false,
    order: [],
    selected: null,
    hovered: null,
    dragging: null,
  };

  let villageTileLookup = new Map();
  let cachedVillageConnections = [];
  let villageConnectionCounts = new Map();
  let villageConnectionAdjacency = new Map();
  let villageConnectionMaxRate = 1;
  let villageOverlayFrame = null;
  let villageDropTarget = null;

  const buildingElementMap = new Map();
  const pendingWorkerRequests = new Set();
  const stackedWorkerMemory = new Map();
  const JOB_BUILDING_MAP = {
    forester: "woodcutter_camp",
    stick_gatherer: "stick_gathering_tent",
    stone_gatherer: "stone_gathering_tent",
  };

  const JOB_ASSIGNMENT_PLACEHOLDER_MESSAGE =
    "Asigná trabajadores desde la tarjeta del edificio. Jobs es solo visual.";

  const jobsList = document.getElementById("jobs-list");
  const tradeList = document.getElementById("trade-list");
  const jobsCountLabel = document.getElementById("jobs-count");
  const seasonLabel = document.getElementById("season-label");
  const seasonFill = document.getElementById("season-fill");

  const villageDesignPanel = document.querySelector('[data-view-panel="village"]');
  const villageDesignElements = villageDesignPanel
    ? {
        grid: villageDesignPanel.querySelector("[data-village-grid]"),
        sidebar: villageDesignPanel.querySelector("[data-village-sidebar]"),
        sidebarPlaceholder: villageDesignPanel.querySelector(
          "[data-village-sidebar-empty]"
        ),
        sidebarContent: villageDesignPanel.querySelector(
          "[data-village-sidebar-content]"
        ),
        detailIcon: villageDesignPanel.querySelector("[data-village-detail-icon]"),
        detailName: villageDesignPanel.querySelector("[data-village-detail-name]"),
        detailMeta: villageDesignPanel.querySelector("[data-village-detail-meta]"),
        detailDescription: villageDesignPanel.querySelector(
          "[data-village-detail-description]"
        ),
        detailProduction: villageDesignPanel.querySelector(
          "[data-village-detail-production]"
        ),
        detailInputs: villageDesignPanel.querySelector("[data-village-detail-inputs]"),
        detailEfficiency: villageDesignPanel.querySelector(
          "[data-village-detail-efficiency]"
        ),
        detailTransport: villageDesignPanel.querySelector(
          "[data-village-detail-transport]"
        ),
        detailWorkers: villageDesignPanel.querySelector(
          "[data-village-detail-workers]"
        ),
        detailNotes: villageDesignPanel.querySelector("[data-village-detail-notes]"),
        actionUpgrade: villageDesignPanel.querySelector(
          '[data-village-action="upgrade"]'
        ),
        actionDemolish: villageDesignPanel.querySelector(
          '[data-village-action="demolish"]'
        ),
        status: villageDesignPanel.querySelector("[data-village-status]"),
        saveButton: villageDesignPanel.querySelector("[data-village-save]"),
        loadButton: villageDesignPanel.querySelector("[data-village-load]"),
        buildingList: villageDesignPanel.querySelector(
          "[data-village-building-list]"
        ),
        buildingEmpty: villageDesignPanel.querySelector(
          "[data-village-catalog-empty]"
        ),
        viewTabs: Array.from(
          villageDesignPanel.querySelectorAll("[data-village-view-tab]") || []
        ),
        viewPanels: new Map(
          Array.from(
            villageDesignPanel.querySelectorAll("[data-village-view-panel]") || []
          ).map((panel) => [panel.dataset.villageViewPanel, panel])
        ),
        blueprintBanner: villageDesignPanel.querySelector("[data-village-blueprint]"),
        blueprintLabel: villageDesignPanel.querySelector(
          "[data-village-blueprint-label]"
        ),
        blueprintIcon: villageDesignPanel.querySelector(
          "[data-village-blueprint-icon]"
        ),
        blueprintCancel: villageDesignPanel.querySelector(
          "[data-village-blueprint-clear]"
        ),
        supplyList: villageDesignPanel.querySelector("[data-supply-status-list]"),
        supplyTotalsProduction: villageDesignPanel.querySelector(
          "[data-supply-total-production]"
        ),
        supplyTotalsConsumption: villageDesignPanel.querySelector(
          "[data-supply-total-consumption]"
        ),
        resourceFlow: villageDesignPanel.querySelector("[data-resource-flow]"),
        resourceFlowEmpty: villageDesignPanel.querySelector(
          "[data-resource-flow-empty]"
        ),
        resourceValues: new Map(
          Array.from(
            villageDesignPanel.querySelectorAll("[data-village-resource]") || []
          ).map((element) => [element.dataset.villageResource, element])
        ),
      }
    : null;

  const VILLAGE_CATEGORY_LABELS = {
    production: "Production",
    housing: "Housing",
    storage: "Storage",
    transport: "Transport",
    support: "Support",
  };

  const VILLAGE_CATEGORY_ORDER = [
    "production",
    "housing",
    "storage",
    "transport",
    "support",
  ];

  const SUPPLY_STATUS_LABELS = {
    operational: "Operational",
    bottleneck: "Limited supply",
    inactive: "Idle",
  };

  const VILLAGE_TERRAIN_COLORS = {
    plain: "#3f5d3f",
    forest: "#1f4d2b",
    water: "#1d4e89",
    hill: "#6a5640",
  };

  function getVillageCategoryLabel(category) {
    return VILLAGE_CATEGORY_LABELS[category] || formatResourceKey(category);
  }

  const villageDesignState = {
    snapshot: null,
    selected: null,
    hover: null,
    catalog: new Map(),
    isLoading: false,
    activeView: "buildings",
    blueprint: null,
    blueprintDefinition: null,
    lastResources: {},
    supply: { buildings: [], totals: { production: {}, consumption: {} } },
    flow: { nodes: [], links: [] },
    lastBuilt: null,
  };

  function getVillageCellKey(x, y) {
    return `${x},${y}`;
  }

  function getVillageCell(snapshot, x, y) {
    if (!snapshot || !Array.isArray(snapshot.grid)) {
      return null;
    }
    const row = snapshot.grid[y];
    if (!Array.isArray(row)) {
      return null;
    }
    return row[x] || null;
  }

  function updateVillageStatus(message, type = "info") {
    if (!villageDesignElements || !villageDesignElements.status) {
      return;
    }
    const statusElement = villageDesignElements.status;
    statusElement.textContent = message || "";
    statusElement.dataset.status = type;
  }

  function clearVillageStatus() {
    updateVillageStatus("");
  }

  function setVillageLoading(loading) {
    villageDesignState.isLoading = Boolean(loading);
    if (villageDesignElements && villageDesignElements.grid) {
      villageDesignElements.grid.classList.toggle(
        "is-loading",
        villageDesignState.isLoading
      );
    }
  }

  function updateVillageResources(snapshot) {
    if (!villageDesignElements || !villageDesignElements.resourceValues) {
      return;
    }
    const resources = (snapshot && snapshot.resources) || {};
    const population = (snapshot && snapshot.population) || {};
    const { resourceValues } = villageDesignElements;
    const trackedResources = [
      "gold",
      "wood",
      "planks",
      "stone",
      "sticks",
      "tools",
    ];
    const nextResourceState = { ...villageDesignState.lastResources };
    trackedResources.forEach((key) => {
      const element = resourceValues.get(key);
      if (!element) {
        return;
      }
      const numeric = Number(resources[key]) || 0;
      const previous = Number(villageDesignState.lastResources[key]) || 0;
      element.textContent = formatAmount(numeric);
      if (numeric > previous + 1e-6) {
        element.classList.add("is-gaining");
        window.setTimeout(() => {
          element.classList.remove("is-gaining");
        }, 500);
      }
      nextResourceState[key] = numeric;
    });
    const villagerElement = resourceValues.get("villagers");
    if (villagerElement) {
      const current = Number(population.current) || 0;
      const capacity = Number(population.capacity) || 0;
      const previous = Number(villageDesignState.lastResources.villagers) || 0;
      villagerElement.textContent = `${formatAmount(current)}/${formatAmount(
        capacity
      )}`;
      if (current > previous + 1e-6) {
        villagerElement.classList.add("is-gaining");
        window.setTimeout(() => {
          villagerElement.classList.remove("is-gaining");
        }, 500);
      }
      nextResourceState.villagers = current;
    }
    villageDesignState.lastResources = nextResourceState;
  }

  function formatEfficiencyMultiplier(multiplier) {
    const numeric = Number(multiplier);
    if (!Number.isFinite(numeric)) {
      return "100%";
    }
    return `${Math.round(numeric * 100)}%`;
  }

  function formatEfficiencyBonus(multiplier, base = 1) {
    const numeric = Number(multiplier);
    const baseValue = Number(base);
    if (!Number.isFinite(numeric) || !Number.isFinite(baseValue) || baseValue === 0) {
      return "+0%";
    }
    const ratio = numeric / baseValue - 1;
    if (Math.abs(ratio) < 1e-3) {
      return "+0%";
    }
    const sign = ratio >= 0 ? "+" : "-";
    return `${sign}${Math.round(Math.abs(ratio) * 100)}%`;
  }

  function formatTransportBonus(bonus) {
    const numeric = Number(bonus);
    if (!Number.isFinite(numeric) || Math.abs(numeric) < 1e-3) {
      return "+0%";
    }
    const sign = numeric >= 0 ? "+" : "-";
    return `${sign}${Math.abs(Math.round(numeric * 100))}%`;
  }

  function formatVillageProduction(perMinute) {
    if (!perMinute || typeof perMinute !== "object") {
      return "—";
    }
    const entries = Object.entries(perMinute).filter(([, value]) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric !== 0;
    });
    if (!entries.length) {
      return "Passive effect";
    }
    return entries
      .map(([resource, value]) => {
        const numeric = Number(value);
        const sign = numeric >= 0 ? "+" : "-";
        return `${sign}${formatAmount(Math.abs(numeric))} ${formatResourceKey(
          resource
        )}/min`;
      })
      .join(" • ");
  }

  function formatResourceSummary(resourceMap, prefix) {
    if (!resourceMap || typeof resourceMap !== "object") {
      return "";
    }
    const entries = Object.entries(resourceMap)
      .map(([resource, value]) => {
        const numericValue =
          value && typeof value === "object"
            ? value.required ?? value.available ?? value.rate
            : value;
        const numeric = Number(numericValue);
        if (!Number.isFinite(numeric) || Math.abs(numeric) < 1e-6) {
          return null;
        }
        return `${formatAmount(Math.abs(numeric))} ${formatResourceKey(resource)}`;
      })
      .filter(Boolean);
    if (!entries.length) {
      return "";
    }
    return prefix ? `${prefix}: ${entries.join(" • ")}` : entries.join(" • ");
  }

  function formatVillageInputsDetail(inputs) {
    if (!inputs || typeof inputs !== "object") {
      return "None";
    }
    const entries = Object.entries(inputs)
      .map(([resource, detail]) => {
        if (detail && typeof detail === "object") {
          const required = Number(detail.required);
          const actual = Number(detail.actual_rate);
          const available = Number(detail.available);
          const distance = Number(detail.distance);
          const status = detail.status;
          const base = Number.isFinite(required) && required > 0
            ? required
            : Number.isFinite(actual) && actual > 0
            ? actual
            : Number.isFinite(available) && available > 0
            ? available
            : 0;
          if (base <= 0) {
            return null;
          }
          let text = `${formatAmount(base)} ${formatResourceKey(resource)}/min`;
          if (Number.isFinite(actual) && Math.abs(actual - base) > 1e-3) {
            text += ` (actual ${formatAmount(Math.max(actual, 0))})`;
          }
          if (
            Number.isFinite(available) &&
            available > 0 &&
            available < base - 1e-3
          ) {
            text += ` (avail ${formatAmount(available)})`;
          }
          if (status && status !== "ok") {
            text += ` – ${formatResourceKey(status)}`;
          }
          if (Number.isFinite(distance) && distance > 0) {
            text += ` @${Math.round(distance)} tiles`;
          }
          return text;
        }
        const numeric = Number(detail);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          return null;
        }
        return `${formatAmount(numeric)} ${formatResourceKey(resource)}/min`;
      })
      .filter(Boolean);
    if (!entries.length) {
      return "None";
    }
    return entries.join(" • ");
  }

  function formatVillageWorkers(building) {
    if (!building || typeof building !== "object") {
      return "0";
    }
    const requiredCandidates = [
      building.workers_required,
      building.workers,
      building.max_workers,
    ];
    const assignedCandidates = [
      building.assigned_workers,
      building.active_workers,
      building.workers,
    ];
    const required = requiredCandidates.find((value) =>
      Number.isFinite(Number(value))
    );
    const assigned = assignedCandidates.find((value) =>
      Number.isFinite(Number(value))
    );
    const requiredValue = Number(required) || 0;
    const assignedValue = Number(assigned) || 0;
    if (requiredValue > 0) {
      return `${formatAmount(Math.max(assignedValue, 0))}/${formatAmount(
        requiredValue
      )}`;
    }
    return formatAmount(Math.max(assignedValue, 0));
  }

    function buildVillageCellTitle(cell) {
      if (!cell) {
        return "";
      }
    const coordinates = `(${cell.x + 1}, ${cell.y + 1})`;
    if (cell.building) {
      const building = cell.building;
      const categoryLabel = getVillageCategoryLabel(building.category);
      const efficiencyText = formatEfficiencyMultiplier(building.efficiency);
      const efficiencyBonus = formatEfficiencyBonus(
        building.efficiency,
        building.base_efficiency || 1
      );
      const transportText = formatTransportBonus(cell.transport_bonus);
      const productionSummary = formatVillageProduction(
        building.production_per_minute
      );
      const lines = [
        `${building.name || "Structure"} — ${categoryLabel}`,
        `Level ${building.level || 1} ${coordinates}`,
      ];
      const statusLabel =
        SUPPLY_STATUS_LABELS[building.status] ||
        formatResourceKey(building.status || "operational");
      lines.push(`Status: ${statusLabel}`);
      if (productionSummary) {
        lines.push(`Production: ${productionSummary}`);
      }
      const inputsSummary = formatResourceSummary(building.inputs, "Inputs");
      if (inputsSummary) {
        lines.push(inputsSummary);
      }
      lines.push(
        efficiencyBonus === "+0%"
          ? `Efficiency: ${efficiencyText}`
          : `Efficiency: ${efficiencyText} (${efficiencyBonus})`
      );
      if (transportText && transportText !== "+0%") {
        lines.push(`Transport: ${transportText}`);
      }
      if (typeof building.workers_required === "number") {
        lines.push(`Workers: ${building.workers_required}`);
      }
      if (Array.isArray(cell.notes) && cell.notes.length) {
        lines.push(cell.notes.join(" • "));
      }
      return lines.join("\n");
    }
    const lines = [
      `${cell.terrain.label} ${coordinates}`,
      "Select a tile to build.",
    ];
    if (Array.isArray(cell.notes) && cell.notes.length) {
      lines.push(cell.notes.join(" • "));
    }
    return lines.join("\n");
  }

  function buildCatalogMap(snapshot) {
    const catalog = new Map();
    if (!snapshot || !Array.isArray(snapshot.catalog)) {
      return catalog;
    }
    snapshot.catalog.forEach((entry) => {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const category = String(entry.category || "other").toLowerCase();
      if (!catalog.has(category)) {
        catalog.set(category, []);
      }
      catalog.get(category).push(entry);
    });
    catalog.forEach((list) => {
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    });
    return catalog;
  }

  function findCatalogDefinition(buildingId) {
    if (!buildingId || !(villageDesignState.catalog instanceof Map)) {
      return null;
    }
    for (const definitions of villageDesignState.catalog.values()) {
      const match = definitions.find((entry) => entry.id === buildingId);
      if (match) {
        return match;
      }
    }
    return null;
  }

  function applyVillageSnapshot(snapshot, options = {}) {
    if (!snapshot) {
      return;
    }
    const { selectedKey, preserveSelection } = options;
    const previousSelection = preserveSelection ? villageDesignState.selected : null;
    villageDesignState.snapshot = snapshot;
    villageDesignState.catalog = buildCatalogMap(snapshot);
    villageDesignState.supply = snapshot.supply_overview || {
      buildings: [],
      totals: { production: {}, consumption: {} },
    };
    villageDesignState.flow = snapshot.resource_flow || { nodes: [], links: [] };
    if (selectedKey) {
      villageDesignState.selected = selectedKey;
    } else if (preserveSelection && previousSelection) {
      const [sx, sy] = previousSelection.split(",").map((value) => Number(value));
      const hasCell = Number.isFinite(sx) && Number.isFinite(sy)
        ? Boolean(getVillageCell(snapshot, sx, sy))
        : false;
      villageDesignState.selected = hasCell ? previousSelection : null;
    }
    if (
      villageDesignState.blueprint &&
      !findCatalogDefinition(villageDesignState.blueprint)
    ) {
      villageDesignState.blueprint = null;
      villageDesignState.blueprintDefinition = null;
    }
    updateVillageResources(snapshot);
    renderVillageCatalog();
    renderVillageGrid();
    renderSupplyOverview();
    renderResourceFlow();
    updateVillageSidebar();
    renderBlueprintState();
    switchVillageView(villageDesignState.activeView || "buildings");
  }

  function renderVillageGrid() {
    if (!villageDesignElements || !villageDesignElements.grid) {
      return;
    }
    const gridElement = villageDesignElements.grid;
    gridElement.innerHTML = "";
    const snapshot = villageDesignState.snapshot;
    if (!snapshot || !Array.isArray(snapshot.grid)) {
      return;
    }
    const fragment = document.createDocumentFragment();
    snapshot.grid.forEach((row) => {
      row.forEach((cell) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "village-grid__cell";
        button.dataset.x = String(cell.x);
        button.dataset.y = String(cell.y);
        const key = getVillageCellKey(cell.x, cell.y);
        button.dataset.cellKey = key;
        const hasBuilding = Boolean(cell.building);
        button.dataset.hasBuilding = hasBuilding ? "true" : "false";
        button.dataset.state = hasBuilding ? "occupied" : "empty";
        button.classList.toggle("is-empty", !hasBuilding);

        const terrainKey =
          (cell.state && cell.state.terrain_type) || cell.terrain.key;
        if (terrainKey) {
          button.dataset.terrain = terrainKey;
          const terrainColor = VILLAGE_TERRAIN_COLORS[terrainKey];
          if (terrainColor) {
            button.style.setProperty("--terrain-color", terrainColor);
          } else {
            button.style.removeProperty("--terrain-color");
          }
        }

        if (hasBuilding && cell.building.color) {
          button.style.setProperty("--tile-color", cell.building.color);
        } else {
          button.style.removeProperty("--tile-color");
        }

        const efficiencyBonus =
          cell.state && typeof cell.state.efficiency_bonus === "number"
            ? Number(cell.state.efficiency_bonus)
            : Number(cell.efficiency_bonus || 0);
        const transportBonus =
          cell.state && typeof cell.state.transport_bonus === "number"
            ? Number(cell.state.transport_bonus)
            : Number(cell.transport_bonus || 0);
        button.dataset.efficiencyBonus = efficiencyBonus.toFixed(3);
        button.dataset.transportBonus = transportBonus.toFixed(3);

        const statusKey = hasBuilding
          ? (cell.state && cell.state.status) || cell.building.status || ""
          : "";
        if (statusKey) {
          button.dataset.status = statusKey;
        } else {
          button.removeAttribute("data-status");
        }

        if (!hasBuilding && villageDesignState.blueprint) {
          button.classList.add("is-blueprint-target");
        }

        const terrainLabel = document.createElement("span");
        terrainLabel.className = "village-grid__terrain-label";
        terrainLabel.textContent = cell.terrain.label;
        button.appendChild(terrainLabel);

        if (hasBuilding) {
          const actions = document.createElement("div");
          actions.className = "village-grid__actions";
          const upgradeBtn = document.createElement("button");
          upgradeBtn.type = "button";
          upgradeBtn.className = "village-grid__action";
          upgradeBtn.dataset.villageAction = "upgrade";
          upgradeBtn.dataset.x = String(cell.x);
          upgradeBtn.dataset.y = String(cell.y);
          upgradeBtn.title = "Upgrade building";
          upgradeBtn.textContent = "+";
          const demolishBtn = document.createElement("button");
          demolishBtn.type = "button";
          demolishBtn.className = "village-grid__action";
          demolishBtn.dataset.villageAction = "demolish";
          demolishBtn.dataset.x = String(cell.x);
          demolishBtn.dataset.y = String(cell.y);
          demolishBtn.title = "Demolish building";
          demolishBtn.textContent = "×";
          actions.append(upgradeBtn, demolishBtn);
          button.appendChild(actions);
        }

        const content = document.createElement("div");
        content.className = "village-grid__content";

        const icon = document.createElement("span");
        icon.className = "village-grid__icon";
        icon.textContent = hasBuilding
          ? cell.building.icon || "🏗️"
          : cell.terrain.icon;
        content.appendChild(icon);

        const label = document.createElement("span");
        label.className = "village-grid__label";
        label.textContent = hasBuilding
          ? cell.building.name || "Structure"
          : cell.terrain.label;
        content.appendChild(label);

        const category = document.createElement("span");
        category.className = "village-grid__category";
        const categoryKey = hasBuilding
          ? String(cell.building.category || "").toLowerCase()
          : null;
        if (categoryKey) {
          button.dataset.category = categoryKey;
        } else {
          button.removeAttribute("data-category");
        }
        category.textContent = hasBuilding
          ? getVillageCategoryLabel(cell.building.category)
          : "Available";
        content.appendChild(category);

        button.appendChild(content);

        const footer = document.createElement("div");
        footer.className = "village-grid__footer";

        if (hasBuilding) {
          button.dataset.buildingId = cell.building.id || "";
          button.dataset.buildingType = cell.building.type || "";
          button.dataset.level = String(cell.building.level || 1);
          const level = document.createElement("span");
          level.className = "village-grid__level";
          level.textContent = `Lv ${cell.building.level || 1}`;
          footer.appendChild(level);

          const badges = document.createElement("div");
          badges.className = "village-grid__badges";

          const statusBadge = document.createElement("span");
          statusBadge.className = "village-grid__badge";
          statusBadge.dataset.status = statusKey || "operational";
          statusBadge.textContent =
            SUPPLY_STATUS_LABELS[statusKey] ||
            formatResourceKey(statusKey || "operational");
          badges.appendChild(statusBadge);

          const efficiencyBadge = document.createElement("span");
          efficiencyBadge.className =
            "village-grid__badge village-grid__badge--efficiency";
          const efficiencyText = formatEfficiencyMultiplier(
            cell.building.efficiency
          );
          const efficiencyBonusText = formatEfficiencyBonus(
            cell.building.efficiency,
            cell.building.base_efficiency || 1
          );
          efficiencyBadge.textContent =
            efficiencyBonusText === "+0%"
              ? efficiencyText
              : `${efficiencyText} ${efficiencyBonusText}`;
          badges.appendChild(efficiencyBadge);

          if (transportBonus) {
            const transportBadge = document.createElement("span");
            transportBadge.className =
              "village-grid__badge village-grid__badge--transport";
            transportBadge.textContent = formatTransportBonus(transportBonus);
            badges.appendChild(transportBadge);
          }

          footer.appendChild(badges);

          button.setAttribute(
            "aria-label",
            `${cell.building.name || "Building"} level ${
              cell.building.level || 1
            } (${getVillageCategoryLabel(cell.building.category)}) at (${cell.x + 1}, ${
              cell.y + 1
            })`
          );
        } else {
          const hint = document.createElement("span");
          hint.className = "village-grid__hint";
          hint.textContent = villageDesignState.blueprint
            ? "Click to place blueprint"
            : "Empty tile";
          footer.appendChild(hint);
          button.setAttribute(
            "aria-label",
            `${cell.terrain.label} tile at (${cell.x + 1}, ${cell.y + 1}) – empty`
          );
        }

        button.appendChild(footer);
        button.title = buildVillageCellTitle(cell);
        fragment.appendChild(button);
      });
    });
    gridElement.appendChild(fragment);
    highlightVillageSelection();
    if (villageDesignState.lastBuilt) {
      const recent = gridElement.querySelector(
        `[data-cell-key="${villageDesignState.lastBuilt}"]`
      );
      if (recent) {
        recent.classList.add("is-spawned");
        window.setTimeout(() => {
          recent.classList.remove("is-spawned");
        }, 600);
      }
      villageDesignState.lastBuilt = null;
    }
  }

  function switchVillageView(viewKey) {
    if (!villageDesignElements) {
      return;
    }
    const target = viewKey || "buildings";
    villageDesignState.activeView = target;
    if (Array.isArray(villageDesignElements.viewTabs)) {
      villageDesignElements.viewTabs.forEach((tab) => {
        if (!tab || !tab.dataset) {
          return;
        }
        const isActive = tab.dataset.villageViewTab === target;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", isActive ? "true" : "false");
      });
    }
    if (villageDesignElements.viewPanels instanceof Map) {
      villageDesignElements.viewPanels.forEach((panel, key) => {
        if (!panel) {
          return;
        }
        const isActive = key === target;
        panel.hidden = !isActive;
        panel.classList.toggle("is-active", isActive);
      });
    }
  }

  function renderBlueprintState() {
    if (!villageDesignElements) {
      return;
    }
    const banner = villageDesignElements.blueprintBanner;
    const blueprintId = villageDesignState.blueprint;
    const definition = blueprintId ? findCatalogDefinition(blueprintId) : null;
    villageDesignState.blueprintDefinition = definition || null;
    if (banner) {
      if (!definition) {
        banner.hidden = true;
      } else {
        banner.hidden = false;
        if (villageDesignElements.blueprintIcon) {
          villageDesignElements.blueprintIcon.textContent =
            definition.icon || "🏗️";
        }
        if (villageDesignElements.blueprintLabel) {
          villageDesignElements.blueprintLabel.textContent =
            `${definition.name || formatResourceKey(definition.id)} blueprint ready`;
        }
      }
    }
    if (villageDesignElements.buildingList) {
      villageDesignElements.buildingList
        .querySelectorAll(".village-card")
        .forEach((card) => {
          const isActive = card.dataset.buildingId === blueprintId;
          card.classList.toggle("is-active", isActive);
          const action = card.querySelector(".village-card__action");
          if (action) {
            action.textContent = isActive ? "Selected" : "Select blueprint";
            action.disabled = isActive;
          }
        });
    }
  }

  function selectBlueprint(buildingId) {
    const definition = findCatalogDefinition(buildingId);
    if (!definition) {
      clearBlueprint();
      return;
    }
    villageDesignState.blueprint = definition.id;
    villageDesignState.blueprintDefinition = definition;
    renderBlueprintState();
    switchVillageView("map");
  }

  function clearBlueprint() {
    villageDesignState.blueprint = null;
    villageDesignState.blueprintDefinition = null;
    renderBlueprintState();
  }

  function renderVillageCatalog() {
    if (!villageDesignElements || !villageDesignElements.buildingList) {
      return;
    }
    const list = villageDesignElements.buildingList;
    list.innerHTML = "";
    const catalog = villageDesignState.catalog;
    if (!(catalog instanceof Map) || catalog.size === 0) {
      if (villageDesignElements.buildingEmpty) {
        villageDesignElements.buildingEmpty.hidden = false;
      }
      renderBlueprintState();
      return;
    }
    if (villageDesignElements.buildingEmpty) {
      villageDesignElements.buildingEmpty.hidden = true;
    }
    const orderedCategories = [
      ...VILLAGE_CATEGORY_ORDER.filter((category) => catalog.has(category)),
      ...Array.from(catalog.keys()).filter(
        (category) => !VILLAGE_CATEGORY_ORDER.includes(category)
      ),
    ];
    orderedCategories.forEach((category) => {
      const definitions = catalog.get(category);
      if (!definitions || !definitions.length) {
        return;
      }
      const section = document.createElement("section");
      section.className = "village-catalog__group";
      const heading = document.createElement("h3");
      heading.className = "village-catalog__heading";
      heading.textContent = getVillageCategoryLabel(category);
      section.appendChild(heading);
      const cards = document.createElement("div");
      cards.className = "village-catalog__list";
      definitions.forEach((definition) => {
        const card = document.createElement("article");
        card.className = "village-card";
        card.dataset.buildingId = definition.id;
        const header = document.createElement("header");
        header.className = "village-card__header";
        const icon = document.createElement("span");
        icon.className = "village-card__icon";
        icon.textContent = definition.icon || "🏗️";
        const titleWrapper = document.createElement("div");
        const title = document.createElement("h4");
        title.className = "village-card__title";
        title.textContent = definition.name || formatResourceKey(definition.id);
        const tag = document.createElement("span");
        tag.className = "village-card__tag";
        tag.textContent = `Tier ${definition.tier ?? 0}`;
        titleWrapper.append(title, tag);
        header.append(icon, titleWrapper);
        card.appendChild(header);
        if (definition.description) {
          const body = document.createElement("p");
          body.className = "village-card__body";
          body.textContent = definition.description;
          card.appendChild(body);
        }
        const io = document.createElement("div");
        io.className = "village-card__io";
        const inputsText = formatResourceSummary(definition.inputs, "Uses");
        if (inputsText) {
          const span = document.createElement("span");
          span.textContent = inputsText;
          io.appendChild(span);
        }
        const outputsText = formatResourceSummary(definition.production, "Makes");
        if (outputsText) {
          const span = document.createElement("span");
          span.textContent = outputsText;
          io.appendChild(span);
        }
        if (io.childElementCount) {
          card.appendChild(io);
        }
        const footer = document.createElement("div");
        footer.className = "village-card__footer";
        const action = document.createElement("button");
        action.type = "button";
        action.className = "village-card__action";
        action.dataset.blueprintId = definition.id;
        action.textContent = "Select blueprint";
        footer.appendChild(action);
        card.appendChild(footer);
        cards.appendChild(card);
      });
      section.appendChild(cards);
      list.appendChild(section);
    });
    renderBlueprintState();
  }

  function renderSupplyOverview() {
    if (!villageDesignElements) {
      return;
    }
    const buildings = Array.isArray(villageDesignState.supply?.buildings)
      ? villageDesignState.supply.buildings
      : [];
    if (villageDesignElements.supplyList) {
      const list = villageDesignElements.supplyList;
      list.innerHTML = "";
      buildings.forEach((entry) => {
        const item = document.createElement("li");
        item.className = "supply-status-list__item";
        const statusKey = entry.status || "operational";
        item.dataset.status = statusKey;
        const title = document.createElement("strong");
        title.textContent = entry.name || formatResourceKey(entry.id || "building");
        item.appendChild(title);
        const details = document.createElement("span");
        const statusLabel =
          SUPPLY_STATUS_LABELS[statusKey] || formatResourceKey(statusKey);
        const efficiency = Number(entry.efficiency) || 0;
        details.textContent = `${statusLabel} • Eff ${Math.round(
          efficiency * 100
        )}%`;
        item.appendChild(details);
        const outputsSummary = formatResourceSummary(entry.outputs, "Outputs");
        if (outputsSummary) {
          const outputsLine = document.createElement("span");
          outputsLine.textContent = outputsSummary;
          item.appendChild(outputsLine);
        }
        const inputsSummary = formatResourceSummary(entry.inputs, "Inputs");
        if (inputsSummary) {
          const inputsLine = document.createElement("span");
          inputsLine.textContent = inputsSummary;
          item.appendChild(inputsLine);
        }
        list.appendChild(item);
      });
    }
    const totals = villageDesignState.supply?.totals || {};
    if (villageDesignElements.supplyTotalsProduction) {
      villageDesignElements.supplyTotalsProduction.innerHTML = "";
      const productionEntries = Object.entries(totals.production || {});
      productionEntries.forEach(([resource, value]) => {
        const item = document.createElement("li");
        item.textContent = `${formatAmount(value)} ${formatResourceKey(
          resource
        )}/min`;
        villageDesignElements.supplyTotalsProduction.appendChild(item);
      });
      if (!productionEntries.length) {
        const item = document.createElement("li");
        item.textContent = "—";
        villageDesignElements.supplyTotalsProduction.appendChild(item);
      }
    }
    if (villageDesignElements.supplyTotalsConsumption) {
      villageDesignElements.supplyTotalsConsumption.innerHTML = "";
      const consumptionEntries = Object.entries(totals.consumption || {});
      consumptionEntries.forEach(([resource, value]) => {
        const item = document.createElement("li");
        item.textContent = `${formatAmount(value)} ${formatResourceKey(
          resource
        )}/min`;
        villageDesignElements.supplyTotalsConsumption.appendChild(item);
      });
      if (!consumptionEntries.length) {
        const item = document.createElement("li");
        item.textContent = "—";
        villageDesignElements.supplyTotalsConsumption.appendChild(item);
      }
    }
  }

  function renderResourceFlow() {
    if (!villageDesignElements || !villageDesignElements.resourceFlow) {
      return;
    }
    const container = villageDesignElements.resourceFlow;
    container.innerHTML = "";
    const flow = villageDesignState.flow || {};
    const nodes = new Map(
      Array.isArray(flow.nodes)
        ? flow.nodes.map((node) => [node.id, node])
        : []
    );
    const links = Array.isArray(flow.links) ? flow.links : [];
    if (!links.length) {
      if (villageDesignElements.resourceFlowEmpty) {
        villageDesignElements.resourceFlowEmpty.hidden = false;
      }
      return;
    }
    if (villageDesignElements.resourceFlowEmpty) {
      villageDesignElements.resourceFlowEmpty.hidden = true;
    }
    links.forEach((link) => {
      const fromNode = nodes.get(link.from);
      const toNode = nodes.get(link.to);
      if (!fromNode || !toNode) {
        return;
      }
      const row = document.createElement("div");
      row.className = "resource-flow__link";
      const from = document.createElement("strong");
      from.textContent = `${fromNode.icon || "🏗️"} ${
        fromNode.name || formatResourceKey(fromNode.type || "building")
      }`;
      const arrow = document.createElement("span");
      arrow.className = "resource-flow__arrow";
      arrow.textContent = "→";
      const to = document.createElement("strong");
      to.textContent = `${toNode.icon || "🏗️"} ${
        toNode.name || formatResourceKey(toNode.type || "building")
      }`;
      const resource = document.createElement("span");
      resource.textContent = `${formatAmount(link.rate || 0)} ${formatResourceKey(
        link.resource || "resource"
      )}/min`;
      row.append(from, arrow, to, resource);
      if (typeof link.distance === "number") {
        const meta = document.createElement("span");
        meta.className = "resource-flow__meta";
        meta.textContent = `distance ${link.distance}`;
        row.appendChild(meta);
      }
      container.appendChild(row);
    });
  }

  function highlightVillageSelection() {
    if (!villageDesignElements || !villageDesignElements.grid) {
      return;
    }
    const key = villageDesignState.selected;
    villageDesignElements.grid
      .querySelectorAll(".village-grid__cell")
      .forEach((cell) => {
        const cellKey = getVillageCellKey(
          Number(cell.dataset.x),
          Number(cell.dataset.y)
        );
        cell.classList.toggle("is-selected", key === cellKey);
      });
  }

    function updateVillageSidebar(targetCell) {
      if (!villageDesignElements) {
        return;
      }
      const {
        sidebar,
        sidebarPlaceholder,
        sidebarContent,
        detailIcon,
        detailName,
        detailMeta,
        detailDescription,
        detailProduction,
        detailInputs,
        detailEfficiency,
        detailTransport,
        detailWorkers,
        detailNotes,
        actionUpgrade,
        actionDemolish,
      } = villageDesignElements;
      if (!sidebar) {
        return;
      }
      const snapshot = villageDesignState.snapshot;
      let cell = targetCell;
      if (!cell && villageDesignState.selected) {
        const [sx, sy] = villageDesignState.selected
          .split(",")
          .map((value) => Number(value));
        if (Number.isFinite(sx) && Number.isFinite(sy)) {
          cell = getVillageCell(snapshot, sx, sy);
        }
      }

      if (!cell) {
        if (sidebarPlaceholder) {
          sidebarPlaceholder.hidden = false;
        }
        if (sidebarContent) {
          sidebarContent.hidden = true;
        }
        if (actionUpgrade) {
          actionUpgrade.hidden = true;
        }
        if (actionDemolish) {
          actionDemolish.hidden = true;
        }
        return;
      }

      if (sidebarPlaceholder) {
        sidebarPlaceholder.hidden = true;
      }
      if (sidebarContent) {
        sidebarContent.hidden = false;
      }

      if (cell.building) {
        const building = cell.building;
        const categoryLabel = getVillageCategoryLabel(building.category);
        const statusLabel =
          SUPPLY_STATUS_LABELS[building.status] ||
          formatResourceKey(building.status || "operational");
        if (detailIcon) {
          detailIcon.textContent = building.icon || "🏡";
        }
        if (detailName) {
          detailName.textContent = building.name || "Structure";
        }
        if (detailMeta) {
          detailMeta.textContent = `${categoryLabel} • Level ${
            building.level || 1
          } • ${statusLabel} • (${cell.x + 1}, ${cell.y + 1})`;
        }
        if (detailDescription) {
          detailDescription.textContent = building.description || "";
        }
        if (detailProduction) {
          detailProduction.textContent =
            formatVillageProduction(building.production_per_minute) ||
            "Passive effect";
        }
        if (detailInputs) {
          detailInputs.textContent = formatVillageInputsDetail(building.inputs);
        }
        if (detailEfficiency) {
          const efficiencyText = formatEfficiencyMultiplier(building.efficiency);
          const efficiencyBonus = formatEfficiencyBonus(
            building.efficiency,
            building.base_efficiency || 1
          );
          detailEfficiency.textContent =
            efficiencyBonus === "+0%"
              ? efficiencyText
              : `${efficiencyText} (${efficiencyBonus})`;
        }
        if (detailTransport) {
          detailTransport.textContent = formatTransportBonus(
            cell.transport_bonus
          );
        }
        if (detailWorkers) {
          detailWorkers.textContent = formatVillageWorkers(building);
        }
        if (detailNotes) {
          detailNotes.innerHTML = "";
          const notes = [];
          if (Array.isArray(cell.notes)) {
            notes.push(...cell.notes);
          }
          if (Array.isArray(building.efficiency_notes)) {
            building.efficiency_notes.forEach((note) => {
              if (!notes.includes(note)) {
                notes.push(note);
              }
            });
          }
          if (!notes.length) {
            notes.push("No modifiers applied.");
          }
          notes.forEach((entry) => {
            const item = document.createElement("li");
            item.textContent = entry;
            detailNotes.appendChild(item);
          });
        }
        if (actionUpgrade) {
          actionUpgrade.hidden = false;
          actionUpgrade.dataset.x = String(cell.x);
          actionUpgrade.dataset.y = String(cell.y);
          actionUpgrade.disabled = Boolean(
            Number(building.level || 1) >= 5 || villageDesignState.isLoading
          );
          actionUpgrade.title = actionUpgrade.disabled
            ? "Maximum level reached"
            : "Upgrade building";
        }
        if (actionDemolish) {
          actionDemolish.hidden = false;
          actionDemolish.dataset.x = String(cell.x);
          actionDemolish.dataset.y = String(cell.y);
          actionDemolish.disabled = Boolean(villageDesignState.isLoading);
        }
      } else {
        if (detailIcon) {
          detailIcon.textContent = cell.terrain.icon || "⬜";
        }
        if (detailName) {
          detailName.textContent = `${cell.terrain.label} tile`;
        }
        if (detailMeta) {
          detailMeta.textContent = `(${cell.x + 1}, ${cell.y + 1})`;
        }
        if (detailDescription) {
          detailDescription.textContent = cell.terrain.description || "";
        }
        if (detailProduction) {
          detailProduction.textContent = "Empty tile";
        }
        if (detailInputs) {
          detailInputs.textContent = "None";
        }
        if (detailEfficiency) {
          detailEfficiency.textContent = formatEfficiencyMultiplier(cell.efficiency);
        }
        if (detailTransport) {
          detailTransport.textContent = formatTransportBonus(cell.transport_bonus);
        }
        if (detailWorkers) {
          detailWorkers.textContent = "—";
        }
        if (detailNotes) {
          detailNotes.innerHTML = "";
          const notes = Array.isArray(cell.notes) && cell.notes.length
            ? cell.notes
            : ["Ready for construction"];
          notes.forEach((entry) => {
            const item = document.createElement("li");
            item.textContent = entry;
            detailNotes.appendChild(item);
          });
        }
        if (actionUpgrade) {
          actionUpgrade.hidden = true;
        }
        if (actionDemolish) {
          actionDemolish.hidden = true;
        }
      }
    }

    function handleVillageGridClick(event) {
      if (!villageDesignElements || villageDesignState.isLoading) {
        return;
      }
      const actionButton = event.target.closest("[data-village-action]");
      if (actionButton) {
        event.preventDefault();
        const action = actionButton.dataset.villageAction;
        const x = Number(actionButton.dataset.x);
        const y = Number(actionButton.dataset.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return;
        }
        if (action === "upgrade") {
          upgradeVillageStructure(x, y);
        } else if (action === "demolish") {
          demolishVillageStructure(x, y);
        }
        return;
      }
      const cellElement = event.target.closest(".village-grid__cell");
      if (!cellElement || event.button === 2) {
        return;
      }
      const x = Number(cellElement.dataset.x);
      const y = Number(cellElement.dataset.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
      const cell = getVillageCell(villageDesignState.snapshot, x, y);
      if (!cell) {
        return;
      }
      const key = getVillageCellKey(x, y);
      villageDesignState.selected = key;
      highlightVillageSelection();
      updateVillageSidebar(cell);
      if (!cell.building && villageDesignState.blueprint) {
        buildVillageStructure(x, y, villageDesignState.blueprint);
      }
    }

  function handleVillageGridHover(event) {
    const cellElement = event.target.closest(".village-grid__cell");
    if (!cellElement) {
      return;
    }
    const x = Number(cellElement.dataset.x);
    const y = Number(cellElement.dataset.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    const key = getVillageCellKey(x, y);
    if (villageDesignState.hover === key) {
      return;
    }
    villageDesignState.hover = key;
    const cell = getVillageCell(villageDesignState.snapshot, x, y);
    if (cell) {
      updateVillageSidebar(cell);
    }
  }

  function handleVillageGridLeave(event) {
    if (
      event &&
      event.relatedTarget &&
      event.currentTarget &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    villageDesignState.hover = null;
    updateVillageSidebar();
  }

    async function buildVillageStructure(x, y, buildingId) {
      if (!buildingId || !Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      try {
        setVillageLoading(true);
        clearVillageStatus();
        const response = await fetch("/api/village/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x, y, building: buildingId }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
          const message = data.error_message || data.error || "Failed to build";
          throw new Error(message);
        }
        const key = getVillageCellKey(x, y);
        villageDesignState.lastBuilt = key;
        applyVillageSnapshot(data.village, { selectedKey: key });
        updateVillageStatus(
          `Constructed ${getVillageCell(data.village, x, y)?.building?.name || "building"}.`,
          "success"
        );
        highlightVillageSelection();
        updateVillageSidebar();
      } catch (error) {
        updateVillageStatus(error.message || "Failed to construct building", "error");
        console.error("[Idle Village] build error", error);
      } finally {
        setVillageLoading(false);
      }
    }

    async function upgradeVillageStructure(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      try {
        setVillageLoading(true);
        clearVillageStatus();
        const response = await fetch("/api/village/upgrade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x, y }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
          const message = data.error_message || data.error || "Upgrade failed";
          throw new Error(message);
        }
        const key = getVillageCellKey(x, y);
        applyVillageSnapshot(data.village, { selectedKey: key });
        updateVillageStatus("Building upgraded", "success");
        highlightVillageSelection();
        updateVillageSidebar();
      } catch (error) {
        updateVillageStatus(error.message || "Failed to upgrade", "error");
        console.error("[Idle Village] upgrade error", error);
      } finally {
        setVillageLoading(false);
      }
    }

    async function demolishVillageStructure(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      try {
        setVillageLoading(true);
        clearVillageStatus();
        const response = await fetch("/api/village/demolish", {
          method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        const message = data.error_message || data.error || "Demolition failed";
        throw new Error(message);
        }
        const key = getVillageCellKey(x, y);
        applyVillageSnapshot(data.village, { selectedKey: key });
        updateVillageStatus("Building demolished", "success");
        highlightVillageSelection();
        updateVillageSidebar();
      } catch (error) {
        updateVillageStatus(error.message || "Failed to demolish", "error");
        console.error("[Idle Village] demolish error", error);
      } finally {
        setVillageLoading(false);
      }
    }

    async function handleVillageDemolish(event) {
      const button = event?.currentTarget;
      if (!button || villageDesignState.isLoading) {
        return;
      }
      const x = Number(button.dataset.x);
      const y = Number(button.dataset.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      event.preventDefault();
      await demolishVillageStructure(x, y);
    }

    async function handleVillageUpgrade(event) {
      const button = event?.currentTarget;
      if (!button || villageDesignState.isLoading) {
        return;
      }
      const x = Number(button.dataset.x);
      const y = Number(button.dataset.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      event.preventDefault();
      await upgradeVillageStructure(x, y);
    }

    function handleVillageCatalogClick(event) {
      if (villageDesignState.isLoading) {
        return;
      }
      const action = event.target.closest("[data-blueprint-id]");
      if (!action) {
        return;
      }
      event.preventDefault();
      const blueprintId = action.dataset.blueprintId;
      if (blueprintId) {
        selectBlueprint(blueprintId);
      }
    }

    function handleBlueprintCancel(event) {
      if (event) {
        event.preventDefault();
      }
      clearBlueprint();
    }

    function handleVillageViewTabClick(event) {
      const tab = event?.currentTarget;
      if (!tab) {
        return;
      }
      const view = tab.dataset.villageViewTab;
      if (!view) {
        return;
      }
      event.preventDefault();
      switchVillageView(view);
    }

  async function handleVillageSave() {
    if (!villageDesignElements) {
      return;
    }
    try {
      setVillageLoading(true);
      clearVillageStatus();
      const response = await fetch("/api/village/save", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        const message = data.error_message || data.error || "Failed to save design";
        throw new Error(message);
      }
      updateVillageStatus("Village design saved", "success");
    } catch (error) {
      updateVillageStatus(error.message || "Failed to save design", "error");
      console.error("[Idle Village] save design error", error);
    } finally {
      setVillageLoading(false);
    }
  }

  async function handleVillageLoad() {
    try {
      setVillageLoading(true);
      clearVillageStatus();
      const response = await fetch("/api/village/load", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        const message = data.error_message || data.error || "Failed to load design";
        throw new Error(message);
      }
      applyVillageSnapshot(data.village, { preserveSelection: true });
      updateVillageStatus(data.message || "Village design loaded", "success");
      highlightVillageSelection();
      updateVillageSidebar();
    } catch (error) {
      updateVillageStatus(error.message || "Failed to load design", "error");
      console.error("[Idle Village] load design error", error);
    } finally {
      setVillageLoading(false);
    }
  }

  async function refreshVillageDesign() {
    if (!villageDesignElements) {
      return;
    }
    try {
      setVillageLoading(true);
      clearVillageStatus();
      const response = await fetch("/api/village");
      const data = await response.json();
      if (!response.ok || !data.ok) {
        const message = data.error_message || data.error || "Failed to load village";
        throw new Error(message);
      }
      applyVillageSnapshot(data.village, { preserveSelection: true });
      highlightVillageSelection();
      updateVillageSidebar();
    } catch (error) {
      updateVillageStatus(error.message || "Failed to load village", "error");
      console.error("[Idle Village] village load error", error);
    } finally {
      setVillageLoading(false);
    }
  }

  function initialiseVillageDesign() {
    if (!villageDesignElements) {
      return;
    }
    refreshVillageDesign();
  }

  function isStackedFeatureEnabled(){return Boolean(featureFlags.UI_STACKED_VIEW);}  function getStackedFilters(){const ui=getBuildingUiState();if(!ui.stackedFilters){ui.stackedFilters=clone(defaultUiState.buildings.stackedFilters);}return ui.stackedFilters;}  function updateStackedUi(show,mode,filters){if(buildingFiltersRoot)buildingFiltersRoot.hidden=show;if(buildingGrid)buildingGrid.hidden=show;if(stackedRoot)stackedRoot.hidden=!show;if(stackedControls){stackedControls.hidden=!show;if(show){if(stackedFilterActive)stackedFilterActive.checked=!!filters.onlyActive;if(stackedFilterLevel)stackedFilterLevel.value=String(filters.minLevel||0);if(stackedFilterInputs)stackedFilterInputs.checked=!!filters.requireInputsOk;}}const available=isStackedFeatureEnabled();if(stackedHeaderControls)stackedHeaderControls.hidden=!available;if(stackedFlagCheckbox)stackedFlagCheckbox.checked=available;if(stackedViewToggle){stackedViewToggle.hidden=!available;stackedViewToggle.querySelectorAll("[data-stacked-view]").forEach((button)=>{const active=(button.dataset.stackedView==="stacked"?"stacked":"classic")===mode;button.classList.toggle("is-active",active);button.setAttribute("aria-pressed",active?"true":"false");});}}  function formatStackedRate(value){const numeric=Number(value);if(!Number.isFinite(numeric)||Math.abs(numeric)<1e-6)return"0";if(Math.abs(numeric)>=10)return numberFormatter.format(Math.round(numeric));if(Math.abs(numeric)>=1)return numberFormatter.format(Math.round(numeric*10)/10);return numberFormatter.format(Math.round(numeric*100)/100);}  function computeStackedSummaries(buildings){const map=new Map();buildings.forEach((building)=>{if(!building)return;const key=String(building.type||building.id||"").toLowerCase();(map.get(key)||map.set(key,[]).get(key)).push(building);});const summaries=[];map.forEach((list,key)=>{const first=list[0]||{};const levelCounts={};const summary={id:String(first.id||key||""),label:(typeof first.build_label==="string"&&first.build_label)||(typeof first.name==="string"&&first.name)||formatResourceKey(key||"building"),icon:first.icon||"🏗️",built:0,workers:0,maxLevel:0,status:"good",active:false,production:{},missing:false};for(const building of list){const built=Math.max(0,Math.floor(Number(building.built)||0));summary.built+=built;const level=Math.max(1,Math.floor(Number(building.level)||1));if(built){levelCounts[level]=(levelCounts[level]||0)+built;if(level>summary.maxLevel)summary.maxLevel=level;}const workers=getBuildingAssignedWorkers(building);summary.workers+=workers;if(workers>0&&building.enabled!==false)summary.active=true;const totalMultiplier=(()=>{const value=building&&building.modifiers_applied&&Number(building.modifiers_applied.total_multiplier);return Number.isFinite(value)&&value>0?value:1;})();const maxWorkers=[building&&building.max_workers,building&&building.maxWorkers,building&&building.capacityPerBuilding].reduce((acc,value)=>{const numeric=Number(value);return Number.isFinite(numeric)&&numeric>acc?numeric:acc;},0);const workerRatio=maxWorkers>0?Math.min(1,workers/maxWorkers):workers>0?1:0;const effective=Math.max(0,Number(building.effective_rate)||0);const inputFactor=workerRatio>0&&totalMultiplier>0?Math.min(1,Math.max(0,effective/(workerRatio*totalMultiplier))):Math.min(1,Math.max(0,effective));let hasOutputs=false;Object.entries(computePerWorkerOutputs(building)).forEach(([resource,rate])=>{const numeric=Number(rate);if(!Number.isFinite(numeric)||numeric===0)return;const total=numeric*workers*totalMultiplier*inputFactor*60;if(!Number.isFinite(total)||total===0)return;summary.production[resource]=(summary.production[resource]||0)+total;hasOutputs=true;});if(!hasOutputs){const outputs=building.outputs||{};const cycle=Number(building.cycle_time)||Number(building.cycle_time_sec);if(cycle>0){Object.entries(outputs).forEach(([resource,amount])=>{const numeric=Number(amount);if(!Number.isFinite(numeric)||numeric===0)return;const total=numeric*effective*(60/cycle);summary.production[resource]=(summary.production[resource]||0)+total;});hasOutputs=Object.keys(outputs).length>0;}}if(!hasOutputs)summary.missing=true;const report=building.last_report||{};const reason=(typeof report.reason==="string"&&report.reason)||(typeof building.reason==="string"&&building.reason)||"";const bad=reason==="missing_input"||reason==="missing_maintenance";const warn=!bad&&(report.status==="warning"||report.status==="stalled"||(reason&&! ["inactive","no_workers","disabled"].includes(reason))||building.enabled===false||(building.can_produce===false&&workers>0));if(bad)summary.status="bad";else if(warn&&summary.status!=="bad")summary.status="warn";}summary.levels=Object.entries(levelCounts).map(([level,count])=>[Number(level),count]).sort((a,b)=>a[0]-b[0]);if(summary.missing)warnStack("missing-rate",summary.id);summaries.push(summary);});return summaries;}  function renderStackedBuildingsList(buildings,filters){if(!stackedRoot)return;const statusClass={good:"stacked-card__status stacked-card__status--good",warn:"stacked-card__status stacked-card__status--warn",bad:"stacked-card__status stacked-card__status--bad"};const statusLabel={good:"Inputs OK",warn:"Atención",bad:"Inputs críticos"};const formatProduction=(summary)=>{const entries=Object.entries(summary.production);if(!entries.length)return summary.missing?"Producción total: sin datos":"Producción total: —";entries.sort((a,b)=>Number(b[1])-Number(a[1]));return`Producción total: ${entries.slice(0,3).map(([resource,amount])=>`${formatResourceKey(resource)} ${formatStackedRate(amount)}/min`).join(" · ")}`;};const summaries=computeStackedSummaries(buildings).filter((summary)=>{if(filters.onlyActive&&!summary.active)return false;if(filters.minLevel>0&&summary.maxLevel<filters.minLevel)return false;if(filters.requireInputsOk&&summary.status!=="good")return false;return true;}).sort((a,b)=>a.label.localeCompare(b.label));const html=summaries.map((summary)=>{const levelText=summary.levels.length?summary.levels.map(([level,count])=>`<span>L${level}×${count}</span>`).join(""):"<span>Sin instancias</span>";const buildingId=escapeHtml(summary.id);const toggleLabel=summary.workers>0?"Apagar":"Activar";return`<article class="stacked-card" role="listitem" data-building-id="${buildingId}"><header class="stacked-card__header"><div class="stacked-card__title"><span class="stacked-card__icon">${escapeHtml(summary.icon)}</span><span>${escapeHtml(summary.label)}</span></div><div class="${statusClass[summary.status]}"><span class="stacked-card__status-indicator"></span><span>${statusLabel[summary.status]}</span></div></header><div class="stacked-card__meta"><span>Instancias: ${numberFormatter.format(summary.built)}</span><span>Trabajadores: ${numberFormatter.format(summary.workers)}</span></div><div class="stacked-card__levels">${levelText}</div><div class="stacked-card__production">${escapeHtml(formatProduction(summary))}</div><div class="stacked-card__actions"><button type="button" class="stacked-card__button" data-action="build" data-building-id="${buildingId}">Construir +1</button><button type="button" class="stacked-card__button" data-action="stack-upgrade" data-building-id="${buildingId}">Mejorar</button><button type="button" class="stacked-card__button" data-action="stack-toggle-power" data-building-id="${buildingId}">${toggleLabel}</button><button type="button" class="stacked-card__button" data-action="demolish" data-building-id="${buildingId}">Demoler</button></div></article>`;}).join("");stackedRoot.innerHTML=html||'<p class="placeholder-text">Sin edificios para mostrar.</p>'; }  async function toggleStackedPower(buildingId){const building=findBuildingById(buildingId);if(!building){warnStack("missing-building",buildingId);return;}const workers=getBuildingAssignedWorkers(building);if(workers>0){stackedWorkerMemory.set(String(buildingId),workers);await assignBuildingWorkers(buildingId,0);}else{const target=stackedWorkerMemory.get(String(buildingId))||1;await assignBuildingWorkers(buildingId,target);}}  function upgradeStackedBuilding(buildingId){const entry=buildingElementMap.get(resolveBuildingElementKey(buildingId));if(!entry||!entry.root){warnStack("upgrade-missing",buildingId);return;}const button=entry.root.querySelector('button[data-action="upgrade"]');if(button)button.click();else warnStack("upgrade-missing",buildingId);}  function handleStackedFlagChange(event){featureFlags.UI_STACKED_VIEW=Boolean(event&&event.target&&event.target.checked);const ui=getBuildingUiState();if(!isStackedFeatureEnabled()&&ui.viewMode==="stacked")ui.viewMode="classic";saveState();renderBuildings();}  function handleStackedViewClick(event){const button=event.target.closest("[data-stacked-view]");if(!button)return;const mode=button.dataset.stackedView==="stacked"?"stacked":"classic";const ui=getBuildingUiState();if(ui.viewMode!==mode){ui.viewMode=mode;saveState();renderBuildings();}}  function handleStackedFilterChange(event){const target=event.target;if(!target)return;const filters=getStackedFilters();if(target===stackedFilterActive)filters.onlyActive=Boolean(target.checked);else if(target===stackedFilterLevel){const value=Number(target.value);filters.minLevel=Number.isFinite(value)?Math.max(0,Math.min(10,Math.floor(value))):0;}else if(target===stackedFilterInputs)filters.requireInputsOk=Boolean(target.checked);else return;saveState();renderBuildings();}  function handleStackedAction(event){const button=event.target.closest("button[data-action]");if(!button||!stackedRoot||!stackedRoot.contains(button))return;const {action,buildingId}=button.dataset;if(!buildingId)return;if(action==="stack-toggle-power"){event.preventDefault();void toggleStackedPower(buildingId);return;}if(action==="stack-upgrade"){event.preventDefault();upgradeStackedBuilding(buildingId);return;}handleBuildingActions(event);}

  const VIEW_KEYS = [
    "inventory",
    "buildings",
    "jobs",
    "trades",
    "production",
    "research",
    "stats",
    "village",
  ];
  const viewTabs = Array.from(document.querySelectorAll("[data-view-tab]"));
  const viewPanels = Array.from(document.querySelectorAll("[data-view-panel]"));
  const viewHotkeys = {
    Digit1: "inventory",
    Digit2: "buildings",
    Digit3: "jobs",
    Digit4: "trades",
    Digit5: "production",
    Digit6: "research",
    Digit7: "stats",
    Digit8: "village",
    Numpad1: "inventory",
    Numpad2: "buildings",
    Numpad3: "jobs",
    Numpad4: "trades",
    Numpad5: "production",
    Numpad6: "research",
    Numpad7: "stats",
    Numpad8: "village",
  };

  const viewState = {
    active: "inventory",
  };

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

  function isEditableElement(element) {
    if (!element) {
      return false;
    }
    const tagName = element.tagName;
    if (!tagName) {
      return Boolean(element.isContentEditable);
    }
    const normalized = tagName.toLowerCase();
    if (["input", "textarea", "select", "button"].includes(normalized)) {
      return true;
    }
    return Boolean(element.isContentEditable);
  }

  function setActiveView(viewKey, options = {}) {
    if (!VIEW_KEYS.includes(viewKey)) {
      return;
    }
    const { force = false } = options;
    if (!force && viewState.active === viewKey) {
      return;
    }
    viewState.active = viewKey;
    viewTabs.forEach((tab) => {
      const isActive = tab.dataset.viewTab === viewKey;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.tabIndex = isActive ? 0 : -1;
    });
    viewPanels.forEach((panel) => {
      const isActive = panel.dataset.viewPanel === viewKey;
      panel.classList.toggle("is-active", isActive);
      if (isActive) {
        panel.removeAttribute("hidden");
      } else {
        panel.setAttribute("hidden", "");
      }
    });
  }

  function focusActiveViewTab() {
    const activeTab = viewTabs.find((tab) => tab.dataset.viewTab === viewState.active);
    if (activeTab && typeof activeTab.focus === "function") {
      activeTab.focus();
    }
  }

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
    const value = Number(building && building.max_workers);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  function getStorageTotals(building) {
    if (!building || typeof building !== "object") {
      return new Map();
    }
    const storage =
      building.storage && typeof building.storage === "object"
        ? building.storage
        : {};
    const builtCount = Math.max(0, Number(building.built) || 0);
    const entries = Object.entries(storage);
    const totals = new Map();
    if (entries.length > 0) {
      entries.forEach(([resource, perBuilding]) => {
        const amount = Number(perBuilding);
        const total = Number.isFinite(amount) ? amount * builtCount : 0;
        totals.set(resource, total);
      });
      return totals;
    }

    const outputKeys =
      building.outputs && typeof building.outputs === "object"
        ? Object.keys(building.outputs)
        : [];
    if (outputKeys.length === 1) {
      totals.set(outputKeys[0], 30 * builtCount);
    }
    return totals;
  }

  function formatStorageSummary(building) {
    const totals = getStorageTotals(building);
    if (!totals || totals.size === 0) {
      return "—";
    }
    const parts = [];
    totals.forEach((amount, resource) => {
      const label = formatResourceKey(resource);
      parts.push(`${formatInventoryValue(amount)} ${label}`);
    });
    return parts.join(", ") || "—";
  }

  function getTotalAssigned() {
    let buildingWorkers = 0;
    const coveredJobs = new Set();
    state.buildings.forEach((building) => {
      const activeValue = Number(building.active);
      if (Number.isFinite(activeValue)) {
        buildingWorkers += Math.max(0, activeValue);
      }
      if (typeof building.job === "string" && building.job) {
        coveredJobs.add(building.job);
      }
    });
    const jobWorkers = state.jobs.reduce((total, job) => {
      if (coveredJobs.has(job.id)) {
        return total;
      }
      const assignedValue = Number(job.assigned);
      return total + (Number.isFinite(assignedValue) ? Math.max(0, assignedValue) : 0);
    }, 0);
    return buildingWorkers + jobWorkers;
  }

  function updateChips() {
    const assigned = getTotalAssigned();

    function updateDisplays(resourceKey, value) {
      document
        .querySelectorAll(`.chip[data-resource="${resourceKey}"] .value`)
        .forEach((element) => {
          element.textContent = value;
        });
      document
        .querySelectorAll(
          `.inventory-card[data-resource="${resourceKey}"] [data-inventory-value]`
        )
        .forEach((element) => {
          element.textContent = value;
        });
    }

    updateDisplays("happiness", `${formatAmount(state.resources.happiness)}%`);

    const total = state.population.current || 0;
    const capacity = state.population.capacity || 0;
    const providedAvailable = Number(state.population.available);
    const fallbackAvailable = Math.max(0, Math.min(total, total - assigned));
    const available = Number.isFinite(providedAvailable)
      ? Math.max(0, Math.min(total, Math.floor(providedAvailable)))
      : fallbackAvailable;
    updateDisplays("population", `${available}/${capacity}`);

    const trackResources = [
      "gold",
      "wood",
      "sticks",
      "planks",
      "stone",
      "tools",
      "wheat",
    ];

    trackResources.forEach((resourceKey) => {
      const value = formatInventoryValue(
        state.resources ? state.resources[resourceKey] : 0
      );
      updateDisplays(resourceKey, value);
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
    registerAlias("stick_gathering_tent", "stick_gatherer");
    registerAlias("stick_gathering", "stick_gatherer");
    registerAlias("stick_tent", "stick_gatherer");
    registerAlias("stick", "stick_gatherer");
    registerAlias("sticks", "stick_gatherer");
    registerAlias("lumber_hut", "artisan");
    registerAlias("lumberhut", "artisan");
    registerAlias("lumber", "artisan");
    registerAlias("artisan_workshop", "artisan");
    registerAlias("stone_quarry", "miner");
    registerAlias("quarry", "miner");
    registerAlias("stone", "miner");
    registerAlias("stone_gathering_tent", "stone_gatherer");
    registerAlias("stone_gathering", "stone_gatherer");
    registerAlias("stone_tent", "stone_gatherer");
    registerAlias("stones", "stone_gatherer");
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

  function ensureJobEntryFromBuilding(building) {
    if (!building || typeof building !== "object") {
      return false;
    }
    const jobId =
      typeof building.job === "string" && building.job.trim()
        ? building.job.trim()
        : null;
    if (!jobId) {
      return false;
    }
    const jobName =
      typeof building.job_name === "string" && building.job_name.trim()
        ? building.job_name.trim()
        : formatResourceKey(jobId);
    const jobIcon =
      typeof building.job_icon === "string" && building.job_icon.trim()
        ? building.job_icon
        : "👷";
    const perWorkerOutputs =
      building.per_worker_output_rate &&
      typeof building.per_worker_output_rate === "object"
        ? { ...building.per_worker_output_rate }
        : {};
    const perWorkerInputs =
      building.per_worker_input_rate &&
      typeof building.per_worker_input_rate === "object"
        ? { ...building.per_worker_input_rate }
        : {};
    let job = state.jobs.find((candidate) => candidate.id === jobId);
    let changed = false;
    if (!job) {
      job = {
        id: jobId,
        name: jobName,
        assigned: 0,
        max: Math.max(0, Number(building.max_workers) || 0),
        icon: jobIcon,
        perWorkerOutputs,
        perWorkerInputs,
        buildingId: building.id,
      };
      state.jobs.push(job);
      return true;
    }
    if (job.name !== jobName) {
      job.name = jobName;
      changed = true;
    }
    if (job.icon !== jobIcon) {
      job.icon = jobIcon;
      changed = true;
    }
    if (job.buildingId !== building.id) {
      job.buildingId = building.id;
      changed = true;
    }
    const existingOutputs = JSON.stringify(job.perWorkerOutputs || {});
    const nextOutputs = JSON.stringify(perWorkerOutputs);
    if (existingOutputs !== nextOutputs) {
      job.perWorkerOutputs = perWorkerOutputs;
      changed = true;
    }
    const existingInputs = JSON.stringify(job.perWorkerInputs || {});
    const nextInputs = JSON.stringify(perWorkerInputs);
    if (existingInputs !== nextInputs) {
      job.perWorkerInputs = perWorkerInputs;
      changed = true;
    }
    return changed;
  }

  function ensureJobsForAllBuildings() {
    let changed = false;
    state.buildings.forEach((building) => {
      changed = ensureJobEntryFromBuilding(building) || changed;
    });
    return changed;
  }

  function formatJobTooltip(job) {
    if (!job) {
      return "";
    }
    const outputs = formatRateList(job.perWorkerOutputs || {}, "output");
    const inputs = formatRateList(job.perWorkerInputs || {}, "input");
    const parts = [];
    if (outputs.length > 0) {
      parts.push(`Per worker: ${outputs.join(", ")}`);
    }
    if (inputs.length > 0) {
      parts.push(`Inputs: ${inputs.join(", ")}`);
    } else if (outputs.length > 0) {
      parts.push("Inputs: none");
    }
    return parts.join(" • ");
  }

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
    return { row, list, empty, values };
  }

  function createBuildingCard(building) {
    const listItem = document.createElement("li");
    listItem.className = "building-list-item";
    listItem.dataset.buildingId = building.id;

    const article = document.createElement("article");
    article.className = "building-card";
    article.dataset.buildingId = building.id;

    const header = document.createElement("div");
    header.className = "building-card__header";

    const iconBadge = document.createElement("span");
    iconBadge.className = "building-card__icon icon-badge";
    iconBadge.setAttribute("role", "img");
    iconBadge.setAttribute("aria-label", `${building.name} icon`);
    iconBadge.textContent = building.icon;

    const titleGroup = document.createElement("div");
    titleGroup.className = "building-card__title";

    const nameRow = document.createElement("div");
    nameRow.className = "building-card__name-row";

    const nameHeading = document.createElement("h3");
    nameHeading.className = "building-card__name";
    nameHeading.textContent = building.name;

    const levelBadge = document.createElement("span");
    levelBadge.className = "building-card__level";

    nameRow.append(nameHeading, levelBadge);

    const subtitleRow = document.createElement("div");
    subtitleRow.className = "building-card__subtitle";

    const categoryLabel = document.createElement("span");
    categoryLabel.className = "building-card__category";
    categoryLabel.textContent =
      building.category_label || formatResourceKey(building.category);

    const statusLabel = document.createElement("span");
    statusLabel.className = "building-card__state";

    subtitleRow.append(categoryLabel, statusLabel);

    titleGroup.append(nameRow, subtitleRow);

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "building-card__favorite";
    favoriteButton.dataset.action = "toggle-favorite";
    favoriteButton.dataset.buildingId = building.id;
    favoriteButton.innerHTML =
      '<span aria-hidden="true">☆</span><span class="sr-only">Toggle favorite</span>';
    const favoriteIcon = favoriteButton.querySelector('[aria-hidden="true"]');

    header.append(iconBadge, titleGroup, favoriteButton);

    const statusContainer = document.createElement("div");
    statusContainer.className = "building-status-row";
    statusContainer.style.display = "none";

    const body = document.createElement("div");
    body.className = "building-card__body";

    const metricGroup = document.createElement("div");
    metricGroup.className = "building-card__metric";

    const metricValue = document.createElement("div");
    metricValue.className = "building-card__metric-value";

    const requirementChip = document.createElement("div");
    requirementChip.className = "building-card__requirements";
    requirementChip.hidden = true;

    metricGroup.append(metricValue, requirementChip);

    const costRow = document.createElement("div");
    costRow.className = "building-card__cost";

    const actionRow = document.createElement("div");
    actionRow.className = "building-card__actions";

    const buildLabel =
      typeof building.build_label === "string" && building.build_label
        ? building.build_label
        : building.name;
    const buildButton = document.createElement("button");
    buildButton.type = "button";
    buildButton.className = "building-card__build";
    buildButton.dataset.action = "build";
    buildButton.dataset.buildingId = building.id;
    buildButton.textContent = buildLabel ? `Build ${buildLabel}` : "Build";
    buildButton.dataset.testid = `build-${building.id}`;

    const builtCounter = document.createElement("div");
    builtCounter.className = "building-card__built";

    const workerControls = document.createElement("div");
    workerControls.className = "worker-controls";

    const decrementButton = document.createElement("button");
    decrementButton.type = "button";
    decrementButton.className = "worker-controls__button";
    decrementButton.dataset.action = "worker-decrement";
    decrementButton.dataset.buildingId = building.id;
    decrementButton.textContent = "−";

    const workerInput = document.createElement("input");
    workerInput.type = "number";
    workerInput.min = "0";
    workerInput.step = "1";
    workerInput.value = String(building.active || 0);
    workerInput.dataset.buildingInput = building.id;
    workerInput.className = "worker-controls__input";

    const incrementButton = document.createElement("button");
    incrementButton.type = "button";
    incrementButton.className = "worker-controls__button";
    incrementButton.dataset.action = "worker-increment";
    incrementButton.dataset.buildingId = building.id;
    incrementButton.textContent = "+";

    workerControls.append(decrementButton, workerInput, incrementButton);

    const demolishButton = document.createElement("button");
    demolishButton.type = "button";
    demolishButton.className = "building-card__demolish";
    demolishButton.dataset.action = "demolish";
    demolishButton.dataset.buildingId = building.id;
    demolishButton.textContent = "Demolish";

    actionRow.append(buildButton, builtCounter, workerControls, demolishButton);

    const workerFeedback = document.createElement("p");
    workerFeedback.className = "worker-feedback";
    workerFeedback.hidden = true;

    body.append(metricGroup, costRow, actionRow, workerFeedback);

    const detailsWrapper = document.createElement("div");
    detailsWrapper.className = "building-card__details";

    const detailsToggle = document.createElement("button");
    detailsToggle.type = "button";
    detailsToggle.className = "building-card__details-toggle";
    detailsToggle.dataset.action = "toggle-details";
    detailsToggle.dataset.buildingId = building.id;
    detailsToggle.innerHTML =
      '<span class="building-card__details-label">Details</span><span class="building-card__details-caret" aria-hidden="true">▾</span>';

    const detailsPanel = document.createElement("div");
    detailsPanel.className = "building-card__details-panel";
    detailsPanel.hidden = true;
    detailsPanel.dataset.expanded = "false";
    detailsPanel.dataset.manual = "false";

    const statRow = document.createElement("div");
    statRow.className = "stat-row";
    const builtStat = createStat("Built");
    const storageStat = createStat("Storage");
    statRow.append(builtStat.wrapper, storageStat.wrapper);

    const ioSection = document.createElement("div");
    ioSection.className = "io-section";
    const consumes = createIoRow("Consumes");
    const produces = createIoRow("Produces");
    const producesSummary = document.createElement("span");
    producesSummary.className = "io-summary";
    producesSummary.hidden = true;
    producesSummary.dataset.resource = "wood";
    produces.values.prepend(producesSummary);
    ioSection.append(consumes.row, produces.row);

    detailsPanel.append(statRow, ioSection);
    detailsWrapper.append(detailsToggle, detailsPanel);

    article.append(header, statusContainer, body, detailsWrapper);
    listItem.appendChild(article);

    return {
      root: listItem,
      article,
      header,
      iconBadge,
      nameHeading,
      levelBadge,
      categoryLabel,
      statusLabel,
      favoriteButton,
      favoriteIcon,
      statusContainer,
      statusKey: null,
      builtValue: builtStat.value,
      builtCounter,
      storageValue: storageStat.value,
      metricValue,
      requirementChip,
      costRow,
      workerInput,
      demolishButton,
      incrementButton,
      decrementButton,
      consumesList: consumes.list,
      consumesEmpty: consumes.empty,
      consumesItems: new Map(),
      producesList: produces.list,
      producesEmpty: produces.empty,
      producesItems: new Map(),
      producesSummary,
      buildButton,
      workerFeedback,
      detailsToggle,
      detailsPanel,
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

  function isWoodcutterBuilding(building) {
    if (!building) {
      return false;
    }
    const candidates = [
      building.id,
      building.type,
      building.type_key,
      building.typeKey,
    ];
    return candidates.some((value) => normaliseKey(value) === "woodcutter_camp");
  }

  function resolveWoodProductionPerMinute(building) {
    if (!isWoodcutterBuilding(building)) {
      return 0;
    }
    const provided = Number(building.produces_per_min);
    if (Number.isFinite(provided)) {
      return provided;
    }
    const builtValue = Number(building.built);
    const builtCount = Number.isFinite(builtValue)
      ? Math.max(0, builtValue)
      : building && building.built
      ? 1
      : 0;
    const workers = getBuildingAssignedWorkers(building);
    if (workers <= 0 || builtCount <= 0) {
      return 0;
    }
    return builtCount * workers * WOODCUTTER_RATE_PER_SECOND * 60;
  }

  function formatWoodProductionValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "0";
    }
    if (Number.isInteger(numeric)) {
      return numeric.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    const rounded = Math.round(numeric * 10) / 10;
    return rounded.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  function updateBuildingProductionSummary(entry, building) {
    if (!entry || !entry.producesSummary) {
      return;
    }
    if (!isWoodcutterBuilding(building)) {
      entry.producesSummary.hidden = true;
      entry.producesSummary.textContent = "";
      entry.producesSummary.removeAttribute("title");
      return;
    }

    const perMinute = resolveWoodProductionPerMinute(building);
    const formatted = formatWoodProductionValue(perMinute);
    entry.producesSummary.hidden = false;
    entry.producesSummary.textContent = `Wood: ${formatted}/min`;
    entry.producesSummary.title = `Wood production per minute: ${formatted}`;
  }

  function deriveBuildingUiMeta(building) {
    const costEntries =
      building && building.cost && typeof building.cost === "object"
        ? Object.entries(building.cost)
        : [];

    const costParts = [];
    const missingResources = [];
    costEntries.forEach(([resource, amount]) => {
      const normalized = normaliseResourceKey(resource);
      const displayLabel = formatResourceKey(resource);
      costParts.push(`${formatInventoryValue(amount)} ${displayLabel}`);
      const stock = getResourceStock(normalized);
      if (!Number.isFinite(stock) || stock + 1e-9 < Number(amount)) {
        missingResources.push(displayLabel);
      }
    });

    const perWorkerOutputs =
      building && building.outputs_per_worker && Object.keys(building.outputs_per_worker).length
        ? building.outputs_per_worker
        : building && building.per_worker_output_rate
        ? building.per_worker_output_rate
        : {};
    const perWorkerInputs =
      building && building.inputs_per_worker && Object.keys(building.inputs_per_worker).length
        ? building.inputs_per_worker
        : building && building.per_worker_input_rate
        ? building.per_worker_input_rate
        : {};

    const outputSummary = formatRateList(perWorkerOutputs, "output");
    const inputSummary = formatRateList(perWorkerInputs, "input");

    return {
      costEntries,
      costParts,
      missingResources,
      perWorkerOutputs,
      perWorkerInputs,
      outputSummary,
      inputSummary,
    };
  }

  function computePerWorkerOutputs(building) {
    if (!building) {
      return {};
    }
    const map = building.outputs_per_worker || building.per_worker_output_rate;
    if (map && Object.keys(map).length > 0) {
      return map;
    }
    const outputs = building.outputs || {};
    const cycleTime = Number(building.cycle_time) || Number(building.cycle_time_sec);
    const maxWorkers = Number(building.max_workers) || 0;
    if (!outputs || !cycleTime || cycleTime <= 0 || !maxWorkers) {
      return {};
    }
    const perSecondFactor = 1 / (cycleTime * maxWorkers);
    return Object.entries(outputs).reduce((acc, [resource, amount]) => {
      const numeric = Number(amount);
      if (Number.isFinite(numeric) && numeric !== 0) {
        acc[resource] = numeric * perSecondFactor;
      }
      return acc;
    }, {});
  }

  function computePerWorkerInputs(building) {
    if (!building) {
      return {};
    }
    const map = building.inputs_per_worker || building.per_worker_input_rate;
    if (map && Object.keys(map).length > 0) {
      return map;
    }
    const inputs = building.inputs || {};
    const cycleTime = Number(building.cycle_time) || Number(building.cycle_time_sec);
    const maxWorkers = Number(building.max_workers) || 0;
    if (!inputs || !cycleTime || cycleTime <= 0 || !maxWorkers) {
      return {};
    }
    const perSecondFactor = 1 / (cycleTime * maxWorkers);
    return Object.entries(inputs).reduce((acc, [resource, amount]) => {
      const numeric = Number(amount);
      if (Number.isFinite(numeric) && numeric !== 0) {
        acc[resource] = numeric * perSecondFactor;
      }
      return acc;
    }, {});
  }

  function computePrimaryOutput(building) {
    const outputs = computePerWorkerOutputs(building);
    let selected = null;
    let maxRate = 0;
    Object.entries(outputs).forEach(([resource, rate]) => {
      const numeric = Number(rate);
      if (Number.isFinite(numeric) && numeric > maxRate) {
        maxRate = numeric;
        selected = resource;
      }
    });
    return { resource: selected, rate: maxRate };
  }

  function computeAssignedOutputPerMinute(building, resource) {
    if (!building || !resource) {
      return 0;
    }
    if (building.per_minute_output && building.per_minute_output[resource] !== undefined) {
      const value = Number(building.per_minute_output[resource]);
      if (Number.isFinite(value)) {
        return value;
      }
    }
    const perWorker = computePerWorkerOutputs(building);
    const perSecond = Number(perWorker[resource]);
    const workers = getBuildingAssignedWorkers(building);
    if (!Number.isFinite(perSecond) || perSecond <= 0 || workers <= 0) {
      return 0;
    }
    return perSecond * workers * 60;
  }

  function formatPerWorkerSummary(rate, resource) {
    if (!resource || !Number.isFinite(rate)) {
      return null;
    }
    const value = Math.max(0, rate);
    const formattedRate = formatPerSecondRate(value);
    const label = formatResourceKey(resource);
    return `${formattedRate} ${label}/s per worker`;
  }

  function computeBuildCostTotal(building) {
    if (!building || !building.cost) {
      return 0;
    }
    return Object.values(building.cost).reduce((acc, amount) => {
      const numeric = Number(amount);
      if (Number.isFinite(numeric)) {
        return acc + numeric;
      }
      return acc;
    }, 0);
  }

  function computeCostPerOutput(building) {
    const { rate } = computePrimaryOutput(building);
    if (!Number.isFinite(rate) || rate <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    const costTotal = computeBuildCostTotal(building);
    return costTotal / rate;
  }

  function toRomanNumeral(level) {
    const lookup = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
    const clamped = Math.max(1, Math.min(10, Number(level) || 1));
    return lookup[clamped];
  }

  function updateBuildButton(entry, building) {
    if (!entry || !entry.buildButton) {
      return;
    }
    const button = entry.buildButton;
    const isPending = button.dataset.state === "pending";
    if (building && typeof building.id === "string") {
      button.dataset.buildingId = building.id;
      button.dataset.testid = `build-${building.id}`;
    }
    const buildLabel =
      building && typeof building.build_label === "string" && building.build_label
        ? building.build_label
        : building && typeof building.name === "string"
        ? building.name
        : null;
    button.textContent = buildLabel ? `Build ${buildLabel}` : "Build";
    const meta = deriveBuildingUiMeta(building);

    const disabled = meta.missingResources.length > 0 && meta.costParts.length > 0;
    if (!isPending) {
      syncAriaDisabled(button, disabled);
    }

    const tooltipParts = [];
    if (meta.costParts.length > 0) {
      let costText = `Cost: ${meta.costParts.join(", ")}`;
      if (meta.missingResources.length > 0) {
        costText += ` • Missing: ${meta.missingResources.join(", ")}`;
      }
      tooltipParts.push(costText);
    }
    if (meta.outputSummary.length > 0) {
      tooltipParts.push(`Per worker: ${meta.outputSummary.join(", ")}`);
    }
    if (meta.inputSummary.length > 0) {
      tooltipParts.push(`Inputs: ${meta.inputSummary.join(", ")}`);
    } else if (meta.outputSummary.length > 0) {
      tooltipParts.push("Inputs: none");
    }

    if (tooltipParts.length > 0) {
      const tooltip = tooltipParts.join(" • ");
      button.title = tooltip;
      button.dataset.tooltip = tooltip;
    } else {
      button.removeAttribute("title");
      button.removeAttribute("data-tooltip");
    }
  }

  function updateDemolishButton(entry, building) {
    if (!entry || !entry.demolishButton) {
      return;
    }
    const button = entry.demolishButton;
    const isPending = button.dataset.state === "pending";
    const builtValue = building ? Number(building.built) : 0;
    const builtCount = Number.isFinite(builtValue) ? builtValue : 0;
    const disabled = builtCount <= 0;
    const tooltip = disabled ? "Nothing to demolish" : "";

    if (!isPending) {
      syncAriaDisabled(button, disabled);
    }

    if (tooltip) {
      button.title = tooltip;
      button.dataset.tooltip = tooltip;
    } else {
      button.removeAttribute("title");
      button.removeAttribute("data-tooltip");
    }
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

    const hasServerId =
      typeof building.id === "string" && building.id.trim().length > 0;
    const isPending = pendingWorkerRequests.has(String(building.id));
    const disableState = getWorkerDisableState(building);
    const incrementDisabled =
      !hasServerId ||
      isPending ||
      disableState.disabled ||
      (Number.isFinite(capacity) && activeWorkers >= capacity);
    const decrementDisabled = !hasServerId || isPending || activeWorkers <= 0;

    syncAriaDisabled(entry.decrementButton, decrementDisabled);
    syncAriaDisabled(entry.incrementButton, incrementDisabled);

    entry.workerInput.disabled = !hasServerId || isPending;
    entry.workerInput.setAttribute(
      "aria-disabled",
      entry.workerInput.disabled ? "true" : "false"
    );

    let incrementTooltip = "";
    let decrementTooltip = "";

    if (isPending) {
      incrementTooltip = "Procesando asignación…";
      decrementTooltip = "Procesando asignación…";
    } else if (!hasServerId) {
      const syncing = "Sincronizando con el servidor…";
      incrementTooltip = syncing;
      decrementTooltip = syncing;
    } else if (disableState.disabled) {
      incrementTooltip = disableState.tooltip;
      decrementTooltip = "";
    } else {
      if (Number.isFinite(capacity) && activeWorkers >= capacity && capacity > 0) {
        incrementTooltip = "Capacidad máxima alcanzada.";
      }
    }

    if (incrementTooltip) {
      entry.incrementButton.title = incrementTooltip;
    } else {
      entry.incrementButton.removeAttribute("title");
    }

    if (decrementTooltip) {
      entry.decrementButton.title = decrementTooltip;
    } else {
      entry.decrementButton.removeAttribute("title");
    }
  }

  function updateBuildingCard(entry, building, options = {}) {
    const { obsolete = false } = options;
    entry.root.dataset.buildingId = building.id;
    entry.article.dataset.buildingId = building.id;
    entry.iconBadge.textContent = building.icon;
    entry.iconBadge.setAttribute("aria-label", `${building.name} icon`);
    entry.nameHeading.textContent = building.name;
    entry.categoryLabel.textContent =
      building.category_label || formatResourceKey(building.category);

    const level = Number(building.level) || 1;
    entry.levelBadge.textContent = toRomanNumeral(level);

    entry.article.dataset.level = String(level);
    entry.article.dataset.category = building.category || "";
    entry.article.dataset.role = building.role || "";

    const builtValue = toDisplayInt(building.built || 0);
    const workers = getBuildingAssignedWorkers(building);
    const statusTokens = [];
    if (builtValue > 0) {
      statusTokens.push(`Built x${builtValue}`);
    } else {
      const meta = deriveBuildingUiMeta(building);
      statusTokens.push(meta.missingResources.length > 0 ? "Missing resources" : "Buildable");
    }
    if (workers > 0) {
      statusTokens.push(`${workers} worker${workers === 1 ? "" : "s"}`);
    }
    if (obsolete) {
      statusTokens.push("Obsolete");
    }
    entry.article.classList.toggle("building-card--obsolete", obsolete);
    entry.statusLabel.textContent = statusTokens.join(" • ");
    entry.builtCounter.textContent = `Built x${builtValue}`;

    const uiMeta = deriveBuildingUiMeta(building);
    const perWorker = computePrimaryOutput(building);
    const perWorkerText = formatPerWorkerSummary(perWorker.rate, perWorker.resource);
    entry.metricValue.textContent = perWorkerText || "—";
    if (perWorkerText) {
      const perMinute = computeAssignedOutputPerMinute(building, perWorker.resource);
      const perMinuteText = Number.isFinite(perMinute) && perMinute > 0
        ? `${formatAmount(perMinute)} ${formatResourceKey(perWorker.resource)}/min`
        : "0";
      entry.metricValue.title = `Per worker • ${perWorkerText}\nAssigned • ${perMinuteText}`;
    } else {
      entry.metricValue.title = "";
    }

    const perWorkerInputs = computePerWorkerInputs(building);
    const inputKeys = Object.entries(perWorkerInputs)
      .filter(([, rate]) => Number(rate) > 0)
      .map(([resource]) => formatResourceKey(resource));
    if (inputKeys.length > 0) {
      entry.requirementChip.hidden = false;
      entry.requirementChip.textContent = `Requires ${inputKeys.join(" + ")}`;
    } else {
      entry.requirementChip.hidden = true;
      entry.requirementChip.textContent = "";
    }

    const costText = uiMeta.costParts.length > 0 ? `Cost: ${uiMeta.costParts.join(", ")}` : "";
    const uiState = getBuildingUiState();
    const density = uiState.density === "detailed" ? "detailed" : "compact";
    entry.article.dataset.density = density;
    const shouldHideCost = density === "compact" && builtValue > 0;
    if (costText && !shouldHideCost) {
      entry.costRow.hidden = false;
      entry.costRow.textContent = costText;
    } else {
      entry.costRow.hidden = true;
      entry.costRow.textContent = "";
    }

    entry.builtValue.textContent = formatAmount(building.built || 0);
    entry.storageValue.textContent = formatStorageSummary(building);

    const favoriteActive = isFavorite(building.id);
    entry.favoriteButton.classList.toggle("is-active", favoriteActive);
    entry.favoriteButton.setAttribute("aria-pressed", favoriteActive ? "true" : "false");
    entry.article.classList.toggle("is-favorite", favoriteActive);
    if (entry.favoriteIcon) {
      entry.favoriteIcon.textContent = favoriteActive ? "★" : "☆";
    }

    const manualExpanded = entry.detailsPanel.dataset.manual === "true";
    const detailsExpanded = density === "detailed" ? true : manualExpanded;
    entry.detailsPanel.hidden = !detailsExpanded;
    entry.detailsToggle.setAttribute("aria-expanded", detailsExpanded ? "true" : "false");
    entry.detailsPanel.dataset.expanded = detailsExpanded ? "true" : "false";

    updateWorkerControls(entry, building);
    updateBuildingStatus(entry, building);
    updateBuildingIo(entry, building);
    updateBuildingProductionSummary(entry, building);
    updateBuildButton(entry, building);
    updateDemolishButton(entry, building);
  }

  function toggleBuildingDetails(buildingId) {
    const key = resolveBuildingElementKey(buildingId);
    const entry = buildingElementMap.get(key);
    if (!entry || !entry.detailsPanel || !entry.detailsToggle) {
      return;
    }
    const currentManual = entry.detailsPanel.dataset.manual === "true";
    const nextManual = !currentManual;
    entry.detailsPanel.dataset.manual = nextManual ? "true" : "false";
    entry.detailsPanel.dataset.expanded = nextManual ? "true" : "false";
    const expanded = nextManual;
    entry.detailsPanel.hidden = !expanded;
    entry.detailsToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  function toggleFavorite(buildingId) {
    const nextState = !isFavorite(buildingId);
    setFavorite(buildingId, nextState);
    saveState();
    renderBuildings();
  }

  function computeIsObsolete(building, buildings) {
    if (!building || !building.role) {
      return false;
    }
    if (isFavorite(building.id)) {
      return false;
    }
    const role = String(building.role || "").toLowerCase();
    if (!role) {
      return false;
    }
    const ownOutput = computePrimaryOutput(building).rate;
    if (!Number.isFinite(ownOutput) || ownOutput <= 0) {
      return false;
    }
    const ownCost = computeCostPerOutput(building);
    const ownLevel = Number(building.level) || 1;
    return buildings.some((candidate) => {
      if (!candidate || candidate === building) {
        return false;
      }
      if (String(candidate.role || "").toLowerCase() !== role) {
        return false;
      }
      const candidateOutput = computePrimaryOutput(candidate).rate;
      if (!Number.isFinite(candidateOutput) || candidateOutput <= 0) {
        return false;
      }
      const outputBetter = candidateOutput >= ownOutput - 1e-9;
      if (!outputBetter) {
        return false;
      }
      const candidateCost = computeCostPerOutput(candidate);
      const costBetter = candidateCost <= ownCost + 1e-9;
      const levelHigher = (Number(candidate.level) || 1) > ownLevel;
      return (outputBetter && costBetter) || levelHigher;
    });
  }


  const VILLAGE_RESOURCE_ICONS = {
    wood: "🪵",
    sticks: "🥢",
    stone: "🪨",
    planks: "🧱",
    wheat: "🌾",
    flour: "🌾",
    bread: "🍞",
    food: "🍞",
    fish: "🐟",
    berries: "🫐",
    tools: "🛠️",
    gold: "🪙",
    happiness: "😊",
    population: "👥",
    coal: "⚫",
    iron: "⛏️",
  };

  function getVillageResourceIcon(resource) {
    if (!resource) {
      return "📦";
    }
    const key = String(resource).toLowerCase();
    return VILLAGE_RESOURCE_ICONS[key] || "📦";
  }

  function getVillageTileKey(building) {
    if (!building) {
      return null;
    }
    if (building.id !== undefined && building.id !== null && String(building.id) !== "") {
      return String(building.id);
    }
    if (building.type) {
      return String(building.type);
    }
    if (building.name) {
      return normaliseKey(building.name);
    }
    return null;
  }

  function findBuildingByTileKey(key) {
    if (!key) {
      return null;
    }
    const target = String(key);
    return (
      state.buildings.find((candidate) => getVillageTileKey(candidate) === target) || null
    );
  }

  function ensureVillageOrder(buildings) {
    if (!Array.isArray(villageState.order)) {
      villageState.order = [];
    }
    const validKeys = new Set();
    buildings.forEach((building) => {
      const key = getVillageTileKey(building);
      if (key) {
        validKeys.add(key);
      }
    });
    const nextOrder = [];
    villageState.order.forEach((key) => {
      if (validKeys.has(key)) {
        nextOrder.push(key);
        validKeys.delete(key);
      }
    });
    const appended = new Set(nextOrder);
    buildings.forEach((building) => {
      const key = getVillageTileKey(building);
      if (!key || appended.has(key)) {
        return;
      }
      nextOrder.push(key);
      appended.add(key);
    });
    villageState.order = nextOrder;
  }

  function isLogisticsHub(building) {
    if (!building) {
      return false;
    }
    const role = String(building.role || "").toLowerCase();
    if (role.includes("storage") || role.includes("warehouse") || role.includes("logistic")) {
      return true;
    }
    const category = String(building.category || "").toLowerCase();
    return category.includes("logistic") || category.includes("storage");
  }

  function getVillageBuildingStatus(building) {
    if (!building) {
      return { key: "planned", label: "Unavailable" };
    }
    const builtCount = Math.max(0, Number(building.built) || 0);
    const reason = typeof building.reason === "string" ? building.reason : null;
    if (builtCount <= 0) {
      return { key: "planned", label: "Planned" };
    }
    if (reason === "missing_input") {
      const missing = resolveMissingResource(building);
      return {
        key: "waiting",
        label: missing ? `Waiting (${formatResourceKey(missing)})` : "Waiting for input",
      };
    }
    if (reason === "no_workers") {
      return { key: "waiting", label: "No workers" };
    }
    if (reason === "no_capacity") {
      return { key: "blocked", label: "Storage full" };
    }
    if (reason === "inactive") {
      return { key: "waiting", label: "Inactive" };
    }
    if (building.can_produce === false && !reason) {
      return { key: "waiting", label: "Inactive" };
    }
    const effective = Number(building.effective_rate);
    const workers = getBuildingAssignedWorkers(building);
    if (Number.isFinite(effective) && effective <= 0 && workers <= 0) {
      return { key: "waiting", label: "Idle" };
    }
    return { key: "active", label: "Active" };
  }

  function getVillageProductionSummary(building) {
    if (!building) {
      return "—";
    }
    const primary = computePrimaryOutput(building);
    const resource = primary.resource;
    const perMinute = Number(
      resource ? computeAssignedOutputPerMinute(building, resource) : 0
    );
    if (Number.isFinite(perMinute) && perMinute > 0) {
      return `+${formatAmount(perMinute)} ${formatResourceKey(resource)}/min`;
    }
    if (Number.isFinite(perMinute) && perMinute < 0) {
      return `${formatAmount(perMinute)} ${formatResourceKey(resource)}/min`;
    }
    const status = getVillageBuildingStatus(building);
    if (building.reason === "missing_input") {
      const missing = resolveMissingResource(building);
      return missing ? `Waiting for ${formatResourceKey(missing)}` : status.label;
    }
    if (building.reason === "no_workers") {
      return "Assign workers";
    }
    if (building.reason === "no_capacity") {
      return "Storage full";
    }
    return status.label;
  }

  function formatSeconds(value) {
    const numeric = Math.max(0, Math.floor(Number(value) || 0));
    if (!Number.isFinite(numeric)) {
      return "0s";
    }
    if (numeric >= 60) {
      const minutes = Math.floor(numeric / 60);
      const seconds = numeric % 60;
      if (seconds === 0) {
        return `${minutes}m`;
      }
      return `${minutes}m ${seconds}s`;
    }
    return `${numeric}s`;
  }

  function formatVillageEta(building) {
    if (!building) {
      return null;
    }
    const eta = Number(building.pending_eta);
    if (Number.isFinite(eta) && eta > 0) {
      return `Next delivery in ${formatSeconds(eta)}`;
    }
    const cycle = Number(building.cycle_time);
    if (Number.isFinite(cycle) && cycle > 0) {
      return `Cycle ${formatSeconds(cycle)}`;
    }
    return null;
  }

  function createVillageChainChips(resources) {
    const entries = Object.entries(resources || {}).filter(([, amount]) => {
      const numeric = Number(amount);
      return Number.isFinite(numeric) && numeric !== 0;
    });
    return entries.slice(0, 3).map(([resource, amount]) => {
      const chip = document.createElement("span");
      chip.className = "village-tile__chip";
      chip.textContent = `${getVillageResourceIcon(resource)} ${formatResourceKey(resource)}`;
      chip.title = `${formatAmount(Math.abs(Number(amount) || 0))} per cycle`;
      return chip;
    });
  }

  function createVillageTile(building) {
    const key = getVillageTileKey(building);
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "village-tile";
    tile.dataset.buildingId = key;
    tile.setAttribute("role", "listitem");
    tile.draggable = true;

    const icon = document.createElement("span");
    icon.className = "village-tile__icon";
    icon.textContent = building.icon || "🏡";

    const header = document.createElement("div");
    header.className = "village-tile__header";

    const name = document.createElement("span");
    name.className = "village-tile__name";
    name.textContent = building.name || formatResourceKey(key || "building");

    const levelBadge = document.createElement("span");
    levelBadge.className = "village-tile__level";
    const levelValue = Number(building.level) || 1;
    levelBadge.textContent = `Lv.${levelValue}`;

    header.append(name, levelBadge);

    const meta = document.createElement("div");
    meta.className = "village-tile__meta";
    const workers = document.createElement("span");
    workers.className = "village-tile__workers";
    const assigned = getBuildingAssignedWorkers(building);
    const capacity = getCapacity(building);
    workers.textContent = `👷 ${formatAmount(assigned)}/${formatAmount(capacity)}`;

    const statusBadge = document.createElement("span");
    statusBadge.className = "village-tile__state";
    const status = getVillageBuildingStatus(building);
    statusBadge.textContent = status.label;
    tile.dataset.status = status.key;

    meta.append(workers, statusBadge);

    const modeRow = document.createElement("div");
    modeRow.className = "village-tile__mode";

    tile.append(icon, header, meta, modeRow);

    if (villageState.mode === "chains") {
      const chainRow = document.createElement("div");
      chainRow.className = "village-tile__chain";
      const inputChips = createVillageChainChips(building.inputs);
      if (inputChips.length) {
        inputChips.forEach((chip) => chainRow.appendChild(chip));
      } else {
        const emptyChip = document.createElement("span");
        emptyChip.className = "village-tile__chip";
        emptyChip.textContent = "No input";
        chainRow.appendChild(emptyChip);
      }
      const arrow = document.createElement("span");
      arrow.className = "village-tile__arrow";
      arrow.textContent = "→";
      chainRow.appendChild(arrow);
      const outputChips = createVillageChainChips(building.outputs);
      if (outputChips.length) {
        outputChips.forEach((chip) => chainRow.appendChild(chip));
      } else {
        const emptyChip = document.createElement("span");
        emptyChip.className = "village-tile__chip";
        emptyChip.textContent = "No output";
        chainRow.appendChild(emptyChip);
      }
      tile.appendChild(chainRow);
      modeRow.textContent = getVillageProductionSummary(building);
    } else if (villageState.mode === "logistics") {
      const counts = villageConnectionCounts.get(key) || {
        incoming: 0,
        outgoing: 0,
        total: 0,
      };
      const routes = document.createElement("div");
      routes.className = "village-tile__routes";
      const outSpan = document.createElement("span");
      outSpan.dataset.direction = "out";
      outSpan.textContent = `${counts.outgoing || 0} out`;
      const inSpan = document.createElement("span");
      inSpan.dataset.direction = "in";
      inSpan.textContent = `${counts.incoming || 0} in`;
      routes.append(outSpan, inSpan);
      tile.appendChild(routes);
      modeRow.textContent = getVillageProductionSummary(building);
      if (counts.total >= 3 || isLogisticsHub(building)) {
        tile.classList.add("village-tile--hub");
      }
    } else if (villageState.mode === "population") {
      const housing = Number(building.capacityPerBuilding);
      const housingValue = Number.isFinite(housing) && housing > 0 ? housing : capacity;
      modeRow.textContent = `Housing ${formatAmount(Math.max(0, housingValue))} • Assigned ${formatAmount(
        assigned
      )}`;
    } else {
      modeRow.textContent = getVillageProductionSummary(building);
    }

    const titleParts = [
      building.name || formatResourceKey(key || "building"),
      getVillageProductionSummary(building),
      formatVillageEta(building),
    ].filter(Boolean);
    const titleText = titleParts.join(" • ");
    tile.title = titleText;
    tile.setAttribute("aria-label", titleText);

    return tile;
  }

  function populateVillageIoList(listElement, resources, direction) {
    if (!listElement) {
      return;
    }
    listElement.innerHTML = "";
    const entries = Object.entries(resources || {}).filter(([, amount]) => {
      const numeric = Number(amount);
      return Number.isFinite(numeric) && numeric !== 0;
    });
    if (!entries.length) {
      const emptyItem = document.createElement("li");
      emptyItem.textContent = "None";
      emptyItem.style.opacity = "0.6";
      listElement.appendChild(emptyItem);
      return;
    }
    entries.slice(0, 6).forEach(([resource, amount]) => {
      const item = document.createElement("li");
      const icon = document.createElement("span");
      icon.textContent = getVillageResourceIcon(resource);
      const label = document.createElement("span");
      label.textContent = `${formatResourceKey(resource)} ${formatAmount(
        Math.abs(Number(amount) || 0)
      )}`;
      item.append(icon, label);
      listElement.appendChild(item);
    });
  }

  function resetVillageDetail() {
    if (villageDetailPlaceholder) {
      villageDetailPlaceholder.hidden = false;
    }
    if (villageDetailContent) {
      villageDetailContent.hidden = true;
    }
  }

  function populateVillageDetail(building) {
    if (!villageDetailContent || !villageDetailPlaceholder) {
      return;
    }
    villageDetailPlaceholder.hidden = true;
    villageDetailContent.hidden = false;
    if (villageDetailIcon) {
      villageDetailIcon.textContent = building.icon || "🏡";
    }
    if (villageDetailName) {
      villageDetailName.textContent = building.name || formatResourceKey("building");
    }
    if (villageDetailSubtitle) {
      const level = Number(building.level) || 1;
      const status = getVillageBuildingStatus(building);
      villageDetailSubtitle.textContent = `Level ${level} • ${status.label}`;
    }
    if (villageProgressBar) {
      const eta = Number(building.pending_eta);
      const cycle = Number(building.cycle_time);
      let progress = 0;
      if (Number.isFinite(eta) && Number.isFinite(cycle) && cycle > 0) {
        progress = Math.max(0, Math.min(1, 1 - eta / cycle));
      }
      villageProgressBar.style.width = `${(progress * 100).toFixed(1)}%`;
    }
    if (villageDetailWorkers) {
      const workers = getBuildingAssignedWorkers(building);
      const capacity = getCapacity(building);
      villageDetailWorkers.textContent = `${formatAmount(workers)}/${formatAmount(capacity)} workers`;
    }
    if (villageDetailProduction) {
      villageDetailProduction.textContent = getVillageProductionSummary(building);
    }
    if (villageDetailStorage) {
      const summary = formatStorageSummary(building);
      villageDetailStorage.textContent = summary || "—";
    }
    populateVillageIoList(villageDetailInputs, building.inputs, "input");
    populateVillageIoList(villageDetailOutputs, building.outputs, "output");
    const upgradeButton = villageDetail
      ? villageDetail.querySelector('[data-village-action="upgrade"]')
      : null;
    const demolishButton = villageDetail
      ? villageDetail.querySelector('[data-village-action="demolish"]')
      : null;
    const buildingId = building.id || building.type;
    if (upgradeButton) {
      upgradeButton.dataset.buildingId = buildingId;
      upgradeButton.disabled = false;
    }
    if (demolishButton) {
      demolishButton.dataset.buildingId = buildingId;
      demolishButton.disabled = !(Number(building.built) > 0);
    }
  }

  function updateVillageDetailView() {
    if (!villageDetail) {
      return;
    }
    if (!villageState.selected) {
      resetVillageDetail();
      return;
    }
    const building = findBuildingByTileKey(villageState.selected);
    if (!building) {
      resetVillageDetail();
      return;
    }
    populateVillageDetail(building);
  }

  function renderVillageHud() {
    if (!villageHudDisplays.villagers) {
      return;
    }
    const villagers = Number(state.population.current) || 0;
    const free = Number(state.population.available) || 0;
    const buildingTotal = state.buildings.reduce((total, building) => {
      const built = Number(building && building.built);
      return total + (Number.isFinite(built) ? Math.max(0, built) : 0);
    }, 0);
    const goldValue = Number(state.resources && state.resources.gold);
    villageHudDisplays.villagers.textContent = formatAmount(villagers);
    villageHudDisplays.free.textContent = formatAmount(free);
    villageHudDisplays.buildings.textContent = formatAmount(buildingTotal);
    villageHudDisplays.gold.textContent = formatAmount(Number.isFinite(goldValue) ? goldValue : 0);
  }

  function applyVillageSelection() {
    villageTileLookup.forEach((entry, key) => {
      entry.element.classList.toggle("is-selected", villageState.selected === key);
    });
  }

  function updateVillageModeControls() {
    villageModeButtons.forEach((button) => {
      const mode = button.dataset.villageMode;
      const isActive = mode === villageState.mode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.tabIndex = isActive ? 0 : -1;
    });
  }

  function updateVillageCompactToggle() {
    if (!villageCompactToggle) {
      return;
    }
    villageCompactToggle.setAttribute(
      "aria-pressed",
      villageState.compact ? "true" : "false"
    );
    if (villageCompactLabel) {
      villageCompactLabel.textContent = villageState.compact
        ? "Expanded view"
        : "Compact view";
    }
  }

  function updateVillageMapMode() {
    if (villageMapRoot) {
      villageMapRoot.dataset.mode = villageState.mode;
    }
    if (villageLogisticsLegend) {
      villageLogisticsLegend.hidden = villageState.mode !== "logistics";
    }
  }

  function renderVillageView() {
    if (!villageMapGrid) {
      return;
    }
    const buildings = state.buildings.slice();
    ensureVillageOrder(buildings);
    const activeMode = VILLAGE_MODES.includes(villageState.mode)
      ? villageState.mode
      : "buildings";
    villageState.mode = activeMode;
    if (activeMode === "logistics") {
      const connectionData = computeVillageConnections(buildings);
      cachedVillageConnections = connectionData.connections;
      villageConnectionCounts = connectionData.counts;
      villageConnectionAdjacency = connectionData.adjacency;
      villageConnectionMaxRate = connectionData.maxRate;
    } else {
      cachedVillageConnections = [];
      villageConnectionCounts = new Map();
      villageConnectionAdjacency = new Map();
      villageConnectionMaxRate = 1;
    }
    const fragment = document.createDocumentFragment();
    const tileMap = new Map();
    villageState.order.forEach((key) => {
      const building = buildings.find((candidate) => getVillageTileKey(candidate) === key);
      if (!building) {
        return;
      }
      const tile = createVillageTile(building);
      fragment.appendChild(tile);
      tileMap.set(key, { element: tile });
    });
    villageMapGrid.innerHTML = "";
    villageMapGrid.appendChild(fragment);
    villageMapGrid.classList.toggle("is-compact", Boolean(villageState.compact));
    villageTileLookup = tileMap;
    if (villageState.selected && !villageTileLookup.has(villageState.selected)) {
      villageState.selected = null;
    }
    updateVillageCompactToggle();
    updateVillageModeControls();
    updateVillageMapMode();
    applyVillageSelection();
    const highlightKey = villageState.hovered || villageState.selected || null;
    highlightVillageConnections(highlightKey);
    renderVillageHud();
    updateVillageDetailView();
    scheduleVillageOverlayUpdate();
  }

  function setVillageHover(key) {
    villageState.hovered = key;
    const target = key || villageState.selected || null;
    highlightVillageConnections(target);
  }

  function highlightVillageConnections(buildingKey) {
    villageTileLookup.forEach((entry, key) => {
      const element = entry.element;
      const isSelf = Boolean(buildingKey) && key === buildingKey;
      let isLinked = false;
      if (buildingKey && villageConnectionAdjacency.has(buildingKey)) {
        const adjacency = villageConnectionAdjacency.get(buildingKey);
        isLinked = adjacency.outgoing.has(key) || adjacency.incoming.has(key);
      }
      if (!isLinked && buildingKey && villageConnectionAdjacency.has(key)) {
        const adjacency = villageConnectionAdjacency.get(key);
        isLinked = adjacency.outgoing.has(buildingKey) || adjacency.incoming.has(buildingKey);
      }
      const shouldDim =
        villageState.mode === "logistics" && Boolean(buildingKey) && !isSelf && !isLinked;
      element.classList.toggle("is-hovered", isSelf);
      element.classList.toggle("is-linked", Boolean(buildingKey && !isSelf && isLinked));
      element.classList.toggle("is-dimmed", shouldDim);
    });
    if (!villageOverlay || villageState.mode !== "logistics") {
      return;
    }
    const routes = villageOverlay.querySelectorAll(".village-overlay__route");
    routes.forEach((route) => {
      if (!buildingKey) {
        route.classList.remove("is-active", "is-dimmed");
        return;
      }
      const isMatch =
        route.dataset.from === buildingKey || route.dataset.to === buildingKey;
      route.classList.toggle("is-active", isMatch);
      route.classList.toggle("is-dimmed", !isMatch);
    });
  }

  function computeVillageConnections(buildings) {
    const connections = [];
    const counts = new Map();
    const adjacency = new Map();
    let maxRate = 0;
    const processed = buildings.filter(Boolean);
    const ensureCounts = (key) => {
      if (!counts.has(key)) {
        counts.set(key, { incoming: 0, outgoing: 0, total: 0 });
      }
      return counts.get(key);
    };
    const ensureAdjacency = (key) => {
      if (!adjacency.has(key)) {
        adjacency.set(key, { incoming: new Set(), outgoing: new Set() });
      }
      return adjacency.get(key);
    };
    processed.forEach((producer) => {
      const outputs = producer.outputs || {};
      const producerKey = getVillageTileKey(producer);
      if (!producerKey) {
        return;
      }
      Object.entries(outputs).forEach(([resource, value]) => {
        const rate = Number(value);
        if (!Number.isFinite(rate) || rate <= 0) {
          return;
        }
        processed.forEach((consumer) => {
          if (consumer === producer) {
            return;
          }
          const inputs = consumer.inputs || {};
          const demand = Number(inputs[resource]);
          if (!Number.isFinite(demand) || demand <= 0) {
            return;
          }
          const consumerKey = getVillageTileKey(consumer);
          if (!consumerKey) {
            return;
          }
          connections.push({
            from: producer,
            to: consumer,
            fromKey: producerKey,
            toKey: consumerKey,
            resource,
            rate,
          });
          maxRate = Math.max(maxRate, Math.abs(rate));
          const outCounts = ensureCounts(producerKey);
          outCounts.outgoing += 1;
          outCounts.total += 1;
          const inCounts = ensureCounts(consumerKey);
          inCounts.incoming += 1;
          inCounts.total += 1;
          const outAdj = ensureAdjacency(producerKey);
          outAdj.outgoing.add(consumerKey);
          const inAdj = ensureAdjacency(consumerKey);
          inAdj.incoming.add(producerKey);
        });
      });
    });
    if (!Number.isFinite(maxRate) || maxRate <= 0) {
      maxRate = 1;
    }
    return { connections, counts, adjacency, maxRate };
  }

  function scheduleVillageOverlayUpdate() {
    if (!villageOverlay || !villageMapRoot) {
      return;
    }
    if (typeof window === "undefined") {
      updateVillageOverlay();
      return;
    }
    if (villageOverlayFrame !== null) {
      return;
    }
    villageOverlayFrame = window.requestAnimationFrame(() => {
      villageOverlayFrame = null;
      updateVillageOverlay();
    });
  }

  function updateVillageOverlay() {
    if (!villageOverlay || villageState.mode !== "logistics" || !villageMapRoot) {
      if (villageOverlay) {
        villageOverlay.innerHTML = "";
      }
      return;
    }
    const rect = villageMapRoot.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) {
      return;
    }
    villageOverlay.innerHTML = "";
    villageOverlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
    villageOverlay.setAttribute("width", width);
    villageOverlay.setAttribute("height", height);
    const defs = document.createElementNS(VILLAGE_SVG_NS, "defs");
    const marker = document.createElementNS(VILLAGE_SVG_NS, "marker");
    marker.id = "village-arrow";
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("refX", "5.5");
    marker.setAttribute("refY", "3");
    marker.setAttribute("orient", "auto");
    const markerPath = document.createElementNS(VILLAGE_SVG_NS, "path");
    markerPath.setAttribute("d", "M0 0 L6 3 L0 6 z");
    markerPath.setAttribute("fill", "rgba(56, 189, 248, 0.85)");
    marker.appendChild(markerPath);
    defs.appendChild(marker);
    villageOverlay.appendChild(defs);
    const group = document.createElementNS(VILLAGE_SVG_NS, "g");
    group.classList.add("village-overlay__routes");
    villageOverlay.appendChild(group);
    cachedVillageConnections.forEach((connection) => {
      const fromEntry = villageTileLookup.get(connection.fromKey);
      const toEntry = villageTileLookup.get(connection.toKey);
      if (!fromEntry || !toEntry) {
        return;
      }
      const fromRect = fromEntry.element.getBoundingClientRect();
      const toRect = toEntry.element.getBoundingClientRect();
      const startX = fromRect.left - rect.left + fromRect.width / 2;
      const startY = fromRect.top - rect.top + fromRect.height / 2;
      const endX = toRect.left - rect.left + toRect.width / 2;
      const endY = toRect.top - rect.top + toRect.height / 2;
      const dx = endX - startX;
      const dy = endY - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const curve = Math.min(60, distance / 3);
      const controlX = startX + dx / 2;
      const controlY = startY + dy / 2 - curve;
      const path = document.createElementNS(VILLAGE_SVG_NS, "path");
      path.classList.add("village-overlay__route");
      path.dataset.from = connection.fromKey;
      path.dataset.to = connection.toKey;
      path.dataset.resource = connection.resource;
      const widthFactor = Math.max(0.35, Math.min(1.5, connection.rate / villageConnectionMaxRate));
      path.setAttribute(
        "d",
        `M ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${controlX.toFixed(1)} ${controlY.toFixed(
          1
        )} ${endX.toFixed(1)} ${endY.toFixed(1)}`
      );
      path.setAttribute("stroke-width", (1.5 + widthFactor * 2.4).toFixed(2));
      path.setAttribute("marker-end", "url(#village-arrow)");
      group.appendChild(path);
    });
    const highlightKey = villageState.hovered || villageState.selected || null;
    if (highlightKey) {
      highlightVillageConnections(highlightKey);
    }
  }

  function handleVillageModeClick(event) {
    const button = event.target.closest("[data-village-mode]");
    if (!button) {
      return;
    }
    const mode = button.dataset.villageMode;
    if (!mode || !VILLAGE_MODES.includes(mode)) {
      return;
    }
    if (villageState.mode === mode) {
      return;
    }
    villageState.mode = mode;
    renderVillageView();
  }

  function handleVillageCompactToggle(event) {
    event.preventDefault();
    villageState.compact = !villageState.compact;
    updateVillageCompactToggle();
    if (villageMapGrid) {
      villageMapGrid.classList.toggle("is-compact", villageState.compact);
    }
    scheduleVillageOverlayUpdate();
  }

  function handleVillageTileClick(event) {
    const tile = event.target.closest(".village-tile");
    if (!tile) {
      return;
    }
    event.preventDefault();
    const key = tile.dataset.buildingId;
    if (!key) {
      return;
    }
    villageState.selected = key;
    applyVillageSelection();
    updateVillageDetailView();
    setVillageHover(key);
  }

  function handleVillagePointerOver(event) {
    const tile = event.target.closest(".village-tile");
    if (!tile) {
      return;
    }
    const key = tile.dataset.buildingId;
    if (!key) {
      return;
    }
    setVillageHover(key);
  }

  function handleVillagePointerOut(event) {
    const tile = event.target.closest(".village-tile");
    if (!tile) {
      return;
    }
    const related = event.relatedTarget;
    if (related && tile.contains(related)) {
      return;
    }
    setVillageHover(null);
  }

  function handleVillageFocusIn(event) {
    const tile = event.target.closest(".village-tile");
    if (!tile) {
      return;
    }
    const key = tile.dataset.buildingId;
    if (!key) {
      return;
    }
    setVillageHover(key);
  }

  function handleVillageFocusOut(event) {
    const tile = event.target.closest(".village-tile");
    if (!tile) {
      return;
    }
    const related = event.relatedTarget;
    if (related && tile.contains(related)) {
      return;
    }
    setVillageHover(null);
  }

  function handleVillageKeyDown(event) {
    const tile = event.target.closest(".village-tile");
    if (!tile) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const key = tile.dataset.buildingId;
      if (key) {
        villageState.selected = key;
        applyVillageSelection();
        updateVillageDetailView();
        setVillageHover(key);
      }
    }
  }

function handleVillageDragStart(event) {
  const tile = event.target.closest(".village-tile");
  if (!tile) {
    return;
  }
  const key = tile.dataset.buildingId;
  if (!key) {
    return;
  }
  villageState.dragging = key;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", key);
  tile.classList.add("is-hovered");
  setVillageHover(key);
}

function handleVillageDragEnd(event) {
  const tile = event.target.closest(".village-tile");
  if (tile) {
    tile.classList.remove("is-hovered");
  }
  if (villageDropTarget) {
    villageDropTarget.classList.remove("is-drop-target");
    villageDropTarget = null;
  }
  villageState.dragging = null;
  scheduleVillageOverlayUpdate();
  setVillageHover(villageState.selected);
}

  function handleVillageDragOver(event) {
    if (!villageState.dragging) {
      return;
    }
    const tile = event.target.closest(".village-tile");
    if (!tile || tile.dataset.buildingId === villageState.dragging) {
      return;
    }
    event.preventDefault();
    if (villageDropTarget && villageDropTarget !== tile) {
      villageDropTarget.classList.remove("is-drop-target");
    }
    villageDropTarget = tile;
    tile.classList.add("is-drop-target");
  }

  function handleVillageDragLeave(event) {
    const tile = event.target.closest(".village-tile");
    if (!tile || tile !== villageDropTarget) {
      return;
    }
    const related = event.relatedTarget;
    if (related && tile.contains(related)) {
      return;
    }
    tile.classList.remove("is-drop-target");
    villageDropTarget = null;
  }

  function handleVillageDrop(event) {
    if (!villageState.dragging) {
      return;
    }
    const tile = event.target.closest(".village-tile");
    if (!tile) {
      return;
    }
    event.preventDefault();
    const fromKey = villageState.dragging;
    const toKey = tile.dataset.buildingId;
    if (!toKey || fromKey === toKey) {
      return;
    }
    const order = villageState.order.slice();
    const fromIndex = order.indexOf(fromKey);
    const toIndex = order.indexOf(toKey);
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }
    order.splice(fromIndex, 1);
    const insertionIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    order.splice(insertionIndex, 0, fromKey);
    villageState.order = order;
    villageState.dragging = null;
    villageDropTarget = null;
    renderVillageView();
  }

  async function handleVillageDetailClick(event) {
    const button = event.target.closest("button[data-village-action]");
    if (!button) {
      return;
    }
    const buildingId = button.dataset.buildingId;
    if (!buildingId) {
      return;
    }
    if (button.dataset.villageAction === "upgrade") {
      await buildStructure(buildingId);
    } else if (button.dataset.villageAction === "demolish") {
      await demolishStructure(buildingId);
    }
  }

  function renderFilterControls() {
    const ui = getBuildingUiState();
    if (categoryChipsContainer) {
      const categories = new Map();
      state.buildings.forEach((building) => {
        const key = String(building.category || "general").toLowerCase();
        if (!categories.has(key)) {
          const label = building.category_label || formatResourceKey(key);
          categories.set(key, label);
        }
      });
      const entries = Array.from(categories.entries()).sort((a, b) =>
        a[1].localeCompare(b[1])
      );
      categoryChipsContainer.innerHTML = "";
      const allButton = document.createElement("button");
      allButton.type = "button";
      allButton.className = "filter-chip";
      allButton.dataset.filterCategory = "all";
      allButton.textContent = "All";
      allButton.setAttribute("aria-pressed", ui.filters.category === "all" ? "true" : "false");
      categoryChipsContainer.appendChild(allButton);
      entries.forEach(([key, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "filter-chip";
        button.dataset.filterCategory = key;
        button.textContent = label;
        button.setAttribute(
          "aria-pressed",
          ui.filters.category === key ? "true" : "false"
        );
        categoryChipsContainer.appendChild(button);
      });
    }

    if (levelChipsContainer) {
      levelChipsContainer.innerHTML = "";
      for (let level = 1; level <= 5; level += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "filter-chip";
        button.dataset.filterLevel = String(level);
        button.textContent = toRomanNumeral(level);
        button.setAttribute(
          "aria-pressed",
          ui.filters.level === level ? "true" : "false"
        );
        levelChipsContainer.appendChild(button);
      }
      const anyButton = document.createElement("button");
      anyButton.type = "button";
      anyButton.className = "filter-chip";
      anyButton.dataset.filterLevel = "";
      anyButton.textContent = "Any";
      anyButton.setAttribute(
        "aria-pressed",
        ui.filters.level === null ? "true" : "false"
      );
      levelChipsContainer.prepend(anyButton);
    }

    if (statusChipsContainer) {
      const statusOptions = [
        { key: "buildable", label: "Buildable now" },
        { key: "built", label: "Built" },
        { key: "workers", label: "Has workers" },
        { key: "favorites", label: "Favorites" },
      ];
      statusChipsContainer.innerHTML = "";
      statusOptions.forEach(({ key, label }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "filter-chip";
        button.dataset.filterStatus = key;
        button.textContent = label;
        const active = Boolean(ui.filters.status[key]);
        button.setAttribute("aria-pressed", active ? "true" : "false");
        statusChipsContainer.appendChild(button);
      });
    }

    if (obsoleteToggle) {
      const pressed = Boolean(ui.filters.showObsolete);
      obsoleteToggle.setAttribute("aria-pressed", pressed ? "true" : "false");
      obsoleteToggle.dataset.filterObsolete = pressed ? "on" : "off";
      obsoleteToggle.textContent = pressed ? "Hide obsolete" : "Show obsolete";
    }

    if (densityToggle) {
      const buttons = densityToggle.querySelectorAll("[data-density]");
      buttons.forEach((button) => {
        const isActive = button.dataset.density === ui.density;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    if (sortSelect) {
      sortSelect.value = ui.sort;
    }
  }

  function renderBuildings() {
    if (!buildingGrid) {
      return;
    }
    state.buildings = state.buildings
      .map((building) => normaliseBuilding(building))
      .filter(Boolean);

    ensureUiState();
    const ui = getBuildingUiState();
    const stackedFilters = getStackedFilters();
    const viewMode = ui.viewMode === "stacked" ? "stacked" : "classic";
    const showStacked = isStackedFeatureEnabled() && viewMode === "stacked";

    renderFilterControls();
    updateStackedUi(showStacked, viewMode, stackedFilters);
    renderVillageView();

    if (showStacked) {
      renderStackedBuildingsList(state.buildings, stackedFilters);
      return;
    }

    if (stackedRoot) {
      stackedRoot.innerHTML = "";
    }

    const favorites = getFavoritesSet();
    const allBuildings = state.buildings;

    const decorated = allBuildings.map((building) => {
      const primary = computePrimaryOutput(building);
      const perMinute = computeAssignedOutputPerMinute(building, primary.resource);
      const costPerOutput = computeCostPerOutput(building);
      const obsolete = computeIsObsolete(building, allBuildings);
      return { building, primary, perMinute, costPerOutput, obsolete };
    });

    const activeStatuses = Object.entries(ui.filters.status)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key);

    const filtered = decorated.filter(({ building, obsolete }) => {
      if (
        ui.filters.category &&
        ui.filters.category !== "all" &&
        String(building.category || "general").toLowerCase() !== ui.filters.category
      ) {
        return false;
      }
      if (ui.filters.level !== null) {
        if (Number(building.level) !== ui.filters.level) {
          return false;
        }
      }
      if (!ui.filters.showObsolete && obsolete) {
        return false;
      }
      if (activeStatuses.length > 0) {
        const matchesStatus = activeStatuses.some((statusKey) => {
          switch (statusKey) {
            case "buildable": {
              if (toDisplayInt(building.built || 0) > 0) {
                return false;
              }
              const meta = deriveBuildingUiMeta(building);
              return meta.missingResources.length === 0;
            }
            case "built":
              return toDisplayInt(building.built || 0) > 0;
            case "workers":
              return getBuildingAssignedWorkers(building) > 0;
            case "favorites":
              return favorites.has(String(building.id));
            default:
              return false;
          }
        });
        if (!matchesStatus) {
          return false;
        }
      }
      return true;
    });

    const sorted = filtered.sort((a, b) => {
      switch (ui.sort) {
        case "output": {
          const delta = (b.perMinute || 0) - (a.perMinute || 0);
          if (Math.abs(delta) > 1e-6) {
            return delta;
          }
          break;
        }
        case "cost": {
          const delta = (a.costPerOutput || 0) - (b.costPerOutput || 0);
          if (Math.abs(delta) > 1e-6) {
            return delta;
          }
          break;
        }
        case "alphabetical": {
          return String(a.building.name || "").localeCompare(
            String(b.building.name || "")
          );
        }
        case "efficiency":
        default: {
          const delta = (b.primary.rate || 0) - (a.primary.rate || 0);
          if (Math.abs(delta) > 1e-6) {
            return delta;
          }
          break;
        }
      }
      return String(a.building.name || "").localeCompare(String(b.building.name || ""));
    });

    const seen = new Set();

    sorted.forEach(({ building, obsolete }) => {
      let entry = buildingElementMap.get(building.id);
      if (!entry) {
        entry = createBuildingCard(building);
        buildingElementMap.set(building.id, entry);
      }
      updateBuildingCard(entry, building, { obsolete });
      entry.article.dataset.obsolete = obsolete ? "true" : "false";
      entry.root.dataset.obsolete = obsolete ? "true" : "false";
      entry.root.dataset.favorite = favorites.has(String(building.id)) ? "true" : "false";
      entry.root.hidden = false;
      entry.root.style.display = "";
      buildingGrid.appendChild(entry.root);
      seen.add(building.id);
    });

    buildingElementMap.forEach((entry, buildingId) => {
      if (!seen.has(buildingId)) {
        const stillExists = state.buildings.some(
          (building) => String(building.id) === String(buildingId)
        );
        if (!stillExists) {
          entry.root.remove();
          buildingElementMap.delete(buildingId);
        } else {
          entry.root.hidden = true;
          entry.root.style.display = "none";
        }
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
      card.title = formatJobTooltip(job);

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
      counter.dataset.jobCounter = job.id;
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
      decrement.disabled = true;
      decrement.setAttribute("aria-disabled", "true");
      decrement.title = JOB_ASSIGNMENT_PLACEHOLDER_MESSAGE;

      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = String(job.max);
      input.value = String(job.assigned);
      input.dataset.jobInput = job.id;
      input.disabled = true;
      input.readOnly = true;
      input.setAttribute("aria-disabled", "true");
      input.title = JOB_ASSIGNMENT_PLACEHOLDER_MESSAGE;

      const increment = document.createElement("button");
      increment.type = "button";
      increment.dataset.action = "job-increment";
      increment.dataset.jobId = job.id;
      increment.textContent = "+";
      increment.disabled = true;
      increment.setAttribute("aria-disabled", "true");
      increment.title = JOB_ASSIGNMENT_PLACEHOLDER_MESSAGE;

      controls.append(decrement, input, increment);

      card.append(header, resourceStrip, controls);
      jobsList.appendChild(card);
    });
  }

  function updateJobCard(job) {
    if (!job || !jobsList) {
      return;
    }
    const card = jobsList.querySelector(`[data-job-id="${job.id}"]`);
    if (!card) {
      return;
    }
    card.title = formatJobTooltip(job);
    const counter = card.querySelector(`[data-job-counter="${job.id}"]`);
    if (counter) {
      counter.textContent = `${job.assigned}/${job.max}`;
    }
    const input = card.querySelector(`input[data-job-input="${job.id}"]`);
    if (input) {
      input.value = String(job.assigned);
      input.max = String(job.max);
      input.disabled = true;
      input.setAttribute("aria-disabled", "true");
      input.title = JOB_ASSIGNMENT_PLACEHOLDER_MESSAGE;
    }
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

  function createJobResourceTooltipHandler(intent) {
    const showTooltip = intent === "show";
    return (event) => {
      const target = event.target;
      if (!target || typeof target.closest !== "function") {
        return;
      }
      const pill = target.closest("[data-job-resource-pill]");
      if (!pill || !jobsList.contains(pill)) {
        return;
      }
      if (showTooltip) {
        showJobResourceTooltip(pill);
        return;
      }
      const related = event.relatedTarget;
      if (related) {
        if (typeof related.closest === "function") {
          const relatedPill = related.closest("[data-job-resource-pill]");
          if (relatedPill === pill) {
            return;
          }
        } else if (pill.contains(related)) {
          return;
        }
      }
      if (tooltipTarget === pill) {
        hideJobResourceTooltip();
      }
    };
  }

  function handleGlobalScroll() {
    if (tooltipTarget) {
      hideJobResourceTooltip(true);
    }
    scheduleVillageOverlayUpdate();
  }

  function updateJobsCount() {
    const assigned = getTotalAssigned();
    const total = state.population.current || 0;
    const providedAvailable = Number(state.population.available);
    const fallbackAvailable = Math.max(0, Math.min(total, total - assigned));
    const nextAvailable = Number.isFinite(providedAvailable)
      ? Math.max(0, Math.min(total, Math.floor(providedAvailable)))
      : fallbackAvailable;
    state.population.available = nextAvailable;
    jobsCountLabel.textContent = `${assigned}/${total}`;
    updateChips();
  }

  async function buildStructure(buildingId) {
    const building = findBuildingById(buildingId);
    const entry = buildingElementMap.get(resolveBuildingElementKey(buildingId));
    if (entry && entry.buildButton) {
      entry.buildButton.dataset.state = "pending";
      syncAriaDisabled(entry.buildButton, true);
    }
    if (entry) {
      setWorkerFeedback(entry, null);
    }

    const endpoint = `/api/buildings/${encodeURIComponent(buildingId)}/build`;
    if (typeof fetch !== "function") {
      if (entry && entry.buildButton) {
        delete entry.buildButton.dataset.state;
        updateBuildButton(entry, building || findBuildingById(buildingId));
        updateDemolishButton(entry, building || findBuildingById(buildingId));
      }
      return false;
    }

    let payload = null;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      payload = response ? await response.json() : null;
    } catch (error) {
      payload = null;
    }

    if (!payload || payload.ok !== true) {
      if (payload && payload.error === "INSUFFICIENT_RESOURCES") {
        if (entry) {
          setWorkerFeedback(entry, "Requires 1 Wood", { variant: "warning" });
        }
      } else if (entry) {
        const message =
          payload && typeof payload.error_message === "string"
            ? payload.error_message
            : "Unable to build";
        setWorkerFeedback(entry, message, { variant: "error" });
      }
      if (entry && entry.buildButton) {
        delete entry.buildButton.dataset.state;
        const latest = building || findBuildingById(buildingId);
        updateBuildButton(entry, latest);
        updateDemolishButton(entry, latest);
      }
      return false;
    }

    if (entry) {
      setWorkerFeedback(entry, null);
    }

    if (payload.state) {
      applyPublicState(payload.state);
    }
    updateBuildingsFromPayload(payload);

    if (entry && entry.buildButton) {
      delete entry.buildButton.dataset.state;
      const latest = findBuildingById(buildingId) || building;
      updateBuildButton(entry, latest);
      updateDemolishButton(entry, latest);
    }

    return true;
  }

  async function demolishStructure(buildingId) {
    const building = findBuildingById(buildingId);
    const entry = buildingElementMap.get(resolveBuildingElementKey(buildingId));
    if (entry && entry.demolishButton) {
      entry.demolishButton.dataset.state = "pending";
      syncAriaDisabled(entry.demolishButton, true);
    }
    if (entry) {
      setWorkerFeedback(entry, null);
    }

    const endpoint = `/api/buildings/${encodeURIComponent(buildingId)}/demolish`;
    if (typeof fetch !== "function") {
      if (entry && entry.demolishButton) {
        delete entry.demolishButton.dataset.state;
        const latest = building || findBuildingById(buildingId);
        updateDemolishButton(entry, latest);
        updateBuildButton(entry, latest);
      }
      return false;
    }

    let payload = null;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      payload = response ? await response.json() : null;
    } catch (error) {
      payload = null;
    }

    if (!payload || payload.ok !== true) {
      if (entry) {
        if (payload && payload.error === "NOTHING_TO_DEMOLISH") {
          setWorkerFeedback(entry, "Nothing to demolish", { variant: "warning" });
        } else {
          const message =
            payload && typeof payload.error_message === "string"
              ? payload.error_message
              : "Unable to demolish";
          setWorkerFeedback(entry, message, { variant: "error" });
        }
      }
      if (entry && entry.demolishButton) {
        delete entry.demolishButton.dataset.state;
        const latest = building || findBuildingById(buildingId);
        updateDemolishButton(entry, latest);
        updateBuildButton(entry, latest);
      }
      return false;
    }

    if (entry) {
      setWorkerFeedback(entry, null);
    }

    if (payload.state) {
      applyPublicState(payload.state);
    }
    updateBuildingsFromPayload(payload);

    if (entry && entry.demolishButton) {
      delete entry.demolishButton.dataset.state;
      const latest = findBuildingById(buildingId) || building;
      updateDemolishButton(entry, latest);
      updateBuildButton(entry, latest);
    }

    return true;
  }

  async function assignBuildingWorkers(buildingId, requested) {
    const building = findBuildingById(buildingId);
    if (!building) {
      return false;
    }

    const capacity = getCapacity(building);
    const requestedNumber = Number(requested);
    const sanitized = Math.max(
      0,
      Math.min(
        capacity,
        Number.isFinite(requestedNumber) ? Math.floor(requestedNumber) : 0
      )
    );

    const current = getBuildingAssignedWorkers(building);

    const normalizedId = String(building.id);
    const endpoint = `/api/buildings/${encodeURIComponent(normalizedId)}/workers`;
    const entry = buildingElementMap.get(resolveBuildingElementKey(normalizedId));
    if (entry) {
      setWorkerFeedback(entry, null);
    }
    if (sanitized === current) {
      if (entry) {
        updateWorkerControls(entry, building);
      }
      return true;
    }
    const delta = sanitized - current;
    const amount = Math.abs(delta);
    if (amount <= 0) {
      if (entry) {
        updateWorkerControls(entry, building);
      }
      return true;
    }

    setWorkerRequestPending(normalizedId, true);
    if (entry) {
      setWorkerFeedback(entry, "Sincronizando con el servidor…", {
        variant: "info",
        state: "syncing",
      });
    }

    let payload = null;
    let responseStatus = null;
    let responseRequestId = null;
    let syncingCleared = false;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ delta }),
      });
      responseStatus = response ? response.status : null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }
      if (payload && typeof payload === "object") {
        const requestIdValue = payload.request_id || payload.requestId;
        if (typeof requestIdValue === "string" && requestIdValue) {
          responseRequestId = requestIdValue;
        }
      }
      const success = Boolean(response && response.ok && payload && payload.ok);
      if (!success) {
        const message =
          (payload &&
            (payload.error_message || payload.error || payload.message)) ||
          "No se pudo actualizar la asignación";
        if (entry) {
          setWorkerFeedback(entry, message, { variant: "error" });
        }
        if (
          payload &&
          typeof payload.error_message === "string" &&
          typeof console !== "undefined" &&
          typeof console.warn === "function"
        ) {
          console.warn("[Idle Village]", payload.error_message);
        }
        return false;
      }
      if (payload.state) {
        applyPublicState(payload.state);
      }
      if (payload.building) {
        updateBuildingsFromPayload({ buildings: [payload.building] });
      }
      const assignedValue = Number(payload.assigned);
      if (Number.isFinite(assignedValue)) {
        building.active = assignedValue;
        building.active_workers = assignedValue;
        building.workers = assignedValue;
      }
      if (entry) {
        setWorkerFeedback(entry, null);
        syncingCleared = true;
      }
      return true;
    } catch (error) {
      if (entry) {
        setWorkerFeedback(entry, "Error al contactar al servidor", {
          variant: "error",
        });
      }
      if (typeof console !== "undefined" && typeof console.error === "function") {
        console.error("[Idle Village] Error asignando trabajadores", error);
      }
      return false;
    } finally {
      if (
        entry &&
        entry.workerFeedback &&
        entry.workerFeedback.dataset.state === "syncing"
      ) {
        setWorkerFeedback(entry, null);
        syncingCleared = true;
      }
      setWorkerRequestPending(normalizedId, false);
      if (entry) {
        updateWorkerControls(entry, building);
      }
      const clearedState =
        syncingCleared ||
        !entry ||
        !entry.workerFeedback ||
        entry.workerFeedback.hidden === true ||
        entry.workerFeedback.dataset.state !== "syncing";
      logWorkerAction({
        action: delta > 0 ? "+" : "-",
        url: endpoint,
        status: responseStatus,
        requestId: responseRequestId,
        syncingCleared: clearedState,
      });
    }
  }

  function adjustTrade(itemId, changes) {
    void itemId;
    void changes;
    return false;
  }

  async function handleBuildingActions(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, buildingId } = button.dataset;
    if (!buildingId) return;
    if (action === "build") {
      event.preventDefault();
      await buildStructure(buildingId);
      return;
    } else if (action === "demolish") {
      event.preventDefault();
      await demolishStructure(buildingId);
    } else if (action === "toggle-details") {
      event.preventDefault();
      toggleBuildingDetails(buildingId);
      return;
    } else if (action === "toggle-favorite") {
      event.preventDefault();
      toggleFavorite(buildingId);
      return;
    } else if (action === "worker-increment" || action === "worker-decrement") {
      const building = findBuildingById(buildingId);
      if (!building) return;
      const delta = action === "worker-increment" ? 1 : -1;
      const desired = (Number(building.active) || 0) + delta;
      await assignBuildingWorkers(buildingId, desired);
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
    const building = findBuildingById(buildingId);
    if (!building) return;
    const capacity = getCapacity(building);
    const sanitized = Math.max(0, Math.min(capacity, Number.isFinite(value) ? value : 0));
    input.value = sanitized;
  }

  function handleFilterClick(event) {
    const categoryButton = event.target.closest("[data-filter-category]");
    if (categoryButton) {
      const ui = getBuildingUiState();
      const value = categoryButton.dataset.filterCategory || "all";
      ui.filters.category = value;
      saveState();
      renderBuildings();
      return;
    }

    const levelButton = event.target.closest("[data-filter-level]");
    if (levelButton) {
      const ui = getBuildingUiState();
      const raw = levelButton.dataset.filterLevel;
      if (!raw) {
        ui.filters.level = null;
      } else {
        const numeric = Number(raw);
        ui.filters.level = Number.isFinite(numeric)
          ? Math.max(1, Math.min(5, Math.round(numeric)))
          : null;
      }
      saveState();
      renderBuildings();
      return;
    }

    const statusButton = event.target.closest("[data-filter-status]");
    if (statusButton) {
      const key = statusButton.dataset.filterStatus;
      if (key) {
        const ui = getBuildingUiState();
        ui.filters.status[key] = !ui.filters.status[key];
        saveState();
        renderBuildings();
      }
      return;
    }

    const obsoleteButton = event.target.closest("[data-filter-obsolete]");
    if (obsoleteButton) {
      const ui = getBuildingUiState();
      ui.filters.showObsolete = !ui.filters.showObsolete;
      saveState();
      renderBuildings();
      return;
    }
  }

  function handleDensityToggle(event) {
    const button = event.target.closest("[data-density]");
    if (!button) {
      return;
    }
    const ui = getBuildingUiState();
    const mode = button.dataset.density === "detailed" ? "detailed" : "compact";
    if (ui.density === mode) {
      return;
    }
    ui.density = mode;
    saveState();
    renderBuildings();
  }

  function handleSortChange(event) {
    const select = event.target;
    if (!select || select !== sortSelect) {
      return;
    }
    const ui = getBuildingUiState();
    const value = String(select.value || "efficiency");
    ui.sort = value;
    saveState();
    renderBuildings();
  }

  async function handleJobActions(event) {
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
    if (action === "job-increment" || action === "job-decrement") {
      event.preventDefault();
      return;
    }
  }

  function handleJobInput(event) {
    const input = event.target;
    if (!input.matches("input[data-job-input]")) return;
    const jobId = input.dataset.jobInput;
    const job = state.jobs.find((candidate) => candidate.id === jobId);
    if (job) {
      input.value = String(job.assigned);
    } else {
      input.value = "0";
    }
  }

  function handleTradeActions(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    event.preventDefault();
    renderTrade();
    return;
  }

  function handleTradeInputs(event) {
    const target = event.target;
    const shouldReset =
      target.matches("input[data-trade-slider]") ||
      target.matches("input[data-trade-import-slider]") ||
      target.matches("input[data-trade-input]");
    if (!shouldReset) {
      return;
    }
    event.preventDefault();
    renderTrade();
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

  function escapeSelectorValue(value) {
    const stringValue = String(value);
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(stringValue);
    }
    return stringValue.replace(/"/g, '\\"');
  }

  function parseNumericText(text) {
    if (typeof text !== "string") {
      return null;
    }
    const cleaned = text.replace(/\s+/g, "");
    const match = cleaned.match(/-?\d+(?:[.,]\d+)?/);
    if (!match) {
      return null;
    }
    const normalized = match[0].replace(/,(?=\d{3}(?:[^\d]|$))/g, "").replace(",", ".");
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function extractChipNumber(resourceKey) {
    if (typeof document === "undefined") {
      return null;
    }
    const escaped = escapeSelectorValue(resourceKey);
    const baseSelector = `.chip[data-resource="${escaped}"]`;
    const valueElement =
      document.querySelector(`${baseSelector} .value`) ||
      document.querySelector(baseSelector);
    if (!valueElement) {
      return null;
    }
    return parseNumericText(valueElement.textContent || "");
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForCondition(predicate, options = {}) {
    if (typeof predicate !== "function") {
      throw new Error("Predicate must be a function");
    }
    const { timeout = 3000, interval = 50, description = "condición" } = options;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = predicate();
      if (result) {
        return result;
      }
      await delay(interval);
    }
    throw new Error(`Timeout esperando ${description}`);
  }

  async function runVerifyCheck(key, executor) {
    if (!verifyState.enabled) {
      return null;
    }
    try {
      const detail = await executor();
      updateVerifyCheck(key, true, detail);
      return detail;
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      updateVerifyCheck(key, false, message);
      pushVerifyLog("check-error", { key, message });
      throw error;
    }
  }

  function updateResourcesFromPayload(payload) {
    if (!payload || typeof payload !== "object" || payload === null) {
      return false;
    }
    let changed = false;

    const applyResource = (key, value) => {
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
    };

    if (payload.resources && typeof payload.resources === "object") {
      Object.entries(payload.resources).forEach(([key, value]) => {
        applyResource(key, value);
      });
    }

    if (payload.items && typeof payload.items === "object") {
      Object.entries(payload.items).forEach(([key, value]) => {
        applyResource(key, value);
      });
    }

    if (payload.inventory && typeof payload.inventory === "object") {
      Object.entries(payload.inventory).forEach(([key, value]) => {
        if (!value || typeof value !== "object") {
          return;
        }
        if ("amount" in value) {
          applyResource(key, value.amount);
        }
      });
    }

    if (payload.population && typeof payload.population === "object") {
      const nextPopulation = normalisePopulation(payload.population);
      if (
        state.population.current !== nextPopulation.current ||
        state.population.capacity !== nextPopulation.capacity ||
        state.population.available !== nextPopulation.available
      ) {
        state.population.current = nextPopulation.current;
        state.population.capacity = nextPopulation.capacity;
        state.population.total = nextPopulation.current;
        state.population.available = nextPopulation.available;
        changed = true;
      }
    }

    if (changed) {
      renderVillageHud();
    }

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
    let jobMetadataChanged = false;

    remoteBuildings.forEach((remote) => {
      const remoteKey = remote.type || remote.id || remote.name;
      if (!remoteKey) {
        return;
      }
      const matchIndex = state.buildings.findIndex((local) => {
        const localKey = local.type || local.id || local.name;
        return localKey === remoteKey;
      });
      if (matchIndex === -1) {
        state.buildings.push(remote);
        buildingsUpdated = true;
        if (ensureJobEntryFromBuilding(remote)) {
          jobMetadataChanged = true;
        }
        return;
      }

      const match = state.buildings[matchIndex];
      match.inputs = remote.inputs;
      match.outputs = remote.outputs;
      match.storage = remote.storage;
      match.cost = remote.cost;
      match.can_produce = remote.can_produce;
      match.reason = remote.reason;
      match.effective_rate = remote.effective_rate;
      match.pending_eta = remote.pending_eta;
      match.last_report = remote.last_report;
      match.cycle_time = remote.cycle_time;
      if (remote.production_report) {
        match.production_report = remote.production_report;
      } else if (remote.last_report) {
        match.production_report = remote.last_report;
      }
      if (typeof remote.status === "string") {
        match.status = remote.status;
      }
      if (typeof remote.enabled === "boolean") {
        match.enabled = remote.enabled;
      }

      const assignIfChanged = (key, value, transform) => {
        if (value === undefined) {
          return false;
        }
        const nextValue = typeof transform === "function" ? transform(value) : value;
        if (JSON.stringify(match[key]) !== JSON.stringify(nextValue)) {
          match[key] = nextValue;
          return true;
        }
        return false;
      };

      let metadataChanged = false;
      metadataChanged =
        assignIfChanged("name", remote.name) || metadataChanged;
      metadataChanged =
        assignIfChanged("category", remote.category) || metadataChanged;
      metadataChanged =
        assignIfChanged("category_label", remote.category_label) || metadataChanged;
      metadataChanged = assignIfChanged("icon", remote.icon) || metadataChanged;
      metadataChanged = assignIfChanged("job", remote.job) || metadataChanged;
      metadataChanged =
        assignIfChanged("job_name", remote.job_name) || metadataChanged;
      metadataChanged =
        assignIfChanged("job_icon", remote.job_icon) || metadataChanged;
      metadataChanged =
        assignIfChanged("build_label", remote.build_label) || metadataChanged;
      metadataChanged =
        assignIfChanged(
          "per_worker_output_rate",
          remote.per_worker_output_rate,
          (value) => ({ ...value })
        ) || metadataChanged;
      metadataChanged =
        assignIfChanged(
          "per_worker_input_rate",
          remote.per_worker_input_rate,
          (value) => ({ ...value })
        ) || metadataChanged;

      const nextBuilt = Number(remote.built);
      if (Number.isFinite(nextBuilt) && match.built !== nextBuilt) {
        match.built = Math.max(0, nextBuilt);
        buildingsUpdated = true;
      }

      const nextCapacity = Number(remote.capacityPerBuilding);
      if (Number.isFinite(nextCapacity) && nextCapacity > 0 && match.capacityPerBuilding !== nextCapacity) {
        match.capacityPerBuilding = nextCapacity;
        buildingsUpdated = true;
      }

      const nextMaxWorkers = Number(remote.max_workers);
      if (Number.isFinite(nextMaxWorkers) && nextMaxWorkers > 0 && match.max_workers !== nextMaxWorkers) {
        match.max_workers = nextMaxWorkers;
        buildingsUpdated = true;
      }

      const candidates = [remote.active, remote.workers, remote.active_workers];
      const resolvedActive = candidates.reduce((value, candidate) => {
        if (value !== null) {
          return value;
        }
        const numeric = Number(candidate);
        if (Number.isFinite(numeric)) {
          return numeric;
        }
        return null;
      }, null);

      if (resolvedActive !== null) {
        const safeActive = Math.max(0, Math.floor(resolvedActive));
        match.active = safeActive;
        match.active_workers = safeActive;
        match.workers = safeActive;
        match.assigned_workers = safeActive;
      }

      if (metadataChanged) {
        buildingsUpdated = true;
      }
      if (ensureJobEntryFromBuilding(match)) {
        jobMetadataChanged = true;
      }
    });

    if (buildingsUpdated || jobMetadataChanged) {
      renderBuildings();
      const additionalJobChanges = ensureJobsForAllBuildings();
      if (additionalJobChanges) {
        jobMetadataChanged = true;
      }
      if (jobMetadataChanged) {
        renderJobs();
      }
      updateJobsCount();
      saveState();
      logState();
      return true;
    }

    if (resourcesUpdated) {
      renderBuildings();
      const additionalJobChanges = ensureJobsForAllBuildings();
      if (additionalJobChanges) {
        renderJobs();
      }
      updateChips();
      saveState();
      logState();
      return true;
    }

    return false;
  }

  function applyBuildingsFromPublicPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return false;
    }
    const buildings = payload.buildings;
    if (!buildings || typeof buildings !== "object") {
      return false;
    }
    const woodcutterSnapshot =
      buildings.woodcutter_camp || buildings.woodcutterCamp || buildings.forester;
    if (!woodcutterSnapshot || typeof woodcutterSnapshot !== "object") {
      return false;
    }
    const building = state.buildings.find(
      (entry) => entry.type === "woodcutter_camp" || entry.id === "woodcutter_camp"
    );
    if (!building) {
      return false;
    }
    let changed = false;
    const builtValue = Number(woodcutterSnapshot.built);
    if (Number.isFinite(builtValue) && building.built !== builtValue) {
      building.built = builtValue;
      changed = true;
    }
    const workerValue = Number(woodcutterSnapshot.workers);
    const activeValue = Number.isFinite(workerValue)
      ? workerValue
      : Number(woodcutterSnapshot.active);
    if (Number.isFinite(activeValue)) {
      if (building.active !== activeValue) {
        building.active = activeValue;
        changed = true;
      }
      building.active_workers = activeValue;
      building.workers = activeValue;
    }
    const capacityValue = Number(woodcutterSnapshot.capacity);
    if (Number.isFinite(capacityValue) && building.capacityPerBuilding !== capacityValue) {
      building.capacityPerBuilding = capacityValue;
      changed = true;
    }
    if (changed) {
      const entry = buildingElementMap.get(building.id);
      if (entry) {
        updateBuildingCard(entry, building);
      } else {
        renderBuildings();
      }
    }
    return changed;
  }

  function applyJobsFromPublicPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return false;
    }
    const jobs = payload.jobs;
    if (!jobs || typeof jobs !== "object") {
      return false;
    }
    let changed = false;
    let requireRender = false;

    const processEntry = (jobId, info) => {
      if (!jobId) {
        return;
      }
      const building = state.buildings.find((candidate) => candidate.job === jobId);
      if (building) {
        if (ensureJobEntryFromBuilding(building)) {
          changed = true;
          requireRender = true;
        }
      }
      const job = state.jobs.find((candidate) => candidate.id === jobId);
      if (!job) {
        return;
      }
      const assignedValue = Number(
        info.assigned !== undefined ? info.assigned : info.workers
      );
      if (Number.isFinite(assignedValue) && job.assigned !== assignedValue) {
        job.assigned = assignedValue;
        changed = true;
      }
      const capacityValue = Number(
        info.max !== undefined ? info.max : info.capacity
      );
      if (Number.isFinite(capacityValue) && job.max !== capacityValue) {
        job.max = capacityValue;
        changed = true;
      }
      if (Number.isFinite(assignedValue) || Number.isFinite(capacityValue)) {
        updateJobCard(job);
      }
    };

    if (Array.isArray(jobs)) {
      jobs.forEach((entry) => {
        const jobId =
          entry && typeof entry.id === "string"
            ? entry.id
            : entry && typeof entry.job === "string"
            ? entry.job
            : null;
        processEntry(jobId, entry || {});
      });
    } else {
      const buildingAssignments =
        jobs.buildings && typeof jobs.buildings === "object"
          ? Object.entries(jobs.buildings)
          : [];
      buildingAssignments.forEach(([buildingId, value]) => {
        const info = value || {};
        const building = state.buildings.find(
          (candidate) =>
            candidate.id === buildingId || candidate.type === buildingId
        );
        const jobId =
          building && typeof building.job === "string"
            ? building.job
            : typeof info.id === "string"
            ? info.id
            : null;
        if (building && ensureJobEntryFromBuilding(building)) {
          changed = true;
          requireRender = true;
        }
        processEntry(jobId, info);
      });

      Object.entries(jobs).forEach(([key, value]) => {
        if (key === "available_workers" || key === "total_workers" || key === "buildings") {
          return;
        }
        const entry = value || {};
        const jobId =
          typeof entry.id === "string"
            ? entry.id
            : typeof entry.job === "string"
            ? entry.job
            : key;
        processEntry(jobId, entry);
      });

      const availableValue = Number(jobs.available_workers);
      if (Number.isFinite(availableValue)) {
        state.population.available = Math.max(0, Math.floor(availableValue));
        changed = true;
      }
      const totalValue = Number(jobs.total_workers);
      if (Number.isFinite(totalValue)) {
        const totalWorkers = Math.max(0, Math.floor(totalValue));
        state.population.current = totalWorkers;
        state.population.total = totalWorkers;
        if (!Number.isFinite(state.population.capacity) || state.population.capacity < totalWorkers) {
          state.population.capacity = totalWorkers;
        }
        changed = true;
      }
    }

    if (requireRender) {
      renderJobs();
    }
    return changed || requireRender;
  }

  function applyPublicState(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const freshness = evaluatePayloadFreshness(payload);
    if (!freshness.accept) {
      return null;
    }
    const resourcesChanged = updateResourcesFromPayload(payload);
    const buildingsChanged = applyBuildingsFromPublicPayload(payload);
    const jobsChanged = applyJobsFromPublicPayload(payload);

    if (resourcesChanged) {
      updateChips();
    }
    if (jobsChanged || buildingsChanged) {
      updateJobsCount();
    }
    if (resourcesChanged || jobsChanged || buildingsChanged) {
      saveState();
      logState();
    }

    if (payload.items && payload.items.wood !== undefined) {
      const woodAmount = Number(payload.items.wood);
      if (Number.isFinite(woodAmount)) {
        return woodAmount;
      }
    }
    return null;
  }

  function applyServerSnapshot(payload, options = {}) {
    if (!payload || typeof payload !== "object") {
      return false;
    }
    const { persist = false } = options;
    const freshness = evaluatePayloadFreshness(payload);
    if (!freshness.accept) {
      return false;
    }
    if (payload.season) {
      updateSeasonState(payload.season);
    }
    const updated = updateBuildingsFromPayload(payload);
    if (persist && !updated) {
      saveState();
      logState();
    }
    return updated;
  }

  async function loadSeasonFromStateEndpoint() {
    const payload = await fetchJson("/api/state");
    if (verifyState.enabled) {
      pushVerifyLog("season-sync:state-response", payload);
    }
    if (!payload) {
      return false;
    }
    if (payload.season) {
      updateSeasonState(payload.season);
    }
    updateBuildingsFromPayload(payload);
    return Boolean(payload.season);
  }

  async function runVerifySuite() {
    if (!verifyState.enabled) {
      return;
    }

    pushVerifyLog("suite-start", { shouldForceReset, hasPersistedState });
    verifyState.latestResources = null;

    const safeRun = async (key, executor) => {
      try {
        return await runVerifyCheck(key, executor);
      } catch (error) {
        return null;
      }
    };

    try {
      await waitForCondition(
        () =>
          typeof document !== "undefined" &&
          document.querySelectorAll(".chip[data-resource]").length > 0,
        { timeout: 3000, description: "primer render de recursos" }
      );
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      updateVerifyCheck("initialResources", false, message);
      pushVerifyLog("suite-wait-chips-error", { message });
    }

    await safeRun("initialResources", () => {
      if (typeof document === "undefined") {
        throw new Error("Documento no disponible");
      }
      const chips = Array.from(
        document.querySelectorAll(".chip[data-resource]")
      );
      if (!chips.length) {
        throw new Error("No se encontraron chips de recursos");
      }
      const snapshot = chips.map((chip) => {
        const resource = chip.getAttribute("data-resource") || "";
        const valueElement = chip.querySelector(".value") || chip;
        const raw = valueElement.textContent || "";
        const numeric = parseNumericText(raw);
        return { resource, raw, numeric };
      });
      pushVerifyLog("initial-resources", snapshot);
      const nonZero = snapshot.filter(
        (entry) => entry.numeric === null || Math.abs(entry.numeric) > 1e-6
      );
      if (nonZero.length > 0) {
        const labels = nonZero
          .map((entry) => entry.resource || entry.raw.trim())
          .filter(Boolean);
        throw new Error(`Valores distintos de 0: ${labels.join(", ")}`);
      }
      return "Todos los recursos visibles muestran 0";
    });

    await safeRun("woodcutterVisible", () => {
      if (typeof document === "undefined") {
        throw new Error("Documento no disponible");
      }
      const allCards = Array.from(
        document.querySelectorAll("[data-category] .building-card")
      );
      const visibleCards = allCards.filter((card) => {
        if (!card) {
          return false;
        }
        const rect = card.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const cards = visibleCards.length ? visibleCards : allCards;
      if (cards.length !== 1) {
        throw new Error(
          `Se esperaba 1 edificio visible, se encontraron ${cards.length}`
        );
      }
      const card = cards[0];
      const nameNode = card.querySelector("h3");
      const name = nameNode ? nameNode.textContent.trim() : "";
      const workerInput = card.querySelector("input[data-building-input]");
      const workers = workerInput ? Number(workerInput.value) : NaN;
      pushVerifyLog("woodcutter-visible", { name, workers });
      if (!name || name.toLowerCase().indexOf("woodcutter") === -1) {
        throw new Error(`Edificio visible inesperado: ${name || "desconocido"}`);
      }
      if (!Number.isFinite(workers) || Math.abs(workers - 1) > 1e-6) {
        throw new Error(`Trabajadores esperados 1, observado ${workers}`);
      }
      return `${name} con ${workers} trabajadores`;
    });

    let woodCheckPassed = false;

    await safeRun("woodGain", async () => {
      const findWoodcutter = () =>
        state.buildings.find((entry) => {
          if (!entry) return false;
          const type = (entry.type || entry.id || "").toString().toLowerCase();
          const name = (entry.name || "").toString().toLowerCase();
          return type.includes("woodcutter") || name.includes("woodcutter");
        });

      let building = findWoodcutter();
      if (!building || typeof building.id !== "string") {
        const refreshed = await fetchJson("/api/state");
        pushVerifyLog("woodGain-refresh", refreshed);
        if (refreshed) {
          updateBuildingsFromPayload(refreshed);
          if (refreshed.resources) {
            updateResourcesFromPayload(refreshed);
          }
          building = findWoodcutter();
        }
      }

      if (!building || typeof building.id !== "string") {
        throw new Error("No se encontró Woodcutter Camp con un ID válido");
      }

      pushVerifyLog("assign-worker-request", { buildingId: building.id });
      const assignResponse = await fetch(`/api/buildings/${encodeURIComponent(building.id)}/workers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta: 1 }),
      });
      let assignPayload = null;
      try {
        assignPayload = assignResponse ? await assignResponse.json() : null;
      } catch (error) {
        assignPayload = null;
      }
      pushVerifyLog("assign-worker-response", assignPayload);
      if (!assignResponse || !assignResponse.ok || !assignPayload || assignPayload.ok !== true) {
        throw new Error("La asignación de trabajadores no fue exitosa");
      }
      if (assignPayload.state) {
        applyPublicState(assignPayload.state);
      }
      if (assignPayload.building) {
        updateBuildingsFromPayload({ buildings: [assignPayload.building] });
      }

      let latestPayload = null;
      for (let index = 0; index < 10; index += 1) {
        const tickPayload = await fetchJson("/api/tick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dt: 1 }),
        });
        pushVerifyLog("tick", { index: index + 1, payload: tickPayload });
        if (!tickPayload || tickPayload.ok !== true) {
          throw new Error(`Tick ${index + 1} falló`);
        }
        latestPayload = tickPayload;
        applyServerSnapshot(tickPayload);
      }

      verifyState.latestResources = latestPayload ? latestPayload.resources || null : null;

      try {
        await waitForCondition(
          () => {
            const value = extractChipNumber("wood");
            return value !== null && value >= 0.99;
          },
          { timeout: 2000, description: "actualización de Wood" }
        );
      } catch (error) {
        pushVerifyLog("wood-value-wait-error", {
          message: error && error.message ? error.message : String(error),
        });
      }

      const woodValue = extractChipNumber("wood");
      if (woodValue === null) {
        throw new Error("No se pudo leer el valor del chip de Wood");
      }
      if (Math.abs(woodValue - 1) > 0.01) {
        throw new Error(`Wood esperado ≈1.0, observado ${woodValue.toFixed(2)}`);
      }
      woodCheckPassed = true;
      return `Wood observado ${woodValue.toFixed(2)}`;
    });

    await safeRun("otherResourcesZero", () => {
      const resourcesSnapshot = verifyState.latestResources;
      if (resourcesSnapshot && Object.keys(resourcesSnapshot).length > 0) {
        const offenders = Object.entries(resourcesSnapshot).filter(
          ([key, value]) => {
            if (typeof key !== "string") {
              return false;
            }
            if (key.toLowerCase() === "wood") {
              return false;
            }
            const numeric = Number(value);
            return Number.isFinite(numeric) && Math.abs(numeric) > 1e-6;
          }
        );
        if (offenders.length > 0) {
          throw new Error(
            `Recursos distintos de 0: ${offenders
              .map(([key, value]) => `${key}:${value}`)
              .join(", ")}`
          );
        }
        return "El snapshot remoto mantiene los recursos en 0";
      }

      const stateEntries = state && state.resources ? Object.entries(state.resources) : [];
      if (!stateEntries.length) {
        throw new Error("No hay recursos en el estado local para validar");
      }
      const offenders = stateEntries.filter(([key, value]) => {
        if (key === "wood") {
          return false;
        }
        const numeric = Number(value);
        return Number.isFinite(numeric) && Math.abs(numeric) > 1e-6;
      });
      if (offenders.length > 0) {
        throw new Error(
          `Estado local con recursos distintos de 0: ${offenders
            .map(([key, value]) => `${key}:${value}`)
            .join(", ")}`
        );
      }
      return "Los recursos locales permanecen en 0";
    });

    if (!woodCheckPassed) {
      pushVerifyLog("suite-warning", {
        message: "No se pudo validar la producción de Wood",
      });
    }

    pushVerifyLog("suite-complete", { woodCheckPassed });
  }

  async function initialiseSeasonSync() {
    if (verifyState.enabled) {
      pushVerifyLog("season-sync:start", {
        shouldForceReset,
        hasPersistedState,
      });
    }
    if (shouldForceReset || !hasPersistedState) {
      if (verifyState.enabled) {
        pushVerifyLog("season-sync:force-init", {
          reason: shouldForceReset ? "query" : "no-cache",
        });
      }
      const initPayload = await fetchJson("/api/init?reset=1", { method: "POST" });
      if (verifyState.enabled) {
        pushVerifyLog("season-sync:force-init-response", initPayload);
      }
      if (initPayload) {
        applyServerSnapshot(initPayload, { persist: true });
      }
    }

    const loaded = await loadSeasonFromStateEndpoint();
    if (verifyState.enabled) {
      pushVerifyLog("season-sync:state-loaded", { loaded });
    }
    if (loaded) {
      return;
    }

    const initPayload = await fetchJson("/api/init", { method: "POST" });
    if (verifyState.enabled) {
      pushVerifyLog("season-sync:init-response", initPayload);
    }
    if (initPayload) {
      applyServerSnapshot(initPayload, { persist: !hasPersistedState });
    }
    const finalLoad = await loadSeasonFromStateEndpoint();
    if (verifyState.enabled) {
      pushVerifyLog("season-sync:state-final", { loaded: finalLoad });
    }
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

  const globalScope =
    (typeof window !== "undefined" && window) ||
    (typeof globalThis !== "undefined" ? globalThis : null);
  let woodPollingIntervalId =
    (globalScope && globalScope.__idleVillageWoodPollingInterval) || null;

  function startWoodPolling() {
    if (typeof fetch !== "function") return;
    if (woodPollingIntervalId !== null) {
      return;
    }
    const woodValueElement = document.querySelector(
      '.chip[data-resource="wood"] .value'
    );
    if (!woodValueElement) return;

    const updateWood = async () => {
      try {
        const response = await fetch(`/state?t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response || !response.ok) {
          if (typeof console !== "undefined" && typeof console.error === "function") {
            console.error(
              "[Idle Village] No se pudo obtener /state para Wood",
              response ? response.status : "sin respuesta"
            );
          }
          return;
        }
        const payload = await response.json();
        if (!payload) {
          return;
        }
        const woodAmount = applyPublicState(payload);
        const numeric = Number.isFinite(woodAmount)
          ? woodAmount
          : Number(state.resources && state.resources.wood);
        const formatted = Number.isFinite(numeric)
          ? Number(numeric).toFixed(1).replace(".", ",")
          : "0,0";
        woodValueElement.textContent = formatted;
      } catch (error) {
        if (typeof console !== "undefined" && typeof console.error === "function") {
          console.error("[Idle Village] Error consultando /state", error);
        }
      }
    };

    updateWood();
    woodPollingIntervalId = setInterval(updateWood, 1000);
    if (globalScope) {
      globalScope.__idleVillageWoodPollingInterval = woodPollingIntervalId;
    }
  }

  function attachViewNavigation() {
    viewTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const targetView = tab.dataset.viewTab;
        if (targetView) {
          setActiveView(targetView);
        }
      });
      tab.addEventListener("keydown", (event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          const targetView = tab.dataset.viewTab;
          if (targetView) {
            setActiveView(targetView);
          }
        }
      });
    });

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", (event) => {
        if (event.defaultPrevented) {
          return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }
        if (isEditableElement(event.target)) {
          return;
        }
        const viewKey = viewHotkeys[event.code];
        if (!viewKey) {
          return;
        }
        event.preventDefault();
        setActiveView(viewKey);
        focusActiveViewTab();
      });
    }
  }

  function attachAccordion() {
    const accordions = Array.from(document.querySelectorAll(".accordion"));
    if (!accordions.length) {
      return;
    }

    const applyDefaults = () => {
      const isMobile =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 48rem)").matches;
      if (isMobile) {
        accordions.forEach((accordion) => {
          accordion.classList.remove("open");
        });
        return;
      }
      const alreadyOpen = accordions.some((accordion) =>
        accordion.classList.contains("open")
      );
      if (!alreadyOpen && accordions[0]) {
        accordions[0].classList.add("open");
      }
    };

    accordions.forEach((accordion) => {
      const trigger = accordion.querySelector(".accordion-trigger");
      if (!trigger) {
        return;
      }
      trigger.addEventListener("click", () => {
        const isOpen = accordion.classList.contains("open");
        accordions.forEach((other) => {
          if (other !== accordion) {
            other.classList.remove("open");
          }
        });
        accordion.classList.toggle("open", !isOpen);
      });
    });

    applyDefaults();

    if (typeof window !== "undefined") {
      window.addEventListener("resize", applyDefaults);
    }
  }

  const jobResourceTooltipShowHandler = createJobResourceTooltipHandler("show");
  const jobResourceTooltipHideHandler = createJobResourceTooltipHandler("hide");

  attachViewNavigation();
  setActiveView(viewState.active, { force: true });

  if (buildingGrid) {
    buildingGrid.addEventListener("click", handleBuildingActions);
    buildingGrid.addEventListener("change", handleBuildingInput);
  }
  if (buildingFiltersRoot) {
    buildingFiltersRoot.addEventListener("click", handleFilterClick);
  }
  if (densityToggle) {
    densityToggle.addEventListener("click", handleDensityToggle);
  }
  if (sortSelect) {
    sortSelect.addEventListener("change", handleSortChange);
  }
  if (stackedRoot) {
    stackedRoot.addEventListener("click", handleStackedAction);
  }
  if (stackedControls) {
    stackedControls.addEventListener("change", handleStackedFilterChange);
    stackedControls.addEventListener("input", handleStackedFilterChange);
  }
  if (stackedViewToggle) {
    stackedViewToggle.addEventListener("click", handleStackedViewClick);
  }
  if (stackedFlagCheckbox) {
    stackedFlagCheckbox.addEventListener("change", handleStackedFlagChange);
  }
  jobsList.addEventListener("click", handleJobActions);
  jobsList.addEventListener("change", handleJobInput);
  jobsList.addEventListener("mouseover", jobResourceTooltipShowHandler);
  jobsList.addEventListener("mouseout", jobResourceTooltipHideHandler);
  jobsList.addEventListener("focusin", jobResourceTooltipShowHandler);
  jobsList.addEventListener("focusout", jobResourceTooltipHideHandler);

  if (villageDesignElements) {
    if (villageDesignElements.grid) {
      villageDesignElements.grid.addEventListener("click", handleVillageGridClick);
      villageDesignElements.grid.addEventListener(
        "mouseover",
        handleVillageGridHover
      );
      villageDesignElements.grid.addEventListener(
        "focusin",
        handleVillageGridHover
      );
      villageDesignElements.grid.addEventListener(
        "mouseout",
        handleVillageGridLeave
      );
      villageDesignElements.grid.addEventListener(
        "focusout",
        handleVillageGridLeave
      );
    }
    if (villageDesignElements.buildingList) {
      villageDesignElements.buildingList.addEventListener(
        "click",
        handleVillageCatalogClick
      );
    }
    if (Array.isArray(villageDesignElements.viewTabs)) {
      villageDesignElements.viewTabs.forEach((tab) => {
        tab.addEventListener("click", handleVillageViewTabClick);
      });
    }
    if (villageDesignElements.blueprintCancel) {
      villageDesignElements.blueprintCancel.addEventListener(
        "click",
        handleBlueprintCancel
      );
    }
    if (villageDesignElements.actionUpgrade) {
      villageDesignElements.actionUpgrade.addEventListener(
        "click",
        handleVillageUpgrade
      );
    }
    if (villageDesignElements.actionDemolish) {
      villageDesignElements.actionDemolish.addEventListener(
        "click",
        handleVillageDemolish
      );
    }
    if (villageDesignElements.saveButton) {
      villageDesignElements.saveButton.addEventListener(
        "click",
        handleVillageSave
      );
    }
    if (villageDesignElements.loadButton) {
      villageDesignElements.loadButton.addEventListener(
        "click",
        handleVillageLoad
      );
    }
  }

  villageModeButtons.forEach((button) => {
    button.addEventListener("click", handleVillageModeClick);
  });
  if (villageCompactToggle) {
    villageCompactToggle.addEventListener("click", handleVillageCompactToggle);
  }
  if (villageMapGrid) {
    villageMapGrid.addEventListener("click", handleVillageTileClick);
    villageMapGrid.addEventListener("mouseover", handleVillagePointerOver);
    villageMapGrid.addEventListener("mouseout", handleVillagePointerOut);
    villageMapGrid.addEventListener("focusin", handleVillageFocusIn);
    villageMapGrid.addEventListener("focusout", handleVillageFocusOut);
    villageMapGrid.addEventListener("keydown", handleVillageKeyDown);
    villageMapGrid.addEventListener("dragstart", handleVillageDragStart);
    villageMapGrid.addEventListener("dragend", handleVillageDragEnd);
    villageMapGrid.addEventListener("dragover", handleVillageDragOver);
    villageMapGrid.addEventListener("dragleave", handleVillageDragLeave);
    villageMapGrid.addEventListener("drop", handleVillageDrop);
  }
  if (villageDetail) {
    villageDetail.addEventListener("click", handleVillageDetailClick);
  }

  function setupProductionTree() {
    const view = document.querySelector('[data-view-panel="production"]');
    const panel = document.getElementById("production-tree-panel");
    if (!view || !panel) return;
    const q = (selector) => panel.querySelector(selector);
    const [content, status, categoriesRoot, searchInput, discoveredToggle, activeToggle] = ["[data-production-tree-content]","[data-production-tree-status]","[data-production-tree-categories]","[data-production-tree-search]","[data-production-tree-toggle="discovered"]","[data-production-tree-toggle="active"]"].map(q);
    const state = { data: null, filters: { discovered: true, active: false }, categories: new Set(), search: "" };
    const formatName = (id) => String(id || "").replace(/_/g, " ");
    const setStatus = (msg) => { if (!status) return; status.hidden = !msg; status.textContent = msg || ""; };
    const updateCategories = (nodes) => { if (!categoriesRoot) return; const categories = Array.from(new Set(nodes.filter((node) => node.type === "resource" && node.category).map((node) => node.category))).sort(); categoriesRoot.innerHTML = categories.map((category) => `<label class="production-tree-category"><input type="checkbox" value="${category}" ${state.categories.has(category) ? "checked" : ""}>${formatName(category)}</label>`).join(""); };
    const render = () => { if (!state.data || !content) return; const nodes = new Map(state.data.nodes.map((node) => [node.id, node])); const raw = new Set(state.data.nodes.filter((node) => node.type === "resource").map((node) => node.id)); state.data.edges.forEach((edge) => raw.delete(edge.to)); const search = state.search.trim().toLowerCase(); const filtered = state.data.edges.filter((edge) => { const input = nodes.get(edge.from); const output = nodes.get(edge.to); const building = nodes.get(edge.via_building); if (!input || !output || !building) return false; if (state.categories.size && !state.categories.has(input.category) && !state.categories.has(output.category)) return false; if (!search) return true; return [input, output, building].flatMap((node) => [node.id, formatName(node.id)]).join(" ").toLowerCase().includes(search); }); if (!filtered.length) { setStatus(!state.data.edges.length ? "No hay recetas definidas en la configuración." : state.filters.active ? "No hay cadenas activas. Construí o asigná trabajadores para ver producción." : "No hay resultados para los filtros aplicados."); content.innerHTML = ""; return; } setStatus(""); const resourceChip = (node) => `<button type="button" class="production-tree-chip" data-production-resource="${node.id}">${formatName(node.id)} (${Number(node.stock || 0).toFixed(1)})${raw.has(node.id) ? ' <span class="production-tree-chip__badge">RAW</span>' : ""}</button>`; const buildingChip = (node) => `<button type="button" class="production-tree-chip production-tree-chip--building" data-production-building="${node.id}"${node.rate_per_sec ? ` title="${(Number(node.rate_per_sec) * 60).toFixed(2)}/min"` : ""}>${formatName(node.id)}</button>`; content.innerHTML = filtered.map((edge) => { const inputNode = nodes.get(edge.from); const outputNode = nodes.get(edge.to); const buildingNode = nodes.get(edge.via_building); const tooltip = edge.ratio ? ` title="Ratio ${edge.ratio}"` : ""; return `<div class="production-tree-row"${tooltip}>${resourceChip(inputNode)} → ${buildingChip(buildingNode)} → ${resourceChip(outputNode)}</div>`; }).join(""); };
    const fetchData = async () => { setStatus("Cargando producción..."); const params = new URLSearchParams({ only_discovered: state.filters.discovered ? "true" : "false", only_active: state.filters.active ? "true" : "false" }); try { const response = await fetch(`/api/production_tree?${params.toString()}`, { cache: "no-store" }); if (!response.ok) throw new Error(`status ${response.status}`); state.data = await response.json(); updateCategories(state.data.nodes || []); render(); } catch (error) { setStatus("No se pudo cargar la producción."); if (typeof console !== "undefined" && typeof console.error === "function") console.error("[Idle Village] production tree fetch failed", error); } };
    const ensureData = () => { if (state.data) render(); else void fetchData(); };
    panel.addEventListener("click", (event) => { const resourceTarget = event.target.closest("[data-production-resource]"); if (resourceTarget) { activateResourceFilter(resourceTarget.dataset.productionResource); setActiveView("buildings"); return; } const buildingTarget = event.target.closest("[data-production-building]"); if (buildingTarget) { const buildingId = buildingTarget.dataset.productionBuilding; if (buildingId) { setActiveView("buildings"); window.requestAnimationFrame(() => { const key = resolveBuildingElementKey(buildingId); const entry = buildingElementMap.get(key); if (!entry || !entry.article) return; if (typeof entry.article.scrollIntoView === "function") entry.article.scrollIntoView({ behavior: "smooth", block: "center" }); entry.article.classList.add("building-card--highlighted"); window.setTimeout(() => entry.article.classList.remove("building-card--highlighted"), 1500); }); } } });
    if (categoriesRoot) categoriesRoot.addEventListener("change", (event) => { const input = event.target; if (!input || input.type !== "checkbox") return; if (input.checked) state.categories.add(input.value); else state.categories.delete(input.value); render(); });
    if (searchInput) searchInput.addEventListener("input", () => { state.search = searchInput.value || ""; render(); });
    [[discoveredToggle, "discovered"], [activeToggle, "active"]].forEach(([input, key]) => { if (!input) return; input.addEventListener("change", () => { state.filters[key] = input.checked; state.data = null; void fetchData(); }); });
    const observer = new MutationObserver(() => { if (!view.hasAttribute("hidden")) ensureData(); });
    observer.observe(view, { attributes: true, attributeFilter: ["hidden", "class"] });
  }
  if (typeof window !== "undefined") {
    window.addEventListener("scroll", handleGlobalScroll, { passive: true });
    window.addEventListener("resize", handleGlobalScroll);
  }
  tradeList.addEventListener("click", handleTradeActions);
  tradeList.addEventListener("input", handleTradeInputs);

  setupProductionTree();
  renderBuildings();
  ensureJobsForAllBuildings();
  renderJobs();
  renderTrade();
  attachAccordion();
  updateJobsCount();
  updateChips();
  renderSeason(state.season);
  updateVillageCompactToggle();

  initialiseVillageDesign();
  startWoodPolling();

  const initialisationPromise = initialiseSeasonSync();
  if (verifyState.enabled) {
    initialisationPromise
      .then(() => runVerifySuite())
      .catch((error) => {
        const message = error && error.message ? error.message : String(error);
        pushVerifyLog("suite-error", { message });
      })
      .finally(() => {
        startSeasonTickLoop();
      });
  } else {
    initialisationPromise.then(startSeasonTickLoop);
  }
})();
