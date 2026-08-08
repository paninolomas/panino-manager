import Link from "next/link";
import { requireSession } from "../../lib/auth/session";
import LogoutButton from "../../components/domain/LogoutButton";

const SOCIO_LINKS = [
  { href: "/dashboard", label: "Hoy" },
  { href: "/copilot", label: "Copiloto" },
  { href: "/accounts", label: "Cuentas" },
  { href: "/movements", label: "Movimientos" },
  { href: "/settlements", label: "Liquidaciones" },
  { href: "/profitability", label: "Rentabilidad" },
  { href: "/goals", label: "Objetivos" },
  { href: "/simulator", label: "Simulador" },
  { href: "/stock", label: "Stock" },
  { href: "/suppliers", label: "Proveedores" },
  { href: "/expenses", label: "Gastos" },
  { href: "/sales", label: "Ventas" },
  { href: "/imports", label: "Importar" },
  { href: "/audit", label: "Auditoría" },
];

const EMPLEADO_LINKS = [
  { href: "/dashboard", label: "Hoy" },
  { href: "/stock", label: "Stock" },
  { href: "/suppliers", label: "Proveedores" },
  { href: "/sales", label: "Ventas" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireSession();
  const links = profile.role === "socio" ? SOCIO_LINKS : EMPLEADO_LINKS;

  return (
    <>
      <header style={{ padding: "16px", borderBottom: "1px solid var(--line)" }}>
        <div className="container row" style={{ padding: 0 }}>
          <div>
            <span className="label">Panino Manager</span>
            <div style={{ fontWeight: 600 }}>{profile.fullName}</div>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="container">{children}</main>
      <nav className="tabbar">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
