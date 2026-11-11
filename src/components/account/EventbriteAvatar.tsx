import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { CalendarDays } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getEventbriteStatus } from '@/lib/eventbrite.functions';

export function EventbriteAvatar({ className = 'h-8 w-8' }: { className?: string }) {
  const getStatus = useServerFn(getEventbriteStatus);
  const { data } = useQuery({ queryKey: ['eventbrite-status'], queryFn: () => getStatus(), staleTime: 300_000 });
  return (
    <Avatar className={className}>
      <AvatarImage src={data?.profilePhoto ?? undefined} alt={`${data?.accountName ?? 'Eventbrite account'} Eventbrite profile photo`} referrerPolicy="no-referrer" />
      <AvatarFallback className="bg-transparent text-muted-foreground"><CalendarDays className="h-4 w-4" /></AvatarFallback>
    </Avatar>
  );
}