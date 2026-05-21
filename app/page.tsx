import { PortalLoginForm } from '@/components/PortalLoginForm'

export default function PortalPage() {
  return (
    <div className="flex min-h-screen">

      {/* ══════════════════════════════════
          LADO ESQUERDO — 30%, fundo branco
      ══════════════════════════════════ */}
      <div className="flex w-full flex-col items-center justify-center bg-white px-8 lg:w-[30%]">
        <div className="w-full max-w-[260px] flex flex-col items-center">

          {/* Logo pequena no topo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-transparent.png"
            alt="TecnoCell Cloud"
            style={{ width: '160px', marginBottom: '32px' }}
          />

          {/* Formulário com botão verde */}
          <div className="w-full">
            <PortalLoginForm buttonColor="#2e7d32" />
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════
          LADO DIREITO — 70%, azul #4A7BA7
      ══════════════════════════════════ */}
      <div
        className="hidden lg:flex lg:w-[70%] items-center justify-center"
        style={{ backgroundColor: '#4A7BA7' }}
      >
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '32px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-transparent.png"
            alt="TecnoCell Cloud"
            style={{ width: '300px', display: 'block' }}
          />
        </div>
      </div>

    </div>
  )
}
