---
Task ID: 1
Agent: main
Task: Add YouTube playlist import feature to Masari PWA

Work Log:
- Explored current project state - read all key files (db-indexeddb.ts, store.ts, i18n.ts, page.tsx, app-shell.tsx, video-player.tsx, import-modal.tsx, settings.tsx, course-details.tsx, dashboard.tsx, courses-list.tsx)
- Created server-side YouTube Data API v3 route at `/api/youtube/playlist/route.ts`
  - Fetches playlist metadata, video list (with pagination), and video durations
  - Supports server env API key and user-provided API key
  - Handles errors (no API key, invalid key, playlist not found)
- Updated database types (db-indexeddb.ts) - added optional fields: Course.thumbnail, Course.sourceType, Course.sourceUrl, Course.channelTitle, Lesson.thumbnail, Lesson.videoId
- Updated i18n translations - added 22 new keys for YouTube import in both Arabic and English
- Created YouTube Import UI component (`youtube-import.tsx`) with 3-step wizard:
  1. URL input + API key configuration
  2. Playlist preview with video selection (select/deselect individual videos)
  3. Course assignment (new course or add to existing) + import
- Updated Zustand store - added isYouTubeImportOpen/setYouTubeImportOpen
- Updated App Shell - added YouTube import button (red) next to Excel import button
- Updated Main Page - imported and rendered YouTubeImport component
- Updated Settings - added YouTube API Key configuration section
- Updated Dashboard - added YouTube import quick stat card (3-column grid)
- Updated Courses List - added YouTube import button in empty state
- Fixed TypeScript errors: replaced Youtube icon (not in lucide-react) with inline SVG, fixed missing lang parameter in t() calls, fixed ringColor CSS property issue

Stage Summary:
- YouTube playlist import feature is fully implemented
- Server API route at /api/youtube/playlist
- Full 3-step import wizard with video selection
- API key configurable in settings and during import
- Build compiles with no TS errors in src/ files
- All UI components integrated into existing app flow

---
Task ID: 2
Agent: main
Task: Add filtering, Excel export, and play-by-filter features to YouTube playlist import

Work Log:
- Updated YouTube API route (/api/youtube/playlist/route.ts):
  - Added `publishedAt` (when video was published on YouTube)
  - Added `addedToPlaylistAt` (when video was added to playlist)
  - Added `durationSeconds` field for precise sorting
  - Now fetches video.snippet.publishedAt for accurate publish dates
- Added 30+ new translation keys for filtering, sorting, and export in Arabic and English
- Created Excel export utility functions in src/lib/excel.ts:
  - `exportYouTubePlaylistToExcel()` - generates formatted Arabic Excel with RTL view, column widths, all metadata
  - `downloadBlob()` - triggers browser download
  - `sanitizeFilename()` - cleans string for use as filename
  - Excel columns: نوع الدورة، المستوى، اسم الدرس، رابط الدرس، مدة الدرس، معرف الفيديو، القناة، تاريخ النشر، تاريخ الإضافة للقائمة، رقم الفيديو
- Rewrote YouTubeImport component with new features:
  - Filter by duration: All / Short (<5min) / Medium (5-20min) / Long (20-60min) / Very Long (>60min)
  - Filter by date: All / Last Week / Month / 3 Months / 6 Months / Year / Older
  - Sort by: Original / Shortest First / Longest First / Newest First / Oldest First / Title A-Z / Title Z-A
  - "Export Filtered" button - exports only currently filtered & selected videos to Excel
  - "Export All" button - exports entire playlist to Excel
  - Live filter result count and duration display
  - Select All / Deselect All Filtered buttons
  - Filter active indicator (red badge with !)
  - "Import Filtered Only" notice showing how many videos will be imported with active filters
  - Videos sorted by selected filter before import - so lessons in the app follow the chosen order
  - Selection uses videoId (string) instead of index for filter stability
- Build compiles successfully, no TypeScript errors in modified files
- Dev server tested: HTTP 200 on home, 400 on missing playlist ID, all working

Stage Summary:
- Feature 1 (Filter by size/date): DONE - 5 duration filters + 7 date filters + 7 sort options
- Feature 2 (Export to formatted Arabic Excel): DONE - Excel file with RTL, all metadata, importable back to app
- Feature 3 (Export full or filtered): DONE - Two separate export buttons (All / Filtered)
- Feature 4 (Play by filter): DONE - Filtered & sorted videos become lessons in that order; user starts course at first filtered video
