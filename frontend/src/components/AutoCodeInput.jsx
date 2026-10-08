import { useEffect, useState } from 'react';
import Input from '@/components/ui/Input';

// Code attribué par le serveur : on affiche le prochain code prévu (ou le code existant en modification)
export default function AutoCodeInput({ service, value, label = 'Code', className }) {
  const [code, setCode] = useState(value || '…');

  useEffect(() => {
    if (value) { setCode(value); return undefined; }
    let active = true;
    service.nextCode()
      .then((next) => { if (active) setCode(next); })
      .catch(() => { if (active) setCode('Automatique'); });
    return () => { active = false; };
  }, [service, value]);

  return <Input label={label} value={code} disabled hint="Attribué automatiquement" className={className} />;
}
