import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from PIL import Image
from app.models import Product
from app.video import VideoRenderer, build_caption
from app.service import AuvelloService, Candidate
from app.whatsapp import WhatsAppClient


def product():
    return Product('TEST', 'ITEM', 'Fone de ouvido de teste', None, None, 99.90, 149.90, 'BRL', 'https://example.com/item', 'https://example.com/image.jpg')


class VideoTests(unittest.TestCase):
    def test_delivery_marks_cooldown_only_after_success(self):
        service = AuvelloService.__new__(AuvelloService)
        service.db = Mock()
        service.db.offer_candidates.return_value = [service._candidate_to_record(Candidate(product(), 'games_acessorios', None, 0))]
        service.db.can_notify.return_value = True
        service.whatsapp = Mock()
        service._affiliate_url = Mock(return_value='https://example.com/affiliate')
        config = SimpleNamespace(whatsapp_media_token='test', video_recipient='5528999676818', video_max_per_cycle=2)
        with patch('app.service.settings', config), patch('app.video.VideoRenderer') as renderer, patch.object(service, '_assign_scores'):
            renderer.return_value.render.return_value = Path('/tmp/test.mp4')
            service.whatsapp.send_video.return_value = False
            service.run_videos()
            service.db.mark_notified.assert_not_called()
            service.whatsapp.send_video.return_value = True
            service.run_videos()
            service.db.mark_notified.assert_called_once()
            self.assertEqual(service.db.mark_notified.call_args.args[1], 'video:5528999676818')
            self.assertIn('https://example.com/affiliate', service.whatsapp.send_video.call_args.args[1])

    def test_raw_video_upload(self):
        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory)/'test.mp4'
            video.write_bytes(b'\x00\x00\x00\x18ftypisom')
            config = SimpleNamespace(whatsapp_media_token='test', whatsapp_service_url='http://localhost:3000')
            with patch('app.whatsapp.settings', config), patch('app.whatsapp.requests.post') as post:
                post.return_value.ok = True
                self.assertTrue(WhatsAppClient().send_video(video, 'Descricao'))
                self.assertEqual(post.call_args.kwargs['headers']['Authorization'], 'Bearer test')
                self.assertEqual(post.call_args.args[0], 'http://localhost:3000/send-video')

    def test_card_and_invalid_currency(self):
        image = Image.new('RGB', (800, 800), 'white')
        with tempfile.TemporaryDirectory() as directory:
            renderer = VideoRenderer(directory)
            self.assertEqual(renderer._card(product(), image, 0).size, (1080, 1920))
            p = product()
            p.currency_id = 'USD'
            with self.assertRaises(ValueError):
                renderer.render(p, build_caption(p, 'https://example.com'), image=image)

if __name__ == '__main__':
    unittest.main()
