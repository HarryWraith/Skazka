// timeline.js
document.addEventListener("DOMContentLoaded", async () => {
  const timeline = document.getElementById("timeline");

  try {
    // Fetch timeline events from external JSON
    const response = await fetch("timeline.json");
    const timelineEvents = await response.json();

    // Generate events dynamically
    timelineEvents.forEach((ev, i) => {
      const eventDiv = document.createElement("div");
      eventDiv.className = "event";
      eventDiv.dataset.id = i;

      eventDiv.innerHTML = `
        <div class="event-header">
          <span class="rune"></span>
          <div class="event-meta">
            <span class="event-year">${ev.year}</span><br>
            <span class="event-title">${ev.title}</span>
          </div>
        </div>

        <div class="event-details">
          <div class="event-details-inner">${ev.details}</div>
        </div>
      `;
      timeline.appendChild(eventDiv);
    });

    // Toggle event details + rune highlighting
    const events = document.querySelectorAll(".event");
    events.forEach(evt => {
      evt.addEventListener("click", () => {
        const isOpen = evt.classList.contains("open");

        // Close all events + remove rune highlights
        events.forEach(e => {
          e.classList.remove("open");
          const rune = e.querySelector(".rune");
          if (rune) rune.classList.remove("open");
        });

        // If it wasn't open, open it + highlight its rune
        if (!isOpen) {
          evt.classList.add("open");
          const rune = evt.querySelector(".rune");
          if (rune) rune.classList.add("open");
        }
      });
    });
  } catch (error) {
    console.error("Failed to load timeline.json:", error);
  }
});
