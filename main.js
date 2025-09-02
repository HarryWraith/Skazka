

document.addEventListener("DOMContentLoaded", () => {
  const mount = document.getElementById("navbar");
  if (!mount) return;

  fetch("navbar.html")
    .then(r => r.text())
    .then(html => {
      mount.innerHTML = html;

      // Wire up hamburger after injection (no inline onclick needed)
      const hamburger = mount.querySelector(".hamburger");
      const navLinks  = mount.querySelector(".nav-links");
      if (!hamburger || !navLinks) return;

      const toggle = () => {
        navLinks.classList.toggle("active");
        const open = hamburger.classList.toggle("open");
        hamburger.setAttribute("aria-expanded", open ? "true" : "false");
      };

      hamburger.addEventListener("click", toggle);
      hamburger.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });

      // Close drawer after any link click (mobile UX nicety)
      navLinks.querySelectorAll("a").forEach(a => {
        a.addEventListener("click", () => {
          navLinks.classList.remove("active");
          hamburger.classList.remove("open");
          hamburger.setAttribute("aria-expanded", "false");
        });
      });
    })
    .catch(err => console.error("Failed to load navbar:", err));
});

