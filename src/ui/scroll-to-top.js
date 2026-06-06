let initialized = false;

export function initScrollToTop() {
  let btn = document.getElementById("scroll-to-top-btn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "scroll-to-top-btn";
    btn.className = "scroll-to-top-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Scroll to top");
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>`;
    btn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
    document.body.appendChild(btn);
  }

  if (initialized) return;
  initialized = true;

  const updateVisibility = () => {
    const header = document.querySelector(".main-header");
    const pastHeader = header
      ? header.getBoundingClientRect().bottom <= 0
      : window.scrollY > 100;
    btn.classList.toggle("visible", pastHeader);
  };

  window.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();
}
