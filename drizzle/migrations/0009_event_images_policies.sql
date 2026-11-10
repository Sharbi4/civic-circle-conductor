CREATE POLICY "own event images read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'event-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own event images insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own event images delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'event-images' AND (storage.foldername(name))[1] = auth.uid()::text);