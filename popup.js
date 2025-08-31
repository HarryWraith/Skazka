const popupImages = document.querySelectorAll("img.popup");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.querySelector("#lightbox img");
const closeBtn = document.querySelector("#lightbox .close");

// Track zoom & pan
let scale = 1;
let posX = 0, posY = 0;
let dragging = false, startX, startY;
let initialDistance = null, lastScale = 1;

// Open lightbox when an image is clicked
popupImages.forEach(img => {
  img.addEventListener("click", () => {
    lightbox.style.display = "flex";
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt;

    // reset zoom & position
    resetTransform();
  });
});

// Close when X is clicked
closeBtn.addEventListener("click", () => {
  lightbox.style.display = "none";
});

// Close when clicking outside the image
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) {
    lightbox.style.display = "none";
  }
});

// ---------------- PC: Scroll Zoom + Drag ----------------
lightboxImg.addEventListener("wheel", (e) => {
  e.preventDefault();
  scale += e.deltaY * -0.001;
  scale = Math.min(Math.max(1, scale), 5);
  updateTransform();
});

lightboxImg.addEventListener("mousedown", (e) => {
  dragging = true;
  startX = e.clientX - posX;
  startY = e.clientY - posY;
  lightboxImg.style.cursor = "grabbing";
});

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  posX = e.clientX - startX;
  posY = e.clientY - startY;
  updateTransform();
});

window.addEventListener("mouseup", () => {
  dragging = false;
  lightboxImg.style.cursor = "grab";
});

// ---------------- Mobile: Touch Pinch + Pan ----------------
lightboxImg.addEventListener("touchstart", (e) => {
  if (e.touches.length === 1) {
    // single finger -> drag
    dragging = true;
    startX = e.touches[0].clientX - posX;
    startY = e.touches[0].clientY - posY;
  } else if (e.touches.length === 2) {
    // two fingers -> pinch
    initialDistance = getDistance(e.touches);
    lastScale = scale;
  }
}, { passive: false });

lightboxImg.addEventListener("touchmove", (e) => {
  if (e.touches.length === 1 && dragging) {
    posX = e.touches[0].clientX - startX;
    posY = e.touches[0].clientY - startY;
    updateTransform();
  } else if (e.touches.length === 2 && initialDistance) {
    let newDistance = getDistance(e.touches);
    let pinchScale = newDistance / initialDistance;
    scale = Math.min(Math.max(1, lastScale * pinchScale), 5);
    updateTransform();
  }
}, { passive: false });

lightboxImg.addEventListener("touchend", (e) => {
  if (e.touches.length === 0) {
    dragging = false;
    initialDistance = null;
  }
});

// ---------------- Helpers ----------------
function getDistance(touches) {
  const [a, b] = touches;
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx*dx + dy*dy);
}

function updateTransform() {
  lightboxImg.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
}

function resetTransform() {
  scale = 1;
  posX = 0;
  posY = 0;
  lightboxImg.style.transform = "translate(0,0) scale(1)";
}
