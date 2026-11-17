// TUTORIAL DA TROCA — texto que fica na própria tela.
//
// Este é o lugar OFICIAL de explicar a troca com fornecedor para quem atende e
// para quem confere depois. Vive aqui (e não em documento solto) porque a tela é
// onde a pessoa está quando tem a dúvida, e porque um texto só evita duas
// versões diferentes da mesma regra.
//
// É <details> de propósito: fica fechado, não empurra a lista para baixo e
// funciona sem JavaScript (a tela já é pesada com 200+ linhas).

const Passo = ({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) => (
  <div className="flex gap-3">
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1B6CA8] text-[11px] font-bold text-white">{n}</span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-gray-800">{titulo}</p>
      <div className="text-xs leading-relaxed text-gray-600">{children}</div>
    </div>
  </div>
)

const Botao = ({ children }: { children: React.ReactNode }) => (
  <span className="whitespace-nowrap rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-semibold text-gray-700">{children}</span>
)

export function Tutorial({ tolerancia }: { tolerancia: number }) {
  const tol = tolerancia.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return (
    <details className="group rounded-xl border border-gray-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="text-base">📘</span>
          <span className="text-sm font-semibold text-gray-800">Como funciona a troca com fornecedor</span>
          <span className="hidden text-xs text-gray-400 sm:inline">— passo a passo, o que cada botão faz e como conferir os números</span>
        </span>
        <span className="text-xs font-semibold text-[#1B6CA8] group-open:hidden">abrir ▾</span>
        <span className="hidden text-xs font-semibold text-[#1B6CA8] group-open:inline">fechar ▴</span>
      </summary>

      <div className="space-y-5 border-t border-gray-100 px-4 py-4">
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">O caminho da peça</p>
          <Passo n={1} titulo="A peça sai do estoque">
            Sai pelo <b>balcão</b> (devolução de peça com defeito) ou por <Botao>+ Lançar troca na mão</Botao> quando
            é peça da loja. A peça deixa de ser estoque no mesmo instante e o <b>custo do dia da saída</b> fica
            congelado nela — mesmo que o preço de compra mude depois.
          </Passo>
          <Passo n={2} titulo="Escolher de quem é a peça">
            No campo <b>Fornecedor</b> da linha. <b>Troca sem fornecedor não dá para cobrar</b>: ela aparece no
            painel “Onde está o dinheiro” como <span className="font-semibold text-rose-600">sem fornecedor</span>.
            Depois de entregar a peça, aperte <Botao>Enviei</Botao> — a situação passa a <b>No fornecedor</b>.
          </Passo>
          <Passo n={3} titulo="Dar o desfecho (todo troca termina em um dos três)">
            <span className="mt-1 flex flex-col gap-1">
              <span>
                <Botao>✓ Chegou do fornecedor</Botao> — a peça voltou. O app pergunta se voltou{' '}
                <b>a mesma peça</b> ou <b>outra peça</b> (aí você busca qual veio). As duas entram no{' '}
                <b>PETRÓPOLIS ESTOQUE</b> (o fundo), sempre — se a loja precisa, o responsável transfere.
              </span>
              <span>
                <Botao>Abatido na nota</Botao> — o fornecedor não devolveu a peça, mas <b>descontou o valor na
                dívida</b>. Digite quanto ele abateu. <b>Isso não é perda</b>: o valor compra outras peças dele.
                Existe também <Botao>Abater em lote</Botao> para quando ele desconta um valor único em várias peças.
              </span>
              <span>
                <Botao>Virou perda</Botao> — o fornecedor recusou e a peça não volta. O custo vira despesa de perda
                do mês. Só com o responsável de acordo.
              </span>
            </span>
          </Passo>
          <Passo n={4} titulo="Se errou no lançamento">
            <Botao>Excluir</Botao> devolve a peça para o estoque de onde saiu. Só serve para lançamento por engano:
            se a troca já retornou ou já gerou lançamento no financeiro, o app recusa e manda estornar em{' '}
            <b>Contas a Pagar</b> primeiro. O botão <Botao>ajustar</Botao> (ao lado do custo) corrige o custo da
            peça para o valor que o fornecedor usa, e pergunta se muda também o cadastro do produto.
          </Passo>
        </div>

        {/* ---------------------------------------------------------------- */}
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">O que cada situação quer dizer</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase text-gray-400">
                <tr>
                  <th className="py-1 pr-3">Na tela</th>
                  <th className="py-1 pr-3">Significa</th>
                  <th className="py-1">A peça está</th>
                </tr>
              </thead>
              <tbody className="text-gray-600">
                <tr><td className="py-1 pr-3 font-semibold text-amber-700">Aberta</td><td className="py-1 pr-3">lançada, ainda não entregue ao fornecedor</td><td className="py-1">fora do estoque, sem sair da loja</td></tr>
                <tr><td className="py-1 pr-3 font-semibold text-blue-700">No fornecedor</td><td className="py-1 pr-3">entregue, esperando resposta</td><td className="py-1">com ele — é o que cobrar</td></tr>
                <tr><td className="py-1 pr-3 font-semibold text-emerald-700">Voltou trocada</td><td className="py-1 pr-3">fechada, peça entrou no fundo</td><td className="py-1">no PETRÓPOLIS ESTOQUE</td></tr>
                <tr><td className="py-1 pr-3 font-semibold text-teal-700">Abatida na dívida</td><td className="py-1 pr-3">fechada, fornecedor descontou o valor</td><td className="py-1">não volta — virou crédito</td></tr>
                <tr><td className="py-1 pr-3 font-semibold text-rose-700">Virou perda</td><td className="py-1 pr-3">fechada, fornecedor recusou</td><td className="py-1">perdida (despesa do mês)</td></tr>
                <tr><td className="py-1 pr-3 font-semibold text-gray-500">Cancelada</td><td className="py-1 pr-3">lançamento desfeito</td><td className="py-1">de volta no estoque de origem</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Os quatro números do topo</p>
          <ul className="space-y-1 text-xs leading-relaxed text-gray-600">
            <li>
              <b>Peças em garantia</b> — quantas linhas ainda estão <b>Aberta</b> ou <b>No fornecedor</b>. É o que
              não voltou nem fechou.
            </li>
            <li>
              <b>Custo fora do estoque</b> — quanto valia (a custo de compra, não a preço de venda) o que está fora.
              É o tamanho do buraco no estoque enquanto a peça não volta.
            </li>
            <li>
              <b>Abatido em dívida</b> — soma do que os fornecedores já descontaram. <b>Não é perda</b> e não é
              dinheiro na gaveta: é dívida que diminuiu.
            </li>
            <li>
              <b>Perda acumulada</b> — só o que realmente virou prejuízo (recusa do fornecedor ou diferença de valor
              acima da tolerância).
            </li>
          </ul>
        </div>

        {/* ---------------------------------------------------------------- */}
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">As regras do dinheiro</p>
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-gray-600">
            <li>
              <b>Peça de troca nunca sai como venda.</b> Se sair como venda, o faturamento sobe e o estoque mente.
            </li>
            <li>
              <b>A volta é sempre no fundo (PETRÓPOLIS ESTOQUE).</b> Nunca direto no estoque da loja: loja pede por
              transferência, que deixa rastro.
            </li>
            <li>
              <b>Abatimento não é perda.</b> São dois fatos diferentes: a peça voltar (estoque) e o valor ser
              descontado (financeiro). Uma troca pode ter um, outro, ou os dois.
            </li>
            <li>
              <b>Diferença de valor só vira perda acima de {tol}.</b> O fornecedor às vezes manda modelo equivalente um
              pouco mais barato — diferença pequena é registrada na observação e não vira perda. O limite é uma
              configuração do dono, em <b>Configurações → Troca com fornecedor</b>.
            </li>
            <li>
              <b>Toda troca fecha com um desfecho.</b> Linha “No fornecedor” parada é dinheiro sem notícia — o painel
              mostra em vermelho acima de 30 dias.
            </li>
          </ol>
        </div>

        {/* ---------------------------------------------------------------- */}
        <div className="rounded-lg bg-gray-50 px-3 py-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Como conferir depois (análise)</p>
          <p className="mb-2 text-xs text-gray-600">
            Antes de dizer que a troca está errada, conferir nesta ordem — é o que evita acusar defeito que não existe:
          </p>
          <ul className="space-y-1 text-xs leading-relaxed text-gray-600">
            <li>
              <b>1.</b> A soma dos painéis do topo bate com a lista filtrada? Use os filtros de <b>Loja</b> e{' '}
              <b>Fornecedor</b> e confira a contagem de linhas antes de falar em número.
            </li>
            <li>
              <b>2.</b> Toda linha tem fornecedor? Se não, é cadastro a completar — não é dado corrompido.
            </li>
            <li>
              <b>3.</b> Linha repetida (mesma peça, mesmo dia, mesma loja) pode ser duas peças de verdade. Conferir a
              quantidade antes de tratar como duplicidade.
            </li>
            <li>
              <b>4.</b> <b>De onde vem cada coisa:</b> a linha da troca em{' '}
              <code className="rounded bg-white px-1">trocas</code>; a saída e a volta de estoque em{' '}
              <code className="rounded bg-white px-1">movimentacoes_estoque</code> (operação{' '}
              <code className="rounded bg-white px-1">troca</code> na saída,{' '}
              <code className="rounded bg-white px-1">entrada</code> na volta, com a observação “Troca de fornecedor”);
              o abatimento e a perda em <code className="rounded bg-white px-1">lancamentos</code> (tipo pagar, a perda
              na categoria <b>Perda</b>).
            </li>
            <li>
              <b>5.</b> A regra de perda é uma função pura, com teste próprio:{' '}
              <code className="rounded bg-white px-1">lib/trocas-regras.ts</code> +{' '}
              <code className="rounded bg-white px-1">test/trocas.test.ts</code>. Número de perda estranho? Conferir ali
              primeiro.
            </li>
            <li>
              <b>6.</b> Leitura crua do banco, sem mexer em nada:{' '}
              <code className="rounded bg-white px-1">node scripts/conferencia-trocas.mjs</code>.
            </li>
          </ul>
        </div>
      </div>
    </details>
  )
}
