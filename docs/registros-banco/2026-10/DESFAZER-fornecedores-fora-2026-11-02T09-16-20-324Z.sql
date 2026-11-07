-- DESFAZER o lançamento dos fornecedores fora da lista (outubro/2026)
-- criado em 2026-11-02T09:16:21.251Z · 19 linhas · R$ 30.056,36
DELETE FROM lancamentos
WHERE id IN (
  '66558b89-cc8a-4041-9c5c-f54762f26489',
  'd87d3957-b05a-4585-9d93-abd41379cbad',
  'e2c5b240-cd1f-46b1-8e0c-c12a59fb9efe',
  '38a6515d-d75d-4beb-b1f2-9d213cbba969',
  '86e435e9-4c1d-498a-a5df-9465b859bcb2',
  '9f5cba3b-aa02-4aed-964b-5f29dc4640f8',
  '641fd2e6-5a54-4dd0-9607-e44f5e4ed9a9',
  'ebcf9072-edb1-48fb-a88a-833a67c40e20',
  '6249a20c-0f97-4b12-b4a4-ffc9ab09e63f',
  '03146bd5-066d-4d52-8782-e53fe5641b2f',
  '154cda52-87fc-457b-98b6-a84cd4992531',
  '855e8709-9c79-464a-bef3-fb1f03cfefaa',
  '8fc4e23a-d52b-4d8c-a078-87d6ae4d83af',
  '97696997-879e-4cea-ba8c-6492feb59257',
  '81e57004-34a8-4932-9811-49d70fab795e',
  '3dda4881-3e00-4b2d-9629-d6ac5e11e0fa',
  'bf77ebb6-4b54-4ba2-8890-fb5dd861b644',
  'be3bb586-5bb0-4a42-adbe-c418ed359bca',
  '5f108c15-17f9-4d3d-98f4-f48c37d80794'
);
