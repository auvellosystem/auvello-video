# Instalacao nova: pasta, GitHub e Render separados

## 1. Pasta nova no computador

Extraia o ZIP em uma pasta nova chamada `auvello-video`. Abra essa pasta no VS Code. Abra a pasta que contem diretamente `main.py`, `Dockerfile` e `README.md`.

Esta entrega nao inclui `.git`, `.env`, credenciais, tokens, sessao de WhatsApp ou banco de dados do projeto anterior.

## 2. Repositorio novo no GitHub

Crie um repositorio vazio chamado `auvello-video`, sem adicionar README, licenca ou gitignore pela interface. No terminal do VS Code, dentro da pasta nova:

```bash
git init
git branch -M main
git add .
git commit -m "Inicia Auvello Video independente"
```

Depois copie a URL do novo repositorio no GitHub e use:

```bash
git remote add origin URL_DO_REPOSITORIO_NOVO
git push -u origin main
```

Substitua `URL_DO_REPOSITORIO_NOVO` pela URL real, por exemplo `https://github.com/SEU_USUARIO/auvello-video.git`. Nao use a URL do `auvello-cloud`.

## 3. Banco de dados separado

Use um novo banco PostgreSQL e configure sua URL em `DATABASE_URL`. Nao use a URL do banco antigo: esta base guarda sessao WhatsApp, tokens Mercado Livre, ofertas e cooldown em tabelas com os mesmos nomes. Um banco separado evita que os dois projetos compartilhem esses registros.

A inicializacao cria as tabelas necessarias. Para teste local sem PostgreSQL, o padrao e SQLite em `auvello-video.db`. Para a instalacao no Render, use o banco separado para manter as credenciais persistentes.

## 4. Credenciais e autorizacao do Mercado Livre

Voce pode preencher o ID e o segredo do aplicativo Mercado Livre que ja utiliza, mantendo a URI de redirecionamento exatamente como cadastrada no aplicativo. Configure os demais dados de afiliacao no projeto novo.

Crie um `.env` local a partir de `.env.example`, preencha as credenciais e a `DATABASE_URL` do banco NOVO. Nao copie tokens ou a sessao do WhatsApp do projeto antigo.

No terminal local:

```bash
python -m pip install -r requirements.txt
python main.py --auth
```

Siga a autorizacao exibida e cole somente o parametro `code` no terminal quando solicitado. Esse processo salva os tokens no banco novo. Faca isso antes de iniciar a descoberta no Render: a autorizacao atual e interativa e precisa do terminal.

O `.env` e ignorado pelo Git. Nunca envie o arquivo ou tokens ao GitHub.

## 5. Novo servico no Render

Crie um Web Service conectado ao novo repositorio `auvello-video`, branch `main`, usando o runtime Docker. O Dockerfile deve ficar na raiz do repositorio. Ele ja instala Python, Node, Pillow, FFmpeg e fontes, e inicia `start.sh`; nao precisa preencher um comando separado para substituir o CMD do Dockerfile.

Se a interface oferecer Health Check Path, use `/health`.

Referencias oficiais: https://render.com/docs/docker e https://render.com/docs/web-services.

No ambiente do NOVO servico, configure:

```dotenv
CONTENT_MODE=videos
VIDEO_RECIPIENT=5528999676818
VIDEO_INTERVAL_MINUTES=30
VIDEO_MAX_PER_CYCLE=2
DISCOVERY_INTERVAL_MINUTES=10
COOLDOWN_HOURS=24
DATABASE_URL=URL_DO_BANCO_NOVO
WA_MEDIA_TOKEN=SEU_SEGREDO_LONGO
QR_SECRET=OUTRO_SEGREDO_LONGO
ML_CLIENT_ID=SEU_APP_ID
ML_CLIENT_SECRET=SEU_CLIENT_SECRET
ML_REDIRECT_URI=URI_CADASTRADA_NO_SEU_APP
AFFILIATE_MODE=portal
AFFILIATE_TAG=SUA_TAG
ML_AFFILIATE_COOKIE=SEU_COOKIE_DE_AFILIADO
```

Mantenha o modo e os dados de afiliacao que funcionam na sua instalacao anterior. A lista acima usa o modo `portal` da base; se seu fluxo usa outro modo, configure-o de acordo.

Gere cada segredo separadamente no seu terminal com:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

`WA_MEDIA_TOKEN` e compartilhado entre o Python e o Node do novo container. `QR_SECRET` protege a pagina de conexao do WhatsApp. Nao configure `WHATSAPP_SERVICE_URL` no Render: `start.sh` define o endereco interno com a porta correta.

Para usar o painel administrativo herdado, configure tambem `ADMIN_USER` e `ADMIN_PASSWORD` novos. Os destinos `WA_GROUP_*` podem ficar ausentes no modo videos.

## 6. Nova sessao de WhatsApp

Depois do deploy, abra o endereco do NOVO servico seguido de:

```text
/qr?key=SEU_QR_SECRET
```

Leia o QR com a conta que enviara os videos. O destinatario e `5528999676818`; ele nao define qual conta sera a remetente. Conecte a sessao pelo QR novo; nao copie o armazenamento da sessao do projeto anterior.

O primeiro envio consulta o WhatsApp para confirmar se o destinatario existe. Com a descoberta funcionando e uma oferta elegivel com imagem, o sistema envia o MP4 com a descricao para esse numero.

Nao basta replicar as variaveis do ambiente antigo: este novo banco precisa da autorizacao Mercado Livre e desta nova conexao WhatsApp.

## 7. Operacao

A descoberta roda a cada 10 minutos por padrao. Os videos rodam a cada 30 minutos, incluindo uma tentativa na inicializacao; sao tentadas ate duas ofertas por ciclo. Ofertas ficam sujeitas aos filtros de desconto existentes e ao cooldown.

O endpoint `/send-video` exige o token, aceita MP4 de ate 24 MiB e envia apenas ao destinatario configurado. O MP4 e a descricao tambem ficam em `generated-videos/`, ignorado pelo Git.

A publicacao no TikTok e feita por voce depois de receber o arquivo. Esta primeira versao e sem narracao e musica.

O projeto `auvello-cloud`, seu repositorio e seu servico atual podem continuar rodando em paralelo. Nao altere o modo do servico anterior para instalar esta copia.
