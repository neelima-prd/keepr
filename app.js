/* -------------------------------------------------------------
 * Keepr Application Logic
 * ------------------------------------------------------------- */

import { repository, INITIAL_DATA } from './src/repository.js';
import { supabase, isSupabaseConfigured } from './src/supabase.js';

// App State
let database = [];
let currentTab = "home";
let activeTypeFilter = "all";
let activeTagFilters = [];
let searchQuery = "";
let captureFiles = [];
let currentDetailItem = null;

// Auth State
let currentUser = null;
let currentSession = null;
let authMode = "signin"; // "signin" | "signup" | "forgot"

// Initialize App
document.addEventListener("DOMContentLoaded", async () => {
  await loadDatabase();
  await initAuth();
  initRouter();
  initThemeAndDensity();
  registerEventListeners();
  renderAll();
  lucide.createIcons();
});

/* -------------------------------------------------------------
 * Database Management (Repository Layer Abstraction)
 * ------------------------------------------------------------- */
async function loadDatabase() {
  database = await repository.getAll();
}

async function saveDatabase() {
  // Persistence operations go through repository service
}

async function resetDatabase() {
  database = await repository.reset();
  activeTypeFilter = "all";
  activeTagFilters = [];
  searchQuery = "";
  renderAll();
  showToast("Database reset to pristine state", "info");
}

/* -------------------------------------------------------------
 * Routing & Protected Routes
 * ------------------------------------------------------------- */
function initRouter() {
  const handleHash = () => {
    if (!currentUser) {
      showAuthView();
      return;
    }

    const hash = window.location.hash || "#home";
    const tabName = hash.substring(1);
    
    // Validate tab
    const tabs = ["home", "search", "settings"];
    if (tabs.includes(tabName)) {
      navigateToTab(tabName);
    } else {
      navigateToTab("home");
    }
  };

  window.addEventListener("hashchange", handleHash);
  handleHash(); // Run on load
}

function navigateToTab(tabName) {
  if (!currentUser) {
    showAuthView();
    return;
  }

  currentTab = tabName;
  
  // Update header tab active status
  document.querySelectorAll(".nav-tab").forEach(tab => {
    if (tab.getAttribute("data-tab") === tabName) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // Update visible panels
  document.querySelectorAll(".view-panel").forEach(panel => {
    if (panel.id === `view-panel-${tabName}` || panel.id === `view-${tabName}`) {
      panel.classList.add("active");
    } else {
      panel.classList.remove("active");
    }
  });

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Custom behavior per tab
  if (tabName === "search") {
    setTimeout(() => {
      document.getElementById("search-input").focus();
    }, 150);
  }
}

/* -------------------------------------------------------------
 * Authentication & Session Management (Supabase Auth)
 * ------------------------------------------------------------- */
async function initAuth() {
  if (isSupabaseConfigured()) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      handleSessionState(session);

      supabase.auth.onAuthStateChange((_event, session) => {
        handleSessionState(session);
      });
    } catch (e) {
      console.warn("Supabase auth check failed:", e);
      handleSessionState(null);
    }
  } else {
    // Check local demo session fallback
    const savedDemoSession = localStorage.getItem("keepr_auth_session");
    if (savedDemoSession) {
      try {
        const parsedSession = JSON.parse(savedDemoSession);
        handleSessionState(parsedSession);
      } catch (e) {
        handleSessionState(null);
      }
    } else {
      handleSessionState(null);
    }
  }

  setupAuthUI();
}

function handleSessionState(session) {
  currentSession = session;
  currentUser = session ? session.user : null;

  const headerEl = document.querySelector(".app-header");
  const floatingKeepBtn = document.getElementById("btn-open-keep");

  if (currentUser) {
    // Authenticated user
    if (headerEl) headerEl.style.display = "";
    if (floatingKeepBtn) floatingKeepBtn.style.display = "";
    
    renderUserProfile(currentUser);

    // If on auth route or invalid route, redirect to home
    const hash = window.location.hash || "#home";
    if (hash === "#auth" || !["#home", "#search", "#settings"].includes(hash)) {
      window.location.hash = "#home";
      navigateToTab("home");
    } else {
      navigateToTab(hash.substring(1));
    }
  } else {
    // Unauthenticated user
    if (headerEl) headerEl.style.display = "none";
    if (floatingKeepBtn) floatingKeepBtn.style.display = "none";

    showAuthView();
  }
}

function showAuthView() {
  window.location.hash = "#auth";
  document.querySelectorAll(".view-panel").forEach(panel => {
    if (panel.id === "view-auth") {
      panel.classList.add("active");
    } else {
      panel.classList.remove("active");
    }
  });
}

function renderUserProfile(user) {
  if (!user) return;
  const email = user.email || "user@keepr.app";
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || email.split("@")[0];
  const firstName = fullName.split(" ")[0] || fullName;
  const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
  const initial = fullName ? fullName.charAt(0).toUpperCase() : "K";

  // Header profile
  const headerAvatar = document.getElementById("header-profile-avatar");
  const headerName = document.getElementById("header-profile-name");
  if (headerName) headerName.textContent = firstName;
  if (headerAvatar) {
    if (avatarUrl) {
      headerAvatar.innerHTML = `
        <img src="${escapeHtml(avatarUrl)}" class="avatar-img" alt="${escapeHtml(fullName)}">
        <span class="profile-name" id="header-profile-name">${escapeHtml(firstName)}</span>
      `;
    } else {
      headerAvatar.innerHTML = `
        <span class="avatar-letter" id="header-avatar-letter">${escapeHtml(initial)}</span>
        <span class="profile-name" id="header-profile-name">${escapeHtml(firstName)}</span>
      `;
    }
  }

  // Settings profile card
  const settingsAvatar = document.getElementById("settings-avatar-large");
  const settingsName = document.getElementById("settings-profile-name");
  const settingsEmail = document.getElementById("settings-profile-email");
  
  if (settingsName) settingsName.textContent = fullName;
  if (settingsEmail) settingsEmail.textContent = email;
  if (settingsAvatar) {
    if (avatarUrl) {
      settingsAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" class="avatar-img-large" alt="${escapeHtml(fullName)}">`;
    } else {
      settingsAvatar.textContent = initial;
    }
  }

  // Home dynamic greeting
  const greetingEl = document.getElementById("dynamic-greeting");
  if (greetingEl) {
    const hour = new Date().getHours();
    let timeStr = "day";
    if (hour < 12) timeStr = "morning";
    else if (hour < 18) timeStr = "afternoon";
    else timeStr = "evening";
    greetingEl.textContent = `Good ${timeStr}, ${firstName} 👋`;
  }
}

function loginAsDemoGoogleUser() {
  const demoUser = {
    id: 'demo-google-user',
    email: 'james@keepr.app',
    user_metadata: {
      full_name: 'James Bond',
      avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80'
    }
  };
  const demoSession = { user: demoUser, access_token: 'demo-token' };
  localStorage.setItem('keepr_auth_session', JSON.stringify(demoSession));
  handleSessionState(demoSession);
  showToast("Signed in as James Bond (Google)", "success");
}

function setupAuthUI() {
  // Google Login CTA
  const googleBtn = document.getElementById("btn-google-login");
  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      hideAuthAlert();
      if (isSupabaseConfigured()) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin
          }
        });
        if (error) {
          const errMsg = error.message || "";
          const isProviderDisabled = errMsg.toLowerCase().includes("provider is not enabled") ||
                                     errMsg.toLowerCase().includes("unsupported provider") ||
                                     error.status === 400;
          if (isProviderDisabled) {
            showAuthAlertHTML(`
              <div style="font-weight: 600; margin-bottom: 4px;">Google Auth Not Enabled in Supabase</div>
              <div style="margin-bottom: 8px;">To enable Google Sign-In, go to your <strong>Supabase Dashboard</strong> &rarr; <strong>Authentication</strong> &rarr; <strong>Providers</strong> &rarr; enable <strong>Google</strong> and paste your Google OAuth Client ID & Secret.</div>
              <button id="btn-demo-google-fallback" type="button" class="btn btn-tertiary" style="width: 100%; font-size: 0.8125rem; padding: 6px 12px;">
                Continue with Demo Google Sign-In
              </button>
            `, "info");

            setTimeout(() => {
              document.getElementById("btn-demo-google-fallback")?.addEventListener("click", () => {
                loginAsDemoGoogleUser();
              });
            }, 50);
          } else {
            showAuthAlert(error.message, "error");
          }
        }
      } else {
        loginAsDemoGoogleUser();
      }
    });
  }

  // Auth Mode Tabs (Sign In / Sign Up / Forgot Password)
  const tabSignin = document.getElementById("tab-auth-signin");
  const tabSignup = document.getElementById("tab-auth-signup");
  const tabForgot = document.getElementById("tab-auth-forgot");

  const setAuthMode = (mode) => {
    authMode = mode;
    hideAuthAlert();

    [tabSignin, tabSignup, tabForgot].forEach(tab => {
      if (tab) {
        if (tab.getAttribute("data-auth-mode") === mode) {
          tab.classList.add("active");
        } else {
          tab.classList.remove("active");
        }
      }
    });

    const fieldName = document.getElementById("auth-field-name");
    const fieldPassword = document.getElementById("auth-field-password");
    const submitBtnSpan = document.querySelector("#btn-auth-submit span");

    if (mode === "signin") {
      if (fieldName) fieldName.style.display = "none";
      if (fieldPassword) fieldPassword.style.display = "block";
      if (submitBtnSpan) submitBtnSpan.textContent = "Sign In";
    } else if (mode === "signup") {
      if (fieldName) fieldName.style.display = "block";
      if (fieldPassword) fieldPassword.style.display = "block";
      if (submitBtnSpan) submitBtnSpan.textContent = "Create Account";
    } else if (mode === "forgot") {
      if (fieldName) fieldName.style.display = "none";
      if (fieldPassword) fieldPassword.style.display = "none";
      if (submitBtnSpan) submitBtnSpan.textContent = "Send Reset Link";
    }
  };

  if (tabSignin) tabSignin.addEventListener("click", () => setAuthMode("signin"));
  if (tabSignup) tabSignup.addEventListener("click", () => setAuthMode("signup"));
  if (tabForgot) tabForgot.addEventListener("click", () => setAuthMode("forgot"));

  // Email Form Submit
  const emailForm = document.getElementById("auth-email-form");
  if (emailForm) {
    emailForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideAuthAlert();

      const nameVal = document.getElementById("auth-input-name")?.value.trim() || "";
      const emailVal = document.getElementById("auth-input-email")?.value.trim() || "";
      const passVal = document.getElementById("auth-input-password")?.value || "";

      if (!emailVal) {
        showAuthAlert("Please enter a valid email address.", "error");
        return;
      }

      const submitBtn = document.getElementById("btn-auth-submit");
      if (submitBtn) submitBtn.disabled = true;

      try {
        if (authMode === "signin") {
          if (isSupabaseConfigured()) {
            const { data, error } = await supabase.auth.signInWithPassword({
              email: emailVal,
              password: passVal
            });
            if (error) {
              showAuthAlert(error.message, "error");
            } else {
              showToast("Signed in successfully", "success");
            }
          } else {
            const fullName = emailVal.split("@")[0];
            const capitalized = fullName.charAt(0).toUpperCase() + fullName.slice(1);
            const demoUser = {
              id: `demo-user-${Date.now()}`,
              email: emailVal,
              user_metadata: { full_name: capitalized }
            };
            const demoSession = { user: demoUser, access_token: 'demo-token' };
            localStorage.setItem('keepr_auth_session', JSON.stringify(demoSession));
            handleSessionState(demoSession);
            showToast(`Welcome back, ${capitalized}`, "success");
          }
        } else if (authMode === "signup") {
          if (isSupabaseConfigured()) {
            const { data, error } = await supabase.auth.signUp({
              email: emailVal,
              password: passVal,
              options: {
                data: { full_name: nameVal }
              }
            });
            if (error) {
              showAuthAlert(error.message, "error");
            } else {
              if (data?.user && !data?.session) {
                showAuthAlert("Account created! Check your email to confirm your account.", "success");
              } else {
                showToast("Account created successfully", "success");
              }
            }
          } else {
            const fullName = nameVal || emailVal.split("@")[0];
            const demoUser = {
              id: `demo-user-${Date.now()}`,
              email: emailVal,
              user_metadata: { full_name: fullName }
            };
            const demoSession = { user: demoUser, access_token: 'demo-token' };
            localStorage.setItem('keepr_auth_session', JSON.stringify(demoSession));
            handleSessionState(demoSession);
            showToast(`Account created! Welcome, ${fullName}`, "success");
          }
        } else if (authMode === "forgot") {
          if (isSupabaseConfigured()) {
            const { error } = await supabase.auth.resetPasswordForEmail(emailVal, {
              redirectTo: window.location.origin
            });
            if (error) {
              showAuthAlert(error.message, "error");
            } else {
              showAuthAlert("Password reset instructions sent to your email.", "success");
            }
          } else {
            showAuthAlert(`Password reset link sent to ${emailVal}`, "success");
          }
        }
      } catch (err) {
        showAuthAlert(err.message || "An unexpected error occurred", "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Sign Out Handler
  const signOutBtn = document.getElementById("btn-signout");
  if (signOutBtn) {
    const newSignOutBtn = signOutBtn.cloneNode(true);
    signOutBtn.parentNode.replaceChild(newSignOutBtn, signOutBtn);
    newSignOutBtn.addEventListener("click", async () => {
      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      }
      localStorage.removeItem("keepr_auth_session");
      handleSessionState(null);
      showToast("Signed out successfully", "info");
    });
  }
}

function showAuthAlert(msg, type = "error") {
  const alertEl = document.getElementById("auth-alert");
  if (!alertEl) return;
  alertEl.className = `auth-alert ${type}`;
  alertEl.textContent = msg;
  alertEl.style.display = "block";
}

function showAuthAlertHTML(htmlContent, type = "info") {
  const alertEl = document.getElementById("auth-alert");
  if (!alertEl) return;
  alertEl.className = `auth-alert ${type}`;
  alertEl.innerHTML = htmlContent;
  alertEl.style.display = "block";
}

function hideAuthAlert() {
  const alertEl = document.getElementById("auth-alert");
  if (alertEl) alertEl.style.display = "none";
}

/* -------------------------------------------------------------
 * Theme & Spacing Density Settings
 * ------------------------------------------------------------- */
function initThemeAndDensity() {
  // Theme
  const storedTheme = localStorage.getItem("keepr_theme") || "light";
  document.documentElement.setAttribute("data-theme", storedTheme);
  
  const themeToggle = document.getElementById("theme-toggle-switch");
  themeToggle.checked = (storedTheme === "dark");

  // Density
  const storedDensity = localStorage.getItem("keepr_density") || "comfortable";
  document.documentElement.setAttribute("data-density", storedDensity);
  
  document.querySelectorAll(".density-btn").forEach(btn => {
    if (btn.getAttribute("data-density") === storedDensity) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

function toggleTheme(e) {
  const isDark = e.target.checked;
  const theme = isDark ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("keepr_theme", theme);
  showToast(`Switched to ${theme} mode`, "info");
}

function setDensity(density) {
  document.documentElement.setAttribute("data-density", density);
  localStorage.setItem("keepr_density", density);
  
  document.querySelectorAll(".density-btn").forEach(btn => {
    if (btn.getAttribute("data-density") === density) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  showToast(`Density set to ${density}`, "info");
}

/* -------------------------------------------------------------
 * Rendering Logic
 * ------------------------------------------------------------- */
function renderAll() {
  renderHomeGreeting();
  renderHomeRecentGrid();
  renderHomeSuggestedTags();
  renderSearchFilters();
  renderSearchResultsGrid();
  renderSettingsStats();
}

// 1. Home Greeting
function renderHomeGreeting() {
  const greetingEl = document.getElementById("dynamic-greeting");
  const hours = new Date().getHours();
  let greetingText = "Good afternoon, Neelima 👋";
  
  if (hours >= 5 && hours < 12) {
    greetingText = "Good morning, Neelima 🌅";
  } else if (hours >= 12 && hours < 17) {
    greetingText = "Good afternoon, Neelima 👋";
  } else if (hours >= 17 && hours < 21) {
    greetingText = "Good evening, Neelima 🌙";
  } else {
    greetingText = "Good night, Neelima ✨";
  }
  
  greetingEl.innerHTML = greetingText;
}

// Helper to format relative time
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function autoLinkUrls(text) {
  if (!text) return "";
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

function stripHtml(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  let text = (tmp.textContent || tmp.innerText || "").trim();
  if (text.includes("<") && text.includes(">")) {
    tmp.innerHTML = text;
    text = (tmp.textContent || tmp.innerText || "").trim();
  }
  return text;
}

function sanitizeAndFormatHtml(html) {
  if (!html) return "";

  let input = String(html).trim();
  if (!input) return "";

  // Unescape entity-encoded HTML strings if present (e.g. &lt;b&gt;)
  if ((input.includes("&lt;") || input.includes("&gt;")) && !input.includes("<")) {
    const txt = document.createElement("textarea");
    txt.innerHTML = input;
    input = txt.value;
  }

  // Check if pure plain text without tags
  const hasTags = /<[a-z][\s\S]*>/i.test(input);
  if (!hasTags) {
    const escaped = escapeHtml(input);
    const lineFormatted = escaped.replace(/\r?\n/g, "<br>");
    return autoLinkUrls(lineFormatted);
  }

  // Sanitize HTML using DOMParser
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(input, "text/html");

    const allowedTags = new Set([
      "b", "i", "strong", "em", "u", "s", "p", "div", "br",
      "ul", "ol", "li", "blockquote", "a", "span", "input",
      "code", "pre", "h1", "h2", "h3", "h4", "h5", "h6"
    ]);

    const sanitizeNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return;
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        if (!allowedTags.has(tagName)) {
          while (node.firstChild) {
            node.parentNode.insertBefore(node.firstChild, node);
          }
          node.parentNode.removeChild(node);
          return;
        }

        const attrs = Array.from(node.attributes);
        for (const attr of attrs) {
          const name = attr.name.toLowerCase();
          if (tagName === "a" && name === "href") {
            if (!attr.value.startsWith("http://") && !attr.value.startsWith("https://") && !attr.value.startsWith("mailto:") && !attr.value.startsWith("#")) {
              node.setAttribute("href", "#");
            } else {
              node.setAttribute("target", "_blank");
              node.setAttribute("rel", "noopener noreferrer");
            }
          } else if (tagName === "input" && (name === "type" || name === "checked" || name === "contenteditable")) {
            // Keep checkbox attributes
          } else if (tagName === "ul" && name === "class") {
            // Keep class="checklist"
          } else {
            node.removeAttribute(attr.name);
          }
        }

        Array.from(node.childNodes).forEach(sanitizeNode);
      }
    };

    Array.from(doc.body.childNodes).forEach(sanitizeNode);
    return doc.body.innerHTML;
  } catch (err) {
    return escapeHtml(input);
  }
}

function formatMetaDate(timestamp) {
  const options = { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" };
  return new Date(timestamp).toLocaleDateString("en-US", options);
}

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

function extractUrls(text) {
  if (!text) return [];
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

function getFilePreviewIcon(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "🖼";
  if (ext === "pdf") return "📄";
  if (["doc", "docx", "txt"].includes(ext)) return "📄";
  return "📊";
}

function isImageFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  return ["png", "jpg", "jpeg", "webp", "gif"].includes(ext) || file.type.startsWith("image/");
}

function isPdfFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  return ext === "pdf" || file.type === "application/pdf";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (diff < 60000) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  
  // Absolute date format
  const dateObj = new Date(timestamp);
  return dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Helper: map type to Lucide icons
function getTypeIcon(type) {
  switch (type) {
    case "link": return "link";
    case "note": return "file-text";
    case "image": return "image";
    case "pdf": return "file-digit";
    case "quote": return "quote";
    default: return "bookmark";
  }
}

// Helper: Generate Card HTML
function createCardElement(item) {
  const card = document.createElement("div");
  card.className = `kept-card card-${item.type}`;
  card.setAttribute("data-id", item.id);
  
  // Custom headers / preview areas based on type
  let customBodyHtml = "";
  
  if (item.type === "link") {
    customBodyHtml = `
      <div class="card-link-info">
        <div class="favicon-box">
          <img src="https://www.google.com/s2/favicons?sz=64&domain=${item.domain || 'example.com'}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23666%22 stroke-width=%222%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22/></svg>'">
        </div>
        <div class="link-meta-text">
          <span class="link-domain">${item.domain || 'Link Source'}</span>
          <span class="link-type">web link</span>
        </div>
      </div>
      <h3 class="card-title">${item.title}</h3>
      <p class="card-snippet">${stripHtml(item.content)}</p>
    `;
  } else if (item.type === "quote") {
    customBodyHtml = `
      <div class="quote-content">"${stripHtml(item.content)}"</div>
      <span class="quote-author">— ${item.author || 'Unknown'}</span>
    `;
  } else if (item.type === "image") {
    // If we have local imageUrl or base64
    const imgUrl = item.imageUrl || "data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22 viewBox=%220 0 100 100%22 fill=%22%23eaeaea%22></svg>";
    customBodyHtml = `
      <div class="card-image-preview" style="background-image: url('${imgUrl}');"></div>
      <div class="card-content-wrap">
        <h3 class="card-title">${item.title}</h3>
        <p class="card-snippet">${stripHtml(item.content)}</p>
      </div>
    `;
  } else if (item.type === "pdf") {
    customBodyHtml = `
      <div class="pdf-preview-box">
        <div class="pdf-mock-page"></div>
        <div class="pdf-mock-page"></div>
        <div class="pdf-mock-page">PDF</div>
      </div>
      <h3 class="card-title">${item.title}</h3>
      <p class="card-snippet">${stripHtml(item.content)}</p>
    `;
  } else {
    // Note or general content
    customBodyHtml = `
      <h3 class="card-title">${item.title}</h3>
      <p class="card-snippet">${stripHtml(item.content)}</p>
    `;
  }

  // Set card contents
  const typeLabel = item.type.toUpperCase();
  const iconName = getTypeIcon(item.type);
  const relativeTime = formatRelativeTime(item.createdAt);
  const primaryTag = item.tags && item.tags.length > 0 ? item.tags[0] : "";
  
  // Base skeleton template
  if (item.type === "image") {
    card.innerHTML = `
      <div class="card-header" style="position: absolute; top: 12px; left: 16px; right: 16px; z-index: 5; pointer-events: none; text-shadow: 0 1px 4px rgba(0,0,0,0.15);">
        <span class="badge" style="background: rgba(255,255,255,0.9); backdrop-filter: blur(4px); border: 1px solid rgba(0,0,0,0.06); color: #222;">
          <i data-lucide="${iconName}" style="width: 12px; height: 12px;"></i>
          <span>${typeLabel}</span>
        </span>
        <span class="card-date" style="background: rgba(255,255,255,0.9); backdrop-filter: blur(4px); border: 1px solid rgba(0,0,0,0.06); color: #222; padding: 2px 8px; border-radius: 9999px;">${relativeTime}</span>
      </div>
      ${customBodyHtml}
      <!-- Wrap image card footer -->
      <div style="padding: 0 16px 16px 16px; width: 100%; border-top: 1px solid var(--color-border); margin-top: 0;">
        <div class="card-meta" style="margin-top: 8px; padding-top: 0; border-top: none;">
          <span class="card-source-domain">${item.source || 'upload'}</span>
          ${primaryTag ? `<span class="card-tag">${primaryTag}</span>` : ''}
        </div>
      </div>
    `;
  } else {
    card.innerHTML = `
      <div class="card-top">
        <div class="card-header">
          <span class="badge">
            <i data-lucide="${iconName}" style="width: 12px; height: 12px;"></i>
            <span>${typeLabel}</span>
          </span>
          <span class="card-date">${relativeTime}</span>
        </div>
        ${customBodyHtml}
      </div>
      <div class="card-meta">
        <span class="card-source-domain">${item.source || 'manual'}</span>
        ${primaryTag ? `<span class="card-tag">${primaryTag}</span>` : ''}
      </div>
    `;
  }

  // Click handler to open detail drawer
  card.addEventListener("click", () => {
    openDetailDrawer(item);
  });

  return card;
}

// 2. Home: Recently Kept Grid
function renderHomeRecentGrid() {
  const gridEl = document.getElementById("recent-items-grid");
  const recentSectionEl = document.getElementById("home-recent-section");
  const tagsSectionEl = document.getElementById("home-tags-section");
  const welcomeEmptyEl = document.getElementById("home-welcome-empty-state");

  if (!gridEl) return;
  gridEl.innerHTML = "";

  if (database.length === 0) {
    if (recentSectionEl) recentSectionEl.style.display = "none";
    if (tagsSectionEl) tagsSectionEl.style.display = "none";
    if (welcomeEmptyEl) welcomeEmptyEl.style.display = "flex";
    return;
  }

  // Database has items
  if (recentSectionEl) recentSectionEl.style.display = "block";
  if (tagsSectionEl) tagsSectionEl.style.display = "block";
  if (welcomeEmptyEl) welcomeEmptyEl.style.display = "none";

  // Sort items: newest first, take top 6
  const sorted = [...database].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);

  sorted.forEach(item => {
    gridEl.appendChild(createCardElement(item));
  });
}

// Helper to count tag frequencies
function getTagsListWithCounts() {
  const counts = {};
  database.forEach(item => {
    if (item.tags) {
      item.tags.forEach(tag => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    }
  });
  
  // Sort by count descending
  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

// 3. Home: Suggested Tags Cloud
function renderHomeSuggestedTags() {
  const containerEl = document.getElementById("suggested-tags-cloud");
  containerEl.innerHTML = "";
  
  const tagsList = getTagsListWithCounts();
  
  if (tagsList.length === 0) {
    containerEl.innerHTML = `<span class="empty-placeholder">No tags created yet.</span>`;
    return;
  }

  tagsList.forEach(({ tag, count }) => {
    const badge = document.createElement("button");
    badge.className = "tag-badge";
    badge.innerHTML = `${tag} <span class="tag-count">${count}</span>`;
    badge.addEventListener("click", () => {
      // Trigger search filter with this tag
      activeTypeFilter = "all";
      activeTagFilters = [tag];
      
      // Update UI filters
      window.location.hash = "#search";
      renderAll();
      lucide.createIcons();
    });
    containerEl.appendChild(badge);
  });
}

// 4. Search View Filters
function renderSearchFilters() {
  // Render content type chips
  document.querySelectorAll(".chip-filter[data-filter-type]").forEach(chip => {
    const type = chip.getAttribute("data-filter-type");
    if (type === activeTypeFilter) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });

  // Render dynamic tag chips scroll row
  const tagsContainer = document.getElementById("search-tag-chips");
  tagsContainer.innerHTML = "";
  
  const tagsList = getTagsListWithCounts();
  
  tagsList.forEach(({ tag }) => {
    const chip = document.createElement("button");
    const isActive = activeTagFilters.includes(tag);
    chip.className = `chip-filter ${isActive ? 'active' : ''}`;
    chip.textContent = tag;
    chip.addEventListener("click", () => {
      toggleTagFilter(tag);
    });
    tagsContainer.appendChild(chip);
  });
}

function toggleTagFilter(tag) {
  const index = activeTagFilters.indexOf(tag);
  if (index > -1) {
    activeTagFilters.splice(index, 1);
  } else {
    activeTagFilters.push(tag);
  }
  renderAll();
  lucide.createIcons();
}

// 5. Search: Grid results & Filtering logic
function renderSearchResultsGrid() {
  const gridEl = document.getElementById("search-results-grid");
  const emptyStateEl = document.getElementById("search-empty-state");
  const countTextEl = document.getElementById("results-count-text");
  
  if (!gridEl || !emptyStateEl) return;
  gridEl.innerHTML = "";
  
  // 1. If database has no saved artifacts at all
  if (database.length === 0) {
    gridEl.style.display = "none";
    if (countTextEl) countTextEl.textContent = "0 results";
    emptyStateEl.style.display = "flex";
    emptyStateEl.innerHTML = `
      <div class="welcome-illustration-wrap">
        <div class="welcome-icon-glow"></div>
        <div class="welcome-icon-badge">
          <i data-lucide="bookmark" class="welcome-main-icon"></i>
        </div>
      </div>
      <h3 class="welcome-title" style="font-size: 1.35rem; margin-bottom: 8px;">Nothing kept yet.</h3>
      <div class="welcome-description" style="margin-bottom: 20px;">
        <p class="welcome-tagline" style="font-size: 0.95rem; margin-bottom: 4px;">Capture anything. Find everything.</p>
        <p class="welcome-subtext" style="font-size: 0.875rem;">Paste a link, drop a screenshot, upload a PDF, or write your first note.</p>
      </div>
      <button class="btn btn-primary welcome-cta-btn" id="search-welcome-keep-btn" type="button">
        <i data-lucide="plus"></i>
        <span>Keep your first memory</span>
      </button>
    `;
    const searchKeepBtn = document.getElementById("search-welcome-keep-btn");
    if (searchKeepBtn) {
      searchKeepBtn.addEventListener("click", openKeepModal);
    }
    return;
  }

  // 2. Filter items
  const filtered = database.filter(item => {
    // Filter by content type
    if (activeTypeFilter !== "all" && item.type !== activeTypeFilter) {
      return false;
    }
    
    // Filter by tag filters (matches ALL selected tags)
    if (activeTagFilters.length > 0) {
      const hasAllTags = activeTagFilters.every(tag => item.tags && item.tags.includes(tag));
      if (!hasAllTags) return false;
    }
    
    // Filter by search query text
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title && item.title.toLowerCase().includes(q);
      const matchContent = item.content && item.content.toLowerCase().includes(q);
      const matchDomain = item.domain && item.domain.toLowerCase().includes(q);
      const matchTags = item.tags && item.tags.some(tag => tag.toLowerCase().includes(q));
      
      if (!matchTitle && !matchContent && !matchDomain && !matchTags) {
        return false;
      }
    }
    
    return true;
  });

  // Sort newest first
  filtered.sort((a, b) => b.createdAt - a.createdAt);

  // Update counts
  if (countTextEl) countTextEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'result' : 'results'}`;

  if (filtered.length === 0) {
    gridEl.style.display = "none";
    emptyStateEl.style.display = "flex";
    emptyStateEl.innerHTML = `
      <div class="empty-icon-wrap">
        <i data-lucide="inbox"></i>
      </div>
      <h3 class="empty-title">Couldn't find it this time.</h3>
      <p class="empty-description">Try a different search term or remove some filter chips.</p>
      <button class="btn btn-secondary" id="empty-clear-filters" type="button">Clear all filters</button>
    `;
    const clearBtn = document.getElementById("empty-clear-filters");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        activeTypeFilter = "all";
        activeTagFilters = [];
        searchQuery = "";
        const searchInput = document.getElementById("search-input");
        const clearSearchBtn = document.getElementById("clear-search");
        if (searchInput) searchInput.value = "";
        if (clearSearchBtn) clearSearchBtn.style.display = "none";
        renderAll();
        lucide.createIcons();
      });
    }
  } else {
    gridEl.style.display = "grid";
    emptyStateEl.style.display = "none";
    filtered.forEach(item => {
      gridEl.appendChild(createCardElement(item));
    });
  }
}

// 6. Settings profile & stats
function renderSettingsStats() {
  const statsKept = document.getElementById("stats-kept-count");
  const statsTags = document.getElementById("stats-tags-count");
  
  statsKept.textContent = database.length;
  
  const uniqueTags = new Set();
  database.forEach(item => {
    if (item.tags) {
      item.tags.forEach(t => uniqueTags.add(t));
    }
  });
  statsTags.textContent = uniqueTags.size;
}

/* -------------------------------------------------------------
 * Event Listeners & Interactions Register
 * ------------------------------------------------------------- */
function registerEventListeners() {
  // Navigation Tabs clicks
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const tabName = tab.getAttribute("data-tab");
      window.location.hash = tabName;
    });
  });

  // Home: Quick search box trigger
  document.getElementById("quick-search-box").addEventListener("click", () => {
    window.location.hash = "#search";
  });

  // Home: View all link
  document.getElementById("home-view-all").addEventListener("click", () => {
    window.location.hash = "#search";
  });

  // Search View Input
  const searchInput = document.getElementById("search-input");
  const clearSearchBtn = document.getElementById("clear-search");
  
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    
    if (searchQuery.length > 0) {
      clearSearchBtn.style.display = "block";
    } else {
      clearSearchBtn.style.display = "none";
    }
    
    renderSearchResultsGrid();
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchQuery = "";
    clearSearchBtn.style.display = "none";
    searchInput.focus();
    renderSearchResultsGrid();
  });

  // Content Type Filter Chips
  document.querySelectorAll(".chip-filter[data-filter-type]").forEach(chip => {
    chip.addEventListener("click", () => {
      activeTypeFilter = chip.getAttribute("data-filter-type");
      renderAll();
      lucide.createIcons();
    });
  });

  // Search View Empty State: Clear Filters
  document.getElementById("empty-clear-filters").addEventListener("click", () => {
    activeTypeFilter = "all";
    activeTagFilters = [];
    searchInput.value = "";
    searchQuery = "";
    clearSearchBtn.style.display = "none";
    renderAll();
    lucide.createIcons();
  });

  // Settings: Theme Toggle
  document.getElementById("theme-toggle-switch").addEventListener("change", toggleTheme);

  // Settings: Spacing Density Toggles
  document.querySelectorAll(".density-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      setDensity(btn.getAttribute("data-density"));
    });
  });

  // Settings: Export database
  document.getElementById("btn-export").addEventListener("click", exportData);
  
  // Home Welcome Empty State Action
  const welcomeKeepBtn = document.getElementById("welcome-keep-btn");
  if (welcomeKeepBtn) {
    welcomeKeepBtn.addEventListener("click", openKeepModal);
  }

  document.querySelectorAll(".welcome-feature-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      openKeepModal();
    });
  });

  // Settings: Reset DB
  document.getElementById("btn-reset-db")?.addEventListener("click", async () => {
    await resetDatabase();
  });

  // Settings: Clear workspace
  document.getElementById("btn-clear-db")?.addEventListener("click", async () => {
    database = await repository.clear();
    renderAll();
    lucide.createIcons();
    showToast("Workspace cleared — all memories removed", "info");
  });

  // Settings: Sign out mock
  document.getElementById("btn-signout").addEventListener("click", () => {
    showToast("This is a visual prototype. Auth features are disabled.", "info");
  });

  // Floating Action: "+ Keep" button clicks
  document.getElementById("btn-open-keep").addEventListener("click", openKeepModal);
  
  // Keep Modal: Close actions
  document.getElementById("btn-close-keep").addEventListener("click", closeKeepModal);
  document.getElementById("btn-cancel-keep").addEventListener("click", closeKeepModal);
  document.getElementById("keep-modal").addEventListener("click", (e) => {
    if (e.target.id === "keep-modal") closeKeepModal();
  });

  // Keep Modal: Single capture surface
  const captureEditor = document.getElementById("keep-capture-editor");
  const fileInput = document.getElementById("keep-file");

  captureEditor.addEventListener("input", renderCapturePreviews);
  captureEditor.addEventListener("paste", handleCapturePaste);

  captureEditor.addEventListener("dragover", (e) => {
    e.preventDefault();
    captureEditor.classList.add("dragover");
  });

  captureEditor.addEventListener("dragleave", () => {
    captureEditor.classList.remove("dragover");
  });

  captureEditor.addEventListener("drop", (e) => {
    e.preventDefault();
    captureEditor.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      addCaptureFiles(Array.from(e.dataTransfer.files));
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      addCaptureFiles(Array.from(e.target.files));
      fileInput.value = "";
    }
  });

  // Rich text toolbars
  document.querySelectorAll(".capture-toolbar .toolbar-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const toolbar = btn.closest(".capture-toolbar");
      const editorId = toolbar && toolbar.id === "detail-toolbar" ? "detail-note" : "keep-capture-editor";
      handleToolbarCommand(btn, editorId);
    });
  });

  // Keep Modal Submit form
  document.getElementById("keep-form").addEventListener("submit", handleKeepItemSubmit);

  // New custom tag input on Enter in Keep modal
  document.getElementById("new-tag-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = e.target.value.trim();
      if (val) {
        addNewTagToModal(val);
        e.target.value = "";
      }
    }
  });

  // Detail Drawer: Close actions
  document.getElementById("btn-close-detail").addEventListener("click", closeDetailDrawer);
  document.getElementById("btn-cancel-detail").addEventListener("click", closeDetailDrawer);
  document.getElementById("detail-drawer").addEventListener("click", (e) => {
    if (e.target.id === "detail-drawer") closeDetailDrawer();
  });

  // Detail Drawer: Edit submit handler
  document.getElementById("btn-save-detail").addEventListener("click", handleSaveDetailChanges);

  // Detail Drawer: Delete action
  document.getElementById("btn-delete-detail").addEventListener("click", handleDeleteDetailItem);

  // Custom tag input in Detail Drawer
  document.getElementById("detail-new-tag").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = e.target.value.trim();
      if (val && currentDetailItem) {
        if (!currentDetailItem.tags) currentDetailItem.tags = [];
        if (!currentDetailItem.tags.includes(val)) {
          currentDetailItem.tags.push(val);
          renderDetailTags();
        }
        e.target.value = "";
      }
    }
  });

  // Keyboard Shortcuts
  window.addEventListener("keydown", handleKeyboardShortcuts);
}

/* -------------------------------------------------------------
 * Keep Modal Interactions & Actions
 * ------------------------------------------------------------- */
let selectedModalTags = [];

function handleToolbarCommand(btn, targetEditorId = "keep-capture-editor") {
  const command = btn.getAttribute("data-command");
  const value = btn.getAttribute("data-value") || null;
  const editor = document.getElementById(targetEditorId);
  if (editor) editor.focus();

  if (command === "checklist") {
    document.execCommand("insertHTML", false, '<ul class="checklist"><li><input type="checkbox" contenteditable="false"> </li></ul>');
    return;
  }

  if (command === "createLink") {
    const url = prompt("Enter link URL:");
    if (url) document.execCommand("createLink", false, url);
    return;
  }

  document.execCommand(command, false, value);
}

function handleCapturePaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;

  const files = [];
  for (const item of items) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }

  if (files.length > 0) {
    e.preventDefault();
    addCaptureFiles(files);
  }
}

function addCaptureFiles(files) {
  files.forEach(file => {
    if (!captureFiles.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
      captureFiles.push(file);
    }
  });
  renderCapturePreviews();
}

function removeCaptureFile(index) {
  captureFiles.splice(index, 1);
  renderCapturePreviews();
}

function getCaptureEditorText() {
  return stripHtml(document.getElementById("keep-capture-editor").innerHTML);
}

function renderCapturePreviews() {
  const container = document.getElementById("capture-previews");
  container.innerHTML = "";

  const editorText = getCaptureEditorText();
  const urls = extractUrls(editorText);

  urls.forEach(url => {
    let domain = "Link";
    try {
      domain = new URL(url).hostname.replace("www.", "");
    } catch (err) {
      domain = "Link";
    }

    const card = document.createElement("div");
    card.className = "capture-preview-card capture-link-preview";
    card.innerHTML = `
      <div class="preview-favicon">
        <img src="https://www.google.com/s2/favicons?sz=64&domain=${domain}" onerror="this.style.display='none'">
      </div>
      <div class="preview-details">
        <span class="preview-title">${domain}</span>
        <span class="preview-subtitle">${url}</span>
      </div>
    `;
    container.appendChild(card);
  });

  captureFiles.forEach((file, index) => {
    const card = document.createElement("div");
    card.className = "capture-preview-card capture-file-preview";

    let thumbHtml = `<span class="preview-icon">${getFilePreviewIcon(file)}</span>`;
    if (isImageFile(file)) {
      const objectUrl = URL.createObjectURL(file);
      thumbHtml = `<img class="preview-thumb" src="${objectUrl}" alt="${file.name}">`;
    }

    card.innerHTML = `
      ${thumbHtml}
      <div class="preview-details">
        <span class="preview-title">${file.name}</span>
        <span class="preview-subtitle">${isPdfFile(file) ? "PDF document" : isImageFile(file) ? "Image" : "Document"}</span>
      </div>
      <button class="preview-remove" type="button" aria-label="Remove file">
        <i data-lucide="x"></i>
      </button>
    `;

    card.querySelector(".preview-remove").addEventListener("click", () => {
      removeCaptureFile(index);
    });

    container.appendChild(card);
  });

  lucide.createIcons();
}

function openKeepModal() {
  const modal = document.getElementById("keep-modal");
  modal.classList.add("active");
  selectedModalTags = [];
  captureFiles = [];

  document.getElementById("keep-form").reset();
  document.getElementById("keep-capture-editor").innerHTML = "";
  document.getElementById("capture-previews").innerHTML = "";

  renderModalTagSelectors();

  setTimeout(() => {
    document.getElementById("keep-capture-editor").focus();
  }, 200);

  updateModalStatus();
  lucide.createIcons();
}

function closeKeepModal() {
  document.getElementById("keep-modal").classList.remove("active");
}

function renderModalTagSelectors() {
  const container = document.getElementById("keep-tags-selector");
  container.innerHTML = "";
  
  // Fetch existing tags
  const tagsList = getTagsListWithCounts().map(t => t.tag);
  
  // Fallback defaults if empty
  const defaultTags = ["Product", "Design", "AI", "Reading", "Inspiration", "Personal"];
  const displayTags = tagsList.length > 0 ? tagsList : defaultTags;
  
  displayTags.forEach(tag => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip-tag-select";
    chip.textContent = tag;
    
    chip.addEventListener("click", () => {
      const idx = selectedModalTags.indexOf(tag);
      if (idx > -1) {
        selectedModalTags.splice(idx, 1);
        chip.classList.remove("selected");
      } else {
        selectedModalTags.push(tag);
        chip.classList.add("selected");
      }
      updateModalStatus();
    });
    
    container.appendChild(chip);
  });
}

function addNewTagToModal(tag) {
  if (!selectedModalTags.includes(tag)) {
    selectedModalTags.push(tag);
    
    // Dynamically append selected chip to selector
    const container = document.getElementById("keep-tags-selector");
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip-tag-select selected";
    chip.textContent = tag;
    chip.addEventListener("click", () => {
      const idx = selectedModalTags.indexOf(tag);
      if (idx > -1) {
        selectedModalTags.splice(idx, 1);
        chip.classList.remove("selected");
      } else {
        selectedModalTags.push(tag);
        chip.classList.add("selected");
      }
      updateModalStatus();
    });
    container.appendChild(chip);
    updateModalStatus();
  }
}

function updateModalStatus() {
  const statusEl = document.getElementById("modal-status-text");
  if (selectedModalTags.length === 0) {
    statusEl.textContent = "No tags — that's ok";
  } else {
    statusEl.textContent = `${selectedModalTags.length} ${selectedModalTags.length === 1 ? 'tag' : 'tags'} selected`;
  }
}

function handleKeepItemSubmit(e) {
  e.preventDefault();

  const editorEl = document.getElementById("keep-capture-editor");
  const rawHtml = editorEl ? editorEl.innerHTML.trim() : "";
  const noteContent = sanitizeAndFormatHtml(rawHtml);
  const plainText = getCaptureEditorText();
  const urls = extractUrls(plainText);
  const urlVal = urls.length > 0 ? urls[0] : "";

  if (!plainText && !urlVal && captureFiles.length === 0) return;

  let itemType = "note";
  let domain = "";
  let author = "";
  let imageUrl = "";
  let source = "manual";

  if (urlVal) {
    itemType = "link";
    source = "web link";
    try {
      const hostname = new URL(urlVal).hostname;
      domain = hostname.replace("www.", "");
    } catch (err) {
      domain = "Link Source";
    }

    if (urlVal.includes("twitter.com") || urlVal.includes("x.com")) {
      itemType = "quote";
      author = plainText.includes("—") ? plainText.split("—").pop().trim() : "x.com";
      source = "x.com";
    }
  }

  if (captureFiles.length > 0) {
    const primaryFile = captureFiles[0];
    source = "upload";

    if (isImageFile(primaryFile)) {
      itemType = "image";
    } else if (isPdfFile(primaryFile)) {
      itemType = "pdf";
    }
  }

  if (itemType === "note" && plainText.startsWith('"') && plainText.endsWith('"')) {
    itemType = "quote";
    author = "Author";
  }

  let title = "Kept note";
  if (itemType === "link" && plainText) {
    title = plainText.split("\n")[0].substring(0, 45);
    if (title.length >= 45) title += "...";
  } else if (itemType === "link" && urlVal) {
    title = domain || "Saved link";
  } else if (itemType === "quote") {
    title = author ? `Quote by ${author}` : "Kept quote";
  } else if (captureFiles.length > 0) {
    title = captureFiles[0].name.replace(/\.[^/.]+$/, "");
  } else if (plainText) {
    title = plainText.split("\n")[0].substring(0, 45);
    if (title.length >= 45) title += "...";
  } else if (urlVal) {
    title = domain || "Saved link";
  }

  const now = Date.now();
  const newItem = {
    id: `item-${now}`,
    title: title,
    type: itemType,
    content: noteContent || plainText || "",
    url: urlVal,
    domain: domain,
    author: author,
    imageUrl: imageUrl,
    tags: [...selectedModalTags],
    createdAt: now,
    updatedAt: now,
    source: source
  };

  const saveItem = async () => {
    if (captureFiles.length > 0) {
      const primaryFile = captureFiles[0];
      if (isImageFile(primaryFile) || isPdfFile(primaryFile)) {
        newItem.imageUrl = await repository.uploadFile(primaryFile);
      }
    }

    await repository.add(newItem);
    database = await repository.getAll();
    showToast("Kept", "success");
    closeKeepModal();
    renderAll();
    lucide.createIcons();
  };

  saveItem();
}

/* -------------------------------------------------------------
 * Detail Drawer Interactions & Actions
 * ------------------------------------------------------------- */
function openDetailDrawer(item) {
  currentDetailItem = { ...item }; // Clone item state
  
  const drawer = document.getElementById("detail-drawer");
  drawer.classList.add("active");

  // Header stats
  const typeBadge = document.getElementById("detail-badge-type");
  const iconEl = typeBadge.querySelector("i") || document.createElement("i");
  typeBadge.innerHTML = "";
  typeBadge.appendChild(iconEl);
  
  const labelEl = document.createElement("span");
  labelEl.textContent = item.type.toUpperCase();
  typeBadge.appendChild(labelEl);
  
  iconEl.setAttribute("data-lucide", getTypeIcon(item.type));
  
  document.getElementById("detail-date").textContent = formatRelativeTime(item.createdAt);

  // Note rich editor & url inputs
  const detailNoteEl = document.getElementById("detail-note");
  if (detailNoteEl) {
    detailNoteEl.innerHTML = sanitizeAndFormatHtml(item.content || "");
  }
  document.getElementById("detail-url").value = item.url || "";
  
  const urlSection = document.getElementById("detail-url-section");
  const visitLink = document.getElementById("detail-visit-link");
  if (item.type === "link" || item.url) {
    urlSection.style.display = "flex";
    visitLink.href = item.url;
  } else {
    urlSection.style.display = "none";
  }

  // Render detail tags
  renderDetailTags();

  // Render metadata block
  document.getElementById("detail-meta-saved-date").textContent = formatMetaDate(item.createdAt);
  document.getElementById("detail-meta-edited-date").textContent = formatMetaDate(item.updatedAt || item.createdAt);

  // Render Rich Preview Area
  renderDetailPreview(item);

  lucide.createIcons();
}

function closeDetailDrawer() {
  document.getElementById("detail-drawer").classList.remove("active");
  currentDetailItem = null;
}

function renderDetailTags() {
  const container = document.getElementById("detail-tags-cloud");
  container.innerHTML = "";

  if (currentDetailItem.tags && currentDetailItem.tags.length > 0) {
    currentDetailItem.tags.forEach(tag => {
      const chip = document.createElement("span");
      chip.className = "drawer-tag";
      chip.innerHTML = `
        <span>${tag}</span>
        <button class="drawer-tag-remove" type="button">
          <i data-lucide="x"></i>
        </button>
      `;
      chip.querySelector("button").addEventListener("click", () => {
        const idx = currentDetailItem.tags.indexOf(tag);
        if (idx > -1) {
          currentDetailItem.tags.splice(idx, 1);
          renderDetailTags();
          lucide.createIcons();
        }
      });
      container.appendChild(chip);
    });
  } else {
    container.innerHTML = `<span class="empty-placeholder">No tags assigned</span>`;
  }
}

function renderDetailPreview(item) {
  const container = document.getElementById("detail-preview-container");
  container.innerHTML = "";
  
  if (item.type === "link") {
    container.innerHTML = `
      <div class="rich-link-preview">
        <div class="link-preview-image" style="background-image: url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=60');"></div>
        <div class="link-preview-details">
          <span class="link-preview-domain">${escapeHtml(item.domain || 'Link')}</span>
          <a class="link-preview-title" href="${item.url}" target="_blank">${escapeHtml(item.title)} <i data-lucide="external-link" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle;"></i></a>
          <div class="link-preview-desc">${sanitizeAndFormatHtml(item.content)}</div>
        </div>
      </div>
    `;
  } else if (item.type === "quote") {
    container.innerHTML = `
      <div class="rich-quote-preview">
        <i data-lucide="quote" class="quote-icon"></i>
        <div class="quote-preview-text">${sanitizeAndFormatHtml(item.content)}</div>
        <span class="quote-preview-author">— ${escapeHtml(item.author || 'Unknown')}</span>
      </div>
    `;
  } else if (item.type === "image") {
    const imgUrl = item.imageUrl || "assets/linear_project_overview.png";
    container.innerHTML = `
      <div class="rich-image-preview">
        <img src="${imgUrl}" alt="${escapeHtml(item.title)}">
      </div>
    `;
  } else if (item.type === "pdf") {
    container.innerHTML = `
      <div class="rich-pdf-preview">
        <div class="pdf-icon-wrap">PDF</div>
        <div class="pdf-details">
          <span class="pdf-name">${escapeHtml(item.title)}.pdf</span>
          <span class="pdf-meta">Document Preview</span>
        </div>
        <button class="btn btn-secondary btn-sm" type="button" onclick="showToast('Opening PDF document viewer...', 'info')">
          <i data-lucide="eye"></i>
        </button>
      </div>
    `;
  } else {
    // Note or general content preview box
    container.innerHTML = `
      <div class="rich-note-preview">
        <div class="note-preview-header">
          <div class="pdf-icon-wrap" style="background: var(--color-primary-light); color: var(--color-primary); border-color: var(--color-primary); font-size: 0.8125rem; width: 36px; height: 36px; border-radius: var(--radius-sm); flex-shrink: 0;">
            <i data-lucide="file-text" style="width: 18px; height: 18px;"></i>
          </div>
          <div class="pdf-details" style="gap: 2px;">
            <span class="pdf-name">${escapeHtml(item.title)}</span>
            <span class="pdf-meta">Note document</span>
          </div>
        </div>
        ${item.content ? `<div class="rich-note-body">${sanitizeAndFormatHtml(item.content)}</div>` : ''}
      </div>
    `;
  }
}

async function handleSaveDetailChanges(e) {
  e.preventDefault();
  if (!currentDetailItem) return;

  const detailNoteEl = document.getElementById("detail-note");
  const rawContent = detailNoteEl ? detailNoteEl.innerHTML.trim() : "";
  const noteContent = sanitizeAndFormatHtml(rawContent);
  const plainText = stripHtml(noteContent);
  const urlVal = document.getElementById("detail-url").value.trim();

  if (!plainText && !urlVal && !currentDetailItem.imageUrl && currentDetailItem.type !== "pdf") {
    showToast("Add a note, link, or attachment before saving", "info");
    return;
  }

  // Locate in DB
  const dbIndex = database.findIndex(item => item.id === currentDetailItem.id);
  if (dbIndex === -1) return;

  // Update properties
  database[dbIndex].content = noteContent;
  database[dbIndex].url = urlVal;
  database[dbIndex].tags = [...currentDetailItem.tags];
  database[dbIndex].updatedAt = Date.now();

  let newTitle = database[dbIndex].title;
  if (database[dbIndex].type === "note" || database[dbIndex].type === "link") {
    newTitle = plainText.split("\n")[0].substring(0, 45);
    if (newTitle.length >= 45) newTitle += "...";
    newTitle = newTitle || database[dbIndex].title || "Kept note";
  }

  let domainVal = database[dbIndex].domain;
  if (urlVal && database[dbIndex].type === "link") {
    try {
      const hostname = new URL(urlVal).hostname;
      domainVal = hostname.replace("www.", "");
    } catch(err) {
      domainVal = "Link Source";
    }
  }

  await repository.update(currentDetailItem.id, {
    content: noteContent,
    url: urlVal,
    tags: [...currentDetailItem.tags],
    title: newTitle,
    domain: domainVal
  });

  database = await repository.getAll();
  closeDetailDrawer();
  renderAll();
  lucide.createIcons();
  showToast("Saved changes", "success");
}

async function handleDeleteDetailItem() {
  if (!currentDetailItem) return;

  await repository.delete(currentDetailItem.id);
  database = await repository.getAll();
  
  closeDetailDrawer();
  renderAll();
  lucide.createIcons();
  showToast("Memory deleted", "info");
}

/* -------------------------------------------------------------
 * Data Export Function
 * ------------------------------------------------------------- */
function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(database, null, 2));
  const dlAnchorElem = document.createElement("a");
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", `keepr-archive-${new Date().toISOString().slice(0,10)}.json`);
  dlAnchorElem.click();
  showToast("Export download started", "success");
}

/* -------------------------------------------------------------
 * Toast Notifications Manager
 * ------------------------------------------------------------- */
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  // Decide Icon
  let iconName = "check-circle-2";
  let iconClass = "toast-icon-success";
  if (type === "info") {
    iconName = "info";
    iconClass = "toast-icon-info";
  } else if (type === "warning") {
    iconName = "alert-triangle";
    iconClass = "toast-icon-info";
  }
  
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="${iconClass}"></i>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  lucide.createIcons();

  // Slide-out after delay
  setTimeout(() => {
    toast.classList.add("toast-hiding");
    toast.addEventListener("animationend", () => {
      toast.remove();
    });
  }, 2500);
}

/* -------------------------------------------------------------
 * Keyboard Shortcuts
 * ------------------------------------------------------------- */
function handleKeyboardShortcuts(e) {
  const isInputFocused = ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
    || document.activeElement.isContentEditable;

  // Escape key: close modals/drawer
  if (e.key === "Escape") {
    const keepModal = document.getElementById("keep-modal");
    const detailDrawer = document.getElementById("detail-drawer");
    
    if (keepModal.classList.contains("active")) {
      closeKeepModal();
    }
    if (detailDrawer.classList.contains("active")) {
      closeDetailDrawer();
    }
  }

  // Trigger command actions when not typing
  if (!isInputFocused) {
    // "N" to create new memory
    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      openKeepModal();
    }
    
    // "/" to focus search
    if (e.key === "/") {
      e.preventDefault();
      window.location.hash = "#search";
    }
  }

  // Cmd+K or Ctrl+K to focus search (even if in inputs, except if in search bar already)
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
    e.preventDefault();
    window.location.hash = "#search";
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }
}
