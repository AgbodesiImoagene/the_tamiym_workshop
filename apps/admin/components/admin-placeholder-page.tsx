import { AdminShell } from './admin-shell';
import { Card, CardContent } from '@tamiym/ui';

interface AdminPlaceholderPageProps {
  activeNav:
    | 'catalog'
    | 'pricing'
    | 'shipping'
    | 'moderation'
    | 'notifications'
    | 'settings';
  title: string;
  description: string;
  eyebrow: string;
}

export function AdminPlaceholderPage({
  activeNav,
  title,
  description,
  eyebrow,
}: AdminPlaceholderPageProps) {
  return (
    <AdminShell
      activeNav={activeNav}
      title={title}
      description={description}
    >
      <Card className="rounded-[1.75rem] border-black/8 shadow-none">
        <CardContent className="space-y-4 p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            {eyebrow}
          </p>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-tamiym-blue">
              Workspace scaffolded
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-black/65">
              This route is intentionally present in the admin IA so the console feels complete,
              but detailed workflows for this domain are still deferred behind the first slice of
              orders, campaigns, and payouts.
            </p>
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
