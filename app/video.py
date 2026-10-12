"""Video vertical local: fotografia real, textos e movimento suave, sem API paga."""
from __future__ import annotations

import hashlib
import io
import json
import math
from pathlib import Path
import subprocess
import tempfile

import requests
from PIL import Image, ImageDraw, ImageFont, ImageOps

from .config import settings
from .models import Product
from .narration import narration_text, synthesize, audio_duration


def money(value: float) -> str:
    return 'R$ ' + f'{value:,.2f}'.replace(',', '_').replace('.', ',').replace('_', '.')


def build_caption(product: Product, affiliate_url: str) -> str:
    return (
        f'{product.name}\nPor {money(product.price or 0)}\n\n'
        f'Confira a oferta: {affiliate_url}\n\n'
        'Publicidade • Link de afiliado. Posso receber comissão pela compra.\n'
        'Preço e disponibilidade podem mudar.\n#Ofertas #Achadinhos #MercadoLivre #Auvello'
    )


class VideoRenderer:
    width, height = 1080, 1920

    def __init__(self, output_dir: str | None = None):
        self.output_dir = Path(output_dir or settings.video_output_dir).resolve()
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _font(self, size: int, bold: bool = False):
        name = 'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'
        candidates = [Path('/usr/share/fonts/truetype/dejavu') / name, Path('C:/Windows/Fonts') / ('arialbd.ttf' if bold else 'arial.ttf')]
        for path in candidates:
            if path.exists():
                return ImageFont.truetype(str(path), size)
        raise RuntimeError('Instale as fontes DejaVu ou Arial; o Docker ja inclui DejaVu.')

    def _text(self, draw, text: str, y: int, size: int, fill, max_lines=3, bold=False):
        font = self._font(size, bold)
        lines, current = [], ''
        for word in text.split():
            test = (current + ' ' + word).strip()
            if draw.textlength(test, font=font) <= 800:
                current = test
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
        truncated = len(lines) > max_lines
        lines = lines[:max_lines]
        for i, line in enumerate(lines):
            while draw.textlength(line, font=font) > 800:
                line = line[:-1]
            if truncated and i == len(lines)-1:
                line = line.rstrip() + '…'
                while draw.textlength(line, font=font) > 800:
                    line = line[:-2] + '…'
            draw.text((540, y+i*(size+14)), line, font=font, fill=fill, anchor='mt')

    @staticmethod
    def _download(url: str) -> Image.Image:
        if not url.startswith('https://'):
            raise ValueError('A imagem do produto deve usar HTTPS.')
        with requests.get(url, timeout=(10, 30), stream=True) as response:
            response.raise_for_status()
            data = bytearray()
            for chunk in response.iter_content(65536):
                data.extend(chunk)
                if len(data) > 12*1024*1024:
                    raise ValueError('Imagem excede 12 MiB.')
        with Image.open(io.BytesIO(data)) as image:
            return ImageOps.exif_transpose(image).convert('RGB')

    def _card(self, product: Product, image: Image.Image, scene: int) -> Image.Image:
        canvas = Image.new('RGB', (1080, 1920), '#10172b')
        draw = ImageDraw.Draw(canvas)
        self._text(draw, 'AUVELLO • ACHADINHOS', 190, 36, '#76e9c4', bold=True, max_lines=1)
        hooks = ['OLHA ESSA OFERTA', 'CONFIRA O PREÇO', 'GOSTOU DO ACHADINHO?']
        self._text(draw, hooks[scene], 280, 50, 'white', bold=True, max_lines=2)
        draw.rounded_rectangle((140, 470, 940, 1150), radius=34, fill='white')
        fitted = ImageOps.contain(image, (730, 610), Image.Resampling.LANCZOS)
        canvas.paste(fitted, (540-fitted.width//2, 810-fitted.height//2))
        self._text(draw, product.name, 1190, 40, 'white', max_lines=3, bold=True)
        self._text(draw, money(product.price), 1405, 78, '#76e9c4', bold=True, max_lines=1)
        if scene == 1 and product.discount_percent > 0:
            self._text(draw, f'{product.discount_percent:g}% abaixo do preço original', 1510, 31, 'white', max_lines=1)
        else:
            self._text(draw, 'Confira o link e os detalhes da oferta', 1510, 31, 'white', max_lines=2)
        self._text(draw, 'Publicidade • Link de afiliado', 1640, 25, '#b3bad0', max_lines=1)
        self._text(draw, 'Preço e disponibilidade sujeitos a alteração', 1685, 22, '#b3bad0', max_lines=1)
        return canvas

    def render(self, product: Product, caption: str, *, image: Image.Image | None = None) -> Path:
        if product.currency_id != 'BRL' or product.price is None or not math.isfinite(product.price) or product.price <= 0:
            raise ValueError('Video exige preco positivo em BRL.')
        if len(caption) > 1800:
            raise ValueError('Descricao excede 1800 caracteres.')
        if image is None:
            if not product.picture:
                raise ValueError('Produto sem imagem.')
            image = self._download(product.picture)
        key = hashlib.sha256(f'narrated-v2|{product.product_id}|{product.price}|{caption}'.encode()).hexdigest()[:20]
        output = self.output_dir / f'oferta-{key}.mp4'
        # Cache permite tentar a entrega novamente sem renderizar a mesma oferta.
        if output.exists():
            return output
        with tempfile.TemporaryDirectory(dir=self.output_dir) as tmp:
            tmp = Path(tmp)
            speech = narration_text(product)
            audio, narration_engine = synthesize(speech, tmp)
            # As tres cenas cobrem toda a fala, sem corta-la no final.
            frames = math.ceil(max(18, audio_duration(audio) + 0.8) * 25 / 3)
            total_duration = frames * 3 / 25
            segments = []
            for scene in range(3):
                card, segment = tmp/f'card-{scene}.png', tmp/f'scene-{scene}.mp4'
                self._card(product, image, scene).save(card)
                subprocess.run([
                    'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(card),
                    '-vf', f"zoompan=z='min(zoom+0.00015,1.022)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d={frames}:s=1080x1920:fps=25,format=yuv420p",
                    '-an', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '24', str(segment),
                ], check=True, timeout=180)
                segments.append(segment)
            concat = tmp/'segments.txt'
            concat.write_text(''.join(f"file '{p.name}'\n" for p in segments))
            final = tmp/'final.mp4'
            subprocess.run([
                'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '1',
                '-i', str(concat), '-i', str(audio), '-t', str(total_duration),
                '-map', '0:v:0', '-map', '1:a:0', '-af', 'apad',
                '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', str(final),
            ], check=True, timeout=60)
            if final.stat().st_size > 24*1024*1024:
                raise ValueError('Video gerado excede 24 MiB.')
            self.output_dir.joinpath(f'oferta-{key}.txt').write_text(caption, encoding='utf-8')
            self.output_dir.joinpath(f'oferta-{key}.json').write_text(json.dumps({
                'product_id': product.product_id, 'price': product.price,
                'recipient': settings.video_recipient, 'caption': caption,
                'narration': speech, 'narration_engine': narration_engine, 'duration': total_duration,
            }, ensure_ascii=False, indent=2), encoding='utf-8')
            final.replace(output)
        return output
