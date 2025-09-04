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
    // Navbar (keep your hamburger binding here)
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

// carousel
(function(){
  const MQ = '(max-width: 767px)';

  function findVoicesRoot(){
    const stage = document.querySelector('.skz-fc-stage');
    if (!stage) return null;
    return stage.closest('section, .skz-fc, [data-carousel], .container, main') || stage.parentElement || stage;
  }

  function teardownVoicesCarousel(root){
    if (!root) return;
    const stage  = root.querySelector('.skz-fc-stage') || document.querySelector('.skz-fc-stage');
    const slides = root.querySelectorAll('.skz-fc-slide');
    const navs   = root.querySelectorAll('.skz-fc-nav');

    stage?.classList.remove('is-ready');
    slides.forEach(s => s.classList.remove('skz-active','skz-prev','skz-next'));
    navs.forEach(n => n.removeAttribute('disabled'));
  }

  function initVoicesCarousel(root){
    if (!root) return;
    if (window.matchMedia(MQ).matches) { // bail on mobile (as per your design)
      teardownVoicesCarousel(root);
      return;
    }

    const stage  = root.querySelector('.skz-fc-stage');
    const slides = Array.from(root.querySelectorAll('.skz-fc-slide'));
    if (!slides.length) return;

    const btnPrev = root.querySelector('.skz-fc-prev');
    const btnNext = root.querySelector('.skz-fc-next');

    let i = 0;

    function apply(){
      const n = slides.length;
      const prev = (i - 1 + n) % n;
      const next = (i + 1) % n;

      slides.forEach((s, idx) => {
        s.classList.remove('skz-active','skz-prev','skz-next');
        if (idx === i) s.classList.add('skz-active');
        else if (idx === prev) s.classList.add('skz-prev'); // will be visually hidden by CSS
        else if (idx === next) s.classList.add('skz-next'); // will be visually hidden by CSS
      });

      stage?.classList.add('is-ready');
    }

    function go(delta){
      i = (i + delta + slides.length) % slides.length;
      apply();
    }

    // Buttons
    btnPrev?.addEventListener('click', () => go(-1));
    btnNext?.addEventListener('click', () => go(+1));

    // Click on active slide -> follow link
    root.addEventListener('click', (e) => {
      const slide = e.target.closest('.skz-fc-slide');
      if (!slide) return;
      if (!slide.classList.contains('skz-active')) return;
      const href = slide.dataset.href || slide.querySelector('a')?.getAttribute('href');
      if (href) window.location.href = href;
    });

    // Keyboard
    root.setAttribute('tabindex','0');
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft'){ e.preventDefault(); go(-1); }
      if (e.key === 'ArrowRight'){ e.preventDefault(); go(+1); }
    });

    // Wait for fonts/images so sizing is perfect, then apply
    function settleThenApply(){
      apply();
      if (document.fonts?.ready) {
        document.fonts.ready.then(apply);
      }
      const imgs = root.querySelectorAll('img');
      let pending = imgs.length;
      if (!pending) return;
      imgs.forEach(img => {
        if (img.complete) { if (--pending === 0) apply(); }
        else {
          img.addEventListener('load',  () => { if (--pending === 0) apply(); }, { once: true });
          img.addEventListener('error', () => { if (--pending === 0) apply(); }, { once: true });
        }
      });
    }

    settleThenApply();
  }

  // Boot / responsive toggle
  const start = () => {
    const root = findVoicesRoot();
    if (!root) return;
    if (window.matchMedia(MQ).matches) {
      teardownVoicesCarousel(root);
    } else {
      initVoicesCarousel(root);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.matchMedia(MQ).addEventListener('change', start);
})();
