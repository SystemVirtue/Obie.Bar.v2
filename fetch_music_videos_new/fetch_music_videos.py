# fetch_music_videos.py (Corrected Indentation/Structure)

import requests
import json
import time
import os
from urllib.parse import urlparse, parse_qs
from googleapiclient.discovery import build
from config import YOUTUBE_API_KEY, MUSICBRAINZ_DELAY, AUDIO_DB_DELAY, YOUTUBE_DELAY

# --- Configuration ---
ARTIST_FILE = "Artist_Lookup_Name.txt"
OUTPUT_FILE = "Videos_by_Artist.JSON"
YOUTUBE_THUMBNAIL_QUALITY = "default.jpg"

# --- YouTube API Configuration ---
YOUTUBE_API_SERVICE_NAME = "youtube"
YOUTUBE_API_VERSION = "v3"

# --- Configuration ---
ARTIST_FILE = "Artist_Lookup_Name.txt"
OUTPUT_FILE = "Videos_by_Artist.JSON"
YOUTUBE_THUMBNAIL_QUALITY = "default.jpg"

# --- Rate Limiting Delays (Seconds) ---
MUSICBRAINZ_DELAY = 2
AUDIO_DB_DELAY = 1

# --- API URLs and Domains ---
MUSICBRAINZ_API_URL = "https://musicbrainz.org/ws/2/artist/"
MUSICBRAINZ_DOMAIN = urlparse(MUSICBRAINZ_API_URL).netloc

# ** IMPORTANT: If you get a real API key, replace '2' below **
AUDIO_DB_BASE_URL = "https://www.theaudiodb.com/api/v1/json/2/" # Using demo key '2'

AUDIO_DB_MVID_URL = AUDIO_DB_BASE_URL + "mvid-mb.php"
AUDIO_DB_DOMAIN = urlparse(AUDIO_DB_BASE_URL).netloc

# --- User-Agent for MusicBrainz (Required) ---
HEADERS = {
    'User-Agent': 'Jukebox/0.1 ( admin@systemvirtue.com )',
    'Accept': 'application/json'
}

# --- Helper Functions ---

# api_request_with_retry with careful indentation review
def api_request_with_retry(session, url, params=None, headers=None, retries=2, timeout=20):
    """Makes an API request with retry logic, domain-specific rate limiting (applied BEFORE), and improved error handling."""
    last_exception = None
    parsed_url = urlparse(url)
    domain = parsed_url.netloc

    for attempt in range(retries + 1):
        # --- Apply Delay ---
        delay = 0
        if attempt > 0: # Don't delay before the first attempt
            if MUSICBRAINZ_DOMAIN in domain: delay = MUSICBRAINZ_DELAY
            elif AUDIO_DB_DOMAIN in domain: delay = AUDIO_DB_DELAY
            if delay > 0:
                print("  Waiting {:.1f} seconds (rate limit / retry backoff for {})...".format(delay, domain))
                time.sleep(delay)

        print("    Attempting request to {} (Params: {}) (Attempt {}/{})...".format(url, params, attempt + 1, retries + 1))
        response = None
        data = None

        # --- Try making the request ---
        try:
            response = session.get(url, params=params, headers=headers, timeout=timeout)
            response.raise_for_status() # Raise HTTPError for 4xx/5xx
            data = response.json()      # Attempt to parse JSON
            print("    -> Request successful (HTTP OK and JSON parsed).")
            return data                 # Return data on success

        # --- Handle potential errors ---
        except requests.exceptions.Timeout as e:
            last_exception = e
            print("    -> WARNING: Timeout occurred. {}".format(e))
            # Loop continues to retry

        except requests.exceptions.HTTPError as e:
            last_exception = e
            print("    -> ERROR: HTTP Error. Status: {}. {}".format(response.status_code if response else 'N/A', e))
            # Check if it's a client error (4xx) - no point retrying these
            if response and 400 <= response.status_code < 500:
                # *** Ensure these lines are indented under the 'if' ***
                print("    -> Client error ({0}), stopping retries.".format(response.status_code))
                break # Exit the retry loop

        except json.JSONDecodeError as e:
            last_exception = e
            status_code = getattr(response, 'status_code', 'N/A')
            response_text = getattr(response, 'text', '')[:500]
            print("    -> ERROR: Failed to parse JSON response from {}. Status: {}. Content: {}...".format(url, status_code, response_text))
            break # Exit loop - cannot parse response

        except requests.exceptions.RequestException as e:
            last_exception = e
            print("    -> ERROR: Request failed (Network/Connection?). {}".format(e))
            # Loop might continue depending on retry count

        # --- Check if max retries reached ---
        if attempt == retries:
            print("    -> ERROR: Max retries reached for {}.".format(url))
            break # Exit loop

    # --- If loop finished without returning data ---
    print("    -> Request ultimately failed for {} after {} attempts.".format(url, attempt + 1))
    return None # Indicate failure


# Helper function to extract YouTube Video ID
def extract_youtube_id(url):
    """Extracts the YouTube video ID from various URL formats."""
    if not url or not isinstance(url, str): return None
    try:
        parsed_url = urlparse(url)
        if parsed_url.hostname == 'youtu.be': return parsed_url.path[1:] if parsed_url.path and len(parsed_url.path) > 1 else None
        if parsed_url.hostname in ('www.youtube.com', 'youtube.com', 'm.youtube.com'):
            if parsed_url.path == '/watch': query_params = parse_qs(parsed_url.query); return query_params.get('v', [None])[0]
            if parsed_url.path.startswith('/embed/'): return parsed_url.path.split('/')[2] if len(parsed_url.path.split('/')) > 2 else None
            if parsed_url.path.startswith('/v/'): return parsed_url.path.split('/')[2] if len(parsed_url.path.split('/')) > 2 else None
    except Exception as e: print("      -> WARNING: Error parsing YouTube URL '{}': {}".format(url, e))
    return None


# --- Functions for specific API calls ---

def get_mbid(artist_name, session):
    """Queries MusicBrainz API using ARTIST NAME to find the Artist ID (MBID)."""
    print("  1. Finding MusicBrainz ID (MBID) for: {}".format(artist_name))
    params = {'query': 'artist:{}'.format(artist_name), 'fmt': 'json', 'limit': 1}
    data = api_request_with_retry(session, MUSICBRAINZ_API_URL, params=params)
    if data and isinstance(data.get('artists'), list) and data['artists']:
        artist_info = data['artists'][0]
        if isinstance(artist_info, dict):
            mbid = artist_info.get('id');
            if mbid: print("    -> Found MBID: {}".format(mbid)); return mbid
            else: print("    -> ERROR: Found artist entry in MB response but no MBID.")
        else: print("    -> ERROR: Unexpected structure for artist entry in MB response.")
    else: print("    -> ERROR: No valid artists found or API error during MBID lookup for '{}'.".format(artist_name))
    return None


def search_youtube_channel(artist_name):
    """Searches YouTube for the official artist channel."""
    print(f"  3. Searching YouTube for official artist channel: {artist_name}")
    try:
        youtube = build(YOUTUBE_API_SERVICE_NAME, YOUTUBE_API_VERSION, developerKey=YOUTUBE_API_KEY)
        
        # Search for channels
        search_response = youtube.search().list(
            q=f"{artist_name} official channel",
            type="channel",
            part="id,snippet",
            maxResults=5
        ).execute()
        
        # Filter results to find official channels
        for item in search_response.get("items", []):
            snippet = item.get("snippet", {})
            title = snippet.get("title", "")
            description = snippet.get("description", "")
            
            # Look for official channel indicators
            if any(word in title.lower() for word in ["official", "official channel", "official artist channel"]):
                channel_id = item["id"]["channelId"]
                print(f"    -> Found potential official channel: {title}")
                return {
                    "channel_id": channel_id,
                    "title": title,
                    "description": description
                }
        
        print("    -> No official channel found in search results.")
        return None
    except Exception as e:
        print(f"    -> ERROR: YouTube channel search failed: {e}")
        return None


def get_videos_audiodb(mbid, session):
    """Queries TheAudioDB API (mvid-mb.php) using MBID to find music videos."""
    print(f"  2. Finding Music Videos using MBID: {mbid}")
    if not mbid: print("    -> Skipping video lookup - missing MBID."); return []
    params = {'i': mbid}
    data = api_request_with_retry(session, AUDIO_DB_MVID_URL, params=params)
    videos_raw = []
    if data and isinstance(data.get('mvids'), list): videos_raw = data['mvids']; print(f"    -> Found {len(videos_raw)} raw video entries from TheAudioDB.")
    elif data and 'mvids' in data and data['mvids'] is None: print("    -> No videos found for this MBID on TheAudioDB ('mvids' is null).")
    else: print(f"    -> ERROR: No valid 'mvids' list received or API error during video lookup for MBID '{mbid}'.")
    return videos_raw if isinstance(videos_raw, list) else []


# --- Main Script Logic ---
def main():
    print("--- Starting Jukebox Music Video Data Collection Script ---")
    if not os.path.exists(ARTIST_FILE): 
        print("ERROR: Input file '{}' not found.".format(ARTIST_FILE))
        return
    
    print("Reading artist names from '{}'...".format(ARTIST_FILE))
    try:
        with open(ARTIST_FILE, 'r', encoding='utf-8') as f: 
            artist_names = [line.strip() for line in f if line.strip()]
        print("Found {} artist names.".format(len(artist_names)))
    except Exception as e: 
        print("ERROR: Failed to read '{}': {}".format(ARTIST_FILE, e))
        return
    if not artist_names: 
        print("ERROR: No artist names found.")
        return

    all_artist_data = []
    mbid_failures = 0
    total_videos_processed = 0
    artists_with_videos = 0
    artists_with_oac = 0
    total_artists = len(artist_names)
    last_summary_time = time.time()

    with requests.Session() as session:
        session.headers.update(HEADERS)

        for i, artist_name in enumerate(artist_names, 1):
            print("\nProcessing Artist {}/{}: {} ({:.1f}% complete)".format(i, total_artists, artist_name, i/total_artists*100))
            print("  MBID OK: {} out of {} so far".format(total_artists - mbid_failures, i))
            print("  Artists with at least 1 valid video: {} out of {}".format(artists_with_videos, i))

            mbid = None
            music_videos_list = []

            # Step 1: Get MBID
            mbid = get_mbid(artist_name, session)
            if not mbid:
                mbid_failures += 1
                all_artist_data.append({"artist_name": artist_name, "mbid": None, "music_videos": []})
                continue

            # Step 2: Get Videos via MBID
            raw_videos = get_videos_audiodb(mbid, session)

            # Step 3: Process Videos
            if raw_videos:
                print("  Found {} raw video entries for processing...".format(len(raw_videos)))
                seen_youtube_urls = set()

                for video_data in raw_videos:
                    if not isinstance(video_data, dict): continue

                    title = video_data.get('strTrack')
                    youtube_url_raw = video_data.get('strMusicVid')
                    youtube_url = None
                    video_id = None
                    final_track_thumb = None

                    # Format/Validate YouTube URL
                    if youtube_url_raw and isinstance(youtube_url_raw, str) and youtube_url_raw.strip():
                        url_to_check = youtube_url_raw.strip()
                        if url_to_check.startswith("www."): youtube_url = "https://" + url_to_check
                        elif url_to_check.lower().startswith(("http://", "https://")):
                            if url_to_check.lower().startswith("http://"): youtube_url = "https://" + url_to_check[len("http://"):]
                            else: youtube_url = url_to_check
                        elif "youtube.com" in url_to_check or "youtu.be" in url_to_check: youtube_url = "https://" + url_to_check

                    # Deduplication and Processing
                    if title and youtube_url:
                        if youtube_url not in seen_youtube_urls:
                            seen_youtube_urls.add(youtube_url)
                            video_id = extract_youtube_id(youtube_url)
                            if video_id:
                                final_track_thumb = "https://img.youtube.com/vi/{}/{}".format(video_id, YOUTUBE_THUMBNAIL_QUALITY)
                                music_videos_list.append({"title": title, "youtube_url": youtube_url, "track_thumb": final_track_thumb})
                                total_videos_processed += 1

            # Step 4: Assemble Final Artist Data
            artist_data = {"artist_name": artist_name, "mbid": mbid, "music_videos": music_videos_list}
            all_artist_data.append(artist_data)

            # Count artists with videos and check for OAC
            if music_videos_list:
                artists_with_videos += 1
            elif mbid:  # If no videos but we have a valid MBID
                oac_data = search_youtube_channel(artist_name)
                if oac_data:
                    print(f"    -> FLAG: Potential Official Artist Channel found for {artist_name}")
                    print(f"    -> Channel ID: {oac_data['channel_id']}")
                    print(f"    -> Channel Title: {oac_data['title']}")
                    print(f"    -> Channel Description: {oac_data['description']}")
                    artist_data["official_channel"] = {
                        "channel_id": oac_data["channel_id"],
                        "title": oac_data["title"],
                        "description": oac_data["description"]
                    }
                    artists_with_oac += 1

            # Print summary every 100 artists
            if i % 100 == 0 or i == total_artists:
                current_time = time.time()
                if current_time - last_summary_time >= 60:  # Print every minute
                    print("\n--- Progress Summary ---")
                    print("Artists processed: {}/{} ({:.1f}% complete)".format(i, total_artists, i/total_artists*100))
                    print("MBID failures: {}".format(mbid_failures))
                    print("Artists with videos: {}".format(artists_with_videos))
                    print("Artists with potential Official Artist Channels: {}".format(artists_with_oac))
                    print("Total videos found: {}".format(total_videos_processed))
                    print("------------------------")
                    last_summary_time = current_time

    # Step 5: Write results
    print("\n--- Writing results to '{}' ---".format(OUTPUT_FILE))
    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f: 
            json.dump(all_artist_data, f, indent=4, ensure_ascii=False)
        print("Successfully wrote JSON data.")
    except Exception as e: 
        print("ERROR: Failed to write to '{}': {}".format(OUTPUT_FILE, e))

    # Step 6: Print Summary
    print("\n--- Script Finished ---")
    print("--- Final Summary ---")
    print(f"Total Artists in Input File: {total_artists}")
    print(f"Artists Processed:           {i}")
    print(f"Failed MBID Lookups:         {mbid_failures}")
    print(f"Artists with at least 1 video: {artists_with_videos}")
    print(f"Artists with potential Official Artist Channels: {artists_with_oac}")
    print(f"Total Unique Music Videos Found: {total_videos_processed}")
    print(f"Data saved to:               {OUTPUT_FILE}")
    print("------------------------")

if __name__ == "__main__":
    main()