/* -------------------------------------------------------------
 * Keepr Application Logic
 * ------------------------------------------------------------- */

import { repository, INITIAL_DATA } from './src/repository.js';
import { supabase, isSupabaseConfigured } from './src/supabase.js';
import { renderAsync as renderDocx } from 'docx-preview';

// App State
let database = [];
let currentTab = "home";
let activeTypeFilter = "all";
let activeTagFilters = [];
let searchQuery = "";
let captureFiles = [];
let currentDetailItem = null;
let detailOriginTab = "home";

// Auth State
let currentUser = null;
let currentSession = null;
let authMode = "signin"; // "signin" | "signup" | "forgot"

// Initialize App
document.addEventListener("DOMContentLoaded", async () => {
  await loadDatabase();
  await initAuth();
  initRouter();
  initTheme();
  initEmojiPicker();
  registerEventListeners();
  renderAll();
  lucide.createIcons();
  initServiceWorker();
  checkWebShareTarget();
});

/* Service Worker & Web Share Registration for PWA */
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('[Keepr PWA] Service worker registered:', registration.scope);
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  showToast('App update available.');
                }
              };
            }
          };
        })
        .catch((error) => {
          console.warn('[Keepr PWA] Service worker registration error:', error);
        });
    });
  }
}

function checkWebShareTarget() {
  try {
    const params = new URLSearchParams(window.location.search);
    const sharedTitle = params.get('title');
    const sharedText = params.get('text');
    const sharedUrl = params.get('url');

    if (sharedTitle || sharedText || sharedUrl) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);

      setTimeout(() => {
        openKeepModal();
        const editor = document.getElementById("keep-capture-editor");
        if (editor) {
          let content = '';
          if (sharedTitle) content += `<h3>${escapeHtml(sharedTitle)}</h3>`;
          if (sharedText) content += `<p>${escapeHtml(sharedText)}</p>`;
          if (sharedUrl) content += `<p><a href="${escapeHtml(sharedUrl)}" target="_blank" rel="noopener">${escapeHtml(sharedUrl)}</a></p>`;
          editor.innerHTML = content;
        }
      }, 300);
    }
  } catch (err) {
    console.warn('Web Share check warning:', err);
  }
}

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
function closeAllOverlayDrawers() {
  const emojiPopover = document.getElementById("emoji-picker-popover");
  if (emojiPopover) emojiPopover.style.display = "none";

  const profileDropdown = document.getElementById("profile-dropdown-menu");
  if (profileDropdown) profileDropdown.style.display = "none";

  const confirmModal = document.getElementById("confirm-dialog-modal");
  if (confirmModal) confirmModal.classList.remove("active");

  const keepModal = document.getElementById("keep-modal");
  if (keepModal && keepModal.classList.contains("active")) {
    keepModal.classList.remove("active");
    selectedModalTags = [];
    captureFiles = [];
    const editor = document.getElementById("keep-capture-editor");
    if (editor) editor.innerHTML = "";
    const form = document.getElementById("keep-form");
    if (form) form.reset();
    const previews = document.getElementById("capture-previews");
    if (previews) previews.innerHTML = "";
    clearModalStatusError();
  }

  const detailDrawer = document.getElementById("detail-drawer");
  if (detailDrawer && detailDrawer.classList.contains("active")) {
    detailDrawer.classList.remove("active");
    currentDetailItem = null;
  }
}

function handlePopState(e) {
  const confirmModal = document.getElementById("confirm-dialog-modal");
  if (confirmModal && confirmModal.classList.contains("active")) {
    closeConfirmDialog();
    return;
  }
}

function initRouter() {
  const handleHash = () => {
    const rawHash = window.location.hash || "#home";

    // Allow Supabase SDK to parse session / error / recovery from URL hash before replacing route
    if (rawHash.includes("access_token=") || rawHash.includes("type=") || rawHash.includes("error=")) {
      return;
    }

    if (!currentUser) {
      showAuthView();
      return;
    }

    const tabName = rawHash.substring(1);
    const tabs = ["home", "search", "settings"];
    const targetTab = tabs.includes(tabName) ? tabName : "home";

    if (currentTab !== targetTab) {
      navigateToTab(targetTab);
    }
  };

  window.addEventListener("hashchange", handleHash);
  window.addEventListener("popstate", handlePopState);
  handleHash(); // Run on load
}

function navigateToTab(tabName) {
  if (!currentUser) {
    showAuthView();
    return;
  }

  currentTab = tabName;
  
  if (window.location.hash !== `#${tabName}`) {
    window.location.hash = `#${tabName}`;
  }

  closeAllOverlayDrawers();
  
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
      const searchInput = document.getElementById("search-input");
      if (searchInput) searchInput.focus();
    }, 150);
  }
}

/* -------------------------------------------------------------
 * Authentication & Session Management (Supabase Auth)
 * ------------------------------------------------------------- */
async function initAuth() {
  if (isSupabaseConfigured()) {
    try {
      checkUrlAuthParams();

      const { data: { session } } = await supabase.auth.getSession();
      handleSessionState(session);

      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          showPasswordResetModal();
        }
        if (session && session.user) {
          await ensureUserProfileExists(session.user);
        }

        const newUserId = session?.user?.id || null;
        const currentUserId = currentUser?.id || null;

        // If the same authenticated user session is refreshed/renewed, do not reload DB or re-navigate tabs
        if (newUserId && currentUserId && newUserId === currentUserId) {
          currentSession = session;
          currentUser = session.user;
          renderUserProfile(currentUser);
          return;
        }

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

function checkUrlAuthParams() {
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  const rawParams = hash.substring(1) || search.substring(1);
  if (!rawParams) return;

  const params = new URLSearchParams(rawParams);
  const errorDesc = params.get("error_description");
  const errorMsg = params.get("error");
  const type = params.get("type");

  if (errorDesc || errorMsg) {
    const cleanMsg = errorDesc ? decodeURIComponent(errorDesc.replace(/\+/g, " ")) : errorMsg;
    setTimeout(() => {
      showAuthAlert(cleanMsg, "error");
    }, 150);
  } else if (type === "recovery" || hash.includes("type=recovery")) {
    setTimeout(() => {
      showPasswordResetModal();
    }, 200);
  }
}

function showPasswordResetModal() {
  const modal = document.getElementById("password-reset-modal");
  if (modal) {
    modal.classList.add("active");
    const input = document.getElementById("reset-input-password");
    if (input) {
      input.value = "";
      input.focus();
    }
    hideResetPasswordAlert();
  }
}

function closePasswordResetModal() {
  const modal = document.getElementById("password-reset-modal");
  if (modal) {
    modal.classList.remove("active");
    hideResetPasswordAlert();
  }
  if (window.location.hash.includes("recovery")) {
    window.location.hash = "#home";
  }
}

function showResetPasswordAlert(msg, type = "error") {
  const el = document.getElementById("password-reset-alert");
  if (el) {
    el.className = `auth-alert ${type}`;
    el.textContent = msg;
    el.style.display = "block";
  }
}

function hideResetPasswordAlert() {
  const el = document.getElementById("password-reset-alert");
  if (el) el.style.display = "none";
}

async function ensureUserProfileExists(user) {
  if (!user || !user.id || !isSupabaseConfigured()) return;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      const pendingName = localStorage.getItem('keepr_user_pending_name') || localStorage.getItem(`keepr_user_name_${user.id}`);
      const fullName = user.user_metadata?.full_name || user.user_metadata?.display_name || user.user_metadata?.name || pendingName || (user.email ? user.email.split("@")[0] : "User");
      const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || "";

      const fullPayload = {
        id: user.id,
        email: user.email || '',
        full_name: fullName,
        display_name: fullName,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString()
      };

      const { error: upsertError } = await supabase.from("profiles").upsert(fullPayload, { onConflict: "id" });
      if (upsertError) {
        await supabase.from("profiles").upsert({
          id: user.id,
          display_name: fullName,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString()
        }, { onConflict: "id" });
      }
    }
  } catch (err) {
    console.warn("Error ensuring user profile exists:", err);
  }
}

async function handleSessionState(session) {
  currentSession = session;
  currentUser = session ? session.user : null;

  if (isSupabaseConfigured() && currentUser) {
    repository.setEngine('supabase');
  } else {
    repository.setEngine('local');
  }

  await loadDatabase();

  const headerEl = document.querySelector(".app-header");
  const floatingKeepBtn = document.getElementById("btn-open-keep");

  if (currentUser) {
    if (currentUser.id) {
      await ensureUserProfileExists(currentUser);
      const pendingName = localStorage.getItem('keepr_user_pending_name');
      if (pendingName) {
        localStorage.setItem(`keepr_user_name_${currentUser.id}`, pendingName);
        localStorage.removeItem('keepr_user_pending_name');
      }
    }

    // Authenticated user
    if (headerEl) headerEl.style.display = "";
    if (floatingKeepBtn) floatingKeepBtn.style.display = "";
    
    renderUserProfile(currentUser);
    renderAll();

    // Check for one-time LocalStorage migration
    checkAndShowMigrationDialog();

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
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function getFormattedFirstName(user) {
  if (!user) return "there";

  if (user.id) {
    const savedName = localStorage.getItem(`keepr_user_name_${user.id}`);
    if (savedName && savedName.trim()) {
      const parts = savedName.trim().split(" ");
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
  }

  let fullName = user.user_metadata?.full_name 
    || user.user_metadata?.name 
    || user.user_metadata?.first_name
    || user.user_metadata?.display_name
    || user.raw_user_meta_data?.full_name
    || user.raw_user_meta_data?.name;

  if (!fullName && user.email) {
    const prefix = user.email.split("@")[0];
    const cleaned = prefix.replace(/\d+$/, "");
    fullName = cleaned || prefix;
  }
  if (!fullName) return "there";

  let firstName = fullName.trim().split(" ")[0] || fullName;
  firstName = firstName.replace(/\d+$/, "");
  if (!firstName) return "there";

  return firstName.charAt(0).toUpperCase() + firstName.slice(1);
}

function renderUserProfile(user) {
  if (!user) return;
  const email = user.email || "";
  const firstName = getFormattedFirstName(user);

  let fullName = (user.id && localStorage.getItem(`keepr_user_name_${user.id}`))
    || user.user_metadata?.full_name 
    || user.user_metadata?.name 
    || user.raw_user_meta_data?.full_name
    || (firstName !== "there" ? firstName : "User");

  if (fullName && fullName !== "User") {
    fullName = fullName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
  const initial = firstName && firstName !== "there" ? firstName.charAt(0).toUpperCase() : (fullName ? fullName.charAt(0).toUpperCase() : "U");

  // Header profile
  const headerAvatar = document.getElementById("header-profile-avatar");
  const headerName = document.getElementById("header-profile-name");
  if (headerName) headerName.textContent = firstName;
  if (headerAvatar) {
    if (avatarUrl) {
      headerAvatar.innerHTML = `
        <img src="${escapeHtml(avatarUrl)}" class="avatar-img" alt="${escapeHtml(fullName)}">
        <span class="profile-name" id="header-profile-name">${escapeHtml(firstName)}</span>
        <i data-lucide="chevron-down" class="avatar-chevron"></i>
      `;
    } else {
      headerAvatar.innerHTML = `
        <span class="avatar-letter" id="header-avatar-letter">${escapeHtml(initial)}</span>
        <span class="profile-name" id="header-profile-name">${escapeHtml(firstName)}</span>
        <i data-lucide="chevron-down" class="avatar-chevron"></i>
      `;
    }
    if (window.lucide) window.lucide.createIcons();
  }

  // Settings profile card
  const settingsAvatar = document.getElementById("settings-avatar-large");
  const settingsName = document.getElementById("settings-profile-name");
  const settingsEmail = document.getElementById("settings-profile-email");
  const settingsMemberSince = document.getElementById("settings-member-since");

  if (settingsName) settingsName.textContent = fullName;
  if (settingsEmail) settingsEmail.textContent = email || "Signed in";
  if (settingsAvatar) {
    if (avatarUrl) {
      settingsAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" class="avatar-img-large" alt="${escapeHtml(fullName)}">`;
    } else {
      settingsAvatar.textContent = initial;
    }
  }

  if (settingsMemberSince) {
    let dateStr = "";
    const createdAtRaw = user.created_at || user.user_metadata?.created_at;
    if (createdAtRaw) {
      const d = new Date(createdAtRaw);
      if (!isNaN(d.getTime())) {
        dateStr = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      }
    }
    if (!dateStr) {
      dateStr = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    settingsMemberSince.textContent = dateStr;
  }

  renderHomeGreeting();
}

function loginAsDemoGoogleUser() {
  const demoUser = {
    id: 'demo-google-user',
    email: 'user@keepr.app',
    user_metadata: {
      full_name: 'Demo User',
      avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80'
    }
  };
  const demoSession = { user: demoUser, access_token: 'demo-token' };
  localStorage.setItem('keepr_auth_session', JSON.stringify(demoSession));
  handleSessionState(demoSession);
  showToast("Signed in as Demo User", "success");
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
              if (data?.user) {
                await ensureUserProfileExists(data.user);
              }
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
          if (nameVal) {
            localStorage.setItem('keepr_user_pending_name', nameVal);
          }
          if (isSupabaseConfigured()) {
            const { data, error } = await supabase.auth.signUp({
              email: emailVal,
              password: passVal,
              options: {
                data: { full_name: nameVal },
                emailRedirectTo: window.location.origin
              }
            });
            if (error) {
              showAuthAlert(error.message, "error");
            } else {
              if (data?.user) {
                if (nameVal) {
                  localStorage.setItem(`keepr_user_name_${data.user.id}`, nameVal);
                }
                await ensureUserProfileExists(data.user);
              }
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
            if (fullName) {
              localStorage.setItem(`keepr_user_name_${demoUser.id}`, fullName);
            }
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
    newSignOutBtn.addEventListener("click", () => handleSignOut());
  }

  setupProfileDropdown();

  // Password Reset Modal Controls
  const btnCloseReset = document.getElementById("btn-close-password-reset");
  if (btnCloseReset) {
    btnCloseReset.addEventListener("click", () => closePasswordResetModal());
  }

  const resetForm = document.getElementById("password-reset-form");
  if (resetForm) {
    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideResetPasswordAlert();

      const newPass = document.getElementById("reset-input-password")?.value || "";
      if (!newPass || newPass.length < 6) {
        showResetPasswordAlert("Password must be at least 6 characters long.", "error");
        return;
      }

      const submitBtn = document.getElementById("btn-submit-password-reset");
      if (submitBtn) submitBtn.disabled = true;

      try {
        if (isSupabaseConfigured()) {
          const { error } = await supabase.auth.updateUser({ password: newPass });
          if (error) {
            showResetPasswordAlert(error.message, "error");
          } else {
            closePasswordResetModal();
            showToast("Password updated successfully!", "success");
          }
        } else {
          closePasswordResetModal();
          showToast("Demo password updated successfully!", "success");
        }
      } catch (err) {
        showResetPasswordAlert(err.message || "Failed to update password", "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
}

async function handleSignOut() {
  if (isSupabaseConfigured()) {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Signout error:", e);
    }
  }
  localStorage.removeItem("keepr_auth_session");
  handleSessionState(null);
  showToast("Signed out successfully", "info");
}

function setupProfileDropdown() {
  const avatarBtn = document.getElementById("header-profile-avatar");
  const dropdownMenu = document.getElementById("profile-dropdown-menu");
  const container = document.getElementById("header-profile-container");
  const settingsBtn = document.getElementById("dropdown-btn-settings");
  const signoutBtn = document.getElementById("dropdown-btn-signout");

  if (!avatarBtn || !dropdownMenu) return;

  function closeDropdown() {
    if (dropdownMenu) dropdownMenu.style.display = "none";
    if (container) container.classList.remove("open");
    if (avatarBtn) avatarBtn.setAttribute("aria-expanded", "false");
  }

  function toggleDropdown(e) {
    e.stopPropagation();
    const isVisible = dropdownMenu.style.display !== "none";
    if (isVisible) {
      closeDropdown();
    } else {
      dropdownMenu.style.display = "flex";
      if (container) container.classList.add("open");
      avatarBtn.setAttribute("aria-expanded", "true");
      if (window.lucide) window.lucide.createIcons();
    }
  }

  // Remove existing listeners by cloning avatar button if needed
  const newAvatarBtn = avatarBtn.cloneNode(true);
  avatarBtn.parentNode.replaceChild(newAvatarBtn, avatarBtn);

  newAvatarBtn.addEventListener("click", toggleDropdown);

  document.addEventListener("click", (e) => {
    if (container && !container.contains(e.target)) {
      closeDropdown();
    }
  });

  if (settingsBtn) {
    settingsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeDropdown();
      window.location.hash = "#settings";
      navigateToTab("settings");
    });
  }

  if (signoutBtn) {
    signoutBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeDropdown();
      handleSignOut();
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
 * Theme Settings
 * ------------------------------------------------------------- */
function initTheme() {
  const storedTheme = localStorage.getItem("keepr_theme") || "light";
  document.documentElement.setAttribute("data-theme", storedTheme);
  
  const themeToggle = document.getElementById("theme-toggle-switch");
  if (themeToggle) themeToggle.checked = (storedTheme === "dark");
}

function toggleTheme(e) {
  const isDark = e.target.checked;
  const theme = isDark ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("keepr_theme", theme);
  showToast(`Switched to ${theme} mode`, "info");
}

/* -------------------------------------------------------------
 * Rendering Logic
 * ------------------------------------------------------------- */
function renderAll() {
  renderHomeGreeting();
  renderHomeRecentGrid();
  renderSearchFilters();
  renderSearchResultsGrid();
  renderSettingsStats();
}

// 1. Home Greeting
function renderHomeGreeting() {
  const greetingEl = document.getElementById("dynamic-greeting");
  if (!greetingEl) return;

  const hours = new Date().getHours();
  let timeOfDay = "afternoon";
  let emoji = "👋";

  if (hours >= 5 && hours < 12) {
    timeOfDay = "morning";
    emoji = "🌅";
  } else if (hours >= 12 && hours < 17) {
    timeOfDay = "afternoon";
    emoji = "👋";
  } else if (hours >= 17 && hours < 21) {
    timeOfDay = "evening";
    emoji = "🌙";
  } else {
    timeOfDay = "night";
    emoji = "✨";
  }

  const name = getFormattedFirstName(currentUser);
  greetingEl.textContent = `Good ${timeOfDay}, ${name} ${emoji}`;
}

// Helper to decode HTML entities safely (including &nbsp;, &#160;, &amp;, &quot;, &lt;, &gt;, etc.)
function decodeHtmlEntities(str) {
  if (!str || typeof str !== "string") return "";
  if (!str.includes("&")) return str;
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  let decoded = txt.value;
  if (decoded.includes("&nbsp;") || decoded.includes("&#160;") || decoded.includes("&amp;")) {
    txt.innerHTML = decoded;
    decoded = txt.value;
  }
  return decoded;
}

// Helper to escape HTML characters for safe attribute/tag injection
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
  let raw = String(html)
    .replace(/&amp;nbsp;/gi, " ")
    .replace(/&nbsp;/gi, " ");
  const tmp = document.createElement("div");
  tmp.innerHTML = raw;
  let text = (tmp.textContent || tmp.innerText || "").trim();
  if (text.includes("&")) {
    text = decodeHtmlEntities(text);
  }
  return text.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ").trim();
}

function sanitizeAndFormatHtml(html) {
  if (!html) return "";

  let input = String(html).trim();
  if (!input) return "";

  // Fix double-encoded entities from legacy data (e.g. &amp;nbsp; -> &nbsp;)
  input = input.replace(/&amp;nbsp;/gi, "&nbsp;");

  // Unescape entity-encoded HTML strings if present (e.g. &lt;b&gt;)
  if ((input.includes("&lt;") || input.includes("&gt;")) && !input.includes("<")) {
    const txt = document.createElement("textarea");
    txt.innerHTML = input;
    input = txt.value;
  }

  // Check if pure plain text without tags
  const hasTags = /<[a-z][\s\S]*>/i.test(input);
  if (!hasTags) {
    let decoded = decodeHtmlEntities(input);
    const escaped = escapeHtml(decoded);
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
    let decoded = decodeHtmlEntities(input);
    return escapeHtml(decoded);
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

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFilePreviewIcon(file) {
  const ext = file.name ? file.name.split(".").pop().toLowerCase() : "";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "🖼";
  if (ext === "pdf") return "📄";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["txt", "md"].includes(ext)) return "📋";
  return "📄";
}

function isImageFile(file) {
  const ext = file.name ? file.name.split(".").pop().toLowerCase() : "";
  return ["png", "jpg", "jpeg", "webp", "gif"].includes(ext) || (file.type && file.type.startsWith("image/"));
}

function isPdfFile(file) {
  const ext = file.name ? file.name.split(".").pop().toLowerCase() : "";
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
    case "file": return "file";
    case "quote": return "quote";
    default: return "bookmark";
  }
}

// Helper: Determine automatic subtle card accent color class based on artifact type
function getCardAccentClass(item) {
  switch (item.type) {
    case "note":
      return "card-accent-note";
    case "pdf":
    case "file":
      return "card-accent-pdf";
    case "image":
      return "card-accent-image";
    case "link":
      return "card-accent-link";
    case "quote":
      return "card-accent-quote";
    default:
      return "card-accent-note";
  }
}

function cleanTitleText(text) {
  if (!text) return "";
  let clean = decodeHtmlEntities(String(text));
  return clean
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/^[\s#*_\-~>\u2022\u25E6\u25AA\u25AB\u2013\u2014]+/, "")
    .replace(/^\[[ xX]?\]\s*/, "")
    .replace(/[*_~`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPreviewText(text) {
  if (!text) return "";
  let clean = decodeHtmlEntities(String(text));
  return clean
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatTruncatedTitle(titleText, maxChars = 70) {
  const cleaned = cleanTitleText(titleText);
  if (!cleaned) return "";
  if (cleaned.length <= maxChars) {
    return cleaned;
  }
  return cleaned.substring(0, maxChars).trim() + "...";
}

function extractTextLinesFromHtml(html) {
  if (!html) return [];
  let raw = String(html)
    .replace(/&amp;nbsp;/gi, " ")
    .replace(/&nbsp;/gi, " ");

  let formatted = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|blockquote|tr)>/gi, "\n")
    .replace(/<(p|div|li|h1|h2|h3|h4|h5|h6|blockquote|tr)[^>]*>/gi, "\n");
  
  const tmp = document.createElement("div");
  tmp.innerHTML = formatted;
  let rawText = (tmp.textContent || tmp.innerText || "");

  if (rawText.includes("&")) {
    rawText = decodeHtmlEntities(rawText);
  }

  return rawText
    .split(/\r?\n/)
    .map(line => line.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ').trim())
    .filter(line => line.length > 0);
}

function extractNoteTitleAndPreview(item) {
  const content = item.content || "";
  const lines = extractTextLinesFromHtml(content);

  let rawFirstLine = "";
  let preview = "";

  if (lines.length > 0) {
    rawFirstLine = lines[0]; // Treat ONLY the first non-empty line as the title source
    if (lines.length > 1) {
      preview = cleanPreviewText(lines.slice(1).join(" ")); // Everything after the first line becomes the preview
    } else {
      preview = ""; // If only one line exists
    }
  } else {
    rawFirstLine = item.title && item.title.trim() ? item.title.trim() : (item.type === "quote" ? "Saved quote" : "Untitled note");
    preview = "";
  }

  const cleanedTitle = cleanTitleText(rawFirstLine) || (item.type === "quote" ? "Saved quote" : "Untitled note");
  const title = formatTruncatedTitle(cleanedTitle, 70);

  return { title, preview, rawTitle: cleanedTitle };
}

function getArtifactTitle(item) {
  if (item.type === "note" || item.type === "quote") {
    const { title } = extractNoteTitleAndPreview(item);
    if (title) return title;
    return item.title && item.title.trim() ? formatTruncatedTitle(item.title, 70) : (item.type === "quote" ? "Saved quote" : "Untitled note");
  }
  if (item.title && item.title.trim()) {
    return formatTruncatedTitle(item.title, 70);
  }
  switch (item.type) {
    case "quote":
      return "Saved quote";
    case "link":
      return "Saved link";
    case "image":
      return item.fileName ? formatTruncatedTitle(item.fileName, 70) : "Image";
    case "pdf":
    case "file":
      return item.fileName ? formatTruncatedTitle(item.fileName, 70) : "PDF document";
    default:
      return "Untitled note";
  }
}

// Helper: Generate Card HTML
function createCardElement(item) {
  const card = document.createElement("div");
  const accentClass = getCardAccentClass(item);
  card.className = `kept-card card-${item.type} ${accentClass}`;
  card.setAttribute("data-id", item.id);
  
  const title = getArtifactTitle(item);
  const iconName = getTypeIcon(item.type);
  const typeLabel = item.type.toUpperCase();
  const relativeTime = formatRelativeTime(item.createdAt);
  const itemTags = (item.tags && Array.isArray(item.tags)) ? item.tags.filter(t => t && t.trim()) : [];
  const tagsHtml = itemTags.map(t => `<span class="card-tag">${escapeHtml(t)}</span>`).join('');

  let customBodyHtml = "";

  if (item.type === "link") {
    let domainText = item.domain || "";
    if (!domainText && item.url) {
      try {
        domainText = new URL(item.url).hostname.replace("www.", "");
      } catch (e) {
        domainText = "Saved link";
      }
    }
    customBodyHtml = `
      <div class="card-link-info">
        <div class="favicon-box">
          <img src="https://www.google.com/s2/favicons?sz=64&domain=${domainText || 'example.com'}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23666%22 stroke-width=%222%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22/></svg>'">
        </div>
        <div class="link-meta-text">
          <span class="link-domain">${escapeHtml(domainText || 'Saved link')}</span>
        </div>
      </div>
      <h3 class="card-title">${escapeHtml(title)}</h3>
    `;
  } else if (item.type === "quote") {
    customBodyHtml = `
      <h3 class="card-title">${escapeHtml(title)}</h3>
      ${item.content ? `<div class="quote-content">"${escapeHtml(stripHtml(item.content))}"</div>` : ''}
      ${item.author ? `<span class="quote-author">— ${escapeHtml(item.author)}</span>` : ''}
    `;
  } else if (item.type === "image") {
    const imgUrl = item.imageUrl || item.url || "data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22 viewBox=%220 0 100 100%22 fill=%22%23eaeaea%22></svg>";
    customBodyHtml = `
      <div class="card-image-preview" style="background-image: url('${imgUrl}');"></div>
      <div class="card-content-wrap">
        <h3 class="card-title">${escapeHtml(title)}</h3>
      </div>
    `;
  } else if (item.type === "pdf" || item.type === "file") {
    let docLabel = "DOC";
    if (item.type === "pdf") {
      docLabel = "PDF";
    } else if (item.fileName) {
      const ext = item.fileName.split('.').pop().toUpperCase();
      if (["DOC", "DOCX", "TXT", "MD"].includes(ext)) {
        docLabel = ext;
      }
    }
    customBodyHtml = `
      <div class="pdf-preview-box">
        <div class="pdf-mock-page"></div>
        <div class="pdf-mock-page">${docLabel}</div>
      </div>
      <h3 class="card-title">${escapeHtml(title)}</h3>
    `;
  } else {
    // Note or general content
    const { title: noteTitle, preview: notePreview } = extractNoteTitleAndPreview(item);
    customBodyHtml = `
      <h3 class="card-title">${escapeHtml(noteTitle)}</h3>
      ${notePreview ? `<p class="card-snippet">${escapeHtml(notePreview)}</p>` : ''}
    `;
  }

  // Base skeleton template (NO implementation labels: manual, upload, web link)
  if (item.type === "image") {
    card.innerHTML = `
      <div class="card-header" style="position: absolute; top: 12px; left: 16px; right: 16px; z-index: 5; pointer-events: none;">
        <span class="card-type-badge" style="background: rgba(255,255,255,0.92); backdrop-filter: blur(4px); border: 1px solid rgba(0,0,0,0.06); color: #222; padding: 3px 8px; border-radius: 9999px;">
          <i data-lucide="${iconName}" class="card-type-icon"></i>
          <span>${typeLabel}</span>
        </span>
        <span class="card-date" style="background: rgba(255,255,255,0.92); backdrop-filter: blur(4px); border: 1px solid rgba(0,0,0,0.06); color: #222; padding: 3px 8px; border-radius: 9999px;">${relativeTime}</span>
      </div>
      ${customBodyHtml}
      ${tagsHtml ? `
        <div style="padding: 0 16px 12px 16px; width: 100%;">
          <div class="card-meta" style="margin-top: 4px; padding-top: 0; border-top: none; justify-content: flex-end; gap: 4px; flex-wrap: wrap;">
            ${tagsHtml}
          </div>
        </div>
      ` : ''}
    `;
  } else {
    card.innerHTML = `
      <div class="card-top">
        <div class="card-header">
          <span class="card-type-badge">
            <i data-lucide="${iconName}" class="card-type-icon"></i>
            <span>${typeLabel}</span>
          </span>
          <span class="card-date">${relativeTime}</span>
        </div>
        ${customBodyHtml}
      </div>
      ${tagsHtml ? `
        <div class="card-meta" style="justify-content: flex-end; gap: 4px; flex-wrap: wrap;">
          ${tagsHtml}
        </div>
      ` : ''}
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
  const welcomeEmptyEl = document.getElementById("home-welcome-empty-state");

  if (!gridEl) return;
  gridEl.innerHTML = "";

  if (database.length === 0) {
    if (recentSectionEl) recentSectionEl.style.display = "none";
    if (welcomeEmptyEl) welcomeEmptyEl.style.display = "flex";
    return;
  }

  // Database has items
  if (recentSectionEl) recentSectionEl.style.display = "block";
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
  // Header Logo click -> Home
  const headerLogo = document.getElementById("header-logo");
  if (headerLogo) {
    headerLogo.addEventListener("click", () => {
      window.location.hash = "#home";
      navigateToTab("home");
    });
  }

  // Navigation Tabs clicks
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const tabName = tab.getAttribute("data-tab");
      window.location.hash = `#${tabName}`;
      navigateToTab(tabName);
    });
  });

  // Home: Quick search box trigger
  const quickSearchBox = document.getElementById("quick-search-box");
  if (quickSearchBox) {
    quickSearchBox.addEventListener("click", () => {
      window.location.hash = "#search";
      navigateToTab("search");
    });
  }

  // Home: View all link
  const homeViewAll = document.getElementById("home-view-all");
  if (homeViewAll) {
    homeViewAll.addEventListener("click", () => {
      window.location.hash = "#search";
      navigateToTab("search");
    });
  }

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
  const themeSwitch = document.getElementById("theme-toggle-switch");
  if (themeSwitch) {
    themeSwitch.addEventListener("change", toggleTheme);
  }

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

  captureEditor.addEventListener("input", () => {
    clearModalStatusError();
    renderCapturePreviews();
  });
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
    if (e.target.files && e.target.files.length > 0) {
      addCaptureFiles(Array.from(e.target.files));
      fileInput.value = "";
    }
  });

  fileInput.addEventListener("cancel", () => {
    // Native file picker cancelled by user - preserve open modal and existing state
  });

  const uploadTriggerBtn = document.getElementById("btn-trigger-upload");
  if (uploadTriggerBtn) {
    uploadTriggerBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (fileInput) fileInput.click();
    });
  }

  // Rich text toolbars
  document.querySelectorAll(".capture-toolbar .toolbar-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const toolbar = btn.closest(".capture-toolbar");
      const editorId = toolbar && toolbar.id === "detail-toolbar" ? "detail-note" : "keep-capture-editor";
      
      if (btn.classList.contains("emoji-trigger-btn") || btn.getAttribute("data-action") === "emoji") {
        e.stopPropagation();
        toggleEmojiPicker(btn, editorId);
        return;
      }

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

  // Confirmation Dialog listeners
  const cancelConfirmBtn = document.getElementById("btn-confirm-cancel");
  const closeConfirmBtn = document.getElementById("btn-confirm-close");
  const actionConfirmBtn = document.getElementById("btn-confirm-action");

  if (cancelConfirmBtn) cancelConfirmBtn.addEventListener("click", closeConfirmDialog);
  if (closeConfirmBtn) closeConfirmBtn.addEventListener("click", closeConfirmDialog);
  if (actionConfirmBtn) {
    actionConfirmBtn.addEventListener("click", () => {
      const cb = activeConfirmCallback;
      closeConfirmDialog();
      if (cb) cb();
    });
  }

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

  // Migration Modal listeners
  const confirmMigrateBtn = document.getElementById("btn-confirm-migration");
  const skipMigrateBtn = document.getElementById("btn-skip-migration");
  const skipMigrateXBtn = document.getElementById("btn-skip-migration-x");

  if (confirmMigrateBtn) confirmMigrateBtn.addEventListener("click", handleImportMigration);
  if (skipMigrateBtn) skipMigrateBtn.addEventListener("click", handleSkipMigration);
  if (skipMigrateXBtn) skipMigrateXBtn.addEventListener("click", handleSkipMigration);

  const migrationModalEl = document.getElementById("migration-modal");
  if (migrationModalEl) {
    migrationModalEl.addEventListener("click", (e) => {
      if (e.target.id === "migration-modal") handleSkipMigration();
    });
  }

  // Continuous checklist & blockquote behaviour in editors
  const handleEditorKeyDown = (e) => {
    if (e.key === "Enter") {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const node = sel.anchorNode;

      // Handle blockquote double-enter exit
      const bq = node.nodeType === 3 ? node.parentNode.closest("blockquote") : (node.closest ? node.closest("blockquote") : null);
      if (bq) {
        let currentBlock = node.nodeType === 3 ? node.parentNode : node;
        const lineText = currentBlock.textContent.replace(/[\n\r\t\uA0]/g, "").trim();
        if (lineText === "" || currentBlock === bq && bq.textContent.trim() === "") {
          e.preventDefault();
          if (currentBlock !== bq) {
            currentBlock.remove();
          }
          const p = document.createElement("div");
          p.innerHTML = "<br>";
          if (bq.nextSibling) {
            bq.parentNode.insertBefore(p, bq.nextSibling);
          } else {
            bq.parentNode.appendChild(p);
          }
          if (bq.textContent.trim() === "") {
            bq.remove();
          }
          const range = document.createRange();
          range.setStart(p, 0);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          return;
        }
      }

      // Handle checklist items
      const li = node.nodeType === 3 ? node.parentNode.closest("li") : (node.closest ? node.closest("li") : null);
      if (li && li.closest(".checklist")) {
        const text = li.textContent.replace(/[\n\r\t]/g, "").trim();
        if (text === "") {
          e.preventDefault();
          const ul = li.closest(".checklist");
          li.remove();
          if (ul && ul.children.length === 0) {
            ul.remove();
          }
          document.execCommand("insertParagraph", false, null);
        } else {
          e.preventDefault();
          const newLi = document.createElement("li");
          newLi.innerHTML = '<input type="checkbox" contenteditable="false"> &nbsp;';
          if (li.nextSibling) {
            li.parentNode.insertBefore(newLi, li.nextSibling);
          } else {
            li.parentNode.appendChild(newLi);
          }
          const range = document.createRange();
          range.setStart(newLi, 1);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
  };

  document.getElementById("keep-capture-editor")?.addEventListener("keydown", handleEditorKeyDown);
  document.getElementById("detail-note")?.addEventListener("keydown", handleEditorKeyDown);

  // Keyboard Shortcuts
  window.addEventListener("keydown", handleKeyboardShortcuts);
}

/* -------------------------------------------------------------
 * Confirmation Dialog Helper
 * ------------------------------------------------------------- */
let activeConfirmCallback = null;

function showConfirmDialog({ title, message, cancelText = "Cancel", confirmText = "Confirm", isDanger = false, onConfirm }) {
  const modal = document.getElementById("confirm-dialog-modal");
  const titleEl = document.getElementById("confirm-dialog-title");
  const msgEl = document.getElementById("confirm-dialog-message");
  const cancelBtn = document.getElementById("btn-confirm-cancel");
  const actionBtn = document.getElementById("btn-confirm-action");

  if (!modal || !titleEl || !msgEl || !cancelBtn || !actionBtn) return;

  titleEl.textContent = title;
  msgEl.textContent = message;
  cancelBtn.textContent = cancelText;
  actionBtn.textContent = confirmText;

  if (isDanger) {
    actionBtn.className = "btn btn-danger";
  } else {
    actionBtn.className = "btn btn-primary";
  }

  activeConfirmCallback = onConfirm;
  modal.classList.add("active");
  if (window.lucide) window.lucide.createIcons();
}

function closeConfirmDialog() {
  const modal = document.getElementById("confirm-dialog-modal");
  if (modal) modal.classList.remove("active");
  activeConfirmCallback = null;
}

/* -------------------------------------------------------------
 * Keep Modal Interactions & Actions
 * ------------------------------------------------------------- */
let selectedModalTags = [];

const ALLOWED_FILE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "pdf", "doc", "docx", "txt", "md"];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

function validateFile(file) {
  if (!file) {
    return { valid: false, error: "Invalid file." };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: "Files larger than 25 MB aren't supported yet." };
  }

  const ext = (file.name ? file.name.split('.').pop() : '').toLowerCase();
  const mime = (file.type || '').toLowerCase();

  const isAllowedExt = ALLOWED_FILE_EXTENSIONS.includes(ext);
  const isAllowedMime = mime.startsWith('image/') || 
                        mime === 'application/pdf' || 
                        mime.includes('word') || 
                        mime.includes('document') || 
                        mime.startsWith('text/');

  if (!isAllowedExt && !isAllowedMime) {
    return { valid: false, error: "Unsupported file type. Please upload an image, PDF, Word document, text file, or Markdown file." };
  }

  return { valid: true };
}

function setModalStatusError(msg) {
  const statusEl = document.getElementById("modal-status-text");
  if (statusEl) {
    statusEl.textContent = msg;
    statusEl.classList.add("status-error");
  }
}

function clearModalStatusError() {
  const statusEl = document.getElementById("modal-status-text");
  if (statusEl) {
    statusEl.classList.remove("status-error");
    updateModalStatus();
  }
}

/* -------------------------------------------------------------
 * Lightweight Emoji Picker & Insertion Manager
 * ------------------------------------------------------------- */
const EMOJI_DATA = {
  smileys: ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😋","😛","😜","🤪","🧐","🤓","😎","🤩","🥳","🤠","🤡","😏","😬","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","🤬","🤯","💀","💩","👻","👽","🤖"],
  emotions: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","🖐️","👍","👎","👊","✊","🤛","🤜","👏","🙌","👐","🤲","🤝","✍️","💅","🤳","💪","🧠"],
  learning: ["🧠","📖","📚","💡","📝","✏️","📄","📑","📌","📍","🔍","🔎","🎓","📜","🎨","💭","💬","🗯️","🗣️"],
  work: ["💼","📁","📂","📊","📈","📉","📅","📆","⏱️","💻","🖥️","📱","✉️","📧","📬","🗄️","🔐","🔑","🏆","🎯"],
  travel: ["✈️","🚀","🛸","⛵","🗺️","🧳","🏖️","🏝️","⛰️","🌲","🌳","🌴","🌵","🌷","🌸","🌹","🍀","🍁","☀️","🌙","⭐️","🌟","⚡","🌊"],
  food: ["🍔","🍟","🍕","🌭","🥪","🌮","🌯","🍜","🍲","🍣","🍱","🥟","🍞","🥐","🧇","🥞","☕","🍵","🧃","🍷","🍸","🍰","🍦","🍎"],
  media: ["🎵","🎶","🎧","🎤","🎬","🎥","📸","📷","📺","📻","🎮","🎲","🎨","🎭","🎪","🎟️"],
  favorites: ["⭐","🌟","✨","💥","🔥","⚡","🎉","🎊","🎁","🎈","🏆","🥇","🎖️","🏷️","🔒","⚡","💬","🖤"]
};

const EMOJI_KEYWORDS = {
  "😀": "smile happy face expression", "😃": "smile happy face", "😄": "smile happy laughing", "😁": "grin happy", "😆": "laugh happy", "😅": "sweat smile happy", "😂": "joy laugh cry tears", "🤣": "rofl laugh floor", "😊": "blush happy smile", "😇": "angel innocent", "🙂": "slight smile", "🙃": "upside down silly", "😉": "wink sly", "😌": "relieved calm quiet", "😍": "love heart eyes", "🥰": "love hearts affection", "😘": "kiss love", "😋": "delicious yum food", "😛": "tongue silly", "😜": "wink tongue playful", "🤪": "zany crazy", "🧐": "monocle inspect curious", "🤓": "nerd smart book", "😎": "cool sunglasses shade", "🤩": "starry eyes excited", "🥳": "party celebrate hat", "🤠": "cowboy hat", "🤡": "clown funny", "😏": "smirk sly", "😬": "grimace awkward", "😮": "surprised open mouth", "😯": "hushed quiet", "😲": "astonished shocked", "😳": "flustered blush", "🥺": "pleading puppy eyes", "😦": "frown disappointed", "😧": "anguished worry", "😨": "fear scared", "😰": "anxious sweat", "😥": "sad sweat relief", "😢": "cry tear sad", "😭": "sob crying tears", "😱": "scream scared fear", "😖": "confounded frustrated", "😣": "persevering struggle", "😞": "disappointed sad", "😓": "hard work sweat", "😩": "weary tired", "😫": "tired exhausted", "🥱": "yawn sleepy", "😤": "triumph proud mad", "😡": "angry mad red", "🤬": "cursing swearing angry", "🤯": "exploding mind blow mindblown", "💀": "skull dead death", "💩": "poop funny", "👻": "ghost spooky Halloween", "👽": "alien space", "🤖": "robot bot tech",
  "❤️": "red heart love", "🧡": "orange heart love", "💛": "yellow heart love", "💚": "green heart love", "💙": "blue heart love", "💜": "purple heart love", "🖤": "black heart love", "🤍": "white heart love", "🤎": "brown heart love", "💔": "broken heart sad", "❣️": "exclamation heart", "💕": "two hearts love", "💞": "revolving hearts", "💓": "beating heart pulse", "💗": "growing heart", "💖": "sparkle heart", "💘": "cupid arrow heart", "💝": "ribbon heart gift", "💟": "heart decoration", "🖐️": "hand five open", "👍": "thumbs up agree like good yes", "👎": "thumbs down dislike no bad", "👊": "fist punch bump", "✊": "raised fist power strength", "🤛": "left fist bump", "🤜": "right fist bump", "👏": "clap applause praise bravo", "🙌": "raising hands celebrate praise", "👐": "open hands hug", "🤲": "palms up pray hope", "🤝": "handshake agree deal partner", "✍️": "writing hand write memo note", "💅": "nail polish care chill", "🤳": "selfie photo camera", "💪": "biceps flex strong muscle", "🧠": "brain mind idea thought startup psychology intelligence",
  "📖": "open book reading read study story paper", "📚": "books reading list study library learn", "💡": "light bulb idea insight creative smart", "📝": "memo note write paper journal", "✏️": "pencil write draft design edit", "📄": "document page file pdf text", "📑": "bookmark tabs document", "📌": "pushpin pin important keep save", "📍": "round pin location map spot", "🔍": "search magnifying glass find inspect", "🔎": "search find inspect", "🎓": "graduation cap education student learn degree", "📜": "scroll document history classic", "🎨": "art palette design draw paint creative", "💭": "thought bubble dream thinking", "💬": "speech bubble comment chat message note", "🗯️": "angry bubble chat", "🗣️": "speaking talk speak voice",
  "💼": "briefcase work career job business office resume", "📁": "file folder organize archive", "📂": "open folder view documents", "📊": "bar chart graph analytics stats data", "📈": "chart increasing growth progress success", "📉": "chart decreasing decline stats", "📅": "calendar date schedule event day", "📆": "tear off calendar schedule", "⏱️": "stopwatch timer speed fast", "💻": "laptop computer tech code developer software", "🖥️": "desktop monitor screen display", "📱": "mobile phone smartphone tech call", "✉️": "envelope email mail letter message", "📧": "email e-mail mail inbox", "📬": "mailbox mail letter post", "🗄️": "file cabinet drawer archive database storage", "🔐": "closed lock key secure private password", "🔑": "key password access auth unlock", "🏆": "trophy prize winner first award", "🎯": "bullseye target goal objective focus",
  "✈️": "airplane travel flight trip itinerary japan vacation fly", "🚀": "rocket launch startup speed space boost", "🛸": "flying saucer ufo space", "⛵": "sailboat boat sea ocean travel", "🗺️": "world map travel itinerary location navigate guide", "🧳": "luggage suitcase travel trip pack", "🏖️": "beach umbrella sand vacation island travel", "🏝️": "desert island tropical beach travel", "⛰️": "mountain nature climb hiking outdoor", "🌲": "evergreen tree forest nature pine", "🌳": "deciduous tree nature forest park", "🌴": "palm tree beach tropical island", "🌵": "cactus desert plant nature", "🌷": "tulip flower spring nature garden", "🌸": "cherry blossom sakura flower japan garden", "🌹": "rose red flower love garden", "🍀": "four leaf clover lucky fortune", "🍁": "maple leaf autumn fall nature", "☀️": "sun sunny bright weather summer", "🌙": "crescent moon night quiet dark sleep", "⭐️": "star favorite rating rank golden", "🌟": "glowing star shine bright special", "⚡": "high voltage lightning electric fast energy", "🌊": "water wave ocean sea surf",
  "🍔": "hamburger burger food fastfood eat", "🍟": "french fries food snack", "🍕": "pizza slice food party", "🌭": "hotdog food snack", "🥪": "sandwich lunch food", "🌮": "taco Mexican food", "🌯": "burrito food", "🍜": "ramen steamed bowl noodles soup recipe food cooking dish eat", "🍲": "pot of food soup stew recipe dish", "🍣": "sushi Japanese food fish seafood", "🍱": "bento box lunch food Japanese", "🥟": "dumpling food dim sum", "🍞": "bread loaf toast food", "🥐": "croissant pastry bakery breakfast", "🧇": "waffle breakfast food", "🥞": "pancakes breakfast food syrup", "☕": "hot beverage coffee tea cafe drink morning", "🍵": "teacup matcha green tea drink", "🧃": "beverage juice box drink", "🍷": "wine glass drink alcohol party bar", "🍸": "cocktail glass drink party bar", "🍰": "shortcake cake dessert sweet birthday", "🍦": "soft ice cream dessert sweet cold", "🍎": "red apple fruit healthy food snack",
  "🎵": "musical note song sound audio music melody", "🎶": "musical notes singing music song", "🎧": "headphone audio music podcast listen", "🎤": "microphone sing talk audio speech podcast", "🎬": "clapper board movie film cinema video media", "🎥": "movie camera cinema film video record", "📸": "camera flash photo photograph screenshot image", "📷": "camera photo screenshot image picture", "📺": "television tv screen video show watch", "📻": "radio broadcast audio", "🎮": "video game controller play gaming fun", "🎲": "game die dice luck random", "🎭": "performing arts theater mask drama show", "🎪": "circus tent show event", "🎟️": "admission tickets event show movie ticket",
  "⭐": "star favorite bookmark keep highlight golden", "✨": "sparkles clean shiny magic new polish", "💥": "collision explosion pop impact", "🔥": "fire hot popular trending streak energy", "🎉": "party popper celebration congrats yay", "🎊": "confetti ball party celebrate", "🎁": "wrapped gift present surprise reward", "🎈": "balloon party birthday celebrate", "🥇": "1st place medal gold winner trophy champion", "🎖️": "military medal honor reward", "🏷️": "label tag tag-chip organize category", "🔒": "lock secret private password safe", "🖤": "black heart love dark"
};

let activeEmojiEditorId = "keep-capture-editor";
let currentEmojiCategory = "smileys";
let savedEmojiRange = null;
let currentEmojiTriggerBtn = null;

function saveEditorSelection(editorEl) {
  if (!editorEl) return;
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    if (editorEl.contains(range.commonAncestorContainer) || range.commonAncestorContainer === editorEl) {
      savedEmojiRange = range.cloneRange();
    }
  }
}

function restoreEditorSelection(editorEl) {
  if (!editorEl) return;
  editorEl.focus();
  const sel = window.getSelection();
  if (!sel) return;

  if (savedEmojiRange && (editorEl.contains(savedEmojiRange.commonAncestorContainer) || savedEmojiRange.commonAncestorContainer === editorEl)) {
    sel.removeAllRanges();
    sel.addRange(savedEmojiRange);
  } else {
    // Fallback: place cursor at end of contenteditable element
    const range = document.createRange();
    range.selectNodeContents(editorEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    savedEmojiRange = range.cloneRange();
  }
}

function toggleEmojiPicker(triggerBtn, targetEditorId) {
  const popover = document.getElementById("emoji-picker-popover");
  if (!popover) return;

  const isOpen = popover.style.display !== "none";
  if (isOpen && currentEmojiTriggerBtn === triggerBtn) {
    closeEmojiPicker();
  } else {
    openEmojiPicker(triggerBtn, targetEditorId);
  }
}

function openEmojiPicker(triggerBtn, targetEditorId) {
  currentEmojiTriggerBtn = triggerBtn;
  activeEmojiEditorId = targetEditorId;

  const targetEditor = document.getElementById(targetEditorId);
  if (targetEditor) {
    saveEditorSelection(targetEditor);
  }

  const popover = document.getElementById("emoji-picker-popover");
  const searchInput = document.getElementById("emoji-search-input");
  
  if (!popover) return;

  const rect = triggerBtn.getBoundingClientRect();
  const popoverWidth = Math.min(320, window.innerWidth - 20);
  const popoverHeight = Math.min(320, window.innerHeight - 36);

  popover.style.width = `${popoverWidth}px`;

  let left = rect.left;
  let top = rect.bottom + 6;

  if (left + popoverWidth > window.innerWidth - 10) {
    left = window.innerWidth - popoverWidth - 10;
  }
  if (left < 10) left = 10;

  if (top + popoverHeight > window.innerHeight - 10) {
    top = Math.max(10, rect.top - popoverHeight - 6);
  }
  if (top < 10) top = 10;

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.style.display = "flex";

  if (searchInput) {
    searchInput.value = "";
  }

  renderEmojiPickerGrid();
  lucide.createIcons();
}

function closeEmojiPicker() {
  const popover = document.getElementById("emoji-picker-popover");
  if (popover) {
    popover.style.display = "none";
  }
  currentEmojiTriggerBtn = null;
}

function initEmojiPicker() {
  const popover = document.getElementById("emoji-picker-popover");
  const searchInput = document.getElementById("emoji-search-input");
  const closeBtn = document.getElementById("btn-close-emoji-picker");
  const categoriesContainer = document.getElementById("emoji-categories");

  if (!popover) return;

  // Keep selection ranges updated on editable areas
  ["keep-capture-editor", "detail-note"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      ["keyup", "mouseup", "touchend", "focus", "input"].forEach(evt => {
        el.addEventListener(evt, () => saveEditorSelection(el));
      });
    }
  });

  renderEmojiPickerGrid();

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      renderEmojiPickerGrid(e.target.value.trim().toLowerCase());
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeEmojiPicker();
    });
  }

  if (categoriesContainer) {
    categoriesContainer.querySelectorAll(".emoji-cat-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        categoriesContainer.querySelectorAll(".emoji-cat-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentEmojiCategory = btn.getAttribute("data-category");
        if (searchInput) searchInput.value = "";
        renderEmojiPickerGrid();
      });
    });
  }

  // Robust outside interaction dismissal (pointerdown handles both mouse clicks and touch taps)
  const handleOutsideInteraction = (e) => {
    if (popover && popover.style.display !== "none") {
      const isTrigger = e.target.closest && e.target.closest(".emoji-trigger-btn");
      const isInside = popover.contains(e.target);
      if (!isTrigger && !isInside) {
        closeEmojiPicker();
      }
    }
  };

  document.addEventListener("pointerdown", handleOutsideInteraction);
}

function renderEmojiPickerGrid(searchFilter = "") {
  const grid = document.getElementById("emoji-picker-grid");
  if (!grid) return;
  grid.innerHTML = "";

  let emojisToRender = [];

  if (searchFilter) {
    const matched = new Set();
    Object.keys(EMOJI_DATA).forEach(cat => {
      EMOJI_DATA[cat].forEach(emoji => {
        const keywords = EMOJI_KEYWORDS[emoji] || "";
        if (keywords.includes(searchFilter) || emoji.includes(searchFilter)) {
          matched.add(emoji);
        }
      });
    });
    emojisToRender = Array.from(matched);
  } else {
    emojisToRender = EMOJI_DATA[currentEmojiCategory] || EMOJI_DATA.smileys;
  }

  if (emojisToRender.length === 0) {
    grid.innerHTML = `<div class="emoji-empty-text">No emojis found</div>`;
    return;
  }

  emojisToRender.forEach(emoji => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-item-btn";
    btn.textContent = emoji;
    btn.title = emoji;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      insertEmojiAtCursor(activeEmojiEditorId, emoji);
      closeEmojiPicker();
    });

    grid.appendChild(btn);
  });
}

function insertEmojiAtCursor(editorId, emoji) {
  const editorEl = document.getElementById(editorId);
  if (!editorEl) return;

  restoreEditorSelection(editorEl);

  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    if (editorEl.contains(range.commonAncestorContainer) || range.commonAncestorContainer === editorEl) {
      range.deleteContents();
      const textNode = document.createTextNode(emoji);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      sel.removeAllRanges();
      sel.addRange(range);

      savedEmojiRange = range.cloneRange();

      editorEl.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
  }

  editorEl.focus();
  document.execCommand("insertText", false, emoji);
  editorEl.dispatchEvent(new Event("input", { bubbles: true }));
}

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
  let fileError = "";

  files.forEach(file => {
    const check = validateFile(file);
    if (!check.valid) {
      fileError = check.error;
      return;
    }

    if (!captureFiles.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
      captureFiles.push(file);
    }
  });

  if (fileError) {
    setModalStatusError(fileError);
  } else {
    clearModalStatusError();
  }

  renderCapturePreviews();
}

function removeCaptureFile(index) {
  captureFiles.splice(index, 1);
  renderCapturePreviews();
}

function getCaptureEditorText() {
  const el = document.getElementById("keep-capture-editor");
  return el ? stripHtml(el.innerHTML) : "";
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
      thumbHtml = `<img class="preview-thumb" src="${objectUrl}" alt="${escapeHtml(file.name)}">`;
    }

    const extUpper = (file.name ? file.name.split('.').pop() : '').toUpperCase();
    let fileTypeLabel = "Document";
    if (isPdfFile(file)) fileTypeLabel = "PDF document";
    else if (isImageFile(file)) fileTypeLabel = "Image";
    else if (extUpper) fileTypeLabel = `${extUpper} document`;

    const sizeFormatted = file.size ? formatFileSize(file.size) : '';

    card.innerHTML = `
      ${thumbHtml}
      <div class="preview-details">
        <span class="preview-title" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
        <span class="preview-subtitle">${fileTypeLabel}${sizeFormatted ? ' • ' + sizeFormatted : ''}</span>
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
  const migrationModal = document.getElementById("migration-modal");
  if (migrationModal && migrationModal.classList.contains("active")) {
    return;
  }

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

  clearModalStatusError();
  lucide.createIcons();
}

function isKeepModalDirty() {
  const editorText = getCaptureEditorText().trim();
  const hasText = editorText.length > 0;
  const hasFiles = captureFiles.length > 0;
  const hasTags = selectedModalTags.length > 0;
  return hasText || hasFiles || hasTags;
}

function closeKeepModal() {
  if (isKeepModalDirty()) {
    showConfirmDialog({
      title: "Discard this memory?",
      message: "You have unsaved changes.",
      cancelText: "Continue Editing",
      confirmText: "Discard",
      isDanger: true,
      onConfirm: forceCloseKeepModal
    });
  } else {
    forceCloseKeepModal();
  }
}

function forceCloseKeepModal() {
  const modal = document.getElementById("keep-modal");
  if (modal) modal.classList.remove("active");
  selectedModalTags = [];
  captureFiles = [];
  const editor = document.getElementById("keep-capture-editor");
  if (editor) editor.innerHTML = "";
  const form = document.getElementById("keep-form");
  if (form) form.reset();
  const previews = document.getElementById("capture-previews");
  if (previews) previews.innerHTML = "";
  const newTagInput = document.getElementById("new-tag-input");
  if (newTagInput) newTagInput.value = "";
  clearModalStatusError();
}

function renderModalTagSelectors() {
  const container = document.getElementById("keep-tags-selector");
  if (!container) return;
  container.innerHTML = "";
  
  // Fetch existing tags
  const tagsList = getTagsListWithCounts().map(t => t.tag);
  
  // Fallback defaults if empty
  const defaultTags = ["Product", "Design", "AI", "Reading", "Inspiration", "Personal"];
  const displayTags = tagsList.length > 0 ? tagsList : defaultTags;
  
  displayTags.forEach(tag => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `chip-tag-select ${selectedModalTags.includes(tag) ? 'selected' : ''}`;
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
  if (!tag || !tag.trim()) return;
  const cleanTag = tag.trim();

  if (!selectedModalTags.includes(cleanTag)) {
    selectedModalTags.push(cleanTag);
    
    const container = document.getElementById("keep-tags-selector");
    if (container) {
      // Check if chip already exists in container
      const existingChips = Array.from(container.querySelectorAll(".chip-tag-select"));
      const existing = existingChips.find(c => c.textContent.trim().toLowerCase() === cleanTag.toLowerCase());
      
      if (existing) {
        existing.classList.add("selected");
      } else {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip-tag-select selected";
        chip.textContent = cleanTag;
        chip.addEventListener("click", () => {
          const idx = selectedModalTags.indexOf(cleanTag);
          if (idx > -1) {
            selectedModalTags.splice(idx, 1);
            chip.classList.remove("selected");
          } else {
            selectedModalTags.push(cleanTag);
            chip.classList.add("selected");
          }
          updateModalStatus();
        });
        container.appendChild(chip);
      }
    }
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

let isSavingKeep = false;

async function handleKeepItemSubmit(e) {
  e.preventDefault();

  if (isSavingKeep) return;

  // Auto-commit uncommitted tag from input if present
  const newTagInput = document.getElementById("new-tag-input");
  if (newTagInput && newTagInput.value.trim()) {
    addNewTagToModal(newTagInput.value.trim());
    newTagInput.value = "";
  }

  const editorEl = document.getElementById("keep-capture-editor");
  const rawHtml = editorEl ? editorEl.innerHTML.trim() : "";
  const noteContent = sanitizeAndFormatHtml(rawHtml);
  const plainText = getCaptureEditorText().trim();
  const urls = extractUrls(plainText);
  const urlVal = urls.length > 0 ? urls[0] : "";

  // 1. Validate empty memory
  if (!plainText && !urlVal && captureFiles.length === 0) {
    setModalStatusError("Your memory is empty.");
    return;
  }

  clearModalStatusError();

  const submitBtn = document.getElementById("btn-submit-keep");
  if (!submitBtn) return;

  isSavingKeep = true;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="btn-spinner"></span><span>Saving...</span>`;

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
    } else {
      itemType = "file";
    }
  }

  if (itemType === "note" && plainText.startsWith('"') && plainText.endsWith('"')) {
    itemType = "quote";
    author = "Author";
  }

  let title = "Kept note";
  if (itemType === "link" && plainText) {
    const linkLines = extractTextLinesFromHtml(noteContent || rawHtml);
    title = linkLines.length > 0 ? cleanTitleText(linkLines[0]).substring(0, 45) : (domain || "Saved link");
    if (title.length >= 45) title += "...";
  } else if (itemType === "link" && urlVal) {
    title = domain || "Saved link";
  } else if (itemType === "quote") {
    title = author ? `Quote by ${author}` : "Kept quote";
  } else if (captureFiles.length > 0) {
    title = captureFiles[0].name.replace(/\.[^/.]+$/, "");
  } else if (plainText || noteContent) {
    const noteLines = extractTextLinesFromHtml(noteContent || rawHtml);
    title = noteLines.length > 0 ? (cleanTitleText(noteLines[0]) || "Kept note") : "Kept note";
  } else if (urlVal) {
    title = domain || "Saved link";
  }

  const primaryFile = captureFiles.length > 0 ? captureFiles[0] : null;
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
    storagePath: "",
    fileName: primaryFile ? primaryFile.name : "",
    fileSize: primaryFile && primaryFile.size ? formatFileSize(primaryFile.size) : "",
    mimeType: primaryFile ? (primaryFile.type || "") : "",
    tags: [...selectedModalTags],
    createdAt: now,
    updatedAt: now,
    source: source
  };

  try {
    if (primaryFile) {
      const uploadRes = await repository.uploadFile(primaryFile);
      if (uploadRes) {
        if (typeof uploadRes === "object") {
          newItem.storagePath = uploadRes.storagePath || "";
          newItem.imageUrl = uploadRes.fileUrl || "";
          if (uploadRes.fileSize) newItem.fileSize = uploadRes.fileSize;
          if (uploadRes.mimeType) newItem.mimeType = uploadRes.mimeType;
          if (uploadRes.fileName) newItem.fileName = uploadRes.fileName;
          if (newItem.type !== "image" && !newItem.url) {
            newItem.url = uploadRes.fileUrl || "";
          }
        } else if (typeof uploadRes === "string") {
          newItem.imageUrl = uploadRes;
          if (!uploadRes.startsWith("data:")) {
            newItem.storagePath = uploadRes;
          }
          if (newItem.type !== "image" && !newItem.url) {
            newItem.url = uploadRes;
          }
        }
      }
    }

    await repository.add(newItem);
    database = await repository.getAll();

    // Success state: ✓ Kept for ~800ms
    submitBtn.innerHTML = `<span>✓ Kept</span>`;
    await new Promise(resolve => setTimeout(resolve, 800));

    forceCloseKeepModal();
    renderAll();
    if (window.lucide) window.lucide.createIcons();

  } catch (err) {
    console.error("Error saving memory:", err);
    showToast("We couldn't save this memory. Please try again.", "warning");
    setModalStatusError("We couldn't save this memory. Please try again.");
  } finally {
    isSavingKeep = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `Keep it`;
    }
  }
}

/* -------------------------------------------------------------
 * Detail Drawer Interactions & Actions
 * ------------------------------------------------------------- */
function openDetailDrawer(item) {
  detailOriginTab = currentTab || "home";
  currentDetailItem = {
    ...item,
    tags: Array.isArray(item.tags) ? [...item.tags] : []
  };

  const tagInputEl = document.getElementById("detail-new-tag");
  if (tagInputEl) tagInputEl.value = "";
  
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
  if ((item.type === "link" || item.url) && item.source !== "upload" && !item.storagePath && item.type !== "image" && item.type !== "pdf" && item.type !== "file") {
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

  if (window.lucide) window.lucide.createIcons();
}

function closeDetailDrawer() {
  const drawer = document.getElementById("detail-drawer");
  if (drawer) drawer.classList.remove("active");
  currentDetailItem = null;
  const tagInputEl = document.getElementById("detail-new-tag");
  if (tagInputEl) tagInputEl.value = "";
  if (currentUser && detailOriginTab && currentTab !== detailOriginTab) {
    window.location.hash = `#${detailOriginTab}`;
    navigateToTab(detailOriginTab);
  }
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

function getItemImageUrl(item) {
  if (!item) return "";
  if (item.imageUrl && String(item.imageUrl).trim() && item.imageUrl !== "#") return String(item.imageUrl).trim();
  if (item.url && String(item.url).trim() && item.url !== "#") return String(item.url).trim();
  if (item.storagePath && String(item.storagePath).trim()) return String(item.storagePath).trim();
  if (item.content && (item.content.startsWith("data:image") || item.content.startsWith("http") || item.content.startsWith("blob:"))) return String(item.content).trim();
  return "";
}

function triggerDownload(fileUrl, fileName) {
  if (!fileUrl || fileUrl === "#") return;

  try {
    if (fileUrl.startsWith("data:")) {
      const a = document.createElement("a");
      a.href = fileUrl;
      a.download = fileName || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      fetch(fileUrl)
        .then(res => {
          if (!res.ok) throw new Error("Network response was not ok");
          return res.blob();
        })
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = fileName || "download";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        })
        .catch(err => {
          console.warn("Direct blob download failed, falling back to anchor click:", err);
          const a = document.createElement("a");
          a.href = fileUrl;
          a.download = fileName || "download";
          a.target = "_blank";
          a.rel = "noopener";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        });
    }
  } catch (err) {
    console.warn("Download error:", err);
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = fileName || "download";
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

function renderDocumentCardFallback(container, item, displayTitle, docType) {
  const noteText = item && item.content ? stripHtml(item.content).trim() : '';
  container.innerHTML = `
    <div style="background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 24px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px;">
      <div style="width: 56px; height: 56px; border-radius: var(--radius-md); background: var(--color-border-subtle); color: var(--color-primary); display: flex; align-items: center; justify-content: center; font-size: 1.25rem; font-weight: 700;">
        ${docType}
      </div>
      <div>
        <h4 style="font-size: 1rem; font-weight: 600; margin: 0 0 4px 0; color: var(--color-text-primary);">${escapeHtml(displayTitle)}</h4>
        <span style="font-size: 0.8125rem; color: var(--color-text-secondary);">${docType} document ${item && item.fileSize ? '• ' + escapeHtml(item.fileSize) : ''}</span>
      </div>
      ${noteText ? `
        <div style="margin-top: 12px; width: 100%; text-align: left; background: var(--color-card); padding: 14px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); font-size: 0.875rem; color: var(--color-text-primary);">
          <strong style="display: block; margin-bottom: 6px; font-size: 0.75rem; color: var(--color-text-secondary); text-transform: uppercase;">Notes / Content Summary</strong>
          ${escapeHtml(noteText)}
        </div>
      ` : ''}
      <p style="font-size: 0.8125rem; color: var(--color-text-tertiary); margin: 8px 0 0 0;">
        Ready for previewing metadata and downloading to your system.
      </p>
    </div>
  `;
}

async function openDocumentPreviewModal(item, fileLink, displayTitle) {
  let modal = document.getElementById("document-preview-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "document-preview-modal";
    modal.className = "modal-backdrop";
    modal.style.zIndex = "10000";
    modal.innerHTML = `
      <div class="modal-card doc-preview-card" style="max-width: 780px; width: 92vw; max-height: 90vh; display: flex; flex-direction: column; padding: 24px;">
        <div class="modal-header" style="margin-bottom: 16px; border-bottom: 1px solid var(--color-border); padding-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px; overflow: hidden; min-width: 0;">
            <span id="doc-modal-type-badge" style="background: var(--color-surface); border: 1px solid var(--color-border); font-size: 0.75rem; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-sm); text-transform: uppercase;"></span>
            <h3 id="doc-modal-title" style="font-size: 1.05rem; font-weight: 600; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Preview</h3>
          </div>
          <button class="modal-close-btn" id="btn-close-doc-modal" type="button">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div id="doc-modal-body" style="flex: 1; overflow-y: auto; padding: 12px 0; display: flex; flex-direction: column; gap: 16px;">
        </div>
        <div class="modal-footer-actions" style="margin-top: 16px; border-top: 1px solid var(--color-border); padding-top: 16px; display: flex; align-items: center; justify-content: space-between;">
          <span id="doc-modal-meta" style="font-size: 0.8125rem; color: var(--color-text-secondary);"></span>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-tertiary btn-sm" id="btn-cancel-doc-modal" type="button">Close</button>
            <button class="btn btn-primary btn-sm" id="btn-download-doc-modal" type="button">
              <i data-lucide="download"></i><span>Download file</span>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeBtn = modal.querySelector("#btn-close-doc-modal");
    const cancelBtn = modal.querySelector("#btn-cancel-doc-modal");
    const closeHandler = () => modal.classList.remove("active");
    if (closeBtn) closeBtn.addEventListener("click", closeHandler);
    if (cancelBtn) cancelBtn.addEventListener("click", closeHandler);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("active");
    });
  }

  const typeBadge = modal.querySelector("#doc-modal-type-badge");
  const titleEl = modal.querySelector("#doc-modal-title");
  const metaEl = modal.querySelector("#doc-modal-meta");
  const bodyEl = modal.querySelector("#doc-modal-body");
  const downloadBtn = modal.querySelector("#btn-download-doc-modal");

  const ext = (displayTitle ? displayTitle.split('.').pop() : '').toLowerCase();
  let docType = (item && item.type === "pdf") ? "PDF" : ((item && item.type === "image") ? "IMAGE" : (ext ? ext.toUpperCase() : "FILE"));

  if (typeBadge) typeBadge.textContent = docType;
  if (titleEl) titleEl.textContent = displayTitle || "File Preview";

  const isImage = (item && item.type === "image") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext) || (item && item.mimeType && item.mimeType.startsWith("image/"));
  const typeText = isImage ? "Image" : "Document";
  if (metaEl) metaEl.textContent = `${docType} ${typeText} ${item && item.fileSize ? '• ' + item.fileSize : ''}`;

  if (downloadBtn) {
    downloadBtn.onclick = (e) => {
      e.preventDefault();
      triggerDownload(fileLink, displayTitle);
    };
  }

  if (bodyEl) {
    bodyEl.innerHTML = "";

    const isPdf = ext === "pdf" || (item && item.type === "pdf") || (item && item.mimeType === "application/pdf");
    const isDocx = ["docx", "doc"].includes(ext) || (item && item.mimeType && item.mimeType.includes("word"));
    const isText = ["txt", "md", "csv", "json", "js", "ts", "html", "css", "py", "xml"].includes(ext) || (item && item.mimeType && (item.mimeType.startsWith("text/") || item.mimeType.includes("json")));

    if (isImage && fileLink && fileLink !== "#") {
      bodyEl.innerHTML = `
        <div style="width: 100%; min-height: 250px; max-height: 60vh; background: var(--color-surface); border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; padding: 16px;">
          <img src="${escapeHtml(fileLink)}" alt="${escapeHtml(displayTitle)}" style="max-width: 100%; max-height: 55vh; object-fit: contain; border-radius: var(--radius-sm);" />
        </div>
      `;
    } else if (isPdf && fileLink && fileLink !== "#") {
      bodyEl.innerHTML = `
        <div style="width: 100%; height: 60vh; background: var(--color-surface); border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--color-border);">
          <iframe src="${escapeHtml(fileLink)}" style="width: 100%; height: 100%; border: none;"></iframe>
        </div>
      `;
    } else if (isDocx && fileLink && fileLink !== "#") {
      bodyEl.innerHTML = `
        <div id="docx-preview-container" style="width: 100%; min-height: 50vh; max-height: 65vh; overflow-y: auto; background: #ffffff; color: #111827; border-radius: var(--radius-md); padding: 20px; border: 1px solid var(--color-border); box-sizing: border-box;">
          <div style="display: flex; align-items: center; justify-content: center; height: 220px; color: #6b7280; font-size: 0.9rem; font-weight: 500;">
            <span>Loading document preview...</span>
          </div>
        </div>
      `;
      const container = bodyEl.querySelector("#docx-preview-container");
      try {
        const res = await fetch(fileLink);
        const blob = await res.blob();
        container.innerHTML = "";
        await renderDocx(blob, container, null, {
          className: "docx-render",
          inWrapper: false,
          ignoreWidth: false,
          ignoreHeight: false,
          experimental: true,
          useBase64URL: true
        });
      } catch (err) {
        console.warn("docx-preview failed, displaying fallback:", err);
        renderDocumentCardFallback(bodyEl, item, displayTitle, docType);
      }
    } else if (isText && fileLink && fileLink !== "#") {
      bodyEl.innerHTML = `
        <div style="background: var(--color-surface); padding: 18px; border-radius: var(--radius-md); border: 1px solid var(--color-border); max-height: 55vh; overflow-y: auto;">
          <pre id="text-preview-content" style="margin: 0; white-space: pre-wrap; font-family: monospace; font-size: 0.875rem; color: var(--color-text-primary); line-height: 1.5;">Loading text...</pre>
        </div>
      `;
      try {
        const textRes = await fetch(fileLink);
        const text = await textRes.text();
        const preEl = bodyEl.querySelector("#text-preview-content");
        if (preEl) preEl.textContent = text;
      } catch (e) {
        renderDocumentCardFallback(bodyEl, item, displayTitle, docType);
      }
    } else {
      renderDocumentCardFallback(bodyEl, item, displayTitle, docType);
    }
  }

  modal.classList.add("active");
  if (window.lucide) window.lucide.createIcons();
}

function openImageLightbox(imgSrc, imgTitle, item) {
  const fileLink = imgSrc || (item ? (item.imageUrl || item.url || item.storagePath) : "#");
  const displayTitle = imgTitle || (item ? getArtifactTitle(item) : "Image Preview");
  const imgItem = item || { type: "image", imageUrl: fileLink, fileName: displayTitle };
  openDocumentPreviewModal(imgItem, fileLink, displayTitle);
}

function renderDetailPreview(item) {
  const container = document.getElementById("detail-preview-container");
  if (!container) return;

  container.innerHTML = "";
  
  const { title, rawTitle } = (item.type === "note" || item.type === "quote")
    ? extractNoteTitleAndPreview(item)
    : { title: getArtifactTitle(item), rawTitle: getArtifactTitle(item) };

  if (item.type === "note") {
    // For standard notes, the note editor (#detail-note) below displays and allows editing the full content.
    // Hiding the top preview box prevents redundant header boxes that crowd/overlap the Note section.
    container.style.display = "none";
  } else {
    container.style.display = "block";

    if (item.type === "quote") {
      container.innerHTML = `
        <div class="rich-quote-preview">
          <i data-lucide="quote" class="quote-icon"></i>
          <blockquote class="quote-preview-text">"${escapeHtml(rawTitle || title)}"</blockquote>
        </div>
      `;
    } else if (item.type === "link") {
      let domainText = item.domain || "";
      if (!domainText && item.url) {
        try {
          domainText = new URL(item.url).hostname.replace("www.", "");
        } catch (e) {
          domainText = "";
        }
      }
      container.innerHTML = `
        <div class="preview-link-box">
          <div class="preview-link-header">
            <div class="preview-favicon">
              <img src="https://www.google.com/s2/favicons?sz=64&domain=${domainText || 'example.com'}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23666%22 stroke-width=%222%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22/></svg>'">
            </div>
            <div class="preview-link-details">
              <span class="preview-link-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
              ${domainText ? `<span class="preview-link-domain">${escapeHtml(domainText)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    } else if (item.type === "image") {
      const rawImgUrl = getItemImageUrl(item);
      const imgUrl = rawImgUrl || "data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22 viewBox=%220 0 100 100%22 fill=%22%23eaeaea%22></svg>";
      const displayTitle = item.fileName || title || "Image";
      let imgLabel = "IMAGE";
      if (item.fileName) {
        const ext = item.fileName.split('.').pop().toUpperCase();
        if (["PNG", "JPG", "JPEG", "GIF", "WEBP", "SVG"].includes(ext)) {
          imgLabel = ext;
        }
      }

      container.innerHTML = `
        <div class="preview-image-box">
          <div class="preview-image-media-wrap">
            <img class="preview-image-media" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(displayTitle)}" id="detail-preview-img-media" title="Click to view full preview">
          </div>
          <div class="preview-pdf-box" style="border-top: 1px solid var(--color-border); background: var(--color-card);">
            <div class="pdf-icon-wrap">${imgLabel}</div>
            <div class="pdf-details">
              <span class="pdf-name" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</span>
              <span class="pdf-meta">${item.fileSize ? escapeHtml(item.fileSize) : (imgLabel + ' Image')}</span>
            </div>
            <div class="pdf-actions">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-image-preview-action">
                <i data-lucide="eye"></i><span>Preview</span>
              </button>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-image-download-action">
                <i data-lucide="download"></i><span>Download</span>
              </button>
            </div>
          </div>
        </div>
      `;

      // Attach handlers for preview modal and download
      const imgMediaEl = document.getElementById("detail-preview-img-media");
      const previewBtnEl = document.getElementById("btn-image-preview-action");
      const downloadBtnEl = document.getElementById("btn-image-download-action");

      const handleOpenPreview = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openImageLightbox(rawImgUrl || imgUrl, displayTitle, item);
      };

      if (imgMediaEl) {
        imgMediaEl.addEventListener("click", handleOpenPreview);
      }
      if (previewBtnEl) {
        previewBtnEl.addEventListener("click", handleOpenPreview);
      }
      if (downloadBtnEl) {
        downloadBtnEl.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          triggerDownload(rawImgUrl || imgUrl, displayTitle);
        });
      }

    } else if (item.type === "pdf" || item.type === "file") {
      let docLabel = "DOC";
      if (item.type === "pdf") {
        docLabel = "PDF";
      } else if (item.fileName) {
        const ext = item.fileName.split('.').pop().toUpperCase();
        if (["DOC", "DOCX", "TXT", "MD", "PNG", "JPG", "JPEG", "GIF", "WEBP", "SVG", "PDF", "CSV", "JSON"].includes(ext)) {
          docLabel = ext;
        }
      }
      const fileLink = item.url || item.imageUrl || item.storagePath || "#";
      const displayTitle = item.fileName || title || "Document";
      container.innerHTML = `
        <div class="preview-pdf-box">
          <div class="pdf-icon-wrap">${docLabel}</div>
          <div class="pdf-details">
            <span class="pdf-name" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</span>
            <span class="pdf-meta">${item.fileSize ? escapeHtml(item.fileSize) : (docLabel + ' Document')}</span>
          </div>
          <div class="pdf-actions">
            ${fileLink && fileLink !== "#" ? `
            <button type="button" class="btn btn-secondary btn-sm" id="btn-doc-preview-action">
              <i data-lucide="eye"></i><span>Preview</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-doc-download-action">
              <i data-lucide="download"></i><span>Download</span>
            </button>
            ` : ''}
          </div>
        </div>
      `;

      const docPreviewBtn = document.getElementById("btn-doc-preview-action");
      const docDownloadBtn = document.getElementById("btn-doc-download-action");

      if (docPreviewBtn) {
        docPreviewBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openDocumentPreviewModal(item, fileLink, displayTitle);
        });
      }

      if (docDownloadBtn) {
        docDownloadBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          triggerDownload(fileLink, displayTitle);
        });
      }
    }
  }
}

async function handleSaveDetailChanges(e) {
  e.preventDefault();
  if (!currentDetailItem) return;

  // Auto-commit any uncommitted tag typed in detail-new-tag
  const detailTagInput = document.getElementById("detail-new-tag");
  if (detailTagInput && detailTagInput.value.trim()) {
    const val = detailTagInput.value.trim();
    if (!currentDetailItem.tags) currentDetailItem.tags = [];
    if (!currentDetailItem.tags.includes(val)) {
      currentDetailItem.tags.push(val);
    }
    detailTagInput.value = "";
  }

  const detailNoteEl = document.getElementById("detail-note");
  const rawContent = detailNoteEl ? detailNoteEl.innerHTML.trim() : "";
  const noteContent = sanitizeAndFormatHtml(rawContent);
  const plainText = stripHtml(noteContent);
  const urlVal = document.getElementById("detail-url").value.trim();

  if (!plainText && !urlVal && !currentDetailItem.imageUrl && currentDetailItem.type !== "pdf") {
    showToast("Add a note, link, or attachment before saving", "info");
    return;
  }

  const tagsToSave = Array.isArray(currentDetailItem.tags) ? [...currentDetailItem.tags] : [];

  // Locate in DB
  const dbIndex = database.findIndex(item => item.id === currentDetailItem.id);
  if (dbIndex !== -1) {
    database[dbIndex].content = noteContent;
    database[dbIndex].url = urlVal;
    database[dbIndex].tags = [...tagsToSave];
    database[dbIndex].updatedAt = Date.now();
  }

  let newTitle = currentDetailItem.title;
  if (currentDetailItem.type === "note") {
    const noteLines = extractTextLinesFromHtml(noteContent || rawContent);
    newTitle = noteLines.length > 0 ? (cleanTitleText(noteLines[0]) || "Kept note") : (currentDetailItem.title || "Kept note");
  } else if (currentDetailItem.type === "link") {
    const linkLines = extractTextLinesFromHtml(noteContent || rawContent);
    newTitle = linkLines.length > 0 ? cleanTitleText(linkLines[0]).substring(0, 45) : (currentDetailItem.title || "Saved link");
    if (newTitle.length >= 45) newTitle += "...";
    newTitle = newTitle || currentDetailItem.title || "Saved link";
  }
  if (dbIndex !== -1) database[dbIndex].title = newTitle;

  let domainVal = currentDetailItem.domain;
  if (urlVal && currentDetailItem.type === "link") {
    try {
      const hostname = new URL(urlVal).hostname;
      domainVal = hostname.replace("www.", "");
    } catch(err) {
      domainVal = "Link Source";
    }
  }
  if (dbIndex !== -1) database[dbIndex].domain = domainVal;

  await repository.update(currentDetailItem.id, {
    content: noteContent,
    url: urlVal,
    tags: tagsToSave,
    title: newTitle,
    domain: domainVal
  });

  const latest = await repository.getAll();
  if (latest && Array.isArray(latest) && latest.length > 0) {
    database = latest;
  }
  closeDetailDrawer();
  renderAll();
  if (window.lucide) window.lucide.createIcons();
  showToast("Saved changes", "success");
}

function handleDeleteDetailItem() {
  if (!currentDetailItem) return;

  const targetId = currentDetailItem.id;

  showConfirmDialog({
    title: "Delete this memory?",
    message: "This action cannot be undone.",
    cancelText: "Cancel",
    confirmText: "Delete",
    isDanger: true,
    onConfirm: async () => {
      try {
        await repository.delete(targetId);
        database = database.filter(item => item.id !== targetId);
        
        const latest = await repository.getAll();
        if (latest && Array.isArray(latest)) {
          database = latest;
        }

        closeDetailDrawer();
        renderAll();
        if (window.lucide) window.lucide.createIcons();
        showToast("Memory deleted", "info");
      } catch (err) {
        console.error("Error deleting memory:", err);
        database = database.filter(item => item.id !== targetId);
        closeDetailDrawer();
        renderAll();
        if (window.lucide) window.lucide.createIcons();
        showToast("Memory deleted", "info");
      }
    }
  });
}

/* -------------------------------------------------------------
 * One-time LocalStorage Migration
 * ------------------------------------------------------------- */
function getMigratableLocalMemories() {
  const localRaw = localStorage.getItem("keepr_db");
  if (!localRaw) return [];

  let parsed = [];
  try {
    parsed = JSON.parse(localRaw);
  } catch (e) {
    return [];
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return [];

  // Seed data signatures to prevent false-positive migration on fresh instances
  const seedSignatures = new Set(
    INITIAL_DATA.map(item => `${item.id}|${(item.title || "").trim().toLowerCase()}`)
  );

  return parsed.filter(item => {
    if (!item || typeof item !== "object") return false;
    
    const id = item.id || "";
    const title = (item.title || "").trim().toLowerCase();
    const content = (item.content || "").trim().toLowerCase();
    const sig = `${id}|${title}`;

    // Skip initial pristine seed demo items
    if (seedSignatures.has(sig)) return false;

    // Filter out corrupted / empty items
    const hasText = title.length > 0 || content.length > 0;
    const hasFile = !!(item.imageUrl || item.url || item.storagePath || item.fileName);
    if (!hasText && !hasFile) return false;

    // Filter out any accidentally saved import dialog copy artifacts
    if (title.includes("import your existing memories") || 
        title.includes("cloud import") || 
        content.includes("we found memories saved locally")) {
      return false;
    }

    return true;
  });
}

function checkAndShowMigrationDialog() {
  const isHandled = localStorage.getItem("keepr_migration_handled");
  if (isHandled === "true") return;

  const migratableItems = getMigratableLocalMemories();
  if (migratableItems.length === 0) {
    return;
  }

  if (database && database.length > 0) {
    return; // User already has artifacts in active cloud database
  }

  const modal = document.getElementById("migration-modal");
  if (modal) {
    const descEl = document.getElementById("migration-modal-desc");
    if (descEl) {
      descEl.textContent = `We found ${migratableItems.length} ${migratableItems.length === 1 ? 'memory' : 'memories'} saved locally in your browser. Would you like to import them into your cloud account?`;
    }
    modal.classList.add("active");
    if (window.lucide) window.lucide.createIcons();
  }
}

function dataURLtoFile(dataurl, filename) {
  try {
    const arr = dataurl.split(',');
    if (arr.length < 2) return null;
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr[n];
    }
    const ext = mime.split('/')[1] || 'png';
    return new File([u8arr], filename ? `${filename}.${ext}` : `imported_${Date.now()}.${ext}`, { type: mime });
  } catch (e) {
    console.warn("dataURLtoFile conversion error:", e);
    return null;
  }
}

async function handleImportMigration() {
  const modal = document.getElementById("migration-modal");
  const statusEl = document.getElementById("migration-status-text");
  const importBtn = document.getElementById("btn-confirm-migration");
  const skipBtn = document.getElementById("btn-skip-migration");

  if (importBtn) importBtn.disabled = true;
  if (skipBtn) skipBtn.disabled = true;

  const migratableItems = getMigratableLocalMemories();
  if (migratableItems.length === 0) {
    localStorage.setItem("keepr_migration_handled", "true");
    localStorage.removeItem("keepr_db");
    if (modal) modal.classList.remove("active");
    return;
  }

  let importedCount = 0;
  for (let i = 0; i < migratableItems.length; i++) {
    const item = { ...migratableItems[i] };
    if (statusEl) {
      statusEl.textContent = `Importing (${i + 1}/${migratableItems.length})...`;
    }

    // Convert and upload files if base64 or relative asset
    const dataUrl = (item.imageUrl && item.imageUrl.startsWith("data:"))
      ? item.imageUrl
      : ((item.url && item.url.startsWith("data:")) ? item.url : null);

    if (dataUrl) {
      const file = dataURLtoFile(dataUrl, item.title ? item.title.replace(/[^a-z0-9]/gi, '_') : `imported_${i}`);
      if (file) {
        try {
          const uploadRes = await repository.supabaseRepo.uploadFile(file);
          if (uploadRes && uploadRes.storagePath) {
            item.storagePath = uploadRes.storagePath;
            item.imageUrl = uploadRes.fileUrl;
            item.fileSize = uploadRes.fileSize || item.fileSize;
            item.mimeType = uploadRes.mimeType || item.mimeType;
            item.fileName = uploadRes.fileName || item.fileName;
            if (item.type !== "image" && !item.url) {
              item.url = uploadRes.fileUrl;
            }
          }
        } catch (uploadErr) {
          console.warn("Failed uploading base64 file during migration:", uploadErr);
        }
      }
    } else if (item.imageUrl && item.imageUrl.startsWith("assets/")) {
      try {
        const res = await fetch(item.imageUrl);
        if (res.ok) {
          const blob = await res.blob();
          const fileName = item.imageUrl.split('/').pop() || 'asset.png';
          const file = new File([blob], fileName, { type: blob.type || 'image/png' });
          const uploadRes = await repository.supabaseRepo.uploadFile(file);
          if (uploadRes && uploadRes.storagePath) {
            item.storagePath = uploadRes.storagePath;
            item.imageUrl = uploadRes.fileUrl;
            item.fileSize = uploadRes.fileSize || item.fileSize;
          }
        }
      } catch (assetErr) {
        console.warn("Failed uploading relative asset during migration:", assetErr);
      }
    }

    try {
      await repository.supabaseRepo.createArtifact(item);
      importedCount++;
    } catch (createErr) {
      console.error("Error creating artifact in Supabase during migration:", item.title, createErr);
    }
  }

  // Clear LocalStorage and record handled flag
  localStorage.removeItem("keepr_db");
  localStorage.setItem("keepr_migration_handled", "true");

  if (modal) modal.classList.remove("active");
  if (importBtn) importBtn.disabled = false;
  if (skipBtn) skipBtn.disabled = false;

  showToast(`Successfully imported ${importedCount} ${importedCount === 1 ? 'memory' : 'memories'}!`, "success");

  await loadDatabase();
  renderAll();
  if (window.lucide) window.lucide.createIcons();
}

function handleSkipMigration() {
  localStorage.setItem("keepr_migration_handled", "true");
  const modal = document.getElementById("migration-modal");
  if (modal) modal.classList.remove("active");
  showToast("Import skipped", "info");
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

  // Escape key: close modals/drawer/popover
  if (e.key === "Escape") {
    const emojiPopover = document.getElementById("emoji-picker-popover");
    const confirmModal = document.getElementById("confirm-dialog-modal");
    const keepModal = document.getElementById("keep-modal");
    const detailDrawer = document.getElementById("detail-drawer");
    
    if (emojiPopover && emojiPopover.style.display !== "none") {
      closeEmojiPicker();
    } else if (confirmModal && confirmModal.classList.contains("active")) {
      closeConfirmDialog();
    } else if (keepModal && keepModal.classList.contains("active")) {
      closeKeepModal();
    } else if (detailDrawer && detailDrawer.classList.contains("active")) {
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
