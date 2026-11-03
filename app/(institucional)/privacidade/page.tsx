import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Privacidade — Tecnocell Teste' }

export default function Page() {
  return <>
    <h1>Privacidade do Tecnocell Teste</h1>
    <p className="text-sm">Atualizada em 2 de novembro de 2026.</p>
    <section><h2>Aplicativo e contato</h2>
      <p>O Tecnocell Teste é o ambiente de homologação da Tecnocell Corp para testar catálogo, cadastro, carrinho e pedidos. Ele utiliza banco separado do sistema da loja. Pedidos e saldos deste ambiente não representam compras reais. Utilize os dados fictícios fornecidos pela equipe e não envie documentos pessoais reais.</p>
      <p className="mt-2">Para dúvidas, correção de dados e solicitações de privacidade, escreva para <a href="mailto:tecnocellcorporation@gmail.com">tecnocellcorporation@gmail.com</a>.</p>
    </section>
    <section><h2>Cadastro, acesso e pedidos</h2>
      <p>Os formulários podem enviar nome, nome de usuário, e-mail, identificador da conta, endereço, CEP e data de nascimento ao ambiente de testes. RG e CPF são opcionais. Esses dados são utilizados no cadastro, na aprovação de acesso e no atendimento dos pedidos de teste. A autenticação e a senha são tratadas pelo Supabase Auth.</p>
      <p className="mt-2">Um pedido registra itens, quantidades, unidade, valores, data e situação do atendimento. O carrinho e a sessão também ficam no armazenamento local do aplicativo. Ao enviar um pedido, seus itens são transmitidos ao servidor.</p>
    </section>
    <section><h2>Localização, voz e consulta de CEP</h2>
      <p>A localização durante o uso pode ser solicitada para sugerir a loja mais próxima. No fluxo atual, a comparação das distâncias é feita no aparelho. Você pode escolher a unidade manualmente.</p>
      <p className="mt-2">A busca por voz depende de permissão e do serviço de reconhecimento do sistema do aparelho. Esse serviço pode processar áudio fora do dispositivo, conforme o provedor e suas configurações. A transcrição é usada para pesquisar produtos. Você pode digitar a busca sem usar o microfone.</p>
      <p className="mt-2">Ao consultar um CEP, o aplicativo transmite esse CEP ao ViaCEP para auxiliar o preenchimento do endereço. Os serviços de rede também podem receber metadados técnicos da conexão.</p>
    </section>
    <section><h2>Serviços e acesso aos dados</h2>
      <p>O ambiente utiliza Supabase para autenticação e banco de dados e Vercel para o Cloud administrativo e estas páginas. Os dados de cadastro e pedidos podem ser acessados pela equipe autorizada a operar os testes, conforme as permissões aplicáveis. Serviços de infraestrutura podem manter registros técnicos para operação e segurança.</p>
      <p className="mt-2">Nesta versão de testes, login Google, envio de comprovantes Pix e contato com os números reais de WhatsApp da loja estão desativados.</p>
    </section>
    <section><h2>Conservação e exclusão</h2>
      <p>Os dados permanecem no ambiente enquanto associados à conta e necessários à execução e ao atendimento dos testes. Você pode solicitar correção ou exclusão da conta e dos dados associados pelo contato de privacidade.</p>
      <p className="mt-2">A equipe confirma a titularidade e informa a conclusão do atendimento. Se algum registro precisar ser conservado por obrigação aplicável ou motivo específico de segurança, a finalidade e o período correspondente devem ser informados no atendimento. Cópias de segurança e registros dos provedores seguem seus ciclos próprios de retenção.</p>
      <p className="mt-2"><Link href="/excluir-conta">Veja como solicitar a exclusão da conta Tecnocell Teste</Link>, inclusive se você já desinstalou o aplicativo.</p>
    </section>
    <section><h2>Atualizações</h2>
      <p>Estas informações devem acompanhar os recursos efetivamente habilitados. Alterações nas funções de cadastro, voz, documentos, pagamentos ou serviços utilizados exigem nova revisão desta página.</p>
    </section>
  </>
}
