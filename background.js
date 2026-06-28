//background.js — timeFlies service worker
//to track active tab time and write to chrome.storage.local

importScripts("categorizer.js");

//current state tracking vars
let activeTabId = null;
let activeUrl = null;
let sessionStart = null; //timestamp (ms) when current session started
let isIdle = false; //if user hasn't touched computer for more than 60 sec

async function saveSession() {
  try {
    await chrome.storage.session.set({
      activeUrl, sessionStart, isIdle
    });
  } catch {
    // Fallback to local if session storage unavailable (older Chrome)
    await chrome.storage.local.set({
      _session: { activeUrl, sessionStart, isIdle }
    });
  }
}

async function loadSession() {
  try {
    const s = await chrome.storage.session.get(["activeUrl", "sessionStart", "isIdle"]);
    if (s.activeUrl && s.sessionStart) {
      activeUrl    = s.activeUrl;
      sessionStart = s.sessionStart;
      isIdle       = s.isIdle || false;
      return true;
    }
  } catch {
    // Fallback: try local storage session key
    const result = await chrome.storage.local.get("_session");
    const s = result._session;
    if (s && s.activeUrl && s.sessionStart) {
      activeUrl    = s.activeUrl;
      sessionStart = s.sessionStart;
      isIdle       = s.isIdle || false;
      return true;
    }
  }
  return false;
}

//helpers
function todayKey() { //return todays date -> ex) "day_2026_6_6"
  const d = new Date(); //date object
  return `day_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`; //since months are 0 indexed
}

function weekKey() { //returns todays year -> "week_2026_23"
  const d = new Date();
  const day = d.getDay(); //0 would be sunday
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day == 0 ? 6 : day - 1));
  return `week_${monday.getFullYear()}_${monday.getMonth() + 1}_${monday.getDate()}`;
}

/*
 Log elapsed seconds from sessionStart to now
 Writes under both the day key and week key
*/
async function commitTime() {
  if (!activeUrl || !sessionStart || isIdle) return; //make sure valid data

  const elapsed = Math.floor((Date.now() - sessionStart) / 1000); //elapsed time
  if (elapsed < 1) return;

  const domain = getDomain(activeUrl); //gets the website domain
  const category = categorize(activeUrl); //categorize function
  const dKey = todayKey(); //make storage key for this day
  const wKey = weekKey(); //same thing for this week

  const result = await chrome.storage.local.get([dKey, wKey]); //get the stored data for this day and this week
  const dayData = result[dKey] || { domains: {}, categories: {}, total: 0 }; //either loaded data or empty
  const weekData = result[wKey] || { domains: {}, categories: {}, total: 0 };

  //update for day
  dayData.domains[domain] = (dayData.domains[domain] || 0) + elapsed; //whatever is there + elapsed
  dayData.categories[category] = (dayData.categories[category] || 0) + elapsed;
  dayData.total += elapsed;

  //update for week
  weekData.domains[domain] = (weekData.domains[domain] || 0) + elapsed;
  weekData.categories[category] = (weekData.categories[category] || 0) + elapsed;
  weekData.total += elapsed;

  await chrome.storage.local.set({ [dKey]: dayData, [wKey]: weekData }); //update in local storage

  //updates badge
  updateBadge(dayData);

  //reset session start to now to avoud double commit
  sessionStart = Date.now();

  await saveSession();
}

/** Show total productive minutes on badge, red if over a limit */
async function updateBadge(dayData) {
  const prodSecs = dayData.categories["productivity"] || 0;
  const mins = Math.floor(prodSecs / 60);
  const text = mins >= 60 ? `${Math.floor(mins / 60)}h` : mins > 0 ? `${mins}m` : "";

  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: "#7c5cfc" });

  // Check goals
  const goals = (await chrome.storage.local.get("goals")).goals || {};
  for (const [cat, limitSecs] of Object.entries(goals)) {
    const spent = dayData.categories[cat] || 0;
    if (spent >= limitSecs) {
      chrome.action.setBadgeBackgroundColor({ color: "#e86b6b" });
      break;
    } else if (spent >= limitSecs * 0.8) {
      chrome.action.setBadgeBackgroundColor({ color: "#f5a623" });
    }
  }
}

//when a new tab is loaded
async function handleNewTab(tabId, url) {
  //commit time for the previous tab
  await commitTime();

  //skip extension pages
  if (!url || url.startsWith("chrome") || url.startsWith("about") || url.startsWith("edge")) {
    activeTabId = null;
    activeUrl = null;
    sessionStart = null;
    await saveSession();
    return;
  }

  activeTabId = tabId; //update info for what tab is active
  activeUrl = url;
  sessionStart = Date.now();
  await saveSession();
}

//tab switched
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await handleNewTab(tabId, tab.url);
  } catch { /* tab may not exist yet */ }
});

//URL changed in existing tab (user may go from google to youtube)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tabId === activeTabId) {
    await handleNewTab(tabId, tab.url);
  }
});

//window focus changed
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    //browser lost focus so commit and pause
    await commitTime(); //wait for this to finish
    sessionStart = null;
    await saveSession();
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab) await handleNewTab(tab.id, tab.url);
  } catch { /* ignore */ }
});

//idle detection

chrome.idle.setDetectionInterval(60); // 60 seconds idle threshold

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === "idle" || state === "locked") {
    await commitTime();
    isIdle       = true;
    sessionStart = null;
    await saveSession();
  } else if (state === "active") {
    isIdle = false;
    if (activeUrl) {
      sessionStart = Date.now();
      await saveSession();
    }
  }
});

//heartbeat alarm
//commits time every 30 seconds to prevent data loss if service worker sleeps
chrome.alarms.create("heartbeat", { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "heartbeat") return;

  // If in-memory state is gone (worker was killed), restore it first
  if (!sessionStart) {
    await loadSession();
  }
  await commitTime();
});

//on chrome startup
chrome.runtime.onStartup.addListener(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await handleNewTab(tab.id, tab.url);
  } catch { /* ignore */ }
});

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await handleNewTab(tab.id, tab.url);
  } catch { /* ignore */ }
});

//startup
async function init() {
  // Recover any session that was interrupted when Chrome last closed
  const recovered = await loadSession();

  if (recovered && sessionStart) {
    // Commit the recovered time (sessionStart → now).
    // This handles the gap between last heartbeat and Chrome closing.
    await commitTime();
  }

  // Now start tracking the currently active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await handleNewTab(tab.url);
  } catch { /* ignore */ }
}

chrome.runtime.onStartup.addListener(init);
chrome.runtime.onInstalled.addListener(init);