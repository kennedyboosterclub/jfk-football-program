import { renderProgram } from "./program-renderer.js";

const container = document.querySelector("#program");
const pageCount = document.querySelector("#page-count");
const status = document.querySelector("#load-status");

async function loadProgram() {
  try {
    const response = await fetch(`./data/program.json?v=${Date.now()}`);
    if (!response.ok) throw new Error(`Program data returned ${response.status}`);
    const data = await response.json();
    const count = renderProgram(data, container, { assetBase: "./" });
    pageCount.textContent = `${count} pages`;
    status.textContent = `${data.season} program`;
    document.title = `${data.programTitle} | ${data.gameLabel}`;
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="load-error"><strong>The program could not be loaded.</strong><span>Please refresh the page in a moment.</span></div>`;
    status.textContent = "Unable to load";
  }
}

document.querySelector("#print-program").addEventListener("click", () => window.print());
loadProgram();
