import { useCallback, useEffect, useMemo, useState } from "react";

import {
  apiBaseUrl,
  getHistoricalHeadToHead,
  getTrackedRegattaDetail,
  getTrackedSailorDashboard,
  getTrackedSailors,
} from "./api";
import {
  formatDateRange,
  formatDistanceToNextSegment,
  formatNumber,
  formatPercentile,
  formatRank,
  formatTrend,
} from "./formatters";
import type {
  HistoricalHeadToHead,
  TrackedRegattaPerformance,
  TrackedSailorDashboard,
  TrackedSailorSummary,
} from "./types";

interface LoadState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

const emptySailorsState: LoadState<TrackedSailorSummary[]> = {
  data: null,
  error: null,
  loading: true,
};

const emptyDashboardState: LoadState<TrackedSailorDashboard> = {
  data: null,
  error: null,
  loading: false,
};

const emptyHeadToHeadState: LoadState<HistoricalHeadToHead[]> = {
  data: null,
  error: null,
  loading: false,
};

const emptyRegattaDetailState: LoadState<TrackedRegattaPerformance> = {
  data: null,
  error: null,
  loading: false,
};

const PERCENTILE_EXPLANATION = "Formel: (1 - (Platz - 1) / (Anzahl der Boote - 1)) * 100.";
const FLEET_SEGMENT_EXPLANATION =
  "Nach Platzierung in Drittel eingeteilt: Spitzengruppe, Mittelfeld, Hinterfeld.";
const HISTORICAL_SEGMENT_EXPLANATION =
  "Auf Basis des historischen Durchschnitts: > 66,7 % = Spitzengruppe, ab 33,3 % = Mittelfeld, darunter Hinterfeld.";
const RANK_EXPLANATION = "Platzierung laut Ergebnis sowie Gesamtzahl der Boote.";
const TOTAL_POINTS_EXPLANATION = "Wert aus dem Manage2Sail-Feld TotalPoints.";
const NET_POINTS_EXPLANATION = "Wert aus dem Manage2Sail-Feld NetPoints nach Streichern.";

function App() {
  const [sailorsState, setSailorsState] = useState(emptySailorsState);
  const [selectedSailorId, setSelectedSailorId] = useState("");
  const [dashboardState, setDashboardState] = useState(emptyDashboardState);
  const [headToHeadState, setHeadToHeadState] = useState(emptyHeadToHeadState);
  const [selectedRegattaId, setSelectedRegattaId] = useState("");
  const [regattaDetailState, setRegattaDetailState] = useState(emptyRegattaDetailState);

  const selectSailor = useCallback((sailorId: string) => {
    setSelectedSailorId(sailorId);
    setDashboardState(sailorId ? { data: null, error: null, loading: true } : emptyDashboardState);
    setHeadToHeadState(
      sailorId ? { data: null, error: null, loading: true } : emptyHeadToHeadState,
    );
    setSelectedRegattaId("");
    setRegattaDetailState(emptyRegattaDetailState);
  }, []);

  const selectRegatta = useCallback((regattaId: string) => {
    setSelectedRegattaId(regattaId);
    setRegattaDetailState({ data: null, error: null, loading: true });
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    getTrackedSailors(controller.signal)
      .then((response) => {
        setSailorsState({
          data: response.sailors,
          error: null,
          loading: false,
        });
        selectSailor(response.sailors[0]?.sailorId ?? "");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setSailorsState({
          data: null,
          error: getErrorMessage(error),
          loading: false,
        });
      });

    return () => {
      controller.abort();
    };
  }, [selectSailor]);

  useEffect(() => {
    if (!selectedSailorId) {
      return;
    }

    const controller = new AbortController();

    Promise.all([
      getTrackedSailorDashboard(selectedSailorId, controller.signal),
      getHistoricalHeadToHead(selectedSailorId, controller.signal),
    ])
      .then(([dashboard, headToHead]) => {
        setDashboardState({ data: dashboard, error: null, loading: false });
        setHeadToHeadState({
          data: headToHead,
          error: null,
          loading: false,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const message = getErrorMessage(error);
        setDashboardState({ data: null, error: message, loading: false });
        setHeadToHeadState({ data: null, error: message, loading: false });
      });

    return () => {
      controller.abort();
    };
  }, [selectedSailorId]);

  useEffect(() => {
    if (!selectedSailorId || !selectedRegattaId) {
      return;
    }

    const controller = new AbortController();

    getTrackedRegattaDetail(selectedSailorId, selectedRegattaId, controller.signal)
      .then((detail) => {
        setRegattaDetailState({ data: detail, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setRegattaDetailState({
          data: null,
          error: getErrorMessage(error),
          loading: false,
        });
      });

    return () => {
      controller.abort();
    };
  }, [selectedSailorId, selectedRegattaId]);

  const sailors = sailorsState.data ?? [];
  const selectedSailor = sailors.find((sailor) => sailor.sailorId === selectedSailorId);
  const dashboard = dashboardState.data;
  const headToHeadRows = useMemo(() => {
    return [...(headToHeadState.data ?? [])].sort(
      (left, right) =>
        right.commonRegattasCount - left.commonRegattasCount ||
        (right.competitorAveragePercentile ?? -1) - (left.competitorAveragePercentile ?? -1) ||
        left.competitorName.localeCompare(right.competitorName, "de"),
    );
  }, [headToHeadState.data]);

  return (
    <main className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Regatten</p>
          <h1>Analyse der beobachteten Segler</h1>
          <p className="lead">API: {apiBaseUrl}</p>
        </div>

        <label className="selector">
          <span>Beobachteter Segler</span>
          <select
            disabled={sailorsState.loading || sailors.length === 0}
            value={selectedSailorId}
            onChange={(event) => selectSailor(event.target.value)}
          >
            {sailors.map((sailor) => (
              <option key={sailor.sailorId} value={sailor.sailorId}>
                {sailor.sailorName} ({sailor.sailNumber})
              </option>
            ))}
          </select>
        </label>
      </header>

      {sailorsState.loading ? <StatusMessage message="Segler werden geladen ..." /> : null}
      {sailorsState.error ? <ErrorMessage message={sailorsState.error} /> : null}
      {!sailorsState.loading && !sailorsState.error && sailors.length === 0 ? (
        <EmptyState message="Es sind keine beobachteten Segler konfiguriert." />
      ) : null}

      {selectedSailor ? (
        <section className="selected-sailor" aria-label="Ausgewählter Segler">
          <strong>{selectedSailor.sailorName}</strong>
          <span>{selectedSailor.sailNumber}</span>
        </section>
      ) : null}

      <DashboardSummary state={dashboardState} />

      <section className="panel timeline-panel">
        <SectionHeader
          eyebrow="Zeitverlauf"
          title="Regatta-Ergebnisse"
          description="Regatta auswählen, um Details und nahe Konkurrenten anzuzeigen."
        />

        {dashboardState.loading ? <StatusMessage message="Übersicht wird geladen ..." /> : null}
        {dashboardState.error ? <ErrorMessage message={dashboardState.error} /> : null}
        {dashboard && dashboard.results.length === 0 ? (
          <EmptyState message="Für die Übersicht wurden keine Ergebnisse gefunden." />
        ) : null}
        {dashboard && dashboard.results.length > 0 ? (
          <RegattaTimelineTable
            results={dashboard.results}
            selectedRegattaId={selectedRegattaId}
            onSelectRegatta={selectRegatta}
          />
        ) : null}
      </section>

      <RegattaDetail state={regattaDetailState} />

      <section className="panel">
        <SectionHeader
          eyebrow="Direkter Vergleich"
          title="Historische Direktvergleiche"
          description="Sortiert nach Anzahl gemeinsamer Regatten, Stärke und Namen."
        />

        {headToHeadState.loading ? (
          <StatusMessage message="Direktvergleiche werden geladen ..." />
        ) : null}
        {headToHeadState.error ? <ErrorMessage message={headToHeadState.error} /> : null}
        {headToHeadState.data && headToHeadRows.length === 0 ? (
          <EmptyState message="Für direkte Vergleiche wurden keine Daten gefunden." />
        ) : null}
        {headToHeadRows.length > 0 ? <HeadToHeadTable rows={headToHeadRows} /> : null}
      </section>
    </main>
  );
}

function DashboardSummary({ state }: { state: LoadState<TrackedSailorDashboard> }) {
  const dashboard = state.data;

  return (
    <section className="summary-grid" aria-label="Übersicht der Kennzahlen">
      <SummaryCard
        label="Anzahl der Regatten"
        value={dashboard ? String(dashboard.totalRegattas) : "-"}
        explanation="Anzahl der Regatten mit Ergebnis für diesen Segler."
      />
      <SummaryCard
        label="Durchschnittlicher Perzentilwert"
        value={formatPercentile(dashboard?.averagePercentile)}
        explanation="Mittelwert aller gültigen Regatta-Perzentilwerte."
      />
      <SummaryCard
        label="Bester Perzentilwert"
        value={formatPercentile(dashboard?.bestPercentile)}
        explanation="Höchster gültiger Regatta-Perzentilwert."
      />
      <SummaryCard
        label="Letzter Perzentilwert"
        value={formatPercentile(dashboard?.latestPercentile)}
        explanation="Zuletzt erfasster gültiger Perzentilwert im chronologischen Verlauf."
      />
      <SummaryCard
        label="Trend"
        value={dashboard ? formatTrend(dashboard.trend) : "-"}
        explanation="Vergleicht den Durchschnitt der ersten mit dem der letzten Hälfte; Änderung ab 5 Prozentpunkten."
      />
    </section>
  );
}

function SummaryCard({
  label,
  value,
  explanation,
}: {
  label: string;
  value: string;
  explanation: string;
}) {
  return (
    <article className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small className="calculation-note">Berechnung: {explanation}</small>
    </article>
  );
}

function RegattaTimelineTable({
  results,
  selectedRegattaId,
  onSelectRegatta,
}: {
  results: TrackedRegattaPerformance[];
  selectedRegattaId: string;
  onSelectRegatta: (regattaId: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Regatta</th>
            <th>Ort</th>
            <MetricHeader label="Platz / Boote" explanation={RANK_EXPLANATION} />
            <MetricHeader label="Perzentilwert" explanation={PERCENTILE_EXPLANATION} />
            <MetricHeader label="Feldsegment" explanation={FLEET_SEGMENT_EXPLANATION} />
            <MetricHeader
              label="Abstand"
              explanation="Plätze bis zum nächsthöheren Feldsegment."
            />
            <MetricHeader label="Gesamtpunkte" explanation={TOTAL_POINTS_EXPLANATION} />
            <MetricHeader label="Nettopunkte" explanation={NET_POINTS_EXPLANATION} />
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr
              key={result.regattaId}
              className={result.regattaId === selectedRegattaId ? "is-selected" : ""}
            >
              <td>{formatDateRange(result.dateFrom, result.dateTo)}</td>
              <td>
                <button
                  className="table-link"
                  type="button"
                  onClick={() => onSelectRegatta(result.regattaId)}
                >
                  {result.regattaName}
                </button>
              </td>
              <td>{result.location ?? "-"}</td>
              <td>{formatRank(result.rank, result.boats)}</td>
              <td>{formatPercentile(result.percentile)}</td>
              <td>{result.fleetSegmentLabel ?? "-"}</td>
              <td>
                {formatDistanceToNextSegment(
                  result.positionsToNextSegment,
                  result.nextSegmentLabel,
                )}
              </td>
              <td>{formatNumber(result.totalPoints)}</td>
              <td>{formatNumber(result.netPoints)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RegattaDetail({ state }: { state: LoadState<TrackedRegattaPerformance> }) {
  const detail = state.data;

  return (
    <section className="panel detail-panel">
      <SectionHeader
        eyebrow="Ausgewählte Regatta"
        title="Regatta-Details"
        description="Konstanz der Wettfahrten und Stärke naher Konkurrenten."
      />

      {!state.loading && !state.error && !detail ? (
        <EmptyState message="Regatta im Zeitverlauf auswählen." />
      ) : null}
      {state.loading ? <StatusMessage message="Regatta-Details werden geladen ..." /> : null}
      {state.error ? <ErrorMessage message={state.error} /> : null}

      {detail ? (
        <>
          <div className="detail-grid">
            <Metric label="Regatta" value={detail.regattaName} />
            <Metric label="Datum" value={formatDateRange(detail.dateFrom, detail.dateTo)} />
            <Metric
              label="Platz / Boote"
              value={formatRank(detail.rank, detail.boats)}
              explanation={RANK_EXPLANATION}
            />
            <Metric
              label="Perzentilwert"
              value={formatPercentile(detail.percentile)}
              explanation={PERCENTILE_EXPLANATION}
            />
            <Metric
              label="Feldsegment"
              value={detail.fleetSegmentLabel ?? "-"}
              explanation={FLEET_SEGMENT_EXPLANATION}
            />
          </div>

          <div className="detail-grid consistency-grid">
            <Metric
              label="Wettfahrten"
              value={String(detail.raceSummary.racesCount)}
              explanation="Anzahl importierter Wettfahrten dieser Regatta."
            />
            <Metric
              label="Beste Wettfahrtplatzierung"
              value={formatNumber(detail.raceSummary.bestRank)}
              explanation="Niedrigste gültige Platzierung in den Wettfahrten."
            />
            <Metric
              label="Schlechteste Wettfahrtplatzierung"
              value={formatNumber(detail.raceSummary.worstRank)}
              explanation="Höchste gültige Platzierung in den Wettfahrten."
            />
            <Metric
              label="Durchschnittliche Wettfahrtplatzierung"
              value={formatNumber(detail.raceSummary.averageRank)}
              explanation="Mittelwert aller gültigen Wettfahrtplatzierungen."
            />
            <Metric
              label="Platzspanne"
              value={formatNumber(detail.raceSummary.rankSpread)}
              explanation="Schlechteste Wettfahrtplatzierung minus beste Wettfahrtplatzierung."
            />
            <Metric
              label="Streicher"
              value={String(detail.raceSummary.discardedRacesCount)}
              explanation="Anzahl der als gestrichen markierten Wettfahrten."
            />
          </div>

          <section className="nested-section">
            <h3>Nahe Konkurrenten</h3>
            {detail.nearbyCompetitors.length === 0 ? (
              <EmptyState message="Es wurden keine nahen Konkurrenten gefunden." />
            ) : (
              <NearbyCompetitorsTable rows={detail.nearbyCompetitors} />
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  explanation,
}: {
  label: string;
  value: string;
  explanation?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {explanation ? <small className="calculation-note">Berechnung: {explanation}</small> : null}
    </div>
  );
}

function NearbyCompetitorsTable({
  rows,
}: {
  rows: TrackedRegattaPerformance["nearbyCompetitors"];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <MetricHeader
              label="Platz"
              explanation="Platzierung des Konkurrenten in dieser Regatta."
            />
            <th>Name</th>
            <th>Segelnummer</th>
            <MetricHeader
              label="Platzdifferenz"
              explanation="Platzierung des Konkurrenten minus Platzierung des beobachteten Seglers."
            />
            <MetricHeader
              label="Historische Regatten"
              explanation="Anzahl historischer Regatten mit gültigem Perzentilwert."
            />
            <MetricHeader
              label="Historischer Ø-Perzentilwert"
              explanation="Mittelwert der historischen Perzentilwerte des Konkurrenten."
            />
            <MetricHeader
              label="Historisches Segment"
              explanation={HISTORICAL_SEGMENT_EXPLANATION}
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sailorId}>
              <td>{formatNumber(row.rank)}</td>
              <td>{row.sailorName}</td>
              <td>{row.sailNumber ?? "-"}</td>
              <td>{formatRankDifference(row.rankDifferenceToTracked)}</td>
              <td>{row.historicalRegattasCount}</td>
              <td>{formatPercentile(row.historicalAveragePercentile)}</td>
              <td>{row.historicalFleetSegmentLabel ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeadToHeadTable({ rows }: { rows: HistoricalHeadToHead[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Konkurrent</th>
            <th>Segelnummer</th>
            <MetricHeader
              label="Teilgenommene Regatten"
              explanation="Regatten, an denen der Konkurrent tatsächlich teilgenommen hat; abgesagte Regatten und DNC werden nicht gezählt."
            />
            <MetricHeader
              label="Gemeinsame Regatten"
              explanation="Regatten, an denen beide tatsächlich teilgenommen haben."
            />
            <MetricHeader
              label="Beobachteter Segler vorn"
              explanation="Zähler, wenn der beobachtete Segler vor dem Konkurrenten lag oder nur er eine gültige Platzierung hatte."
            />
            <MetricHeader
              label="Konkurrent vorn"
              explanation="Zähler, wenn der Konkurrent vor dem beobachteten Segler lag oder nur er eine gültige Platzierung hatte."
            />
            <MetricHeader
              label="Siegquote des beobachteten Seglers"
              explanation="Beobachteter Segler vorn / (beobachteter Segler vorn + Konkurrent vorn)."
            />
            <MetricHeader
              label="Segment des Konkurrenten"
              explanation={HISTORICAL_SEGMENT_EXPLANATION}
            />
            <MetricHeader
              label="Ø-Perzentilwert des Konkurrenten"
              explanation="Mittelwert der historischen Perzentilwerte des Konkurrenten."
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.competitorSailorId}>
              <td>{row.competitorName}</td>
              <td>{row.competitorSailNumber ?? "-"}</td>
              <td>{row.competitorParticipatedRegattasCount}</td>
              <td>{row.commonRegattasCount}</td>
              <td>{row.trackedAheadCount}</td>
              <td>{row.competitorAheadCount}</td>
              <td>{formatPercentile(row.trackedWinRate)}</td>
              <td>{row.competitorFleetSegmentLabel ?? "-"}</td>
              <td>{formatPercentile(row.competitorAveragePercentile)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricHeader({ label, explanation }: { label: string; explanation: string }) {
  return (
    <th>
      <span className="table-heading">
        <span>{label}</span>
        <small>Berechnung: {explanation}</small>
      </span>
    </th>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="section-header">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function StatusMessage({ message }: { message: string }) {
  return <p className="status-message">{message}</p>;
}

function ErrorMessage({ message }: { message: string }) {
  return <p className="status-message error-message">{message}</p>;
}

function EmptyState({ message }: { message: string }) {
  return <p className="status-message empty-message">{message}</p>;
}

function formatRankDifference(value: number | null): string {
  if (value === null) {
    return "-";
  }

  if (value > 0) {
    return `+${value}`;
  }

  return String(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unbekannter Fehler";
}

export default App;
