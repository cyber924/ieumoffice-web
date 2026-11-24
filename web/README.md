# 마일로소프트 웹 (MiloSoft Web)

기반: [IeumOffice v0.13.2](https://github.com/pblsketch/ieumoffice/releases/tag/v0.13.2) / GenOffice · Apache-2.0

## 범위와 현재 상태
- DOCX/HWPX ZIP-XML 기반 제한 편집 (문단 및 표 셀 텍스트 수정, 다운로드)
- 신규 DOCX 문서 작성 및 기본 표 편집
- AI 선택 패널 (Firebase 인증 및 제공업체 키 연결 시 활성)
- Firebase Authentication/Firestore/Storage (환경 설정 시 활성)
- 구형 HWP 바이너리와 복잡한 레이아웃 편집은 아직 지원하지 않습니다.
- 원본 Electron 기반 편집기 전체 이식이 아니라 별도의 웹 호환 어댑터입니다.
- 파일 형식 완전 호환을 보장하지 않습니다. 원본을 보관하고 Word/한컴에서 재확인하세요.

## 개발
cd web
npm install
npm run build
npm run dev

Vercel Root Directory: web, Framework: Vite, Output Directory: dist.

## 연결에 필요한 Vercel 환경 변수 (미설정 시 해당 기능 비활성)
브라우저용 Firebase: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID, VITE_FIREBASE_STORAGE_BUCKET

서버용 Firebase Admin: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY

모델 키: OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY. 선택적으로 OPENAI_MODEL, GEMINI_MODEL, CLAUDE_MODEL.

서버 키에 VITE_ 접두사를 절대 사용하지 마세요. 사용자 인증은 Firebase ID 토큰 검증으로 처리합니다. 공개 서비스 전에는 요청 할당량, 레이트리밋과 업로드 보안 검사 등을 추가해야 합니다.

Firebase Firestore 규칙은 users/{uid}/documents/{id} 경로를 본인만 읽고 쓰도록 제한하고, Storage 규칙은 user-files/{uid}/{id}/{filename} 경로를 본인만 읽고 쓰도록 제한하세요. 기존 프로젝트 규칙을 덮어쓰지 말고 필요한 범위만 병합하세요.


## AI 키 설정 UI
상단의 "AI 키 설정"에서는 사용자 개인의 GPT/Gemini/Claude 키를 현재 브라우저 탭 메모리에만 보관합니다. 새로고침하면 사라집니다. 평문 키를 Firestore나 localStorage에 영구 저장하지 않습니다. 필요시 운영자 공용 키를 Vercel 환경 변수 OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY로 설정하세요.

AI 서버는 Firebase ID 토큰을 Google 공개 JWKS로 확인합니다. FIREBASE_PROJECT_ID만 있으면 토큰 검증이 가능하며 서비스 계정 개인 키가 필수는 아닙니다. AI 요청에 계정별 영구 할당량·예산 통제는 아직 구현되지 않았으므로 공개 운영 전 필수입니다.

Firebase Authentication의 이메일/비밀번호 활성화, Firebase Authorized Domains, Firestore/Storage 규칙은 Firebase 콘솔에서 별도 설정해야 합니다. 클라우드 저장이 성공했다고 주장하기 전에 직접 로그인·저장·읽기 교차 검증해야 합니다.


## 문서 데이터 저장 V3

- Firestore users/{uid}/documents/{docId}: 현재 버전 메타데이터, 제목, 검색용 본문 앞 7,500자, 문자/표 통계
- Firestore users/{uid}/documents/{docId}/revisions/{revisionId}: 변경 이력과 파일 경로
- 같은 revision 아래 texts/{chunkId}와 cells/{chunkId}: 문서 전체 텍스트(10,000글자 단위), 표 셀 데이터(35개 단위)
- Storage user-files/{uid}/{docId}/{revisionId}_{fileName}: 최종 DOCX/HWPX, 덮어쓰지 않는 불변 파일 버전
- 한 번의 Firestore batch로 현재 문서 + 버전 메타데이터 + 색인 데이터를 기록. Storage 업로드 이후 DB 기록이 완료되어야 저장 완료 표시
- 내 문서: 제목·검색용 본문 미리보기 검색, 이전 버전 불러오기, AI 참고 문서 선택(최대 3개)
- AI 참고 문서는 동일한 사용자 소유 문서만 읽으며, 선택할 때만 AI 프롬프트에 전달. 이것은 모델 자체 학습이 아니라 일회성 검색 증강 문맥 제공이다.

**중요:** firestore/firestore.rules에 새 보안 규칙을 게시하지 않으면 이 버전 저장 기능이 permission-denied로 실패합니다. 기존 파일 삭제는 제공하지 않습니다. 15MB 파일 제한과 본문 16만 글자/표 셀 1,800개 제한이 있습니다.

파일 업로드와 Firestore batch는 서로 원자적 트랜잭션이 아니므로 네트워크 중단 시 드물게 고아 파일이나 오판정이 발생할 수 있습니다. 운영 단계에서는 서버 측 정리 작업과 정합성 검사가 추가로 필요합니다.

## 전문 편집 리본 및 문서 도구 (2026-11-24)
- 파일·편집·보기·입력·서식·쪽·표·도구 8개 메뉴. 원본 DOCX/HWPX의 구조 변경은 제한한다.
- 새 DOCX 문서는 기본 굵게, 기울임, 밑줄, 정렬, 일부 글꼴/크기/색, 단락 간격, A4 방향/여백, 표 병합과 셀 배경을 OOXML에 반영한다. 그림·각주·누름틀·복잡한 병합 구조는 지원하지 않는다.
- 문서 검사: 빈 표 필드, 날짜 형식, 문서 길이 등 규칙 기반 점검(외부 AI 호출 없음).
- 버전 비교: 현재 편집 화면 vs 저장된 이전 버전의 텍스트를 줄 단위로 비교. 레이아웃 비교는 지원하지 않는다.
- RAG: 로그인 사용자의 저장된 문서 메타데이터/본문 미리보기에서 키워드를 찾고, 명시적으로 고른 최대 3개 문서의 본문만 기존 AI 요청에 첨부한다. 모델 재학습이나 전체 문서 벡터 검색이 아니다.
- 기존 Firebase Auth/Firestore/Storage 경로와 보안 규칙은 변경하지 않는다. 실제 HWPX/Word 상호 호환성은 실제 샘플로 검증해야 한다.
