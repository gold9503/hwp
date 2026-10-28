# HanEditor

HWP·HWPX(아래아한글) 문서를 열고 편집하는 데스크톱 워드프로세서입니다.
React로 화면을 만들고 Electron으로 macOS(.app)·Windows(.exe) 앱으로 패키징합니다.

![아이콘](build/icon.png)

## 주요 기능

| 구분 | 기능 |
| --- | --- |
| 파일 | HWP 5.0(바이너리) / HWPX 열기, HWPX로 저장, PDF·HTML·텍스트 내보내기, 인쇄, 끌어다 놓아 열기, `.hwp`/`.hwpx` 파일 연결 |
| 편집 | 되돌리기/다시 실행, 오려 두기/복사/붙이기(그림 붙이기 포함), 찾기·찾아 바꾸기 |
| 글자 모양 | 글꼴(설치된 글꼴 목록), 크기(pt), 진하게·기울임·밑줄·취소선, 위/아래 첨자, 글자 색, 형광펜, 자간 |
| 문단 모양 | 양쪽·왼쪽·가운데·오른쪽 정렬, 왼쪽/오른쪽 여백, 들여 쓰기·내어 쓰기, 문단 위/아래 간격, 줄 간격, 글머리표·문단 번호 |
| 입력 | 표, 그림, 문자표, 날짜/시간, 하이퍼링크, 가로줄, 쪽 나누기 |
| 표 | 줄/칸 추가·삭제, 셀 합치기(오른쪽/아래)·나누기, 셀 배경색, Tab 으로 셀 이동 |
| 쪽 | 편집 용지(A4·A3·B5·Letter 등, 가로/세로, 여백), 쪽 번호(인쇄·PDF), 쪽 경계 표시 |
| 보기 | 확대/축소, 눈금자, 문단 부호, 상태 표시줄(쪽·글자 수) |

단축키는 한글과 비슷하게 맞췄습니다: `Alt+L` 글자 모양, `Alt+T` 문단 모양, `F7` 편집 용지,
`Ctrl+Enter` 쪽 나누기, `Ctrl+Alt+T` 표 만들기 등 (`F1` 로 전체 목록 확인, macOS 는 `⌘`).

## HWP 분석 내용

`src/hwp/` 에 형식별 파서가 있고, 모두 같은 **공통 문서 모델**(문단·글자 조각·표·그림)로 변환합니다.

- **HWP 5.0** (`hwp5.js`) – CFB(복합 파일) 컨테이너 안의 `FileHeader`, `DocInfo`, `BodyText/SectionN`, `BinData` 스트림을 읽습니다.
  스트림은 raw deflate 로 압축된 레코드(태그 10비트·레벨 10비트·크기 12비트 헤더) 열이며, 레벨로 트리를 만들어 해석합니다.
  - `DocInfo`: 글꼴(FACE_NAME), 글자 모양(CHAR_SHAPE), 문단 모양(PARA_SHAPE), 테두리/배경(BORDER_FILL), 그림 목록(BIN_DATA)
  - 본문: 문단(PARA_HEADER/TEXT/CHAR_SHAPE), 제어 문자(탭·줄바꿈·확장 컨트롤), 표(`tbl `), 그림·글상자(`gso `), 수식(`eqed`), 구역 정의(`secd` → 용지 크기/여백)
  - 문단 여백 값은 HWPUNIT 의 2배로 저장되어 있음을 HWPX 원본과 비교해 확인했습니다.
  - 배포용·암호 문서는 미리보기 텍스트(`PrvText`)만 보여 줍니다. HWP 3.x 이하는 지원하지 않습니다.
- **HWPX** (`hwpx.js`) – ZIP 안의 `Contents/content.hpf`(목록), `header.xml`(글꼴·글자/문단 모양·테두리), `sectionN.xml`(본문), `BinData/*`(그림)를 읽습니다.
- **저장** (`hwpx-writer.js`) – 편집한 내용을 HWPX(OWPML) 로 저장합니다. 바이너리 HWP 로 쓰기는 지원하지 않으며, HWP 문서를 저장하면 원본은 그대로 두고 `.hwpx` 로 저장합니다.

### 제한 사항

- 글 위에 띄운 개체(글상자·그림)의 절대 위치, 다단, 머리말/꼬리말, 각주, 차트·OLE 개체는 근사적으로 표시하거나 생략합니다.
- 화면은 이어진 용지에 쪽 경계선을 표시하는 방식이며, 실제 쪽 나눔은 인쇄/PDF 에서 이루어집니다.
- HWPX 저장 파일은 이 프로그램으로 다시 여는 왕복 테스트를 거쳤지만, 한컴오피스에서의 호환성은 실험적입니다.

## 실행 / 개발

```bash
npm install
npm start          # 빌드 후 Electron 으로 실행
npm run dev        # 브라우저에서 개발 서버(http://localhost:5173)로 실행
npm test           # 파서/저장 단위 테스트
```

## 빌드

```bash
npm run dist:win   # Windows: release/HanEditor-<버전>-portable.exe, -win-x64.zip
npm run dist:mac   # macOS:   release/HanEditor-<버전>-mac-x64.zip, -mac-arm64.zip (안에 HanEditor.app)
```

GitHub 에 푸시하면 `.github/workflows/build.yml` 이 macOS·Windows 러너에서 자동으로 빌드합니다.
Actions 실행 결과의 **Artifacts** 에서 `HanEditor-mac`(zip, dmg)과 `HanEditor-windows`(설치 프로그램 setup.exe, portable.exe, zip)를 받을 수 있고,
`v1.0.0` 처럼 `v` 로 시작하는 태그를 푸시하면 GitHub Release 에 자동으로 올라갑니다.

### macOS 에서 처음 실행할 때

개발자 인증서로 서명·공증하지 않은 앱이므로 처음 열 때 경고가 나옵니다.
Finder 에서 `HanEditor.app` 을 **Control+클릭 → 열기** 하거나, 터미널에서 다음을 실행하세요.

```bash
xattr -cr /Applications/HanEditor.app
```

Linux 에서 만든 macOS 빌드(서명 없음)를 Apple Silicon 에서 실행할 때 "손상되었습니다" 라고 나오면 ad-hoc 서명을 해 주세요.
(GitHub Actions 빌드는 이미 ad-hoc 서명되어 있습니다.)

```bash
codesign --force --deep --sign - /Applications/HanEditor.app
```

### Windows 에서 처음 실행할 때

서명하지 않은 실행 파일이라 SmartScreen 경고가 나오면 **추가 정보 → 실행** 을 누르세요.

## 구조

```
electron/           Electron 메인 프로세스(창·메뉴·파일 입출력·인쇄)와 preload
src/hwp/            HWP/HWPX 파서, 문서 모델 → HTML 렌더러, HWPX 저장
src/editor/         편집 명령(서식·표·찾기), 되돌리기 기록, 편집 DOM → 문서 모델
src/components/     메뉴 표시줄, 도구 상자, 대화상자
test/               단위 테스트
```

'한글', 'HWP' 는 한글과컴퓨터의 상표이며, 이 프로젝트는 한글과컴퓨터와 관련이 없습니다.
HWP 형식 해석은 한글과컴퓨터가 공개한 「한글 문서 파일 형식 5.0」 문서를 참고했습니다.
