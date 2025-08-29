// timeline.js
document.addEventListener("DOMContentLoaded", () => {
  const timeline = document.getElementById("timeline");

  // Timeline data array
  const timelineEvents = [
    {
      year: "1200 AE",
      title: "Founding of the First Ascent",
      details: "The First Ascent arises atop the frozen peaks of Skazka, where mortals defied the giants."
    },
    {
      year: "1345 AE",
      title: "The Rift of Molach",
      details: "A tear in the weave of reality as Molach's fall tore open the land and spirits slipped through."
    },
    {
      year: "1502 AE",
      title: "The Night of Whispering",
      details: "When every shadow spoke and the forests sang curses in voices not their own."
    },
    {
      year: "1502 AE",
      title: "The Night of Whispering",
      details: "When every shadow spoke and the forests sang curses in voices not their own."
    },
    {
      year: "1502 AE",
      title: "The Night of Whispering",
      details: "When every shadow spoke and the forests sang curses in voices not their own."
    },
    {
      year: "1502 AE",
      title: "The Night of Whispering",
      details: "When every shadow spoke and the forests sang curses in voices not their own."
    },
    {
      year: "1502 AE",
      title: "The Night of Whispering",
      details: "When every shadow spoke and the forests sang curses in voices not their own."
    },
    {
      year: "1502 AE",
      title: "The Night of Whispering",
      details: "When every shadow spoke and the forests sang curses in voices not their own."
    },
    {
      year: "1502 AE",
      title: "The Night of Whispering",
      details: "When every shadow spoke and the forests sang curses in voices not their own."
    },
    {
      year: "1502 AE",
      title: "The Night of Whispering",
      details: "When every shadow spoke and the forests sang curses in voices not their own."
    },
    // Add more events here...
  ];

  // Generate events dynamically
  timelineEvents.forEach((ev, i) => {
    const eventDiv = document.createElement("div");
    eventDiv.className = "event";
    eventDiv.dataset.id = i;

    eventDiv.innerHTML = `
      <div class="event-header">
        <span class="rune"></span>
        <div>
          <strong>${ev.year}</strong><br>
          ${ev.title}
        </div>
      </div>
      <div class="event-details">
        ${ev.details}
      </div>
    `;

    timeline.appendChild(eventDiv);
  });

  // Scroll rune activation - FIXED to use timeline container scroll
  const events = document.querySelectorAll(".event");
  
  function onTimelineScroll() {
    const timelineRect = timeline.getBoundingClientRect();
    const scrollTop = timeline.scrollTop;
    const viewportMiddle = timelineRect.height / 2;
    
    events.forEach(evt => {
      const eventRect = evt.getBoundingClientRect();
      const timelineTop = timelineRect.top;
      const eventTop = eventRect.top - timelineTop + scrollTop;
      const rune = evt.querySelector(".rune");
      
      // Activate rune if event is in upper half of timeline viewport
      if (eventTop < scrollTop + viewportMiddle) {
        rune.classList.add("active");
      } else {
        rune.classList.remove("active");
      }
    });
  }

  // Toggle event details on click
  events.forEach(evt => {
    evt.addEventListener("click", () => {
      evt.classList.toggle("open");
    });
  });

  // Listen to timeline scroll instead of window scroll
  timeline.addEventListener("scroll", onTimelineScroll);
  onTimelineScroll(); // Initial call
});