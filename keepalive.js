// Tentativa de manter trafego HTTP enquanto o processo estiver em execucao.
// Nao reinicia uma instancia suspensa e nao altera as cotas do plano gratuito.
export function startKeepAlive({
  baseUrl = process.env.RENDER_EXTERNAL_URL,
  enabled = process.env.KEEP_ALIVE_ENABLED !== 'false',
  fetchImpl = fetch,
  log = console.log,
  timers = {setInterval,clearInterval,setTimeout,clearTimeout},
} = {}) {
  if (!enabled || !baseUrl) return {stop(){}, tick:async()=>false};
  let url;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw Error('URL invalida');
    url = new URL('/health',parsed.origin).href;
  } catch {
    log('Keep-alive não iniciado: o endereço público deve usar HTTPS.');
    return {stop(){}, tick:async()=>false};
  }
  let busy = false, stopped = false;
  const tick = async()=>{
    if (busy || stopped) return false;
    busy = true;
    try {
      const response = await fetchImpl(url,{
        method:'GET', redirect:'error', signal:AbortSignal.timeout(20000),
        headers:{'User-Agent':'Auvello-Video-Health/1.0'},
      });
      if (!response.ok) throw Error('HTTP indisponivel');
      const data = await response.json();
      if (data.status !== 'ok') throw Error('Resposta inesperada');
      log('Keep-alive: /health respondeu.');
      return true;
    } catch {
      log('Keep-alive: requisição falhou; nova tentativa em cinco minutos.');
      return false;
    } finally { busy = false; }
  };
  const interval = timers.setInterval(()=>void tick(),5*60*1000);
  const first = timers.setTimeout(()=>void tick(),5000);
  interval?.unref?.(); first?.unref?.();
  return {
    tick,
    stop(){ stopped = true; timers.clearInterval(interval); timers.clearTimeout(first); },
  };
}
