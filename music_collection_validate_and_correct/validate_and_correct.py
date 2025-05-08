import pandas as pd
import time
import requests
import musicbrainzngs
from urllib.parse import quote
from collections import defaultdict
import sys
import logging
import datetime
import re
import os
import math # Import math for ceil

# --- Configuration ---
class Config:
    MUSIC_LIBRARY_PATH = "Music_Video_COLLECTION.xlsx" # Corrected file path
    # If using CSV: MUSIC_LIBRARY_PATH = "music_data.csv"
    OUTPUT_PATH = "Validated_Music_Library.xlsx"
    MUSICBRAINZ_USER_AGENT = ("MusicVideoJukeboxValidator", "1.0", "YOUR_EMAIL@example.com") # !!! CHANGE THIS !!!
    IMVDB_API_KEY = "g62MJ5GkeTWY2kLtrp42EKqi0j8DbSLaMiNKJic8" # Assuming this is your real key now
    IMVDB_BASE_API_URL = "https://imvdb.com" # <-- CORRECTED BASE URL
    # MusicBrainz rate limit is 1 request per second. Sleep slightly more.
    MUSICBRAINZ_RATE_LIMIT_SEC = 1.1
    # IMVDb rate limit is higher, adjust if needed based on their policy
    IMVDB_RATE_LIMIT_SEC = 0.5

    # Flexible column mapping for input file
    REQUIRED_MAPPINGS = {
        'artist': ['Artist', 'ArtistName'],
        'title': ['SongTitle', 'Title', 'Song Title', 'TrackName'],
        'year': ['Year', 'ReleaseYear'],
        'genres': ['Genres', 'Genre', 'Styles'],
        'videoid': ['VideolD', 'VideoID'],
        'url': ['URL', 'VideoURL'] # Assuming URL is the video link
    }

# Configure logging
# Ensure log file exists or can be created
log_file = "validation.log"
try:
    # Check if we can write to the log file location
    with open(log_file, 'a') as f:
        pass # Just check if we can open and close
except IOError as e:
    print(f"Warning: Could not write to log file {log_file}: {e}. Logging will be console-only.")
    log_file = None # Disable file logging

handlers = [logging.StreamHandler()]
if log_file:
    handlers.append(logging.FileHandler(log_file, mode='w'))

logging.basicConfig(
    format='%(asctime)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s',
    level=logging.INFO,
    handlers=handlers
)
logger = logging.getLogger(__name__)

class MusicLibraryValidator:
    def __init__(self):
        self.library_df = pd.DataFrame()
        self.original_columns = []
        self._init_apis()

    def _init_apis(self):
        """Initializes API clients."""
        try:
            musicbrainzngs.set_useragent(*Config.MUSICBRAINZ_USER_AGENT)
            logger.info(f"MusicBrainz User Agent set to {Config.MUSICBRAINZ_USER_AGENT[0]}/{Config.MUSICBRAINZ_USER_AGENT[1]}.")
        except Exception as e:
            logger.error(f"Failed to initialize MusicBrainzNGS: {e}")
            self._mb_api_available = False
            return # Log and continue potentially without MB validation
        self._mb_api_available = True


        if not Config.IMVDB_API_KEY or Config.IMVDB_API_KEY == "YOUR_IMVDB_API_KEY_HERE":
            logger.warning("IMVDb API Key not set in Config. IMVDb validation will be skipped.")
            self.imvdb_headers = None
            self._imvdb_api_available = False
        else:
            self.imvdb_headers = {
                "X-IMVDB-APP-KEY": Config.IMVDB_API_KEY,
                "Accept": "application/json",
                "User-Agent": f"{Config.MUSICBRAINZ_USER_AGENT[0]}/{Config.MUSICBRAINZ_USER_AGENT[1]}" # Reuse MB user agent format
            }
            logger.info("IMVDb API Key found.")
            self._imvdb_api_available = True

    def _find_column(self, df, possibilities):
        """Finds the first matching column name from a list of possibilities (case-insensitive)."""
        df_cols_lower = [col.lower() for col in df.columns]
        for pattern in possibilities:
            pattern_lower = pattern.lower()
            if pattern_lower in df_cols_lower:
                original_col_name = df.columns[df_cols_lower.index(pattern_lower)]
                # logger.info(f"Mapped '{pattern}' to column '{original_col_name}'") # Keep this less chatty
                return original_col_name
        # logger.warning(f"Could not find any column matching possibilities: {possibilities}") # Keep this less chatty
        return None

    def load_library(self):
        """Loads the music library from the specified Excel or CSV file."""
        logger.info(f"Attempting to load library from: {Config.MUSIC_LIBRARY_PATH}")
        try:
            if Config.MUSIC_LIBRARY_PATH.lower().endswith(".xlsx"):
                df = pd.read_excel(Config.MUSIC_LIBRARY_PATH, engine='openpyxl')
            elif Config.MUSIC_LIBRARY_PATH.lower().endswith(".csv"):
                 # Attempt to detect separator, falling back to comma
                try:
                    # Increased `on_bad_lines` for potentially messy OCR data
                    df = pd.read_csv(Config.MUSIC_LIBRARY_PATH, sep=None, engine='python', on_bad_lines='skip', encoding='utf-8')
                    if df.shape[1] <= 1: # Simple check if autodetection failed
                       logger.warning("CSV auto-detection might have failed, trying utf-8 with comma separator.")
                       df = pd.read_csv(Config.MUSIC_LIBRARY_PATH, on_bad_lines='skip', encoding='utf-8') # Default separator is comma
                       if df.shape[1] <= 1:
                            logger.warning("CSV comma separation failed, trying latin-1 with comma separator.")
                            df = pd.read_csv(Config.MUSIC_LIBRARY_PATH, on_bad_lines='skip', encoding='latin-1') # Fallback encoding
                            if df.shape[1] <= 1:
                                logger.error("CSV loading failed with multiple attempts.")
                                raise ValueError("Failed to load CSV with comma separator and common encodings.")

                except Exception as csv_e:
                    logger.error(f"Initial CSV reading failed: {csv_e}. Trying basic comma separation with utf-8 then latin-1.")
                    try:
                        df = pd.read_csv(Config.MUSIC_LIBRARY_PATH, on_bad_lines='skip', encoding='utf-8')
                        if df.shape[1] <= 1:
                            logger.warning("CSV comma separation failed (utf-8), trying latin-1.")
                            df = pd.read_csv(Config.MUSIC_LIBRARY_PATH, on_bad_lines='skip', encoding='latin-1')
                            if df.shape[1] <= 1:
                                 logger.error("CSV loading failed with multiple attempts.")
                                 raise ValueError("Failed to load CSV with comma separator and common encodings.")

                    except Exception as fallback_csv_e:
                         logger.error(f"Fallback CSV reading failed: {fallback_csv_e}")
                         raise ValueError("Failed to load CSV from specified path.")


            else:
                raise ValueError("Unsupported file type. Please use .xlsx or .csv")

            logger.info(f"Successfully loaded file. Initial shape: {df.shape}. Columns found: {df.columns.tolist()}")

            # --- Flexible Column Mapping ---
            column_map = {}
            essential_missing = []
            for field, possibilities in Config.REQUIRED_MAPPINGS.items():
                found_col = self._find_column(df, possibilities)
                if found_col:
                    column_map[field] = found_col
                elif field in ['artist', 'title']: # Define essential fields here
                    essential_missing.append(f"'{field}' (tried: {possibilities})")
                    logger.warning(f"Essential column '{field}' not found.")

            # Validate ESSENTIAL columns (Artist, Title are critical for lookups)
            if essential_missing:
                logger.error(f"Essential columns missing from input file: {', '.join(essential_missing)}")
                raise ValueError(f"Essential columns missing: {', '.join(essential_missing)}. Cannot proceed without these.")

            # --- Create / Rename to Standard Columns ---
            # Create a new DataFrame with standard columns, copying data over
            standardized_data = {}
            self.original_columns = df.columns.tolist() # Keep all original column names

            # Add mapped standard columns first
            for field, original_col in column_map.items():
                 target_col = field.capitalize()
                 if field == 'videoid': target_col = 'VideolD'
                 if field == 'url': target_col = 'URL'
                 standardized_data[target_col] = df[original_col]
                 logger.debug(f"Copied data from original '{original_col}' to standard '{target_col}'.")

            # Add any original columns that were *not* mapped, to keep them
            for col in self.original_columns:
                 if col not in standardized_data: # If this original column wasn't mapped to a standard one
                      standardized_data[col] = df[col]
                      logger.debug(f"Keeping original column '{col}' as unmapped data.")


            self.library_df = pd.DataFrame(standardized_data)
            logger.info(f"Standardized DataFrame shape: {self.library_df.shape}. Columns: {self.library_df.columns.tolist()}")

            # Ensure essential standard columns are non-null strings for processing
            for col in ['Artist', 'Title', 'VideolD', 'URL']: # Assuming these are the standard names now
                 if col in self.library_df.columns:
                      self.library_df[col] = self.library_df[col].astype(str).fillna('').str.strip()
                 else:
                      # This shouldn't happen for Artist/Title if essential_missing check passed, but good for others
                      logger.warning(f"Standard column '{col}' not found in the standardized DataFrame.")
                      self.library_df[col] = '' # Add as empty string column if truly missing

            # Clean original Genre column if it exists and was mapped
            if 'Genres' in self.library_df.columns:
                 self.library_df['Genres'] = self.library_df['Genres'].astype(str).fillna('').str.strip()
            else:
                 logger.warning("'Genres' column not found in the standardized DataFrame.")
                 self.library_df['Genres'] = '' # Add as empty string column if truly missing


            logger.info(f"Loaded and processed {len(self.library_df)} tracks.")

        except FileNotFoundError:
            logger.error(f"File not found: {Config.MUSIC_LIBRARY_PATH}")
            sys.exit(1)
        except Exception as e:
            logger.error(f"Failed loading or processing library: {e}")
            logger.exception("Detailed traceback:") # Log the full traceback
            sys.exit(1)


    def _clean_text(self, text):
        """Basic text cleaning for comparisons."""
        if pd.isna(text) or not isinstance(text, str):
            return ""
        text = text.strip()
        # Remove common video suffixes (expanded patterns based on examples)
        # Updated regex to better handle various structures
        text = re.sub(r'\s*\((Official|Music|Video|Audio|Live|Lyric|Explicit|Clean|HD|4K|Remastered|Remix|Performance|Version|Directed by|Album|Single|Session|From|Ft|Feat|Featuring|With|Vs|X|&)[^)]*\)', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\s*\[(Official|Music|Video|Audio|Live|Lyric|Explicit|Clean|HD|4K|Remastered|Remix|Performance|Version|Directed by|Album|Single|Session|From|Ft|Feat|Featuring|With|Vs|X|&)[^\]]*\]', '', text, flags=re.IGNORECASE)
        # Remove other common unwanted bracketed info
        text = re.sub(r'\s*\[.*?\]', '', text)
        text = re.sub(r'\s*\(.*?\)', '', text) # This might still be too aggressive

        # Remove common featuring indicators if not caught by brackets
        text = re.sub(r'\s*(?:ft|feat|featuring|with)\.?\s+.*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\s*,\s*(?:ft|feat|featuring|with)\.?\s+.*', '', text, flags=re.IGNORECASE) # Handle comma before ft.

        # Remove leading/trailing whitespace and common punctuation/symbols
        text = text.strip(" -_!\"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~")
        # Normalize whitespace (replace multiple spaces/newlines with single space)
        text = re.sub(r'\s+', ' ', text)
        # Lowercase for consistent comparison
        text = text.lower()
        return text

    def _get_musicbrainz_data(self, artist, title):
        """Queries MusicBrainz for recording data and performs a lookup for details."""
        if not self._mb_api_available:
             logger.warning("MusicBrainz API not available. Skipping query.")
             return None
        if not artist or not title or pd.isna(artist) or pd.isna(title):
            logger.warning(f"Skipping MusicBrainz query due to missing artist ('{artist}') or title ('{title}').")
            return None

        # Use cleaned inputs for searching
        clean_artist = self._clean_text(artist)
        clean_title = self._clean_text(title)

        if not clean_artist or not clean_title:
             logger.warning(f"Skipping MB query after cleaning: Artist='{clean_artist}', Title='{clean_title}'")
             return None

        try:
            # --- Step 1: Search for Recordings ---
            # Only query and limit are valid search parameters for search
            query = f'artist:"{clean_artist}" AND recording:"{clean_title}"'
            logger.debug(f"MusicBrainz Search Query: {query}")
            time.sleep(Config.MUSICBRAINZ_RATE_LIMIT_SEC) # Respect MB rate limit before search

            search_results = musicbrainzngs.search_recordings(query=query, limit=10) # Search for a few results
            recording_list = search_results.get('recording-list', [])

            if not recording_list:
                logger.warning(f"No MB recording found for: '{artist}' - '{title}' (Cleaned: '{clean_artist}' - '{clean_title}')")
                return None

            # --- Step 2: Select the Best Match (Basic Heuristic) ---
            best_match_id = None
            highest_score = -1

            for rec in recording_list:
                mb_title_clean = self._clean_text(rec.get('title', ''))
                mb_artist_clean = self._clean_text(rec['artist-credit'][0]['artist'].get('name', '')) if rec.get('artist-credit') and rec['artist-credit'] else ''
                score = rec.get('score', 0)

                # Heuristic: Prioritize exact match of cleaned title and artist name or substring
                is_exact_title = mb_title_clean == clean_title
                # Check if cleaned search artist is a substring of cleaned MB artist (allows for group names, etc.)
                is_artist_match = clean_artist in mb_artist_clean

                if is_exact_title and is_artist_match:
                     if score > highest_score: # If multiple matches, take the highest score
                         best_match_id = rec.get('id')
                         highest_score = score
                         # If score is 100, this is likely the best bet
                         if score == 100:
                             break

            # Fallback to the highest scoring result if no strongly confident match was found
            if not best_match_id and recording_list:
                 best_match_id = recording_list[0].get('id')
                 highest_score = recording_list[0].get('score', 'N/A')
                 logger.info(f"No confident match found, using highest scoring MB result (score: {highest_score}) as fallback for: '{artist}' - '{title}'")
            elif best_match_id:
                 logger.info(f"Found confident MB match (score: {highest_score}) with ID {best_match_id} for: '{artist}' - '{title}'")


            if not best_match_id:
                 logger.warning(f"Could not determine a best match ID for: '{artist}' - '{title}'")
                 return None

            # --- Step 3: Perform Lookup for Detailed Data ---
            logger.debug(f"Performing MB Lookup for Recording ID: {best_match_id}")
            time.sleep(Config.MUSICBRAINZ_RATE_LIMIT_SEC) # Respect MB rate limit before lookup
            # Corrected includes for get_recording_by_id
            # removed 'release-groups' as it's not a valid include for recording
            # Added 'url-rels' to get associated URLs, which might include video links
            includes_for_lookup = ["artists", "releases", "tags", "genres", "url-rels"]
            recording_details = musicbrainzngs.get_recording_by_id(
                best_match_id,
                includes=includes_for_lookup # These includes ARE valid for lookup
            )['recording']

            # Now extract the data from the detailed lookup result
            data = {
                'recording_id': recording_details.get('id', pd.NA),
                'artist_id': recording_details['artist-credit'][0]['artist'].get('id', pd.NA) if recording_details.get('artist-credit') and recording_details['artist-credit'] else pd.NA,
                'artist_name_mb': recording_details['artist-credit'][0]['artist'].get('name', pd.NA) if recording_details.get('artist-credit') and recording_details['artist-credit'] else pd.NA,
                'title_mb': recording_details.get('title', pd.NA),
                'release_dates': [],
                'genres': set(), # Use a set for efficient deduplication
                'urls_mb': [] # To store associated URLs from MusicBrainz
            }

            # --- Get Release Dates from releases in the detailed data ---
            if 'release-list' in recording_details:
                for release in recording_details['release-list']:
                    if 'date' in release and release['date']:
                         year_match = re.match(r'(\d{4})', release['date'])
                         if year_match:
                             try:
                                 year_int = int(year_match.group(1))
                                 if 1800 < year_int < datetime.datetime.now().year + 5:
                                      data['release_dates'].append(year_int)
                             except (ValueError, TypeError):
                                 pass # Ignore invalid year formats

            # --- Get Genres (Tags/Genres) from detailed data ---
            # Prioritize 'genres' (official) on Recording, then 'tags' (user) on Recording
            if 'genre-list' in recording_details:
                 for genre in recording_details['genre-list']:
                     if genre.get('name'): data['genres'].add(genre['name'].lower().capitalize())
            elif 'tag-list' in recording_details:
                for tag in recording_details['tag-list']:
                    if tag.get('name'): data['genres'].add(tag['name'].lower().capitalize())


            # 2. From Artist Tags/Genres (requires another API call if artist ID is known)
            if pd.notna(data['artist_id']): # Check if artist_id is valid (not pd.NA)
                logger.debug(f"Performing MB Lookup for Artist ID: {data['artist_id']}")
                time.sleep(Config.MUSICBRAINZ_RATE_LIMIT_SEC) # Pause before the next MB call
                try:
                    artist_info = musicbrainzngs.get_artist_by_id(
                        data['artist_id'],
                        includes=["tags", "genres", "url-rels"] # These includes ARE valid for lookup on Artist
                    )['artist']
                    # Prioritize 'genres' on Artist, fallback to 'tags'
                    if 'genre-list' in artist_info:
                        for genre in artist_info['genre-list']:
                             if genre.get('name'): data['genres'].add(genre['name'].lower().capitalize())
                    elif 'tag-list' in artist_info:
                        for tag in artist_info['tag-list']:
                             if tag.get('name'): data['genres'].add(tag['name'].lower().capitalize())

                    # Get URLs from Artist
                    if 'url-relation-list' in artist_info:
                         for url_rel in artist_info['url-relation-list']:
                              if url_rel.get('target'):
                                   data['urls_mb'].append(url_rel['target'])

                except musicbrainzngs.WebServiceError as e:
                    logger.warning(f"MB API error getting artist {data['artist_id']} tags/genres: {e}")
                except Exception as e:
                    logger.error(f"Unexpected error getting MB artist {data['artist_id']} tags/genres: {e}")

            # Also get URLs from Recording (already included in recording_details lookup)
            if 'url-relation-list' in recording_details:
                 for url_rel in recording_details['url-relation-list']:
                      if url_rel.get('target'):
                           data['urls_mb'].append(url_rel['target'])


            # Convert genre set to sorted list, convert URL list to unique sorted list
            data['genres'] = sorted(list(data['genres']))
            data['urls_mb'] = sorted(list(set(data['urls_mb']))) # Deduplicate URLs


            return data # Return successfully retrieved data

        except musicbrainzngs.WebServiceError as e:
            # Handle specific MB errors like rate limiting or server issues
            logger.error(f"MusicBrainz WebServiceError for '{artist}' - '{title}': {e}")
            # Check if the error message contains "rate limit" or is a 503 Service Unavailable
            if "rate limit" in str(e).lower() or (isinstance(e, musicbrainzngs.WebServiceError) and hasattr(e, 'cause') and getattr(e.cause, 'response', None) is not None and e.cause.response.status_code == 503):
                 logger.warning("Rate limit likely hit (MB). Increasing sleep time and retrying after a delay.")
                 time.sleep(10) # Longer sleep for rate limit
                 # Note: This simple retry is basic. A better approach might use a retry decorator.
            return None # Return None on API errors to avoid processing incomplete data
        except Exception as e:
            logger.error(f"Unexpected MusicBrainz error for '{artist}' - '{title}': {e}")
            logger.exception("Detailed traceback:")
            return None # Return None on unexpected errors


    def _get_imvdb_data(self, artist, title):
        """Queries IMVDb for video data."""
        if not self._imvdb_api_available:
            logger.debug("IMVDb API not available. Skipping query.")
            return None # Skip if API key isn't set or API is not available

        if not artist or not title or pd.isna(artist) or pd.isna(title):
            logger.warning(f"Skipping IMVDb query due to missing artist ('{artist}') or title ('{title}').")
            return None

        time.sleep(Config.IMVDB_RATE_LIMIT_SEC) # Respect IMVDb rate limit

        try:
            # Use MB-resolved artist/title if available, otherwise fallback to original cleaned artist/title
            # This allows IMVDB to search for the name as found on MB if MB validation was successful
            search_artist = str(artist).strip()
            search_title = str(title).strip()

            if not search_artist or not search_title:
                 logger.warning("Skipping IMVDb query after cleaning source text.")
                 return None


            search_query = f"{search_artist} {search_title}"
            encoded_query = quote(search_query)
            url = f"{Config.IMVDB_BASE_API_URL}/api/v1/search/videos?q={encoded_query}" # Use Config.IMVDB_BASE_API_URL
            logger.debug(f"IMVDb Query URL: {url}")

            response = requests.get(url, headers=self.imvdb_headers, timeout=20) # Increased timeout slightly
            response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)
            data = response.json()

            results = data.get('results', [])
            if not results:
                logger.warning(f"No IMVDb results for: '{search_artist}' - '{search_title}'")
                return None

            # Try to find the best match based on cleaned artist and title
            clean_artist_search = self._clean_text(search_artist)
            clean_title_search = self._clean_text(search_title)

            best_match = None
            for video in results:
                video_title_clean = self._clean_text(video.get('song_title', ''))
                video_artists_clean = [self._clean_text(a.get('name', '')) for a in video.get('artists', [])]
                video_youtube_id = video.get('youtube_id', '') # Get YouTube ID if available

                # Matching logic: prioritize cleaned title match + any cleaned artist match
                artist_match = any(clean_artist_search in va for va in video_artists_clean)
                title_match = video_title_clean == clean_title_search

                if title_match and artist_match:
                    # Found a match, return its ID and YouTube ID
                    logger.info(f"Found IMVDb match for '{search_artist}' - '{search_title}': ID {video.get('id')}, YouTube ID {video_youtube_id}")
                    return {'video_id': video.get('id'), 'youtube_id_imvdb': video_youtube_id}

            logger.warning(f"Found IMVDb results for '{search_artist}' - '{search_title}', but no exact match.")
            return None # No suitable match found

        except requests.exceptions.RequestException as e:
            logger.error(f"IMVDb request error for '{search_artist}' - '{search_title}': {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected IMVDb error for '{search_artist}' - '{search_title}': {e}")
            logger.exception("Detailed traceback:")
            return None

    def _parse_genres(self, genre_str):
        """Parses a string of genres into a list."""
        if pd.isna(genre_str) or not isinstance(genre_str, str) or not genre_str.strip():
            return []
        # Handle various separators and strip whitespace
        genres = re.split(r'[;,/|]', genre_str)
        return sorted([g.strip().capitalize() for g in genres if g.strip()])

    def _resolve_year(self, original_year, mb_data):
        """Determines the best year value."""
        mb_years = sorted(list(set(mb_data.get('release_dates', [])))) if mb_data else []

        if mb_years:
            # Prefer the earliest MusicBrainz year if available and seems reasonable
            resolved_year = mb_years[0]
            logger.debug(f"Resolved year using MB: {resolved_year} (Original: {original_year}, MB options: {mb_years})")
            return resolved_year
        elif pd.notna(original_year):
             # Keep original if numeric and MB data is missing
             try:
                 # Check if original_year can be treated as a year (simple check > 1800 and not future)
                 if 1800 < int(original_year) < datetime.datetime.now().year + 5:
                     logger.debug(f"Keeping original year: {int(original_year)}")
                     return int(original_year)
                 else:
                     logger.warning(f"Original year '{original_year}' out of reasonable range, discarding.")
                     return pd.NA
             except (ValueError, TypeError):
                 logger.warning(f"Original year '{original_year}' is not numeric, discarding.")
                 return pd.NA
        else:
            logger.debug("No year found in original data or MB data.")
            return pd.NA # Return pandas NA if no valid year found

    def _resolve_genres(self, original_genres_list, mb_genres_list):
        """Merges and deduplicates genres."""
        # Combine, lowercase, capitalize, remove duplicates, sort
        combined_genres = set(g.lower().capitalize() for g in original_genres_list if g)
        if mb_genres_list:
            combined_genres.update(g.lower().capitalize() for g in mb_genres_list if g)

        resolved_list = sorted(list(combined_genres))
        logger.debug(f"Resolved Genres: {resolved_list} (Original: {original_genres_list}, MB: {mb_genres_list})")
        return resolved_list


    def validate_library(self):
        """Iterates through the library, validates each track, and returns results."""
        results = []
        total_tracks = len(self.library_df)
        logger.info(f"Starting validation for {total_tracks} tracks...")

        # Prepare list of dicts for validation results
        # Using list of dicts and converting to DataFrame at the end is often more efficient
        # than trying to build/update a DataFrame row by row.
        validation_results_list = []

        for index, track_series in self.library_df.iterrows():
            # Convert Series row to dict for easier manipulation
            track = track_series.to_dict().copy()

            logger.info(f"Processing track {index + 1}/{total_tracks}: '{track.get('Artist', 'N/A')}' - '{track.get('Title', 'N/A')}'")

            # Initialize validation-specific fields (using pd.NA for missing values)
            validation_fields = {
                'Validated_MB': False,
                'Validated_IMVDB': False,
                'MB_RecordingID': pd.NA,
                'MB_ArtistID': pd.NA,
                'MB_ArtistName': pd.NA,
                'MB_RecordingTitle': pd.NA,
                'IMVDB_VideoID': pd.NA,
                'IMVDB_YouTubeID': pd.NA,
                'Resolved_Year': pd.NA,
                'Resolved_Genres': [], # Keep as list during validation, convert to string later
                'Warnings': [] # Keep as list during validation, convert to string later
            }
            # Add these new fields to the track dictionary. Ensure they are not present to avoid overwriting original data if column names overlap.
            # A safer approach is to explicitly add them, ensuring they use pd.NA initially.
            for key, default_value in validation_fields.items():
                 if key not in track:
                      track[key] = default_value
                 # For lists/sets, ensure they are re-initialized per row
                 if isinstance(default_value, (list, set)):
                      track[key] = default_value.copy() if hasattr(default_value, 'copy') else type(default_value)() # Re-initialize

            # --- Basic Cleaning Before API Calls ---
            # Clean artist and title from the dictionary copy
            track['Artist'] = str(track.get('Artist', '')).strip()
            track['Title'] = str(track.get('Title', '')).strip()
            # Handle cases where 'Genres' column might not have been mapped/exist
            track['Genres'] = str(track.get('Genres', '')).strip() # Use get with default


            # Ensure essential fields are present after cleaning
            artist = track['Artist']
            title = track['Title']

            if not artist or not title:
                 track['Warnings'].append("Missing Artist or Title in source data after initial cleaning.")
                 validation_results_list.append(track)
                 continue # Skip API calls if essential info is missing


            # --- MusicBrainz Validation ---
            if self._mb_api_available:
                logger.debug(f"Querying MusicBrainz for: Artist='{artist}', Title='{title}'")
                mb_data = self._get_musicbrainz_data(artist, title)
                if mb_data:
                    track['Validated_MB'] = True
                    track['MB_RecordingID'] = mb_data.get('recording_id', pd.NA)
                    track['MB_ArtistID'] = mb_data.get('artist_id', pd.NA)
                    track['MB_ArtistName'] = mb_data.get('artist_name_mb', pd.NA)
                    track['MB_RecordingTitle'] = mb_data.get('title_mb', pd.NA)
                    track['MB_URLs'] = mb_data.get('urls_mb', []) # Capture MB URLs

                    # Resolve Year (uses original Year + MB data)
                    original_year = track.get('Year') # Access original 'Year' from the dictionary
                    track['Resolved_Year'] = self._resolve_year(original_year, mb_data)

                    # Resolve Genres (uses original Genres + MB data)
                    original_genres_list = self._parse_genres(track['Genres']) # Use cleaned original genres string from dict
                    mb_genres = mb_data.get('genres', [])
                    track['Resolved_Genres'] = self._resolve_genres(original_genres_list, mb_genres)

                    logger.info(f"-> MB Match: RecID={track['MB_RecordingID']}, ArtID={track['MB_ArtistID']}, Year={track['Resolved_Year']}, Genres={len(track['Resolved_Genres'])}")
                else:
                    track['Warnings'].append("No suitable MusicBrainz match found.")
                    # Keep original year/genres if no MB match (still pass through resolution for cleaning/parsing)
                    original_year = track.get('Year')
                    track['Resolved_Year'] = self._resolve_year(original_year, None)
                    original_genres_list = self._parse_genres(track['Genres'])
                    track['Resolved_Genres'] = self._resolve_genres(original_genres_list, [])
                    track['MB_URLs'] = [] # No MB URLs if no match

                    logger.warning("-> MB Match: Failed")
            else:
                 track['Warnings'].append("MusicBrainz API not available.")
                 track['MB_URLs'] = [] # No MB URLs if API unavailable


            # --- IMVDb Validation ---
            if self._imvdb_api_available:
                # Use MB-resolved artist/title if available, otherwise fallback to original cleaned artist/title
                imvdb_artist = track.get('MB_ArtistName', artist) if track['Validated_MB'] and pd.notna(track.get('MB_ArtistName')) else artist
                imvdb_title = track.get('MB_RecordingTitle', title) if track['Validated_MB'] and pd.notna(track.get('MB_RecordingTitle')) else title

                logger.debug(f"Querying IMVDb for: Artist='{imvdb_artist}', Title='{imvdb_title}'")
                imvdb_data = self._get_imvdb_data(imvdb_artist, imvdb_title)
                if imvdb_data:
                    track['Validated_IMVDB'] = True
                    track['IMVDB_VideoID'] = imvdb_data.get('video_id', pd.NA)
                    track['IMVDB_YouTubeID'] = imvdb_data.get('youtube_id_imvdb', pd.NA)
                    logger.info(f"-> IMVDb Match: VideoID={track['IMVDB_VideoID']}, YouTubeID={track['IMVDB_YouTubeID']}")
                else:
                     track['Warnings'].append("No suitable IMVDb match found.")
                     logger.warning("-> IMVDb Match: Failed")
            else:
                 track['Warnings'].append("IMVDb API not available.")


            # Convert resolved genre list back to string for Excel output
            track['Resolved_Genres_Str'] = ', '.join(track['Resolved_Genres'])
            # Join warnings into a string
            track['Warnings_Str'] = '; '.join(track['Warnings'])
            # Convert MB URLs list to string for Excel output
            track['MB_URLs_Str'] = '; '.join(track['MB_URLs'])


            # Append the processed track dictionary to the list
            validation_results_list.append(track)

        return validation_results_list


    def generate_report(self, results_list):
        """Generates the final DataFrame report from the list of results."""
        logger.info("Generating final report DataFrame...")
        # Convert list of dictionaries to DataFrame
        report_df = pd.DataFrame(results_list)

        # Drop the temporary list columns
        report_df = report_df.drop(columns=['Resolved_Genres', 'Warnings', 'MB_URLs'], errors='ignore')


        # --- Implement "If in doubt, chuck it out" ---
        # Remove tracks if both MB validation AND IMVDb validation failed
        initial_report_rows = len(report_df)
        chuck_it_mask = (report_df['Validated_MB'] == False) & (report_df['Validated_IMVDB'] == False)
        chucked_out_count = chuck_it_mask.sum()
        report_df = report_df[~chuck_it_mask].reset_index(drop=True) # Reset index after dropping

        logger.info(f"Implemented 'If in doubt, chuck it out': Removed {chucked_out_count} tracks that failed both MB and IMVDb validation.")
        logger.info(f"Final report shape after chucking out: {report_df.shape}")


        # Define the desired column order for the final report
        # Start with validation flags, core resolved data, then IDs, then original data, then warnings
        desired_order = [
            'Validated_MB', 'Validated_IMVDB',
            'Artist', 'MB_ArtistName', # Original and MB Artist
            'Title', 'MB_RecordingTitle', # Original and MB Title
            'Resolved_Year', 'Year',      # Resolved and Original Year
            'Resolved_Genres_Str', 'Genres',  # Resolved and Original Genres (Resolved is now string)
            'MB_RecordingID', 'MB_ArtistID', 'IMVDB_VideoID', 'IMVDB_YouTubeID', 'MB_URLs_Str',
            'Warnings_Str' # Warnings are now string
        ]

        # Identify original columns to keep that are not already in desired_order
        # Use self.original_columns which has the full list of original columns from the input file
        original_cols_to_add = [
            col for col in self.original_columns
            if col not in ['Artist', 'Title', 'Year', 'Genres', 'VideolD', 'URL'] # Avoid original mapped/renamed cols
            and col not in desired_order # Avoid explicitly listed standard cols
        ]

        # Add mapped standard columns that are not already in the desired order
        # This handles cases where VideolD or URL might have been in the input but not explicitly in desired_order initially
        mapped_standard_cols = [field.capitalize() for field in Config.REQUIRED_MAPPINGS.keys()]
        mapped_standard_cols = ['VideolD' if x == 'Videoid' else x for x in mapped_standard_cols] # Fix VideolD casing
        mapped_standard_cols = ['URL' if x == 'Url' else x for x in mapped_standard_cols] # Fix URL casing


        standard_cols_to_add = [
             col for col in mapped_standard_cols
             if col in report_df.columns # Only add if the column actually exists in the DF
             and col not in desired_order # Avoid already placed cols
        ]

        # Construct the final column order: desired core fields + other standard mapped fields + other original columns
        final_column_order = desired_order + sorted(standard_cols_to_add) + sorted(original_cols_to_add)

        # Ensure uniqueness in the final list in case of overlaps (e.g., if an original column had the same name as a new one)
        # Convert to OrderedSet conceptually, but simple list comprehension filtering works too
        final_column_order_unique = []
        for col in final_column_order:
            if col not in final_column_order_unique:
                final_column_order_unique.append(col)

        # Ensure all columns in the final unique list actually exist in the DataFrame
        final_column_order_exists = [col for col in final_column_order_unique if col in report_df.columns]

        # Reorder and select only the existing desired columns
        try:
             report_df = report_df.reindex(columns=final_column_order_exists)
        except KeyError as e:
             logger.error(f"Column reordering failed. One of the columns might be missing: {e}")
             logger.warning("Returning DataFrame with default column order.")
             pass # report_df remains the full results DataFrame

        return report_df


    def save_report(self, df):
        """Saves the DataFrame to an Excel file."""
        logger.info(f"Attempting to save report to: {Config.OUTPUT_PATH}")
        try:
            # Ensure column names are valid Excel columns (avoid special chars if any survived)
            # This also handles pandas.NA being represented as NaN in output
            df.to_excel(Config.OUTPUT_PATH, index=False, engine='openpyxl')
            logger.info(f"Report successfully saved to {Config.OUTPUT_PATH}")
        except Exception as e:
            logger.error(f"Failed saving report: {e}")
            logger.exception("Detailed traceback:")
            # Optionally save as CSV as a fallback
            try:
                csv_fallback_path = Config.OUTPUT_PATH.replace('.xlsx', '.csv')
                df.to_csv(csv_fallback_path, index=False)
                logger.warning(f"Saved as CSV fallback to: {csv_fallback_path}")
            except Exception as csv_e:
                logger.error(f"Failed to save CSV fallback: {csv_e}")


# --- Main Execution ---
if __name__ == "__main__":
    logger.info("Script started.")
    validator = MusicLibraryValidator()
    validator.load_library() # Load data from the specified path
    if not validator.library_df.empty:
        validation_results_list = validator.validate_library()
        if validation_results_list:
            report_df = validator.generate_report(validation_results_list)
            # Check if report_df is empty after chucking out before saving
            if not report_df.empty:
                validator.save_report(report_df)
            else:
                logger.warning("Report DataFrame is empty after filtering (chucking out). No file saved.")
        else:
            logger.warning("Validation process returned no results.")
    else:
        logger.error("Library DataFrame is empty after loading. Exiting.")

    logger.info("Script finished.")