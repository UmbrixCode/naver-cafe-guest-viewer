// ============================================================
// background.js - 백그라운드 서비스 워커
// 확장 프로그램의 핵심 로직을 담당한다.
// popup.js에서 메시지를 받아 URL을 분석하고 결과를 돌려준다.
// ============================================================


// ------------------------------------------------------------
// parseCafeUrl(cafeUrl)
// 네이버 카페 URL을 받아서 클럽ID, 카페명, 글번호를 추출한다.
//
// 네이버 카페 URL은 3가지 형태가 있다:
//   형태1: https://cafe.naver.com/f-e/cafes/29657201/articles/1859
//   형태2: https://cafe.naver.com/cafename/1859
//   형태3: https://cafe.naver.com/cafename?iframe_url=...clubid=29657201&articleid=1859...
//
// 반환값: { clubId, cafeName, articleId } 객체
// ------------------------------------------------------------
function parseCafeUrl(cafeUrl) {
  let clubId = null;     // 카페 고유 숫자 ID (예: 29657201)
  let cafeName = null;   // 카페 영문 이름 (예: cafename)
  let articleId = null;  // 게시글 번호 (예: 1859)

  // URL 디코딩 - 인코딩된 특수문자를 원래 문자로 변환
  // 예: %2F → /, %3D → =
  // 이중/삼중 인코딩된 경우가 있어서 3번 반복한다
  let decoded = cafeUrl;
  for (let i = 0; i < 3; i++) {
    decoded = decodeURIComponent(decoded);
  }

  // ---- 형태1 매칭 ----
  // URL 예시: https://cafe.naver.com/f-e/cafes/29657201/articles/1859
  //           https://m.cafe.naver.com/ca-fe/web/cafes/29657201/articles/1955
  // 정규식 설명:
  //   (?:m\.)?        → "m." 이 있어도 되고 없어도 됨 (모바일 URL 대응)
  //   cafe\.naver\.com → cafe.naver.com 문자열 (점은 \.로 이스케이프)
  //   (?:f-e|ca-fe\/web) → /f-e/ 또는 /ca-fe/web/ 경로 (모바일 웹 형태 대응)
  //   \/cafes\/       → /cafes/ 경로
  //   (\d+)           → 숫자 1개 이상을 캡처 → 클럽ID
  //   \/articles\/    → /articles/ 경로
  //   (\d+)           → 숫자 1개 이상을 캡처 → 글번호
  let match = decoded.match(/(?:m\.)?cafe\.naver\.com\/(?:f-e|ca-fe\/web)\/cafes\/(\d+)\/articles\/(\d+)/);
  if (match) {
    // match[1] = 첫 번째 괄호 캡처 = 클럽ID
    // match[2] = 두 번째 괄호 캡처 = 글번호
    return { clubId: match[1], cafeName: null, articleId: match[2] };
  }

  // ---- 형태2 매칭 ----
  // URL 예시: https://cafe.naver.com/cafename/1859
  // 정규식 설명:
  //   ([a-zA-Z0-9_-]+) → 영문, 숫자, 밑줄, 하이픈으로 된 카페명 캡처
  //   \/(\d+)          → /글번호 캡처
  //   (?:\?|$)         → 뒤에 ?가 오거나 문자열 끝이어야 함
  //                      (다른 경로가 더 이어지는 경우를 제외하기 위해)
  match = decoded.match(/(?:m\.)?cafe\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)(?:\?|$)/);
  if (match) {
    return { clubId: null, cafeName: match[1], articleId: match[2] };
  }

  // ---- 형태3 매칭 ----
  // URL 예시: https://cafe.naver.com/cafename?iframe_url=...clubid=29657201&articleid=1859...
  // 카페명, clubid, articleid를 각각 따로 추출한다

  // 카페명 추출: cafe.naver.com/ 뒤의 영문 이름 (? 앞까지)
  const matchCafe = decoded.match(/(?:m\.)?cafe\.naver\.com\/([a-zA-Z0-9_-]+)\?/);
  if (matchCafe) {
    cafeName = matchCafe[1];
  }

  // clubid 추출: "clubid=숫자" 패턴 찾기
  // /i 플래그 = 대소문자 구분 없이 매칭 (clubId, ClubID 등 모두 매칭)
  const matchClub = decoded.match(/clubid=(\d+)/i);
  // articleid 추출: "articleid=숫자" 패턴 찾기
  const matchArticle = decoded.match(/articleid=(\d+)/i);

  if (matchClub) clubId = matchClub[1];
  if (matchArticle) articleId = matchArticle[1];

  // 글번호(articleId)가 있으면 유효한 URL로 판단하고 반환
  if (articleId) {
    return { clubId, cafeName, articleId };
  }

  // 어떤 형태에도 매칭되지 않으면 null 반환
  return { clubId: null, cafeName: null, articleId: null };
}


// ------------------------------------------------------------
// getCafeInfoFromArticleApi(clubId, articleId)
// 네이버 카페 Article API를 호출하여 카페명과 글 제목을 가져온다.
//
// 이 API는 로그인하지 않으면 401 에러를 반환하지만,
// 에러 응답에도 카페 기본 정보(cafeUrl 등)가 포함되어 있다.
// 이 특성을 활용해서 카페명을 알아낸다.
//
// 반환값: { cafeName, title }
// ------------------------------------------------------------
async function getCafeInfoFromArticleApi(clubId, articleId) {
  let cafeName = null;  // 카페 영문 이름
  let title = null;     // 게시글 제목
  try {
    // 네이버 카페 게시글 API 호출
    const apiUrl = `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${clubId}/articles/${articleId}`;
    const res = await fetch(apiUrl);    // HTTP GET 요청
    const data = await res.json();      // JSON으로 파싱

    // 정상 응답(200)이면 글 제목과 카페명 추출
    if (res.ok) {
      // ?. = optional chaining (값이 없으면 에러 대신 undefined 반환)
      // || null = undefined이면 null로 대체
      title = data?.result?.article?.subject || null;
      cafeName = data?.result?.cafe?.cafeUrl || null;
    }

    // 401 비로그인 에러여도 "more" 필드에 카페 정보가 포함됨
    // 예: { result: { more: { cafeUrl: "cafename", ... } } }
    const more = data?.result?.more;
    if (!cafeName && more) {
      cafeName = more.cafeUrl || null;
    }
  } catch (e) {
    // 네트워크 에러 등은 무시 (결과가 null로 반환됨)
  }
  return { cafeName, title };
}


// ------------------------------------------------------------
// getClubIdFromCafeName(cafeName)
// 카페 영문 이름만 알고 클럽ID를 모를 때,
// 카페 메인 페이지의 HTML에서 clubid를 추출한다.
//
// 예: "cafename" → 카페 페이지 HTML에서 "clubid=29657201" 찾기
//
// 반환값: 클럽ID 문자열 또는 null
// ------------------------------------------------------------
async function getClubIdFromCafeName(cafeName) {
  try {
    const url = `https://cafe.naver.com/${cafeName}`;
    const res = await fetch(url);       // 카페 메인 페이지 요청
    const html = await res.text();      // HTML 텍스트로 받기

    // HTML 소스에서 clubid 값 추출
    // 정규식 설명:
    //   clubid      → "clubid" 문자열
    //   ["\s:=]+    → 따옴표, 공백, 콜론, 등호 중 1개 이상
    //   (\d+)       → 숫자 캡처 (이것이 클럽ID)
    //   /i          → 대소문자 무시
    // 매칭 예시: clubid="29657201", clubid: 29657201, clubid=29657201
    const match = html.match(/clubid["\s:=]+(\d+)/i);
    if (match) return match[1];
  } catch (e) {
    // 네트워크 에러 등은 무시
  }
  return null;
}


// ------------------------------------------------------------
// processUrl(cafeUrl)
// 메인 처리 함수. 위의 함수들을 조합하여 최종 결과를 만든다.
//
// 처리 흐름:
//   1. URL 파싱 → clubId, cafeName, articleId 추출
//   2. clubId가 없으면 cafeName으로 조회
//   3. Article API로 카페명, 글 제목 조회
//   4. 검색 경유 URL 생성
//   5. 결과 반환
//
// 반환값: { success, clubId, cafeName, articleId, title, searchUrl, directUrl }
// ------------------------------------------------------------
async function processUrl(cafeUrl) {
  // 1단계: URL에서 정보 추출
  const parsed = parseCafeUrl(cafeUrl);
  let { clubId, cafeName, articleId } = parsed;

  // 글번호를 못 찾으면 유효하지 않은 URL
  if (!articleId) {
    return { success: false, message: "URL 형식이 맞지 않아요" };
  }

  // 2단계: clubId가 없고 cafeName만 있으면, cafeName으로 clubId 조회
  if (!clubId && cafeName) {
    clubId = await getClubIdFromCafeName(cafeName);
  }

  // 3단계: clubId가 있으면 Article API로 카페명과 글 제목 조회
  let title = null;
  if (clubId) {
    const info = await getCafeInfoFromArticleApi(clubId, articleId);
    // API에서 카페명을 가져왔고, 아직 cafeName을 모르면 채워넣기
    if (info.cafeName && !cafeName) cafeName = info.cafeName;
    title = info.title;
  }

  // 4단계: 검색 경유 URL 생성
  let searchUrl = null;
  if (title) {
    // 글 제목을 알면 → 네이버 카페 통합 검색에서 제목으로 검색
    const query = encodeURIComponent(title);
    searchUrl = `https://section.cafe.naver.com/ca-fe/home/search/articles?q=${query}`;
  } else if (cafeName) {
    // 제목을 모르면 → 네이버 통합검색에서 카페명+글번호로 검색
    const query = encodeURIComponent(`site:cafe.naver.com/${cafeName} ${articleId}`);
    searchUrl = `https://search.naver.com/search.naver?query=${query}`;
  }

  // 5단계: 결과 반환
  return {
    success: true,
    clubId,
    cafeName,
    articleId,
    title,
    searchUrl,
    // 직접 접근 URL (카페명이 있으면 간결한 형태, 없으면 f-e 형태)
    directUrl: cafeName
      ? `https://cafe.naver.com/${cafeName}/${articleId}`
      : `https://cafe.naver.com/f-e/cafes/${clubId}/articles/${articleId}`
  };
}


// ------------------------------------------------------------
// 메시지 리스너
// popup.js에서 { action: "process", url: "..." } 메시지를 보내면
// processUrl()을 실행하고 결과를 응답으로 돌려준다.
//
// return true = "응답을 비동기로 보내겠다"는 의미
// (processUrl이 async 함수라 API 호출 완료까지 기다려야 하므로)
// ------------------------------------------------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "process") {
    processUrl(request.url).then(sendResponse);
    return true;  // 비동기 응답을 위해 반드시 true 반환
  }
});
