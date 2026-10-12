# Pasta completa do projeto novo

Este ZIP e completo e SEM uma pasta extra na raiz. Ao extrair diretamente na pasta do projeto, app, tests, whatsapp-service, main.py e Dockerfile ficam no primeiro nivel.

## 1. Substituir os arquivos

Feche processos que estejam executando o projeto. Na pasta do projeto novo que ja esta conectada ao GitHub, preserve .env e .git. Se preferir apagar tudo antes de extrair, copie esses dois itens para fora e restaure-os depois. Eles nao estao neste ZIP.

Remova os outros arquivos e pastas dessa copia do projeto novo, incluindo as subpastas auvello-cloud e auvello-video criadas por engano ao extrair o pacote de integracao. Nao remova nem modifique a pasta do projeto antigo.

Extraia o CONTEUDO deste ZIP diretamente nessa pasta. Se o Windows criar automaticamente uma pasta com o nome do ZIP, abra-a e copie o conteudo para a pasta do projeto. Nao deixe esse ZIP dentro do repositorio.

No VS Code, abra a pasta que contem diretamente main.py e Dockerfile.

## 2. Seu .env

Preserve DATABASE_URL apontando para o Neon NOVO. Acrescente estas duas linhas ao .env existente:

```dotenv
ML_TOKEN_PROVIDER_URL=https://auvello-cloud.onrender.com
ML_TOKEN_PROVIDER_SECRET=MESMO_SEGREDO_CONFIGURADO_NO_RENDER_ANTIGO
```

Gere a chave no seu terminal, nao aqui no chat:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Use o resultado como ML_TOKEN_PROVIDER_SECRET nos dois servicos. Mantenha:

```dotenv
CONTENT_MODE=videos
VIDEO_RECIPIENT=5528999676818
VIDEO_INTERVAL_MINUTES=30
VIDEO_MAX_PER_CYCLE=2
```

Copie do ambiente antigo os valores de AFFILIATE_MODE, AFFILIATE_TAG e ML_AFFILIATE_COOKIE. A autorizacao compartilhada nao substitui as configuracoes do gerador de links.

No modo provedor remoto, ML_CLIENT_ID, ML_CLIENT_SECRET e ML_REDIRECT_URI nao sao utilizados pelo projeto novo. Se voce ja os preencheu, podem permanecer. Nao execute python main.py --auth neste modo.

Gere tambem valores separados para WA_MEDIA_TOKEN e QR_SECRET antes de ativar o envio. Esses segredos nao sao a chave ML_TOKEN_PROVIDER_SECRET.

Se perdeu seu .env, copie .env.example para .env e preencha suas configuracoes novamente. Este pacote nao contem suas senhas, cookies nem conexao privada do banco.

## 3. Dependencia do projeto antigo

A autorizacao existente so podera ser utilizada depois de atualizar o projeto antigo com os tres arquivos da pasta auvello-cloud do pacote integracao-mercado-livre.zip:

- app/auth.py
- app/token_provider.py
- whatsapp-service/index.js

Eles devem ser copiados para o PROJETO ANTIGO, nunca para dentro do novo. O Render antigo tambem precisa receber ML_TOKEN_PROVIDER_SECRET com o mesmo valor do novo.

Esta copia completa nao modifica seu projeto antigo nem instala automaticamente o endpoint nele. A autorizacao antiga precisa estar valida no Neon antigo; se faltar ou estiver revogada, o provedor retorna 503.

## 4. Conferir o repositorio novo

No terminal da pasta do projeto novo:

```powershell
git remote -v
git status
```

O remoto deve ser https://github.com/auvellosystem/auvello-video.git. Confira antes de enviar mudancas.

Depois da revisao:

```powershell
git add .
git commit -m "Atualiza projeto completo de videos e autorizacao compartilhada"
git push
```

O .env deve continuar ignorado pelo Git. A regra .gitattributes mantem scripts shell com quebras LF para executar no Linux.

## 5. Render novo (ainda sera criado)

Crie um Web Service conectado ao repositorio auvellosystem/auvello-video, branch main, runtime Docker, Dockerfile na raiz. O CMD incluido inicia Node e Python. Deixe Docker Command e Root Directory vazios, se esses campos aparecerem na interface.

Cadastre no Environment do novo servico as configuracoes do .env, com DATABASE_URL do banco NOVO e ML_TOKEN_PROVIDER_URL do Render ANTIGO. Deixe WHATSAPP_SERVICE_URL ausente: start.sh define automaticamente o endereco interno na porta correta.

Conecte a nova sessao WhatsApp abrindo a URL do NOVO servico seguida de /qr?key=SEU_QR_SECRET. A conta que le o QR e a remetente; 5528999676818 e o destinatario.

O /health retorna whatsappReady true depois de conectado. A primeira entrega depende de oferta elegivel com imagem, acesso autorizado ao Mercado Livre e geracao do link de afiliado.

Esta entrega nao inclui rotina para manter servicos gratuitos ativos nem elimina limites da hospedagem. O novo depende da disponibilidade do antigo para obter acesso ao Mercado Livre.
