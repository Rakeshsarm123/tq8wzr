interface Period {
  first: string;
  last: string;
}

export interface Selection {
  start: string;
  end: string;
  deadline: string;
}

interface Props extends Selection {
  period: Period;
  loading: boolean;
  onChange: (change: Partial<Selection>) => void;
}

// EPEX SPOT's GB auctions close at these UK times on the day before delivery.
const DEADLINE_PRESETS = [
  { time: "09:20", label: "Day-ahead auction" },
  { time: "15:30", label: "Half-hour auction" },
];

export function Controls({ period, start, end, deadline, loading, onChange }: Props) {
  return (
    <section className="controls" aria-label="Analysis settings">
      <div className="control">
        <label htmlFor="start">Delivery days</label>
        <div className="row">
          <input
            id="start"
            type="date"
            min={period.first}
            max={end}
            value={start}
            onChange={(e) => e.target.value && onChange({ start: e.target.value })}
          />
          <span aria-hidden="true">→</span>
          <input
            aria-label="Last delivery day"
            type="date"
            min={start}
            max={period.last}
            value={end}
            onChange={(e) => e.target.value && onChange({ end: e.target.value })}
          />
          <button type="button" className="link" onClick={() => onChange({ start: period.first, end: period.last })}>
            Whole period
          </button>
        </div>
      </div>
      <div className="control">
        <label htmlFor="deadline">
          Order deadline <small>UK time, on the day before delivery</small>
        </label>
        <div className="row">
          <input
            id="deadline"
            type="time"
            value={deadline}
            onChange={(e) => e.target.value && onChange({ deadline: e.target.value })}
          />
          {DEADLINE_PRESETS.map((preset) => (
            <button
              key={preset.time}
              type="button"
              className={preset.time === deadline ? "chip active" : "chip"}
              onClick={() => onChange({ deadline: preset.time })}
            >
              {preset.time} · {preset.label}
            </button>
          ))}
        </div>
      </div>
      <span className="status" aria-live="polite">
        {loading ? "Updating…" : ""}
      </span>
    </section>
  );
}
