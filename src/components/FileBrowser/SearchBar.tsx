import { useRef, useEffect } from "react";
import "./SearchBar.css";

interface SearchBarProps {
  query: string;
  onChange: (query: string) => void;
  onClose: () => void;
  isVisible: boolean;
  resultCount: number;
  totalCount: number;
}

export function SearchBar({
  query,
  onChange,
  onClose,
  isVisible,
  resultCount,
  totalCount,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus when made visible
  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="search-bar">
      <div className="search-bar-inner">
        <svg
          className="search-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Filter files by name..."
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onChange("");
              onClose();
            }
          }}
        />
        {query && (
          <span className="search-result-count">
            {resultCount} of {totalCount}
          </span>
        )}
        <button
          className="search-close-btn"
          onClick={() => {
            onChange("");
            onClose();
          }}
          title="Close search (Esc)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
