// 재장전 링 (T51). 재장전 중 조준원 바로 바깥에 굵은 흰 호가 12시에서 시작해 시계 방향으로 감기고,
// 재장전이 끝나는 순간 한 바퀴가 된다. 진행도는 shooter.state.reloadProgress(0~1, 아니면 null)를 매 프레임 받는다.
//   - SVG 원 하나에 stroke-dasharray = 둘레, dashoffset = 둘레 × (1 − p). svg 전체를 −90° 돌려 12시 시작.
//   - 반지름 = 조준원 반지름 + GAP. 조준원이 커지면(퍼짐) 같이 커진다. 값이 바뀔 때만 DOM을 만진다.
//   - 아래에 어두운 테두리 원(항상 전체)을 깔아 밝은 배경에서도 읽히게 한다.
const GAP = 4;          // 조준원 선과 호 사이 (px). 히트마커 GAP 2보다 바깥
const WIDTH = 3;        // 호 굵기 (px)
const SIZE = 400;       // svg 한 변 (px). 조준원 반지름 상한(퍼짐 최대 × FOV)보다 넉넉하게

export function createReloadRing() {
  const NS = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('id', 'reloadRing');
  el.setAttribute('width', SIZE); el.setAttribute('height', SIZE);
  el.setAttribute('viewBox', `${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`);
  el.style.cssText = [
    'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%) rotate(-90deg)',
    'pointer-events:none', 'z-index:5', 'overflow:visible',
  ].join(';');
  const back = document.createElementNS(NS, 'circle');   // 어두운 테두리 (전체 원)
  back.setAttribute('fill', 'none'); back.setAttribute('stroke', 'rgba(0,0,0,0.45)'); back.setAttribute('stroke-width', WIDTH + 2);
  const arc = document.createElementNS(NS, 'circle');    // 흰 진행 호
  arc.setAttribute('fill', 'none'); arc.setAttribute('stroke', '#fff'); arc.setAttribute('stroke-width', WIDTH); arc.setAttribute('stroke-linecap', 'butt');
  el.appendChild(back); el.appendChild(arc);
  // 주의: SVG 요소는 HTML의 hidden 속성이 듣지 않는다(SVGElement에 hidden 없음) → display로 켜고 끈다
  el.style.display = 'none';
  document.body.appendChild(el);

  const state = { progress: null, radius: -1, visible: false };
  let lastR = -1, lastOff = -1, circ = 0;

  // progress: 0~1 또는 null(재장전 아님 → 숨김). ringRadius: 조준원 반지름(px)
  function set(progress, ringRadius) {
    const p = typeof progress === 'number' && progress >= 0 ? Math.min(1, progress) : null;
    state.progress = p;
    if (p === null) { if (state.visible) { state.visible = false; el.style.display = 'none'; } return; }
    if (!state.visible) { state.visible = true; el.style.display = ''; }
    const r = Math.max(4, ringRadius) + GAP;
    if (Math.abs(r - lastR) >= 0.1) {
      lastR = r; state.radius = r; circ = 2 * Math.PI * r;
      back.setAttribute('r', r); arc.setAttribute('r', r);
      arc.setAttribute('stroke-dasharray', circ);
      lastOff = -1;
    }
    const off = circ * (1 - p);
    if (Math.abs(off - lastOff) >= 0.05) { lastOff = off; arc.setAttribute('stroke-dashoffset', off); }
  }

  return { el, arc, state, set, GAP };
}
