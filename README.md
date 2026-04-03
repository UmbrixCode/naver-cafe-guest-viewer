# naver-cafe-guest-viewer

네이버 카페 비가입 글 검색 경유 조회 도구

## 기능
- 다양한 네이버 카페 URL 형태 파싱 (일반, iframe, f-e 등)
- Article API로 카페명/글 제목 자동 조회
- 직접 접근 불가 시 검색 경유 URL 생성 및 브라우저 열기

## 구성

| 폴더 | 설명 | 사용 환경 |
|------|------|-----------|
| `naver-cafe-guest-viewer.py` | Python CLI 버전 | PC (터미널) |
| `Chrome-Extension/` | 크롬 확장 프로그램 | PC (Chrome 브라우저) |
| `web/` | 모바일 웹 페이지 | 모바일 (iPhone 등 확장 미지원 환경) |

## Python CLI

```bash
pip install requests
python naver-cafe-guest-viewer.py
```

카페 글 URL을 입력하면 공개 여부를 확인하고, 비공개일 경우 검색 경유 URL을 생성합니다.

### 빌드 (exe)
```bash
pip install pyinstaller
pyinstaller --onefile --console naver-cafe-guest-viewer.py
```
`dist/naver-cafe-guest-viewer.exe` 파일이 생성됩니다.

## Chrome 확장 프로그램

1. Chrome 주소창에 `chrome://extensions` 입력
2. 우측 상단 **개발자 모드** 활성화
3. **압축 해제된 확장 프로그램을 로드합니다** 클릭
4. `Chrome-Extension` 폴더 선택

네이버 카페 페이지에서 확장 아이콘을 클릭하면 현재 탭의 URL을 자동 감지하여 조회합니다.

## 웹 페이지

iPhone 등 크롬 확장을 사용할 수 없는 환경에서 카페 글 URL을 붙여넣으면 검색 경유 링크를 생성합니다.
