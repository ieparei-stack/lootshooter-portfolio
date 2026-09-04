// 조절 수치 모음. 단계가 진행되면서 이동·감도·무기 관련 값이 여기에 추가된다.
export const config = {
  render: {
    fov: 90,                    // 지향 FOV (SPEC 확정)
    adsFov: 59,                 // 정조준 FOV — TBD #2. 초기값은 시뮬레이터 1.77배 환산값, 사용자가 슬라이더로 확정
    near: 0.1,
    far: 500,
    backgroundColor: 0x9fc3e0,  // 하늘색
    maxPixelRatio: 2,
  },
  ground: {
    size: 120,                  // 한 변 길이 (m). 사격장 z −55까지 덮는다 (T17)
    color: 0x8a8a8a,            // 회색
  },
  player: {
    eyeHeight: 1.7,             // 서있을 때 눈높이 (SPEC 확정)
    crouchEyeHeight: 1.0,       // 웅크렸을 때 눈높이 (SPEC 확정)
    walkSpeed: 5.5,             // m/s (SPEC 확정)
    sprintMul: 1.5,             // 질주 배율, 앞으로 갈 때만 (SPEC 확정)
    crouchMul: 0.5,             // 웅크리기 배율 (SPEC 확정)
    accelTime: 0.08,            // 정지→최고속도 도달 시간 (초, 임시 수치)
    decelTime: 0.10,            // 최고속도→정지 시간 (초, 임시 수치)
    crouchBlendTime: 0.12,      // 눈높이 1.7↔1.0 전환 시간 (초, 임시 수치)
    radius: 0.35,               // 충돌 반지름 (m, 임시 수치)
  },
  mouse: {
    sensitivity: 8.0,           // °/100px (SPEC 확정, 시뮬레이터와 동일 단위)
    sensitivityMin: 1,          // 슬라이더 범위 (SPEC 확정)
    sensitivityMax: 30,
    sensitivityStep: 0.5,
    pitchLimit: 89,             // 위아래 최대 각도 (임시 수치)
  },
  // 4단계 몬스터 (T22). 인터뷰 확정: HP·근접 속도·조준선 딜레이는 슬라이더로 조절 (기본값 사용자 결정).
  // 나머지는 Claude 임시 수치 — 데모 안정화까지 자유 조정 (CLAUDE.md 3-2).
  monster: {
    aggroRange: 30,             // 인지 거리 (m). 시야가 있어야 함. 맞으면 즉시 인지
    radius: 0.4,                // 충돌 반지름 (m)
    melee: {
      hp: 3000,                 // 사용자 결정 (레버)
      speed: 7,                 // m/s, 사용자 결정 (레버). 걷기 5.5보다 빠름
      damage: 15,
      reach: 1.8,               // 공격 시작 거리 (m, 중심 간)
      hitRange: 2.2,            // 준비 끝난 순간 이 거리 안이면 명중
      windup: 0.35,             // 공격 준비 (s)
      cooldown: 1.2,            // 공격 후 다음 공격까지 (s)
    },
    ranged: {
      hp: 2000,                 // 사용자 결정 (레버)
      speed: 4,
      damage: 10,
      aimDelay: 0.8,            // 조준선이 보인 뒤 발사까지 (s). 사용자: 레버로 조절
      preferDist: 15,           // 이 거리까지 접근해 정지
      retreatDist: 6,           // 이보다 가까우면 물러남
      fireRange: 25,            // 이 거리 안 + 시야 있으면 조준 시작
      cooldown: 1.5,            // 발사 후 다음 조준까지 (s)
    },
  },
};
