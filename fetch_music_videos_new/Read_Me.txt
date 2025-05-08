===================================================
 ReadMe - Jukebox Music Video Data Collector Script
===================================================

Version: 1.0 (Based on final working script)

Purpose:
--------
This Python script automates the process of collecting MusicBrainz Artist IDs (MBIDs) and associated music video data for a list of artists. It uses the MusicBrainz API to find the MBID and TheAudioDB API to retrieve a list of music videos linked to that MBID. It then generates standard YouTube thumbnail URLs for each video and saves the collated, deduplicated data into a JSON file suitable for use in applications like a video jukebox.

Features:
---------
*   Reads a list of artist names from an input file (`Artist_Lookup_Name.txt`).
*   Queries the MusicBrainz API to find the primary MusicBrainz Artist ID (MBID) for each artist.
*   Queries TheAudioDB API using the found MBID to retrieve a list of associated music videos (`mvid-mb.php` endpoint).
*   Parses YouTube URLs from the video data.
*   Extracts the YouTube video ID from valid URLs.
*   Generates a standard YouTube thumbnail URL (`hqdefault.jpg` by default) for each video.
*   Deduplicates the video list for each artist based on the YouTube URL to avoid multiple entries for the same video.
*   Outputs the results into a structured JSON file (`Videos_by_Artist.JSON`).
*   Includes rate limiting to respect API usage policies (MusicBrainz and TheAudioDB).

Prerequisites:
--------------
*   Python 3.x installed.
*   The Python `requests` library. Install it using pip: `pip install requests`

Setup:
------
1.  **Place Files:** Put the script (`fetch_music_videos.py`) and the input file (`Artist_Lookup_Name.txt`) in the SAME directory.
2.  **Prepare Input File (`Artist_Lookup_Name.txt`):**
    *   This MUST be a plain text file.
    *   List one artist name per line.
    *   Ensure correct spelling for best results with MusicBrainz lookup.
    *   Save the file with UTF-8 encoding if using special characters (like accents in names).
    *   Example `Artist_Lookup_Name.txt`:
        ```
        Taylor Swift
        Ed Sheeran
        Beyoncé
        Coldplay
        ```
3.  **Configure User-Agent (IMPORTANT):**
    *   Open the `fetch_music_videos.py` script in a text editor.
    *   Locate the `HEADERS` dictionary near the top.
    *   The `User-Agent` value is *required* by MusicBrainz. Ensure it accurately reflects your application name and provides a valid contact email. The current value is set based on previous input:
        ```python
        HEADERS = {
            'User-Agent': 'Jukebox/0.1 ( admin@systemvirtue.com )',
            'Accept': 'application/json'
        }
        ```
    *   **DO NOT** run the script extensively against MusicBrainz without a proper User-Agent, as your IP could be blocked.

Running the Script:
-------------------
1.  **Open Terminal:** Navigate to the directory containing the script and input file using the `cd` command.
    *   Example (macOS/Linux): `cd /path/to/your/script/directory`
2.  **Create & Activate Virtual Environment (Recommended):**
    *   `python3 -m venv venv` (or `python -m venv venv`)
    *   `source venv/bin/activate` (macOS/Linux) or `.\venv\Scripts\activate` (Windows)
3.  **Install Requirements:**
    *   `pip install requests`
4.  **Execute the Script:**
    *   `python fetch_music_videos.py`
5.  **Monitor Output:** The script will print progress updates, API call attempts, successes, failures, and rate limit waits to the terminal. Watch for any persistent errors.
6.  **Completion:** The script will print a final summary when finished.

Output File (`Videos_by_Artist.JSON`):
--------------------------------------
*   The script generates a JSON file in the same directory.
*   The file contains a single JSON list `[]`.
*   Each element in the list is an object `{}` representing one artist.
*   Structure of each artist object:
    ```json
    {
        "artist_name": "Artist Name From Input File",
        "mbid": "MusicBrainz-Artist-ID-UUID or null if not found",
        "music_videos": [
            // List of unique video objects for this artist
            {
                "title": "Video Title from TheAudioDB",
                "youtube_url": "Formatted YouTube Watch URL (https://...)",
                "track_thumb": "Generated YouTube Thumbnail URL (e.g., https://img.youtube.com/vi/VIDEO_ID/hqdefault.jpg)"
            },
            // ... more unique videos
        ]
    }
    ```

Configuration & Important Notes:
--------------------------------
*   **TheAudioDB API Key:** This script currently uses TheAudioDB's public demo key (`2`) embedded in the API URLs. This key has limitations and might be less reliable than a registered key, especially if you encounter persistent errors with TheAudioDB calls (even if HTTP status is 200). For more reliable or frequent use, consider getting a personal API key via TheAudioDB's Patreon ([https://www.patreon.com/thedatadb](https://www.patreon.com/thedatadb)) and replace the `/json/2/` part in the `AUDIO_DB_BASE_URL` variable within the script.
*   **Rate Limiting:** Delays (`MUSICBRAINZ_DELAY`, `AUDIO_DB_DELAY`) are intentionally included to comply with API limits. Do not remove or significantly reduce them, as this could lead to temporary or permanent IP blocks from the API providers.
*   **Data Quality:** The accuracy and completeness of the video list depend entirely on the data available in TheAudioDB for the specific MusicBrainz ID. Some artists may have incomplete or missing video lists. YouTube URLs provided by the API might occasionally be incorrect or become outdated.
*   **YouTube Thumbnails:** The script generates standard YouTube thumbnail URLs. If a video ID cannot be extracted from the provided URL, the `track_thumb` will be `null`. The quality (`hqdefault.jpg`) can be changed via the `YOUTUBE_THUMBNAIL_QUALITY` variable.

Troubleshooting:
----------------
*   **Check Terminal Output:** Look for specific ERROR messages printed during execution. These often indicate the point of failure (e.g., MBID lookup failure, specific API call error).
*   **API Key Issues:** If you see persistent errors related to TheAudioDB calls (especially JSON parsing errors despite HTTP 200 status), the demo key limit is the most likely cause. Obtaining a personal API key is the recommended solution.
*   **User-Agent:** Ensure the MusicBrainz User-Agent is correctly set in the script's `HEADERS`.
*   **Input File:** Verify the `Artist_Lookup_Name.txt` file exists, is correctly formatted (one name per line), and saved as plain text (ideally UTF-8).

===================================================