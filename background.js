// 콘텐츠 스크립트에서 보낸 동작을 받아 크롬 API로 실행합니다.
importScripts('shared.js');

const getSettings = async () => WG.mergeSettings(await chrome.storage.sync.get(null));

function normalizeUrl(url) {
  const u = String(url || '').trim();
  if (!u) return WG.DEFAULTS.homeUrl;
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : 'https://' + u;
}

// 전체화면/최대화 해제 시 원래 창 상태로 돌아가기 위해 기억해 둠
async function rememberState(win) {
  await chrome.storage.session.set({ ['prevState_' + win.id]: win.state }).catch(() => {});
}
async function previousState(winId) {
  const key = 'prevState_' + winId;
  const data = await chrome.storage.session.get(key).catch(() => ({}));
  const s = data[key];
  return s === 'maximized' ? 'maximized' : 'normal';
}

async function switchTab(tab, dir) {
  const tabs = (await chrome.tabs.query({ windowId: tab.windowId })).sort((a, b) => a.index - b.index);
  if (tabs.length < 2) return;
  const i = tabs.findIndex(t => t.id === tab.id);
  const next = tabs[(i + dir + tabs.length) % tabs.length];
  await chrome.tabs.update(next.id, { active: true });
  // 오른쪽 버튼을 누른 채 넘어갔으므로 새 탭에서도 휠 전환을 잇고 우클릭 메뉴를 막도록 알림
  chrome.tabs.sendMessage(next.id, { type: 'WG_RIGHT_HELD' }).catch(() => {});
}

const ACTIONS = {
  back: t => chrome.tabs.goBack(t.id),
  forward: t => chrome.tabs.goForward(t.id),
  reload: t => chrome.tabs.reload(t.id),
  hardReload: t => chrome.tabs.reload(t.id, { bypassCache: true }),
  home: async t => chrome.tabs.update(t.id, { url: normalizeUrl((await getSettings()).homeUrl) }),

  newTab: t => chrome.tabs.create({ windowId: t.windowId, index: t.index + 1, openerTabId: t.id }),
  closeTab: t => chrome.tabs.remove(t.id),
  restoreTab: () => chrome.sessions.restore(),
  duplicateTab: t => chrome.tabs.duplicate(t.id),
  prevTab: t => switchTab(t, -1),
  nextTab: t => switchTab(t, 1),
  pinTab: t => chrome.tabs.update(t.id, { pinned: !t.pinned }),
  muteTab: t => chrome.tabs.update(t.id, { muted: !(t.mutedInfo && t.mutedInfo.muted) }),

  newWindow: t => chrome.windows.create({ incognito: t.incognito }),
  incognito: t => chrome.windows.create({ url: t.url, incognito: true }),
  fullscreen: async t => {
    const w = await chrome.windows.get(t.windowId);
    if (w.state === 'fullscreen') return chrome.windows.update(w.id, { state: await previousState(w.id) });
    await rememberState(w);
    return chrome.windows.update(w.id, { state: 'fullscreen' });
  },
  maximize: async t => {
    const w = await chrome.windows.get(t.windowId);
    return chrome.windows.update(w.id, { state: w.state === 'maximized' ? 'normal' : 'maximized' });
  },
  minimize: t => chrome.windows.update(t.windowId, { state: 'minimized' })
};

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'WG_ACTION' || !sender.tab) return;
  const fn = ACTIONS[msg.action];
  if (!fn) return;
  Promise.resolve()
    .then(() => fn(sender.tab))
    .catch(err => console.warn('[Gesture Control]', msg.action, err && err.message));
});

// ---------- 설치/업데이트 시 이미 열린 탭에도 바로 적용 ----------
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*', 'file:///*'] });
  await Promise.all(tabs.filter(t => !t.discarded).map(t =>
    chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['shared.js', 'gesture.js'] }).catch(() => {})
  ));
}

// ---------- 전체 꺼짐 상태를 아이콘 배지로 표시 ----------
async function updateBadge() {
  const { enabled } = await getSettings();
  await chrome.action.setBadgeBackgroundColor({ color: '#6B7280' });
  await chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await injectIntoOpenTabs();
  updateBadge();
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(updateBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && 'enabled' in changes) updateBadge();
});
