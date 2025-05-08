import json
import os
import requests
import time
from urllib.parse import quote

# ==============================================
# CONFIGURATION
# ==============================================
IMVDB_API_KEY = "g62MJ5GkeTWY2kLtrp42EKqi0j8DbSLaMiNKJic8"
IMVDB_API_URL = "https://imvdb.com/api/v1"
INPUT_FILE1 = os.path.expanduser("~/Desktop/VIDEO_JUKEBOX_PROJECT/ALL_SONG_LIST_A-Z_with_youtube_scraped.json")
INPUT_FILE2 = os.path.expanduser("~/Desktop/VIDEO_JUKEBOX_PROJECT/Original_Obie_MasterDB_SCHEMA.json")
OUTPUT_FILE = os.path.expanduser("~/Desktop/VIDEO_JUKEBOX_PROJECT/Music_Video_Collection.json")
MERGED_FILE = os.path.expanduser("~/Desktop/VIDEO_JUKEBOX_PROJECT/_MERGED_UNENRICHED_DATA.json")
BACKUP_INTERVAL = 300  # Auto-save every 5 minutes during enrichment

# Rate limiting setup
RATE_LIMIT = 800  # requests per minute
MIN_INTERVAL = 60.0 / RATE_LIMIT
last_request_time = 0

# ==============================================
# CORE FUNCTIONS
# ==============================================

def rate_limited_request(url):
    global last_request_time
    elapsed = time.time() - last_request_time
    if elapsed < MIN_INTERVAL:
        time.sleep(MIN_INTERVAL - elapsed)
    try:
        response = requests.get(url)
        response.raise_for_status()
        last_request_time = time.time()
        return response.json()
    except Exception as e:
        print(f"\n⚠️ REQUEST FAILURE: {url[:70]}... | Error: {str(e)[:50]}...")
        return None

def get_imvdb_data(artist, song_title):
    try:
        print(f"\n🔍 IMVDB LOOKUP INITIATED: {artist[:20]}... - {song_title[:20]}...")
        encoded_artist = quote(f'"{artist}"')
        encoded_title = quote(f'"{song_title}"')
        search_url = f"{IMVDB_API_URL}/search/videos?q={encoded_artist}+{encoded_title}&access_token={IMVDB_API_KEY}"
        
        search_data = rate_limited_request(search_url)
        
        if not search_data or not search_data.get("results"):
            print(f"❌ NO IMVDB RESULTS: {artist[:20]}... - {song_title[:20]}...")
            return {"Year": None, "Duration": None, "Genres": None}

        first_result = search_data["results"][0]
        video_id = first_result.get("id")
        if not video_id:
            return {"Year": None, "Duration": None, "Genres": None}

        video_url = f"{IMVDB_API_URL}/video/{video_id}?access_token={IMVDB_API_KEY}"
        video_data = rate_limited_request(video_url)

        result = {"Year": None, "Duration": None, "Genres": None}
        if video_data:
            if video_data.get("release_date"):
                result["Year"] = video_data["release_date"][:4]
            result["Duration"] = video_data.get("duration")
            result["Genres"] = [g["name"] for g in video_data.get("genres", [])]
        
        print(f"✅ IMVDB LOOKUP COMPLETE: {artist[:20]}... - {song_title[:20]}...")
        return result
    except Exception as e:
        print(f"\n🔥 CRITICAL IMVDB ERROR: {artist[:20]}... - {song_title[:20]}... | {str(e)[:50]}...")
        return {"Year": None, "Duration": None, "Genres": None}

def load_and_merge_files():
    merged = {}
    print("\n" + "="*70)
    print("📂 FILE PROCESSING PHASE".center(70))
    print("="*70)
    
    for file_idx, file_path in enumerate([INPUT_FILE1, INPUT_FILE2], 1):
        try:
            if not os.path.exists(file_path):
                print(f"\n❌ MISSING FILE: {os.path.basename(file_path)}")
                continue
                
            file_size = os.path.getsize(file_path)
            print(f"\n📥 LOADING FILE {file_idx}/2: {os.path.basename(file_path)}")
            print(f"📏 FILE SIZE: {file_size/1024:.1f} KB")
            
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                songs = data.get("Videos", {}).get("Video", [])
                print(f"🔢 ENTRIES FOUND: {len(songs)}")
                
                for i, song in enumerate(songs, 1):
                    if i % 50 == 0 or i == len(songs):
                        print(f"📦 PROCESSED: {i}/{len(songs)} entries ({i/len(songs)*100:.1f}%)")
                    
                    artist = song.get("Artist", "").strip()
                    title = song.get("SongTitle", "").strip()
                    if not artist or not title:
                        continue
                    
                    key = (artist.lower(), title.lower())
                    
                    if key in merged:
                        existing = merged[key]
                        for field in ["Year", "Duration", "Genres", "VideoID", "ThumbnailURL", "PlayCount"]:
                            if song.get(field) and not existing.get(field):
                                existing[field] = song[field]
                    else:
                        merged[key] = {
                            "Artist": artist,
                            "SongTitle": title,
                            "Year": song.get("Year"),
                            "VideoID": song.get("VideoID"),
                            "Duration": song.get("Duration"),
                            "ThumbnailURL": song.get("ThumbnailURL"),
                            "Genres": song.get("Genres"),
                            "PlayCount": song.get("PlayCount", 0)
                        }
                
                print(f"\n✅ COMPLETED: {os.path.basename(file_path)}")
                
        except json.JSONDecodeError:
            print(f"\n⚠️ CORRUPTED JSON: {os.path.basename(file_path)}")
        except Exception as e:
            print(f"\n⚠️ UNEXPECTED ERROR: {os.path.basename(file_path)} | {str(e)[:50]}...")

    print("\n" + "="*70)
    print(f"🎉 MERGED {len(merged)} UNIQUE ENTRIES".center(70))
    print("="*70)
    return list(merged.values())

def save_progress(data, file_path, description):
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump({"Videos": {"Video": data}}, f, indent=2, ensure_ascii=False)
        print(f"\n✅ {description} SAVED TO: {file_path}")
        return True
    except Exception as e:
        print(f"\n❌ FAILED TO SAVE {description}: {str(e)[:50]}...")
        return False

def process_songs():
    print("\n" + "="*70)
    print("🎬 PROCESSING PIPELINE INITIATED".center(70))
    print("="*70)
    start_time = time.time()
    last_backup = time.time()
    
    # Phase 1: Data Merging
    merged_songs = load_and_merge_files()
    
    # Phase 2: Save Raw Merged Data
    if not save_progress(merged_songs, MERGED_FILE, "RAW MERGED DATA"):
        return
    
    # Phase 3: Data Enrichment
    print("\n" + "="*70)
    print("🔧 DATA ENRICHMENT PHASE".center(70))
    print("="*70)
    
    total = len(merged_songs)
    enriched_count = 0
    for idx, song in enumerate(merged_songs, 1):
        # Progress updates
        if time.time() - last_backup > BACKUP_INTERVAL:
            if save_progress(merged_songs, MERGED_FILE, "AUTO-SAVE DURING ENRICHMENT"):
                last_backup = time.time()
        
        if idx % 10 == 0 or idx == total:
            elapsed = time.time() - start_time
            print(f"\n🔄 PROCESSING ENTRY {idx}/{total}")
            print(f"⏱️  ELAPSED TIME: {elapsed//60:.0f}m {elapsed%60:.0f}s")
            print(f"🎸 ARTIST: {song['Artist'][:30]}...")
            print(f"🎵 SONG: {song['SongTitle'][:30]}...")
        
        needs_lookup = any([
            not song.get("Year"),
            not song.get("Duration"),
            not song.get("Genres")
        ])
        
        if needs_lookup:
            print(f"\n🔎 INITIATING LOOKUP FOR: {song['Artist']} - {song['SongTitle']}")
            imvdb_data = get_imvdb_data(song["Artist"], song["SongTitle"])
            
            # Update only missing fields
            updates = []
            if imvdb_data["Year"] and not song["Year"]:
                song["Year"] = imvdb_data["Year"]
                updates.append("Year")
            if imvdb_data["Duration"] and not song["Duration"]:
                song["Duration"] = imvdb_data["Duration"]
                updates.append("Duration")
            if imvdb_data["Genres"] and not song["Genres"]:
                song["Genres"] = imvdb_data["Genres"]
                updates.append("Genres")
            
            if updates:
                enriched_count += 1
                print(f"✨ UPDATED FIELDS: {', '.join(updates)}")
    
    # Final backup after enrichment
    save_progress(merged_songs, MERGED_FILE, "ENRICHED DATA")
    
    # Phase 4: Sorting
    print("\n" + "="*70)
    print("🔀 SORTING PHASE".center(70))
    print("="*70)
    sorted_songs = sorted(
        merged_songs,
        key=lambda x: (x["Artist"].lower(), x["SongTitle"].lower())
    )
    print(f"\n📚 SORTED {len(sorted_songs)} ENTRIES")
    
    # Phase 5: ID Generation
    print("\n" + "="*70)
    print("🆔 ID GENERATION PHASE".center(70))
    print("="*70)
    current_artist = None
    artist_id = 0
    song_counter = 0
    
    for idx, song in enumerate(sorted_songs, 1):
        song["Index"] = idx
        song["Validated"] = bool(song.get("VideoID"))
        song["Genre"] = song["Genres"][0] if song["Genres"] else None
        
        if song["Artist"] != current_artist:
            print(f"\n🎸 NEW ARTIST DETECTED: {song['Artist'][:30]}... (ID: {artist_id + 1})")
            current_artist = song["Artist"]
            artist_id += 1
            song_counter = 1
        else:
            song_counter += 1
        
        song["ArtistID"] = artist_id
        song["SongID"] = (artist_id * 100) + song_counter
        
        if idx % 100 == 0:
            print(f"\n🏷️  PROCESSED IDS: {idx}/{len(sorted_songs)}")
            print(f"🎯 CURRENT ARTIST ID: {artist_id}")
            print(f"🔢 CURRENT SONG COUNTER: {song_counter}")
    
    # Phase 6: Final Output
    print("\n" + "="*70)
    print("💾 FINAL OUTPUT PHASE".center(70))
    print("="*70)
    output = {"Videos": {"Video": sorted_songs}}
    if save_progress(sorted_songs, OUTPUT_FILE, "FINAL OUTPUT"):
        print("\n" + "="*70)
        print(f"🎉 SUCCESSFULLY PROCESSED {len(sorted_songs)} ENTRIES".center(70))
        print("="*70)
    
    total_time = time.time() - start_time
    print(f"\n⏱️  TOTAL PROCESSING TIME: {total_time//3600:.0f}h {(total_time%3600)//60:.0f}m {total_time%60:.0f}s")
    print(f"✨ ENRICHED ENTRIES: {enriched_count}/{len(sorted_songs)}")
    print(f"💾 MERGED DATA SAVED TO: {MERGED_FILE}")
    print(f"📄 FINAL OUTPUT SAVED TO: {OUTPUT_FILE}")

if __name__ == "__main__":
    process_songs()