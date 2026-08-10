const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Lê o .env.local manualmente
const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...rest] = line.split('=');
  if (key && key.trim()) env[key.trim()] = rest.join('=').trim();
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function listarTabelas() {
  console.log(`Conectando em: ${SUPABASE_URL}`);
  console.log(`Chave lida - tamanho: ${SERVICE_KEY ? SERVICE_KEY.length : 'INDEFINIDA'} caracteres`);
  console.log(`Chave lida - início: ${SERVICE_KEY ? SERVICE_KEY.slice(0, 20) : '-'}`);
  console.log(`Chave lida - fim: ${SERVICE_KEY ? SERVICE_KEY.slice(-20) : '-'}`);
  console.log(`Pontos (.) na chave: ${SERVICE_KEY ? (SERVICE_KEY.match(/\./g) || []).length : 0} (uma chave válida tem 2)\n`);

  // Pega a lista de tabelas via OpenAPI spec do PostgREST
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  const spec = await res.json();
  const tabelas = Object.keys(spec.definitions || spec.components?.schemas || {});

  if (tabelas.length === 0) {
    console.log('Nenhuma tabela encontrada. Resposta bruta da API:');
    console.log(JSON.stringify(spec, null, 2).slice(0, 1000));
    return;
  }

  console.log(`Encontradas ${tabelas.length} tabelas:\n`);

  for (const tabela of tabelas) {
    const { count, error: countError } = await supabase
      .from(tabela)
      .select('*', { count: 'exact', head: true });

    const { data: amostra, error: amostraError } = await supabase
      .from(tabela)
      .select('*')
      .limit(3);

    console.log(`📦 TABELA: ${tabela}`);
    if (countError) {
      console.log(`   Erro ao contar: ${countError.message}`);
    } else {
      console.log(`   Registros: ${count}`);
    }

    if (amostraError) {
      console.log(`   Erro ao buscar amostra: ${amostraError.message}`);
    } else if (amostra && amostra.length > 0) {
      console.log(`   Colunas: ${Object.keys(amostra[0]).join(', ')}`);
      console.log(`   Exemplos:`);
      amostra.forEach((linha, i) => console.log(`     [${i + 1}]`, JSON.stringify(linha)));
    } else {
      console.log(`   (tabela vazia, sem exemplos)`);
    }
    console.log('');
  }
}

listarTabelas();
