// Formato da planilha de clientes/fornecedores — nativo do TecnoCell (não vem
// do SIGE, então usa nomes de coluna próprios). Compartilhado entre importar
// (actions.ts, 'use server') e exportar (route.ts).

export const COL = {
  id: 'ID',
  nome: 'Nome',
  tipo: 'Tipo',
  pessoaFisica: 'Pessoa Física ou Jurídica',
  cpfCnpj: 'CPF/CNPJ',
  email: 'Email',
  telefone: 'Telefone',
  celular: 'Celular',
  cep: 'CEP',
  endereco: 'Endereço',
  numero: 'Número',
  complemento: 'Complemento',
  bairro: 'Bairro',
  cidade: 'Cidade',
  estado: 'Estado',
  ativo: 'Ativo',
  tipoArquivo: 'TipoArquivo',
} as const

// Marca a planilha como sendo de Clientes — pra rejeitar na hora se alguém
// subir a planilha de Produtos aqui por engano (as duas têm coluna "Nome").
export const MARCA = 'CLIENTES_TECNOCELL'
