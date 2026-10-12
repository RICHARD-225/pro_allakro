"""
Compare deux dossiers de captures (captures_comparaison.mjs) pixel par pixel et résume les écarts.

    python comparer_captures.py <avant> <après> [<dossier des différences>]

Pour chaque image : part de pixels différents (écart de couleur > 24/255 sur un canal) ; les images qui diffèrent sont écrites en
« différence » (rouge = pixel modifié) dans le dossier demandé, pour être relues à l'œil.
"""
import sys

sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path

from PIL import Image, ImageChops

avant, apres = Path(sys.argv[1]), Path(sys.argv[2])
sortie = Path(sys.argv[3]) if len(sys.argv) > 3 else None
if sortie:
    sortie.mkdir(parents=True, exist_ok=True)
lignes = []
for fichier in sorted(avant.glob('*.png')):
    autre = apres / fichier.name
    if not autre.exists():
        lignes.append((100.0, fichier.name, 'absente de « après »'))
        continue
    a, b = Image.open(fichier).convert('RGB'), Image.open(autre).convert('RGB')
    if a.size != b.size:
        lignes.append((100.0, fichier.name, f'tailles différentes {a.size} / {b.size}'))
        continue
    diff = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > 24 else 0)
    part = 100 * sum(1 for p in diff.getdata() if p) / (a.size[0] * a.size[1])
    lignes.append((part, fichier.name, ''))
    if sortie and part > 0.05:
        rouge = Image.merge('RGB', (diff, Image.new('L', a.size, 0), Image.new('L', a.size, 0)))
        Image.blend(b, Image.composite(Image.new('RGB', a.size, (255, 0, 0)), b, diff), 0.8).save(sortie / f'diff_{fichier.name}')
lignes.sort(reverse=True)
print(f'{len(lignes)} captures comparées')
for part, nom, note in lignes[:15]:
    print(f'{part:6.2f} %  {nom} {note}')
identiques = sum(1 for p, _, _ in lignes if p <= 0.05)
print(f'\n{identiques} identiques (0,05 % de pixels différents au plus), {len(lignes) - identiques} avec des différences ; moyenne {sum(p for p, _, _ in lignes) / len(lignes):.3f} %')
