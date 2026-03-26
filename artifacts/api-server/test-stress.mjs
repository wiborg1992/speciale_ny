/**
 * Stress test: 10 scenarios testing classification + incremental/shift behavior.
 * All tests use the /api/visualize endpoint but ABORT after receiving the
 * classification meta event — no need to wait for full Claude generation.
 *
 * Tests 1-4: Direct classification accuracy
 * Tests 5-7: Topic shift detection (earlier topic → explicit new request)
 * Tests 8-10: Incremental update classification (same topic + additions)
 */

const BASE_URL = `http://localhost:8080`;

const SCENARIOS = [
  {
    id: 1,
    name: "HMI — natural speech about dashboard and controls",
    transcript: `So for the new pump station we need to build a control dashboard. The operator should see live flow values, 
      pressure readings, and be able to toggle between overview and trend tabs. We also need alarm indicators with LED status 
      and a setpoint adjustment panel. Let's design the interface so the operator can quickly see if something is wrong. 
      The navigation tabs should show Overview, Safety, and Settings at minimum.`,
    expected: "hmi_interface",
  },
  {
    id: 2,
    name: "User journey — customer experience mapping",
    transcript: `We need to map the customer journey for the new Grundfos GO app. The user first discovers the product through 
      our website, then downloads the app and goes through onboarding. The first touchpoint is Bluetooth pairing with the pump. 
      After that, the daily use phase involves monitoring energy consumption and adjusting setpoints. Pain points include 
      confusing initial setup and poor notification design. The user journey should show emotions at each phase.`,
    expected: "user_journey",
  },
  {
    id: 3,
    name: "Workflow — step-by-step installation process",
    transcript: `Let me walk you through the installation process step by step. First the installer receives the pump from 
      logistics. Then they verify the model number matches the order. Next is a decision point: is the existing piping 
      compatible? If yes, proceed to mounting. If no, order adapter flanges and wait. After mounting, the electrician 
      connects power and the commissioning engineer runs the startup sequence. Generate a flowchart for this.`,
    expected: "workflow_process",
  },
  {
    id: 4,
    name: "Requirements — firmware spec with MoSCoW priorities",
    transcript: `For the CU 300 controller firmware we have several requirements. Must-have: support Modbus RTU at 9600 baud, 
      display flow in both m3/h and l/s, alarm on dry-run within 3 seconds. Should-have: BACnet IP connectivity, 
      energy logging with 15-minute intervals. Could-have: predictive maintenance alerts based on vibration data. 
      Won't-have this release: cloud connectivity via cellular. Show me the requirements as a structured spec.`,
    expected: "requirements_matrix",
  },
  {
    id: 5,
    name: "SHIFT: HMI discussion → user journey request",
    transcript: `We've been discussing the HMI dashboard layout with the tabs and alarm panels, that looks good. 
      The navigation tabs and setpoint controls are well designed. The alarm LED indicators work correctly.
      But now let's switch gears completely. We need to think about the end user experience. 
      Show me a user journey for how a building manager interacts with our system from first contact through daily operation. 
      I want to see the touchpoints, emotions, and pain points mapped out across the phases.`,
    expected: "user_journey",
  },
  {
    id: 6,
    name: "SHIFT: journey discussion → pump hardware request",
    transcript: `The user journey map we just discussed covers the digital touchpoints nicely. The personas and phases are clear.
      The pain points at each touchpoint have been identified and the emotion curve shows the user sentiment well.
      But actually, can we now look at the physical product itself? I want to see the Alpha GO pump with the LED ring 
      and the Bluetooth control face. Show me the pump hardware with the GO app panel next to it. 
      We need to present this at the product review meeting tomorrow.`,
    expected: "physical_product",
  },
  {
    id: 7,
    name: "SHIFT: workflow discussion → timeline/roadmap request",
    transcript: `OK so the installation workflow is clear, the flowchart with the decision diamonds looks great. The process steps 
      from receiving to commissioning are all covered. The swim lanes show installer vs electrician responsibilities.
      But we can move on from that now. What I really need now is a project timeline. We have three major milestones: 
      prototype ready by March 15, field testing starts April 1, and production release June 30. There's also a 
      regulatory review in May that could delay things. Let's make a roadmap that shows all these phases clearly marked.`,
    expected: "management_summary",
  },
  {
    id: 8,
    name: "INCREMENTAL: HMI + add temperature gauge (should stay HMI)",
    transcript: `We need an HMI dashboard for pump monitoring. The operator panel should show flow rate, pressure, and power consumption 
      with live gauges. Include an alarm panel and navigation tabs for Overview and Trends. The dashboard needs setpoint controls 
      and a system status LED showing if the pump is running or stopped.
      
      We also need to add a temperature gauge to the monitoring panel. The pump runs at 65 degrees Celsius 
      normally but alarms at 85 degrees. And add an efficiency percentage display showing the current pump efficiency. 
      Keep everything else the same in the dashboard, just add these two new sensor readings to the existing layout.`,
    expected: "hmi_interface",
  },
  {
    id: 9,
    name: "INCREMENTAL: Journey + add support phase (should stay journey)",
    transcript: `Create a user journey for the pump installer. Phases: Discovery, Purchase, Installation, Commissioning. 
      Show touchpoints at each phase including website, documentation, and the Grundfos GO app. Mark the pain point 
      at Installation where documentation is confusing and hard to find. The user journey should map emotions at each touchpoint.
      
      Actually we forgot the Support phase at the end. After commissioning, the installer sometimes calls 
      our hotline when they get unexpected error codes on the controller display. That's a major pain point because 
      the wait time is too long and the support agents don't always know the specific pump model. Also add an 
      Opportunity at Installation: we could provide QR-code based video guides on the pump label. Keep the existing phases.`,
    expected: "user_journey",
  },
  {
    id: 10,
    name: "INCREMENTAL: Requirements + add safety rows (should stay req)",
    transcript: `Requirements for the new CU 300 firmware: Must-have Modbus RTU support at 9600 baud, display flow in m3/h, 
      alarm on dry-run condition within 3 seconds response time. Should-have BACnet IP connectivity for building management 
      integration. Show me the requirements in a structured specification table.
      
      Two more requirements came up in the safety review meeting. Must-have: password protection for setpoint changes — 
      this is a critical safety requirement to prevent unauthorized modifications. And Should-have: automatic firmware update 
      capability over USB for field technicians. Update the existing requirements table with these additions, keep all existing rows.`,
    expected: "requirements_matrix",
  },
];

async function fetchClassification(transcript) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const resp = await fetch(`${BASE_URL}/api/visualize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        vizType: "auto",
        vizModel: "haiku",
        freshStart: true,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const metaLine = buffer.split("\n").find(l => l.startsWith("data: ") && l.includes('"type":"meta"'));
      if (metaLine) {
        reader.cancel().catch(() => {});
        const obj = JSON.parse(metaLine.slice(6));
        return obj.classification;
      }
    }

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("  MEETING AI VISUALIZER — STRESS TEST (10 English scenarios)");
  console.log("  Tests: Classification (1-4), Topic Shift (5-7), Incremental (8-10)");
  console.log("═══════════════════════════════════════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;

  for (const s of SCENARIOS) {
    process.stdout.write(`  [${String(s.id).padStart(2)}] ${s.name}\n       `);
    try {
      const cls = await fetchClassification(s.transcript);
      if (!cls) {
        console.log("❌ No classification received");
        failed++;
        continue;
      }

      const ok = cls.family === s.expected;
      const top3 = (cls.scores || []).slice(0, 3).map(sc => `${sc.id}:${sc.score}`).join("  ");
      
      if (ok) {
        console.log(`✅ PASS — ${cls.family} (lead:${cls.lead}, ${cls.ambiguous ? "ambiguous⚠" : "clear"})`);
        passed++;
      } else {
        console.log(`❌ FAIL — Expected ${s.expected}, got ${cls.family} (lead:${cls.lead})`);
        failed++;
      }
      console.log(`       Scores: ${top3}`);
    } catch (err) {
      console.log(`❌ ERROR: ${err.message}`);
      failed++;
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  if (failed === 0) {
    console.log(`  ALL 10 TESTS PASSED`);
  } else {
    console.log(`  RESULTS: ${passed}/10 passed, ${failed}/10 failed`);
  }
  console.log("═══════════════════════════════════════════════════════════════════════════");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(2);
});
