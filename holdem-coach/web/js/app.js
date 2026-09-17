import { cardsHtml } from "./cards.js";
import { HAND_CATEGORIES } from "./hand-evaluator.js";
import { LESSONS } from "./lessons.js";
import { QUIZ_KINDS, makeQuiz } from "./quiz.js";
import { progress } from "./progress.js";

const main = document.getElementById("main");
const pageTitle = document.getElementById("page-title");
const tabs = [...document.querySelectorAll(".tab")];

const state = {
  route: "home",
  lessonId: null,
  quizKind: null,
  questions: [],
  index: 0,
  score: 0,
  selected: null,
  revealed: false,
  finished: false,
};

function setTitle(text) {
  pageTitle.textContent = text;
}

function setActiveTab(route) {
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.route === route);
  });
}

function go(route, opts = {}) {
  state.route = route;
  Object.assign(state, opts);
  render();
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    go(tab.dataset.route, {
      lessonId: null,
      quizKind: null,
      questions: [],
      finished: false,
    });
  });
});

function render() {
  if (state.route === "home") return renderHome();
  if (state.route === "learn") {
    return state.lessonId ? renderLesson(state.lessonId) : renderLearnList();
  }
  if (state.route === "practice") {
    return state.quizKind ? renderQuiz() : renderPracticeHub();
  }
  if (state.route === "progress") return renderProgress();
}

function renderHome() {
  setTitle("Home");
  setActiveTab("home");
  const done = progress.completedLessonIds().size;
  const best = progress.bestPercent();
  const next = LESSONS.find((l) => !progress.isLessonDone(l.id));
  main.innerHTML = `
    <p class="hero-title">Learn the game.<br>Test your edge.</p>
    <p class="hero-copy">Short lessons and drills for hand rankings, starting hands, pot odds, and street decisions — works on your phone.</p>
    <div class="stat-row">
      <div class="stat"><span class="label">Lessons</span><span class="value">${done}/${LESSONS.length}</span></div>
      <div class="stat"><span class="label">Streak</span><span class="value">${progress.streak()}d</span></div>
      <div class="stat"><span class="label">Best quiz</span><span class="value">${best ? best + "%" : "—"}</span></div>
    </div>
    <div class="cta-list">
      <button class="cta" type="button" data-go-learn>
        <span class="cta-badge">1</span>
        <span><strong>Continue learning</strong><span>${next ? next.title : "All lessons complete — review anytime"}</span></span>
      </button>
      <button class="cta" type="button" data-go-practice>
        <span class="cta-badge">2</span>
        <span><strong>Start a drill</strong><span>Identify hands, odds, and decisions</span></span>
      </button>
    </div>
  `;
  main.querySelector("[data-go-learn]").onclick = () => go("learn");
  main.querySelector("[data-go-practice]").onclick = () => go("practice");
}

function renderLearnList() {
  setTitle("Learn");
  setActiveTab("learn");
  main.innerHTML = `
    <div class="list">
      ${LESSONS.map(
        (lesson) => `
        <button class="card-item" type="button" data-lesson="${lesson.id}">
          <h2>${lesson.title}</h2>
          <p>${lesson.subtitle}</p>
          <div class="meta">${lesson.minutes} min${progress.isLessonDone(lesson.id) ? " · Completed" : ""}</div>
        </button>`
      ).join("")}
    </div>
  `;
  main.querySelectorAll("[data-lesson]").forEach((btn) => {
    btn.onclick = () => go("learn", { lessonId: btn.dataset.lesson });
  });
}

function renderLesson(id) {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) return renderLearnList();
  setTitle(lesson.title);
  setActiveTab("learn");
  const done = progress.isLessonDone(id);
  const ranks =
    id === "hand-rankings"
      ? `<div class="panel"><h3 style="margin:0 0 8px;font-family:var(--font-display);color:var(--gold)">Quick reference</h3>
        ${[...HAND_CATEGORIES].reverse().map((c) => `<div class="rank-row"><strong>${c.title}</strong><span>${c.blurb}</span></div>`).join("")}
      </div>`
      : "";
  main.innerHTML = `
    <button class="back" type="button" data-back>← All lessons</button>
    <p class="detail">${lesson.subtitle}</p>
    ${lesson.sections
      .map(
        (s) => `
      <section class="lesson-section">
        <h3>${s.heading}</h3>
        <p>${s.body}</p>
      </section>`
      )
      .join("")}
    ${ranks}
    <button class="btn" type="button" data-complete ${done ? "disabled" : ""}>
      ${done ? "Completed" : "Mark as completed"}
    </button>
  `;
  main.querySelector("[data-back]").onclick = () => go("learn", { lessonId: null });
  main.querySelector("[data-complete]").onclick = () => {
    progress.markLesson(id);
    renderLesson(id);
  };
}

function renderPracticeHub() {
  setTitle("Practice");
  setActiveTab("practice");
  main.innerHTML = `
    <p class="hero-copy">Drills generate fresh questions each run. Aim for speed and accuracy.</p>
    <div class="list">
      ${QUIZ_KINDS.map(
        (k) => `
        <button class="card-item" type="button" data-kind="${k.id}">
          <h2>${k.title}</h2>
          <p>${k.detail}</p>
        </button>`
      ).join("")}
    </div>
  `;
  main.querySelectorAll("[data-kind]").forEach((btn) => {
    btn.onclick = () =>
      go("practice", {
        quizKind: btn.dataset.kind,
        questions: makeQuiz(btn.dataset.kind),
        index: 0,
        score: 0,
        selected: null,
        revealed: false,
        finished: false,
      });
  });
}

function renderQuiz() {
  const kind = QUIZ_KINDS.find((k) => k.id === state.quizKind);
  setTitle(kind?.title || "Practice");
  setActiveTab("practice");

  if (state.finished) {
    const pct = state.score / state.questions.length;
    const note =
      pct >= 0.85
        ? "Sharp. You’re reading these spots well."
        : pct >= 0.6
          ? "Solid. Review the misses and run it again."
          : "Good reps. Revisit the matching lesson, then retry.";
    main.innerHTML = `
      <button class="back" type="button" data-back>← All drills</button>
      <div class="results">
        <p class="prompt">Session complete</p>
        <p class="score">${state.score} / ${state.questions.length}</p>
        <p class="detail">${note}</p>
        <button class="btn" type="button" data-retry>Try again</button>
      </div>
    `;
    main.querySelector("[data-back]").onclick = () =>
      go("practice", { quizKind: null, questions: [], finished: false });
    main.querySelector("[data-retry]").onclick = () =>
      go("practice", {
        quizKind: state.quizKind,
        questions: makeQuiz(state.quizKind),
        index: 0,
        score: 0,
        selected: null,
        revealed: false,
        finished: false,
      });
    return;
  }

  const q = state.questions[state.index];
  main.innerHTML = `
    <button class="back" type="button" data-back>← All drills</button>
    <p class="step">Question ${state.index + 1} of ${state.questions.length}</p>
    <p class="prompt">${q.prompt}</p>
    ${q.detail ? `<p class="detail">${q.detail}</p>` : ""}
    ${cardsHtml(q.cards)}
    <div class="choices">
      ${q.choices
        .map((choice, i) => {
          let cls = "choice";
          if (state.revealed) {
            if (i === q.correctIndex) cls += " correct";
            else if (i === state.selected) cls += " wrong";
            else cls += " dim";
          }
          return `<button class="${cls}" type="button" data-choice="${i}">${choice}</button>`;
        })
        .join("")}
    </div>
    ${
      state.revealed
        ? `<div class="explain">${q.explanation}</div>
           <button class="btn" type="button" data-next>${
             state.index + 1 >= state.questions.length ? "See results" : "Next"
           }</button>`
        : ""
    }
  `;

  main.querySelector("[data-back]").onclick = () =>
    go("practice", { quizKind: null, questions: [], finished: false });

  main.querySelectorAll("[data-choice]").forEach((btn) => {
    btn.onclick = () => {
      if (state.revealed) return;
      const i = Number(btn.dataset.choice);
      state.selected = i;
      state.revealed = true;
      if (i === q.correctIndex) state.score += 1;
      renderQuiz();
    };
  });

  const next = main.querySelector("[data-next]");
  if (next) {
    next.onclick = () => {
      if (state.index + 1 >= state.questions.length) {
        progress.recordQuiz(state.quizKind, state.score, state.questions.length);
        state.finished = true;
      } else {
        state.index += 1;
        state.selected = null;
        state.revealed = false;
      }
      renderQuiz();
    };
  }
}

function renderProgress() {
  setTitle("Progress");
  setActiveTab("progress");
  const history = progress.quizHistory();
  const kindTitle = (id) => QUIZ_KINDS.find((k) => k.id === id)?.title || id;
  main.innerHTML = `
    <div class="panel">
      <div class="history-row"><span>Lessons completed</span><strong>${progress.completedLessonIds().size} / ${LESSONS.length}</strong></div>
      <div class="history-row"><span>Day streak</span><strong>${progress.streak()}</strong></div>
      <div class="history-row"><span>Best quiz score</span><strong>${progress.bestPercent() ? progress.bestPercent() + "%" : "—"}</strong></div>
    </div>
    <h2 style="font-family:var(--font-display);font-size:1.2rem;margin:18px 0 8px">Recent drills</h2>
    <div class="panel">
      ${
        history.length
          ? history
              .slice(0, 12)
              .map((h) => {
                const day = new Date(h.date).toLocaleDateString();
                return `<div class="history-row"><span>${kindTitle(h.kindId)}<br><small style="color:var(--muted)">${day}</small></span><strong style="color:var(--gold)">${h.score}/${h.total}</strong></div>`;
              })
              .join("")
          : `<p class="empty">No drills yet — open Practice to start.</p>`
      }
    </div>
    <button class="btn danger" type="button" data-reset>Reset all progress</button>
  `;
  main.querySelector("[data-reset]").onclick = () => {
    if (confirm("Reset lessons, quiz history, and streak on this device?")) {
      progress.resetAll();
      renderProgress();
    }
  };
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

render();
