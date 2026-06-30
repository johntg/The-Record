import "./style.css";

import { loadLocale, setLang, getCurrentLang, t } from "./i18n/index.js";
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
import { initScrollToTop } from "./ui/scroll-to-top.js";
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
import { createClient } from "@supabase/supabase-js";
const PUBLIC_VAPID_KEY =
  "BEic-4qILB0TTH_oPnkuEm9xgRcH2fvvX8pELjH7VgLxIU_gezvKZaEp_P95f7AF_wJ8VXvIM0_VwG8dpt60Vfg";

import createPushSubscription from "./utils/notifications.js";

// Single database with mode-based table prefixes
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// ─── DB-BACKED SESSION PERSISTENCE ──────────────────────────────────────────
// After every OTP login the Supabase refresh_token is saved to the
// user_sessions table. The client holds only a tiny UUID lookup token in a
// cookie (~36 chars, 30-day rolling expiry).
//
// On startup: getSession() tries localStorage first (fast path, works on
// desktop/Android). If localStorage was cleared (common on iOS PWAs) the app
// calls restore_session() — a SECURITY DEFINER Postgres function that works
// without a valid JWT — fetches the refresh_token, and exchanges it for a
// live session via supabase.auth.refreshSession(). The UUID IS the credential;
// 122-bit entropy from gen_random_uuid() makes it unguessable.

const SESSION_COOKIE = "tr-sid";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, rolling

function getSessionCookie() {
  const match = document.cookie.match(
    new RegExp("(?:^|;)\\s*" + SESSION_COOKIE + "=([^;]+)"),
  );
  return match ? match[1] : null;
}

function setSessionCookie(token) {
  document.cookie = [
    `${SESSION_COOKIE}=${token}`,
    `max-age=${SESSION_COOKIE_MAX_AGE}`,
    "path=/",
    "SameSite=Strict",
  ].join("; ");
}

function clearSessionCookie() {
  document.cookie = `${SESSION_COOKIE}=; max-age=0; path=/; SameSite=Strict`;
}

// Called after every successful OTP verification.
// Inserts a new row (supports multiple devices simultaneously).
async function saveDbSession(session) {
  if (!supabase || !session?.refresh_token || !session?.user?.id) return;

  const { data, error } = await supabase
    .from("user_sessions")
    .insert({
      user_id: session.user.id,
      refresh_token: session.refresh_token,
      email: session.user.email,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[session] Failed to save DB session:", error.message);
    return;
  }

  setSessionCookie(data.id);
  console.log("[session] DB session saved");
}

// Called on startup when localStorage is empty.
// Uses the UUID cookie to fetch the refresh_token from the DB without auth,
// then exchanges it for a live session.
async function restoreDbSession() {
  if (!supabase) return null;

  const token = getSessionCookie();
  if (!token) return null;

  console.log("[session] Attempting DB session restore…");

  // Step 1: fetch the stored refresh_token (SECURITY DEFINER — no JWT needed)
  const { data, error } = await supabase.rpc("restore_session", {
    lookup_token: token,
  });

  if (error || !data?.length) {
    console.warn("[session] DB session not found or expired");
    clearSessionCookie();
    return null;
  }

  // Step 2: exchange the refresh_token for a new live session
  const { data: refreshed, error: refreshError } =
    await supabase.auth.refreshSession({
      refresh_token: data[0].refresh_token,
    });

  if (refreshError || !refreshed?.session) {
    console.warn("[session] Token refresh failed:", refreshError?.message);
    clearSessionCookie();
    return null;
  }

  // Step 3: update the DB row with the rotated refresh_token (now authenticated)
  await supabase
    .from("user_sessions")
    .update({
      refresh_token: refreshed.session.refresh_token,
      last_seen: new Date().toISOString(),
    })
    .eq("id", token);

  // Step 4: roll the cookie expiry
  setSessionCookie(token);

  console.log("[session] DB session restored");
  return refreshed.session.user;
}

// Called on logout — removes this device's DB row and clears the cookie.
async function deleteDbSession() {
  const token = getSessionCookie();
  clearSessionCookie();
  if (!token || !supabase) return;
  await supabase.from("user_sessions").delete().eq("id", token);
}

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

console.log(`[App] Initializing — Supabase: ${supabaseUrl}`);

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
  currentPage: "callings",
  dbMode: localStorage.getItem("dbMode") || "production",
  currentReportType: "sustain-setapart-release",
  reportOutput: "",
  archiveCurrentPage: 0,
  currentUser: null,
  currentMember: null,
  currentRole: null,
  hasPushSubscription: false,
  hasUnreadMessages: false,
  reportLanguage: "en",
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
  unitAbbreviations: [],
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

function isAdminAccess() {
  return isAdminRole() || isSuperAdmin();
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
        <h2 id="build-version-title">${t("version_modal_title")}</h2>
        <button type="button" class="icon-button" aria-label="Close version details" onclick="window.closeBuildVersionPopup()">×</button>
      </div>
      <div class="version-info-body">
        <p id="build-version-short" class="version-info-short"></p>
        <pre id="build-version-full" class="version-info-full"></pre>
      </div>
      <div class="btn-group version-info-actions">
        <button type="button" class="btn btn-primary" onclick="window.closeBuildVersionPopup()">${t("btn_close")}</button>
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

  const shortText = buildVersionState.short || t("version_unavailable");
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
    await showModalAlert(t("notif_enabled"));
  } catch (error) {
    console.error("Notification subscription failed:", error);
    await showModalAlert(error?.message || t("notif_enable_failed"));
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
    versionNode.title = t("version_click_details");
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
  initScrollToTop();

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
    // Browser-internal or cross-origin script errors have no filename/lineno.
    // Swallowing them prevents Safari PWA internals from triggering the error overlay.
    if (!event.filename && event.lineno === 0 && event.colno === 0) {
      console.warn("Ignored cross-origin/browser-internal error:", event.message);
      return;
    }
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
  return appState.callings.some((row) => {
    if (isShcRole() && !isCompletedValue(row?.sp_approved)) return false;
    return isAssignedToCurrentUser(row);
  });
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

    // For SHC role members, only show callings that are SP approved (i.e. "current")
    if (isShcRole() && !isCompletedValue(row?.sp_approved)) {
      return false;
    }

    // In "My Assignments" mode: SHC always filters; others filter only when they have assignments
    const inMyAssignmentsMode = isShcRole()
      ? !appState.showAllCallingsForStake
      : hasAssignments && !appState.showAllCallingsForStake;

    if (inMyAssignmentsMode) {
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
  const [membersResult, statusesResult, unitsResult] = await Promise.all([
    supabase
      .from(getTableName("members"))
      .select("*")
      .order("name", { ascending: true }),
    supabase.from(getTableName("status_options")).select("*"),
    supabase.from("units").select("abrev").order("abrev", { ascending: true }),
  ]);

  const { data: members, error: membersError } = membersResult;
  const { data: statusRows, error: statusError } = statusesResult;
  const { data: unitsRows, error: unitsError } = unitsResult;

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

  if (unitsError) {
    console.error("Could not load unit abbreviations:", unitsError);
  } else {
    appState.unitAbbreviations = (unitsRows || [])
      .map((r) => r.abrev)
      .filter(Boolean);
  }

  updateDerivedMemberLists();
}

async function fetchCurrentUserResponsibilities() {
  console.log(
    "[responsibilities] called — supabase:",
    !!supabase,
    "email:",
    appState.currentMember?.email,
  );
  if (!supabase || !appState.currentMember?.email) {
    appState.currentResponsibilities = null;
    return;
  }
  const { data, error } = await supabase
    .from("responsibilities")
    .select("unit, committee, other")
    .eq("email", String(appState.currentMember.email).trim().toLowerCase())
    .maybeSingle();
  if (error) console.error("fetchCurrentUserResponsibilities error:", error);
  appState.currentResponsibilities = data || null;
  console.log(
    "[responsibilities] fetched:",
    data,
    "for email:",
    appState.currentMember.email,
  );
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
    await showModalAlert(t("mode_switch_partial_error", { mode: newMode }));
  }
}

function getSortedVisibleCallings() {
  const rows = [...getVisibleCallings()];

  rows.sort((a, b) => {
    const aTime = new Date(a?.created_at || a?.timestamp || 0).getTime();
    const bTime = new Date(b?.created_at || b?.timestamp || 0).getTime();
    return bTime - aTime; // newest first
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
  const archivePageEl2 = document.getElementById("archive-page");
  if (list) list.classList.add("hidden");
  if (reportsPage) reportsPage.classList.add("hidden");
  if (notificationsPage) notificationsPage.classList.add("hidden");
  if (inboxPage) inboxPage.classList.add("hidden");
  if (archivePageEl2) archivePageEl2.classList.add("hidden");

  adminPage.classList.remove("hidden");

  const roles = [
    { value: "admin", label: "admin" },
    { value: "stake", label: "stake" },
    { value: "shc", label: "SHC" },
  ]
    .map((r) => `<option value="${r.value}">${r.label}</option>`)
    .join("");

  adminPage.innerHTML = `
    <section class="admin-header">
      <h2>${t("admin_panel_title")}</h2>
      <p>${t("admin_panel_subtitle")}</p>
    </section>

    <section class="admin-actions">
      <button type="button" class="btn btn-primary" onclick="window.startNewMemberForm()">${t("admin_add_member_btn")}</button>
    </section>

    <section class="admin-content">
      <div id="admin-form" class="hidden">
        <article class="card admin-form-card">
          <h3 id="admin-form-title">${t("admin_form_title_add")}</h3>
          <form id="admin-member-form" onsubmit="window.submitMemberForm(event)">
            <div class="form-group">
              <label for="member-email">${t("label_email")}</label>
              <input type="email" id="member-email" required />
            </div>
            <div class="form-group">
              <label for="member-name">${t("label_name")}</label>
              <input type="text" id="member-name" required />
            </div>
            <div class="form-group">
              <label for="member-role">${t("label_role")}</label>
              <select id="member-role" required>
                <option value="">${t("label_select_role")}</option>
                ${roles}
              </select>
            </div>
            <div class="form-group">
              <label for="member-can-assign">
                <input type="checkbox" id="member-can-assign" /> ${t("label_can_assign")}
              </label>
            </div>
            <div class="form-group">
              <label for="member-super">
                <input type="checkbox" id="member-super" /> ${t("label_super_admin")}
              </label>
            </div>
            <div class="form-group">
              <label for="member-receive-concern">
                <input type="checkbox" id="member-receive-concern" /> ${t("label_receive_concern")}
              </label>
            </div>
            <div id="responsibilities-section" class="hidden">
              <hr />
              <h4>Responsibilities</h4>
              <div style="display:flex;gap:1rem;">
                <div class="form-group" style="flex:1;">
                  <label for="resp-unit">Unit</label>
                  <input type="text" id="resp-unit" />
                </div>
                <div class="form-group" style="flex:1;">
                  <label for="resp-committee">Committee</label>
                  <input type="text" id="resp-committee" />
                </div>
              </div>
              <div class="form-group">
                <label for="resp-other">Other</label>
                <input type="text" id="resp-other" />
              </div>
            </div>
            <div class="btn-group">
              <button type="submit" class="btn btn-primary">${t("btn_save_member")}</button>
              <button type="button" class="btn btn-secondary" onclick="window.cancelAdminForm()">${t("btn_cancel")}</button>
            </div>
          </form>
        </article>
      </div>

      <div id="admin-members-list">
        <article class="card admin-members-card">
          <h3>${t("admin_members_heading")}</h3>
          <div class="members-grid">
            ${appState.members
              .map(
                (m) => `
              <div class="member-card" data-member-email="${escapeHtml(m.email)}">
                <div class="member-row"><span class="member-label">${t("label_name_colon")}</span> <button type="button" class="member-name-link" data-action="edit" title="Edit ${escapeHtml(m.name)}">${escapeHtml(m.name)}</button></div>
                <div class="member-row"><span class="member-label">${t("label_email_colon")}</span> <span class="email" title="${escapeHtml(m.email)}">${escapeHtml(m.email)}</span></div>
                <div class="member-row"><span class="member-label">${t("label_role_colon")}</span> ${escapeHtml(m.role || "")}</div>
                <div class="member-row">
                  <span class="member-label ${m.can_be_assigned ? "assign-on" : "assign-off"}">
                    ${t("label_assign_colon")}
                  </span>
                  ${m.can_be_assigned ? "✓" : ""}
                </div>
                <div class="member-row">
                  <span class="member-label ${m.super ? "super-admin-on" : "super-admin-off"}">
                    ${t("label_super_admin_colon")}
                  </span>
                  ${m.super ? "✓" : ""}
                </div>
                <div class="member-row">
                  <span class="member-label ${m.receive_concern ? "concern-recipient-on" : "concern-recipient-off"}">
                    ${t("label_concern_recipient_colon")}
                  </span>
                  ${m.receive_concern ? "✓" : ""}
                </div>
                <div class="member-row">
                  <span class="member-label">${t("label_app_version_colon")}</span>
                  <span class="member-version-cell" style="font-size:0.8rem;color:var(--text-muted);opacity:0.45;">…</span>
                </div>
                <div class="member-row member-actions">
                  <button type="button" class="btn btn-secondary btn-sm" data-action="edit">${t("btn_edit")}</button>
                  <button type="button" class="btn btn-danger btn-sm" data-action="delete">${t("btn_delete")}</button>
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

  // Fill in app version + last-seen for each member card asynchronously
  // so the grid renders immediately and the version data follows.
  fetchAndRenderMemberVersions();
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
      <h2>${t("nav_notifications")}</h2>
      <p>${t("notif_page_subtitle")}</p>
    </section>

    <section class="admin-content">
      <article class="card admin-form-card">
        <h3>${t("notif_subscription_heading")}</h3>
        <p style="margin: 0 0 12px 0; color: var(--text-muted); font-size: 0.9rem;">
          ${isSubscribed ? t("notif_subscribed") : t("notif_not_subscribed")}
        </p>
        ${
          !isSubscribed
            ? `<button type="button" class="btn btn-primary" onclick="window.subscribeToNotifications()">${t("notif_subscribe_btn")}</button>`
            : ""
        }
      </article>

      <article class="card admin-form-card">
        <h3>${t("notif_send_heading")}</h3>
        <div class="form-group">
          <label for="notif-title">${t("label_title")}</label>
          <input type="text" id="notif-title" placeholder="Notification title" />
        </div>
        <div class="form-group">
          <label for="notif-body">${t("label_message")}</label>
          <textarea id="notif-body" rows="4" placeholder="Enter your message..." style="width: 100%; box-sizing: border-box; resize: vertical; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font: inherit; background: var(--white); color: var(--text);"></textarea>
        </div>
        <div class="form-group">
          <label>${t("label_recipients")}</label>
          <div id="notif-recipients-loading" style="color: var(--text-muted); font-size: 0.9rem;">${t("notif_loading_subscribers")}</div>
          <div id="notif-recipients-list" class="notif-recipients-list hidden"></div>
          <div id="notif-no-subscribers" class="hidden" style="color: var(--text-muted); font-size: 0.9rem;">${t("notif_no_subscribers")}</div>
        </div>
        <div class="btn-group">
          <button type="button" class="btn btn-primary" onclick="window.sendPushNotifications()">${t("btn_send")}</button>
          <button type="button" class="btn btn-tertiary" onclick="window.toggleAllNotifRecipients()">${t("btn_select_all")}</button>
          <button type="button" class="btn btn-tertiary" onclick="window.selectShcNotifRecipients()">${t("btn_select_shc")}</button>
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
    const [{ data, error }, { data: members }] = await Promise.all([
      supabase.from("push_subscriptions").select("id, user_email, subscription"),
      supabase.from("members").select("email, role"),
    ]);

    if (error) throw error;

    loadingEl.classList.add("hidden");

    if (!data || data.length === 0) {
      emptyEl.classList.remove("hidden");
      notifSubscribersCache = [];
      return;
    }

    const roleByEmail = {};
    if (members) {
      members.forEach((m) => {
        if (m.email) roleByEmail[m.email.toLowerCase()] = m.role;
      });
    }

    notifSubscribersCache = data.map((sub) => ({
      ...sub,
      role: roleByEmail[sub.user_email?.toLowerCase()] ?? null,
    }));

    listEl.classList.remove("hidden");
    listEl.innerHTML = notifSubscribersCache
      .map(
        (sub, i) => `
        <label class="notif-recipient-item">
          <input type="checkbox" name="notif-recipient" value="${i}" />
          <span>${escapeHtml(sub.user_email || t("notif_subscriber_label", { n: i + 1 }))}</span>
        </label>
      `,
      )
      .join("");
  } catch (err) {
    if (loadingEl)
      loadingEl.textContent = t("notif_load_error", { message: err.message });
  }
}

function renderInboxPage() {
  localStorage.setItem("lastInboxView", new Date().toISOString());
  appState.hasUnreadMessages = false;

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
  const archivePageEl4 = document.getElementById("archive-page");
  if (archivePageEl4) archivePageEl4.classList.add("hidden");
  inboxPage.classList.remove("hidden");

  inboxPage.innerHTML = `
    <section class="admin-header">
      <h2>${t("nav_messages")}</h2>
      <p>${t("inbox_subtitle")}</p>
    </section>
    <section class="admin-content">
      <article class="card admin-form-card">
        <div id="inbox-loading" style="color: var(--text-muted); font-size: 0.9rem;">${t("inbox_loading")}</div>
        <div id="inbox-list" class="inbox-list hidden"></div>
        <div id="inbox-empty" class="hidden" style="color: var(--text-muted); font-size: 0.9rem;">${t("inbox_empty")}</div>
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
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        const timeStr = date.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        });
        return `
          <div class="inbox-item" data-id="${escapeHtml(n.id)}">
            <div class="inbox-item-header">
              <span class="inbox-item-title">${escapeHtml(n.title)}</span>
              <div class="inbox-item-meta">
                <span class="inbox-item-date">${dateStr}, ${timeStr}</span>
                <button class="inbox-item-delete" onclick="deleteInboxMessage('${escapeHtml(n.id)}')" title="Delete message" aria-label="Delete message">×</button>
              </div>
            </div>
            <div class="inbox-item-body">${escapeHtml(n.body)}</div>
            ${n.sent_by_email ? `<div class="inbox-item-from">${t("inbox_from", { email: escapeHtml(n.sent_by_email) })}</div>` : ""}
          </div>
        `;
      })
      .join("");
  } catch (err) {
    if (loadingEl)
      loadingEl.textContent = t("inbox_load_error", { message: err.message });
  }
}

window.deleteInboxMessage = async function (id) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return;

  const { data: msg, error: fetchErr } = await supabase
    .from("app_notifications")
    .select("recipients")
    .eq("id", id)
    .single();

  if (fetchErr || !msg) return;

  const newRecipients = (msg.recipients || []).filter((e) => e !== user.email);

  const { error: updateErr } = await supabase
    .from("app_notifications")
    .update({ recipients: newRecipients })
    .eq("id", id);

  if (updateErr) {
    console.error("Failed to delete message:", updateErr);
    return;
  }

  const itemEl = document.querySelector(`.inbox-item[data-id="${id}"]`);
  if (itemEl) itemEl.remove();

  const listEl = document.getElementById("inbox-list");
  if (listEl && listEl.querySelectorAll(".inbox-item").length === 0) {
    listEl.classList.add("hidden");
    const emptyEl = document.getElementById("inbox-empty");
    if (emptyEl) emptyEl.classList.remove("hidden");
  }
};

async function checkInboxAlert() {
  const lastView =
    localStorage.getItem("lastInboxView") || "1970-01-01T00:00:00.000Z";
  try {
    const { count, error } = await supabase
      .from("app_notifications")
      .select("id", { count: "exact", head: true })
      .gt("sent_at", lastView);

    if (error) return;

    const hasUnread = (count ?? 0) > 0;
    if (appState.hasUnreadMessages === hasUnread) return;

    appState.hasUnreadMessages = hasUnread;
    const btn = document.getElementById("messages-btn");
    if (btn) {
      btn.classList.toggle("inbox-alert", hasUnread);
    }
  } catch (_) {
    // silently ignore — non-critical UI hint
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
  const archivePageEl3 = document.getElementById("archive-page");
  if (archivePageEl3) archivePageEl3.classList.add("hidden");

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
      <h2>${t("nav_reports")}</h2>
      <p>${t("reports_subtitle")}</p>
    </section>

    <section class="report-actions">
      <select id="report-type" onchange="window.selectReportType(this.value)">
        <option value="sustain-setapart-release" ${
          appState.currentReportType === "sustain-setapart-release"
            ? "selected"
            : ""
        }>${t("report_stake_business")}</option>
        <option value="awaiting-shc" ${
          appState.currentReportType === "awaiting-shc" ? "selected" : ""
        }>${t("report_awaiting_hc")}</option>
        <option value="unassigned-assignments" ${
          appState.currentReportType === "unassigned-assignments"
            ? "selected"
            : ""
        }>${t("report_unassigned")}</option>
        <option value="assignments-by-person" ${
          appState.currentReportType === "assignments-by-person"
            ? "selected"
            : ""
        }>${t("report_by_person")}</option>
        <option value="status-summary" ${
          appState.currentReportType === "status-summary" ? "selected" : ""
        }>${t("report_status_summary")}</option>
        <option value="archive-items" ${
          appState.currentReportType === "archive-items" ? "selected" : ""
        }>${t("report_archive_items")}</option>
      </select>
      ${(() => {
        if (appState.currentReportType !== "sustain-setapart-release")
          return "";
        const l = appState.reportLanguage || "en";
        return `<div class="lang-switcher" role="group" aria-label="Report language">
        <button type="button" class="btn lang-btn ${l === "en" ? "lang-btn-active" : ""}" onclick="window.setReportLanguage('en')">English</button>
        <button type="button" class="btn lang-btn ${l === "sm" ? "lang-btn-active" : ""}" onclick="window.setReportLanguage('sm')">Samoan</button>
        <button type="button" class="btn lang-btn ${l === "to" ? "lang-btn-active" : ""}" onclick="window.setReportLanguage('to')">Tongan</button>
      </div>`;
      })()}
      <button type="button" class="btn btn-primary" onclick="window.generateCurrentReport()">${t("btn_generate_report")}</button>
    </section>

    <article class="card report-card">
      ${reportValue}
      ${actionButtons}
    </article>
  `;
}

function renderArchivePage() {
  const list = document.getElementById("data-list");
  const reportsPage = document.getElementById("reports-page");
  const adminPage = document.getElementById("admin-page");
  const notificationsPage = document.getElementById("notifications-page");
  const inboxPage = document.getElementById("inbox-page");
  const archivePage = document.getElementById("archive-page");
  if (!archivePage) return;

  if (list) list.classList.add("hidden");
  if (reportsPage) reportsPage.classList.add("hidden");
  if (adminPage) adminPage.classList.add("hidden");
  if (notificationsPage) notificationsPage.classList.add("hidden");
  if (inboxPage) inboxPage.classList.add("hidden");
  archivePage.classList.remove("hidden");

  const PAGE_SIZE = 10;
  const items = appState.archivedItems || [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(appState.archiveCurrentPage, totalPages - 1);
  appState.archiveCurrentPage = currentPage;

  const pageItems = items.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE,
  );

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const rows = pageItems.length
    ? pageItems
        .map((item) => {
          const typeClass = String(item.type || "")
            .toLowerCase()
            .includes("release")
            ? "archive-row-release"
            : "archive-row-calling";
          const dateStr = formatDate(item.created_at);
          return `
        <tr>
          <td class="${typeClass}">${escapeHtml(item.name || "—")}</td>
          <td>${escapeHtml(item.position || "—")}</td>
          <td>${escapeHtml(item.status || "—")}${dateStr ? `<br><span class="archive-status-date">${dateStr}</span>` : ""}</td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="3" class="archive-empty">${t("archive_empty")}</td></tr>`;

  archivePage.innerHTML = `
    <section class="archive-header">
      <h2>${t("nav_archive")}</h2>
      <p>${t("archive_subtitle")}</p>
    </section>

    <section class="archive-content">
      <table class="archive-table">
        <thead>
          <tr>
            <th>${t("col_name")}</th>
            <th>${t("col_position")}</th>
            <th>${t("col_status")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>

    <section class="archive-pagination">
      <button
        class="btn btn-secondary"
        onclick="window.archivePagePrev()"
        ${currentPage === 0 ? "disabled" : ""}
      >${t("btn_previous")}</button>
      <span class="archive-page-indicator">${t("archive_page_indicator", { current: currentPage + 1, total: totalPages })}</span>
      <button
        class="btn btn-secondary"
        onclick="window.archivePageNext()"
        ${currentPage >= totalPages - 1 ? "disabled" : ""}
      >${t("btn_next")}</button>
    </section>
  `;
}

function renderCurrentPage() {
  const isAdmin = appState.currentPage === "admin";
  const isNotifications = appState.currentPage === "notifications";
  const isInbox = appState.currentPage === "inbox";
  syncFabVisibility(appState.currentPage !== "callings");

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
    if (!isAdminAccess()) {
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

  if (appState.currentPage === "archive") {
    if (!isAdminRole()) {
      appState.currentPage = "callings";
      renderCards();
      return;
    }
    renderArchivePage();
    return;
  }

  renderCards();
}

async function archiveCallingRecord(id, options = {}) {
  const { confirm = true } = options;

  if (!isAdminRole()) {
    await showModalAlert(t("error_admin_only"));
    renderCurrentPage();
    return false;
  }

  const item = appState.callings.find((calling) => calling.id === id);
  if (!item) {
    await showModalAlert(t("error_not_found"));
    renderCurrentPage();
    return false;
  }

  const normalizedStatus = String(item.status || "").trim();

  if (normalizedStatus === "In Progress") {
    await showModalAlert(t("error_archive_in_progress"));
    renderCurrentPage();
    return false;
  }

  const isDeleteMistake = normalizedStatus === "Mistake: DELETE";

  if (confirm) {
    const message = isDeleteMistake
      ? t("confirm_delete_mistake", { name: item.name || t("no_name") })
      : t("confirm_archive");

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
        t("error_perm_delete_failed", { message: error.message }),
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
        t("error_archive_failed", { message: error.message }),
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
  const archivePageEl = document.getElementById("archive-page");
  if (adminPage) adminPage.classList.add("hidden");
  if (reportsPage) reportsPage.classList.add("hidden");
  if (notificationsPage) notificationsPage.classList.add("hidden");
  if (inboxPage4) inboxPage4.classList.add("hidden");
  if (archivePageEl) archivePageEl.classList.add("hidden");
  if (list) list.classList.remove("hidden");

  cardsRenderer.renderCards();

  if (isShcRole() && !appState.showAllCallingsForStake) {
    const resp = appState.currentResponsibilities;
    const listEl = document.getElementById("data-list");
    if (listEl) {
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="card-banner banner-hc">High Council Responsibilities</div>
        <div class="card-content">
          ${resp?.unit ? `<div class="member-row"><span class="member-label">Unit:</span> ${escapeHtml(resp.unit)}</div>` : ""}
          ${resp?.committee ? `<div class="member-row"><span class="member-label">Committee:</span> ${escapeHtml(resp.committee)}</div>` : ""}
          ${resp?.other ? `<div class="member-row"><span class="member-label">Other:</span> ${escapeHtml(resp.other)}</div>` : ""}
        </div>
      `;
      listEl.appendChild(card);
    }
  }
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

const DEV_ROLES = {
  stake: { role: "stake", super: false },
  shc: { role: "shc", super: false },
  admin: { role: "admin", super: false },
  super: { role: "admin", super: true },
};

if ((import.meta.env.VITE_SUBTITLE || "").includes("STAGING")) {
  window.devSetRole = (key) => {
    const r = DEV_ROLES[key];
    if (!r || !appState.currentMember) return;
    appState.currentRole = r.role;
    appState.currentMember.super = r.super;
    renderHeader();
    syncFabVisibility();
    renderCards();
  };
}

window.setLanguage = async (lang) => {
  await loadLocale(lang);
  setLang(lang);
  renderHeader();
  renderCurrentPage();
};

window.toggleSpApproval = async (id, checkbox) => {
  if (!checkbox.checked) {
    const confirmed = await showModalConfirm(t("confirm_remove_sp_approval"));
    if (!confirmed) {
      checkbox.checked = true;
      return;
    }
  }
  callingsActions.updateField(id, "sp_approved", checkbox.checked);
};

window.toggleCallingScope = () => {
  appState.showAllCallingsForStake = !appState.showAllCallingsForStake;
  appState.currentPage = "callings";
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
  if (!isAdminAccess()) {
    return;
  }
  appState.currentPage =
    appState.currentPage === "admin" ? "callings" : "admin";
  renderHeader();
  renderCurrentPage();
};

window.showAdminModal = () => {
  if (!isAdminAccess()) return;
  showAdminHubModal({ showMemberMaintenance: isSuperAdmin() });
};

window.openMemberMaintenancePage = () => {
  if (!isSuperAdmin()) return;
  appState.currentPage = "admin";
  renderHeader();
  renderCurrentPage();
};

window.openNotificationsPage = () => {
  if (!isAdminAccess()) return;
  appState.currentPage = "notifications";
  renderHeader();
  renderCurrentPage();
};

window.openInbox = () => {
  localStorage.setItem("lastInboxView", new Date().toISOString());
  appState.hasUnreadMessages = false;
  appState.currentPage = "inbox";
  renderHeader();
  renderCurrentPage();
};

window.openArchivePage = () => {
  if (!isAdminRole()) return;
  appState.currentPage = "archive";
  appState.archiveCurrentPage = 0;
  renderHeader();
  renderCurrentPage();
};

window.archivePagePrev = () => {
  if (appState.archiveCurrentPage > 0) {
    appState.archiveCurrentPage -= 1;
    renderArchivePage();
  }
};

window.archivePageNext = () => {
  const totalPages = Math.max(
    1,
    Math.ceil((appState.archivedItems || []).length / 10),
  );
  if (appState.archiveCurrentPage < totalPages - 1) {
    appState.archiveCurrentPage += 1;
    renderArchivePage();
  }
};

window.sendPushNotifications = async () => {
  const titleEl = document.getElementById("notif-title");
  const bodyEl = document.getElementById("notif-body");
  const statusEl = document.getElementById("notif-status");

  const title = titleEl?.value?.trim();
  const body = bodyEl?.value?.trim();

  if (!title || !body) {
    await showModalAlert(t("notif_send_title_body_required"));
    return;
  }

  const checkboxes = document.querySelectorAll(
    "input[name='notif-recipient']:checked",
  );
  const selectedIndices = Array.from(checkboxes).map((cb) =>
    parseInt(cb.value, 10),
  );

  if (selectedIndices.length === 0) {
    await showModalAlert(t("notif_send_recipient_required"));
    return;
  }

  function setStatus(msg, style = "") {
    if (!statusEl) return;
    statusEl.classList.remove("hidden");
    statusEl.textContent = msg;
    statusEl.className = `notif-status${style ? ` ${style}` : ""}`;
  }

  setStatus(t("notif_sending_to", { count: selectedIndices.length }));

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
  const failedEmails = [];
  const staleEmails = [];

  for (const i of selectedIndices) {
    const sub = notifSubscribersCache[i];
    if (!sub) continue;

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
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
      });

      const result = await res.json().catch(() => ({}));

      if (res.ok) {
        successCount++;
        if (sub.user_email) deliveredTo.push(sub.user_email);
      } else if (result?.error?.includes("410")) {
        // Subscription expired — remove it from the database silently
        staleCount++;
        if (sub.user_email) staleEmails.push(sub.user_email);
        supabase.from("push_subscriptions").delete().eq("id", sub.id).then();
        console.warn("Removed stale subscription:", sub.user_email);
      } else {
        failCount++;
        lastError = result?.error ?? `HTTP ${res.status}`;
        if (sub.user_email) failedEmails.push(sub.user_email);
        console.error("send-notification error:", lastError, result);
      }
    } catch (err) {
      failCount++;
      lastError = err.message;
      if (sub.user_email) failedEmails.push(sub.user_email);
      console.error("send-notification fetch error:", err);
    }
  }

  // Save to app_notifications — only recipients in deliveredTo can see it in their inbox
  if (deliveredTo.length > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("app_notifications").insert([
      {
        title,
        body,
        sent_by_email: user?.email ?? null,
        recipients: deliveredTo,
      },
    ]);
  }

  const parts = [];
  if (successCount) parts.push(`${successCount} sent`);
  if (staleCount) {
    const who = staleEmails.length ? ` (${staleEmails.join(", ")})` : "";
    parts.push(`${staleCount} expired${who} — recipient needs to re-subscribe`);
  }
  if (failCount) {
    const who = failedEmails.length ? ` (${failedEmails.join(", ")})` : "";
    parts.push(`${failCount} failed${who} — ${lastError}`);
  }

  const style =
    failCount > 0 || staleCount > 0
      ? "notif-status-error"
      : "notif-status-success";
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
  if (btn)
    btn.textContent = allChecked ? t("btn_select_all") : t("btn_deselect_all");
};

window.selectShcNotifRecipients = () => {
  const checkboxes = document.querySelectorAll("input[name='notif-recipient']");
  if (!checkboxes.length) return;
  checkboxes.forEach((cb) => {
    const index = parseInt(cb.value, 10);
    cb.checked = notifSubscribersCache[index]?.role === "shc";
  });
};

window.selectReportType = (value) => {
  appState.currentReportType = value;
};

window.generateCurrentReport = () => {
  appState.reportOutput = generateReport(
    appState.currentReportType,
    appState.callings,
    {
      getHighCouncilVoteSummary,
      hcVotingTableAvailable: appState.hcVotingTableAvailable,
      archivedRows: appState.archivedItems,
      pageSize: 25,
      language: appState.reportLanguage,
    },
  );
  renderReportsPage();
};

window.setReportLanguage = (lang) => {
  appState.reportLanguage = lang;
  if (
    appState.reportOutput &&
    appState.currentReportType === "sustain-setapart-release"
  ) {
    window.generateCurrentReport();
  } else {
    renderReportsPage();
  }
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

    await fetchCurrentUserResponsibilities();
    await fetchCallings();

    if (appState.currentPage === "reports" && appState.currentReportType) {
      appState.reportOutput = generateReport(
        appState.currentReportType,
        appState.callings,
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
      window.showToast(t("toast_data_refreshed"));
    }
  } catch (error) {
    console.error("Failed to refresh data:", error);
    await showModalAlert(
      t("error_refresh_data", {
        message: error?.message || t("unknown_error"),
      }),
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
    await showModalAlert(t("report_none_to_copy"));
    return;
  }

  try {
    await navigator.clipboard.writeText(appState.reportOutput);
    await showModalAlert(t("report_copied"));
  } catch (err) {
    console.error("Failed to copy report:", err);
    await showModalAlert(t("report_copy_failed"));
  }
};

window.printReport = async () => {
  if (!appState.reportOutput) {
    await showModalAlert(t("report_none_to_print"));
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
  const confirmed = await showModalConfirm(t("confirm_reset_cache"));
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
    button.textContent = t("btn_concern_sending");
  }

  try {
    await window.submitHighCouncilVote(id, "concern");

    const summary = getHighCouncilVoteSummary(id);
    const currentUserVote = summary.currentUserVote;

    if (button) {
      button.classList.remove("is-sending");

      if (currentUserVote === "concern") {
        button.classList.add("is-sent", "is-selected");
        button.textContent = t("btn_concern_voted");
      } else {
        button.classList.remove("is-sent", "is-selected");
        button.textContent = t("btn_concern");
      }
    }
  } catch (error) {
    console.error("Concern click failed:", error);

    if (button) {
      button.classList.remove("is-sending");
      button.textContent = t("btn_concern");
    }

    await showModalAlert(t("error_concern_failed"));
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
      return t("login_err_email_not_confirmed");
    }

    if (errorCode === "otp_disabled") {
      return t("login_err_otp_disabled");
    }

    if (errorCode === "signup_disabled") {
      return t("login_err_signup_disabled");
    }

    if (errorCode === "over_email_send_rate_limit") {
      return t("login_err_rate_limit_email");
    }

    if (errorCode === "over_request_rate_limit") {
      return t("login_err_rate_limit_requests");
    }

    if (errorCode === "email_address_not_authorized") {
      return t("login_err_email_not_authorized");
    }

    if (errorCode === "unexpected_failure" || errorStatus >= 500) {
      return t("login_err_backend");
    }

    if (/database error finding user/i.test(error?.message || "")) {
      return t("login_err_no_identity");
    }

    return error?.message || t("login_err_generic");
  };

  // Initial UI state: Email Entry
  app.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <div class="login-splash">
          <h1><span>The</span> Record</h1>
          <h3>${t("login_tagline")}</h3>
          ${
            appState.dbMode === "training"
              ? `
            <div style="background-color: #f59e0b; color: #000; padding: 8px; margin-top: 12px; border-radius: 6px; font-size: 13px; font-weight: bold;">
              ${t("login_training_mode")}
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
              placeholder="${t("login_email_placeholder")}"
              required
              class="loginEntry"
            />
            <button type="submit">${t("login_send_code_btn")}</button>
          </form>
        </div>

        <div id="auth-step-code" class="hidden">
          <p class="form-instruction">${t("login_enter_code")}</p>
          <p id="auth-step-code-email" class="form-instruction" style="font-size: 0.85em; opacity: 0.7; margin-top: -8px;"></p>
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
            <button type="submit">${t("login_verify_btn")}</button>
            <button type="button" class="btn-link" id="back-to-email-btn">${t("login_new_code_btn")}</button>
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

  const showEmailStep = () => {
    emailStep.classList.remove("hidden");
    codeStep.classList.add("hidden");
    message.textContent = "";
    message.classList.remove("error");
    const emailInput = document.getElementById("email-input");
    if (emailInput) emailInput.focus();
  };

  const showCodeStep = (email) => {
    emailStep.classList.add("hidden");
    codeStep.classList.remove("hidden");
    const emailHint = document.getElementById("auth-step-code-email");
    if (emailHint && email) emailHint.textContent = email;
    const otpInput = document.getElementById("otp-input");
    if (otpInput) otpInput.focus();
  };

  document.getElementById("back-to-email-btn").addEventListener("click", () => {
    localStorage.removeItem("otp-email");
    userEmail = "";
    showEmailStep();
  });

  // Pre-fill email and skip to code step if a prior request is in flight
  if (userEmail) {
    document.getElementById("email-input").value = userEmail;
    showCodeStep(userEmail);
    message.textContent = t("login_code_instruction");
  }

  // Step 1: Request the OTP
  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    userEmail = normalizeEmail(document.getElementById("email-input").value);
    if (!userEmail) return;

    message.textContent = t("login_checking");
    message.classList.remove("error");

    const { data: memberRow, error: memberLookupError } = await supabase
      .from("members")
      .select("email")
      .eq("email", userEmail)
      .maybeSingle();

    if (!memberLookupError && !memberRow) {
      message.textContent = t("login_unregistered_email");
      message.classList.add("error");
      return;
    }

    message.textContent = t("login_sending_code");
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
    showCodeStep(userEmail);
    message.textContent = t("login_check_email", { mode: dbModeLabel });
  });

  // Step 2: Verify the OTP
  verifyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = document.getElementById("otp-input").value.trim();

    // Get fresh email from localStorage in case of page reload
    const verifyEmail = localStorage.getItem("otp-email") || userEmail;

    if (!verifyEmail) {
      message.textContent = t("login_session_expired");
      message.classList.add("error");
      setTimeout(() => renderLogin(), 2000);
      return;
    }

    message.textContent = t("login_verifying");
    message.classList.remove("error");

    const dbModeLabel = (appState.dbMode || "production").toUpperCase();
    console.log(
      `[OTP] Verifying code for ${verifyEmail} in ${dbModeLabel} mode`,
    );

    const { data: verifyData, error } = await supabase.auth.verifyOtp({
      email: verifyEmail,
      token,
      type: "email",
    });

    if (error) {
      const dbModeLabel = (appState.dbMode || "production").toUpperCase();
      message.textContent = t("login_invalid_code", { mode: dbModeLabel });
      message.classList.add("error");
      return;
    }

    // Persist the session in DB so iOS can restore it even after
    // localStorage is cleared.
    await saveDbSession(verifyData?.session);

    message.textContent = t("login_success");

    // Clear the stored email after successful login
    localStorage.removeItem("otp-email");

    startApp().catch((error) => {
      console.error("Failed to start app after login:", error);
      showFatalError(
        t("fatal_start_error"),
        error?.message || t("fatal_unexpected"),
      );
    });
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
        <h2 id="concern-notice-title">${t("concern_modal_title")}</h2>
      </div>
      <div class="notice-modal-body">
        <p>
          ${t("concern_modal_body")}
        </p>
      </div>
      <div class="btn-group notice-modal-actions">
        <button type="button" class="btn btn-primary" onclick="window.closeConcernNoticeModal()">${t("btn_i_understand")}</button>
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

window.confirmLogout = async () => {
  const confirmed = await showModalConfirm(t("confirm_logout_body"), {
    title: t("confirm_logout_title"),
  });
  if (confirmed) window.logout();
};

window.logout = async () => {
  // Remove this device's DB session row and cookie before signing out
  await deleteDbSession();

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
    isSuperAdminUser: isAdminAccess,
    ensureCreateCallingUi,
  });

  ensureConcernNoticeModal();
}

window.startNewMemberForm = () => {
  if (!isSuperAdmin()) {
    showModalAlert(t("error_super_admin_only"));
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

  document.getElementById("admin-form-title").textContent = t(
    "admin_form_title_add",
  );
  document.getElementById("admin-member-form").reset();
  document.getElementById("member-email").disabled = false;
  appState.adminFormData.action = "create";
  appState.adminFormData.selectedMemberEmail = null;

  const respSection = document.getElementById("responsibilities-section");
  if (respSection) respSection.classList.add("hidden");
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
    await showModalAlert(t("error_super_admin_modify"));
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
    await showModalAlert(t("error_required_fields"));
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
        await showModalAlert(
          t("error_provision_member", { error: result.error }),
        );
        return;
      }

      await showModalAlert(t("member_provisioned"));
    } else if (appState.adminFormData.action === "update") {
      const oldEmail = String(appState.adminFormData.selectedMemberEmail || "")
        .trim()
        .toLowerCase();

      if (!oldEmail) {
        await showModalAlert(t("error_missing_member_email"));
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
        await showModalAlert(t("error_update_member", { error: result.error }));
        return;
      }

      if (supabase) {
        const unit =
          (document.getElementById("resp-unit").value || "").trim() || null;
        const committee =
          (document.getElementById("resp-committee").value || "").trim() ||
          null;
        const other =
          (document.getElementById("resp-other").value || "").trim() || null;
        const { error: respError } = await supabase
          .from("responsibilities")
          .upsert(
            {
              email: String(email).trim().toLowerCase(),
              unit,
              committee: committee,
              other,
            },
            { onConflict: "email" },
          );
        if (respError) {
          console.error("Responsibilities upsert error:", respError);
          await showModalAlert(
            `Responsibilities save failed: ${respError.message}`,
          );
          return;
        }
      }

      await showModalAlert(t("member_updated"));
    }

    await fetchReferenceData();
    window.cancelAdminForm();
    renderAdminPage();
  } catch (error) {
    console.error("Form submission error:", error);
    await showModalAlert(t("error_generic", { message: error.message }));
  }
};

window.editMember = async (memberEmail) => {
  if (!isSuperAdmin()) {
    await showModalAlert(t("error_super_admin_edit"));
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
    await showModalAlert(t("error_member_not_found"));
    return;
  }

  document.getElementById("member-email").value = member.email || "";
  document.getElementById("member-name").value = member.name || "";
  document.getElementById("member-role").value = member.role || "";
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

  const respSection = document.getElementById("responsibilities-section");
  if (respSection && String(member.role || "").toUpperCase() === "SHC") {
    respSection.classList.remove("hidden");
    document.getElementById("resp-unit").value = "";
    document.getElementById("resp-committee").value = "";
    document.getElementById("resp-other").value = "";

    if (supabase) {
      const { data: resp } = await supabase
        .from("responsibilities")
        .select("unit, committee, other")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (resp) {
        document.getElementById("resp-unit").value = resp.unit || "";
        document.getElementById("resp-committee").value = resp.committee || "";
        document.getElementById("resp-other").value = resp.other || "";
      }
    }
  }

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
    await showModalAlert(t("error_super_admin_delete"));
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
    await showModalAlert(t("error_member_not_found"));
    return;
  }

  const confirmed = await showModalConfirm(
    t("confirm_delete_member", { name: member.name }),
  );

  if (!confirmed) return;

  try {
    const result = await provisionMemberWithServer({
      action: "delete",
      email: normalizedEmail,
    });

    if (!result.ok) {
      console.error("Delete error:", result.error);
      await showModalAlert(t("error_delete_member", { error: result.error }));
      return;
    }

    await showModalAlert(t("member_deleted"));
    await fetchReferenceData();
    renderAdminPage();
  } catch (error) {
    console.error("Delete error:", error);
    await showModalAlert(t("error_generic", { message: error.message }));
  }
};

// ─── VERSION TELEMETRY ──────────────────────────────────────────────────────

// Upserts this user's current app version on every startup.
// Non-blocking — runs in the background after the UI has rendered.
async function recordAppVersion(user) {
  if (!supabase || !user?.id) return;
  const version =
    document.getElementById("app-version")?.textContent?.trim() || "unknown";
  await supabase.from("user_app_versions").upsert(
    {
      user_id: user.id,
      email: user.email,
      version,
      last_seen: new Date().toISOString(),
      user_agent: navigator.userAgent,
    },
    { onConflict: "user_id" },
  );
}

// Formats a timestamp as a short relative string: "just now", "4h ago", "3d ago".
function formatRelativeTime(isoString) {
  if (!isoString) return "never";
  const mins = Math.floor(
    (Date.now() - new Date(isoString).getTime()) / 60_000,
  );
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Fetches every member's recorded version and fills in the admin panel cells.
// Called after renderAdminPage() so the grid is in the DOM before we update it.
async function fetchAndRenderMemberVersions() {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("user_app_versions")
    .select("email, version, last_seen");
  if (error || !data) return;

  const byEmail = new Map(
    data.map((r) => [String(r.email || "").toLowerCase(), r]),
  );

  document
    .querySelectorAll(".member-card[data-member-email]")
    .forEach((card) => {
      const email = String(card.dataset.memberEmail || "").toLowerCase();
      const rec = byEmail.get(email);
      const cell = card.querySelector(".member-version-cell");
      if (!cell) return;

      if (rec?.version) {
        cell.textContent = `${rec.version} · ${formatRelativeTime(rec.last_seen)}`;
        cell.style.opacity = "1";
      } else {
        cell.textContent = t("admin_version_not_seen");
        cell.style.opacity = "0.45";
      }
    });
}

async function startApp() {
  const savedThemeMode = getSavedThemeMode();
  applyThemeMode(savedThemeMode, appState);

  await loadLocale("en");
  const savedLang = getCurrentLang();
  if (savedLang !== "en") await loadLocale(savedLang);

  if (!supabase) {
    showFatalError(t("fatal_missing_config"), t("fatal_missing_config_detail"));
    return;
  }

  try {
    await fetchReferenceData();
  } catch (error) {
    console.error("Error fetching members:", error);
    showFatalError(
      t("fatal_load_error"),
      error?.message || t("fatal_fetch_members"),
    );
    return;
  }

  supabase.auth.onAuthStateChange((event) => {
    console.log("Auth state changed:", event);
  });

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError && sessionError.name !== "AuthSessionMissingError") {
    console.error("Auth session lookup failed:", sessionError);
    renderLogin();
    return;
  }

  let user = session?.user ?? null;

  if (!user) {
    // localStorage may have been cleared (common on iOS PWAs) — try DB restore
    user = await restoreDbSession();
    if (!user) {
      renderLogin();
      return;
    }
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
    showFatalError(t("fatal_access_denied"), t("fatal_not_in_members"));
    return;
  }

  appState.currentUser = user;
  appState.currentMember = matchedMember;
  appState.currentRole = String(matchedMember.role || "")
    .toLowerCase()
    .trim();

  await fetchCurrentUserResponsibilities();

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
    history.replaceState(null, "", window.location.pathname);
  }

  renderHeader();
  renderCurrentPage();

  // Background tasks — none of these block the UI.
  repairPushSubscriptionIfNeeded(user);
  recordAppVersion(user);
  checkInboxAlert();
  supabase
    .channel("inbox-alert")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "app_notifications" },
      () => checkInboxAlert(),
    )
    .subscribe();
}

async function repairPushSubscriptionIfNeeded(user) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (!user?.id) return;

  try {
    const registration = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
    );
    if (!registration) return;

    const browserSub = await registration.pushManager.getSubscription();

    // Fetch what the database thinks this user's subscription is
    const { data: dbRows } = await supabase
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", user.id)
      .limit(1);

    const dbEndpoint = dbRows?.[0]?.subscription?.endpoint ?? null;
    const browserEndpoint = browserSub?.endpoint ?? null;

    // User never subscribed — nothing to repair
    if (!dbEndpoint && !browserEndpoint) return;

    // Only silently re-subscribe if permission is already granted (no prompt needed)
    if (Notification.permission !== "granted") {
      // Permission lost — show the button so user can manually re-subscribe
      if (appState.hasPushSubscription) {
        appState.hasPushSubscription = false;
        renderHeader();
      }
      return;
    }

    // Always refresh to pick up rotated or push-service-expired tokens
    console.log("[push] refreshing push subscription…");

    if (browserSub) await browserSub.unsubscribe();

    const newSub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: PUBLIC_VAPID_KEY,
    });

    await supabase.from("push_subscriptions").delete().eq("user_id", user.id);
    await supabase
      .from("push_subscriptions")
      .insert([
        { user_id: user.id, user_email: user.email, subscription: newSub },
      ]);

    appState.hasPushSubscription = true;
    renderHeader();
    console.log("[push] push subscription refreshed");
  } catch (err) {
    // Repair failed — surface the subscribe button so user can manually re-subscribe
    console.warn("[push] push repair failed:", err.message);
    appState.hasPushSubscription = false;
    renderHeader();
  }
}

async function sendWelcomeNotification(registration) {
  try {
    const title = t("welcome_notif_title");
    const options = {
      body: t("welcome_notif_body"),
      icon: `${import.meta.env.BASE_URL}favicon.ico`,
      badge: `${import.meta.env.BASE_URL}favicon.ico`,
      tag: "welcome-notification",
      requireInteraction: false,
      silent: false,
    };

    console.log("[notification] Attempting to send welcome notification", {
      swReady: !!registration,
      swActive: !!registration?.active,
      permissionStatus: Notification.permission,
    });

    // Wait for the service worker to be active before showing the notification
    let activeRegistration = registration;
    if (!registration?.active) {
      console.log("[notification] Waiting for service worker to activate...");
      activeRegistration = await navigator.serviceWorker.ready;
    }

    // Try service worker first (more reliable for push notifications)
    if (activeRegistration?.active) {
      console.log("[notification] Using service worker to show notification");
      await activeRegistration.showNotification(title, options);
      console.log(
        "[notification] Welcome notification sent via service worker",
      );
      return;
    }

    // Fallback: use Notification API directly
    if (Notification.permission === "granted") {
      console.log("[notification] Using Notification API directly");
      new Notification(title, options);
      console.log(
        "[notification] Welcome notification sent via Notification API",
      );
      return;
    }

    console.warn(
      "[notification] Could not send notification - permission not granted or SW not ready",
    );
  } catch (error) {
    console.error("[notification] Error sending welcome notification:", error);
    // Non-fatal — user is still subscribed
  }
}

async function subscribeToPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error(t("push_not_supported"));
  }

  // Use BASE_URL so the path is correct for subdirectory deployments
  // e.g. GitHub Pages at /the-record/ → registers /the-record/sw.js not /sw.js
  const registration = await navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}sw.js`,
  );

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(t("push_permission_denied"));
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
    throw new Error(t("push_no_user"));
  }

  // Remove any existing subscription for this user before inserting the new one
  // (no unique constraint exists, so upsert isn't available)
  await supabase.from("push_subscriptions").delete().eq("user_id", user.id);

  const { error } = await supabase
    .from("push_subscriptions")
    .insert([
      { user_id: user.id, user_email: user.email, subscription: subscription },
    ]);

  if (error) {
    throw new Error(t("push_save_failed", { message: error.message }));
  }
  appState.hasPushSubscription = true;
  // Delay welcome notification so it doesn't fire before the browser permission dialog fully clears
  // Immediate receipt of the notifcation was sometimes not noticed by users.
  setTimeout(() => sendWelcomeNotification(registration), 45_000);

  console.log("User successfully subscribed!");
}

// window.setDatabaseMode = (mode) => {
//   localStorage.setItem("dbMode", mode);
//   location.reload();
// };

startApp().catch((error) => {
  console.error("Failed to start app:", error);
  showFatalError(
    t("fatal_start_error"),
    error?.message || t("fatal_unexpected"),
  );
});
