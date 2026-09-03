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

// 키보드 눌림 상태. 포인터 락이 걸려 있을 때만 입력을 받는다.
//   isDown(code | [codes])  — 지금 눌려 있는가 (e.code 기준: 'KeyW', 'ShiftLeft' ...)
//   onPress(code, fn)       — 누르는 순간 1회 호출 (자동 반복 무시). 토글 키용
export function createKeyboard(mouseLook) {
  const down = new Set();
  const pressHandlers = new Map();

  document.addEventListener('keydown', (e) => {
    if (!mouseLook.isLocked()) return;
    if (!e.repeat) {
      const fn = pressHandlers.get(e.code);
      if (fn) fn();
    }
    down.add(e.code);
  });

  document.addEventListener('keyup', (e) => {
    down.delete(e.code);
  });

  // 잠금이 풀리면 눌림 상태를 전부 초기화 (풀린 뒤에도 계속 걸어가는 사고 방지)
  document.addEventListener('pointerlockchange', () => {
    if (!mouseLook.isLocked()) down.clear();
  });

  function isDown(code) {
    if (Array.isArray(code)) return code.some((c) => down.has(c));
    return down.has(code);
  }

  function onPress(code, fn) {
    pressHandlers.set(code, fn);
  }

  return { isDown, onPress };
}

// 마우스 휠 (T16 무기 순환 전환). 포인터 락 중에만 받고, deltaY 부호만 쓴다: 아래로 굴림 = +1, 위로 = −1.
export function createMouseWheel(mouseLook, onStep) {
  document.addEventListener('wheel', (e) => {
    if (!mouseLook.isLocked()) return;
    e.preventDefault();
    if (e.deltaY === 0) return;
    onStep(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
}

// 마우스 버튼 눌림 상태 (0 = 좌, 2 = 우). 포인터 락 중에만 받고, 풀리면 초기화.
// T06: 우클릭 유지 = 정조준 FOV 미리보기. T11 ADS, T12 사격이 그대로 쓴다.
export function createMouseButtons(mouseLook) {
  const down = new Set();

  document.addEventListener('mousedown', (e) => {
    if (!mouseLook.isLocked()) return;
    down.add(e.button);
  });
  document.addEventListener('mouseup', (e) => {
    down.delete(e.button);
  });
  document.addEventListener('contextmenu', (e) => {
    if (mouseLook.isLocked()) e.preventDefault();
  });
  document.addEventListener('pointerlockchange', () => {
    if (!mouseLook.isLocked()) down.clear();
  });

  return { isDown: (button) => down.has(button) };
}
