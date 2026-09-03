const DEG = Math.PI / 180;

// 조준선 = 화면 중앙의 원(링). 반지름이 현재 퍼짐의 실제 화면 크기와 같다 — 탄이 떨어질 수 있는 범위 그대로.
// px = tan(spread) / tan(fov/2) × (화면 높이 / 2). FOV가 바뀌면 같은 각도가 다른 픽셀이 된다.
export function spreadToPixels(spreadDeg, fovDeg, screenHeight) {
  return Math.tan(spreadDeg * DEG) / Math.tan((fovDeg / 2) * DEG) * (screenHeight / 2);
}

export function createCrosshair() {
  const ring = document.createElement('div');
  ring.id = 'crosshair';
  ring.style.cssText = [
    'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
    'border:1.5px solid rgba(255,255,255,0.9)', 'border-radius:50%',
    'box-shadow:0 0 0 1px rgba(0,0,0,0.5)', 'pointer-events:none', 'z-index:5',
    'width:8px', 'height:8px',
  ].join(';');
  document.body.appendChild(ring);

  let lastR = -1;
  function set(spreadDeg, fovDeg) {
    const r = Math.max(2, spreadToPixels(spreadDeg, fovDeg, window.innerHeight));
    if (Math.abs(r - lastR) < 0.1) return;
    lastR = r;
    ring.style.width = ring.style.height = (r * 2) + 'px';
  }

  return { ring, set };
}
