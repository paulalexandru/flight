import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { to: "/", label: "Acasă" },
  { to: "/play/online", label: "Joacă online" },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <Link to="/" className="app-sidebar__logo">
          Flight
        </Link>
        <nav className="app-sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`app-sidebar__link${location.pathname === item.to ? " active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="app-content">{children}</main>
    </div>
  );
}
