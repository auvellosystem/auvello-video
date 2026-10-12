import asyncio
import os
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

from app.narration import narration_text, spoken_price, synthesize
from app.video import build_caption


class NarrationTests(unittest.TestCase):
    def test_price_in_reais_and_centavos(self):
        self.assertEqual(spoken_price(51.32), '51 reais e 32 centavos')
        self.assertEqual(spoken_price(1.01), '1 real e 1 centavo')
        self.assertEqual(spoken_price(0.01), '1 centavo')
        self.assertEqual(spoken_price(20), '20 reais')

    def test_speech_shortens_long_title_without_reading_link(self):
        product = SimpleNamespace(name='Controle Sem Fio ' * 30 + 'https://meli.la/abc',price=51.32)
        speech = narration_text(product)
        self.assertIn('51 reais e 32 centavos',speech)
        self.assertNotIn('https',speech)
        self.assertNotIn('#',speech)
        self.assertLess(len(speech),300)

    def test_full_description_keeps_product_link_and_hashtags(self):
        product = SimpleNamespace(name='Controle REDFIN ' * 35,price=51.32)
        caption = build_caption(product,'https://meli.la/1MdxGac')
        self.assertTrue(caption.startswith(product.name))
        self.assertIn('https://meli.la/1MdxGac',caption)
        self.assertIn('#MercadoLivre',caption)

    def test_online_failure_uses_audible_local_fallback(self):
        async def failed(*args):
            raise asyncio.TimeoutError()

        with tempfile.TemporaryDirectory() as tmp:
            def local(text, output):
                output.write_bytes(b'audio' * 100)
            with patch.dict(os.environ,{'TTS_ENGINE':'edge','TTS_FALLBACK':'local'}), patch('app.narration._online',failed), patch('app.narration._local',local):
                audio, engine = synthesize('Olá',Path(tmp))
            self.assertEqual(engine,'local')
            self.assertGreater(audio.stat().st_size,100)

    def test_fallback_disabled_does_not_silently_make_muted_video(self):
        async def failed(*args):
            raise asyncio.TimeoutError()
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(os.environ,{'TTS_ENGINE':'edge','TTS_FALLBACK':'none'}), patch('app.narration._online',failed):
                with self.assertRaises(RuntimeError):
                    synthesize('Olá',Path(tmp))


if __name__ == '__main__':
    unittest.main()
