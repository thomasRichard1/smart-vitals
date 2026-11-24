import React, { useEffect, useState } from "react";
import FHIR from "fhirclient";
import VitalChart from "./VitalChart.jsx";
import { CHARTS, buildChartData, patientSummary } from "./fhirData.js";

const SANDBOX_ISS = "https://launch.smarthealthit.org/v/r4/fhir";
const CLIENT_ID = "smart-vitals";
const READ_SCOPES = "patient/Patient.read patient/Observation.read openid fhirUser";

// Step 1 of the SMART flow: discover the auth server, then redirect to it (OAuth2 + PKCE).
function startLaunch({ standalone }) {
  const params = new URLSearchParams(window.location.search);
  return FHIR.oauth2.authorize({
    clientId: CLIENT_ID,
    scope: standalone ? `launch/patient ${READ_SCOPES}` : `launch ${READ_SCOPES}`,
    redirectUri: "/",
    iss: params.get("iss") || SANDBOX_ISS,
  });
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

  const p = patientSummary(state.patient);
  const charts = CHARTS.map((c) => ({ chart: c, data: buildChartData(state.observations, c) }));
  const withData = charts.filter((c) => c.data.length > 0);
  const empty = charts.filter((c) => c.data.length === 0).map((c) => c.chart.title);

  return (
    <Shell>
      <header className="patient card">
        <h2>{p.name}</h2>
        <p className="muted">
          {p.gender}
          {p.age !== null && ` · ${p.age} years`}
          {p.birthDate && ` · born ${p.birthDate}`} · {state.observations.length} observations
        </p>
      </header>
      {withData.length === 0 && <p className="card">No vitals or labs found for this patient.</p>}
      <div className="grid">
        {withData.map(({ chart, data }) => (
          <VitalChart key={chart.id} chart={chart} data={data} />
        ))}
      </div>
      {empty.length > 0 && <p className="muted small">No data recorded for: {empty.join(", ")}.</p>}
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

function Shell({ children }) {
  return (
    <main>
      <h1>SMART Vitals</h1>
      {children}
    </main>
  );
}
