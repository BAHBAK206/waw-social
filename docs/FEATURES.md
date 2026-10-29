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
| Documents, spreadsheets (formulas), slides, whiteboards + Office export | ✅ | ✅ (native document editor with autosave; sheets, slides and whiteboards open the web editors in the app, signed in) |
| Forms builder (graded forms, analytics, CSV) | ✅ | ✅ (build, fill, responses; advanced analytics in the same web screen inside the app) |
| Library with approval workflow | ✅ | ✅ |
| Courses, assignments, grades, attendance | ✅ | ✅ |
| Live classes: camera, mic, screen share, whiteboard, hand, moderation, recording, chat | ✅ | ✅ (create natively; the room runs in the app with camera/mic, signed in) |
| Workshops and revision sessions with RSVP | ✅ | ✅ |
| Profiles, follow, leaderboard, achievements | ✅ | ✅ |
| Notifications (in-app, realtime) | ✅ | ✅ |
| Push notifications while the app is closed, in each reader's language | ✅ (web push) | ✅ (Expo) |
| Settings: profile, 6 designs × 8 skins × light/dark, 4 languages with proper plurals, text size, privacy, data export/delete | ✅ | ✅ |
| Accessibility: high contrast (AAA), dyslexia-friendly font and spacing, reduce motion | ✅ | ✅ |
| Admin console (12 tabs) | ✅ | ✅ (same console inside the app, signed in) |
| Admin feature controls (hide / lock / disable) | ✅ | ✅ (applied to the tools hub and screens) |
| Safety: report posts/comments/messages/stories/profiles, word filter (4 languages), auto-hide after reports, under-18 protections, block + blocked list | ✅ | ✅ |
| Lesson captions and searchable transcript (upload, automatic, translated), search inside lesson speech | ✅ | ✅ |
| Teacher AI tools: quiz, summary, chapters and ideas from a lesson | ✅ | ✅ |
| Adaptive video (360p/720p/1080p HLS), CDN | ✅ | ✅ |
| Parent accounts (linked by the student's code), weekly email report | ✅ | ✅ |
| "Who needs help": at-risk students with reasons, encourage / message | ✅ | ✅ |
| Course catalog, paid courses (Stripe), school vouchers, verifiable certificates | ✅ | ✅ (iPhone: vouchers only, per App Store rules) |
| Weekly leagues with promotion and relegation | ✅ | ✅ |
| Calendar feed (Google / Apple / Outlook), class roster import from CSV (e.g. Google Classroom) | ✅ | ✅ |
| Offline: downloaded lessons with captions, offline flashcards, sync queue | — | ✅ |
| Backups, error alerts, health and last-backup status in the admin overview | ✅ | — |
| Curriculum map (subject → unit → lesson → objective), mastery per objective, placement test and personal plan | ✅ | ✅ |
| Question banks, per-student exams from blueprints, shuffled choices, exam mode, item analysis | ✅ | ✅ (blueprints edited on the web) |
| Local payments: Paymob cards and wallets (EGP), InstaPay / wallet / bank transfer with receipt approval | ✅ | ✅ (Android) |
| Math formulas ($…$) in quizzes, posts, comments and answers, with symbol buttons | ✅ (KaTeX) | ✅ (readable math) |
| WhatsApp / SMS for parents: confirmed number, weekly report, absence and low-grade alerts | ✅ | ✅ |
| Schools: administrators, bulk import from CSV, class sections, official report cards (print / PDF) | ✅ | ✅ (report cards open in the browser) |
| AI guard rails: hints-only mode, paused during exams, rubric feedback, copying check | ✅ | ✅ |
| Live classes: breakout groups, quick questions and polls, automatic attendance | ✅ | ✅ (same live room) |
| Two-step sign-in (authenticator app), parental consent under 13, Content-Security-Policy | ✅ | ✅ |
| Daily review: due flashcards plus the quiz questions you missed (spaced repetition), recurring-mistake list with a practice link, weak objectives | ✅ | ✅ |
| Study pack: key terms, mind map, flashcards and practice questions from pasted text, a note or a lesson; saves to flashcards and the glossary | ✅ | ✅ (opens in the app's browser view) |
| Weekly plan → "Add to my sessions": puts homework, exams and tasks on the plan's days | ✅ | — |
| Focus mode: push notifications held back and social pages hidden until the timer ends, with weekly stats | ✅ | ✅ (notifications held back; menus unchanged) |
| Voice tutor: speak a question and hear the reply read aloud | ✅ (browser) | ✅ |
| Past exam papers: year and board, a "Past papers" list with a year filter | ✅ | ✅ |
| Glossary per subject: your own terms, terms teachers share with a class, terms found in a pasted lesson | ✅ | ✅ |
| Study groups: shared task list, this week's study-time ranking, scheduled study sessions (events) | ✅ | ✅ (opens in the app's browser view) |
| Class weekly study goal with class badge and XP when reached; weekly challenge between the classes of a school (study minutes per student) | ✅ | ✅ |
| Study mentors: seniors list the subjects they can help with; answers stay public in the study hall | ✅ | ✅ (opens in the app's browser view) |
| Lesson-plan generator from a curriculum objective (timeline, linked resources, sample questions, print) | ✅ | ✅ (opens in the app's browser view) |
| Grade a paper from a photo: text recognition (when the server has it), answer key, suggested marks the teacher approves into a manual grade component | ✅ | ✅ (browser view) |
| Compare classes by objective (average per objective, per class) | ✅ | ✅ (browser view) |
| Tiered worksheets (foundation / core / advanced) from an objective or question bank, optionally saved as three quizzes | ✅ | ✅ (browser view) |
| Shared quiz and assignment templates inside a school | ✅ | ✅ (browser view) |
| One-tap suggested personal note per student (from marks, attendance and missing work), reviewed then sent to the student and parents | ✅ | ✅ (students and parents read the notes on Grades) |
| Principal dashboard: attendance, average marks and pass rate per class and subject, print / PDF | ✅ | ✅ (browser view) |
| School fees: monthly instalments per student or section, pay by card or wallet (Paymob) or by transfer with a receipt the school approves, reminders (app and WhatsApp), printable receipt | ✅ | ✅ (browser view) |
| School announcements by audience (optionally also to parents' phones) and a school calendar merged with homework due | ✅ | ✅ (browser view) |
| School timetable with clash detection (teacher, room, section) and handing a class to another teacher | ✅ | ✅ (browser view) |
| Anonymous satisfaction surveys (ratings and comments) for students, parents or teachers | ✅ | ✅ (browser view) |
