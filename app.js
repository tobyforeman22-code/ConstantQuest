// ConstantQuest — app logic
'use strict';

const STORAGE_KEY = 'constantquest_progress_v1';
const LAST_DIFFICULTY_KEY = 'constantquest_last_difficulty';
const CHUNK_SIZE = 5;

const appEl = document.getElementById('app');

/* ---------------------------------------------------------------- */
/* Progress storage                                                  */
/* ---------------------------------------------------------------- */

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function getEntry(constantId, difficultyId) {
  const progress = loadProgress();
  return (progress[constantId] && progress[constantId][difficultyId]) ||
    { bestStreak: 0, perfect: false, attempts: 0 };
}

function recordAttempt(constantId, difficultyId, streak, perfect) {
  const progress = loadProgress();
  if (!progress[constantId]) progress[constantId] = {};
  const existing = progress[constantId][difficultyId] || { bestStreak: 0, perfect: false, attempts: 0 };
  progress[constantId][difficultyId] = {
    bestStreak: Math.max(existing.bestStreak, streak),
    perfect: existing.perfect || perfect,
    attempts: existing.attempts + 1
  };
  saveProgress(progress);
  return progress[constantId][difficultyId];
}

function masteredCount(constantId) {
  const progress = loadProgress();
  const entries = progress[constantId] || {};
  return DIFFICULTIES.filter(d => entries[d.id] && entries[d.id].perfect).length;
}

function getLastDifficulty() {
  return localStorage.getItem(LAST_DIFFICULTY_KEY) || 'easy';
}

function setLastDifficulty(id) {
  localStorage.setItem(LAST_DIFFICULTY_KEY, id);
}

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
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

/* ---------------------------------------------------------------- */
/* Router                                                             */
/* ---------------------------------------------------------------- */

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] === 'constant' && parts[1]) return { view: 'detail', id: parts[1] };
  if (parts[0] === 'stats') return { view: 'stats' };
  return { view: 'home' };
}

function navigate(hash) {
  location.hash = hash;
}

window.addEventListener('hashchange', render);
document.getElementById('stats-toggle').addEventListener('click', () => navigate('#/stats'));

function render() {
  const route = parseHash();
  appEl.innerHTML = '';
  if (route.view === 'home') renderHome();
  else if (route.view === 'stats') renderStats();
  else if (route.view === 'detail') {
    const constant = findConstant(route.id);
    if (constant) renderDetail(constant);
    else renderHome();
  }
  window.scrollTo(0, 0);
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
      const b = document.createElement('span');
      b.className = 'mini-badge' + (entry.perfect ? ' earned' : '');
      b.textContent = `${d.label} ${entry.bestStreak}/${d.digits}`;
      badges.appendChild(b);
    });
    row.appendChild(badges);

    table.appendChild(row);
  });

  appEl.appendChild(frag);
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
    bestStreakEl.textContent = entry.perfect
      ? `✓ Mastered (best streak ${entry.bestStreak}/${dConf.digits})`
      : `Best streak: ${entry.bestStreak}/${dConf.digits}`;
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

    // remaining digits beyond this difficulty's range, dimmed, for context
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
    const targetDigits = c.digits.slice(0, dConf.digits);

    const info = document.createElement('p');
    info.className = 'quiz-target-info';
    info.textContent = `Type ${c.name}'s first ${dConf.digits} decimal digits from memory (starts right after "${c.intPart}."). Correct digits turn green as you go.`;
    quizPanel.appendChild(info);

    const displayWrap = document.createElement('div');
    displayWrap.className = 'quiz-input-display';

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'text';
    hiddenInput.inputMode = 'numeric';
    hiddenInput.autocomplete = 'off';
    hiddenInput.className = 'quiz-hidden-input';
    hiddenInput.maxLength = dConf.digits;

    function drawDigits() {
      displayWrap.innerHTML = '';
      const chunks = chunk(targetDigits, CHUNK_SIZE);
      let idx = 0;
      chunks.forEach(ch => {
        const chunkSpan = document.createElement('span');
        chunkSpan.className = 'digit-chunk';
        for (let i = 0; i < ch.length; i++) {
          const pos = idx;
          const digitSpan = document.createElement('span');
          const typedChar = typedValue[pos];
          if (typedChar === undefined) {
            digitSpan.className = 'q-digit pending';
            digitSpan.textContent = '_';
          } else if (typedChar === targetDigits[pos]) {
            digitSpan.className = 'q-digit correct';
            digitSpan.textContent = typedChar;
          } else {
            digitSpan.className = 'q-digit wrong';
            digitSpan.textContent = typedChar;
          }
          if (pos === typedValue.length && !finished) digitSpan.classList.add('cursor');
          chunkSpan.appendChild(digitSpan);
          idx++;
        }
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
    finishBtn.addEventListener('click', () => finishQuiz(targetDigits, dConf));
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
      const digitsOnly = hiddenInput.value.replace(/[^0-9]/g, '').slice(0, dConf.digits);
      hiddenInput.value = digitsOnly;
      typedValue = digitsOnly;
      drawDigits();
      if (typedValue.length === dConf.digits) finishQuiz(targetDigits, dConf);
    });

    const resultHolder = document.createElement('div');
    resultHolder.id = 'quiz-result-holder';
    quizPanel.appendChild(resultHolder);

    function finishQuiz(target, dConf) {
      finished = true;
      hiddenInput.blur();
      hiddenInput.disabled = true;
      drawDigits();

      let streak = 0;
      while (streak < typedValue.length && typedValue[streak] === target[streak]) streak++;
      const correctCount = [...typedValue].filter((ch, i) => ch === target[i]).length;
      const accuracy = typedValue.length ? Math.round((correctCount / typedValue.length) * 100) : 0;
      const perfect = streak === dConf.digits && typedValue.length === dConf.digits;
      const elapsedSec = startTime ? ((Date.now() - startTime) / 1000).toFixed(1) : '0.0';

      const priorEntry = getEntry(c.id, currentDifficulty);
      const isNewBest = streak > priorEntry.bestStreak;
      const updated = recordAttempt(c.id, currentDifficulty, streak, perfect);
      updateBestStreakLabel();

      const resultBox = document.createElement('div');
      resultBox.className = 'quiz-result ' + (perfect ? 'success' : 'fail');

      const title = document.createElement('h3');
      title.textContent = perfect
        ? '🎉 Perfect! You mastered this difficulty.'
        : `You got ${streak} digit${streak === 1 ? '' : 's'} correct in a row before a slip.`;
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
          reveal.textContent = `${c.intPart}.${target}`;
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

render();
