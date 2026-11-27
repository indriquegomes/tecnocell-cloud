import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ehCategoriaPelicula,
  ehCategoriaTela,
  palavrasModelo,
  peliculaServeParaTela,
  pontuacaoModelo,
  telaTrazPelicula,
} from './brinde.ts'

// Nomes reais do catálogo da TecnoCell (categoria FRONTAL / PELICULA).

test('palavras de modelo ignoram o que não identifica modelo', () => {
  assert.deepEqual(
    palavrasModelo('FRONTAL MOTOROLA G35 LCD *PREMIUM ZL* SEM ARO'),
    ['MOTOROLA', 'G35'],
  )
  // acento e caixa não podem mudar o resultado
  assert.deepEqual(palavrasModelo('PELÍCULA 3D SAMSUNG A15'), ['SAMSUNG', 'A15'])
})

test('película do mesmo modelo é aceita', () => {
  assert.equal(peliculaServeParaTela('FRONTAL MOTOROLA G35 LCD *PREMIUM ZL* SEM ARO', 'PELICULA 3D MOTOROLA G35'), true)
  assert.equal(peliculaServeParaTela('FRONTAL IPHONE 13', 'PELICULA 3D IPHONE 13'), true)
  assert.equal(peliculaServeParaTela('FRONTAL SAMSUNG A15 PREMIUM INCELL *ZL* COM ARO', 'PELICULA 3D SAMSUNG A15'), true)
})

test('tela que já traz película no nome não gera brinde', () => {
  const tela = 'FRONTAL SAMSUNG A15 PREMIUM INCELL *ZL* COM ARO + PELICULA 3D'
  assert.equal(telaTrazPelicula(tela), true)
  assert.equal(peliculaServeParaTela(tela, 'PELICULA 3D SAMSUNG A15'), false)
})

test('modelo diferente é recusado (número do modelo manda)', () => {
  assert.equal(peliculaServeParaTela('FRONTAL XIAOMI REDMI 13C', 'PELICULA 3D XIAOMI REDMI 12C'), false)
  assert.equal(peliculaServeParaTela('FRONTAL SAMSUNG A15 PREMIUM INCELL', 'PELICULA 3D SAMSUNG A05'), false)
  // só a marca em comum não basta
  assert.equal(peliculaServeParaTela('FRONTAL MOTOROLA E13 XT2345', 'PELICULA 3D MOTOROLA G35'), false)
})

test('variante muda o produto: 13 não serve em 13 PRO MAX e vice-versa', () => {
  assert.equal(peliculaServeParaTela('FRONTAL IPHONE 13', 'PELICULA 3D IPHONE 13 PRO MAX'), false)
  assert.equal(peliculaServeParaTela('FRONTAL IPHONE 13 PRO MAX', 'PELICULA 3D IPHONE 13'), false)
})

test('tela que lista vários modelos aceita a película de qualquer um deles', () => {
  const tela = 'FRONTAL INFINIX HOT 11S/X6812/X6815/HOT 20 PRO/SPARK 8 PRO ZLX6827 LCD'
  assert.equal(peliculaServeParaTela(tela, 'PELICULA 3D INFINIX HOT 11S'), true)
  // mas continua recusando película de outro aparelho
  assert.equal(peliculaServeParaTela(tela, 'PELICULA 3D SAMSUNG A15'), false)
})

test('número e variante iguais não bastam se a família é outra', () => {
  // "IPAD PRO 11" x "IPHONE 11 PRO": só 11 e PRO em comum — aparelhos diferentes.
  assert.equal(peliculaServeParaTela('FRONTAL COMPLETA IPAD PRO 11 POLEGADAS A1980', 'PELICULA 3D IPHONE X/XS/11 PRO'), false)
})

test('película que lista vários modelos serve em qualquer um deles', () => {
  // nome real do catálogo: uma película só para 6G, 6S, 7, 8 e SE 2020
  const universal = 'PELICULA 3D IPHONE 6G/6S/7/8/SE 2020 PRETA'
  assert.equal(peliculaServeParaTela('FRONTAL IPHONE 7   PRETA  PREMIUM LCD VIVID', universal), true)
  // 8 PLUS não serve: a película do 8 é menor
  assert.equal(peliculaServeParaTela('FRONTAL IPHONE 8 PLUS BRANCA PREMIUM *ZL*', universal), false)
  // mas não serve na tela PLUS, que é maior
  assert.equal(peliculaServeParaTela('FRONTAL IPHONE 6S PLUS BRANCA LCD AAA', universal), false)
  // nem em outra família
  assert.equal(peliculaServeParaTela('FRONTAL SAMSUNG A15 PREMIUM INCELL', universal), false)
})

test('tela PLUS casa com película PLUS', () => {
  assert.equal(peliculaServeParaTela('FRONTAL IPHONE 6S PLUS BRANCA LCD AAA', 'PELICULA 3D IPHONE 6 PLUS/6S PLUS BRANCA'), true)
})

test('pontuação ordena as opções do vendedor', () => {
  const tela = 'FRONTAL MOTOROLA G35 LCD'
  assert.equal(pontuacaoModelo(tela, 'PELICULA 3D MOTOROLA G35'), 2)
  assert.equal(pontuacaoModelo(tela, 'PELICULA 3D MOTOROLA G35 PRO'), 2)
  assert.equal(pontuacaoModelo(tela, 'PELICULA 3D MOTOROLA E13'), 1)
})

test('categoria decide quem é tela e quem é película', () => {
  assert.equal(ehCategoriaTela('FRONTAL'), true)
  assert.equal(ehCategoriaTela('DISPLAY'), true)
  assert.equal(ehCategoriaTela('PELICULA'), false)
  assert.equal(ehCategoriaPelicula('PELICULA'), true)
  assert.equal(ehCategoriaPelicula('PELICULA|VIDEOGAME'), true)
  assert.equal(ehCategoriaPelicula('FRONTAL'), false)
})
