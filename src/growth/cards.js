// 강화 카드 데이터 (T38). 코드에 둔다 — 파일은 무기 데이터만 (CLAUDE.md 3-1).
// 무기 3종 × 카드 3장, 각 Lv 0~3. **핵심/보조 구분 없음** — 사용자 CSV 확정 2026-09-07. 카드 순서 = CSV 순 (T39 선택 화면도 이 순서).
//
// 카드 = { name, desc: [Lv0, Lv1, Lv2, Lv3 문구], effects: { 효과키: [Lv0, Lv1, Lv2, Lv3] } }
// 효과키 두 종류 (growth.js가 나눠 처리):
//   수치 — 최종값 = 튜닝값 × 배율. effective 무기 객체에 반영되어 반동·퍼짐·정조준·피해·탄창이 자동으로 읽는다
//     headshotMul  헤드샷 배율 ×        rpm  RPM ×        mag  탄창 ×(반올림)        reloadTime  재장전 ×
//     adsTime      ads.time ×           recoilV  v0·vG·vMax(curve) / arr 수직(array) ×  — 반동 바닥값 40 %
//     recoilH      hMax·h0(curve) / arr 수평(array) ×                                    — 반동 바닥값 40 %
//   행동 — effective.perks에 실린다. shooter · movement · viewModel이 읽는다
//     headshotRefund  헤드샷 명중 시 탄약 환급 (발)          breakFree       정지 상태 첫 N발 퍼짐 0
//     breakSpreadMul  퍼짐 전체 배율 (브레이킹 Lv3 · 총열 개조. 곱으로 합성)  killResetBloom  처치 시 bloom 초기화 (T45 이후 쓰는 카드 없음)
//     killDamageBuff  처치 후 5 s 피해 +비율                  enhancedEvery   N발째마다 피해 ×2 (0 = 없음)
//     killAmmo        처치 시 탄약 (숫자 = +N발, 'full' = 가득, 'free' = 10 s 무한)
//     adsKickMul      정조준 중 뷰모델 반동 연출 ×             adsMoveFree     정조준 이동 페널티 없음
// 지원하지 않는 효과키 · 단계 배열 길이 ≠ 4 → 경고 배지 + 그 카드만 무시 (growth.validateCards).

export const MAX_LEVEL = 3;
export const CARD_COUNT = 3;
export const BUFF_SECONDS = { damage: 5, freeAmmo: 10 };   // 멀티킬 피해 버프 · 장탄수 회복 Lv3 (사용자 CSV)

export const CARDS = {
  cs: [
    {
      name: '헤드헌터',
      desc: ['—', '헤드샷 피해 300%', '헤드샷 피해 400% + 헤드샷 시 탄약 1발 환급', '헤드샷 피해 500% + 헤드샷 시 탄약 2발 환급'],
      effects: { headshotMul: [1, 1.5, 2.0, 2.5], headshotRefund: [0, 0, 1, 2] },   // 원본 2.0 → 3.0 / 4.0 / 5.0 (T53 사용자 결정 2026-09-07, 이전 3.5/5/7)
    },
    {
      name: '브레이킹',
      desc: ['—', '정지 시 첫 3발 퍼짐 없음', '정지 시 첫 5발 퍼짐 없음', '정지 시 첫 5발 퍼짐 없음 + 퍼짐 −50%'],
      effects: { breakFree: [0, 3, 5, 5], breakSpreadMul: [1, 1, 1, 0.5] },
    },
    {
      name: '총열 개조',   // T45 (사용자 결정 2026-09-07): 멀티킬 → 탄퍼짐 감소. 지향·이동·연사 누적 전부에 곱한다 (조준원도 같이 줄어든다)
      desc: ['—', '탄퍼짐 −15%', '탄퍼짐 −30%', '탄퍼짐 −50%'],
      effects: { breakSpreadMul: [1, 0.85, 0.70, 0.50] },
    },
  ],
  pubg: [
    {
      name: '반동 제어',
      desc: ['—', '수직 반동 −15%', '수직 반동 −30% · 수평 반동 −10%', '수직 반동 −50% · 수평 반동 −33%'],
      effects: { recoilV: [1, 0.85, 0.70, 0.50], recoilH: [1, 1, 0.90, 0.67] },
    },
    {
      name: '탄창 개조',
      desc: ['—', '장탄수 +40%', '장탄수 +40% · 재장전 시간 −33%', '장탄수 +40% · 재장전 시간 −50%'],
      effects: { mag: [1, 1.4, 1.4, 1.4], reloadTime: [1, 1, 0.67, 0.5] },
    },
    {
      name: '조준 보정',
      desc: ['—', '조준 속도 +40%', '조준 속도 +40% · 총구 흔들림 −33%', '조준 속도 +40% · 총구 흔들림 −33% · 정조준 중 이동 페널티 없음'],
      effects: { adsTime: [1, 1 / 1.4, 1 / 1.4, 1 / 1.4], adsKickMul: [1, 1, 0.67, 0.67], adsMoveFree: [false, false, false, true] },
    },
  ],
  d2: [
    {
      name: '속사',
      desc: ['—', '연사 속도 +10%', '연사 속도 +33%', '연사 속도 +50%'],
      effects: { rpm: [1, 1.10, 1.33, 1.50] },
    },
    {
      name: '강화탄 사격',
      desc: ['—', '5발마다 2배 강한 강화탄 발사', '3발마다 2배 강한 강화탄 발사', '2발마다 2배 강한 강화탄 발사'],
      effects: { enhancedEvery: [0, 5, 3, 2] },
    },
    {
      name: '장탄수 회복',
      desc: ['—', '적 처치 시 장탄수 10 회복', '적 처치 시 장탄수 모두 회복', '적 처치 시 10초간 탄약이 소모되지 않음'],
      effects: { killAmmo: [0, 10, 'full', 'free'] },
    },
  ],
};

// 효과 한 줄 (성장 탭·T39 카드 공용)
export function cardDesc(card, lv) { return card.desc[Math.max(0, Math.min(MAX_LEVEL, lv))]; }
