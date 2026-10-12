import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';

export async function initialize(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS av_group_auth (
      key TEXT PRIMARY KEY, value JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS av_group_config (
      id INTEGER PRIMARY KEY CHECK (id=1), group_id TEXT, since TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS av_group_runtime (
      id INTEGER PRIMARY KEY CHECK (id=1), owner TEXT NOT NULL, expires TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS av_group_jobs (
      id BIGSERIAL PRIMARY KEY, group_id TEXT NOT NULL, message_id TEXT NOT NULL,
      offer JSONB NOT NULL, image BYTEA, status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0, error TEXT,
      next_try TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (group_id, message_id)
    );
    CREATE INDEX IF NOT EXISTS av_group_jobs_pending ON av_group_jobs(status, next_try);
  `);
}

export async function recover(pool) {
  // Renderizacao pode recomecar. Uma entrega interrompida exige verificacao humana.
  await pool.query("UPDATE av_group_jobs SET status='queued' WHERE status='rendering'");
  await pool.query("UPDATE av_group_jobs SET status='review', error='Entrega interrompida; confira no WhatsApp antes de repetir.' WHERE status IN ('sending','description')");
}

export async function authState(pool) {
  const read = async key => {
    const {rows} = await pool.query('SELECT value FROM av_group_auth WHERE key=$1', [key]);
    return rows[0] ? JSON.parse(JSON.stringify(rows[0].value), BufferJSON.reviver) : null;
  };
  const write = (key, value) => pool.query(
    'INSERT INTO av_group_auth(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',
    [key, JSON.stringify(value, BufferJSON.replacer)]
  );
  const creds = await read('creds') || initAuthCreds();
  return {
    state: {creds, keys: {
      get: async (type, ids) => {
        const result = {};
        for (const id of ids) {
          let value = await read(`${type}-${id}`);
          if (value && type === 'app-state-sync-key') value = proto.Message.AppStateSyncKeyData.fromObject(value);
          result[id] = value;
        }
        return result;
      },
      set: async data => {
        for (const [type, values] of Object.entries(data)) {
          for (const [id, value] of Object.entries(values)) {
            if (value) await write(`${type}-${id}`, value);
            else await pool.query('DELETE FROM av_group_auth WHERE key=$1', [`${type}-${id}`]);
          }
        }
      },
    }},
    saveCreds: () => write('creds', creds),
  };
}
