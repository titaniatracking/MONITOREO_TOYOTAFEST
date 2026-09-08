import type { ActivityEvent } from "../types";

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <aside className="activity-feed">
      <div className="panel-heading">
        <span>ACTIVIDAD OPERACIONAL</span>
        <b>{events.length}</b>
      </div>
      <div className="feed-list">
        {events.map((event) => (
          <div key={event.id} className={`feed-item status-${event.status.toLowerCase()}`}>
            <time>{event.time}</time>
            <strong>{event.plate}</strong>
            <span>{event.type}</span>
            <small>{event.detail}</small>
          </div>
        ))}
      </div>
    </aside>
  );
}
