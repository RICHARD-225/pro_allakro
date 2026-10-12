"""Cache Redis tolérant aux pannes : l'application ne doit jamais tomber parce que Redis est injoignable."""
import time

from django.test import SimpleTestCase

from apps.core import cache as cache_module
from apps.core.cache import CacheRedisTolerant


class CacheRedisTolerantTests(SimpleTestCase):
    def setUp(self):
        cache_module._coupure_jusqu_a[0] = 0.0  # disjoncteur fermé
        self.cache = CacheRedisTolerant('redis://127.0.0.1:1/0', {'OPTIONS': {'socket_connect_timeout': 0.2, 'socket_timeout': 0.2}})

    def tearDown(self):
        cache_module._coupure_jusqu_a[0] = 0.0

    def test_redis_injoignable_se_comporte_comme_un_cache_vide(self):
        self.assertEqual(self.cache.get('x', 'defaut'), 'defaut')
        self.assertIsNone(self.cache.get('x'))
        self.assertIsNone(self.cache.set('x', 1, 30))
        self.assertFalse(self.cache.add('x', 1))
        self.assertFalse(self.cache.delete('x'))
        self.assertEqual(self.cache.get_many(['a', 'b']), {})
        self.assertEqual(self.cache.incr('compteur'), 1)

    def test_le_disjoncteur_evite_d_attendre_a_chaque_requete(self):
        self.cache.get('x')  # première panne : ouvre le disjoncteur pendant 30 secondes
        debut = time.monotonic()
        for _ in range(50):
            self.cache.get('x')
            self.cache.set('x', 1)
        self.assertLess(time.monotonic() - debut, 0.2)
