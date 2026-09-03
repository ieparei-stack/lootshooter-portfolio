// 프레임 루프. 매 프레임 onFrame(dt)를 호출한다. dt는 초 단위.
// 탭 전환 등으로 튀는 값은 0.1초로 제한하고, 첫 프레임의 타임스탬프가 시작 시각보다
// 앞서는 경우(브라우저가 프레임 시각을 먼저 잡음)를 대비해 0 아래로는 내려가지 않게 한다.
export function startLoop(onFrame) {
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
    last = now;
    onFrame(dt);
  }
  requestAnimationFrame(frame);
}
