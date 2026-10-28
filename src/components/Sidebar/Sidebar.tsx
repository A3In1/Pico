import "./Sidebar.css";

interface SidebarProps {
  quickAccessPaths: [string, string][];
  currentPath: string;
  onNavigate: (path: string) => void;
}

const ICONS: Record<string, string> = {
  DCIM: "📷",
  Downloads: "📥",
  Pictures: "🖼️",
  Music: "🎵",
  Documents: "📄",
  Movies: "🎬",
};

export function Sidebar({ quickAccessPaths, currentPath, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-label">Quick Access</div>
        <nav className="sidebar-nav">
          {/* Internal storage root */}
          <button
            className={`sidebar-item ${currentPath === "/sdcard" ? "active" : ""}`}
            onClick={() => onNavigate("/sdcard")}
          >
            <span className="sidebar-icon">📱</span>
            <span className="sidebar-text">Internal Storage</span>
          </button>

          {/* Quick access items */}
          {quickAccessPaths.map(([label, path]) => (
            <button
              key={path}
              className={`sidebar-item ${currentPath.startsWith(path) ? "active" : ""}`}
              onClick={() => onNavigate(path)}
            >
              <span className="sidebar-icon">{ICONS[label] || "📁"}</span>
              <span className="sidebar-text">{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}
