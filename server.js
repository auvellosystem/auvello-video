import express from 'express';
import pg from 'pg';
import pino from 'pino';
import QRCode from 'qrcode';
import { makeWASocket, DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initialize, recover, authState } from './store.js';
import { imageOffer } from './offers.js';
import { deliver } from './delivery.js';
import { startKeepAlive } from './keepalive.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const execute = promisify(execFile);
const password = process.env.ADMIN_PASSWORD || '';
const recipient = process.env.VIDEO_RECIPIENT || '5528999676818';
if (password.length < 16 || !process.env.DATABASE_URL || !/^\d{10,15}$/.test(recipient)) {
  console.error('Preencha DATABASE_URL, ADMIN_PASSWORD (mínimo 16 caracteres) e VIDEO_RECIPIENT.');
  process.exit(1);
}
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 15000, query_timeout: 15000, statement_timeout: 15000});
pool.on('error', () => { console.error('Conexão Neon interrompida.'); process.exit(1); });
const logger = pino({level: 'silent'}); // Nao imprime chaves da sessao nem mensagens privadas.
const csrf = randomBytes(24).toString('hex');
let source = null, socket = null, qr = null, ready = false, busy = false;
let connection = 'Aguardando conexão', groups = [], lastSent = 0, ingestion = Promise.resolve();
let pendingEvents = 0;
const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({extended: false, limit: '8kb'}));
app.get('/health', (_req, res) => res.json({status: 'ok'}));
app.use((req, res, next) => {
  const raw = req.headers.authorization || '';
  const supplied = raw.startsWith('Basic ') ? Buffer.from(raw.slice(6), 'base64').toString('utf8') : '';
  const expected = `admin:${password}`;
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.set('WWW-Authenticate', 'Basic realm="Auvello Video"');
    return res.status(401).send('Entre com usuário admin e sua ADMIN_PASSWORD.');
  }
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
  if (req.method === 'POST' && req.body.csrf !== csrf) return res.status(403).send('Atualize o painel e tente novamente.');
  next();
});
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const labels = {queued:'Na fila', rendering:'Gerando vídeo', sending:'Enviando vídeo', description:'Enviando descrição', sent:'Enviado', failed:'Falhou ao gerar', review:'Confira no WhatsApp', cancelled:'Cancelado'};
app.get('/', async (_req, res, next) => {
  try {
    const {rows} = await pool.query('SELECT id,offer,status,error,created_at FROM av_group_jobs ORDER BY id DESC LIMIT 30');
    const options = groups.map(g => `<option value="${escape(g.id)}" ${g.id===source?.group?'selected':''}>${escape(g.subject)}</option>`).join('');
    res.type('html').send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auvello Vídeos</title>
      <style>body{font:16px system-ui;background:#10172b;color:#fff;margin:0}main{max-width:900px;margin:auto;padding:28px}h1{color:#76e9c4}section{background:#1c2740;padding:20px;border-radius:12px;margin:18px 0}button,select{padding:12px;font:inherit;margin:5px 0;max-width:100%}button{background:#76e9c4;border:0;border-radius:6px;cursor:pointer}table{width:100%;border-collapse:collapse}td,th{padding:12px;text-align:left;border-bottom:1px solid #354361;overflow-wrap:anywhere}img{max-width:270px}small{color:#bdc8e3}a{color:#76e9c4}</style>
      <main><h1>Auvello Vídeos</h1><p>Foto da oferta → vídeo vertical → seu WhatsApp.</p>
      <section><h2>1. Conecte o segundo WhatsApp</h2><p>${escape(connection)}</p>${qr?`<img alt="QR Code para conectar o segundo WhatsApp" src="${qr}"><p>No segundo celular: WhatsApp → Aparelhos conectados → Conectar aparelho.</p>`:''}<p><a href="/">Atualizar painel</a></p></section>
      <section><h2>2. Escolha o grupo de ofertas</h2><form method="post" action="/groups"><input type="hidden" name="csrf" value="${csrf}"><button>Atualizar lista de grupos</button></form>
      ${groups.length?`<form method="post" action="/source"><input type="hidden" name="csrf" value="${csrf}"><select name="group" required><option value="">Escolha um grupo</option>${options}</select><br><button>Salvar grupo e acompanhar novas ofertas</button></form>`:'<p>A lista aparece depois que o WhatsApp estiver conectado.</p>'}
      <p>${source?.group?`Grupo selecionado: ${escape(groups.find(g=>g.id===source.group)?.subject || source.group)}`:'Nenhum grupo selecionado.'}</p>
      <form method="post" action="/pause"><input type="hidden" name="csrf" value="${csrf}"><button>Pausar recebimento e fila</button></form><small>Somente ofertas novas com foto e legenda completa serão processadas.</small></section>
      <section><h2>3. Receba o vídeo e a descrição</h2><p>Destino: +${escape(recipient)}</p><p>Vídeos verticais com movimento na foto, textos e narração em português. A duração acompanha a fala. A descrição vem com produto, link e hashtags.</p>
      <table><thead><tr><th>Produto</th><th>Situação</th></tr></thead><tbody>${rows.map(j=>`<tr><td>${escape(j.offer.name)}</td><td>${escape(labels[j.status] || j.status)}${j.error?`<br><small>${escape(j.error)}</small>`:''}</td></tr>`).join('') || '<tr><td colspan="2">Aguardando a primeira oferta.</td></tr>'}</tbody></table></section></main></html>`);
  } catch (e) { next(e); }
});
app.post('/groups', async (_req, res, next) => {
  try {
    if (!ready) return res.status(409).send('Conecte o WhatsApp primeiro. Volte e atualize o painel.');
    groups = Object.values(await socket.groupFetchAllParticipating()).sort((a,b)=>a.subject.localeCompare(b.subject));
    res.redirect(303, '/');
  } catch (e) { next(e); }
});
app.post('/source', async (req, res, next) => {
  try {
    if (!ready || !groups.some(g=>g.id===req.body.group)) return res.status(400).send('Escolha um grupo da lista atualizada.');
    const since = Date.now();
    await pool.query('INSERT INTO av_group_config(id,group_id,since) VALUES(1,$1,$2) ON CONFLICT(id) DO UPDATE SET group_id=$1,since=$2', [req.body.group, new Date(since)]);
    source = {group: req.body.group, since};
    // Ofertas de um grupo anterior nao vazam para o novo destino.
    await pool.query("UPDATE av_group_jobs SET status='cancelled',image=NULL WHERE status='queued' AND group_id<>$1", [source.group]);
    res.redirect(303, '/');
  } catch (e) { next(e); }
});
app.post('/pause', async (_req, res, next) => {
  try {
    source = null;
    await pool.query('UPDATE av_group_config SET group_id=NULL WHERE id=1');
    res.redirect(303, '/');
  } catch(e) { next(e); }
});
app.use((_err, _req, res, _next) => res.status(503).send('Não foi possível concluir. Confira a conexão e tente atualizar o painel.'));

async function receive(message, type, currentSocket) {
  const active = source;
  const offer = imageOffer(message, active, type);
  if (!offer) return;
  const check = await pool.query('SELECT id FROM av_group_jobs WHERE group_id=$1 AND message_id=$2', [active.group, offer.id]);
  if (check.rowCount) return;
  const count = await pool.query("SELECT count(*)::int AS n FROM av_group_jobs WHERE status IN ('queued','rendering')");
  if (count.rows[0].n >= 25) { console.warn('Fila cheia (25 ofertas). Nova oferta ignorada.'); return; }
  const stream = await downloadMediaMessage(message, 'stream', {}, {logger, reuploadRequest: currentSocket.updateMediaMessage});
  const chunks = []; let size = 0;
  const deadline = setTimeout(()=>stream.destroy(new Error('Download interrompido')),45000);
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > 12*1024*1024) { stream.destroy(); throw new Error('Imagem muito grande'); }
      chunks.push(chunk);
    }
  } finally { clearTimeout(deadline); }
  if (source !== active) return;
  await pool.query('INSERT INTO av_group_jobs(group_id,message_id,offer,image) VALUES($1,$2,$3,$4) ON CONFLICT(group_id,message_id) DO NOTHING', [active.group, offer.id, offer, Buffer.concat(chunks)]);
  console.log('Nova oferta salva para gerar vídeo.');
}

async function connect() {
  const auth = await authState(pool);
  let version;
  try { ({version} = await fetchLatestBaileysVersion()); } catch { /* Usa a versao incluida no pacote. */ }
  const current = makeWASocket({auth: auth.state, logger, ...(version?{version}:{}), markOnlineOnConnect: false, syncFullHistory: false});
  socket = current;
  let reconnecting = false, saves = Promise.resolve();
  current.ev.on('creds.update', () => {
    saves = saves.then(auth.saveCreds).catch(()=>{ console.error('Falha ao salvar sessão no Neon.'); process.exit(1); });
  });
  current.ev.on('connection.update', async update => {
    try {
      if (current !== socket) return;
      if (update.qr) { qr = await QRCode.toDataURL(update.qr); connection = 'Leia o QR Code com o segundo WhatsApp.'; }
      if (update.connection === 'open') {
        qr = null; ready = true; connection = 'WhatsApp conectado';
        console.log('Segundo WhatsApp conectado.');
        try { groups = Object.values(await current.groupFetchAllParticipating()); } catch { groups = []; }
      }
      if (update.connection === 'close') {
        ready = false; qr = null;
        const code = update.lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          connection = 'Sessão desconectada. Gere um novo QR Code reiniciando o serviço.';
          await pool.query('DELETE FROM av_group_auth');
        } else if (!reconnecting) {
          reconnecting = true; connection = 'Reconectando WhatsApp…';
          setTimeout(()=>connect().catch(()=>{console.error('Falha ao reconectar.');process.exit(1);}), 5000);
        }
      }
    } catch { console.error('Falha ao atualizar conexão do WhatsApp.'); }
  });
  current.ev.on('messages.upsert', ({messages, type}) => {
    for (const message of messages) {
      if (!imageOffer(message, source, type)) continue;
      if (pendingEvents >= 25) { console.warn('Recebimento ocupado; oferta ignorada.'); continue; }
      pendingEvents++;
      ingestion = ingestion.then(()=>receive(message,type,current))
        .catch(()=>console.warn('Não foi possível baixar e salvar uma oferta.'))
        .finally(()=>pendingEvents--);
    }
  });
}

async function work() {
  if (busy || !ready || !source?.group || Date.now()-lastSent < 60000) return;
  busy = true;
  let job, folder, stage = 'rendering';
  try {
    const {rows} = await pool.query("UPDATE av_group_jobs SET status='rendering',attempts=attempts+1,updated_at=NOW() WHERE id=(SELECT id FROM av_group_jobs WHERE status='queued' AND group_id=$1 AND next_try<=NOW() ORDER BY id LIMIT 1) RETURNING *", [source.group]);
    job = rows[0]; if (!job) return;
    folder = await mkdtemp(path.join(tmpdir(), 'auvello-video-'));
    await writeFile(path.join(folder,'offer.json'), JSON.stringify(job.offer));
    await writeFile(path.join(folder,'image'), job.image);
    await execute(process.env.PYTHON_BIN || 'python3', ['-m','app.render',folder], {cwd:root, timeout:660000, maxBuffer:1024*1024});
    if (!ready || source?.group !== job.group_id) {
      await pool.query("UPDATE av_group_jobs SET status='queued' WHERE id=$1", [job.id]); return;
    }
    const result = JSON.parse(await readFile(path.join(folder,'result.json'),'utf8'));
    if (result.narration_engine === 'local') console.log('Usada a voz local de reserva nesta oferta.');
    const video = await readFile(result.video);
    if (video.length > 24*1024*1024) throw new Error('Video muito grande');
    const sendingSocket = socket;
    const [account] = await sendingSocket.onWhatsApp(recipient);
    if (!account?.exists) throw new Error('Numero de destino nao encontrado');
    stage = 'delivery';
    const timedSocket = {sendMessage: async (...args) => {
      let timer;
      try { return await Promise.race([sendingSocket.sendMessage(...args), new Promise((_,reject)=>{ timer=setTimeout(()=>reject(new Error('Entrega incerta')),120000); })]); }
      finally { clearTimeout(timer); }
    }};
    await deliver({video, caption: result.caption, jid: account.jid, socket: timedSocket,
      mark: (status,error=null)=>pool.query("UPDATE av_group_jobs SET status=$2,error=$3,updated_at=NOW(),image=CASE WHEN $2='sent' THEN NULL ELSE image END WHERE id=$1", [job.id,status,error]),
    });
    lastSent = Date.now();
    console.log('Processamento concluído. Confira a situação no painel.');
  } catch {
    if (job) {
      const status = stage === 'delivery' ? 'review' : job.attempts >= 3 ? 'failed' : 'queued';
      await pool.query("UPDATE av_group_jobs SET status=$2,error=$3,next_try=NOW()+INTERVAL '5 minutes',updated_at=NOW() WHERE id=$1", [job.id,status,stage==='delivery'?'Entrega incerta; confira no WhatsApp.':'Falha ao gerar vídeo ou validar destino. Até três tentativas automáticas.']).catch(()=>{console.error('Falha ao atualizar fila.');process.exit(1);});
    } else console.error('Fila indisponível.');
  } finally {
    if (folder) await rm(folder,{recursive:true,force:true}).catch(()=>{});
    busy = false;
  }
}

async function main() {
  await initialize(pool);
  // Lease persistente funciona tambem com o pooler transacional do Neon.
  const owner = randomBytes(24).toString('hex');
  const lease = await pool.query("INSERT INTO av_group_runtime(id,owner,expires) VALUES(1,$1,NOW()+INTERVAL '90 seconds') ON CONFLICT(id) DO UPDATE SET owner=$1,expires=EXCLUDED.expires WHERE av_group_runtime.expires<NOW() RETURNING owner", [owner]);
  if (!lease.rowCount) throw new Error('Ja existe outra instancia');
  let leaseInFlight = false;
  setInterval(async()=>{
    if (leaseInFlight) return;
    leaseInFlight = true;
    try {
      const renewed = await pool.query("UPDATE av_group_runtime SET expires=NOW()+INTERVAL '90 seconds' WHERE id=1 AND owner=$1 AND expires>NOW() RETURNING owner", [owner]);
      if (!renewed.rowCount) process.exit(1);
    } catch { console.error('Controle da sessão perdido. Reiniciando.'); process.exit(1); }
    finally { leaseInFlight = false; }
  },15000);
  process.once('SIGTERM',()=>{
    ready = false;
    pool.query('DELETE FROM av_group_runtime WHERE id=1 AND owner=$1',[owner]).finally(()=>process.exit(0));
    setTimeout(()=>process.exit(0),3000).unref();
  });
  await recover(pool);
  const {rows} = await pool.query('SELECT group_id,since FROM av_group_config WHERE id=1');
  if (rows[0]?.group_id) source = {group:rows[0].group_id, since:new Date(rows[0].since).getTime()};
  app.listen(Number(process.env.PORT || 10000),'0.0.0.0',()=>{
    console.log('Painel Auvello Vídeos iniciado.');
    const keepAlive = startKeepAlive();
    process.once('SIGTERM',()=>keepAlive.stop());
  });
  await connect();
  setInterval(()=>work(),5000);
  setInterval(()=>pool.query("UPDATE av_group_jobs SET image=NULL,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END WHERE image IS NOT NULL AND created_at<NOW()-INTERVAL '7 days' AND status NOT IN ('rendering','sending','description')").catch(()=>{}),3600000);
}
main().catch(()=>{console.error('Falha ao iniciar. Confira o Neon, as variáveis e se há outra instância usando este banco.');process.exit(1);});
