function updateFabDebugBadge(documentRef = document) {
  const badge = documentRef.getElementById("fab-debug-badge");
  if (badge) {
    badge.remove();
  }
}

function ensureResetCacheQuickAction(onResetCache, documentRef = document) {
  let button = documentRef.getElementById("reset-cache-quick-btn");
  if (!button) {
    button = documentRef.createElement("button");
    button.id = "reset-cache-quick-btn";
    button.type = "button";
    button.textContent = "Reset Cache";
    button.onclick = () => onResetCache();
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
    documentRef.body.appendChild(button);
  }

  return button;
}

export function syncFabVisibility({
  hasAdminPasswordAccess,
  isLoggedInSession,
  onResetCache,
  documentRef = document,
}) {
  const fab = documentRef.getElementById("add-calling-fab");
  const quickResetButton = ensureResetCacheQuickAction(
    onResetCache,
    documentRef,
  );
  const hasAuthenticatedShell = Boolean(
    documentRef.querySelector(".main-header"),
  );
  const isLoggedIn = isLoggedInSession();
  const shouldShowReset = hasAuthenticatedShell || isLoggedIn;

  quickResetButton.style.display = shouldShowReset ? "none" : "none";

  if (!fab) {
    updateFabDebugBadge(documentRef);
    return;
  }

  const shouldShow = hasAuthenticatedShell && hasAdminPasswordAccess();
  fab.style.display = shouldShow ? "flex" : "none";
  fab.style.visibility = shouldShow ? "visible" : "hidden";

  updateFabDebugBadge(documentRef);
}

export function renderHeader({
  appState,
  isStakePasswordSession,
  ensureCreateCallingUi,
  documentRef = document,
}) {
  const app = documentRef.getElementById("app");
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
  const header = documentRef.createElement("header");
  header.className = "main-header";
  const currentMode = appState.themeMode || "system";

  let activeClr;

  if (currentMode === "dark") {
    activeClr = "#5cb5f7";
  } else {
    activeClr = "#f75ced";
  }

  header.innerHTML = `
  <!--
  <div class="main-header-left">
    <h1>Record<span>Christchurch Stake</span></h1>
  </div>
  -->
  <div class='main-header-title'>
    <h1><span>The</span>Record</h1>
    <h3 class="main-header-subtitle">Christchurch Stake</h3>
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
     <button onclick="window.logout()">Logout</button>
      
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

  if (!documentRef.getElementById("data-list")) {
    const list = documentRef.createElement("div");
    list.id = "data-list";
    app.appendChild(list);
  }

  if (!documentRef.getElementById("reports-page")) {
    const reports = documentRef.createElement("div");
    reports.id = "reports-page";
    reports.className = "reports-page hidden";
    app.appendChild(reports);
  }

  ensureCreateCallingUi();
}
