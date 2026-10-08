import { Search } from 'lucide-react';

export default function SearchBar({ value, onChange, placeholder = 'Rechercher...', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-ink-200 rounded-lg text-ink-800 placeholder:text-ink-400 focus:border-forest-400 focus:ring-2 focus:ring-forest-100 transition-colors"
      />
    </div>
  );
}
