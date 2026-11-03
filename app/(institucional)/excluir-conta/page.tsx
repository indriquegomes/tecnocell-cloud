import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Solicitar exclusão da conta — Tecnocell Teste' }

const assunto = encodeURIComponent('Solicitar exclusão da conta Tecnocell Teste')
const mensagem = encodeURIComponent('Olá, equipe Tecnocell Corp.\n\nQuero solicitar a exclusão da minha conta e dos dados associados ao aplicativo Tecnocell Teste. Estou enviando esta mensagem pelo e-mail associado à conta. Por favor, orientem a confirmação de titularidade e informem a conclusão.\n\nNão incluí senha, código de autenticação ou documentos pessoais nesta mensagem.')

export default function Page() {
  return <>
    <h1>Solicitar exclusão da conta Tecnocell Teste</h1>
    <p>Você pode iniciar a solicitação por e-mail, mesmo sem ter o aplicativo instalado. O atendimento é manual pela equipe Tecnocell Corp.</p>
    <section><h2>Como solicitar</h2>
      <ol className="list-decimal space-y-3 pl-6">
        <li>Escreva para <a href="mailto:tecnocellcorporation@gmail.com">tecnocellcorporation@gmail.com</a>, de preferência usando o e-mail associado à sua conta.</li>
        <li>Informe que deseja excluir a conta e os dados associados ao <strong>Tecnocell Teste</strong>.</li>
        <li>A equipe orientará a confirmação da titularidade e informará a conclusão ou a necessidade de alguma etapa adicional.</li>
      </ol>
      <a className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-[#005777] px-5 py-3 font-semibold !text-white !no-underline" href={`mailto:tecnocellcorporation@gmail.com?subject=${assunto}&body=${mensagem}`}>Preparar e-mail de solicitação</a>
      <p className="mt-3 text-sm">Se o botão não abrir um aplicativo de e-mail, copie o endereço acima e envie a mensagem pelo serviço de sua preferência.</p>
    </section>
    <section><h2>Proteja seus dados</h2>
      <p>Não envie senha, código de autenticação ou documentos pessoais na mensagem inicial. Não é necessário enviar informações do sistema original da loja. Se você não tiver mais acesso ao e-mail da conta, informe essa situação para receber orientação de confirmação da titularidade.</p>
    </section>
    <section><h2>O que acontece com a solicitação</h2>
      <p>A solicitação abrange a conta, o cadastro e os dados associados no ambiente Tecnocell Teste. A equipe deve conferir os vínculos antes de executar a exclusão e informar quais dados foram removidos ou se existe alguma retenção específica, com sua finalidade e período.</p>
      <p className="mt-2">Abrir o e-mail ou enviar a mensagem não apaga a conta automaticamente. A conclusão depende da confirmação da titularidade e do atendimento da equipe. Nenhuma conta ou dado de produção é alterado por esta página.</p>
    </section>
    <p><Link href="/privacidade">Consultar a política de privacidade</Link></p>
  </>
}
