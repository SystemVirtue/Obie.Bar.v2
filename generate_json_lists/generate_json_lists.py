#!/usr/bin/env python3
import json
import re
from pathlib import Path
from collections import OrderedDict, defaultdict

INPUT_FILE = Path("Videos_by_Artist.JSON")
OUTPUT_FILE = Path("transformed_index.json")

def extract_yt_id(url: str) -> str:
    # match v=xxxxx or youtu.be/xxxxx
    m = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_\-]+)", url)
    return m.group(1) if m else url

def main():
    data = json.loads(INPUT_FILE.read_text())

    artists_by_id = {}
    songs_by_id = {}

    # build artists and songs dicts
    for artist in data:
        a_mbid = artist["mbid"]
        a_name = artist["artist_name"]
        artists_by_id[a_mbid] = {
            "artist_name": a_name,
            "artist_mbid": a_mbid,
            "songIds": []
        }
        for vid in artist.get("music_videos", []):
            yt_id = extract_yt_id(vid["youtube_url"])
            song_entry = {
                "song_title": vid["title"],
                "song_ytid": yt_id,
                "artist_mbid": a_mbid
            }
            songs_by_id[yt_id] = song_entry
            artists_by_id[a_mbid]["songIds"].append(yt_id)

    # sorted lists of IDs
    artist_list = sorted(
        artists_by_id.keys(),
        key=lambda aid: artists_by_id[aid]["artist_name"].lower()
    )
    song_list = sorted(
        songs_by_id.keys(),
        key=lambda sid: songs_by_id[sid]["song_title"].lower()
    )

    # allList: merge then sort by title/name
    all_items = []
    for aid in artist_list:
        all_items.append({"type": "artist", "id": aid, "label": artists_by_id[aid]["artist_name"]})
    for sid in song_list:
        all_items.append({"type": "song", "id": sid, "label": songs_by_id[sid]["song_title"]})
    all_list = sorted(
        all_items,
        key=lambda x: x["label"].lower()
    )
    # drop label for output
    all_list = [{"type": x["type"], "id": x["id"]} for x in all_list]

    # build index maps: letter -> 1-based position
    def build_index(id_list, lookup, keyfield):
        index = {}
        for pos, ident in enumerate(id_list, start=1):
            label = lookup[ident][keyfield]
            first = label[0].upper() if label else "#"
            if first.isalpha():
                letter = first
            else:
                letter = "#"
            if letter not in index:
                index[letter] = pos
        return index

    artist_index = build_index(artist_list, artists_by_id, "artist_name")
    song_index   = build_index(song_list,   songs_by_id,   "song_title")
    # for all_list, need a lookup of label
    all_lookup = {item["id"]: item for item in []}  # placeholder
    # rebuild lookup for all_list
    tmp = {}
    for aid in artists_by_id:
        tmp[aid] = {"label": artists_by_id[aid]["artist_name"]}
    for sid in songs_by_id:
        tmp[sid] = {"label": songs_by_id[sid]["song_title"]}
    all_index = {}
    for pos, item in enumerate(all_list, start=1):
        label = tmp[item["id"]]["label"]
        first = label[0].upper() if label else "#"
        letter = first if first.isalpha() else "#"
        if letter not in all_index:
            all_index[letter] = pos

    # assemble final
    out = {
        "artistsById": artists_by_id,
        "songsById":   songs_by_id,
        "artistList":  artist_list,
        "songList":    song_list,
        "allList":     all_list,
        "artistIndex": artist_index,
        "songIndex":   song_index,
        "allIndex":    all_index
    }

    OUTPUT_FILE.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"Wrote transformed JSON to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
