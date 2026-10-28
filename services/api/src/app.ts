import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { LIMITS } from '@qubedu/shared';
import type { AppEnv, Deps } from './lib/context';
import { recordServerError } from './lib/alerts';
import { AppError, errorResponse } from './lib/errors';
import { authenticate, injectDeps, maintenanceGate, securityHeaders } from './middleware';
import { authRoutes } from './routes/auth';
import { channelRoutes, studioRoutes } from './routes/channels';
import { eventRoutes } from './routes/events';
import { exploreRoutes } from './routes/explore';
import { playlistRoutes } from './routes/playlists';
import { practiceRoutes } from './routes/practice';
import { storyRoutes } from './routes/stories';
import { videoRoutes } from './routes/videos';
import { captionRoutes } from './routes/captions';
import { teacherRoutes } from './routes/teacher';
import { familyRoutes } from './routes/family';
import { catalogRoutes, stripeWebhook, voucherRoutes } from './routes/catalog';
import { gradebookRoutes } from './routes/gradebook';
import { certificateRoutes } from './routes/certificates';
import { leagueRoutes } from './routes/leagues';
import { calendarRoutes, myCalendarRoutes } from './routes/calendar';
import { chatRoutes } from './routes/chat';
import { groupRoutes } from './routes/groups';
import { academicRoutes, dailyRoutes, examRoutes, flashcardRoutes, noteRoutes, pomodoroRoutes, studySessionRoutes, taskRoutes } from './routes/learning';
import { quizRoutes, taxonomyRoutes } from './routes/quizzes';
import { schoolRoutes } from './routes/school';
import { classRoutes, liveRoutes } from './routes/live';
import { formRoutes } from './routes/forms';
import { libraryRoutes, savedRoutes, searchRoutes, workspaceRoutes } from './routes/content';
import { aiRoutes, assistantRoutes } from './routes/ai';
import { adminRoutes } from './routes/admin';
import { internalRoutes } from './routes/internal';
import { configRoutes } from './routes/config';
import { fileRoutes } from './routes/files';
import { notificationRoutes } from './routes/notifications';
import { postRoutes } from './routes/posts';
import { uploadRoutes } from './routes/uploads';
import { meRoutes, reportRoutes, userRoutes } from './routes/users';

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>();
  const origins = deps.env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use('*', injectDeps(deps));
  app.use('*', securityHeaders);
  app.use(
    '/api/*',
    cors({
      origin: (origin) => (!origin ? origin : origins.includes(origin) || origins.includes('*') ? origin : null),
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Client'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );
  const tooLarge = (c: Context) => c.json({ error: { code: 'payload_too_large', message: 'payload_too_large' } }, 413);
  const jsonLimit = bodyLimit({ maxSize: LIMITS.uploadBytes + 1024 * 1024, onError: tooLarge });
  const videoLimit = bodyLimit({ maxSize: LIMITS.videoBytes + 1024 * 1024, onError: tooLarge });
  // Only the upload endpoint may carry video-sized bodies.
  app.use('/api/*', (c, next) => (c.req.path === '/api/v1/uploads' ? videoLimit(c, next) : jsonLimit(c, next)));
  app.use('/api/*', authenticate);
  app.use('/api/*', maintenanceGate);

  app.get('/health', async (c) => {
    let db = false;
    try {
      await deps.sql`select 1`;
      db = true;
    } catch {
      db = false;
    }
    return c.json({ ok: db, db, kv: deps.kv.kind, storage: deps.storage.driver, version: '2.0.0' }, db ? 200 : 503);
  });
  app.route('/files', fileRoutes);
  app.route('/internal', internalRoutes);
  // Payment provider → us (signed; outside /api so no session or CORS rules apply).
  app.route('/webhooks/stripe', stripeWebhook);

  const api = new Hono<AppEnv>();
  api.route('/', configRoutes);
  api.route('/auth', authRoutes);
  api.route('/me', meRoutes);
  api.route('/users', userRoutes);
  api.route('/reports', reportRoutes);
  api.route('/posts', postRoutes);
  api.route('/notifications', notificationRoutes);
  api.route('/uploads', uploadRoutes);
  api.route('/chat', chatRoutes);
  api.route('/groups', groupRoutes);
  api.route('/quizzes', quizRoutes);
  api.route('/taxonomy', taxonomyRoutes);
  api.route('/flashcards', flashcardRoutes);
  api.route('/pomodoro', pomodoroRoutes);
  api.route('/daily-challenge', dailyRoutes);
  api.route('/tasks', taskRoutes);
  api.route('/notes', noteRoutes);
  api.route('/exams', examRoutes);
  api.route('/study-sessions', studySessionRoutes);
  api.route('/academic', academicRoutes);
  api.route('/school', schoolRoutes);
  api.route('/live', liveRoutes);
  api.route('/classes', classRoutes);
  api.route('/forms', formRoutes);
  api.route('/library', libraryRoutes);
  api.route('/workspace', workspaceRoutes);
  api.route('/saved', savedRoutes);
  api.route('/search', searchRoutes);
  api.route('/ai', aiRoutes);
  api.route('/assistant', assistantRoutes);
  api.route('/videos', captionRoutes);
  api.route('/videos', videoRoutes);
  api.route('/teacher', teacherRoutes);
  api.route('/family', familyRoutes);
  api.route('/catalog', catalogRoutes);
  api.route('/school', voucherRoutes);
  api.route('/school', gradebookRoutes);
  api.route('/certificates', certificateRoutes);
  api.route('/leagues', leagueRoutes);
  api.route('/calendar', calendarRoutes);
  api.route('/me/calendar', myCalendarRoutes);
  api.route('/playlists', playlistRoutes);
  api.route('/channels', channelRoutes);
  api.route('/studio', studioRoutes);
  api.route('/stories', storyRoutes);
  api.route('/events', eventRoutes);
  api.route('/explore', exploreRoutes);
  api.route('/practice', practiceRoutes);
  api.route('/admin', adminRoutes);
  app.route('/api/v1', api);

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'not_found' } }, 404));
  app.onError((err, c) => {
    const handled = errorResponse(c, err);
    if (handled) {
      if (err instanceof AppError && err.status >= 500) deps.log.warn({ err: err.code, path: c.req.path }, 'request failed');
      return handled;
    }
    deps.log.error({ err, path: c.req.path, requestId: c.get('requestId') }, 'unhandled error');
    void recordServerError(deps, err, { path: c.req.path, method: c.req.method, userId: c.get('user')?.id ?? null });
    return c.json({ error: { code: 'internal', message: 'internal_error' } }, 500);
  });
  return app;
}

export type App = ReturnType<typeof createApp>;
