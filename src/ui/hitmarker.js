// 히트마커 — 표적 명중 시 화면 중앙에 X자 4획. 몸통 = 흰색, 머리 = 빨간색 + 더 크게. (사용자 메모 2, 2026-09-06 머리 색 빨강으로)
// 4획의 회전 중심은 root 원점(= 조준원 중심). 획은 **조준원 바깥**(반지름 + 2px)에서 시작해 원이 커지면 같이 벌어진다 (사용자 결정 2026-09-06).
// show(part, ringRadiusPx): 획 길이 7(몸통)/10(머리), 안쪽 끝이 ringRadius + GAP.
const SHOW_MS = 120;
const GAP = 2;   // 조준원 선과 획 사이 (px)

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
      'background:#fff', 'box-shadow:0 0 2px rgba(0,0,0,0.8)', 'transform-origin:1px 7px',
    ].join(';');
    t.style.transform = `rotate(${45 + i * 90}deg) translateY(-6px)`;
    root.appendChild(t);
    ticks.push(t);
  }
  document.body.appendChild(root);

  let timer = null;
  function show(part, ringRadius = 4) {
    const head = part === 'head';
    const h = head ? 10 : 7;
    const d = Math.max(0, ringRadius) + GAP;   // 획 안쪽 끝 거리
    ticks.forEach((t, i) => {
      t.style.background = head ? '#ff3b3b' : '#ffffff';
      t.style.height = h + 'px';
      t.style.top = -h + 'px';
      t.style.transformOrigin = `1px ${h}px`;   // = root 원점
      t.style.transform = `rotate(${45 + i * 90}deg) translateY(${-d}px)`;
    });
    root.style.opacity = '1';
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { root.style.opacity = '0'; timer = null; }, SHOW_MS);
  }

  return { root, show };
}
