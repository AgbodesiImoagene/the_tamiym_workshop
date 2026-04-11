import Link from 'next/link';
import { Badge, Card, CardContent, CardHeader, CardTitle, SectionHeading } from '@tamiym/ui';

const surfaces = [
  {
    title: 'Product discovery',
    description: 'Review merchandise options, campaign-ready items, and workshop entry points.',
  },
  {
    title: 'Order visibility',
    description: 'Track payment state, fulfillment progress, and recent activity from one dashboard.',
  },
  {
    title: 'Fundraising support',
    description: 'Manage organizer campaigns and monitor their performance from your customer workspace.',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-linear-to-b from-primary-50 via-background to-background">
      <section className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="space-y-6">
            <Badge variant="brand">Customer app</Badge>
            <div className="space-y-4">
              <h1 className="font-heading text-5xl uppercase tracking-headline text-primary md:text-6xl">
                Manage products, campaigns, and orders in one place.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                This app now provides the first customer-facing shell for authentication, campaign
                visibility, and order tracking on top of the live API.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/register"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-accent px-6 text-sm font-medium text-accent-foreground transition hover:bg-accent-500"
              >
                Create account
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-primary px-6 text-sm font-medium text-primary transition hover:bg-primary-50"
              >
                Sign in
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-border px-6 text-sm font-medium text-foreground transition hover:bg-gray-50"
              >
                View dashboard
              </Link>
            </div>
          </div>

          <Card className="bg-primary text-white">
            <CardHeader>
              <CardTitle className="text-white">What is already wired</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-white/85">
              <p>Cookie-based auth is connected to the API and protected flows redirect on 401s.</p>
              <p>Dashboard sections now use server-state patterns for orders and campaigns.</p>
              <p>Shared tokens and UI primitives keep this app aligned with `web` and `admin`.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 lg:px-8 lg:pb-24">
        <SectionHeading
          eyebrow="Initial slices"
          title="The first customer workflow surfaces"
          description="These are the areas now represented in the frontend shell and backed by live API patterns."
        />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {surfaces.map((surface) => (
            <Card key={surface.title}>
              <CardHeader>
                <CardTitle>{surface.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-7 text-muted-foreground">{surface.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
