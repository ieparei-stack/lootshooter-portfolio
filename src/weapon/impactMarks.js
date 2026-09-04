import * as THREE from 'three';

// 탄자국. 작은 원판을 맞은 면의 법선 방향으로 살짝 띄워 붙인다. 풀을 순환 재사용한다.
// T18 탄착군 시각화: 무기별 색(add의 3번째 인자), 풀 400개(4정 × 한 탄창 × 3번쯤 겹쳐 비교 가능),
//   가득 차면 가장 오래된 것부터 덮어쓴다. clear()는 X 키 / 패널 버튼이 부른다 (main.js).
export function createImpactMarks(scene, poolSize = 400) {
  const geo = new THREE.CircleGeometry(0.035, 12);
  const materials = new Map();   // 색 문자열 → MeshBasicMaterial (색마다 하나만 만들어 공유)
  function materialFor(color) {
    const key = color || '#1a1a1a';
    let mat = materials.get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(key), side: THREE.DoubleSide });
      materials.set(key, mat);
    }
    return mat;
  }
  const defaultMat = materialFor(null);
  const pool = [];
  for (let i = 0; i < poolSize; i++) {
    const m = new THREE.Mesh(geo, defaultMat);
    m.visible = false;
    scene.add(m);
    pool.push(m);
  }
  let next = 0;
  const state = { count: 0 };
  const tmp = new THREE.Vector3();

  // color: CSS 색 문자열('#ff4d4d'). 없으면 검정.
  function add(point, normal, color) {
    const m = pool[next];
    next = (next + 1) % pool.length;
    m.material = materialFor(color);
    m.position.set(point.x + normal.x * 0.002, point.y + normal.y * 0.002, point.z + normal.z * 0.002);
    tmp.set(point.x + normal.x, point.y + normal.y, point.z + normal.z);
    m.lookAt(tmp);   // CircleGeometry는 +Z를 향하므로 법선 쪽을 보게 한다
    m.visible = true;
    state.count = Math.min(state.count + 1, pool.length);
  }

  function clear() {
    for (const m of pool) m.visible = false;
    next = 0;
    state.count = 0;
  }

  return { state, add, clear, pool, materials };
}
