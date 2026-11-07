import Link from 'next/link'

// 404 dentro do painel — mantém o menu lateral (o layout do painel continua
// renderizado). Sem este arquivo, quem clicasse num link antigo via a tela
// padrão do Next em inglês, sem jeito de voltar.
export default function PainelNotFound() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <p className="text-4xl">🔎</p>
      <h2 className="mt-3 text-xl font-bold text-gray-900">Não encontramos este registro</h2>
      <p className="mt-2 text-sm text-gray-500">
        Ele pode ter sido excluído, ou o link está com o número errado. Nada foi alterado no
        sistema.
      </p>
      <Link
        href="/painel"
        className="mt-6 inline-block rounded-xl bg-[#1B6CA8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#155a8f]"
      >
        Voltar ao painel
      </Link>
    </div>
  )
}
