import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { socket } from "../socket";

const NAV_ITEMS = [
  { to: "/", label: "Acasă", icon: "🏠" },
  { to: "/play/online", label: "Joacă online", icon: "🌐" },
  { to: "/play/robot", label: "Antrenează-te", icon: "🤖" },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

  useEffect(() => {
    const handleOnlineCount = ({ count }: { count: number }) => setOnlineCount(count);
    socket.on("presence:onlineCount", handleOnlineCount);
    return () => {
      socket.off("presence:onlineCount", handleOnlineCount);
    };
  }, []);

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <Link to="/" className="app-sidebar__logo">
          <span className="app-sidebar__logo-icon" aria-hidden="true">
            ✈️
          </span>
          <span className="app-sidebar__logo-text">Flight</span>
        </Link>
        <nav className="app-sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`app-sidebar__link${location.pathname === item.to ? " active" : ""}`}
              title={item.label}
            >
              <span className="app-sidebar__link-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="app-sidebar__link-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        {/* Numărul de utilizatori conectați acum pe site, actualizat live. */}
        <div className="app-sidebar__online-count">
          <span className="app-sidebar__online-dot" aria-hidden="true" />
          <span className="app-sidebar__online-text">{onlineCount ?? "–"} online</span>
        </div>
      </aside>
      <main className="app-content">{children}</main>
    </div>
  );
}

