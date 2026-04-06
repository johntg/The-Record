import "./style.css";

const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL?.trim() ?? "";
const UNCONFIGURED_API_MARKER = "YOUR_DEPLOYMENT_ID";
const DEMO_DATA = {
  units: ["1st Ward", "2nd Ward", "YSA Branch"],
  callings: [
    [
      "Timestamp",
      "Type",
      "Name",
      "Position",
      "Unit",
      "SP Approved",
      "SHC Sustained",
      "I/V Assigned",
      "I/V Complete",
      "Prev-Release",
      "SusAssigned",
      "SusUnit",
      "SA-Assign",
      "SA Done",
      "Status",
    ],
    [
      "06/04/2026 09:00",
      "Call",
      "Jane Example",
      "Relief Society President",
      "1st Ward",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Open",
    ],
    [
      "06/04/2026 08:30",
      "Release",
      "John Sample",
      "Ward Clerk",
      "2nd Ward",
      "",
      "",
      "",
      "",
      "Previous Bishopric",
      "",
      "",
      "",
      "",
      "Open",
    ],
  ],
};

document.querySelector("#app").innerHTML = `
    <main class="app-shell">
        <header class="app-header">
            <h1>Stake Callings</h1>
      <p>Track calls and releases from your spreadsheet.</p>
        </header>

    <div id="app-toast" class="app-toast hidden" role="status" aria-live="polite"></div>

        <div id="loader">Connecting to Google Sheets...</div>
        <div id="data-list" aria-live="polite"></div>

        <button id="open-modal-btn" class="fab" type="button" aria-label="Add calling">
            +
        </button>

        <div id="item-modal" class="modal-overlay hidden" aria-hidden="true">
            <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
                <div class="modal-header">
                    <h2 id="modal-title">New Entry</h2>
                    <button id="close-modal-btn" class="icon-button" type="button" aria-label="Close dialog">
                        ×
                    </button>
                </div>

                <form id="calling-form" class="calling-form">
                    <label class="field-label" for="type">Type</label>
                    <select id="type" name="type" required>
                        <option value="Call">Call</option>
                        <option value="Release">Release</option>
                    </select>

                    <label class="field-label" for="name">Name</label>
                    <input id="name" name="name" type="text" placeholder="Full Name" required />

                    <label class="field-label" for="position">Position</label>
                    <input id="position" name="position" type="text" placeholder="Position" required />

                    <label class="field-label" for="unit">Unit</label>
                    <select id="unit" name="unit" required>
                        <option value="">Select Unit...</option>
                    </select>

                    <p id="form-message" class="form-message" aria-live="polite"></p>

                    <div class="btn-group">
                        <button id="cancel-btn" class="btn btn-secondary" type="button">Cancel</button>
                        <button id="submit-btn" class="btn btn-primary" type="submit">Submit</button>
                    </div>
                </form>
            </div>
        </div>
    </main>
`;

const loaderElement = document.getElementById("loader");
const listElement = document.getElementById("data-list");
const modalElement = document.getElementById("item-modal");
const openModalButton = document.getElementById("open-modal-btn");
const closeModalButton = document.getElementById("close-modal-btn");
const cancelButton = document.getElementById("cancel-btn");
const formElement = document.getElementById("calling-form");
const submitButton = document.getElementById("submit-btn");
const unitSelectElement = document.getElementById("unit");
const formMessageElement = document.getElementById("form-message");
const nameInputElement = document.getElementById("name");
const headerMessageElement = document.querySelector(".app-header p");
const toastElement = document.getElementById("app-toast");

let toastTimeoutId;

function showToast(message, options = {}) {
  const {
    type = "info",
    actionLabel,
    onAction,
    duration = 4000,
    persist = false,
  } = options;

  if (!toastElement) {
    return;
  }

  toastElement.innerHTML = "";
  toastElement.className = `app-toast ${type}`;
  toastElement.classList.remove("hidden");

  const text = document.createElement("span");
  text.className = "app-toast-text";
  text.textContent = message;
  toastElement.appendChild(text);

  if (actionLabel && typeof onAction === "function") {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "app-toast-action";
    actionButton.textContent = actionLabel;
    actionButton.addEventListener("click", onAction);
    toastElement.appendChild(actionButton);
  }

  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
  }

  if (!persist) {
    toastTimeoutId = window.setTimeout(() => {
      toastElement.classList.add("hidden");
    }, duration);
  }
}

const appState = {
  units: [],
  usingDemoData: false,
};

function isApiConfigured() {
  return Boolean(API_URL) && !API_URL.includes(UNCONFIGURED_API_MARKER);
}

function setStatusMessage(message, isError = false) {
  loaderElement.textContent = message;
  loaderElement.classList.toggle("error", isError);
  loaderElement.style.display = "block";
}

function setHeaderMessage(message) {
  headerMessageElement.textContent = message;
}

function applyData(data) {
  appState.units = Array.isArray(data.units) ? data.units : [];
  populateUnitOptions(appState.units);
  renderCards(data.callings);
}

function loadDemoData(message) {
  appState.usingDemoData = true;
  applyData(DEMO_DATA);
  setHeaderMessage("Demo mode — live data unavailable.");
  setStatusMessage(
    message || "Using demo data until the Apps Script API is configured.",
    true,
  );
}

function getApiUrl(action) {
  if (!API_URL) {
    throw new Error(
      "Missing VITE_APPS_SCRIPT_URL. Add your Apps Script /exec URL to .env.",
    );
  }

  const url = new URL(API_URL);
  if (action) {
    url.searchParams.set("action", action);
  }
  return url;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setFormMessage(message = "", isError = false) {
  formMessageElement.textContent = message;
  formMessageElement.classList.toggle("error", isError);
}

function populateUnitOptions(units) {
  const options = [
    '<option value="">Select Unit...</option>',
    ...units.map(
      (unit) =>
        `<option value="${escapeHtml(unit)}">${escapeHtml(unit)}</option>`,
    ),
  ];

  unitSelectElement.innerHTML = options.join("");
}

function resetForm() {
  formElement.reset();
  unitSelectElement.value = "";
  setFormMessage("");
}

function setModalOpen(isOpen) {
  modalElement.classList.toggle("hidden", !isOpen);
  modalElement.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("modal-open", isOpen);

  if (isOpen) {
    nameInputElement.focus();
  } else {
    resetForm();
  }
}

function renderCards(rows) {
  if (!Array.isArray(rows) || rows.length <= 1) {
    listElement.innerHTML =
      '<div class="card empty-state"><small>No callings found.</small></div>';
    return;
  }

  listElement.innerHTML = rows
    .slice(1)
    .reverse()
    .map(
      (row) => `
        <article class="card">
          <span class="type-badge ${String(row?.[1] ?? "").toLowerCase() === "release" ? "type-release" : "type-call"}">
            ${escapeHtml(row?.[1] ?? "Call")}
          </span>
          <div class="person-name">${escapeHtml(row?.[2] ?? "Unknown name")}</div>
          <div class="pos-text">${escapeHtml(row?.[3] ?? "No position")}</div>
          <div class="unit-text">${escapeHtml(row?.[4] ?? "No unit")}</div>
        </article>
      `,
    )
    .join("");
}

async function loadData() {
  if (!isApiConfigured()) {
    loadDemoData(
      "Apps Script URL not configured yet. Replace YOUR_DEPLOYMENT_ID in .env to connect live data.",
    );
    return;
  }

  try {
    const response = await fetch(getApiUrl("initialData"), {
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    const data = await response.json();
    console.log("[Stake Callings] Apps Script response:", JSON.stringify(data));

    // Accept both { success: true, ... } (new API) and { error: null, ... } (old API)
    const hasData = Array.isArray(data.callings) && data.callings.length > 0;
    const isSuccess =
      data.success === true || (data.success === undefined && hasData);

    if (!isSuccess) {
      const detail = data.error
        ? `Apps Script error: ${data.error}`
        : `Apps Script returned no usable data. Raw: ${JSON.stringify(data)}`;
      throw new Error(detail);
    }

    appState.usingDemoData = false;
    applyData(data);
    setHeaderMessage("Track calls and releases from your spreadsheet.");
    loaderElement.style.display = "none";
  } catch (error) {
    loadDemoData(`API error: ${error.message}`);
  }
}

async function submitCalling(payload) {
  if (!isApiConfigured() || appState.usingDemoData) {
    throw new Error(
      "Live saving is not available in demo mode. Add your deployed Apps Script /exec URL to .env first.",
    );
  }

  const formData = new URLSearchParams({
    action: "saveCalling",
    type: payload.type,
    name: payload.name,
    position: payload.position,
    unit: payload.unit,
  });

  const response = await fetch(getApiUrl(), {
    method: "POST",
    redirect: "follow",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Save failed (${response.status})`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Unable to save item.");
  }
}

formElement.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    type: formElement.type.value.trim(),
    name: formElement.name.value.trim(),
    position: formElement.position.value.trim(),
    unit: formElement.unit.value.trim(),
  };

  if (!payload.type || !payload.name || !payload.position || !payload.unit) {
    setFormMessage("Please fill in type, name, position, and unit.", true);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Saving...";
  setFormMessage("");

  try {
    await submitCalling(payload);
    setModalOpen(false);
    loaderElement.style.display = "block";
    loaderElement.textContent = "Refreshing callings...";
    await loadData();
  } catch (error) {
    setFormMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit";
  }
});

openModalButton.addEventListener("click", () => setModalOpen(true));
closeModalButton.addEventListener("click", () => setModalOpen(false));
cancelButton.addEventListener("click", () => setModalOpen(false));

modalElement.addEventListener("click", (event) => {
  if (event.target === modalElement) {
    setModalOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modalElement.classList.contains("hidden")) {
    setModalOpen(false);
  }
});

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js`,
      );
      console.log("[Stake Callings] Service worker registered.");

      if (registration.waiting) {
        showToast("A new version is available.", {
          type: "success",
          actionLabel: "Refresh",
          persist: true,
          onAction: () => {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          },
        });
      }

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) {
          return;
        }

        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed") {
            if (navigator.serviceWorker.controller) {
              showToast("A new version is available.", {
                type: "success",
                actionLabel: "Refresh",
                persist: true,
                onAction: () => {
                  installingWorker.postMessage({ type: "SKIP_WAITING" });
                },
              });
            } else {
              showToast("Offline support is ready.", { type: "success" });
            }
          }
        });
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) {
          return;
        }
        refreshing = true;
        window.location.reload();
      });
    } catch (error) {
      console.warn(
        "[Stake Callings] Service worker registration failed:",
        error,
      );
    }
  });
}

registerServiceWorker();
loadData();
