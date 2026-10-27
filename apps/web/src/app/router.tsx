import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { GuestOnly, RequireAuth } from '@/components/layout/Gates';
import { RouteError } from './RouteError';

type Loader = () => Promise<{ default: ComponentType }>;

/** Lazy route that code-splits the page module. */
function page(load: Loader, opts: { auth?: boolean; guest?: boolean } = {}): Pick<RouteObject, 'lazy'> {
  return {
    lazy: async () => {
      const { default: Page } = await load();
      const Component = () =>
        opts.auth ? (
          <RequireAuth>
            <Page />
          </RequireAuth>
        ) : opts.guest ? (
          <GuestOnly>
            <Page />
          </GuestOnly>
        ) : (
          <Page />
        );
      return { Component };
    },
  };
}

export const router = createBrowserRouter([
  // Auth screens have their own full-page layout.
  { path: '/login', ...page(() => import('@/pages/auth/LoginPage'), { guest: true }), errorElement: <RouteError /> },
  { path: '/register', ...page(() => import('@/pages/auth/RegisterPage'), { guest: true }), errorElement: <RouteError /> },
  { path: '/forgot', ...page(() => import('@/pages/auth/ForgotPage')), errorElement: <RouteError /> },
  { path: '/reset', ...page(() => import('@/pages/auth/ResetPage')), errorElement: <RouteError /> },
  { path: '/verify', ...page(() => import('@/pages/auth/VerifyPage')), errorElement: <RouteError /> },
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, ...page(() => import('@/pages/home/HomePage')) },
      { path: 'feed', ...page(() => import('@/pages/feed/FeedPage'), { auth: true }) },
      { path: 'post/:id', ...page(() => import('@/pages/feed/PostPage'), { auth: true }) },
      { path: 'watch', ...page(() => import('@/pages/watch/WatchPage')) },
      { path: 'watch/library', ...page(() => import('@/pages/watch/WatchLibraryPage'), { auth: true }) },
      { path: 'watch/:id', ...page(() => import('@/pages/watch/VideoPage')) },
      { path: 'shorts', ...page(() => import('@/pages/watch/ShortsPage')) },
      { path: 'shorts/:id', ...page(() => import('@/pages/watch/ShortsPage')) },
      { path: 'channel/:id', ...page(() => import('@/pages/watch/ChannelPage')) },
      { path: 'playlist/:id', ...page(() => import('@/pages/watch/PlaylistPage')) },
      { path: 'studio', ...page(() => import('@/pages/studio/StudioPage'), { auth: true }) },
      { path: 'explore', ...page(() => import('@/pages/explore/ExplorePage'), { auth: true }) },
      { path: 'explore/tag/:tag', ...page(() => import('@/pages/explore/TagPage'), { auth: true }) },
      { path: 'events', ...page(() => import('@/pages/events/EventsPage'), { auth: true }) },
      { path: 'events/:id', ...page(() => import('@/pages/events/EventPage'), { auth: true }) },
      { path: 'quiz', ...page(() => import('@/pages/quiz/QuizListPage')) },
      { path: 'quiz/new', ...page(() => import('@/pages/quiz/QuizEditorPage'), { auth: true }) },
      { path: 'quiz/:id/edit', ...page(() => import('@/pages/quiz/QuizEditorPage'), { auth: true }) },
      { path: 'quiz/:id/stats', ...page(() => import('@/pages/quiz/QuizStatsPage'), { auth: true }) },
      { path: 'quiz/attempt/:attemptId', ...page(() => import('@/pages/quiz/QuizPlayPage'), { auth: true }) },
      { path: 'ai', ...page(() => import('@/pages/ai/AiPage'), { auth: true }) },
      { path: 'assistant', ...page(() => import('@/pages/assistant/AssistantPage'), { auth: true }) },
      { path: 'forms', ...page(() => import('@/pages/forms/FormsPage')) },
      { path: 'forms/new', ...page(() => import('@/pages/forms/FormBuilderPage'), { auth: true }) },
      { path: 'forms/:id/edit', ...page(() => import('@/pages/forms/FormBuilderPage'), { auth: true }) },
      { path: 'forms/:id/responses', ...page(() => import('@/pages/forms/FormResponsesPage'), { auth: true }) },
      { path: 'f/:slug', ...page(() => import('@/pages/forms/PublicFormPage')) },
      { path: 'library', ...page(() => import('@/pages/library/LibraryPage')) },
      { path: 'workspace', ...page(() => import('@/pages/workspace/WorkspacePage'), { auth: true }) },
      { path: 'workspace/:id', ...page(() => import('@/pages/workspace/WorkspaceEditorPage'), { auth: true }) },
      { path: 'academic', ...page(() => import('@/pages/academic/AcademicPage'), { auth: true }) },
      { path: 'school', ...page(() => import('@/pages/school/SchoolPage'), { auth: true }) },
      { path: 'school/:courseId', ...page(() => import('@/pages/school/CoursePage'), { auth: true }) },
      { path: 'school/assignments/:assignmentId', ...page(() => import('@/pages/school/AssignmentPage'), { auth: true }) },
      { path: 'classes', ...page(() => import('@/pages/live/ClassesPage'), { auth: true }) },
      { path: 'live/:roomId', ...page(() => import('@/pages/live/LiveRoomPage'), { auth: true }) },
      { path: 'people', ...page(() => import('@/pages/people/PeoplePage'), { auth: true }) },
      { path: 'u/:id', ...page(() => import('@/pages/people/ProfilePage'), { auth: true }) },
      { path: 'profile', ...page(() => import('@/pages/people/ProfilePage'), { auth: true }) },
      { path: 'groups', ...page(() => import('@/pages/groups/GroupsPage'), { auth: true }) },
      { path: 'communities', ...page(() => import('@/pages/groups/CommunitiesPage'), { auth: true }) },
      { path: 'groups/:id', ...page(() => import('@/pages/groups/GroupPage'), { auth: true }) },
      { path: 'chat', ...page(() => import('@/pages/chat/ChatPage'), { auth: true }) },
      { path: 'chat/:conversationId', ...page(() => import('@/pages/chat/ChatPage'), { auth: true }) },
      { path: 'saved', ...page(() => import('@/pages/saved/SavedPage'), { auth: true }) },
      { path: 'c/:slug', ...page(() => import('@/pages/saved/PublicCollectionPage')) },
      { path: 'organizer', ...page(() => import('@/pages/organizer/OrganizerPage'), { auth: true }) },
      { path: 'services', ...page(() => import('@/pages/services/ServicesPage')) },
      { path: 'settings', ...page(() => import('@/pages/settings/SettingsPage'), { auth: true }) },
      { path: 'admin', ...page(() => import('@/pages/admin/AdminPage'), { auth: true }) },
      { path: 'help', ...page(() => import('@/pages/info/HelpPage')) },
      { path: 'about', ...page(() => import('@/pages/info/AboutPage')) },
      { path: 'privacy', ...page(() => import('@/pages/info/PrivacyPage')) },
      { path: 'terms', ...page(() => import('@/pages/info/TermsPage')) },
      { path: 'contact', ...page(() => import('@/pages/info/ContactPage')) },
      { path: '*', ...page(() => import('@/pages/NotFoundPage')) },
    ],
  },
]);
