import { AppNavigation } from "@/components/navigation/AppNavigation";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <AppNavigation />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
