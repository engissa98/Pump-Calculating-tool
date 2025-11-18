import React, { useEffect, useMemo, useState } from "react";

/**
 * Apex Pump Cost Tool — Dark-mode only App.jsx
 * - Title format B (two-line title in cards)
 * - Flow shown in m3/hr (input label)
 * - RPM options limited to 1450 or 2900
 * - Factory Assembled shown as full text (no +20% mention)
 * - FA multiplies margin by 1.2 (applied in calculation only)
 * - Only selected electrical (CP or VFD) is applied
 * - Results appended as cards and persisted in localStorage
 */

// ---------- Pricing tables ----------
const CP_ROWS = [
  { min: 0.75, max: 3, duplex: 85, triplex: 125, quad: 185 },
  { min: 4, max: 7.5, duplex: 100, triplex: 150, quad: 220 },
  { min: 11, max: 11, duplex: 110, triplex: 165, quad: 235 },
  { min: 15, max: 15, duplex: 150, triplex: 200, quad: 285 },
];

const VFD_ROWS = [
  { min: 0.75, max: 3, duplex: 400, triplex: 600, quad: 800 },
  { min: 4, max: 7.5, duplex: 450, triplex: 650, quad: 950 },
  { min: 11, max: 11, duplex: 550, triplex: 750, quad: 1000 },
  { min: 15, max: 15, duplex: 700, triplex: 900, quad: 1250 },
];


// --- Updated electrical price computation ---
function computeElectricalPrice(kw, config, isVfd) {
  const rows = isVfd ? VFD_ROWS : CP_ROWS;
  const nkw = Number(kw);
  let basePrice = 0;
  // find 15kW row
  const row15 = rows.find(r => r.min === 15);
  const getConfigPrice = (row) => {
    if (config === "duplex") return row.duplex;
    if (config === "triplex") return row.triplex;
    if (config === "quad") return row.quad;
    return row.duplex;
  };
  if (nkw > 15) {
    basePrice = getConfigPrice(row15);
    let scaled = (basePrice / 15) * nkw;
    return Math.round(scaled) + 100;
  }
  if (nkw > 11) {
    basePrice = getConfigPrice(row15);
    return Math.round(basePrice) + 100;
  }
  // normal range
  const row = rows.find(r => nkw >= r.min && nkw <= r.max);
  if (row) {
    return getConfigPrice(row);
  }
  return 0;
}
const HEADER_TABLE = {
  "1.5": {
    Duplex: { PPR: 100, SS304: 150, SS316: 200 },
    Triplex: { PPR: 135, SS304: 200, SS316: 250 },
    Quadplex: { PPR: 175, SS304: 300, SS316: 400 },
  },
  "2": {
    Duplex: { PPR: 125, SS304: 200, SS316: 275 },
    Triplex: { PPR: 155, SS304: 300, SS316: 400 },
    Quadplex: { PPR: 200, SS304: 375, SS316: 450 },
  },
  "2.5": {
    Duplex: { PPR: 150, SS304: 250, SS316: 350 },
    Triplex: { PPR: 175, SS304: 325, SS316: 425 },
    Quadplex: { PPR: 225, SS304: 400, SS316: 500 },
  },
  "3": {
    Duplex: { PPR: 175, SS304: 300, SS316: 375 },
    Triplex: { PPR: 200, SS304: 375, SS316: 450 },
    Quadplex: { PPR: 250, SS304: 450, SS316: 550 },
  },
};

const MODEL_TO_DN = [
  { prefix: "v6", dn: 32 },
  { prefix: "v10", dn: 40 },
  { prefix: "v15", dn: 50 },
  { prefix: "v25", dn: 65 },
  { prefix: "v40", dn: 80 },
  { prefix: "v60", dn: 100 },
];

const DN_TO_NPS = [
  { dn: 15, nps: 0.5 },
  { dn: 20, nps: 0.75 },
  { dn: 25, nps: 1 },
  { dn: 32, nps: 1.25 },
  { dn: 40, nps: 1.5 },
  { dn: 50, nps: 2 },
  { dn: 65, nps: 2.5 },
  { dn: 80, nps: 3 },
  { dn: 100, nps: 4 },
];

function findDNFromModel(model) {
  if (!model) return null;
  const m = model.toLowerCase();
  for (const map of MODEL_TO_DN) if (m.includes(map.prefix)) return map.dn;
  const match = m.match(/dn\s*?(\d+)/i) || m.match(/dn(\d+)/i);
  if (match) return Number(match[1]);
  return null;
}
function dnToNps(dn) {
  if (!dn) return null;
  let best = DN_TO_NPS[0];
  for (const it of DN_TO_NPS) {
    if (Math.abs(it.dn - dn) < Math.abs(best.dn - dn)) best = it;
  }
  return best.nps;
}
function clampPipeNps(nps) {
  if (!nps) return 1.5;
  if (nps < 1.5) return 1.5;
  if (nps > 3) return 3;
  if (nps <= 1.5) return 1.5;
  if (nps <= 2) return 2;
  if (nps <= 2.5) return 2.5;
  return 3;
}
function roundToNearest(x, step = 25) {
  return Math.round(x / step) * step;
}
function getCPPriceForConfig(kw, config) {
  // 1) Determine base price row
  let row = CP_ROWS.find(r => kw >= r.min && kw <= r.max);

  // 2) Above 11 → use 15 kW prices
  if (!row && kw > 11 && kw <= 15) {
    row = CP_ROWS.find(r => r.min === 15);
  }

  // 3) Above 15 → ratio (kw / 15) * CP_price_15KW
  if (!row && kw > 15) {
    const r15 = CP_ROWS.find(r => r.min === 15);
    const base =
      config === "duplex" ? r15.duplex :
      config === "triplex" ? r15.triplex :
      r15.quad;

    const ratioPrice = Math.round((kw / 15) * base);
    return ratioPrice + 100; // +100 KD always
  }

  // Get base price
  const base =
    config === "duplex" ? row.duplex :
    config === "triplex" ? row.triplex :
    row.quad;

  // Always +100 KD
  return Math.round(base + 100);
}


function getVFDPriceForConfig(kw, config) {
  // 1) Determine base price row
  let row = VFD_ROWS.find(r => kw >= r.min && kw <= r.max);

  // 2) Above 11 → use 15 kW prices
  if (!row && kw > 11 && kw <= 15) {
    row = VFD_ROWS.find(r => r.min === 15);
  }

  // 3) Above 15 → ratio (kw / 15) * VFD_price_15KW
  if (!row && kw > 15) {
    const r15 = VFD_ROWS.find(r => r.min === 15);
    const base =
      config === "duplex" ? r15.duplex :
      config === "triplex" ? r15.triplex :
      r15.quad;

    const ratioPrice = Math.round((kw / 15) * base);
    return ratioPrice + 100; // +100 KD always
  }

  // Get base price
  const base =
    config === "duplex" ? row.duplex :
    config === "triplex" ? row.triplex :
    row.quad;

  // Always +100 KD
  return Math.round(base + 100);
}

// defaults
const DEFAULTS = {
  simplex: { pressureTank: 30, baseStand: 25, pressureSwitch: 5, labor: 15, accessories: 5 },
  duplex: { pressureTank: 50, baseStand: 40, pressureSwitch: 10, labor: 25, accessories: 10 },
  triplex: { pressureTank: 75, baseStand: 75, pressureSwitch: 20, labor: 50, accessories: 25 },
  quad: { pressureTank: 100, baseStand: 100, pressureSwitch: 30, labor: 75, accessories: 30 },
};

// dark-mode-only colors
const OUTLINE = "#2596be";
const PAGE_BG = "#0f172a";
const CARD_BG = "#1e293b";
const INPUT_BG = "#334155";
const TEXT_MUTED = "#9fb6d9";
const TEXT = "#cbd5e1";

function formatKD(x) {
  return Number(x || 0).toFixed(2);
}

// helpers for titles & description
function formatModelFinal(modelInput) {
  if (!modelInput || !modelInput.trim()) return "Movitec";
  const trimmed = modelInput.trim();
  if (/^v\d+/i.test(trimmed) && !/movitec/i.test(trimmed)) {
    return `Movitec ${trimmed}`;
  }
  return trimmed;
}
function configLabel(configuration) {
  if (configuration === "simplex") return "Simplex";
  if (configuration === "duplex") return "Duplex";
  if (configuration === "triplex") return "Triplex";
  return "Quadplex";
}
function dutyStandbyText(configuration) {
  if (configuration === "simplex") return "1 duty";
  if (configuration === "duplex") return "1 duty, 1 standby";
  if (configuration === "triplex") return "2 duty : 1 standby (2:1)";
  return "3 duty : 1 standby (3:1)";
}
function phaseToVoltage(phase) {
  if (phase === "1ph") return "230 V, 50 Hz";
  if (phase === "3ph") return "415 V, 50 Hz";
  return "";
}
function orientationText(orientation) {
  if (!orientation) return "Vertical Multistage Pumps";
  const o = orientation.toLowerCase();
  if (o.startsWith("h")) return "Horizontal Multistage Pumps";
  return "Vertical Multistage Pumps";
}
function generateTitleObj({ configuration, modelInput, factoryAssembled }) {
  // Title format B: two lines
  const cfg = configLabel(configuration);
  const modelFinal = formatModelFinal(modelInput);
  const faText = factoryAssembled ? " (Factory Assembled)" : "";
  return {
    line1: `KSB ${cfg} Booster Transfer Water Pump Set`,
    line2: `Model: ${modelFinal}${faText}`,
  };
}
function generateDescription({
  configuration,
  modelInput,
  flow,
  head,
  kw,
  rpm,
  phase,
  orientation,
  factoryAssembled,
  electricalChoice,
  material,
}) {
  const cfg = configLabel(configuration);
  const modelFinal = formatModelFinal(modelInput);
  const dutyLine = flow ? `Duty: ${flow} m3/hr${head ? ` @ ${head} bar` : ""}` : head ? `Duty: ${head} bar` : "";
  const voltageText = phaseToVoltage(phase);

  const powerParts = [];
  if (kw !== undefined && kw !== null && kw !== "") powerParts.push(`${kw} kW`);
  if (rpm) powerParts.push(`${rpm} RPM`);
  if (phase) powerParts.push(phase === "1ph" ? "1ph" : "3ph");
  if (voltageText) powerParts.push(voltageText);
  const powerLine = powerParts.length ? `Power: ${powerParts.join(", ")}.` : "";

  const electricalLine =
    electricalChoice === "vfd" ? "VFD" :
    electricalChoice === "cp" ? "Control panel" :
    "—";

  const headerMat =
    material === "SS316" ? "SS316 Header" :
    material === "SS304" ? "SS304 Header" :
    "PPR Header";

  const qtyText =
    configuration === "simplex" ? "1 Nos" :
    configuration === "duplex" ? "2 Nos" :
    configuration === "triplex" ? "3 Nos" : "4 Nos";

  const dutyStandby = dutyStandbyText(configuration); // Now used only for NOTES

  const lines = [];

  // --- MAIN DESCRIPTION (CLEANED AS YOU REQUESTED) ---
  lines.push(`${cfg} Water Pump Set Consist of:`);
  lines.push(`Model: ${modelFinal}`);
  if (dutyLine) lines.push(dutyLine);
  if (powerLine) lines.push(powerLine);
  lines.push("");
  lines.push(`${cfg} Booster Water Pump Set Consist of:`);
  lines.push(`•\t${qtyText} Pumps`);
  lines.push(`•\tWith necessary Gate & Check valves`);
  lines.push(`•\t${electricalLine}`);
  lines.push(`•\t${headerMat}`);
  lines.push(`•\t100L Pressure Tank`);
  lines.push(`•\t1 Nos Float switch for dry run protection`);
  lines.push(`Assembled and wired on a common base plate`);
  lines.push(`Origin: Made in Netherlands`);

  return lines.join("\n");
}
// ---------- App ----------
export default function App() {
  // inputs
  const [model, setModel] = useState("");
  const [material, setMaterial] = useState("SS316");
  const [configuration, setConfiguration] = useState("duplex"); // simplex/duplex/triplex/quad
  const [factoryAssembled, setFactoryAssembled] = useState(false);

  const [pumpUnitPrice, setPumpUnitPrice] = useState(0);
  const [kw, setKw] = useState(1.5);

  // new inputs: flow (m3/hr), head (bar), orientation, phase, rpm
  const [flow, setFlow] = useState("");
  const [head, setHead] = useState("");
  const [orientation, setOrientation] = useState("vertical");
  const [phase, setPhase] = useState("3ph"); // 1ph or 3ph
  const [rpm, setRpm] = useState(2900); // limit to 1450 or 2900 via select

  // valve unit prices
  const [gateUnitPrice, setGateUnitPrice] = useState(10);
  const [checkUnitPrice, setCheckUnitPrice] = useState(10);

  // components
  const [pressureTank, setPressureTank] = useState(DEFAULTS.duplex.pressureTank);
  const [baseStand, setBaseStand] = useState(DEFAULTS.duplex.baseStand);
  const [pressureSwitch, setPressureSwitch] = useState(DEFAULTS.duplex.pressureSwitch);
  const [labor, setLabor] = useState(DEFAULTS.duplex.labor);
  const [accessories, setAccessories] = useState(DEFAULTS.duplex.accessories);

  // electrical choice
  const [electricalChoice, setElectricalChoice] = useState("vfd");

  // margin
  const [margin, setMargin] = useState(1.25);

  // results persisted
  const [results, setResults] = useState(() => {
    try {
      const raw = localStorage.getItem("apex_pump_results_v3");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("apex_pump_results_v3", JSON.stringify(results));
    } catch {}
  }, [results]);

  // update component defaults when configuration changes
  useEffect(() => {
    const key = configuration === "quad" ? "quad" : configuration;
    const d = DEFAULTS[key] || DEFAULTS.duplex;
    setPressureTank(d.pressureTank);
    setBaseStand(d.baseStand);
    setPressureSwitch(d.pressureSwitch);
    setLabor(d.labor);
    setAccessories(d.accessories);
  }, [configuration]);

  // derived
  const qtyMultiplier = useMemo(() => {
    if (configuration === "simplex") return 1;
    if (configuration === "duplex") return 2;
    if (configuration === "triplex") return 3;
    return 4;
  }, [configuration]);

  const valveQuantities = useMemo(() => {
    if (configuration === "simplex") return { gate: 2, check: 1 };
    if (configuration === "duplex") return { gate: 4, check: 2 };
    if (configuration === "triplex") return { gate: 6, check: 3 };
    return { gate: 8, check: 4 };
  }, [configuration]);

  const headerNps = useMemo(() => {
    const dn = findDNFromModel(model);
    const nps = dn ? dnToNps(dn) : null;
    return clampPipeNps(nps);
  }, [model]);

  const headerPrice = useMemo(() => {
    const key = String(headerNps);
    const sysKey = configuration === "duplex" ? "Duplex" : configuration === "triplex" ? "Triplex" : "Quadplex";
    const row = HEADER_TABLE[key] || HEADER_TABLE["1.5"];
    const mat = material === "SS304" ? "SS304" : material === "SS316" ? "SS316" : "PPR";
    return (row && row[sysKey] && row[sysKey][mat]) || 0;
  }, [headerNps, configuration, material]);

  const totalPumpCost = useMemo(() => (Number(pumpUnitPrice) || 0) * qtyMultiplier, [pumpUnitPrice, qtyMultiplier]);

  const totalValveCost = useMemo(() => {
    const gate = (Number(gateUnitPrice) || 0) * valveQuantities.gate;
    const check = (Number(checkUnitPrice) || 0) * valveQuantities.check;
    return gate + check;
  }, [gateUnitPrice, checkUnitPrice, valveQuantities]);

  const cpPrice = useMemo(() => getCPPriceForConfig(Number(kw), configuration), [kw, configuration]);
  const vfdPrice = useMemo(() => getVFDPriceForConfig(Number(kw), configuration), [kw, configuration]);

  const electricalApplied = useMemo(() => {
    if (electricalChoice === "vfd") return vfdPrice;
    if (electricalChoice === "cp") return cpPrice;
    return 0;
  }, [electricalChoice, vfdPrice, cpPrice]);

  const subtotalWithoutMargin = useMemo(() => {
    return (
      Number(totalPumpCost || 0) +
      Number(totalValveCost || 0) +
      Number(electricalApplied || 0) +
      Number(pressureTank || 0) +
      Number(baseStand || 0) +
      Number(pressureSwitch || 0) +
      Number(headerPrice || 0) +
      Number(labor || 0) +
      Number(accessories || 0)
    );
  }, [totalPumpCost, totalValveCost, electricalApplied, pressureTank, baseStand, pressureSwitch, headerPrice, labor, accessories]);

  // FA multiplies margin by 1.2 (applied only to margin internally)
  const effectiveMargin = useMemo(() => {
  const base = Number(margin || 1);
  return factoryAssembled ? base + 0.2 : base;
}, [margin, factoryAssembled]);

  const sellingBeforeRound = useMemo(() => subtotalWithoutMargin * effectiveMargin, [subtotalWithoutMargin, effectiveMargin]);

  const sellingRounded = useMemo(() => roundToNearest(sellingBeforeRound, 25), [sellingBeforeRound]);

  function handleCalculate() {
    const titleObj = generateTitleObj({ configuration, modelInput: model, factoryAssembled });
    const description = generateDescription({
      configuration,
      modelInput: model,
      flow,
      head,
      kw,
      rpm,
      phase,
      orientation,
      factoryAssembled,
      electricalChoice,
      material,
    });

    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      titleLine1: titleObj.line1,
      titleLine2: titleObj.line2,
      description,
      model,
      material,
      configuration,
      factoryAssembled,
      qtyMultiplier,
      pumpUnitPrice: Number(pumpUnitPrice || 0),
      totalPumpCost: Number(totalPumpCost || 0),
      valveQuantities,
      gateUnitPrice: Number(gateUnitPrice || 0),
      checkUnitPrice: Number(checkUnitPrice || 0),
      totalValveCost: Number(totalValveCost || 0),
      headerNps,
      headerPrice,
      kw: Number(kw || 0),
      cpPrice,
      vfdPrice,
      electricalChoice,
      electricalApplied,
      pressureTank: Number(pressureTank || 0),
      baseStand: Number(baseStand || 0),
      pressureSwitch: Number(pressureSwitch || 0),
      labor: Number(labor || 0),
      accessories: Number(accessories || 0),
      subtotalWithoutMargin: Number(subtotalWithoutMargin || 0),
      margin: Number(margin || 1),
      effectiveMargin: Number(effectiveMargin || 1),
      sellingBeforeRound: Number(sellingBeforeRound || 0),
      sellingRounded: Number(sellingRounded || 0),
      finalAhmad: "",
      flow,
      head,
      orientation,
      phase,
      rpm,
    };

    setResults((prev) => [...prev, entry]);
  }

  function handleRemove(id) {
    setResults((prev) => prev.filter((r) => r.id !== id));
  }

  function exportAllCSV() {
    if (!results.length) {
      alert("No entries to export.");
      return;
    }
    const headers = [
      "TitleLine1",
      "TitleLine2",
      "Model",
      "Material",
      "Config",
      "Flow_m3h",
      "Head_bar",
      "Orientation",
      "Phase",
      "KW",
      "QtyMultiplier",
      "PumpUnitPrice",
      "TotalPumpCost",
      "GateQty",
      "GateUnitPrice",
      "CheckQty",
      "CheckUnitPrice",
      "TotalValveCost",
      "HeaderNPS",
      "HeaderPrice",
      "ElectricalChoice",
      "ElectricalApplied",
      "SubtotalWithoutMargin",
      "Margin",
      "EffectiveMargin",
      "SellingBeforeRound",
      "SellingRounded",
      "FinalAhmad",
    ];
    const rows = results.map((r) =>
      [
        `"${(r.titleLine1 || "").replace(/"/g, '""')}"`,
        `"${(r.titleLine2 || "").replace(/"/g, '""')}"`,
        `"${(r.model || "").replace(/"/g, '""')}"`,
        r.material,
        r.configuration,
        r.flow,
        r.head,
        r.orientation,
        r.phase,
        r.kw.toFixed(2),
        r.qtyMultiplier,
        r.pumpUnitPrice.toFixed(2),
        r.totalPumpCost.toFixed(2),
        r.valveQuantities.gate,
        r.gateUnitPrice.toFixed(2),
        r.valveQuantities.check,
        r.checkUnitPrice.toFixed(2),
        r.totalValveCost.toFixed(2),
        r.headerNps,
        r.headerPrice.toFixed(2),
        r.electricalChoice,
        r.electricalApplied.toFixed(2),
        r.subtotalWithoutMargin.toFixed(2),
        r.margin.toFixed(3),
        r.effectiveMargin.toFixed(3),
        r.sellingBeforeRound.toFixed(2),
        r.sellingRounded.toFixed(2),
        `"${(r.finalAhmad || "").replace(/"/g, '""')}"`,
      ].join(",")
    );
    const csv = headers.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pump_calculations_v3.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // UI styles (dark only)
  const pageStyle = {
    minHeight: "100vh",
    padding: 18,
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    background: PAGE_BG,
    color: TEXT,
  };

  const cardBase = {
    background: CARD_BG,
    borderRadius: 12,
    padding: 14,
    boxShadow: "0 10px 30px rgba(2,6,23,0.6)",
    border: "1px solid rgba(255,255,255,0.03)",
  };

  const inputCommon = (w = "100%") => ({
    width: w,
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid rgba(255,255,255,0.06)`,
    background: INPUT_BG,
    color: "#fff",
    boxSizing: "border-box",
    outline: "none",
  });

  const smallText = { fontSize: 13, color: TEXT_MUTED };

  // description expand state per card
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(Array.from(prev));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div style={pageStyle}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0, color: OUTLINE }}>Apex Pump Cost Calculator</h1>
          <div style={{ fontSize: 13, color: TEXT_MUTED }}>Apex Engineering Kuwait (by Eng. Mohamed Issa)</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={exportAllCSV}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: "#0b1220",
              color: "#cbd5e1",
              border: "1px solid rgba(255,255,255,0.04)",
              cursor: "pointer",
            }}
          >
            Export CSV
          </button>
        </div>
      </header>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* LEFT: inputs */}
        <div style={{ width: 520, ...cardBase }}>
          <h3 style={{ marginTop: 0, color: OUTLINE }}>Inputs</h3>

          <label style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>Model</label>
          <input style={inputCommon()} value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. V6/2 or Movitec 32-250" />

          <label style={{ display: "block", marginTop: 10, marginBottom: 6, fontWeight: 700 }}>Material</label>
          <select style={{ ...inputCommon(), padding: 10 }} value={material} onChange={(e) => setMaterial(e.target.value)}>
            <option value="SS316">SS316</option>
            <option value="SS304">SS304</option>
            <option value="PPR">PPR</option>
          </select>

          <label style={{ display: "block", marginTop: 10, marginBottom: 6, fontWeight: 700 }}>Configuration</label>
          <select style={{ ...inputCommon(), padding: 10 }} value={configuration} onChange={(e) => setConfiguration(e.target.value)}>
            <option value="simplex">Simplex (×1)</option>
            <option value="duplex">Duplex (×2)</option>
            <option value="triplex">Triplex (×3)</option>
            <option value="quad">Quadplex (×4)</option>
          </select>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <input type="checkbox" checked={factoryAssembled} onChange={(e) => setFactoryAssembled(e.target.checked)} />
            <span>Factory Assembled</span>
          </label>

          <label style={{ display: "block", marginTop: 12, marginBottom: 6, fontWeight: 700 }}>Pump unit cost (KD)</label>
          <input style={inputCommon()} type="number" value={pumpUnitPrice} onChange={(e) => setPumpUnitPrice(e.target.value)} />

          <label style={{ display: "block", marginTop: 10, marginBottom: 6, fontWeight: 700 }}>Motor kW</label>
          <input style={inputCommon()} type="number" value={kw} onChange={(e) => setKw(e.target.value)} />

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>Flow (m³/hr)</label>
              <input style={inputCommon()} type="number" value={flow} onChange={(e) => setFlow(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>Head (bar)</label>
              <input style={inputCommon()} type="number" value={head} onChange={(e) => setHead(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>Orientation</label>
              <select style={{ ...inputCommon(), padding: 10 }} value={orientation} onChange={(e) => setOrientation(e.target.value)}>
                <option value="vertical">Vertical</option>
                <option value="horizontal">Horizontal</option>
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>Phase</label>
              <select style={{ ...inputCommon(), padding: 10 }} value={phase} onChange={(e) => setPhase(e.target.value)}>
                <option value="3ph">3ph (415 V, 50 Hz)</option>
                <option value="1ph">1ph (230 V, 50 Hz)</option>
              </select>
            </div>
          </div>

          <label style={{ display: "block", marginTop: 10, marginBottom: 6, fontWeight: 700 }}>RPM</label>
          <select style={{ ...inputCommon(), padding: 10 }} value={rpm} onChange={(e) => setRpm(Number(e.target.value))}>
            <option value={2900}>2900</option>
            <option value={1450}>1450</option>
          </select>

          <hr style={{ height: 1, background: "#243241", border: "none", margin: "14px 0" }} />

          <h4 style={{ margin: "6px 0", color: OUTLINE }}>Valves (enter unit prices)</h4>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>Gate valve unit price</label>
              <input style={inputCommon()} type="number" step="0.5" value={gateUnitPrice} onChange={(e) => setGateUnitPrice(e.target.value)} />
              <div style={{ marginTop: 6, ...smallText }}>Qty auto: {valveQuantities.gate}</div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>Check valve unit price</label>
              <input style={inputCommon()} type="number" step="0.5" value={checkUnitPrice} onChange={(e) => setCheckUnitPrice(e.target.value)} />
              <div style={{ marginTop: 6, ...smallText }}>Qty auto: {valveQuantities.check}</div>
            </div>
          </div>

          <hr style={{ height: 1, background: "#243241", border: "none", margin: "14px 0" }} />

          <h4 style={{ margin: "6px 0", color: OUTLINE }}>Components (editable)</h4>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>Pressure Tank</label>
          <input style={inputCommon()} type="number" value={pressureTank} onChange={(e) => setPressureTank(Number(e.target.value))} />

          <label style={{ display: "block", marginTop: 8, marginBottom: 6, fontWeight: 700 }}>Base + Stand</label>
          <input style={inputCommon()} type="number" value={baseStand} onChange={(e) => setBaseStand(Number(e.target.value))} />

          <label style={{ display: "block", marginTop: 8, marginBottom: 6, fontWeight: 700 }}>Pressure Switch</label>
          <input style={inputCommon()} type="number" value={pressureSwitch} onChange={(e) => setPressureSwitch(Number(e.target.value))} />

          <label style={{ display: "block", marginTop: 8, marginBottom: 6, fontWeight: 700 }}>Labor</label>
          <input style={inputCommon()} type="number" value={labor} onChange={(e) => setLabor(Number(e.target.value))} />

          <label style={{ display: "block", marginTop: 8, marginBottom: 6, fontWeight: 700 }}>Accessories</label>
          <input style={inputCommon()} type="number" value={accessories} onChange={(e) => setAccessories(Number(e.target.value))} />

          <label style={{ display: "block", marginTop: 10, marginBottom: 6, fontWeight: 700 }}>Electrical (choose one)</label>
          <select style={{ ...inputCommon(), padding: 10 }} value={electricalChoice} onChange={(e) => setElectricalChoice(e.target.value)}>
            <option value="vfd">VFD</option>
            <option value="cp">Control Panel (DOL / YD)</option>
            <option value="none">None</option>
          </select>

          <label style={{ display: "block", marginTop: 10, marginBottom: 6, fontWeight: 700 }}>Margin (example: 1.25)</label>
          <input style={inputCommon()} type="number" step="0.01" value={margin} onChange={(e) => setMargin(Number(e.target.value))} />

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={handleCalculate} style={{ flex: 1, padding: 10, borderRadius: 8, background: OUTLINE, color: "#000", fontWeight: 800, border: "none", cursor: "pointer" }}>
              Calculate (append)
            </button>
            <button
              onClick={() => {
                setModel("");
                setMaterial("SS316");
                setConfiguration("duplex");
                setFactoryAssembled(false);
                setPumpUnitPrice(0);
                setKw(1.5);
                setGateUnitPrice(10);
                setCheckUnitPrice(10);
                setMargin(1.25);
                setFlow("");
                setHead("");
                setOrientation("vertical");
                setPhase("3ph");
                setRpm(2900);
              }}
              style={{ flex: 1, padding: 10, borderRadius: 8, background: "#0b1220", border: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", color: "#cbd5e1" }}
            >
              Reset Inputs
            </button>
          </div>
        </div>

        {/* RIGHT: results grid */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {results.length === 0 && (
              <div style={{ padding: 12, color: TEXT_MUTED }}>
                No calculations yet. Fill inputs and press Calculate to append a result card here.
              </div>
            )}

         {results.map((r) => (
  <>
    {expandedIds.has(r.id) && (
    <div
      style={{
        width: "100%",
        background: "#0b1624",
        padding: 12,
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.06)",
        whiteSpace: "pre-wrap",
        marginBottom: 10
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontWeight: 800 }}>Full Description</div>
        <button
          onClick={() => navigator.clipboard.writeText(r.description)}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            background: "#111827",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "#cbd5e1",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Copy
        </button>
      </div>
      <div style={{ fontSize: 13 }}>{r.description}</div>
    </div>
  )}

              <div
                key={r.id}
                style={{
                  width: 360,
                  background: CARD_BG,
                  borderRadius: 12,
                  padding: 12,
                  boxShadow: "0 8px 24px rgba(2,6,23,0.6)",
                  border: "1px solid rgba(255,255,255,0.03)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  position: "relative",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    {/* Title format B */}
                    <div style={{ fontSize: 13, color: TEXT_MUTED }}>{r.titleLine1}</div>
                    <div style={{ fontWeight: 900, fontSize: 16, color: OUTLINE, marginTop: 4 }}>{r.titleLine2}</div>
                    <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 6 }}>Before round: {formatKD(r.sellingBeforeRound)} KD</div>
                  </div>

                  <div style={{ textAlign: "right", fontSize: 12 }}>
                    <div style={{ marginBottom: 8 }}>{r.configuration}</div>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button
                        onClick={() => toggleExpand(r.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          background: "#111827",
                          border: "1px solid rgba(255,255,255,0.04)",
                          color: "#fff",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {expandedIds.has(r.id) ? "Hide" : "View"}
                      </button>
                      <button
                        onClick={() => handleRemove(r.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          background: "#111827",
                          border: "1px solid rgba(255,255,255,0.04)",
                          color: "#fff",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>

                <hr style={{ borderColor: "#334155", margin: "6px 0" }} />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 13 }}>
                  <div>Qty multiplier</div>
                  <div style={{ textAlign: "right" }}>×{r.qtyMultiplier}</div>

                  <div>Pump unit</div>
                  <div style={{ textAlign: "right" }}>{formatKD(r.pumpUnitPrice)} KD</div>

                  <div>Total pump cost</div>
                  <div style={{ textAlign: "right" }}>{formatKD(r.totalPumpCost)} KD</div>

                  <div>Gate valves ({r.valveQuantities.gate} pcs)</div>
                  <div style={{ textAlign: "right" }}>{(r.valveQuantities.gate * r.gateUnitPrice).toFixed(2)} KD</div>

                  <div>Check valves ({r.valveQuantities.check} pcs)</div>
                  <div style={{ textAlign: "right" }}>{(r.valveQuantities.check * r.checkUnitPrice).toFixed(2)} KD</div>

                  <div style={{ fontWeight: 700 }}>Total valve cost</div>
                  <div style={{ textAlign: "right", fontWeight: 700 }}>{formatKD(r.totalValveCost)} KD</div>

                  <div>Header ({r.headerNps}\")</div>
                  <div style={{ textAlign: "right" }}>{formatKD(r.headerPrice)} KD</div>

                  <div>Motor kW</div>
                  <div style={{ textAlign: "right" }}>{r.kw} kW</div>

                  <div>Electrical applied</div>
                  <div style={{ textAlign: "right" }}>{r.electricalChoice.toUpperCase()}</div>

                  <div>Electrical cost</div>
                  <div style={{ textAlign: "right" }}>{formatKD(r.electricalApplied)} KD</div>

                  <div>Pressure Tank</div>
                  <div style={{ textAlign: "right" }}>{formatKD(r.pressureTank)} KD</div>

                  <div>Base + Stand</div>
                  <div style={{ textAlign: "right" }}>{formatKD(r.baseStand)} KD</div>

                  <div>Pressure Switch</div>
                  <div style={{ textAlign: "right" }}>{formatKD(r.pressureSwitch)} KD</div>

                  <div>Labor</div>
                  <div style={{ textAlign: "right" }}>{formatKD(r.labor)} KD</div>

                  <div>Accessories</div>
                  <div style={{ textAlign: "right" }}>{formatKD(r.accessories)} KD</div>

                  <div style={{ fontWeight: 800, marginTop: 6 }}>Subtotal</div>
                  <div style={{ textAlign: "right", fontWeight: 800 }}>{formatKD(r.subtotalWithoutMargin)} KD</div>

                  <div>Margin</div>
                  <div style={{ textAlign: "right" }}>{r.margin.toFixed(2)} ×</div>

                  <div style={{ fontWeight: 900, color: OUTLINE, marginTop: 6 }}>Final (rounded)</div>
                  <div style={{ textAlign: "right", fontWeight: 900, color: OUTLINE }}>{formatKD(r.sellingRounded)} KD</div>

                  <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                    <label style={{ fontSize: 12 }}>Final Price from Eng. Ahmad (override)</label>
                    <input
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 8,
                        border: "1px solid rgba(255,255,255,0.06)",
                        background: INPUT_BG,
                        color: "#fff",
                        marginTop: 6,
                      }}
                      value={r.finalAhmad}
                      onChange={(e) => {
                        const val = e.target.value;
                        setResults((prev) => prev.map((it) => (it.id === r.id ? { ...it, finalAhmad: val } : it)));
                      }}
                    />
                  </div>
                </div>

              
              </div>
  </>
            )}
          </div>
        </div>
      </div>

      <footer style={{ marginTop: 18, color: TEXT_MUTED, fontSize: 13 }}>
        Apex Engineering Kuwait (by Eng. Mohamed Issa)
      </footer>
    </div>
  );
}
