import * as THREE from 'three';

// 탄자국. 작은 원판을 맞은 면의 법선 방향으로 살짝 띄워 붙인다. 풀을 순환 재사용한다.
// T18(탄착군 시각화)이 풀 크기 조절과 지우기 키를 붙인다.
export function createImpactMarks(scene, poolSize = 200) {
  const geo = new THREE.CircleGeometry(0.03, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide });
  const pool = [];
  for (let i = 0; i < poolSize; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    scene.add(m);
    pool.push(m);
  }
  let next = 0;
  const state = { count: 0 };
  const tmp = new THREE.Vector3();

  function add(point, normal) {
    const m = pool[next];
    next = (next + 1) % pool.length;
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

  return { state, add, clear, pool };
}
