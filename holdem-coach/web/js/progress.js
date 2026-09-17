const LESSONS_KEY = "hc.web.completedLessons";
const HISTORY_KEY = "hc.web.quizHistory";
const STREAK_KEY = "hc.web.streak";
const LAST_PLAY_KEY = "hc.web.lastPlayDay";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export const progress = {
  completedLessonIds() {
    return new Set(loadJSON(LESSONS_KEY, []));
  },

  quizHistory() {
    return loadJSON(HISTORY_KEY, []);
  },

  streak() {
    return Number(localStorage.getItem(STREAK_KEY) || 0);
  },

  isLessonDone(id) {
    return this.completedLessonIds().has(id);
  },

  markLesson(id) {
    const set = this.completedLessonIds();
    set.add(id);
    localStorage.setItem(LESSONS_KEY, JSON.stringify([...set]));
    this.touchStreak();
  },

  recordQuiz(kindId, score, total) {
    const history = this.quizHistory();
    history.unshift({
      id: crypto.randomUUID(),
      kindId,
      score,
      total,
      percent: Math.round((score / total) * 100),
      date: new Date().toISOString(),
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
    this.touchStreak();
  },

  bestPercent() {
    const scores = this.quizHistory().map((h) => h.percent);
    return scores.length ? Math.max(...scores) : 0;
  },

  resetAll() {
    localStorage.removeItem(LESSONS_KEY);
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(STREAK_KEY);
    localStorage.removeItem(LAST_PLAY_KEY);
  },

  touchStreak() {
    const today = todayKey();
    const last = localStorage.getItem(LAST_PLAY_KEY);
    let streak = this.streak();
    if (!last) {
      streak = 1;
    } else if (last === today) {
      if (streak === 0) streak = 1;
    } else {
      const lastDate = new Date(`${last}T00:00:00`);
      const todayDate = new Date(`${today}T00:00:00`);
      const gap = Math.round((todayDate - lastDate) / 86400000);
      streak = gap === 1 ? streak + 1 : 1;
    }
    localStorage.setItem(LAST_PLAY_KEY, today);
    localStorage.setItem(STREAK_KEY, String(streak));
  },
};
