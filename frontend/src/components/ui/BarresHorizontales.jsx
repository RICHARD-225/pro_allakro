import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useStyleGraphique } from '@/hooks/useStyleGraphique';
import { formatFCFA } from '@/utils/format';

const milliers = (v) => (Math.abs(v) >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${Math.round(v / 1000)}k`);
// Les libellés longs passent sur deux lignes ; au-delà, ils sont coupés proprement
const MAX_CARACTERES = 36;
const couper = (texte) => (texte.length > MAX_CARACTERES ? `${texte.slice(0, MAX_CARACTERES - 1)}…` : texte);

/**
 * Barres horizontales : libellés des catégories à gauche (sur deux lignes si besoin), lisibles à toutes les largeurs
 * (ni texte incliné, ni libellé coupé au bord). Montants en FCFA.
 * data : [{ name, …valeurs }]
 * series : [{ cle, nom, couleur }] — plusieurs séries = barres groupées avec légende (ex. prévu / réalisé).
 */
export default function BarresHorizontales({ data, series }) {
  const style = useStyleGraphique();
  const groupees = series.length > 1;
  const hauteur = Math.max(140, data.length * (groupees ? 44 : 32) + (groupees ? 60 : 28));

  return (
    <ResponsiveContainer width="100%" height={hauteur}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 4, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke={style.grille} horizontal={false} />
        <XAxis type="number" tick={style.axe} axisLine={false} tickLine={false} tickFormatter={milliers} />
        <YAxis type="category" dataKey="name" tick={style.axe} axisLine={false} tickLine={false} width={124} tickFormatter={couper} />
        <Tooltip contentStyle={style.infoBulle} formatter={(v) => formatFCFA(v)} cursor={{ fill: style.survol }} />
        {groupees && <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />}
        {series.map((s) => (
          <Bar key={s.cle} dataKey={s.cle} name={s.nom} fill={s.couleur} radius={[0, 4, 4, 0]} maxBarSize={groupees ? 12 : 18} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
