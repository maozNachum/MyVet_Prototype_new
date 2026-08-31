-- Clean-room baseline only: reproduce the verified private Storage bucket
-- configuration. This file contains configuration, never stored objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'documents', 'documents', false, 15728640,
    array['application/pdf','image/jpeg','image/png','image/webp','text/html','text/plain']::text[]
  ),
  (
    'chat-attachments', 'chat-attachments', false, 10485760,
    array[
      'application/pdf','image/jpeg','image/png','image/webp','text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream'
    ]::text[]
  ),
  (
    'ai-medical-documents', 'ai-medical-documents', false, 15728640,
    array['application/pdf','image/jpeg','image/png','image/webp']::text[]
  ),
  (
    'ai-recordings', 'ai-recordings', false, 52428800,
    array['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm','video/mp4','video/webm']::text[]
  )
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
