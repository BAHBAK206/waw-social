# Feature map

Features can be switched on/off at runtime by the root administrator (Admin → Feature controls): *enabled*, *locked* (visible, with a message), *hidden* or *page disabled*. Navigation, command palette and route guards all follow the same map (`packages/shared/src/features.ts`).

| Area | Web | Mobile |
| --- | :-: | :-: |
| Sign-up/in, sessions, password reset, email verification | ✅ | ✅ |
| Home dashboard, daily challenge, streaks, XP and levels | ✅ | ✅ |
| Study hall: discussions, questions by subject, ranked answers, helpful votes, best answer (+XP), study notes, polls, bookmarks | ✅ | ✅ |
| Study tips (24 h) | ✅ | ✅ |
| Video lessons, one-minute lessons, teachers' channels, lesson series, history, teaching studio analytics | ✅ | ✅ |
| Lesson outline from timestamps, checkpoint quiz after the lesson, private timestamped notes, subject filter | ✅ | ✅ |
| Learning loop: lesson watching counts as study time + streak, lesson XP, study inbox suggests unfinished lessons and untaken checkpoints, quiz results link back to lessons, mistakes → flashcards | ✅ | ✅ |
| Pronunciation lab (listen, speak, word-by-word score, weak words → practice or flashcards, XP) | ✅ | ✅ (speech recognition in app builds; listen-only in Expo Go) |
| Read aloud in the text's own language | ✅ (posts, answers, quizzes, flashcards, tutor) | ✅ (posts, answers, quizzes, flashcards, tutor) |
| Groups, communities, channels, resources, group leaderboard | ✅ | ✅ |
| Direct and group chat, typing, read receipts, files, voice notes | ✅ | ✅ |
| Teacher voice: voice feedback on graded work, voice announcements, voice comments and answers | ✅ | ✅ |
| Quizzes, tests, exams, smart practice, results review | ✅ | ✅ |
| Flashcards, weekly plan, study sessions, focus timer, mastery, exams countdown, planner tasks and notes | ✅ | ✅ |
| AI tutor, math solver, essay grading, study assistant | ✅ | ✅ |
| Documents, spreadsheets (formulas), slides, whiteboards + Office export | ✅ | ✅ (same editors, opened in the app already signed in) |
| Forms builder (graded forms, analytics, CSV) | ✅ | ✅ (build, fill, responses; advanced analytics in the same web screen inside the app) |
| Library with approval workflow | ✅ | ✅ |
| Courses, assignments, grades, attendance | ✅ | ✅ |
| Live classes: camera, mic, screen share, whiteboard, hand, moderation, recording, chat | ✅ | ✅ (create natively; the room runs in the app with camera/mic, signed in) |
| Workshops and revision sessions with RSVP | ✅ | ✅ |
| Profiles, follow, leaderboard, achievements | ✅ | ✅ |
| Notifications (in-app, realtime) | ✅ | ✅ |
| Settings: profile, 6 designs × 8 skins × light/dark, 4 languages with proper plurals, text size, privacy, data export/delete | ✅ | ✅ |
| Admin console (12 tabs) | ✅ | ✅ (same console inside the app, signed in) |
| Admin feature controls (hide / lock / disable) | ✅ | ✅ (applied to the tools hub and screens) |
