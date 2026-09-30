import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';
import { canJoinLiveSession, type EduOTTLiveSessionLike } from '@/lib/eduott-video-utils';

type EduOTTJoinSessionButtonProps = {
  session: EduOTTLiveSessionLike;
  onJoin: () => void;
  className?: string;
};

export function EduOTTJoinSessionButton({ session, onJoin, className }: EduOTTJoinSessionButtonProps) {
  if (!canJoinLiveSession(session)) return null;

  return (
    <Button
      type="button"
      variant="default"
      className={className ?? 'bg-red-600 hover:bg-red-700 text-white shrink-0'}
      onClick={onJoin}
    >
      <Play className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
      Join Session
    </Button>
  );
}
