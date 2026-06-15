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
          <h1>Tracked Sailor Analytics</h1>
          <p className="lead">Backend: {apiBaseUrl}</p>
        </div>

        <label className="selector">
          <span>Tracked sailor</span>
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

      {sailorsState.loading ? <StatusMessage message="Lade Segler..." /> : null}
      {sailorsState.error ? <ErrorMessage message={sailorsState.error} /> : null}
      {!sailorsState.loading && !sailorsState.error && sailors.length === 0 ? (
        <EmptyState message="Keine tracked sailors konfiguriert." />
      ) : null}

      {selectedSailor ? (
        <section className="selected-sailor" aria-label="Ausgewaehlter Segler">
          <strong>{selectedSailor.sailorName}</strong>
          <span>{selectedSailor.sailNumber}</span>
        </section>
      ) : null}

      <DashboardSummary state={dashboardState} />

      <section className="panel timeline-panel">
        <SectionHeader
          eyebrow="Timeline"
          title="Regatta results"
          description="Klicke eine Regatta fuer Details und nahe Konkurrenten."
        />

        {dashboardState.loading ? <StatusMessage message="Lade Dashboard..." /> : null}
        {dashboardState.error ? <ErrorMessage message={dashboardState.error} /> : null}
        {dashboard && dashboard.results.length === 0 ? (
          <EmptyState message="Keine Dashboard-Ergebnisse gefunden." />
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
          eyebrow="Head-to-head"
          title="Historische Duelle"
          description="Sortiert nach gemeinsamen Regatten, Staerke und Name."
        />

        {headToHeadState.loading ? <StatusMessage message="Lade Head-to-head..." /> : null}
        {headToHeadState.error ? <ErrorMessage message={headToHeadState.error} /> : null}
        {headToHeadState.data && headToHeadRows.length === 0 ? (
          <EmptyState message="Keine Head-to-head-Daten gefunden." />
        ) : null}
        {headToHeadRows.length > 0 ? <HeadToHeadTable rows={headToHeadRows} /> : null}
      </section>
    </main>
  );
}

function DashboardSummary({ state }: { state: LoadState<TrackedSailorDashboard> }) {
  const dashboard = state.data;

  return (
    <section className="summary-grid" aria-label="Dashboard summary">
      <SummaryCard
        label="Total regattas"
        value={dashboard ? String(dashboard.totalRegattas) : "-"}
      />
      <SummaryCard
        label="Average percentile"
        value={formatPercentile(dashboard?.averagePercentile)}
      />
      <SummaryCard label="Best percentile" value={formatPercentile(dashboard?.bestPercentile)} />
      <SummaryCard
        label="Latest percentile"
        value={formatPercentile(dashboard?.latestPercentile)}
      />
      <SummaryCard label="Trend" value={dashboard ? formatTrend(dashboard.trend) : "-"} />
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
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
            <th>Date</th>
            <th>Regatta</th>
            <th>Location</th>
            <th>Rank / boats</th>
            <th>Percentile</th>
            <th>Fleet segment</th>
            <th>Distance</th>
            <th>Total points</th>
            <th>Net points</th>
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
        eyebrow="Selected regatta"
        title="Regatta detail"
        description="Race consistency and nearby competitor strength."
      />

      {!state.loading && !state.error && !detail ? (
        <EmptyState message="Waehle eine Regatta aus der Timeline." />
      ) : null}
      {state.loading ? <StatusMessage message="Lade Regatta-Details..." /> : null}
      {state.error ? <ErrorMessage message={state.error} /> : null}

      {detail ? (
        <>
          <div className="detail-grid">
            <Metric label="Regatta" value={detail.regattaName} />
            <Metric label="Date" value={formatDateRange(detail.dateFrom, detail.dateTo)} />
            <Metric label="Rank / boats" value={formatRank(detail.rank, detail.boats)} />
            <Metric label="Percentile" value={formatPercentile(detail.percentile)} />
            <Metric label="Fleet segment" value={detail.fleetSegmentLabel ?? "-"} />
          </div>

          <div className="detail-grid consistency-grid">
            <Metric label="Races count" value={String(detail.raceSummary.racesCount)} />
            <Metric label="Best race rank" value={formatNumber(detail.raceSummary.bestRank)} />
            <Metric label="Worst race rank" value={formatNumber(detail.raceSummary.worstRank)} />
            <Metric
              label="Average race rank"
              value={formatNumber(detail.raceSummary.averageRank)}
            />
            <Metric label="Rank spread" value={formatNumber(detail.raceSummary.rankSpread)} />
            <Metric
              label="Discarded races"
              value={String(detail.raceSummary.discardedRacesCount)}
            />
          </div>

          <section className="nested-section">
            <h3>Nearby competitors</h3>
            {detail.nearbyCompetitors.length === 0 ? (
              <EmptyState message="Keine nahen Konkurrenten gefunden." />
            ) : (
              <NearbyCompetitorsTable rows={detail.nearbyCompetitors} />
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
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
            <th>Rank</th>
            <th>Name</th>
            <th>Sail number</th>
            <th>Rank diff</th>
            <th>Historical regattas</th>
            <th>Historical avg percentile</th>
            <th>Historical segment</th>
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
            <th>Competitor</th>
            <th>Sail number</th>
            <th>Common regattas</th>
            <th>Tracked ahead</th>
            <th>Competitor ahead</th>
            <th>Tracked win rate</th>
            <th>Competitor segment</th>
            <th>Competitor avg percentile</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.competitorSailorId}>
              <td>{row.competitorName}</td>
              <td>{row.competitorSailNumber ?? "-"}</td>
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
