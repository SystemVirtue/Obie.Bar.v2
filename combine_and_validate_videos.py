import json
import requests
import time
from urllib.parse import quote, urlparse, parse_qs
from bs4 import BeautifulSoup

# Configuration
IMVDB_API_KEY = "g62MJ5GkeTWY2kLtrp42EKqi0j8DbSLaMiNKJic8"
IMVDB_API_URL = "https://imvdb.com/api/v1"
MAX_VIDEOS_PER_FILE = 25  # Limit for testing
FILE_A = "Original_Obie_MasterDB_SCHEMA.json"
FILE_B = "ALL_SONG_LIST_A-Z.json"

# Rate limiting setup
RATE_LIMIT = 800  # requests per minute
MIN_INTERVAL = 60.0 / RATE_LIMIT
last_request_time = 0
request_count = 0

def rate_limited_request(url, is_html=False):
    """Make a rate-limited request to IMVDB API or webpage."""
    global last_request_time, request_count
    
    elapsed = time.time() - last_request_time
    if elapsed < MIN_INTERVAL:
        time.sleep(MIN_INTERVAL - elapsed)
    
    try:
        response = requests.get(url)
        response.raise_for_status()
        last_request_time = time.time()
        request_count += 1
        return response.json() if not is_html else response.text
    except Exception as e:
        print(f"Request failed: {e}")
        return None

def extract_youtube_id(imvdb_page):
    """Extract YouTube ID from IMVDB page by scraping the iframe."""
    if not imvdb_page:
        return None
    
    try:
        # Fetch the HTML content of the IMVDB page
        html_content = rate_limited_request(imvdb_page, is_html=True)
        if not html_content:
            return None
        
        # Parse the HTML to find the YouTube iframe
        soup = BeautifulSoup(html_content, 'html.parser')
        iframe = soup.find('iframe', class_='video_embed')
        if not iframe:
            return None
        
        # Extract YouTube URL from iframe src
        youtube_url = iframe.get('src')
        if not youtube_url:
            return None
        
        # Parse YouTube video ID from URL
        parsed = urlparse(youtube_url)
        if 'youtube.com' in parsed.netloc:
            video_id = parse_qs(parsed.query).get('v', [None])[0]
        elif 'youtu.be' in parsed.netloc:
            video_id = parsed.path.split('/')[-1]
        else:
            return None
        
        return f"https://www.youtube.com/embed/{video_id}"
    except Exception as e:
        print(f"Error extracting YouTube ID from {imvdb_page}: {e}")
        return None

def get_imvdb_data(artist, song_title):
    """Query IMVDB API for a song and return relevant data."""
    try:
        # Search for the video
        search_url = f"{IMVDB_API_URL}/search/videos?q={quote(artist)}+{quote(song_title)}&access_token={IMVDB_API_KEY}"
        data = rate_limited_request(search_url)
        
        if not data or not data.get("results"):
            return {
                "IMVDBpage": None,
                "IMVDBvideo": None,
                "Validated": False,
                "Genres": None
            }

        first_result = data["results"][0]
        
        # Build IMVDB page URL
        if "url" in first_result:
            imvdb_page = first_result["url"]
        else:
            imvdb_page = f"https://imvdb.com/video/{first_result.get('song_slug', first_result['id'])}"
        
        # Get YouTube embed URL by scraping the IMVDB page
        imvdb_video = extract_youtube_id(imvdb_page)
        
        # Get genres from API
        video_id = first_result["id"]
        video_url = f"{IMVDB_API_URL}/video/{video_id}?include=genres&access_token={IMVDB_API_KEY}"
        video_data = rate_limited_request(video_url)
        
        imvdb_genres = []
        if video_data and "genres" in video_data:
            imvdb_genres = [g["name"] for g in video_data["genres"]]
        
        return {
            "IMVDBpage": imvdb_page,
            "IMVDBvideo": imvdb_video,
            "Validated": bool(imvdb_video),  # Only validated if we found a YouTube embed
            "Genres": imvdb_genres if imvdb_genres else None
        }
    except Exception as e:
        print(f"Error fetching IMVDB data for {artist} - {song_title}: {e}")
        return {
            "IMVDBpage": None,
            "IMVDBvideo": None,
            "Validated": False,
            "Genres": None
        }

# [Rest of the functions remain the same as previous version...]

def main():
    print("=== JSON Video List Combiner and Validator ===")
    print(f"Using IMVDB API key: {IMVDB_API_KEY}")
    print(f"Processing max {MAX_VIDEOS_PER_FILE} videos per file")
    
    # Install BeautifulSoup if not available
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("\nBeautifulSoup4 is required for this script. Installing now...")
        import subprocess
        subprocess.check_call(["pip", "install", "beautifulsoup4"])
        from bs4 import BeautifulSoup
    
    # [Rest of the main function remains the same...]

if __name__ == "__main__":
    main()