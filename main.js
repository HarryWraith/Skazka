// Hamburger menu toggle
const hamburger = document.querySelector(".hamburger");
const navLinks = document.querySelector(".nav-links");

hamburger.addEventListener("click", () => {
  navLinks.classList.toggle("active");
  hamburger.classList.toggle("open");
});

// Prevent form submission (optional, keeps page from reloading if user hits Enter)
const searchForm = document.getElementById("searchForm");
if (searchForm) {
  searchForm.addEventListener("submit", (e) => e.preventDefault());
}

// Live search filtering
const searchInput = document.getElementById("searchInput");

if (searchInput) {
  searchInput.addEventListener("input", function () {
    const query = searchInput.value.trim().toLowerCase();
    const articles = document.querySelectorAll("main article");
    let resultsFound = false;

    articles.forEach((article) => {
      const textContent = article.innerText.toLowerCase();
      if (textContent.includes(query)) {
        article.style.display = ""; // default block/grid applies
        resultsFound = true;
      } else {
        article.style.display = "none";
      }
    });

    // Toggle "No results found" message
    const noResults = document.getElementById("noResultsMessage");
    if (noResults) {
      noResults.style.display = resultsFound ? "none" : "block";
    }
  });
}