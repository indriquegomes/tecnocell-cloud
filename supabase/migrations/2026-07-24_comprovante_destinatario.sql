-- Comprovante Pix: DESTINATÁRIO (o fornecedor que RECEBEU o Pix — Mega Power, IG França…).
-- A planilha agrupa por ele. O pagador/"De" já existe (pagador = cliente que enviou).
alter table comprovantes_pix add column if not exists destinatario text;
