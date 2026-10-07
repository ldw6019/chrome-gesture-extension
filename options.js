const $ = id => document.getElementById(id);
const COLORS = ['#00C73C', '#2F80ED', '#7C5CFF', '#FF4D6D', '#FF9F1A', '#14B8A6', '#111827'];

let settings = WG.mergeSettings();
let toastTimer = 0;

function toast(msg) {
  const t = $('toast');
  t.textContent = msg || '저장됨';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1200);
}

async function save(patch, msg) {
  Object.assign(settings, patch);
  await chrome.storage.sync.set(patch);
  render();
  toast(msg);
}

function debounce(fn, ms) {
  let t = 0;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---------- 제스처 매핑 ----------
function buildGestureRows() {
  const groups = {};
  for (const a of WG.ACTIONS) (groups[a.group] = groups[a.group] || []).push(a);

  for (const g of WG.GESTURES) {
    const item = document.createElement('label');
    item.className = 'g-item';
    item.dataset.g = g;

    const arrows = document.createElement('span');
    arrows.className = 'arrows';
    for (const c of g) {
      const i = document.createElement('i');
      i.textContent = WG.ARROWS[c];
      arrows.appendChild(i);
    }

    const sel = document.createElement('select');
    sel.setAttribute('aria-label', WG.arrows(g) + ' 제스처 동작');
    for (const [name, list] of Object.entries(groups)) {
      const og = document.createElement('optgroup');
      og.label = name;
      for (const a of list) og.appendChild(new Option(a.label, a.id));
      sel.appendChild(og);
    }
    sel.addEventListener('change', () => {
      save({ gestures: Object.assign({}, settings.gestures, { [g]: sel.value }) });
    });

    item.append(arrows, sel);
    $(g.length === 1 ? 'gesturesSingle' : 'gesturesDouble').appendChild(item);
  }
}

// ---------- 색상 ----------
function buildSwatches() {
  const box = $('swatches');
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = c;
    b.dataset.color = c;
    b.title = c;
    b.addEventListener('click', () => save({ lineColor: c }));
    box.appendChild(b);
  }
  const custom = document.createElement('label');
  custom.className = 'swatch custom';
  custom.title = '직접 고르기';
  const input = document.createElement('input');
  input.type = 'color';
  input.id = 'customColor';
  input.addEventListener('input', debounce(() => save({ lineColor: input.value.toUpperCase() }), 150));
  custom.appendChild(input);
  box.appendChild(custom);
}

// ---------- 화면 반영 ----------
function render() {
  const s = settings;
  $('enabled').checked = s.enabled;
  $('enabledText').textContent = s.enabled ? '사용 중' : '꺼짐';
  document.body.classList.toggle('off', !s.enabled);

  for (const item of document.querySelectorAll('.g-item')) {
    const sel = item.querySelector('select');
    sel.value = s.gestures[item.dataset.g];
    item.classList.toggle('is-none', sel.value === 'none');
  }

  for (const id of ['showTrail', 'showGuide', 'showHints', 'wheelTabs', 'smoothScroll']) $(id).checked = !!s[id];

  const preset = COLORS.includes(s.lineColor.toUpperCase());
  for (const b of document.querySelectorAll('.swatch[data-color]')) {
    b.setAttribute('aria-pressed', String(b.dataset.color.toUpperCase() === s.lineColor.toUpperCase()));
  }
  const custom = document.querySelector('.swatch.custom');
  custom.setAttribute('aria-pressed', String(!preset));
  if (!preset) custom.style.boxShadow = `0 0 0 2px var(--text), inset 0 0 0 10px ${s.lineColor}`;
  else custom.style.boxShadow = '';
  $('customColor').value = s.lineColor;

  $('lineWidth').value = s.lineWidth;
  $('lineWidthOut').textContent = s.lineWidth + 'px';
  $('sensitivity').value = s.sensitivity;
  $('sensitivityOut').textContent = s.sensitivity + 'px';

  if (document.activeElement !== $('homeUrl')) $('homeUrl').value = s.homeUrl;
  if (document.activeElement !== $('excludedSites')) $('excludedSites').value = s.excludedSites.join('\n');

  // 미리보기
  const line = $('previewLine'), halo = $('previewHalo');
  line.setAttribute('stroke', s.lineColor);
  line.setAttribute('stroke-width', s.lineWidth);
  halo.setAttribute('stroke-width', s.lineWidth + 4);
  line.style.display = halo.style.display = s.showTrail ? '' : 'none';
  document.querySelector('.preview-pill').style.display = s.showGuide ? '' : 'none';
  document.querySelector('.preview').style.setProperty('--preview-color', s.lineColor);
  const dr = WG.ACTION_MAP[s.gestures.DR];
  $('previewLabel').textContent = dr && dr.id !== 'none' ? dr.label : '등록되지 않은 제스처';
}

// ---------- 이벤트 ----------
function bind() {
  $('enabled').addEventListener('change', e => save({ enabled: e.target.checked }, e.target.checked ? '제스처 켜짐' : '제스처 꺼짐'));
  for (const id of ['showTrail', 'showGuide', 'showHints', 'wheelTabs', 'smoothScroll']) {
    $(id).addEventListener('change', e => save({ [id]: e.target.checked }));
  }
  $('lineWidth').addEventListener('input', e => {
    settings.lineWidth = Number(e.target.value);
    render();
  });
  $('lineWidth').addEventListener('change', e => save({ lineWidth: Number(e.target.value) }));
  $('sensitivity').addEventListener('input', e => {
    $('sensitivityOut').textContent = e.target.value + 'px';
  });
  $('sensitivity').addEventListener('change', e => save({ sensitivity: Number(e.target.value) }));

  $('homeUrl').addEventListener('change', e => {
    let v = e.target.value.trim();
    if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
    e.target.value = v || WG.DEFAULTS.homeUrl;
    save({ homeUrl: e.target.value });
  });

  $('excludedSites').addEventListener('input', debounce(e => {
    const list = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
    save({ excludedSites: list });
  }, 500));

  $('resetGestures').addEventListener('click', () => {
    save({ gestures: Object.assign({}, WG.DEFAULTS.gestures) }, '기본 제스처로 되돌렸어요');
  });

  // 다른 곳(팝업 등)에서 바뀐 설정도 반영
  chrome.storage.onChanged.addListener(async (_c, area) => {
    if (area !== 'sync') return;
    settings = WG.mergeSettings(await chrome.storage.sync.get(null));
    render();
  });
}

(async () => {
  buildGestureRows();
  buildSwatches();
  bind();
  settings = WG.mergeSettings(await chrome.storage.sync.get(null));
  render();
})();
