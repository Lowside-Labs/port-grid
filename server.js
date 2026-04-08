#!/usr/bin/env node

import { createServer } from "http";
import { scanPorts } from "./scanner.js";

const PORT = parseInt(process.argv[2] || process.env.PORT || "4000", 10);

let activePort = PORT;

async function handler(req, res) {
  const url = new URL(req.url, `http://localhost:${activePort}`);

  if (url.pathname === "/api/ports") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    });
    const all = url.searchParams.get("all") === "true";
    let ports = await scanPorts({ all });
    // Filter out port-grid itself
    ports = ports.filter((p) => p.port !== activePort);
    res.end(JSON.stringify(ports));
    return;
  }

  if (url.pathname === "/api/kill" && req.method === "POST") {
    const pid = url.searchParams.get("pid");
    if (!pid || isNaN(pid)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid PID" }));
      return;
    }
    try {
      process.kill(parseInt(pid, 10), "SIGTERM");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, pid }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (url.pathname === "/api/shutdown" && req.method === "POST") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    setTimeout(() => process.exit(0), 100);
    return;
  }

  // Serve the SPA
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(getHTML());
}

function startServer(port) {
  const server = createServer(handler);

  server.once("error", (err) => {
    if (err.code === "EADDRINUSE") {
      startServer(port + 1);
    } else {
      throw err;
    }
  });

  server.listen(port, () => {
    activePort = port;
    console.log(`\n  ⚡ port-grid running at http://localhost:${port}\n`);

    import("child_process").then(({ exec }) => {
      const cmd =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";
      exec(`${cmd} http://localhost:${port}`);
    });
  });
}

startServer(PORT);

function getHTML() {
  return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>port-grid</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #ffffff;
    --bg-secondary: #f7f7f8;
    --bg-card: #ffffff;
    --border: #e5e5e5;
    --border-hover: #d1d1d1;
    --text: #0d0d0d;
    --text-secondary: #6e6e80;
    --text-tertiary: #8e8ea0;
    --accent: #0d0d0d;
    --accent-subtle: #f0f0f0;
    --shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
    --shadow-hover: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
    --radius: 12px;
    --radius-sm: 8px;
    --dot-online: #10a37f;
    --dot-docker: #2496ed;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-mono: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, monospace;
  }

  :root.dark {
    --bg: #0d0d0d;
    --bg-secondary: #1a1a1a;
    --bg-card: #1a1a1a;
    --border: #2f2f2f;
    --border-hover: #3f3f3f;
    --text: #ececf1;
    --text-secondary: #8e8ea0;
    --text-tertiary: #6e6e80;
    --accent: #ececf1;
    --accent-subtle: #2f2f2f;
    --shadow: 0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
    --shadow-hover: 0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3);
  }

  html { font-family: var(--font); background: var(--bg); color: var(--text); }
  body { min-height: 100vh; transition: background 0.2s, color 0.2s; }

  /* Header */
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0; background: var(--bg);
    z-index: 100; backdrop-filter: blur(12px);
  }
  .logo { display: flex; align-items: center; gap: 10px; }
  .logo svg { width: 28px; height: 28px; }
  .logo h1 { font-size: 18px; font-weight: 600; letter-spacing: -0.02em; position: relative; top: -2px; }
  .header-actions { display: flex; align-items: center; gap: 8px; }

  /* Buttons */
  .btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 14px; border-radius: var(--radius-sm);
    border: 1px solid var(--border); background: var(--bg-card);
    color: var(--text-secondary); font-size: 13px; cursor: pointer;
    transition: all 0.15s; font-family: var(--font);
  }
  .btn:hover { border-color: var(--border-hover); color: var(--text); background: var(--accent-subtle); }
  .btn svg { width: 15px; height: 15px; }
  .btn.active { background: var(--accent); color: var(--bg); border-color: var(--accent); }

  /* Stats bar */
  .stats-bar {
    display: flex; gap: 24px; padding: 12px 24px;
    border-bottom: 1px solid var(--border);
    font-size: 13px; color: var(--text-secondary);
  }
  .stat { display: flex; align-items: center; gap: 6px; }
  .stat-value { font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }

  /* Grid */
  .grid-container { padding: 24px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
    gap: 16px;
  }

  /* Card */
  .card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-card);
    overflow: hidden;
    transition: box-shadow 0.2s, border-color 0.2s;
    display: flex; flex-direction: column;
    cursor: pointer;
  }
  .card:hover { box-shadow: var(--shadow-hover); border-color: var(--border-hover); }

  .card-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    gap: 12px;
  }
  .card-title-group { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .port-badge {
    font-family: var(--font-mono); font-size: 13px; font-weight: 600;
    padding: 2px 8px; border-radius: 6px;
    background: var(--accent-subtle); color: var(--text);
    white-space: nowrap;
  }
  .card-title {
    font-size: 14px; font-weight: 500; color: var(--text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .card-meta {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; color: var(--text-tertiary);
    flex-shrink: 0;
  }
  .framework-tag {
    font-size: 11px; font-weight: 500; padding: 2px 8px;
    border-radius: 999px; border: 1px solid var(--border);
    color: var(--text-secondary); white-space: nowrap;
  }
  .docker-tag {
    background: rgba(36, 150, 237, 0.1); border-color: rgba(36, 150, 237, 0.3);
    color: #2496ed;
  }
  .dark .docker-tag { background: rgba(36, 150, 237, 0.15); }
  .status-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--dot-online);
    flex-shrink: 0;
  }
  .status-dot.docker { background: var(--dot-docker); }

  .card-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
  .card-btn {
    width: 28px; height: 28px; border-radius: 6px; border: none;
    background: transparent; color: var(--text-tertiary);
    cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
    transition: all 0.15s; padding: 0; line-height: 1;
  }
  .card-btn:hover { background: var(--accent-subtle); color: var(--text); }
  .card-btn.kill-btn:hover { background: rgba(239,68,68,0.1); color: #ef4444; }
  .card-btn svg { width: 14px; height: 14px; display: block; }

  /* Iframe preview */
  .card-preview {
    height: 280px; position: relative; background: var(--bg-secondary);
    overflow: hidden;
  }
  .card-preview iframe {
    width: 200%; height: 200%;
    transform: scale(0.5); transform-origin: top left;
    border: none; pointer-events: none;
    background: white;
  }
  .card-preview .iframe-overlay {
    position: absolute; inset: 0; cursor: pointer; z-index: 1;
  }
  .card-preview .loading {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    color: var(--text-tertiary); font-size: 13px;
  }
  .card-preview .error-state {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 8px;
    color: var(--text-tertiary); font-size: 13px;
  }
  .card-preview .error-state svg { width: 32px; height: 32px; opacity: 0.4; }

  .card-footer {
    display: flex; align-items: center; gap: 16px;
    padding: 8px 16px;
    border-top: 1px solid var(--border);
    font-size: 11px; color: var(--text-tertiary);
    font-family: var(--font-mono);
  }
  .card-footer span { display: flex; align-items: center; gap: 4px; }

  /* Empty state */
  .empty-state {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    min-height: 60vh; gap: 12px; color: var(--text-secondary);
  }
  .empty-state svg { width: 48px; height: 48px; opacity: 0.3; }
  .empty-state h2 { font-size: 18px; font-weight: 500; color: var(--text); }
  .empty-state p { font-size: 14px; max-width: 360px; text-align: center; line-height: 1.5; }

  /* Spinner */
  .spinner {
    width: 20px; height: 20px;
    border: 2px solid var(--border); border-top-color: var(--text);
    border-radius: 50%; animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }


  /* Responsive */
  @media (max-width: 520px) {
    .grid { grid-template-columns: 1fr; }
    header { padding: 12px 16px; }
    .grid-container { padding: 16px; }
    .stats-bar { padding: 10px 16px; gap: 16px; }
  }
</style>
</head>
<body>
<header>
  <div class="logo">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
    <h1>port-grid</h1>
  </div>
  <div class="header-actions">
    <button class="btn" id="refreshBtn" title="Refresh">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
      Refresh
    </button>
    <button class="btn" id="themeBtn" title="Toggle theme">
      <svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
      </svg>
    </button>
    <button class="btn" id="shutdownBtn" title="Shutdown port-grid">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
</header>

<div class="stats-bar" id="statsBar">
  <div class="stat"><span class="stat-value" id="totalCount">–</span> ports</div>
  <div class="stat"><span class="stat-value" id="dockerCount">–</span> Docker</div>
  <div class="stat" id="refreshStatus">
    auto-refresh
    <span class="stat-value" id="refreshInterval">30s</span>
  </div>
</div>

<div class="grid-container">
  <div class="grid" id="grid">
    <div class="empty-state" id="initialLoading" style="grid-column: 1/-1;">
      <div class="spinner"></div>
      <p>Scanning ports...</p>
    </div>
  </div>
</div>

<script>
const $ = (s) => document.querySelector(s);
const grid = $("#grid");

// Theme
function getPreferredTheme() {
  const saved = localStorage.getItem("port-grid-theme");
  if (saved) return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("port-grid-theme", theme);
  updateThemeIcon(theme);
}
function updateThemeIcon(theme) {
  const icon = $("#themeIcon");
  if (theme === "dark") {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  } else {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
  }
}
applyTheme(getPreferredTheme());
$("#themeBtn").onclick = () => {
  const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
  applyTheme(next);
};

// Fetch ports
let currentPorts = [];

async function fetchPorts() {
  try {
    const res = await fetch("/api/ports");
    const ports = await res.json();
    currentPorts = ports;
    render(ports);
  } catch (e) {
    console.error("Failed to fetch ports:", e);
  }
}

function render(ports) {
  const loading = $("#initialLoading");
  if (loading) loading.remove();
  $("#totalCount").textContent = ports.length;
  $("#dockerCount").textContent = ports.filter((p) => p.isDocker).length;

  if (ports.length === 0) {
    grid.innerHTML = \`
      <div class="empty-state" style="grid-column: 1/-1;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <h2>No ports detected</h2>
        <p>Start a dev server and it'll appear here automatically. Refreshes when this tab is focused.</p>
      </div>\`;
    return;
  }

  // Preserve existing cards, update data
  const existingCards = new Map();
  grid.querySelectorAll(".card").forEach((el) => {
    existingCards.set(el.dataset.port, el);
  });

  const fragment = document.createDocumentFragment();
  const currentPortNums = new Set(ports.map((p) => String(p.port)));

  // Remove cards no longer present
  existingCards.forEach((el, port) => {
    if (!currentPortNums.has(port)) el.remove();
  });

  for (const p of ports) {
    const key = String(p.port);
    if (existingCards.has(key)) {
      // Update meta without recreating iframe
      const card = existingCards.get(key);
      updateCardMeta(card, p);
      fragment.appendChild(card);
    } else {
      fragment.appendChild(createCard(p));
    }
  }

  grid.innerHTML = "";
  grid.appendChild(fragment);
}

function createCard(p) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.port = p.port;

  const dockerClass = p.isDocker ? " docker-tag" : "";
  const dotClass = p.isDocker ? " docker" : "";

  card.innerHTML = \`
    <div class="card-header">
      <div class="card-title-group">
        <span class="status-dot\${dotClass}"></span>
        <span class="port-badge">:\${p.port}</span>
        <span class="card-title">\${esc(p.projectName)}</span>
        <span class="framework-tag\${dockerClass}">\${esc(p.framework)}</span>
      </div>
      <div class="card-actions">
        <button class="card-btn kill-btn" title="Kill process" data-action="kill" data-pid="\${p.pid}" data-name="\${esc(p.projectName)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="card-preview">
      <div class="loading"><div class="spinner"></div></div>
      <div class="iframe-overlay"></div>
    </div>
    <div class="card-footer">
      <span>PID \${p.pid}</span>
      <span>CPU \${esc(p.cpu)}</span>
      <span>MEM \${esc(p.memory)}</span>
      <span>\${esc(p.uptime)}</span>
    </div>\`;

  // Load iframe
  const preview = card.querySelector(".card-preview");
  const loading = preview.querySelector(".loading");
  const iframe = document.createElement("iframe");
  iframe.src = "http://localhost:" + p.port;
  iframe.setAttribute("loading", "lazy");
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");

  iframe.onload = () => { loading.style.display = "none"; };
  iframe.onerror = () => {
    loading.innerHTML = \`
      <div class="error-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        <span>Preview unavailable</span>
      </div>\`;
  };
  // Hide loading after timeout
  setTimeout(() => {
    if (loading.style.display !== "none") loading.style.display = "none";
  }, 8000);

  preview.appendChild(iframe);

  // Button handlers
  card.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (btn) {
      e.stopPropagation();
      if (btn.dataset.action === "kill") {
        killProcess(p.pid, p.projectName, card);
      }
      return;
    }
    // Clicking anywhere else on the card opens in new tab
    window.open("http://localhost:" + p.port, "_blank");
  });

  return card;
}

function updateCardMeta(card, p) {
  const footer = card.querySelector(".card-footer");
  if (footer) {
    footer.innerHTML = \`
      <span>PID \${p.pid}</span>
      <span>CPU \${esc(p.cpu)}</span>
      <span>MEM \${esc(p.memory)}</span>
      <span>\${esc(p.uptime)}</span>\`;
  }
}


async function killProcess(pid, name, card) {
  // Immediate visual feedback — overlay on entire card
  card.style.pointerEvents = "none";
  card.style.position = "relative";
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);color:#8e8ea0;font-size:13px;border-radius:var(--radius);";
  overlay.innerHTML = '<div class="spinner"></div>Shutting down...';
  card.appendChild(overlay);

  try {
    const res = await fetch(\`/api/kill?pid=\${pid}\`, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      setTimeout(() => fetchPorts(), 1500);
    } else {
      card.style.pointerEvents = "";
      overlay.remove();
    }
  } catch (e) {
    card.style.pointerEvents = "";
    overlay.remove();
  }
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

// Refresh button
let refreshing = false;
$("#refreshBtn").onclick = async () => {
  if (refreshing) return;
  refreshing = true;
  $("#refreshBtn").classList.add("active");
  await fetchPorts();
  setTimeout(() => {
    $("#refreshBtn").classList.remove("active");
    refreshing = false;
  }, 300);
};

// Shutdown
$("#shutdownBtn").onclick = async () => {
  await fetch("/api/shutdown", { method: "POST" });
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:var(--text-secondary);font-size:14px;">port-grid stopped</div>';
};

// Auto-refresh: only when tab is visible, refresh on focus
const REFRESH_INTERVAL = 30_000;
let refreshTimer = null;

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(fetchPorts, REFRESH_INTERVAL);
  $("#refreshInterval").textContent = "30s";
}

function stopAutoRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  $("#refreshInterval").textContent = "paused";
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopAutoRefresh();
  } else {
    fetchPorts(); // immediate refresh on focus
    startAutoRefresh();
  }
});

window.addEventListener("focus", () => {
  fetchPorts();
  startAutoRefresh();
});

window.addEventListener("blur", () => {
  stopAutoRefresh();
});

// Initial load
fetchPorts();
if (!document.hidden) startAutoRefresh();
</script>
</body>
</html>`;
}
