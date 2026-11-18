// "Como lançar a nota" — o passo a passo dentro da própria tela do importador.
//
// Existe pelo mesmo motivo do "Como fechar" do caixa: quem lança a nota é a
// estoquista, muitas vezes com a mercadoria na frente e sem ninguém pra perguntar.
// Cada dúvida dessas já virou nota com item errado. Aqui ela lê sem sair da tela.
//
// É <details>: abre e fecha sem JavaScript (funciona no celular travado) e não
// empurra o formulário pra baixo enquanto está fechado.
export function AjudaNota() {
  return (
    <details className="rounded-2xl border border-blue-200 bg-blue-50/60 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-blue-800">
        ❓ Como lançar a nota (passo a passo)
      </summary>

      <div className="mt-3 space-y-4 text-sm text-gray-700">
        <div>
          <p className="mb-1 font-semibold text-gray-900">1. Diga de que trata a nota</p>
          <p>
            No campo <b>&quot;De que trata esta nota?&quot;</b> escolha a classe: telas/frontais,
            baterias, películas, tampas/gavetas, placas, flex, lentes, alto-falantes ou acessórios.
            Faz o app procurar só naquela família — sem isso ele procura nas 8 mil peças do catálogo
            e pode achar a parecida, não a certa.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Se você já escreve no topo da folha (&quot;TELAS E FRONTAIS&quot;, &quot;BATERIAS&quot;),
            o app lê e preenche sozinho.
          </p>
        </div>

        <div>
          <p className="mb-1 font-semibold text-gray-900">2. Anexe as fotos e clique em Ler as fotos</p>
          <p>Uma nota de várias páginas vai junta. Foto escura ou torta é o que mais faz a leitura errar: apoie a folha, sem sombra.</p>
          <p className="mt-1">
            <b>Várias notas de uma vez:</b> em &quot;Essas fotos são…&quot; escolha
            <b> Cada foto é UMA nota</b> (até 6). O app lê cada foto separada e monta uma nota pendente
            para cada uma — cada nota com o seu fornecedor e o seu número. Se as fotos forem páginas da
            mesma nota, deixe em <b>Páginas da MESMA nota</b>.
          </p>
        </div>

        <div>
          <p className="mb-1 font-semibold text-gray-900">3. Confira linha por linha</p>
          <ul className="ml-4 list-disc space-y-1">
            <li><b>Produto já preenchido, sem aviso</b> → o app tem certeza. Confira só a quantidade e o preço.</li>
            <li><b>Com &quot;⚠ conferir&quot;</b> → achou parecido. Olhe o nome e clique em <b>trocar</b> se não for essa peça.</li>
            <li><b>Linha amarela com a busca vazia</b> → o app <b>não sabe</b> qual é. Digite o nome, o modelo ou o código e escolha na lista.</li>
          </ul>
          <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-800">
            <b>Nunca escolha no chute.</b> Peça trocada só aparece semanas depois, no estoque errado.
            Se não achar de jeito nenhum, clique em <b>tirar</b> e lance essa peça depois.
          </p>
        </div>

        <div>
          <p className="mb-1 font-semibold text-gray-900">4. Complete os dados</p>
          <p>
            <b>Loja/estoque que recebe</b> e datas valem para todas as notas do lote. Em cada nota,
            <b> fornecedor</b> é obrigatório (é ele que liga a compra à dívida certa) e o <b>número da NF</b>
            vem preenchido seguindo o anterior. Depois clique em <b>Criar nota(s) pendente(s)</b>.
          </p>
        </div>

        <div>
          <p className="mb-1 font-semibold text-gray-900">5. Conferir Recebimento — só depois</p>
          <p>
            A nota nasce <b>pendente</b>: o estoque ainda não mudou. Abra a nota e clique em
            <b> Confirmar Recebimento</b>. É aí que a peça entra no estoque, com a movimentação
            registrada e o custo recalculado pela média.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="mb-1 font-semibold text-gray-900">Se a peça não existe no cadastro</p>
          <p>
            A nota só aceita peça que já tem cadastro. Aqui não se cria produto —
            <b> a entrada é sempre por esta nota</b>, e o nome tem que nascer certo, no cadastro.
            Então: cadastre a peça em <b>Produtos → Novo produto</b> (nome completo: tipo + marca +
            modelo + cor/variação) e volte pra lançar a nota. No fim da nota o custo vem desta nota.
          </p>
        </div>

        <div>
          <p className="mb-1 font-semibold text-gray-900">Erros que já aconteceram aqui</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Escolher a peça parecida (13 no lugar da 11) → estoque errado e venda anunciada que não existe.</li>
            <li>Criar produto novo com o texto do fornecedor → cadastro duplicado e nome torto. Foi o motivo de o botão &quot;Chegou&quot; da encomenda parar de cadastrar produto.</li>
            <li>Criar a nota sem fornecedor → a dívida da compra não nasce no Financeiro.</li>
            <li>Digitar o preço da nota inteira em uma linha só → custo do produto fica errado pra sempre.</li>
          </ul>
        </div>

        <p className="text-xs text-gray-500">
          Na dúvida: não crie a nota. Chame o responsável com a foto e a linha que travou.
        </p>
      </div>
    </details>
  )
}
