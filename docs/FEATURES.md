# Feature map

Features can be switched on/off at runtime by the root administrator (Admin → Feature controls): *enabled*, *locked* (visible, with a message), *hidden* or *page disabled*. Navigation, command palette and route guards all follow the same map (`packages/shared/src/features.ts`).

| Area | Web | Mobile |
| --- | :-: | :-: |
| Sign-up/in, sessions, password reset, email verification | ✅ | ✅ (sign-in/up) |
| Home dashboard, daily challenge, streaks, XP and levels | ✅ | ✅ |
| Study hall: discussions, questions by subject, ranked answers, helpful votes, best answer (+XP), study notes, polls, bookmarks | ✅ | ✅ (questions, notes, answers, best answer, polls, save) |
| Study tips (24 h) | ✅ | ✅ |
| Video lessons, one-minute lessons, teachers' channels, lesson series, history, teaching studio analytics | ✅ | ✅ (watch, comments, follow, publish a lesson, studio stats) |
| Lesson outline from timestamps, checkpoint quiz after the lesson, private timestamped notes, subject filter | ✅ | ✅ (outline, checkpoint, notes) |
| Learning loop: lesson watching counts as study time + streak, lesson XP, study inbox suggests unfinished lessons and untaken checkpoints, quiz results link back to lessons, mistakes → flashcards | ✅ | ✅ |
| Pronunciation lab (listen, speak, word-by-word score, weak words → practice or flashcards, XP) | ✅ | ✅ (speech recognition in app builds; listen-only in Expo Go) |
| Read aloud in the text's own language | ✅ (posts, answers, quizzes, flashcards, tutor) | ✅ (posts, answers, quizzes) |
| Groups, communities, channels, resources, group leaderboard | ✅ | ✅ (groups, posts, members) |
| Direct and group chat, typing, read receipts, files, voice notes | ✅ | ✅ |
| Quizzes, tests, exams, smart practice, results review | ✅ | ✅ |
| Flashcards, weekly plan, study sessions, focus timer, mastery, exams countdown, planner tasks and notes | ✅ | ✅ |
| AI tutor, math solver, essay grading, study assistant | ✅ | ✅ |
| Documents, spreadsheets (formulas), slides, whiteboards + Office export | ✅ | opens the web editor |
| Forms builder (graded forms, analytics, CSV) | ✅ | ✅ (fill any form, see your forms; building opens the web) |
| Library with approval workflow | ✅ | ✅ (browse, open, upload for review) |
| Courses, assignments, grades, attendance | ✅ | ✅ (courses, join/create, stream, assignments with files, grading, grades, materials) |
| Live classes: camera, mic, screen share, whiteboard, hand, moderation, recording, chat | ✅ | opens web room |
| Workshops and revision sessions with RSVP | ✅ | ✅ |
| Profiles, follow, leaderboard, achievements | ✅ | ✅ |
| Notifications (in-app, realtime) | ✅ | ✅ |
| Settings: profile, 6 designs × 8 skins × light/dark, 4 languages with proper plurals, text size, privacy, data export/delete | ✅ | ✅ |
| Admin console (12 tabs) | ✅ | opens the web console |
| Admin feature controls (hide / lock / disable) | ✅ | ✅ (applied to the tools hub and screens) |
