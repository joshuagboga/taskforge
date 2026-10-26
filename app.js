/**
 * TaskForge — Task Management Dashboard
 * Plain JavaScript + DOM APIs, no frameworks or libraries.
 *
 * Sections
 *  1. Constants
 *  2. Application state & DOM references
 *  3. Utilities (dates, strings, debounce)
 *  4. Persistence (localStorage)
 *  5. Sample data
 *  6. Task queries (filter, search, sort)
 *  7. Rendering
 *  8. Task actions (create, update, toggle, delete, undo, reorder)
 *  9. Selection & bulk actions
 * 10. Modals (generic manager, form, details, confirm)
 * 11. Toast notifications
 * 12. Theme
 * 13. Import / export
 * 14. Event listeners
 * 15. Initialisation
 */
'use strict';

/* =========================================================
   1. Constants
   ========================================================= */
const STORAGE_KEYS = Object.freeze({
  tasks: 'taskforge:tasks',
  theme: 'taskforge:theme',
});

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;
const UNDO_WINDOW_MS = 7000;
const MAX_TOASTS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

const PRIORITY_RANK = Object.freeze({ low: 1, medium: 2, high: 3, critical: 4 });
const PRIORITIES = Object.keys(PRIORITY_RANK);

const CATEGORY_LABELS = Object.freeze({
  work: 'Work',
  personal: 'Personal',
  school: 'School',
  backend: 'Backend',
  frontend: 'Frontend',
  fintech: 'Fintech',
  other: 'Other',
});
const CATEGORIES = Object.keys(CATEGORY_LABELS);

const STATUS_LABELS = Object.freeze({ completed: 'Completed', pending: 'Pending', overdue: 'Overdue' });

/*
 * Tailwind class strings for markup built in JavaScript.
 * They are written out in full (never concatenated, e.g. `bg-${color}`) so the Tailwind CLI
 * can find them when it scans this file and include them in style.css.
 */
const PRIORITY_BADGE_CLASSES = Object.freeze({
  low: 'bg-p-low/12 text-p-low',
  medium: 'bg-p-medium/12 text-p-medium',
  high: 'bg-p-high/12 text-p-high',
  critical: 'bg-p-critical/12 font-bold text-p-critical',
});
const STATUS_BADGE_CLASSES = Object.freeze({
  pending: 'bg-warning/12 text-warning',
  completed: 'bg-success/12 text-success',
  overdue: 'bg-danger/12 text-danger',
});
const TOAST_TYPE_CLASSES = Object.freeze({
  info: 'border-l-brand',
  success: 'border-l-green-500',
  error: 'border-l-red-500',
});
const UI_CLASSES = Object.freeze({
  mark: 'rounded-sm bg-amber-200 px-px text-inherit dark:bg-amber-400/35',
  messageIcon: 'mb-3.5 inline-grid size-14 place-items-center rounded-2xl bg-brand/12 text-brand',
  messageTitle: 'mb-1 text-lg font-bold',
  messageText: 'mx-auto mb-[18px] max-w-[420px] text-muted',
  messageActions: 'flex flex-wrap justify-center gap-2',
  pageButton: 'h-[34px] min-w-9 rounded-md px-2.5 text-[13.5px] font-semibold text-muted enabled:hover:bg-surface-2 enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 aria-[current=page]:bg-brand! aria-[current=page]:text-on-brand!',
  pageEllipsis: 'grid min-w-6 place-items-center text-faint',
  toast: 'pointer-events-auto flex animate-toast-in items-center gap-2.5 rounded-[10px] border-l-4 bg-[#1c1f2b] py-2.5 pr-2.5 pl-3.5 text-sm text-[#f4f5f9] shadow-2xl dark:bg-[#262a38] dark:ring-1 dark:ring-line-strong [&.is-leaving]:animate-toast-out',
  toastMessage: 'flex-1 wrap-anywhere',
  toastAction: 'rounded-md bg-indigo-300/12 px-2.5 py-1.5 text-[13px] font-bold text-indigo-300 hover:bg-indigo-300/25',
  toastClose: 'grid size-7 shrink-0 place-items-center rounded-md text-[#9aa1b2] hover:bg-white/10 hover:text-white',
});

/** Add a space-separated list of classes with classList.add(). */
function addClasses(element, classes) {
  element.classList.add(...classes.split(' '));
}

const DEFAULT_FILTERS = Object.freeze({ search: '', status: 'all', priority: 'all', category: 'all' });
const DEFAULT_SORT = 'manual';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/* =========================================================
   2. Application state & DOM references
   ========================================================= */
const state = {
  tasks: [],                     // the single source of truth; array order = custom (drag & drop) order
  filters: { ...DEFAULT_FILTERS },
  sort: DEFAULT_SORT,
  page: 1,
  selected: new Set(),           // ids of checked tasks
  editingId: null,               // id of the task loaded in the form (null = creating)
  formSnapshot: '',              // serialised form values when the form opened (unsaved-change detection)
  detailsId: null,               // id of the task shown in the details modal
  undoStack: [],                 // recently deleted batches: [{ items: [{ task, index }], toast }]
  confirmResolver: null,         // resolves the promise returned by confirmDialog()
  draggedCard: null,
  dropCommitted: false,
  today: '',
};

/** Stack of open modals — the last entry is the top-most one (ESC closes it). */
const modalStack = [];

const els = {
  searchInput: document.getElementById('search-input'),
  addTaskBtn: document.getElementById('add-task-btn'),
  themeToggle: document.getElementById('theme-toggle'),
  importBtn: document.getElementById('import-btn'),
  importInput: document.getElementById('import-input'),
  exportBtn: document.getElementById('export-btn'),
  todayLabel: document.getElementById('today-label'),

  stats: document.querySelector('.stats'),
  statTotal: document.getElementById('stat-total'),
  statCompleted: document.getElementById('stat-completed'),
  statPending: document.getElementById('stat-pending'),
  statOverdue: document.getElementById('stat-overdue'),
  statTotalHint: document.getElementById('stat-total-hint'),
  statCompletedHint: document.getElementById('stat-completed-hint'),
  statPendingHint: document.getElementById('stat-pending-hint'),
  statOverdueHint: document.getElementById('stat-overdue-hint'),
  statProgressBar: document.getElementById('stat-progress-bar'),

  statusFilters: document.getElementById('status-filters'),
  priorityFilter: document.getElementById('priority-filter'),
  categoryFilter: document.getElementById('category-filter'),
  sortSelect: document.getElementById('sort-select'),
  resetFiltersBtn: document.getElementById('reset-filters'),

  bulkBar: document.getElementById('bulk-bar'),
  selectAll: document.getElementById('select-all'),
  selectedCount: document.getElementById('selected-count'),
  bulkActions: document.getElementById('bulk-actions'),
  resultsSummary: document.getElementById('results-summary'),

  taskList: document.getElementById('task-list'),
  listMessage: document.getElementById('list-message'),
  pagination: document.getElementById('pagination'),
  taskTemplate: document.getElementById('task-template'),

  formModal: document.getElementById('form-modal'),
  taskForm: document.getElementById('task-form'),
  formModalTitle: document.getElementById('form-modal-title'),
  formSubmitBtn: document.getElementById('form-submit'),
  fields: {
    title: document.getElementById('task-title'),
    description: document.getElementById('task-description'),
    category: document.getElementById('task-category'),
    priority: document.getElementById('task-priority'),
    dueDate: document.getElementById('task-due'),
  },

  detailsModal: document.getElementById('details-modal'),
  detailsTitle: document.getElementById('details-title'),
  detailsBody: document.getElementById('details-body'),
  detailsToggleBtn: document.getElementById('details-toggle'),

  confirmModal: document.getElementById('confirm-modal'),
  confirmTitle: document.getElementById('confirm-title'),
  confirmMessage: document.getElementById('confirm-message'),
  confirmOkBtn: document.getElementById('confirm-ok'),
  confirmCancelBtn: document.getElementById('confirm-cancel'),

  toastContainer: document.getElementById('toast-container'),
};

/* =========================================================
   3. Utilities
   ========================================================= */
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape user content before it is placed inside an HTML string (innerHTML / insertAdjacentHTML). */
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function pluralize(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function debounce(fn, delay) {
  let timerId;
  return (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), delay);
  };
}

/** Format a Date as a local "YYYY-MM-DD" string (the format used by <input type="date">). */
function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parse "YYYY-MM-DD" as a *local* date (new Date('2026-01-05') would be UTC midnight). */
function parseISODate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isValidISODate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && toISODate(parseISODate(value)) === value;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isoDateFromToday(offsetDays) {
  const date = startOfToday();
  date.setDate(date.getDate() + offsetDays);
  return toISODate(date);
}

function daysUntilDue(task) {
  return Math.round((parseISODate(task.dueDate) - startOfToday()) / DAY_MS);
}

/** A task is overdue when its due date has passed and it has not been completed. */
function isOverdue(task) {
  return !task.completed && daysUntilDue(task) < 0;
}

function getStatus(task) {
  if (task.completed) return 'completed';
  return isOverdue(task) ? 'overdue' : 'pending';
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const longDateFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function formatDueDate(task) {
  return dateFormatter.format(parseISODate(task.dueDate));
}

function describeDue(task) {
  const days = daysUntilDue(task);
  if (task.completed) return `Due ${formatDueDate(task)}`;
  if (days < 0) return `Overdue by ${pluralize(-days, 'day')}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 7) return `Due in ${days} days`;
  return `Due ${formatDueDate(task)}`;
}

function describeCreated(isoString) {
  const diffMs = new Date(isoString).getTime() - Date.now();
  const minutes = Math.round(diffMs / 60000);
  if (Math.abs(minutes) < 1) return 'just now';
  if (Math.abs(minutes) < 60) return relativeFormatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeFormatter.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return relativeFormatter.format(days, 'day');
  return dateFormatter.format(new Date(isoString));
}

/** Is the user currently typing into a field? (Keyboard shortcuts are ignored then.) */
function isTypingTarget(element) {
  if (!element) return false;
  if (element.isContentEditable) return true;
  if (element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') return true;
  if (element.tagName === 'INPUT') return !['checkbox', 'radio', 'button', 'submit'].includes(element.type);
  return false;
}

function findTask(id) {
  return state.tasks.find((task) => task.id === id) || null;
}

/** Find the rendered card for a task id (CSS.escape keeps ids with special characters safe). */
function findCard(id) {
  return els.taskList.querySelector(`.task-card[data-id="${CSS.escape(id)}"]`);
}

/* =========================================================
   4. Persistence (localStorage)
   ========================================================= */

/**
 * Coerce any stored or imported object into a valid task, or return null if it cannot be used.
 * This protects the app from hand-edited storage and malformed import files.
 */
function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title ?? '').trim().slice(0, 100);
  if (!title) return null;

  const category = String(raw.category ?? '').toLowerCase();
  const priority = String(raw.priority ?? '').toLowerCase();
  const createdAt = Number.isNaN(Date.parse(raw.createdAt)) ? new Date().toISOString() : new Date(raw.createdAt).toISOString();

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : createId(),
    title,
    description: String(raw.description ?? '').trim().slice(0, 500),
    category: CATEGORIES.includes(category) ? category : 'other',
    priority: PRIORITIES.includes(priority) ? priority : 'medium',
    dueDate: isValidISODate(raw.dueDate) ? raw.dueDate : toISODate(startOfToday()),
    completed: Boolean(raw.completed),
    createdAt,
    updatedAt: Number.isNaN(Date.parse(raw.updatedAt)) ? createdAt : new Date(raw.updatedAt).toISOString(),
  };
}

/** Returns the saved tasks, or null when nothing has ever been saved (= first visit). */
function loadTasks() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEYS.tasks);
  } catch (error) {
    console.warn('TaskForge: localStorage is not available.', error);
    return null;
  }
  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed.map(normalizeTask).filter((task) => {
      if (!task || seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    });
  } catch (error) {
    console.warn('TaskForge: saved tasks were corrupted and have been ignored.', error);
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(state.tasks));
  } catch (error) {
    console.error('TaskForge: could not save tasks.', error);
    showToast('Could not save your tasks — browser storage may be full or disabled.', { type: 'error' });
  }
}

/* =========================================================
   5. Sample data (first visit only)
   ========================================================= */
function createSampleTasks() {
  const now = Date.now();
  const hoursAgo = (hours) => new Date(now - hours * 60 * 60 * 1000).toISOString();

  // [title, description, category, priority, due (days from today), completed, created (hours ago)]
  const samples = [
    ['Integrate payment gateway webhooks', 'Handle charge.succeeded and refund events, verify signatures and make every handler idempotent.', 'fintech', 'critical', 2, false, 3],
    ['Fix login redirect loop', 'Users with an expired session get bounced between /login and /dashboard. Reproduce, then patch the auth guard.', 'backend', 'critical', -1, false, 9],
    ['Build responsive navigation bar', 'Collapse the header links into a menu below 720px and keep keyboard navigation working.', 'frontend', 'high', 4, true, 20],
    ['Prepare quarterly report slides', 'Summarise Q3 revenue, churn and roadmap progress into ten slides for Monday’s leadership meeting.', 'work', 'high', 1, false, 28],
    ['Renew gym membership', 'Membership lapses this week — renew online and ask about the student discount.', 'personal', 'low', -3, false, 50],
    ['Study for database systems exam', 'Review normalisation, indexing and transaction isolation levels. Do two past papers.', 'school', 'high', 6, false, 70],
    ['Write unit tests for auth service', 'Cover token refresh, password reset and rate limiting. Aim for 90% branch coverage.', 'backend', 'medium', 9, false, 96],
    ['Reconcile ledger discrepancies', 'Match the September bank statement against internal ledger entries and flag mismatches.', 'fintech', 'high', -2, true, 120],
    ['Plan weekend trip to the coast', 'Book accommodation, check the weather forecast and make a packing list.', 'personal', 'medium', 14, false, 140],
    ['Refactor CSS to use custom properties', 'Replace hard-coded colours with design tokens so dark mode can be themed in one place.', 'frontend', 'low', 20, false, 160],
    ['Submit research essay draft', 'Upload the 2,000-word draft on distributed consensus to the course portal before midnight.', 'school', 'critical', 0, false, 190],
    ['Write team retrospective notes', 'Capture what went well, what didn’t and the action items from the sprint retro.', 'work', 'low', -5, true, 220],
    ['Back up laptop to external drive', 'Run a full Time Machine / File History backup and verify that the restore works.', 'other', 'medium', 3, false, 260],
    ['Optimise slow database queries', 'Add composite indexes for the transactions report and check the query plans with EXPLAIN.', 'backend', 'high', -4, false, 300],
  ];

  return samples.map(([title, description, category, priority, dueOffset, completed, createdHoursAgo]) => {
    const createdAt = hoursAgo(createdHoursAgo);
    return {
      id: createId(),
      title,
      description,
      category,
      priority,
      dueDate: isoDateFromToday(dueOffset),
      completed,
      createdAt,
      updatedAt: createdAt,
    };
  });
}

/* =========================================================
   6. Task queries — search, filters and sorting all work together
   ========================================================= */
function matchesStatus(task, status) {
  switch (status) {
    case 'completed': return task.completed;
    case 'pending': return !task.completed;
    case 'overdue': return isOverdue(task);
    default: return true;
  }
}

function matchesSearch(task, query) {
  if (!query) return true;
  const haystack = `${task.title} ${task.description} ${CATEGORY_LABELS[task.category]}`.toLowerCase();
  return haystack.includes(query);
}

function compareDueDate(a, b) {
  return a.dueDate.localeCompare(b.dueDate);
}

const SORTERS = {
  manual: null, // keep array order (set by drag & drop)
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  'title-asc': (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
  'title-desc': (a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: 'base', numeric: true }),
  'priority-desc': (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || compareDueDate(a, b),
  'priority-asc': (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || compareDueDate(a, b),
  'due-asc': (a, b) => compareDueDate(a, b) || PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
  'due-desc': (a, b) => compareDueDate(b, a) || PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
};

function taskMatchesFilters(task) {
  const { search, status, priority, category } = state.filters;
  return matchesStatus(task, status)
    && (priority === 'all' || task.priority === priority)
    && (category === 'all' || task.category === category)
    && matchesSearch(task, search.toLowerCase());
}

/** Every task that passes the search + all filters, in the selected sort order. */
function getVisibleTasks() {
  const visible = state.tasks.filter(taskMatchesFilters);
  const sorter = SORTERS[state.sort];
  return sorter ? visible.sort(sorter) : visible;
}

function hasActiveFilters() {
  return Object.keys(DEFAULT_FILTERS).some((key) => state.filters[key] !== DEFAULT_FILTERS[key]);
}

/* =========================================================
   7. Rendering
   ========================================================= */
function render() {
  renderStats();
  renderTasks();
  updateSelectionUI();
}

function setStatValue(element, value) {
  const text = String(value);
  if (element.textContent === text) return;
  element.textContent = text;
  // Restart the "bump" animation: remove the class, force a reflow, add it back.
  element.classList.remove('bump');
  void element.offsetWidth;
  element.classList.add('bump');
}

function renderStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => task.completed).length;
  const overdue = state.tasks.filter(isOverdue).length;
  const pending = total - completed;
  const dueToday = state.tasks.filter((task) => !task.completed && daysUntilDue(task) === 0).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  setStatValue(els.statTotal, total);
  setStatValue(els.statCompleted, completed);
  setStatValue(els.statPending, pending);
  setStatValue(els.statOverdue, overdue);

  els.statTotalHint.textContent = total ? `${pluralize(state.tasks.filter((t) => t.priority === 'critical' && !t.completed).length, 'critical task')} open` : 'No tasks yet';
  els.statCompletedHint.textContent = `${percent}% complete`;
  els.statPendingHint.textContent = dueToday ? `${dueToday} due today` : 'Nothing due today';
  els.statOverdueHint.textContent = overdue ? 'Needs attention' : 'All on track';
  els.statProgressBar.style.width = `${percent}%`;
  els.statOverdue.parentElement.classList.toggle('has-overdue', overdue > 0);
}

/** Add / remove / toggle the state classes that drive the card's appearance. */
function applyTaskClasses(card, task) {
  const overdue = isOverdue(task);
  card.classList.toggle('task--completed', task.completed);
  card.classList.toggle('task--pending', !task.completed);
  card.classList.toggle('task--overdue', overdue);
  PRIORITIES.forEach((priority) => card.classList.toggle(`priority--${priority}`, task.priority === priority));
  card.classList.toggle('is-selected', state.selected.has(task.id));
}

/** Write text into an element, wrapping search matches in <mark> (built with DOM nodes, never HTML strings). */
function setHighlightedText(element, text, query) {
  element.textContent = '';
  if (!query) {
    element.textContent = text;
    return;
  }
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerQuery);
  while (matchIndex !== -1) {
    if (matchIndex > cursor) element.append(text.slice(cursor, matchIndex));
    const mark = document.createElement('mark');
    mark.className = UI_CLASSES.mark;
    mark.textContent = text.slice(matchIndex, matchIndex + query.length);
    element.appendChild(mark);
    cursor = matchIndex + query.length;
    matchIndex = lowerText.indexOf(lowerQuery, cursor);
  }
  if (cursor < text.length) element.append(text.slice(cursor));
}

/** Build one task card by cloning the <template> and filling it in. */
function createTaskCard(task) {
  const card = els.taskTemplate.content.firstElementChild.cloneNode(true);
  const status = getStatus(task);
  const query = state.filters.search;

  // data-* attributes link the DOM element back to the task object
  card.dataset.id = task.id;
  card.dataset.status = status;
  card.dataset.priority = task.priority;
  card.dataset.category = task.category;
  card.setAttribute('aria-label', `${task.title}, ${STATUS_LABELS[status]}, ${task.priority} priority`);
  applyTaskClasses(card, task);

  setHighlightedText(card.querySelector('.task-title'), task.title, query);
  setHighlightedText(card.querySelector('.task-desc'), task.description, query);

  const statusBadge = card.querySelector('.status-badge');
  statusBadge.textContent = STATUS_LABELS[status];
  addClasses(statusBadge, STATUS_BADGE_CLASSES[status]);

  setHighlightedText(card.querySelector('.category-badge'), CATEGORY_LABELS[task.category], query);

  const priorityBadge = card.querySelector('.priority-badge');
  priorityBadge.textContent = capitalize(task.priority);
  addClasses(priorityBadge, PRIORITY_BADGE_CLASSES[task.priority]);

  const dueTime = card.querySelector('.due-date time');
  dueTime.textContent = describeDue(task);
  dueTime.setAttribute('datetime', task.dueDate);
  dueTime.parentElement.setAttribute('title', `Due ${formatDueDate(task)}`);

  const createdTime = card.querySelector('.created-date time');
  createdTime.textContent = `Created ${describeCreated(task.createdAt)}`;
  createdTime.setAttribute('datetime', task.createdAt);
  createdTime.parentElement.setAttribute('title', `Created ${dateTimeFormatter.format(new Date(task.createdAt))}`);

  const checkbox = card.querySelector('.task-checkbox');
  checkbox.checked = state.selected.has(task.id);
  checkbox.setAttribute('aria-label', `Select “${task.title}”`);

  const toggleBtn = card.querySelector('[data-action="toggle"]');
  toggleBtn.querySelector('.btn-complete-label').textContent = task.completed ? 'Mark pending' : 'Complete';
  toggleBtn.querySelector('use').setAttribute('href', task.completed ? '#i-reopen' : '#i-check');
  toggleBtn.setAttribute('aria-pressed', String(task.completed));
  toggleBtn.setAttribute('aria-label', task.completed ? `Mark “${task.title}” as pending` : `Mark “${task.title}” as completed`);

  card.querySelector('[data-action="edit"]').setAttribute('aria-label', `Edit “${task.title}”`);
  card.querySelector('[data-action="delete"]').setAttribute('aria-label', `Delete “${task.title}”`);

  return card;
}

function renderTasks() {
  const visible = getVisibleTasks();
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), totalPages);

  const start = (state.page - 1) * PAGE_SIZE;
  const pageTasks = visible.slice(start, start + PAGE_SIZE);

  // Clear the current list node by node…
  while (els.taskList.firstElementChild) {
    els.taskList.removeChild(els.taskList.firstElementChild);
  }

  // …then build the new cards off-DOM in a fragment and insert them in a single operation.
  const fragment = document.createDocumentFragment();
  pageTasks.forEach((task) => fragment.appendChild(createTaskCard(task)));
  els.taskList.appendChild(fragment);

  els.taskList.classList.toggle('is-sortable', state.sort === 'manual');

  renderListMessage(visible.length);
  renderPagination(totalPages);
  renderResultsSummary(visible.length, start, pageTasks.length);
}

function renderResultsSummary(visibleCount, start, pageCount) {
  if (!visibleCount) {
    els.resultsSummary.textContent = '';
    return;
  }
  const suffix = visibleCount === state.tasks.length ? '' : ` (filtered from ${state.tasks.length})`;
  els.resultsSummary.textContent = `Showing ${start + 1}–${start + pageCount} of ${pluralize(visibleCount, 'task')}${suffix}`;
}

/** Empty state (no tasks at all) or "No tasks found" (filters/search exclude everything). */
function renderListMessage(visibleCount) {
  const box = els.listMessage;
  box.innerHTML = '';

  if (state.tasks.length === 0) {
    // Built with createElement / append to show the node-by-node approach.
    const icon = document.createElement('div');
    icon.className = UI_CLASSES.messageIcon;
    icon.innerHTML = '<svg class="size-[26px]" aria-hidden="true"><use href="#i-inbox"/></svg>';

    const heading = document.createElement('h3');
    heading.className = UI_CLASSES.messageTitle;
    heading.textContent = 'No tasks yet';

    const text = document.createElement('p');
    text.className = UI_CLASSES.messageText;
    text.textContent = 'Your dashboard is empty. Create your first task to get started, or load a set of sample tasks to explore TaskForge.';

    const actions = document.createElement('div');
    actions.className = UI_CLASSES.messageActions;

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-primary';
    addBtn.dataset.messageAction = 'add';
    addBtn.textContent = 'Create a task';

    const sampleBtn = document.createElement('button');
    sampleBtn.type = 'button';
    sampleBtn.className = 'btn btn-soft';
    sampleBtn.dataset.messageAction = 'samples';
    sampleBtn.textContent = 'Load sample tasks';

    actions.append(addBtn, sampleBtn);
    box.append(icon, heading, text, actions);
    box.removeAttribute('hidden');
    return;
  }

  if (visibleCount === 0) {
    const { search } = state.filters;
    const detail = search
      ? `No tasks match “${escapeHTML(search)}” with the current filters.`
      : 'No tasks match the current filters.';
    // Built from an HTML string; user input is escaped first.
    box.insertAdjacentHTML('beforeend', `
      <div class="${UI_CLASSES.messageIcon}"><svg class="size-[26px]" aria-hidden="true"><use href="#i-search"/></svg></div>
      <h3 class="${UI_CLASSES.messageTitle}">No tasks found</h3>
      <p class="${UI_CLASSES.messageText}">${detail} Try a different search term or clear the filters.</p>
      <div class="${UI_CLASSES.messageActions}">
        <button type="button" class="btn btn-soft" data-message-action="reset">Clear search &amp; filters</button>
      </div>`);
    box.removeAttribute('hidden');
    return;
  }

  box.setAttribute('hidden', '');
}

function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);
  if (from > 2) pages.push('…');
  for (let page = from; page <= to; page += 1) pages.push(page);
  if (to < total - 1) pages.push('…');
  pages.push(total);
  return pages;
}

function renderPagination(totalPages) {
  els.pagination.innerHTML = '';
  if (totalPages <= 1) {
    els.pagination.setAttribute('hidden', '');
    return;
  }
  els.pagination.removeAttribute('hidden');

  const current = state.page;
  const buttons = getPageNumbers(current, totalPages).map((page) => {
    if (page === '…') return `<span class="${UI_CLASSES.pageEllipsis}" aria-hidden="true">…</span>`;
    const active = page === current;
    return `<button type="button" class="${UI_CLASSES.pageButton}" data-page="${page}"
      aria-label="Page ${page}"${active ? ' aria-current="page"' : ''}>${page}</button>`;
  });

  els.pagination.insertAdjacentHTML('beforeend', `
    <button type="button" class="${UI_CLASSES.pageButton}" data-page="${current - 1}" ${current === 1 ? 'disabled' : ''} aria-label="Previous page">‹ Prev</button>
    ${buttons.join('')}
    <button type="button" class="${UI_CLASSES.pageButton}" data-page="${current + 1}" ${current === totalPages ? 'disabled' : ''} aria-label="Next page">Next ›</button>`);
}

/** Keep every filter control in sync with state (needed after "Reset" or a stat-card click). */
function syncFilterControls() {
  const { status, priority, category, search } = state.filters;

  els.statusFilters.querySelectorAll('[data-status]').forEach((button) => {
    const active = button.dataset.status === status;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  Array.from(els.stats.children).forEach((card) => {
    card.classList.toggle('is-active', status !== 'all' && card.dataset.status === status);
  });

  els.priorityFilter.value = priority;
  els.categoryFilter.value = category;
  els.sortSelect.value = state.sort;
  els.priorityFilter.parentElement.classList.toggle('is-filtered', priority !== 'all');
  els.categoryFilter.parentElement.classList.toggle('is-filtered', category !== 'all');
  if (els.searchInput.value.trim() !== search) els.searchInput.value = search;

  els.resetFiltersBtn.disabled = !hasActiveFilters();
}

function onFiltersChanged() {
  state.page = 1;
  // Only keep selections the user can still see, so bulk actions never touch hidden tasks.
  const visibleIds = new Set(getVisibleTasks().map((task) => task.id));
  state.selected.forEach((id) => { if (!visibleIds.has(id)) state.selected.delete(id); });

  syncFilterControls();
  renderTasks();
  updateSelectionUI();
}

function setStatusFilter(status) {
  state.filters.status = status;
  onFiltersChanged();
}

function resetFilters() {
  state.filters = { ...DEFAULT_FILTERS };
  els.searchInput.value = '';
  onFiltersChanged();
}

function goToPage(page) {
  state.page = page;
  renderTasks();
  updateSelectionUI();
  els.taskList.parentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Jump to the page containing a task and flash it. */
function revealTask(id) {
  const index = getVisibleTasks().findIndex((task) => task.id === id);
  if (index === -1) return false;
  const page = Math.floor(index / PAGE_SIZE) + 1;
  if (page !== state.page) {
    state.page = page;
    renderTasks();
    updateSelectionUI();
  }
  const card = findCard(id);
  if (card) {
    card.classList.add('is-highlighted');
    card.addEventListener('animationend', () => card.classList.remove('is-highlighted'), { once: true });
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  return true;
}

/* =========================================================
   8. Task actions
   ========================================================= */
function createTask(data) {
  const now = new Date().toISOString();
  const task = { id: createId(), ...data, completed: false, createdAt: now, updatedAt: now };
  state.tasks.unshift(task); // newest first in the custom order
  saveTasks();
  render();
  const shown = revealTask(task.id);
  showToast(shown ? `Task “${task.title}” added.` : `Task “${task.title}” added — it is hidden by the current filters.`, { type: 'success' });
}

function updateTask(id, data) {
  const task = findTask(id);
  if (!task) return;
  Object.assign(task, data, { updatedAt: new Date().toISOString() });
  saveTasks();
  render();
  revealTask(id);
  showToast('Task updated.', { type: 'success' });
}

function toggleTask(id) {
  const task = findTask(id);
  if (!task) return;
  task.completed = !task.completed;
  task.updatedAt = new Date().toISOString();
  saveTasks();

  const card = findCard(id);
  if (card && taskMatchesFilters(task)) {
    // The task stays visible, so swap just this card instead of re-rendering the whole list.
    const hadFocus = card.contains(document.activeElement);
    const newCard = createTaskCard(task);
    card.replaceWith(newCard);
    if (hadFocus) newCard.querySelector('[data-action="toggle"]').focus();
    renderStats();
    updateSelectionUI();
  } else {
    render(); // the task no longer matches the status filter, so the list must change
  }

  if (state.detailsId === id) fillDetails(task);
  showToast(task.completed ? `“${task.title}” marked as completed.` : `“${task.title}” marked as pending.`, { type: task.completed ? 'success' : 'info' });
}

async function requestDelete(ids) {
  const tasks = ids.map(findTask).filter(Boolean);
  if (!tasks.length) return;

  const single = tasks.length === 1;
  const confirmed = await confirmDialog({
    title: single ? 'Delete this task?' : `Delete ${tasks.length} tasks?`,
    message: single
      ? `“${tasks[0].title}” will be deleted. You can undo this for a few seconds.`
      : `${pluralize(tasks.length, 'selected task')} will be deleted. You can undo this for a few seconds.`,
    confirmText: 'Delete',
    variant: 'danger',
  });
  if (confirmed) deleteTasks(tasks.map((task) => task.id));
}

function deleteTasks(ids) {
  const idSet = new Set(ids);
  const removed = [];

  state.tasks = state.tasks.filter((task, index) => {
    if (!idSet.has(task.id)) return true;
    removed.push({ task, index }); // remember the original position for Undo
    return false;
  });
  if (!removed.length) return;

  ids.forEach((id) => state.selected.delete(id));
  if (state.detailsId && idSet.has(state.detailsId)) closeModal(els.detailsModal);

  saveTasks();
  render();
  els.taskList.focus({ preventScroll: true });

  const entry = { items: removed, toast: null };
  state.undoStack.push(entry);
  const label = removed.length === 1 ? `Deleted “${removed[0].task.title}”.` : `Deleted ${removed.length} tasks.`;
  entry.toast = showToast(label, {
    actionLabel: 'Undo',
    duration: UNDO_WINDOW_MS,
    onAction: () => restoreDeleted(entry),
    onExpire: () => {
      const position = state.undoStack.indexOf(entry);
      if (position !== -1) state.undoStack.splice(position, 1);
    },
  });
}

function restoreDeleted(entry) {
  const position = state.undoStack.indexOf(entry);
  if (position === -1) return;
  state.undoStack.splice(position, 1);

  // Re-insert in ascending index order so each task lands back where it was.
  const items = [...entry.items].sort((a, b) => a.index - b.index);
  items.forEach(({ task, index }) => {
    if (findTask(task.id)) return;
    state.tasks.splice(Math.min(index, state.tasks.length), 0, task);
  });

  saveTasks();
  render();
  if (entry.toast) entry.toast.dismiss();
  if (items.length === 1) revealTask(items[0].task.id);
  showToast(items.length === 1 ? `Restored “${items[0].task.title}”.` : `Restored ${items.length} tasks.`, { type: 'success' });
}

function undoLastDelete() {
  const entry = state.undoStack[state.undoStack.length - 1];
  if (entry) restoreDeleted(entry);
  else showToast('Nothing to undo.');
}

/**
 * Persist a drag & drop move. The dragged card has already been moved in the DOM, so its new
 * neighbours (nextElementSibling / previousElementSibling) tell us where it belongs in the array.
 */
function commitCardPosition(card) {
  const fromIndex = state.tasks.findIndex((task) => task.id === card.dataset.id);
  if (fromIndex === -1) return;

  const next = card.nextElementSibling;
  const previous = card.previousElementSibling;
  const [moved] = state.tasks.splice(fromIndex, 1);

  let toIndex = fromIndex;
  if (next) toIndex = state.tasks.findIndex((task) => task.id === next.dataset.id);
  else if (previous) toIndex = state.tasks.findIndex((task) => task.id === previous.dataset.id) + 1;

  state.tasks.splice(toIndex, 0, moved);
  if (toIndex !== fromIndex) {
    saveTasks();
    showToast('Task order saved.');
  }
  render();
}

/** Keyboard alternative to drag & drop: Alt + ↑ / ↓ moves the focused task. */
function moveTaskWithKeyboard(card, direction) {
  if (state.sort !== 'manual') {
    showToast('Switch the sort to “Custom order” to rearrange tasks.');
    return;
  }
  const sibling = direction < 0 ? card.previousElementSibling : card.nextElementSibling;
  if (!sibling) return;
  els.taskList.insertBefore(card, direction < 0 ? sibling : sibling.nextElementSibling);
  const id = card.dataset.id;
  commitCardPosition(card);
  const movedCard = findCard(id);
  if (movedCard) movedCard.focus();
}

/* =========================================================
   9. Selection & bulk actions
   ========================================================= */
function updateSelectionUI() {
  // Drop ids of tasks that no longer exist
  state.selected.forEach((id) => { if (!findTask(id)) state.selected.delete(id); });

  const visible = getVisibleTasks();
  const selectedCount = state.selected.size;
  const visibleSelected = visible.filter((task) => state.selected.has(task.id)).length;

  els.selectedCount.textContent = selectedCount ? `${selectedCount} selected` : 'None selected';
  els.selectAll.checked = visible.length > 0 && visibleSelected === visible.length;
  els.selectAll.indeterminate = visibleSelected > 0 && visibleSelected < visible.length;
  els.selectAll.disabled = visible.length === 0;
  els.bulkBar.classList.toggle('has-selection', selectedCount > 0);

  els.bulkActions.querySelectorAll('button[data-bulk]').forEach((button) => {
    if (selectedCount) button.removeAttribute('disabled');
    else button.setAttribute('disabled', '');
  });
}

function setTaskSelected(card, selected) {
  const id = card.dataset.id;
  if (selected) state.selected.add(id);
  else state.selected.delete(id);
  card.classList.toggle('is-selected', selected);
}

function selectAllVisible(selected) {
  getVisibleTasks().forEach((task) => {
    if (selected) state.selected.add(task.id);
    else state.selected.delete(task.id);
  });
  els.taskList.querySelectorAll('.task-checkbox').forEach((checkbox) => {
    checkbox.checked = selected;
    checkbox.closest('.task-card').classList.toggle('is-selected', selected);
  });
  updateSelectionUI();
}

function setCompletionForSelected(completed) {
  let changed = 0;
  state.selected.forEach((id) => {
    const task = findTask(id);
    if (task && task.completed !== completed) {
      task.completed = completed;
      task.updatedAt = new Date().toISOString();
      changed += 1;
    }
  });
  state.selected.clear();
  saveTasks();
  render();
  showToast(changed
    ? `${pluralize(changed, 'task')} marked as ${completed ? 'completed' : 'pending'}.`
    : `Selected tasks were already ${completed ? 'completed' : 'pending'}.`, { type: changed ? 'success' : 'info' });
}

/* =========================================================
   10. Modals
   ========================================================= */
function topModal() {
  return modalStack.length ? modalStack[modalStack.length - 1].modal : null;
}

function openModal(modal, focusTarget) {
  if (modalStack.some((entry) => entry.modal === modal)) return;
  modalStack.push({ modal, returnFocus: document.activeElement });
  modal.removeAttribute('hidden');
  document.body.classList.add('modal-open');
  const target = focusTarget || modal.querySelector(FOCUSABLE_SELECTOR);
  if (target) target.focus();
}

function closeModal(modal) {
  const index = modalStack.findIndex((entry) => entry.modal === modal);
  if (index === -1) return;
  const [entry] = modalStack.splice(index, 1);
  modal.setAttribute('hidden', '');
  if (!modalStack.length) document.body.classList.remove('modal-open');
  if (modal === els.detailsModal) state.detailsId = null;
  if (entry.returnFocus && entry.returnFocus.isConnected) entry.returnFocus.focus({ preventScroll: true });
}

/** User-initiated close (ESC, ✕, Cancel, backdrop) — some modals need to intercept it. */
function requestCloseModal(modal) {
  if (modal === els.formModal) requestCloseForm();
  else if (modal === els.confirmModal) settleConfirm(false);
  else closeModal(modal);
}

function trapFocus(event, modal) {
  const focusable = Array.from(modal.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!modal.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ---------- Confirm dialog (returns a Promise<boolean>) ---------- */
function confirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', variant = 'danger' }) {
  if (state.confirmResolver) settleConfirm(false);

  els.confirmTitle.textContent = title;
  els.confirmMessage.textContent = message;
  els.confirmOkBtn.textContent = confirmText;
  els.confirmCancelBtn.textContent = cancelText;
  els.confirmOkBtn.classList.toggle('btn-danger', variant === 'danger');
  els.confirmOkBtn.classList.toggle('btn-primary', variant !== 'danger');
  els.confirmModal.firstElementChild.classList.toggle('is-neutral', variant !== 'danger');

  openModal(els.confirmModal, els.confirmCancelBtn); // focus the safe option first
  return new Promise((resolve) => { state.confirmResolver = resolve; });
}

function settleConfirm(result) {
  const resolve = state.confirmResolver;
  state.confirmResolver = null;
  closeModal(els.confirmModal);
  if (resolve) resolve(result);
}

/* ---------- Add / edit form ---------- */
function readForm() {
  const formData = new FormData(els.taskForm);
  return {
    title: String(formData.get('title') ?? '').trim(),
    description: String(formData.get('description') ?? '').trim(),
    category: String(formData.get('category') ?? ''),
    priority: String(formData.get('priority') ?? ''),
    dueDate: String(formData.get('dueDate') ?? ''),
  };
}

function serializeForm() {
  return JSON.stringify(Object.fromEntries(new FormData(els.taskForm)));
}

function isFormDirty() {
  return !els.formModal.hidden && serializeForm() !== state.formSnapshot;
}

function validateTask({ title, description, category, priority, dueDate }) {
  const errors = {};

  if (!title) errors.title = 'Title is required.';
  else if (title.length < 3) errors.title = `Title must be at least 3 characters (currently ${title.length}).`;

  if (!description) errors.description = 'Description is required.';
  else if (description.length < 10) errors.description = `Description must be at least 10 characters (currently ${description.length}).`;

  if (!category) errors.category = 'Please choose a category.';
  else if (!CATEGORIES.includes(category)) errors.category = 'Please choose a valid category.';

  if (!priority) errors.priority = 'Please choose a priority.';
  else if (!PRIORITIES.includes(priority)) errors.priority = 'Please choose a valid priority.';

  if (!dueDate) errors.dueDate = 'Please pick a due date.';
  else if (!isValidISODate(dueDate)) errors.dueDate = 'Please enter a valid date.';

  return errors;
}

/** Show or clear one field's error. The error <small> is always the field's next sibling. */
function setFieldError(field, message) {
  const errorElement = field.nextElementSibling;
  errorElement.textContent = message || '';
  field.parentElement.classList.toggle('has-error', Boolean(message));
  if (message) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
}

function showFormErrors(errors) {
  Object.entries(els.fields).forEach(([name, field]) => setFieldError(field, errors[name]));
}

function openTaskForm(id = null) {
  const task = id ? findTask(id) : null;
  state.editingId = task ? task.id : null;

  els.taskForm.reset();
  showFormErrors({});
  els.formModalTitle.textContent = task ? 'Edit Task' : 'New Task';
  els.formSubmitBtn.textContent = task ? 'Save Changes' : 'Add Task';
  els.taskForm.dataset.mode = task ? 'edit' : 'create';

  if (task) {
    els.fields.title.value = task.title;
    els.fields.description.value = task.description;
    els.fields.category.value = task.category;
    els.fields.priority.value = task.priority;
    els.fields.dueDate.value = task.dueDate;
  }

  openModal(els.formModal, els.fields.title);
  state.formSnapshot = serializeForm();
}

function closeTaskForm() {
  els.taskForm.reset();
  showFormErrors({});
  state.editingId = null;
  state.formSnapshot = '';
  delete els.taskForm.dataset.mode;
  closeModal(els.formModal);
}

async function requestCloseForm() {
  if (isFormDirty()) {
    const discard = await confirmDialog({
      title: 'Discard unsaved changes?',
      message: state.editingId
        ? 'You have changed this task but not saved it. Your changes will be lost.'
        : 'This new task has not been saved. What you typed will be lost.',
      confirmText: 'Discard',
      cancelText: 'Keep editing',
      variant: 'danger',
    });
    if (!discard) return;
  }
  closeTaskForm();
}

function handleFormSubmit(event) {
  event.preventDefault(); // stop the browser from reloading the page

  const data = readForm();
  const errors = validateTask(data);
  showFormErrors(errors);

  const firstInvalid = Object.keys(els.fields).find((name) => errors[name]);
  if (firstInvalid) {
    els.fields[firstInvalid].focus();
    els.taskForm.classList.remove('shake');
    void els.taskForm.offsetWidth;
    els.taskForm.classList.add('shake');
    return;
  }

  const editingId = state.editingId;
  closeTaskForm(); // also clears the form
  if (editingId) updateTask(editingId, data);
  else createTask(data);
}

/* ---------- Details modal ---------- */
function openDetails(id) {
  const task = findTask(id);
  if (!task) return;
  state.detailsId = id;
  fillDetails(task);
  openModal(els.detailsModal, els.detailsModal.querySelector('[data-close]'));
}

function fillDetails(task) {
  const status = getStatus(task);
  els.detailsModal.dataset.id = task.id;
  els.detailsTitle.textContent = task.title;

  const dt = 'text-xs font-semibold tracking-wider text-faint uppercase';
  const dd = 'mt-1 font-semibold';
  const note = 'block font-medium text-muted';
  const dueNote = status === 'overdue' ? 'block font-medium text-danger' : note;

  els.detailsBody.innerHTML = '';
  els.detailsBody.insertAdjacentHTML('beforeend', `
    <div class="mb-3.5 flex flex-wrap gap-1.5">
      <span class="badge h-5 text-[11px] tracking-wide uppercase ${STATUS_BADGE_CLASSES[status]}">${STATUS_LABELS[status]}</span>
      <span class="badge before:size-1.5 before:rounded-full before:bg-current ${PRIORITY_BADGE_CLASSES[task.priority]}">${capitalize(task.priority)} priority</span>
      <span class="badge border border-line bg-surface-2 text-muted">${escapeHTML(CATEGORY_LABELS[task.category])}</span>
    </div>
    <p class="mb-4 rounded-[10px] bg-surface-2 px-4 py-3.5 whitespace-pre-wrap wrap-anywhere">${escapeHTML(task.description || 'No description.')}</p>
    <dl class="m-0 grid grid-cols-1 gap-x-[18px] gap-y-3.5 md:grid-cols-2">
      <div><dt class="${dt}">Category</dt><dd class="${dd}">${escapeHTML(CATEGORY_LABELS[task.category])}</dd></div>
      <div><dt class="${dt}">Priority</dt><dd class="${dd}">${capitalize(task.priority)}</dd></div>
      <div><dt class="${dt}">Status</dt><dd class="${dd}">${STATUS_LABELS[status]}</dd></div>
      <div><dt class="${dt}">Due date</dt><dd class="${dd}">${formatDueDate(task)}<small class="${dueNote}">${task.completed ? relativeFormatter.format(daysUntilDue(task), 'day') : describeDue(task)}</small></dd></div>
      <div><dt class="${dt}">Created</dt><dd class="${dd}">${dateTimeFormatter.format(new Date(task.createdAt))}<small class="${note}">${describeCreated(task.createdAt)}</small></dd></div>
      <div><dt class="${dt}">Last updated</dt><dd class="${dd}">${dateTimeFormatter.format(new Date(task.updatedAt))}<small class="${note}">${describeCreated(task.updatedAt)}</small></dd></div>
    </dl>`);

  els.detailsToggleBtn.textContent = task.completed ? 'Mark as pending' : 'Mark as completed';
}

/* =========================================================
   11. Toast notifications
   ========================================================= */
function showToast(message, { type = 'info', actionLabel, onAction, onExpire, duration = 3500 } = {}) {
  const toast = document.createElement('div');
  toast.className = `${UI_CLASSES.toast} ${TOAST_TYPE_CLASSES[type] || TOAST_TYPE_CLASSES.info}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const text = document.createElement('span');
  text.className = UI_CLASSES.toastMessage;
  text.textContent = message;
  toast.appendChild(text);

  let timerId = null;
  const dismiss = () => {
    clearTimeout(timerId);
    if (!toast.isConnected || toast.classList.contains('is-leaving')) return;
    toast.classList.add('is-leaving');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400); // fallback when animations are disabled
  };

  if (actionLabel && onAction) {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = `toast-action ${UI_CLASSES.toastAction}`;
    actionBtn.textContent = actionLabel;
    actionBtn.addEventListener('click', () => {
      dismiss();
      onAction();
    });
    toast.append(actionBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = UI_CLASSES.toastClose;
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.innerHTML = '<svg class="size-4" aria-hidden="true"><use href="#i-x"/></svg>';
  closeBtn.addEventListener('click', () => {
    dismiss();
    if (onExpire) onExpire();
  });
  toast.append(closeBtn);

  els.toastContainer.prepend(toast); // newest toast on top

  // Keep the stack short: drop the oldest toasts.
  while (els.toastContainer.children.length > MAX_TOASTS) {
    els.toastContainer.lastElementChild.remove();
  }

  timerId = setTimeout(() => {
    dismiss();
    if (onExpire) onExpire();
  }, duration);

  return { dismiss };
}

/* =========================================================
   12. Theme (dark mode)
   ========================================================= */
function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  els.themeToggle.setAttribute('aria-pressed', String(dark));
  els.themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEYS.theme);
  } catch (error) {
    /* storage unavailable — fall back to the OS preference */
  }
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem(STORAGE_KEYS.theme, next);
  } catch (error) {
    /* preference just won't persist */
  }
}

/* =========================================================
   13. Import / export (JSON)
   ========================================================= */
function exportTasks() {
  if (!state.tasks.length) {
    showToast('There are no tasks to export.');
    return;
  }
  const payload = {
    app: 'TaskForge',
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: state.tasks,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `taskforge-tasks-${toISODate(new Date())}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showToast(`Exported ${pluralize(state.tasks.length, 'task')}.`, { type: 'success' });
}

async function importTasks(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (error) {
    showToast('That file is not valid JSON.', { type: 'error' });
    return;
  }

  const list = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.tasks) ? parsed.tasks : null;
  if (!list) {
    showToast('No tasks found in that file. Expected an array or { "tasks": [...] }.', { type: 'error' });
    return;
  }

  const incoming = list.map(normalizeTask).filter(Boolean);
  if (!incoming.length) {
    showToast('The file did not contain any valid tasks.', { type: 'error' });
    return;
  }

  const existingIds = new Set(state.tasks.map((task) => task.id));
  const updates = incoming.filter((task) => existingIds.has(task.id)).length;
  const confirmed = await confirmDialog({
    title: `Import ${pluralize(incoming.length, 'task')}?`,
    message: updates
      ? `${incoming.length - updates} new, ${updates} will replace tasks with the same ID. Your other tasks are kept.`
      : 'They will be added to your current tasks.',
    confirmText: 'Import',
    variant: 'primary',
  });
  if (!confirmed) return;

  const incomingById = new Map(incoming.map((task) => [task.id, task]));
  state.tasks = state.tasks.map((task) => incomingById.get(task.id) || task);
  const added = incoming.filter((task) => !existingIds.has(task.id));
  state.tasks.unshift(...added);

  saveTasks();
  render();
  showToast(`Imported ${pluralize(added.length, 'new task')}${updates ? `, updated ${updates}` : ''}.`, { type: 'success' });
}

/* =========================================================
   14. Event listeners
   ========================================================= */
function bindEvents() {
  /* ----- Header ----- */
  els.addTaskBtn.addEventListener('click', () => openTaskForm());
  els.themeToggle.addEventListener('click', toggleTheme);
  els.exportBtn.addEventListener('click', exportTasks);
  els.importBtn.addEventListener('click', () => els.importInput.click());
  els.importInput.addEventListener('change', (event) => {
    const [file] = event.target.files;
    if (file) importTasks(file);
    event.target.value = ''; // allow importing the same file again
  });

  /* ----- Debounced search ----- */
  const runSearch = debounce((value) => {
    state.filters.search = value.trim();
    onFiltersChanged();
  }, SEARCH_DEBOUNCE_MS);
  els.searchInput.addEventListener('input', (event) => runSearch(event.target.value));
  els.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !topModal()) {
      event.target.value = '';
      runSearch('');
      event.target.blur();
    }
  });

  /* ----- Filters & sorting ----- */
  els.statusFilters.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-status]');
    if (button) setStatusFilter(button.dataset.status);
  });

  // Clicking a stat card filters by that status (event delegation on the stats section).
  els.stats.addEventListener('click', (event) => {
    const card = event.target.closest('.stat-card');
    if (!card) return;
    const status = card.dataset.status;
    setStatusFilter(state.filters.status === status ? 'all' : status);
  });

  els.priorityFilter.addEventListener('change', (event) => {
    state.filters.priority = event.target.value;
    onFiltersChanged();
  });
  els.categoryFilter.addEventListener('change', (event) => {
    state.filters.category = event.target.value;
    onFiltersChanged();
  });
  els.sortSelect.addEventListener('change', (event) => {
    state.sort = event.target.value;
    onFiltersChanged();
  });
  els.resetFiltersBtn.addEventListener('click', resetFilters);

  /* ----- Task list: ONE click listener handles every button on every card (event delegation) ----- */
  els.taskList.addEventListener('click', (event) => {
    const card = event.target.closest('.task-card');
    if (!card || !event.currentTarget.contains(card)) return;
    if (event.target.closest('.task-select, .drag-handle')) return; // checkbox handled by "change"

    const id = card.dataset.id;
    const actionElement = event.target.closest('[data-action]');
    const action = actionElement ? actionElement.dataset.action : 'open';

    switch (action) {
      case 'toggle': toggleTask(id); break;
      case 'edit': openTaskForm(id); break;
      case 'delete': requestDelete([id]); break;
      default: openDetails(id);
    }
  });

  els.taskList.addEventListener('change', (event) => {
    if (!event.target.matches('.task-checkbox')) return;
    setTaskSelected(event.target.closest('.task-card'), event.target.checked);
    updateSelectionUI();
  });

  // Keyboard navigation between cards using sibling traversal.
  els.taskList.addEventListener('keydown', (event) => {
    const card = event.target;
    if (!card.classList || !card.classList.contains('task-card')) return;
    const list = event.currentTarget;
    let target = null;

    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      moveTaskWithKeyboard(card, event.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    switch (event.key) {
      case 'ArrowDown': target = card.nextElementSibling; break;
      case 'ArrowUp': target = card.previousElementSibling; break;
      case 'Home': target = list.firstElementChild; break;
      case 'End': target = list.lastElementChild; break;
      case 'Enter': event.preventDefault(); openDetails(card.dataset.id); return;
      case ' ': {
        event.preventDefault();
        const checkbox = card.querySelector('.task-checkbox');
        checkbox.checked = !checkbox.checked;
        setTaskSelected(card, checkbox.checked);
        updateSelectionUI();
        return;
      }
      case 'Delete': event.preventDefault(); requestDelete([card.dataset.id]); return;
      default: return;
    }
    if (target) {
      event.preventDefault();
      target.focus();
    }
  });

  /* ----- Drag & drop reordering (custom order only) ----- */
  els.taskList.addEventListener('mousedown', (event) => {
    const handle = event.target.closest('.drag-handle');
    if (handle && state.sort === 'manual') handle.closest('.task-card').setAttribute('draggable', 'true');
  });
  els.taskList.addEventListener('mouseup', (event) => {
    const card = event.target.closest('.task-card');
    if (card && card !== state.draggedCard) card.removeAttribute('draggable');
  });

  els.taskList.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.task-card');
    if (!card) return;
    state.draggedCard = card;
    state.dropCommitted = false;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.dataset.id); // required by Firefox
    requestAnimationFrame(() => card.classList.add('is-dragging'));
  });

  els.taskList.addEventListener('dragover', (event) => {
    const dragged = state.draggedCard;
    if (!dragged) return;
    event.preventDefault(); // allow dropping
    event.dataTransfer.dropEffect = 'move';

    const target = event.target.closest('.task-card');
    if (!target || target === dragged) return;
    const rect = target.getBoundingClientRect();
    const insertAfter = event.clientY > rect.top + rect.height / 2;
    const reference = insertAfter ? target.nextElementSibling : target;
    if (reference !== dragged && dragged.nextElementSibling !== reference) {
      event.currentTarget.insertBefore(dragged, reference);
    }
  });

  els.taskList.addEventListener('drop', (event) => {
    if (!state.draggedCard) return;
    event.preventDefault();
    state.dropCommitted = true;
  });

  els.taskList.addEventListener('dragend', () => {
    const card = state.draggedCard;
    if (!card) return;
    state.draggedCard = null;
    card.classList.remove('is-dragging');
    card.removeAttribute('draggable');
    if (state.dropCommitted) commitCardPosition(card);
    else renderTasks(); // drag was cancelled: put the cards back
  });

  /* ----- Empty-state / no-results buttons ----- */
  els.listMessage.addEventListener('click', (event) => {
    const button = event.target.closest('[data-message-action]');
    if (!button) return;
    const action = button.dataset.messageAction;
    if (action === 'add') openTaskForm();
    if (action === 'reset') resetFilters();
    if (action === 'samples') {
      state.tasks = createSampleTasks();
      saveTasks();
      render();
      showToast('Sample tasks loaded.', { type: 'success' });
    }
  });

  /* ----- Pagination ----- */
  els.pagination.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-page]');
    if (!button || button.disabled) return;
    goToPage(Number(button.dataset.page));
  });

  /* ----- Selection & bulk actions ----- */
  els.selectAll.addEventListener('change', (event) => selectAllVisible(event.target.checked));

  els.bulkActions.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-bulk]');
    if (!button || button.disabled) return;
    const action = button.getAttribute('data-bulk');
    if (action === 'complete') setCompletionForSelected(true);
    if (action === 'pending') setCompletionForSelected(false);
    if (action === 'delete') requestDelete([...state.selected]);
  });

  /* ----- Form ----- */
  els.taskForm.addEventListener('submit', handleFormSubmit);

  // Re-validate a field live once it has shown an error.
  const revalidate = (event) => {
    const field = event.target;
    if (!field.name || !field.parentElement.classList.contains('has-error')) return;
    setFieldError(field, validateTask(readForm())[field.name]);
  };
  els.taskForm.addEventListener('input', revalidate);
  els.taskForm.addEventListener('change', revalidate);

  /* ----- Modals: close buttons, backdrop clicks ----- */
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    // Only close on a backdrop click that also *started* on the backdrop
    // (so selecting text inside the form and releasing outside does not close it).
    overlay.addEventListener('mousedown', (event) => {
      overlay.dataset.backdropPress = String(event.target === event.currentTarget);
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === event.currentTarget && overlay.dataset.backdropPress === 'true') {
        requestCloseModal(overlay);
        return;
      }
      if (event.target.closest('[data-close]')) requestCloseModal(overlay);
    });
  });

  els.confirmOkBtn.addEventListener('click', () => settleConfirm(true));

  els.detailsModal.addEventListener('click', (event) => {
    const button = event.target.closest('[data-details-action]');
    if (!button) return;
    const id = event.currentTarget.dataset.id; // the modal stores which task it is showing
    switch (button.dataset.detailsAction) {
      case 'edit':
        closeModal(els.detailsModal);
        openTaskForm(id);
        break;
      case 'delete':
        requestDelete([id]);
        break;
      case 'toggle':
        toggleTask(id);
        break;
      default:
    }
  });

  /* ----- Global keyboard shortcuts ----- */
  document.addEventListener('keydown', (event) => {
    const modal = topModal();

    if (event.key === 'Escape') {
      if (modal) {
        event.preventDefault();
        requestCloseModal(modal);
      }
      return;
    }

    if (event.key === 'Tab' && modal) {
      trapFocus(event, modal);
      return;
    }

    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      if (modal === els.formModal) {
        event.preventDefault();
        if (typeof els.taskForm.requestSubmit === 'function') els.taskForm.requestSubmit();
        else els.formSubmitBtn.click();
      }
      return;
    }

    if (modal || isTypingTarget(event.target)) return;

    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undoLastDelete();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === 'n' || event.key === 'N') {
      event.preventDefault();
      openTaskForm();
    } else if (event.key === '/') {
      event.preventDefault();
      els.searchInput.focus();
      els.searchInput.select();
    }
  });

  /* ----- Window-level events ----- */
  // Warn before leaving the page with an unsaved form.
  window.addEventListener('beforeunload', (event) => {
    if (isFormDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  // Keep several open tabs in sync.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEYS.tasks) {
      state.tasks = loadTasks() || [];
      render();
    } else if (event.key === STORAGE_KEYS.theme && event.newValue) {
      applyTheme(event.newValue);
    }
  });

  // Overdue status depends on today's date — refresh when the day rolls over.
  const checkDayRollover = () => {
    const today = toISODate(new Date());
    if (today === state.today) return;
    state.today = today;
    els.todayLabel.textContent = longDateFormatter.format(new Date());
    render();
    if (state.detailsId) {
      const task = findTask(state.detailsId);
      if (task) fillDetails(task);
    }
  };
  setInterval(checkDayRollover, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkDayRollover();
  });
}

/* =========================================================
   15. Initialisation
   ========================================================= */
function init() {
  initTheme();

  const saved = loadTasks();
  if (saved === null) {
    // First visit: seed the dashboard with sample tasks.
    state.tasks = createSampleTasks();
    saveTasks();
  } else {
    state.tasks = saved;
  }

  state.today = toISODate(new Date());
  els.todayLabel.textContent = longDateFormatter.format(new Date());

  bindEvents();
  syncFilterControls();
  render();
}

init();
