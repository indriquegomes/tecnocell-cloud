import { ComponentesClient } from './ComponentesClient'

// Portfólio de UI — o design system do TecnoCell numa tela só. Referência pra
// padronizar (parar de decidir estilo de botão caso a caso) e pro 2º dev.
//
// FORA DA SIDEBAR de propósito (decisão do Vitor): "não quero que ninguém fique
// personalizando o sistema durante o uso". Esta tela NÃO personaliza nada — é só
// uma vitrine read-only — mas ele não quer nem a porta aberta no menu da equipe.
//
// Continua acessível digitando /painel/componentes, e só pra quem tem permissão
// 'usuarios' (admin). NÃO recolocar na sidebar.
export default function ComponentesPage() {
  return <ComponentesClient />
}
