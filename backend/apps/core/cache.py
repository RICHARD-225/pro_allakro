"""
Cache Redis tolérant aux pannes.

Les compteurs de limitation de débit (DRF) sont stockés dans Redis, partagés entre tous les processus de l'application et
conservés au redémarrage. Si Redis est injoignable, l'application continue de fonctionner : le cache se comporte comme vide
(les limites de débit sont alors suspendues, tandis que le blocage des connexions, qui est enregistré en base PostgreSQL, reste
actif) et l'incident est écrit dans le journal de sécurité, au plus une fois par minute.
"""
import logging
import time
from functools import wraps

import redis
from django.core.cache.backends.redis import RedisCache

journal = logging.getLogger('allakro.securite')
ERREURS = (redis.exceptions.RedisError, OSError)
_dernier_signalement = [0.0]
_coupure_jusqu_a = [0.0]  # disjoncteur : après une panne, Redis n'est pas réessayé pendant 30 secondes (évite d'attendre à chaque requête)


def _signaler(exc):
    maintenant = time.monotonic()
    _coupure_jusqu_a[0] = maintenant + 30
    if maintenant - _dernier_signalement[0] > 60:
        _dernier_signalement[0] = maintenant
        journal.error('Cache Redis injoignable (%s) : limitation de débit suspendue, blocage de connexion en base toujours actif',
                      type(exc).__name__)


def tolerant(valeur_si_panne):
    def decorateur(methode):
        @wraps(methode)
        def enveloppe(self, *args, **kwargs):
            try:
                if time.monotonic() < _coupure_jusqu_a[0]:
                    raise redis.exceptions.ConnectionError('disjoncteur ouvert')
                return methode(self, *args, **kwargs)
            except ERREURS as exc:
                if time.monotonic() >= _coupure_jusqu_a[0]:
                    _signaler(exc)
                valeur = valeur_si_panne
                if valeur == 'DEFAUT':  # get(cle, defaut) : on rend le défaut demandé
                    return args[1] if len(args) > 1 else kwargs.get('default')
                return valeur
        return enveloppe
    return decorateur


class CacheRedisTolerant(RedisCache):
    get = tolerant('DEFAUT')(RedisCache.get)
    set = tolerant(None)(RedisCache.set)
    add = tolerant(False)(RedisCache.add)
    delete = tolerant(False)(RedisCache.delete)
    has_key = tolerant(False)(RedisCache.has_key)
    touch = tolerant(False)(RedisCache.touch)
    get_many = tolerant({})(RedisCache.get_many)
    set_many = tolerant([])(RedisCache.set_many)
    delete_many = tolerant(None)(RedisCache.delete_many)
    clear = tolerant(None)(RedisCache.clear)

    def incr(self, key, delta=1, version=None):
        try:
            if time.monotonic() < _coupure_jusqu_a[0]:
                return delta
            return super().incr(key, delta, version)
        except ERREURS as exc:
            _signaler(exc)
            return delta
