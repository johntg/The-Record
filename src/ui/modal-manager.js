export function showModalAlert(message, options = {}) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");

    modal.className = "modal-overlay";

    modal.innerHTML = `
      <section class="modal">
        <div class="modal-header">
          <h2>${options.title || "Notice"}</h2>
        </div>

        <div class="modal-body">
          <p>${message}</p>
        </div>

        <div class="btn-group">
          <button class="btn btn-primary modal-ok-btn">
            OK
          </button>
        </div>
      </section>
    `;

    document.body.appendChild(modal);

    modal.querySelector(".modal-ok-btn").onclick = () => {
      modal.remove();
      resolve(true);
    };
  });
}

export function showModalConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");

    modal.className = "modal-overlay";

    modal.innerHTML = `
      <section class="modal">
        <div class="modal-header">
          <h2>${options.title || "Confirm"}</h2>
        </div>

        <div class="modal-body">
          <p>${message}</p>
        </div>

        <div class="btn-group">
          <button class="btn btn-secondary cancel-btn">
            Cancel
          </button>

          <button class="btn btn-primary confirm-btn">
            OK
          </button>
        </div>
      </section>
    `;

    document.body.appendChild(modal);

    modal.querySelector(".cancel-btn").onclick = () => {
      modal.remove();
      resolve(false);
    };

    modal.querySelector(".confirm-btn").onclick = () => {
      modal.remove();
      resolve(true);
    };
  });
}
