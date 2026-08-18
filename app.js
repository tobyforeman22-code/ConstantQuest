// ConstantQuest — app logic
'use strict';

const STORAGE_KEY = 'constantquest_progress_v1';
const LAST_DIFFICULTY_KEY = 'constantquest_last_difficulty';
const CHUNK_SIZE = 5;

const appEl = document.getElementById('app');

/* ---------------------------------------------------------------- */
/* Auth / cloud state                                                */
/* ---------------------------------------------------------------- */

let currentSession = null;
let currentProfile = null; // { id, username }
let cloudProgress = {};    // constantId -> difficultyId -> { bestStreak, perfect, attempts }
let friendships = [];      // raw rows from Backend.listFriendships

async function handleSignedIn(session) {
  currentSession = session;
  try {
    currentProfile = await Backend.getProfile(session.user.id);
  } catch (e) {
    currentProfile = null; // profile row not created yet (e.g. deferred by email confirmation)
  }
  if (currentProfile) {
    await refreshCloudProgress();
    await refreshFriendships();
    await migrateLocalProgress();
  }
}

function handleSignedOut() {
  currentSession = null;
  currentProfile = null;
  cloudProgress = {};
  friendships = [];
}

async function refreshCloudProgress() {
  const rows = await Backend.fetchAllProgress(currentProfile.id);
  cloudProgress = {};
  rows.forEach(r => {
    if (!cloudProgress[r.constant_id]) cloudProgress[r.constant_id] = {};
    cloudProgress[r.constant_id][r.difficulty_id] = {
      bestStreak: r.best_streak, perfect: r.perfect, attempts: r.attempts
    };
  });
}

async function refreshFriendships() {
  friendships = await Backend.listFriendships(currentProfile.id);
}

async function migrateLocalProgress() {
  const migratedKey = 'constantquest_migrated_' + currentProfile.id;
  if (localStorage.getItem(migratedKey)) return;

  const local = loadLocalProgress();
  const tasks = [];
  Object.keys(local).forEach(constantId => {
    Object.keys(local[constantId]).forEach(difficultyId => {
      const localEntry = local[constantId][difficultyId];
      const cloudEntry = (cloudProgress[constantId] && cloudProgress[constantId][difficultyId]) ||
        { bestStreak: 0, perfect: false, attempts: 0 };
      if (localEntry.bestStreak > cloudEntry.bestStreak || (localEntry.perfect && !cloudEntry.perfect)) {
        const merged = {
          bestStreak: Math.max(localEntry.bestStreak, cloudEntry.bestStreak),
          perfect: localEntry.perfect || cloudEntry.perfect,
          attempts: Math.max(localEntry.attempts, cloudEntry.attempts)
        };
        if (!cloudProgress[constantId]) cloudProgress[constantId] = {};
        cloudProgress[constantId][difficultyId] = merged;
        tasks.push(Backend.upsertProgress(
          currentProfile.id, constantId, difficultyId, merged.bestStreak, merged.perfect, merged.attempts
        ));
      }
    });
  });
  if (tasks.length) await Promise.all(tasks);
  localStorage.setItem(migratedKey, '1');
}

/* ---------------------------------------------------------------- */
/* Progress storage (guest / local fallback)                         */
/* ---------------------------------------------------------------- */

function loadLocalProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveLocalProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function getLocalEntry(constantId, difficultyId) {
  const progress = loadLocalProgress();
  return (progress[constantId] && progress[constantId][difficultyId]) ||
    { bestStreak: 0, perfect: false, attempts: 0 };
}

function recordLocalAttempt(constantId, difficultyId, streak, perfect) {
  const progress = loadLocalProgress();
  if (!progress[constantId]) progress[constantId] = {};
  const existing = progress[constantId][difficultyId] || { bestStreak: 0, perfect: false, attempts: 0 };
  progress[constantId][difficultyId] = {
    bestStreak: Math.max(existing.bestStreak, streak),
    perfect: existing.perfect || perfect,
    attempts: existing.attempts + 1
  };
  saveLocalProgress(progress);
  return progress[constantId][difficultyId];
}

/* ---------------------------------------------------------------- */
/* Progress storage (unified — cloud when signed in, local otherwise) */
/* ---------------------------------------------------------------- */

function getEntry(constantId, difficultyId) {
  if (currentProfile) {
    return (cloudProgress[constantId] && cloudProgress[constantId][difficultyId]) ||
      { bestStreak: 0, perfect: false, attempts: 0 };
  }
  return getLocalEntry(constantId, difficultyId);
}

async function recordAttempt(constantId, difficultyId, streak, perfect) {
  if (currentProfile) {
    const existing = getEntry(constantId, difficultyId);
    const updated = {
      bestStreak: Math.max(existing.bestStreak, streak),
      perfect: existing.perfect || perfect,
      attempts: existing.attempts + 1
    };
    if (!cloudProgress[constantId]) cloudProgress[constantId] = {};
    cloudProgress[constantId][difficultyId] = updated;
    try {
      await Backend.upsertProgress(
        currentProfile.id, constantId, difficultyId, updated.bestStreak, updated.perfect, updated.attempts
      );
    } catch (e) {
      console.error('Failed to sync progress to Supabase', e);
    }
    return updated;
  }
  return recordLocalAttempt(constantId, difficultyId, streak, perfect);
}

function masteredCount(constantId) {
  return DIFFICULTIES.filter(d => getEntry(constantId, d.id).perfect).length;
}

function getLastDifficulty() {
  return localStorage.getItem(LAST_DIFFICULTY_KEY) || 'easy';
}

function setLastDifficulty(id) {
  localStorage.setItem(LAST_DIFFICULTY_KEY, id);
}

/* ---------------------------------------------------------------- */
/* Helpers                                                            */
/* ---------------------------------------------------------------- */

function findConstant(id) {
  return CONSTANTS.find(c => c.id === id);
}

function chunk(str, size) {
  const chunks = [];
  for (let i = 0; i < str.length; i += size) chunks.push(str.slice(i, i + size));
  return chunks;
}

function clone(tplId) {
  return document.getElementById(tplId).content.cloneNode(true);
}

function quizTarget(c, dConf) {
  return `${c.intPart}.${c.digits.slice(0, dConf.digits)}`;
}

/* ---------------------------------------------------------------- */
/* Router                                                             */
/* ---------------------------------------------------------------- */

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] === 'constant' && parts[1]) return { view: 'detail', id: parts[1] };
  if (parts[0] === 'stats') return { view: 'stats' };
  if (parts[0] === 'login') return { view: 'auth' };
  if (parts[0] === 'friends') return { view: 'friends' };
  if (parts[0] === 'leaderboard') return { view: 'leaderboard' };
  return { view: 'home' };
}

function navigate(hash) {
  location.hash = hash;
}

window.addEventListener('hashchange', render);

function render() {
  renderHeader();
  appEl.innerHTML = '';

  if (currentSession && !currentProfile) {
    renderCompleteProfile();
    window.scrollTo(0, 0);
    return;
  }

  const route = parseHash();
  if (route.view === 'home') renderHome();
  else if (route.view === 'stats') renderStats();
  else if (route.view === 'auth') renderAuth();
  else if (route.view === 'friends') renderFriendsView();
  else if (route.view === 'leaderboard') renderLeaderboardView();
  else if (route.view === 'detail') {
    const constant = findConstant(route.id);
    if (constant) renderDetail(constant);
    else renderHome();
  }
  window.scrollTo(0, 0);
}

/* ---------------------------------------------------------------- */
/* Header                                                             */
/* ---------------------------------------------------------------- */

function renderHeader() {
  const nav = document.getElementById('header-nav');
  nav.innerHTML = '';

  const lbBtn = document.createElement('button');
  lbBtn.className = 'ghost-btn';
  lbBtn.textContent = '🏆 Leaderboard';
  lbBtn.addEventListener('click', () => navigate('#/leaderboard'));
  nav.appendChild(lbBtn);

  const statsBtn = document.createElement('button');
  statsBtn.className = 'ghost-btn';
  statsBtn.textContent = 'My Progress';
  statsBtn.addEventListener('click', () => navigate('#/stats'));
  nav.appendChild(statsBtn);

  if (currentProfile) {
    const friendsBtn = document.createElement('button');
    friendsBtn.className = 'ghost-btn';
    friendsBtn.textContent = '🤝 Friends';
    friendsBtn.addEventListener('click', () => navigate('#/friends'));
    nav.appendChild(friendsBtn);

    const userChip = document.createElement('span');
    userChip.className = 'user-chip';
    userChip.textContent = `👤 ${currentProfile.username}`;
    nav.appendChild(userChip);

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'ghost-btn';
    logoutBtn.textContent = 'Log Out';
    logoutBtn.addEventListener('click', async () => { await Backend.signOut(); });
    nav.appendChild(logoutBtn);
  } else {
    const loginBtn = document.createElement('button');
    loginBtn.className = 'primary-btn header-login-btn';
    loginBtn.textContent = 'Sign In';
    loginBtn.addEventListener('click', () => navigate('#/login'));
    nav.appendChild(loginBtn);
  }
}

/* ---------------------------------------------------------------- */
/* Home view                                                         */
/* ---------------------------------------------------------------- */

function renderHome() {
  const frag = clone('tpl-home');
  const grid = frag.getElementById('constant-grid');

  CONSTANTS.forEach(c => {
    const cardFrag = clone('tpl-card');
    const card = cardFrag.querySelector('.card');
    card.style.setProperty('--accent-card', c.color);
    card.querySelector('.card-symbol').textContent = c.symbol;
    card.querySelector('.card-symbol').style.color = c.color;
    card.querySelector('.card-name').textContent = c.name;
    card.querySelector('.card-preview').textContent =
      `${c.intPart}.${c.digits.slice(0, 18)}…`;

    const badgeWrap = card.querySelector('.card-badges');
    const mastered = masteredCount(c.id);
    DIFFICULTIES.forEach(d => {
      const dot = document.createElement('span');
      dot.className = 'badge-dot' + (getEntry(c.id, d.id).perfect ? ' earned' : '');
      dot.title = `${d.label}: ${getEntry(c.id, d.id).perfect ? 'Mastered' : 'Not yet mastered'}`;
      badgeWrap.appendChild(dot);
    });

    card.querySelector('.card-progress-fill').style.width = `${(mastered / DIFFICULTIES.length) * 100}%`;
    card.querySelector('.card-progress-label').textContent = `${mastered}/${DIFFICULTIES.length} mastered`;

    const go = () => navigate(`#/constant/${c.id}`);
    card.addEventListener('click', go);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });

    grid.appendChild(cardFrag);
  });

  appEl.appendChild(frag);
}

/* ---------------------------------------------------------------- */
/* Stats view                                                        */
/* ---------------------------------------------------------------- */

function renderStats() {
  const frag = clone('tpl-stats');
  frag.getElementById('stats-back-btn').addEventListener('click', () => navigate('#/'));

  const intro = frag.querySelector('.stats-intro');
  intro.textContent = currentProfile
    ? `Signed in as ${currentProfile.username} — progress is saved to your account.`
    : 'Guest mode — progress is saved on this device only. Sign in to save it permanently and appear on leaderboards.';

  const table = frag.getElementById('stats-table');

  CONSTANTS.forEach(c => {
    const row = document.createElement('div');
    row.className = 'stats-row';

    const symbol = document.createElement('span');
    symbol.className = 'stats-row-symbol';
    symbol.style.color = c.color;
    symbol.textContent = c.symbol;
    row.appendChild(symbol);

    const name = document.createElement('span');
    name.className = 'stats-row-name';
    name.textContent = c.name;
    row.appendChild(name);

    const badges = document.createElement('div');
    badges.className = 'stats-badges';
    DIFFICULTIES.forEach(d => {
      const entry = getEntry(c.id, d.id);
      const totalLen = c.intPart.length + 1 + d.digits;
      const b = document.createElement('span');
      b.className = 'mini-badge' + (entry.perfect ? ' earned' : '');
      b.textContent = `${d.label} ${entry.bestStreak}/${totalLen}`;
      badges.appendChild(b);
    });
    row.appendChild(badges);

    table.appendChild(row);
  });

  appEl.appendChild(frag);
}

/* ---------------------------------------------------------------- */
/* Auth view (login / signup)                                        */
/* ---------------------------------------------------------------- */

function renderAuth() {
  const frag = clone('tpl-auth');
  const backBtn = frag.getElementById('auth-back-btn');
  const warning = frag.getElementById('auth-config-warning');
  const tabs = [...frag.querySelectorAll('.auth-tab')];
  const usernameField = frag.querySelector('.username-field');
  const usernameInput = frag.getElementById('auth-username');
  const emailInput = frag.getElementById('auth-email');
  const passwordInput = frag.getElementById('auth-password');
  const errorEl = frag.getElementById('auth-error');
  const form = frag.getElementById('auth-form');
  const submitBtn = frag.getElementById('auth-submit');

  backBtn.addEventListener('click', () => navigate('#/'));
  if (!Backend.isConfigured()) warning.classList.remove('hidden');

  let mode = 'login';
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      mode = tab.dataset.authMode;
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      usernameField.classList.toggle('hidden', mode !== 'signup');
      submitBtn.textContent = mode === 'signup' ? 'Sign Up' : 'Log In';
      errorEl.classList.add('hidden');
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'signup' ? 'Signing up…' : 'Logging in…';
    try {
      if (!Backend.isConfigured()) throw new Error('Supabase is not configured yet — see config.js and README.md.');
      if (mode === 'signup') {
        const username = usernameInput.value.trim();
        if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
          throw new Error('Username must be 3-20 characters: letters, numbers, underscores only.');
        }
        await Backend.signUp(emailInput.value.trim(), passwordInput.value, username);
      } else {
        await Backend.signIn(emailInput.value.trim(), passwordInput.value);
      }
      navigate('#/');
    } catch (err) {
      errorEl.textContent = err.message || 'Something went wrong.';
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'signup' ? 'Sign Up' : 'Log In';
    }
  });

  appEl.appendChild(frag);
}

function renderCompleteProfile() {
  const wrap = document.createElement('div');
  wrap.className = 'auth-view';

  const card = document.createElement('div');
  card.className = 'auth-card';

  const title = document.createElement('h2');
  title.textContent = 'One more step';
  card.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'stats-intro';
  desc.textContent = 'Your email is confirmed — pick a username to finish setting up your account.';
  card.appendChild(desc);

  const form = document.createElement('form');
  form.className = 'auth-form';

  const label = document.createElement('label');
  label.className = 'auth-field';
  const span = document.createElement('span');
  span.textContent = 'Username';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 20;
  input.placeholder = 'e.g. digit_dynamo';
  label.appendChild(span);
  label.appendChild(input);
  form.appendChild(label);

  const errorEl = document.createElement('p');
  errorEl.className = 'auth-error hidden';
  form.appendChild(errorEl);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'primary-btn auth-submit';
  submitBtn.textContent = 'Save Username';
  form.appendChild(submitBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = input.value.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      errorEl.textContent = 'Username must be 3-20 characters: letters, numbers, underscores only.';
      errorEl.classList.remove('hidden');
      return;
    }
    submitBtn.disabled = true;
    try {
      await Backend.completeProfile(currentSession.user.id, username);
      currentProfile = await Backend.getProfile(currentSession.user.id);
      await refreshCloudProgress();
      await refreshFriendships();
      await migrateLocalProgress();
      render();
    } catch (err) {
      errorEl.textContent = err.message || 'Something went wrong.';
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
    }
  });

  card.appendChild(form);
  wrap.appendChild(card);
  appEl.appendChild(wrap);
}

/* ---------------------------------------------------------------- */
/* Friends view                                                      */
/* ---------------------------------------------------------------- */

function renderFriendsView() {
  if (!currentProfile) {
    renderLoginPrompt('Sign in to add friends and compare progress.');
    return;
  }

  const frag = clone('tpl-friends');
  frag.getElementById('friends-back-btn').addEventListener('click', () => navigate('#/'));

  const searchInput = frag.getElementById('friend-search-input');
  const searchBtn = frag.getElementById('friend-search-btn');
  const resultsEl = frag.getElementById('friend-search-results');
  const requestsListEl = frag.getElementById('friend-requests-list');
  const friendListEl = frag.getElementById('friend-list');

  async function doSearch() {
    const q = searchInput.value.trim();
    resultsEl.innerHTML = '';
    if (!q) return;
    let results;
    try {
      results = await Backend.searchUsers(q, currentProfile.id);
    } catch (e) {
      resultsEl.textContent = 'Search failed.';
      return;
    }
    if (!results.length) {
      resultsEl.textContent = 'No users found.';
      return;
    }
    results.forEach(u => {
      const row = document.createElement('div');
      row.className = 'friend-row';
      const name = document.createElement('span');
      name.textContent = u.username;
      row.appendChild(name);
      const addBtn = document.createElement('button');
      addBtn.className = 'secondary-btn';
      addBtn.textContent = 'Add Friend';
      addBtn.addEventListener('click', async () => {
        addBtn.disabled = true;
        try {
          await Backend.sendFriendRequest(currentProfile.id, u.id);
          addBtn.textContent = 'Sent!';
          await refreshFriendships();
          drawLists();
        } catch (e) {
          addBtn.textContent = e.message || 'Error';
        }
      });
      row.appendChild(addBtn);
      resultsEl.appendChild(row);
    });
  }

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });

  async function drawLists() {
    requestsListEl.innerHTML = '';
    friendListEl.innerHTML = '';

    const otherIds = friendships.map(f => f.requester_id === currentProfile.id ? f.addressee_id : f.requester_id);
    const nameMap = await Backend.getUsernamesByIds(otherIds);

    const incoming = friendships.filter(f => f.status === 'pending' && f.addressee_id === currentProfile.id);
    const outgoing = friendships.filter(f => f.status === 'pending' && f.requester_id === currentProfile.id);
    const accepted = friendships.filter(f => f.status === 'accepted');

    if (!incoming.length && !outgoing.length) {
      const p = document.createElement('p');
      p.className = 'friend-empty';
      p.textContent = 'No pending requests.';
      requestsListEl.appendChild(p);
    } else {
      incoming.forEach(f => {
        const row = document.createElement('div');
        row.className = 'friend-row';
        const name = document.createElement('span');
        name.textContent = `${nameMap[f.requester_id] || 'Unknown'} wants to be friends`;
        row.appendChild(name);
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'primary-btn';
        acceptBtn.textContent = 'Accept';
        acceptBtn.addEventListener('click', async () => {
          await Backend.respondToRequest(f.id, true);
          await refreshFriendships();
          drawLists();
        });
        const declineBtn = document.createElement('button');
        declineBtn.className = 'secondary-btn';
        declineBtn.textContent = 'Decline';
        declineBtn.addEventListener('click', async () => {
          await Backend.respondToRequest(f.id, false);
          await refreshFriendships();
          drawLists();
        });
        row.appendChild(acceptBtn);
        row.appendChild(declineBtn);
        requestsListEl.appendChild(row);
      });
      outgoing.forEach(f => {
        const row = document.createElement('div');
        row.className = 'friend-row';
        const name = document.createElement('span');
        name.textContent = `Request sent to ${nameMap[f.addressee_id] || 'Unknown'}`;
        row.appendChild(name);
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'secondary-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', async () => {
          await Backend.removeFriend(f.id);
          await refreshFriendships();
          drawLists();
        });
        row.appendChild(cancelBtn);
        requestsListEl.appendChild(row);
      });
    }

    if (!accepted.length) {
      const p = document.createElement('p');
      p.className = 'friend-empty';
      p.textContent = 'No friends yet — search for a username above.';
      friendListEl.appendChild(p);
    } else {
      accepted.forEach(f => {
        const otherId = f.requester_id === currentProfile.id ? f.addressee_id : f.requester_id;
        const row = document.createElement('div');
        row.className = 'friend-row';
        const name = document.createElement('span');
        name.textContent = nameMap[otherId] || 'Unknown';
        row.appendChild(name);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'secondary-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', async () => {
          await Backend.removeFriend(f.id);
          await refreshFriendships();
          drawLists();
        });
        row.appendChild(removeBtn);
        friendListEl.appendChild(row);
      });
    }
  }

  appEl.appendChild(frag);
  drawLists();
}

function renderLoginPrompt(message) {
  const wrap = document.createElement('div');
  wrap.className = 'auth-view';

  const card = document.createElement('div');
  card.className = 'auth-card';

  const p = document.createElement('p');
  p.className = 'stats-intro';
  p.textContent = message;
  card.appendChild(p);

  const btn = document.createElement('button');
  btn.className = 'primary-btn';
  btn.textContent = 'Sign In / Sign Up';
  btn.addEventListener('click', () => navigate('#/login'));
  card.appendChild(btn);

  wrap.appendChild(card);
  appEl.appendChild(wrap);
}

/* ---------------------------------------------------------------- */
/* Leaderboard view                                                   */
/* ---------------------------------------------------------------- */

function renderLeaderboardView() {
  const frag = clone('tpl-leaderboard');
  frag.getElementById('leaderboard-back-btn').addEventListener('click', () => navigate('#/'));

  const constantSelect = frag.getElementById('lb-constant-select');
  CONSTANTS.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.symbol} ${c.name}`;
    constantSelect.appendChild(opt);
  });

  const difficultySelect = frag.getElementById('lb-difficulty-select');
  DIFFICULTIES.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = `${d.label} (${d.digits})`;
    difficultySelect.appendChild(opt);
  });
  difficultySelect.value = getLastDifficulty();

  const scopeTabs = frag.querySelectorAll('.leaderboard-scope-tabs .mode-tab');
  const tableEl = frag.getElementById('leaderboard-table');

  let scope = 'global';
  scopeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      scope = tab.dataset.scope;
      scopeTabs.forEach(t => t.classList.toggle('active', t === tab));
      draw();
    });
  });

  constantSelect.addEventListener('change', draw);
  difficultySelect.addEventListener('change', draw);

  async function draw() {
    tableEl.innerHTML = '';
    const loading = document.createElement('p');
    loading.className = 'lb-empty';
    loading.textContent = 'Loading…';
    tableEl.appendChild(loading);

    if (scope === 'friends' && !currentProfile) {
      tableEl.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'lb-empty';
      p.textContent = 'Log in to see how you stack up against friends.';
      tableEl.appendChild(p);
      return;
    }

    let userIds = null;
    if (scope === 'friends') {
      const ids = new Set([currentProfile.id]);
      friendships.filter(f => f.status === 'accepted').forEach(f => {
        ids.add(f.requester_id === currentProfile.id ? f.addressee_id : f.requester_id);
      });
      userIds = [...ids];
    }

    let rows;
    try {
      rows = await Backend.fetchLeaderboard(constantSelect.value, difficultySelect.value, userIds);
    } catch (e) {
      tableEl.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'lb-empty';
      p.textContent = Backend.isConfigured()
        ? 'Could not load the leaderboard.'
        : 'Supabase is not configured yet — see config.js and README.md.';
      tableEl.appendChild(p);
      return;
    }

    tableEl.innerHTML = '';
    if (!rows.length) {
      const p = document.createElement('p');
      p.className = 'lb-empty';
      p.textContent = 'No scores yet for this constant and difficulty. Be the first!';
      tableEl.appendChild(p);
      return;
    }

    rows.forEach((row, i) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'lb-row' + (currentProfile && row.user_id === currentProfile.id ? ' lb-row-me' : '');

      const rank = document.createElement('span');
      rank.className = 'lb-rank';
      rank.textContent = `#${i + 1}`;
      rowEl.appendChild(rank);

      const name = document.createElement('span');
      name.className = 'lb-name';
      name.textContent = row.username + (row.perfect ? ' 🏅' : '');
      rowEl.appendChild(name);

      const streak = document.createElement('span');
      streak.className = 'lb-streak';
      streak.textContent = `${row.best_streak} chars`;
      rowEl.appendChild(streak);

      tableEl.appendChild(rowEl);
    });
  }

  appEl.appendChild(frag);
  draw();
}

/* ---------------------------------------------------------------- */
/* Detail view                                                       */
/* ---------------------------------------------------------------- */

function renderDetail(c) {
  const frag = clone('tpl-detail');
  frag.getElementById('back-btn').addEventListener('click', () => navigate('#/'));

  const symbolEl = frag.querySelector('.detail-symbol');
  symbolEl.textContent = c.symbol;
  symbolEl.style.color = c.color;
  frag.querySelector('.detail-name').textContent = c.name;
  frag.querySelector('.detail-formula').textContent = c.formula;
  frag.querySelector('.detail-fact').textContent = c.fact;

  let currentDifficulty = getLastDifficulty();
  let currentMode = 'learn';

  const diffButtonsWrap = frag.getElementById('difficulty-buttons');
  DIFFICULTIES.forEach(d => {
    const btn = document.createElement('button');
    btn.className = 'diff-btn' + (d.id === currentDifficulty ? ' active' : '');
    btn.textContent = `${d.label} (${d.digits})`;
    btn.dataset.diff = d.id;
    btn.addEventListener('click', () => {
      currentDifficulty = d.id;
      setLastDifficulty(d.id);
      diffButtonsWrap.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b.dataset.diff === d.id));
      updateBestStreakLabel();
      if (currentMode === 'learn') renderLearnPanel(); else renderQuizPanel();
    });
    diffButtonsWrap.appendChild(btn);
  });

  const bestStreakEl = frag.getElementById('best-streak');
  function updateBestStreakLabel() {
    const dConf = DIFFICULTIES.find(d => d.id === currentDifficulty);
    const entry = getEntry(c.id, currentDifficulty);
    const totalLen = c.intPart.length + 1 + dConf.digits;
    bestStreakEl.textContent = entry.perfect
      ? `✓ Mastered (best streak ${entry.bestStreak}/${totalLen})`
      : `Best streak: ${entry.bestStreak}/${totalLen}`;
  }

  const tabs = frag.querySelectorAll('.mode-tab');
  const learnPanel = frag.getElementById('learn-panel');
  const quizPanel = frag.getElementById('quiz-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      currentMode = tab.dataset.mode;
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      learnPanel.classList.toggle('hidden', currentMode !== 'learn');
      quizPanel.classList.toggle('hidden', currentMode !== 'quiz');
      if (currentMode === 'learn') renderLearnPanel(); else renderQuizPanel();
    });
  });

  /* -------------------- Learn mode -------------------- */

  let revealedCount = 1; // number of chunks revealed
  let coverMode = false;

  function renderLearnPanel() {
    learnPanel.innerHTML = '';
    revealedCount = 1;
    coverMode = false;
    drawLearn();
  }

  function drawLearn() {
    learnPanel.innerHTML = '';
    const dConf = DIFFICULTIES.find(d => d.id === currentDifficulty);
    const targetDigits = c.digits.slice(0, dConf.digits);
    const chunks = chunk(targetDigits, CHUNK_SIZE);
    const totalChunks = chunks.length;
    if (revealedCount > totalChunks) revealedCount = totalChunks;

    const display = document.createElement('div');
    display.className = 'digit-display';

    const intSpan = document.createElement('span');
    intSpan.className = 'digit-int';
    intSpan.textContent = c.intPart;
    display.appendChild(intSpan);

    const dotSpan = document.createElement('span');
    dotSpan.className = 'digit-dot';
    dotSpan.textContent = '.';
    display.appendChild(dotSpan);

    chunks.forEach((ch, i) => {
      const span = document.createElement('span');
      const isRevealed = i < revealedCount;
      span.className = 'digit-chunk ' + (isRevealed ? 'revealed' : 'unrevealed');
      if (isRevealed && coverMode) {
        span.textContent = '•'.repeat(ch.length);
      } else if (isRevealed) {
        span.textContent = ch;
      } else {
        span.textContent = '•'.repeat(ch.length);
      }
      display.appendChild(span);
    });

    const beyond = c.digits.slice(dConf.digits, dConf.digits + 15);
    if (beyond) {
      const beyondSpan = document.createElement('span');
      beyondSpan.className = 'digit-chunk beyond-range';
      beyondSpan.textContent = beyond + '…';
      display.appendChild(beyondSpan);
    }

    learnPanel.appendChild(display);

    const controls = document.createElement('div');
    controls.className = 'learn-controls';

    const revealNextBtn = document.createElement('button');
    revealNextBtn.className = 'primary-btn';
    revealNextBtn.textContent = `Reveal next ${CHUNK_SIZE} digits`;
    revealNextBtn.disabled = revealedCount >= totalChunks;
    revealNextBtn.addEventListener('click', () => { revealedCount++; drawLearn(); });
    controls.appendChild(revealNextBtn);

    const revealAllBtn = document.createElement('button');
    revealAllBtn.className = 'secondary-btn';
    revealAllBtn.textContent = 'Reveal all';
    revealAllBtn.addEventListener('click', () => { revealedCount = totalChunks; coverMode = false; drawLearn(); });
    controls.appendChild(revealAllBtn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'secondary-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => { revealedCount = 1; coverMode = false; drawLearn(); });
    controls.appendChild(resetBtn);

    learnPanel.appendChild(controls);

    const hideRow = document.createElement('label');
    hideRow.className = 'hide-toggle-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = coverMode;
    checkbox.addEventListener('change', () => { coverMode = checkbox.checked; drawLearn(); });
    hideRow.appendChild(checkbox);
    const hideLabel = document.createElement('span');
    hideLabel.textContent = '🙈 Cover revealed digits — test yourself before checking';
    hideRow.appendChild(hideLabel);
    learnPanel.appendChild(hideRow);

    const progressText = document.createElement('p');
    progressText.className = 'learn-progress-text';
    progressText.textContent = `Studied ${Math.min(revealedCount * CHUNK_SIZE, targetDigits.length)} / ${targetDigits.length} digits for ${dConf.label} mode. When you're confident, switch to the Quiz tab to test your recall.`;
    learnPanel.appendChild(progressText);
  }

  /* -------------------- Quiz mode -------------------- */

  let typedValue = '';
  let startTime = null;
  let finished = false;

  function renderQuizPanel() {
    quizPanel.innerHTML = '';
    typedValue = '';
    startTime = null;
    finished = false;
    drawQuiz();
  }

  function drawQuiz() {
    quizPanel.innerHTML = '';
    const dConf = DIFFICULTIES.find(d => d.id === currentDifficulty);
    const target = quizTarget(c, dConf);
    const prefixLen = c.intPart.length + 1; // integer digits + the decimal point

    const info = document.createElement('p');
    info.className = 'quiz-target-info';
    info.textContent = `Type ${c.name} from memory, starting with "${c.intPart}." — the first ${dConf.digits} decimal digits for ${dConf.label} mode. Correct characters turn green as you go.`;
    quizPanel.appendChild(info);

    const displayWrap = document.createElement('div');
    displayWrap.className = 'quiz-input-display';

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'text';
    hiddenInput.inputMode = 'decimal';
    hiddenInput.autocomplete = 'off';
    hiddenInput.className = 'quiz-hidden-input';
    hiddenInput.maxLength = target.length;

    function renderQDigit(pos) {
      const typedChar = typedValue[pos];
      const digitSpan = document.createElement('span');
      if (typedChar === undefined) {
        digitSpan.className = 'q-digit pending';
        digitSpan.textContent = '_';
      } else if (typedChar === target[pos]) {
        digitSpan.className = 'q-digit correct';
        digitSpan.textContent = typedChar;
      } else {
        digitSpan.className = 'q-digit wrong';
        digitSpan.textContent = typedChar;
      }
      if (pos === typedValue.length && !finished) digitSpan.classList.add('cursor');
      return digitSpan;
    }

    function drawDigits() {
      displayWrap.innerHTML = '';

      const prefixSpan = document.createElement('span');
      prefixSpan.className = 'digit-chunk';
      for (let pos = 0; pos < prefixLen; pos++) prefixSpan.appendChild(renderQDigit(pos));
      displayWrap.appendChild(prefixSpan);

      const fracLen = target.length - prefixLen;
      const chunkSizes = chunk('x'.repeat(fracLen), CHUNK_SIZE).map(s => s.length);
      let idx = prefixLen;
      chunkSizes.forEach(size => {
        const chunkSpan = document.createElement('span');
        chunkSpan.className = 'digit-chunk';
        for (let i = 0; i < size; i++) { chunkSpan.appendChild(renderQDigit(idx)); idx++; }
        displayWrap.appendChild(chunkSpan);
      });
    }

    drawDigits();
    displayWrap.addEventListener('click', () => hiddenInput.focus());
    quizPanel.appendChild(displayWrap);
    quizPanel.appendChild(hiddenInput);

    const controls = document.createElement('div');
    controls.className = 'quiz-controls';

    const focusBtn = document.createElement('button');
    focusBtn.className = 'primary-btn';
    focusBtn.textContent = typedValue.length ? 'Resume typing' : 'Start quiz';
    focusBtn.addEventListener('click', () => hiddenInput.focus());
    controls.appendChild(focusBtn);

    const finishBtn = document.createElement('button');
    finishBtn.className = 'secondary-btn';
    finishBtn.textContent = 'Finish now';
    finishBtn.addEventListener('click', () => finishQuiz());
    controls.appendChild(finishBtn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'secondary-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => renderQuizPanel());
    controls.appendChild(resetBtn);

    quizPanel.appendChild(controls);

    hiddenInput.addEventListener('input', () => {
      if (finished) return;
      if (startTime === null) startTime = Date.now();
      const filtered = hiddenInput.value.replace(/[^0-9.]/g, '').slice(0, target.length);
      hiddenInput.value = filtered;
      typedValue = filtered;
      drawDigits();
      if (typedValue.length === target.length) finishQuiz();
    });

    const resultHolder = document.createElement('div');
    resultHolder.id = 'quiz-result-holder';
    quizPanel.appendChild(resultHolder);

    async function finishQuiz() {
      finished = true;
      hiddenInput.blur();
      hiddenInput.disabled = true;
      drawDigits();

      let streak = 0;
      while (streak < typedValue.length && typedValue[streak] === target[streak]) streak++;
      const correctCount = [...typedValue].filter((ch, i) => ch === target[i]).length;
      const accuracy = typedValue.length ? Math.round((correctCount / typedValue.length) * 100) : 0;
      const perfect = streak === target.length && typedValue.length === target.length;
      const elapsedSec = startTime ? ((Date.now() - startTime) / 1000).toFixed(1) : '0.0';

      const priorEntry = getEntry(c.id, currentDifficulty);
      const isNewBest = streak > priorEntry.bestStreak;
      await recordAttempt(c.id, currentDifficulty, streak, perfect);
      updateBestStreakLabel();

      const resultBox = document.createElement('div');
      resultBox.className = 'quiz-result ' + (perfect ? 'success' : 'fail');

      const title = document.createElement('h3');
      title.textContent = perfect
        ? '🎉 Perfect! You mastered this difficulty.'
        : `You got ${streak} character${streak === 1 ? '' : 's'} correct in a row before a slip.`;
      resultBox.appendChild(title);

      const p = document.createElement('p');
      p.textContent = `Accuracy: ${accuracy}% · Time: ${elapsedSec}s${isNewBest ? ' · New personal best streak!' : ''}`;
      resultBox.appendChild(p);

      if (!perfect) {
        const revealBtn = document.createElement('button');
        revealBtn.className = 'secondary-btn';
        revealBtn.style.marginTop = '10px';
        revealBtn.textContent = 'Show correct answer';
        revealBtn.addEventListener('click', () => {
          const reveal = document.createElement('div');
          reveal.className = 'answer-reveal';
          reveal.textContent = target;
          resultBox.appendChild(reveal);
          revealBtn.remove();
        });
        resultBox.appendChild(revealBtn);
      }

      const tryAgainBtn = document.createElement('button');
      tryAgainBtn.className = 'primary-btn';
      tryAgainBtn.style.marginTop = '10px';
      tryAgainBtn.style.marginLeft = perfect ? '0' : '10px';
      tryAgainBtn.textContent = 'Try again';
      tryAgainBtn.addEventListener('click', () => renderQuizPanel());
      resultBox.appendChild(document.createElement('br'));
      resultBox.appendChild(tryAgainBtn);

      resultHolder.innerHTML = '';
      resultHolder.appendChild(resultBox);
    }

    if (!finished) hiddenInput.focus();
  }

  appEl.appendChild(frag);
  updateBestStreakLabel();
  renderLearnPanel();
}

/* ---------------------------------------------------------------- */
/* Init                                                               */
/* ---------------------------------------------------------------- */

async function init() {
  render();

  if (!Backend.isConfigured()) return;

  try {
    const session = await Backend.getSession();
    if (session) {
      await handleSignedIn(session);
      render();
    }
  } catch (e) {
    console.error('Failed to restore session', e);
  }

  Backend.onAuthStateChange(async (session) => {
    if (session) {
      if (!currentSession || session.user.id !== currentSession.user.id) {
        await handleSignedIn(session);
        render();
      }
    } else if (currentSession) {
      handleSignedOut();
      render();
    }
  });
}

init();
