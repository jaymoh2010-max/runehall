import type { PathbuilderImportReport } from "../../shared/types";

export function ImportReport({
  report,
  limit = 40,
}: {
  report: PathbuilderImportReport;
  limit?: number;
}) {
  const matched = Object.values(report.matched).reduce((sum, count) => sum + count, 0);
  return (
    <div className="stack">
      <p className="tiny muted">
        {matched} option{matched === 1 ? "" : "s"} matched against the local compendium.
      </p>
      {report.unmatched.length ? (
        <div>
          <strong className="small">Not matched</strong>
          <ul className="tiny muted">
            {report.unmatched.slice(0, limit).map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.warnings.length ? (
        <div>
          <strong className="small">Review these</strong>
          <ul className="tiny muted">
            {report.warnings.slice(0, limit).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
