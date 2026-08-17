// Formato da planilha de produtos (mesmas colunas do SIGE), compartilhado
// entre importar (actions.ts, 'use server') e exportar (route.ts) — os dois
// lados têm que usar exatamente os mesmos nomes de coluna pro ciclo
// baixar → editar → reenviar fechar sem perder dado.

export const VAZIO = '---' // o SIGE escreve isso em vez de deixar a célula em branco

export const COL = {
  ident: 'Identificador',
  codigo: 'CodigoNFe',
  nome: 'Nome',
  categoria: 'Categoria',
  marca: 'Marca',
  custo: 'PrecoCusto',
  preco: 'ValorPrecoFixado',
  precoMin: 'PrecoMinimoVenda',
  ean: 'EAN (Codigo Barras)',
  prateleira: 'Prateleira',
  modelo: 'Modelo',
  unidade: 'EstoqueUnidade',
  inativo: 'CadastroInativo',
  serie: 'UnidadePossuiNumeroSerie',
  catalogo: 'VisivelCatalogo',
  tipoArquivo: 'TipoArquivo',
} as const

// Marca só a planilha exportada por nós — arquivo do SIGE não tem essa coluna,
// e não pode ser exigida na importação (senão quebra o upload direto do SIGE).
// Serve pra pegar o caso de alguém subir a planilha errada no importador errado.
export const MARCA = 'PRODUTOS_TECNOCELL'
