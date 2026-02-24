// ════════════════════════════════════════════════════════════
//  app.js — Serene · Single JS file for all pages
//  Each page's <body> has a data-page attribute that routes
//  init logic to the right section below.
//
//  data-page values:
//    "landing"   → index.html
//    "login"     → login.html
//    "signup"    → signup.html
//    "chat"      → chat.html
//    "dashboard" → dashboard.html
//    "forum"     → forum.html
// ════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════
//  SECTION 1 — CONFIG & SUPABASE CLIENT
// ════════════════════════════════════════════════════════════

const SUPABASE_URL      = 'https://uyvmclqixjlqdyhfltfi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5dm1jbHFpeGpscWR5aGZsdGZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4Mzg1NzIsImV4cCI6MjA4NzQxNDU3Mn0.1FFjFn5usdsekYIkBGIO9ZfSymLhcu9sXRTu5HnVBHM'; // ← Supabase Dashboard → Project Settings → API → anon/public

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const API_BASE          = 'http://localhost:8000';
const API               = {
  chat:      `${API_BASE}/chat`,
  sentiment: `${API_BASE}/sentiment`,
  mood:      `${API_BASE}/mood`,
  alert:     `${API_BASE}/alert`,
};
const SENTIMENT_THRESHOLD = -0.75;


// ════════════════════════════════════════════════════════════
//  SECTION 2 — SHARED UTILITIES (available on every page)
// ════════════════════════════════════════════════════════════

// ─── Theme ────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-toggle').forEach(b => {
    b.textContent = theme === 'dark' ? '🌙' : '☀️';
  });
}
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', next);
  applyTheme(next);
}
// Apply saved theme immediately (runs before DOMContentLoaded)
applyTheme(localStorage.getItem('theme') || 'dark');

// ─── Toast ────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type]}</span> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ─── Modal ────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// ─── Auth helpers ─────────────────────────────────────────
async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return null; }
  return session;
}
async function getUser() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}
function getDisplayName(user) {
  return user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
}
function getInitial(user) { return getDisplayName(user)[0].toUpperCase(); }
function getTimeOfDay() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
async function handleLogout() {
  await supabase.auth.signOut();
  showToast('Signed out. Take care! 👋', 'info');
  setTimeout(() => window.location.href = 'index.html', 800);
}
async function handleGoogleAuth() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/chat.html' },
  });
  if (error) showToast(error.message, 'error');
}
function togglePassword(id, btn) {
  const input = document.getElementById(id);
  const hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password';
  btn.textContent = hidden ? '🙈' : '👁';
}

// ─── Supabase DB helpers ──────────────────────────────────
async function saveMoodEntry(userId, moodLabel, moodScore) {
  const { error } = await supabase.from('mood_entries').insert({
    user_id: userId, mood_label: moodLabel,
    mood_score: moodScore, created_at: new Date().toISOString(),
  });
  if (error) console.error('[Serene] saveMoodEntry:', error);
}
async function fetchMoodHistory(userId, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('mood_entries')
    .select('mood_score, created_at')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at');
  if (error) { console.error('[Serene] fetchMoodHistory:', error); return []; }
  return data || [];
}
async function saveChatMessage(userId, sessionId, role, content, sentimentScore = null) {
  const { error } = await supabase.from('chat_messages').insert({
    user_id: userId, session_id: sessionId,
    role, content, sentiment_score: sentimentScore,
    created_at: new Date().toISOString(),
  });
  if (error) console.error('[Serene] saveChatMessage:', error);
}
async function fetchChatSessions(userId) {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, title, created_at, mood_start, mood_end')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) { console.error('[Serene] fetchChatSessions:', error); return []; }
  return data || [];
}

// ─── General utils ────────────────────────────────────────
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}


// ════════════════════════════════════════════════════════════
//  SECTION 3 — PAGE ROUTER
//  Reads data-page from <body> and calls the right init fn
// ════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Close modals on backdrop click
  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
  });

  const page = document.body.dataset.page;
  const routes = {
    landing:   initLanding,
    login:     initLogin,
    signup:    initSignup,
    chat:      initChat,
    dashboard: initDashboard,
    forum:     initForum,
  };

  if (routes[page]) {
    routes[page]();
  } else {
    console.warn(`[Serene] No route found for data-page="${page}". Did you add data-page to <body>?`);
  }
});


// ════════════════════════════════════════════════════════════
//  SECTION 4 — LANDING PAGE  (index.html)
// ════════════════════════════════════════════════════════════

async function initLanding() {
  const user = await getUser();
  if (user) {
    const cta = document.querySelector('.btn-nav-cta');
    if (cta) {
      cta.textContent = 'Go to Dashboard →';
      cta.href = 'dashboard.html';
    }
  }
}


// ════════════════════════════════════════════════════════════
//  SECTION 5 — LOGIN PAGE  (login.html)
// ════════════════════════════════════════════════════════════

async function initLogin() {
  // Already logged in → skip to chat
  const user = await getUser();
  if (user) { window.location.href = 'chat.html'; return; }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const btn      = document.getElementById('loginBtn');

    btn.textContent = 'Signing in...';
    btn.disabled = true;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      showToast(error.message, 'error');
      btn.textContent = 'Sign In';
      btn.disabled = false;
      return;
    }

    showToast('Welcome back! ✨', 'success');
    setTimeout(() => window.location.href = 'chat.html', 600);
  });

  document.getElementById('googleBtn')?.addEventListener('click', handleGoogleAuth);
  document.getElementById('passwordToggle')?.addEventListener('click', () => {
    togglePassword('loginPassword', document.getElementById('passwordToggle'));
  });
}


// ════════════════════════════════════════════════════════════
//  SECTION 6 — SIGNUP PAGE  (signup.html)
// ════════════════════════════════════════════════════════════

async function initSignup() {
  // Already logged in → skip to chat
  const user = await getUser();
  if (user) { window.location.href = 'chat.html'; return; }

  document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const firstName = document.getElementById('firstName').value.trim();
    const lastName  = document.getElementById('lastName').value.trim();
    const email     = document.getElementById('signupEmail').value;
    const password  = document.getElementById('signupPassword').value;
    const btn       = document.getElementById('signupBtn');

    btn.textContent = 'Creating account...';
    btn.disabled = true;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: `${firstName} ${lastName}` },
        emailRedirectTo: window.location.origin + '/chat.html',
      },
    });

    if (error) {
      showToast(error.message, 'error');
      btn.textContent = 'Create Account ✦';
      btn.disabled = false;
      return;
    }

    showToast('Account created! Check your email to verify 📧', 'success');
    setTimeout(() => window.location.href = 'login.html', 1500);
  });

  document.getElementById('googleBtn')?.addEventListener('click', handleGoogleAuth);
  document.getElementById('passwordToggle')?.addEventListener('click', () => {
    togglePassword('signupPassword', document.getElementById('passwordToggle'));
  });
}


// ════════════════════════════════════════════════════════════
//  SECTION 7 — CHAT PAGE  (chat.html)
// ════════════════════════════════════════════════════════════

// Chat state — scoped to this section
let _currentUser      = null;
let _messages         = [];
let _isSending        = false;
let _ttsEnabled       = false;
let _currentSessionId = null;

async function initChat() {
  const session = await requireAuth();
  if (!session) return;

  _currentUser = session.user;

  // Populate UI with user info
  const name    = getDisplayName(_currentUser);
  const initial = getInitial(_currentUser);
  document.getElementById('navAvatar').textContent     = initial;
  document.getElementById('sidebarAvatar').textContent = initial;
  document.getElementById('sidebarName').textContent   = name;
  document.getElementById('welcomeTime').textContent   = now();

  await loadChatHistory();
  setupChatListeners();
  setupAccessibilityPanel();
}

// ─── API call ─────────────────────────────────────────────
async function callChatAPI(message) {
  // ── WIRE YOUR FASTAPI HERE ──────────────────────────────
  // const res = await fetch(API.chat, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     message,
  //     user_id: _currentUser?.id,
  //     history: _messages.slice(-10),
  //   }),
  // });
  // if (!res.ok) throw new Error('API error');
  // const data = await res.json();
  // if (data.sentiment_score < SENTIMENT_THRESHOLD) openModal('crisisModal');
  // updateSentimentBar(data.sentiment_score);
  // return data.response;

  // Stub responses for UI testing
  await new Promise(r => setTimeout(r, 1000 + Math.random() * 800));
  const stubs = [
    "I hear you. It takes courage to share how you're feeling. Can you tell me more about when this started?",
    "That sounds really challenging. You're not alone in feeling this way. What's been the hardest part?",
    "Thank you for trusting me with this. How has this been affecting your daily life?",
    "It makes complete sense that you'd feel that way. What would help you most right now?",
  ];
  return stubs[Math.floor(Math.random() * stubs.length)];
}

// ─── Send message ─────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text  = input.value.trim();
  if (!text || _isSending) return;

  document.getElementById('suggestedPrompts').style.display = 'none';
  appendMessage('user', text);
  input.value = '';
  autoResize(input);
  _isSending = true;

  const typingEl = showTypingIndicator();
  try {
    const reply = await callChatAPI(text);
    removeTypingIndicator(typingEl);
    appendMessage('ai', reply);
    if (_ttsEnabled) speakText(reply);
    if (_currentUser) {
      await saveChatMessage(_currentUser.id, _currentSessionId, 'user', text);
      await saveChatMessage(_currentUser.id, _currentSessionId, 'ai',   reply);
    }
  } catch {
    removeTypingIndicator(typingEl);
    appendMessage('ai', "I'm having trouble connecting right now. Please try again 🌐");
    showToast('Connection error — is FastAPI running?', 'error');
  } finally {
    _isSending = false;
  }
}

// ─── Chat UI helpers ──────────────────────────────────────
function appendMessage(role, text) {
  const container = document.getElementById('chatMessages');
  const el        = document.createElement('div');
  el.className    = `message ${role}`;
  el.innerHTML    = `
    <div class="msg-avatar">${role === 'ai' ? '🧠' : getInitial(_currentUser)}</div>
    <div class="msg-content">
      <div class="msg-bubble">${escapeHtml(text)}</div>
      <div class="msg-time">${now()}</div>
    </div>`;
  container.appendChild(el);
  _messages.push({ role, text });
  container.scrollTop = container.scrollHeight;
}

function showTypingIndicator() {
  const el     = document.createElement('div');
  el.className = 'message ai';
  el.id        = 'typingIndicator';
  el.innerHTML = `
    <div class="msg-avatar">🧠</div>
    <div class="msg-content">
      <div class="msg-bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>`;
  const container = document.getElementById('chatMessages');
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}
function removeTypingIndicator(el) { el?.remove(); }

function newChat() {
  document.getElementById('chatMessages').innerHTML = '';
  _messages         = [];
  _currentSessionId = null;
  document.getElementById('suggestedPrompts').style.display = 'flex';
  showToast('New session started', 'info');
}
function confirmClearChat() {
  closeModal('clearChatModal');
  newChat();
}
function exportChat() {
  const content = _messages.map(m => `[${m.role.toUpperCase()}] ${m.text}`).join('\n\n');
  const a       = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(new Blob([content], { type: 'text/plain' })),
    download: `serene-session-${Date.now()}.txt`,
  });
  a.click();
  showToast('Session exported!', 'success');
}

function selectMood(label, score) {
  document.getElementById('moodCheckIn')?.remove();
  appendMessage('user', `Feeling: ${label}`);
  if (_currentUser) saveMoodEntry(_currentUser.id, label, score);
  document.getElementById('chatInput').value = `I selected mood: ${label}`;
  sendMessage();
  document.getElementById('chatInput').value = '';
}

function updateSentimentBar(score) {
  const fill = document.getElementById('sentimentFill');
  if (!fill) return;
  fill.style.width      = `${Math.max(0, Math.min(100, score * 100))}%`;
  fill.style.background = score > 0.5 ? 'var(--accent3)' : score > 0 ? 'var(--accent)' : 'var(--danger)';
}

// ─── Chat history sidebar ──────────────────────────────────
async function loadChatHistory() {
  if (!_currentUser) return;
  const sessions = await fetchChatSessions(_currentUser.id);
  const list     = document.getElementById('chatHistoryList');
  if (!sessions.length) return;
  list.innerHTML = sessions.map((s, i) => `
    <div class="chat-history-item ${i === 0 ? 'active' : ''}"
         onclick="loadSession('${s.id}')">
      <div class="chi-title">${s.title || 'Session'}</div>
      <div class="chi-preview">${s.mood_start ? `Mood: ${s.mood_start}` : 'No mood recorded'}</div>
      <div class="chi-time">${new Date(s.created_at).toLocaleDateString()}</div>
    </div>`).join('');
}
function loadSession(id) {
  _currentSessionId = id;
  showToast('Session loading — wire Supabase fetch here', 'info');
}

// ─── TTS ──────────────────────────────────────────────────
function toggleTTS() {
  _ttsEnabled = !_ttsEnabled;
  document.getElementById('ttsBtn')?.classList.toggle('active', _ttsEnabled);
  showToast(_ttsEnabled ? 'Read aloud enabled 🔊' : 'Read aloud disabled', 'info');
}
function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate  = 0.9;
  window.speechSynthesis.speak(u);
}

// ─── Voice input ──────────────────────────────────────────
function startVoiceInput() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast('Voice input not supported in this browser', 'error'); return; }
  const r = new SR();
  r.onresult = e => {
    const input = document.getElementById('chatInput');
    input.value = e.results[0][0].transcript;
    autoResize(input);
  };
  r.onerror = () => showToast('Voice input error', 'error');
  r.start();
  showToast('Listening... 🎤', 'info');
}

// ─── All event listeners for chat page ────────────────────
function setupChatListeners() {
  const input = document.getElementById('chatInput');

  // Input box
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  input.addEventListener('input', () => autoResize(input));

  // Toolbar buttons
  document.getElementById('sendBtn')?.addEventListener('click', sendMessage);
  document.getElementById('ttsBtn')?.addEventListener('click', toggleTTS);
  document.getElementById('newChatBtn')?.addEventListener('click', newChat);
  document.getElementById('clearBtn')?.addEventListener('click', () => openModal('clearChatModal'));
  document.getElementById('exportBtn')?.addEventListener('click', exportChat);
  document.getElementById('voiceBtn')?.addEventListener('click', startVoiceInput);
  document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

  // Crisis modal
  document.getElementById('crisisFab')?.addEventListener('click', () => openModal('crisisModal'));
  document.getElementById('crisisModalClose')?.addEventListener('click', () => closeModal('crisisModal'));
  document.getElementById('crisisModalDismiss')?.addEventListener('click', () => closeModal('crisisModal'));

  // Clear chat modal
  document.getElementById('confirmClearBtn')?.addEventListener('click', confirmClearChat);
  document.getElementById('cancelClearBtn')?.addEventListener('click', () => closeModal('clearChatModal'));
  document.getElementById('clearModalClose')?.addEventListener('click', () => closeModal('clearChatModal'));

  // Mood buttons — uses data-mood and data-score attributes on the button
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => selectMood(btn.dataset.mood, parseInt(btn.dataset.score)));
  });

  // Suggestion chips
  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      input.value = chip.textContent;
      sendMessage();
    });
  });
}

// ─── Accessibility panel ──────────────────────────────────
function setupAccessibilityPanel() {
  document.getElementById('a11yToggle')?.addEventListener('click', () => {
    document.getElementById('a11yBar')?.classList.toggle('open');
  });
  document.getElementById('a11yTTS')?.addEventListener('click', toggleTTS);
  document.getElementById('a11yHighContrast')?.addEventListener('click', function () {
    this.classList.toggle('active');
    document.body.style.filter = this.classList.contains('active') ? 'contrast(1.4)' : '';
  });
  document.getElementById('a11yFontSize')?.addEventListener('click', function () {
    const sizes = ['14px', '16px', '18px', '20px'];
    const cur   = parseInt(document.body.style.fontSize) || 14;
    const idx   = sizes.findIndex(s => parseInt(s) > cur);
    document.body.style.fontSize = sizes[idx === -1 ? 0 : idx];
  });
  document.getElementById('a11yMorse')?.addEventListener('click', () => {
    showToast('Morse input — coming in Phase 5! 📡', 'info');
  });
}


// ════════════════════════════════════════════════════════════
//  SECTION 8 — DASHBOARD PAGE  (dashboard.html)
// ════════════════════════════════════════════════════════════

async function initDashboard() {
  const session = await requireAuth();
  if (!session) return;

  const user = session.user;
  const name = getDisplayName(user);

  document.getElementById('navAvatar').textContent    = getInitial(user);
  document.getElementById('dashGreeting').textContent = `Good ${getTimeOfDay()}, ${name.split(' ')[0]} 🌤`;
  document.getElementById('dashDate').textContent     = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

  // Fetch real data from Supabase in parallel
  const [sessions, moods] = await Promise.all([
    fetchChatSessions(user.id),
    fetchMoodHistory(user.id, 30),
  ]);

  // Stats
  document.getElementById('statSessions').textContent = sessions.length || '0';
  if (moods.length) {
    const avg = (moods.reduce((s, m) => s + m.mood_score, 0) / moods.length).toFixed(1);
    document.getElementById('statMood').textContent = avg;
  } else {
    document.getElementById('statMood').textContent = '—';
  }

  buildHeatmap(moods);
  buildCharts();
}

function buildHeatmap(moods = []) {
  const grid = document.getElementById('heatmapGrid');
  if (!grid) return;

  // Index real data by day of month
  const moodByDay = {};
  moods.forEach(m => { moodByDay[new Date(m.created_at).getDate()] = m.mood_score; });

  // Fallback sample data for days without Supabase data
  const sample = [0,0,3,4,5,3,2,4,5,5,4,3,2,1,4,5,3,4,4,5,3,2,4,5,5,3,4,5];

  for (let i = 0; i < 28; i++) {
    const cell  = document.createElement('div');
    cell.className = 'heatmap-cell';
    const score = moodByDay[i + 1] || sample[i];
    if (score) cell.setAttribute('data-mood', score);
    cell.title = `Feb ${i + 1}${score ? ` · Mood: ${score}/5` : ''}`;
    grid.appendChild(cell);
  }
}

function buildCharts() {
  const configs = [
    { id: 'moodChart',    data: [6,7,5,8,7,9,7.2], c1: 'var(--accent)',  c2: 'rgba(94,183,255,0.3)'  },
    { id: 'sessionChart', data: [2,1,3,2,4,2,3],   c1: 'var(--accent2)', c2: 'rgba(167,139,250,0.3)' },
  ];
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  configs.forEach(({ id, data, c1, c2 }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const max = Math.max(...data);
    data.forEach((v, i) => {
      const bar = document.createElement('div');
      bar.className        = 'chart-bar';
      bar.style.height     = `${(v / max) * 85}%`;
      bar.style.background = `linear-gradient(180deg, ${c1}, ${c2})`;
      bar.title            = `${days[i]}: ${v}`;
      el.appendChild(bar);
    });
  });
}


// ════════════════════════════════════════════════════════════
//  SECTION 9 — FORUM PAGE  (forum.html)
// ════════════════════════════════════════════════════════════

let _forumUser    = null;
let _activeFilter = 'All';
let _posts        = [
  { id: 1, author: 'Maya S.',   time: '2 hours ago', flair: 'Anxiety',
    title: 'Finally understood my panic triggers!',
    body:  'After 3 months of tracking with Serene, I noticed my worst anxiety spikes always happen Sunday evenings. The AI helped me see the pattern before I ever noticed it myself.',
    upvotes: 47,  comments: 12 },
  { id: 2, author: 'Anon User', time: '5 hours ago', flair: 'Self-care',
    title: 'Gentle reminder: you survived 100% of your bad days',
    body:  "Just wanted to share a little encouragement for anyone who needs it today. Some days are really hard, but you're still here, still trying. That counts for everything.",
    upvotes: 134, comments: 28 },
  { id: 3, author: 'Ravi K.',   time: 'Yesterday',   flair: 'Wins 🎉',
    title: '30-day streak on mood logging!',
    body:  "Hit my 30-day streak today. I never thought I'd be consistent about anything mental-health related, but the daily check-ins with Serene made it feel easy and natural.",
    upvotes: 89,  comments: 19 },
  { id: 4, author: 'Sam T.',    time: '2 days ago',  flair: 'Depression',
    title: 'Looking for people who understand sleep depression',
    body:  "Does anyone else sleep way too much when they're depressed? Not looking for solutions, just want to feel less alone in this.",
    upvotes: 62,  comments: 34 },
];

async function initForum() {
  const session = await requireAuth();
  if (!session) return;

  _forumUser = session.user;
  document.getElementById('navAvatar').textContent = getInitial(_forumUser);

  // ── WIRE SUPABASE HERE to replace sample _posts ─────────
  // const { data, error } = await supabase
  //   .from('forum_posts')
  //   .select('*')
  //   .order('created_at', { ascending: false })
  //   .limit(50);
  // if (!error && data) _posts = data;

  renderPosts();

  // New post form
  document.getElementById('newPostForm')?.addEventListener('submit', submitPost);
  document.getElementById('newPostBtn')?.addEventListener('click', () => openModal('newPostModal'));
  document.getElementById('newPostModalClose')?.addEventListener('click', () => closeModal('newPostModal'));
  document.getElementById('cancelPostBtn')?.addEventListener('click', () => closeModal('newPostModal'));

  // Filter tabs — each tab needs data-filter attribute in HTML
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => filterPosts(tab.dataset.filter));
  });
}

function filterPosts(flair) {
  _activeFilter = flair;
  document.querySelectorAll('.filter-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.filter === flair);
  });
  renderPosts();
}

function renderPosts() {
  const filtered = _activeFilter === 'All'
    ? _posts
    : _posts.filter(p => p.flair === _activeFilter);

  document.getElementById('forumPosts').innerHTML = filtered.map((post, i) => `
    <div class="forum-post">
      <div class="post-header">
        <div class="post-avatar">${post.author[0]}</div>
        <div class="post-meta">
          <div class="post-author">${post.author}</div>
          <div class="post-time">${post.time || new Date(post.created_at).toLocaleDateString()}</div>
        </div>
        <div class="post-flair">${post.flair}</div>
      </div>
      <div class="post-title">${post.title}</div>
      <div class="post-body">${post.body}</div>
      <div class="post-actions">
        <button class="post-action-btn" data-idx="${i}" data-action="upvote">▲ ${post.upvotes}</button>
        <button class="post-action-btn">💬 ${post.comments} replies</button>
        <button class="post-action-btn">🔗 Share</button>
        <button class="post-action-btn" style="margin-left:auto">⚑ Report</button>
      </div>
    </div>`).join('');

  // Attach upvote listeners after render
  document.querySelectorAll('[data-action="upvote"]').forEach(btn => {
    btn.addEventListener('click', () => upvotePost(btn, parseInt(btn.dataset.idx)));
  });
}

function upvotePost(btn, idx) {
  _posts[idx].upvotes++;
  btn.textContent = `▲ ${_posts[idx].upvotes}`;
  btn.style.color = 'var(--accent)';
  // ── WIRE SUPABASE HERE ───────────────────────────────────
  // supabase.from('forum_posts').update({ upvotes: _posts[idx].upvotes }).eq('id', _posts[idx].id);
}

async function submitPost(e) {
  e.preventDefault();
  const title = document.getElementById('postTitle').value;
  const body  = document.getElementById('postBody').value;
  const flair = document.getElementById('postFlair').value;

  // ── WIRE SUPABASE HERE ───────────────────────────────────
  // const { data, error } = await supabase.from('forum_posts').insert({
  //   user_id: _forumUser.id, author_name: 'Anonymous', title, body, flair,
  // }).select().single();
  // if (error) { showToast(error.message, 'error'); return; }

  _posts.unshift({ id: Date.now(), author: 'You', time: 'Just now', flair, title, body, upvotes: 1, comments: 0 });
  renderPosts();
  closeModal('newPostModal');
  document.getElementById('newPostForm').reset();
  showToast('Post published! 🎉', 'success');
}