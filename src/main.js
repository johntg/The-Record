import "./style.css";
// import {
//   getCurrentUserName,
//   getRequiredPasswordType,
//   hasAdminPasswordAccess,
//   isLoggedInSession,
//   isStakePasswordSession,
//   setSessionAfterLogin,
// } from "./auth/session.js";
import {
  applyThemeMode,
  getSavedThemeMode,
  setupSystemThemeChangeListener,
} from "./ui/theme-controls.js";
import {
  renderHeader as renderHeaderUi,
  syncFabVisibility as syncFabVisibilityUi,
} from "./ui/header-controls.js";
import {
  closeCreateCallingModal as closeCreateCallingModalUi,
  ensureCreateCallingUi as ensureCreateCallingUiUi,
  openCreateCallingModal as openCreateCallingModalUi,
  submitNewCalling as submitNewCallingUi,
} from "./ui/create-calling.js";
import { createCardsRenderer } from "./ui/cards-renderer.js";
import { createCallingsActions } from "./actions/callings-actions.js";
import { generateReport } from "./reports/index.js";
import {
  escapeHtml,
  getAssignmentFieldCandidates,
  isCompletedValue,
  normalizeComparableName,
  normalizeStatusOptions,
  resolveLcrRecordedField,
  resolveSettingApartByField,
  resolveSettingApartDoneField,
  resolveSustainingByField,
} from "./utils/app-utils.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const concernEmailUrl = import.meta.env.VITE_CONCERN_EMAIL_URL || "";
const concernEmailToken = import.meta.env.VITE_CONCERN_EMAIL_TOKEN || "";

const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const appState = {
  callings: [],
  members: [],
  highCouncilNames: [],
  hcVotesByCalling: {},
  hcVotingTableAvailable: true,
  hcBypassAvailable: true,
  assignableNames: [],
  statusOptions: [],
  themeMode: "system",
  cardSortOrder: "newest",
  currentPage: "callings",
  currentReportType: "awaiting-shc",
  reportOutput: "",
  currentUser: null,
  currentMember: null,
  currentRole: null,
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
  expandedHcDetailsIds: new Set(),
  showAllCallingsForStake: false,
  activeInlineEdit: null,
};

function getCurrentRole() {
  return String(appState.currentRole || "")
    .toLowerCase()
    .trim();
}

function isAdminRole() {
  return getCurrentRole() === "admin";
}

function isStakeRole() {
  return getCurrentRole() === "stake";
}

function isAuthenticatedMember() {
  return !!appState.currentUser && !!appState.currentMember;
}

function getCurrentUserNameFromAuth() {
  return appState.currentMember?.name || "";
}

window.openReportInReader = function () {
  const content = appState.reportOutput || "";
  const base = import.meta.env.BASE_URL || "/";
  const url = `${base}report.html?content=${encodeURIComponent(content)}`;
  window.open(url, "_blank", "noopener,noreferrer");
};

async function applyHiddenVisibilityForRow(callingRow) {
  const personName = String(callingRow?.name || "").trim();
  if (!personName || !supabase) return;

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("name")
    .eq("name", personName)
    .maybeSingle();

  if (memberError) {
    console.error("Member lookup failed:", memberError);
    return;
  }

  if (!member) return;

  const { error: hideError } = await supabase
    .from("calling_hidden_for_members")
    .upsert([{ calling_id: callingRow.id, member_name: member.name }], {
      onConflict: "calling_id,member_name",
    });

  if (hideError) {
    console.error("Failed to apply hidden visibility:", hideError);
  }
}

function showFatalError(title, message) {
  if (typeof document === "undefined") return;

  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    <div class="card" style="padding: 20px; margin-top: 20px;">
      <h2 style="margin-top: 0;">${escapeHtml(title)}</h2>
      <p style="margin-bottom: 8px;">${escapeHtml(message)}</p>
    </div>
  `;
}

function canAssignMember(member) {
  if (!member || typeof member !== "object") {
    return false;
  }

  return member.can_be_assigned === true;
}

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

if (typeof window !== "undefined") {
  setupSystemThemeChangeListener(appState, () => {
    applyThemeMode("system", appState);
    renderHeader();
  });

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
  const currentUser = normalizeComparableName(getCurrentUserNameFromAuth());
  if (!currentUser) return false;

  return getAssignmentFieldCandidates().some((field) => {
    const assignedTo = normalizeComparableName(row[field]);
    return assignedTo && assignedTo === currentUser;
  });
}

function getVisibleCallings() {
  const currentUserKey = normalizeComparableName(getCurrentUserNameFromAuth());

  return appState.callings.filter((row) => {
    const rowNameKey = normalizeComparableName(row?.name);
    return !(currentUserKey && rowNameKey && currentUserKey === rowNameKey);
  });
}

function getHighCouncilEligibleNames() {
  return [...appState.highCouncilNames].sort((a, b) => a.localeCompare(b));
}

function getHighCouncilMajorityCount() {
  const eligibleCount = getHighCouncilEligibleNames().length;
  return eligibleCount > 0 ? Math.floor(eligibleCount / 2) + 1 : 0;
}

function getVoteValue(rawVote) {
  const normalized = String(rawVote || "")
    .toLowerCase()
    .trim();

  if (normalized === "sustain") return "sustain";
  if (normalized === "concern") return "concern";
  return "";
}

function getHighCouncilVoteSummary(callingId) {
  const eligibleNames = getHighCouncilEligibleNames();
  const eligibleByKey = new Map(
    eligibleNames.map((name) => [normalizeComparableName(name), name]),
  );

  const votes = Array.isArray(appState.hcVotesByCalling[callingId])
    ? appState.hcVotesByCalling[callingId]
    : [];

  const latestVoteByVoterKey = new Map();

  votes.forEach((voteRow) => {
    const voterName = String(voteRow?.voter_name || "").trim();
    const voterKey = normalizeComparableName(voterName);
    const vote = getVoteValue(voteRow?.vote);

    if (!voterKey || !vote || !eligibleByKey.has(voterKey)) {
      return;
    }

    const current = latestVoteByVoterKey.get(voterKey);
    const currentTime = current?.voted_at
      ? new Date(current.voted_at).getTime()
      : Number.NEGATIVE_INFINITY;
    const nextTime = voteRow?.voted_at
      ? new Date(voteRow.voted_at).getTime()
      : Number.NEGATIVE_INFINITY;

    if (!current || nextTime >= currentTime) {
      latestVoteByVoterKey.set(voterKey, {
        voter_name: eligibleByKey.get(voterKey),
        vote,
        voted_at: voteRow?.voted_at || null,
      });
    }
  });

  const sustainVoters = [];
  const concernVoters = [];

  latestVoteByVoterKey.forEach((entry) => {
    if (entry.vote === "sustain") {
      sustainVoters.push(entry.voter_name);
      return;
    }

    if (entry.vote === "concern") {
      concernVoters.push(entry.voter_name);
    }
  });

  sustainVoters.sort((a, b) => a.localeCompare(b));
  concernVoters.sort((a, b) => a.localeCompare(b));

  const votedKeys = new Set(latestVoteByVoterKey.keys());
  const pendingVoters = eligibleNames.filter(
    (name) => !votedKeys.has(normalizeComparableName(name)),
  );

  const majorityCount = getHighCouncilMajorityCount();
  const sustainCount = sustainVoters.length;
  const concernCount = concernVoters.length;

  return {
    eligibleCount: eligibleNames.length,
    majorityCount,
    sustainCount,
    concernCount,
    pendingCount: pendingVoters.length,
    sustainVoters,
    concernVoters,
    pendingVoters,
    currentUserVote:
      latestVoteByVoterKey.get(
        normalizeComparableName(getCurrentUserNameFromAuth()),
      )?.vote || "",
    canVote:
      isStakeRole() &&
      eligibleByKey.has(normalizeComparableName(getCurrentUserNameFromAuth())),
    isMajoritySustained: majorityCount > 0 && sustainCount >= majorityCount,
  };
}

function applyHighCouncilSummaryToCalling(calling) {
  if (!calling) return;

  const summary = getHighCouncilVoteSummary(calling.id);
  const isBypassEnabled = calling.hc_sustained_bypass === true;
  const wasSustained = isCompletedValue(calling.hc_sustained);

  calling.hc_sustained = summary.isMajoritySustained || isBypassEnabled;

  if ((summary.isMajoritySustained || isBypassEnabled) && !wasSustained) {
    calling.hc_sustained_date = new Date().toISOString();
  } else if (!summary.isMajoritySustained && !isBypassEnabled) {
    calling.hc_sustained_date = null;
  }
}

function applyHighCouncilSummaryToAllCallings() {
  appState.callings.forEach((calling) =>
    applyHighCouncilSummaryToCalling(calling),
  );
}

async function fetchHighCouncilVotes() {
  const { data, error } = await supabase
    .from("calling_hc_votes")
    .select("calling_id, voter_name, vote, voted_at");

  if (error) {
    appState.hcVotingTableAvailable = false;
    appState.hcVotesByCalling = {};

    if (error.code === "42P01") {
      console.warn(
        "High Council voting table not found yet. Run the SQL migration to enable per-member SHC voting.",
      );
      return;
    }

    console.error("Failed to fetch High Council votes:", error);
    return;
  }

  appState.hcVotingTableAvailable = true;

  const grouped = {};
  (data || []).forEach((row) => {
    const callingId = row?.calling_id;
    if (!callingId) return;

    if (!grouped[callingId]) {
      grouped[callingId] = [];
    }

    grouped[callingId].push(row);
  });

  appState.hcVotesByCalling = grouped;
}

async function fetchCallings() {
  const [{ data, error }] = await Promise.all([
    supabase
      .from("callings")
      .select("*")
      .order("created_at", { ascending: false }),
    fetchHighCouncilVotes(),
  ]);

  if (!error) {
    appState.callings = data || [];
    applyHighCouncilSummaryToAllCallings();
  }
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
      <button type="button" class="btn btn-secondary" onclick="window.copyReportToClipboard()">📋 Copy Report</button>
      <button type="button" class="btn btn-secondary" onclick="window.printReport()">🖨️ Print Report</button>
      <button type="button" class="btn btn-primary" onclick="window.openReportInReader()">READING VIEW</button>
    `
    : "";

  reportsPage.innerHTML = `
    <section class="reports-header">
      <h2>Reports</h2>
      <p>SELECT REPORT THEN GENERATE</p>
    </section>

    <section class="report-actions">
      <select id="report-type" onchange="window.selectReportType(this.value)">
        <option value="sustain-setapart-release" ${
          appState.currentReportType === "sustain-setapart-release"
            ? "selected"
            : ""
        }>Sustain, Set Apart, and Release</option>
        <option value="awaiting-shc" ${
          appState.currentReportType === "awaiting-shc" ? "selected" : ""
        }>Calls/Releases Awaiting HC Sustaining</option>
        <option value="unassigned-assignments" ${
          appState.currentReportType === "unassigned-assignments"
            ? "selected"
            : ""
        }>Assignments Not Yet Made</option>
        <option value="assignments-by-person" ${
          appState.currentReportType === "assignments-by-person"
            ? "selected"
            : ""
        }>Assignments by Person</option>
        <option value="status-summary" ${
          appState.currentReportType === "status-summary" ? "selected" : ""
        }>Status Summary</option>
      </select>
      <button type="button" class="btn btn-primary" onclick="window.generateCurrentReport()">Generate Report</button>
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

async function archiveCallingRecord(id, options = {}) {
  const { confirm = true } = options;

  if (!isAdminRole()) {
    alert("Only admins can archive items.");
    renderCurrentPage();
    return false;
  }

  const item = appState.callings.find((calling) => calling.id === id);
  if (!item) {
    alert("Could not find this item to archive.");
    renderCurrentPage();
    return false;
  }

  const isDeleteMistake = item.status === "Mistake: DELETE";

  if (confirm) {
    const message = isDeleteMistake
      ? `This item is marked "Mistake: DELETE".\n\nName: ${
          item.name || "(no name)"
        }\n\nPress OK to permanently remove it from the database.\nThis cannot be undone.`
      : "Archive this item?";

    const confirmed = window.confirm(message);

    if (!confirmed) {
      renderCurrentPage();
      return false;
    }
  }

  let error;

  if (isDeleteMistake) {
    const result = await supabase.rpc("delete_calling_permanently", {
      row_id: id,
    });
    error = result.error;

    if (error) {
      console.error("Permanent delete RPC error:", error);
      alert(`Failed to permanently delete item: ${error.message}`);
      renderCurrentPage();
      return false;
    }
  } else {
    const result = await supabase.rpc("move_calling_to_archive", {
      row_id: id,
    });
    error = result.error;

    if (error) {
      console.error("Archive RPC error:", error);
      alert(`Failed to archive item: ${error.message}`);
      renderCurrentPage();
      return false;
    }
  }

  appState.callings = appState.callings.filter((calling) => calling.id !== id);
  renderCurrentPage();
  return true;
}

async function sendConcernEmail(row) {
  if (!concernEmailUrl) {
    console.warn("Concern email URL not configured.");
    return {
      ok: false,
      skipped: true,
      error: "Missing VITE_CONCERN_EMAIL_URL",
    };
  }

  const payload = {
    token: concernEmailToken,
    callingId: row.id,
    personName: row.name || "",
    position: row.position || "",
    unit: row.unit || "",
    type: row.type || "",
    status: row.status || "",
    votedBy: getCurrentUserNameFromAuth(),
    votedAt: new Date().toISOString(),
    pageUrl: window.location.href,
  };

  console.log("Sending concern email payload:", payload);

  try {
    await fetch(concernEmailUrl, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    return { ok: true, opaque: true };
  } catch (error) {
    console.error("Concern email failed:", error);
    return { ok: false, error: error.message || "Unknown error" };
  }
}

const cardsRenderer = createCardsRenderer({
  appState,
  getSortedVisibleCallings,
  hasAdminPasswordAccess: isAdminRole,
  isStakePasswordSession: isStakeRole,
  getHighCouncilVoteSummary,
  resolveSustainingByField,
  resolveSettingApartByField,
  resolveSettingApartDoneField,
  resolveLcrRecordedField,
  isCompletedValue,
  escapeHtml,
});

function renderCards() {
  cardsRenderer.renderCards();
}

const callingsActions = createCallingsActions({
  appState,
  supabase,
  hasAdminPasswordAccess: isAdminRole,
  isStakePasswordSession: isStakeRole,
  getCurrentUserName: getCurrentUserNameFromAuth,
  normalizeComparableName,
  getHighCouncilVoteSummary,
  applyHighCouncilSummaryToCalling,
  getAssignmentFieldCandidates,
  renderCards,
  renderCurrentPage,
  archiveCallingRecord,
  applyHiddenVisibilityForRow,
  showConcernNoticeModal: () => window.showConcernNoticeModal(),
  sendConcernEmail,
});

window.showToast = (message) => {
  let toast = document.getElementById("app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("visible");

  setTimeout(() => {
    toast.classList.remove("visible");
  }, 2500);
};

window.toggleDetails = (id) => callingsActions.toggleDetails(id);
window.toggleSustainingUnits = (id) =>
  callingsActions.toggleSustainingUnits(id);
window.toggleHighCouncilDetails = (id) =>
  callingsActions.toggleHighCouncilDetails(id);
window.updateSustainedUnits = async (id, unitName) =>
  callingsActions.updateSustainedUnits(id, unitName);
window.clearHighCouncilVoteForVoter = async (id, voterName) =>
  callingsActions.clearHighCouncilVoteForVoter(id, voterName);
window.submitHighCouncilVote = async (id, vote) =>
  callingsActions.submitHighCouncilVote(id, vote);
window.setHighCouncilBypass = async (id, enabled) =>
  callingsActions.setHighCouncilBypass(id, enabled);
window.updateAssignment = async (id, field, value) =>
  callingsActions.updateAssignment(id, field, value);
window.startInlineEdit = (id, field) =>
  callingsActions.startInlineEdit(id, field);
window.cancelInlineEdit = () => callingsActions.cancelInlineEdit();
window.handleInlineEditKeyup = (event, id, field) =>
  callingsActions.handleInlineEditKeyup(event, id, field);
window.commitInlineEdit = async (id, field, nextValue) =>
  callingsActions.commitInlineEdit(id, field, nextValue);
window.archiveCalling = async (id) => callingsActions.archiveCalling(id);
window.updateField = async (id, field, value) =>
  callingsActions.updateField(id, field, value);

window.toggleCallingScope = () => {
  if (!isStakeRole()) {
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
  appState.reportOutput = generateReport(
    appState.currentReportType,
    getVisibleCallings(),
    {
      getHighCouncilVoteSummary,
      hcVotingTableAvailable: appState.hcVotingTableAvailable,
    },
  );
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
    await supabase.auth.signOut();
  } catch {
    // ignore auth signout failure during forced reset
  }

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

window.handleConcernClick = async (event, id) => {
  const button = event?.currentTarget;

  if (button) {
    button.classList.add("is-sending");
    button.textContent = "Sending";
  }

  try {
    await window.submitHighCouncilVote(id, "concern");

    const summary = getHighCouncilVoteSummary(id);
    const currentUserVote = summary.currentUserVote;

    if (button) {
      button.classList.remove("is-sending");

      if (currentUserVote === "concern") {
        button.classList.add("is-sent", "is-selected");
        button.textContent = "Concerned";
      } else {
        button.classList.remove("is-sent", "is-selected");
        button.textContent = "Concern";
      }
    }
  } catch (error) {
    console.error("Concern click failed:", error);

    if (button) {
      button.classList.remove("is-sending");
      button.textContent = "Concern";
    }

    alert("Failed to record concern.");
  }
};

function renderLogin() {
  document.getElementById("app").innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <div class="login-splash">
          <h1><span>The</span> Record</h1>
          <h3>From inspiration to setting apart</h3>
        </div>

        <form id="magic-link-form">
          <input
            id="email-input"
            type="email"
            placeholder="Email address"
            required
            class="loginEntry"
          />
          <button type="submit">Email me a sign-in link</button>
        </form>

        <p id="auth-message" class="form-message" aria-live="polite"></p>
      </div>
    </div>
  `;

  const form = document.getElementById("magic-link-form");
  const message = document.getElementById("auth-message");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email-input").value.trim();
    if (!email) return;

    message.textContent = "Sending sign-in link...";
    message.classList.remove("error");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    });

    if (error) {
      console.error("Magic link error:", error);
      message.textContent = error.message;
      message.classList.add("error");
      return;
    }

    message.textContent = "Check your email for the sign-in link.";
  });

  syncFabVisibility();
}

function ensureConcernNoticeModal() {
  let modal = document.getElementById("concern-notice-modal");
  if (modal) {
    return modal;
  }

  modal = document.createElement("div");
  modal.id = "concern-notice-modal";
  modal.className = "modal-overlay hidden";
  modal.innerHTML = `
    <section class="modal notice-modal" role="dialog" aria-modal="true" aria-labelledby="concern-notice-title">
      <div class="modal-header notice-modal-header">
        <h2 id="concern-notice-title">Concern Recorded</h2>
      </div>
      <div class="notice-modal-body">
        <p>
          You have indicated a concern. Please contact a member of the Stake Presidency as soon as possible.
        </p>
      </div>
      <div class="btn-group notice-modal-actions">
        <button type="button" class="btn btn-primary" onclick="window.closeConcernNoticeModal()">I understand</button>
      </div>
    </section>
  `;

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      window.closeConcernNoticeModal();
    }
  });

  document.body.appendChild(modal);
  return modal;
}

window.logout = async () => {
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.warn("Supabase sign out failed:", error);
  }

  localStorage.clear();
  window.location.reload();
};

window.showConcernNoticeModal = () => {
  const modal = ensureConcernNoticeModal();
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
};

window.closeConcernNoticeModal = () => {
  const modal = document.getElementById("concern-notice-modal");
  if (!modal) return;

  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
};

function syncFabVisibility() {
  syncFabVisibilityUi({
    hasAdminPasswordAccess: isAdminRole,
    isLoggedInSession: isAuthenticatedMember,
    onResetCache: () => window.resetCacheAndReload(),
  });
}

function ensureCreateCallingUi() {
  ensureCreateCallingUiUi({
    appState,
    escapeHtml,
    syncFabVisibility,
    onOpenCreateCallingModal: () => window.openCreateCallingModal(),
    onCloseCreateCallingModal: () => window.closeCreateCallingModal(),
  });
}

window.openCreateCallingModal = () => {
  openCreateCallingModalUi({ hasAdminPasswordAccess: isAdminRole });
};

window.closeCreateCallingModal = () => {
  closeCreateCallingModalUi({});
};

window.submitNewCalling = async (event) => {
  await submitNewCallingUi({
    event,
    hasAdminPasswordAccess: isAdminRole,
    supabase,
    appState,
    fetchCallings,
    applyHiddenVisibilityForRow,
    closeCreateCallingModal: () => window.closeCreateCallingModal(),
    renderCurrentPage,
  });
};

window.setThemeMode = (mode) => {
  applyThemeMode(mode, appState);
  renderHeader();
};

function renderHeader() {
  renderHeaderUi({
    appState,
    isStakePasswordSession: isStakeRole,
    ensureCreateCallingUi,
  });

  ensureConcernNoticeModal();
}

async function startApp() {
  const savedThemeMode = getSavedThemeMode();
  applyThemeMode(savedThemeMode, appState);

  if (!supabase) {
    showFatalError(
      "Missing configuration",
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set for this build.",
    );
    return;
  }

  const [membersResult, statusesResult] = await Promise.all([
    supabase.from("members").select("*"),
    supabase.from("status_options").select("*"),
  ]);

  const { data: members, error: membersError } = membersResult;
  const { data: statusRows, error: statusError } = statusesResult;

  if (membersError) {
    console.error("Error fetching members:", membersError);
    showFatalError(
      "Could not load app data",
      `The app could not fetch members from Supabase. ${membersError.message}`,
    );
    return;
  }

  appState.members = members || [];
  appState.statusOptions = normalizeStatusOptions(statusRows);

  if (statusError) {
    console.warn("Could not load status options:", statusError.message);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError && userError.name !== "AuthSessionMissingError") {
    console.error("Auth user lookup failed:", userError);
    renderLogin();
    return;
  }

  if (!user) {
    renderLogin();
    return;
  }

  const matchedMember =
    appState.members.find(
      (member) =>
        String(member.email || "")
          .trim()
          .toLowerCase() ===
        String(user.email || "")
          .trim()
          .toLowerCase(),
    ) || null;

  if (!matchedMember) {
    showFatalError(
      "Access denied",
      "Your email address is not listed in the members table.",
    );
    return;
  }

  appState.currentUser = user;
  appState.currentMember = matchedMember;
  appState.currentRole = String(matchedMember.role || "")
    .toLowerCase()
    .trim();

  appState.highCouncilNames = [
    ...new Set(
      appState.members
        .filter(
          (member) =>
            String(member.role || "")
              .toLowerCase()
              .trim() === "stake",
        )
        .map((member) => String(member.name ?? "").trim())
        .filter(Boolean),
    ),
  ];

  appState.assignableNames = [
    ...new Set(
      appState.members
        .filter((member) => canAssignMember(member))
        .map((member) => String(member.name ?? "").trim())
        .filter(Boolean),
    ),
  ];

  await fetchCallings();
  renderHeader();
  renderCurrentPage();
}

startApp().catch((error) => {
  console.error("Failed to start app:", error);
  showFatalError(
    "Failed to start app",
    error?.message || "Unexpected startup error.",
  );
});
