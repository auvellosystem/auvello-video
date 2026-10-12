# Atualização: chamada HTTP a cada cinco minutos

Extraia `server.js` e `keepalive.js` deste ZIP diretamente na raiz da sua pasta
`auvello-video-grupo`, substituindo o `server.js`. O ZIP também inclui o teste e este guia.
Preserve sua `.env` e seu Git. Não substitua arquivos do `auvello-cloud`.

No terminal da pasta:

```powershell
git add server.js keepalive.js tests/keepalive.test.js ATUALIZACAO-KEEPALIVE.md
git commit -m "Adiciona chamada de health a cada cinco minutos"
git push
```

O Render fornece `RENDER_EXTERNAL_URL` automaticamente. Não precisa cadastrar
essa variável nem colocar senha na URL. Depois do deploy, o projeto tenta acessar
seu próprio endereço público `/health` a cada cinco minutos, com uma chamada inicial
cinco segundos após iniciar. Nos logs aparece `Keep-alive: /health respondeu.`

O Neon já recebe consultas do controle de sessão a cada 15 segundos e da fila enquanto
ela está ativa. Não foi adicionado outro loop de banco redundante. Essa atividade
também consome a cota de computação do Neon.

Isso é uma tentativa enquanto o processo está executando, não uma garantia de operação
contínua. Se o Render suspender/reiniciar o processo, o loop também para; não consegue
acordar uma instância já suspensa. Uma chamada feita pelo próprio serviço não deve ser
tratada como garantia de que a plataforma irá mantê-lo ativo. Para despertar um serviço
parado é necessário acesso externo; para operação contínua, hospedagem sempre ativa.

Mantêm-se os limites do plano gratuito. No Render são 750 horas de instâncias gratuitas
por workspace/mês; dois serviços ligados 24 horas por dia passam dessa cota.
Você pode desligar este loop com `KEEP_ALIVE_ENABLED=false` no Render.

Referências oficiais:
- https://render.com/docs/environment-variables
- https://render.com/docs/free

Validação: quatro testes de requisição, recuperação de erro, sobreposição e desativação
passaram; sintaxe do servidor conferida. A contagem de tráfego pela plataforma só pode
ser observada na sua hospedagem. Não houve acesso às suas credenciais ou ao seu Render.
