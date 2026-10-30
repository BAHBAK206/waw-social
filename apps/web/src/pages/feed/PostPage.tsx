import type { PostDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { PostCard } from '@/components/feed/PostCard';
import { ButtonLink } from '@/components/ui/Button';
import { QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';

export default function PostPage() {
  const { id = '' } = useParams();
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: qk.post(id), queryFn: () => api.posts.get(id) });
  return (
    <div className="page-narrow space-y-4">
      <Link to="/feed" className="link inline-flex items-center gap-1">
        <ArrowLeft className="size-4 flip-rtl" /> {tr.t('feed.title')}
      </Link>
      <QueryState query={q}>
        {(post) => (
          <PostCard
            post={post}
            detail
            onPatch={(fn) => qc.setQueryData<PostDto>(qk.post(id), (p) => (p ? fn(p) : p))}
            onRemoved={() => navigate('/feed', { replace: true })}
          />
        )}
      </QueryState>
      <ButtonLink to="/feed" variant="soft">
        {tr.t('common.back')}
      </ButtonLink>
    </div>
  );
}
