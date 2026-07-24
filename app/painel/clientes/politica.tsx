// TEXTO DA POLÍTICA DE CADASTRO — mostrado na criação de cliente (no /clientes e no PDV).
//
// 🔴 PLACEHOLDER — o Vitor vai mandar o texto oficial. Trocar SÓ esta constante.
// (nada mais depende do conteúdo; é uma string só.)
export const POLITICA_CADASTRO = `Ao efetuar o cadastro, o cliente declara que os dados informados são verdadeiros e autoriza seu uso para fins comerciais, de cobrança e de concessão de crédito (fiado).

As vendas da TecnoCell são destinadas à revenda (técnicos e lojistas). Poderá ser solicitada foto com documento para comprovação.

O cliente está ciente das condições de pagamento combinadas e responsabiliza-se pelos débitos em seu nome.`

// Caixa de política reutilizável (form de /clientes e modal do PDV). Componente puro —
// sem estado, serve em Server e Client Component.
export function PoliticaCadastro({ compacto = false }: { compacto?: boolean }) {
  return (
    <div className={`rounded-xl border border-blue-100 bg-blue-50/60 ${compacto ? 'px-3 py-2.5' : 'px-4 py-3.5'}`}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#1B6CA8]">Política de cadastro</p>
      <p className={`whitespace-pre-line text-gray-600 ${compacto ? 'text-[11px] leading-relaxed' : 'text-xs leading-relaxed'}`}>
        {POLITICA_CADASTRO}
      </p>
    </div>
  )
}
