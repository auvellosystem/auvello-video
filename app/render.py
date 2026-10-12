"""Interface local: JSON e fotografia recebidos do WhatsApp -> MP4 e descricao."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageOps
from .models import Product
from .video import VideoRenderer, build_caption


def main():
    folder = Path(sys.argv[1]).resolve()
    offer = json.loads((folder / 'offer.json').read_text(encoding='utf-8'))
    product = Product(
        product_id=offer['id'], item_id=None, name=offer['name'],
        category_id=None, domain_id=None, price=offer['price'],
        original_price=offer.get('originalPrice'), currency_id='BRL',
        permalink=offer['link'],
    )
    caption = build_caption(product, offer['link'])
    with Image.open(folder / 'image') as source:
        image = ImageOps.exif_transpose(source).convert('RGB')
    output = VideoRenderer(str(folder)).render(product, caption, image=image)
    metadata = json.loads(output.with_suffix('.json').read_text(encoding='utf-8'))
    (folder / 'result.json').write_text(json.dumps({
        'video': str(output), 'caption': caption, 'narration_engine': metadata['narration_engine'],
    }, ensure_ascii=False), encoding='utf-8')


if __name__ == '__main__':
    main()
