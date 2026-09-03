// 히트마커 — 표적 명중 시 화면 중앙에 X자 4획. 몸통 = 흰색, 머리 = 노란색 + 더 크게. (사용자 메모 2)
const SHOW_MS = 120;

export function createHitmarker() {
  const root = document.createElement('div');
  root.id = 'hitmarker';
  root.style.cssText = [
    'position:fixed', 'left:50%', 'top:50%', 'width:0', 'height:0',
    'pointer-events:none', 'z-index:6', 'opacity:0',
  ].join(';');
  const ticks = [];
  for (let i = 0; i < 4; i++) {
    const t = document.createElement('div');
    t.style.cssText = [
      'position:absolute', 'left:-1px', 'top:-7px', 'width:2px', 'height:7px',
      'background:#fff', 'box-shadow:0 0 2px rgba(0,0,0,0.8)', 'transform-origin:1px 20px',
    ].join(';');
    // 4획을 45° 간격으로 중심에서 바깥쪽에 배치 (translate로 안쪽 여백을 둔다)
    t.style.transform = `rotate(${45 + i * 90}deg) translateY(-6px)`;
    root.appendChild(t);
    ticks.push(t);
  }
  document.body.appendChild(root);

  let timer = null;
  function show(part) {
    const head = part === 'head';
    for (const t of ticks) {
      t.style.background = head ? '#ffd24a' : '#ffffff';
      t.style.height = head ? '10px' : '7px';
    }
    root.style.opacity = '1';
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { root.style.opacity = '0'; timer = null; }, SHOW_MS);
  }

  return { root, show };
}
