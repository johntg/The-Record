import "./style.css";

import {
  applyThemeMode,
  getSavedThemeMode,
  setupSystemThemeChangeListener,
} from "./ui/theme-controls.js";
import { showModalAlert, showModalConfirm } from "./ui/modal-manager.js";
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
import { showAdminHubModal } from "./ui/admin-hub-modal.js";
import { createCallingsActions } from "./actions/callings-actions.js";
import { generateReport } from "./reports/index.js";
import {
  escapeHtml,
  getAssignmentFieldCandidates,
  isCompletedValue,
  normalizeComparableName,
  normalizeStatusOptions,
  resolveLcrRecordedField,
  resolveReleaseAnnouncedUnitsField,
  resolveSettingApartByField,
  resolveSettingApartDoneField,
  resolveSustainingByField,
} from "./utils/app-utils.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
const PUBLIC_VAPID_KEY =
  "BEic-4qILB0TTH_oPnkuEm9xgRcH2fvvX8pELjH7VgLxIU_gezvKZaEp_P95f7AF_wJ8VXvIM0_VwG8dpt60Vfg";

import createPushSubscription from "./utils/notifications.js";

// Single database with mode-based table prefixes
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL_PROD;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY_PROD;

const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Helper function to get table name based on current mode
// Members table is shared; all others use prod_ or train_ prefix
function getTableName(baseTable) {
  // Use appState.dbMode for consistency with delete/archive operations
  const dbMode =
    appState?.dbMode || localStorage.getItem("dbMode") || "production";

  // Shared tables (no prefix)
  if (baseTable === "members") {
    return "members";
  }

  // Prefixed tables based on mode
  const prefix = dbMode === "production" ? "prod" : "train";
  return `${prefix}_${baseTable}`;
}

console.log(`[App] Initializing in single database mode`);

// Apps Script email configuration (shared across production and training)
const concernEmailUrl = import.meta.env.VITE_CONCERN_EMAIL_URL || "";
const concernEmailToken = import.meta.env.VITE_CONCERN_EMAIL_TOKEN || "";

// Member provision configuration
const memberProvisionUrl = import.meta.env.VITE_MEMBER_PROVISION_URL || "";
const memberProvisionToken = import.meta.env.VITE_MEMBER_PROVISION_TOKEN || "";

const appState = {
  callings: [],
  archivedItems: [],
  members: [],
  highCouncilNames: [],
  hcVotesByCalling: {},
  hcVotingTableAvailable: true,
  archiveTableAvailable: true,
  hcBypassAvailable: true,
  assignableNames: [],
  statusOptions: [],
  themeMode: "system",
  cardSortOrder: "newest",
  currentPage: "callings",
  dbMode: localStorage.getItem("dbMode") || "production",
  currentReportType: "sustain-setapart-release",
  reportOutput: "",
  currentUser: null,
  currentMember: null,
  currentRole: null,
  hasPushSubscription: false,
  adminFormData: {
    action: "list",
    selectedMemberEmail: null,
  },
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
  expandedReleaseAnnouncementIds: new Set(),
  expandedHcDetailsIds: new Set(),
  showAllCallingsForStake: false,
  activeInlineEdit: null,
  isRefreshing: false,
};

function getCurrentRole() {
  return String(appState.currentRole || "")
    .toLowerCase()
    .trim();
}

function normalizeRole(value) {
  return String(value || "")
    .toLowerCase()
    .trim();
}

function hasRole(value, expectedRole) {
  return normalizeRole(value) === normalizeRole(expectedRole);
}

function isAdminRole() {
  return hasRole(getCurrentRole(), "admin");
}

function isStakeRole() {
  return hasRole(getCurrentRole(), "stake");
}

function isShcRole() {
  return hasRole(getCurrentRole(), "shc");
}

function isSuperAdmin() {
  return appState.currentMember?.super === true;
}

function isAuthenticatedMember() {
  return !!appState.currentUser && !!appState.currentMember;
}

function getCurrentUserNameFromAuth() {
  return appState.currentMember?.name || "";
}

async function userHasPushSubscription() {
  try {
    if (!("serviceWorker" in navigator)) return false;

    const registration = await navigator.serviceWorker.getRegistration();

    if (!registration) return false;

    const subscription = await registration.pushManager.getSubscription();

    return !!subscription;
  } catch (error) {
    console.error("Failed to check push subscription:", error);
    return false;
  }
}

const buildVersionState = {
  short: "",
  full: "",
};

function formatDateDdMmYy(value) {
  if (!value) return "";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);
}

function syncBodyModalOpenState() {
  const hasVisibleModal = Boolean(
    document.querySelector(".modal-overlay:not(.hidden)"),
  );

  if (hasVisibleModal) {
    document.body.classList.add("modal-open");
    return;
  }

  document.body.classList.remove("modal-open");
}

function ensureBuildVersionModal() {
  let modal = document.getElementById("build-version-modal");
  if (modal) {
    return modal;
  }

  modal = document.createElement("div");
  modal.id = "build-version-modal";
  modal.className = "modal-overlay hidden";
  modal.innerHTML = `
    <section class="modal version-info-modal" role="dialog" aria-modal="true" aria-labelledby="build-version-title">
      <div class="modal-header version-info-header">
        <h2 id="build-version-title">App Version</h2>
        <button type="button" class="icon-button" aria-label="Close version details" onclick="window.closeBuildVersionPopup()">×</button>
      </div>
      <div class="version-info-body">
        <p id="build-version-short" class="version-info-short"></p>
        <pre id="build-version-full" class="version-info-full"></pre>
      </div>
      <div class="btn-group version-info-actions">
        <button type="button" class="btn btn-primary" onclick="window.closeBuildVersionPopup()">Close</button>
      </div>
    </section>
  `;

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      window.closeBuildVersionPopup();
    }
  });

  document.body.appendChild(modal);
  return modal;
}

function showBuildVersionPopup() {
  const modal = ensureBuildVersionModal();
  const shortNode = modal.querySelector("#build-version-short");
  const fullNode = modal.querySelector("#build-version-full");

  const shortText = buildVersionState.short || "Version unavailable";
  const fullText = buildVersionState.full || shortText;

  if (shortNode) {
    shortNode.textContent = shortText;
  }

  if (fullNode) {
    fullNode.textContent = fullText;
  }

  modal.classList.remove("hidden");
  syncBodyModalOpenState();
}

window.closeBuildVersionPopup = () => {
  const modal = document.getElementById("build-version-modal");
  if (!modal) return;

  modal.classList.add("hidden");
  syncBodyModalOpenState();
};

window.subscribeToNotifications = async () => {
  try {
    await subscribeToPush({
      supabase,
      vapidPublicKey: PUBLIC_VAPID_KEY,
      currentUser: appState.currentUser,
    });

    appState.hasPushSubscription = true;
    await showModalAlert("Notifications enabled.");
  } catch (error) {
    console.error("Notification subscription failed:", error);
    await showModalAlert(error?.message || "Could not enable notifications.");
  } finally {
    renderHeader();
  }
};


async function applyBuildVersionToCreditLine() {
  const versionNode = document.getElementById("app-version");
  if (!versionNode) return;

  const fallbackVersion = String(versionNode.textContent || "").trim();
  buildVersionState.short = fallbackVersion;
  buildVersionState.full = fallbackVersion;

  if (versionNode.dataset.versionPopupBound !== "true") {
    versionNode.dataset.versionPopupBound = "true";
    versionNode.style.cursor = "pointer";
    versionNode.setAttribute("role", "button");
    versionNode.setAttribute("tabindex", "0");
    versionNode.title = "Click for full version details";
    versionNode.addEventListener("click", showBuildVersionPopup);
    versionNode.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showBuildVersionPopup();
      }
    });
  }

  try {
    const base = import.meta.env.BASE_URL || "/";
    const response = await fetch(`${base}build-version.json`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const metadata = await response.json();
    const version = String(metadata?.version || "").trim();
    const displayVersion = String(metadata?.displayVersion || "").trim();
    const buildNumber = String(metadata?.buildNumber || "").trim();
    const gitCommit = String(metadata?.gitCommit || "").trim();
    const generatedAt = String(metadata?.generatedAt || "").trim();

    if (version) {
      versionNode.textContent = `v${version}`;
    } else if (fallbackVersion) {
      versionNode.textContent = fallbackVersion;
    }

    buildVersionState.short = String(
      versionNode.textContent || fallbackVersion,
    ).trim();

    if (buildNumber || gitCommit) {
      const buildParts = [];
      if (buildNumber) {
        buildParts.push(`build ${buildNumber}`);
      }
      if (gitCommit && gitCommit !== "unknown") {
        buildParts.push(gitCommit);
      }
      versionNode.title = `${buildParts.join(" • ")} • click for details`;
    }

    const fullVersionParts = [
      buildVersionState.short,
      displayVersion ? `Full version: ${displayVersion}` : "",
      buildNumber ? `Build: ${buildNumber}` : "",
      gitCommit ? `Commit: ${gitCommit}` : "",
      generatedAt ? `Generated: ${formatDateDdMmYy(generatedAt)}` : "",
    ].filter(Boolean);

    buildVersionState.full = fullVersionParts.join("\n");
  } catch (error) {
    console.warn("Build version metadata unavailable:", error);
  }
}

window.openReportInReader = function () {
  const content = appState.reportOutput || "";
  const base = import.meta.env.BASE_URL || "/";
  const reportId = `reading-report-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const returnTo = window.location.href;
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;

  localStorage.setItem(reportId, content);
  sessionStorage.setItem("readingViewReport", content);

  const url = `${base}report.html?rid=${encodeURIComponent(reportId)}&returnTo=${encodeURIComponent(returnTo)}`;

  if (isStandalone) {
    window.location.assign(url);
    return;
  }

  const readerWindow = window.open(url, "_blank", "noopener,noreferrer");

  if (!readerWindow) {
    window.location.assign(url);
  }
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
    .from(getTableName("calling_hidden_for_members"))
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
          .filter((key) => {
            const normalizedKey = String(key || "").toLowerCase();

            return (
              normalizedKey.includes("stake-callings") ||
              normalizedKey.includes("db-stake-callings") ||
              normalizedKey.includes("the-record")
            );
          })
          .forEach((key) => caches.delete(key));
      });
    }
  }
}

if (typeof window !== "undefined") {
  applyBuildVersionToCreditLine();

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      window.closeBuildVersionPopup();
      window.closeConcernNoticeModal();
    }
  });

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

function userHasAssignments() {
  return appState.callings.some((row) => isAssignedToCurrentUser(row));
}

function getVisibleCallings() {
  const currentUserKey = normalizeComparableName(getCurrentUserNameFromAuth());
  const hasAssignments = userHasAssignments();

  return appState.callings.filter((row) => {
    const rowNameKey = normalizeComparableName(row?.name);

    // Hide user's own calling/release
    if (currentUserKey && rowNameKey && currentUserKey === rowNameKey) {
      return false;
    }

    // For SHC role members, only show if sp_approved is TRUE
    if (isShcRole() && !isCompletedValue(row?.sp_approved)) {
      return false;
    }

    // If the user has assignments, default to showing only those assignments
    if (hasAssignments && !appState.showAllCallingsForStake) {
      return isAssignedToCurrentUser(row);
    }

    return true;
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
      isShcRole() &&
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
    .from(getTableName("calling_hc_votes"))
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
      .from(getTableName("callings"))
      .select("*")
      .order("created_at", { ascending: false }),
    fetchHighCouncilVotes(),
    fetchArchivedItems(),
  ]);

  if (!error) {
    appState.callings = data || [];
    applyHighCouncilSummaryToAllCallings();
  }
}

async function fetchArchivedItems() {
  const { data, error } = await supabase
    .from(getTableName("archive"))
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    appState.archiveTableAvailable = false;
    appState.archivedItems = [];

    if (error.code === "42P01") {
      console.warn(
        `Archive table \"${getTableName("archive")}\" not found. Check that prefixed tables are created.`,
      );
      return;
    }

    console.error("Failed to fetch archived items:", error);
    return;
  }

  appState.archiveTableAvailable = true;
  appState.archivedItems = data || [];
}

async function fetchReferenceData() {
  const [membersResult, statusesResult] = await Promise.all([
    supabase
      .from(getTableName("members"))
      .select("*")
      .order("name", { ascending: true }),
    supabase.from(getTableName("status_options")).select("*"),
  ]);

  const { data: members, error: membersError } = membersResult;
  const { data: statusRows, error: statusError } = statusesResult;

  if (membersError) {
    throw new Error(
      `The app could not fetch members from Supabase. ${membersError.message}`,
    );
  }

  appState.members = members || [];

  if (statusError) {
    console.error("Could not load status options:", statusError);
    appState.statusOptions = normalizeStatusOptions([]);
  } else {
    appState.statusOptions = normalizeStatusOptions(statusRows);
  }

  updateDerivedMemberLists();
}

function updateDerivedMemberLists() {
  // Update assignable names list
  appState.assignableNames = appState.members
    .filter((m) => m.can_be_assigned === true)
    .map((m) => m.name)
    .filter(Boolean);

  // Update high council names list
  appState.highCouncilNames = appState.members
    .filter((m) => normalizeRole(m.role) === "shc")
    .map((m) => m.name)
    .filter(Boolean);
}

function syncDatabaseModeClass() {
  document.body.classList.toggle(
    "training-mode",
    appState.dbMode === "training",
  );
}

async function toggleDatabaseMode() {
  // Flip the mode string
  const currentMode = appState.dbMode || "production";
  const newMode = currentMode === "production" ? "training" : "production";

  // Update state and localStorage
  appState.dbMode = newMode;
  localStorage.setItem("dbMode", newMode);

  syncDatabaseModeClass();

  console.log(
    `[DB Switch] Switching from ${currentMode} to ${newMode} (single database, prefixed tables)`,
  );

  // Reload data with new table prefixes (no page reload needed!)
  try {
    await fetchReferenceData(); // Reload members and status options
    await fetchCallings(); // Reload callings, votes, and archive
    renderHeader(); // Update header with new mode indicator
    renderCurrentPage(); // Re-render the current page
  } catch (error) {
    console.error("Error reloading data after mode switch:", error);
    // If data reload fails, show an alert but keep the UI functional
    await showModalAlert(
      `Switched to ${newMode} mode, but some data may not have loaded. Try refreshing the page.`,
    );
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

function renderAdminPage() {
  const list = document.getElementById("data-list");
  const reportsPage = document.getElementById("reports-page");
  const adminPage = document.getElementById("admin-page");
  const notificationsPage = document.getElementById("notifications-page");
  if (!adminPage) return;

  const inboxPage = document.getElementById("inbox-page");
  if (list) list.classList.add("hidden");
  if (reportsPage) reportsPage.classList.add("hidden");
  if (notificationsPage) notificationsPage.classList.add("hidden");
  if (inboxPage) inboxPage.classList.add("hidden");

  adminPage.classList.remove("hidden");

  const roles = ["admin", "stake", "SHC"]
    .map((r) => `<option value="${r}">${r}</option>`)
    .join("");

  adminPage.innerHTML = `
    <section class="admin-header">
      <h2>Admin Panel</h2>
      <p>Manage members and roles</p>
    </section>

    <section class="admin-actions">
      <button type="button" class="btn btn-primary" onclick="window.startNewMemberForm()">+ Add New Member</button>
    </section>

    <section class="admin-content">
      <div id="admin-form" class="hidden">
        <article class="card admin-form-card">
          <h3 id="admin-form-title">Add New Member</h3>
          <form id="admin-member-form" onsubmit="window.submitMemberForm(event)">
            <div class="form-group">
              <label for="member-email">Email</label>
              <input type="email" id="member-email" required />
            </div>
            <div class="form-group">
              <label for="member-name">Name</label>
              <input type="text" id="member-name" required />
            </div>
            <div class="form-group">
              <label for="member-role">Role</label>
              <select id="member-role" required>
                <option value="">Select a role</option>
                ${roles}
              </select>
            </div>
            <div class="form-group">
              <label for="member-can-assign">
                <input type="checkbox" id="member-can-assign" /> Can be assigned
              </label>
            </div>
            <div class="form-group">
              <label for="member-super">
                <input type="checkbox" id="member-super" /> Super Admin
              </label>
            </div>
            <div class="form-group">
              <label for="member-receive-concern">
                <input type="checkbox" id="member-receive-concern" /> Receive Concern Emails
              </label>
            </div>
            <div class="btn-group">
              <button type="submit" class="btn btn-primary">Save Member</button>
              <button type="button" class="btn btn-secondary" onclick="window.cancelAdminForm()">Cancel</button>
            </div>
          </form>
        </article>
      </div>

      <div id="admin-members-list">
        <article class="card admin-members-card">
          <h3>Members</h3>
          <div class="members-grid">
            ${appState.members
              .map(
                (m) => `
              <div class="member-card" data-member-email="${escapeHtml(m.email)}">
                <div class="member-row"><span class="member-label">Name:</span> <button type="button" class="member-name-link" data-action="edit" title="Edit ${escapeHtml(m.name)}">${escapeHtml(m.name)}</button></div>
                <div class="member-row"><span class="member-label">Email:</span> <span class="email" title="${escapeHtml(m.email)}">${escapeHtml(m.email)}</span></div>
                <div class="member-row"><span class="member-label">Role:</span> ${escapeHtml(m.role || "")}</div>
                <div class="member-row">
                  <span class="member-label ${m.can_be_assigned ? "assign-on" : "assign-off"}">
                    Assign:
                  </span>
                  ${m.can_be_assigned ? "✓" : ""}
                </div>
                <div class="member-row">
                  <span class="member-label ${m.super ? "super-admin-on" : "super-admin-off"}">
                    Super Admin:
                  </span>
                  ${m.super ? "✓" : ""}
                </div>
                <div class="member-row">
                  <span class="member-label ${m.receive_concern ? "concern-recipient-on" : "concern-recipient-off"}">
                    Concern Recipient:
                  </span>
                  ${m.receive_concern ? "✓" : ""}
                </div>
                <div class="member-row member-actions">
                  <button type="button" class="btn btn-secondary btn-sm" data-action="edit">Edit</button>
                  <button type="button" class="btn btn-danger btn-sm" data-action="delete">Delete</button>
                </div>
              </div>
            `,
              )
              .join("")}
          </div>
        </article>
      </div>
    </section>
  `;

  // Attach event listeners to action buttons
  const membersList = document.getElementById("admin-members-list");
  if (membersList) {
    membersList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      const card = button.closest(".member-card[data-member-email]");
      if (!card) return;

      const memberEmail = card.getAttribute("data-member-email");
      const action = button.getAttribute("data-action");

      if (action === "edit") {
        window.editMember(memberEmail);
      } else if (action === "delete") {
        window.deleteMember(memberEmail);
      }
    });
  }
}

let notifSubscribersCache = [];

function renderNotificationsPage() {
  const list = document.getElementById("data-list");
  const reportsPage = document.getElementById("reports-page");
  const adminPage = document.getElementById("admin-page");
  const notificationsPage = document.getElementById("notifications-page");
  if (!notificationsPage) return;

  const inboxPage3 = document.getElementById("inbox-page");
  if (list) list.classList.add("hidden");
  if (reportsPage) reportsPage.classList.add("hidden");
  if (adminPage) adminPage.classList.add("hidden");
  if (inboxPage3) inboxPage3.classList.add("hidden");
  notificationsPage.classList.remove("hidden");

  const isSubscribed = appState.hasPushSubscription ?? false;

  notificationsPage.innerHTML = `
    <section class="admin-header">
      <h2>Notifications</h2>
      <p>Manage and send push notifications</p>
    </section>

    <section class="admin-content">
      <article class="card admin-form-card">
        <h3>Your Subscription</h3>
        <p style="margin: 0 0 12px 0; color: var(--text-muted); font-size: 0.9rem;">
          ${isSubscribed ? "You are subscribed to push notifications on this device." : "You are not subscribed to push notifications on this device."}
        </p>
        ${
          !isSubscribed
            ? `<button type="button" class="btn btn-primary" onclick="window.subscribeToNotifications()">Subscribe This Device</button>`
            : ""
        }
      </article>

      <article class="card admin-form-card">
        <h3>Send Notification</h3>
        <div class="form-group">
          <label for="notif-title">Title</label>
          <input type="text" id="notif-title" placeholder="Notification title" />
        </div>
        <div class="form-group">
          <label for="notif-body">Message</label>
          <textarea id="notif-body" rows="4" placeholder="Enter your message..." style="width: 100%; box-sizing: border-box; resize: vertical; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font: inherit; background: var(--white); color: var(--text);"></textarea>
        </div>
        <div class="form-group">
          <label>Recipients</label>
          <div id="notif-recipients-loading" style="color: var(--text-muted); font-size: 0.9rem;">Loading subscribers...</div>
          <div id="notif-recipients-list" class="notif-recipients-list hidden"></div>
          <div id="notif-no-subscribers" class="hidden" style="color: var(--text-muted); font-size: 0.9rem;">No subscribers found.</div>
        </div>
        <div class="btn-group">
          <button type="button" class="btn btn-primary" onclick="window.sendPushNotifications()">Send</button>
          <button type="button" class="btn btn-secondary" onclick="window.toggleAllNotifRecipients()">Select All</button>
        </div>
        <div id="notif-status" class="notif-status hidden"></div>
      </article>
    </section>
  `;

  loadNotificationSubscribers();
}

async function loadNotificationSubscribers() {
  const loadingEl = document.getElementById("notif-recipients-loading");
  const listEl = document.getElementById("notif-recipients-list");
  const emptyEl = document.getElementById("notif-no-subscribers");
  if (!loadingEl || !listEl || !emptyEl) return;

  try {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, user_email, subscription");

    if (error) throw error;

    loadingEl.classList.add("hidden");

    if (!data || data.length === 0) {
      emptyEl.classList.remove("hidden");
      notifSubscribersCache = [];
      return;
    }

    notifSubscribersCache = data;
    listEl.classList.remove("hidden");
    listEl.innerHTML = data
      .map(
        (sub, i) => `
        <label class="notif-recipient-item">
          <input type="checkbox" name="notif-recipient" value="${i}" checked />
          <span>${escapeHtml(sub.user_email || `Subscriber ${i + 1}`)}</span>
        </label>
      `,
      )
      .join("");
  } catch (err) {
    if (loadingEl) loadingEl.textContent = `Error loading subscribers: ${err.message}`;
  }
}

function renderInboxPage() {
  const list = document.getElementById("data-list");
  const reportsPage = document.getElementById("reports-page");
  const adminPage = document.getElementById("admin-page");
  const notificationsPage = document.getElementById("notifications-page");
  const inboxPage = document.getElementById("inbox-page");
  if (!inboxPage) return;

  if (list) list.classList.add("hidden");
  if (reportsPage) reportsPage.classList.add("hidden");
  if (adminPage) adminPage.classList.add("hidden");
  if (notificationsPage) notificationsPage.classList.add("hidden");
  inboxPage.classList.remove("hidden");

  inboxPage.innerHTML = `
    <section class="admin-header">
      <h2>Messages</h2>
      <p>Notifications sent to this group</p>
    </section>
    <section class="admin-content">
      <article class="card admin-form-card">
        <div id="inbox-loading" style="color: var(--text-muted); font-size: 0.9rem;">Loading messages…</div>
        <div id="inbox-list" class="inbox-list hidden"></div>
        <div id="inbox-empty" class="hidden" style="color: var(--text-muted); font-size: 0.9rem;">No messages yet.</div>
      </article>
    </section>
  `;

  loadInboxMessages();
}

async function loadInboxMessages() {
  const loadingEl = document.getElementById("inbox-loading");
  const listEl = document.getElementById("inbox-list");
  const emptyEl = document.getElementById("inbox-empty");
  if (!loadingEl || !listEl || !emptyEl) return;

  try {
    const { data, error } = await supabase
      .from("app_notifications")
      .select("id, title, body, sent_at, sent_by_email")
      .order("sent_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    loadingEl.classList.add("hidden");

    if (!data || data.length === 0) {
      emptyEl.classList.remove("hidden");
      return;
    }

    listEl.classList.remove("hidden");
    listEl.innerHTML = data
      .map((n) => {
        const date = new Date(n.sent_at);
        const dateStr = date.toLocaleDateString(undefined, {
          weekday: "short", day: "numeric", month: "short", year: "numeric",
        });
        const timeStr = date.toLocaleTimeString(undefined, {
          hour: "numeric", minute: "2-digit",
        });
        return `
          <div class="inbox-item">
            <div class="inbox-item-header">
              <span class="inbox-item-title">${escapeHtml(n.title)}</span>
              <span class="inbox-item-date">${dateStr}, ${timeStr}</span>
            </div>
            <div class="inbox-item-body">${escapeHtml(n.body)}</div>
            ${n.sent_by_email ? `<div class="inbox-item-from">From: ${escapeHtml(n.sent_by_email)}</div>` : ""}
          </div>
        `;
      })
      .join("");
  } catch (err) {
    if (loadingEl) loadingEl.textContent = `Error loading messages: ${err.message}`;
  }
}

function renderReportsPage() {
  const list = document.getElementById("data-list");
  const reportsPage = document.getElementById("reports-page");
  if (!reportsPage) return;

  if (list) {
    list.classList.add("hidden");
  }

  const adminPage = document.getElementById("admin-page");
  if (adminPage) adminPage.classList.add("hidden");
  const notificationsPage = document.getElementById("notifications-page");
  if (notificationsPage) notificationsPage.classList.add("hidden");
  const inboxPage2 = document.getElementById("inbox-page");
  if (inboxPage2) inboxPage2.classList.add("hidden");

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
        }>Stake Business in units</option>
        <option value="awaiting-shc" ${
          appState.currentReportType === "awaiting-shc" ? "selected" : ""
        }>Calls Awaiting HC Sustaining</option>
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
        <option value="archive-items" ${
          appState.currentReportType === "archive-items" ? "selected" : ""
        }>Archive Items</option>
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
  const isAdmin = appState.currentPage === "admin";
  const isNotifications = appState.currentPage === "notifications";
  const isInbox = appState.currentPage === "inbox";
  syncFabVisibility(isAdmin || isNotifications || isInbox);

  if (isAdmin) {
    if (!isSuperAdmin()) {
      appState.currentPage = "callings";
      renderCards();
      return;
    }
    renderAdminPage();
    return;
  }

  if (isNotifications) {
    if (!isSuperAdmin()) {
      appState.currentPage = "callings";
      renderCards();
      return;
    }
    renderNotificationsPage();
    return;
  }

  if (isInbox) {
    renderInboxPage();
    return;
  }

  if (appState.currentPage === "reports") {
    renderReportsPage();
    return;
  }

  renderCards();
}

async function archiveCallingRecord(id, options = {}) {
  const { confirm = true } = options;

  if (!isAdminRole()) {
    await showModalAlert("Only admins can archive items.");
    renderCurrentPage();
    return false;
  }

  const item = appState.callings.find((calling) => calling.id === id);
  if (!item) {
    await showModalAlert("Could not find this item to archive.");
    renderCurrentPage();
    return false;
  }

  const normalizedStatus = String(item.status || "").trim();

  if (normalizedStatus === "In Progress") {
    await showModalAlert(
      "Item with a status of 'In Progress' cannot be archived. Please change the status.",
    );
    renderCurrentPage();
    return false;
  }

  const isDeleteMistake = normalizedStatus === "Mistake: DELETE";

  if (confirm) {
    const message = isDeleteMistake
      ? `This item is marked "Mistake: DELETE".\n\nName: ${
          item.name || "(no name)"
        }\n\nPress OK to permanently remove it from the database.\nThis cannot be undone.`
      : "Archive this item?";

    const confirmed = await showModalConfirm(message);
    if (!confirmed) {
      renderCurrentPage();
      return false;
    }
  }

  let error;

  // Get current mode prefix for RPC functions
  const tablePrefix = appState.dbMode === "production" ? "prod" : "train";
  const expectedTableName = `${tablePrefix}_callings`;

  console.log(
    `[Delete] Current mode: ${appState.dbMode}, table: ${expectedTableName}, id: ${id}`,
  );

  if (isDeleteMistake) {
    // Try to delete from current mode's table
    let result = await supabase.rpc("delete_calling_permanently_v2", {
      row_id: id,
      table_prefix: tablePrefix,
    });
    error = result.error;

    // If not found, try the other table (handles stale data after mode switches)
    if (error && error.message?.includes("No calling found")) {
      const otherPrefix = tablePrefix === "prod" ? "train" : "prod";
      console.warn(
        `[Delete] Record not found in ${expectedTableName}, trying ${otherPrefix}_callings...`,
      );

      result = await supabase.rpc("delete_calling_permanently_v2", {
        row_id: id,
        table_prefix: otherPrefix,
      });
      error = result.error;

      if (!error) {
        console.log(
          `[Delete] Successfully deleted from ${otherPrefix}_callings`,
        );
        // Reload data to sync with correct table
        await fetchCallings();
      }
    }

    if (error) {
      console.error("Permanent delete RPC error:", error);
      console.error(
        `[Delete] Failed to delete from both prod_callings and train_callings`,
      );
      await showModalAlert(
        `Failed to permanently delete item: ${error.message}\n\nThe record was not found in either database table. It may have already been deleted.`,
      );
      renderCurrentPage();
      return false;
    }
  } else {
    // Try to archive from current mode's table
    let result = await supabase.rpc("move_calling_to_archive_v2", {
      row_id: id,
      table_prefix: tablePrefix,
    });
    error = result.error;

    // If not found, try the other table (handles stale data after mode switches)
    if (error && error.message?.includes("No calling found")) {
      const otherPrefix = tablePrefix === "prod" ? "train" : "prod";
      console.warn(
        `[Archive] Record not found in ${expectedTableName}, trying ${otherPrefix}_callings...`,
      );

      result = await supabase.rpc("move_calling_to_archive_v2", {
        row_id: id,
        table_prefix: otherPrefix,
      });
      error = result.error;

      if (!error) {
        console.log(
          `[Archive] Successfully archived from ${otherPrefix}_callings`,
        );
        // Reload data to sync with correct table
        await fetchCallings();
      }
    }

    if (error) {
      console.error("Archive RPC error:", error);
      console.error(
        `[Archive] Failed to archive from both prod_callings and train_callings`,
      );
      await showModalAlert(
        `Failed to archive item: ${error.message}\n\nThe record was not found in either database table. It may have already been archived.`,
      );
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

  const recipientEmails = appState.members
    .filter((m) => m.receive_concern === true)
    .map((m) => m.email)
    .filter(Boolean);

  const payload = {
    token: concernEmailToken,
    recipients: recipientEmails,
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

async function provisionMemberWithServer(memberPayload) {
  if (!memberProvisionUrl) {
    return {
      ok: false,
      error:
        "Missing VITE_MEMBER_PROVISION_URL. Configure a secure server-side provisioning endpoint.",
    };
  }

  const payload = {
    token: memberProvisionToken,
    ...memberPayload,
  };

  try {
    const response = await fetch(memberProvisionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
      },
      body: JSON.stringify(payload),
    });

    let responseBody = null;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        error:
          responseBody?.error ||
          `Provisioning request failed with status ${response.status}.`,
      };
    }

    return {
      ok: true,
      data: responseBody,
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Provisioning request failed.",
    };
  }
}

const cardsRenderer = createCardsRenderer({
  appState,
  getSortedVisibleCallings,
  hasAdminPasswordAccess: isAdminRole,
  getHighCouncilVoteSummary,
  resolveSustainingByField,
  resolveSettingApartByField,
  resolveSettingApartDoneField,
  resolveLcrRecordedField,
  resolveReleaseAnnouncedUnitsField,
  isCompletedValue,
  escapeHtml,
});

function renderCards() {
  const adminPage = document.getElementById("admin-page");
  const reportsPage = document.getElementById("reports-page");
  const notificationsPage = document.getElementById("notifications-page");
  const list = document.getElementById("data-list");

  const inboxPage4 = document.getElementById("inbox-page");
  if (adminPage) adminPage.classList.add("hidden");
  if (reportsPage) reportsPage.classList.add("hidden");
  if (notificationsPage) notificationsPage.classList.add("hidden");
  if (inboxPage4) inboxPage4.classList.add("hidden");
  if (list) list.classList.remove("hidden");

  cardsRenderer.renderCards();
}

const callingsActions = createCallingsActions({
  appState,
  supabase,
  hasAdminPasswordAccess: isAdminRole,
  getCurrentUserName: getCurrentUserNameFromAuth,
  normalizeComparableName,
  getHighCouncilVoteSummary,
  applyHighCouncilSummaryToCalling,
  getAssignmentFieldCandidates,
  resolveReleaseAnnouncedUnitsField,
  renderCards,
  renderCurrentPage,
  archiveCallingRecord,
  applyHiddenVisibilityForRow,
  showConcernNoticeModal: () => window.showConcernNoticeModal(),
  sendConcernEmail,
  getTableName,
});

window.showToast = (message) => {
  const app = document.getElementById("app");
  const header = app?.querySelector(".main-header");
  let toast = document.getElementById("app-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.className = "app-toast hidden success";

    if (app) {
      if (header?.nextSibling) {
        app.insertBefore(toast, header.nextSibling);
      } else {
        app.appendChild(toast);
      }
    } else {
      document.body.appendChild(toast);
    }
  } else if (app && header && toast.parentElement !== app) {
    if (header.nextSibling) {
      app.insertBefore(toast, header.nextSibling);
    } else {
      app.appendChild(toast);
    }
  }

  if (app && header) {
    const toastTop = header.offsetTop + header.offsetHeight + 8;
    toast.style.top = `${toastTop}px`;
  } else {
    toast.style.top = "10px";
  }

  toast.textContent = message;
  toast.classList.remove("hidden");

  if (window.__toastHideTimer) {
    clearTimeout(window.__toastHideTimer);
  }

  window.__toastHideTimer = window.setTimeout(() => {
    toast.classList.add("hidden");
    window.__toastHideTimer = null;
  }, 2500);
};

window.toggleDetails = (id) => callingsActions.toggleDetails(id);
window.toggleSustainingUnits = (id) =>
  callingsActions.toggleSustainingUnits(id);
window.toggleReleaseAnnouncementUnits = (id) =>
  callingsActions.toggleReleaseAnnouncementUnits(id);
window.toggleHighCouncilDetails = (id) =>
  callingsActions.toggleHighCouncilDetails(id);
window.updateSustainedUnits = async (id, unitName) =>
  callingsActions.updateSustainedUnits(id, unitName);
window.updateReleaseAnnouncedUnits = async (id, unitName) =>
  callingsActions.updateReleaseAnnouncedUnits(id, unitName);
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
  appState.showAllCallingsForStake = !appState.showAllCallingsForStake;
  renderHeader();
  renderCurrentPage();
};

window.toggleDatabaseMode = toggleDatabaseMode;

window.togglePage = () => {
  appState.currentPage =
    appState.currentPage === "callings" ? "reports" : "callings";
  renderHeader();
  renderCurrentPage();
};

window.toggleAdminPage = () => {
  if (!isSuperAdmin()) {
    return;
  }
  appState.currentPage =
    appState.currentPage === "admin" ? "callings" : "admin";
  renderHeader();
  renderCurrentPage();
};

window.showAdminModal = () => {
  if (!isSuperAdmin()) return;
  showAdminHubModal();
};

window.openMemberMaintenancePage = () => {
  if (!isSuperAdmin()) return;
  appState.currentPage = "admin";
  renderHeader();
  renderCurrentPage();
};

window.openNotificationsPage = () => {
  if (!isSuperAdmin()) return;
  appState.currentPage = "notifications";
  renderHeader();
  renderCurrentPage();
};

window.openInbox = () => {
  appState.currentPage = "inbox";
  renderHeader();
  renderCurrentPage();
};

window.sendPushNotifications = async () => {
  const titleEl = document.getElementById("notif-title");
  const bodyEl = document.getElementById("notif-body");
  const statusEl = document.getElementById("notif-status");

  const title = titleEl?.value?.trim();
  const body = bodyEl?.value?.trim();

  if (!title || !body) {
    await showModalAlert("Please enter both a title and a message.");
    return;
  }

  const checkboxes = document.querySelectorAll(
    "input[name='notif-recipient']:checked",
  );
  const selectedIndices = Array.from(checkboxes).map((cb) =>
    parseInt(cb.value, 10),
  );

  if (selectedIndices.length === 0) {
    await showModalAlert("Please select at least one recipient.");
    return;
  }

  function setStatus(msg, style = "") {
    if (!statusEl) return;
    statusEl.classList.remove("hidden");
    statusEl.textContent = msg;
    statusEl.className = `notif-status${style ? ` ${style}` : ""}`;
  }

  setStatus(`Sending to ${selectedIndices.length} recipient(s)…`);

  // Get the session JWT; fall back to the anon key so the request always
  // carries an Authorization header (function has verify_jwt = false but
  // the header is still expected by the Supabase gateway).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const authToken = session?.access_token ?? supabaseKey;

  let successCount = 0;
  let staleCount = 0;
  let failCount = 0;
  let lastError = "";
  const deliveredTo = []; // track successfully delivered recipient emails

  for (const i of selectedIndices) {
    const sub = notifSubscribersCache[i];
    if (!sub) continue;

    try {
      const res = await fetch(
        `${supabaseUrl}/functions/v1/send-notification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({
            subscription: sub.subscription,
            title,
            body,
          }),
        },
      );

      const result = await res.json().catch(() => ({}));

      if (res.ok) {
        successCount++;
        if (sub.user_email) deliveredTo.push(sub.user_email);
      } else if (result?.error?.includes("410")) {
        // Subscription expired — remove it from the database silently
        staleCount++;
        supabase.from("push_subscriptions").delete().eq("id", sub.id).then();
        console.warn("Removed stale subscription:", sub.user_email);
      } else {
        failCount++;
        lastError = result?.error ?? `HTTP ${res.status}`;
        console.error("send-notification error:", lastError, result);
      }
    } catch (err) {
      failCount++;
      lastError = err.message;
      console.error("send-notification fetch error:", err);
    }
  }

  // Save to app_notifications — only recipients in deliveredTo can see it in their inbox
  if (deliveredTo.length > 0) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("app_notifications").insert([{
      title,
      body,
      sent_by_email: user?.email ?? null,
      recipients: deliveredTo,
    }]);
  }

  const parts = [];
  if (successCount) parts.push(`${successCount} sent`);
  if (staleCount) parts.push(`${staleCount} expired (removed — recipient needs to re-subscribe)`);
  if (failCount) parts.push(`${failCount} failed — ${lastError}`);

  const style = failCount > 0 || staleCount > 0 ? "notif-status-error" : "notif-status-success";
  setStatus(parts.join(", ") || "Nothing to send.", style);

  // Reload the subscriber list to reflect any removed stale entries
  if (staleCount > 0) loadNotificationSubscribers();
};

window.toggleAllNotifRecipients = () => {
  const checkboxes = document.querySelectorAll("input[name='notif-recipient']");
  if (!checkboxes.length) return;
  const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
  checkboxes.forEach((cb) => {
    cb.checked = !allChecked;
  });
  const btn = document.querySelector(
    ".btn-group button[onclick='window.toggleAllNotifRecipients()']",
  );
  if (btn) btn.textContent = allChecked ? "Select All" : "Deselect All";
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
      archivedRows: appState.archivedItems,
      pageSize: 25,
    },
  );
  renderReportsPage();
};

function spinRefreshIcon() {
  const icon = document.getElementById("refreshicon");
  if (!icon) return;

  icon.classList.remove("is-spinning");
  // Force reflow so repeated clicks can replay the animation.
  void icon.offsetWidth;
  icon.classList.add("is-spinning");

  window.setTimeout(() => {
    icon.classList.remove("is-spinning");
  }, 1500);
}

window.refreshData = async () => {
  spinRefreshIcon();

  if (!supabase || appState.isRefreshing) {
    return;
  }

  appState.isRefreshing = true;

  try {
    await fetchReferenceData();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError && userError.name !== "AuthSessionMissingError") {
      throw new Error(userError.message || "Failed to refresh auth user.");
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

    appState.currentUser = user;
    appState.currentMember = matchedMember;
    appState.currentRole = String(matchedMember?.role || "")
      .toLowerCase()
      .trim();

    await fetchCallings();

    if (appState.currentPage === "reports" && appState.currentReportType) {
      appState.reportOutput = generateReport(
        appState.currentReportType,
        getVisibleCallings(),
        {
          getHighCouncilVoteSummary,
          hcVotingTableAvailable: appState.hcVotingTableAvailable,
          archivedRows: appState.archivedItems,
          pageSize: 25,
        },
      );
    }

    renderHeader();
    renderCurrentPage();

    if (typeof window.showToast === "function") {
      window.showToast("Data refreshed");
    }
  } catch (error) {
    console.error("Failed to refresh data:", error);
    await showModalAlert(
      `Failed to refresh data: ${error?.message || "Unknown error"}`,
    );
  } finally {
    appState.isRefreshing = false;
  }
};

window.softRefreshApp = async () => {
  try {
    // unregister service workers
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) => registration.unregister()),
      );
    }

    // clear caches
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (err) {
    console.warn("Soft refresh encountered an issue:", err);
  }

  // IMPORTANT: do NOT clear localStorage or sign out
  window.location.reload();
};

window.copyReportToClipboard = async () => {
  if (!appState.reportOutput) {
    await showModalAlert("No report to copy.");
    return;
  }

  try {
    await navigator.clipboard.writeText(appState.reportOutput);
    await showModalAlert("Report copied to clipboard!");
  } catch (err) {
    console.error("Failed to copy report:", err);
    await showModalAlert(
      "Failed to copy report to clipboard. Please try again.",
    );
  }
};

window.printReport = async () => {
  if (!appState.reportOutput) {
    await showModalAlert("No report to print.");
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
  const confirmed = await showModalConfirm(
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

    await showModalAlert("Failed to record concern.");
  }
};

function renderLogin() {
  const app = document.getElementById("app");

  const normalizeEmail = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const formatOtpRequestError = (error) => {
    const errorCode = String(error?.code || "")
      .trim()
      .toLowerCase();
    const errorStatus = Number(error?.status || 0);

    if (errorCode === "email_not_confirmed") {
      return "This auth user exists, but their email is not confirmed in Supabase Auth yet.";
    }

    if (errorCode === "otp_disabled") {
      return "Email OTP is disabled in Supabase Authentication settings.";
    }

    if (errorCode === "signup_disabled") {
      return "Closed-group sign-in is enabled, and Supabase is refusing to create or use a new auth signup for this email.";
    }

    if (errorCode === "over_email_send_rate_limit") {
      return "Too many login emails have been sent to this address. Please wait a little and try again.";
    }

    if (errorCode === "over_request_rate_limit") {
      return "Too many login attempts have been made from this client. Please wait a few minutes and try again.";
    }

    if (errorCode === "email_address_not_authorized") {
      return "Supabase's current email provider is not allowed to send to this address. Check your SMTP/provider configuration.";
    }

    if (errorCode === "unexpected_failure" || errorStatus >= 500) {
      return "Supabase Auth hit a backend error. If this user was added manually to auth.users, recreate them with the admin provisioning script so their email identity and confirmation state are created correctly.";
    }

    if (/database error finding user/i.test(error?.message || "")) {
      return "Supabase could not find a usable email auth identity for this address. The user may exist in auth.users but still be missing a valid email identity or confirmed email.";
    }

    return error?.message || "Unable to send the sign-in code right now.";
  };

  // Initial UI state: Email Entry
  app.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <div class="login-splash">
          <h1><span>The</span> Record</h1>
          <h3>From inspiration to setting apart</h3>
          ${
            appState.dbMode === "training"
              ? `
            <div style="background-color: #f59e0b; color: #000; padding: 8px; margin-top: 12px; border-radius: 6px; font-size: 13px; font-weight: bold;">
              ⚠️ TRAINING MODE - Sandbox Database
            </div>
          `
              : ""
          }
        </div>

        <div id="auth-step-email">
          <form id="otp-request-form">
            <input
              id="email-input"
              type="email"
              placeholder="Email address"
              required
              class="loginEntry"
            />
            <button type="submit">Email me a 6-digit code</button>
          </form>
        </div>

        <div id="auth-step-code" class="hidden">
          <p class="form-instruction">Enter the code sent to your email:</p>
          <form id="otp-verify-form">
            <input
              id="otp-input"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="6"
              placeholder="123456"
              required
              class="loginEntry"
              autocomplete="one-time-code"
            />
            <button type="submit">Verify & Sign In</button>
            ${/*<button type="button" class="btn-link" onclick="renderLogin()">Back to email</button>}*/ ""}
          </form>
        </div>

        <p id="auth-message" class="form-message" aria-live="polite"></p>
      </div>
    </div>
  `;

  const emailStep = document.getElementById("auth-step-email");
  const codeStep = document.getElementById("auth-step-code");
  const message = document.getElementById("auth-message");

  const requestForm = document.getElementById("otp-request-form");
  const verifyForm = document.getElementById("otp-verify-form");

  let userEmail = localStorage.getItem("otp-email") || "";

  // If there's a saved email from a previous attempt, pre-fill the form
  if (userEmail) {
    document.getElementById("email-input").value = userEmail;
  }

  // Step 1: Request the OTP
  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    userEmail = normalizeEmail(document.getElementById("email-input").value);
    if (!userEmail) return;

    const isKnownMember = appState.members.some(
      (member) => normalizeEmail(member?.email) === userEmail,
    );

    if (!isKnownMember) {
      const dbModeLabel = (appState.dbMode || "production").toUpperCase();
      message.textContent = `That email is not authorized for the ${dbModeLabel} database. Please use your member email or check that your account exists in this database.`;
      message.classList.add("error");
      return;
    }

    message.textContent = "Sending code...";
    message.classList.remove("error");

    // Store email so it persists across page reloads (but will be cleared on database switch)
    localStorage.setItem("otp-email", userEmail);

    const dbModeLabel = (appState.dbMode || "production").toUpperCase();
    console.log(
      `[OTP] Requesting code for ${userEmail} in ${dbModeLabel} mode`,
    );

    // CRITICAL: Remove 'options' and 'emailRedirectTo'
    // Using the bare minimum forces Supabase into OTP mode
    const { error } = await supabase.auth.signInWithOtp({
      email: userEmail,
      options: {
        shouldCreateUser: false,
      },
    });

    if (error) {
      console.error("OTP Error:", error);
      message.textContent = formatOtpRequestError(error);
      message.classList.add("error");
      return;
    }

    // Success: Hide email form, show code form
    emailStep.classList.add("hidden");
    codeStep.classList.remove("hidden");
    message.textContent = `Check your email for the 6-digit code (${dbModeLabel} database).`;
  });

  // Step 2: Verify the OTP
  verifyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = document.getElementById("otp-input").value.trim();

    // Get fresh email from localStorage in case of page reload
    const verifyEmail = localStorage.getItem("otp-email") || userEmail;

    if (!verifyEmail) {
      message.textContent = "Session expired. Please start over.";
      message.classList.add("error");
      setTimeout(() => renderLogin(), 2000);
      return;
    }

    message.textContent = "Verifying...";
    message.classList.remove("error");

    const dbModeLabel = (appState.dbMode || "production").toUpperCase();
    console.log(
      `[OTP] Verifying code for ${verifyEmail} in ${dbModeLabel} mode`,
    );

    const { error } = await supabase.auth.verifyOtp({
      email: verifyEmail,
      token,
      type: "email",
    });

    if (error) {
      const dbModeLabel = (appState.dbMode || "production").toUpperCase();
      message.textContent = `Invalid or expired code. Make sure you're using the latest code sent to your email for the ${dbModeLabel} database.`;
      message.classList.add("error");
      return;
    }

    // Success! Supabase will trigger onAuthStateChange
    // or you can manually call startApp() to refresh the UI
    message.textContent = "Success! Loading...";

    // Clear the stored email after successful login
    localStorage.removeItem("otp-email");

    startApp();
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
  syncBodyModalOpenState();
};

window.closeConcernNoticeModal = () => {
  const modal = document.getElementById("concern-notice-modal");
  if (!modal) return;

  modal.classList.add("hidden");
  syncBodyModalOpenState();
};

function syncFabVisibility(hideFab = false) {
  syncFabVisibilityUi({
    hasAdminPasswordAccess: isAdminRole,
    isLoggedInSession: isAuthenticatedMember,
    onResetCache: () => window.resetCacheAndReload(),
    hideFab,
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
    getTableName,
  });
};

window.setThemeMode = (mode) => {
  applyThemeMode(mode, appState);
  renderHeader();
};

function renderHeader() {
  renderHeaderUi({
    appState,
    isSuperAdminUser: isSuperAdmin,
    ensureCreateCallingUi,
  });

  ensureConcernNoticeModal();
}

window.startNewMemberForm = () => {
  if (!isSuperAdmin()) {
    showModalAlert("Only super admins can add members.");
    return;
  }

  const form = document.getElementById("admin-form");
  const list = document.getElementById("admin-members-list");

  if (form) {
    form.classList.remove("hidden");
  }
  if (list) {
    list.classList.add("hidden");
  }

  document.getElementById("admin-form-title").textContent = "Add New Member";
  document.getElementById("admin-member-form").reset();
  document.getElementById("member-email").disabled = false;
  appState.adminFormData.action = "create";
  appState.adminFormData.selectedMemberEmail = null;
};

window.cancelAdminForm = () => {
  const form = document.getElementById("admin-form");
  const list = document.getElementById("admin-members-list");

  if (form) {
    form.classList.add("hidden");
  }
  if (list) {
    list.classList.remove("hidden");
  }
};

window.submitMemberForm = async (event) => {
  event.preventDefault();

  if (!isSuperAdmin()) {
    await showModalAlert("Only super admins can modify members.");
    return;
  }

  const email = document.getElementById("member-email").value.trim();
  const name = document.getElementById("member-name").value.trim();
  const role = document
    .getElementById("member-role")
    .value.trim()
    .toLowerCase();
  const canBeAssigned = document.getElementById("member-can-assign").checked;
  const superAdmin = document.getElementById("member-super").checked;
  // Capture new field form input value
  const receiveConcern = document.getElementById(
    "member-receive-concern",
  ).checked;

  if (!email || !name || !role) {
    await showModalAlert("Please fill in all required fields.");
    return;
  }

  try {
    if (appState.adminFormData.action === "create") {
      const result = await provisionMemberWithServer({
        action: "create",
        email: String(email).trim().toLowerCase(),
        name,
        role,
        canBeAssigned,
        super: superAdmin,
        receive_concern: receiveConcern,
        receiveConcern,
      });

      if (!result.ok) {
        console.error("Provisioning error:", result.error);
        await showModalAlert(`Failed to provision member: ${result.error}`);
        return;
      }

      await showModalAlert(
        "Member provisioned successfully in Auth and members table.",
      );
    } else if (appState.adminFormData.action === "update") {
      const oldEmail = String(appState.adminFormData.selectedMemberEmail || "")
        .trim()
        .toLowerCase();

      if (!oldEmail) {
        await showModalAlert(
          "Missing original member email. Please cancel and open the member again.",
        );
        return;
      }

      const result = await provisionMemberWithServer({
        action: "update",
        oldEmail,
        email: String(email).trim().toLowerCase(),
        name,
        role,
        canBeAssigned,
        super: superAdmin,
        receive_concern: receiveConcern,
        receiveConcern,
      });

      if (!result.ok) {
        console.error("Update error:", result.error);
        await showModalAlert(`Failed to update member: ${result.error}`);
        return;
      }

      await showModalAlert("Member updated successfully.");
    }

    await fetchReferenceData();
    window.cancelAdminForm();
    renderAdminPage();
  } catch (error) {
    console.error("Form submission error:", error);
    await showModalAlert(`Error: ${error.message}`);
  }
};

window.editMember = async (memberEmail) => {
  if (!isSuperAdmin()) {
    await showModalAlert("Only super admins can edit members.");
    return;
  }

  const normalizedEmail = String(memberEmail || "")
    .trim()
    .toLowerCase();
  console.log("editMember called with email:", normalizedEmail);

  const member = appState.members.find(
    (m) =>
      String(m.email || "")
        .trim()
        .toLowerCase() === normalizedEmail,
  );
  if (!member) {
    console.error(`Member not found with email: ${normalizedEmail}`);
    await showModalAlert("Member not found.");
    return;
  }

  document.getElementById("member-email").value = member.email || "";
  document.getElementById("member-name").value = member.name || "";
  document.getElementById("member-role").value = String(
    member.role || "",
  ).toLowerCase();
  document.getElementById("member-can-assign").checked =
    member.can_be_assigned || false;
  document.getElementById("member-super").checked = member.super || false;
  document.getElementById("member-receive-concern").checked =
    member.receive_concern || false;
  document.getElementById("member-email").disabled = false;

  document.getElementById("admin-form-title").textContent =
    `Edit: ${escapeHtml(member.name)}`;

  appState.adminFormData.action = "update";
  appState.adminFormData.selectedMemberEmail = String(member.email || "")
    .trim()
    .toLowerCase();

  const form = document.getElementById("admin-form");
  const list = document.getElementById("admin-members-list");

  if (form) {
    form.classList.remove("hidden");
  }
  if (list) {
    list.classList.add("hidden");
  }
};

window.deleteMember = async (memberEmail) => {
  if (!isSuperAdmin()) {
    await showModalAlert("Only super admins can delete members.");
    return;
  }

  const normalizedEmail = String(memberEmail || "")
    .trim()
    .toLowerCase();
  const member = appState.members.find(
    (m) =>
      String(m.email || "")
        .trim()
        .toLowerCase() === normalizedEmail,
  );
  if (!member) {
    await showModalAlert("Member not found.");
    return;
  }

  const confirmed = await showModalConfirm(
    `Delete member "${escapeHtml(member.name)}"? This cannot be undone.`,
  );

  if (!confirmed) return;

  try {
    const result = await provisionMemberWithServer({
      action: "delete",
      email: normalizedEmail,
    });

    if (!result.ok) {
      console.error("Delete error:", result.error);
      await showModalAlert(`Failed to delete member: ${result.error}`);
      return;
    }

    await showModalAlert("Member deleted successfully.");
    await fetchReferenceData();
    renderAdminPage();
  } catch (error) {
    console.error("Delete error:", error);
    await showModalAlert(`Error: ${error.message}`);
  }
};

async function startApp() {
  const savedThemeMode = getSavedThemeMode();
  applyThemeMode(savedThemeMode, appState);

  if (!supabase) {
    showFatalError(
      "Missing configuration",
      "VITE_SUPABASE_URL_PROD/TRAINING and VITE_SUPABASE_ANON_KEY_PROD/TRAINING must be set for this build.",
    );
    return;
  }

  try {
    await fetchReferenceData();
  } catch (error) {
    console.error("Error fetching members:", error);
    showFatalError(
      "Could not load app data",
      error?.message || "The app could not fetch members from Supabase.",
    );
    return;
  }

  supabase.auth.onAuthStateChange((event) => {
    console.log("Auth state changed:", event);
  });

  // const {
  //   data: { user },
  //   error: userError,
  // } = await supabase.auth.getUser();

  await supabase.auth.getSession();
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

  const { data: pushSubData } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);
  appState.hasPushSubscription = !!(pushSubData && pushSubData.length > 0);

  await fetchCallings();

  // If the app was opened by tapping a push notification, go straight to inbox
  if (new URLSearchParams(window.location.search).get("page") === "inbox") {
    appState.currentPage = "inbox";
    // Clean the URL without reloading
    history.replaceState(null, "", window.location.pathname);
  }

  renderHeader();
  renderCurrentPage();
}

async function subscribeToPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications are not supported on this browser.");
  }

  // Use BASE_URL so the path is correct for subdirectory deployments
  // e.g. GitHub Pages at /the-record/ → registers /the-record/sw.js not /sw.js
  const registration = await navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}sw.js`,
  );

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was denied.");
  }

  // Always unsubscribe from the browser side first so the push service
  // issues a brand-new endpoint — reusing the old one returns a stale
  // subscription that the push service still marks as 410 Gone.
  const existing = await registration.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: PUBLIC_VAPID_KEY,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    throw new Error("Could not determine the current user.");
  }

  // Remove any existing subscription for this user before inserting the new one
  // (no unique constraint exists, so upsert isn't available)
  await supabase.from("push_subscriptions").delete().eq("user_id", user.id);

  const { error } = await supabase.from("push_subscriptions").insert([
    { user_id: user.id, user_email: user.email, subscription: subscription },
  ]);

  if (error) {
    throw new Error(`Failed to save subscription: ${error.message}`);
  }

  console.log("User successfully subscribed!");
}

// window.setDatabaseMode = (mode) => {
//   localStorage.setItem("dbMode", mode);
//   location.reload();
// };

startApp().catch((error) => {
  console.error("Failed to start app:", error);
  showFatalError(
    "Failed to start app",
    error?.message || "Unexpected startup error.",
  );
});
