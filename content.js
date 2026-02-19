// WhatsApp Group Chat Scroller - Content Script
(function () {
  'use strict';

  // ===== State =====
  let scrolling = false;
  let baseSpeed = 2; // pixels per frame
  let importantSpeed = 0.4; // pixels per frame when important person in view
  let currentSpeed = 2; // smoothed current speed (interpolates toward target)
  const SPEED_LERP = 0.04; // how fast speed transitions (0-1, lower = smoother)
  let importantPeople = [];
  let hiddenUsers = [];
  let lastChatName = '';
  let panelEl = null;
  let fabEl = null;
  let panelMinimized = true;
  let participants = [];

  // ===== DOM Detection =====

  function getScrollContainer() {
    try {
      const msg = document.querySelector('div[data-id]');
      if (!msg) return null;
      let el = msg;
      while (el && el !== document.body) {
        const style = getComputedStyle(el);
        if (
          ['scroll', 'auto'].includes(style.overflowY) &&
          el.scrollHeight > el.clientHeight + 50
        ) {
          return el;
        }
        el = el.parentElement;
      }
    } catch (e) {
      // DOM may not be ready
    }
    return null;
  }

  function getInnerContentDiv() {
    const container = getScrollContainer();
    if (!container) return null;
    // The inner content div is the first child with many children
    const divs = container.querySelectorAll(':scope > div');
    for (const d of divs) {
      if (d.children.length > 5) return d;
    }
    // Fallback: try one level deeper
    for (const d of container.querySelectorAll('div')) {
      if (d.children.length > 10 && d.parentElement === container) return d;
    }
    return container;
  }

  function getMessageGroups() {
    const inner = getInnerContentDiv();
    if (!inner) return [];
    return [...inner.children];
  }

  function getSenderName(messageGroup) {
    try {
      const senderEl = messageGroup.querySelector(
        '[aria-label^="Open chat details for"]'
      );
      if (!senderEl) return null;
      let name = senderEl
        .getAttribute('aria-label')
        .replace('Open chat details for ', '');
      // Strip WhatsApp's "~Maybe: " or "~ " prefix for unsaved contacts
      name = name.replace(/^~\s*(?:Maybe:\s*)?/i, '');
      return name;
    } catch (e) {
      return null;
    }
  }

  function getChatName() {
    try {
      // Try the header button text
      const headerEl = document.querySelector('header span[title]');
      if (headerEl) return headerEl.getAttribute('title');
      // Fallback: look in _ak8q
      const ak8q = document.querySelector('._ak8q span');
      if (ak8q) return ak8q.textContent.trim();
    } catch (e) {
      // ignore
    }
    return '';
  }

  // ===== Participant Scanning =====

  function scanParticipants() {
    const names = new Set();
    try {
      const senderEls = document.querySelectorAll(
        '[aria-label^="Open chat details for"]'
      );
      senderEls.forEach((el) => {
        const name = el
          .getAttribute('aria-label')
          .replace('Open chat details for ', '');
        if (name) names.add(name);
      });
    } catch (e) {
      // ignore
    }
    participants = [...names].sort();
    updateDropdowns();
  }

  // ===== Auto-Scroll Engine =====

  function scrollLoop() {
    if (!scrolling) return;
    const container = getScrollContainer();
    if (!container) {
      scrolling = false;
      updatePlayButton();
      return;
    }

    const targetSpeed = isImportantMessageInView() ? importantSpeed : baseSpeed;
    // Smoothly interpolate toward target speed
    currentSpeed += (targetSpeed - currentSpeed) * SPEED_LERP;
    container.scrollTop += currentSpeed;

    // Auto-pause at bottom
    if (
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - 5
    ) {
      scrolling = false;
      updatePlayButton();
      showToast('Reached end of chat');
      return;
    }

    requestAnimationFrame(scrollLoop);
  }

  function toggleScroll() {
    scrolling = !scrolling;
    updatePlayButton();
    if (scrolling) {
      currentSpeed = baseSpeed;
      requestAnimationFrame(scrollLoop);
    }
  }

  function updatePlayButton() {
    const btn = panelEl?.querySelector('#wa-play-btn');
    if (!btn) return;
    if (scrolling) {
      btn.innerHTML = '&#9646;&#9646;'; // pause icon
      btn.classList.add('wa-playing');
      btn.title = 'Pause';
    } else {
      btn.innerHTML = '&#9654;'; // play icon
      btn.classList.remove('wa-playing');
      btn.title = 'Play';
    }
  }

  // ===== Important People Detection =====

  function isImportantMessageInView() {
    if (importantPeople.length === 0) return false;

    const container = getScrollContainer();
    if (!container) return false;
    const rect = container.getBoundingClientRect();
    const groups = getMessageGroups();
    let found = false;

    for (const group of groups) {
      const sender = getSenderName(group);
      if (!sender || !matchesList(sender, importantPeople)) {
        group.classList.remove('wa-important');
        removeImportantBadge(group);
        continue;
      }

      const groupRect = group.getBoundingClientRect();
      // Check if group overlaps with visible area
      if (groupRect.bottom > rect.top && groupRect.top < rect.bottom) {
        group.classList.add('wa-important');
        addImportantBadge(group);
        found = true;
      } else {
        group.classList.remove('wa-important');
        removeImportantBadge(group);
      }
    }

    return found;
  }

  function addImportantBadge(group) {
    if (group.querySelector('.wa-important-badge')) return;
    // Find the in-bubble sender name span (not the avatar)
    // It's a span inside a div[role=""] within the message content
    const nameSpan = group.querySelector('span._ahxt')
      || group.querySelector('div[role=""] > span[dir="auto"]');
    if (!nameSpan) return;
    const parent = nameSpan.parentElement;
    parent.style.position = 'relative';
    const badge = document.createElement('span');
    badge.className = 'wa-important-badge';
    badge.textContent = 'IMPORTANT';
    parent.appendChild(badge);
  }

  function removeImportantBadge(group) {
    const badge = group.querySelector('.wa-important-badge');
    if (badge) badge.remove();
  }

  // ===== Hidden Users (Blur) =====

  function applyBlur() {
    const groups = getMessageGroups();
    for (const group of groups) {
      const sender = getSenderName(group);
      if (sender && matchesList(sender, hiddenUsers)) {
        if (!group.classList.contains('wa-blurred')) {
          group.classList.add('wa-blurred');
          group.classList.remove('wa-revealed');
          addBlurOverlay(group);
        }
      } else {
        group.classList.remove('wa-blurred');
        group.classList.remove('wa-revealed');
        removeBlurOverlay(group);
      }
    }
  }

  function addBlurOverlay(group) {
    if (group.querySelector('.wa-blur-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'wa-blur-overlay';
    overlay.innerHTML = '<span class="wa-blur-label">Hidden</span><button class="wa-blur-show-btn">Click to show</button>';
    overlay.querySelector('.wa-blur-show-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      group.classList.add('wa-revealed');
    });
    group.prepend(overlay);
  }

  function removeBlurOverlay(group) {
    const overlay = group.querySelector('.wa-blur-overlay');
    if (overlay) overlay.remove();
  }

  // ===== Storage =====
  // All settings are global across chats.

  function saveSettings() {
    chrome.storage.local.set({
      _importantPeople: [...importantPeople],
      _hiddenUsers: [...hiddenUsers],
      _importantSpeed: importantSpeed,
      _baseSpeed: baseSpeed,
    });
  }

  function loadSettings(callback) {
    chrome.storage.local.get(['_importantPeople', '_hiddenUsers', '_importantSpeed', '_baseSpeed'], (result) => {
      importantPeople = result._importantPeople || [];
      hiddenUsers = result._hiddenUsers || [];
      importantSpeed = result._importantSpeed ?? 0.4;
      baseSpeed = result._baseSpeed ?? 2;
      if (callback) callback();
    });
  }

  function savePanelState() {
    chrome.storage.local.set({ _panelMinimized: panelMinimized });
  }

  function loadPanelState(callback) {
    chrome.storage.local.get('_panelMinimized', (result) => {
      panelMinimized = true;
      if (callback) callback();
    });
  }

  // ===== Panel Injection =====

  async function injectPanel() {
    try {
      const url = chrome.runtime.getURL('panel.html');
      const resp = await fetch(url);
      const html = await resp.text();

      const wrapper = document.createElement('div');
      wrapper.id = 'wa-scroller-root';
      wrapper.innerHTML = html;
      document.body.appendChild(wrapper);

      panelEl = wrapper.querySelector('#wa-scroller-panel');
      fabEl = wrapper.querySelector('#wa-scroller-fab');

      setupPanelEvents();
      loadPanelState(() => {
        applyPanelState();
      });
    } catch (e) {
      console.error('WA Scroller: Failed to inject panel', e);
    }
  }

  function applyPanelState() {
    if (panelMinimized) {
      panelEl?.classList.add('wa-hidden');
      fabEl?.classList.remove('wa-hidden');
    } else {
      panelEl?.classList.remove('wa-hidden');
      fabEl?.classList.add('wa-hidden');
    }
  }

  function setupPanelEvents() {
    // Minimize / restore
    const minimizeBtn = panelEl?.querySelector('#wa-panel-minimize');
    minimizeBtn?.addEventListener('click', () => {
      panelMinimized = true;
      applyPanelState();
      savePanelState();
    });

    fabEl?.addEventListener('click', () => {
      panelMinimized = false;
      applyPanelState();
      savePanelState();
    });

    // Play / Pause
    const playBtn = panelEl?.querySelector('#wa-play-btn');
    playBtn?.addEventListener('click', toggleScroll);

    // Speed slider
    const slider = panelEl?.querySelector('#wa-speed-slider');
    const speedLabel = panelEl?.querySelector('#wa-speed-label');
    slider?.addEventListener('input', () => {
      baseSpeed = parseFloat(slider.value);
      if (speedLabel) speedLabel.textContent = `${baseSpeed}x`;
      saveSettings();
    });

    // Important people speed slider
    const impSlider = panelEl?.querySelector('#wa-important-speed-slider');
    const impSpeedLabel = panelEl?.querySelector('#wa-important-speed-label');
    impSlider?.addEventListener('input', () => {
      importantSpeed = parseFloat(impSlider.value);
      if (impSpeedLabel) impSpeedLabel.textContent = `${importantSpeed}x`;
      saveSettings();
    });

    // Important People combo box
    setupComboBox('#wa-important-combo', () => {
      return participants.filter((n) => !importantPeople.includes(n));
    }, (name) => {
      if (!importantPeople.includes(name)) {
        importantPeople.push(name);
        renderImportantList();
        updateDropdowns();
        saveSettings();
        isImportantMessageInView();
      }
    });

    // Hidden Users combo box
    setupComboBox('#wa-hidden-combo', () => {
      return participants.filter((n) => !hiddenUsers.includes(n));
    }, (name) => {
      if (!hiddenUsers.includes(name)) {
        hiddenUsers.push(name);
        renderHiddenList();
        updateDropdowns();
        saveSettings();
        applyBlur();
      }
    });

    // Dragging
    setupDrag();

  }

  // ===== Drag Support =====

  function setupDrag() {
    const header = panelEl?.querySelector('#wa-panel-header');
    if (!header || !panelEl) return;

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return; // Don't drag on button clicks
      dragging = true;
      const rect = panelEl.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      panelEl.style.left = `${Math.max(0, x)}px`;
      panelEl.style.top = `${Math.max(0, y)}px`;
      panelEl.style.right = 'auto';
      panelEl.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  // ===== Render Lists =====

  function renderImportantList() {
    const list = panelEl?.querySelector('#wa-important-list');
    if (!list) return;
    list.innerHTML = '';
    importantPeople.forEach((name) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="wa-user-name">
          <span class="wa-dot wa-dot-green"></span>
          ${escapeHtml(name)}
        </span>
        <button class="wa-remove-btn" title="Remove">&times;</button>
      `;
      li.querySelector('.wa-remove-btn').addEventListener('click', () => {
        importantPeople = importantPeople.filter((n) => n !== name);
        renderImportantList();
        updateDropdowns();
        saveSettings();
        // Remove highlights
        document.querySelectorAll('.wa-important').forEach((el) => {
          const s = getSenderName(el);
          if (s === name) el.classList.remove('wa-important');
        });
      });
      list.appendChild(li);
    });
  }

  function renderHiddenList() {
    const list = panelEl?.querySelector('#wa-hidden-list');
    if (!list) return;
    list.innerHTML = '';
    hiddenUsers.forEach((name) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="wa-user-name">
          <span class="wa-dot wa-dot-red"></span>
          ${escapeHtml(name)}
        </span>
        <button class="wa-remove-btn" title="Remove">&times;</button>
      `;
      li.querySelector('.wa-remove-btn').addEventListener('click', () => {
        hiddenUsers = hiddenUsers.filter((n) => n !== name);
        renderHiddenList();
        updateDropdowns();
        saveSettings();
        // Remove blur for this user
        document.querySelectorAll('.wa-blurred').forEach((el) => {
          const s = getSenderName(el);
          if (s === name) {
            el.classList.remove('wa-blurred');
            el.classList.remove('wa-revealed');
            removeBlurOverlay(el);
          }
        });
      });
      list.appendChild(li);
    });
  }

  // updateDropdowns is now a no-op trigger; combo boxes read live data via their getNames callback
  function updateDropdowns() {
    // Clear any open combo input text after add/remove
    panelEl?.querySelectorAll('.wa-combo-input').forEach((input) => {
      input.value = '';
    });
    // Close open lists
    panelEl?.querySelectorAll('.wa-combo').forEach((combo) => {
      combo.classList.remove('wa-combo-open');
    });
  }

  // ===== Combo Box =====

  function setupComboBox(selector, getNames, onSelect) {
    const combo = panelEl?.querySelector(selector);
    if (!combo) return;
    const input = combo.querySelector('.wa-combo-input');
    const listEl = combo.querySelector('.wa-combo-list');
    let activeIndex = -1;

    function renderList() {
      const query = stripInvisible(input.value.trim()).toLowerCase();
      const names = getNames();
      const filtered = query
        ? names.filter((n) => stripInvisible(n).toLowerCase().includes(query))
        : names;

      listEl.innerHTML = '';
      activeIndex = -1;

      if (filtered.length === 0 && !query) {
        const empty = document.createElement('div');
        empty.className = 'wa-combo-empty';
        empty.textContent = 'No participants found';
        listEl.appendChild(empty);
      } else if (filtered.length === 0 && query) {
        const hint = document.createElement('div');
        hint.className = 'wa-combo-empty';
        hint.textContent = 'Press Enter to add "' + input.value.trim() + '"';
        listEl.appendChild(hint);
      } else {
        filtered.forEach((name, i) => {
          const item = document.createElement('div');
          item.className = 'wa-combo-item';
          item.dataset.name = name;
          // Highlight matching text
          if (query) {
            const clean = stripInvisible(name).toLowerCase();
            const idx = clean.indexOf(query);
            // Map index from stripped string back to original
            let origStart = 0, stripped = 0;
            while (stripped < idx && origStart < name.length) {
              if (!/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/.test(name[origStart])) stripped++;
              origStart++;
            }
            let origEnd = origStart, matched = 0;
            while (matched < query.length && origEnd < name.length) {
              if (!/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/.test(name[origEnd])) matched++;
              origEnd++;
            }
            item.innerHTML =
              escapeHtml(name.slice(0, origStart)) +
              '<mark>' + escapeHtml(name.slice(origStart, origEnd)) + '</mark>' +
              escapeHtml(name.slice(origEnd));
          } else {
            item.textContent = name;
          }
          item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // prevent input blur
            selectItem(name);
          });
          listEl.appendChild(item);
        });
      }
    }

    function positionList() {
      const rect = input.getBoundingClientRect();
      listEl.style.left = `${rect.left}px`;
      listEl.style.width = `${rect.width}px`;
      listEl.style.top = `${rect.bottom + 2}px`;
    }

    function selectItem(name) {
      onSelect(name);
      input.value = '';
      combo.classList.remove('wa-combo-open');
    }

    function setActive(index) {
      const items = listEl.querySelectorAll('.wa-combo-item');
      items.forEach((el) => el.classList.remove('wa-combo-active'));
      if (index >= 0 && index < items.length) {
        activeIndex = index;
        items[index].classList.add('wa-combo-active');
        items[index].scrollIntoView({ block: 'nearest' });
      }
    }

    input.addEventListener('focus', () => {
      renderList();
      positionList();
      combo.classList.add('wa-combo-open');
    });

    input.addEventListener('blur', () => {
      // Delay to allow mousedown on items to fire
      setTimeout(() => combo.classList.remove('wa-combo-open'), 150);
    });

    input.addEventListener('input', () => {
      renderList();
      positionList();
      combo.classList.add('wa-combo-open');
    });

    input.addEventListener('keydown', (e) => {
      const items = listEl.querySelectorAll('.wa-combo-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(Math.min(activeIndex + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && items[activeIndex]) {
          selectItem(items[activeIndex].dataset.name);
        } else if (input.value.trim()) {
          selectItem(input.value.trim());
        }
      } else if (e.key === 'Escape') {
        input.blur();
      }
    });
  }

  // ===== Toast =====

  function showToast(message) {
    let toast = document.querySelector('.wa-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'wa-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('wa-toast-visible');
    setTimeout(() => toast.classList.remove('wa-toast-visible'), 2500);
  }

  // ===== Utils =====

  // Strip Unicode directional marks and zero-width chars that WhatsApp
  // embeds in mixed-script names (Hebrew + Latin, Arabic + Latin, etc.)
  function stripInvisible(str) {
    return str.replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '');
  }

  // Check if a sender name matches any entry in a list.
  // Supports both exact matches and partial/substring matches.
  function matchesList(sender, list) {
    if (!sender) return false;
    const cleanSender = stripInvisible(sender).toLowerCase();
    return list.some((entry) => {
      const cleanEntry = stripInvisible(entry).toLowerCase();
      return cleanSender === cleanEntry
        || cleanSender.includes(cleanEntry)
        || cleanEntry.includes(cleanSender);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ===== Chat Switch Detection =====

  function watchChatSwitch() {
    const observer = new MutationObserver(
      debounce(() => {
        const currentName = getChatName();
        if (currentName && currentName !== lastChatName) {
          lastChatName = currentName;
          scrolling = false;
          updatePlayButton();
          loadSettings(() => {
            updateUI();
            setTimeout(() => {
              scanParticipants();
              applyBlur();
            }, 500);
          });
        }
      }, 300)
    );

    // Observe broadly - WhatsApp re-renders heavily on chat switch
    const target = document.querySelector('#app') || document.body;
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // ===== New Messages Observer =====

  function watchNewMessages() {
    const debouncedApply = debounce(() => {
      applyBlur();
      scanParticipants();
      isImportantMessageInView();
    }, 200);

    const observer = new MutationObserver((mutations) => {
      // Only react to childList changes (new messages added)
      const hasNew = mutations.some(
        (m) => m.type === 'childList' && m.addedNodes.length > 0
      );
      if (hasNew) {
        debouncedApply();
      }
    });

    // Re-attach when scroll container changes
    let currentContainer = null;

    const debouncedHighlight = debounce(() => {
      isImportantMessageInView();
    }, 50);

    function attachObserver() {
      const container = getScrollContainer();
      if (container && container !== currentContainer) {
        if (currentContainer) {
          observer.disconnect();
          currentContainer.removeEventListener('scroll', debouncedHighlight);
        }
        currentContainer = container;
        const inner = getInnerContentDiv();
        if (inner) {
          observer.observe(inner, { childList: true });
        }
        // Highlight important messages on manual scroll too
        container.addEventListener('scroll', debouncedHighlight, { passive: true });
      }
    }

    // Check periodically for container changes (chat switches)
    setInterval(attachObserver, 2000);
    attachObserver();
  }

  // ===== Update UI from State =====

  function updateUI() {
    renderImportantList();
    renderHiddenList();
    updateDropdowns();

    // Sync speed sliders
    const slider = panelEl?.querySelector('#wa-speed-slider');
    const speedLabel = panelEl?.querySelector('#wa-speed-label');
    if (slider) slider.value = baseSpeed;
    if (speedLabel) speedLabel.textContent = `${baseSpeed}x`;

    const impSlider = panelEl?.querySelector('#wa-important-speed-slider');
    const impSpeedLabel = panelEl?.querySelector('#wa-important-speed-label');
    if (impSlider) impSlider.value = importantSpeed;
    if (impSpeedLabel) impSpeedLabel.textContent = `${importantSpeed}x`;
  }

  // ===== No-Chat Visibility =====

  function checkChatOpen() {
    const container = getScrollContainer();
    const root = document.querySelector('#wa-scroller-root');
    if (root) {
      root.style.display = container ? '' : 'none';
    }
  }

  // ===== Initialization =====

  async function init() {
    // Wait for WhatsApp to load
    await waitForElement('div[data-id]', 30000);

    await injectPanel();

    lastChatName = getChatName();
    loadSettings(() => {
      updateUI();
      scanParticipants();
      applyBlur();
    });

    watchChatSwitch();
    watchNewMessages();

    // Periodically check if a chat is open
    setInterval(checkChatOpen, 3000);

  }

  function waitForElement(selector, timeout = 30000) {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      // Timeout fallback
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
