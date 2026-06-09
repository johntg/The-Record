import { t } from "../i18n/index.js";

export function showAdminHubModal({ showMemberMaintenance = false } = {}) {
  const existing = document.getElementById("admin-hub-modal");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "admin-hub-modal";
  overlay.className = "modal-overlay";

  overlay.innerHTML = `
    <section class="modal admin-hub-modal">
      <div class="modal-header">
        <h2>${t('nav_admin')}</h2>
        <button type="button" class="icon-button admin-hub-close-btn" aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="admin-hub-body">
        ${showMemberMaintenance ? `<button type="button" class="btn btn-primary admin-hub-btn" id="admin-hub-members-btn">
          ${t('admin_member_maintenance')}
        </button>` : ""}
        <button type="button" class="btn btn-tertiary admin-hub-btn" id="admin-hub-notifications-btn">
          ${t('nav_notifications')}
        </button>
        <button type="button" class="btn btn-tertiary admin-hub-btn" id="admin-hub-archive-btn">
          ${t('nav_archive')}
        </button>
      </div>
    </section>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  overlay.querySelector(".admin-hub-close-btn").onclick = close;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector("#admin-hub-members-btn")?.addEventListener("click", () => {
    close();
    window.openMemberMaintenancePage?.();
  });

  overlay.querySelector("#admin-hub-notifications-btn").onclick = () => {
    close();
    window.openNotificationsPage?.();
  };

  overlay.querySelector("#admin-hub-archive-btn").onclick = () => {
    close();
    window.openArchivePage?.();
  };
}
