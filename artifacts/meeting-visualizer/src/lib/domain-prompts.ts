/**
 * Domain-specific word prompts for OpenAI gpt-4o-transcribe.
 *
 * OpenAI's transcription model uses the prompt to recognise proper nouns,
 * acronyms, and technical vocabulary that might otherwise be mis-transcribed.
 * The prompt should be in the same language as the audio.
 */

const GRUNDFOS_DA = `
Workshop om Grundfos pumper og vandsystemer.
Produkter: Magna, Magna1, Magna3, CM, CRN, CR, NK, NB, SE, SL, TP, CHI, BM, SP, UP, Alpha, Alpha2, Alpha3, Upsilon, Unilift.
Styringer og software: CU 352, CU 362, CU 200, iSolutions, GO Remote, GO Balance, Grundfos GO, MGE, SQFlex.
Tekniske begreber: tryktab, flowrate, tryk, vandmåler, frekvensomformer, frekvensregulering, motor, impeller, flange, tætning, akseltætning, rustfrit stål, støbejern, cirkulationspumpe, dykkerpumpe, boosterpumpe, trykforøger, varmtvandsanlæg, trykbeholder, ekspansionsbeholder.
Installationstyper: fjernvarme, varmeanlæg, brugsvandsinstallation, brandslukningssystem, dræning, spildevand.
Regulativer og sikkerhed: NIS2, Cyber Resilience Act, CRA, ATEX, IEC 62443, CE-mærkning, ErP-direktiv, commissioning, access control, firmware, compliance, conformity, cybersikkerhed.
Projekter og roller: installer, serviceingeniør, systemintegrator, OEM, OEM-partner, forhandler, slutbruger, BMS, SCADA, BACnet, Modbus.
`.trim();

const GRUNDFOS_EN = `
Workshop on Grundfos pumps and water systems.
Products: Magna, Magna1, Magna3, CM, CRN, CR, NK, NB, SE, SL, TP, CHI, BM, SP, UP, Alpha, Alpha2, Alpha3, Upsilon, Unilift.
Controls and software: CU 352, CU 362, CU 200, iSolutions, GO Remote, GO Balance, Grundfos GO, MGE, SQFlex.
Technical terms: pressure loss, flow rate, pressure, water meter, frequency converter, variable speed drive, motor, impeller, flange, shaft seal, stainless steel, cast iron, circulation pump, submersible pump, booster pump, pressure booster, domestic hot water, pressure vessel, expansion vessel.
Installation types: district heating, heating system, domestic water supply, fire suppression, drainage, wastewater.
Regulations and safety: NIS2, Cyber Resilience Act, CRA, ATEX, IEC 62443, CE marking, ErP directive, commissioning, access control, firmware, compliance, conformity, cybersecurity.
Projects and roles: installer, service engineer, system integrator, OEM, OEM partner, distributor, end user, BMS, SCADA, BACnet, Modbus.
`.trim();

const GABRIEL_DA = `
Workshop om Gabriel tekstil, møbelstof og design.
Produktserier: Capture, Synergy, Crisp, Clara, Field, Remix, Xtreme, Era, Hallingdal, Savanna, Steelcut, Divina, Tonus, Canvas, Fiord, Re-wool, Kvadrat.
Materialer og produktion: uld, merinould, polyester, genanvendt polyester, akryl, bomuld, lærred, garnfarvning, vævning, strik, nonwoven, fibernedbrydning.
Produkttyper: møbelstof, kontrakttekstil, polstringsstof, akustikstof, akustikpanel, gardin, vægtæppe, vægbeklædning, gulvtæppe.
Design og farve: farvepalette, farvekort, kollektion, moodboard, designsystem, brandidentitet, colorway, nuance, tekstur, mønster, finish.
Bæredygtighed: cirkulær økonomi, cirkulæritet, Cradle to Cradle, Oeko-Tex, EPD, miljøvaredeklaration, certificering, genbrug, genanvendelse, CO2-aftryk, bæredygtigt design, livscyklusanalyse, LCA.
Branche og salg: udbud, kontrakt, B2B, specifikation, arkitekt, indretningsarkitekt, interiørdesigner, showroom, prøve, prøvekollage, uldkvalitet, flammehæmmende, brandkrav, Crib 5.
`.trim();

const GABRIEL_EN = `
Workshop on Gabriel textiles, upholstery fabrics, and design.
Product ranges: Capture, Synergy, Crisp, Clara, Field, Remix, Xtreme, Era, Hallingdal, Savanna, Steelcut, Divina, Tonus, Canvas, Fiord, Re-wool, Kvadrat.
Materials and production: wool, merino wool, polyester, recycled polyester, acrylic, cotton, canvas, yarn dyeing, weaving, knitting, nonwoven, fibre degradation.
Product types: upholstery fabric, contract textile, acoustic fabric, acoustic panel, curtain, wall-to-wall carpet, wall covering, rug.
Design and colour: colour palette, colour card, collection, moodboard, design system, brand identity, colorway, shade, texture, pattern, finish.
Sustainability: circular economy, circularity, Cradle to Cradle, Oeko-Tex, EPD, environmental product declaration, certification, recycling, upcycling, carbon footprint, sustainable design, life cycle assessment, LCA.
Industry and sales: tender, contract, B2B, specification, architect, interior designer, showroom, swatch, sample collage, wool quality, flame retardant, fire rating, Crib 5.
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
  if (domain === "grundfos") return "Grundfos (pumper, frekvensomformer, NIS2, CRA …)";
  if (domain === "gabriel") return "Gabriel (tekstil, Cradle to Cradle, akustik …)";
  return "";
}
