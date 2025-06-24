 // Hamburger menu toggle
  const hamburger = document.querySelector(".hamburger");
  const navLinks = document.querySelector(".nav-links");

  hamburger.addEventListener("click", () => {
    navLinks.classList.toggle("active");
    hamburger.classList.toggle("open");
  });

  // Search form behavior
  const searchForm = document.getElementById("searchForm");
  const searchInput = document.getElementById("searchInput");

  if (searchForm && searchInput) {
    searchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const query = searchInput.value.trim();

      if (query) {
        console.log("Searching for:", query);
        // Example: redirect to search results page
        // window.location.href = `/search.html?q=${encodeURIComponent(query)}`;
      } else {
        alert("Please enter a search term.");
      }
   } )}