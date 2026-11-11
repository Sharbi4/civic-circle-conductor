import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { UserCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getLinkedInStatus } from '@/lib/linkedin.functions';
import { getXStatus } from '@/lib/x.functions';

export function LinkedInAvatar({ className = 'h-8 w-8' }: { className?: string }) {
  const getStatus = useServerFn(getLinkedInStatus);
  const { data } = useQuery({ queryKey: ['linkedin-status'], queryFn: () => getStatus() });
  const getX = useServerFn(getXStatus);
  const { data: x } = useQuery({ queryKey: ['x-status'], queryFn: () => getX(), staleTime: 300_000 });
  const photo = data?.profilePhoto ?? x?.profilePhoto;
  const accountName = data?.profilePhoto ? data.accountName : x?.profilePhoto ? x.accountName : 'Your';
  return (
    <Avatar className={className}>
      <AvatarImage src={photo ?? undefined} alt={`${accountName ?? 'Your'} profile photo`} referrerPolicy="no-referrer" />
      <AvatarFallback className="bg-transparent text-muted-foreground"><UserCircle className="h-5 w-5" /></AvatarFallback>
    </Avatar>
  );
}