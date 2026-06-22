-- ============================================================
-- Bucket de fotos do Report — TecnoCell
-- Gerado em 2026-06-22
--
-- PASSO 1 (no painel, NÃO é SQL):
--   Supabase Dashboard > Storage > New bucket
--     - Name: reports
--     - Public bucket: SIM (marcar)  -> assim o link da foto abre pra quem recebe
--   Criar.
--
-- PASSO 2: rodar este SQL (SQL Editor > New query > Run)
--   Permite que usuários logados no painel façam upload da foto.
-- ============================================================

-- Upload (insert) por usuários autenticados no bucket "reports"
create policy "Report: upload autenticado"
on storage.objects for insert to authenticated
with check (bucket_id = 'reports');

-- (Leitura pública já vem do bucket ser "Public"; não precisa policy de select.)
