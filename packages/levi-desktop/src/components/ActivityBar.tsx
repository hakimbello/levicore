import { Icon } from "./Icon";

export type ActivityView = "home" | "explorer" | "search" | "debug" | "source-control" | "terminal" | "history" | "rules" | "settings";

type ActivityBarProps = {
  activeView: ActivityView;
  onSelect: (view: ActivityView) => void;
};

type ActivityItem = {
  view: ActivityView;
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  position?: "bottom";
};

const activityItems: ActivityItem[] = [
  { view: "explorer", label: "Explorer", icon: "files" },
  { view: "home", label: "Levi AI", icon: "chat" },
  { view: "search", label: "Search", icon: "search" },
  { view: "debug", label: "Run and Debug", icon: "debug" },
  { view: "source-control", label: "Source Control", icon: "source-control" },
  { view: "terminal", label: "Terminal", icon: "terminal" },
  { view: "rules", label: "Project Rules", icon: "layers" },
  { view: "settings", label: "Settings", icon: "settings", position: "bottom" }
];

export function ActivityBar({ activeView, onSelect }: ActivityBarProps) {
  const primaryItems = activityItems.filter((item) => item.position !== "bottom");
  const bottomItems = activityItems.filter((item) => item.position === "bottom");

  function renderItem(item: ActivityItem) {
    const active = activeView === item.view;
    return (
      <button
        key={item.view}
        type="button"
        className={active ? "levi-activity-item levi-activity-item-active" : "levi-activity-item"}
        aria-label={item.label}
        aria-pressed={active}
        title={item.label}
        onClick={() => onSelect(item.view)}
      >
        <Icon name={item.icon} />
      </button>
    );
  }

  return (
    <nav className="levi-activity-bar" aria-label="Workspace activities">
      <div className="levi-activity-brand" aria-label="Levi">
        L
      </div>
      <div className="levi-activity-group">{primaryItems.map(renderItem)}</div>
      <div className="levi-activity-group levi-activity-group-bottom">{bottomItems.map(renderItem)}</div>
    </nav>
  );
}
