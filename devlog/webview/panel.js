const vscode = acquireVsCodeApi();
const logFeed = document.getElementById('log-feed');
const clearButton = document.getElementById('clear-button');

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function createEntryCard(entry) {
  const card = document.createElement('article');
  card.className = 'entry-card';

  const title = document.createElement('h2');
  title.className = 'entry-title';
  title.textContent = entry.concept;

  const meta = document.createElement('p');
  meta.className = 'entry-meta';
  meta.textContent = `${entry.filename} · ${formatTimestamp(entry.timestamp)}`;

  const body = document.createElement('p');
  body.className = 'entry-body';
  body.textContent = entry.explanation;

  card.append(title, meta, body);
  return card;
}

function prependEntry(entry) {
  if (!logFeed) {
    return;
  }
  logFeed.prepend(createEntryCard(entry));
  logFeed.scrollTop = 0;
}

function clearFeed() {
  if (!logFeed) {
    return;
  }
  logFeed.replaceChildren();
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
});

clearButton?.addEventListener('click', () => {
  vscode.postMessage({ command: 'clearLog' });
});
