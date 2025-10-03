(function () {
  const stackContainer = document.getElementById("stack-cards");
  const inventoryContainer = document.getElementById("inventory-summary");
  const workerContainer = document.getElementById("workers-summary");

  const filterActive = document.getElementById("filter-active");
  const filterInputOk = document.getElementById("filter-input-ok");
  const filterHideObsolete = document.getElementById("filter-hide-obsolete");
  const filterMinLevel = document.getElementById("filter-min-level");

  const state = {
    snapshot: null,
    filters: {
      activeOnly: false,
      inputsOk: false,
      hideObsolete: false,
      minLevel: 1,
    },
  };

  const API = {
    async fetchState() {
      const response = await fetch("/game/state");
      return response.json();
    },
    async post(url, payload) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        throw data;
      }
      return data;
    },
    build(typeId) {
      return this.post("/buildings/build", { type_id: typeId });
    },
    upgrade(instanceId) {
      return this.post("/buildings/upgrade", { instance_id: instanceId });
    },
    consolidate(typeId) {
      return this.post("/buildings/consolidate", { type_id: typeId });
    },
    toggle(instanceId) {
      return this.post("/buildings/toggle", { instance_id: instanceId });
    },
    demolish(instanceId) {
      return this.post("/buildings/demolish", { instance_id: instanceId });
    },
    assign(instanceId, workers) {
      return this.post("/workers/assign", { instance_id: instanceId, n: workers });
    },
    optimize(typeId) {
      return this.post("/workers/optimize", typeId ? { type_id: typeId } : {});
    },
  };

  function applyFilters(instances, stack) {
    let filtered = [...instances];
    if (state.filters.activeOnly) {
      filtered = filtered.filter((instance) => instance.active);
    }
    if (state.filters.minLevel > 1) {
      filtered = filtered.filter((instance) => instance.level >= state.filters.minLevel);
    }
    if (state.filters.hideObsolete) {
      const activeLevels = instances.filter((instance) => instance.active).map((instance) => instance.level);
      const highestActive = activeLevels.length ? Math.max(...activeLevels) : 0;
      filtered = filtered.filter((instance) => instance.active || instance.level >= highestActive);
    }
    if (state.filters.inputsOk && stack.report.input_status !== "ok") {
      return [];
    }
    return filtered;
  }

  function setSnapshot(snapshot) {
    state.snapshot = snapshot;
    render();
  }

  function formatNumber(value, decimals = 1) {
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function updateWorkers() {
    if (!workerContainer || !state.snapshot) {
      return;
    }
    const { workers } = state.snapshot;
    workerContainer.textContent = `Trabajadores libres ${workers.free} / ${workers.total}`;
  }

  function updateInventory() {
    if (!inventoryContainer || !state.snapshot) {
      return;
    }
    inventoryContainer.innerHTML = "";
    const entries = Object.entries(state.snapshot.inventory || {}).sort((a, b) => a[0].localeCompare(b[0]));
    entries.forEach(([resource, amount]) => {
      const chip = document.createElement("article");
      chip.className = "inventory-chip";

      const label = document.createElement("p");
      label.className = "inventory-chip__label";
      label.textContent = resource;

      const value = document.createElement("p");
      value.className = "inventory-chip__value";
      value.textContent = formatNumber(amount, 0);

      chip.append(label, value);
      inventoryContainer.appendChild(chip);
    });
  }

  function createStatusDot(status) {
    const dot = document.createElement("span");
    dot.className = "status-dot";
    if (status === "ok") {
      dot.classList.add("is-ok");
    } else if (status === "partial") {
      dot.classList.add("is-partial");
    } else if (status === "none") {
      dot.classList.add("is-none");
    }
    return dot;
  }

  function renderStack(stack) {
    const card = document.createElement("article");
    card.className = "stack-card";

    const header = document.createElement("header");
    header.className = "stack-card__header";

    const title = document.createElement("h3");
    title.className = "stack-card__title";
    title.textContent = `${stack.name}`;

    const meta = document.createElement("div");
    meta.className = "stack-card__meta";
    meta.textContent = `${stack.count} instancias • ${stack.active_count} activas`;

    const production = document.createElement("div");
    production.className = "production-indicator";
    const dot = createStatusDot(stack.report.input_status);
    const productionText = document.createElement("span");
    productionText.textContent = `Producción ${formatNumber(stack.report.output_per_min || 0)} /min`;
    production.append(dot, productionText);

    header.append(title, meta, production);
    card.appendChild(header);

    const levelBreakdown = document.createElement("div");
    levelBreakdown.className = "level-breakdown";
    stack.level_breakdown.forEach((entry) => {
      const chip = document.createElement("span");
      chip.className = "level-chip";
      chip.textContent = `L${entry.level} ×${entry.count}`;
      chip.title = `${entry.active} activas`;
      levelBreakdown.appendChild(chip);
    });
    card.appendChild(levelBreakdown);

    const inputsStatus = document.createElement("div");
    inputsStatus.className = "inputs-status";
    const consumedEntries = Object.entries(stack.report.consumed_inputs || {});
    consumedEntries.forEach(([resource, value]) => {
      const chip = document.createElement("span");
      chip.className = "input-chip";
      chip.textContent = `${resource}: ${formatNumber(value)} /min`;
      inputsStatus.appendChild(chip);
    });
    const missingEntries = Object.entries(stack.report.missing_inputs || {});
    missingEntries.forEach(([resource, value]) => {
      const chip = document.createElement("span");
      chip.className = "input-chip";
      chip.textContent = `⚠ ${resource}: -${formatNumber(value)} /min`;
      chip.title = `Déficit de ${formatNumber(value)} por minuto`;
      inputsStatus.appendChild(chip);
    });
    if (inputsStatus.children.length > 0) {
      card.appendChild(inputsStatus);
    }

    const actions = document.createElement("div");
    actions.className = "stack-actions";

    const buildButton = document.createElement("button");
    buildButton.className = "stack-button";
    buildButton.type = "button";
    buildButton.textContent = "Construir";
    buildButton.addEventListener("click", () => handleAction(API.build(stack.type_id)));
    actions.appendChild(buildButton);

    const upgradable = stack.instances.filter((instance) => instance.active && instance.level < 5);
    if (upgradable.length > 0) {
      const select = document.createElement("select");
      select.className = "stack-button";
      upgradable.forEach((instance) => {
        const option = document.createElement("option");
        option.value = instance.id;
        option.textContent = `${instance.id} (L${instance.level})`;
        select.appendChild(option);
      });
      const upgradeButton = document.createElement("button");
      upgradeButton.type = "button";
      upgradeButton.className = "stack-button";
      upgradeButton.textContent = "Mejorar";
      upgradeButton.addEventListener("click", () => {
        const target = select.value;
        if (target) {
          handleAction(API.upgrade(target));
        }
      });
      actions.append(select, upgradeButton);
    }

    if (stack.consolidate_rule) {
      const consolidateButton = document.createElement("button");
      consolidateButton.type = "button";
      consolidateButton.className = "stack-button";
      consolidateButton.textContent = "Consolidar";
      consolidateButton.addEventListener("click", () => handleAction(API.consolidate(stack.type_id)));
      actions.appendChild(consolidateButton);
    }

    const optimiseButton = document.createElement("button");
    optimiseButton.type = "button";
    optimiseButton.className = "stack-button";
    optimiseButton.textContent = "Optimizar";
    optimiseButton.addEventListener("click", () => handleAction(API.optimize(stack.type_id)));
    actions.appendChild(optimiseButton);

    card.appendChild(actions);

    const instanceList = document.createElement("div");
    instanceList.className = "instance-list";

    const reports = new Map((stack.report.instances || []).map((entry) => [entry.id, entry]));

    applyFilters(stack.instances, stack).forEach((instance) => {
      const instanceRow = document.createElement("div");
      instanceRow.className = "instance-row";

      const label = document.createElement("div");
      label.className = "instance-label";
      const name = document.createElement("span");
      name.textContent = `${instance.id} • L${instance.level}`;
      const status = document.createElement("span");
      status.className = instance.active ? "badge is-active" : "badge is-inactive";
      status.textContent = instance.active ? "Activo" : "Apagado";
      label.append(name, status);

      const supplyCell = document.createElement("div");
      const report = reports.get(instance.id);
      if (report) {
        supplyCell.textContent = `${Math.round(report.input_factor * 100)}% inputs`;
        supplyCell.title = `Produce ${formatNumber(report.produced_per_min)} /min`;
      }

      const workerCell = document.createElement("div");
      workerCell.textContent = `${instance.workers} trabajadores`;

      const controls = document.createElement("div");
      controls.className = "instance-controls";

      const minusButton = document.createElement("button");
      minusButton.type = "button";
      minusButton.className = "icon-button";
      minusButton.textContent = "-";
      minusButton.addEventListener("click", () => {
        const newCount = Math.max(0, instance.workers - 1);
        handleAction(API.assign(instance.id, newCount));
      });

      const plusButton = document.createElement("button");
      plusButton.type = "button";
      plusButton.className = "icon-button";
      plusButton.textContent = "+";
      plusButton.addEventListener("click", () => handleAction(API.assign(instance.id, instance.workers + 1)));

      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "icon-button";
      toggleButton.textContent = instance.active ? "⏸" : "▶";
      toggleButton.title = instance.active ? "Apagar" : "Activar";
      toggleButton.addEventListener("click", () => handleAction(API.toggle(instance.id)));

      const upgradeButton = document.createElement("button");
      upgradeButton.type = "button";
      upgradeButton.className = "icon-button";
      upgradeButton.textContent = "⬆";
      upgradeButton.title = "Mejorar";
      upgradeButton.disabled = instance.level >= 5;
      upgradeButton.addEventListener("click", () => handleAction(API.upgrade(instance.id)));

      const demolishButton = document.createElement("button");
      demolishButton.type = "button";
      demolishButton.className = "icon-button is-danger";
      demolishButton.textContent = "🗑";
      demolishButton.title = "Demoler";
      demolishButton.addEventListener("click", () => handleAction(API.demolish(instance.id)));

      controls.append(minusButton, plusButton, toggleButton, upgradeButton, demolishButton);

      instanceRow.append(label, supplyCell, workerCell, controls);
      instanceList.appendChild(instanceRow);
    });

    if (!instanceList.hasChildNodes()) {
      const empty = document.createElement("div");
      empty.className = "instance-row";
      empty.textContent = "No hay instancias con los filtros seleccionados.";
      instanceList.appendChild(empty);
    }

    card.appendChild(instanceList);
    stackContainer.appendChild(card);
  }

  function renderStacks() {
    if (!stackContainer || !state.snapshot) {
      return;
    }
    stackContainer.innerHTML = "";
    (state.snapshot.stacks || []).forEach((stack) => {
      if (state.filters.inputsOk && stack.report.input_status !== "ok") {
        return;
      }
      renderStack(stack);
    });
  }

  function render() {
    updateWorkers();
    updateInventory();
    renderStacks();
  }

  async function handleAction(promise) {
    try {
      const response = await promise;
      if (response.state) {
        setSnapshot(response.state);
      } else {
        refreshState();
      }
    } catch (error) {
      console.error("Action failed", error);
      refreshState();
    }
  }

  async function refreshState() {
    try {
      const payload = await API.fetchState();
      if (payload.state) {
        setSnapshot(payload.state);
      }
    } catch (error) {
      console.error("Failed to refresh state", error);
    }
  }

  function attachFilters() {
    if (filterActive) {
      filterActive.addEventListener("change", (event) => {
        state.filters.activeOnly = Boolean(event.target.checked);
        render();
      });
    }
    if (filterInputOk) {
      filterInputOk.addEventListener("change", (event) => {
        state.filters.inputsOk = Boolean(event.target.checked);
        render();
      });
    }
    if (filterHideObsolete) {
      filterHideObsolete.addEventListener("change", (event) => {
        state.filters.hideObsolete = Boolean(event.target.checked);
        render();
      });
    }
    if (filterMinLevel) {
      filterMinLevel.addEventListener("change", (event) => {
        const value = Number.parseInt(event.target.value, 10);
        state.filters.minLevel = Number.isFinite(value) ? value : 1;
        render();
      });
    }
  }

  attachFilters();
  refreshState();
  setInterval(refreshState, 5000);
})();
