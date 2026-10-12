"""
Django settings for PRoAll project.
"""

from pathlib import Path
from datetime import timedelta
from decouple import config, Csv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Quick-start development settings - unsuitable for production
SECRET_KEY = config('SECRET_KEY')
DEBUG = config('DEBUG', default=False, cast=bool)
ALLOWED_HOSTS = config('ALLOWED_HOSTS', cast=Csv())

# Application definition
INSTALLED_APPS = [
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.postgres',
    
    'rest_framework',
    'corsheaders',
    'rest_framework_simplejwt',
    
    "apps.core",
    "apps.exploitation",
    "apps.finances",
    "apps.stock",
    "apps.achats",
    "apps.accounts",
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.csp.ContentSecurityPolicyMiddleware',
    'apps.core.middleware.EntreesSainesMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'apps.accounts.csrf.CsrfApiMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

CORS_ALLOWED_ORIGINS = config('CORS_ALLOWED_ORIGINS', cast=Csv())
CORS_ALLOW_CREDENTIALS = True

ROOT_URLCONF = 'PRoAll.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'PRoAll.wsgi.application'

# Database
DATABASES = {
     "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config('DB_NAME'),
        "USER": config('DB_USER'),
        "PASSWORD": config('DB_PASSWORD', default=''),
        "HOST": config('DB_HOST', default='localhost'),
        "PORT": config('DB_PORT', default='5432'),
    }
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 10},
    },
    {
        'NAME': 'apps.accounts.validators.ComplexiteMotDePasseValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'Africa/Abidjan'
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = 'static/'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'apps.accounts.authentication.CustomJWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    # API JSON uniquement (pas d'interface navigable en production)
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
    # Seul le JSON est accepté en entrée (pas de formulaire HTML ni de multipart sur l'API)
    'DEFAULT_PARSER_CLASSES': (
        'rest_framework.parsers.JSONParser',
    ),
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ),
    'EXCEPTION_HANDLER': 'apps.accounts.securite.gestionnaire_exceptions',
    # Nombre de serveurs mandataires de confiance devant l'application (0 = adresse IP directe, en-tête X-Forwarded-For ignoré)
    'NUM_PROXIES': config('TRUSTED_PROXY_COUNT', default=0, cast=int),
    # Montants renvoyés en nombres (et non en chaînes) pour les calculs côté frontend
    'COERCE_DECIMAL_TO_STRING': False,
    'DATE_INPUT_FORMATS': ['%Y-%m-%d'],
    # Limitation du débit des points d'accès d'authentification (par adresse IP, ou par compte une fois connecté).
    # En production derrière un proxy, régler NUM_PROXIES et un cache partagé (Redis, base de données).
    'DEFAULT_THROTTLE_RATES': {
        'anon': config('LIMITE_ANONYME', default='60/minute'),
        'user': config('LIMITE_UTILISATEUR', default='900/minute'),
        'rapport': config('LIMITE_RAPPORT', default='12/minute'),
        'reinit': config('LIMITE_REINITIALISATION', default='5/hour'),
        'reinit_valider': config('LIMITE_REINITIALISATION_VALIDER', default='10/hour'),
        'connexion': config('LIMITE_CONNEXION', default='10/minute'),
        'session': config('LIMITE_SESSION', default='30/minute'),
        'mot_de_passe': config('LIMITE_MOT_DE_PASSE', default='5/minute'),
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=config('JWT_ACCESS_TOKEN_LIFETIME_MINUTES', default=15, cast=int)),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=config('JWT_REFRESH_TOKEN_LIFETIME_DAYS', default=7, cast=int)),
    # Clé de signature des jetons distincte de la clé Django si JWT_SIGNING_KEY est renseignée
    'SIGNING_KEY': config('JWT_SIGNING_KEY', default=SECRET_KEY),
    'AUTH_COOKIE': 'allakro_access',
    'AUTH_COOKIE_REFRESH': 'allakro_refresh',
    'AUTH_COOKIE_HTTP_ONLY': True,
    'AUTH_COOKIE_SAMESITE': 'Lax',
    'AUTH_COOKIE_REFRESH_PATH': '/api/v1/auth/',
}

# Courrier : affiché dans la console en développement ; serveur SMTP (variables EMAIL_*) en production. L'application n'envoie
# aucun courrier pour l'instant.
FRONTEND_URL = config('FRONTEND_URL', default='http://localhost:5173')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='ALLAKRO <no-reply@allakro.local>')
EMAIL_ENVOI_ASYNCHRONE = True  # le courrier part en arrière-plan (désactivé pendant les tests)
if DEBUG and not config('EMAIL_HOST', default=''):
    MAILERS = {'default': {'BACKEND': 'django.core.mail.backends.console.EmailBackend'}}
else:
    MAILERS = {'default': {
        'BACKEND': 'django.core.mail.backends.smtp.EmailBackend',
        'OPTIONS': {
            'host': config('EMAIL_HOST', default='localhost'),
            'port': config('EMAIL_PORT', default=587, cast=int),
            'username': config('EMAIL_HOST_USER', default=''),
            'password': config('EMAIL_HOST_PASSWORD', default=''),
            'use_tls': config('EMAIL_USE_TLS', default=True, cast=bool),
        },
    }}


# =====================================================================================================================
# Sécurité (voir ALLAKRO_DOC.md, partie « Sécurité »). En production : DEBUG=False et les variables du fichier .env.exemple
# =====================================================================================================================
TRUSTED_PROXY_COUNT = config('TRUSTED_PROXY_COUNT', default=0, cast=int)

# --- Protection CSRF : jeton lu par l'interface dans le cookie « csrftoken » et renvoyé dans l'en-tête X-CSRFToken ---
CSRF_TRUSTED_ORIGINS = config('CSRF_TRUSTED_ORIGINS', default=','.join(CORS_ALLOWED_ORIGINS), cast=Csv())
CSRF_COOKIE_HTTPONLY = False      # l'interface doit pouvoir lire le jeton (il ne donne aucun accès seul)
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'

# --- HTTPS et en-têtes de sécurité (actifs hors développement) ---
X_FRAME_OPTIONS = 'DENY'
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'same-origin'
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=not DEBUG, cast=bool)
SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=0 if DEBUG else 31536000, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
# Derrière un serveur mandataire HTTPS (nginx) qui renvoie X-Forwarded-Proto : à activer avec SECURE_PROXY_SSL=True
if config('SECURE_PROXY_SSL', default=False, cast=bool):
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_REDIRECT_EXEMPT = [r'^api/v1/sante/$']  # la sonde de santé reste joignable en HTTP derrière le mandataire

# --- Politique de sécurité du contenu (CSP) des réponses de l'API : aucun contenu actif n'est jamais servi par l'API ---
from django.utils.csp import CSP  # noqa: E402

SECURE_CSP = {
    'default-src': [CSP.NONE],
    'frame-ancestors': [CSP.NONE],
    'base-uri': [CSP.NONE],
    'form-action': [CSP.NONE],
}

# --- Limites de requête ---
DATA_UPLOAD_MAX_MEMORY_SIZE = 1024 * 1024      # 1 Mo : l'API ne reçoit que de petits documents JSON
DATA_UPLOAD_MAX_NUMBER_FIELDS = 200
DATA_UPLOAD_MAX_NUMBER_FILES = 0

# --- Cache : compteurs de limitation de débit. « locmem » = un processus ; « db » ou « redis » si plusieurs processus ---
_CACHE = config('CACHE_BACKEND', default='locmem')
if _CACHE == 'db':
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.db.DatabaseCache', 'LOCATION': 'cache_allakro'}}
elif _CACHE == 'redis':
    # Redis (conteneur Docker en développement, service en production) ; l'application survit à une panne de Redis (apps/core/cache.py)
    CACHES = {'default': {
        'BACKEND': 'apps.core.cache.CacheRedisTolerant',
        'LOCATION': config('CACHE_LOCATION'),
        'KEY_PREFIX': 'allakro',
        'OPTIONS': {'socket_connect_timeout': 1, 'socket_timeout': 1},
    }}
else:
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'allakro'}}

# --- Journaux : événements de sécurité (connexions, refus, blocages) et erreurs, dans des fichiers qui tournent ---
LOGS_DIR = BASE_DIR / 'logs'
LOGS_DIR.mkdir(exist_ok=True)
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'standard': {'format': '%(asctime)s %(levelname)s %(name)s %(message)s'}},
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'standard'},
        'securite': {'class': 'logging.handlers.RotatingFileHandler', 'filename': str(LOGS_DIR / 'securite.log'),
                     'maxBytes': 5 * 1024 * 1024, 'backupCount': 10, 'formatter': 'standard', 'encoding': 'utf-8'},
        'erreurs': {'class': 'logging.handlers.RotatingFileHandler', 'filename': str(LOGS_DIR / 'erreurs.log'),
                    'maxBytes': 5 * 1024 * 1024, 'backupCount': 10, 'formatter': 'standard', 'encoding': 'utf-8',
                    'level': 'ERROR'},
    },
    'loggers': {
        'allakro.securite': {'handlers': ['securite', 'console'], 'level': 'INFO', 'propagate': False},
        'django.security': {'handlers': ['securite', 'console'], 'level': 'WARNING', 'propagate': False},
        'django.request': {'handlers': ['erreurs', 'console'], 'level': 'WARNING', 'propagate': False},
    },
}

# Pendant les tests, les journaux restent silencieux (les événements de sécurité sont vérifiés par les tests eux-mêmes)
import sys  # noqa: E402

if len(sys.argv) > 1 and sys.argv[1] == 'test':
    EMAIL_ENVOI_ASYNCHRONE = False
    MAILERS = {'default': {'BACKEND': 'django.core.mail.backends.locmem.EmailBackend'}}
    # Les tests utilisent un cache en mémoire (sauf TEST_AVEC_REDIS=1) pour ne pas toucher aux compteurs réels
    if not config('TEST_AVEC_REDIS', default=False, cast=bool):
        CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'allakro-tests'}}
    LOGGING['loggers'] = {nom: {'handlers': [], 'propagate': False} for nom in LOGGING['loggers']}

# Le contrôle de déploiement ne reconnaît pas notre sous-classe du middleware CSRF (apps.accounts.csrf.CsrfApiMiddleware),
# qui protège pourtant tout le chemin /api/ : voir les tests de apps/accounts/tests_securite.py.
SILENCED_SYSTEM_CHECKS = ['security.W003']
