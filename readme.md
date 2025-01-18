# WatchBee for Vmix
A lightweight utility that automatically manages vMix playlists by monitoring a folder for file changes. When video files are added, removed, or modified in the watched folder, the tool automatically updates the corresponding vMix playlist.

## Features

- Automatically adds new video files to a vMix playlist
- Removes files from the playlist when deleted from the watched folder
- Updates playlist when files are modified
- Handles file renaming
- Configurable through a simple JSON file

## Installation

1. Download the latest release executable from the releases page
2. Place the executable in any folder where you have write permissions
3. Run the executable for the first time - it will create a default `config.json` file in the same directory

## Configuration

The tool uses a `config.json` file that will be automatically created in the same directory as the executable with these default settings:

```json
{
  "folderToWatch": "./media",
  "vmixUrl": "http://localhost:8088",
  "playlistName": "List",
  "supportedExtensions": [".mp4", ".mov", ".wmv", ".avi", ".mpg", ".mpeg"]
}
```

You can modify these settings:

- `folderToWatch`: The directory to monitor for video files (relative or absolute path)
- `vmixUrl`: The URL where vMix API is accessible
- `playlistName`: The name of the vMix playlist to manage
- `supportedExtensions`: Array of supported video file extensions

## Usage

1. Make sure vMix is running and the API is accessible
2. Create a playlist in vMix with the name specified in your config (default is "List")
3. Run the executable
4. Add, remove, or modify video files in your watched folder - the tool will automatically update the vMix playlist

## Requirements

- vMix must be running and accessible via its API
- The watched folder must exist and be accessible
- The executable needs write permissions in its directory to create/update the config file

## Troubleshooting

Common issues and solutions:

1. **Playlist not updating**: 
   - Verify vMix is running
   - Check if the vMix API URL is correct in config.json
   - Ensure the playlist name matches exactly with the one in vMix
   - Check that the File path for the watcher and VMIX is the same when not using it on localhost.

2. **Files not being detected**:
   - Verify the watched folder path is correct
   - Check if the file extension is in the supported extensions list
   - Ensure the tool has read access to the watched directory

3. **Config file errors**:
   - Make sure the executable has write permissions in its directory
   - Verify the config.json format is valid JSON

## Technical Details

The tool:
- Uses the vMix API to manage playlists
- Monitors file system events using chokidar
- Supports both relative and absolute paths
- Handles file system events with debouncing to prevent duplicate operations
- Automatically creates a default configuration if none exists

## License

[MIT License](LICENSE)

## Contact
Please open an Issue for Feature Requests and Issues.

Developed with ❤️ by ByteHive