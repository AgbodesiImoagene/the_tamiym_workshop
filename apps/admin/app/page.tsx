import Link from 'next/link';
import { Badge, Card, CardContent, CardHeader, CardTitle, SectionHeading } from '@tamiym/ui';

const adminAreas = [
  'Orders and refunds',
  'Products and catalogue',
  'Campaign performance',
  'Operational analytics',
];

export default function Home() {
  return (
    <main className="min-h-screen bg-linear-to-b from-primary-950 via-primary to-primary-50 text-white">
      <section className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div className="space-y-6">
            <Badge variant="accent">Admin console</Badge>
            <div className="space-y-4">
              <h1 className="font-heading text-5xl uppercase tracking-headline md:text-6xl">
                Run orders, products, and campaigns from one operational surface.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/80 md:text-lg">
                The admin frontend is now wired to live analytics, order, campaign, and catalogue
                endpoints so operations can evolve around the actual backend surface.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/login"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-accent px-6 text-sm font-medium text-accent-foreground transition hover:bg-accent-500"
              >
                Admin sign in
              </Link>
              <Link
                href="/admin"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/20 px-6 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Open overview
              </Link>
            </div>
          </div>

          <Card className="border-white/15 bg-white/8 text-white">
            <CardHeader>
              <CardTitle className="text-white">Operational areas wired next</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-white/85">
              {adminAreas.map((item) => (
                <div key={item} className="rounded-xl border border-white/10 bg-white/6 px-4 py-3">
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 lg:px-8 lg:pb-24">
        <SectionHeading
          eyebrow="Admin rollout"
          title="The scaffold is replaced with a live operations shell"
          description="Use the sign-in flow to reach an overview that reads admin analytics, orders, campaigns, and products from the API."
          className="[&_h2]:text-white [&_p]:text-white/80 [&_p:first-child]:text-accent-200"
        />
      </section>
    </main>
  );
}
