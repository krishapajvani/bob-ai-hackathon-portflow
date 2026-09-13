/**
 * AiInsights.jsx — AI Operations Intelligence Dashboard
 *
 * Phase 5E: Full AI Insights dashboard.
 *
 * API: GET /api/ai/analysis
 *
 * Response shape (from aiService.js / routes/ai.js):
 * {
 *   congestionScore: number,
 *   congestionLevel: string,
 *   planSummary: { totalVesselsPlanned, vesselsWaiting, vesselsBerthed,
 *                  vesselsInbound, vesselsUnassigned, conflicts },
 *   ai: {
 *     provider:            "watsonx-granite" | "deterministic-fallback",
 *     aiAvailable:         boolean,
 *     modelId?:            string,       // only when watsonx
 *     fallbackReason?:     string,       // only when fallback
 *     executiveSummary:    string,
 *     keyRisks:            string[],
 *     recommendedActions:  string[],
 *     operatorExplanation: string,
 *     priorityVessels:     [{name, priority, reason}],
 *     delayExplanation:    string[],
 *     planningInsights:    string[],
 *   }
 * }
 */

import { useEffect, useState, useCallback } from 'react';
import { aiApi, vesselsApi } from '../api/portflowApi';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import VesselDrawer from '../components/VesselDrawer';

// ─── colour constants ──────────────────────────────────────────────────────────

const LEVEL_COLOUR = { LOW: '#16a34a', MEDIUM: '#d97706', HIGH: '#ea580c', CRITICAL: '#dc2626' };
const LEVEL_BG     = { LOW: '#dcfce7', MEDIUM: '#fff7ed', HIGH: '#fff1e6', CRITICAL: '#fee2e2' };

// ─── AI provider status banner ─────────────────────────────────────────────────

function AiStatusBanner({ ai, congestionScore, congestionLevel }) {
  const isGranite  = ai?.provider === 'watsonx-granite';
  const level      = congestionLevel || '—';
  const score      = congestionScore ?? '—';
  const levelColor = LEVEL_COLOUR[level] || '#57606a';
  const levelBg    = LEVEL_BG[level]     || '#f1f5f9';

  return (
    <div className="ai-status-banner">
      {/* AI provider indicator */}
      <div className="ai-status-provider">
        {isGranite ? (
          <div className="ai-provider-granite">
            <span className="ai-provider-icon">🤖</span>
            <div>
              <div className="ai-provider-name">IBM Granite via watsonx.ai</div>
              {ai.modelId && (
                <div className="ai-provider-model">{ai.modelId}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="ai-provider-fallback">
            <span className="ai-provider-icon">⚙</span>
            <div>
              <div className="ai-provider-name">Deterministic Engine</div>
              <div className="ai-provider-model">IBM Granite unavailable</div>
            </div>
          </div>
        )}
      </div>

      {/* Congestion context */}
      <div className="ai-status-congestion">
        <span className="ai-status-label">Congestion Score</span>
        <span className="ai-status-score" style={{ color: levelColor }}>
          {score}<span className="ai-status-score-max">/100</span>
        </span>
        <span
          className="ai-status-level-pill"
          style={{ background: levelBg, color: levelColor }}
        >
          {level}
        </span>
      </div>

      {/* Fallback reason when AI is unavailable */}
      {!isGranite && ai?.fallbackReason && (
        <div className="ai-fallback-note">
          AI enrichment unavailable — showing deterministic operational analysis.
          <span className="ai-fallback-reason"> ({ai.fallbackReason})</span>
        </div>
      )}
    </div>
  );
}

// ─── Executive summary card ────────────────────────────────────────────────────

function ExecutiveSummaryCard({ ai }) {
  if (!ai?.executiveSummary && !ai?.operatorExplanation) return null;
  const isGranite = ai.provider === 'watsonx-granite';

  return (
    <div className="ai-summary-card">
      <div className="ai-card-header">
        <span className="ai-card-title">Executive Summary</span>
        <span className={`ai-card-badge ${isGranite ? 'ai-badge-granite' : 'ai-badge-det'}`}>
          {isGranite ? '🤖 IBM Granite' : '⚙ Deterministic'}
        </span>
      </div>
      {ai.executiveSummary && (
        <p className="ai-summary-text">{ai.executiveSummary}</p>
      )}
      {ai.operatorExplanation && (
        <div className="ai-operator-explanation">
          <div className="ai-op-exp-label">Operator Context</div>
          <p className="ai-summary-text ai-summary-text-muted">{ai.operatorExplanation}</p>
        </div>
      )}
    </div>
  );
}

// ─── Key risks panel ───────────────────────────────────────────────────────────

function KeyRisksPanel({ risks }) {
  if (!risks?.length) return null;
  return (
    <div className="ai-panel ai-panel-risks">
      <div className="ai-panel-title">
        <span className="ai-panel-icon">⚠</span> Key Risks
        <span className="ai-panel-count">{risks.length}</span>
      </div>
      <div className="ai-risk-list">
        {risks.map((risk, i) => {
          const isCritical = /CRITICAL|URGENT|Priority.?1/i.test(risk);
          const isHigh     = /HIGH|warning|pressure|overflow/i.test(risk);
          return (
            <div
              key={i}
              className={`ai-risk-item ${isCritical ? 'ai-risk-critical' : isHigh ? 'ai-risk-high' : 'ai-risk-normal'}`}
            >
              <span className="ai-risk-bullet">
                {isCritical ? '🔴' : isHigh ? '🟡' : '🔵'}
              </span>
              <span>{risk}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Recommended actions panel ─────────────────────────────────────────────────

function RecommendedActionsPanel({ actions }) {
  if (!actions?.length) return null;
  return (
    <div className="ai-panel ai-panel-actions">
      <div className="ai-panel-title">
        <span className="ai-panel-icon">✅</span> Recommended Actions
        <span className="ai-panel-count">{actions.length}</span>
      </div>
      <div className="ai-action-note">
        Based on the current deterministic operational context — not overriding any engine decisions.
      </div>
      <div className="ai-action-list">
        {actions.map((action, i) => {
          const isUrgent = /URGENT|CRITICAL|immediate/i.test(action);
          return (
            <div
              key={i}
              className={`ai-action-item ${isUrgent ? 'ai-action-urgent' : 'ai-action-normal'}`}
            >
              <span className="ai-action-num">{i + 1}</span>
              <span>{action}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Priority vessels panel ────────────────────────────────────────────────────

function PriorityVesselsPanel({ priorityVessels, vesselMap, onVesselClick }) {
  if (!priorityVessels?.length) return null;
  return (
    <div className="ai-panel ai-panel-vessels">
      <div className="ai-panel-title">
        <span className="ai-panel-icon">🚢</span> Priority Vessels Requiring Attention
        <span className="ai-panel-count">{priorityVessels.length}</span>
      </div>
      <div className="ai-vessel-list">
        {priorityVessels.map((v, i) => {
          const matchedVessel = vesselMap[v.name?.toLowerCase?.()];
          const priNum = parseInt(v.priority, 10);
          const priClass = `pf-priority pf-priority-${priNum >= 1 && priNum <= 5 ? priNum : 5}`;
          return (
            <div
              key={i}
              className={`ai-vessel-row ${matchedVessel ? 'ai-vessel-clickable' : ''}`}
              onClick={() => matchedVessel && onVesselClick(matchedVessel)}
              title={matchedVessel ? 'Click to open vessel details' : undefined}
            >
              <div className="ai-vessel-left">
                <span className={priClass}>P{v.priority}</span>
                <div className="ai-vessel-name">{v.name}</div>
              </div>
              <div className="ai-vessel-reason">{v.reason}</div>
              {matchedVessel && (
                <span className="ai-vessel-open-hint">→ View</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Delay explanations panel ──────────────────────────────────────────────────

function DelayExplanationPanel({ explanations }) {
  if (!explanations?.length) return null;
  return (
    <div className="ai-panel">
      <div className="ai-panel-title">
        <span className="ai-panel-icon">⏱</span> Delay Explanations
      </div>
      <div className="ai-delay-list">
        {explanations.map((exp, i) => {
          const isBerth   = /berth|occupied|available/i.test(exp);
          const isCrane   = /crane/i.test(exp);
          const isCong    = /congestion|pressure|inbound|queue|anchor/i.test(exp);
          const tag = isBerth ? 'Berth' : isCrane ? 'Crane' : isCong ? 'Congestion' : null;
          return (
            <div key={i} className="ai-delay-item">
              {tag && <span className="ai-delay-tag">{tag}</span>}
              <span>{exp}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Planning insights panel ───────────────────────────────────────────────────

function PlanningInsightsPanel({ insights }) {
  if (!insights?.length) return null;
  return (
    <div className="ai-panel ai-panel-insights">
      <div className="ai-panel-title">
        <span className="ai-panel-icon">📅</span> Planning Insights — 72-Hour Window
      </div>
      <div className="ai-insight-list">
        {insights.map((insight, i) => (
          <div key={i} className="ai-insight-item">
            <span className="ai-insight-arrow">→</span>
            <span>{insight}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Plan summary context strip ────────────────────────────────────────────────

function PlanContextStrip({ planSummary }) {
  if (!planSummary) return null;
  const metrics = [
    { label: 'Scheduled',  value: planSummary.totalVesselsPlanned, accent: '#2563eb' },
    { label: 'Waiting',    value: planSummary.vesselsWaiting,      accent: planSummary.vesselsWaiting > 2 ? '#ea580c' : '#57606a' },
    { label: 'Berthed',    value: planSummary.vesselsBerthed,      accent: '#0f6cbd' },
    { label: 'Inbound',    value: planSummary.vesselsInbound,      accent: '#7c3aed' },
    { label: 'Unassigned', value: planSummary.vesselsUnassigned,   accent: planSummary.vesselsUnassigned > 0 ? '#dc2626' : '#1a7f37' },
    { label: 'Conflicts',  value: planSummary.conflicts,           accent: planSummary.conflicts > 0 ? '#dc2626' : '#1a7f37' },
  ];
  return (
    <div className="ai-context-strip">
      <div className="ai-context-strip-title">Operational Context (from 72-h Plan)</div>
      <div className="ai-context-metrics">
        {metrics.map(m => (
          <div key={m.label} className="ai-context-metric" style={{ borderLeft: `3px solid ${m.accent}` }}>
            <div className="ai-context-metric-label">{m.label}</div>
            <div className="ai-context-metric-value" style={{ color: m.accent }}>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Architecture explanation panel ───────────────────────────────────────────

function ArchitecturePanel() {
  return (
    <div className="ai-arch-panel">
      <div className="ai-arch-title">System Architecture</div>
      <div className="ai-arch-columns">
        <div className="ai-arch-col ai-arch-col-det">
          <div className="ai-arch-col-header">⚙ Deterministic Engines</div>
          <ul className="ai-arch-list">
            <li>Calculate port congestion score</li>
            <li>Recommend berths for each vessel</li>
            <li>Recommend navigation routes</li>
            <li>Generate 72-hour operational plan</li>
            <li>Assign berths, cranes, time slots</li>
          </ul>
          <div className="ai-arch-note">Authoritative — never overridden</div>
        </div>
        <div className="ai-arch-divider">→</div>
        <div className="ai-arch-col ai-arch-col-ai">
          <div className="ai-arch-col-header">🤖 IBM Granite / watsonx.ai</div>
          <ul className="ai-arch-list">
            <li>Explains the operational situation</li>
            <li>Summarises key risks in plain language</li>
            <li>Explains vessel delays and constraints</li>
            <li>Provides human-readable recommendations</li>
            <li>Supports operator decision-making</li>
          </ul>
          <div className="ai-arch-note">Enrichment layer — explanatory only</div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function AiInsights() {
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [vesselMap,    setVesselMap]    = useState({});   // name.lower → vessel doc
  const [drawerVessel, setDrawerVessel] = useState(null); // VesselDrawer target

  // Load vessel list so we can match AI priority vessels by name → VesselDrawer
  useEffect(() => {
    vesselsApi.list().then(vessels => {
      const map = {};
      for (const v of vessels) {
        if (v.name) map[v.name.toLowerCase()] = v;
      }
      setVesselMap(map);
    }).catch(() => {/* vessel list is optional enrichment — fail silently */});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await aiApi.getAnalysis();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ai = data?.ai;

  return (
    <>
      <div className="pf-page">
        {/* ── Page header ──────────────────────────────────────── */}
        <div className="pf-section-header">
          <div className="pf-section-header-left">
            <h1 className="pf-section-title">AI Operations Intelligence</h1>
            <p className="pf-section-subtitle">
              IBM Granite via watsonx.ai · Operational context from deterministic engines
            </p>
          </div>
          <div className="pf-section-header-action">
            <button
              className="pf-btn pf-btn-primary"
              onClick={load}
              disabled={loading}
            >
              {loading ? '⏳ Loading…' : '↻ Refresh AI Analysis'}
            </button>
          </div>
        </div>

        {/* ── States ───────────────────────────────────────────── */}
        {error   && <ErrorState message={error} onRetry={load} />}
        {loading && <LoadingState message="Fetching AI analysis from IBM Granite…" rows={6} />}

        {/* ── Loaded ───────────────────────────────────────────── */}
        {!loading && !error && data && (
          <>
            {/* AI provider + congestion status banner */}
            <AiStatusBanner
              ai={ai}
              congestionScore={data.congestionScore}
              congestionLevel={data.congestionLevel}
            />

            {/* Operational context from the 72-hour plan */}
            <PlanContextStrip planSummary={data.planSummary} />

            {ai && (
              <>
                {/* Executive summary — main explanation card */}
                <ExecutiveSummaryCard ai={ai} />

                {/* Two-column: risks + actions */}
                <div className="ai-two-col">
                  <KeyRisksPanel risks={ai.keyRisks} />
                  <RecommendedActionsPanel actions={ai.recommendedActions} />
                </div>

                {/* Priority vessels */}
                <PriorityVesselsPanel
                  priorityVessels={ai.priorityVessels}
                  vesselMap={vesselMap}
                  onVesselClick={v => setDrawerVessel(v)}
                />

                {/* Two-column: delay explanations + planning insights */}
                <div className="ai-two-col">
                  <DelayExplanationPanel explanations={ai.delayExplanation} />
                  <PlanningInsightsPanel insights={ai.planningInsights} />
                </div>
              </>
            )}

            {/* Architecture explanation panel */}
            <ArchitecturePanel />
          </>
        )}

        {/* Empty state */}
        {!loading && !error && !data && (
          <div className="pf-empty-state">
            <strong>No AI analysis available.</strong>
            <br />
            <span style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
              Use the Refresh AI Analysis button to fetch the latest operational intelligence.
            </span>
          </div>
        )}
      </div>

      {/* Vessel drawer — opened when a priority vessel is matched to the dataset */}
      <VesselDrawer
        vessel={drawerVessel}
        onClose={() => setDrawerVessel(null)}
      />
    </>
  );
}
