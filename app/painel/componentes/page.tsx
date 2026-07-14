import { ComponentesClient } from './ComponentesClient'

// Portfólio de UI — o design system do TecnoCell numa tela só.
// Serve pra padronizar (parar de decidir estilo de botão caso a caso) e de
// referência pro 2º dev. Só admin vê (permissão 'usuarios').
export default function ComponentesPage() {
  return <ComponentesClient />
}
