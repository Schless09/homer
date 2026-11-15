import Link from "next/link";
import { Logo } from "@/components/Logo";

/** Contact address shown on public pages. Set NEXT_PUBLIC_HOMER_CONTACT_EMAIL. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_HOMER_CONTACT_EMAIL || "";

export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Link href="/">
            <Logo />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-12 text-[15px] leading-relaxed [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        <h1 className="font-display text-4xl">{title}</h1>
        {updated && <p className="text-[13px] text-muted-foreground">Last updated {updated}</p>}
        {children}
      </main>
      <footer className="mx-auto max-w-3xl border-t px-4 py-6 text-[12px] text-muted-foreground">
        <Link href="/about" className="underline underline-offset-2">About</Link> ·{" "}
        <Link href="/privacy" className="underline underline-offset-2">Privacy</Link> ·{" "}
        <Link href="/disclosure" className="underline underline-offset-2">Affiliate disclosure</Link>
      </footer>
    </div>
  );
}
