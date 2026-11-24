# MiloSoft 작업 브랜치 변경사항

브랜치: `work/table-alignment-ai-fix`  
프로덕션 반영: **보류**. `main` 병합 또는 수동 운영 배포 금지.

## 한글/HWPX 가져오기 개선

- HWPX 문단에 포함된 표와 텍스트를 원래 출현 순서대로 렌더링
- `cellSpan colSpan/rowSpan`, `cellAddr`, 일부 셀 너비 읽기
- 표 안 텍스트의 중복 렌더링을 줄이고, 미지원 개체를 경고로 표시
- 가져온 문서는 텍스트 수정만 허용. 행·열 구조 변경 및 새 이미지 삽입 제한
- 원본 HWPX의 XML·미디어를 그대로 유지해 저장하는 것을 기본으로 함
- 구형 바이너리 HWP는 미지원. 실제 사용자 파일로 복잡한 셀 배치와 머리글 등을 검증해야 함

## 새 DOCX 편집 기능

- PNG/JPEG 그림 파일 삽입 (3MB 이하)
- 사각형, 둥근 사각형, 타원, 삼각형, 화살표 삽입 (PNG 변환)
- Noto Sans KR, Noto Serif KR, 나눔고딕, 나눔명조 등 글꼴 선택. PC에서 폰트가 없으면 대체 표시 가능
- 문자표에서 기호·수학기호·단위·원문자 등 삽입
- 새 DOCX 내보내기에서 `word/media`와 `word/_rels/document.xml.rels`를 생성해 이미지를 DrawingML로 포함
- 도형은 DOCX 내에서 **그림**으로 저장됨. Word 도형처럼 개별 편집할 수 있는 것은 아님
- 웹폰트는 글꼴 이름을 DOCX에 기록하되, 글꼴 파일을 문서에 포함하지 않음

## 검사와 한계

- 브랜치 GitHub Actions: `node --check`, HWPX 병합 표 회귀, DOCX PNG 포함 회귀, Vite 빌드
- 고객이 올린 화면은 참고 이미지이며 실제 HWPX 바이트가 없으므로 원본 문서와의 픽셀 단위 비교는 아직 미수행
- Storage/Firestore 경로·보안 규칙은 변경하지 않음
