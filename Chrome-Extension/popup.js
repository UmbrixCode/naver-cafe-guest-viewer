// ============================================================
// popup.js - 팝업 UI 동작
// 확장 아이콘을 클릭하면 나타나는 팝업 창의 동작을 담당한다.
// URL 입력 → background.js에 처리 요청 → 결과 표시
// ============================================================

// HTML 요소 가져오기
const urlInput = document.getElementById("urlInput");     // URL 입력창
const btnProcess = document.getElementById("btnProcess"); // 조회 버튼
const statusDiv = document.getElementById("status");      // 결과 표시 영역


// ------------------------------------------------------------
// 팝업이 열릴 때 실행
// 현재 브라우저 탭이 네이버 카페 페이지면 URL을 자동으로 입력창에 넣는다.
// ------------------------------------------------------------
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  // tabs[0]?.url = 현재 활성 탭의 URL (없으면 빈 문자열)
  const url = tabs[0]?.url || "";
  if (url.includes("cafe.naver.com")) {
    urlInput.value = url;  // 카페 URL이면 자동 입력
  }
});


// ------------------------------------------------------------
// "조회" 버튼 클릭 이벤트
// 입력된 URL을 background.js에 보내서 처리 결과를 받아 화면에 표시한다.
// ------------------------------------------------------------
btnProcess.addEventListener("click", async () => {
  // 입력값 앞뒤 공백 제거
  const url = urlInput.value.trim();
  if (!url) {
    showStatus('<span class="error">URL을 입력해주세요</span>');
    return;
  }

  // 버튼을 비활성화하고 "조회 중..." 표시 (중복 클릭 방지)
  btnProcess.disabled = true;
  btnProcess.textContent = "조회 중...";
  showStatus("처리 중...");

  // background.js에 메시지 전송
  // { action: "process", url: "입력된URL" } 형태로 보내면
  // background.js의 onMessage 리스너가 받아서 처리한다.
  chrome.runtime.sendMessage({ action: "process", url }, (result) => {
    // 응답 받은 후 버튼 다시 활성화
    btnProcess.disabled = false;
    btnProcess.textContent = "조회";

    // 실패 시 에러 메시지 표시
    if (!result || !result.success) {
      showStatus(`<span class="error">${result?.message || "처리 실패"}</span>`);
      return;
    }

    // 성공 시 결과 정보 표시
    let html = "";
    if (result.cafeName) {
      html += `<span class="info-label">카페명:</span> ${result.cafeName}<br>`;
    }
    if (result.clubId) {
      html += `<span class="info-label">클럽ID:</span> ${result.clubId}<br>`;
    }
    html += `<span class="info-label">글번호:</span> ${result.articleId}<br>`;
    if (result.title) {
      html += `<span class="info-label">글제목:</span> ${result.title}<br>`;
    }

    // 버튼 영역 추가
    html += '<div class="btn-group">';
    if (result.searchUrl) {
      // 검색 경유 버튼 (비가입 카페 글을 볼 수 있는 핵심 기능)
      html += `<button class="btn-search" id="btnSearch">검색 경유로 열기</button>`;
    }
    // 직접 열기 버튼 (공개 글이면 바로 볼 수 있음)
    html += `<button class="btn-direct" id="btnDirect">직접 열기</button>`;
    html += "</div>";

    // 결과 HTML을 화면에 표시
    showStatus(html);

    // "검색 경유로 열기" 버튼 클릭 → 새 탭에서 검색 결과 페이지 열기
    document.getElementById("btnSearch")?.addEventListener("click", () => {
      chrome.tabs.create({ url: result.searchUrl });
    });
    // "직접 열기" 버튼 클릭 → 새 탭에서 카페 글 직접 열기
    document.getElementById("btnDirect")?.addEventListener("click", () => {
      chrome.tabs.create({ url: result.directUrl });
    });
  });
});


// ------------------------------------------------------------
// Enter 키를 누르면 조회 버튼 클릭과 동일하게 동작
// ------------------------------------------------------------
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnProcess.click();
});


// ------------------------------------------------------------
// showStatus(html)
// 결과 표시 영역에 HTML을 넣고 보이게 만든다.
// ------------------------------------------------------------
function showStatus(html) {
  statusDiv.innerHTML = html;           // HTML 내용 설정
  statusDiv.classList.add("show");      // CSS 클래스 추가 → display: block
}
