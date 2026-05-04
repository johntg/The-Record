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
  <div class="refreshIcon" style="cursor: pointer;" onclick="window.refreshData()">
    <svg id="refreshicon" xmlns="http://www.w3.org/2000/svg" fill="${activeClr}" viewBox="0 0 236.51 260.28"><defs><style>.rsh-1{fill:none;stroke:${activeClr};stroke-linecap:round;stroke-linejoin:round;stroke-width:30px;}.rsh-2{fill:${activeClr};}</style></defs><g id="refresh"><path id="tail" class="rsh-1" d="M221.51,142.02c0,57.03-46.23,103.26-103.26,103.26S15,199.05,15,142.02,61.23,38.76,118.26,38.76c6.25,0,12.36.55,18.3,1.62"/><g id="head"><path class="rsh-2" d="M197.62,56.37l-83.48,17.87c-5.03,1.08-8.56-4.83-5.24-8.75l20.1-23.71c1.25-1.48,1.61-3.51.95-5.32l-10.63-29.2c-1.76-4.83,3.6-9.14,7.94-6.39l72.11,45.69c4.07,2.58,2.96,8.8-1.76,9.81Z"/></g></g></svg>
  </div>
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
