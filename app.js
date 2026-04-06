// ============================================================
// 네이버 카페 검색 경유 뷰어 - 웹 버전
// Chrome 확장 없이 동작하는 독립형 웹 페이지
// ============================================================

const urlInput = document.getElementById("urlInput");
const btnProcess = document.getElementById("btnProcess");
const resultDiv = document.getElementById("result");


// ------------------------------------------------------------
// parseCafeUrl(cafeUrl)
// 네이버 카페 URL을 파싱하여 clubId, cafeName, articleId를 추출한다.
//
// 지원 형태:
//   형태1: https://cafe.naver.com/f-e/cafes/29657201/articles/1859
//   형태2: https://cafe.naver.com/diveplan/1859
//   형태3: https://cafe.naver.com/diveplan?iframe_url=...clubid=29657201&articleid=1859...
// ------------------------------------------------------------
function parseCafeUrl(cafeUrl) {
  let clubId = null;
  let cafeName = null;
  let articleId = null;

  // URL 디코딩 (이중/삼중 인코딩 대응)
  let decoded = cafeUrl;
  for (let i = 0; i < 3; i++) {
    decoded = decodeURIComponent(decoded);
  }

  // 형태1: /f-e/cafes/클럽ID/articles/글번호 또는 /ca-fe/web/cafes/클럽ID/articles/글번호
  let match = decoded.match(/(?:m\.)?cafe\.naver\.com\/(?:f-e|ca-fe\/web)\/cafes\/(\d+)\/articles\/(\d+)/);
  if (match) {
    return { clubId: match[1], cafeName: null, articleId: match[2] };
  }

  // 형태2: /카페명/글번호
  match = decoded.match(/(?:m\.)?cafe\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)(?:\?|$)/);
  if (match) {
    return { clubId: null, cafeName: match[1], articleId: match[2] };
  }

  // 형태3: iframe_url 파라미터에서 추출
  const matchCafe = decoded.match(/(?:m\.)?cafe\.naver\.com\/([a-zA-Z0-9_-]+)\?/);
  if (matchCafe) cafeName = matchCafe[1];

  const matchClub = decoded.match(/clubid=(\d+)/i);
  const matchArticle = decoded.match(/articleid=(\d+)/i);

  if (matchClub) clubId = matchClub[1];
  if (matchArticle) articleId = matchArticle[1];

  if (articleId) {
    return { clubId, cafeName, articleId };
  }

  return { clubId: null, cafeName: null, articleId: null };
}


// ------------------------------------------------------------
// processUrl(cafeUrl)
// URL을 파싱하고 검색 경유 URL을 생성한다.
//
// 웹 페이지에서는 CORS 제한으로 네이버 API 직접 호출이 불가하므로,
// 카페명 + 글번호 기반 검색 URL을 사용한다.
// ------------------------------------------------------------
function processUrl(cafeUrl, cafeName_override) {
  const parsed = parseCafeUrl(cafeUrl);
  let { clubId, cafeName, articleId } = parsed;

  // 카페명을 사용자가 직접 입력한 경우 덮어쓰기
  if (cafeName_override) {
    cafeName = cafeName_override;
  }

  if (!articleId) {
    return { success: false, message: "URL 형식이 맞지 않아요.\n네이버 카페 글 URL을 입력해주세요." };
  }

  // cafeName 없이 clubId만 있으면 카페명 입력 요청
  if (!cafeName && clubId) {
    return { success: true, needCafeName: true, clubId, articleId };
  }

  // 검색 경유 URL 생성
  let searchUrl = null;
  if (cafeName) {
    const query = encodeURIComponent(`site:cafe.naver.com/${cafeName} ${articleId}`);
    searchUrl = `https://search.naver.com/search.naver?query=${query}`;
  }

  // 직접 접근 URL
  const directUrl = cafeName
    ? `https://cafe.naver.com/${cafeName}/${articleId}`
    : `https://cafe.naver.com/f-e/cafes/${clubId}/articles/${articleId}`;

  return {
    success: true,
    clubId,
    cafeName,
    articleId,
    searchUrl,
    directUrl
  };
}


// ------------------------------------------------------------
// escapeHtml(str)
// XSS 방지를 위한 HTML 이스케이프
// ------------------------------------------------------------
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}


// ------------------------------------------------------------
// showResult(result)
// 처리 결과를 화면에 표시한다.
// ------------------------------------------------------------
function showResult(result) {
  if (!result.success) {
    resultDiv.innerHTML = '<div class="result-card"><p class="error-msg">'
      + result.message.replace(/\n/g, "<br>") + '</p></div>';
    resultDiv.classList.add("show");
    return;
  }

  // cafeName이 필요한 경우 입력 폼 표시
  if (result.needCafeName) {
    let html = '<div class="result-card">';
    html += '<div class="info-row"><span class="info-label">클럽ID</span>'
      + '<span class="info-value">' + escapeHtml(result.clubId) + '</span></div>';
    html += '<div class="info-row"><span class="info-label">글번호</span>'
      + '<span class="info-value">' + escapeHtml(result.articleId) + '</span></div>';
    html += '<p class="cafe-name-hint">URL에서 카페명을 찾을 수 없습니다.<br>'
      + '카페 영문 이름을 입력해주세요.</p>';
    html += '<div class="cafe-name-input-group">'
      + '<input type="text" id="cafeNameInput" class="cafe-name-input" '
      + 'placeholder="카페 영문 이름">'
      + '<button class="btn-cafe-name" id="btnCafeName">확인</button>'
      + '</div></div>';

    resultDiv.innerHTML = html;
    resultDiv.classList.add("show");

    // 카페명 입력 후 확인 버튼 클릭
    const cafeNameInput = document.getElementById("cafeNameInput");
    document.getElementById("btnCafeName").addEventListener("click", () => {
      const name = cafeNameInput.value.trim();
      if (!name) return;
      const retryResult = processUrl(urlInput.value.trim(), name);
      showResult(retryResult);
    });
    // Enter 키 지원
    cafeNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("btnCafeName").click();
    });
    cafeNameInput.focus();
    return;
  }

  let html = '<div class="result-card">';

  // 정보 표시
  if (result.cafeName) {
    html += '<div class="info-row"><span class="info-label">카페명</span>'
      + '<span class="info-value">' + escapeHtml(result.cafeName) + '</span></div>';
  }
  if (result.clubId) {
    html += '<div class="info-row"><span class="info-label">클럽ID</span>'
      + '<span class="info-value">' + escapeHtml(result.clubId) + '</span></div>';
  }
  html += '<div class="info-row"><span class="info-label">글번호</span>'
    + '<span class="info-value">' + escapeHtml(result.articleId) + '</span></div>';

  // 버튼 영역
  html += '<div class="btn-group">';
  if (result.searchUrl) {
    html += '<a class="btn-link btn-search" href="' + escapeHtml(result.searchUrl)
      + '" target="_blank" rel="noopener">검색 경유로 열기</a>';
  }
  html += '<a class="btn-link btn-direct" href="' + escapeHtml(result.directUrl)
    + '" target="_blank" rel="noopener">직접 열기</a>';
  html += '</div></div>';

  resultDiv.innerHTML = html;
  resultDiv.classList.add("show");
}


// ------------------------------------------------------------
// 이벤트 핸들러
// ------------------------------------------------------------

// 조회 버튼 클릭
btnProcess.addEventListener("click", () => {
  const url = urlInput.value.trim();
  if (!url) {
    resultDiv.innerHTML = '<div class="result-card"><p class="error-msg">URL을 입력해주세요</p></div>';
    resultDiv.classList.add("show");
    return;
  }

  const result = processUrl(url);
  showResult(result);
});

// Enter 키 지원 (모바일 키보드의 엔터)
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    btnProcess.click();
  }
});

// 붙여넣기 시 자동 조회
urlInput.addEventListener("paste", () => {
  setTimeout(() => {
    const val = urlInput.value.trim();
    if (val && val.includes("cafe.naver.com")) {
      btnProcess.click();
    }
  }, 100);
});
