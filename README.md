# Music Video Jukebox

A modern web-based music video jukebox application built with HTML5, CSS3, and JavaScript.

## Features

- Browse and search through a library of music videos
- Queue up videos for playback
- Responsive design that works on various screen sizes
- Touch-friendly interface for use on touchscreens
- Now Playing and Coming Up tickers
- Credit system (Free Play mode)
- Artist and song filtering
- Keyboard navigation support

## Setup

Because web browsers have security restrictions about loading local files directly (`file:///...`), you **MUST** run a simple local web server to access the application correctly.

### Starting the Local Web Server

1. Open the **Terminal** application
2. Navigate to the directory where you saved the jukebox files:
   ```bash
   cd /path/to/your/jukebox/directory
   ```
3. Start the Python HTTP server:
   ```bash
   python3 -m http.server 8000
   ```
   * If port `8000` is already in use, try a different port like `8080`
   * Keep the Terminal window open! The server runs as long as this window is open

### Opening the Application

1. Open your web browser (Chrome recommended)
2. In the address bar, type: `http://localhost:8000`
3. Press Enter. You should see the main jukebox interface with the filters and video grid

### Using the Jukebox

1. Use the letter filters (A-Z) or search bar to browse videos
2. Click on a video tile to add it to the queue
3. A confirmation popup will appear - click "✓" to add the video
4. The player window will automatically start playing the first song added

## Requirements

- Modern web browser (Chrome recommended)
- Internet connection for YouTube video playback
- Touchscreen (optional, for touch interface)
- Python 3.x (for running the local web server)

## Project Structure

- `index.html` - Main application page
- `style.css` - Main stylesheet
- `script.js` - Main application logic
- `player.js` - YouTube player integration
- `player.html` - YouTube player window
- `Videos_by_Artist.JSON` - Database of music videos
- `Thumbnails/` - Directory containing video thumbnails

## License

MIT License - feel free to use this code for your own projects.
