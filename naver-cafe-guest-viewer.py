import re
import urllib.parse
import webbrowser
import requests


HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://search.naver.com/"
}


def parse_cafe_url(cafe_url):
    """다양한 네이버 카페 URL 형태에서 클럽ID, 카페명, 글번호를 추출"""
    club_id = None
    cafe_name = None
    article_id = None

    # URL 디코딩 (이중 인코딩 처리)
    decoded = cafe_url
    for _ in range(3):
        decoded = urllib.parse.unquote(decoded)

    # 형태1: /f-e/cafes/클럽ID/articles/글번호 또는 /ca-fe/web/cafes/클럽ID/articles/글번호
    match = re.search(r'(?:m\.)?cafe\.naver\.com/(?:f-e|ca-fe/web)/cafes/(\d+)/articles/(\d+)', decoded)
    if match:
        club_id = match.group(1)
        article_id = match.group(2)
        return club_id, cafe_name, article_id

    # 형태2: /카페명/글번호
    match = re.search(r'(?:m\.)?cafe\.naver\.com/([a-zA-Z0-9_-]+)/(\d+)(?:\?|$)', decoded)
    if match:
        cafe_name = match.group(1)
        article_id = match.group(2)
        return club_id, cafe_name, article_id

    # 형태3: /카페명?iframe_url=...articleid=글번호...
    match_cafe = re.search(r'(?:m\.)?cafe\.naver\.com/([a-zA-Z0-9_-]+)\?', decoded)
    if match_cafe:
        cafe_name = match_cafe.group(1)
    # clubid, articleid 쿼리 파라미터에서 추출
    match_club = re.search(r'(?i)clubid=(\d+)', decoded)
    match_article = re.search(r'(?i)articleid=(\d+)', decoded)
    if match_club:
        club_id = match_club.group(1)
    if match_article:
        article_id = match_article.group(1)

    if article_id:
        return club_id, cafe_name, article_id

    return None, None, None


def get_cafe_info_from_article_api(club_id, article_id):
    """Article API로 카페명과 글 제목 조회 (401이어도 카페 정보는 포함됨)"""
    cafe_name = None
    title = None
    try:
        api_url = (f"https://apis.naver.com/cafe-web/cafe-articleapi/v2.1"
                   f"/cafes/{club_id}/articles/{article_id}")
        res = requests.get(api_url, headers=HEADERS, timeout=5)
        data = res.json()

        # 200 정상 응답: 글 제목 추출
        if res.status_code == 200:
            title = data.get("result", {}).get("article", {}).get("subject")
            cafe_name = data.get("result", {}).get("cafe", {}).get("cafeUrl")

        # 401 비로그인이어도 more 필드에 카페 정보가 있음
        more = data.get("result", {}).get("more", {})
        if not cafe_name and more:
            cafe_name = more.get("cafeUrl")
    except Exception:
        pass
    return cafe_name, title


def get_cafe_info_from_cafe_name(cafe_name):
    """카페명으로 페이지 접근하여 club_id를 추출"""
    club_id = None
    try:
        url = f"https://cafe.naver.com/{cafe_name}"
        res = requests.get(url, headers=HEADERS, timeout=5)
        # HTML에서 clubid 추출
        match = re.search(r'clubid["\s:=]+(\d+)', res.text, re.IGNORECASE)
        if match:
            club_id = match.group(1)
    except Exception:
        pass
    return club_id


def check_and_open_cafe_url(cafe_url):
    # URL 파싱
    club_id, cafe_name, article_id = parse_cafe_url(cafe_url)
    if not article_id:
        print("URL 형식이 맞지 않아요")
        return

    print(f"\n파싱 결과: club_id={club_id}, cafe_name={cafe_name}, article_id={article_id}")

    # club_id 없으면 카페명으로 조회 시도
    title = None
    if not club_id and cafe_name:
        print("카페 정보 조회 중...")
        club_id = get_cafe_info_from_cafe_name(cafe_name)
        if club_id:
            print(f"club_id 조회 완료: {club_id}")

    # Article API로 카페명, 글 제목 조회
    if club_id:
        print("카페 정보 조회 중...")
        api_cafe_name, title = get_cafe_info_from_article_api(club_id, article_id)
        if api_cafe_name and not cafe_name:
            cafe_name = api_cafe_name
        if cafe_name:
            print(f"카페명: {cafe_name}")
        else:
            print("카페명을 찾을 수 없음")
        if title:
            print(f"글 제목: {title}")

    # 직접 접근 URL
    if cafe_name:
        direct_url = f"https://cafe.naver.com/{cafe_name}/{article_id}"
    elif club_id:
        direct_url = f"https://cafe.naver.com/f-e/cafes/{club_id}/articles/{article_id}"
    else:
        direct_url = cafe_url

    print(f"\n직접 URL: {direct_url}")

    # 직접 접근 시도
    try:
        res = requests.get(direct_url, headers=HEADERS, timeout=5)
        if res.status_code == 200:
            html = res.text
            blocked_keywords = ["로그인", "가입", "멤버", "접근할 수 없"]
            is_blocked = any(kw in html for kw in blocked_keywords)
    
            if not is_blocked:
                print("공개 글! 바로 열게")
                webbrowser.open(direct_url)
                return
    except requests.RequestException:
        pass

    print("직접 접근 불가 - 검색 경유 시도")

    # 네이버 카페 검색 URL 생성
    if title:
        # 글 제목으로 네이버 카페 검색
        search_query = urllib.parse.quote(title)
        search_url = (f"https://section.cafe.naver.com/ca-fe/home/search/articles"
                      f"?q={search_query}")
        print(f"검색 URL (제목): {search_url}")
    elif cafe_name:
        # 카페명 + 글번호로 네이버 통합검색
        search_query = urllib.parse.quote(
            f"site:cafe.naver.com/{cafe_name} {article_id}"
        )
        search_url = f"https://search.naver.com/search.naver?query={search_query}"
        print(f"검색 URL: {search_url}")
    else:
        print("검색 URL을 생성할 수 없음")
        return

    open_yn = input("\n브라우저로 열까? (y/n): ")
    if open_yn.lower() == 'y':
        webbrowser.open(search_url)


if __name__ == "__main__":
    while True:
        url = input("\n카페 글 URL 입력 (종료: q): ").strip()
        if url.lower() == 'q':
            break
        check_and_open_cafe_url(url)
