# Auvello Video — projeto independente

Este projeto e uma copia independente da base Auvello, com captura de ofertas, geracao de link de afiliado, renderizacao de video vertical e entrega no WhatsApp 55 28 99967-6818. A publicacao no TikTok e manual.

Instale em uma pasta nova, publique em um repositorio novo e crie um servico novo no Render. Consulte **COMECE-AQUI.md** para o procedimento completo. Nao substitua arquivos do projeto anterior.

O modo padrao e `CONTENT_MODE=videos`. Os modulos de grupos da base foram mantidos como opcao, mas nao sao executados nesse modo; nao e necessario configurar destinos de grupos.

## Conteudo

- MP4 de 18 segundos, 1080 x 1920, 25 fps, H.264/AAC.
- Tres cenas com imagem do produto, nome, preco e movimento suave.
- Descricao com link de afiliado, publicidade e hashtags.
- Ate duas ofertas por ciclo de 30 minutos; cooldown configuravel.
- Sem narracao ou musica nesta versao.

## Validacao e limites

A renderizacao completa e o layout foram verificados com um produto demonstrativo. Testes simulados verificaram upload, destinatario e cooldown. Nao foi feito envio real nem deploy. Configure as credenciais e conecte uma nova sessao antes de testar no seu ambiente.

O cooldown so e registrado apos sucesso de envio. Se a conexao falhar depois de a mensagem ser entregue, pode haver repeticao no ciclo seguinte. Use uma unica instancia do worker; nao ha reserva distribuida de tarefas. A renderizacao e sequencial no processo Python.

O preco vem do cache da descoberta; confira disponibilidade antes de publicar. Produtos sem imagem ou preco positivo em BRL nao geram video. Arquivos locais podem desaparecer em redeploy sem disco persistente; em disco persistente, remova videos antigos quando necessario.

## Testes sem envio

```bash
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
node tests/test_media_route.mjs
```
