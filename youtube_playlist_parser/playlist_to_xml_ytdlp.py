#!/usr/bin/env python3

import sys
import re
import argparse
import subprocess
import json
import xml.etree.ElementTree as ET
from xml.dom import minidom
import os # For path checking

# --- Helper Functions ---

def format_duration(seconds):
    """Formats duration in seconds to H:MM:SS or M:SS"""
    if seconds is None or not isinstance(seconds, (int, float)):
        return "N/A"
    try:
        seconds = int(seconds)
        if seconds < 0:
            return "N/A"
        minutes, seconds = divmod(seconds, 60)
        hours, minutes = divmod(minutes, 60)
        if hours > 0:
            return f"{hours}:{minutes:02d}:{seconds:02d}"
        else:
            return f"{minutes}:{seconds:02d}"
    except (ValueError, TypeError):
        return "N/A"

def get_best_thumbnail(thumbnails_list):
    """Selects a suitable thumbnail URL from the yt-dlp thumbnails list."""
    if not thumbnails_list or not isinstance(thumbnails_list, list):
        return None
    # Prioritize standard quality thumbnails if available
    for thumb in reversed(thumbnails_list): # Check higher resolutions first
        if thumb.get('id') == 'hqdefault' or thumb.get('id') == 'maxresdefault':
             return thumb.get('url')
    # Fallback to the last one (often highest resolution)
    return thumbnails_list[-1].get('url')

def parse_ytdlp_title(entry_data):
    """Attempts to extract Artist and Title from yt-dlp metadata."""
    title = entry_data.get('title', 'Unknown Title')
    artist = entry_data.get('artist')
    track = entry_data.get('track')
    creator = entry_data.get('creator')
    uploader = entry_data.get('uploader')

    # Priority 1: Use 'artist' and 'track' if both exist
    if artist and track:
        return artist, track

    # Priority 2: Use 'artist' if it exists, and the full title as track
    if artist:
        # Basic clean up of title if artist name is duplicated at the start
        if title.lower().startswith(artist.lower() + " -"):
           cleaned_title = title[len(artist) + 3:].strip()
           if cleaned_title: return artist, cleaned_title
        return artist, title

    # Priority 3: Fallback parsing using common separators on the 'title'
    separators = [' - ', ' – ', ' -- ', ' | ']
    for sep in separators:
        if sep in title:
            parts = title.split(sep, 1)
            part1 = parts[0].strip()
            part2 = parts[1].strip()
            if len(part1) > 1 and len(part2) > 1:
                # Simple assumption: first part is artist
                # Add more sophisticated cleaning/checking if needed
                return part1, part2

    # Priority 4: Use 'creator' or 'uploader' as artist if available, full title as track
    artist_fallback = creator if creator else uploader
    if artist_fallback:
        # Basic clean up of title if artist name is duplicated at the start
        if title.lower().startswith(artist_fallback.lower() + " -"):
             cleaned_title = title[len(artist_fallback) + 3:].strip()
             if cleaned_title: return artist_fallback, cleaned_title
        return artist_fallback, title

    # Final fallback: Unknown artist, full title as track
    return "Unknown Artist", title


def create_playlist_xml_ytdlp(playlist_url, output_file, ytdlp_path="yt-dlp"):
    """Fetches playlist data using yt-dlp and saves it as an XML file."""

    print(f"Using yt-dlp path: {ytdlp_path}")
    print(f"Processing playlist: {playlist_url}")
    print("Fetching playlist information with yt-dlp...")

    # Command to get playlist info as JSON, one entry per line
    # --flat-playlist: List entries without downloading
    # --print-json: Output metadata as JSON (alternative to --dump-json for per-entry)
    # -i: Ignore errors on individual videos
    command = [
        ytdlp_path,
        '--flat-playlist',
        '--print-json',
        '-i', # Ignore errors
        playlist_url
    ]

    try:
        # Run yt-dlp command
        process = subprocess.run(command, capture_output=True, text=True, check=False, encoding='utf-8') # Don't check=True, handle errors manually

        if process.returncode != 0:
             # Check common errors
             if "command not found" in process.stderr.lower() or \
                "'yt-dlp' is not recognized" in process.stderr.lower() or \
                 "No such file or directory" in process.stderr.lower():
                 print(f"\nError: '{ytdlp_path}' command not found.")
                 print("Please ensure yt-dlp is installed and in your system PATH.")
                 print("Installation instructions: https://github.com/yt-dlp/yt-dlp#installation")
                 return # Stop execution
             else:
                 print(f"\nWarning: yt-dlp exited with error code {process.returncode}.")
                 print("Stderr output:")
                 print(process.stderr)
                 # Continue if possible, maybe some videos were processed before error

        # Check if stdout is empty
        if not process.stdout.strip():
             print("\nError: yt-dlp did not return any video data.")
             if process.stderr:
                 print("Stderr output:")
                 print(process.stderr)
             else:
                 print("Possible issues: Invalid playlist URL, network error, or playlist is empty/private.")
             return

        # Split the output into individual JSON lines
        json_lines = process.stdout.strip().split('\n')

        print(f"Found {len(json_lines)} potential video entries. Processing details...")

        # --- XML Generation ---
        root = ET.Element("PlaylistDatabase")
        # Attempt to get playlist title (yt-dlp might output it on the first JSON line if not flat, but with --flat-playlist it's usually per-entry)
        # We will set a generic title or potentially extract from the first video later if needed.
        # For now, set a placeholder based on URL, can be refined.
        playlist_id = playlist_url.split('list=')[-1]
        root.set("title", f"Playlist {playlist_id}") # Placeholder title
        root.set("url", playlist_url)

        video_list_element = ET.SubElement(root, "Videos")

        processed_count = 0
        error_count = 0

        # Iterate through JSON data for each video
        for index, line in enumerate(json_lines, start=1):
            try:
                entry_data = json.loads(line)

                # Extract required data using .get() for safety
                video_id = entry_data.get('id', 'UnknownID')
                raw_title = entry_data.get('title', 'Unknown Title') # Use for parsing if needed

                # Determine Artist and Song Title
                artist, song_title = parse_ytdlp_title(entry_data)

                # Get Duration
                duration_seconds = entry_data.get('duration')
                duration_formatted = format_duration(duration_seconds)
                # Fallback if duration_string is more reliable (sometimes it is)
                if duration_formatted == "N/A" and entry_data.get('duration_string'):
                    # Basic check if duration_string looks like H:MM:SS or M:SS
                    if re.match(r'^(\d+:)?\d{1,2}:\d{2}$', entry_data['duration_string']):
                         duration_formatted = entry_data['duration_string']

                # Get Thumbnail URL
                thumbnails = entry_data.get('thumbnails')
                thumbnail_url = get_best_thumbnail(thumbnails) or entry_data.get('thumbnail') # Fallback to top-level thumbnail

                # Create XML elements for the video
                video_elem = ET.SubElement(video_list_element, "Video")
                ET.SubElement(video_elem, "Index").text = str(index)
                ET.SubElement(video_elem, "VideoID").text = video_id
                ET.SubElement(video_elem, "Artist").text = artist
                ET.SubElement(video_elem, "SongTitle").text = song_title
                ET.SubElement(video_elem, "Duration").text = duration_formatted
                ET.SubElement(video_elem, "ThumbnailURL").text = thumbnail_url if thumbnail_url else "N/A"

                # Try to set playlist title from first video's metadata if root title is still placeholder
                if index == 1 and entry_data.get('playlist_title') and root.get("title") == f"Playlist {playlist_id}":
                     root.set("title", entry_data.get('playlist_title'))
                     print(f"Updated playlist title to: {root.get('title')}")


                processed_count += 1
                print(f"Processed {index}/{len(json_lines)}: {artist} - {song_title}")
                sys.stdout.flush()

            except json.JSONDecodeError:
                error_count += 1
                print(f"Warning: Skipping line {index}, could not decode JSON: {line[:100]}...")
            except Exception as e:
                error_count += 1
                video_id_error = "UnknownID"
                try: video_id_error = json.loads(line).get('id', 'UnknownID') # Try get ID even on error
                except: pass
                print(f"Error processing video entry {index} ({video_id_error}): {type(e).__name__} - {e}. Skipping.")
                # Add error entry to XML
                video_elem = ET.SubElement(video_list_element, "Video")
                ET.SubElement(video_elem, "Index").text = str(index)
                ET.SubElement(video_elem, "VideoID").text = video_id_error
                ET.SubElement(video_elem, "Status").text = f"Processing Error: {type(e).__name__}"


        # Generate XML string (pretty-printed)
        xml_string_rough = ET.tostring(root, encoding='unicode', method='xml')
        dom = minidom.parseString(xml_string_rough)
        pretty_xml_string = dom.toprettyxml(indent="  ")

        # Write to file using UTF-8 encoding
        try:
            with open(output_file, "w", encoding="utf-8") as f:
                f.write(pretty_xml_string)
            print(f"\nSuccessfully processed {processed_count}/{len(json_lines)} video entries.")
            if error_count > 0:
                print(f"Encountered {error_count} errors/skipped entries (details may be limited in XML).")
            print(f"XML database saved to: {output_file}")
        except IOError as e:
            print(f"\nError writing XML to file '{output_file}': {e}")
            print("\n--- XML Output (stdout) ---")
            print(pretty_xml_string) # Print to console as fallback


    except FileNotFoundError:
         print(f"\nError: '{ytdlp_path}' command not found.")
         print("Please ensure yt-dlp is installed and in your system PATH or provide the correct path using --ytdlp-path.")
         print("Installation instructions: https://github.com/yt-dlp/yt-dlp#installation")
    except Exception as e:
        print(f"\nAn unexpected error occurred during script execution: {type(e).__name__} - {e}")

# --- Main Execution ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch YouTube playlist data using yt-dlp and save as XML.")
    parser.add_argument("-u", "--url", required=True, help="The full URL of the YouTube playlist.")
    parser.add_argument("-o", "--output", default="playlist_data_ytdlp.xml", help="Output XML file name (default: playlist_data_ytdlp.xml)")
    parser.add_argument("--ytdlp-path", default="yt-dlp", help="Path to the yt-dlp executable if not in system PATH (default: yt-dlp)")

    args = parser.parse_args()

    create_playlist_xml_ytdlp(args.url, args.output, args.ytdlp_path)