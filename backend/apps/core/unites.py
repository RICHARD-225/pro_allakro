"""Liste d'unités réutilisable (travaux, achats aux particuliers). L'unité par défaut est l'hectare."""
UNITES = [
    ('ha', 'ha (hectare)'),
    ('m²', 'm² (mètre carré)'),
    ('plantes', 'plantes'),
    ('litre', 'litre'),
    ('kg', 'kg'),
    ('jours', 'jours'),
]
UNITE_PAR_DEFAUT = 'ha'
CODES_UNITES = [code for code, _ in UNITES]
