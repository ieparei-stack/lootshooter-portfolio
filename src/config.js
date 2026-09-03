// 조절 수치 모음. 단계가 진행되면서 이동·감도·무기 관련 값이 여기에 추가된다.
export const config = {
  render: {
    fov: 90,                    // 지향 FOV (SPEC 확정)
    near: 0.1,
    far: 500,
    backgroundColor: 0x9fc3e0,  // 하늘색
    maxPixelRatio: 2,
  },
  ground: {
    size: 60,                   // 한 변 길이 (m)
    color: 0x8a8a8a,            // 회색
  },
  player: {
    eyeHeight: 1.7,             // 서있을 때 눈높이 (SPEC 확정). 웅크리기 1.0은 T04에서 추가
  },
};
