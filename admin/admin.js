import { normalizeProgram, packSponsors, renderProgram, sponsorSizeOptions } from "../program-renderer.js?v=20260909-seniors1";

const DRAFT_KEY = "jfk-program-draft-v1";
const SETTINGS_KEY = "jfk-program-github-settings-v1";
const DB_NAME = "jfk-program-assets-v1";
const DB_STORE = "assets";
const API_VERSION = "2026-03-10";

const editor = document.querySelector("#editor");
const preview = document.querySelector("#preview");
const saveState = document.querySelector("#save-state");
const previewCount = document.querySelector("#preview-count");
const publishDialog = document.querySelector("#publish-dialog");
const publishForm = document.querySelector("#publish-form");
const publishMessage = document.querySelector("#publish-message");
const publishProgress = document.querySelector("#publish-progress");

let program = normalizeProgram();
let liveProgram = normalizeProgram();
let pendingAssets = new Map();
let saveTimer;
let rosterImportReport = null;

function openAssetDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE, { keyPath: "path" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function assetDb(action, value) {
  const db = await openAssetDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, action === "getAll" ? "readonly" : "readwrite");
    const store = tx.objectStore(DB_STORE);
    const request = action === "getAll" ? store.getAll() : action === "put" ? store.put(value) : action === "delete" ? store.delete(value) : store.clear();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getAt(path) {
  return path.reduce((value, key) => value?.[key], program);
}

function assignAt(path, value) {
  let cursor = program;
  path.slice(0, -1).forEach((key) => { cursor = cursor[key]; });
  cursor[path[path.length - 1]] = value;
}

function setAt(path, value) {
  assignAt(path, value);
  queueSave();
}

function queueSave() {
  saveState.textContent = "Saving local draft…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(program));
    saveState.textContent = `Draft saved on this computer • ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }, 250);
  renderPreview();
}

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function section(id, title, description, kicker) {
  const wrapper = h("section", "editor-section");
  wrapper.id = id;
  const row = h("div", "section-title-row");
  const copy = h("div");
  if (kicker) copy.append(h("span", "eyebrow", kicker));
  copy.append(h("h2", "", title), h("p", "", description));
  row.append(copy);
  wrapper.append(row);
  return wrapper;
}

function inputField(label, path, type = "text", options = {}) {
  const field = h("label", "field");
  field.append(h("span", "", label));
  const input = type === "textarea" ? h("textarea") : h("input");
  if (type !== "textarea") input.type = type;
  input.value = getAt(path) ?? "";
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  input.addEventListener("input", () => setAt(path, input.value));
  field.append(input);
  return field;
}

function assetPreviewUrl(path) {
  if (!path) return "";
  if (pendingAssets.has(path)) return pendingAssets.get(path);
  if (/^(data:|blob:|https?:)/.test(path)) return path;
  return `../${path}`;
}

function compressionProfile(path) {
  if (path[0] === "players") return { maximum: 900, quality: 0.74, minimumQuality: 0.5, targetBytes: 280 * 1024 };
  if (["teamPhoto", "coaches", "captains", "seniors", "lowerLevelTeams", "managers", "cheerleaders"].includes(path[0])) {
    return { maximum: 1800, quality: 0.78, minimumQuality: 0.54, targetBytes: 950 * 1024 };
  }
  return { maximum: 2000, quality: 0.8, minimumQuality: 0.56, targetBytes: 1200 * 1024 };
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The image could not be compressed.")), "image/webp", quality);
  });
}

function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The compressed image could not be saved."));
    reader.readAsDataURL(blob);
  });
}

async function compressImage(file, profile) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That image could not be read."));
      img.src = sourceUrl;
    });
    const { maximum, minimumQuality, targetBytes } = profile;
    const ratio = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * ratio);
    canvas.height = Math.round(image.naturalHeight * ratio);
    const context = canvas.getContext("2d");
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = profile.quality;
    let compressed = await canvasBlob(canvas, quality);
    while (compressed.size > targetBytes && quality > minimumQuality) {
      quality = Math.max(minimumQuality, quality - 0.06);
      compressed = await canvasBlob(canvas, quality);
    }
    return blobDataUrl(compressed);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function safeAssetName(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "image";
}

async function prepareImage(file, path, label) {
  const dataUrl = await compressImage(file, compressionProfile(path));
  const oldPath = getAt(path);
  const target = `assets/uploads/${safeAssetName(label)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.webp`;
  if (oldPath && pendingAssets.has(oldPath)) {
    pendingAssets.delete(oldPath);
    await assetDb("delete", oldPath).catch(() => {});
  }
  pendingAssets.set(target, dataUrl);
  await assetDb("put", { path: target, dataUrl });
  assignAt(path, target);
  return target;
}

async function selectImage(file, path, label) {
  saveState.textContent = "Preparing image…";
  try {
    await prepareImage(file, path, label);
    queueSave();
    renderEditor();
  } catch (error) {
    alert(error.message);
    saveState.textContent = "Image was not added";
  }
}

function imageField(label, path) {
  const value = getAt(path);
  const control = h("div", "image-control");
  const imagePreview = h("div", "image-control-preview", value ? "Image selected" : "No image");
  if (value) {
    const img = h("img");
    img.src = assetPreviewUrl(value);
    img.alt = "";
    imagePreview.replaceChildren(img);
  }
  const body = h("div", "image-control-body");
  body.append(h("strong", "", label));
  const actions = h("div", "image-actions");
  const choose = h("label", "file-button", value ? "Replace image" : "Choose image");
  const input = h("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp";
  input.addEventListener("change", () => input.files?.[0] && selectImage(input.files[0], path, label));
  choose.append(input);
  actions.append(choose);
  if (value) {
    const remove = h("button", "danger-button", "Remove");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      if (pendingAssets.has(value)) {
        pendingAssets.delete(value);
        await assetDb("delete", value).catch(() => {});
      }
      setAt(path, "");
      renderEditor();
    });
    actions.append(remove);
  }
  body.append(actions);
  control.append(imagePreview, body);
  return control;
}

function textInput(label, value, onInput, placeholder = "") {
  const field = h("label", "field");
  field.append(h("span", "", label));
  const input = h("input");
  input.value = value || "";
  input.placeholder = placeholder;
  input.addEventListener("input", () => { onInput(input.value); queueSave(); });
  field.append(input);
  return field;
}

function selectField(label, value, choices, onChange) {
  const field = h("label", "field");
  field.append(h("span", "", label));
  const select = h("select");
  choices.forEach(([optionValue, optionLabel]) => {
    const option = h("option", "", optionLabel);
    option.value = optionValue;
    option.selected = optionValue === value;
    select.append(option);
  });
  select.addEventListener("change", () => onChange(select.value));
  field.append(select);
  return field;
}

function sponsorEditor(sponsor, index) {
  const card = h("div", "subcard");
  const header = h("div", "subcard-header");
  header.append(h("strong", "", sponsor.name || `Sponsor ${index + 1}`));
  const actions = h("div", "sponsor-order-actions");
  const moveUp = h("button", "text-button", "Move up");
  moveUp.type = "button";
  moveUp.disabled = index === 0;
  moveUp.addEventListener("click", () => {
    [program.sponsors[index - 1], program.sponsors[index]] = [program.sponsors[index], program.sponsors[index - 1]];
    queueSave(); renderEditor();
  });
  const moveDown = h("button", "text-button", "Move down");
  moveDown.type = "button";
  moveDown.disabled = index === program.sponsors.length - 1;
  moveDown.addEventListener("click", () => {
    [program.sponsors[index], program.sponsors[index + 1]] = [program.sponsors[index + 1], program.sponsors[index]];
    queueSave(); renderEditor();
  });
  const remove = h("button", "danger-button", "Remove");
  remove.type = "button";
  remove.addEventListener("click", () => { program.sponsors.splice(index, 1); queueSave(); renderEditor(); });
  actions.append(moveUp, moveDown, remove);
  header.append(actions);
  card.append(header);

  const settings = h("div", "field-grid two-columns sponsor-settings");
  settings.append(
    selectField("Sponsor size", sponsor.size, sponsorSizeOptions, (value) => { sponsor.size = value; queueSave(); renderEditor(); }),
    selectField("Position in program", sponsor.placement, [
      ["before-team", "Before team and player photos"],
      ["after-team", "After the cheerleader page"],
    ], (value) => { sponsor.placement = value; queueSave(); renderEditor(); }),
  );
  card.append(settings);
  card.append(imageField("Sponsor advertisement or logo", ["sponsors", index, "image"]));

  const fields = h("div", "field-grid two-columns sponsor-contact-fields");
  fields.append(
    textInput("Sponsor name", sponsor.name, (value) => { sponsor.name = value; }, `Sponsor ${index + 1}`),
    textInput("Phone number (optional)", sponsor.phone, (value) => { sponsor.phone = value; }, "(612) 555-0123"),
    textInput("Website link (optional)", sponsor.url, (value) => { sponsor.url = value; }, "https://example.com"),
  );
  card.append(fields);
  return card;
}

function renderGameSection() {
  const wrap = section("game", "Game & cover", "Update the season, matchup, date, time, and cover photograph.", "Page 1");
  const fields = h("div", "field-grid two-columns");
  fields.append(
    inputField("Season", ["season"]),
    inputField("Game label", ["gameLabel"], "text", { placeholder: "Game Day Program" }),
    inputField("Opponent (optional)", ["opponent"], "text", { placeholder: "Jefferson" }),
    inputField("Game date (optional)", ["gameDate"], "text", { placeholder: "Friday, September 18" }),
    inputField("Game time (optional)", ["gameTime"], "text", { placeholder: "7:00 PM" }),
  );
  wrap.append(fields, imageField("Team photograph", ["teamPhoto"]));
  return wrap;
}

function renderSponsorsSection() {
  const beforePages = packSponsors(program.sponsors, "before-team").length;
  const afterPages = packSponsors(program.sponsors, "after-team").length;
  const wrap = section("sponsors", "Sponsors", "Add any number of sponsors. Full-page ads fill a page, half-page ads share a page in two rows, and quarter-page ads fill a 2 × 2 grid. Images scale automatically without being cropped.", "Dynamic sponsor pages");
  const add = h("button", "button secondary", "Add sponsor");
  add.type = "button";
  add.addEventListener("click", () => {
    program.sponsors.push({ id: `sponsor-${Date.now()}`, name: "", image: "", url: "", phone: "", size: "full", placement: "before-team" });
    queueSave(); renderEditor();
  });
  wrap.querySelector(".section-title-row").append(add);

  const summary = h("div", "sponsor-page-summary");
  summary.append(
    h("span", "", `${program.sponsors.filter((sponsor) => sponsor.placement === "before-team").length} sponsors before photos • ${beforePages} pages`),
    h("span", "", `${program.sponsors.filter((sponsor) => sponsor.placement === "after-team").length} sponsors after cheerleaders • ${afterPages} pages`),
  );
  wrap.append(summary);
  if (!program.sponsors.length) wrap.append(h("div", "empty-list", "No sponsors have been added yet."));
  program.sponsors.forEach((sponsor, index) => wrap.append(sponsorEditor(sponsor, index)));
  return wrap;
}

function renderStaffSection() {
  const wrap = section("staff", "Staff & team groups", "Names can be separated by commas or placed on separate lines.", "Positions adjust automatically");
  const groups = [
    ["Coaches", "coaches", true],
    ["Season schedule", "schedule", false],
    ["Team captains", "captains", true],
    ["Seniors", "seniors", true],
    ["Team managers", "managers", true],
    ["Cheerleaders", "cheerleaders", true],
  ];
  groups.forEach(([label, key, hasNames]) => {
    const card = h("div", "subcard");
    card.append(h("div", "subcard-header", ""));
    card.firstChild.append(h("strong", "", label));
    card.append(imageField(`${label} image`, [key, "image"]));
    if (hasNames) card.append(inputField(`${label} names`, [key, "names"], "textarea"));
    if (key === "seniors") {
      card.append(inputField("Senior class year", ["seniors", "classYear"], "text", { placeholder: "2027" }));
    }
    wrap.append(card);
  });
  return wrap;
}

function renderAdditionalTeamsSection() {
  const wrap = section(
    "team-photos",
    "Additional team photographs",
    "Each photograph uses one-half page after the individual player roster. Team Managers share with JV; B Squad shares with 9th Grade. Empty B Squad and 9th Grade pages stay hidden.",
    "9th Grade • B Squad • JV",
  );
  [
    ["9th Grade Team", "ninthGrade"],
    ["B Squad Team", "bSquad"],
    ["JV Team", "juniorVarsity"],
  ].forEach(([label, key]) => {
    const card = h("div", "subcard");
    card.append(h("div", "subcard-header", ""));
    card.firstChild.append(h("strong", "", label));
    card.append(imageField(`${label} photograph`, ["lowerLevelTeams", key, "image"]));
    wrap.append(card);
  });
  return wrap;
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadRosterTemplate() {
  const rows = [["roster_order", "first_name", "last_name", "grade", "photo_filename"]];
  for (let index = 1; index <= 80; index += 1) rows.push([index, "", "", "", ""]);
  const csv = rows.map((row) => row.map(csvValue).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `kennedy-football-roster-${program.season}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("The CSV contains an unfinished quoted value.");
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function normalizedHeader(value) {
  return String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function normalizedGrade(value) {
  const grade = String(value || "").trim().toLowerCase();
  if (["9", "9th", "fr", "frosh", "freshman", "freshmen"].includes(grade)) return "freshman";
  if (["10", "10th", "so", "soph", "sophomore", "sophomores"].includes(grade)) return "sophomore";
  if (["11", "11th", "jr", "junior", "juniors"].includes(grade)) return "junior";
  if (["12", "12th", "sr", "senior", "seniors"].includes(grade)) return "senior";
  return "";
}

function photoKey(value) {
  const filename = String(value || "").split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
  return filename.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function playerSlug(player) {
  return safeAssetName(`${player.firstName || "player"}-${player.lastName || ""}`);
}

function automaticPhotoFilename(player, index) {
  return `${String(index + 1).padStart(3, "0")}-${playerSlug(player)}.jpg`;
}

function playerPhotoKeys(player, index) {
  return [...new Set([
    player.photoFilename,
    automaticPhotoFilename(player, index),
    `${player.firstName || ""}-${player.lastName || ""}`,
    `${player.lastName || ""}-${player.firstName || ""}`,
  ].map(photoKey).filter(Boolean))];
}

function parseRosterFile(text) {
  const rows = parseCsv(text).filter((row) => row.some((value) => String(value).trim()));
  if (rows.length < 2) throw new Error("The roster CSV does not contain any player rows.");

  const headers = rows[0].map(normalizedHeader);
  const aliases = {
    order: ["roster_order", "player_number", "order", "number"],
    firstName: ["first_name", "firstname", "first"],
    lastName: ["last_name", "lastname", "last"],
    grade: ["grade", "class", "class_year"],
    photoFilename: ["photo_filename", "photo_file", "photo", "image_filename"],
  };
  const columns = Object.fromEntries(Object.entries(aliases).map(([key, choices]) => [key, choices.map((choice) => headers.indexOf(choice)).find((index) => index >= 0) ?? -1]));
  const missing = ["firstName", "lastName", "grade"].filter((key) => columns[key] < 0);
  if (missing.length) throw new Error("The CSV must include first_name, last_name, and grade columns. Download the template and copy your roster into it.");

  const invalidGrades = [];
  const duplicateOrders = [];
  const seenOrders = new Set();
  const players = rows.slice(1).map((row, sourceIndex) => {
    const firstName = String(row[columns.firstName] || "").trim();
    const lastName = String(row[columns.lastName] || "").trim();
    const rawGrade = String(row[columns.grade] || "").trim();
    const parsedOrder = columns.order >= 0 ? Number.parseInt(row[columns.order], 10) : Number.NaN;
    const order = Number.isFinite(parsedOrder) && parsedOrder > 0 ? parsedOrder : sourceIndex + 1;
    if (seenOrders.has(order)) duplicateOrders.push(String(order));
    seenOrders.add(order);
    if (rawGrade && !normalizedGrade(rawGrade)) invalidGrades.push(`${firstName} ${lastName}`.trim() || `row ${sourceIndex + 2}`);
    return {
      order,
      sourceIndex,
      firstName,
      lastName,
      grade: normalizedGrade(rawGrade),
      photo: "",
      photoFilename: columns.photoFilename >= 0 ? String(row[columns.photoFilename] || "").trim() : "",
    };
  }).filter((player) => player.firstName || player.lastName);

  if (!players.length) throw new Error("No player names were found in the CSV.");
  if (players.length > 150) throw new Error("The roster is limited to 150 players.");
  players.sort((a, b) => a.order - b.order || a.sourceIndex - b.sourceIndex);
  players.forEach((player, index) => {
    if (!player.photoFilename) player.photoFilename = automaticPhotoFilename(player, index);
    delete player.order;
    delete player.sourceIndex;
  });
  return { players, invalidGrades, duplicateOrders: [...new Set(duplicateOrders)] };
}

function currentPhotoMap() {
  const matches = new Map();
  program.players.forEach((player, index) => {
    if (!player.photo) return;
    playerPhotoKeys(player, index).forEach((key) => {
      if (!matches.has(key)) matches.set(key, new Set());
      matches.get(key).add(player.photo);
    });
  });
  return matches;
}

async function importRosterCsv(file) {
  try {
    const result = parseRosterFile(await file.text());
    const hasExistingRoster = program.players.some((player) => player.firstName || player.lastName || player.photo);
    if (hasExistingRoster && !confirm("Importing this CSV will replace the current roster names and order. Existing photos will be kept when their filenames match. Continue?")) return;

    const existingPhotos = currentPhotoMap();
    result.players.forEach((player, index) => {
      const photos = new Set();
      playerPhotoKeys(player, index).forEach((key) => existingPhotos.get(key)?.forEach((photo) => photos.add(photo)));
      if (photos.size === 1) [player.photo] = photos;
    });
    program.players = result.players;
    const missingPhotos = program.players.map((player, index) => player.photo ? "" : player.photoFilename || automaticPhotoFilename(player, index)).filter(Boolean);
    rosterImportReport = {
      heading: "Roster CSV imported",
      summary: `${program.players.length} players are ready. Select the player photo folder to match the pictures automatically.`,
      stats: [
        `${program.players.filter((player) => player.photo).length} photos already matched`,
        `${missingPhotos.length} photos still needed`,
      ],
      details: [
        ["Grades that need review", result.invalidGrades],
        ["Duplicate roster-order numbers", result.duplicateOrders],
        ["Photos still needed", missingPhotos],
      ],
    };
    queueSave();
    renderEditor();
  } catch (error) {
    rosterImportReport = { heading: "Roster import stopped", summary: error.message, stats: [], details: [] };
    renderEditor();
  }
}

function rosterMatchMap() {
  const matches = new Map();
  program.players.forEach((player, index) => {
    playerPhotoKeys(player, index).forEach((key) => {
      if (!matches.has(key)) matches.set(key, new Set());
      matches.get(key).add(index);
    });
  });
  return matches;
}

async function importRosterPhotos(fileList) {
  if (!program.players.length) {
    rosterImportReport = { heading: "Import the roster first", summary: "Add player names with the CSV before selecting the photo folder.", stats: [], details: [] };
    renderEditor();
    return;
  }

  const files = [...fileList].filter((file) => file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name));
  if (!files.length) {
    rosterImportReport = { heading: "No photos found", summary: "Choose a folder containing JPG, PNG, or WebP images.", stats: [], details: [] };
    renderEditor();
    return;
  }

  const matches = rosterMatchMap();
  const fileCounts = new Map();
  files.forEach((file) => fileCounts.set(photoKey(file.name), (fileCounts.get(photoKey(file.name)) || 0) + 1));
  const usedPlayers = new Set();
  const matched = [];
  const unmatched = [];
  const duplicates = [];
  const ambiguous = [];
  const failed = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const key = photoKey(file.name);
    saveState.textContent = `Preparing player photo ${index + 1} of ${files.length}…`;
    if (fileCounts.get(key) > 1) {
      duplicates.push(file.name);
      continue;
    }
    const candidates = [...(matches.get(key) || [])];
    if (!candidates.length) {
      unmatched.push(file.name);
      continue;
    }
    if (candidates.length > 1 || usedPlayers.has(candidates[0])) {
      ambiguous.push(file.name);
      continue;
    }

    const playerIndex = candidates[0];
    const player = program.players[playerIndex];
    try {
      await prepareImage(file, ["players", playerIndex, "photo"], `player-${playerIndex + 1}-${player.firstName}-${player.lastName}`);
      usedPlayers.add(playerIndex);
      matched.push(`${player.firstName} ${player.lastName}`.trim());
    } catch (error) {
      failed.push(`${file.name}: ${error.message}`);
    }
  }

  const missingPhotos = program.players.map((player, index) => player.photo ? "" : player.photoFilename || automaticPhotoFilename(player, index)).filter(Boolean);
  rosterImportReport = {
    heading: "Photo matching complete",
    summary: `${matched.length} new photos matched. Review anything listed below before publishing.`,
    stats: [
      `${program.players.filter((player) => player.photo).length} of ${program.players.length} players have photos`,
      `${missingPhotos.length} players still need photos`,
      `${unmatched.length + duplicates.length + ambiguous.length + failed.length} files need review`,
    ],
    details: [
      ["Players matched in this upload", matched],
      ["Players still missing a photo", missingPhotos],
      ["Files with no roster match", unmatched],
      ["Duplicate filenames", [...new Set(duplicates)]],
      ["Files matching more than one player", ambiguous],
      ["Files that could not be prepared", failed],
    ],
  };
  queueSave();
  renderEditor();
}

function bulkFileButton(label, accept, onFiles, directory = false) {
  const control = h("label", "button secondary bulk-file-button", label);
  const input = h("input");
  input.type = "file";
  input.accept = accept;
  if (directory) input.setAttribute("webkitdirectory", "");
  if (directory) input.setAttribute("directory", "");
  input.multiple = directory;
  input.addEventListener("change", () => {
    if (input.files?.length) onFiles(input.files);
    input.value = "";
  });
  control.append(input);
  return control;
}

function renderRosterReport() {
  if (!rosterImportReport) return null;
  const report = h("div", "bulk-roster-report");
  report.append(h("strong", "", rosterImportReport.heading), h("p", "", rosterImportReport.summary));
  if (rosterImportReport.stats.length) {
    const stats = h("div", "bulk-roster-stats");
    rosterImportReport.stats.forEach((stat) => stats.append(h("span", "", stat)));
    report.append(stats);
  }
  rosterImportReport.details.filter(([, items]) => items.length).forEach(([label, items]) => {
    const details = h("details", "bulk-roster-details");
    details.append(h("summary", "", `${label} (${items.length})`));
    const list = h("ul");
    items.slice(0, 100).forEach((item) => list.append(h("li", "", item)));
    details.append(list);
    report.append(details);
  });
  return report;
}

function resizeRoster(size) {
  const target = Math.max(0, Math.min(150, Number.parseInt(size, 10) || 0));
  while (program.players.length < target) program.players.push({ firstName: "", lastName: "", grade: "", photo: "", photoFilename: "" });
  if (program.players.length > target) program.players.length = target;
  rosterImportReport = null;
  queueSave();
  renderEditor();
}

function renderRosterSection() {
  const wrap = section("roster", "Player roster", "The program automatically creates one roster page for every 15 players. The display number is the player's position in this list—not a jersey number.", "15 players per page");
  const bulk = h("div", "bulk-roster-tools");
  bulk.append(
    h("strong", "", "Bulk roster setup"),
    h("p", "", "Download the 80-row template, enter the roster, and import it. Then select the complete player-photo folder. Photos match by filename and are compressed automatically."),
  );
  const bulkActions = h("div", "bulk-roster-actions");
  const download = h("button", "button secondary", "Download CSV template");
  download.type = "button";
  download.addEventListener("click", downloadRosterTemplate);
  bulkActions.append(
    download,
    bulkFileButton("Import roster CSV", ".csv,text/csv", (files) => importRosterCsv(files[0])),
    bulkFileButton("Select photo folder", "image/jpeg,image/png,image/webp", importRosterPhotos, true),
  );
  bulk.append(bulkActions);
  const naming = h("p", "bulk-roster-note");
  naming.innerHTML = "Use grades <strong>Freshman, Sophomore, Junior, or Senior</strong> (9–12 also work). If the photo_filename column is blank, name photos like <strong>001-first-last.jpg</strong>. The simpler <strong>first-last.jpg</strong> format also matches when names are unique.";
  bulk.append(naming);
  const report = renderRosterReport();
  if (report) bulk.append(report);
  wrap.append(bulk);

  const tools = h("div", "roster-tools");
  const sizeField = h("label", "field");
  sizeField.append(h("span", "", "Total players"));
  const size = h("input");
  size.type = "number";
  size.min = "0";
  size.max = "150";
  size.value = String(program.players.length);
  sizeField.append(size);
  const apply = h("button", "button secondary", "Set roster size");
  apply.type = "button";
  apply.addEventListener("click", () => resizeRoster(size.value));
  tools.append(sizeField, apply, h("span", "", `${Math.max(1, Math.ceil(program.players.length / 15))} roster page${program.players.length > 15 ? "s" : ""}`));
  wrap.append(tools);

  if (!program.players.length) wrap.append(h("div", "empty-list", "Set the total number of players to begin entering the roster."));
  program.players.forEach((player, index) => {
    const row = h("div", "player-editor");
    row.append(h("span", "", String(index + 1)));
    const first = h("input"); first.placeholder = "First name"; first.value = player.firstName || "";
    const last = h("input"); last.placeholder = "Last name"; last.value = player.lastName || "";
    first.addEventListener("input", () => { player.firstName = first.value; queueSave(); });
    last.addEventListener("input", () => { player.lastName = last.value; queueSave(); });
    const grade = h("select");
    [["", "Grade"], ["freshman", "Freshman"], ["sophomore", "Sophomore"], ["junior", "Junior"], ["senior", "Senior"]].forEach(([value, label]) => {
      const option = h("option", "", label); option.value = value; option.selected = player.grade === value; grade.append(option);
    });
    grade.addEventListener("change", () => { player.grade = grade.value; queueSave(); });
    const photo = h("label", `player-photo-button${player.photo ? " has-photo" : ""}`, player.photo ? "Replace photo" : "Add photo");
    const file = h("input"); file.type = "file"; file.accept = "image/jpeg,image/png,image/webp";
    file.addEventListener("change", () => file.files?.[0] && selectImage(file.files[0], ["players", index, "photo"], `player-${index + 1}-${player.firstName}-${player.lastName}`));
    photo.append(file);
    row.append(first, last, grade, photo);
    wrap.append(row);
  });
  wrap.append(inputField("Not pictured (names shown on the final roster page)", ["notPictured"], "textarea", { placeholder: "Enter names separated by commas" }));
  return wrap;
}

function renderGallerySection() {
  const wrap = section("gallery", "Action shots", "Each action image receives its own full-page feature after the team photos and any sponsors placed after them.", "Two pages by default");
  while (program.actionShots.length < 2) program.actionShots.push({ image: "", caption: "" });
  program.actionShots.forEach((shot, index) => {
    const card = h("div", "subcard");
    const header = h("div", "subcard-header"); header.append(h("strong", "", `Action page ${index + 1}`)); card.append(header);
    card.append(imageField(`Action photograph ${index + 1}`, ["actionShots", index, "image"]));
    card.append(inputField("Caption (optional)", ["actionShots", index, "caption"]));
    wrap.append(card);
  });
  return wrap;
}

function renderEditor() {
  const intro = h("p", "editor-intro");
  intro.innerHTML = "Changes are saved as a <strong>draft on this computer</strong>. Visitors will not see them until you select <strong>Publish to GitHub</strong>.";
  editor.replaceChildren(intro, renderGameSection(), renderSponsorsSection(), renderStaffSection(), renderRosterSection(), renderAdditionalTeamsSection(), renderGallerySection());
}

function renderPreview() {
  const count = renderProgram(program, preview, { assetBase: "../", assetResolver: assetPreviewUrl });
  previewCount.textContent = `${count} pages • preview only`;
}

function dataUrlBase64(dataUrl) {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

function textBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
}

function apiHeaders(token) {
  return { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": API_VERSION, "Content-Type": "application/json" };
}

function repositoryApiPath(settings, path) {
  return `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/${path}`;
}

async function githubRequest(url, options, allowed = []) {
  const response = await fetch(url, options);
  if (allowed.includes(response.status)) return response;
  if (!response.ok) {
    let detail = `GitHub returned ${response.status}`;
    try {
      const body = await response.json();
      detail = body.message || detail;
      const reasons = Array.isArray(body.errors) ? body.errors.map((error) => error.message || error.code).filter(Boolean) : [];
      if (reasons.length) detail += `: ${reasons.join("; ")}`;
    } catch {}
    throw new Error(detail);
  }
  return response;
}

async function githubJson(url, options) {
  const response = await githubRequest(url, options);
  return response.status === 204 ? {} : response.json();
}

async function publishBatch(settings, token, files, onProgress) {
  const headers = apiHeaders(token);
  const branchPath = settings.branch.split("/").map(encodeURIComponent).join("/");
  const ref = await githubJson(repositoryApiPath(settings, `git/ref/heads/${branchPath}`), { headers });
  const headSha = ref.object?.sha;
  if (!headSha) throw new Error("GitHub could not find the selected branch.");
  const headCommit = await githubJson(repositoryApiPath(settings, `git/commits/${encodeURIComponent(headSha)}`), { headers });
  const baseTreeSha = headCommit.tree?.sha;
  if (!baseTreeSha) throw new Error("GitHub could not prepare the current program version.");

  const tree = [];
  const batchSize = 5;
  for (let offset = 0; offset < files.length; offset += batchSize) {
    const batch = files.slice(offset, offset + batchSize);
    const blobs = await Promise.all(batch.map((file) => githubJson(repositoryApiPath(settings, "git/blobs"), {
      method: "POST",
      headers,
      body: JSON.stringify({ content: file.content, encoding: "base64" }),
    })));
    batch.forEach((file, index) => tree.push({ path: file.path, mode: "100644", type: "blob", sha: blobs[index].sha }));
    onProgress(Math.min(offset + batch.length, files.length), files.length);
  }

  const newTree = await githubJson(repositoryApiPath(settings, "git/trees"), {
    method: "POST",
    headers,
    body: JSON.stringify({ base_tree: baseTreeSha, tree }),
  });
  const commit = await githubJson(repositoryApiPath(settings, "git/commits"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: `Update ${program.season} game-day program${pendingAssets.size ? ` and ${pendingAssets.size} images` : ""}`,
      tree: newTree.sha,
      parents: [headSha],
    }),
  });
  await githubJson(repositoryApiPath(settings, `git/refs/heads/${branchPath}`), {
    method: "PATCH",
    headers,
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return commit.sha;
}

function readSettings() {
  try { return { branch: "main", ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; }
  catch { return { branch: "main" }; }
}

function fillPublishDialog() {
  const settings = readSettings();
  document.querySelector("#github-owner").value = settings.owner || "";
  document.querySelector("#github-repo").value = settings.repo || "jfk-football-program";
  document.querySelector("#github-branch").value = settings.branch || "main";
  document.querySelector("#github-token").value = "";
  const lowerTeams = [
    ["9th Grade", program.lowerLevelTeams.ninthGrade.image],
    ["B Squad", program.lowerLevelTeams.bSquad.image],
    ["JV", program.lowerLevelTeams.juniorVarsity.image],
  ];
  const includedTeams = lowerTeams.filter(([, image]) => image).map(([label, image]) => `${label}${pendingAssets.has(image) ? " (new upload)" : ""}`);
  const teamSummary = includedTeams.length ? ` Included lower-level teams: ${includedTeams.join(", ")}.` : " No lower-level team photos are currently selected.";
  document.querySelector("#publish-summary").textContent = `${pendingAssets.size} new image${pendingAssets.size === 1 ? "" : "s"} and the program data will be published together in one GitHub update.${teamSummary} The public site normally refreshes within a few minutes.`;
  publishMessage.textContent = "";
  publishMessage.className = "publish-message";
  publishProgress.hidden = true;
}

async function publish() {
  const owner = document.querySelector("#github-owner").value.trim();
  const repo = document.querySelector("#github-repo").value.trim();
  const branch = document.querySelector("#github-branch").value.trim() || "main";
  const tokenInput = document.querySelector("#github-token");
  const token = tokenInput.value.trim();
  if (!owner || !repo || !token) {
    publishMessage.textContent = "Enter the GitHub owner, repository, and fine-grained token.";
    publishMessage.className = "publish-message error";
    return;
  }

  const settings = { owner, repo, branch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  const button = document.querySelector("#confirm-publish");
  button.disabled = true;
  publishProgress.hidden = false;
  const bar = publishProgress.querySelector("span");
  const files = [...pendingAssets.entries()].map(([path, dataUrl]) => ({ path, content: dataUrlBase64(dataUrl) }));
  files.push({ path: "data/program.json", content: textBase64(`${JSON.stringify(program, null, 2)}\n`) });

  try {
    publishMessage.textContent = "Preparing one GitHub update…";
    bar.style.width = "3%";
    await publishBatch(settings, token, files, (completed, total) => {
      publishMessage.textContent = `Preparing files ${completed} of ${total}…`;
      bar.style.width = `${Math.max(5, Math.round((completed / total) * 85))}%`;
    });
    publishMessage.textContent = "Finalizing the program update…";
    bar.style.width = "100%";
    pendingAssets.clear();
    await assetDb("clear");
    liveProgram = clone(program);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(program));
    publishMessage.textContent = "Published successfully. GitHub Pages should show the update within a few minutes.";
    publishMessage.className = "publish-message success";
    saveState.textContent = "Published • local draft is current";
    tokenInput.value = "";
  } catch (error) {
    publishMessage.textContent = `Publish stopped: ${error.message}. Your local draft is safe.`;
    publishMessage.className = "publish-message error";
  } finally {
    button.disabled = false;
  }
}

async function initialize() {
  try {
    const [response, storedAssets] = await Promise.all([
      fetch(`../data/program.json?v=${Date.now()}`),
      assetDb("getAll").catch(() => []),
    ]);
    if (!response.ok) throw new Error("The live program data could not be loaded.");
    liveProgram = normalizeProgram(await response.json());
    storedAssets.forEach((asset) => pendingAssets.set(asset.path, asset.dataUrl));
    const saved = localStorage.getItem(DRAFT_KEY);
    program = saved ? normalizeProgram(JSON.parse(saved)) : clone(liveProgram);
    saveState.textContent = saved ? "Local draft restored" : "Live program loaded";
    renderEditor();
    renderPreview();
  } catch (error) {
    editor.innerHTML = `<div class="editor-loading">${error.message}</div>`;
    saveState.textContent = "Could not load";
  }
}

document.querySelector("#open-publish").addEventListener("click", () => { fillPublishDialog(); publishDialog.showModal(); });
document.querySelector("#close-publish").addEventListener("click", () => publishDialog.close());
document.querySelector("#cancel-publish").addEventListener("click", () => publishDialog.close());
publishForm.addEventListener("submit", (event) => { event.preventDefault(); publish(); });

document.querySelector("#reload-live").addEventListener("click", async () => {
  if (!confirm("Discard the saved draft on this computer and reload the currently published program?")) return;
  localStorage.removeItem(DRAFT_KEY);
  pendingAssets.clear();
  await assetDb("clear").catch(() => {});
  program = clone(liveProgram);
  renderEditor(); renderPreview();
  saveState.textContent = "Live program restored";
});

document.querySelector("#download-backup").addEventListener("click", () => {
  const blob = new Blob([`${JSON.stringify(program, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `kennedy-program-${program.season}-backup.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

initialize();
