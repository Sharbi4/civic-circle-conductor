import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { SiX } from 'react-icons/si';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getXStatus } from '@/lib/x.functions';

export function XAvatar({ className = 'h-8 w-8' }: { className?: string }) {
  const getStatus = useServerFn(getXStatus);
  const { data } = useQuery({ queryKey: ['x-status'], queryFn: () => getStatus(), staleTime: 300_000 });
  return (
    <Avatar className={className}>
      <AvatarImage src={data?.profilePhoto ?? undefined} alt={`${data?.accountName ?? 'X account'} profile photo`} referrerPolicy="no-referrer" />
      <AvatarFallback className="bg-transparent text-muted-foreground"><SiX className="h-4 w-4" /></AvatarFallback>
    </Avatar>
  );
}