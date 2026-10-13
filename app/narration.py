"""Narra oferta recebida, sem inventar atributos nem ler URL/hashtags em voz alta."""
import asyncio
import ctypes
from decimal import Decimal, ROUND_HALF_UP
import os
from pathlib import Path
import re
import subprocess
import sys
import wave


def spoken_price(value: float) -> str:
    total = int((Decimal(str(value)) * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    reais, cents = divmod(total, 100)
    parts = []
    if reais:
        parts.append(f'{reais} ' + ('real' if reais == 1 else 'reais'))
    if cents:
        parts.append(f'{cents} ' + ('centavo' if cents == 1 else 'centavos'))
    return ' e '.join(parts) or 'zero reais'


def narration_text(product) -> str:
    # Titulos de marketplace frequentemente sao longos e repetitivos.
    # A descricao preserva o titulo completo; a fala usa somente o inicio.
    title = re.sub(r'https?://\S+', '', product.name)
    title = re.sub(r'[<>\[\]{}*_~|]', ' ', title)
    words, length = [], 0
    for word in title.split()[:18]:
        if length + len(word) + 1 > 140:
            break
        words.append(word)
        length += len(word) + 1
    short_name = ' '.join(words).strip('.,;:!?') or 'esse produto'
    return (
        f'Olha esse achadinho! {short_name}. '
        f'Por {spoken_price(product.price)}. '
        'Confira a oferta pelo link na descrição. '
        'O preço pode mudar.'
    )


async def _online(text: str, output: Path, voice: str):
    import edge_tts
    await asyncio.wait_for(edge_tts.Communicate(text, voice, rate='+5%').save(str(output)), timeout=45)


def _piper(text: str, output: Path, model: Path):
    config = Path(f'{model}.json')
    if not model.is_file():
        raise FileNotFoundError(f'Modelo Piper não encontrado: {model}')
    if not config.is_file():
        raise FileNotFoundError(f'Configuração Piper não encontrada: {config}')
    subprocess.run(
        [sys.executable, '-m', 'piper', '-m', str(model), '-c', str(config),
         '-f', str(output), '--', text],
        check=True, capture_output=True, text=True, timeout=120,
    )


def _local(text: str, output: Path):
    # Biblioteca empacotada: funciona sem instalacao manual de executavel no Windows.
    import espeakng_loader
    lib = ctypes.CDLL(espeakng_loader.get_library_path())
    lib.espeak_Initialize.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_char_p, ctypes.c_int]
    lib.espeak_SetVoiceByName.argtypes = [ctypes.c_char_p]
    lib.espeak_SetParameter.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int]
    lib.espeak_Synth.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint,
        ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]
    callback_type = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)
    lib.espeak_SetSynthCallback.argtypes = [callback_type]
    rate = lib.espeak_Initialize(2, 0, espeakng_loader.get_data_path().encode(), 0x8000)
    if rate <= 0:
        raise RuntimeError('Não foi possível iniciar a voz local.')
    chunks, count = [], 0
    def receive(samples, length, events):
        nonlocal count
        count += max(length, 0)
        if count > rate * 60:
            return 1
        if samples and length > 0:
            chunks.append(ctypes.string_at(samples, length * 2))
        return 0
    callback = callback_type(receive)
    try:
        if lib.espeak_SetVoiceByName(b'pt-br') != 0:
            raise RuntimeError('Voz brasileira local indisponível.')
        lib.espeak_SetParameter(1, 160, 0)
        lib.espeak_SetSynthCallback(callback)
        data = text.encode('utf-8') + b'\0'
        buffer = ctypes.create_string_buffer(data)
        if lib.espeak_Synth(buffer, len(data), 0, 1, 0, 1, None, None) != 0 or count > rate * 60 or not chunks:
            raise RuntimeError('Falha ao gerar a narração local.')
        with wave.open(str(output), 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            wav.writeframes(b''.join(chunks))
    finally:
        lib.espeak_Terminate()


def synthesize(text: str, folder: Path) -> tuple[Path, str]:
    engine = os.getenv('TTS_ENGINE', 'piper')
    voice = os.getenv('TTS_VOICE', 'pt-BR-AntonioNeural')
    fallback = os.getenv('TTS_FALLBACK', 'local')
    if engine not in ('edge', 'piper', 'local'):
        raise ValueError('TTS_ENGINE deve ser edge, piper ou local.')
    if engine == 'piper':
        default_model = Path(__file__).resolve().parent.parent / 'models' / 'pt_BR-faber-medium.onnx'
        model = Path(os.getenv('TTS_MODEL', str(default_model)))
        if not model.is_absolute():
            model = Path(__file__).resolve().parent.parent / model
        output = folder / 'narration.wav'
        try:
            _piper(text, output, model)
            if output.stat().st_size < 100:
                raise ValueError('Narração Piper vazia.')
            return output, 'piper'
        except Exception:
            output.unlink(missing_ok=True)
            if fallback != 'local':
                raise RuntimeError('Narração Piper indisponível; tente novamente.') from None
    if engine == 'edge':
        if not re.fullmatch(r'pt-BR-[A-Za-z]+Neural', voice):
            raise ValueError('Escolha uma voz pt-BR do Edge TTS.')
        online = folder / 'narration.mp3'
        try:
            asyncio.run(_online(text, online, voice))
            if online.stat().st_size < 100:
                raise ValueError('Narração online vazia.')
            return online, 'edge'
        except Exception:
            online.unlink(missing_ok=True)
            # Se a voz online estiver indisponivel, nunca entrega video mudo.
            if fallback != 'local':
                raise RuntimeError('Narração online indisponível; tente novamente.') from None
    output = folder / 'narration.wav'
    _local(text, output)
    if output.stat().st_size < 100:
        raise ValueError('Narração local vazia.')
    return output, 'local'


def audio_duration(audio: Path) -> float:
    result = subprocess.run([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(audio),
    ], check=True, capture_output=True, text=True, timeout=20)
    duration = float(result.stdout.strip())
    if not 0 < duration <= 60:
        raise ValueError('Narração fora do limite de duração.')
    return duration
