-- Public bucket for analysis screenshots. We store the exact JPEG/PNG that
-- was sent to the vision model so the UI overlay aligns pixel-perfect with
-- the annotations the model returned.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'screenshots',
  'screenshots',
  true,
  10 * 1024 * 1024,  -- 10 MB
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read; writes only via service role (default Supabase behavior).
do $$ begin
  create policy "Public read screenshots"
    on storage.objects for select
    using (bucket_id = 'screenshots');
exception when duplicate_object then null;
end $$;
