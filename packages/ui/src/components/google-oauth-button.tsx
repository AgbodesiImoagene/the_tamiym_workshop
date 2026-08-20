interface GoogleOAuthButtonProps {
  href: string;
  title?: string;
  subtitle?: string;
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21.805 12.23c0-.786-.064-1.576-.202-2.349H12.24v4.45h5.363a4.497 4.497 0 0 1-1.987 2.953v2.887h3.723c2.186-2.013 3.466-4.987 3.466-7.94Z"
        fill="#4285F4"
      />
      <path
        d="M12.24 21.93c2.677 0 4.935-.879 6.58-2.392l-3.723-2.887c-1.036.705-2.372 1.105-3.857 1.105-2.59 0-4.786-1.748-5.571-4.097H1.826v2.976A9.934 9.934 0 0 0 12.24 21.93Z"
        fill="#34A853"
      />
      <path
        d="M5.669 13.659a5.93 5.93 0 0 1 0-3.777V6.906H1.826a9.905 9.905 0 0 0 0 9.728l3.843-2.975Z"
        fill="#FBBC04"
      />
      <path
        d="M12.24 5.782c1.566 0 2.966.539 4.073 1.597l3.044-3.044C17.17 2.296 14.913 1.45 12.24 1.45A9.934 9.934 0 0 0 1.826 6.906l3.843 2.976c.781-2.353 2.98-4.1 5.571-4.1Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleOAuthButton({
  href,
  title = 'Continue with Google',
  subtitle = 'Use your Google account to continue.',
}: GoogleOAuthButtonProps) {
  return (
    <a
      href={href}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-primary-50 focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-primary/20"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background">
        <GoogleIcon />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{subtitle}</span>
      </span>
    </a>
  );
}
