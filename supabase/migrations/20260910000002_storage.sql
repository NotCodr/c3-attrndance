-- Storage bucket for logos, event covers, acquittal photos and receipts.
--
-- Public-read, like the Base44 storage it replaces, because the acquittal PDF
-- generator fetches these files from the browser and signed URLs would expire
-- mid-render. Object names are random uuids, so a URL cannot be guessed from a
-- club or event id.
--
-- Writes are closed to clients entirely: uploads go through /api/upload, which
-- checks club membership, size and MIME type using the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads', 'uploads', true, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may read an object they already have the URL for; nobody but the
-- service role may create, change or remove one.
drop policy if exists "uploads are publicly readable" on storage.objects;
create policy "uploads are publicly readable"
  on storage.objects for select
  using (bucket_id = 'uploads');
