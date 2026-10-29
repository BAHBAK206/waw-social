import type { GuideBook } from './types';

export const en: GuideBook = {
  school: {
    title: 'Classroom',
    summary:
      'Your classes in one place. A teacher creates a class, students join with a code, and everything for that subject lives inside it: announcements, homework, materials, attendance and grades.',
    steps: [
      'Teacher: open Classroom and choose “New class”. Give it a name and a subject; a join code is created for you.',
      'Share the join code (or the invite link) with your students. Students open Classroom, choose “Join a class” and type the code.',
      'Stream is the class wall: post announcements and questions; students can comment.',
      'Classwork holds assignments and quizzes with due dates. Students hand in work there; the teacher grades it and leaves feedback.',
      'Materials holds files and links. They are also read by the class AI, so students can ask questions about them.',
      'Attendance lets the teacher mark present, late, absent or excused for each session.',
      'Insights and “Who needs help” show which students are falling behind (missed work, low marks, low study time) so you can act early.',
    ],
    tips: [
      'Set up “Subject grading” in the class settings first, so every mark counts toward the right total.',
      'You can import classes from Google Classroom from the Classroom page.',
      'Parents linked to a student see that student’s homework, attendance and marks, but cannot post in the class.',
      'With a rubric, students can get AI feedback on their draft, and you can get suggested levels; “Check for copying” compares submissions with each other and with your materials.',
    ],
    roles: {
      student: 'Join with the code, hand in work before the due date, and check Grades to see your result in each subject.',
      teacher: 'Only the class teacher (and co-teachers) can grade, take attendance and change settings.',
      parent: 'Parents do not join classes. You follow your child from the Family page.',
    },
  },
  grades: {
    title: 'Subject grading and report card',
    summary:
      'Each class can be graded like a real school subject: a subject code, a total (out of 60, 80, 100…), a pass mark, and parts such as homework, monthly tests and the final exam. The report card adds everything up.',
    steps: [
      'Teacher: open the class, go to Settings → Subject grading.',
      'Type the subject code (for example MATH-301), the term, the total marks (for example 60) and the pass mark (for example 30).',
      'Split the total into parts, for example homework 10 + monthly tests 20 + final exam 30 = 60.',
      'Choose where each part takes its marks from: assignments (their average), attendance (the attendance rate), or marks you type in yourself.',
      'When you create an assignment, pick which part it belongs to. Late work that was never handed in counts as zero after the due date.',
      'Open the Grades tab to see every student’s marks per part and the subject total. You can type marks for manual parts and export a CSV.',
      'Students see their result in the class and the full report card under Grades; linked parents see the same report card.',
    ],
    tips: [
      'Turn off “Counts in the overall total” for subjects outside the total, such as religion or activities.',
      'Ratings: 85% and above Excellent, 75% Very good, 65% Good, at or above the pass mark Pass, below it Fail.',
      'Excused absences do not count against attendance marks; late counts as present.',
    ],
    roles: {
      student: 'You see your own marks only. If a mark looks wrong, message your teacher from the class.',
      teacher: 'Only you and your co-teachers can see the whole class gradebook.',
      parent: 'Open Grades or the Family page to read each linked child’s report card.',
    },
  },
  family: {
    title: 'Parent account',
    summary:
      'A parent account is linked to one or more students. Parents follow study time, homework, attendance, quiz results and the report card, choose what a child under 18 can do, and can message their child’s teachers. Parents cannot post in classes or see private messages.',
    steps: [
      'Create an account and choose “Parent” as the account type (parents must be 18 or older).',
      'Link your child in one of two ways: the student sends you an invite from Settings → Family (by email), or you open Family → “Link a child” and type the student’s email or username.',
      'The other side approves the request. Until then it shows as pending on both accounts.',
      'Open Family and choose a child to see this week’s study time, upcoming homework, attendance, quiz results and the report card.',
      'For a child under 18, set the controls: who can message them (classmates and teachers only, or people they know), public posts, joining groups and the AI.',
      'Use “Message teacher” next to a class to contact the teacher directly.',
      'To get reports on your phone: Settings → Family → WhatsApp and SMS. Type your number, enter the 6-digit code you receive, then choose the weekly report and/or instant alerts (absence, a grade below half).',
    ],
    tips: [
      'Under-13 students start in the safest mode (classes-only messages, no public posts) until a parent changes it.',
      'A linked student cannot change their own school year; ask the parent to do it.',
      'Either side can remove the link at any time from the Family page.',
    ],
    roles: {
      student: 'Invite your parent from Settings → Family. You can see exactly which controls apply to you.',
      teacher: 'Parents of your students can message you. You never see the parent’s other children.',
      parent: 'You see progress, not private chats or drafts. You cannot hand in work or take quizzes for your child.',
    },
  },
  safety: {
    title: 'Age protection and school stages',
    summary:
      'Every student picks a school year, from Primary 1 to university. Students under 18 get extra protection automatically, and the youngest (under 13) get the strictest settings.',
    steps: [
      'At sign-up, choose your school year (Primary 1–6, Preparatory 1–3, Secondary 1–3, University). You can also add your birth year.',
      'Qubedu uses the stricter of the two: if either your birth year or your school year says you are under 13, the under-13 rules apply.',
      'Under 13: messages only from classmates and teachers, no public posts, you are hidden from people search for strangers, and some features wait for a parent.',
      '13 to 17: messages from people you know (classmates, teachers, people you follow each other with), public posts allowed unless a parent turns them off.',
      'Students under 18 cannot switch their account to teacher or parent.',
      'Anyone can report a post, comment, message or profile. Reports that involve a student under 18 are shown first to the moderators.',
    ],
    tips: [
      'Teachers and parents must be adults; their age comes from their birth year only.',
      'Blocking someone hides you from each other and stops their messages straight away.',
    ],
    roles: {
      student: 'Settings → Privacy shows what is allowed for your account and why.',
      teacher: 'You can always message students in your own classes.',
      parent: 'You can loosen or tighten each control for your child from the Family page.',
    },
  },
  verification: {
    title: 'Teacher verification and who can do what',
    summary:
      'Anyone can create a teacher account and run private classes. Public powers — selling or listing courses, open live classes, publishing to the library without review and the “verified teacher” badge — need verification by the administrators.',
    steps: [
      'Open Settings → Account → Teacher verification.',
      'Fill in your school or institution, the subject you teach, and a proof link (for example your school profile page or a certificate). Add a note if it helps.',
      'Send the request. Administrators review it and either approve it or explain why it was rejected.',
      'Once approved, a check mark appears next to your name, your answers to questions are marked as verified, and you can list courses publicly, sell them, and open public live classes.',
      'If you are rejected, read the reason, fix what is missing and send a new request.',
    ],
    tips: [
      'Students: learn, join classes, ask and answer questions, take quizzes. Teachers: everything students do, plus create classes, quizzes, grades and attendance.',
      'Parents: follow linked children and message their teachers; they cannot join classes or post publicly for a child.',
      'The full table is in the help center under “Who can do what”.',
    ],
    roles: {
      student: 'A check mark next to a teacher’s name means the administrators verified them.',
      teacher: 'Without verification you keep all classroom tools for your own classes.',
      parent: 'Teachers who contact you about your child are the teachers of their classes.',
    },
  },
  classes: {
    title: 'Live classes',
    summary: 'Teach or join a lesson live, with camera, microphone, screen sharing, a shared whiteboard, chat, raised hands and recording.',
    steps: [
      'Teacher: from a class choose “New live room”, or open Live classes and create one. Pick who can join: the class only, or anyone (open rooms need a verified teacher).',
      'Choose what students may use: camera, microphone, screen sharing and chat.',
      'Start the room at lesson time. Students in the class get a notification and join with one tap.',
      'Students join muted with the camera off. Raise your hand to ask to speak; the teacher sees how many hands are up.',
      'Use the whiteboard to explain, and Record to save the lesson for students who missed it.',
      'During the class, use “Questions & polls” for a quick question (mark the right answer to make it a quiz), “Group work” to split students into rooms, and “Attendance” to see who is there. When a class lesson ends, its register is filled in automatically.',
    ],
    tips: [
      'If audio or video does not start, allow the camera and microphone for the site in your browser settings.',
      'On a slow connection, turn your camera off: you keep hearing and seeing the teacher.',
    ],
    roles: {
      student: 'Join on time: the teacher may take attendance during the live class.',
      teacher: 'You decide what students may use, and you can end the room for everyone.',
      parent: 'Parents do not join live classes.',
    },
  },
  academic: {
    title: 'My study',
    summary:
      'Your personal study space: a weekly plan, study sessions, exam countdowns, flashcards with spaced repetition, a focus timer and mastery per subject. Everything you do counts toward your streak and XP.',
    steps: [
      'Add your exams with their dates. Qubedu shows countdowns and can export them to your calendar.',
      'Build a weekly plan: pick subjects and times. Today’s plan appears on your home page.',
      'Start a focus session (Pomodoro) when you study. Study minutes count toward your daily goal and streak; lessons and quizzes count too.',
      'Create flashcard decks. Review the cards that are due each day: the ones you get wrong come back sooner.',
      'Words you mispronounce in the Pronunciation lab can be turned into flashcards automatically.',
      'Mastery shows how strong you are in each subject based on quizzes and reviews, so you know what to revise next.',
    ],
    tips: ['Ten minutes of flashcards every day beats two hours once a week.', 'Set a realistic daily goal; you can change it any time.'],
    roles: {
      student: 'Your parent sees your study time, not your notes or flashcards.',
      teacher: 'You can use the same tools for your own learning.',
      parent: 'Encourage the daily streak: it builds a habit.',
    },
  },
  assistant: {
    title: 'Qubedu AI',
    summary:
      'Two helpers: the Qubedu assistant answers questions about using the site and about your subjects, and the Study tutor solves math step by step and answers from your class materials, with sources.',
    steps: [
      'Open Qubedu AI and type your question in your own language.',
      'For questions about the site (“how do I join a class?”), the assistant answers from the help guides and links you to the right page.',
      'For subject questions, it searches the materials of the classes you are in and shows the source (file and page) under the answer.',
      'Math: write the problem (for example 2x + 3 = 11) and you get the answer with numbered steps.',
      'Rate answers with thumbs up or down; teachers and administrators use this to improve the knowledge base.',
    ],
    tips: [
      'Teachers feed the AI by uploading materials to a class; administrators add common questions and answers in the moderation console.',
      'There is a daily limit of questions per account.',
      'For students under 18, a parent can turn the AI off.',
      'Tick “Guide me (hints, not answers)” to learn step by step. During an exam the AI pauses until you submit.',
    ],
    roles: {
      student: 'The AI only reads materials from your own classes.',
      teacher: 'Students only see materials you made visible to them.',
      parent: 'You can switch the AI on or off for your child from the Family page.',
    },
  },
  quiz: {
    title: 'Quizzes and exams',
    summary: 'Practice quizzes, timed exams and adaptive practice, graded on the server with instant results and explanations.',
    steps: [
      'Open Quizzes and pick one, or choose “Adaptive practice” to get questions at your level.',
      'Answer the questions; timed exams show a countdown and submit automatically at the end.',
      'See your score, the right answers and the explanations.',
      'Teacher: choose “New quiz”, add questions (one answer, several answers, true/false or short answer), set the duration and an optional start time, and link it to a class.',
      'Quiz results can count toward a grading part in the class gradebook.',
      'Open a quiz’s statistics to see which questions were hardest.',
    ],
    tips: [
      'Your best score is shown on each quiz card.',
      'Grading happens on the server, so answers cannot be seen before you submit.',
      'Math formulas: write $x^2$ or $\\frac{1}{2}$ between dollar signs, or tap the symbol buttons (fraction, power, root). They also work in posts and answers.',
    ],
    roles: {
      student: 'Retake practice quizzes as often as you like; your best score is kept.',
      teacher: 'Anyone can create practice quizzes; class quizzes are visible to your class only.',
      parent: 'You see your child’s quiz results on the Family page.',
    },
  },
  schools: {
    title: 'Schools: people, classes and report cards',
    summary:
      'A school administrator adds the whole school at once from a spreadsheet, creates each class’s subjects with their teachers, and prints official report cards. Teachers, students and parents use Qubedu as usual inside their school.',
    steps: [
      'A verified teacher (or the site’s staff) opens Schools → New school and fills in the name, curriculum and the principal’s name.',
      'People → Add people from a spreadsheet: save your list as CSV with the columns name, role, grade, class, number, email, parent email (Arabic column names work too), choose the file and check the preview.',
      'New accounts get a first password, shown once: download or print the list and hand it out. Students without an email get a sign-in name.',
      'People who already have an account are invited and join only when they accept, so a school can never take over someone’s account or children.',
      'Classes → New class subject: choose the class (for example 5A), the subject, its code, the teacher and the total marks. Every student of that class is added, now and later.',
      'Teachers set the grading parts and enter marks as usual; Report cards → choose a class → Print / Save as PDF gives one official page per student.',
    ],
    tips: [
      'An administrator can give a student a new password if the account was made by the school.',
      'Parents created with their child are linked automatically; a parent who already had an account confirms the link first.',
    ],
    roles: {
      student: 'Open Schools to join your school and see your official report card.',
      teacher: 'Your school’s classes appear in Classroom; enter marks there and they show on the report cards.',
      parent: 'Open Schools to see your child’s official report card.',
    },
  },
  curriculum: {
    title: 'Curriculum and your plan',
    summary:
      'The official curriculum for your school year, subject by subject: units, lessons and the objectives you must master. Qubedu measures your mastery of every objective from your quizzes and builds a personal plan.',
    steps: [
      'Open Curriculum, choose the curriculum (for example Egypt) and your school year, then open a subject.',
      'Take the placement test: two questions per objective, so Qubedu knows what you already master.',
      'Your plan shows the next objectives to study, weakest first, with the lessons and quizzes linked to them.',
      'Press Practise on an objective, a lesson or a whole unit to get ten questions on it.',
      'Every quiz you take updates your mastery: objectives turn green when mastered (80% or more with enough questions).',
    ],
    tips: [
      'Teachers tag their questions with objectives, so the more classes and banks there are, the more practice you get.',
      'Administrators add or import the official programme; teachers attach lessons and quizzes to it.',
    ],
    roles: {
      student: 'Start with the placement test, then follow “Study next” a little every day.',
      teacher: 'Tag each question with an objective and attach your lessons and quizzes to the curriculum: your students find them from their plan.',
      parent: 'Ask your child to show you their plan: it tells you which objectives still need work.',
    },
  },
  banks: {
    title: 'Question banks and fair exams',
    summary:
      'Keep your questions in banks, tagged by objective, difficulty and level of thinking. Build exams from rules so each student gets different questions, then read the analysis of every question.',
    steps: [
      'Quizzes → Question banks → New question bank. Add questions and tag each with an objective, a difficulty and a level of thinking (remember, understand, apply…).',
      'Create an exam and turn on “Build from question banks”. Choose your banks and add rules, for example 5 easy questions on objective A and 3 hard ones from unit 2.',
      'Turn on “Shuffle the answer choices” so neighbours do not share answer letters.',
      'Turn on exam mode: students are asked to go full screen, and you see how many times each one left the page.',
      'After the exam, open its statistics: each question shows how many got it right and whether it separates strong and weak students; fix the ones marked “Review”.',
    ],
    tips: [
      'A student always gets the same questions if they reopen the exam, and can take an exam only once.',
      'Questions from a bank used by an exam are never shown in practice, so they cannot leak before the exam.',
      'You can only build exams from your own banks.',
    ],
    roles: {
      student: 'In exam mode, stay on the page until you submit: leaving is recorded.',
      teacher: 'Reuse the same banks every term: question statistics keep building up.',
      parent: 'Results appear in the report card when the exam counts in the subject grading.',
    },
  },
  catalog: {
    title: 'Course catalog, paid courses and certificates',
    summary:
      'Verified teachers can publish a class in the public catalog, for free or for a price. Students enroll, study and can earn a certificate that anyone can verify with a link.',
    steps: [
      'Teacher: get verified first (Settings → Account → Teacher verification).',
      'Open the class → Settings and turn on “Show in the public course catalog”. Set a price (0 = free) and a currency.',
      'Create vouchers to give free places, for example to a school.',
      'To be paid directly, add your InstaPay address, wallet number or bank account in the same settings. Students upload the receipt; you approve it under “Payment requests” and they join.',
      'Students open Course catalog, read the description and enroll (or pay, or redeem a voucher).',
      'When a student completes the course, issue a certificate from the class settings. It has a public verification link.',
    ],
    tips: ['Card payments are handled by Stripe or Paymob (Egypt: Meeza, Visa, Mastercard and mobile wallets); Qubedu never stores card details.'],
    roles: {
      student: 'Your certificates are under Me → Certificates.',
      teacher: 'Only verified teachers can list or sell courses.',
      parent: 'Parents can browse the catalog to find courses for a child.',
    },
  },
  tools: {
    title: 'Study tools',
    summary:
      'Quick tools you can open from anywhere: a grade calculator, a class timetable, a focus timer, flashcards and an organizer. They link to each other and to your classes.',
    steps: [
      'Open Tools (the grid icon) to see every tool in one place.',
      'Grade calculator: type each part’s marks and its total to see your percentage, rating and what you need on the final exam to pass or reach a target.',
      'Timetable: add your weekly classes with times and rooms. Today’s classes show on your home page.',
      'Focus timer: study in 25-minute blocks; the minutes count toward your streak.',
      'Organizer: tasks with priorities and colorful notes, linked to due dates.',
    ],
    tips: ['Tools work on your phone too, under Me → Tools.'],
    roles: {
      student: 'The grade calculator can start from your real marks in a class.',
      teacher: 'Share the timetable with your class so students see room changes.',
      parent: 'Use the timetable to know your child’s school day.',
    },
  },
  home: {
    title: 'Home',
    summary: 'Your dashboard: daily goal, streak, today’s plan and classes, homework due soon and suggestions.',
    steps: [
      'Check today’s plan and what is due.',
      'Tap a card to jump straight to the class, quiz or lesson.',
      'Keep the streak by studying a few minutes every day.',
    ],
  },
  feed: {
    title: 'Questions and posts',
    summary: 'Ask questions, share study notes and discuss lessons. Answers from verified teachers are marked.',
    steps: [
      'Choose “Ask a question”, pick a subject and write clearly what you tried.',
      'Mark the most helpful answer as the best answer.',
      'Use the “Unanswered” filter to help others and earn XP.',
    ],
  },
  watch: {
    title: 'Video lessons',
    summary: 'Lessons with chapters, captions, a checkpoint quiz and your own timestamped notes.',
    steps: [
      'Pick a lesson; use chapters to jump to a part.',
      'Add a note at any moment; it saves the time.',
      'Answer the checkpoint quiz to check you understood.',
    ],
  },
  shorts: {
    title: 'Quick lessons',
    summary: 'Short vertical lessons, one idea each.',
    steps: ['Swipe to the next lesson.', 'Save the ones you want to review.', 'Open the full lesson from the link when there is one.'],
  },
  lab: {
    title: 'Pronunciation lab',
    summary: 'Listen, repeat and get a score for your pronunciation in Arabic, English, French and Spanish.',
    steps: [
      'Choose a language and a list of words or sentences.',
      'Listen, then press the microphone and repeat.',
      'Words you miss can be sent to your flashcards.',
    ],
  },
  library: {
    title: 'Library',
    summary: 'Books, summaries and past exams shared by teachers.',
    steps: [
      'Search or filter by category.',
      'Download or open a resource.',
      'Teachers can add resources; those from unverified teachers are reviewed before they appear.',
    ],
  },
  events: {
    title: 'Workshops',
    summary: 'Scheduled sessions and events you can register for.',
    steps: ['Browse upcoming workshops.', 'Register to get a reminder.', 'Add it to your calendar.'],
  },
  chat: {
    title: 'Messages',
    summary: 'Private and group messages with replies, reactions and attachments.',
    steps: [
      'Start a chat from a profile or a class.',
      'Long-press (or hover) a message to reply or react.',
      'Report or block from the chat menu if something is wrong.',
    ],
  },
  groups: {
    title: 'Study groups',
    summary: 'Small groups to study together: discussions, chat, shared resources and live revision.',
    steps: ['Create a group or join one.', 'Share files and questions in the group.', 'Start a live revision session with the members.'],
  },
  communities: {
    title: 'Communities',
    summary: 'Large spaces per subject with channels and announcements.',
    steps: ['Join a community for your subject.', 'Read the announcements channel first.', 'Ask in the right channel.'],
  },
  people: {
    title: 'People',
    summary: 'Find classmates and teachers to learn with, and see the weekly leaderboard.',
    steps: ['Search by name or username.', 'Follow people to see their posts.', 'Check the leaderboard to see who studied most this week.'],
  },
  league: {
    title: 'Leagues',
    summary: 'Weekly leagues with learners at your level. Earn XP to move up; the week resets on Monday.',
    steps: [
      'Study, take quizzes and help others to earn XP.',
      'The top of the league moves up, the bottom moves down.',
      'Your league is shown on your profile.',
    ],
  },
  review: {
    title: 'Daily review',
    summary: 'Today’s flashcards and the quiz questions you missed, scheduled so you see them just before you would forget.',
    steps: [
      'Open Daily review: it lists what is due today and roughly how long it takes.',
      'Flip each flashcard and rate how well you knew it; answer each missed question and check it.',
      'A question you miss comes back tomorrow; each time you get it right it comes back later and later.',
      'The “Recurring mistakes” tab shows questions you missed two or more times, with a button to practice that topic.',
      'Use Focus mode (on the same page) to silence push notifications while you study.',
    ],
  },
  'study-pack': {
    title: 'Study pack',
    summary: 'Paste a lesson or choose one of your notes and get key terms, a mind map, flashcards and practice questions.',
    steps: [
      'Paste the lesson text (or pick a note) and choose “Make the study pack”.',
      'Read the key terms and the mind map, and try the practice questions.',
      'Choose a subject and “Save flashcards and terms” to add the flashcards to your review and the terms to your glossary.',
    ],
    tips: ['It works best on text that states definitions, such as “Photosynthesis is the process…”.'],
  },
  glossary: {
    title: 'Glossary',
    summary: 'The terms of each subject with their meaning: your own, and the ones teachers share with the class.',
    steps: [
      'Add a term with its subject and meaning.',
      'Search or filter by subject.',
      'Use “Find terms in a text” to pick out definitions from a pasted lesson and add them all at once.',
      'Teachers can share a term with a whole class from the class they teach.',
    ],
  },
  mentors: {
    title: 'Study mentors',
    summary: 'Older students who offered to help in a subject, so younger ones know who to ask.',
    steps: [
      'Open Study mentors and pick a subject to see who offers help in it.',
      'Ask your question in the Study hall as a question post and mention the subject. Mentors answer in public, where everyone can learn and teachers can see.',
      'Students in the last two secondary years and at university can offer help: add your subjects and save.',
      'When the author picks your answer as the best, you earn XP and it counts in your “answers chosen” number.',
    ],
  },
  saved: {
    title: 'Saved',
    summary: 'Lessons, questions and resources you saved, organized in collections you can share.',
    steps: [
      'Tap the bookmark on anything to save it.',
      'Group saved items into collections.',
      'Share a collection with a link.',
      'Tap the bell on a saved item to be reminded later (in an hour, tomorrow morning, next week, or any time you choose). The reminder arrives as a notification that opens the item.',
    ],
  },
  organizer: {
    title: 'Organizer',
    summary: 'Tasks with priorities and due dates, plus colorful notes.',
    steps: ['Add a task with a priority and a due date.', 'Tick it when done.', 'Use notes for quick ideas.'],
  },
  forms: {
    title: 'Forms',
    summary: 'Build surveys, registrations and graded forms, and read the responses.',
    steps: ['Create a form and add questions.', 'Share the link.', 'Read responses and export them.'],
  },
  workspace: {
    title: 'Workspace',
    summary: 'Documents, spreadsheets, slides and whiteboards in the cloud.',
    steps: ['Create a file or import one.', 'Share it to work together.', 'Export when you need a copy.'],
  },
  certificates: {
    title: 'Certificates',
    summary: 'Certificates you earned, each with a link anyone can use to verify it.',
    steps: ['Open a certificate to view or download it.', 'Copy the verification link to share it.', 'Certificates come from completed courses.'],
  },
  studio: {
    title: 'Studio',
    summary: 'Your uploaded lessons and their statistics.',
    steps: ['Upload a lesson video.', 'Add chapters and captions.', 'See views and how far people watched.'],
  },
  settings: {
    title: 'Settings',
    summary: 'Appearance, language, privacy, notifications, family links and your account.',
    steps: [
      'Change the language and theme under Appearance.',
      'Choose who can message you under Privacy.',
      'Manage your school year, family links and account under Account.',
    ],
  },
};
