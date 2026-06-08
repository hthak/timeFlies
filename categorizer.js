// categorizer.js
// Maps domains to categories. Add your own domains to any list below.

const CATEGORY_MAP = {
  productivity: [
    "github.com", "gitlab.com", "bitbucket.org",
    "notion.so", "notionapp.com",
    "docs.google.com", "sheets.google.com", "slides.google.com", "drive.google.com",
    "calendar.google.com", "meet.google.com",
    "figma.com", "sketch.com", "zeplin.io",
    "linear.app", "jira.atlassian.com", "trello.com", "asana.com", "monday.com",
    "confluence.atlassian.com",
    "stackoverflow.com", "developer.mozilla.org", "devdocs.io",
    "vercel.com", "netlify.com", "heroku.com", "railway.app",
    "npmjs.com", "pypi.org", "crates.io",
    "codepen.io", "codesandbox.io", "replit.com",
    "slack.com", "teams.microsoft.com",
    "office.com", "outlook.com", "outlook.live.com",
    "zoom.us", "whereby.com", "loom.com",
    "dropbox.com", "box.com",
    "1password.com", "bitwarden.com",
    "obsidian.md", "roamresearch.com", "logseq.com",
    "airtable.com", "clickup.com", "basecamp.com"
  ],
  social: [
    "twitter.com", "x.com",
    "instagram.com", "threads.net",
    "facebook.com", "messenger.com",
    "linkedin.com",
    "reddit.com",
    "discord.com", "discordapp.com",
    "tiktok.com",
    "snapchat.com",
    "pinterest.com",
    "tumblr.com",
    "mastodon.social", "bsky.app",
    "whatsapp.com", "web.telegram.org"
  ],
  entertainment: [
    "youtube.com", "youtu.be",
    "netflix.com",
    "twitch.tv",
    "hulu.com", "disneyplus.com", "hbomax.com", "max.com", "peacocktv.com",
    "spotify.com", "music.apple.com", "soundcloud.com", "pandora.com", "tidal.com",
    "primevideo.com",
    "crunchyroll.com", "funimation.com",
    "vimeo.com", "dailymotion.com",
    "9gag.com", "ifunny.co",
    "chess.com", "lichess.org",
    "steampowered.com", "store.steampowered.com",
    "twitch.tv", "kick.com"
  ],
  shopping: [
    "amazon.com", "amazon.co.uk", "amazon.ca",
    "ebay.com",
    "etsy.com",
    "walmart.com", "target.com", "bestbuy.com",
    "shopify.com",
    "aliexpress.com", "alibaba.com", "wish.com", "temu.com",
    "newegg.com",
    "wayfair.com", "overstock.com",
    "costco.com", "samsclub.com",
    "homedepot.com", "lowes.com",
    "chewy.com", "petco.com",
    "zappos.com", "nordstrom.com", "macys.com",
    "gap.com", "zara.com", "hm.com",
    "shein.com"
  ],
  news: [
    "news.google.com",
    "nytimes.com", "washingtonpost.com", "wsj.com",
    "bbc.com", "bbc.co.uk", "theguardian.com",
    "reuters.com", "apnews.com", "bloomberg.com",
    "cnn.com", "foxnews.com", "msnbc.com", "nbcnews.com", "cbsnews.com", "abcnews.go.com",
    "techcrunch.com", "theverge.com", "wired.com", "arstechnica.com", "engadget.com",
    "hackernews.ycombinator.com", "news.ycombinator.com",
    "medium.com", "substack.com",
    "axios.com", "politico.com", "vox.com",
    "economist.com", "ft.com",
    "npr.org"
  ],
  search: [
    "google.com", "www.google.com",
    "bing.com",
    "duckduckgo.com",
    "search.yahoo.com", "yahoo.com",
    "ecosia.org", "startpage.com", "brave.com",
    "kagi.com"
  ],
  reference: [
    "wikipedia.org", "wikimedia.org",
    "wolframalpha.com",
    "dictionary.com", "merriam-webster.com",
    "quora.com",
    "reddit.com/r/explainlikeimfive",
    "investopedia.com",
    "webmd.com", "healthline.com", "mayoclinic.org",
    "irs.gov", "usa.gov",
    "coursera.org", "udemy.com", "edx.org", "khanacademy.org", "skillshare.com",
    "duolingo.com",
    "goodreads.com"
  ]
};

// Build reverse lookup: domain -> category
const DOMAIN_LOOKUP = {};
for (const [category, domains] of Object.entries(CATEGORY_MAP)) {
  for (const domain of domains) {
    DOMAIN_LOOKUP[domain] = category;
  }
}

// Heuristic patterns for uncategorized domains
const HEURISTIC_PATTERNS = [
  { pattern: /shop|store|buy|cart|order|checkout|deal|sale/i, category: "shopping" },
  { pattern: /news|times|post|herald|gazette|journal|tribune|daily/i, category: "news" },
  { pattern: /social|community|forum|discuss|chat/i, category: "social" },
  { pattern: /learn|course|school|edu|study|teach|academy|training/i, category: "reference" },
  { pattern: /game|play|casino|bet|poker/i, category: "entertainment" },
  { pattern: /app|tool|software|dev|code|api|docs/i, category: "productivity" },
];

const CATEGORY_META = {
  productivity: { label: "Productivity", color: "#7c5cfc", icon: "ti-briefcase" },
  social:       { label: "Social",       color: "#e86b6b", icon: "ti-users" },
  entertainment:{ label: "Entertainment",color: "#4fa3e8", icon: "ti-movie" },
  shopping:     { label: "Shopping",     color: "#f5a623", icon: "ti-shopping-cart" },
  news:         { label: "News",         color: "#5cb8a0", icon: "ti-news" },
  search:       { label: "Search",       color: "#a084f8", icon: "ti-search" },
  reference:    { label: "Reference",    color: "#74b8f0", icon: "ti-book" },
  other:        { label: "Other",        color: "#555568", icon: "ti-dots" }
};

/**
 * Given a full URL, return its category string.
 */
function categorize(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");

    // Direct match
    if (DOMAIN_LOOKUP[hostname]) return DOMAIN_LOOKUP[hostname];

    // Try with www prefix
    if (DOMAIN_LOOKUP["www." + hostname]) return DOMAIN_LOOKUP["www." + hostname];

    // Try subdomain stripping (e.g. mail.google.com -> google.com)
    const parts = hostname.split(".");
    if (parts.length > 2) {
      const root = parts.slice(-2).join(".");
      if (DOMAIN_LOOKUP[root]) return DOMAIN_LOOKUP[root];
    }

    // Heuristic pattern match on full hostname
    for (const { pattern, category } of HEURISTIC_PATTERNS) {
      if (pattern.test(hostname)) return category;
    }

    return "other";
  } catch {
    return "other";
  }
}

/**
 * Extract the root domain from a URL for display purposes.
 */
function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}