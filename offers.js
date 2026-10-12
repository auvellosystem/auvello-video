// Interpreta exclusivamente o modelo de oferta observado no grupo Auvello.
export function parseOffer(text) {
  if (typeof text !== 'string' || text.length > 10000) return null;
  const plain = text.replace(/[\u200e\u200f]/g, '').replace(/\r/g, '');
  const priceMatch = plain.match(/^\s*[*_~]*Por\s*:\s*[*_~]*\s*R\$\s*([\d.]+,\d{2})/im);
  const oldMatch = plain.match(/^\s*[*_~]*De\s*:\s*[*_~]*\s*R\$\s*([\d.]+,\d{2})/im);
  if (!priceMatch) return null;
  const amount = value => Number(value.replace(/\./g, '').replace(',', '.'));
  const price = amount(priceMatch[1]);
  if (!Number.isFinite(price) || price <= 0) return null;
  const links = plain.match(/https:\/\/[^\s<>]+/g) || [];
  const link = links.map(value => value.replace(/[)*_~,;.!]+$/, '')).find(value => {
    try {
      const url = new URL(value);
      return !url.username && !url.password && (url.hostname === 'meli.la' ||
        url.hostname === 'mercadolivre.com.br' || url.hostname.endsWith('.mercadolivre.com.br'));
    } catch { return false; }
  });
  if (!link) return null;
  const firstPrice = Math.min(priceMatch.index, oldMatch?.index ?? Infinity);
  const name = plain.slice(0, firstPrice).split('\n')
    .map(line => line.replace(/[*_~]/g, '').trim())
    .filter(line => line && !/ACHADO\s+AUVELLO|^Link\s*:/i.test(line))
    .join(' ').trim();
  if (name.length < 3 || name.length > 1200) return null;
  const originalPrice = oldMatch ? amount(oldMatch[1]) : null;
  return { name, price, originalPrice: originalPrice > price ? originalPrice : null, link };
}

export function imageOffer(message, source, type = 'notify') {
  if (type !== 'notify' || !source?.group || message.key?.remoteJid !== source.group || !message.key?.id) return null;
  const timestamp = Number(message.messageTimestamp);
  if (!Number.isFinite(timestamp) || timestamp * 1000 < source.since) return null;
  let body = message.message;
  for (let i = 0; i < 5; i++) {
    // Somente mensagens normais/temporarias; nao arquiva midia de visualizacao unica.
    if (body?.ephemeralMessage) body = body.ephemeralMessage.message;
    else break;
  }
  const photo = body?.imageMessage;
  if (!photo || Number(photo.fileLength || 0) > 12 * 1024 * 1024) return null;
  const offer = parseOffer(photo.caption);
  return offer ? { ...offer, id: message.key.id } : null;
}
