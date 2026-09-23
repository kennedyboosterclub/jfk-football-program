import { renderProgram } from "./program-renderer.js?v=20260923-sponsor-thanks1";

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

const feedbackDialog = document.querySelector("#feedback-dialog");
const feedbackForm = document.querySelector("#feedback-form");
const feedbackStatus = document.querySelector("#feedback-status");
const feedbackSubmit = document.querySelector("#submit-feedback");

function openFeedback() {
  feedbackStatus.textContent = "";
  feedbackStatus.className = "feedback-status";
  document.querySelector("#feedback-page").value = window.location.href;
  feedbackDialog.showModal();
}

function closeFeedback() {
  if (feedbackDialog.open) feedbackDialog.close();
}

document.querySelector("#open-feedback").addEventListener("click", openFeedback);
document.querySelector("#close-feedback").addEventListener("click", closeFeedback);
document.querySelector("#cancel-feedback").addEventListener("click", closeFeedback);

feedbackDialog.addEventListener("click", (event) => {
  if (event.target === feedbackDialog) closeFeedback();
});

feedbackForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  feedbackSubmit.disabled = true;
  feedbackSubmit.textContent = "Sending…";
  feedbackStatus.textContent = "";
  feedbackStatus.className = "feedback-status";

  const category = document.querySelector("#feedback-category").value;
  document.querySelector("#feedback-subject").value = `JFK Booster feedback: ${category}`;

  try {
    const response = await fetch(feedbackForm.action, {
      method: "POST",
      body: new FormData(feedbackForm),
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      const message = result.errors?.map((item) => item.message).join(" ");
      throw new Error(message || "Your feedback could not be sent.");
    }

    feedbackForm.reset();
    feedbackStatus.textContent = "Thank you! Your feedback has been sent.";
    feedbackStatus.className = "feedback-status is-success";
    feedbackSubmit.textContent = "Sent";
    window.setTimeout(closeFeedback, 1800);
  } catch (error) {
    feedbackStatus.textContent = `${error.message} Please try again.`;
    feedbackStatus.className = "feedback-status is-error";
    feedbackSubmit.disabled = false;
    feedbackSubmit.textContent = "Send feedback";
    return;
  }

  window.setTimeout(() => {
    feedbackSubmit.disabled = false;
    feedbackSubmit.textContent = "Send feedback";
  }, 2000);
});

loadProgram();
