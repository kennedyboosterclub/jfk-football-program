const LAYOUT_COUNTS = {
  full: 1,
  halves: 2,
  "two-top-one-bottom": 3,
  "one-top-four-bottom": 5,
  "four-grid": 4,
  "six-grid": 6,
};

const GRADE_LABELS = {
  freshman: "Freshman",
  sophomore: "Sophomore",
  junior: "Junior",
  senior: "Senior",
};

export const layoutOptions = [
  ["full", "1 full-page sponsor"],
  ["halves", "2 half-page sponsors"],
  ["two-top-one-bottom", "2 top + 1 bottom"],
  ["one-top-four-bottom", "1 top + 4 bottom"],
  ["four-grid", "4 equal sponsors"],
  ["six-grid", "6 equal sponsors"],
];

export function sponsorSlotCount(layout) {
  return LAYOUT_COUNTS[layout] || 1;
}

export function normalizeProgram(input = {}) {
  return {
    season: String(input.season || new Date().getFullYear()),
    programTitle: input.programTitle || "Bloomington Kennedy Football",
    gameLabel: input.gameLabel || "Game Day Program",
    opponent: input.opponent || "",
    gameDate: input.gameDate || "",
    teamPhoto: input.teamPhoto || "",
    sponsorPages: Array.isArray(input.sponsorPages) ? input.sponsorPages : [],
    coaches: { image: "", names: "", ...(input.coaches || {}) },
    schedule: { image: "", ...(input.schedule || {}) },
    captains: { image: "", names: "", ...(input.captains || {}) },
    seniors: { image: "", names: "", ...(input.seniors || {}) },
    players: Array.isArray(input.players) ? input.players : [],
    notPictured: input.notPictured || "",
    managers: { image: "", names: "", ...(input.managers || {}) },
    cheerleaders: { image: "", names: "", ...(input.cheerleaders || {}) },
    actionShots: Array.isArray(input.actionShots) ? input.actionShots : [],
    extraSponsorPages: Array.isArray(input.extraSponsorPages) ? input.extraSponsorPages : [],
  };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function resolveAsset(path, options) {
  if (!path) return "";
  if (/^(data:|blob:|https?:)/.test(path)) return path;
  if (options.assetResolver) return options.assetResolver(path);
  return `${options.assetBase || "./"}${path}`;
}

function mediaFrame(source, alt, options, placeholder = "Upload image") {
  const frame = el("div", "media-frame");
  if (source) {
    const image = el("img");
    image.src = resolveAsset(source, options);
    image.alt = alt;
    image.loading = "lazy";
    frame.append(image);
  } else {
    const empty = el("div", "image-placeholder");
    empty.innerHTML = `<span aria-hidden="true">✦</span><strong>${placeholder}</strong>`;
    frame.append(empty);
  }
  return frame;
}

function pageShell(kind, number) {
  const page = el("section", `program-page ${kind}`);
  page.dataset.page = String(number);
  page.setAttribute("aria-label", `Program page ${number}`);
  const pageNo = el("span", "page-number", String(number));
  page.append(pageNo);
  return page;
}

function sectionTitle(title, kicker) {
  const wrap = el("header", "section-heading");
  if (kicker) wrap.append(el("span", "section-kicker", kicker));
  wrap.append(el("h2", "", title));
  return wrap;
}

function renderCover(program, number, options) {
  const page = pageShell("cover-page", number);
  const title = el("div", "cover-title");
  title.append(el("span", "cover-kicker", program.programTitle));
  title.append(el("h1", "", program.gameLabel));
  if (program.opponent) title.append(el("p", "cover-opponent", `vs. ${program.opponent}`));
  page.append(title);

  const photo = mediaFrame(program.teamPhoto, `${program.season} Kennedy football team`, options, "Team photograph");
  photo.classList.add("team-photo");
  page.append(photo);

  const footer = el("div", "cover-footer");
  footer.append(el("span", "", program.gameDate || "Kennedy Eagles Football"));
  footer.append(el("strong", "", program.season));
  page.append(footer);
  return page;
}

function renderSponsorPage(config, number, options) {
  const layout = LAYOUT_COUNTS[config.layout] ? config.layout : "full";
  const page = pageShell(`sponsor-page sponsor-layout-${layout}`, number);
  const grid = el("div", "sponsor-grid");
  const count = sponsorSlotCount(layout);
  const slots = Array.from({ length: count }, (_, index) => config.slots?.[index] || {});

  slots.forEach((slot, index) => {
    const card = slot.url ? el("a", "sponsor-slot") : el("div", "sponsor-slot");
    if (slot.url) {
      card.href = slot.url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
    }
    if (slot.image) {
      const image = el("img");
      image.src = resolveAsset(slot.image, options);
      image.alt = slot.name || `Sponsor ${index + 1}`;
      image.loading = "lazy";
      card.append(image);
    } else {
      card.append(el("span", "sponsor-placeholder-mark", "SPONSOR"));
      card.append(el("strong", "", slot.name || `Sponsor spot ${index + 1}`));
    }
    grid.append(card);
  });
  page.append(grid);
  return page;
}

function renderCoaches(program, number, options) {
  const page = pageShell("coaches-page", number);
  const coaches = el("section", "half-section coaches-block");
  coaches.append(sectionTitle("Coaches", "Meet the staff"));
  coaches.append(mediaFrame(program.coaches.image, "Kennedy football coaching staff", options, "Coaches photograph"));
  coaches.append(el("p", "name-strip", program.coaches.names || "Coach names"));

  const schedule = el("section", "half-section schedule-block");
  schedule.append(sectionTitle("Season Schedule", program.season));
  schedule.append(mediaFrame(program.schedule.image, `${program.season} Kennedy football schedule`, options, "Schedule image"));
  page.append(coaches, schedule);
  return page;
}

function featureHalf(title, kicker, item, alt, options) {
  const section = el("section", "feature-half");
  section.append(sectionTitle(title, kicker));
  section.append(mediaFrame(item.image, alt, options, `${title} photograph`));
  section.append(el("p", "name-strip", item.names || `${title} names`));
  return section;
}

function renderCaptainsAndSeniors(program, number, options) {
  const page = pageShell("features-page", number);
  page.append(
    featureHalf("Team Captains", "Leadership", program.captains, "Kennedy football captains", options),
    featureHalf("Seniors", "Class of " + program.season, program.seniors, "Kennedy football seniors", options),
  );
  return page;
}

function renderPlayerCard(player, index, options) {
  const card = el("article", "player-card");
  const photo = mediaFrame(player.photo, `${player.firstName || ""} ${player.lastName || ""}`.trim() || `Player ${index + 1}`, options, "Player photo");
  photo.classList.add("player-photo");
  card.append(photo);

  const label = el("div", "player-label");
  label.append(el("span", "player-index", String(index + 1).padStart(2, "0")));
  const name = el("div", "player-name");
  name.append(el("strong", "", `${player.firstName || "First"} ${player.lastName || "Last"}`));
  name.append(el("span", "", GRADE_LABELS[player.grade] || player.grade || "Grade"));
  label.append(name);
  card.append(label);
  return card;
}

function renderRoster(program, startNumber, options) {
  const players = program.players.length ? program.players : Array.from({ length: 15 }, () => ({}));
  const pages = [];
  for (let offset = 0; offset < players.length; offset += 15) {
    const page = pageShell("roster-page", startNumber + pages.length);
    page.append(sectionTitle("Kennedy Eagles", `Player roster • ${program.season}`));
    const grid = el("div", "player-grid");
    players.slice(offset, offset + 15).forEach((player, localIndex) => {
      grid.append(renderPlayerCard(player, offset + localIndex, options));
    });
    page.append(grid);
    if (offset + 15 >= players.length && program.notPictured.trim()) {
      const notPictured = el("aside", "not-pictured");
      notPictured.append(el("strong", "", "Not Pictured"));
      notPictured.append(el("p", "", program.notPictured));
      page.append(notPictured);
    }
    pages.push(page);
  }
  return pages;
}

function renderManagersCheer(program, number, options) {
  const page = pageShell("people-page", number);
  page.append(
    featureHalf("Team Managers", "Behind the team", program.managers, "Kennedy football team managers", options),
    featureHalf("Cheerleaders", "Kennedy spirit", program.cheerleaders, "Kennedy cheerleaders", options),
  );
  return page;
}

function renderActionPage(item, index, number, options) {
  const page = pageShell("action-page", number);
  page.append(sectionTitle("Friday Night Lights", `Action gallery • ${String(index + 1).padStart(2, "0")}`));
  const media = mediaFrame(item.image, item.caption || `Kennedy football action photograph ${index + 1}`, options, "Action photograph");
  media.classList.add("action-photo");
  page.append(media);
  if (item.caption) page.append(el("p", "action-caption", item.caption));
  return page;
}

export function renderProgram(input, container, options = {}) {
  const program = normalizeProgram(input);
  const fragment = document.createDocumentFragment();
  let pageNumber = 1;

  fragment.append(renderCover(program, pageNumber++, options));
  program.sponsorPages.forEach((page) => fragment.append(renderSponsorPage(page, pageNumber++, options)));
  fragment.append(renderCoaches(program, pageNumber++, options));
  fragment.append(renderCaptainsAndSeniors(program, pageNumber++, options));

  const rosterPages = renderRoster(program, pageNumber, options);
  rosterPages.forEach((page) => fragment.append(page));
  pageNumber += rosterPages.length;

  fragment.append(renderManagersCheer(program, pageNumber++, options));
  const actionShots = program.actionShots.length ? program.actionShots : [{}, {}];
  actionShots.forEach((shot, index) => fragment.append(renderActionPage(shot, index, pageNumber++, options)));
  program.extraSponsorPages.forEach((page) => fragment.append(renderSponsorPage(page, pageNumber++, options)));

  container.replaceChildren(fragment);
  return pageNumber - 1;
}
