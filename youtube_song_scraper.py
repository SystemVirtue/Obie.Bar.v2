import json
import requests
from bs4 import BeautifulSoup
import time
import random
import re
import urllib.parse # For URL encoding the search query

# --- Configuration ---
INPUT_JSON_FILE = "ALL_SONG_LIST_A-Z.json"
OUTPUT_JSON_FILE = "ALL_SONG_LIST_A-Z_with_youtube_scraped.json"
# Add a delay between requests to be nicer to YouTube's servers and reduce block chance
# Increase this if you encounter issues (e.g., 3-5 seconds)
MIN_DELAY_SECONDS = 1.5
MAX_DELAY_SECONDS = 3.0
# Mimic a browser's User-Agent header
REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}
# --- End Configuration ---

def scrape_youtube_search(query):
    """
    Scrapes the YouTube search results page for a query and attempts to
    extract the Video ID and Thumbnail URL of the first video result.

    Args:
        query (str): The search query (e.g., "Artist SongTitle").

    Returns:
        tuple: (video_id, thumbnail_url) or (None, None) if not found or error.
    """
    search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote_plus(query)}"
    print(f"  -> Searching: {search_url}")

    try:
        response = requests.get(search_url, headers=REQUEST_HEADERS, timeout=15) # Added timeout
        response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)

        soup = BeautifulSoup(response.text, 'html.parser')

        # --- Find video data ---
        # YouTube often embeds data in a script tag within a variable like ytInitialData
        # This is *highly* likely to break if YouTube changes its structure.
        scripts = soup.find_all('script')
        data_script = None
        for script in scripts:
            if script.string and 'var ytInitialData = ' in script.string:
                data_script = script.string
                break

        if not data_script:
            print("  -> Could not find the expected script tag containing ytInitialData. YouTube structure may have changed.")
            return None, None

        # Extract the JSON part from the script tag content
        # This is fragile string manipulation
        try:
            json_str = data_script.split('var ytInitialData = ')[1]
            # Remove trailing semicolon if it exists
            if json_str.endswith(';'):
                json_str = json_str[:-1]
            data = json.loads(json_str)
        except (IndexError, json.JSONDecodeError) as e:
             print(f"  -> Error parsing ytInitialData JSON: {e}. Structure may have changed.")
             return None, None

        # Navigate the complex JSON structure to find video results
        # This path is based on current observations and WILL BREAK if changed by YouTube
        video_id = None
        thumbnail_url = None
        try:
            # Look for video results within the primary contents
            contents = data['contents']['twoColumnSearchResultsRenderer']['primaryContents']
            item_section = None

            # Find the section containing video results (can be 'sectionListRenderer' or 'richGridRenderer')
            if 'sectionListRenderer' in contents:
                 item_section = contents['sectionListRenderer']['contents'][0]['itemSectionRenderer']['contents']
            elif 'richGridRenderer' in contents: # For grid layouts sometimes seen
                 item_section = contents['richGridRenderer']['contents']
            else:
                 print("  -> Could not find 'sectionListRenderer' or 'richGridRenderer' in primaryContents.")
                 return None, None

            # Iterate through items to find the first 'videoRenderer'
            first_video_renderer = None
            for item in item_section:
                if 'videoRenderer' in item:
                    first_video_renderer = item['videoRenderer']
                    break # Found the first video

            if first_video_renderer:
                video_id = first_video_renderer.get('videoId')
                # Get a decent quality thumbnail
                thumbnails = first_video_renderer.get('thumbnail', {}).get('thumbnails', [])
                if thumbnails:
                    # Try finding 'hqdefault' like quality, fall back to others
                    best_thumb = thumbnails[-1] # Often highest quality is last
                    for thumb in thumbnails:
                         # Look for a common pattern or just take the last one
                         if 'hqdefault' in thumb.get('url', ''):
                             best_thumb = thumb
                             break
                    thumbnail_url = best_thumb.get('url')
                    # Sometimes URLs might start with //, prepend https:
                    if thumbnail_url and thumbnail_url.startswith('//'):
                        thumbnail_url = 'https:' + thumbnail_url

            else:
                print("  -> No 'videoRenderer' found in the first results section.")
                return None, None

        except (KeyError, IndexError, TypeError) as e:
            print(f"  -> Error navigating the ytInitialData structure: {e}. YouTube structure likely changed.")
            # Optionally print the path tried for debugging
            # print(f"      Error occurred accessing data structure elements.")
            return None, None

        if video_id:
            print(f"  -> Found VideoID: {video_id}")
            return video_id, thumbnail_url
        else:
            print("  -> No video ID found in the parsed data.")
            return None, None

    except requests.exceptions.RequestException as e:
        print(f"  -> Network error during search: {e}")
        return None, None
    except Exception as e:
        print(f"  -> An unexpected error occurred during scraping: {e}")
        return None, None

def process_songs(input_filename, output_filename):
    """
    Reads song data from input JSON, scrapes YouTube for each song,
    and writes the updated data (with VideoID and ThumbnailURL) to output JSON.
    """
    try:
        with open(input_filename, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: Input file '{input_filename}' not found.")
        return
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from '{input_filename}'. Check file format.")
        return
    except Exception as e:
        print(f"An error occurred reading the input file: {e}")
        return

    if "Videos" not in data or "Video" not in data["Videos"]:
        print("Error: Input JSON structure is not as expected ('Videos' -> 'Video' list).")
        return

    song_list = data["Videos"]["Video"]
    output_data = {"Videos": {"Video": []}}
    total_songs = len(song_list)

    print(f"Starting scraping process for {total_songs} songs...")
    print(f"--- IMPORTANT: This uses web scraping and may break or get blocked. ---")
    print(f"--- A delay of {MIN_DELAY_SECONDS}-{MAX_DELAY_SECONDS}s will be used between requests. ---")

    for i, song in enumerate(song_list):
        artist = song.get("Artist")
        song_title = song.get("SongTitle")

        print(f"\nProcessing song {i+1}/{total_songs}: {artist} - {song_title}")

        if not artist or not song_title:
            print("  -> Skipping song due to missing Artist or SongTitle.")
            updated_song = song.copy()
            updated_song["VideoID"] = None
            updated_song["ThumbnailURL"] = None
            output_data["Videos"]["Video"].append(updated_song)
            continue

        # Construct the search query
        search_query = f"{artist} {song_title}"

        video_id, thumbnail_url = scrape_youtube_search(search_query)

        updated_song = song.copy()
        updated_song["VideoID"] = video_id
        updated_song["ThumbnailURL"] = thumbnail_url
        output_data["Videos"]["Video"].append(updated_song)

        # --- Wait before the next request ---
        delay = random.uniform(MIN_DELAY_SECONDS, MAX_DELAY_SECONDS)
        print(f"  -> Waiting for {delay:.2f} seconds...")
        time.sleep(delay)

    print(f"\nFinished processing {total_songs} songs.")

    # Write the updated data to the output file
    try:
        with open(output_filename, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        print(f"Successfully wrote updated data to '{output_filename}'")
    except Exception as e:
        print(f"An error occurred writing the output file: {e}")

# --- Main execution ---
if __name__ == "__main__":
    process_songs(INPUT_JSON_FILE, OUTPUT_JSON_FILE)
    print("\n--- SCRAPING COMPLETE ---")
    print("Reminder: The results depend on YouTube's current website structure and may be incomplete or inaccurate.")
    print("Using the official YouTube Data API is the recommended and reliable method.")