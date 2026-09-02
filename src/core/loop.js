// 프레임 루프. 매 프레임 onFrame(dt)를 호출한다. dt는 초 단위, 탭 전환 등으로 튀는 값은 0.1초로 제한.
export function startLoop(onFrame) {
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    onFrame(dt);
  }
  requestAnimationFrame(frame);
}
