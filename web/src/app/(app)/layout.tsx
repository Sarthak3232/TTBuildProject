import { AppNavigation } from "@/components/navigation/AppNavigation";
import { PreviewGate } from "@/features/auth/PreviewGate";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <PreviewGate><div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <AppNavigation />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div></PreviewGate>
  );
}
