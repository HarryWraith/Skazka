const popupImages = document.querySelectorAll("img.popup");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.querySelector("#lightbox img");
const closeBtn = document.querySelector("#lightbox .close");

// Open lightbox when an image is clicked
popupImages.forEach(img => {
  img.addEventListener("click", () => {
    lightbox.style.display = "flex";
    lightboxImg.src = img.src; // use the same image source
    lightboxImg.alt = img.alt;
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