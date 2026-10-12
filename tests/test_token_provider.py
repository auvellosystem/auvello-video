import importlib.util
import json
import sys
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from app import auth

class RemoteProviderTests(unittest.TestCase):
    def setUp(self):
        auth._remote_token_cache = None
        self.config = SimpleNamespace(ml_token_provider_url='https://auvello-cloud.onrender.com', ml_token_provider_secret='test')

    def test_uses_remote_and_caches_without_loading_local_tokens(self):
        response = Mock(status_code=200)
        response.json.return_value = {'access_token':'test-token','expires_at':time.time()+3600}
        with patch.object(auth,'settings',self.config), patch.object(auth.requests,'get',return_value=response) as get, patch.object(auth,'load_tokens') as load:
            self.assertEqual(auth.get_valid_access_token(),'test-token')
            self.assertEqual(auth.get_valid_access_token(),'test-token')
            get.assert_called_once()
            load.assert_not_called()
            self.assertFalse(get.call_args.kwargs['allow_redirects'])
            self.assertEqual(get.call_args.kwargs['headers']['Authorization'],'Bearer test')

    def test_denial_and_expiration_do_not_fallback_to_interactive_auth(self):
        for status, body in [(401,{}),(200,{'access_token':'expired','expires_at':0})]:
            response=Mock(status_code=status)
            response.json.return_value=body
            with patch.object(auth,'settings',self.config), patch.object(auth.requests,'get',return_value=response), patch.object(auth,'authorize_interactively') as authorize:
                with self.assertRaises(RuntimeError):auth.get_valid_access_token()
                authorize.assert_not_called()

    def test_redirect_and_insecure_provider_are_rejected(self):
        response=Mock(status_code=302)
        with patch.object(auth,'settings',self.config), patch.object(auth.requests,'get',return_value=response):
            with self.assertRaises(RuntimeError):auth.get_valid_access_token()
        self.config.ml_token_provider_url='http://example.com'
        with patch.object(auth,'settings',self.config), patch.object(auth.requests,'get') as get:
            with self.assertRaises(RuntimeError):auth.get_valid_access_token()
            get.assert_not_called()

if __name__=='__main__':unittest.main()
