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
