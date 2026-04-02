const app = document.getElementById("app");
const navList = document.getElementById("nav-list");
const currentPage = document.body.dataset.page || "home";
const contentFile = document.body.dataset.content || "content.md";

const navItems = [
  { label: "Home", href: "index.html", id: "home" },
  { label: "Performance", href: "performance.html", id: "performance" },
  { label: "Teaching", href: "teaching.html", id: "teaching" },
  { label: "Calendar", href: "calendar.html", id: "calendar" },
  { label: "Contact", href: "index.html#contact", id: "contact" }
];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderInline(tokens) {
  return marked.parser(tokens, { mangle: false, headerIds: false }).trim();
}

function buildNav() {
  navList.innerHTML = "";
  navItems.forEach((item) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = item.href;
    a.textContent = item.label;
    if (currentPage === item.id || (currentPage !== "home" && item.id === "contact" && currentPage === "contact")) {
      a.classList.add("is-active");
    }
    li.appendChild(a);
    navList.appendChild(li);
  });
}

function renderHero(section) {
  const wrapper = document.createElement("div");
  wrapper.className = "hero-layout";

  const textColumn = document.createElement("div");
  textColumn.className = "hero-copy";

  const mediaColumn = document.createElement("div");
  mediaColumn.className = "hero-media";

  const imageToken = section.tokens.find((token) => token.type === "image");
  const remaining = section.tokens.filter((token) => token !== imageToken);
  const firstParagraph = remaining.find((token) => token.type === "paragraph");
  const buttons = remaining.filter(
    (token) => token.type === "paragraph" && token.tokens && token.tokens.every((child) => child.type === "link")
  );

  const eyebrow = document.createElement("p");
  eyebrow.className = "section-eyebrow";
  eyebrow.textContent = currentPage === "home" ? "Performer | Teacher | Creative" : section.heading;
  textColumn.appendChild(eyebrow);

  const title = document.createElement("h1");
  title.className = "hero-title";
  title.textContent = window.siteTitle || "Dr. Allison Jayroe Asthana";
  textColumn.appendChild(title);

  if (firstParagraph) {
    const intro = document.createElement("div");
    intro.className = "hero-intro";
    intro.innerHTML = renderInline([firstParagraph]);
    textColumn.appendChild(intro);
  }

  const rest = remaining.filter((token) => token !== firstParagraph && !buttons.includes(token));
  if (rest.length) {
    const prose = document.createElement("div");
    prose.className = "hero-prose";
    prose.innerHTML = renderInline(rest);
    textColumn.appendChild(prose);
  }

  if (buttons.length) {
    const actions = document.createElement("div");
    actions.className = "hero-actions";
    buttons.forEach((token, index) => {
      const paragraph = document.createElement("div");
      paragraph.innerHTML = renderInline([token]);
      paragraph.querySelectorAll("a").forEach((link) => {
        link.className = index === 0 ? "button button-primary" : "button button-secondary";
      });
      actions.appendChild(paragraph);
    });
    textColumn.appendChild(actions);
  }

  if (imageToken) {
    const figure = document.createElement("figure");
    figure.className = "hero-figure";
    figure.innerHTML = `<img src="${imageToken.href}" alt="${imageToken.text || ""}">`;
    mediaColumn.appendChild(figure);
  }

  wrapper.append(textColumn, mediaColumn);
  return wrapper;
}

function renderStandard(section) {
  const wrapper = document.createElement("div");
  wrapper.className = "standard-layout";

  const heading = document.createElement("div");
  heading.className = "section-heading";
  heading.innerHTML = `<p class="section-kicker">Section</p><h2>${section.heading}</h2>`;

  const body = document.createElement("div");
  body.className = "section-body";
  body.innerHTML = renderInline(section.tokens);

  wrapper.append(heading, body);
  return wrapper;
}

function renderWork(section) {
  const wrapper = document.createElement("div");
  wrapper.className = "work-layout";

  const header = document.createElement("div");
  header.className = "section-heading section-heading-center";
  header.innerHTML = `<p class="section-kicker">Highlights</p><h2>${section.heading}</h2>`;
  wrapper.appendChild(header);

  const cards = document.createElement("div");
  cards.className = "work-grid";

  let currentCard = null;
  section.tokens.forEach((token) => {
    if (token.type === "heading" && token.depth === 3) {
      currentCard = document.createElement("article");
      currentCard.className = "work-card";
      currentCard.innerHTML = `<h3>${token.text}</h3>`;
      cards.appendChild(currentCard);
      return;
    }

    if (!currentCard) {
      return;
    }

    if (token.type === "image") {
      const figure = document.createElement("figure");
      figure.className = "work-figure";
      figure.innerHTML = `<img src="${token.href}" alt="${token.text || ""}">`;
      currentCard.appendChild(figure);
      return;
    }

    const block = document.createElement("div");
    block.className = "work-copy";
    block.innerHTML = renderInline([token]);
    currentCard.appendChild(block);
  });

  wrapper.appendChild(cards);
  return wrapper;
}

function renderCalendar(section) {
  const wrapper = document.createElement("div");
  wrapper.className = "calendar-layout";

  const header = document.createElement("div");
  header.className = "section-heading section-heading-center";
  header.innerHTML = `<p class="section-kicker">Schedule</p><h2>${section.heading}</h2>`;
  wrapper.appendChild(header);

  let currentGroup = null;
  let currentCard = null;

  section.tokens.forEach((token) => {
    if (token.type === "heading" && token.depth === 3) {
      currentGroup = document.createElement("div");
      currentGroup.className = "calendar-group";
      currentGroup.innerHTML = `<h3 class="calendar-group-title">${token.text}</h3><div class="calendar-grid"></div>`;
      wrapper.appendChild(currentGroup);
      currentCard = null;
      return;
    }

    if (token.type === "heading" && token.depth === 4 && currentGroup) {
      currentCard = document.createElement("article");
      currentCard.className = "calendar-card";
      currentCard.innerHTML = `<h4>${token.text}</h4>`;
      currentGroup.querySelector(".calendar-grid").appendChild(currentCard);
      return;
    }

    if (!currentCard) {
      return;
    }

    const block = document.createElement("div");
    block.className = "calendar-copy";
    block.innerHTML = renderInline([token]);
    currentCard.appendChild(block);
  });

  return wrapper;
}

function renderBooking(section) {
  const wrapper = document.createElement("div");
  wrapper.className = "booking-layout";

  const intro = document.createElement("div");
  intro.className = "section-heading";
  intro.innerHTML = `<p class="section-kicker">Book a Lesson</p><h2>${section.heading}</h2>`;

  const formWrap = document.createElement("div");
  formWrap.className = "booking-card";

  const proseTokens = [];
  let formMarkup = "";

  section.tokens.forEach((token) => {
    if (token.type === "html") {
      formMarkup += token.text;
      return;
    }
    proseTokens.push(token);
  });

  if (proseTokens.length) {
    const prose = document.createElement("div");
    prose.className = "booking-copy";
    prose.innerHTML = renderInline(proseTokens);
    wrapper.appendChild(prose);
  }

  formWrap.innerHTML = formMarkup;
  wrapper.prepend(intro);
  wrapper.appendChild(formWrap);
  return wrapper;
}

function renderContact(section) {
  const wrapper = document.createElement("div");
  wrapper.className = "contact-layout";

  const heading = document.createElement("div");
  heading.className = "section-heading";
  heading.innerHTML = `<p class="section-kicker">Connect</p><h2>${section.heading}</h2>`;

  const body = document.createElement("div");
  body.className = "contact-card";
  body.innerHTML = renderInline(section.tokens);

  wrapper.append(heading, body);
  return wrapper;
}

function createSection(section, index) {
  const sectionEl = document.createElement("section");
  const slug = slugify(section.heading);
  sectionEl.id = slug;
  sectionEl.className = "content-section section-" + slug;
  sectionEl.dataset.index = String(index);

  const frame = document.createElement("div");
  frame.className = "section-frame";

  if (slug === "hero") {
    frame.appendChild(renderHero(section));
  } else if (slug === "work" || slug === "current-activities" || slug === "lesson-options") {
    frame.appendChild(renderWork(section));
  } else if (slug === "calendar") {
    frame.appendChild(renderCalendar(section));
  } else if (slug === "booking") {
    frame.appendChild(renderBooking(section));
  } else if (slug === "contact") {
    frame.appendChild(renderContact(section));
  } else {
    frame.appendChild(renderStandard(section));
  }

  sectionEl.appendChild(frame);
  return sectionEl;
}

async function init() {
  buildNav();

  try {
    const response = await fetch(contentFile);
    if (!response.ok) {
      throw new Error(`Unable to load ${contentFile}`);
    }

    const markdown = await response.text();
    const tokens = marked.lexer(markdown);
    const sections = [];
    let currentSection = null;

    tokens.forEach((token) => {
      if (token.type === "heading" && token.depth === 1) {
        window.siteTitle = token.text;
        return;
      }

      if (token.type === "heading" && token.depth === 2) {
        currentSection = { heading: token.text, tokens: [] };
        sections.push(currentSection);
        return;
      }

      if (currentSection) {
        currentSection.tokens.push(token);
      }
    });

    app.innerHTML = "";
    sections.forEach((section, index) => {
      app.appendChild(createSection(section, index));
    });
  } catch (error) {
    app.innerHTML = `<p class="error-state">${error.message}</p>`;
    console.error(error);
  }
}

init();
