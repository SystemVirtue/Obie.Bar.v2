#!/usr/bin/env python3

import os
import argparse
import xml.etree.ElementTree as ET
from xml.dom import minidom
import re
import sys

def clean_genre_name(playlist_name):
    """Removes volume indicators and cleans up the genre name."""
    # Case-insensitive removal of " vol X", "volume X", etc. at the end of the string
    # Handles variations like "VOL.", "VOL", "VOLUME", spaces, and numbers
    cleaned = re.sub(r'\s+VOL(UME|\.)?\s*\d+\s*$', '', playlist_name, flags=re.IGNORECASE).strip()
    # Optional: Add more cleaning rules if needed (e.g., replace underscores)
    # cleaned = cleaned.replace('_', ' ')
    return cleaned

def parse_video_element(video_elem, source_playlist_name, derived_genre):
    """Extracts data from a <Video> XML element and returns a dictionary."""
    video_data = {}
    fields = [
        "Index", "VideoID", "Artist", "SongTitle",
        "Duration", "ThumbnailURL", "Status" # Include Status if present
    ]
    for field in fields:
        node = video_elem.find(field)
        video_data[field] = node.text if node is not None else None # Store None if tag missing

    # Add the new fields
    video_data["SourcePlaylist"] = source_playlist_name
    video_data["Genre"] = derived_genre

    # Basic validation/defaults for key fields used in sorting/deduping
    if not video_data.get("Artist"): video_data["Artist"] = "Unknown Artist"
    if not video_data.get("SongTitle"): video_data["SongTitle"] = "Unknown Title"
    if not video_data.get("ThumbnailURL"): video_data["ThumbnailURL"] = "" # Use empty string for deduping consistency

    return video_data

def consolidate_playlists(source_dir, output_file):
    """Consolidates, cleans, sorts, and deduplicates playlist XML files."""

    print(f"Source directory: {source_dir}")
    print(f"Output file: {output_file}")

    if not os.path.isdir(source_dir):
        print(f"Error: Source directory '{source_dir}' not found.")
        sys.exit(1)

    all_videos = []
    xml_files_processed = 0

    print("\n--- Phase 1: Parsing XML Files ---")
    for filename in os.listdir(source_dir):
        if filename.lower().endswith(".xml") and filename != os.path.basename(output_file):
            filepath = os.path.join(source_dir, filename)
            source_playlist_name = os.path.splitext(filename)[0]
            derived_genre = clean_genre_name(source_playlist_name)
            print(f"Processing '{filename}' (Genre: '{derived_genre}')...")
            xml_files_processed += 1
            try:
                tree = ET.parse(filepath)
                root = tree.getroot()
                videos_found_in_file = 0
                # Find <Video> elements, could be direct children or nested under <Videos>
                for video_elem in root.findall('.//Video'):
                    # Ignore videos that had errors during initial creation
                    status_node = video_elem.find('Status')
                    if status_node is None or status_node.text in [None, "Unavailable", ""]: # Process only if status is OK or missing
                        video_data = parse_video_element(video_elem, source_playlist_name, derived_genre)
                        all_videos.append(video_data)
                        videos_found_in_file += 1
                    else:
                         print(f"  Skipping entry with Status: '{status_node.text}' in '{filename}'")

                print(f"  Found {videos_found_in_file} valid video entries.")

            except ET.ParseError as e:
                print(f"  Warning: Skipping '{filename}' due to XML parsing error: {e}")
            except Exception as e:
                print(f"  Warning: Skipping '{filename}' due to unexpected error: {e}")

    if not all_videos:
        print("\nNo valid video entries found in any XML files. Exiting.")
        sys.exit(0)

    print(f"\n--- Phase 2: Sorting {len(all_videos)} Total Entries ---")
    # Sort alphabetically by Artist Name (case-insensitive)
    all_videos.sort(key=lambda x: x.get('Artist', 'Unknown Artist').lower())
    print("Sorting complete.")

    print("\n--- Phase 3: Removing Duplicates ---")
    unique_videos = []
    seen_signatures = set()
    duplicates_removed = 0

    for video in all_videos:
        # Create a signature for deduplication based on Artist, Title, and Thumbnail
        # Use lower case for Artist/Title for better matching if needed, but case-sensitive might be safer
        signature = (
            video.get('Artist', 'Unknown Artist'),#.lower(),
            video.get('SongTitle', 'Unknown Title'),#.lower(),
            video.get('ThumbnailURL', '') # Use the potentially blanked URL
        )

        if signature not in seen_signatures:
            seen_signatures.add(signature)
            unique_videos.append(video)
        else:
            duplicates_removed += 1
            # print(f"  Duplicate found and removed: {signature[0]} - {signature[1]}") # Optional: Log duplicates

    print(f"Removed {duplicates_removed} duplicate entries.")
    print(f"{len(unique_videos)} unique entries remain.")

    print("\n--- Phase 4: Building Master XML ---")
    master_root = ET.Element("PlaylistDatabase")
    master_root.set("title", "MASTER PLAYLIST")
    master_root.set("source_files_processed", str(xml_files_processed))
    master_root.set("unique_videos_count", str(len(unique_videos)))

    videos_element = ET.SubElement(master_root, "Videos")

    # Renumber and add unique videos to the master XML
    for index, video_data in enumerate(unique_videos, start=1):
        video_elem = ET.SubElement(videos_element, "Video")

        # Add elements in desired order, updating Index
        ET.SubElement(video_elem, "Index").text = str(index) # New sequential index
        ET.SubElement(video_elem, "VideoID").text = video_data.get("VideoID", "")
        ET.SubElement(video_elem, "Artist").text = video_data.get("Artist", "Unknown Artist")
        ET.SubElement(video_elem, "SongTitle").text = video_data.get("SongTitle", "Unknown Title")
        ET.SubElement(video_elem, "Duration").text = video_data.get("Duration", "N/A")
        ET.SubElement(video_elem, "ThumbnailURL").text = video_data.get("ThumbnailURL", "")
        # Add the new elements
        ET.SubElement(video_elem, "SourcePlaylist").text = video_data.get("SourcePlaylist", "Unknown")
        ET.SubElement(video_elem, "Genre").text = video_data.get("Genre", "Unknown")

    print("Master XML structure built.")

    print("\n--- Phase 5: Writing Output File ---")
    try:
        # Generate XML string (pretty-printed)
        xml_string_rough = ET.tostring(master_root, encoding='unicode', method='xml')
        dom = minidom.parseString(xml_string_rough)
        pretty_xml_string = dom.toprettyxml(indent="  ")

        with open(output_file, "w", encoding="utf-8") as f:
            f.write(pretty_xml_string)
        print(f"Successfully created master playlist: '{output_file}'")
    except IOError as e:
        print(f"Error writing XML to file '{output_file}': {e}")
    except Exception as e:
        print(f"An unexpected error occurred during XML writing: {e}")

# --- Main Execution ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Consolidate, clean, sort, and deduplicate YouTube playlist XML files.")
    parser.add_argument("-s", "--source",
                        default="/Users/mikeclarkin/Desktop/youtube_playlist_parser", # Default as requested
                        help="Directory containing the source XML playlist files.")
    parser.add_argument("-o", "--output",
                        default="MASTER PLAYLIST.xml",
                        help="Name for the output consolidated XML file (will be saved in the *current working directory* unless a full path is given).")

    args = parser.parse_args()

    # Important: Determine absolute path for output to avoid saving inside source dir by default
    # If output path is just a filename, save it where the script is run
    if not os.path.dirname(args.output):
        output_path = os.path.join(os.getcwd(), args.output)
    else: # User provided a path (relative or absolute)
        output_path = args.output

    consolidate_playlists(args.source, output_path)
    print("\nScript finished.")