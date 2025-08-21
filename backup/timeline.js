document.addEventListener("DOMContentLoaded", () => {
  const events = document.querySelectorAll('.event');
  const runes = document.querySelectorAll('.rune');

  // Scroll-based rune activation
  function onScroll() {
    const scrollY = window.scrollY + window.innerHeight / 2;
    events.forEach((evt, idx) => {
      const rect = evt.getBoundingClientRect();
      const absY = rect.top + window.scrollY;
      if (absY < scrollY) {
        runes[idx].classList.add('active');
      } else {
        runes[idx].classList.remove('active');
      }
    });
  }

  // Click to toggle details
  events.forEach(evt => {
    evt.addEventListener('click', () => {
      evt.classList.toggle('open');
    });
  });

  window.addEventListener('scroll', onScroll);
  onScroll();
});