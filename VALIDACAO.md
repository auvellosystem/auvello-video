# Validação desta entrega

- Sete testes automáticos passaram: extração do formato mostrado, moeda brasileira,
  rejeição de ofertas incompletas, filtro de grupo/histórico, ordem de envio e falhas de entrega.
- Instalação reproduzível com `npm ci --omit=dev` concluída; sintaxe JavaScript conferida.
- Imports das APIs utilizadas no Baileys 6.7.22 conferidos.
- Renderização real com Python/Pillow/FFmpeg concluída usando uma imagem ilustrativa
  de teste e os preços/link do exemplo. MP4: H.264, 1080 × 1920, yuv420p, 18 segundos,
  aproximadamente 0,9 MB. Descrição preservou `https://meli.la/1MdxGac`.
- Quadro do vídeo inspecionado visualmente.

## Atualização com narração

- Cinco testes Python adicionais passaram: preços com centavos, roteiro conciso,
  nome completo/link/hashtags na descrição, reserva de voz e recusa de vídeo mudo.
- MP4 narrado gerado de verdade com a voz brasileira local eSpeak NG: H.264,
  1080 × 1920, 18 segundos no exemplo, áudio AAC. Verificação de volume confirmou
  áudio presente (média -22,3 dB; pico -1,4 dB), e o roteiro inclui produto e preço.
- A voz online foi tentada, mas não pôde ser validada por restrições de conexão/SSL
  deste ambiente. Deve ser validada na hospedagem; a reserva local foi testada.
- O tempo de vídeo se ajusta à duração da fala. Os 18 segundos descrevem o exemplo,
  não uma duração fixa para todos os produtos.

Não foram usados seus segredos, banco Neon ou sessão WhatsApp. Não houve envio real,
deploy no Render ou alteração no GitHub. O funcionamento com WhatsApp/Neon reais será
validado após configurar o serviço e conectar o segundo celular. O Dockerfile está
incluído, mas a imagem Docker não foi construída neste ambiente.
