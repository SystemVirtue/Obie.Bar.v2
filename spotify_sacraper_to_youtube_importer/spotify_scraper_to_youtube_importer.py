import tkinter as tk
from tkinter import scrolledtext, messagebox, simpledialog
import os
import json
import time
import re
import threading

# --- API Libraries (excluding Spotify) ---
import musicbrainzngs
from ytmusicapi import YTMusic
import requests # Retained for MusicBrainz API calls if needed, and general HTTP

# --- CONFIGURATION ---
# MusicBrainz: Set a descriptive user agent
MUSICBRAINZ_APP_NAME = "SpotifyPlaylistImporter"
MUSICBRAINZ_APP_VERSION = "0.1"
MUSICBRAINZ_CONTACT_EMAIL = "your_email@example.com" # Optional, but good practice

LOCAL_ARTIST_DB_FILE = "Update_local_Artist.JSON"
MUSICBRAINZ_API_URL = "https://musicbrainz.org/ws/2/"

# --- API CLIENTS ---
# Spotify client is removed
ytmusic = None

def initialize_apis():
    global ytmusic
    try:
        musicbrainzngs.set_useragent(MUSICBRAINZ_APP_NAME, MUSICBRAINZ_APP_VERSION, MUSICBRAINZ_CONTACT_EMAIL)
        ytmusic = YTMusic()
        return True
    except Exception as e:
        messagebox.showerror("API Init Error", f"Failed to initialize APIs: {e}")
        return False

# --- HELPER FUNCTIONS (mostly unchanged) ---
def log_message(text_area, message):
    text_area.insert(tk.END, message + "\n")
    text_area.see(tk.END)
    print(message)

def load_json_file(filepath, default_data=None):
    if default_data is None: default_data = {}
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f: return json.load(f)
        except json.JSONDecodeError:
            log_message(app.log_area, f"Warning: Corrupted JSON file {filepath}. Starting with empty data.")
            return default_data
    return default_data

def save_json_file(filepath, data):
    try:
        with open(filepath, 'w', encoding='utf-8') as f: json.dump(data, f, indent=4)
    except Exception as e:
        log_message(app.log_area, f"Error saving JSON {filepath}: {e}")

def sanitize_filename(name):
    return "".join(c for c in name if c.isalnum() or c in (' ', '_')).rstrip()

# --- SPOTIFY SCRAPING FUNCTION (NEEDS IMPLEMENTATION) ---
def scrape_spotify_playlist_data(playlist_url, text_area_log):
    """
    Placeholder function to scrape Spotify playlist data.
    THIS FUNCTION NEEDS TO BE IMPLEMENTED USING A ROBUST SCRAPING METHOD (e.g., Selenium).
    A simple requests.get() will likely NOT work due to JavaScript loading.

    Should return:
        - playlist_name (str): The name of the playlist.
        - tracks (list of dicts): [{'title': 'Song Title', 'artist': 'Artist Name'}, ...]
    Or None, None if scraping fails.
    """
    log_message(text_area_log, f"Attempting to scrape Spotify playlist: {playlist_url}")
    log_message(text_area_log, "INFO: Spotify scraping is complex and this function is a placeholder.")
    log_message(text_area_log, "You need to implement the actual scraping logic here, likely using Selenium or Playwright.")

    # --- START OF EXAMPLE CONCEPTUAL IMPLEMENTATION (highly simplified) ---
    # This is where you would put your Selenium code.
    # Example (conceptual - will NOT work as is and requires Selenium setup):
    #
    # from selenium import webdriver
    # from selenium.webdriver.common.by import By
    # from selenium.webdriver.support.ui import WebDriverWait
    # from selenium.webdriver.support import expected_conditions as EC
    #
    # playlist_name_from_scraper = "Scraped Playlist Name" # Get this from the page title or a header
    # scraped_tracks = []
    #
    # try:
    #     # Configure your WebDriver (e.g., ChromeDriver)
    #     # options = webdriver.ChromeOptions()
    #     # options.add_argument('--headless') # Optional: run browser in background
    #     # driver = webdriver.Chrome(options=options)
    #     # driver.get(playlist_url)
    #
    #     # YOU MUST IDENTIFY THE CORRECT CSS SELECTORS FOR SPOTIFY'S WEB PLAYER
    #     # These selectors will change if Spotify updates their site.
    #     # Example: Wait for track rows to be loaded
    #     # wait = WebDriverWait(driver, 20) # Wait up to 20 seconds
    #     # track_rows_selector = "div[data-testid='tracklist-row']" # This is a GUESS - inspect Spotify page
    #     # track_elements = wait.until(EC.presence_of_all_elements_located((By.CSS_SELECTOR, track_rows_selector)))
    #
    #     # playlist_name_element_selector = "h1" # GUESS for playlist name
    #     # playlist_name_from_scraper = driver.find_element(By.CSS_SELECTOR, playlist_name_element_selector).text
    #
    #     # for track_element in track_elements:
    #     #     try:
    #     #         # song_title_selector = ".track-name-class" # GUESS
    #     #         # artist_name_selector = ".artist-name-class" # GUESS
    #     #         # title = track_element.find_element(By.CSS_SELECTOR, song_title_selector).text
    #     #         # artist = track_element.find_element(By.CSS_SELECTOR, artist_name_selector).text
    #     #         # scraped_tracks.append({'title': title, 'artist': artist})
    #     #         # log_message(text_area_log, f"  Scraped: {title} - {artist}")
    #     #         pass # Replace with actual scraping logic
    #     #     except Exception as e:
    #     #         log_message(text_area_log, f"  Error scraping individual track: {e}")
    #     # driver.quit()
    #     log_message(text_area_log, "  Scraping simulation: returning dummy data. Implement real scraping.")
    #     # For testing the rest of the script, you can return dummy data:
    if "7DgPQwzEoUVfQYBiMLER9Z" in playlist_url: # Specific dummy for your test URL
        playlist_name_from_scraper = "Rock (Scraped)"
        scraped_tracks = [
            {'title': 'One More Light', 'artist': 'Linkin Park'},
            {'title': 'Numb', 'artist': 'Linkin Park'},
            {'title': 'November Rain', 'artist': 'Guns N\' Roses'},
            {'title': 'An Unfindable Song For Testing', 'artist': 'A Fictional Artist'}
        ]
        log_message(text_area_log, f"  Returning DUMMY data for playlist {playlist_name_from_scraper} to allow testing.")
        return playlist_name_from_scraper, scraped_tracks
    #
    # except Exception as e:
    #     log_message(text_area_log, f"  ERROR during scraping attempt: {e}")
    #     return None, None
    # --- END OF EXAMPLE CONCEPTUAL IMPLEMENTATION ---

    log_message(text_area_log, "  Scraping not implemented. Returning no data.")
    return None, [] # Default: return no data if not implemented or fails

# --- MUSICBRAINZ & YOUTUBE FUNCTIONS (mostly unchanged) ---
def api_request_with_retry(session_or_client, method_name, *args, **kwargs):
    # ... (same as before, ensure it's here if you copy-pasted partially)
    max_retries = 3
    delay = 2  # seconds
    for attempt in range(max_retries):
        try:
            if callable(method_name):
                response = method_name(*args, **kwargs)
            elif hasattr(session_or_client, method_name):
                method_to_call = getattr(session_or_client, method_name)
                response = method_to_call(*args, **kwargs)
                response.raise_for_status()
                return response.json()
            else:
                raise ValueError("Invalid session_or_client or method_name")
            return response
        except musicbrainzngs.NetworkError as e:
            log_message(app.log_area, f"  -> MB Network error: {e}. Retrying ({attempt+1}/{max_retries})...")
            time.sleep(delay * (attempt + 1))
        except musicbrainzngs.ResponseError as e:
            log_message(app.log_area, f"  -> MB Response error: {e}. Likely artist not found or bad query.")
            return None
        except requests.exceptions.RequestException as e:
            log_message(app.log_area, f"  -> HTTP Request error: {e}. Retrying ({attempt+1}/{max_retries})...")
            time.sleep(delay * (attempt + 1))
        except Exception as e:
            log_message(app.log_area, f"  -> Unexpected API error: {e}. Attempt {attempt+1}/{max_retries}.")
            time.sleep(delay * (attempt + 1))
    log_message(app.log_area, f"  -> ERROR: API call failed after {max_retries} retries.")
    return None

def get_mbid(artist_name, text_area_log):
    log_message(text_area_log, f"  1. Finding MusicBrainz ID (MBID) for: {artist_name}")
    time.sleep(1) # MusicBrainz rate limit
    try:
        result = musicbrainzngs.search_artists(artist=artist_name, limit=1)
    except Exception as e:
        log_message(text_area_log, f"    -> ERROR during MBID lookup for '{artist_name}': {e}")
        return None

    if result and result.get('artist-list'):
        artist_info = result['artist-list'][0]
        if isinstance(artist_info, dict) and 'id' in artist_info:
            mbid = artist_info['id']
            log_message(text_area_log, f"    -> Found MBID: {mbid}")
            return mbid
        else:
            log_message(text_area_log, f"    -> ERROR: Unexpected structure for artist entry in MB response.")
    else:
        log_message(text_area_log, f"    -> ERROR: No valid artists found for '{artist_name}'.")
    return None

def search_youtube_music_for_song(song_title, artist_name, text_area_log):
    query = f"{song_title} {artist_name}"
    log_message(text_area_log, f"  Searching YouTube Music for: '{query}'")
    try:
        search_results = ytmusic.search(query, filter="songs")
        if search_results:
            video_id = search_results[0].get('videoId')
            title = search_results[0].get('title')
            if video_id:
                log_message(text_area_log, f"    -> Found on YT Music: '{title}' (ID: {video_id})")
                return video_id, title
        search_results_videos = ytmusic.search(query, filter="videos")
        if search_results_videos:
            video_id = search_results_videos[0].get('videoId')
            title = search_results_videos[0].get('title')
            if video_id:
                log_message(text_area_log, f"    -> Found Video on YT Music: '{title}' (ID: {video_id})")
                return video_id, title
    except Exception as e:
        log_message(text_area_log, f"    -> ERROR searching YouTube Music: {e}")
    log_message(text_area_log, f"    -> No direct match found on YouTube Music for '{query}'.")
    return None, None

# --- CORE LOGIC (MODIFIED TO USE SCRAPED DATA) ---
def process_playlist(playlist_url, text_area_log, local_artist_db):
    # Step 1 & 2: Scrape playlist data instead of using Spotify API
    playlist_name_from_scraper, tracks = scrape_spotify_playlist_data(playlist_url, text_area_log)

    if not tracks: # Changed from playlist_id check
        log_message(text_area_log, f"Failed to scrape or no tracks found for URL: {playlist_url}")
        return

    playlist_name = sanitize_filename(playlist_name_from_scraper or "Scraped Spotify Playlist")
    log_message(text_area_log, f"\nProcessing Scraped Playlist: {playlist_name}")

    output_json_filename = f"{playlist_name}_IMPORTEDJSON.json"
    imported_yt_video_ids = {}

    for track_item in tracks:
        song_title = track_item.get('title')
        artist_name = track_item.get('artist')

        if not song_title or not artist_name:
            log_message(text_area_log, "  Skipping track with missing title or artist from scraper.")
            continue
            
        log_message(text_area_log, f"\n Scraped Song: '{song_title}' by '{artist_name}'")
        found_youtube_id = None
        found_youtube_title = None

        mbid = None
        for existing_mbid, data in local_artist_db.items():
            if data.get("name", "").lower() == artist_name.lower():
                mbid = existing_mbid
                log_message(text_area_log, f"  Found cached MBID for {artist_name}: {mbid}")
                break
        if not mbid:
             mbid = get_mbid(artist_name, text_area_log)

        if mbid and mbid in local_artist_db:
            artist_videos = local_artist_db[mbid].get("youtube_videos", {})
            for yt_title, yt_id in artist_videos.items():
                if song_title.lower() in yt_title.lower() or yt_title.lower() in song_title.lower():
                    log_message(text_area_log, f"  5. Matched Spotify title with known YouTube video from local DB: '{yt_title}' (ID: {yt_id})")
                    found_youtube_id = yt_id
                    found_youtube_title = yt_title
                    break
            
        if not found_youtube_id:
            log_message(text_area_log, "  6. No match in local DB or MBID not found/videos not listed. Searching YouTube Music.")
            found_youtube_id, found_youtube_title = search_youtube_music_for_song(song_title, artist_name, text_area_log)

        if found_youtube_id:
            log_message(text_area_log, f"  SUCCESS: Found YouTube equivalent: '{found_youtube_title}' (ID: {found_youtube_id})")
            imported_yt_video_ids[f"{song_title} by {artist_name}"] = found_youtube_id
            
            if mbid:
                if mbid not in local_artist_db:
                    local_artist_db[mbid] = {"name": artist_name, "youtube_videos": {}}
                elif "name" not in local_artist_db[mbid]:
                     local_artist_db[mbid]["name"] = artist_name
                if song_title not in local_artist_db[mbid]["youtube_videos"]:
                    local_artist_db[mbid]["youtube_videos"][song_title] = found_youtube_id
                    log_message(text_area_log, f"    Added '{song_title}': {found_youtube_id} to local artist DB for {artist_name} ({mbid})")
                save_json_file(LOCAL_ARTIST_DB_FILE, local_artist_db)
        else:
            log_message(text_area_log, f"  FAILURE: No valid YouTube equivalent found for '{song_title}' by '{artist_name}'.")
        
        time.sleep(0.1) # Small delay between processing songs from scraped list

    save_json_file(output_json_filename, imported_yt_video_ids)
    log_message(text_area_log, f"\nPlaylist processing complete. Results saved to: {output_json_filename}")
    log_message(text_area_log, f"Total songs with YouTube IDs: {len(imported_yt_video_ids)}")


def start_processing_thread():
    if not initialize_apis(): # This no longer initializes Spotify
        return

    playlist_urls_text = app.url_input.get("1.0", tk.END).strip()
    if not playlist_urls_text:
        messagebox.showwarning("Input Error", "Please enter Spotify Playlist URLs.")
        return

    playlist_urls = [url.strip() for url in playlist_urls_text.splitlines() if url.strip()]
    if not playlist_urls:
        messagebox.showwarning("Input Error", "No valid URLs entered.")
        return
    
    app.process_button.config(state=tk.DISABLED)
    app.log_area.delete("1.0", tk.END)
    
    local_artist_db = load_json_file(LOCAL_ARTIST_DB_FILE)

    def run_processing():
        for url in playlist_urls:
            process_playlist(url, app.log_area, local_artist_db)
            app.root.update_idletasks()
        
        save_json_file(LOCAL_ARTIST_DB_FILE, local_artist_db)
        log_message(app.log_area, "\n--- ALL PROCESSING FINISHED ---")
        messagebox.showinfo("Complete", "All playlists processed (or attempted via scraping). Check logs and output files.")
        app.process_button.config(state=tk.NORMAL)

    thread = threading.Thread(target=run_processing)
    thread.daemon = True
    thread.start()

# --- GUI SETUP (unchanged from previous version) ---
class Application:
    def __init__(self, root):
        self.root = root
        root.title("Spotify Scraper to YouTube Importer") # Title changed slightly
        root.geometry("700x500")

        input_frame = tk.Frame(root, pady=10)
        input_frame.pack(fill=tk.X)
        tk.Label(input_frame, text="Spotify Playlist URLs (one per line):").pack(side=tk.LEFT, padx=5)
        self.url_input = scrolledtext.ScrolledText(input_frame, height=5, width=60)
        self.url_input.pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)
        self.url_input.insert(tk.END, "https://open.spotify.com/playlist/7DgPQwzEoUVfQYBiMLER9Z\n") # Example

        self.process_button = tk.Button(input_frame, text="Process Playlists", command=start_processing_thread)
        self.process_button.pack(side=tk.LEFT, padx=5)

        log_frame = tk.Frame(root, pady=5)
        log_frame.pack(fill=tk.BOTH, expand=True)
        tk.Label(log_frame, text="Log Output:").pack(anchor=tk.W)
        self.log_area = scrolledtext.ScrolledText(log_frame, wrap=tk.WORD, state=tk.NORMAL)
        self.log_area.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        log_message(self.log_area, "Spotify Scraper to YouTube Importer Initialized.")
        log_message(self.log_area, "INFO: Spotify data extraction relies on a scraping function YOU MUST IMPLEMENT.")
        log_message(self.log_area, f"Local artist database will be read/written to: {LOCAL_ARTIST_DB_FILE}")


if __name__ == "__main__":
    main_root = tk.Tk()
    app = Application(main_root)
    # Removed the Spotify credential check
    main_root.mainloop()