# QC Team Workboard

제품분석팀의 개인별 업무 일정을 공유하는 **Non-GMP 업무 보조 도구**입니다.

## 주요 기능

- Supabase 이메일/비밀번호 로그인
- 직원별·날짜별 주간 일정 보기
- 선택 날짜의 전체 업무 보기
- 업무 등록, 수정, 삭제
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
