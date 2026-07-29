export type IconName =
  | "plus"
  | "send"
  | "stop"
  | "chat"
  | "folder"
  | "files"
  | "search"
  | "source-control"
  | "history"
  | "settings"
  | "refresh"
  | "close"
  | "terminal"
  | "layers";

type IconProps = {
  name: IconName;
  className?: string;
};

const paths: Record<IconName, string> = {
  plus: "M12 5v14M5 12h14",
  send: "M5 12h13M13 6l6 6-6 6",
  stop: "M7 7h10v10H7z",
  chat: "M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v4A3.5 3.5 0 0 1 15.5 14H11l-4 4v-4.2A3.5 3.5 0 0 1 5 10.5z",
  folder: "M4 6.5A2.5 2.5 0 0 1 6.5 4H10l2 2h5.5A2.5 2.5 0 0 1 20 8.5v6A2.5 2.5 0 0 1 17.5 17h-11A2.5 2.5 0 0 1 4 14.5z",
  files: "M6 3h8l4 4v14H6zM14 3v5h5M3 7v13h3",
  search: "M10.5 5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM15 15l4 4",
  "source-control": "M7 5a2 2 0 1 0 0 .01M17 19a2 2 0 1 0 0 .01M7 7v6a6 6 0 0 0 6 6h2M17 5v12",
  history: "M4 12a8 8 0 1 0 2.3-5.6M4 5v4h4M12 8v5l3 2",
  settings: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 3v2M12 19v2M4.2 7.5l1.7 1M18.1 15.5l1.7 1M4.2 16.5l1.7-1M18.1 8.5l1.7-1",
  refresh: "M19 8a7 7 0 0 0-12.1-3.8L5 6M5 3v3h3M5 16a7 7 0 0 0 12.1 3.8L19 18M19 21v-3h-3",
  close: "M6 6l12 12M18 6 6 18",
  terminal: "M4 7l5 5-5 5M11 17h9",
  layers: "M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4"
};

export function Icon({ name, className }: IconProps) {
  return (
    <svg className={className ? `levi-icon ${className}` : "levi-icon"} viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
