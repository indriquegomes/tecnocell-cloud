import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Padrão do Next é 1MB e a planilha de produtos do SIGE tem ~2,8MB —
      // o envio morria com 400 (Bad Request) antes de chegar no nosso código,
      // e o erro derrubava a tela inteira pro "This page couldn't load".
      // Achado 26/08 tentando importar Produtos_1_ate_9596.xlsx.
      //
      // 4mb e não mais: a Vercel corta requisição acima de ~4,5MB na
      // infraestrutura dela, antes do Next ver. Passar disso aqui só criaria
      // a ilusão de aceitar arquivo maior. Export do SIGE vem paginado — se
      // um dia passar de 4MB, é dividir em mais arquivos (a tela já explica
      // que dá pra enviar um de cada vez, em qualquer ordem).
      bodySizeLimit: '4mb',
    },
  },
};

export default withSentryConfig(nextConfig, {
  org: "tecnocell-corporation",
  project: "javascript-nextjs-h2",
  silent: true,
  widenClientFileUpload: true,
});
