/**
 * Stress test: 18 scenarios testing classification across ALL visualization families.
 * All tests use the /api/visualize endpoint but ABORT after receiving the
 * classification meta event — no need to wait for full Claude generation.
 *
 * Tests 1-10:  Direct classification accuracy (all 10 families)
 * Tests 11-14: Topic shift detection (earlier topic → explicit new request)
 * Tests 15-18: Incremental update classification (same topic + additions)
 */

const BASE_URL = `http://localhost:8080`;

const SCENARIOS = [
  // === DIRECT CLASSIFICATION (1-10) ===
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
    name: "Persona — installer user profile with needs and frustrations",
    transcript: `Let's create a persona for our typical installer. His name is Thomas, 42 years old, works for a small 
      plumbing company in Jutland. He's been installing pumps for 15 years. His main user needs are quick access to 
      installation manuals and wiring diagrams. His frustrations include confusing model numbering and hard-to-find 
      spare parts documentation. His motivation is to finish jobs quickly and get good reviews from building managers. 
      He uses the Grundfos GO app on site but finds Bluetooth pairing unreliable. His behavioral pattern shows he 
      always checks YouTube for installation videos before reading the official manual. Show me a persona profile.`,
    expected: "persona_research",
  },
  {
    id: 6,
    name: "Service blueprint — pump installation service layers",
    transcript: `We need to map out our pump installation service as a service blueprint. The customer action starts with 
      requesting a quote through our website. Frontstage: the sales engineer calls back within 24 hours. Then the 
      line of visibility separates what the customer sees from the backstage processes. Backstage: the warehouse 
      checks stock levels and the logistics team arranges delivery. Support processes include the ERP system 
      generating a pick list and the courier service API integration. We also need to show the physical evidence 
      at each touchpoint — the quote PDF, the delivery notification email, and the installation certificate.`,
    expected: "service_blueprint",
  },
  {
    id: 7,
    name: "Comparison — evaluating three pump controller options",
    transcript: `We need to compare three controller options for the new water utility project. Option A is the CU 300 
      with full Modbus and BACnet support, higher cost but most flexible. Option B is the CU 200 with basic Modbus only, 
      lower cost but limited integration. Option C is a third-party PLC with custom firmware, cheapest but requires 
      ongoing maintenance. Evaluation criteria include: integration capability, total cost of ownership, maintenance 
      burden, customer satisfaction risk, and time to deploy. Let's create a comparison matrix with weighted scoring 
      to make the decision. We should also consider the competitive analysis — what do Wilo and Xylem offer in this space?`,
    expected: "comparison_evaluation",
  },
  {
    id: 8,
    name: "Design system — component documentation and tokens",
    transcript: `We need to document our Grundfos design system for the new digital platform. Start with the design tokens: 
      our primary color is navy #002A5C, secondary is blue #0077C8, accent is cyan #00B4D8. The typography scale uses 
      Outfit for body text at 14px/16px/18px and Playfair Display for headings at 24px/32px/48px. Spacing follows an 
      8px grid system with tokens at 4/8/16/24/32/48/64. We need to document the Button component with all its states: 
      default, hover, active, disabled, and loading. There are three size variants: small, medium, and large. 
      The component anatomy shows icon slot, label, and optional badge. Show me the design system specification.`,
    expected: "design_system",
  },
  {
    id: 9,
    name: "Physical product — pump hardware illustration",
    transcript: `We need to present the Alpha GO pump at the product review meeting. The pump has the circular LED ring 
      around the control face showing the current operating mode. The Bluetooth module is inside the electronics housing. 
      Next to the pump, show the Grundfos GO app panel with the main screen displaying flow rate and energy consumption. 
      The pump body is the standard inline design with DN25 flanges. Include the motor housing with IE5 classification.`,
    expected: "physical_product",
  },
  {
    id: 10,
    name: "Management summary — project roadmap with milestones",
    transcript: `Let me outline the project roadmap. We have three major milestones: prototype ready by March 15, 
      field testing starts April 1, and production release June 30. There's a regulatory review in May that 
      could delay things. The steering committee meets quarterly and the budget was approved for Q1 and Q2. 
      Key decision: we decided to go with the CU 300 controller instead of the third-party PLC. 
      We need a clear timeline showing all these phases and the risk register for the regulatory dependency.`,
    expected: "management_summary",
  },

  // === TOPIC SHIFT DETECTION (11-14) ===
  {
    id: 11,
    name: "SHIFT: HMI discussion → persona request",
    transcript: `We've been discussing the HMI dashboard layout with the tabs and alarm panels, that looks good. 
      The navigation tabs and setpoint controls are well designed. The alarm LED indicators work correctly.
      But now let's switch to something completely different. We need to understand who actually uses this system.
      Show me a persona for the typical pump station operator. What are their needs, frustrations, and daily workflow?
      I want to see an empathy map with what they think, feel, say, and do during a typical shift.`,
    expected: "persona_research",
  },
  {
    id: 12,
    name: "SHIFT: Journey discussion → service blueprint request",
    transcript: `The user journey map we just discussed covers the digital touchpoints nicely. The personas and phases are clear.
      The pain points at each touchpoint have been identified and the emotion curve shows the user sentiment well.
      But we need to go deeper into what happens behind the scenes. Let's create a service blueprint showing the 
      backstage processes and support systems. I want to see the line of visibility and all the backend systems 
      involved in the customer's installation experience. Show me a service blueprint with all layers.`,
    expected: "service_blueprint",
  },
  {
    id: 13,
    name: "SHIFT: Workflow discussion → comparison request",
    transcript: `OK so the installation workflow is clear, the flowchart with the decision diamonds looks great. The process steps 
      from receiving to commissioning are all covered. The swim lanes show installer vs electrician responsibilities.
      Actually, let's step back. Before we finalize the process, we should compare the three installation approaches.
      Show me a comparison matrix of our three options: standard installation, quick-connect installation, and 
      modular pre-fab installation. I want to evaluate them on cost, time, skill level required, and error rate.`,
    expected: "comparison_evaluation",
  },
  {
    id: 14,
    name: "SHIFT: Product discussion → design system request",
    transcript: `The pump hardware illustration looks good with the Alpha GO and the LED ring. The GO app panel is clear.
      The product cutaway shows the impeller and volute nicely. The motor housing dimensions are accurate.
      OK but now we need to talk about the digital side. We're building a new app and we need to document 
      our design system. Show me a design system spec with our color palette, typography scale, spacing tokens, 
      and the Button component with all its states. We need this for the development handoff.`,
    expected: "design_system",
  },

  // === INCREMENTAL UPDATES (15-18) ===
  {
    id: 15,
    name: "INCREMENTAL: Persona + add new frustration (should stay persona)",
    transcript: `We're building a persona for Thomas the installer. He's 42, works in Jutland, installs pumps daily.
      His user needs include quick manual access and wiring diagrams. His main frustration is confusing model numbers.
      His motivation is finishing jobs quickly. He checks YouTube before reading official documentation.
      
      Actually, we just learned from the latest interview that Thomas also has a major frustration with the 
      warranty registration process. He has to enter 20-digit serial numbers manually on a tiny phone screen on site.
      Also add that his favorite tool is the thermal camera for checking pipe insulation. And his behavioral 
      pattern shows he always takes photos of the installation for his own records. Keep the existing persona.`,
    expected: "persona_research",
  },
  {
    id: 16,
    name: "INCREMENTAL: Service blueprint + add support layer (should stay blueprint)",
    transcript: `Our service blueprint shows the customer requesting a quote, sales calling back, warehouse checking stock,
      logistics arranging delivery, and the ERP generating pick lists. The frontstage and backstage layers are clear.
      The line of visibility correctly separates what the customer sees from internal processes.
      
      We need to add the after-installation support layer. After the installer finishes, the customer calls our 
      support hotline if they have issues. Backstage: the support agent looks up the installation record in Salesforce, 
      checks the pump model in our product database, and if needed, dispatches a field technician through the 
      scheduling system. Add these support processes to the existing blueprint.`,
    expected: "service_blueprint",
  },
  {
    id: 17,
    name: "INCREMENTAL: Comparison + add new criterion (should stay comparison)",
    transcript: `We're comparing three controller options: CU 300 with full Modbus and BACnet, CU 200 with basic Modbus, 
      and third-party PLC with custom firmware. Criteria: integration capability, cost, maintenance, satisfaction risk.
      
      The procurement team just added two more criteria we need to evaluate. First: supply chain reliability — 
      the CU 300 has 8-week lead time, CU 200 has 4 weeks, and the third-party PLC has 12 weeks due to chip shortage.
      Second: training requirement — CU 300 needs 2 days training, CU 200 is half a day, and the PLC needs 5 days.
      Update the comparison matrix with these additional criteria and recalculate the weighted scores.`,
    expected: "comparison_evaluation",
  },
  {
    id: 18,
    name: "INCREMENTAL: Design system + add new component (should stay design system)",
    transcript: `Our design system has the color tokens, typography scale, spacing system, and the Button component documented.
      The Button has all states: default, hover, active, disabled, loading. Three sizes: S, M, L.
      
      We also need to add the Input Field component to the design system. It should show states: empty, focused, 
      filled, error, disabled. The error state shows a red border with an error message below. The label sits above 
      the input and the placeholder text is #9CA3AF. Add this component spec to the existing design system.`,
    expected: "design_system",
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
  console.log("═══════════════════════════════════════════════════════════════════════════════");
  console.log("  MEETING AI VISUALIZER — STRESS TEST (18 scenarios, all 10 families)");
  console.log("  Direct (1-10)  |  Topic Shift (11-14)  |  Incremental (15-18)");
  console.log("═══════════════════════════════════════════════════════════════════════════════\n");

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

  console.log("\n═══════════════════════════════════════════════════════════════════════════════");
  if (failed === 0) {
    console.log(`  ALL ${SCENARIOS.length} TESTS PASSED`);
  } else {
    console.log(`  RESULTS: ${passed}/${SCENARIOS.length} passed, ${failed}/${SCENARIOS.length} failed`);
  }
  console.log("═══════════════════════════════════════════════════════════════════════════════");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(2);
});
