# Auvello Vídeos — ofertas recebidas no WhatsApp

Projeto independente. Conecta um segundo WhatsApp, acompanha um grupo escolhido no painel,
extrai foto/título/preço/link de cada nova oferta Auvello e envia um MP4 vertical e uma
descrição para `5528999676818`. O link recebido é preservado; não precisa de API ou OAuth
do Mercado Livre e não altera o bot que publica no grupo.

O vídeo tem 1080 × 1920, H.264, três cenas com textos, movimento suave na fotografia
e narração automática em português brasileiro. A duração é de pelo menos 18 segundos
e se ajusta à fala para não cortá-la. Não inclui música. A descrição preserva o nome
completo do produto, o link recebido e hashtags, além da identificação de publicidade.
Você baixa o vídeo e publica manualmente no TikTok.

## Preparação

1. Extraia **o conteúdo** deste ZIP na pasta vazia `auvello-video-grupo`.
2. Verifique que `Dockerfile`, `package.json`, `server.js` e a pasta `app` aparecem
   diretamente nessa pasta. Não crie uma segunda pasta de projeto dentro dela.
3. Copie `.env.example` para `.env` se quiser configurar localmente. A `.env` é ignorada
   pelo Git. Para o Render, preencha as variáveis em **Environment**.

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL completa do Neon **do projeto de vídeos**, com senha e `sslmode=require`. |
| `ADMIN_PASSWORD` | Uma senha nova para o painel, com pelo menos 16 caracteres. |
| `VIDEO_RECIPIENT` | `5528999676818` |
| `PYTHON_BIN` | `python3` no Docker/Render; `python` no Windows, se for executar localmente. |
| `PORT` | `10000` localmente; no Render o serviço usa a porta fornecida pelo ambiente. |
| `TTS_ENGINE` | `edge` para voz online; `local` para voz sintetizada sem internet. Padrão: `edge`. |
| `TTS_VOICE` | `pt-BR-AntonioNeural` (masculina) ou `pt-BR-FranciscaNeural` (feminina). Padrão: Antonio. |
| `TTS_FALLBACK` | `local` para usar a voz de reserva se a online falhar; `none` para aguardar nova tentativa. Padrão: `local`. |

Não coloque credenciais do Mercado Livre. Use o banco do projeto novo. A sessão WhatsApp,
a seleção do grupo e a fila são persistidas em tabelas `av_group_*`. A senha do painel
fica no ambiente, nunca no banco ou no código.

## Narração e descrição

O roteiro apresenta o produto, fala o preço em reais/centavos e indica o link na
descrição. Não lê a URL nem as hashtags em voz alta. Para títulos longos, a fala usa
somente as primeiras palavras; o nome completo permanece na descrição. Não inventa
características, benefícios, avaliações ou um desconto diferente do recebido.

A voz online usa `edge-tts`, sem chave de API, e depende da disponibilidade do serviço
externo. Somente o roteiro da oferta é enviado para gerar a voz; não envia as
credenciais nem o histórico do grupo. Se falhar, a voz local eSpeak NG é utilizada
e registrada nos logs. Essa voz de reserva soa mais robótica. O vídeo não é entregue
mudo caso os dois motores falhem; a tarefa entra no fluxo de novas tentativas.

## GitHub

Use um repositório vazio para esta nova pasta. Pode usar o seu `auvello-video` existente,
mas nesse caso ele já contém commits: **não tente enviar esta pasta com `git push --force`**.
Peça o procedimento de substituição dos arquivos preservando o histórico antes de enviar.
O repositório `auvello-cloud` não participa deste projeto.

## Render

1. Crie um **Web Service** separado e conecte o repositório deste projeto.
2. Escolha a branch correta e runtime **Docker**. Deixe Root Directory vazio se os
   arquivos estiverem na raiz do repositório. Dockerfile: `./Dockerfile`.
3. Cadastre `DATABASE_URL`, `ADMIN_PASSWORD` e `VIDEO_RECIPIENT` em **Environment**.
4. Configure Health Check Path como `/health` e faça o deploy.
5. Abra o endereço HTTPS do novo serviço. Usuário: `admin`; senha: sua `ADMIN_PASSWORD`.
6. No **segundo celular**, abra WhatsApp → Aparelhos conectados → Conectar aparelho
   e leia o QR Code exibido no painel. Atualize a página se o QR Code expirar.
7. Atualize a lista de grupos, escolha o grupo Auvello e clique em salvar.
8. Aguarde **uma nova oferta** com foto e legenda completa. O painel mostra a fila.
9. Confira no número de destino o vídeo e, em seguida, a descrição com seu link.

Somente estar no grupo pelo celular não conecta este serviço: é preciso ler o QR Code
do painel também. Depois disso a sessão fica no Neon e costuma sobreviver aos reinícios.
Se o WhatsApp desconectar a sessão, reinicie o serviço para conectar novamente.

Serviços gratuitos do Render podem suspender por inatividade. Enquanto o serviço estiver
parado, o acompanhamento em tempo real não funciona e ofertas desse intervalo podem ser
perdidas. Persistência no Neon não mantém o processo ativo. Para operação contínua,
use uma hospedagem que mantenha o processo executando. Rode apenas uma instância por banco.

## Formato aceito e fila

Uma mensagem **de imagem com legenda**, contendo título, `Por: R$ 51,32` e um link HTTPS
`meli.la` ou `mercadolivre.com.br`. `De: R$ 114,90` é opcional. Foto e texto enviados em
mensagens separadas não são combinados nesta versão. Não lê outros grupos, mensagens
privadas, histórico inicial ou fotos de visualização única. A escolha do grupo começa
no momento em que você clica em salvar. Não reprocessa mensagens já registradas.

Processa um vídeo por vez e espera pelo menos um minuto entre entregas. Limite de 25
ofertas pendentes; ofertas além do limite são ignoradas e indicadas nos logs. Imagens
até 12 MiB; vídeo até 24 MiB. Imagens pendentes/retidas são removidas após sete dias;
vídeos temporários são apagados após cada tentativa. Sem acervo permanente de vídeos.

Falhas de renderização têm até três tentativas. Uma falha durante envio fica como
“Confira no WhatsApp”, sem repetir automaticamente, pois o vídeo pode já ter chegado.
Nessa situação confira o destino e faça a recuperação manual. Pausar interrompe novos
recebimentos e a fila; um envio já iniciado pode terminar. Ao retomar o mesmo grupo,
ofertas já na fila continuam pendentes. Ao trocar de grupo, a fila anterior é cancelada.

## Execução local e validação

O Docker inclui Node.js 22, Python, FFmpeg e fontes DejaVu. Com Docker instalado:

```powershell
docker build -t auvello-video-grupo .
docker run --rm --env-file .env -p 10000:10000 auvello-video-grupo
```

Abra `http://localhost:10000`. Para desenvolver sem Docker, instale Node.js 22+, Python
3.11+, FFmpeg no PATH e fontes Arial/DejaVu; rode `npm ci`, `python -m pip install -r
requirements.txt` e `npm start`, ajustando `PYTHON_BIN` para seu Python local.

Testes de extração, filtro de mensagens e entrega simulada: `npm test`.
Testes de roteiro, preço falado, descrição e reserva de voz: `python -m unittest
discover -s tests -p "test_*.py"`.
O teste com WhatsApp real e Neon exige suas credenciais e a conexão por QR Code.
Baileys usa uma conexão de aparelho vinculado e não é a API oficial do WhatsApp.
