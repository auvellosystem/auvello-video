# Auvello Video

Projeto completo para localizar ofertas, gerar links de afiliado, montar videos verticais e entregar no WhatsApp 55 28 99967-6818. A publicacao no TikTok e manual.

Abra COMECE-AQUI.md para substituir os arquivos e configurar o projeto.

## Fluxo atual

O projeto pode aproveitar a autorizacao do Mercado Livre do servico antigo via ML_TOKEN_PROVIDER_URL e ML_TOKEN_PROVIDER_SECRET. Seu banco Neon permanece separado. O servico antigo precisa da atualizacao do provedor de tokens entregue no pacote integracao-mercado-livre.zip; configurar somente a URL nao cria esse endpoint.

Os dados do programa de afiliados (modo, tag e cookie) continuam sendo configurados neste projeto para gerar seus links.

## Videos

MP4 de 18 segundos, 1080 x 1920, 25 fps, H.264/AAC, com tres cenas, imagem do produto, preco e movimento suave. Sem narracao nem musica nesta versao. Descricao com link de afiliado e hashtags.

O padrao e duas ofertas por ciclo de 30 minutos, sujeito aos filtros e ao cooldown. A renderizacao e sequencial. Produtos sem imagem ou sem preco positivo em BRL nao geram video.

## Testes

```bash
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
node tests/test_media_route.mjs
```

Seis testes Python e o teste Node de midia passaram. O MP4 completo foi verificado com produto demonstrativo. A integracao do servico antigo tambem foi simulada. Nao foi realizado deploy nem envio real.

## Limites

O preco vem do cache: confira disponibilidade antes de publicar. Mantenha uma instancia do worker. O cooldown so e registrado depois do sucesso; uma perda de conexao apos a entrega pode causar repeticao no ciclo seguinte. Os arquivos ficam em generated-videos, ignorado pelo Git, e podem desaparecer em redeploy sem armazenamento persistente. Se houver disco persistente, remova videos antigos conforme necessario.
