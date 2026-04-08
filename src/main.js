import "./style.css";

const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL?.trim() ?? "";
const UNCONFIGURED_API_MARKER = "YOUR_DEPLOYMENT_ID";
const DEV_API_PROXY_PATH = "/api/apps-script";
const SESSION_STORAGE_KEY = "stake-callings-session";
const SESSION_TTL_MS = 3 * 60 * 60 * 1000;
const PUBLIC_API_ACTIONS = new Set(["authOptions", "login"]);
const DEMO_DATA = {
  units: ["1st Ward", "2nd Ward", "YSA Branch"],
  assigners: ["Bishop Smith", "Sister Jones", "Brother Clark"],
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
      <button id="toggle-items-btn" class="header-action-btn" type="button" hidden>Show all current items</button>
      <button id="toggle-sort-btn" class="header-action-btn" type="button" hidden>Show oldest first</button>
      <button id="sign-out-btn" class="header-action-btn" type="button" hidden>Sign out</button>
        </header>

    <div id="app-toast" class="app-toast hidden" role="status" aria-live="polite"></div>

    <div id="busy-overlay" class="busy-overlay hidden" aria-hidden="true" aria-live="polite">
      <div class="busy-spinner" aria-hidden="true"></div>
      <span>Working...</span>
    </div>

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

            <div id="auth-modal" class="modal-overlay hidden" aria-hidden="true">
              <div class="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
                <div class="modal-header auth-modal-header">
                  <h2 id="auth-title">Sign in</h2>
                </div>

                <form id="auth-form" class="calling-form">
                  <label class="field-label" for="auth-user">Name</label>
                  <select id="auth-user" name="authUser" required>
                    <option value="">Select your name...</option>
                  </select>

                  <label class="field-label" for="auth-password">Password</label>
                  <input id="auth-password" name="authPassword" type="password" placeholder="Password" required />

                  <label class="approval-item" for="auth-show-password">
                    <input id="auth-show-password" name="authShowPassword" type="checkbox" />
                    <span>Show password</span>
                  </label>

                  <p id="auth-message" class="form-message" aria-live="polite"></p>

                  <div class="btn-group">
                    <button id="auth-submit-btn" class="btn btn-primary" type="submit">Sign in</button>
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
const busyOverlayElement = document.getElementById("busy-overlay");
const toggleItemsButton = document.getElementById("toggle-items-btn");
const toggleSortButton = document.getElementById("toggle-sort-btn");
const signOutButton = document.getElementById("sign-out-btn");
const authModalElement = document.getElementById("auth-modal");
const authFormElement = document.getElementById("auth-form");
const authUserElement = document.getElementById("auth-user");
const authPasswordElement = document.getElementById("auth-password");
const authShowPasswordElement = document.getElementById("auth-show-password");
const authMessageElement = document.getElementById("auth-message");
const authSubmitButton = document.getElementById("auth-submit-btn");

let toastTimeoutId;
let busyRequestCount = 0;

function setBusyOverlayVisible(isVisible) {
  if (!busyOverlayElement) {
    return;
  }

  busyOverlayElement.classList.toggle("hidden", !isVisible);
  busyOverlayElement.setAttribute("aria-hidden", String(!isVisible));
}

function beginBusy() {
  busyRequestCount += 1;
  setBusyOverlayVisible(true);
}

function endBusy() {
  busyRequestCount = Math.max(0, busyRequestCount - 1);
  if (busyRequestCount === 0) {
    setBusyOverlayVisible(false);
  }
}

const nativeFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  beginBusy();
  try {
    return await nativeFetch(...args);
  } finally {
    endBusy();
  }
};

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
  admins: [],
  assigners: [],
  statuses: [],
  callings: [],
  authUsers: [],
  sessionToken: "",
  sessionName: "",
  sessionRole: "",
  showAllCurrentItems: false,
  sortNewestFirst: true,
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

function setAuthMessage(message = "", isError = false) {
  authMessageElement.textContent = message;
  authMessageElement.classList.toggle("error", isError);
}

function setAuthModalOpen(isOpen) {
  authModalElement.classList.toggle("hidden", !isOpen);
  authModalElement.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("modal-open", isOpen);
  loaderElement.style.display = isOpen ? "none" : "block";

  if (isOpen) {
    authUserElement.focus();
  } else {
    authPasswordElement.value = "";
    authPasswordElement.type = "password";
    if (authShowPasswordElement) {
      authShowPasswordElement.checked = false;
    }
    setAuthMessage("");
  }
}

function populateAuthUserOptions(users) {
  const options = [
    '<option value="">Select your name...</option>',
    ...users.map(
      (name) =>
        `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`,
    ),
  ];

  authUserElement.innerHTML = options.join("");
}

function setSession(session = {}) {
  appState.sessionToken = String(session.token ?? "").trim();
  appState.sessionName = String(session.name ?? "").trim();
  appState.sessionRole = String(session.role ?? "").trim();
  const isAssignUser = appState.sessionRole.toLowerCase() === "assign";

  appState.showAllCurrentItems =
    isAssignUser && typeof session.showAllCurrentItems === "boolean"
      ? session.showAllCurrentItems
      : false;
  appState.sortNewestFirst =
    typeof session.sortNewestFirst === "boolean"
      ? session.sortNewestFirst
      : true;

  if (appState.sessionToken) {
    const expiresAt = Number(session.expiresAt) || Date.now() + SESSION_TTL_MS;
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        token: appState.sessionToken,
        name: appState.sessionName,
        role: appState.sessionRole,
        expiresAt,
        showAllCurrentItems: appState.showAllCurrentItems,
        sortNewestFirst: appState.sortNewestFirst,
      }),
    );
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  signOutButton.hidden = !appState.sessionToken;
  openModalButton.hidden = false;
  toggleSortButton.hidden = !appState.sessionToken;
  toggleSortButton.textContent = appState.sortNewestFirst
    ? "Show oldest first"
    : "Show newest first";
  toggleItemsButton.hidden =
    !appState.sessionToken || appState.sessionRole.toLowerCase() !== "assign";
  toggleItemsButton.textContent = appState.showAllCurrentItems
    ? "Show only my assignments"
    : "Show all current items";

  if (appState.sessionToken) {
    setHeaderMessage(
      `Signed in as ${appState.sessionName}${appState.sessionRole ? ` (${appState.sessionRole})` : ""}.`,
    );
  } else {
    setHeaderMessage("Track calls and releases from your spreadsheet.");
  }
}

function persistSessionPreferences() {
  if (!appState.sessionToken) {
    return;
  }

  const storedSession = getStoredSession();
  if (!storedSession) {
    return;
  }

  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      ...storedSession,
      showAllCurrentItems: appState.showAllCurrentItems,
      sortNewestFirst: appState.sortNewestFirst,
    }),
  );
}

function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const expiresAt = Number(parsed?.expiresAt);

    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function clearSession() {
  setSession({ token: "", name: "", role: "" });
}

function createActionFormData(fields) {
  const formData = new URLSearchParams(fields);

  if (appState.sessionToken) {
    formData.set("token", appState.sessionToken);
  }

  return formData;
}

function isAuthRequiredPayload(payload) {
  return payload?.authRequired === true;
}

function handleAuthRequired(message) {
  clearSession();
  listElement.innerHTML = "";
  loaderElement.style.display = "block";
  setStatusMessage(message || "Please sign in to continue.", true);
  setAuthModalOpen(true);
  showToast(message || "Please sign in again.", { type: "error" });
}

function normalizeForMatch(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isAssignedToCurrentUser(row) {
  const currentUser = normalizeForMatch(appState.sessionName);
  if (!currentUser) {
    return false;
  }

  const assigneeColumns = [7, 10, 12];
  return assigneeColumns.some(
    (index) => normalizeForMatch(row?.[index] ?? "") === currentUser,
  );
}

function getVisibleCallingsRows() {
  const rows = Array.isArray(appState.callings) ? appState.callings : [];
  if (rows.length <= 1) {
    return rows;
  }

  const role = appState.sessionRole.toLowerCase();
  if (role !== "assign" || appState.showAllCurrentItems) {
    return rows;
  }

  const [header, ...dataRows] = rows;
  const assignedRows = dataRows.filter(isAssignedToCurrentUser);
  return [header, ...assignedRows];
}

function renderCurrentCallingsView() {
  const role = appState.sessionRole.toLowerCase();
  const emptyMessage =
    role === "assign" && !appState.showAllCurrentItems
      ? "No current items are assigned to you."
      : "No callings found.";

  renderCards(getVisibleCallingsRows(), emptyMessage);
}

function applyData(data) {
  appState.units = Array.isArray(data.units) ? data.units : [];
  appState.admins = Array.isArray(data.admins) ? data.admins : [];
  appState.assigners = Array.isArray(data.assigners) ? data.assigners : [];
  appState.statuses = Array.isArray(data.statuses) ? data.statuses : [];
  appState.callings = Array.isArray(data.callings) ? data.callings : [];
  populateUnitOptions(appState.units);
  renderCurrentCallingsView();
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

function getApiUrl(action, options = {}) {
  const { direct = false } = options;

  if (!API_URL) {
    throw new Error(
      "Missing VITE_APPS_SCRIPT_URL. Add your Apps Script /exec URL to .env.",
    );
  }

  const url =
    import.meta.env.DEV && !direct
      ? new URL(DEV_API_PROXY_PATH, window.location.origin)
      : new URL(API_URL);

  if (action) {
    url.searchParams.set("action", action);
  }

  if (appState.sessionToken && !PUBLIC_API_ACTIONS.has(action)) {
    url.searchParams.set("token", appState.sessionToken);
  }

  return url;
}

function requestViaJsonp(action, params = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    beginBusy();
    const callbackName = `__stakeCallingsJsonp_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const url = getApiUrl(action, { direct: true });

    Object.entries(params).forEach(([key, value]) => {
      if (value != null) {
        url.searchParams.set(key, String(value));
      }
    });

    if (appState.sessionToken && !PUBLIC_API_ACTIONS.has(action)) {
      url.searchParams.set("token", appState.sessionToken);
    }

    url.searchParams.set("callback", callbackName);

    const script = document.createElement("script");
    let timeoutId;
    let isSettled = false;

    function cleanup() {
      if (isSettled) {
        return;
      }
      isSettled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      delete window[callbackName];
      endBusy();
    }

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP request failed to load."));
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("JSONP request timed out."));
    }, timeoutMs);

    script.src = url.toString();
    document.head.appendChild(script);
  });
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

function renderCards(rows, emptyMessage = "No callings found.") {
  const isAdminUser = appState.sessionRole.toLowerCase() === "admin";

  if (!Array.isArray(rows) || rows.length <= 1) {
    listElement.innerHTML = `<div class="card empty-state"><small>${escapeHtml(emptyMessage)}</small></div>`;
    return;
  }

  const dataRows = rows.slice(1);
  const orderedRows = appState.sortNewestFirst
    ? dataRows.slice().reverse()
    : dataRows;

  listElement.innerHTML = orderedRows
    .map((row) => {
      const rowType = String(row?.[1] ?? "")
        .trim()
        .toLowerCase();
      const isCall = rowType === "call";
      const isRelease = rowType === "release";
      const previousReleasedValue = String(row?.[9] ?? "")
        .trim()
        .toLowerCase();
      const isPreviousReleasedChecked =
        previousReleasedValue === "true" || previousReleasedValue === "yes";
      const isSpApprovedComplete = Boolean(row?.[5]);
      const isShcSustainedComplete = Boolean(row?.[6]);
      const isInterviewComplete = Boolean(row?.[8]);
      const isSettingApartComplete = Boolean(row?.[13]);

      return `
        <article class="card">
          <span class="type-badge ${isRelease ? "type-release" : "type-call"}">
            ${escapeHtml(row?.[1] ?? "Call")}
          </span>
          <div class="person-name">${escapeHtml(row?.[2] ?? "Unknown name")}</div>
          <div class="pos-text">${escapeHtml(row?.[3] ?? "No position")}</div>
          <div class="unit-text">${escapeHtml(row?.[4] ?? "No unit")}</div>
          <div class="approval-grid">
            <div class="approval-row ${isSpApprovedComplete ? "completion-complete" : "completion-pending"}">
              <label class="approval-item">
                <input
                  type="checkbox"
                  class="approval-checkbox"
                  data-action="toggle-approval"
                  data-id="${escapeHtml(row?.[0] ?? "")}" 
                  data-col-index="6"
                  ${row?.[5] ? "checked" : ""}
                />
                <span>S.Pres approved</span>
              </label>
              <small class="approval-date">${escapeHtml(row?.[5] || "")}</small>
            </div>
            <div class="approval-row ${isShcSustainedComplete ? "completion-complete" : "completion-pending"}">
              <label class="approval-item">
                <input
                  type="checkbox"
                  class="approval-checkbox"
                  data-action="toggle-approval"
                  data-id="${escapeHtml(row?.[0] ?? "")}" 
                  data-col-index="7"
                  ${row?.[6] ? "checked" : ""}
                />
                <span>SHC sustained</span>
              </label>
              <small class="approval-date">${escapeHtml(row?.[6] || "")}</small>
            </div>
          </div>
          <section class="interview-section ${isInterviewComplete ? "completion-complete" : "completion-pending"}">
            <label class="field-label interview-label" for="assignee-${escapeHtml(row?.[0] ?? "")}">Interview</label>
            <select
              id="assignee-${escapeHtml(row?.[0] ?? "")}"
              class="interviewer-select"
              data-action="set-interviewer"
              data-id="${escapeHtml(row?.[0] ?? "")}" 
            >
              ${renderAssigneeOptions(row?.[7] ?? "")}
            </select>
            <label class="approval-item interview-done">
              <input
                type="checkbox"
                class="approval-checkbox"
                data-action="toggle-approval"
                data-id="${escapeHtml(row?.[0] ?? "")}" 
                data-col-index="9"
                ${row?.[8] ? "checked" : ""}
              />
              <span>Done</span>
            </label>
            <small class="approval-date">${escapeHtml(row?.[8] || "")}</small>
            <div class="interviewIcon">
              <?xml version="1.0" encoding="UTF-8"?><svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><style>.cls-1{fill:#1f1f1f;}.cls-2{fill:none;stroke:#fff;stroke-miterlimit:10;stroke-width:2px;}</style></defs><path class="cls-2" d="M12.18,10.82c-3.75-3.59,2.06-9.4,5.65-5.65,3.75,3.59-2.06,9.4-5.65,5.65ZM7,20c-1.08-5.55,3.41-6.88,8-7,4.58.12,9.09,1.46,8,7H7Z"/><path class="cls-1" d="M12.18,10.82c-3.75-3.59,2.06-9.4,5.65-5.65,3.75,3.59-2.06,9.4-5.65,5.65ZM7,20c-1.08-5.55,3.41-6.88,8-7,4.58.12,9.09,1.46,8,7H7Z"/><path class="cls-2" d="M6.49,11.3c-.78-.78-1.18-1.73-1.18-2.83s.39-2.04,1.18-2.83c.78-.78,1.73-1.18,2.83-1.18s2.04.39,2.83,1.18,1.18,1.73,1.18,2.83-.39,2.04-1.18,2.83c-.78.78-1.73,1.18-2.83,1.18s-2.04-.39-2.83-1.18ZM1.32,20.47v-2.8c0-.57.15-1.09.44-1.56.29-.48.68-.84,1.16-1.09,1.03-.52,2.08-.9,3.15-1.16,1.07-.26,2.15-.39,3.25-.39s2.18.13,3.25.39c1.07.26,2.12.65,3.15,1.16.48.25.87.61,1.16,1.09s.44,1,.44,1.56v2.8H1.32Z"/><path class="cls-1" d="M6.49,11.3c-.78-.78-1.18-1.73-1.18-2.83s.39-2.04,1.18-2.83c.78-.78,1.73-1.18,2.83-1.18s2.04.39,2.83,1.18,1.18,1.73,1.18,2.83-.39,2.04-1.18,2.83c-.78.78-1.73,1.18-2.83,1.18s-2.04-.39-2.83-1.18ZM1.32,20.47v-2.8c0-.57.15-1.09.44-1.56.29-.48.68-.84,1.16-1.09,1.03-.52,2.08-.9,3.15-1.16,1.07-.26,2.15-.39,3.25-.39s2.18.13,3.25.39c1.07.26,2.12.65,3.15,1.16.48.25.87.61,1.16,1.09s.44,1,.44,1.56v2.8H1.32Z"/></svg>
          </section>
          ${
            isCall
              ? `<section class="interview-section ${isPreviousReleasedChecked ? "completion-complete" : "completion-pending"}">
            <label class="approval-item interview-done">
              <input
                type="checkbox"
                class="approval-checkbox"
                data-action="toggle-previous-released"
                data-id="${escapeHtml(row?.[0] ?? "")}" 
                ${isPreviousReleasedChecked ? "checked" : ""}
              />
              <span>Previous person released</span>
            </label>
          </section>`
              : ""
          }
          ${
            isCall
              ? `<section class="interview-section completion-pending">
            <label class="field-label interview-label" for="sus-assignee-${escapeHtml(row?.[0] ?? "")}">Sustaining</label>
            <select
              id="sus-assignee-${escapeHtml(row?.[0] ?? "")}"
              class="interviewer-select"
              data-action="set-sustaining-assignee"
              data-id="${escapeHtml(row?.[0] ?? "")}"
            >
              ${renderAssigneeOptions(row?.[10] ?? "")}
            </select>
            <button
              type="button"
              id="sus-units-toggle-${escapeHtml(row?.[0] ?? "")}"
              class="sustaining-units-toggle"
              data-action="toggle-sustaining-units-panel"
              data-id="${escapeHtml(row?.[0] ?? "")}"
              aria-expanded="false"
              aria-controls="sus-units-panel-${escapeHtml(row?.[0] ?? "")}"
            >
              Choose units
            </button>
            <div
              id="sus-units-panel-${escapeHtml(row?.[0] ?? "")}"
              class="sustaining-units-panel hidden"
              data-sustaining-units-panel="true"
            >
              <div class="sustaining-units-buttons">
                ${renderSustainingUnitButtons(row?.[0] ?? "", row?.[11] ?? "")}
              </div>
            </div>
            <small class="approval-date sustaining-units-summary">${escapeHtml(formatSustainingUnitsSummary(row?.[11] ?? ""))}</small>
            <div class="sustainIcon">
              <svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><style>.cls-1{fill:#fefefe;}</style></defs><g id="Layer_2"><path d="M17.64,25.88s4.09,1.94,6.36,1.94,5.81-.41,10.32,1.13,3.68,4.4,3.79,3.07.61,8.7.61,8.7l-29.17.82-.2-9.72s-2.35-5.83-3.07-8.29.41-7.67.41-7.67c0,0,1.33-9.7,3.07-9.35,0,0,2.46-1.92,1.84,3-.56,4.52,2.24,12.92,2.46,13,0,0,2,2.57,3.58,3.38Z"/></g><path d="M8,42.5v-10.5c-1.3-3.03-2.2-5.49-2.7-7.38-.5-1.88-.75-3.78-.75-5.68s.24-3.97.73-6.1,1.16-4.15,2.03-6.05c.33-.73.78-1.29,1.33-1.68s1.16-.58,1.83-.58c.9,0,1.58.29,2.05.88.47.58.7,1.46.7,2.63v6.55c0,1.47.28,2.85.85,4.15s1.34,2.43,2.33,3.4,2.13,1.73,3.43,2.28,2.7.83,4.2.83c2.7,0,5.05.2,7.05.6s3.67.98,5,1.75,2.33,1.74,2.98,2.93.98,2.58.98,4.18v7.8H8ZM11,39.5h26v-4.8c0-1.1-.27-2.05-.8-2.85s-1.33-1.47-2.4-2-2.42-.93-4.05-1.2-3.55-.4-5.75-.4c-1.9,0-3.69-.36-5.38-1.08s-3.15-1.69-4.4-2.93c-1.25-1.23-2.24-2.68-2.98-4.35s-1.1-3.45-1.1-5.35v-6.5c-.77,1.5-1.39,3.24-1.88,5.23s-.73,3.88-.73,5.68c0,1.7.26,3.46.78,5.28.52,1.82,1.41,4.13,2.68,6.93v8.35ZM18.35,20.15c-1.57-1.57-2.35-3.45-2.35-5.65s.78-4.08,2.35-5.65,3.45-2.35,5.65-2.35,4.08.78,5.65,2.35,2.35,3.45,2.35,5.65-.78,4.08-2.35,5.65-3.45,2.35-5.65,2.35-4.08-.78-5.65-2.35ZM27.55,18.05c.97-.97,1.45-2.15,1.45-3.55s-.48-2.58-1.45-3.55-2.15-1.45-3.55-1.45-2.58.48-3.55,1.45-1.45,2.15-1.45,3.55.48,2.58,1.45,3.55,2.15,1.45,3.55,1.45,2.58-.48,3.55-1.45ZM16.5,42.5v-1.85c0-2.1.73-3.9,2.18-5.4s3.23-2.25,5.33-2.25h7.5v3h-7.5c-1.27,0-2.33.46-3.2,1.38-.87.92-1.3,2.01-1.3,3.28v1.85h-3Z"/><path class="cls-1" d="M24,33c-2.1,0-3.88.75-5.33,2.25-1.13,1.17-1.8,2.52-2.05,4.06-.31,1.23-.13,3.19-.13,3.19h1.63c.52,0,1.16,0,1.37,0,0,0-.18-1.59.17-3.09.19-.75.56-1.44,1.13-2.04.87-.92,1.93-1.38,3.2-1.38h7.5v-3h-7.5Z"/><path d="M24,19.5c1.4,0,2.58-.48,3.55-1.45s1.45-2.15,1.45-3.55-.48-2.58-1.45-3.55-2.15-1.45-3.55-1.45-2.58.48-3.55,1.45-1.45,2.15-1.45,3.55.48,2.58,1.45,3.55,2.15,1.45,3.55,1.45Z"/><circle cx="24.03" cy="14.47" r="5.9"/></svg>
          </section>`
              : ""
          }
          ${
            isCall
              ? `<section class="interview-section ${isSettingApartComplete ? "completion-complete" : "completion-pending"}">
            <label class="field-label interview-label" for="sa-assignee-${escapeHtml(row?.[0] ?? "")}">Setting apart</label>
            <select
              id="sa-assignee-${escapeHtml(row?.[0] ?? "")}"
              class="interviewer-select"
              data-action="set-setting-apart-assignee"
              data-id="${escapeHtml(row?.[0] ?? "")}" 
            >
              ${renderAssigneeOptions(row?.[12] ?? "")}
            </select>
            <label class="approval-item interview-done">
              <input
                type="checkbox"
                class="approval-checkbox"
                data-action="toggle-approval"
                data-id="${escapeHtml(row?.[0] ?? "")}" 
                data-col-index="14"
                ${row?.[13] ? "checked" : ""}
              />
              <span>Done</span>
            </label>
            <small class="approval-date">${escapeHtml(row?.[13] || "")}</small>
          </section>`
              : ""
          }
          <section class="interview-section completion-pending">
            <label class="field-label interview-label" for="status-${escapeHtml(row?.[0] ?? "")}">Status</label>
            <select
              id="status-${escapeHtml(row?.[0] ?? "")}"
              class="interviewer-select"
              data-action="set-status"
              data-id="${escapeHtml(row?.[0] ?? "")}" 
            >
              ${renderStatusOptions(row?.[14] ?? "")}
            </select>
            ${
              isAdminUser
                ? `<button
              type="button"
              class="archive-btn"
              data-action="archive-row"
              data-id="${escapeHtml(row?.[0] ?? "")}"
              title="Move this row to Archive"
            >
              Archive
            </button>`
                : ""
            }
          </section>
        </article>
      `;
    })
    .join("");
}

function renderAssigneeOptions(selectedAssignee) {
  const selected = String(selectedAssignee ?? "").trim();
  const names = Array.isArray(appState.assigners)
    ? appState.assigners.filter(Boolean)
    : [];

  if (selected && !names.includes(selected)) {
    names.push(selected);
  }

  return [
    `<option value="" ${selected ? "" : "selected"}>Unassigned</option>`,
    ...names.map(
      (name) =>
        `<option value="${escapeHtml(name)}" ${name === selected ? "selected" : ""}>${escapeHtml(name)}</option>`,
    ),
  ].join("");
}

function renderSustainingUnitOptions(selectedUnitsString) {
  const savedUnits = String(selectedUnitsString ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const units = Array.isArray(appState.units)
    ? appState.units.filter(Boolean)
    : [];
  return units
    .map(
      (unit) =>
        `<option value="${escapeHtml(unit)}" ${savedUnits.includes(unit) ? "selected" : ""}>${escapeHtml(unit)}</option>`,
    )
    .join("");
}

function parseSelectedUnits(selectedUnitsString) {
  return String(selectedUnitsString ?? "")
    .split(",")
    .map((unit) => unit.trim())
    .filter(Boolean);
}

function formatSustainingUnitsSummary(selectedUnitsString) {
  const savedUnits = parseSelectedUnits(selectedUnitsString);
  return savedUnits.length > 0 ? savedUnits.join(", ") : "No units selected.";
}

function renderSustainingUnitButtons(rowId, selectedUnitsString) {
  const savedUnits = parseSelectedUnits(selectedUnitsString);
  const units = Array.isArray(appState.units)
    ? appState.units.filter(Boolean)
    : [];

  return units
    .map((unit) => {
      const isSelected = savedUnits.includes(unit);
      return `<button
        type="button"
        class="sustaining-unit-chip ${isSelected ? "selected" : ""}"
        data-action="toggle-sustaining-unit"
        data-id="${escapeHtml(rowId ?? "")}"
        data-unit="${escapeHtml(unit)}"
        aria-pressed="${isSelected ? "true" : "false"}"
      >${escapeHtml(unit)}</button>`;
    })
    .join("");
}

function renderStatusOptions(selectedStatus) {
  const selected = String(selectedStatus ?? "").trim();
  const statuses = Array.isArray(appState.statuses)
    ? appState.statuses.filter(Boolean)
    : [];

  return [
    `<option value="" ${selected ? "" : "selected"}>Select status...</option>`,
    ...statuses.map(
      (status) =>
        `<option value="${escapeHtml(status)}" ${status === selected ? "selected" : ""}>${escapeHtml(status)}</option>`,
    ),
  ].join("");
}

async function loadAuthOptions() {
  const parsePayload = (payload) => {
    console.log(
      "[Stake Callings] Auth options payload:",
      JSON.stringify(payload),
    );
    if (payload?.success !== true) {
      throw new Error(payload?.error || "Unable to load sign-in names.");
    }

    const users = Array.isArray(payload.users) ? payload.users : [];
    console.log("[Stake Callings] Auth users loaded:", users);
    appState.authUsers = users;
    populateAuthUserOptions(users);
    return users;
  };

  try {
    const response = await fetch(getApiUrl("authOptions"), {
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    parsePayload(await response.json());
  } catch (error) {
    console.warn(
      "[Stake Callings] Auth options fetch failed, retrying with JSONP:",
      error,
    );
    const fallbackPayload = await requestViaJsonp("authOptions");
    parsePayload(fallbackPayload);
  }
}

async function submitLogin(payload) {
  const formData = createActionFormData({
    action: "login",
    name: payload.name,
    password: payload.password,
  });

  try {
    const response = await fetch(getApiUrl(), {
      method: "POST",
      redirect: "follow",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Sign-in failed (${response.status})`);
    }

    const result = await response.json();
    if (result?.success !== true || !result?.token || !result?.user?.name) {
      throw new Error(result?.error || "Unable to sign in.");
    }

    return result;
  } catch (error) {
    const isFetchFailure =
      error instanceof TypeError ||
      String(error?.message || "")
        .toLowerCase()
        .includes("failed to fetch");

    if (!isFetchFailure) {
      throw error;
    }

    const fallbackResult = await requestViaJsonp("login", {
      name: payload.name,
      password: payload.password,
    });

    if (
      fallbackResult?.success !== true ||
      !fallbackResult?.token ||
      !fallbackResult?.user?.name
    ) {
      throw new Error(fallbackResult?.error || "Compatibility sign-in failed.");
    }

    return fallbackResult;
  }
}

async function loadData() {
  if (!isApiConfigured()) {
    loadDemoData(
      "Apps Script URL not configured yet. Replace YOUR_DEPLOYMENT_ID in .env to connect live data.",
    );
    return;
  }

  try {
    const formData = createActionFormData({
      action: "initialData",
    });

    const response = await fetch(getApiUrl(), {
      method: "POST",
      redirect: "follow",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    const data = await response.json();
    console.log("[Stake Callings] Apps Script response:", JSON.stringify(data));

    if (isAuthRequiredPayload(data)) {
      handleAuthRequired(data.error);
      throw new Error(data.error || "Authentication required.");
    }

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
    if (
      String(error?.message || "")
        .toLowerCase()
        .includes("authentication required") ||
      String(error?.message || "")
        .toLowerCase()
        .includes("session has expired")
    ) {
      throw error;
    }

    console.warn(
      "[Stake Callings] POST fetch failed, retrying with JSONP:",
      error,
    );

    try {
      const jsonpData = await requestViaJsonp("initialData");
      console.log(
        "[Stake Callings] Apps Script JSONP response:",
        JSON.stringify(jsonpData),
      );

      if (isAuthRequiredPayload(jsonpData)) {
        handleAuthRequired(jsonpData.error);
        throw new Error(jsonpData.error || "Authentication required.");
      }

      const hasData =
        Array.isArray(jsonpData.callings) && jsonpData.callings.length > 0;
      const isSuccess =
        jsonpData.success === true ||
        (jsonpData.success === undefined && hasData);

      if (!isSuccess) {
        throw new Error(
          jsonpData.error ||
            `Apps Script JSONP returned no usable data. Raw: ${JSON.stringify(jsonpData)}`,
        );
      }

      appState.usingDemoData = false;
      applyData(jsonpData);
      setHeaderMessage("Track calls and releases from your spreadsheet.");
      loaderElement.style.display = "none";
      showToast("Connected using compatibility mode.", { type: "success" });
    } catch (jsonpError) {
      loadDemoData(`API error: ${jsonpError.message}`);
    }
  }
}

async function submitCalling(payload) {
  if (!isApiConfigured() || appState.usingDemoData) {
    throw new Error(
      "Live saving is not available in demo mode. Add your deployed Apps Script /exec URL to .env first.",
    );
  }

  const formData = createActionFormData({
    action: "saveCalling",
    timestamp: payload.timestamp,
    type: payload.type,
    name: payload.name,
    position: payload.position,
    unit: payload.unit,
  });

  const isExplicitSaveSuccess = (result) =>
    result === true ||
    result === "Success" ||
    result?.success === true ||
    result?.status === "Success";

  const isLikelyInitialDataPayload = (result) =>
    result && Array.isArray(result.callings) && Array.isArray(result.units);

  try {
    const response = await fetch(getApiUrl(), {
      method: "POST",
      redirect: "follow",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Save failed (${response.status})`);
    }

    const result = await response.json();
    console.log("[Stake Callings] Save POST response:", JSON.stringify(result));

    const postSucceeded = isExplicitSaveSuccess(result);

    if (!postSucceeded) {
      if (isLikelyInitialDataPayload(result)) {
        throw new Error(
          "Save endpoint returned list data instead of save confirmation. Please redeploy the latest Apps Script web app version.",
        );
      }
      throw new Error(result.error || "Unable to save item.");
    }
  } catch (error) {
    const isFetchFailure =
      error instanceof TypeError ||
      String(error?.message || "")
        .toLowerCase()
        .includes("failed to fetch");

    if (!isFetchFailure) {
      throw error;
    }

    console.warn(
      "[Stake Callings] POST save failed, retrying with GET fallback:",
      error,
    );

    const fallbackResult = await requestViaJsonp("saveCalling", {
      timestamp: payload.timestamp,
      type: payload.type,
      name: payload.name,
      position: payload.position,
      unit: payload.unit,
    });
    console.log(
      "[Stake Callings] Save GET fallback response:",
      JSON.stringify(fallbackResult),
    );

    const fallbackSucceeded = isExplicitSaveSuccess(fallbackResult);

    if (!fallbackSucceeded) {
      if (isLikelyInitialDataPayload(fallbackResult)) {
        throw new Error(
          "Compatibility save hit a non-save endpoint. Redeploy Apps Script so doGet(action=saveCalling) is available.",
        );
      }
      throw new Error(
        fallbackResult.error ||
          `Fallback save failed in Apps Script. Raw: ${JSON.stringify(fallbackResult)}`,
      );
    }

    showToast("Saved using compatibility mode.", { type: "success" });
  }
}

async function submitApprovalToggle(payload) {
  if (!isApiConfigured() || appState.usingDemoData) {
    throw new Error("Approval updates are unavailable in demo mode.");
  }

  const formData = createActionFormData({
    action: "toggleApproval",
    id: payload.id,
    colIndex: String(payload.colIndex),
    isChecked: payload.isChecked ? "true" : "false",
  });

  try {
    const response = await fetch(getApiUrl(), {
      method: "POST",
      redirect: "follow",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Approval update failed (${response.status})`);
    }

    const result = await response.json();
    if (result?.success !== true) {
      throw new Error(result?.error || "Unable to update approval status.");
    }
  } catch (error) {
    const isFetchFailure =
      error instanceof TypeError ||
      String(error?.message || "")
        .toLowerCase()
        .includes("failed to fetch");

    if (!isFetchFailure) {
      throw error;
    }

    const fallbackResult = await requestViaJsonp("toggleApproval", {
      id: payload.id,
      colIndex: payload.colIndex,
      isChecked: payload.isChecked,
    });

    if (fallbackResult?.success !== true) {
      throw new Error(
        fallbackResult?.error || "Compatibility approval update failed.",
      );
    }
  }
}

async function submitInterviewAssignee(payload) {
  if (!isApiConfigured() || appState.usingDemoData) {
    throw new Error(
      "Interview assignment updates are unavailable in demo mode.",
    );
  }

  const formData = createActionFormData({
    action: "setInterviewAssignee",
    id: payload.id,
    assignee: payload.assignee,
  });

  try {
    const response = await fetch(getApiUrl(), {
      method: "POST",
      redirect: "follow",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Interview assignment failed (${response.status})`);
    }

    const result = await response.json();
    if (result?.success !== true) {
      throw new Error(
        result?.error || "Unable to update interview assignment.",
      );
    }
  } catch (error) {
    const isFetchFailure =
      error instanceof TypeError ||
      String(error?.message || "")
        .toLowerCase()
        .includes("failed to fetch");

    if (!isFetchFailure) {
      throw error;
    }

    const fallbackResult = await requestViaJsonp("setInterviewAssignee", {
      id: payload.id,
      assignee: payload.assignee,
    });

    if (fallbackResult?.success !== true) {
      throw new Error(
        fallbackResult?.error || "Compatibility interview assignment failed.",
      );
    }
  }
}

async function submitPreviousReleasedToggle(payload) {
  if (!isApiConfigured() || appState.usingDemoData) {
    throw new Error("Previous-release updates are unavailable in demo mode.");
  }

  const formData = createActionFormData({
    action: "setPreviousReleased",
    id: payload.id,
    isChecked: payload.isChecked ? "true" : "false",
  });

  try {
    const response = await fetch(getApiUrl(), {
      method: "POST",
      redirect: "follow",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Previous-release update failed (${response.status})`);
    }

    const result = await response.json();
    if (result?.success !== true) {
      throw new Error(result?.error || "Unable to update previous release.");
    }
  } catch (error) {
    const isFetchFailure =
      error instanceof TypeError ||
      String(error?.message || "")
        .toLowerCase()
        .includes("failed to fetch");

    if (!isFetchFailure) {
      throw error;
    }

    const fallbackResult = await requestViaJsonp("setPreviousReleased", {
      id: payload.id,
      isChecked: payload.isChecked,
    });

    if (fallbackResult?.success !== true) {
      throw new Error(
        fallbackResult?.error ||
          "Compatibility previous-release update failed.",
      );
    }
  }
}

async function submitSustainingAssignee(payload) {
  if (!isApiConfigured() || appState.usingDemoData) {
    throw new Error(
      "Sustaining assignment updates are unavailable in demo mode.",
    );
  }

  const formData = createActionFormData({
    action: "setSustainingAssignee",
    id: payload.id,
    assignee: payload.assignee,
  });

  try {
    const response = await fetch(getApiUrl(), {
      method: "POST",
      redirect: "follow",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Sustaining assignment failed (${response.status})`);
    }

    const result = await response.json();
    if (result?.success !== true) {
      throw new Error(
        result?.error || "Unable to update sustaining assignment.",
      );
    }
  } catch (error) {
    const isFetchFailure =
      error instanceof TypeError ||
      String(error?.message || "")
        .toLowerCase()
        .includes("failed to fetch");

    if (!isFetchFailure) {
      throw error;
    }

    const fallbackResult = await requestViaJsonp("setSustainingAssignee", {
      id: payload.id,
      assignee: payload.assignee,
    });

    if (fallbackResult?.success !== true) {
      throw new Error(
        fallbackResult?.error || "Compatibility sustaining assignment failed.",
      );
    }
  }
}

async function submitSustainingUnits(payload) {
  if (!isApiConfigured() || appState.usingDemoData) {
    throw new Error("Sustaining unit updates are unavailable in demo mode.");
  }

  const formData = createActionFormData({
    action: "setSustainingUnits",
    id: payload.id,
    units: payload.units,
  });

  try {
    const response = await fetch(getApiUrl(), {
      method: "POST",
      redirect: "follow",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Sustaining units update failed (${response.status})`);
    }

    const result = await response.json();
    if (result?.success !== true) {
      throw new Error(result?.error || "Unable to update sustaining units.");
    }
  } catch (error) {
    const isFetchFailure =
      error instanceof TypeError ||
      String(error?.message || "")
        .toLowerCase()
        .includes("failed to fetch");

    if (!isFetchFailure) {
      throw error;
    }

    const fallbackResult = await requestViaJsonp("setSustainingUnits", {
      id: payload.id,
      units: payload.units,
    });

    if (fallbackResult?.success !== true) {
      throw new Error(
        fallbackResult?.error ||
          "Compatibility sustaining units update failed.",
      );
    }
  }
}

async function submitSettingApartAssignee(payload) {
  if (!isApiConfigured() || appState.usingDemoData) {
    throw new Error(
      "Setting apart assignment updates are unavailable in demo mode.",
    );
  }

  const formData = createActionFormData({
    action: "setSettingApartAssignee",
    id: payload.id,
    assignee: payload.assignee,
  });

  try {
    const response = await fetch(getApiUrl(), {
      method: "POST",
      redirect: "follow",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Setting apart assignment failed (${response.status})`);
    }

    const result = await response.json();
    if (result?.success !== true) {
      throw new Error(
        result?.error || "Unable to update setting apart assignment.",
      );
    }
  } catch (error) {
    const isFetchFailure =
      error instanceof TypeError ||
      String(error?.message || "")
        .toLowerCase()
        .includes("failed to fetch");

    if (!isFetchFailure) {
      throw error;
    }

    const fallbackResult = await requestViaJsonp("setSettingApartAssignee", {
      id: payload.id,
      assignee: payload.assignee,
    });

    if (fallbackResult?.success !== true) {
      throw new Error(
        fallbackResult?.error ||
          "Compatibility setting apart assignment failed.",
      );
    }
  }
}

async function submitStatus(payload) {
  if (!isApiConfigured() || appState.usingDemoData) {
    throw new Error("Status updates are unavailable in demo mode.");
  }

  const formData = createActionFormData({
    action: "setStatus",
    id: payload.id,
    status: payload.status,
  });

  try {
    const response = await fetch(getApiUrl(), {
      method: "POST",
      redirect: "follow",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Status update failed (${response.status})`);
    }

    const result = await response.json();
    if (result?.success !== true) {
      throw new Error(result?.error || "Unable to update status.");
    }
  } catch (error) {
    const isFetchFailure =
      error instanceof TypeError ||
      String(error?.message || "")
        .toLowerCase()
        .includes("failed to fetch");

    if (!isFetchFailure) {
      throw error;
    }

    const fallbackResult = await requestViaJsonp("setStatus", {
      id: payload.id,
      status: payload.status,
    });

    if (fallbackResult?.success !== true) {
      throw new Error(
        fallbackResult?.error || "Compatibility status update failed.",
      );
    }
  }
}

async function submitArchiveRow(payload) {
  if (!isApiConfigured() || appState.usingDemoData) {
    throw new Error("Archive is unavailable in demo mode.");
  }

  const formData = createActionFormData({
    action: "archiveRow",
    id: payload.id,
  });

  try {
    const response = await fetch(getApiUrl(), {
      method: "POST",
      redirect: "follow",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Archive failed (${response.status})`);
    }

    const result = await response.json();
    if (result?.success !== true) {
      throw new Error(result?.error || "Unable to archive row.");
    }
  } catch (error) {
    const isFetchFailure =
      error instanceof TypeError ||
      String(error?.message || "")
        .toLowerCase()
        .includes("failed to fetch");

    if (!isFetchFailure) {
      throw error;
    }

    const fallbackResult = await requestViaJsonp("archiveRow", {
      id: payload.id,
    });

    if (fallbackResult?.success !== true) {
      throw new Error(fallbackResult?.error || "Compatibility archive failed.");
    }
  }
}

authFormElement.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    name: authUserElement.value.trim(),
    password: authPasswordElement.value,
  };

  if (!payload.name || !payload.password) {
    setAuthMessage("Please choose your name and enter the password.", true);
    return;
  }

  authSubmitButton.disabled = true;
  authSubmitButton.textContent = "Signing in...";
  setAuthMessage("");

  try {
    const result = await submitLogin(payload);
    setSession({
      token: result.token,
      name: result.user.name,
      role: result.user.role,
    });
    setAuthModalOpen(false);
    setStatusMessage("Loading callings...");
    await loadData();
    showToast("Signed in successfully.", { type: "success" });
  } catch (error) {
    setAuthMessage(error?.message || "Unable to sign in.", true);
  } finally {
    authSubmitButton.disabled = false;
    authSubmitButton.textContent = "Sign in";
  }
});

authShowPasswordElement?.addEventListener("change", () => {
  authPasswordElement.type = authShowPasswordElement.checked
    ? "text"
    : "password";
});

formElement.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    timestamp: new Date().toISOString(),
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

openModalButton.addEventListener("click", () => {
  if (!appState.sessionToken) {
    setAuthModalOpen(true);
    return;
  }

  setModalOpen(true);
});
closeModalButton.addEventListener("click", () => setModalOpen(false));
cancelButton.addEventListener("click", () => setModalOpen(false));
signOutButton.addEventListener("click", () => {
  clearSession();
  listElement.innerHTML = "";
  setStatusMessage("Signed out. Please sign in to continue.");
  setAuthModalOpen(true);
});

toggleItemsButton.addEventListener("click", () => {
  appState.showAllCurrentItems = !appState.showAllCurrentItems;
  toggleItemsButton.textContent = appState.showAllCurrentItems
    ? "Show only my assignments"
    : "Show all current items";
  persistSessionPreferences();
  renderCurrentCallingsView();
});

toggleSortButton.addEventListener("click", () => {
  appState.sortNewestFirst = !appState.sortNewestFirst;
  toggleSortButton.textContent = appState.sortNewestFirst
    ? "Show oldest first"
    : "Show newest first";
  persistSessionPreferences();
  renderCurrentCallingsView();
});

modalElement.addEventListener("click", (event) => {
  if (event.target === modalElement) {
    setModalOpen(false);
  }
});

listElement.addEventListener("change", async (event) => {
  const assigneeSelect = event.target.closest(
    'select[data-action="set-interviewer"]',
  );
  if (assigneeSelect) {
    const id = assigneeSelect.dataset.id?.trim();
    const assignee = assigneeSelect.value.trim();

    if (!id) {
      showToast("Unable to update assignee: missing row identifier.", {
        type: "error",
      });
      return;
    }

    assigneeSelect.disabled = true;
    try {
      await submitInterviewAssignee({ id, assignee });
      await loadData();
      showToast("Interview assignment updated.", { type: "success" });
    } catch (error) {
      showToast(error?.message || "Failed to update assignee.", {
        type: "error",
      });
    } finally {
      assigneeSelect.disabled = false;
    }

    return;
  }

  const sustainingAssigneeSelect = event.target.closest(
    'select[data-action="set-sustaining-assignee"]',
  );
  if (sustainingAssigneeSelect) {
    const id = sustainingAssigneeSelect.dataset.id?.trim();
    const assignee = sustainingAssigneeSelect.value.trim();

    if (!id) {
      showToast(
        "Unable to update sustaining assignee: missing row identifier.",
        {
          type: "error",
        },
      );
      return;
    }

    sustainingAssigneeSelect.disabled = true;
    try {
      await submitSustainingAssignee({ id, assignee });
      await loadData();
      showToast("Sustaining assignment updated.", { type: "success" });
    } catch (error) {
      showToast(error?.message || "Failed to update sustaining assignee.", {
        type: "error",
      });
    } finally {
      sustainingAssigneeSelect.disabled = false;
    }

    return;
  }

  const settingApartAssigneeSelect = event.target.closest(
    'select[data-action="set-setting-apart-assignee"]',
  );
  if (settingApartAssigneeSelect) {
    const id = settingApartAssigneeSelect.dataset.id?.trim();
    const assignee = settingApartAssigneeSelect.value.trim();

    if (!id) {
      showToast(
        "Unable to update setting apart assignee: missing row identifier.",
        {
          type: "error",
        },
      );
      return;
    }

    settingApartAssigneeSelect.disabled = true;
    try {
      await submitSettingApartAssignee({ id, assignee });
      await loadData();
      showToast("Setting apart assignment updated.", { type: "success" });
    } catch (error) {
      showToast(error?.message || "Failed to update setting apart assignee.", {
        type: "error",
      });
    } finally {
      settingApartAssigneeSelect.disabled = false;
    }

    return;
  }

  const statusSelect = event.target.closest('select[data-action="set-status"]');
  if (statusSelect) {
    const id = statusSelect.dataset.id?.trim();
    const status = statusSelect.value.trim();

    if (!id) {
      showToast("Unable to update status: missing row identifier.", {
        type: "error",
      });
      return;
    }

    statusSelect.disabled = true;
    try {
      await submitStatus({ id, status });
      await loadData();
      showToast("Status updated.", { type: "success" });
    } catch (error) {
      showToast(error?.message || "Failed to update status.", {
        type: "error",
      });
    } finally {
      statusSelect.disabled = false;
    }

    return;
  }

  const previousReleasedCheckbox = event.target.closest(
    'input[data-action="toggle-previous-released"]',
  );
  if (previousReleasedCheckbox) {
    const id = previousReleasedCheckbox.dataset.id?.trim();
    const isChecked = previousReleasedCheckbox.checked;

    if (!id) {
      previousReleasedCheckbox.checked = !isChecked;
      showToast("Unable to update previous release: missing row identifier.", {
        type: "error",
      });
      return;
    }

    previousReleasedCheckbox.disabled = true;
    try {
      await submitPreviousReleasedToggle({ id, isChecked });
      await loadData();
      showToast("Previous release updated.", { type: "success" });
    } catch (error) {
      previousReleasedCheckbox.checked = !isChecked;
      showToast(error?.message || "Failed to update previous release.", {
        type: "error",
      });
    } finally {
      previousReleasedCheckbox.disabled = false;
    }

    return;
  }

  const checkbox = event.target.closest('input[data-action="toggle-approval"]');
  if (!checkbox) {
    return;
  }

  const id = checkbox.dataset.id?.trim();
  const colIndex = Number(checkbox.dataset.colIndex);
  const isChecked = checkbox.checked;

  if (!id || !Number.isFinite(colIndex)) {
    checkbox.checked = !isChecked;
    showToast("Unable to update this row: missing row identifier.", {
      type: "error",
    });
    return;
  }

  checkbox.disabled = true;
  try {
    await submitApprovalToggle({ id, colIndex, isChecked });
    await loadData();
    showToast("Approval updated.", { type: "success" });
  } catch (error) {
    checkbox.checked = !isChecked;
    showToast(error?.message || "Failed to update approval.", {
      type: "error",
    });
  } finally {
    checkbox.disabled = false;
  }
});

listElement.addEventListener("click", async (event) => {
  const sustainingUnitsToggle = event.target.closest(
    'button[data-action="toggle-sustaining-units-panel"]',
  );
  if (sustainingUnitsToggle) {
    const id = sustainingUnitsToggle.dataset.id?.trim();
    const panel = id ? document.getElementById(`sus-units-panel-${id}`) : null;
    if (!panel) {
      return;
    }

    const isHidden = panel.classList.toggle("hidden");
    sustainingUnitsToggle.setAttribute("aria-expanded", String(!isHidden));
    sustainingUnitsToggle.textContent = isHidden
      ? "Choose units"
      : "Hide units";
    return;
  }

  const sustainingUnitChip = event.target.closest(
    'button[data-action="toggle-sustaining-unit"]',
  );
  if (sustainingUnitChip) {
    const id = sustainingUnitChip.dataset.id?.trim();
    const unit = sustainingUnitChip.dataset.unit?.trim();

    if (!id || !unit) {
      showToast("Unable to update sustaining units: missing row identifier.", {
        type: "error",
      });
      return;
    }

    const panel = document.getElementById(`sus-units-panel-${id}`);
    const chips = panel
      ? Array.from(
          panel.querySelectorAll(
            'button[data-action="toggle-sustaining-unit"]',
          ),
        )
      : [];
    const selectedUnits = chips
      .filter((chip) => chip.classList.contains("selected"))
      .map((chip) => chip.dataset.unit?.trim())
      .filter(Boolean);

    const isCurrentlySelected =
      sustainingUnitChip.classList.contains("selected");
    const nextUnits = isCurrentlySelected
      ? selectedUnits.filter((selectedUnit) => selectedUnit !== unit)
      : selectedUnits.concat(unit);

    sustainingUnitChip.disabled = true;
    try {
      await submitSustainingUnits({ id, units: nextUnits.join(", ") });
      await loadData();
      showToast("Sustaining units updated.", { type: "success" });
    } catch (error) {
      showToast(error?.message || "Failed to update sustaining units.", {
        type: "error",
      });
    } finally {
      sustainingUnitChip.disabled = false;
    }

    return;
  }

  const archiveBtn = event.target.closest('button[data-action="archive-row"]');
  if (!archiveBtn) {
    return;
  }

  if (appState.sessionRole.toLowerCase() !== "admin") {
    showToast("Only admins can archive rows.", { type: "error" });
    return;
  }

  const id = archiveBtn.dataset.id?.trim();

  if (!id) {
    showToast("Unable to archive: missing row identifier.", {
      type: "error",
    });
    return;
  }

  if (!confirm("Are you sure you want to archive this row?")) {
    return;
  }

  archiveBtn.disabled = true;
  try {
    await submitArchiveRow({ id });
    await loadData();
    showToast("Row archived.", { type: "success" });
  } catch (error) {
    showToast(error?.message || "Failed to archive row.", {
      type: "error",
    });
  } finally {
    archiveBtn.disabled = false;
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

      // Ask the browser to check for a newer worker immediately on app load.
      await registration.update();

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

      // Re-check periodically while the app remains open.
      window.setInterval(
        () => {
          registration.update().catch(() => {});
        },
        60 * 60 * 1000,
      );
    } catch (error) {
      console.warn(
        "[Stake Callings] Service worker registration failed:",
        error,
      );
    }
  });
}

registerServiceWorker();

async function initializeApp() {
  openModalButton.hidden = true;

  if (!isApiConfigured()) {
    loadDemoData(
      "Apps Script URL not configured yet. Replace YOUR_DEPLOYMENT_ID in .env to connect live data.",
    );
    return;
  }

  setStatusMessage("Loading sign-in options...");

  try {
    await loadAuthOptions();
  } catch (error) {
    setStatusMessage(error?.message || "Unable to load sign-in options.", true);
    return;
  }

  const storedSession = getStoredSession();
  if (storedSession?.token) {
    setSession(storedSession);
    try {
      await loadData();
      return;
    } catch (error) {
      clearSession();
    }
  }

  listElement.innerHTML = "";
  setStatusMessage("Please sign in to continue.");
  setAuthModalOpen(true);
}

initializeApp();
