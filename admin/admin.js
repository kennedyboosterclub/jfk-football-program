import { layoutOptions, normalizeProgram, renderProgram, sponsorSlotCount } from "../program-renderer.js";

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

function setAt(path, value) {
  let cursor = program;
  path.slice(0, -1).forEach((key) => { cursor = cursor[key]; });
  cursor[path[path.length - 1]] = value;
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

async function compressImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That image could not be read."));
      img.src = sourceUrl;
    });
    const maximum = 2400;
    const ratio = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * ratio);
    canvas.height = Math.round(image.naturalHeight * ratio);
    const context = canvas.getContext("2d");
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.86);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function safeAssetName(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "image";
}

async function selectImage(file, path, label) {
  saveState.textContent = "Preparing image…";
  try {
    const dataUrl = await compressImage(file);
    const oldPath = getAt(path);
    const target = `assets/uploads/${safeAssetName(label)}-${Date.now()}.webp`;
    if (oldPath && pendingAssets.has(oldPath)) pendingAssets.delete(oldPath);
    pendingAssets.set(target, dataUrl);
    await assetDb("put", { path: target, dataUrl });
    setAt(path, target);
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

function imageControlForObject(label, object, key, path, rerender = true) {
  return imageField(label, [...path, key]);
}

function layoutLabel(value) {
  return layoutOptions.find(([key]) => key === value)?.[1] || value;
}

function normalizeSponsorSlots(page) {
  const count = sponsorSlotCount(page.layout);
  page.slots ||= [];
  while (page.slots.length < count) page.slots.push({ name: `Sponsor ${page.slots.length + 1}`, image: "", url: "" });
  page.slots = page.slots.slice(0, count);
}

function sponsorPageEditor(page, pageIndex, collectionName, removable) {
  normalizeSponsorSlots(page);
  const card = h("div", "subcard");
  const header = h("div", "subcard-header");
  header.append(h("strong", "", removable ? `Additional sponsor page ${pageIndex + 1}` : `Program page ${pageIndex + 2}`));
  if (page.lockedLayout) {
    header.append(h("span", "layout-chip", layoutLabel(page.layout)));
  } else {
    const select = h("select");
    layoutOptions.forEach(([value, label]) => {
      const option = h("option", "", label);
      option.value = value;
      option.selected = page.layout === value;
      select.append(option);
    });
    select.addEventListener("change", () => { page.layout = select.value; normalizeSponsorSlots(page); queueSave(); renderEditor(); });
    header.append(select);
  }
  if (removable) {
    const remove = h("button", "danger-button", "Remove page");
    remove.type = "button";
    remove.addEventListener("click", () => { program[collectionName].splice(pageIndex, 1); queueSave(); renderEditor(); });
    header.append(remove);
  }
  card.append(header);

  page.slots.forEach((slot, slotIndex) => {
    const slotEditor = h("div", "sponsor-slot-editor");
    slotEditor.append(imageField(`Sponsor image ${slotIndex + 1}`, [collectionName, pageIndex, "slots", slotIndex, "image"]));
    const fields = h("div", "field-grid two-columns");
    fields.append(
      textInput("Sponsor name", slot.name, (value) => { slot.name = value; }, `Sponsor ${slotIndex + 1}`),
      textInput("Website link (optional)", slot.url, (value) => { slot.url = value; }, "https://"),
    );
    slotEditor.append(fields);
    card.append(slotEditor);
  });
  return card;
}

function renderGameSection() {
  const wrap = section("game", "Game & cover", "Update the season, matchup, date, and cover photograph.", "Page 1");
  const fields = h("div", "field-grid two-columns");
  fields.append(
    inputField("Season", ["season"]),
    inputField("Game label", ["gameLabel"], "text", { placeholder: "Game Day Program" }),
    inputField("Opponent (optional)", ["opponent"], "text", { placeholder: "Jefferson" }),
    inputField("Game date (optional)", ["gameDate"], "text", { placeholder: "Friday, September 18" }),
  );
  wrap.append(fields, imageField("Team photograph", ["teamPhoto"]));
  return wrap;
}

function renderSponsorsSection() {
  const wrap = section("sponsors", "Sponsor pages", "These four layouts match pages 2–5 of the supplied program template.", "Pages 2–5");
  program.sponsorPages.forEach((page, index) => wrap.append(sponsorPageEditor(page, index, "sponsorPages", false)));
  return wrap;
}

function renderStaffSection() {
  const wrap = section("staff", "Staff & team groups", "Names can be separated by commas or placed on separate lines.", "Pages 6–7 and after roster");
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
    wrap.append(card);
  });
  return wrap;
}

function resizeRoster(size) {
  const target = Math.max(0, Math.min(150, Number.parseInt(size, 10) || 0));
  while (program.players.length < target) program.players.push({ firstName: "", lastName: "", grade: "", photo: "" });
  if (program.players.length > target) program.players.length = target;
  queueSave();
  renderEditor();
}

function renderRosterSection() {
  const wrap = section("roster", "Player roster", "The program automatically creates one roster page for every 15 players. The display number is the player's position in this list—not a jersey number.", "Dynamic pages beginning at page 8");
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
  const wrap = section("gallery", "Action shots", "Each action image receives its own full-page feature after the managers and cheerleaders page.", "Two pages by default");
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

function renderExtraSponsorsSection() {
  const wrap = section("extra-sponsors", "Extra sponsor pages", "Add as many pages as needed and choose the sponsor arrangement for each page.", "Final pages");
  const add = h("button", "button secondary", "Add sponsor page");
  add.type = "button";
  add.addEventListener("click", () => {
    program.extraSponsorPages.push({ id: `extra-${Date.now()}`, layout: "full", slots: [{ name: "Full-page sponsor", image: "", url: "" }] });
    queueSave(); renderEditor();
  });
  wrap.querySelector(".section-title-row").append(add);
  if (!program.extraSponsorPages.length) wrap.append(h("div", "empty-list", "No extra sponsor pages yet."));
  program.extraSponsorPages.forEach((page, index) => wrap.append(sponsorPageEditor(page, index, "extraSponsorPages", true)));
  return wrap;
}

function renderEditor() {
  const intro = h("p", "editor-intro");
  intro.innerHTML = "Changes are saved as a <strong>draft on this computer</strong>. Visitors will not see them until you select <strong>Publish to GitHub</strong>.";
  editor.replaceChildren(intro, renderGameSection(), renderSponsorsSection(), renderStaffSection(), renderRosterSection(), renderGallerySection(), renderExtraSponsorsSection());
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

function apiPath(owner, repo, path) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encoded}`;
}

async function githubRequest(url, options, allowed = []) {
  const response = await fetch(url, options);
  if (allowed.includes(response.status)) return response;
  if (!response.ok) {
    let detail = `GitHub returned ${response.status}`;
    try { detail = (await response.json()).message || detail; } catch {}
    throw new Error(detail);
  }
  return response;
}

async function publishFile(settings, token, path, content, message) {
  const url = apiPath(settings.owner, settings.repo, path);
  const existing = await githubRequest(`${url}?ref=${encodeURIComponent(settings.branch)}`, { headers: apiHeaders(token) }, [404]);
  let sha;
  if (existing.status !== 404) sha = (await existing.json()).sha;
  const body = { message, content, branch: settings.branch };
  if (sha) body.sha = sha;
  await githubRequest(url, { method: "PUT", headers: apiHeaders(token), body: JSON.stringify(body) });
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
  document.querySelector("#publish-summary").textContent = `${pendingAssets.size} new image${pendingAssets.size === 1 ? "" : "s"} and the program data file will be published. The public site normally updates within a few minutes.`;
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
  const files = [...pendingAssets.entries()].map(([path, dataUrl]) => ({ path, content: dataUrlBase64(dataUrl), message: `Add program image: ${path.split("/").pop()}` }));
  files.push({ path: "data/program.json", content: textBase64(`${JSON.stringify(program, null, 2)}\n`), message: `Update ${program.season} game-day program` });

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      publishMessage.textContent = `Publishing ${index + 1} of ${files.length}: ${file.path}`;
      bar.style.width = `${Math.round((index / files.length) * 100)}%`;
      await publishFile(settings, token, file.path, file.content, file.message);
    }
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
