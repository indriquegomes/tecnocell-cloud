import { redirect } from 'next/navigation'

// A raiz não tem tela própria.
//
// Existiam DUAS telas de login e ninguém tinha notado: esta ("PortalPage", azul
// #4A7BA7 e botão verde — fora do brand) e a /login (a certa: azul #1B6CA8 +
// laranja #F47920, com o "Gestão da loja, num lugar só"). Quem abria o sistema
// caía justamente na errada — a bonita ficava escondida.
//
// Agora a raiz manda direto pra /login. Uma tela de login só, no brand.
export default function Home() {
  redirect('/login')
}
