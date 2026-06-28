// popup.js — Focus Lens popup logic

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayKey() {
  const d = new Date();
  return `day_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

function weekKey() {
  const d = new Date();
  const day = d.getDay(); //0 would be sunday
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day == 0 ? 6 : day - 1));
  return `week_${monday.getFullYear()}_${monday.getMonth() + 1}_${monday.getDate()}`;
}

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function formatDate(d = new Date()) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}

// ─── Category metadata ────────────────────────────────────────────────────────

const CAT_META = {
  productivity:  { label: "Productivity",  color: "#7c5cfc" },
  social:        { label: "Social",        color: "#e86b6b" },
  entertainment: { label: "Entertainment", color: "#4fa3e8" },
  shopping:      { label: "Shopping",      color: "#f5a623" },
  news:          { label: "News",          color: "#5cb8a0" },
  search:        { label: "Search",        color: "#a084f8" },
  reference:     { label: "Reference",     color: "#74b8f0" },
  other:         { label: "Other",         color: "#555568" }
};

// Categories that count positively toward the focus score
const PRODUCTIVE_CATS = new Set(["productivity", "reference", "search"]);

// ─── Donut chart ──────────────────────────────────────────────────────────────

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CX = 55, CY = 55;

function buildDonut(segments) {
  // segments: [{ color, pct }]  pct in 0-1
  const svg = document.getElementById("donutSegments");
  svg.innerHTML = "";

  let angle = -90; // start at top

  segments.forEach(({ color, pct }, i) => {
    if (pct <= 0) return;

    const dashLen  = pct * CIRCUMFERENCE;
    const gapLen   = CIRCUMFERENCE - dashLen;
    const rotDeg   = angle;

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", CX);
    circle.setAttribute("cy", CY);
    circle.setAttribute("r", RADIUS);
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", color);
    circle.setAttribute("stroke-width", "10");
    circle.setAttribute("stroke-dasharray", `${dashLen} ${gapLen}`);
    circle.setAttribute("transform", `rotate(${rotDeg} ${CX} ${CY})`);
    circle.setAttribute("stroke-linecap", i === segments.length - 1 ? "round" : "butt");
    circle.style.transition = "stroke-dasharray 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)";

    svg.appendChild(circle);
    angle += pct * 360;
  });
}

// ─── Render functions ─────────────────────────────────────────────────────────

function renderCategories(categoryData, total) {
  const list = document.getElementById("catList");
  list.innerHTML = "";

  if (!total) return;

  const sorted = Object.entries(categoryData)
    .sort(([, a], [, b]) => b - a)
    .filter(([, v]) => v > 0);

  sorted.forEach(([cat, secs], i) => {
    const meta = CAT_META[cat] || CAT_META.other;
    const pct  = Math.round((secs / total) * 100);

    const row = document.createElement("div");
    row.className = "cat";
    row.style.animationDelay = `${i * 40}ms`;

    row.innerHTML = `
      <div class="cat-dot" style="background:${meta.color}"></div>
      <span class="cat-name">${meta.label}</span>
      <div class="cat-bar-wrap">
        <div class="cat-bar" style="background:${meta.color}" data-pct="${pct}"></div>
      </div>
      <span class="cat-pct">${pct}%</span>
      <span class="cat-time">${formatTime(secs)}</span>
    `;

    list.appendChild(row);
  });

  // Animate bars after paint
  requestAnimationFrame(() => {
    list.querySelectorAll(".cat-bar").forEach(bar => {
      bar.style.width = bar.dataset.pct + "%";
    });
  });
}

function renderSites(domainData) {
  const list = document.getElementById("siteList");
  list.innerHTML = "";

  const sorted = Object.entries(domainData)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 7);

  sorted.forEach(([domain, secs], i) => {
    const cat  = categorize("https://" + domain);
    const meta = CAT_META[cat] || CAT_META.other;

    const row = document.createElement("div");
    row.className = "site";
    row.style.animationDelay = `${i * 30}ms`;

    row.innerHTML = `
      <span class="site-rank">${i + 1}</span>
      <img class="site-favicon"
           src="https://www.google.com/s2/favicons?sz=16&domain=${domain}"
           alt="" onerror="this.style.display='none'" />
      <span class="site-domain">${domain}</span>
      <div class="site-cat-dot" style="background:${meta.color}"></div>
      <span class="site-time">${formatTime(secs)}</span>
    `;

    list.appendChild(row);
  });
}

function renderGoalBanner(categoryData, goals) {
  const banner   = document.getElementById("goalBanner");
  const goalText = document.getElementById("goalText");

  if (!goals || !Object.keys(goals).length) {
    banner.classList.add("hidden");
    return;
  }

  let worstCat   = null;
  let worstRatio = 0;

  for (const [cat, limitMins] of Object.entries(goals)) {
    if (!limitMins) continue;
    const limitSecs = limitMins * 60;
    const spent     = categoryData[cat] || 0;
    const ratio     = spent / limitSecs;
    if (ratio > worstRatio) { worstRatio = ratio; worstCat = cat; }
  }

  if (!worstCat) { banner.classList.add("hidden"); return; }

  banner.classList.remove("hidden", "warning", "danger");

  const limitSecs  = goals[worstCat] * 60;
  const spent      = categoryData[worstCat] || 0;
  const remaining  = Math.max(0, limitSecs - spent);
  const meta       = CAT_META[worstCat] || CAT_META.other;

  if (worstRatio >= 1) {
    banner.classList.add("danger");
    goalText.innerHTML = `<strong>${meta.label}</strong> goal exceeded by ${formatTime(spent - limitSecs)}`;
  } else if (worstRatio >= 0.8) {
    banner.classList.add("warning");
    goalText.innerHTML = `<strong>${meta.label}</strong> goal: <strong>${formatTime(remaining)}</strong> remaining`;
  } else {
    goalText.innerHTML = `<strong>${meta.label}</strong> goal: <strong>${formatTime(remaining)}</strong> remaining`;
  }
}

// ─── Main render ──────────────────────────────────────────────────────────────

let currentRange = "day";

async function render() {
  const storageKey = currentRange === "day" ? todayKey() : weekKey();
  const result     = await chrome.storage.local.get([storageKey, "goals"]);
  const data       = result[storageKey];
  const goals      = result.goals || {};

  const main    = document.getElementById("mainContent");
  const empty   = document.getElementById("emptyState");
  const settings= document.getElementById("settingsPanel");

  if (!data || !data.total) {
    main.classList.add("hidden");
    empty.classList.remove("hidden");
    settings.classList.add("hidden");
    document.getElementById("focusScore").textContent = "—";
    return;
  }

  main.classList.remove("hidden");
  empty.classList.add("hidden");

  const { categories = {}, domains = {}, total = 0 } = data;

  // Focus score (0-100): weighted by productive category time
  const productiveSecs = Object.entries(categories)
    .filter(([cat]) => PRODUCTIVE_CATS.has(cat))
    .reduce((sum, [, s]) => sum + s, 0);
  const focusScore = total ? Math.round((productiveSecs / total) * 100) : 0;
  document.getElementById("focusScore").textContent = focusScore;

  // Total time
  document.getElementById("totalTime").textContent = formatTime(total);

  // Top site
  const topEntry = Object.entries(domains).sort(([, a], [, b]) => b - a)[0];
  if (topEntry) {
    document.getElementById("topSite").textContent    = topEntry[0];
    document.getElementById("topSiteTime").textContent = formatTime(topEntry[1]) + " today";
  }

  // Donut
  const donutSegments = Object.entries(categories)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, secs]) => ({
      color: (CAT_META[cat] || CAT_META.other).color,
      pct:   secs / total
    }));
  buildDonut(donutSegments);

  // Category list
  renderCategories(categories, total);

  // Top sites
  renderSites(domains);

  // Goal banner
  renderGoalBanner(categories, goals);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function buildGoalInputs(goals) {
  const container = document.getElementById("goalInputs");
  container.innerHTML = "";

  const catsToShow = ["productivity", "social", "entertainment", "shopping", "news"];

  catsToShow.forEach(cat => {
    const meta  = CAT_META[cat];
    const value = goals[cat] || "";

    const row = document.createElement("div");
    row.className = "goal-input-row";
    row.innerHTML = `
      <div class="goal-dot" style="background:${meta.color}"></div>
      <span class="goal-input-label">${meta.label}</span>
      <input
        class="goal-input"
        type="number"
        min="0"
        max="999"
        placeholder="—"
        data-cat="${cat}"
        value="${value}"
      />
    `;
    container.appendChild(row);
  });
}

async function openSettings() {
  const result = await chrome.storage.local.get("goals");
  const goals  = result.goals || {};

  document.getElementById("mainContent").classList.add("hidden");
  document.getElementById("emptyState").classList.add("hidden");
  document.getElementById("settingsPanel").classList.remove("hidden");

  buildGoalInputs(goals);
}

function closeSettings() {
  document.getElementById("settingsPanel").classList.add("hidden");
  render();
}

async function saveGoals() {
  const inputs = document.querySelectorAll(".goal-input");
  const goals  = {};

  inputs.forEach(input => {
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val > 0) {
      goals[input.dataset.cat] = val;
    }
  });

  await chrome.storage.local.set({ goals });
  closeSettings();
}

async function clearData() {
  if (!confirm("Clear all tracking data? This cannot be undone.")) return;
  const all = await chrome.storage.local.get(null);
  const keysToDelete = Object.keys(all).filter(k => k.startsWith("day_") || k.startsWith("week_"));
  await chrome.storage.local.remove(keysToDelete);
  closeSettings();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.getElementById("dateLabel").textContent = formatDate();

// Tab switching
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentRange = tab.dataset.range;
    render();
  });
});

// Settings
document.getElementById("settingsBtn").addEventListener("click", openSettings);
document.getElementById("closeSettingsBtn").addEventListener("click", closeSettings);
document.getElementById("saveGoalsBtn").addEventListener("click", saveGoals);
document.getElementById("clearDataBtn").addEventListener("click", clearData);

// Initial render
render();