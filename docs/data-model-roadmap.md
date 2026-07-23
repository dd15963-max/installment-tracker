# 지출노트 2·3단계 데이터 모델 제안

현재 1단계는 기존 installment-tracker-data, recurring-expenses, version 3 JSON을 그대로 유지한다. 아래 필드는 즉시 저장하지 않고 다음 백업 버전을 도입할 때 명시적인 마이그레이션과 함께 추가한다.

## 2단계

### 고정지출 월별 예외

RecurringExpense에 선택 필드 monthlyOverrides를 추가한다.

- month: YYYY-MM
- excluded: 해당 월만 예산에서 제외
- expectedAmount: 해당 월의 예상 금액 변경
- actualAmount: 실제 청구 금액
- paidAt: 실제 납부 확인 시각
- memo: 해당 월 메모

기존 항목은 빈 배열로 간주한다. 기본 금액과 활성 기간을 먼저 적용한 뒤 월별 예외를 덮어쓰는 순서로 계산한다.

### 미래 변경 예약

RecurringExpense에 scheduledChanges 배열을 추가한다.

- effectiveMonth
- 변경할 amount, paymentDay, enabled
- createdAt

같은 월에 여러 변경이 있으면 마지막 생성 항목을 적용한다.

### 정산 완료 관리

월·참여자별 SettlementRecord를 별도 localStorage 키에 저장한다.

- id
- month
- participantId
- expectedAmount
- settledAmount
- settledAt
- memo

원본 할부·고정지출은 변경하지 않고 정산 상태만 별도 기록해 과거 계산을 안전하게 유지한다.

### 참여자 내부 ID

설정에 participants 배열을 두고 id, displayName, isMe, archivedAt을 저장한다. 기존 문자열 참여자는 가져오기 시 이름별 임시 ID를 생성하되, 중복 이름은 사용자 확인을 거친다.

## 3단계

- 분할 방식: equal, ratio, fixed
- 항목별 참여자 지분: participantId, ratio 또는 amount
- 알림 설정과 마지막 발송 기록
- 서비스 워커 캐시 버전
- 선택적 클라우드 동기화용 revision, deviceId, deletedAt

## 마이그레이션 원칙

1. version 3과 구형 배열 백업은 계속 읽는다.
2. 새 필드는 모두 선택 필드로 시작한다.
3. version 4 내보내기를 도입하기 전 migrateV3ToV4를 별도 함수로 작성한다.
4. 가져오기 미리보기에서 변환 건수와 누락 필드를 먼저 보여준다.
5. 마이그레이션 전 현재 데이터를 자동 백업한다.
