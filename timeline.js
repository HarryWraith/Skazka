// timeline.js
document.addEventListener("DOMContentLoaded", () => {
  const timeline = document.getElementById("timeline");

  // Timeline data array
  const timelineEvents = [
    {
      year: "-10000",
      title: "Ascent from darkness",
      details: "The first Dark Elves emerge from the Underworld and are given the gift of Everlight by Aeter."
    },
    {
      year: "-9000",
      title: "Temple of Sinari constructed",
      details: "To honour and protect the gift of Everlight, the Dark Elves build the Temple of Sinari in the cave from which they first emerged from the darkness of the Underworld."
    },
    {
      year: "-3000 AE",
      title: "Divergence",
      details: "Over next thousand years groups of Sun Elves migrate. The largest group travels south and founds Everdusk, the realms of the Wood Elves. Some travelled east beyond the mountains and were never seen again."
    },
    {
      year: "-2800",
      title: "Kitezh sacked",
      details: "Dwarves rebel against their overlord and sack the city of Kitezh. They set out into the darkness to forge their own fate."
    },
    {
      year: "-1800",
      title: "Nav'Golam founded",
      details: "The dwarves, having wondered the Underforld for centuries, finally find a place to call home. They build the great underground city of Nav'Golam."
    },
    {
      year: "-1800",
      title: "Nav'Cherom founded",
      details: "The Dwarves, rich with the minerals found around Nav'Golam, found the second city of Nav'Cherom."
    },
    {
      year: "-421",
      title: "Exodus",
      details: "Humans traverse the great ocean between Skia and Kelos and settled on Snuuflund."
    },
    {
      year: "-421",
      title: "Eastward",
      details: "The human settlers of Snuuflund have outgrown the Serydina Isles. Two groups set off east to the mainland of Kelos in search of new homes. One settles on the west coast. The other travels far to the east; they will eventually become the people of Caratania"
    },
    {
      year: "0",
      title: "Starfall",
      details: "Kelos is struck by a series of meteors. The impact iniates a cataclysmic event that begins a mini ice age."
    },
    {
      year: "2",
      title: "There be dragons",
      details: "Dragons that have slumbers for an eon under the northern ice are awoken."
    },
    {
      year: "12 - 27",
      title: "Construction of citadel Grimspire",
      details: "Construction of citadel Grimspire is undertaken with the help of Icethorn, the ancient white dragon."
    },
    {
      year: "111",
      title: "Order of the Word founded",
      details: "The Sun Elves agree to teach Humans magic and the Order of The Word is formed."
    },
    {
      year: "192",
      title: "Fall of Grimspire",
      details: "Grimspire meets a sad ending. Encouraged by the Fire Witch Maldrath, a group of hunters attack Icethorn's mate, destroying her unhatched eggs. The ancient beast beast freezes the citadel, making it uninhabitable until this day."
    },
    {
      year: "351 - 391",
      title: "The Shadow War",
      details: "Civil war within the Order of the Word escalates widely and becomes The Shadow War. The Order is split into two factions: one lead by Ilistran Darkweaver who should be used to elevate magic wielders to a status above mortals; the other led by Arica Dreamforger who believes magic should be used to help all people. The war ends with Ilistran's defeat and disappearance."
    },
    {
      year: "411 - 901",
      title: "Magical Prohibition",
      details: "Despite the end of the Shadow War, the continued incursions from other dimensions forces the Aeternian Empire to ban the use of magic by anyone other than those approved to do so by The Empre. This continued for centuries. To this day the use of displacement and dimensional magic is still banned. "
    },
    {
      year: "971",
      title: "Current year",
      details: "This is the year the campaign starts."
    },
    
   
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
        rune.classList.add("active");
      }
    });
  }

// Toggle event details on click
events.forEach(evt => {
  evt.addEventListener("click", () => {
    const isOpen = evt.classList.contains("open");
    // Close all events
    events.forEach(e => e.classList.remove("open"));
    // If it wasn't open, open it; if it was, leave all closed
    if (!isOpen) {
      evt.classList.add("open");
    }
  });
});

  // Listen to timeline scroll instead of window scroll
  timeline.addEventListener("scroll", onTimelineScroll);
  onTimelineScroll(); // Initial call
});