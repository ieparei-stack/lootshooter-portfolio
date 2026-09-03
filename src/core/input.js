// 포인터 락 + 마우스 이동.
// 캔버스를 클릭하면 마우스를 잠그고, 잠금 중의 movementX/Y를 onMove(dx, dy)로 넘긴다.
// ESC 해제는 브라우저가 처리한다.
export function createMouseLook(canvas, onMove) {
  let locked = false;

  canvas.addEventListener('click', () => {
    if (!locked) canvas.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });

  document.addEventListener('pointerlockerror', () => {
    console.warn('[input] 포인터 락 실패 — 브라우저가 잠금을 거부했다.');
  });

  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    onMove(e.movementX, e.movementY);
  });

  return { isLocked: () => locked };
}
