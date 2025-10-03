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
    const normalisedId =
      candidateId ||
      (typeof typeKey === "string" && typeKey
        ? normaliseKey(typeKey)
        : null);

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
    };

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

  function normaliseState(snapshot) {
    const next = { ...snapshot };
    next.buildings = Array.isArray(snapshot.buildings)
      ? snapshot.buildings
          .map((building) => normaliseBuilding(building))
          .filter(Boolean)
      : [];
    next.population = normalisePopulation(snapshot.population || next.population);
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
      gold: 0,
      wood: 0,
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
      current: 2,
      capacity: 20,
      available: 2,
      total: 2,
    },
    buildings: [
      {
        id: "woodcutter_camp",
        type: "woodcutter_camp",
        job: "forester",
        name: "Woodcutter Camp",
        category: "wood",
        built: 1,
        active: 0,
        capacityPerBuilding: 10,
        icon: "🪓",
        inputs: {},
        outputs: { wood: 0.1 },
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
      { id: "forester", name: "Forester", assigned: 0, max: 10, icon: "🌲" },
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
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

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

  const buildingContainers = {
    wood: document.querySelector('[data-category="wood"]'),
    stone: document.querySelector('[data-category="stone"]'),
    crops: document.querySelector('[data-category="crops"]'),
  };

  const buildingElementMap = new Map();
  const pendingWorkerRequests = new Set();
  const JOB_BUILDING_MAP = {
    forester: "woodcutter_camp",
  };

  const JOB_ASSIGNMENT_PLACEHOLDER_MESSAGE =
    "Asigná trabajadores desde la tarjeta del edificio. Jobs es solo visual.";

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
    const chipElements = document.querySelectorAll(".chip");
    const assigned = getTotalAssigned();
    chipElements.forEach((chip) => {
      const resourceKey = chip.dataset.resource;
      const valueSpan = chip.querySelector(".value");
      if (!valueSpan) return;
      switch (resourceKey) {
        case "happiness":
          valueSpan.textContent = `${formatAmount(state.resources.happiness)}%`;
          break;
        case "population":
          {
            const total = state.population.current || 0;
            const capacity = state.population.capacity || 0;
            const providedAvailable = Number(state.population.available);
            const fallbackAvailable = Math.max(0, Math.min(total, total - assigned));
            const available = Number.isFinite(providedAvailable)
              ? Math.max(0, Math.min(total, Math.floor(providedAvailable)))
              : fallbackAvailable;
            valueSpan.textContent = `${available}/${capacity}`;
          }
          break;
        default:
          if (state.resources[resourceKey] !== undefined) {
            if (resourceKey === "wood") {
              const numeric = Number(state.resources[resourceKey]);
              valueSpan.textContent = Number.isFinite(numeric)
                ? numeric.toFixed(1).replace(".", ",")
                : "0,0";
            } else {
              valueSpan.textContent = formatAmount(state.resources[resourceKey]);
            }
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

    const workerHeader = document.createElement("div");
    workerHeader.className = "worker-header";

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
    workerHeader.append(workerLabel, workerControls);
    workerGroup.appendChild(workerHeader);

    const workerFeedback = document.createElement("p");
    workerFeedback.className = "worker-feedback";
    workerFeedback.hidden = true;
    workerGroup.appendChild(workerFeedback);

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
      workerFeedback,
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

    const hasServerId =
      typeof building.id === "string" && building.id.trim().length > 0;
    const isPending = pendingWorkerRequests.has(String(building.id));
    const disableState = getWorkerDisableState(building);
    const assignDisabled = !hasServerId || isPending || disableState.disabled;
    const decrementDisabled = !hasServerId || isPending || activeWorkers <= 0;

    syncAriaDisabled(entry.decrementButton, decrementDisabled);
    syncAriaDisabled(entry.assignButton, assignDisabled);
    syncAriaDisabled(entry.incrementButton, assignDisabled);

    entry.workerInput.disabled = !hasServerId || isPending;
    entry.workerInput.setAttribute(
      "aria-disabled",
      entry.workerInput.disabled ? "true" : "false"
    );

    if (isPending) {
      entry.assignButton.title = "Procesando asignación…";
      entry.incrementButton.title = "Procesando asignación…";
      entry.decrementButton.title = "Procesando asignación…";
    } else if (!hasServerId) {
      const syncing = "Sincronizando con el servidor…";
      entry.assignButton.title = syncing;
      entry.incrementButton.title = syncing;
      entry.decrementButton.title = syncing;
    } else if (disableState.disabled) {
      entry.assignButton.title = disableState.tooltip;
      entry.incrementButton.title = disableState.tooltip;
      entry.decrementButton.removeAttribute("title");
    } else {
      entry.assignButton.removeAttribute("title");
      entry.incrementButton.removeAttribute("title");
      entry.decrementButton.removeAttribute("title");
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

  function adjustBuildingCount(buildingId, delta) {
    const building = findBuildingById(buildingId);
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
      adjustBuildingCount(buildingId, 1);
    } else if (action === "demolish") {
      adjustBuildingCount(buildingId, -1);
    } else if (action === "assign") {
      const input = document.querySelector(`[data-building-input="${buildingId}"]`);
      const desired = input ? Number(input.value) : 0;
      await assignBuildingWorkers(buildingId, desired);
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
      match.inputs = remote.inputs;
      match.outputs = remote.outputs;
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

      const nextBuilt = Number(remote.built);
      if (Number.isFinite(nextBuilt)) {
        match.built = Math.max(0, nextBuilt);
      }

      const nextCapacity = Number(remote.capacityPerBuilding);
      if (Number.isFinite(nextCapacity) && nextCapacity > 0) {
        match.capacityPerBuilding = nextCapacity;
      }

      const nextMaxWorkers = Number(remote.max_workers);
      if (Number.isFinite(nextMaxWorkers) && nextMaxWorkers > 0) {
        match.max_workers = nextMaxWorkers;
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
    const entries = Array.isArray(jobs)
      ? jobs
      : Object.entries(jobs).map(([id, value]) => ({ id, ...(value || {}) }));
    let changed = false;
    entries.forEach((entry) => {
      const jobId =
        typeof entry.id === "string"
          ? entry.id
          : typeof entry.job === "string"
          ? entry.job
          : null;
      if (!jobId) {
        return;
      }
      const job = state.jobs.find((candidate) => candidate.id === jobId);
      if (!job) {
        return;
      }
      const assignedValue = Number(
        entry.assigned !== undefined ? entry.assigned : entry.workers
      );
      if (Number.isFinite(assignedValue) && job.assigned !== assignedValue) {
        job.assigned = assignedValue;
        changed = true;
      }
      const capacityValue = Number(
        entry.capacity !== undefined ? entry.capacity : entry.max
      );
      if (Number.isFinite(capacityValue) && job.max !== capacityValue) {
        job.max = capacityValue;
        changed = true;
      }
      if (Number.isFinite(assignedValue) || Number.isFinite(capacityValue)) {
        updateJobCard(job);
      }
    });
    return changed;
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

  const jobResourceTooltipShowHandler = createJobResourceTooltipHandler("show");
  const jobResourceTooltipHideHandler = createJobResourceTooltipHandler("hide");

  document.getElementById("building-accordion").addEventListener("click", handleBuildingActions);
  document.getElementById("building-accordion").addEventListener("change", handleBuildingInput);
  jobsList.addEventListener("click", handleJobActions);
  jobsList.addEventListener("change", handleJobInput);
  jobsList.addEventListener("mouseover", jobResourceTooltipShowHandler);
  jobsList.addEventListener("mouseout", jobResourceTooltipHideHandler);
  jobsList.addEventListener("focusin", jobResourceTooltipShowHandler);
  jobsList.addEventListener("focusout", jobResourceTooltipHideHandler);

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
