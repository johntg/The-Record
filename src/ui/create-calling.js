export function ensureCreateCallingUi({
  appState,
  escapeHtml,
  syncFabVisibility,
  onOpenCreateCallingModal,
  onCloseCreateCallingModal,
  documentRef = document,
}) {
  const app = documentRef.getElementById("app");
  if (!app) return;

  let fab = documentRef.getElementById("add-calling-fab");
  if (!fab) {
    fab = documentRef.createElement("button");
    fab.id = "add-calling-fab";
    fab.className = "fab";
    fab.type = "button";
    fab.setAttribute("aria-label", "Add new calling or release");
    fab.textContent = "+";
    fab.onclick = () => onOpenCreateCallingModal();
  }

  if (fab.parentElement !== documentRef.body) {
    documentRef.body.appendChild(fab);
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

  if (!documentRef.getElementById("create-calling-modal")) {
    const modal = documentRef.createElement("div");
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
        onCloseCreateCallingModal();
      }
    });

    app.appendChild(modal);
  }

  syncFabVisibility();
}

export function openCreateCallingModal({
  hasAdminPasswordAccess,
  documentRef = document,
  alertFn = alert,
}) {
  if (!hasAdminPasswordAccess()) {
    alertFn("Creating entries requires signing in with the admin password.");
    return;
  }

  const modal = documentRef.getElementById("create-calling-modal");
  if (!modal) return;

  const message = documentRef.getElementById("create-calling-message");
  if (message) {
    message.textContent = "";
    message.classList.remove("error");
  }

  modal.classList.remove("hidden");
  documentRef.body.classList.add("modal-open");
}

export function closeCreateCallingModal({ documentRef = document }) {
  const modal = documentRef.getElementById("create-calling-modal");
  if (!modal) return;

  const form = modal.querySelector("form");
  if (form) {
    form.reset();
  }

  const message = documentRef.getElementById("create-calling-message");
  if (message) {
    message.textContent = "";
    message.classList.remove("error");
  }

  modal.classList.add("hidden");
  documentRef.body.classList.remove("modal-open");
}

export async function submitNewCalling({
  event,
  hasAdminPasswordAccess,
  supabase,
  appState,
  fetchCallings,
  applyHiddenVisibilityForRow,
  closeCreateCallingModal,
  renderCurrentPage,
}) {
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
    .select()
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

  if (typeof applyHiddenVisibilityForRow === "function") {
    await applyHiddenVisibilityForRow(data);
  }

  if (data) {
    appState.callings.unshift(data);
  } else {
    await fetchCallings();
  }

  closeCreateCallingModal();
  renderCurrentPage();
}
