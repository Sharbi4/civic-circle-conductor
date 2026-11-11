import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { UserCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getLinkedInStatus } from '@/lib/linkedin.functions';

export function LinkedInAvatar({ className = 'h-8 w-8' }: { className?: string }) {
  const getStatus = useServerFn(getLinkedInStatus);
  const { data } = useQuery({ queryKey: ['linkedin-status'], queryFn: () => getStatus() });
  return (
    <Avatar className={className}>
      <AvatarImage src={data?.profilePhoto ?? undefined} alt={`${data?.accountName ?? 'Your'} profile photo`} referrerPolicy="no-referrer" />
      <AvatarFallback className="bg-transparent text-muted-foreground"><UserCircle className="h-5 w-5" /></AvatarFallback>
    </Avatar>
  );
}