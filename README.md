# NetFS

A lightweight, self-contained file management system with a web interface. Upload, organize, and stream media files through your browser.

## Features

- 📁 **File Management**: Create folders, upload files, copy, move, rename, and delete
- 🎵 **Media Playback**: Built-in audio and video player for common formats
- 🌍 **Multi-language**: Automatic detection and support for Japanese, Korean, and English
- 📊 **Upload Progress**: Real-time upload progress tracking with SSE
- 🔄 **File Overwrite**: Automatically updates existing files when re-uploaded
- 📦 **Single Binary**: All assets embedded, no external dependencies required
- 🎨 **Clean UI**: Simple, responsive interface

## Supported Media Formats

**Audio**: MP3, M4A, WAV, OGG, FLAC, AAC  
**Video**: MP4, WebM, OGG, MOV, MKV

## Installation

### Prerequisites
- Go 1.16 or higher

### Build from source

```bash
git clone https://github.com/zolotayautka/NetFS.git
cd NetFS
go build
```

## Usage

1. Start the server:
```bash
./NetFS
```

2. Open your browser and navigate to:
```
http://localhost:8080
```

3. Start uploading and organizing your files!

## Configuration

- **Port**: Default is `8080` (modify in `main()` function)
- **Data Directory**: `./data` (file storage location)
- **Database**: `./database.db` (SQLite database)

## API Endpoints

### File Operations
- `GET /node/:id` - Get node information and children
- `GET /file/:id` - Download or stream file
- `POST /upload` - Upload file or create folder
- `POST /copy` - Copy file/folder
- `POST /move` - Move file/folder
- `POST /rename` - Rename file/folder
- `POST /delete` - Delete file/folder

### Progress Tracking
- `GET /upload/progress?upload_id=<id>` - SSE endpoint for upload progress

## Project Structure

```
NetFS/
├── app.go          # Main backend logic
├── index.html      # Web interface
├── index.js        # Frontend logic
├── i18n.js         # Internationalization
├── data/           # File storage (created automatically)
└── database.db     # SQLite database (created automatically)
```

## Technical Details

### Backend
- **Language**: Go
- **Database**: SQLite with GORM
- **Features**: 
  - File streaming with Range request support
  - Server-Sent Events for progress tracking
  - MIME type detection
  - Hierarchical folder structure

### Frontend
- **Vanilla JavaScript**: No frameworks required
- **Features**:
  - Drag-and-drop support (via file input)
  - Real-time upload progress
  - Media player integration
  - Responsive design

## Language Support

The interface automatically detects your browser language and displays in:
- 🇯🇵 Japanese (ja)
- 🇰🇷 Korean (ko)
- 🇬🇧 English (en - default)

## Development

### Adding a new language

1. Edit `i18n.js` and add your language code:
```javascript
const i18n = {
  // ... existing languages
  fr: {
    home: 'Accueil',
    // ... add all translations
  }
};
```

2. Update `index.js` language detection:
```javascript
if(userLang.startsWith('ja')) lang = 'ja';
else if(userLang.startsWith('ko')) lang = 'ko';
else if(userLang.startsWith('fr')) lang = 'fr'; // add this
else lang = 'en';
```

### Modifying supported media formats

Edit the `isMediaByName()` function in `index.js`:
```javascript
const audio = ['mp3','m4a','wav','ogg','flac','aac','your-format'];
const video = ['mp4','webm','ogg','mov','mkv','your-format'];
```

## Security Considerations

⚠️ **This is a development/personal use tool**. For production use, consider:
- Adding authentication/authorization
- Implementing rate limiting
- Adding HTTPS support
- Sanitizing file names
- Restricting file types
- Adding file size limits

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Roadmap

- [ ] User authentication
- [ ] File sharing with links
- [ ] Thumbnail generation for images/videos
- [ ] Search functionality
- [ ] Bulk operations
- [ ] Zip download for folders
- [ ] Dark mode

## Troubleshooting

**Issue**: Cannot upload file with same name as folder  
**Solution**: This is by design to prevent conflicts. Rename the file or folder first.

**Issue**: Media file won't play  
**Solution**: Check if the file format is supported. The browser may not support all codecs even if the container format is listed.

**Issue**: Upload progress stuck at 0%  
**Solution**: Check browser console for errors. Ensure the upload_id parameter is being passed correctly.

---

Made with ❤️ using Go and vanilla JavaScript
