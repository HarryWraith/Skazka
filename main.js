// main.js
(function(){
  function inject(url, mountId, onload){
    const mount = document.getElementById(mountId);
    if(!mount) return;
    fetch(url)
      .then(r => r.text())
      .then(html => {
        mount.innerHTML = html;
        if (typeof onload === "function") onload(mount);
      })
      .catch(err => console.error(`Failed to load ${url}:`, err));
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Navbar (you already have this wired — keep your hamburger binding here)
    inject('navbar.html', 'navbar', (mount) => {
      const hamburger = mount.querySelector('.hamburger');
      const navLinks  = mount.querySelector('.nav-links');
      if (hamburger && navLinks) {
        const toggle = () => {
          navLinks.classList.toggle('active');
          const open = hamburger.classList.toggle('open');
          hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
        };
        hamburger.addEventListener('click', toggle);
        hamburger.addEventListener('keydown', (e)=> {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });
        navLinks.querySelectorAll('a').forEach(a => {
          a.addEventListener('click', () => {
            navLinks.classList.remove('active');
            hamburger.classList.remove('open');
            hamburger.setAttribute('aria-expanded','false');
          });
        });
      }
    });

    // Footer (year + back-to-top)
    inject('footer.html', 'footer', (mount) => {
      const y = mount.querySelector('#year');
      if (y) y.textContent = new Date().getFullYear();

      const back = mount.querySelector('#backToTop');
      if (back) back.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  });
})();
