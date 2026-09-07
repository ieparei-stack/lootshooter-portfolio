// 조절 수치 모음. 단계가 진행되면서 이동·감도·무기 관련 값이 여기에 추가된다.
export const config = {
  render: {
    fov: 75,                    // 지향 FOV. SPEC 확정 90 → 75 (T35, 사용자 설계 2026-09-07 — 같은 각도가 90에서는 25% 작아 보여 반동 체감이 덜 산다. 단계 종료 시 SPEC 갱신)
    adsFov: 59,                 // 정조준 FOV 기본값 — 무기에 ads.fov가 없을 때만 쓴다 (T35부터 무기별 필드. TBD #2 종결)
    near: 0.1,
    far: 500,
    backgroundColor: 0x9fc3e0,  // 하늘색
    maxPixelRatio: 2,
  },
  ground: {
    size: 440,                  // 한 변 길이 (m). 보스 방 z −208까지 덮는다 (T33에서 구역 2가 10 m 길어짐. T26 420, T17 120)
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
    hpMax: 1000,                // T24 사용자 결정. 자동 회복 없음
    respawnTime: 2,             // 사망 → 같은 자리 부활까지 (s, 사용자 결정)
    deathEyeHeight: 0.4,        // 사망 중 눈높이 (m, 임시 수치)
  },
  mouse: {
    sensitivity: 8.0,           // °/100px (SPEC 확정, 시뮬레이터와 동일 단위)
    sensitivityMin: 1,          // 슬라이더 범위 (SPEC 확정)
    sensitivityMax: 30,
    sensitivityStep: 0.5,
    pitchLimit: 89,             // 위아래 최대 각도 (임시 수치)
  },
  // T30 총기 뷰모델 (그레이박스). 전부 Claude 임시 수치 — 보고 조정. 위치는 뷰모델 카메라(원점) 기준 m, +x 오른쪽 / +y 위 / -z 앞
  viewModel: {
    fov: 60,                    // 뷰모델 전용 카메라 FOV (본 카메라 FOV와 무관 — 정조준 확대에 총이 커지지 않게)
    scale: 0.7,                 // 총 전체 크기 배율 (화면 오른쪽 아래 탄약 표시와 겹치지 않게)
    hip: { x: 0.17, y: -0.15, z: -0.50 },   // 지향 위치
    ads: { x: 0, y: -0.09, z: -0.36 },      // 정조준 위치 (ads.ease로 보간)
    hipYaw: 4,                  // 지향 시 총구를 화면 중앙 쪽으로 트는 각도 (°). 정조준에서는 0
    kickBack: 0.06,             // 발사 시 뒤로 밀리는 거리 (m / 반동 1°)
    kickPitch: 8,               // 발사 시 총구 들림 (° / 반동 1°)
    kickYaw: 6,                 // 발사 시 좌우 틀림 (° / 수평 반동 1°)
    kickReturn: 14,             // 반동 복귀 속도 (지수 감쇠, 1/s)
    dipDepth: 0.25,             // 재장전·전환 때 내려가는 깊이 (m)
    swapTime: 0.35,             // 무기 전환 연출 길이 (s). 사격을 막지 않는 순수 연출
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
    boss: {                       // T26 사용자 결정: 큰 원거리형, HP 20000, 조준선 2개, HP 50%부터 근접형 2마리씩 소환. 나머지 임시
      hp: 20000,
      speed: 2,
      damage: 15,               // 조준선 하나당 (동시 2발 = 30)
      aimDelay: 1.0,
      preferDist: 18,
      retreatDist: 8,
      fireRange: 40,
      cooldown: 2.0,
      summonHpRatio: 0.5,       // 이 비율 이하부터 소환
      summonCount: 2,           // 한 번에
      summonInterval: 10,       // 소환 간격 (s)
      summonMax: 4,             // 살아있는 소환수 상한
    },
  },
  // 4단계 트리거 존 + 웨이브 (T23). 웨이브 구성 자체는 stage/waves.js 코드에 둔다.
  wave: {                       // 트리거 위치는 방마다 (stage/arena.js room.triggerZ = 앞벽 안쪽 0.5m)
    firstDelay: 2,              // 발동 후 첫 웨이브까지 (s) — Claude 임시 수치
    betweenDelay: 5,            // 웨이브 처치 후 다음 웨이브까지 (s) — 사용자 결정
  },
};
