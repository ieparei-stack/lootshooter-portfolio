// 원(반지름 radius, 중심 pos{x,z}) 대 박스 목록 충돌.
// 높이는 무시한다 — 모든 블록을 무한히 높은 기둥으로 취급 (점프 없음, 상자 위로 올라가지 않음).
// pos를 제자리에서 밀어내고, 충돌한 면의 법선 목록을 돌려준다.
// 플레이어뿐 아니라 4단계 몬스터 이동에도 같은 함수를 쓴다.
//
// blocks 항목: { pos: [x, y, z], size: [w, h, d] }  (testRoom.js BLOCKS 형식)

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function resolveCircleVsBlocks(pos, radius, blocks, passes = 2) {
  const normals = [];
  const r2 = radius * radius;

  for (let pass = 0; pass < passes; pass++) {
    for (const b of blocks) {
      const minX = b.pos[0] - b.size[0] / 2, maxX = b.pos[0] + b.size[0] / 2;
      const minZ = b.pos[2] - b.size[2] / 2, maxZ = b.pos[2] + b.size[2] / 2;

      // 박스 안에서 원 중심에 가장 가까운 점
      const cx = clamp(pos.x, minX, maxX);
      const cz = clamp(pos.z, minZ, maxZ);
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r2) continue;

      let nx, nz, push;
      if (d2 > 1e-12) {
        // 바깥에서 겹침: 가장 가까운 점에서 멀어지는 방향으로
        const d = Math.sqrt(d2);
        nx = dx / d; nz = dz / d; push = radius - d;
      } else {
        // 중심이 박스 안: 네 면 중 가장 가까운 면으로
        const dl = pos.x - minX, dr = maxX - pos.x, db = pos.z - minZ, df = maxZ - pos.z;
        const m = Math.min(dl, dr, db, df);
        if (m === dl)      { nx = -1; nz = 0; push = dl + radius; }
        else if (m === dr) { nx = 1;  nz = 0; push = dr + radius; }
        else if (m === db) { nx = 0;  nz = -1; push = db + radius; }
        else               { nx = 0;  nz = 1;  push = df + radius; }
      }

      pos.x += nx * push;
      pos.z += nz * push;
      normals.push({ x: nx, z: nz });
    }
  }
  return normals;
}
