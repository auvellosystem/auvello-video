
    if (!acquired) {
      console.log('Outra instância ainda controla o WhatsApp; aguardando liberação da sessão.');
      await new Promise(resolve=>setTimeout(resolve,5000));
    }
  }
  if (stopping) {
    if (acquired) await pool.query('DELETE FROM av_group_runtime WHERE id=1 AND owner=$1',[owner]).catch(()=>{});
    return;
  }
  let leaseInFlight = false;
  leaseTimer = setInterval(async()=>{
    if (leaseInFlight) return;
    leaseInFlight = true;
    try {
      const renewed = await pool.query("UPDATE av_group_runtime SET expires=NOW()+INTERVAL '90 seconds' WHERE id=1 AND owner=$1 AND expires>NOW() RETURNING owner", [owner]);
      if (!renewed.rowCount) process.exit(1);
    } catch { console.error('Controle da sessão perdido. Reiniciando.'); process.exit(1); }
    finally { leaseInFlight = false; }
  },15000);
  await recover(pool);
  const {rows} = await pool.query('SELECT group_id,since FROM av_group_config WHERE id=1');
  if (rows[0]?.group_id) source = {group:rows[0].group_id, since:new Date(rows[0].since).getTime()};
  await connect();
  setInterval(()=>work(),5000);
  setInterval(()=>pool.query("UPDATE av_group_jobs SET image=NULL,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END WHERE image IS NOT NULL AND created_at<NOW()-INTERVAL '7 days' AND status NOT IN ('rendering','sending','description')").catch(()=>{}),3600000);
}
main().catch(error=>{console.error('Falha ao iniciar:',error?.message||error);process.exit(1);});
