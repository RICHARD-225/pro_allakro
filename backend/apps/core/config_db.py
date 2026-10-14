"""Lecture de l'adresse de base de données fournie par un hébergeur (Render, Neon…) : `DATABASE_URL`."""
from urllib.parse import parse_qsl, unquote, urlparse


def base_depuis_url(url):
    """
    Convertit `postgresql://utilisateur:mot_de_passe@hôte:port/base?sslmode=require` en réglage Django.
    Les options de l'adresse (sslmode, channel_binding…) sont transmises à PostgreSQL ; un hôte « -pooler » (répartiteur de
    connexions de Neon) impose de désactiver les curseurs côté serveur.
    """
    analyse = urlparse(url)
    if analyse.scheme not in ('postgres', 'postgresql'):
        raise ValueError("DATABASE_URL doit commencer par postgresql:// (ou postgres://).")
    nom = unquote(analyse.path.lstrip('/'))
    if not analyse.hostname or not nom:
        raise ValueError("DATABASE_URL incomplète : hôte ou nom de base manquant.")
    reglage = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': nom,
        'USER': unquote(analyse.username or ''),
        'PASSWORD': unquote(analyse.password or ''),
        'HOST': analyse.hostname,
        'PORT': str(analyse.port or 5432),
        'OPTIONS': dict(parse_qsl(analyse.query)),
    }
    if '-pooler' in analyse.hostname:
        reglage['DISABLE_SERVER_SIDE_CURSORS'] = True
    return reglage
