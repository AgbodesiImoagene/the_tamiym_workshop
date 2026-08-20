import { Card, CardContent } from './ui/card';
import { cn } from '../lib/cn';

interface StatCardProps {
  label: string;
  value: string;
  helper?: string;
  tone?: 'brand' | 'accent' | 'neutral';
}

const toneClasses = {
  brand: 'bg-primary text-white',
  accent: 'bg-accent text-accent-foreground',
  neutral: 'bg-gray-100 text-foreground',
};

export function StatCard({ label, value, helper, tone = 'neutral' }: StatCardProps) {
  return (
    <Card className={cn('border-transparent', toneClasses[tone])}>
      <CardContent className="space-y-3 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] opacity-75">{label}</p>
        <p className="font-heading text-4xl uppercase tracking-headline">{value}</p>
        {helper ? <p className="text-sm opacity-80">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}
