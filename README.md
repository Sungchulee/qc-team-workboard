# QC Team Workboard

제품분석팀의 개인별 업무 일정을 공유하는 **Non-GMP 업무 보조 도구**입니다.

## 주요 기능

- Supabase 이메일/비밀번호 로그인
- 직원별·날짜별 주간 일정 보기
- 팀 전체 화면에서 표시할 담당자 복수 선택 및 브라우저별 선택 유지
- 선택 날짜의 전체 업무 보기
- 업무 등록, 수정, 삭제
- 담당자 이름을 클릭해 날짜 미정 업무, 일정 배정 업무, 완료 업무 조회
- 담당자별 매일 루틴 업무의 업무명·내용 등록, 수정, 삭제 (주간 일정과 별도)
- 완료 업무는 접힌 상태로 시작하며 20건씩 더 보기로 조회
- 날짜 미정 업무 등록 후 예정일을 지정해 주간 일정으로 이동
- 업무 카드 드래그로 날짜와 담당자 변경
- 상태 및 검색 필터
- 관리자/일반 사용자 권한 분리
- 변경이력 자동 저장

공식 시험기록, 시험 결과 및 GMP 데이터는 LIMS와 관련 기록서에서 관리합니다.

## 환경변수

`.env.example`을 참고해 다음 값을 설정합니다.

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Supabase의 `secret` 키나 `service_role` 키는 브라우저용 환경변수에 넣지 않습니다.

## 로컬 실행

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
```

## 데이터베이스

`supabase/schema.sql`을 Supabase SQL Editor에서 실행합니다. 직원 계정은 Supabase Dashboard의 Authentication > Users에서 생성합니다.

기존 운영 데이터베이스에는 배포 전에 `supabase/migrations/20261021_task_backlog.sql`을
Supabase SQL Editor에서 한 번 실행합니다. 기존 업무 데이터는 삭제되지 않으며,
`tasks.scheduled_date`에 NULL을 허용해 날짜 미정 업무를 저장합니다.

매일 루틴 기능은 `supabase/migrations/20261021_daily_routines.sql`을 SQL Editor에서
한 번 실행해야 사용할 수 있습니다. 기존 업무를 매일 복제하지 않고, 담당자별 반복 업무
목록을 별도로 보관합니다.
