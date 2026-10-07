// 마우스 우클릭 제스처 인식 + 화면 안내 (콘텐츠 스크립트)
(() => {
  // 확장 업데이트 등으로 재주입되면 이전 인스턴스를 먼저 정리
  if (typeof window.__wgTeardown === 'function') {
    try { window.__wgTeardown(); } catch (_) {}
  }
  const WG = globalThis.WG;
  if (!WG) return;

  const ac = new AbortController();
  const listen = (type, fn, extra) =>
    window.addEventListener(type, fn, Object.assign({ capture: true, signal: ac.signal }, extra));

  let settings = WG.mergeSettings();
  let st = null;              // 진행 중인 제스처 상태
  let blockMenu = false;      // 다음 contextmenu 를 막을지
  let unblockTimer = 0;
  let wheelArmed = false;     // 오른쪽 버튼이 눌린 상태로 보고 휠을 감시 중인지
  let wheelSafetyTimer = 0;
  let lastWheelAt = 0;
  let ui = null;
  let rafId = 0;

  // ---------- 설정 ----------
  const loadSettings = () =>
    chrome.storage.sync.get(null)
      .then(s => { settings = WG.mergeSettings(s); if (ui) applyTheme(); })
      .catch(() => {});
  const onStorage = (_c, area) => { if (area === 'sync') loadSettings(); };
  const onMessage = msg => {
    // 휠로 탭을 넘겨받은 새 탭: 오른쪽 버튼이 아직 눌려 있으므로 휠 전환을 이어가고 메뉴는 막는다
    if (msg && msg.type === 'WG_RIGHT_HELD') {
      blockMenu = true;
      armWheel(6000);
      scheduleUnblock(6000);
    }
  };
  loadSettings();
  chrome.storage.onChanged.addListener(onStorage);
  chrome.runtime.onMessage.addListener(onMessage);

  const alive = () => { try { return !!chrome.runtime?.id; } catch (_) { return false; } };

  function teardown() {
    ac.abort();
    disarmWheel();
    cancelAnimationFrame(rafId);
    clearTimeout(unblockTimer);
    try {
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch (_) {}
    if (ui) ui.host.remove();
    ui = null; st = null;
    if (window.__wgTeardown === teardown) delete window.__wgTeardown;
  }
  window.__wgTeardown = teardown;

  const activeHere = () => settings.enabled && !WG.isExcluded(location.hostname, settings.excludedSites);

  // ---------- 오버레이 UI (Shadow DOM + top layer) ----------
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CSS = `
    :host { all: initial; }
    .root { position: fixed; inset: 0; pointer-events: none; --wg-color: #00C73C;
      font-family: "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif; }
    svg.trail { position: fixed; inset: 0; width: 100vw; height: 100vh; overflow: visible; }
    .trail path { fill: none; stroke-linecap: round; stroke-linejoin: round; transition: stroke .15s; }
    .trail .halo { stroke: rgba(255,255,255,.55); }
    .trail .line { stroke: var(--wg-color); filter: drop-shadow(0 1px 3px rgba(0,0,0,.35)); }
    .root.cancel .trail .line { stroke: #9AA0A6; }

    .guide { position: fixed; left: 50%; top: 50%; display: flex; flex-direction: column; align-items: center; gap: 14px;
      transform: translate(-50%, -50%) scale(.9); opacity: 0; transition: opacity .14s ease, transform .18s cubic-bezier(.2,.9,.3,1.2); }
    .guide.show { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    .circle { width: 132px; height: 132px; border-radius: 50%; display: grid; place-items: center;
      background: rgba(22,22,26,.58); -webkit-backdrop-filter: blur(16px) saturate(150%); backdrop-filter: blur(16px) saturate(150%);
      box-shadow: 0 12px 32px rgba(0,0,0,.28), inset 0 0 0 1px rgba(255,255,255,.12);
      transition: box-shadow .15s; }
    .root.matched .circle { box-shadow: 0 12px 32px rgba(0,0,0,.28), inset 0 0 0 2.5px var(--wg-color); }
    .root.cancel .circle { box-shadow: 0 12px 32px rgba(0,0,0,.28), inset 0 0 0 2.5px #FF6B6B; }
    .icon { width: 58px; height: 58px; fill: #fff; transition: fill .15s; }
    .root.cancel .icon { fill: #FF8A8A; }
    .root.unknown .icon { fill: rgba(255,255,255,.55); }

    .pill { display: flex; align-items: center; gap: 10px; padding: 7px 16px 7px 8px; border-radius: 999px;
      background: rgba(22,22,26,.74); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
      box-shadow: 0 6px 18px rgba(0,0,0,.22), inset 0 0 0 1px rgba(255,255,255,.08);
      color: #fff; font-size: 15px; font-weight: 600; letter-spacing: -.01em; white-space: nowrap; }
    .steps { display: flex; gap: 4px; }
    .step { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; background: rgba(255,255,255,.16); }
    .step:last-child { background: var(--wg-color); }
    .root.cancel .step:last-child { background: #FF6B6B; }
    .step svg { width: 15px; height: 15px; fill: #fff; }
    .step.R svg { transform: rotate(90deg); } .step.D svg { transform: rotate(180deg); } .step.L svg { transform: rotate(270deg); }
    .more { color: rgba(255,255,255,.6); font-size: 13px; }

    /* 다음 방향 미리보기 (원 오른쪽의 작은 십자) */
    .cwrap { position: relative; }
    .hints { position: absolute; left: calc(100% + 14px); top: 50%; width: max-content;
      display: grid; grid-template-columns: minmax(64px, auto) 26px minmax(64px, auto);
      grid-template-areas: ". U ." "L hub R" ". D ."; align-items: center; gap: 6px;
      transform: translate(-6px, -50%); opacity: 0; transition: opacity .16s ease, transform .2s ease; }
    .hints.show { opacity: 1; transform: translate(0, -50%); }
    .hub { grid-area: hub; width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center;
      background: var(--wg-color); box-shadow: 0 4px 12px rgba(0,0,0,.22); }
    .hub svg { width: 16px; height: 16px; fill: #fff; }
    .hub.R svg { transform: rotate(90deg); } .hub.D svg { transform: rotate(180deg); } .hub.L svg { transform: rotate(270deg); }
    .slot { display: flex; min-width: 0; }
    .slot.U { grid-area: U; justify-content: center; } .slot.D { grid-area: D; justify-content: center; }
    .slot.L { grid-area: L; justify-content: flex-end; } .slot.R { grid-area: R; justify-content: flex-start; }
    .slot.U .chip, .slot.D .chip { flex: none; }
    .chip { display: flex; align-items: center; gap: 5px; padding: 4px 10px 4px 6px; border-radius: 999px; white-space: nowrap;
      background: rgba(22,22,26,.7); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
      box-shadow: 0 4px 12px rgba(0,0,0,.2), inset 0 0 0 1px rgba(255,255,255,.08);
      color: rgba(255,255,255,.92); font-size: 12px; font-weight: 600;
      transition: opacity .15s, background .15s, transform .15s; }
    .chip svg { width: 15px; height: 15px; fill: currentColor; flex: none; }
    .hints.picked .chip { opacity: .3; }
    .hints.picked .chip.on { opacity: 1; background: var(--wg-color); color: #fff; transform: scale(1.06); }
    @media (prefers-reduced-motion: reduce) { .guide, .hints, .chip { transition: none; } }
  `;

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function iconSvg(d, cls) {
    const s = svgEl('svg', { viewBox: '0 0 24 24', class: cls || '' });
    s.appendChild(svgEl('path', { d }));
    return s;
  }

  function ensureUI() {
    if (ui && ui.host.isConnected) return ui;
    if (ui) ui.host.remove();
    const docEl = document.documentElement;
    if (!(docEl instanceof HTMLElement)) return (ui = null);

    const host = document.createElement('whale-gesture-root');
    const hs = host.style;
    const hostCss = {
      position: 'fixed', inset: '0', width: '100vw', height: '100vh', 'max-width': 'none', 'max-height': 'none',
      margin: '0', padding: '0', border: '0', background: 'transparent', overflow: 'visible',
      'pointer-events': 'none', 'z-index': '2147483647', display: 'none', color: 'inherit'
    };
    for (const k in hostCss) hs.setProperty(k, hostCss[k], 'important');
    // popover 로 띄우면 영상 전체화면·모달 위에도 표시된다 (top layer)
    if ('popover' in HTMLElement.prototype) host.setAttribute('popover', 'manual');

    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    const root = document.createElement('div');
    root.className = 'root';

    const trail = svgEl('svg', { class: 'trail' });
    const halo = svgEl('path', { class: 'halo' });
    const line = svgEl('path', { class: 'line' });
    trail.append(halo, line);

    const guide = document.createElement('div');
    guide.className = 'guide';
    const circle = document.createElement('div');
    circle.className = 'circle';
    const icon = iconSvg('', 'icon');
    circle.appendChild(icon);
    const cwrap = document.createElement('div');
    cwrap.className = 'cwrap';
    const hints = document.createElement('div');
    hints.className = 'hints';
    cwrap.append(circle, hints);
    const pill = document.createElement('div');
    pill.className = 'pill';
    const steps = document.createElement('div');
    steps.className = 'steps';
    const label = document.createElement('span');
    pill.append(steps, label);
    guide.append(cwrap, pill);

    root.append(trail, guide);
    shadow.append(style, root);
    docEl.appendChild(host);

    ui = { host, root, trail, halo, line, guide, icon: icon.firstChild, steps, label, hints, shown: false, seqShown: null };
    applyTheme();
    return ui;
  }

  function applyTheme() {
    if (!ui) return;
    ui.root.style.setProperty('--wg-color', settings.lineColor);
    ui.line.setAttribute('stroke-width', settings.lineWidth);
    ui.halo.setAttribute('stroke-width', settings.lineWidth + 4);
    ui.trail.style.display = settings.showTrail ? '' : 'none';
    ui.guide.style.display = settings.showGuide ? '' : 'none';
  }

  function showUI() {
    const u = ensureUI();
    if (!u || u.shown) return;
    u.shown = true;
    u.host.style.setProperty('display', 'block', 'important');
    try { if (u.host.showPopover && !u.host.matches(':popover-open')) u.host.showPopover(); } catch (_) {}
  }

  function hideUI() {
    if (!ui || !ui.shown) return;
    ui.shown = false;
    ui.seqShown = null;
    ui.guide.classList.remove('show');
    ui.hints.classList.remove('show', 'picked');
    delete ui.hints.dataset.first;
    ui.halo.setAttribute('d', '');
    ui.line.setAttribute('d', '');
    try { if (ui.host.hidePopover && ui.host.matches(':popover-open')) ui.host.hidePopover(); } catch (_) {}
    ui.host.style.setProperty('display', 'none', 'important');
  }

  function render() {
    rafId = 0;
    if (!st || !st.moved || !ui) return;
    ui.halo.setAttribute('d', st.path);
    ui.line.setAttribute('d', st.path);

    const seq = st.seq;
    if (seq === ui.seqShown) return;
    ui.seqShown = seq;

    let state, text, d;
    if (seq.length > 2) {
      state = 'cancel'; text = '취소'; d = WG.ICONS.none;
    } else {
      const id = settings.gestures[seq];
      if (id && id !== 'none') { state = 'matched'; text = WG.ACTION_MAP[id].label; d = WG.ICONS[id]; }
      else { state = 'unknown'; text = '등록되지 않은 제스처'; d = WG.ICONS.unknown; }
    }
    ui.root.classList.remove('cancel', 'matched', 'unknown');
    ui.root.classList.add(state);
    ui.icon.setAttribute('d', d || WG.ICONS.unknown);
    ui.label.textContent = text;

    ui.steps.replaceChildren();
    const visible = seq.slice(-4);
    if (seq.length > 4) {
      const more = document.createElement('span');
      more.className = 'more';
      more.textContent = '…';
      ui.steps.appendChild(more);
    }
    for (const c of visible) {
      const s = document.createElement('span');
      s.className = 'step ' + c;
      s.appendChild(iconSvg(WG.ICONS.arrow));
      ui.steps.appendChild(s);
    }
    renderHints(seq);
    ui.guide.classList.toggle('show', seq.length > 0);
  }

  // 첫 방향을 그은 뒤, 이어서 그을 수 있는 방향별 동작을 작게 보여준다
  function renderHints(seq) {
    const h = ui.hints;
    const first = seq[0];
    if (!settings.showHints || !first || seq.length > 2) { h.classList.remove('show', 'picked'); return; }
    if (h.dataset.first !== first) {
      h.dataset.first = first;
      h.replaceChildren();
      const hub = document.createElement('span');
      hub.className = 'hub ' + first;
      hub.appendChild(iconSvg(WG.ICONS.arrow));
      h.appendChild(hub);
      let count = 0;
      for (const dir of ['U', 'R', 'D', 'L']) {
        if (dir === first) continue;
        const id = settings.gestures[first + dir];
        if (!id || id === 'none') continue;
        const slot = document.createElement('span');
        slot.className = 'slot ' + dir;
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.dataset.dir = dir;
        const text = document.createElement('span');
        text.textContent = WG.ACTION_MAP[id].label;
        chip.append(iconSvg(WG.ICONS[id] || WG.ICONS.unknown), text);
        slot.appendChild(chip);
        h.appendChild(slot);
        count++;
      }
      h.dataset.count = count;
    }
    if (h.dataset.count === '0') { h.classList.remove('show'); return; }
    const second = seq[1] || '';
    h.classList.toggle('picked', !!second);
    for (const c of h.querySelectorAll('.chip')) c.classList.toggle('on', c.dataset.dir === second);
    h.classList.add('show');
  }
  const scheduleRender = () => { if (!rafId) rafId = requestAnimationFrame(render); };

  // ---------- 제스처 인식 ----------
  function reset() {
    st = null;
    cancelAnimationFrame(rafId);
    rafId = 0;
    hideUI();
  }

  function scheduleUnblock(ms) {
    clearTimeout(unblockTimer);
    unblockTimer = setTimeout(() => { blockMenu = false; }, ms || 700);
  }

  listen('mousedown', e => {
    if (e.button !== 2 || !e.isTrusted) return;
    if (!alive()) return teardown();
    blockMenu = false;
    clearTimeout(unblockTimer);
    reset();
    // Shift + 우클릭: 제스처 없이 기본 메뉴 / 포인터 잠금(게임 등) 중에는 동작 안 함
    if (!activeHere() || e.shiftKey || document.pointerLockElement) return;

    st = {
      ax: e.clientX, ay: e.clientY,
      seq: '', moved: false, wheelUsed: false,
      path: `M${e.clientX} ${e.clientY}`,
      target: e.composedPath()[0] || e.target
    };
    armWheel();
  });

  listen('mousemove', e => {
    if (!st) {
      // 휠로 넘어온 탭에서 버튼을 뗀 뒤 정리
      if (wheelArmed && !(e.buttons & 2)) { disarmWheel(); scheduleUnblock(300); }
      return;
    }
    // mouseup 을 놓쳤으면(페이지가 이벤트를 삼킨 경우 등) 즉시 정리
    if (!(e.buttons & 2)) { reset(); disarmWheel(); return; }
    if (st.wheelUsed) return;

    const x = e.clientX, y = e.clientY;
    st.path += ` L${x} ${y}`;

    const dx = x - st.ax, dy = y - st.ay;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.hypot(dx, dy) >= settings.sensitivity) {
      // 대각선에 가까운 움직임은 방향으로 치지 않아 오인식을 줄인다
      if (Math.min(ax, ay) / Math.max(ax, ay) < 0.7) {
        const dir = ax > ay ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
        if (st.seq.slice(-1) !== dir) st.seq += dir;
      }
      st.ax = x; st.ay = y;
      if (!st.moved) {
        st.moved = true;
        blockMenu = true;
        showUI();
      }
    }
    if (st.moved) scheduleRender();
  });

  listen('mouseup', e => {
    if (e.button !== 2) return;
    disarmWheel();
    if (blockMenu) scheduleUnblock();
    if (!st) return;
    const s = st;
    reset();
    if (!s.moved || s.wheelUsed) return;
    if (s.seq.length >= 1 && s.seq.length <= 2) {
      const action = settings.gestures[s.seq];
      if (action && action !== 'none') run(action, s.target);
    }
  });

  listen('contextmenu', e => {
    if (!blockMenu) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    blockMenu = false;
    clearTimeout(unblockTimer);
  });

  // 창 자체가 포커스를 잃을 때만 (입력창 blur 는 무시)
  window.addEventListener('blur', e => { if (e.target === window) { reset(); disarmWheel(); } }, { signal: ac.signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { reset(); disarmWheel(); } }, { signal: ac.signal });

  // ---------- 오른쪽 버튼 + 휠 = 탭 전환 ----------
  function onWheel(e) {
    if (!e.isTrusted || !settings.wheelTabs || !activeHere()) return;
    // 일부 환경은 휠 이벤트의 buttons 를 0 으로 보내므로, 우리가 추적한 '눌림' 상태도 인정
    const held = (e.buttons & 2) || (e.buttons === 0 && wheelArmed);
    if (!held) { disarmWheel(); return; }
    if (wheelSafetyTimer) armWheel(6000); // 탭을 넘겨받은 경우 안전 타이머 연장
    e.preventDefault();
    e.stopPropagation();
    blockMenu = true;
    scheduleUnblock(5000);
    if (st) { st.wheelUsed = true; hideUI(); }
    const now = Date.now();
    if (now - lastWheelAt < 160 || !e.deltaY) return;
    lastWheelAt = now;
    send(e.deltaY > 0 ? 'nextTab' : 'prevTab');
  }
  // 스크롤 성능을 위해 오른쪽 버튼을 누르고 있는 동안만 non-passive 휠 리스너를 단다
  // timeoutMs: 버튼을 뗀 사실을 못 받을 수도 있는 경우(넘겨받은 탭)를 위한 안전장치
  function armWheel(timeoutMs) {
    clearTimeout(wheelSafetyTimer);
    wheelSafetyTimer = timeoutMs ? setTimeout(disarmWheel, timeoutMs) : 0;
    if (wheelArmed) return;
    wheelArmed = true;
    window.addEventListener('wheel', onWheel, { capture: true, passive: false, signal: ac.signal });
  }
  function disarmWheel() {
    clearTimeout(wheelSafetyTimer);
    wheelSafetyTimer = 0;
    if (!wheelArmed) return;
    wheelArmed = false;
    window.removeEventListener('wheel', onWheel, { capture: true });
  }

  // ---------- 동작 실행 ----------
  function send(action) {
    try {
      const p = chrome.runtime.sendMessage({ type: 'WG_ACTION', action });
      if (p && p.catch) p.catch(() => {});
    } catch (_) {
      teardown(); // 확장이 새로고침되어 연결이 끊긴 오래된 스크립트
    }
  }

  function canScroll(el) {
    if (!el || el.scrollHeight <= el.clientHeight + 1) return false;
    if (el === document.scrollingElement) return true;
    return /(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY);
  }
  function findScrollable(start) {
    let el = start && start.nodeType === 1 ? start : start && start.parentElement;
    while (el && el !== document.documentElement && el !== document.body) {
      if (canScroll(el)) return el;
      el = el.parentElement || (el.getRootNode && el.getRootNode().host) || null;
    }
    const doc = document.scrollingElement || document.documentElement;
    return doc;
  }

  function run(action, target) {
    if (action === 'scrollTop' || action === 'scrollBottom') {
      const el = findScrollable(target);
      el.scrollTo({
        top: action === 'scrollTop' ? 0 : el.scrollHeight,
        behavior: settings.smoothScroll ? 'smooth' : 'auto'
      });
      return;
    }
    send(action);
  }
})();
