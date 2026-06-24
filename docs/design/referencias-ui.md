# Referências de UI — TecnoCell Cloud

## Princípio geral

Design **clean e minimalista**. Alertas discretos. Nada chamativo sem necessidade.  
Referência: sistemas PDV modernos (Square, Toast POS) — funcional antes de bonito.

## Paleta aplicada no sistema

- **Primário (Azul `#1B6CA8`)**: botões de ação principal, links ativos, headers de seção
- **Secundário (Laranja `#F47920`)**: CTAs secundários, badges de atenção, ícones de operação
- **Sucesso**: `green-600` (#16a34a)
- **Alerta**: `amber-500` / `orange-500`
- **Erro**: `red-500`
- **Neutro**: escala `gray-50` → `gray-900`

## Componentes padrão

### Cards de ação (PDV Operação)
- `rounded-2xl border p-4` com borda colorida por categoria
- Hover: `shadow-md` + borda mais escura
- Ativo: fundo com `bg-{cor}-50`

### Botões
- Principal: `bg-blue-600 text-white rounded-xl px-8 py-3 font-semibold`
- Secundário: `border border-gray-300 rounded-xl px-4 py-2.5 text-sm`
- Destrutivo: `border border-red-200 text-red-600`

### Alertas
- Sucesso: `bg-green-50 border-green-200 text-green-800`
- Aviso leve: `bg-amber-50 border-amber-200`
- Aviso grave: `bg-red-50 border-red-200` com borda vermelha no campo
- Info: `bg-blue-50 border-blue-200`

### Tabelas / listas
- `divide-y divide-gray-100` — sem bordas pesadas
- Hover: `hover:bg-gray-50`
- Cabeçalho: `text-xs font-semibold text-gray-500 uppercase tracking-wider`

## Cupom / Impressão

- Font: `monospace 11px`
- Largura: `max-width: 320px` (bobina 80mm)
- Logo: centralizado, max 160px
- Separadores: `border-top: 1px dashed #000`
- Seções: MAIÚSCULAS + dashed separator

## Iconografia

- Emojis nativos para ações rápidas no PDV (✓ 🔒 💬 🖨️)
- Ícones Lucide React para UI geral
- Evitar SVGs inline desnecessários

## Referências externas (inspiração)

- Square POS — simplicidade do fluxo de venda
- Toast POS — layout de operação de caixa
- Shopify POS — cards de produto/cliente
- SIGE Cloud — referência local de funcionalidades (NÃO de design)
