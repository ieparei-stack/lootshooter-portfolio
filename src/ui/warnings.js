// 데이터 경고 (T26.1: 배너 → 우상단 작은 배지). 무기 데이터 값 오류처럼 기획자가 반드시 봐야 하는 문제.
// 경고가 없으면 아무것도 만들지 않는다. 있으면 `⚠ N` 배지만 보이고, 누르면 목록이 펼쳐진다. 한번 뜬 경고는 사라지지 않는다.
let root = null, badge = null, list = null, count = 0;

function ensureRoot() {
  if (root) return root;
  root = document.createElement('div');
  root.id = 'warnings';
  root.style.cssText = 'position:fixed;top:12px;right:12px;z-index:20;display:flex;flex-direction:column;align-items:flex-end;gap:6px';
  badge = document.createElement('button');
  badge.style.cssText = [
    'height:22px', 'padding:0 8px', 'border:0', 'border-radius:11px', 'cursor:pointer',
    'background:rgba(180,20,20,0.95)', 'color:#fff', 'font:700 12px/22px system-ui, sans-serif',
  ].join(';');
  badge.title = '데이터 경고 — 기본값으로 진행 중. 눌러서 펼치기';
  list = document.createElement('div');
  list.style.cssText = [
    'max-width:46vw', 'padding:8px 10px', 'background:rgba(160,20,20,0.92)', 'color:#fff',
    'font:12px/1.5 system-ui, sans-serif', 'border-radius:6px', 'user-select:text',
  ].join(';');
  list.hidden = true;
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:700;margin-bottom:4px';
  title.textContent = '⚠ 데이터 경고 — 기본값으로 진행 중';
  list.appendChild(title);
  badge.addEventListener('click', () => { list.hidden = !list.hidden; });
  root.appendChild(badge);
  root.appendChild(list);
  document.body.appendChild(root);
  return root;
}

export function showWarnings(msgs) {
  if (!msgs || msgs.length === 0) return;
  ensureRoot();
  for (const msg of msgs) {
    const line = document.createElement('div');
    line.textContent = '· ' + msg;
    list.appendChild(line);
  }
  count += msgs.length;
  badge.textContent = `⚠ ${count}`;
}
