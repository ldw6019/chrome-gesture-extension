const $ = id => document.getElementById(id);
let settings = WG.mergeSettings();
let host = '';

function render() {
  $('enabled').checked = settings.enabled;
  document.body.classList.toggle('off', !settings.enabled);

  if (host) {
    $('host').textContent = host;
    $('siteEnabled').checked = !WG.isExcluded(host, settings.excludedSites);
    $('siteEnabled').disabled = !settings.enabled;
  }

  const cheat = $('cheat');
  cheat.replaceChildren();
  for (const g of ['L', 'R', 'UD', 'DR', 'UR', 'LD']) {
    const a = WG.ACTION_MAP[settings.gestures[g]];
    const row = document.createElement('div');
    const arrows = document.createElement('span');
    arrows.className = 'arrows';
    for (const c of g) {
      const i = document.createElement('i');
      i.textContent = WG.ARROWS[c];
      arrows.appendChild(i);
    }
    const l = document.createElement('span');
    l.className = 'l';
    l.textContent = a ? a.label : '';
    row.append(arrows, l);
    cheat.appendChild(row);
  }
}

(async () => {
  settings = WG.mergeSettings(await chrome.storage.sync.get(null));
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab && tab.url);
    if (/^(https?|file):$/.test(url.protocol) && !/^chromewebstore\.google\.com$|^chrome\.google\.com$/.test(url.hostname)) {
      host = url.hostname.replace(/^www\./, '') || '';
    }
  } catch (_) {}
  if (!host) {
    $('siteRow').hidden = true;
    $('unsupported').hidden = false;
  }
  render();

  $('enabled').addEventListener('change', async e => {
    settings.enabled = e.target.checked;
    await chrome.storage.sync.set({ enabled: settings.enabled });
    render();
  });

  $('siteEnabled').addEventListener('change', async e => {
    let list = settings.excludedSites.slice();
    if (e.target.checked) {
      // 이 호스트를 덮는 항목들을 모두 제거
      list = list.filter(x => !WG.isExcluded(host, [x]));
    } else {
      list.push(host);
    }
    settings.excludedSites = list;
    await chrome.storage.sync.set({ excludedSites: list });
    render();
  });

  $('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
})();
