import "./style.css";

// 1. STABLE IMPORT (Avoids the 'Failed to resolve' error)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// 2. DATABASE SETUP
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (import.meta.env.DEV && typeof window !== "undefined") {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
  }

  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((key) => caches.delete(key));
    });
  }
}

if (!import.meta.env.DEV && typeof window !== "undefined") {
  const isGitHubPages = window.location.hostname.endsWith("github.io");
  if (isGitHubPages) {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
    }

    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys
          .filter(
            (key) =>
              key.includes("stake-callings") ||
              key.includes("DB-Stake-Callings"),
          )
          .forEach((key) => caches.delete(key));
      });
    }
  }
}

// 3. APP STATE (Preserving your Role & Member logic)
const appState = {
  callings: [],
  members: [], // Loaded from your 'members' table [cite: 1]
  assignableNames: [],
  statusOptions: [],
  currentPage: "callings",
  currentReportType: "awaiting-shc",
  reportOutput: "",
  units: [
    "Allenton Ward",
    "Ashburton Ward",
    "Avon River Ward",
    "Cashmere Ward",
    "Hagley Ward",
    "Mona Vale Ward",
    "Rangiora Ward",
    "Riccarton Ward",
    "Stake",
  ],
  expandedGridId: null,
  expandedSustainingIds: new Set(),
  showAllCallingsForStake: false,
};

function showFatalError(title, message) {
  if (typeof document === "undefined") {
    return;
  }

  const app = document.getElementById("app");
  if (!app) {
    return;
  }

  app.innerHTML = `
    <div class="card" style="padding: 20px; margin-top: 20px;">
      <h2 style="margin-top: 0;">${escapeHtml(title)}</h2>
      <p style="margin-bottom: 8px;">${escapeHtml(message)}</p>
    </div>
  `;
}

function resolveFirstField(row, candidates, fallback) {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return key;
    }
  }
  return fallback;
}

function resolveSettingApartByField(row) {
  return resolveFirstField(
    row,
    ["setting_apart_by", "sa_assign", "set_apart_by"],
    "setting_apart_by",
  );
}

function resolveSustainingByField(row) {
  return resolveFirstField(
    row,
    ["sustaining_by", "sus_assigned", "sus_assign", "sustain_by"],
    "sustaining_by",
  );
}

function resolveSettingApartDoneField(row) {
  return resolveFirstField(
    row,
    ["set_apart", "setting_apart_done", "sa_done", "set_apart_done"],
    "set_apart",
  );
}

function resolveLcrRecordedField(row) {
  return resolveFirstField(
    row,
    ["lcr_recorded", "recorded_in_lcr", "lcr_done"],
    "lcr_recorded",
  );
}

function isCompletedValue(value) {
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  const text = String(value).toLowerCase().trim();
  return text !== "" && text !== "false" && text !== "0";
}

function normalizeStatusOptions(rows) {
  if (!Array.isArray(rows)) return [];

  const values = rows
    .map((row) => {
      if (!row || typeof row !== "object") return "";
      return (
        row.status ?? row.name ?? row.label ?? row.value ?? row.option ?? ""
      );
    })
    .map((value) => String(value).trim())
    .filter(Boolean);

  return [...new Set(values)];
}

function getAuthPasswordType() {
  return (localStorage.getItem("authPasswordType") || "").toLowerCase();
}

function hasAdminPasswordAccess() {
  return getAuthPasswordType() === "admin";
}

function isStakePasswordSession() {
  return getAuthPasswordType() === "stake";
}

function getAssignmentFieldCandidates() {
  return [
    "interview_by",
    "sustaining_by",
    "sus_assigned",
    "sus_assign",
    "sustain_by",
    "setting_apart_by",
    "sa_assign",
    "set_apart_by",
  ];
}

function normalizeComparableName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    const message = event?.error?.message || event?.message || "Unknown error";
    console.error("Fatal runtime error:", event?.error || event);
    showFatalError("Application error", message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const message =
      reason?.message ||
      (typeof reason === "string" ? reason : "Unhandled async error");
    console.error("Unhandled promise rejection:", reason);
    showFatalError("Application error", message);
  });
}

function isAssignedToCurrentUser(row) {
  const currentUser = normalizeComparableName(
    localStorage.getItem("currentUser"),
  );
  if (!currentUser) return false;

  return getAssignmentFieldCandidates().some((field) => {
    const assignedTo = normalizeComparableName(row[field]);
    return assignedTo && assignedTo === currentUser;
  });
}

function getVisibleCallings() {
  return isStakePasswordSession() && !appState.showAllCallingsForStake
    ? appState.callings.filter((row) => isAssignedToCurrentUser(row))
    : appState.callings;
}

function formatReportHeader(title, count) {
  return `${title}\n${"=".repeat(title.length)}\nItems: ${count}`;
}

function buildAwaitingShcReport(rows) {
  const awaiting = rows.filter(
    (row) =>
      isCompletedValue(row.sp_approved) &&
      !isCompletedValue(row.hc_sustained) &&
      String(row.status || "")
        .toLowerCase()
        .trim() !== "archived",
  );

  if (!awaiting.length) {
    return `${formatReportHeader("Calls/Releases Awaiting HC Sustaining", 0)}\n\nNo calls or releases are currently awaiting High Council sustaining.`;
  }

  const body = awaiting
    .map((row, index) => {
      const itemType = String(row.type || "CALL").toUpperCase();
      return `${index + 1}. [${itemType}] ${row.name || "(No name)"} — ${row.position || "(No position)"} (${row.unit || "No unit"})`;
    })
    .join("\n");

  return `${formatReportHeader("Calls/Releases Awaiting HC Sustaining", awaiting.length)}\n\n${body}`;
}

function buildAssignmentsByPersonReport(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    getAssignmentFieldCandidates().forEach((field) => {
      const person = String(row[field] || "").trim();
      if (!person) return;

      const existing = grouped.get(person) || [];
      existing.push(
        `${row.name || "(No name)"} — ${row.position || "(No position)"} [${field}]`,
      );
      grouped.set(person, existing);
    });
  });

  if (!grouped.size) {
    return `${formatReportHeader("Assignments by Person", 0)}\n\nNo assignments found.`;
  }

  const sections = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([person, items]) => {
      const lines = items.map((item) => `  - ${item}`).join("\n");
      return `${person}\n${lines}`;
    })
    .join("\n\n");

  return `${formatReportHeader("Assignments by Person", grouped.size)}\n\n${sections}`;
}

function buildStatusSummaryReport(rows) {
  const counts = new Map();

  rows.forEach((row) => {
    const status = String(row.status || "In Progress").trim() || "In Progress";
    counts.set(status, (counts.get(status) || 0) + 1);
  });

  const lines = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `- ${status}: ${count}`)
    .join("\n");

  return `${formatReportHeader("Status Summary", rows.length)}\n\n${lines || "No callings found."}`;
}

function buildUnassignedAssignmentsReport(rows) {
  const steps = [
    {
      label: "Interview",
      fields: ["interview_by"],
      appliesTo: () => true,
    },
    {
      label: "Sustaining",
      fields: ["sustaining_by", "sus_assigned", "sus_assign", "sustain_by"],
      appliesTo: (row) => String(row.type || "").toUpperCase() !== "RELEASE",
    },
    {
      label: "Setting Apart",
      fields: ["setting_apart_by", "sa_assign", "set_apart_by"],
      appliesTo: (row) => String(row.type || "").toUpperCase() !== "RELEASE",
    },
  ];

  const grouped = new Map();
  steps.forEach((step) => grouped.set(step.label, []));

  rows.forEach((row) => {
    steps.forEach((step) => {
      if (!step.appliesTo(row)) return;

      const hasAssignment = step.fields.some((field) =>
        String(row[field] || "").trim(),
      );

      if (!hasAssignment) {
        grouped
          .get(step.label)
          .push(
            `[${String(row.type || "CALL").toUpperCase()}] ${row.name || "(No name)"} — ${row.position || "(No position)"} (${row.unit || "No unit"})`,
          );
      }
    });
  });

  const totalMissing = [...grouped.values()].reduce(
    (sum, items) => sum + items.length,
    0,
  );

  if (!totalMissing) {
    return `${formatReportHeader("Assignments Not Yet Made", 0)}\n\nAll applicable assignments have been made.`;
  }

  const sections = steps
    .map((step) => {
      const items = grouped.get(step.label) || [];
      if (!items.length) {
        return `${step.label} (0)\n  - None`;
      }

      const lines = items.map((item) => `  - ${item}`).join("\n");
      return `${step.label} (${items.length})\n${lines}`;
    })
    .join("\n\n");

  return `${formatReportHeader("Assignments Not Yet Made", totalMissing)}\n\n${sections}`;
}

function generateReport(type) {
  const rows = getVisibleCallings();

  if (type === "unassigned-assignments") {
    return buildUnassignedAssignmentsReport(rows);
  }

  if (type === "assignments-by-person") {
    return buildAssignmentsByPersonReport(rows);
  }

  if (type === "status-summary") {
    return buildStatusSummaryReport(rows);
  }

  return buildAwaitingShcReport(rows);
}

function renderReportsPage() {
  const list = document.getElementById("data-list");
  const reportsPage = document.getElementById("reports-page");
  if (!reportsPage) return;

  if (list) {
    list.classList.add("hidden");
  }

  reportsPage.classList.remove("hidden");

  const reportValue = appState.reportOutput
    ? `<pre class="report-summary">${escapeHtml(appState.reportOutput)}</pre>`
    : `<p class="report-summary">Choose a report type and click Generate Report.</p>`;

  reportsPage.innerHTML = `
    <section class="reports-header">
      <h2>Reports</h2>
      <p>Construct summary reports from visible callings.</p>
    </section>

    <section class="report-actions">
      <label class="field-label" for="report-type">Report type</label>
      <select id="report-type" onchange="window.selectReportType(this.value)">
        <option value="awaiting-shc" ${appState.currentReportType === "awaiting-shc" ? "selected" : ""}>Calls/Releases Awaiting HC Sustaining</option>
        <option value="unassigned-assignments" ${appState.currentReportType === "unassigned-assignments" ? "selected" : ""}>Assignments Not Yet Made</option>
        <option value="assignments-by-person" ${appState.currentReportType === "assignments-by-person" ? "selected" : ""}>Assignments by Person</option>
        <option value="status-summary" ${appState.currentReportType === "status-summary" ? "selected" : ""}>Status Summary</option>
      </select>
      <button class="btn btn-primary" onclick="window.generateCurrentReport()">Generate Report</button>
    </section>

    <article class="card report-card">
      ${reportValue}
    </article>
  `;
}

function renderCurrentPage() {
  if (appState.currentPage === "reports") {
    renderReportsPage();
    return;
  }

  renderCards();
}

function canUpdateAssignmentField(field) {
  const assignmentFields = new Set(getAssignmentFieldCandidates());

  if (!assignmentFields.has(field)) {
    return true;
  }

  return hasAdminPasswordAccess();
}

// 4. CORE LOGIC
async function startApp() {
  const app = document.getElementById("app");

  if (!supabase) {
    showFatalError(
      "Missing configuration",
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set for this build.",
    );
    return;
  }

  // Fetch members and status options from database
  const [membersResult, statusesResult] = await Promise.all([
    supabase.from("members").select("*"),
    supabase.from("status_options").select("*"),
  ]);

  const { data: members, error } = membersResult;
  const { data: statusRows, error: statusError } = statusesResult;

  if (error) {
    console.error("Error fetching members:", error);
    alert(`Database Error: ${error.message}`);
    showFatalError(
      "Could not load app data",
      `The app could not fetch members from Supabase. ${error.message}`,
    );
    return;
  }

  if (members) {
    appState.members = members;
    appState.assignableNames = members
      .filter((m) => m.role !== "viewer")
      .map((m) => m.name);
  }

  if (statusError) {
    console.warn("Could not load status options:", statusError.message);
  }

  appState.statusOptions = normalizeStatusOptions(statusRows);

  const isLoggedIn = localStorage.getItem("isLoggedIn");
  if (isLoggedIn) {
    await fetchCallings();
    renderHeader();
    renderCurrentPage();
  } else {
    renderLogin();
  }
}

async function fetchCallings() {
  const { data, error } = await supabase
    .from("callings")
    .select("*")
    .order("created_at", { ascending: false });
  if (!error) appState.callings = data;
}

// 5. LOGIN LOGIC (Restoring the Admin/Stake Password logic )
window.login = async function (e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const selectedName = formData.get("authName");
  const enteredPassword = formData.get("authPassword");

  // 1. Define the master passwords clearly
  const STAKE_PW = "stake2026";
  const ADMIN_PW = "admin789";

  // 2. Find the person in your loaded appState.members
  const person = appState.members.find((m) => m.name === selectedName);

  if (!person) {
    alert("Please select a name from the list first!");
    return;
  }

  // 3. Resolve required password type robustly.
  // Prefer explicit shared_password_type, but fall back to role when needed.
  const sharedPasswordType = String(person.shared_password_type ?? "")
    .toLowerCase()
    .trim();
  const roleType = String(person.role ?? "")
    .toLowerCase()
    .trim();

  const isAdminType =
    sharedPasswordType.includes("admin") ||
    (!sharedPasswordType && roleType.includes("admin"));

  const requiredType = isAdminType ? "admin" : "stake";
  const correctPassword = isAdminType ? ADMIN_PW : STAKE_PW;

  // DEBUG LOG - Open your console (F12) to see this!
  console.log(
    `[Stake Callings] Logging in as: ${selectedName} | role=${roleType || "(none)"} | shared_password_type=${sharedPasswordType || "(none)"} | expects=${requiredType}`,
  );

  if (enteredPassword.trim() === correctPassword) {
    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("currentUser", person.name);
    localStorage.setItem("userRole", person.role); // Sets 'admin', 'assign', or 'viewer'
    localStorage.setItem("authPasswordType", requiredType);
    window.location.reload();
  } else {
    alert(
      `Access Denied. For ${selectedName}, you must use the ${requiredType} password.`,
    );
  }
};
// 6. UI RENDERING (White Cards / Blue Blocks)
function renderCards() {
  const list = document.getElementById("data-list");
  if (!list) return;

  const reportsPage = document.getElementById("reports-page");
  if (reportsPage) {
    reportsPage.classList.add("hidden");
  }

  list.classList.remove("hidden");

  const rowsToRender = getVisibleCallings();

  if (!rowsToRender.length) {
    list.innerHTML = `
      <article class="card">
        <div style="padding: 25px; text-align: center; color: #666;">
          No assigned callings to display.
        </div>
      </article>
    `;
    return;
  }

  list.innerHTML = rowsToRender
    .map((row) => {
      const canAssign = hasAdminPasswordAccess();
      const isExpanded = appState.expandedGridId === row.id;
      const isRelease = row.type?.toUpperCase() === "RELEASE";
      const sustainingByField = resolveSustainingByField(row);
      const sustainingBy = row[sustainingByField] || "";
      const settingApartByField = resolveSettingApartByField(row);
      const settingApartDoneField = resolveSettingApartDoneField(row);
      const lcrRecordedField = resolveLcrRecordedField(row);
      const settingApartBy = row[settingApartByField] || "";
      const settingApartDone = isCompletedValue(row[settingApartDoneField]);
      const lcrRecorded = isCompletedValue(row[lcrRecordedField]);
      const currentStatus = (row.status || "In Progress").trim();
      const statusOptions = [...appState.statusOptions];
      if (currentStatus && !statusOptions.includes(currentStatus)) {
        statusOptions.unshift(currentStatus);
      }
      const visibleStatusOptions = hasAdminPasswordAccess()
        ? statusOptions
        : statusOptions.filter(
            (status) => status.toLowerCase().trim() !== "archived",
          );

      return `
      <article class="card">
        <div style="background: ${isRelease ? "#FFD43B" : "#4E5FF2"}; padding: 10px; text-align: center; font-weight: 900; color: ${isRelease ? "#000" : "#fff"};">
          ${isRelease ? "RELEASE" : "CALLING"}
        </div>

        <div style="padding: 25px;">
          <h2 style="margin: 0; font-size: 1.6rem;">${row.name}</h2>
          <p style="color: #666; margin: 4px 0;">${row.position}</p>
          <p style="color: #c24d7c; font-weight: bold;">${row.unit}</p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0;">
            <label class="workflow-block ${row.sp_approved ? "done" : ""}" style="display: flex; flex-direction: column; gap: 8px; padding: 15px; background: ${row.sp_approved ? "#d5e9f4" : "#eef7fb"}; border-radius: 12px; cursor: pointer;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <input type="checkbox" ${row.sp_approved ? "checked" : ""} onchange="window.updateField('${row.id}', 'sp_approved', this.checked)">
                <span style="font-weight: bold;">S.Pres Approved</span>
              </div>
              ${row.sp_approved_date ? `<span style="font-size: 0.75rem; color: #666; margin-left: 26px;">${new Date(row.sp_approved_date).toLocaleDateString()}</span>` : ""}
            </label>
            <label class="workflow-block ${row.hc_sustained ? "done" : ""}" style="display: flex; flex-direction: column; gap: 8px; padding: 15px; background: ${row.hc_sustained ? "#d5e9f4" : "#eef7fb"}; border-radius: 12px; cursor: pointer;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <input type="checkbox" ${row.hc_sustained ? "checked" : ""} onchange="window.updateField('${row.id}', 'hc_sustained', this.checked)">
                <span style="font-weight: bold;">SHC Sustained</span>
              </div>
              ${row.hc_sustained_date ? `<span style="font-size: 0.75rem; color: #666; margin-left: 26px;">${new Date(row.hc_sustained_date).toLocaleDateString()}</span>` : ""}
            </label>
          </div>

          <button onclick="window.toggleDetails('${row.id}')" 
                  style="width: 100%; padding: 12px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; font-weight: bold; color: #555; cursor: pointer;">
            ${isExpanded ? "▲ Hide Details" : "▼ Show Workflow Details"}
          </button>

          <div style="display: ${isExpanded ? "block" : "none"}; margin-top: 20px; padding-top: 20px; border-top: 1px dashed #ccc;">
             <p style="font-size: 0.8rem; color: #888; margin-bottom: 10px;">DETAILED STEPS:</p>
             <div style="background: #fdfdfd; padding: 15px; border-radius: 10px; border: 1px solid #eee;">
                <div style="display: grid; gap: 12px; margin-bottom: 14px;">
                  <div>
                    <label style="display: block; font-size: 0.75rem; color: #666; font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Interview assigned to</label>
                    <select
                      onchange="window.updateAssignment('${row.id}', 'interview_by', this.value)"
                      ${canAssign ? "" : "disabled title='Admin password required for assignments'"}
                      style="width: 100%; padding: 10px 12px; border: 1px solid #d7dbe3; border-radius: 8px; background: #fff; color: #333; font-size: 0.95rem;"
                    >
                      <option value="">Select interviewer...</option>
                      ${appState.assignableNames
                        .map(
                          (name) =>
                            `<option value="${name}" ${row.interview_by === name ? "selected" : ""}>${name}</option>`,
                        )
                        .join("")}
                    </select>
                  </div>

                  <label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; background: ${row.interviewed ? "#dff5e8" : "#f5f7fa"}; color: #333; font-weight: 600; cursor: pointer;">
                    <input type="checkbox" ${row.interviewed ? "checked" : ""} onchange="window.updateField('${row.id}', 'interviewed', this.checked)">
                    <span>Interview completed</span>
                  </label>

                  ${
                    isRelease
                      ? ""
                      : `<label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; background: ${row.prev_release ? "#fff2d8" : "#f5f7fa"}; color: #333; font-weight: 600; cursor: pointer;">
                    <input type="checkbox" ${row.prev_release ? "checked" : ""} onchange="window.updateField('${row.id}', 'prev_release', this.checked)">
                    <span>Reminder: verify previous release</span>
                  </label>`
                  }
                </div>

                ${
                  isRelease
                    ? ""
                    : `
                <div style="margin-top: 14px; padding-top: 14px; border-top: 1px dashed #e0e0e0;">
                  <div style="margin-bottom: 12px;">
                    <label style="display: block; font-size: 0.75rem; color: #666; font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Sustaining assigned to</label>
                    <select
                      onchange="window.updateAssignment('${row.id}', '${sustainingByField}', this.value)"
                      ${canAssign ? "" : "disabled title='Admin password required for assignments'"}
                      style="width: 100%; padding: 10px 12px; border: 1px solid #d7dbe3; border-radius: 8px; background: #fff; color: #333; font-size: 0.95rem;"
                    >
                      <option value="">Select assignee...</option>
                      ${appState.assignableNames
                        .map(
                          (name) =>
                            `<option value="${name}" ${sustainingBy === name ? "selected" : ""}>${name}</option>`,
                        )
                        .join("")}
                    </select>
                  </div>

                  <button onclick="window.toggleSustainingUnits('${row.id}')" style="width: 100%; padding: 10px; background: #e3f2fd; border: 1px solid #90caf9; border-radius: 8px; font-weight: 600; color: #1976d2; cursor: pointer; font-size: 0.9rem;">
                    ${appState.expandedSustainingIds.has(row.id) ? "▲ Hide" : "▼ Show"} Sustaining Units
                  </button>

                  ${
                    appState.expandedSustainingIds.has(row.id)
                      ? `
                    <div style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 8px;">
                      <p style="font-size: 0.75rem; color: #666; font-weight: bold; margin: 0 0 10px 0; text-transform: uppercase;">Units to sustain</p>
                      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${appState.units
                          .map((unit) => {
                            const selectedUnits = Array.isArray(
                              row.units_sustained,
                            )
                              ? row.units_sustained
                              : [];
                            const isSelected = selectedUnits.includes(unit);
                            return `
                            <button
                              onclick="window.updateSustainedUnits('${row.id}', '${unit}')"
                              style="padding: 8px 12px; border-radius: 20px; border: 1px solid #ccc; background: ${isSelected ? "#4CAF50" : "#fff"}; color: ${isSelected ? "#fff" : "#333"}; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;"
                            >
                              ${unit}
                            </button>
                          `;
                          })
                          .join("")}
                      </div>
                    </div>
                  `
                      : ""
                  }
                </div>

                <div style="margin-top: 14px; padding-top: 14px; border-top: 1px dashed #e0e0e0; display: grid; gap: 12px;">
                  <div>
                    <label style="display: block; font-size: 0.75rem; color: #666; font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Setting apart assigned to</label>
                    <select
                      onchange="window.updateAssignment('${row.id}', '${settingApartByField}', this.value)"
                      ${canAssign ? "" : "disabled title='Admin password required for assignments'"}
                      style="width: 100%; padding: 10px 12px; border: 1px solid #d7dbe3; border-radius: 8px; background: #fff; color: #333; font-size: 0.95rem;"
                    >
                      <option value="">Select assignee...</option>
                      ${appState.assignableNames
                        .map(
                          (name) =>
                            `<option value="${name}" ${settingApartBy === name ? "selected" : ""}>${name}</option>`,
                        )
                        .join("")}
                    </select>
                  </div>

                  <label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; background: ${settingApartDone ? "#dff5e8" : "#f5f7fa"}; color: #333; font-weight: 600; cursor: pointer;">
                    <input type="checkbox" ${settingApartDone ? "checked" : ""} onchange="window.updateField('${row.id}', '${settingApartDoneField}', this.checked)">
                    <span>Setting apart completed</span>
                  </label>

                  <label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; background: ${lcrRecorded ? "#dff5e8" : "#f5f7fa"}; color: #333; font-weight: 600; cursor: pointer;">
                    <input type="checkbox" ${lcrRecorded ? "checked" : ""} onchange="window.updateField('${row.id}', '${lcrRecordedField}', this.checked)">
                    <span>Recorded in LCR</span>
                  </label>
                </div>
                `
                }

                <div style="margin: 14px 0 0 0;">
                  <label style="display: block; font-size: 0.75rem; color: #666; font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Status</label>
                  <select
                    onchange="window.updateAssignment('${row.id}', 'status', this.value)"
                    style="width: 100%; padding: 10px 12px; border: 1px solid #d7dbe3; border-radius: 8px; background: #fff; color: #333; font-size: 0.95rem;"
                  >
                    ${visibleStatusOptions
                      .map(
                        (status) =>
                          `<option value="${status}" ${currentStatus === status ? "selected" : ""}>${status}</option>`,
                      )
                      .join("")}
                  </select>

                  <button
                    onclick="window.archiveCalling('${row.id}')"
                    ${hasAdminPasswordAccess() ? "" : "disabled title='Admin password required to archive'"}
                    style="margin-top: 10px; width: 100%; padding: 10px 12px; border: 1px solid #d7dbe3; border-radius: 8px; background: #fff3f3; color: #8b1e1e; font-weight: 700; cursor: ${hasAdminPasswordAccess() ? "pointer" : "not-allowed"};"
                  >
                    Archive
                  </button>
                </div>
             </div>
          </div>
        </div>
      </article>
    `;
    })
    .join("");
}

// 7. HELPER FUNCTIONS
window.toggleDetails = (id) => {
  // If the clicked card is already open, close it (null). Otherwise, open it.
  appState.expandedGridId = appState.expandedGridId === id ? null : id;
  renderCards();
};

window.toggleSustainingUnits = (id) => {
  if (appState.expandedSustainingIds.has(id)) {
    appState.expandedSustainingIds.delete(id);
  } else {
    appState.expandedSustainingIds.add(id);
  }
  renderCards();
};

window.updateSustainedUnits = async (id, unitName) => {
  const item = appState.callings.find((c) => c.id === id);
  if (!item) return;

  let sustaining = Array.isArray(item.units_sustained)
    ? [...item.units_sustained]
    : [];

  // Toggle the unit
  if (sustaining.includes(unitName)) {
    sustaining = sustaining.filter((u) => u !== unitName);
  } else {
    sustaining.push(unitName);
  }

  // Update local state
  item.units_sustained = sustaining;

  // Update database
  const { error } = await supabase
    .from("callings")
    .update({ units_sustained: sustaining })
    .eq("id", id);

  if (error) {
    console.error("Error updating sustaining units:", error);
    alert(`Failed to update sustaining units: ${error.message}`);
  } else {
    console.log("Sustaining units updated:", sustaining);
    renderCards();
  }
};

window.updateAssignment = async (id, field, value) => {
  if (!canUpdateAssignmentField(field)) {
    alert("Assignments require signing in with the admin password.");
    return;
  }

  if (
    field === "status" &&
    String(value).toLowerCase().trim() === "archived" &&
    !hasAdminPasswordAccess()
  ) {
    alert("Archiving requires signing in with the admin password.");
    return;
  }

  const { error } = await supabase
    .from("callings")
    .update({ [field]: value || null })
    .eq("id", id);

  if (error) {
    console.error("Assignment update error:", error);
    alert(`Failed to update assignment: ${error.message}`);
    return;
  }

  const item = appState.callings.find((c) => c.id === id);
  if (item) {
    item[field] = value || null;
  }

  renderCurrentPage();
};

window.archiveCalling = async (id) => {
  if (!hasAdminPasswordAccess()) {
    alert("Archiving requires signing in with the admin password.");
    return;
  }

  const confirmed = window.confirm("Archive this item?");
  if (!confirmed) {
    return;
  }

  await window.updateAssignment(id, "status", "Archived");
};

window.updateField = async (id, field, value) => {
  // Prepare the update object
  const updateData = {};
  const isSettingApartDoneField = [
    "set_apart",
    "setting_apart_done",
    "sa_done",
    "set_apart_done",
  ].includes(field);

  // interviewed uses one timestamp column: checked => timestamp, unchecked => null
  if (field === "interviewed" || isSettingApartDoneField) {
    updateData[field] = value ? new Date().toISOString() : null;
  } else {
    updateData[field] = value;
  }

  // Add timestamp when checkbox is checked
  if (value === true) {
    const timestamp = new Date().toISOString();
    if (field === "sp_approved") {
      updateData.sp_approved_date = timestamp;
    } else if (field === "hc_sustained") {
      updateData.hc_sustained_date = timestamp;
    }
  } else if (value === false) {
    // Clear timestamp when unchecked - use null for timestamp columns
    if (field === "sp_approved") {
      updateData.sp_approved_date = null;
    } else if (field === "hc_sustained") {
      updateData.hc_sustained_date = null;
    }
  }

  console.log("Updating:", id, "with data:", updateData);

  const { error } = await supabase
    .from("callings")
    .update(updateData)
    .eq("id", id);

  if (error) {
    console.error("Update error:", error);
    alert(`Failed to update: ${error.message}`);
  } else {
    console.log("Update successful");
    const item = appState.callings.find((c) => c.id === id);
    // Update all fields in local state
    Object.assign(item, updateData);
    renderCurrentPage();
  }
};

window.toggleCallingScope = () => {
  if (!isStakePasswordSession()) {
    return;
  }

  appState.showAllCallingsForStake = !appState.showAllCallingsForStake;
  renderHeader();
  renderCurrentPage();
};

window.togglePage = () => {
  appState.currentPage =
    appState.currentPage === "callings" ? "reports" : "callings";
  renderHeader();
  renderCurrentPage();
};

window.selectReportType = (value) => {
  appState.currentReportType = value;
};

window.generateCurrentReport = () => {
  appState.reportOutput = generateReport(appState.currentReportType);
  renderReportsPage();
};

function renderLogin() {
  document.getElementById("app").innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <h2>Stake Sign In</h2>
        <form onsubmit="window.login(event)">
          <select name="authName" required>
            <option value="">Select Name...</option>
            ${appState.members.map((m) => `<option value="${m.name}">${m.name}</option>`).join("")}
          </select>
          <input id="pw-input" type="password" name="authPassword" placeholder="Password" required>
          <label>
            <input
              type="checkbox"
              onchange="document.getElementById('pw-input').type = this.checked ? 'text' : 'password'"
            >
            Show password
          </label>
          <button type="submit">Login</button>
        </form>
      </div>
    </div>
  `;
}

function renderHeader() {
  const app = document.getElementById("app");
  const existingHeader = app.querySelector(".main-header");
  if (existingHeader) {
    existingHeader.remove();
  }

  const showScopeToggle = isStakePasswordSession();
  const scopeLabel = appState.showAllCallingsForStake
    ? "Show My Assignments"
    : "Show All Callings";
  const pageToggleLabel =
    appState.currentPage === "callings" ? "Open Reports" : "Open Callings";
  const header = document.createElement("header");
  header.className = "main-header";
  header.innerHTML = `
    <h1>Stake Callings</h1>
    <div class="main-header-actions">
      <button onclick="window.togglePage()">${pageToggleLabel}</button>
      ${
        showScopeToggle
          ? `<button onclick="window.toggleCallingScope()">${scopeLabel}</button>`
          : ""
      }
      <button onclick="localStorage.clear(); location.reload();">Sign Out</button>
    </div>
  `;
  app.prepend(header);

  // Create the data-list container if it doesn't exist
  if (!document.getElementById("data-list")) {
    const list = document.createElement("div");
    list.id = "data-list";
    app.appendChild(list);
  }

  if (!document.getElementById("reports-page")) {
    const reports = document.createElement("div");
    reports.id = "reports-page";
    reports.className = "reports-page hidden";
    app.appendChild(reports);
  }
}

startApp().catch((error) => {
  console.error("Failed to start app:", error);
  showFatalError(
    "Failed to start app",
    error?.message || "Unexpected startup error.",
  );
});
