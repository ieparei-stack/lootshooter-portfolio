// 화면 경고 배너 (오른쪽 위, 빨간 배경). 데이터 값 오류처럼 기획자가 반드시 봐야 하는 문제를 띄운다.
// 경고가 없으면 아무것도 만들지 않고, 한번 뜬 경고는 사라지지 않는다.
let root = null;

function ensureRoot() {
  if (root) return root;
  root = document.createElement('div');
  root.id = 'warnings';
  root.style.cssText = [
    'position:fixed', 'top:12px', 'right:12px', 'z-index:20', 'max-width:46vw',
    'padding:10px 12px', 'background:rgba(160,20,20,0.9)', 'color:#fff',
    'font:12px/1.5 system-ui, sans-serif', 'border-radius:6px', 'user-select:text',
  ].join(';');
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:700;margin-bottom:4px';
  title.textContent = '⚠ 데이터 경고 — 기본값으로 진행 중';
  root.appendChild(title);
  document.body.appendChild(root);
  return root;
}

export function showWarnings(list) {
  if (!list || list.length === 0) return;
  const el = ensureRoot();
  for (const msg of list) {
    const line = document.createElement('div');
    line.textContent = '· ' + msg;
    el.appendChild(line);
  }
}
