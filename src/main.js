// John Harford, April 2016

import "./style.css";

// 1. STABLE IMPORT (Avoids the 'Failed to resolve' error)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// 2. DATABASE SETUP
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const archiveTableName = import.meta.env.VITE_ARCHIVE_TABLE || "archive";
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

// 3. APP STATE
const appState = {
  callings: [],
  members: [],
  assignableNames: [],
  statusOptions: [],
  themeMode: "system",
  cardSortOrder: "newest",
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
  activeInlineEdit: null,
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

function canAssignMember(member) {
  if (!member || typeof member !== "object") {
    return false;
  }

  const roleType = String(member.role ?? "")
    .toLowerCase()
    .trim();

  return roleType === "assign";
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

function getSystemThemeMode() {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  return "light";
}

function getResolvedThemeMode(mode) {
  if (mode === "system") {
    return getSystemThemeMode();
  }

  return mode === "dark" ? "dark" : "light";
}

function applyThemeMode(mode) {
  const storedMode =
    mode === "dark" || mode === "light" || mode === "system" ? mode : "system";

  const resolvedMode = getResolvedThemeMode(storedMode);

  appState.themeMode = storedMode;

  if (typeof document !== "undefined") {
    document.body.classList.toggle("dark-mode", resolvedMode === "dark");
  }

  localStorage.setItem("themeMode", storedMode);
}

if (typeof window !== "undefined") {
  const themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const handleSystemThemeChange = () => {
    if (appState.themeMode === "system") {
      applyThemeMode("system");
      renderHeader();
    }
  };

  if (typeof themeMediaQuery.addEventListener === "function") {
    themeMediaQuery.addEventListener("change", handleSystemThemeChange);
  } else if (typeof themeMediaQuery.addListener === "function") {
    themeMediaQuery.addListener(handleSystemThemeChange);
  }

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

function getSortedVisibleCallings() {
  const rows = [...getVisibleCallings()];

  rows.sort((a, b) => {
    const aTime = new Date(a?.created_at || a?.timestamp || 0).getTime();
    const bTime = new Date(b?.created_at || b?.timestamp || 0).getTime();
    return appState.cardSortOrder === "oldest" ? aTime - bTime : bTime - aTime;
  });

  return rows;
}

function formatReportHeader(title, count) {
  return `${title}\n${"=".repeat(title.length)}\nItems: ${count}`;
}

function isInlineEditingField(id, field) {
  return (
    appState.activeInlineEdit?.id === id &&
    appState.activeInlineEdit?.field === field
  );
}

function renderEditableCardField(row, field, tagName, style) {
  const label = field === "name" ? "name" : "position";
  const currentValue = String(row[field] || "");

  if (isInlineEditingField(row.id, field)) {
    return `
      <input
        type="text"
        class="inline-edit-input"
        data-inline-edit="true"
        value="${escapeHtml(currentValue)}"
        aria-label="Edit ${label}"
        onkeyup="window.handleInlineEditKeyup(event, '${row.id}', '${field}')"
        onblur="window.commitInlineEdit('${row.id}', '${field}', this.value)"
        style="${style}"
      />
    `;
  }

  return `
    <${tagName}
      class="editable-field"
      title="Click to edit ${label}"
      onclick="window.startInlineEdit('${row.id}', '${field}')"
      style="${style}"
    >${escapeHtml(currentValue)}</${tagName}>
  `;
}

function focusActiveInlineEdit() {
  if (typeof document === "undefined" || !appState.activeInlineEdit) {
    return;
  }

  window.requestAnimationFrame(() => {
    const input = document.querySelector("[data-inline-edit='true']");
    if (!input || document.activeElement === input) {
      return;
    }

    input.focus();
    input.select();
  });
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

function buildSustainSetApartReleaseReport(rows) {
  const unitsSet = new Set(rows.map((r) => r.unit).filter(Boolean));
  const units = Array.from(unitsSet).sort();

  const releases = rows.filter(
    (row) =>
      String(row.type || "").toUpperCase() === "RELEASE" &&
      String(row.status || "")
        .toLowerCase()
        .trim() !== "archived",
  );

  const toSustain = rows.filter(
    (row) =>
      String(row.type || "").toUpperCase() !== "RELEASE" &&
      String(row.status || "").trim() === "In Progress" &&
      isCompletedValue(row.interviewed) &&
      (isCompletedValue(row.sp_approved) || isCompletedValue(row.hc_sustained)),
  );

  const reportSections = [];

  const stakeReleases = releases.filter((r) => r.unit === "Stake");
  const stakeToSustain = toSustain.filter((r) => r.unit === "Stake");

  if (stakeReleases.length > 0 || stakeToSustain.length > 0) {
    reportSections.push(
      buildUnitSection("STAKE BUSINESS", stakeReleases, stakeToSustain),
    );
  }

  for (const unit of units) {
    if (unit === "Stake") continue;

    const unitReleases = releases.filter((r) => r.unit === unit);
    const unitToSustain = toSustain.filter((r) => r.unit === unit);

    if (unitReleases.length > 0 || unitToSustain.length > 0) {
      reportSections.push(
        buildUnitSection(unit.toUpperCase(), unitReleases, unitToSustain),
      );
    }
  }

  const totalItems = releases.length + toSustain.length;
  if (reportSections.length === 0) {
    return `${formatReportHeader("Sustain, Set Apart, and Release Report", 0)}\n\nNo members require sustaining, setting apart, or release at this time.`;
  }

  return `${formatReportHeader("Sustain, Set Apart, and Release Report", totalItems)}\n\n${reportSections.join("\n\n")}`;
}

function buildUnitSection(unitTitle, releases, toSustain) {
  const lines = [];
  lines.push(`${unitTitle}`);
  lines.push("-".repeat(unitTitle.length));

  if (releases.length > 0) {
    lines.push("RELEASE - Vote of Thanks for Service:");
    releases.forEach((row, index) => {
      lines.push(
        `  ${index + 1}. ${row.name || "(No name)"} — ${row.position || "(No position)"}`,
      );
    });
    lines.push("");
  }

  if (toSustain.length > 0) {
    lines.push("TO BE SUSTAINED:");
    toSustain.forEach((row, index) => {
      lines.push(
        `  ${index + 1}. ${row.name || "(No name)"} — ${row.position || "(No position)"}`,
      );
    });
  }

  return lines.join("\n");
}

function generateReport(type) {
  const rows = getVisibleCallings();

  if (type === "sustain-setapart-release") {
    return buildSustainSetApartReleaseReport(rows);
  }

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
    : `<p class="report-summary"></p>`;

  const actionButtons = appState.reportOutput
    ? `
      <button class="btn btn-secondary" onclick="window.copyReportToClipboard()">📋 Copy Report</button>
      <button class="btn btn-secondary" onclick="window.printReport()">🖨️ Print Report</button>
    `
    : "";

  reportsPage.innerHTML = `
    <section class="reports-header">
      <h2>Reports</h2>
      <p>SELECT REPORT THEN GENERATE</p>
    </section>

    <section class="report-actions">
    
      <select id="report-type" onchange="window.selectReportType(this.value)">
        <option value="sustain-setapart-release" ${appState.currentReportType === "sustain-setapart-release" ? "selected" : ""}>Sustain, Set Apart, and Release</option>
        <option value="awaiting-shc" ${appState.currentReportType === "awaiting-shc" ? "selected" : ""}>Calls/Releases Awaiting HC Sustaining</option>
        <option value="unassigned-assignments" ${appState.currentReportType === "unassigned-assignments" ? "selected" : ""}>Assignments Not Yet Made</option>
        <option value="assignments-by-person" ${appState.currentReportType === "assignments-by-person" ? "selected" : ""}>Assignments by Person</option>
        <option value="status-summary" ${appState.currentReportType === "status-summary" ? "selected" : ""}>Status Summary</option>
      </select>
      <button class="btn btn-primary" onclick="window.generateCurrentReport()">Generate Report</button>
    </section>

    <article class="card report-card">
      ${reportValue}
      ${actionButtons}
    </article>
  `;
}

function renderCurrentPage() {
  syncFabVisibility();

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

function isArchivedStatus(value) {
  return String(value).toLowerCase().trim() === "archived";
}

async function archiveCallingRecord(id, options = {}) {
  const { confirm = true } = options;

  if (!hasAdminPasswordAccess()) {
    alert("Archiving requires signing in with the admin password.");
    renderCurrentPage();
    return false;
  }

  const item = appState.callings.find((calling) => calling.id === id);
  if (!item) {
    alert("Could not find this item to archive.");
    renderCurrentPage();
    return false;
  }

  if (confirm) {
    const confirmed = window.confirm("Archive this item?");
    if (!confirmed) {
      renderCurrentPage();
      return false;
    }
  }

  // ✅ NEW: call RPC instead of insert/delete
  const { error } = await supabase.rpc("move_calling_to_archive", {
    row_id: id,
  });

  if (error) {
    console.error("Archive RPC error:", error);

    alert(`Failed to archive item: ${error.message}`);
    renderCurrentPage();
    return false;
  }

  // ✅ Update local state
  appState.callings = appState.callings.filter((calling) => calling.id !== id);

  renderCurrentPage();
  return true;
}

async function startApp() {
  const app = document.getElementById("app");

  const savedThemeMode = localStorage.getItem("themeMode") || "system";
  applyThemeMode(savedThemeMode);

  if (!supabase) {
    showFatalError(
      "Missing configuration",
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set for this build.",
    );
    return;
  }

  const stakePw = import.meta.env.VITE_STAKE_PW || "";
  const adminPw = import.meta.env.VITE_ADMIN_PW || "";
  if (!stakePw || !adminPw) {
    showFatalError(
      "Missing configuration",
      "VITE_STAKE_PW and VITE_ADMIN_PW must be set for this build.",
    );
    return;
  }

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
      .filter((m) => canAssignMember(m))
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

window.login = async function (e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const selectedName = formData.get("authName");
  const enteredPassword = formData.get("authPassword");

  const STAKE_PW = import.meta.env.VITE_STAKE_PW || "";
  const ADMIN_PW = import.meta.env.VITE_ADMIN_PW || "";

  const person = appState.members.find((m) => m.name === selectedName);

  if (!person) {
    alert("Please select a name from the list first!");
    return;
  }

  const sharedPasswordType = String(person.shared_password_type ?? "")
    .toLowerCase()
    .trim();

  const requiredType = sharedPasswordType === "admin" ? "admin" : "stake";
  const correctPassword = requiredType === "admin" ? ADMIN_PW : STAKE_PW;

  console.log(
    `[Stake Callings] Logging in as: ${selectedName} | shared_password_type=${sharedPasswordType || "(none)"} | expects=${requiredType}`,
  );

  if (enteredPassword.trim() === correctPassword) {
    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("currentUser", person.name);
    localStorage.setItem("userRole", person.role);
    localStorage.setItem("authPasswordType", requiredType);
    window.location.reload();
  } else {
    alert(
      `Access Denied. For ${selectedName}, you must use the ${requiredType} password ${ADMIN_PW}::: ${enteredPassword}.`,
    );
  }
};

function renderCards() {
  const list = document.getElementById("data-list");
  if (!list) return;

  const reportsPage = document.getElementById("reports-page");
  if (reportsPage) {
    reportsPage.classList.add("hidden");
  }

  list.classList.remove("hidden");

  const rowsToRender = getSortedVisibleCallings();

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
        <div style="background: ${isRelease ? "var(--banner-release-bg)" : "var(--banner-call-bg)"}; 
        padding: 10px; text-align: center; font-weight: 900; color: ${isRelease ? "var(--banner-release-text)" : "var(--banner-call-text)"};">
          ${isRelease ? "RELEASE" : "CALLING"}
        </div>

        <div style="padding: 18px;">
          ${renderEditableCardField(row, "name", "h2", "margin: 0; font-size: 1.6rem;")}
          ${renderEditableCardField(row, "position", "p", "color: var(--text-muted); margin: 4px 0;")}
          <p style="color: var(--unit-soft); font-weight: bold;">${row.unit}</p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 14px 0;">
            <label class="workflow-block ${row.sp_approved ? "done" : ""}" style="display: flex; flex-direction: column; gap: 6px; padding: 10px; background: ${row.sp_approved ? "var(--block-done)" : "var(--block-pending)"}; color: var(--workflow-text); border-radius: 12px; cursor: pointer;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <input type="checkbox" ${row.sp_approved ? "checked" : ""} onchange="window.updateField('${row.id}', 'sp_approved', this.checked)">
                <span style="font-weight: bold;">S.Pres Approved</span>
              </div>
              ${row.sp_approved_date ? `<span style="font-size: 0.75rem; color: var(--workflow-date); margin-left: 26px;">${new Date(row.sp_approved_date).toLocaleDateString()}</span>` : ""}
            </label>
            <label class="workflow-block ${row.hc_sustained ? "done" : ""}" style="display: flex; flex-direction: column; gap: 6px; padding: 10px; background: ${row.hc_sustained ? "var(--block-done)" : "var(--block-pending)"}; color: var(--workflow-text); border-radius: 12px; cursor: pointer;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <input type="checkbox" ${row.hc_sustained ? "checked" : ""} onchange="window.updateField('${row.id}', 'hc_sustained', this.checked)">
                <span style="font-weight: bold;">SHC Sustained</span>
              </div>
              ${row.hc_sustained_date ? `<span style="font-size: 0.75rem; color: var(--workflow-date); margin-left: 26px;">${new Date(row.hc_sustained_date).toLocaleDateString()}</span>` : ""}
            </label>
          </div>

            <button onclick="window.toggleDetails('${row.id}')" 
              style="width: 100%; padding: 10px; background: var(--surface-subtle); border: 1px solid var(--border); border-radius: 8px; font-weight: bold; color: var(--text-muted); cursor: pointer;">
            ${isExpanded ? "▲ Hide Details" : "▼ More Details"}
          </button>

           <div style="display: ${isExpanded ? "block" : "none"}; margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--border);">
             <p style="font-size: 0.8rem; color: var(--text-subtle); margin-bottom: 8px;">DETAILED STEPS:</p>
             <div style="background: var(--surface-panel); padding: 12px; border-radius: 10px; border: 1px solid var(--border);">
               <div style="display: grid; gap: 10px; margin-bottom: 10px;">
                  <div>
                    <label style="display: block; font-size: 0.75rem; color: var(--text-muted); font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Interview assigned to</label>
                    <select
                      onchange="window.updateAssignment('${row.id}', 'interview_by', this.value)"
                      ${canAssign ? "" : "disabled title='Admin password required for assignments'"}
                      style="width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--white); color: var(--text); font-size: 0.95rem;"
                    >
                      <option value="">Assignment pending...</option>
                      ${appState.assignableNames
                        .map(
                          (name) =>
                            `<option value="${name}" ${row.interview_by === name ? "selected" : ""}>${name}</option>`,
                        )
                        .join("")}
                    </select>
                  </div>

                  <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: ${row.interviewed ? "var(--success-soft)" : "var(--surface-muted)"}; color: var(--text); font-weight: 600; cursor: pointer;">
                    <input type="checkbox" ${row.interviewed ? "checked" : ""} onchange="window.updateField('${row.id}', 'interviewed', this.checked)">
                    <span>Interview completed</span>
                  </label>

                  ${
                    isRelease
                      ? ""
                      : `<label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: ${row.prev_release ? "var(--warning-soft)" : "var(--surface-muted)"}; color: var(--text); font-weight: 600; cursor: pointer;">
                    <input type="checkbox" ${row.prev_release ? "checked" : ""} onchange="window.updateField('${row.id}', 'prev_release', this.checked)">
                    <span>Reminder: verify previous release</span>
                  </label>`
                  }
                </div>

                ${
                  isRelease
                    ? ""
                    : `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border);">
                  <div style="margin-bottom: 10px;">
                    <label style="display: block; font-size: 0.75rem; color: var(--text-muted); font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Sustaining assigned to</label>
                    <select
                      onchange="window.updateAssignment('${row.id}', '${sustainingByField}', this.value)"
                      ${canAssign ? "" : "disabled title='Admin password required for assignments'"}
                      style="width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--white); color: var(--text); font-size: 0.95rem;"
                    >
                      <option value="">Assignment pending</option>
                      ${appState.assignableNames
                        .map(
                          (name) =>
                            `<option value="${name}" ${sustainingBy === name ? "selected" : ""}>${name}</option>`,
                        )
                        .join("")}
                    </select>
                  </div>

                  <button onclick="window.toggleSustainingUnits('${row.id}')" style="width: 100%; padding: 8px; background: var(--accent-soft); border: 1px solid var(--accent-border); border-radius: 8px; font-weight: 600; color: var(--accent-text); cursor: pointer; font-size: 0.9rem;">
                    ${appState.expandedSustainingIds.has(row.id) ? "▲ Hide" : "▼ Show"} Sustaining Units
                  </button>

                  ${
                    appState.expandedSustainingIds.has(row.id)
                      ? `
                    <div style="margin-top: 10px; padding: 10px; background: var(--surface-muted); border-radius: 8px;">
                      <p style="font-size: 0.75rem; color: var(--text-muted); font-weight: bold; margin: 0 0 10px 0; text-transform: uppercase;">Units to sustain</p>
                      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
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
                              style="padding: 7px 10px; border-radius: 20px; border: 1px solid var(--border); background: ${isSelected ? "var(--chip-selected-bg)" : "var(--white)"}; color: ${isSelected ? "var(--chip-selected-text)" : "var(--text)"}; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;"
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

                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border); display: grid; gap: 10px;">
                  <div>
                    <label style="display: block; font-size: 0.75rem; color: var(--text-muted); font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Setting apart assigned to</label>
                    <select
                      onchange="window.updateAssignment('${row.id}', '${settingApartByField}', this.value)"
                      ${canAssign ? "" : "disabled title='Admin password required for assignments'"}
                      style="width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--white); color: var(--text); font-size: 0.95rem;"
                    >Assignment pending...</option>
                      ${appState.assignableNames
                        .map(
                          (name) =>
                            `<option value="${name}" ${settingApartBy === name ? "selected" : ""}>${name}</option>`,
                        )
                        .join("")}
                    </select>
                  </div>

                  <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: ${settingApartDone ? "var(--success-soft)" : "var(--surface-muted)"}; color: var(--text); font-weight: 600; cursor: pointer;">
                    <input type="checkbox" ${settingApartDone ? "checked" : ""} onchange="window.updateField('${row.id}', '${settingApartDoneField}', this.checked)">
                    <span>Setting apart completed</span>
                  </label>

                  <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: ${lcrRecorded ? "var(--success-soft)" : "var(--surface-muted)"}; color: var(--text); font-weight: 600; cursor: pointer;">
                    <input type="checkbox" ${lcrRecorded ? "checked" : ""} onchange="window.updateField('${row.id}', '${lcrRecordedField}', this.checked)">
                    <span>Recorded in LCR</span>
                  </label>
                </div>
                `
                }

                <div style="margin: 10px 0 0 0;">
                  <label style="display: block; font-size: 0.75rem; color: var(--text-muted); font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Status</label>
                  <select
                    onchange="window.updateAssignment('${row.id}', 'status', this.value)"
                    style="width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--white); color: var(--text); font-size: 0.95rem;"
                  >
                    ${visibleStatusOptions
                      .map(
                        (status) =>
                          `<option value="${status}" ${currentStatus === status ? "selected" : ""}>${status}</option>`,
                      )
                      .join("")}
                  </select>

                  ${
                    hasAdminPasswordAccess()
                      ? `
                    <button
                      onclick="window.archiveCalling('${row.id}')"
                      style="margin-top: 8px; width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--danger-soft); color: var(--danger-text); font-weight: 700; cursor: pointer;"
                    >
                      Archive
                    </button>
`
                      : ""
                  }
                </div>
             </div>
          </div>
        </div>
      </article>
    `;
    })
    .join("");

  focusActiveInlineEdit();
}

window.toggleDetails = (id) => {
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

  if (sustaining.includes(unitName)) {
    sustaining = sustaining.filter((u) => u !== unitName);
  } else {
    sustaining.push(unitName);
  }

  item.units_sustained = sustaining;

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

  if (field === "status" && isArchivedStatus(value)) {
    await archiveCallingRecord(id, { confirm: true });
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

window.startInlineEdit = (id, field) => {
  if (!["name", "position"].includes(field)) {
    return;
  }

  if (!hasAdminPasswordAccess()) {
    alert("Editing records requires signing in with the admin password.");
    return;
  }

  const item = appState.callings.find((c) => c.id === id);
  if (!item) {
    alert("Could not find this record to edit.");
    return;
  }

  appState.activeInlineEdit = { id, field };
  renderCards();
};

window.cancelInlineEdit = () => {
  if (!appState.activeInlineEdit) {
    return;
  }

  appState.activeInlineEdit = null;
  renderCards();
};

window.handleInlineEditKeyup = (event, id, field) => {
  if (event.key === "Enter") {
    event.preventDefault();
    window.commitInlineEdit(id, field, event.target.value);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    window.cancelInlineEdit();
  }
};

window.commitInlineEdit = async (id, field, nextValue) => {
  if (
    !appState.activeInlineEdit ||
    appState.activeInlineEdit.id !== id ||
    appState.activeInlineEdit.field !== field
  ) {
    return;
  }

  const item = appState.callings.find((c) => c.id === id);
  if (!item) {
    appState.activeInlineEdit = null;
    renderCards();
    return;
  }

  const currentValue = String(item[field] || "");
  const label = field === "name" ? "name" : "position";
  const cleaned = String(nextValue).trim();
  if (!cleaned) {
    appState.activeInlineEdit = null;
    renderCards();
    return;
  }

  if (cleaned === currentValue) {
    appState.activeInlineEdit = null;
    renderCards();
    return;
  }

  const { error } = await supabase
    .from("callings")
    .update({ [field]: cleaned })
    .eq("id", id);

  if (error) {
    console.error(`Failed to update ${field}:`, error);
    alert(`Failed to update ${label}: ${error.message}`);
    return;
  }

  item[field] = cleaned;
  appState.activeInlineEdit = null;
  renderCurrentPage();
};

window.archiveCalling = async (id) => {
  await archiveCallingRecord(id, { confirm: true });
};

window.updateField = async (id, field, value) => {
  const updateData = {};
  const isSettingApartDoneField = [
    "set_apart",
    "setting_apart_done",
    "sa_done",
    "set_apart_done",
  ].includes(field);

  if (field === "interviewed" || isSettingApartDoneField) {
    updateData[field] = value ? new Date().toISOString() : null;
  } else {
    updateData[field] = value;
  }

  if (value === true) {
    const timestamp = new Date().toISOString();
    if (field === "sp_approved") {
      updateData.sp_approved_date = timestamp;
    } else if (field === "hc_sustained") {
      updateData.hc_sustained_date = timestamp;
    }
  } else if (value === false) {
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

window.toggleCardSortOrder = () => {
  appState.cardSortOrder =
    appState.cardSortOrder === "newest" ? "oldest" : "newest";
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

window.copyReportToClipboard = async () => {
  if (!appState.reportOutput) {
    alert("No report to copy.");
    return;
  }

  try {
    await navigator.clipboard.writeText(appState.reportOutput);
    alert("Report copied to clipboard!");
  } catch (err) {
    console.error("Failed to copy report:", err);
    alert("Failed to copy report to clipboard. Please try again.");
  }
};

window.printReport = () => {
  if (!appState.reportOutput) {
    alert("No report to print.");
    return;
  }

  const printWindow = window.open("", "", "width=800,height=600");
  printWindow.document.write(`
    <html>
      <head>
        <title>Report</title>
        <style>
          body {
            font-family: monospace;
            padding: 20px;
            line-height: 1.5;
          }
          pre {
            white-space: pre-wrap;
            word-wrap: break-word;
          }
        </style>
      </head>
      <body>
        <pre>${escapeHtml(appState.reportOutput)}</pre>
        
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
};

window.resetCacheAndReload = async () => {
  const confirmed = window.confirm(
    "Reset app cache and reload now? This will sign you out.",
  );
  if (!confirmed) return;

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) => registration.unregister()),
      );
    }

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn("Cache reset encountered an issue:", error);
  }

  localStorage.clear();
  window.location.reload();
};

function renderLogin() {
  document.getElementById("app").innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <h2>Sign In</h2>
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

  syncFabVisibility();
}

function updateFabDebugBadge() {
  const badge = document.getElementById("fab-debug-badge");
  if (badge) {
    badge.remove();
  }
}

function ensureResetCacheQuickAction() {
  let button = document.getElementById("reset-cache-quick-btn");
  if (!button) {
    button = document.createElement("button");
    button.id = "reset-cache-quick-btn";
    button.type = "button";
    button.textContent = "Reset Cache";
    button.onclick = () => window.resetCacheAndReload();
    Object.assign(button.style, {
      position: "fixed",
      right: "12px",
      bottom: "92px",
      zIndex: "2100",
      padding: "9px 12px",
      borderRadius: "8px",
      border: "1px solid #8b1e1e",
      background: "#c62828",
      color: "#fff",
      fontSize: "12px",
      fontWeight: "700",
      cursor: "pointer",
      boxShadow: "0 3px 10px rgba(0,0,0,0.25)",
    });
    document.body.appendChild(button);
  }

  return button;
}

function syncFabVisibility() {
  const fab = document.getElementById("add-calling-fab");
  const quickResetButton = ensureResetCacheQuickAction();
  const hasAuthenticatedShell = Boolean(document.querySelector(".main-header"));
  const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
  const shouldShowReset = hasAuthenticatedShell || isLoggedIn;

  quickResetButton.style.display = shouldShowReset ? "none" : "none";

  if (!fab) {
    updateFabDebugBadge();
    return;
  }

  const shouldShow = hasAuthenticatedShell && hasAdminPasswordAccess();
  fab.style.display = shouldShow ? "flex" : "none";
  fab.style.visibility = shouldShow ? "visible" : "hidden";

  updateFabDebugBadge();
}

function ensureCreateCallingUi() {
  const app = document.getElementById("app");
  if (!app) return;

  let fab = document.getElementById("add-calling-fab");
  if (!fab) {
    fab = document.createElement("button");
    fab.id = "add-calling-fab";
    fab.className = "fab";
    fab.type = "button";
    fab.setAttribute("aria-label", "Add new calling or release");
    fab.textContent = "+";
    fab.onclick = () => window.openCreateCallingModal();
  }

  if (fab.parentElement !== document.body) {
    document.body.appendChild(fab);
  }

  Object.assign(fab.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    width: "60px",
    height: "60px",
    zIndex: "1500",
    display: "flex",
    visibility: "visible",
    alignItems: "center",
    justifyContent: "center",
  });

  if (!document.getElementById("create-calling-modal")) {
    const modal = document.createElement("div");
    modal.id = "create-calling-modal";
    modal.className = "modal-overlay hidden";
    modal.innerHTML = `
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="create-calling-title">
        <div class="modal-header">
          <h2 id="create-calling-title">New Entry</h2>
          <button type="button" class="icon-button" aria-label="Close" onclick="window.closeCreateCallingModal()">×</button>
        </div>

        <form class="calling-form" onsubmit="window.submitNewCalling(event)">
          <label class="field-label" for="create-type">Type</label>
          <select id="create-type" name="type" required>
            <option value="CALL">Call</option>
            <option value="RELEASE">Release</option>
          </select>

          <label class="field-label" for="create-name">Name</label>
          <input id="create-name" name="name" type="text" placeholder="Full Name" required />

          <label class="field-label" for="create-position">Position</label>
          <input id="create-position" name="position" type="text" placeholder="Position" required />

          <label class="field-label" for="create-unit">Unit</label>
          <select id="create-unit" name="unit" required>
            <option value="" disabled selected>Select Unit...</option>
            ${appState.units.map((unit) => `<option value="${escapeHtml(unit)}">${escapeHtml(unit)}</option>`).join("")}
          </select>

          <p id="create-calling-message" class="form-message" aria-live="polite"></p>

          <div class="btn-group">
            <button type="button" class="btn btn-secondary" onclick="window.closeCreateCallingModal()">Cancel</button>
            <button id="create-calling-submit" type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </section>
    `;

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        window.closeCreateCallingModal();
      }
    });

    app.appendChild(modal);
  }

  syncFabVisibility();
  updateFabDebugBadge();
}

window.openCreateCallingModal = () => {
  if (!hasAdminPasswordAccess()) {
    alert("Creating entries requires signing in with the admin password.");
    return;
  }

  const modal = document.getElementById("create-calling-modal");
  if (!modal) return;

  const message = document.getElementById("create-calling-message");
  if (message) {
    message.textContent = "";
    message.classList.remove("error");
  }

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
};

window.closeCreateCallingModal = () => {
  const modal = document.getElementById("create-calling-modal");
  if (!modal) return;

  const form = modal.querySelector("form");
  if (form) {
    form.reset();
  }

  const message = document.getElementById("create-calling-message");
  if (message) {
    message.textContent = "";
    message.classList.remove("error");
  }

  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
};

window.submitNewCalling = async (event) => {
  event.preventDefault();

  if (!hasAdminPasswordAccess()) {
    alert("Creating entries requires signing in with the admin password.");
    return;
  }

  const form = event.target;
  const formData = new FormData(form);
  const submitButton = document.getElementById("create-calling-submit");
  const message = document.getElementById("create-calling-message");

  const payload = {
    type: String(formData.get("type") || "")
      .trim()
      .toUpperCase(),
    name: String(formData.get("name") || "").trim(),
    position: String(formData.get("position") || "").trim(),
    unit: String(formData.get("unit") || "").trim(),
    status: "In Progress",
  };

  if (!payload.type || !payload.name || !payload.position || !payload.unit) {
    if (message) {
      message.textContent = "Please complete all fields.";
      message.classList.add("error");
    }
    return;
  }

  if (message) {
    message.textContent = "Saving...";
    message.classList.remove("error");
  }

  if (submitButton) {
    submitButton.disabled = true;
  }

  const { data, error } = await supabase
    .from("callings")
    .insert([payload])
    .select("*")
    .single();

  if (submitButton) {
    submitButton.disabled = false;
  }

  if (error) {
    console.error("Create entry error:", error);
    if (message) {
      message.textContent = `Failed to save entry: ${error.message}`;
      message.classList.add("error");
    }
    return;
  }

  if (data) {
    appState.callings.unshift(data);
  } else {
    await fetchCallings();
  }

  window.closeCreateCallingModal();
  renderCurrentPage();
};

window.setThemeMode = (mode) => {
  applyThemeMode(mode);
  renderHeader();
};

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
  const sortLabel = appState.cardSortOrder === "newest" ? "Newest" : "Oldest";
  const pageToggleLabel =
    appState.currentPage === "callings" ? "Reports" : "Callings";
  const header = document.createElement("header");
  header.className = "main-header";
  const currentMode = appState.themeMode || "system";

  let activeClr;

  if (currentMode === "dark") {
    activeClr = "#5cb5f7";
  } else {
    activeClr = "#f75ced";
  }

  header.innerHTML = `
  <div class="main-header-left">
    <h1>Stake Callings<span>Christchurch</span></h1>
  </div>

  <div class="main-header-center">
    <div class="main-header-actions">
      <button onclick="window.togglePage()">${pageToggleLabel}</button>
      <button onclick="window.toggleCardSortOrder()">${sortLabel}</button>
      ${
        showScopeToggle
          ? `<button onclick="window.toggleCallingScope()">${scopeLabel}</button>`
          : ""
      }
      <button onclick="localStorage.clear(); location.reload();">Sign Out</button>
    </div>
  </div>

  <div class="themePicker">
  ${
    currentMode === "dark"
      ? `
    <div class="themeIcon" style="cursor: pointer;" onclick="window.setThemeMode('light')">
      <svg id="moon" xmlns="http://www.w3.org/2000/svg" fill="${activeClr}" viewBox="0 -960 960 960">
        <path d="M484-80q-84 0-157.5-32t-128-86.5Q144-253 112-326.5T80-484q0-146 93-257.5T410-880q-18 99 11 193.5T521-521q71 71 165.5 100T880-410q-26 144-138 237T484-80Zm0-80q88 0 163-44t118-121q-86-8-163-43.5T464-465q-61-61-97-138t-43-163q-77 43-120.5 118.5T160-484q0 135 94.5 229.5T484-160Zm-20-305Z"/>
      </svg>
    </div>
  `
      : `
    <div class="themeIcon" style="cursor: pointer;" onclick="window.setThemeMode('dark')">
      <svg id="sun" xmlns="http://www.w3.org/2000/svg" fill="${activeClr}" viewBox="0 -960 960 960">
        <path d="M440-760v-160h80v160h-80Zm266 110-55-55 112-115 56 57-113 113Zm54 210v-80h160v80H760ZM440-40v-160h80v160h-80ZM254-652 140-763l57-56 113 113-56 54Zm508 512L651-255l54-54 114 110-57 59ZM40-440v-80h160v80H40Zm157 300-56-57 112-112 29 27 29 28-114 114Zm113-170q-70-70-70-170t70-170q70-70 170-70t170 70q70 70 70 170t-70 170q-70 70-170 70t-170-70Zm283-57q47-47 47-113t-47-113q-47-47-113-47t-113 47q-47 47-47 113t47 113q47 47 113 47t113-47ZM480-480Z"/>
      </svg>
    </div>
  `
  }
</div>
`;
  app.prepend(header);

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

  ensureCreateCallingUi();
}

startApp().catch((error) => {
  console.error("Failed to start app:", error);
  showFatalError(
    "Failed to start app",
    error?.message || "Unexpected startup error.",
  );
});
