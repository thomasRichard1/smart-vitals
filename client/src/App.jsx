import React, { useEffect, useState } from "react";
import FHIR from "fhirclient";
import VitalChart from "./VitalChart.jsx";
import { SummaryTile } from "./Tiles.jsx";
import { CHARTS, buildChartData, filterRange, patientSummary } from "./fhirData.js";

const SANDBOX_ISS = "https://launch.smarthealthit.org/v/r4/fhir";
const CLIENT_ID = "smart-vitals";
const READ_SCOPES = "patient/Patient.read patient/Observation.read openid fhirUser";

// Step 1 of the SMART flow: discover the auth server, then redirect to it (OAuth2 + PKCE).
function startLaunch({ standalone }) {
  const params = new URLSearchParams(window.location.search);
  const iss = params.get("iss") || SANDBOX_ISS;
  const options = {
    clientId: CLIENT_ID,
    scope: standalone ? `launch/patient ${READ_SCOPES}` : `launch ${READ_SCOPES}`,
    redirectUri: "/",
    iss,
  };
  // The SMART sandbox rejects a standalone launch without a `launch` parameter; it wants
  // base64 JSON launch options. "e30" is "{}": no preset patient, so it shows the pickers.
  // Real EHRs do not expect this, so it is sandbox-only.
  if (standalone && iss.startsWith("https://launch.smarthealthit.org/")) options.launch = "e30";
  return FHIR.oauth2.authorize(options);
}

async function loadPatientData(client) {
  const [patient, observations] = await Promise.all([
    client.patient.read(),
    client.patient.request("Observation?category=vital-signs,laboratory&_count=200", {
      pageLimit: 5,
      flat: true,
    }),
  ]);
  return { patient, observations };
}

export default function App() {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    if (path.startsWith("/launch")) {
      // EHR launch: the sandbox sends us here with ?iss=...&launch=...
      startLaunch({ standalone: !params.get("launch") }).catch((e) =>
        setState({ status: "error", error: e.message || String(e) })
      );
      return;
    }
    if (!params.get("code") && !params.get("error") && !sessionStorage.getItem("SMART_KEY")) {
      setState({ status: "welcome" });
      return;
    }
    // Step 2: back from the auth server; exchange the code for a token.
    FHIR.oauth2
      .ready()
      .then(loadPatientData)
      .then((data) => {
        window.history.replaceState({}, "", "/");
        setState({ status: "ready", ...data });
      })
      .catch((e) => setState({ status: "error", error: e.message || String(e) }));
  }, []);

  if (state.status === "loading") return <Shell><p className="muted">Connecting to FHIR server…</p></Shell>;
  if (state.status === "welcome") return <Welcome />;
  if (state.status === "error") {
    return (
      <Shell>
        <div className="card" role="alert">
          <h2>Could not load patient data</h2>
          <p>{state.error}</p>
          <button className="button" onClick={() => { sessionStorage.clear(); window.location.assign("/"); }}>
            Start over
          </button>
        </div>
      </Shell>
    );
  }

  return <Dashboard patient={state.patient} observations={state.observations} />;
}

function Dashboard({ patient, observations }) {
  const [range, setRange] = useState("all");
  const p = patientSummary(patient);
  const all = CHARTS.map((c) => ({ chart: c, data: buildChartData(observations, c) }));
  const withData = all.filter((c) => c.data.length > 0);
  const trendable = withData.filter((c) => c.data.length > 1);
  const empty = all.filter((c) => c.data.length === 0).map((c) => c.chart.title);
  // Anchor the time filter to the newest reading anywhere, so charts stay aligned.
  const anchor = Math.max(0, ...withData.map((c) => c.data[c.data.length - 1].t));

  const switchPatient = () => {
    sessionStorage.clear();
    window.location.assign("/");
  };

  return (
    <Shell onSwitch={switchPatient}>
      <header className="patient card">
        <div className="avatar" aria-hidden="true">{p.initials}</div>
        <div>
          <h2>{p.name}</h2>
          <ul className="chips">
            <li className="chip cap">{p.gender}</li>
            {p.age !== null && <li className="chip">{p.age} years</li>}
            {p.birthDate && <li className="chip">Born {p.birthDate}</li>}
            <li className="chip">{observations.length} observations</li>
          </ul>
        </div>
      </header>

      {withData.length === 0 ? (
        <p className="card">No vitals or labs found for this patient.</p>
      ) : (
        <>
          <section aria-label="Latest readings" className="tiles">
            {withData.map(({ chart, data }) => (
              <SummaryTile key={chart.id} chart={chart} data={data} />
            ))}
          </section>

          {trendable.length > 0 && (
            <>
              <div className="toolbar">
                <h2>Trends</h2>
                <div className="segmented" role="group" aria-label="Time range">
                  {[
                    ["2y", "2 years"],
                    ["5y", "5 years"],
                    ["all", "All"],
                  ].map(([value, label]) => (
                    <button key={value} aria-pressed={range === value} onClick={() => setRange(value)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid">
                {trendable.map(({ chart, data }) => (
                  <VitalChart
                    key={chart.id}
                    chart={chart}
                    data={filterRange(data, range, anchor)}
                    totalReadings={data.length}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {empty.length > 0 && (
        <p className="muted small nodata">
          No data recorded for: {empty.map((t) => <span key={t} className="chip">{t}</span>)}
        </p>
      )}
      <p className="muted small disclaimer">
        Typical ranges are general adult guidance for illustration, not medical advice. Data is synthetic and comes
        from the public SMART sandbox.
      </p>
    </Shell>
  );
}

function Welcome() {
  return (
    <Shell>
      <div className="card">
        <h2>Chart a patient&apos;s vitals and labs</h2>
        <p>
          This is a SMART on FHIR app. It is normally opened from inside an EHR. To try it, connect to the
          public SMART sandbox and pick a synthetic patient.
        </p>
        <button className="button" onClick={() => startLaunch({ standalone: true })}>
          Connect to SMART sandbox
        </button>
        <p className="muted small">
          Or open the <a href="https://launch.smarthealthit.org/">SMART App Launcher</a> and set the launch URL to{" "}
          <code>{window.location.origin}/launch</code>.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children, onSwitch }) {
  return (
    <main>
      <header className="topbar">
        <h1>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M2 12h5l2.5-6 4 12 2.5-6H22"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          SMART Vitals
        </h1>
        {onSwitch && (
          <button className="ghost" onClick={onSwitch}>
            Switch patient
          </button>
        )}
      </header>
      {children}
    </main>
  );
}
