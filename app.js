'use strict';

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Returns "YYYY-MM-DD" for a local Date (avoids UTC off-by-one). */
function fmt(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses "YYYY-MM-DD" to a local midnight Date. */
function parse(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Returns "YYYY-MM-DD" n days after dateStr. */
function addDays(dateStr, n) {
  const d = parse(dateStr);
  d.setDate(d.getDate() + n);
  return fmt(d);
}

/** Returns the Monday of the week containing `date`, offset by `weekOffset` weeks. */
function mondayOf(date, weekOffset = 0) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun
  const toMonday = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + toMonday + weekOffset * 7);
  return fmt(d);
}

// ── Main app ──────────────────────────────────────────────────────────────────

class DailyThree {
  constructor() {
    this.data = this._load();
    this.weekOffset = 0;
    this._carryOver();
    this._bindNav();
    this.render();
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  _load() {
    try {
      const raw = localStorage.getItem('daily3-v1');
      return raw ? JSON.parse(raw) : { tasks: {} };
    } catch {
      return { tasks: {} };
    }
  }

  _save() {
    localStorage.setItem('daily3-v1', JSON.stringify(this.data));
  }

  // ── Carry-over ───────────────────────────────────────────────────────────────
  // On every load, incomplete tasks from past days are moved forward to the
  // earliest available day that has fewer than 3 tasks.

  _carryOver() {
    const today = fmt(new Date());
    const pastDates = Object.keys(this.data.tasks)
      .filter(d => d < today)
      .sort();

    let changed = false;

    for (const date of pastDates) {
      const allTasks = this.data.tasks[date] || [];
      const incomplete = allTasks.filter(t => !t.completed);
      if (incomplete.length === 0) continue;

      // Keep only completed tasks on the past day
      this.data.tasks[date] = allTasks.filter(t => t.completed);
      changed = true;

      for (const task of incomplete) {
        task.carriedOver = true;
        this._placeTask(task, today);
      }
    }

    if (changed) this._save();
  }

  /** Places a task on the earliest available day (>= startDate, max 3 tasks). */
  _placeTask(task, startDate) {
    let target = startDate;
    for (let i = 0; i < 365; i++) {
      if (!this.data.tasks[target]) this.data.tasks[target] = [];
      if (this.data.tasks[target].length < 3) {
        this.data.tasks[target].push(task);
        return;
      }
      target = addDays(target, 1);
    }
  }

  // ── Task operations ──────────────────────────────────────────────────────────

  addTask(date, text) {
    if (!this.data.tasks[date]) this.data.tasks[date] = [];
    if (this.data.tasks[date].length >= 3) return;

    this.data.tasks[date].push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: text.trim(),
      completed: false,
      originalDate: date,
      carriedOver: false,
    });
    this._save();
  }

  toggleTask(date, id) {
    const task = (this.data.tasks[date] || []).find(t => t.id === id);
    if (!task) return;
    task.completed = !task.completed;
    this._save();
  }

  deleteTask(date, id) {
    if (!this.data.tasks[date]) return;
    this.data.tasks[date] = this.data.tasks[date].filter(t => t.id !== id);
    this._save();
  }

  // ── Navigation ───────────────────────────────────────────────────────────────

  _bindNav() {
    document.getElementById('prev-week').onclick = () => { this.weekOffset--; this.render(); };
    document.getElementById('next-week').onclick = () => { this.weekOffset++; this.render(); };
    document.getElementById('today-btn').onclick  = () => { this.weekOffset = 0; this.render(); };
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  render() {
    const today = fmt(new Date());
    const weekStart = mondayOf(new Date(), this.weekOffset);

    // Week label
    const startDate = parse(weekStart);
    const endDate   = parse(addDays(weekStart, 6));
    const opts = { month: 'short', day: 'numeric' };
    document.getElementById('week-label').textContent =
      `${startDate.toLocaleDateString('en-US', opts)} – ${endDate.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;

    // Build days
    const grid = document.getElementById('week-grid');
    grid.innerHTML = '';

    let weekDone = 0, weekTotal = 0, weekCarried = 0;

    for (let i = 0; i < 7; i++) {
      const date   = addDays(weekStart, i);
      const tasks  = this.data.tasks[date] || [];
      const isPast = date < today;
      const isToday = date === today;

      weekTotal   += tasks.length;
      weekDone    += tasks.filter(t => t.completed).length;
      weekCarried += tasks.filter(t => t.carriedOver).length;

      grid.appendChild(this._renderDay(date, tasks, isToday, isPast));
    }

    // Stats bar
    const statsEl = document.getElementById('week-stats');
    if (weekTotal === 0) {
      statsEl.innerHTML = '<span class="stat-chip"><span class="dot dot-pending"></span>No tasks planned this week</span>';
    } else {
      const pct = Math.round((weekDone / weekTotal) * 100);
      statsEl.innerHTML = `
        <span class="stat-chip"><span class="dot dot-done"></span>${weekDone} of ${weekTotal} completed (${pct}%)</span>
        ${weekCarried > 0 ? `<span class="stat-chip"><span class="dot dot-carried"></span>${weekCarried} carried over</span>` : ''}
      `;
    }
  }

  _renderDay(date, tasks, isToday, isPast) {
    const d = parse(date);
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const done = tasks.filter(t => t.completed).length;
    const canAdd = !isPast && tasks.length < 3;

    const col = document.createElement('div');
    col.className = `day-col${isToday ? ' is-today' : ''}${isPast ? ' is-past' : ''}`;

    // Progress label
    let progressHtml = '';
    if (tasks.length > 0) {
      const allDone = done === tasks.length;
      progressHtml = `<span class="day-progress${allDone ? ' all-done' : ''}">
        ${allDone ? '✓ All done' : `${done}/${tasks.length}`}
      </span>`;
    }

    col.innerHTML = `
      <div class="day-head">
        <span class="day-name">${DAY_NAMES[d.getDay()]}</span>
        <span class="day-num">${dateLabel}</span>
        ${isToday ? '<span class="today-tag">Today</span>' : ''}
        ${progressHtml}
      </div>
      <div class="task-list" id="tl-${date}">
        ${tasks.length === 0
          ? '<span class="empty-msg">No tasks</span>'
          : tasks.map(t => this._taskHtml(date, t)).join('')}
      </div>
    `;

    // Empty slot placeholders for future/today (visual hint)
    if (!isPast) {
      const slotsLeft = 3 - tasks.length;
      const slotWrap = document.createElement('div');
      slotWrap.className = 'slot-placeholders';
      // slots shown as dashed outlines
      for (let s = 0; s < slotsLeft; s++) {
        const slot = document.createElement('div');
        slot.className = 'slot-empty';
        slotWrap.appendChild(slot);
      }
      col.appendChild(slotWrap);
    }

    // Add task button
    if (canAdd) {
      const addBtn = document.createElement('button');
      addBtn.className = 'add-btn';
      addBtn.dataset.date = date;
      addBtn.textContent = '+ Add task';
      addBtn.onclick = () => this._showInput(date, col);
      col.appendChild(addBtn);
    }

    // Bind task events
    col.querySelectorAll('.task-check').forEach(btn => {
      btn.onclick = () => { this.toggleTask(btn.dataset.date, btn.dataset.id); this.render(); };
    });

    col.querySelectorAll('.task-del').forEach(btn => {
      btn.onclick = () => { this.deleteTask(btn.dataset.date, btn.dataset.id); this.render(); };
    });

    return col;
  }

  _taskHtml(date, task) {
    const checkSvg = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,6 5,10 11,2"/></svg>`;
    const originalFmt = task.originalDate !== date
      ? parse(task.originalDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '';

    return `
      <div class="task${task.completed ? ' done' : ''}${task.carriedOver ? ' carried' : ''}">
        <button class="task-check" data-date="${date}" data-id="${task.id}" aria-label="Toggle complete">
          ${task.completed ? checkSvg : ''}
        </button>
        <span class="task-txt">${this._esc(task.text)}</span>
        ${task.carriedOver ? `<span class="carry-badge" title="Carried over from ${originalFmt || task.originalDate}">↩</span>` : ''}
        <button class="task-del" data-date="${date}" data-id="${task.id}" aria-label="Delete task">×</button>
      </div>
    `;
  }

  _showInput(date, col) {
    const addBtn = col.querySelector('.add-btn');
    if (!addBtn) return;

    const wrap = document.createElement('div');
    wrap.className = 'input-wrap';
    wrap.innerHTML = `
      <input class="task-input" type="text" placeholder="What needs to be done?" maxlength="80">
      <span class="input-hints">Enter to save · Esc to cancel</span>
    `;
    addBtn.replaceWith(wrap);

    const input = wrap.querySelector('input');
    input.focus();

    let submitted = false;

    const submit = () => {
      if (submitted) return;
      submitted = true;
      const text = input.value.trim();
      if (text) { this.addTask(date, text); }
      this.render();
    };

    input.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') this.render();
    };

    // Blur: submit after tiny delay so click on another element works.
    // The `submitted` guard prevents double-add when Enter already fired
    // (Enter → render() detaches the input → blur fires → second submit).
    input.onblur = () => setTimeout(submit, 180);
  }

  // ── Utility ──────────────────────────────────────────────────────────────────

  _esc(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// Boot
document.addEventListener('DOMContentLoaded', () => new DailyThree());
