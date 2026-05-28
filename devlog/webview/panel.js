const vscode = acquireVsCodeApi();
const logFeed = document.getElementById('log-feed');
const clearButton = document.getElementById('clear-button');
const pauseButton = document.getElementById('pause-button');
const resumeButton = document.getElementById('resume-button');
const statusBanner = document.getElementById('status-banner');
const emptyState = document.getElementById('empty-state');

let skeletonNode = null;

function formatTimestamp(value) {
  const date = new Date(typeof value === 'number' ? value : value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

function formatFilesLabel(entry) {
  if (entry.files && entry.files.length > 1) {
    return `${entry.files.length} files`;
  }
  return entry.files?.[0] ?? entry.filename ?? 'unknown';
}

function createEntryCard(entry) {
  const card = document.createElement('article');
  card.className = 'entry-card';
  card.dataset.entryId = entry.id;

  const header = document.createElement('div');
  header.className = 'entry-header';

  const title = document.createElement('h2');
  title.className = 'entry-title';
  title.textContent = entry.concept;

  const time = document.createElement('span');
  time.className = 'entry-time';
  time.textContent = formatTimestamp(entry.timestamp);

  header.append(title, time);

  const meta = document.createElement('p');
  meta.className = 'entry-meta';
  meta.textContent = formatFilesLabel(entry);

  const summary = document.createElement('p');
  summary.className = 'entry-summary';
  summary.textContent = entry.summary ?? '';

  const body = document.createElement('p');
  body.className = 'entry-body';
  body.textContent = entry.explanation ?? '';

  const why = document.createElement('p');
  why.className = 'entry-why';
  why.textContent = `💡 ${entry.whyItMatters ?? ''}`;

  card.append(header, meta, summary, body, why);

  if (entry.reflectionQuestion) {
    const reflection = document.createElement('p');
    reflection.className = 'entry-reflection';
    reflection.textContent = `🤔 ${entry.reflectionQuestion}`;
    card.append(reflection);
  }

  const actions = document.createElement('div');
  actions.className = 'entry-actions';

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'entry-action';
  openButton.textContent = 'Open file';
  const openPath = entry.files?.[0] ?? entry.filename;
  openButton.addEventListener('click', () => {
    vscode.postMessage({ command: 'openFile', path: openPath });
  });

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'entry-action';
  copyButton.textContent = 'Copy lesson';
  copyButton.addEventListener('click', () => {
    vscode.postMessage({ command: 'copyLesson', id: entry.id });
  });

  actions.append(openButton, copyButton);
  card.append(actions);

  return card;
}

function createSkeletonCard() {
  const card = document.createElement('article');
  card.className = 'entry-card devlog-skeleton';
  card.id = 'devlog-skeleton-card';
  card.setAttribute('aria-busy', 'true');
  card.textContent = 'Analyzing your changes…';
  return card;
}

function showSkeleton() {
  if (!logFeed || skeletonNode) {
    return;
  }
  skeletonNode = createSkeletonCard();
  logFeed.prepend(skeletonNode);
  updateEmptyState();
}

function removeSkeleton() {
  if (skeletonNode) {
    skeletonNode.remove();
    skeletonNode = null;
  }
  const existing = document.getElementById('devlog-skeleton-card');
  if (existing) {
    existing.remove();
  }
  updateEmptyState();
}

function prependEntry(entry) {
  if (!logFeed) {
    return;
  }
  removeSkeleton();
  logFeed.prepend(createEntryCard(entry));
  logFeed.scrollTop = 0;
  updateEmptyState();
}

function clearFeed() {
  if (!logFeed) {
    return;
  }
  logFeed.replaceChildren();
  skeletonNode = null;
  updateEmptyState();
}

function updateEmptyState() {
  if (!emptyState || !logFeed) {
    return;
  }
  const visibleCards = logFeed.querySelectorAll('.entry-card:not(.devlog-skeleton)');
  emptyState.hidden = visibleCards.length > 0;
}

function updateStatus(status) {
  if (!statusBanner) {
    return;
  }
  const message = status?.message || 'DevLog ready.';
  statusBanner.textContent = message;
}

window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.type === 'newEntry' && message.entry) {
    prependEntry(message.entry);
  }

  if (message.type === 'clearLog') {
    clearFeed();
  }

  if (message.type === 'status') {
    updateStatus(message.status);
  }

  if (message.type === 'skeleton') {
    showSkeleton();
  }

  if (message.type === 'removeSkeleton') {
    removeSkeleton();
  }
});

clearButton?.addEventListener('click', () => {
  vscode.postMessage({ command: 'clearLog' });
});

pauseButton?.addEventListener('click', () => {
  vscode.postMessage({ command: 'pauseWatcher' });
});

resumeButton?.addEventListener('click', () => {
  vscode.postMessage({ command: 'resumeWatcher' });
});

updateEmptyState();
