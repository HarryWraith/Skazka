// /assets/js/navbar.js
(function () {
  function initNavbar() {
    const mqMobile = () => window.matchMedia("(max-width:980px)").matches;
    const html = document.documentElement;
    const burger = document.getElementById("hamburger");
    const menu = document.getElementById("nav-menu");

    // If the partial hasn't been injected yet, or already bound, bail safely.
    if (!burger || !menu) return false;
    if (burger.dataset.bound === "1") return true;
    burger.dataset.bound = "1";

    function openMenu() {
      menu.classList.add("active");
      burger.classList.add("open");
      burger.setAttribute("aria-expanded", "true");
      html.classList.add("menu-open");
    }
    function closeMenu() {
      menu.classList.remove("active");
      burger.classList.remove("open");
      burger.setAttribute("aria-expanded", "false");
      html.classList.remove("menu-open");
    }

    // Burger click & keyboard
    burger.addEventListener("click", () => {
      const isOpen = burger.classList.contains("open");
      isOpen ? closeMenu() : openMenu();
    });
    burger.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        burger.click();
      }
    });

    // Prevent navigation on placeholder anchors (#) anywhere in menu
    menu.addEventListener("click", (e) => {
      const a = e.target.closest('a[href="#"]');
      if (a) e.preventDefault();
    });

    // Mobile-only submenu toggles (buttons with aria-controls)
    menu.addEventListener("click", (e) => {
      const btn = e.target.closest(".nav-toggle");
      if (!btn || !mqMobile()) return;
      const id = btn.getAttribute("aria-controls");
      const panel = id && document.getElementById(id);
      if (!panel) return;
      const expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!expanded));
      panel.hidden = expanded;
      e.stopPropagation();
    });

    // Close menu on real navigation (mobile)
    menu.addEventListener("click", (e) => {
      if (!mqMobile()) return;
      const link = e.target.closest("a[href]");
      if (!link) return;
      const href = link.getAttribute("href") || "";
      if (href === "#" || href.startsWith("#")) {
        e.preventDefault();
        return;
      }
      closeMenu();
    });

    // Collapse/restore submenus on viewport changes
    const resetSubmenus = () => {
      if (!mqMobile()) {
        document
          .querySelectorAll('#nav-menu .dropdown-content,[id^="submenu-"]')
          .forEach((p) => (p.hidden = false));
        document
          .querySelectorAll("#nav-menu .nav-toggle")
          .forEach((b) => b.setAttribute("aria-expanded", "false"));
      } else {
        document
          .querySelectorAll('#nav-menu .dropdown-content,[id^="submenu-"]')
          .forEach((p) => (p.hidden = true));
        document
          .querySelectorAll("#nav-menu .nav-toggle")
          .forEach((b) => b.setAttribute("aria-expanded", "false"));
      }
    };
    window.addEventListener("resize", resetSubmenus);
    resetSubmenus();

    // Close on Escape (mobile)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && mqMobile()) closeMenu();
    });

    // Click outside to close (mobile)
    document.addEventListener("click", (e) => {
      if (!mqMobile() || !menu.classList.contains("active")) return;
      if (!e.target.closest(".navbar")) closeMenu();
    });

    return true;
  }

  // Expose for client-side fetch scenarios
  window.initNavbar = initNavbar;

  // Auto-init when the nav is already in the DOM (inline/SSI/PHP)
  document.addEventListener("DOMContentLoaded", () => {
    initNavbar();
  });
})();
