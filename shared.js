// 콘텐츠 스크립트 · 백그라운드 · 설정 페이지 · 팝업이 함께 쓰는 공통 정의
// (재주입될 수 있으므로 const 대신 globalThis 할당을 사용합니다)
globalThis.WG = (() => {
  // Material Icons 기반 24x24 path 데이터
  const ICONS = {
    back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
    forward: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
    scrollTop: 'M8 11h3v10h2V11h3l-4-4-4 4zM4 3v2h16V3H4z',
    scrollBottom: 'M16 13h-3V3h-2v10H8l4 4 4-4zM4 19v2h16v-2H4z',
    home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    reload: 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    newTab: 'M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h10v4h8v10z',
    newWindow: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
    incognito: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z',
    closeTab: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    restoreTab: 'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.25 2.5.75-1.23-3.5-2.06V8h-1.5z',
    duplicateTab: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
    prevTab: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z',
    nextTab: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
    fullscreen: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
    maximize: 'M18 4H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H6V6h12v12z',
    minimize: 'M6 19h12v2H6z',
    pinTab: 'M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z',
    muteTab: 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
    none: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-8 10c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z',
    unknown: 'M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z',
    arrow: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z'
  };
  ICONS.hardReload = ICONS.reload;

  // 실행 가능한 동작 목록 (설정 페이지 드롭다운 순서)
  const ACTIONS = [
    { id: 'none', label: '동작 없음', group: '기타' },
    { id: 'back', label: '이전 페이지', group: '페이지' },
    { id: 'forward', label: '다음 페이지', group: '페이지' },
    { id: 'scrollTop', label: '맨 위로', group: '페이지' },
    { id: 'scrollBottom', label: '맨 아래로', group: '페이지' },
    { id: 'reload', label: '새로고침', group: '페이지' },
    { id: 'hardReload', label: '강력 새로고침', group: '페이지' },
    { id: 'home', label: '홈페이지', group: '페이지' },
    { id: 'newTab', label: '새 탭 열기', group: '탭' },
    { id: 'closeTab', label: '현재 탭 닫기', group: '탭' },
    { id: 'restoreTab', label: '닫은 탭 복구', group: '탭' },
    { id: 'duplicateTab', label: '탭 복제', group: '탭' },
    { id: 'prevTab', label: '이전 탭', group: '탭' },
    { id: 'nextTab', label: '다음 탭', group: '탭' },
    { id: 'pinTab', label: '탭 고정 전환', group: '탭' },
    { id: 'muteTab', label: '탭 음소거 전환', group: '탭' },
    { id: 'newWindow', label: '새 창 열기', group: '창' },
    { id: 'incognito', label: '시크릿 창으로 열기', group: '창' },
    { id: 'fullscreen', label: '전체화면 전환', group: '창' },
    { id: 'maximize', label: '창 최대화 전환', group: '창' },
    { id: 'minimize', label: '창 최소화', group: '창' }
  ];
  const ACTION_MAP = Object.fromEntries(ACTIONS.map(a => [a.id, a]));

  const GESTURES = ['L', 'R', 'U', 'D', 'LR', 'RL', 'UD', 'DU', 'UL', 'UR', 'DL', 'DR', 'LU', 'LD', 'RU', 'RD'];
  const ARROWS = { L: '←', R: '→', U: '↑', D: '↓' };

  const DEFAULTS = {
    enabled: true,
    showTrail: true,
    showGuide: true,
    showHints: true,
    lineColor: '#00C73C',
    lineWidth: 5,
    sensitivity: 20,
    wheelTabs: true,
    smoothScroll: true,
    homeUrl: 'https://www.google.com',
    excludedSites: [],
    gestures: {
      L: 'back', R: 'forward', U: 'scrollTop', D: 'scrollBottom',
      LR: 'home', RL: 'home', UD: 'reload', DU: 'reload',
      UL: 'newWindow', UR: 'newTab', DL: 'incognito', DR: 'closeTab',
      LU: 'fullscreen', LD: 'restoreTab', RU: 'maximize', RD: 'minimize'
    }
  };

  function mergeSettings(stored) {
    const s = Object.assign({}, DEFAULTS, stored || {});
    s.gestures = Object.assign({}, DEFAULTS.gestures, (stored && stored.gestures) || {});
    for (const g of GESTURES) if (!ACTION_MAP[s.gestures[g]]) s.gestures[g] = 'none';
    if (!Array.isArray(s.excludedSites)) s.excludedSites = [];
    s.sensitivity = Math.min(80, Math.max(8, Number(s.sensitivity) || DEFAULTS.sensitivity));
    s.lineWidth = Math.min(16, Math.max(1, Number(s.lineWidth) || DEFAULTS.lineWidth));
    return s;
  }

  // "example.com"을 넣으면 하위 도메인(www.example.com 등)까지 제외
  function normalizeHost(entry) {
    let h = String(entry || '').trim().toLowerCase();
    if (!h || h.startsWith('#')) return '';
    h = h.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '');
    return h.replace(/^\*\./, '').replace(/^www\./, '');
  }
  function isExcluded(hostname, list) {
    const host = String(hostname || '').toLowerCase();
    if (!host) return false;
    return (list || []).some(raw => {
      const e = normalizeHost(raw);
      return e && (host === e || host.endsWith('.' + e));
    });
  }

  const arrows = seq => [...seq].map(c => ARROWS[c] || c).join(' ');

  return { ICONS, ACTIONS, ACTION_MAP, GESTURES, ARROWS, DEFAULTS, mergeSettings, normalizeHost, isExcluded, arrows };
})();
