// Uma entrega de resultado incerto nao e repetida automaticamente.
export async function deliver({video, caption, jid, socket, mark}) {
  await mark('sending');
  try {
    await socket.sendMessage(jid, {
      video, mimetype: 'video/mp4', caption: 'Vídeo Auvello pronto. A descrição será enviada abaixo.',
    });
    await mark('description');
    await socket.sendMessage(jid, {text: caption});
    await mark('sent');
  } catch (error) {
    await mark('review', 'Confira no WhatsApp: o vídeo ou a descrição podem ter sido enviados.');
    return false;
  }
  return true;
}
