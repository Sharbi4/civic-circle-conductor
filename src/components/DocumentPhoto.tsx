import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function DocumentPhoto({ path, alt }: { path: string; alt: string }) {
  const image = useQuery({
    queryKey: ["document-photo", path], staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user.id || !path.startsWith(`${session.session.user.id}/`)) return null;
      const { data, error } = await supabase.storage.from("event-images").createSignedUrl(path, 3600);
      if (error) return null;
      return data.signedUrl;
    },
  });
  return image.data ? <img src={image.data} alt={alt} className="document-photo" /> : <span className="text-sm text-muted-foreground">{image.isPending ? "Loading photograph…" : "Photograph unavailable"}</span>;
}