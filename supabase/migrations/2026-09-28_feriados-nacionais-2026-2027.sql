-- Feriados NACIONAIS 2026 e 2027 (loja geralmente fechada).
-- Carnaval (terça) e Corpus Christi são ponto facultativo — incluídos porque a loja costuma fechar.
INSERT INTO feriados (cidade, data, nome, tipo) VALUES
('todas', '2026-01-01', 'Confraternização Universal (Ano Novo)', 'nacional'),
('todas', '2026-02-17', 'Carnaval (terça-feira)', 'nacional'),
('todas', '2026-04-03', 'Sexta-feira Santa', 'nacional'),
('todas', '2026-04-21', 'Tiradentes', 'nacional'),
('todas', '2026-05-01', 'Dia do Trabalhador', 'nacional'),
('todas', '2026-06-04', 'Corpus Christi', 'nacional'),
('todas', '2026-09-07', 'Independência do Brasil', 'nacional'),
('todas', '2026-10-12', 'Nossa Senhora Aparecida', 'nacional'),
('todas', '2026-11-02', 'Finados', 'nacional'),
('todas', '2026-11-15', 'Proclamação da República', 'nacional'),
('todas', '2026-11-20', 'Consciência Negra', 'nacional'),
('todas', '2026-12-25', 'Natal', 'nacional'),
('todas', '2027-01-01', 'Confraternização Universal (Ano Novo)', 'nacional'),
('todas', '2027-02-09', 'Carnaval (terça-feira)', 'nacional'),
('todas', '2027-03-26', 'Sexta-feira Santa', 'nacional'),
('todas', '2027-04-21', 'Tiradentes', 'nacional'),
('todas', '2027-05-01', 'Dia do Trabalhador', 'nacional'),
('todas', '2027-05-27', 'Corpus Christi', 'nacional'),
('todas', '2027-09-07', 'Independência do Brasil', 'nacional'),
('todas', '2027-10-12', 'Nossa Senhora Aparecida', 'nacional'),
('todas', '2027-11-02', 'Finados', 'nacional'),
('todas', '2027-11-15', 'Proclamação da República', 'nacional'),
('todas', '2027-11-20', 'Consciência Negra', 'nacional'),
('todas', '2027-12-25', 'Natal', 'nacional')
ON CONFLICT (cidade, data) DO NOTHING;
