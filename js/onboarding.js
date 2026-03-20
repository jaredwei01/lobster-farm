/**
 * Lightweight step-by-step onboarding (localStorage, no blocking overlay).
 */
const STORAGE_KEY = 'lobster_onboarding_v1';

const STEPS = [
  {
    id: 'sea',
    text: '这里是海底窗口，龙虾会在这里活动。点龙虾或海底可以互动。',
    targetSelector: '#sea-window',
    advance: 'sea_click',
  },
  {
    id: 'pet',
    text: '试试点「摸摸」或戳海底，让龙虾知道你在关心它～',
    targetSelector: '#btn-pet',
    advance: 'pet',
  },
  {
    id: 'suggest',
    text: '用「建议」让龙虾按你的想法行动（它有时会任性拒绝哦）。',
    targetSelector: '#btn-suggest',
    advance: 'open_suggest',
  },
  {
    id: 'farm_tab',
    text: '打开「农田」Tab，可以种植、浇水和收获。',
    targetSelector: '.main-tab[data-target="farm-section"]',
    advance: 'farm_tab',
  },
  {
    id: 'plant',
    text: '有空地时，点「种植」播下种子，回合推进后作物会生长。',
    targetSelector: '#btn-plant',
    advance: 'open_plant',
  },
];

let _root = null;
let _stepIndex = 0;
let _state = { completed: false, step: 0 };

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    _state = JSON.parse(raw);
  } catch {
    _state = { completed: false, step: 0 };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
  } catch { /* noop */ }
}

function removeOverlay() {
  if (_root) {
    if (typeof _root._cleanup === 'function') _root._cleanup();
    _root.remove();
  }
  _root = null;
}

function positionBubble(targetEl, bubble) {
  const rect = targetEl.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  let top = rect.bottom + 8 + window.scrollY;
  let left = rect.left + rect.width / 2 - bubbleRect.width / 2 + window.scrollX;
  if (left < 8) left = 8;
  if (left + bubbleRect.width > window.innerWidth - 8) {
    left = window.innerWidth - bubbleRect.width - 8;
  }
  if (top + bubbleRect.height > window.innerHeight + window.scrollY - 8) {
    top = rect.top - bubbleRect.height - 8 + window.scrollY;
  }
  bubble.style.top = `${top}px`;
  bubble.style.left = `${left}px`;
}

function showStep() {
  removeOverlay();
  if (_state.completed || _stepIndex >= STEPS.length) return;

  const step = STEPS[_stepIndex];
  const target = document.querySelector(step.targetSelector);
  if (!target) return;

  _root = document.createElement('div');
  _root.className = 'onboarding-root';
  _root.setAttribute('role', 'dialog');
  _root.setAttribute('aria-label', '新手指引');

  const bubble = document.createElement('div');
  bubble.className = 'onboarding-bubble';
  bubble.innerHTML = `
    <p class="onboarding-text">${step.text}</p>
    <div class="onboarding-actions">
      <button type="button" class="btn-small onboarding-skip">跳过引导</button>
      <button type="button" class="btn-small onboarding-next">知道了</button>
    </div>
  `;

  const dim = document.createElement('div');
  dim.className = 'onboarding-dim';
  dim.addEventListener('click', (e) => e.stopPropagation());

  _root.appendChild(dim);
  _root.appendChild(bubble);
  document.body.appendChild(_root);

  target.classList.add('onboarding-highlight');

  const resize = () => positionBubble(target, bubble);
  window.addEventListener('resize', resize);

  const cleanup = () => {
    target.classList.remove('onboarding-highlight');
    window.removeEventListener('resize', resize);
  };
  _root._cleanup = cleanup;

  requestAnimationFrame(() => positionBubble(target, bubble));

  bubble.querySelector('.onboarding-next')?.addEventListener('click', () => {
    cleanup();
    removeOverlay();
    _stepIndex += 1;
    _state.step = _stepIndex;
    saveState();
    if (_stepIndex >= STEPS.length) {
      _state.completed = true;
      saveState();
      return;
    }
    showStep();
  });

  bubble.querySelector('.onboarding-skip')?.addEventListener('click', () => {
    cleanup();
    removeOverlay();
    _state.completed = true;
    saveState();
  });
}

function advanceByEvent(event) {
  if (_state.completed || _stepIndex >= STEPS.length) return;
  const step = STEPS[_stepIndex];
  if (step.advance !== event) return;
  if (_root && _root._cleanup) _root._cleanup();
  removeOverlay();
  _stepIndex += 1;
  _state.step = _stepIndex;
  saveState();
  if (_stepIndex >= STEPS.length) {
    _state.completed = true;
    saveState();
    return;
  }
  setTimeout(showStep, 100);
}

/** Skip duplicate welcome toast while guided tour is active or not finished. */
export function shouldSuppressWelcomeGuide() {
  loadState();
  return !_state.completed;
}

export const Onboarding = {
  init() {
    loadState();
    if (_state.completed) return;
    _stepIndex = typeof _state.step === 'number' ? _state.step : 0;
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq?.matches) {
      _state.completed = true;
      saveState();
      return;
    }
    setTimeout(() => showStep(), 1200);
  },

  notify(event) {
    advanceByEvent(event);
  },

  /** Sea / lobster interaction on step 0 */
  onSeaInteract() {
    advanceByEvent('sea_click');
  },
};

loadState();
