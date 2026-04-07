/**
 * Domain-specific word prompts for OpenAI gpt-4o-transcribe.
 *
 * The prompt guides the model to recognise proper nouns, acronyms, and
 * technical vocabulary that would otherwise be mis-transcribed.
 * It should be in the same language as the audio.
 */

// ─── GRUNDFOS ────────────────────────────────────────────────────────────────
// Grundfos workshops cover: physical products, commissioning, installer
// workflows, user journeys (brugerrejser), and digital/UX tooling.

const GRUNDFOS_DA = `
Workshop med Grundfos om pumper, digitale løsninger og brugeroplevelse.

Produkter og modeller: Magna, Magna1, Magna3, Alpha, Alpha2, Alpha3, Alpha GO, Comfort TA, Comfort PM, CM, CRN, CR, NK, NB, SE, SL, TP, CHI, BM, SP, UP, Upsilon, Unilift, SQFlex, Hydro MPC.
Styringer og software: CU 352, CU 362, CU 200, iSolutions, GO Remote, GO Balance, Grundfos GO, MGE, Grundfos iSolutions Cloud, GRM, GO app.
Tekniske begreber: tryktab, konstanttryk, proportionaltryk, sætpunkt, løftehøjde, flowrate, aktuel flow, frekvensomformer, frekvensregulering, motor, impeller, flange, tætning, akseltætning, vandmåler, trykbeholder, ekspansionsbeholder, cirkulationspumpe, dykkerpumpe, boosterpumpe, varmtvandsanlæg, returtemperatur, fremløbstemperatur.
Regulativer og sikkerhed: NIS2, Cyber Resilience Act, CRA, ATEX, IEC 62443, CE-mærkning, ErP-direktiv, cybersikkerhed, access control, firmware, commissioning, compliance, conformity.

Brugerrejser og UX: brugerrejse, user journey, journey map, onboarding, installation, idriftsætning, commissioning, serviceopkald, fejlsøgning, alarm, advarsel, vedligehold, touch-point, smertepunkt, pain point, touchpoint, personas, brugerprofil, rolle, behov.
Workflows og processer: arbejdsgang, workflow, godkendelse, approval, serviceteknik, installation flow, trin, fase, beslutningspunkt, eskalering, helpdesk, support, tilbagemelding, notifikation.
Roller: installer, montør, serviceingeniør, slutbruger, facility manager, driftsingeniør, ejer, bygherre, rådgiver, systemintegrator, OEM, OEM-partner, forhandler, distributør.
Digitale kanaler og systemer: BMS, SCADA, BACnet, Modbus, IoT, cloud, API, integration, dashboard, app, portal, notifikation, alarm-log, data, sensor, fjernmonitorering.
`.trim();

const GRUNDFOS_EN = `
Workshop with Grundfos on pumps, digital solutions, and user experience.

Products and models: Magna, Magna1, Magna3, Alpha, Alpha2, Alpha3, Alpha GO, Comfort TA, Comfort PM, CM, CRN, CR, NK, NB, SE, SL, TP, CHI, BM, SP, UP, Upsilon, Unilift, SQFlex, Hydro MPC.
Controls and software: CU 352, CU 362, CU 200, iSolutions, GO Remote, GO Balance, Grundfos GO, MGE, Grundfos iSolutions Cloud, GRM, GO app.
Technical terms: pressure loss, constant pressure, proportional pressure, setpoint, head, flow rate, actual flow, frequency converter, variable speed drive, motor, impeller, flange, shaft seal, water meter, pressure vessel, expansion vessel, circulation pump, submersible pump, booster pump, domestic hot water, return temperature, supply temperature.
Regulations and safety: NIS2, Cyber Resilience Act, CRA, ATEX, IEC 62443, CE marking, ErP directive, cybersecurity, access control, firmware, commissioning, compliance, conformity.

User journeys and UX: user journey, journey map, onboarding, installation, commissioning, service call, fault-finding, alarm, warning, maintenance, touchpoint, pain point, personas, user profile, role, need.
Workflows and processes: workflow, approval, service technician, installation flow, step, phase, decision point, escalation, helpdesk, support, feedback, notification.
Roles: installer, service engineer, end user, facility manager, operations engineer, owner, building owner, consultant, system integrator, OEM, OEM partner, distributor.
Digital channels and systems: BMS, SCADA, BACnet, Modbus, IoT, cloud, API, integration, dashboard, app, portal, notification, alarm log, data, sensor, remote monitoring.
`.trim();

// ─── GABRIEL ─────────────────────────────────────────────────────────────────
// Gabriel workshops focus on customer engagement data, digital analytics,
// data visualisation, and digital product/channel strategy —
// NOT on their commercial textile/fabric products.

const GABRIEL_DA = `
Workshop med Gabriel om kundedataanalyse, engagement-data og datavisualisering.

Data og metrikker: engagement, engagement rate, engagementsgrad, klikrate, CTR, visninger, impressions, konverteringsrate, konvertering, fastholdelse, retention, churn, sessioner, sidevisninger, bounce rate, dwell time, aktive brugere, DAU, MAU, NPS, CSAT, loyalitetsindeks.
Datakilder og systemer: CRM, kundedata, segmentering, kohorte, kanal, touchpoint, digitalt touchpoint, e-mail, nyhedsbrev, sociale medier, hjemmeside, webshop, ERP, datawarehouse, datahub, CDP, Google Analytics, Salesforce.
Visualisering og rapportering: dashboard, KPI-dashboard, datavisualisering, graf, diagram, søjlediagram, linjediagram, heatmap, tragt, funnel, rapport, indsigt, insight, fortælling, datafortælling, storytelling.
Analyse og metode: segmentanalyse, A/B-test, kohorteanalyse, attributionsmodel, last-click, multi-touch, livstidsværdi, CLV, LTV, kundesegment, persona, brugeradfærd, adfærdsdata, first-party data, tredjepartsdata.
Processer og strategi: dataindsamling, datamodel, datagovernance, GDPR, samtykke, consent, kampagne, content-strategi, kanalstrategi, personaliserering, målgruppe, segment, trigger, automatisering, marketing automation.
Roller: dataanalytiker, marketing manager, digital manager, produktejer, product owner, UX-designer, datateam, stakeholder, beslutningstagere.
`.trim();

const GABRIEL_EN = `
Workshop with Gabriel on customer engagement data, digital analytics, and data visualisation.

Data and metrics: engagement, engagement rate, click-through rate, CTR, impressions, conversion rate, conversion, retention, churn, sessions, page views, bounce rate, dwell time, active users, DAU, MAU, NPS, CSAT, loyalty index.
Data sources and systems: CRM, customer data, segmentation, cohort, channel, touchpoint, digital touchpoint, email, newsletter, social media, website, webshop, ERP, data warehouse, data hub, CDP, Google Analytics, Salesforce.
Visualisation and reporting: dashboard, KPI dashboard, data visualisation, graph, chart, bar chart, line chart, heatmap, funnel, report, insight, data storytelling, storytelling.
Analysis and methods: segment analysis, A/B test, cohort analysis, attribution model, last-click, multi-touch, customer lifetime value, CLV, LTV, customer segment, persona, user behaviour, behavioural data, first-party data, third-party data.
Processes and strategy: data collection, data model, data governance, GDPR, consent, campaign, content strategy, channel strategy, personalisation, target audience, trigger, automation, marketing automation.
Roles: data analyst, marketing manager, digital manager, product owner, UX designer, data team, stakeholder, decision makers.
`.trim();

export type WorkspaceDomain = "grundfos" | "gabriel" | "generic" | string;

/**
 * Returns the auto-generated domain prompt for OpenAI gpt-4o-transcribe,
 * or an empty string for generic/unknown domains.
 */
export function getDomainPrompt(
  domain: WorkspaceDomain,
  language: "da" | "en" = "da",
): string {
  if (domain === "grundfos") return language === "en" ? GRUNDFOS_EN : GRUNDFOS_DA;
  if (domain === "gabriel") return language === "en" ? GABRIEL_EN : GABRIEL_DA;
  return "";
}

/**
 * Short one-line summary shown in the UI when the domain prompt is active.
 */
export function getDomainPromptLabel(domain: WorkspaceDomain): string {
  if (domain === "grundfos") return "Grundfos (Magna3, Alpha GO, CU 362, user journey, commissioning …)";
  if (domain === "gabriel") return "Gabriel (engagement, KPI, dashboard, konvertering, CRM …)";
  return "";
}
