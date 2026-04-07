export const CU_CONTROLLER_TEMPLATE = `
<!-- GRUNDFOS CU CONTROLLER — COPY THIS SVG AND ADAPT VALUES FROM TRANSCRIPT -->
<svg viewBox="0 0 260 400" width="260" height="400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="encBody" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3A3D42"/>
      <stop offset="30%" stop-color="#2A2D30"/>
      <stop offset="100%" stop-color="#1E2124"/>
    </linearGradient>
    <linearGradient id="encEdge" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#4A4D52"/>
      <stop offset="50%" stop-color="#3A3D42"/>
      <stop offset="100%" stop-color="#2A2D30"/>
    </linearGradient>
    <linearGradient id="redStrip" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#D4232E"/>
      <stop offset="100%" stop-color="#A01825"/>
    </linearGradient>
    <linearGradient id="displayBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0A1628"/>
      <stop offset="100%" stop-color="#06101E"/>
    </linearGradient>
    <linearGradient id="btnFace" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#444749"/>
      <stop offset="100%" stop-color="#303336"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.5"/></filter>
    <filter id="innerShadow"><feOffset dx="0" dy="1"/><feGaussianBlur stdDeviation="1"/><feComposite operator="out" in="SourceGraphic"/><feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer><feComposite operator="over" in="SourceGraphic"/></filter>
  </defs>

  <!-- ENCLOSURE BODY with 3D depth -->
  <rect x="20" y="10" width="220" height="380" rx="10" fill="url(#encBody)" filter="url(#shadow)"/>
  <!-- Inner edge highlight -->
  <rect x="22" y="12" width="216" height="376" rx="9" fill="none" stroke="#4A4D52" stroke-width="0.5" opacity="0.6"/>
  <!-- Subtle top edge light reflection -->
  <rect x="30" y="12" width="200" height="2" rx="1" fill="#555" opacity="0.3"/>

  <!-- MOUNTING SCREW HOLES (4 corners) -->
  <circle cx="36" cy="26" r="5" fill="#1A1C1E" stroke="#555" stroke-width="0.5"/>
  <circle cx="36" cy="26" r="2" fill="#111"/>
  <circle cx="224" cy="26" r="5" fill="#1A1C1E" stroke="#555" stroke-width="0.5"/>
  <circle cx="224" cy="26" r="2" fill="#111"/>
  <circle cx="36" cy="374" r="5" fill="#1A1C1E" stroke="#555" stroke-width="0.5"/>
  <circle cx="36" cy="374" r="2" fill="#111"/>
  <circle cx="224" cy="374" r="5" fill="#1A1C1E" stroke="#555" stroke-width="0.5"/>
  <circle cx="224" cy="374" r="2" fill="#111"/>

  <!-- RED GRUNDFOS LOGO STRIP -->
  <rect x="30" y="20" width="200" height="38" rx="4" fill="url(#redStrip)"/>
  <!-- Logo strip highlight -->
  <rect x="32" y="21" width="196" height="1" rx="0.5" fill="#FF4040" opacity="0.4"/>
  <text x="130" y="40" text-anchor="middle" fill="#FFFFFF" font-family="Arial,sans-serif" font-size="14" font-weight="700" letter-spacing="0.18em">GRUNDFOS</text>
  <text x="130" y="52" text-anchor="middle" fill="#FFFFFF" font-family="Arial,sans-serif" font-size="9" opacity="0.85">CU 362</text>

  <!-- DIGITAL DISPLAY with bezel -->
  <rect x="35" y="68" width="190" height="90" rx="5" fill="#000" stroke="#1A1C1E" stroke-width="2"/>
  <!-- Display screen area -->
  <rect x="40" y="73" width="180" height="80" rx="3" fill="url(#displayBg)"/>
  <!-- Screen edge glow -->
  <rect x="40" y="73" width="180" height="80" rx="3" fill="none" stroke="rgba(0,200,255,0.15)" stroke-width="0.5"/>
  <!-- Display content -->
  <text x="55" y="98" fill="#00C8FF" font-family="'Courier New',monospace" font-size="18" font-weight="700">18.5</text>
  <text x="130" y="98" fill="#00C8FF" font-family="'Courier New',monospace" font-size="10">m³/h</text>
  <text x="55" y="117" fill="#7CFC00" font-family="'Courier New',monospace" font-size="14" font-weight="700">4.2</text>
  <text x="100" y="117" fill="#7CFC00" font-family="'Courier New',monospace" font-size="9">bar</text>
  <text x="55" y="136" fill="#00C8FF" font-family="'Courier New',monospace" font-size="9">AUTO</text>
  <text x="95" y="136" fill="#00C8FF" font-family="'Courier New',monospace" font-size="9">►</text>
  <text x="110" y="136" fill="#22C55E" font-family="'Courier New',monospace" font-size="9">RUNNING</text>
  <!-- Status bar icons top-right of display -->
  <text x="195" y="88" fill="#5A6A7A" font-family="'Courier New',monospace" font-size="8" text-anchor="end">▶ OK</text>
  <!-- Horizontal separator in display -->
  <line x1="45" y1="142" x2="215" y2="142" stroke="#1A3050" stroke-width="0.5"/>
  <text x="55" y="150" fill="#5A6A7A" font-family="'Courier New',monospace" font-size="7">RPM: 2850  |  η: 78%  |  3.2kW</text>

  <!-- STATUS LED ROW -->
  <g transform="translate(65, 172)">
    <!-- POWER LED -->
    <circle cx="0" cy="0" r="5" fill="#22C55E" filter="url(#glow)"/>
    <circle cx="-1.5" cy="-1.5" r="1.5" fill="white" opacity="0.35"/>
    <text x="0" y="14" text-anchor="middle" fill="#9CA3AF" font-family="Arial,sans-serif" font-size="6.5" font-weight="600">PWR</text>
    <!-- RUN LED -->
    <circle cx="65" cy="0" r="5" fill="#22C55E" filter="url(#glow)"/>
    <circle cx="63.5" cy="-1.5" r="1.5" fill="white" opacity="0.35"/>
    <text x="65" y="14" text-anchor="middle" fill="#9CA3AF" font-family="Arial,sans-serif" font-size="6.5" font-weight="600">RUN</text>
    <!-- ALARM LED (off state) -->
    <circle cx="130" cy="0" r="5" fill="#3D4147" stroke="#555" stroke-width="0.5"/>
    <text x="130" y="14" text-anchor="middle" fill="#9CA3AF" font-family="Arial,sans-serif" font-size="6.5" font-weight="600">ALM</text>
  </g>

  <!-- NAVIGATION BUTTON PAD (cross pattern) -->
  <g transform="translate(130, 225)">
    <!-- Center background circle -->
    <circle cx="0" cy="0" r="38" fill="#252729" stroke="#3A3D42" stroke-width="1"/>
    <!-- UP -->
    <rect x="-12" y="-34" width="24" height="18" rx="3" fill="url(#btnFace)" stroke="#555" stroke-width="0.5"/>
    <text x="0" y="-22" text-anchor="middle" fill="#a8b8cc" font-family="Arial,sans-serif" font-size="10">▲</text>
    <!-- DOWN -->
    <rect x="-12" y="16" width="24" height="18" rx="3" fill="url(#btnFace)" stroke="#555" stroke-width="0.5"/>
    <text x="0" y="29" text-anchor="middle" fill="#a8b8cc" font-family="Arial,sans-serif" font-size="10">▼</text>
    <!-- LEFT -->
    <rect x="-34" y="-9" width="18" height="18" rx="3" fill="url(#btnFace)" stroke="#555" stroke-width="0.5"/>
    <text x="-25" y="5" text-anchor="middle" fill="#a8b8cc" font-family="Arial,sans-serif" font-size="10">◄</text>
    <!-- RIGHT -->
    <rect x="16" y="-9" width="18" height="18" rx="3" fill="url(#btnFace)" stroke="#555" stroke-width="0.5"/>
    <text x="25" y="5" text-anchor="middle" fill="#a8b8cc" font-family="Arial,sans-serif" font-size="10">►</text>
    <!-- OK/ENTER (center) -->
    <circle cx="0" cy="0" r="12" fill="url(#btnFace)" stroke="#555" stroke-width="0.5"/>
    <text x="0" y="4" text-anchor="middle" fill="#00C8FF" font-family="Arial,sans-serif" font-size="8" font-weight="700">OK</text>
  </g>

  <!-- START / STOP BUTTONS -->
  <g transform="translate(130, 290)">
    <!-- START button -->
    <rect x="-55" y="-12" width="44" height="24" rx="4" fill="#14532D" stroke="#22C55E" stroke-width="0.5"/>
    <text x="-33" y="4" text-anchor="middle" fill="#22C55E" font-family="Arial,sans-serif" font-size="8" font-weight="700">START</text>
    <!-- STOP button -->
    <rect x="11" y="-12" width="44" height="24" rx="4" fill="#7B1D1D" stroke="#EF4444" stroke-width="0.5"/>
    <text x="33" y="4" text-anchor="middle" fill="#EF4444" font-family="Arial,sans-serif" font-size="8" font-weight="700">STOP</text>
  </g>

  <!-- MENU / ESC BUTTONS -->
  <g transform="translate(130, 322)">
    <rect x="-55" y="-8" width="44" height="18" rx="3" fill="url(#btnFace)" stroke="#555" stroke-width="0.5"/>
    <text x="-33" y="5" text-anchor="middle" fill="#9CA3AF" font-family="Arial,sans-serif" font-size="7">MENU</text>
    <rect x="11" y="-8" width="44" height="18" rx="3" fill="url(#btnFace)" stroke="#555" stroke-width="0.5"/>
    <text x="33" y="5" text-anchor="middle" fill="#9CA3AF" font-family="Arial,sans-serif" font-size="7">ESC</text>
  </g>

  <!-- CABLE GLANDS (bottom) -->
  <g transform="translate(130, 365)">
    <circle cx="-50" cy="0" r="7" fill="#1A1C1E" stroke="#6B7280" stroke-width="1"/>
    <rect x="-53" y="5" width="6" height="4" rx="1" fill="#6B7280"/>
    <circle cx="-20" cy="0" r="7" fill="#1A1C1E" stroke="#6B7280" stroke-width="1"/>
    <rect x="-23" y="5" width="6" height="4" rx="1" fill="#6B7280"/>
    <circle cx="10" cy="0" r="7" fill="#1A1C1E" stroke="#6B7280" stroke-width="1"/>
    <rect x="7" y="5" width="6" height="4" rx="1" fill="#6B7280"/>
    <circle cx="40" cy="0" r="7" fill="#1A1C1E" stroke="#6B7280" stroke-width="1"/>
    <rect x="37" y="5" width="6" height="4" rx="1" fill="#6B7280"/>
  </g>
  <text x="130" y="385" text-anchor="middle" fill="#5A6A7A" font-family="'Courier New',monospace" font-size="5.5">L1  L2  L3  N  PE    RS485  AI</text>
</svg>`;

export const ALPHA_GO_TEMPLATE = `
<!-- GRUNDFOS ALPHA GO CIRCULATOR — COPY THIS SVG AND ADAPT VALUES FROM TRANSCRIPT -->
<svg viewBox="0 0 220 420" width="220" height="420" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="pumpBody" x1="0" y1="0" x2="1" y2="0.3">
      <stop offset="0%" stop-color="#A01825"/>
      <stop offset="40%" stop-color="#BE1E2D"/>
      <stop offset="80%" stop-color="#D42234"/>
      <stop offset="100%" stop-color="#BE1E2D"/>
    </linearGradient>
    <linearGradient id="flangeGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#C8CED4"/>
      <stop offset="50%" stop-color="#B0B8C1"/>
      <stop offset="100%" stop-color="#9BA3AF"/>
    </linearGradient>
    <linearGradient id="ledArc" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0077C8"/>
      <stop offset="100%" stop-color="#00A5E5"/>
    </linearGradient>
    <filter id="pShadow"><feDropShadow dx="2" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.4"/></filter>
    <filter id="ledGlow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="discShadow"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.25"/></filter>
  </defs>

  <!-- TOP OUTLET PIPE -->
  <rect x="88" y="10" width="44" height="55" rx="2" fill="url(#flangeGrad)"/>
  <!-- Top flange face -->
  <rect x="78" y="10" width="64" height="14" rx="2" fill="url(#flangeGrad)" stroke="#8A929A" stroke-width="0.5"/>
  <!-- Flange bolt holes -->
  <circle cx="86" cy="17" r="3" fill="#7A828A" stroke="#6B7280" stroke-width="0.5"/>
  <circle cx="134" cy="17" r="3" fill="#7A828A" stroke="#6B7280" stroke-width="0.5"/>
  <!-- Union nut -->
  <rect x="82" y="56" width="56" height="10" rx="1" fill="#A8AEB5" stroke="#8A929A" stroke-width="0.5"/>
  <!-- Nut texture lines -->
  <line x1="90" y1="58" x2="90" y2="64" stroke="#8A929A" stroke-width="0.3"/>
  <line x1="100" y1="58" x2="100" y2="64" stroke="#8A929A" stroke-width="0.3"/>
  <line x1="110" y1="58" x2="110" y2="64" stroke="#8A929A" stroke-width="0.3"/>
  <line x1="120" y1="58" x2="120" y2="64" stroke="#8A929A" stroke-width="0.3"/>
  <line x1="130" y1="58" x2="130" y2="64" stroke="#8A929A" stroke-width="0.3"/>

  <!-- PUMP BODY (main red housing) -->
  <rect x="50" y="65" width="120" height="200" rx="14" fill="url(#pumpBody)" filter="url(#pShadow)"/>
  <!-- Body edge highlights -->
  <rect x="52" y="67" width="116" height="196" rx="13" fill="none" stroke="#D42234" stroke-width="0.5" opacity="0.3"/>
  <!-- Left shadow line for depth -->
  <rect x="50" y="80" width="3" height="170" fill="#8B1520" opacity="0.5" rx="1"/>

  <!-- GRUNDFOS text (vertical on left side) -->
  <text x="62" y="200" fill="#FFFFFF" font-family="Arial,sans-serif" font-size="9" font-weight="700" letter-spacing="0.15em" transform="rotate(-90 62 200)" opacity="0.85">GRUNDFOS</text>

  <!-- Product badge -->
  <rect x="135" y="230" width="28" height="12" rx="2" fill="#0077C8"/>
  <text x="149" y="239" text-anchor="middle" fill="#FFFFFF" font-family="Arial,sans-serif" font-size="6" font-weight="700">αGO</text>

  <!-- WHITE CONTROL DISC (key feature) -->
  <circle cx="110" cy="150" r="46" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="1.5" filter="url(#discShadow)"/>
  <!-- Disc inner shadow -->
  <circle cx="110" cy="150" r="44" fill="none" stroke="#F0F0F0" stroke-width="1"/>

  <!-- LED RING around disc -->
  <!-- Background track (inactive) -->
  <circle cx="110" cy="150" r="52" fill="none" stroke="#E5E7EB" stroke-width="7" stroke-dasharray="245 82" stroke-dashoffset="-131" stroke-linecap="round"/>
  <!-- Active arc (proportional pressure = blue) -->
  <circle cx="110" cy="150" r="52" fill="none" stroke="url(#ledArc)" stroke-width="7" stroke-dasharray="140 188" stroke-dashoffset="-131" stroke-linecap="round" filter="url(#ledGlow)"/>

  <!-- CENTER DIAL BUTTON -->
  <circle cx="110" cy="150" r="18" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1.5"/>
  <circle cx="110" cy="150" r="14" fill="#E9EAEC"/>
  <!-- Button highlight -->
  <circle cx="107" cy="146" r="6" fill="white" opacity="0.3"/>
  <text x="110" y="154" text-anchor="middle" fill="#374151" font-family="Arial,sans-serif" font-size="12">▶</text>

  <!-- BLUETOOTH indicator -->
  <circle cx="138" cy="120" r="6" fill="#0077C8" opacity="0.9"/>
  <text x="138" y="123" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="7" font-weight="700">B</text>

  <!-- MINI DATA DISPLAY -->
  <rect x="88" y="175" width="44" height="18" rx="3" fill="#002A5C"/>
  <text x="110" y="187" text-anchor="middle" fill="#00C8FF" font-family="'Courier New',monospace" font-size="9" font-weight="700">4.2 m</text>

  <!-- ELECTRICAL CONNECTION (right side) -->
  <rect x="170" y="140" width="22" height="8" rx="1" fill="#1C1C1C"/>
  <circle cx="192" cy="144" r="5" fill="#1C1C1C" stroke="#333" stroke-width="0.5"/>
  <!-- Cable -->
  <rect x="192" y="141" width="18" height="6" rx="1" fill="#1C1C1C"/>

  <!-- BOTTOM INLET PIPE -->
  <!-- Union nut -->
  <rect x="82" y="265" width="56" height="10" rx="1" fill="#A8AEB5" stroke="#8A929A" stroke-width="0.5"/>
  <line x1="90" y1="267" x2="90" y2="273" stroke="#8A929A" stroke-width="0.3"/>
  <line x1="100" y1="267" x2="100" y2="273" stroke="#8A929A" stroke-width="0.3"/>
  <line x1="110" y1="267" x2="110" y2="273" stroke="#8A929A" stroke-width="0.3"/>
  <line x1="120" y1="267" x2="120" y2="273" stroke="#8A929A" stroke-width="0.3"/>
  <line x1="130" y1="267" x2="130" y2="273" stroke="#8A929A" stroke-width="0.3"/>
  <rect x="88" y="275" width="44" height="55" rx="2" fill="url(#flangeGrad)"/>
  <!-- Bottom flange -->
  <rect x="78" y="316" width="64" height="14" rx="2" fill="url(#flangeGrad)" stroke="#8A929A" stroke-width="0.5"/>
  <circle cx="86" cy="323" r="3" fill="#7A828A" stroke="#6B7280" stroke-width="0.5"/>
  <circle cx="134" cy="323" r="3" fill="#7A828A" stroke="#6B7280" stroke-width="0.5"/>

  <!-- FLOW DIRECTION ARROW (inside body) -->
  <line x1="110" y1="260" x2="110" y2="80" stroke="white" stroke-width="1.5" opacity="0.15" stroke-dasharray="4 3"/>
  <polygon points="104,90 116,90 110,76" fill="white" opacity="0.15"/>

  <!-- ENERGY LABEL -->
  <rect x="55" y="340" width="110" height="20" rx="4" fill="#002A5C"/>
  <text x="80" y="354" fill="white" font-family="Arial,sans-serif" font-size="8" font-weight="600">IE5</text>
  <text x="95" y="354" fill="#00C8FF" font-family="Arial,sans-serif" font-size="7">Ultra Premium</text>
</svg>`;

export const CR_PUMP_TEMPLATE = `
<!-- GRUNDFOS CR/CRE MULTISTAGE PUMP — COPY THIS SVG AND ADAPT VALUES FROM TRANSCRIPT -->
<svg viewBox="0 0 300 500" width="300" height="500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="motorBody" x1="0" y1="0" x2="1" y2="0.2">
      <stop offset="0%" stop-color="#9B1520"/>
      <stop offset="30%" stop-color="#BE1E2D"/>
      <stop offset="70%" stop-color="#D42234"/>
      <stop offset="100%" stop-color="#BE1E2D"/>
    </linearGradient>
    <linearGradient id="stainless" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#D0D5DA"/>
      <stop offset="50%" stop-color="#B8BFC6"/>
      <stop offset="100%" stop-color="#A0A8B0"/>
    </linearGradient>
    <linearGradient id="coupling" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8B929A"/>
      <stop offset="50%" stop-color="#6B7280"/>
      <stop offset="100%" stop-color="#555D66"/>
    </linearGradient>
    <filter id="crShadow"><feDropShadow dx="3" dy="5" stdDeviation="8" flood-color="#000" flood-opacity="0.35"/></filter>
  </defs>

  <!-- FAN COVER (top) -->
  <ellipse cx="150" cy="35" rx="42" ry="18" fill="#9B1520" stroke="#8A1018" stroke-width="0.5"/>
  <!-- Fan grille lines -->
  <line x1="120" y1="35" x2="180" y2="35" stroke="#7A0D14" stroke-width="0.5"/>
  <line x1="125" y1="30" x2="175" y2="30" stroke="#7A0D14" stroke-width="0.5"/>
  <line x1="125" y1="40" x2="175" y2="40" stroke="#7A0D14" stroke-width="0.5"/>

  <!-- MOTOR HOUSING -->
  <rect x="108" y="45" width="84" height="160" rx="6" fill="url(#motorBody)" filter="url(#crShadow)"/>
  <!-- Cooling ribs -->
  <line x1="108" y1="65" x2="192" y2="65" stroke="#9B1520" stroke-width="1.5"/>
  <line x1="108" y1="80" x2="192" y2="80" stroke="#9B1520" stroke-width="1.5"/>
  <line x1="108" y1="95" x2="192" y2="95" stroke="#9B1520" stroke-width="1.5"/>
  <line x1="108" y1="110" x2="192" y2="110" stroke="#9B1520" stroke-width="1.5"/>
  <line x1="108" y1="125" x2="192" y2="125" stroke="#9B1520" stroke-width="1.5"/>
  <line x1="108" y1="140" x2="192" y2="140" stroke="#9B1520" stroke-width="1.5"/>
  <line x1="108" y1="155" x2="192" y2="155" stroke="#9B1520" stroke-width="1.5"/>
  <line x1="108" y1="170" x2="192" y2="170" stroke="#9B1520" stroke-width="1.5"/>
  <line x1="108" y1="185" x2="192" y2="185" stroke="#9B1520" stroke-width="1.5"/>
  <!-- Motor left edge shadow -->
  <rect x="108" y="50" width="4" height="150" fill="#8B1520" opacity="0.5" rx="1"/>
  <!-- GRUNDFOS text on motor -->
  <text x="150" y="115" text-anchor="middle" fill="#FFFFFF" font-family="Arial,sans-serif" font-size="10" font-weight="700" letter-spacing="0.15em" opacity="0.85">GRUNDFOS</text>
  <!-- Motor rating plate -->
  <rect x="155" y="130" width="30" height="20" rx="2" fill="#E8E8E8" stroke="#CCC" stroke-width="0.5"/>
  <text x="170" y="141" text-anchor="middle" fill="#333" font-family="'Courier New',monospace" font-size="4.5">3.0 kW</text>
  <text x="170" y="147" text-anchor="middle" fill="#333" font-family="'Courier New',monospace" font-size="4.5">IE3</text>

  <!-- COUPLING COVER -->
  <rect x="100" y="205" width="100" height="35" rx="4" fill="url(#coupling)"/>
  <!-- Bolt heads on coupling -->
  <circle cx="115" cy="222" r="5" fill="#4B5563" stroke="#3A424D" stroke-width="0.5"/>
  <line x1="112" y1="222" x2="118" y2="222" stroke="#3A424D" stroke-width="0.8"/>
  <circle cx="150" cy="210" r="5" fill="#4B5563" stroke="#3A424D" stroke-width="0.5"/>
  <line x1="150" y1="207" x2="150" y2="213" stroke="#3A424D" stroke-width="0.8"/>
  <circle cx="185" cy="222" r="5" fill="#4B5563" stroke="#3A424D" stroke-width="0.5"/>
  <line x1="182" y1="222" x2="188" y2="222" stroke="#3A424D" stroke-width="0.8"/>

  <!-- PUMP STAGES (stainless steel body) -->
  <rect x="108" y="240" width="84" height="140" rx="4" fill="url(#stainless)"/>
  <!-- Stage separation lines -->
  <line x1="112" y1="260" x2="188" y2="260" stroke="#8A929A" stroke-width="1"/>
  <line x1="112" y1="280" x2="188" y2="280" stroke="#8A929A" stroke-width="1"/>
  <line x1="112" y1="300" x2="188" y2="300" stroke="#8A929A" stroke-width="1"/>
  <line x1="112" y1="320" x2="188" y2="320" stroke="#8A929A" stroke-width="1"/>
  <line x1="112" y1="340" x2="188" y2="340" stroke="#8A929A" stroke-width="1"/>
  <line x1="112" y1="360" x2="188" y2="360" stroke="#8A929A" stroke-width="1"/>
  <!-- Model label on pump -->
  <rect x="120" y="245" width="60" height="12" rx="2" fill="#002A5C"/>
  <text x="150" y="254" text-anchor="middle" fill="#FFFFFF" font-family="Arial,sans-serif" font-size="7" font-weight="600">CR 32-3</text>
  <!-- Pump body left edge highlight -->
  <rect x="108" y="245" width="2" height="130" fill="#D8DDE2" opacity="0.4"/>

  <!-- DISCHARGE FLANGE (right side) -->
  <rect x="192" y="270" width="50" height="30" rx="2" fill="url(#stainless)" stroke="#8A929A" stroke-width="0.5"/>
  <rect x="235" y="265" width="14" height="40" rx="2" fill="url(#stainless)" stroke="#8A929A" stroke-width="0.5"/>
  <!-- Flange bolt holes -->
  <circle cx="241" cy="273" r="3" fill="#8A929A"/>
  <circle cx="241" cy="297" r="3" fill="#8A929A"/>

  <!-- SUCTION FLANGE (left side) -->
  <rect x="58" y="340" width="50" height="30" rx="2" fill="url(#stainless)" stroke="#8A929A" stroke-width="0.5"/>
  <rect x="50" y="335" width="14" height="40" rx="2" fill="url(#stainless)" stroke="#8A929A" stroke-width="0.5"/>
  <circle cx="57" cy="343" r="3" fill="#8A929A"/>
  <circle cx="57" cy="367" r="3" fill="#8A929A"/>

  <!-- BASE PLATE -->
  <rect x="70" y="382" width="160" height="12" rx="2" fill="#2D2D2D" stroke="#444" stroke-width="0.5"/>
  <!-- Mounting feet -->
  <rect x="80" y="394" width="20" height="8" rx="1" fill="#3D4147"/>
  <rect x="200" y="394" width="20" height="8" rx="1" fill="#3D4147"/>
  <!-- Mounting bolt holes -->
  <circle cx="90" cy="398" r="3" fill="#222"/>
  <circle cx="210" cy="398" r="3" fill="#222"/>

  <!-- FLOW ARROWS -->
  <text x="45" y="358" fill="#0077C8" font-family="Arial,sans-serif" font-size="10">→</text>
  <text x="248" y="288" fill="#0077C8" font-family="Arial,sans-serif" font-size="10">→</text>
</svg>`;

export const COMFORT_TA_PANEL_TEMPLATE = `
<!-- GRUNDFOS COMFORT TA — CIRCULAR FRONT PANEL (not the whole pump — FRONT FACE ONLY) -->
<!-- ADAPT: operating mode text, LED color, values shown, AUTO ADAPT vs TIMER state -->
<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="ctaBg" cx="50%" cy="42%" r="58%">
      <stop offset="0%" stop-color="#242424"/>
      <stop offset="70%" stop-color="#111111"/>
      <stop offset="100%" stop-color="#0A0A0A"/>
    </radialGradient>
    <radialGradient id="btnFaceW" cx="35%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#D8D8D8"/>
    </radialGradient>
    <filter id="ctaGlow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="ctaShadow"><feDropShadow dx="0" dy="3" stdDeviation="8" flood-color="#000" flood-opacity="0.6"/></filter>
  </defs>

  <!-- OUTER RIM (light grey/blue, like the product mount) -->
  <circle cx="150" cy="150" r="148" fill="#D8E8F0" stroke="#BBCDD8" stroke-width="1"/>
  <circle cx="150" cy="150" r="142" fill="#C8D8E8" stroke="#AABECE" stroke-width="0.5"/>

  <!-- DARK PANEL FACE -->
  <circle cx="150" cy="150" r="133" fill="url(#ctaBg)" filter="url(#ctaShadow)"/>
  <!-- Panel edge highlight ring -->
  <circle cx="150" cy="150" r="133" fill="none" stroke="#3A3A3A" stroke-width="1.5"/>
  <circle cx="150" cy="150" r="131" fill="none" stroke="#282828" stroke-width="0.5"/>

  <!-- ══ GRUNDFOS LOGO (white X / butterfly mark) at top ══ -->
  <g transform="translate(150,68)" fill="white">
    <path d="M-16,-10 L-5,0 L-16,10 L-10,10 L0,3 L10,10 L16,10 L5,0 L16,-10 L10,-10 L0,-3 L-10,-10 Z"/>
  </g>
  <!-- GRUNDFOS wordmark -->
  <text x="150" y="91" text-anchor="middle" fill="white" font-family="Arial,Helvetica,sans-serif" font-size="9.5" font-weight="700" letter-spacing="0.15em">GRUNDFOS</text>
  <!-- Product name — CHANGE THIS to match transcript (COMFORT TA / COMFORT PM / etc.) -->
  <text x="150" y="106" text-anchor="middle" fill="white" font-family="Arial,Helvetica,sans-serif" font-size="8" letter-spacing="0.06em">COMFORT TA</text>

  <!-- ══ LEFT CLUSTER: THERMOMETER + AUTO ADAPT ══ -->
  <!-- Thermometer body -->
  <rect x="68" y="122" width="10" height="30" rx="5" fill="none" stroke="#AAAAAA" stroke-width="1.5"/>
  <!-- Thermometer fill (green = active / heating) -->
  <rect x="70.5" y="130" width="5" height="20" rx="2.5" fill="#22C55E" filter="url(#ctaGlow)"/>
  <!-- Bulb -->
  <circle cx="73" cy="156" r="7.5" fill="#22C55E" filter="url(#ctaGlow)"/>
  <circle cx="71" cy="154" r="2.5" fill="white" opacity="0.25"/>

  <!-- AUTO ADAPT text block -->
  <text x="118" y="138" text-anchor="middle" fill="white" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="700">AUTO</text>
  <text x="118" y="154" text-anchor="middle" fill="#AAAAAA" font-family="Arial,Helvetica,sans-serif" font-size="9.5" font-style="italic" letter-spacing="0.04em">ADAPT</text>

  <!-- Recycle/undo arc to right of AUTO ADAPT (shows continuous auto cycling) -->
  <g transform="translate(148,142)">
    <path d="M-10,-8 A13,13 0 1,1 10,-2" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
    <polygon points="10,-6 14,0 6,0" fill="white"/>
  </g>

  <!-- ══ TOP RIGHT: CLOCK / TIMER ICON ══ -->
  <g transform="translate(196,118)">
    <circle cx="0" cy="0" r="12" fill="none" stroke="white" stroke-width="1.8"/>
    <line x1="0" y1="-7" x2="0" y2="0" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="0" y1="0" x2="6" y2="4" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
    <!-- Small auto-refresh arc outside clock -->
    <path d="M10,-6 A11,11 0 0,1 11,4" fill="none" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
    <polygon points="10,6 14,1 7,2" fill="white" opacity="0.85"/>
  </g>

  <!-- ══ RIGHT: ALARM / WARNING TRIANGLE ══ -->
  <g transform="translate(210,162)">
    <polygon points="0,-13 14,9 -14,9" fill="none" stroke="white" stroke-width="1.8"/>
    <text x="0" y="7" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="8" font-weight="700">!</text>
  </g>

  <!-- ══ BOTTOM LEFT: QR CODE (simplified, scannable-looking) ══ -->
  <g transform="translate(90,196)">
    <rect x="-22" y="-22" width="44" height="44" fill="#111" rx="2"/>
    <!-- Top-left finder -->
    <rect x="-20" y="-20" width="14" height="14" rx="1" fill="white"/>
    <rect x="-18" y="-18" width="10" height="10" rx="0.5" fill="#111"/>
    <rect x="-16" y="-16" width="6" height="6" rx="0.5" fill="white"/>
    <!-- Top-right finder -->
    <rect x="6" y="-20" width="14" height="14" rx="1" fill="white"/>
    <rect x="8" y="-18" width="10" height="10" rx="0.5" fill="#111"/>
    <rect x="10" y="-16" width="6" height="6" rx="0.5" fill="white"/>
    <!-- Bottom-left finder -->
    <rect x="-20" y="6" width="14" height="14" rx="1" fill="white"/>
    <rect x="-18" y="8" width="10" height="10" rx="0.5" fill="#111"/>
    <rect x="-16" y="10" width="6" height="6" rx="0.5" fill="white"/>
    <!-- Data modules (right-bottom quadrant, scattered) -->
    <rect x="6" y="6" width="4" height="4" fill="white" rx="0.3"/>
    <rect x="12" y="6" width="4" height="4" fill="white" rx="0.3"/>
    <rect x="18" y="6" width="4" height="4" fill="white" rx="0.3"/>
    <rect x="6" y="12" width="4" height="4" fill="white" rx="0.3"/>
    <rect x="18" y="12" width="4" height="4" fill="white" rx="0.3"/>
    <rect x="6" y="18" width="4" height="4" fill="white" rx="0.3"/>
    <rect x="12" y="18" width="4" height="4" fill="white" rx="0.3"/>
    <rect x="18" y="18" width="4" height="4" fill="white" rx="0.3"/>
    <!-- Row of data modules top-center -->
    <rect x="-4" y="-20" width="4" height="4" fill="white" rx="0.3"/>
    <rect x="-4" y="-14" width="4" height="4" fill="white" rx="0.3"/>
    <rect x="-4" y="-8" width="4" height="4" fill="white" rx="0.3"/>
    <rect x="0" y="-20" width="4" height="4" fill="white" rx="0.3"/>
  </g>

  <!-- ══ BOTTOM CENTER-RIGHT: NEXT / NAVIGATE BUTTON ══ -->
  <!-- Outer shadow ring -->
  <circle cx="175" cy="200" r="26" fill="#1A1A1A" stroke="#333" stroke-width="1"/>
  <!-- Button face (white, with highlight) -->
  <circle cx="175" cy="200" r="23" fill="url(#btnFaceW)" filter="url(#ctaShadow)"/>
  <circle cx="168" cy="193" r="7" fill="white" opacity="0.18"/>
  <!-- Chevron / next arrow -->
  <text x="177" y="208" text-anchor="middle" fill="#111111" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="700">›</text>
</svg>`;

export const MAGNA3_DISPLAY_TEMPLATE = `
<!-- GRUNDFOS MAGNA3 — FRONT PANEL DISPLAY (LCD screen + navigation buttons — NOT the full pump) -->
<!-- ADAPT: menu selection, Reguleringsform, Aktuel Flow, Sætpunkt, Løftehøjde, alarm status -->
<svg viewBox="0 0 320 360" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="m3Housing" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2A2A2A"/>
      <stop offset="100%" stop-color="#1A1A1A"/>
    </linearGradient>
    <linearGradient id="m3Screen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0E1F38"/>
      <stop offset="100%" stop-color="#07121F"/>
    </linearGradient>
    <linearGradient id="m3Btn" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#484848"/>
      <stop offset="100%" stop-color="#323232"/>
    </linearGradient>
    <filter id="m3Glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="m3Shadow"><feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#000" flood-opacity="0.5"/></filter>
  </defs>

  <!-- HOUSING (circular front face, slightly oval for depth) -->
  <ellipse cx="160" cy="170" rx="148" ry="158" fill="url(#m3Housing)" filter="url(#m3Shadow)"/>
  <ellipse cx="160" cy="170" rx="148" ry="158" fill="none" stroke="#444" stroke-width="1"/>
  <!-- Inner housing ring -->
  <ellipse cx="160" cy="170" rx="144" ry="154" fill="none" stroke="#333" stroke-width="0.5"/>

  <!-- Green LED ring at top (power / running indicator) -->
  <path d="M100,28 A90,90 0 0,1 220,28" fill="none" stroke="#22C55E" stroke-width="6" stroke-linecap="round" filter="url(#m3Glow)"/>

  <!-- LCD DISPLAY BEZEL -->
  <rect x="30" y="42" width="240" height="148" rx="6" fill="#0A0A0A" stroke="#222" stroke-width="2"/>
  <!-- Screen -->
  <rect x="34" y="46" width="232" height="140" rx="4" fill="url(#m3Screen)"/>
  <!-- Screen edge glow (blue) -->
  <rect x="34" y="46" width="232" height="140" rx="4" fill="none" stroke="rgba(0,160,220,0.18)" stroke-width="1"/>

  <!-- ── MENU TABS ── -->
  <!-- Active tab (Hjem) -->
  <rect x="36" y="48" width="54" height="20" rx="3" fill="#0077C8"/>
  <text x="63" y="62" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="8" font-weight="700">Hjem</text>
  <!-- Inactive tabs -->
  <rect x="92" y="48" width="54" height="20" rx="3" fill="#0D1F38"/>
  <text x="119" y="62" text-anchor="middle" fill="#6A8AB0" font-family="Arial,sans-serif" font-size="8">Status</text>
  <rect x="148" y="48" width="64" height="20" rx="3" fill="#0D1F38"/>
  <text x="180" y="62" text-anchor="middle" fill="#6A8AB0" font-family="Arial,sans-serif" font-size="8">Indstilli</text>
  <rect x="214" y="48" width="50" height="20" rx="3" fill="#0D1F38"/>
  <text x="239" y="62" text-anchor="middle" fill="#6A8AB0" font-family="Arial,sans-serif" font-size="8">Hjælp</text>

  <!-- ── LEFT PANE: Operating data ── -->
  <line x1="34" y1="70" x2="266" y2="70" stroke="#0D2040" stroke-width="0.5"/>

  <!-- Home icon + label -->
  <text x="44" y="84" fill="#6A8AB0" font-family="Arial,sans-serif" font-size="9">⌂</text>
  <text x="55" y="84" fill="#8AA8CC" font-family="Arial,sans-serif" font-size="7.5">Reguleringsform</text>
  <!-- CHANGE THIS VALUE to match transcript (Konstanttryk / Proportionaltryk / AUTO) -->
  <rect x="38" y="88" width="100" height="16" rx="2" fill="#0A1F3A"/>
  <text x="88" y="100" text-anchor="middle" fill="#00C8FF" font-family="'Courier New',monospace" font-size="8.5" font-weight="700">Konstanttryk</text>
  <!-- Small navigation arrow inside left pane -->
  <text x="136" y="99" fill="#4A6A8A" font-family="Arial,sans-serif" font-size="9">▷</text>

  <!-- Aktuel Flow label + value — CHANGE VALUE to match transcript -->
  <text x="44" y="122" fill="#6A8AB0" font-family="Arial,sans-serif" font-size="7.5">Aktuel Flow</text>
  <text x="44" y="137" fill="#00C8FF" font-family="'Courier New',monospace" font-size="16" font-weight="700">1.7</text>
  <text x="80" y="137" fill="#6A8AB0" font-family="'Courier New',monospace" font-size="9">m³/h</text>

  <!-- Divider between panes -->
  <line x1="150" y1="72" x2="150" y2="184" stroke="#0D2040" stroke-width="1"/>

  <!-- ── RIGHT PANE: Setpoint / Head ── -->
  <!-- Sætpunkt label + value — CHANGE VALUE to match transcript -->
  <text x="160" y="84" fill="#8AA8CC" font-family="Arial,sans-serif" font-size="7.5">Sætpunkt</text>
  <rect x="160" y="88" width="18" height="16" rx="2" fill="#0A3060"/>
  <text x="169" y="100" text-anchor="middle" fill="#00C8FF" font-family="Arial,sans-serif" font-size="7">▷</text>
  <text x="186" y="100" fill="#00C8FF" font-family="'Courier New',monospace" font-size="14" font-weight="700">4.50</text>
  <text x="218" y="100" fill="#6A8AB0" font-family="'Courier New',monospace" font-size="9">m</text>

  <!-- Løftehøjde label + value — CHANGE VALUE to match transcript -->
  <text x="160" y="120" fill="#8AA8CC" font-family="Arial,sans-serif" font-size="7.5">Løftehøjde</text>
  <text x="186" y="138" fill="#00C8FF" font-family="'Courier New',monospace" font-size="14" font-weight="700">4.5</text>
  <text x="214" y="138" fill="#6A8AB0" font-family="'Courier New',monospace" font-size="9">m</text>

  <!-- Navigation arrow in right pane -->
  <text x="255" y="100" fill="#00C8FF" font-family="Arial,sans-serif" font-size="12">›</text>
  <text x="255" y="120" fill="#4A6A8A" font-family="Arial,sans-serif" font-size="12">›</text>

  <!-- ── STATUS BAR at bottom of screen ── -->
  <line x1="34" y1="156" x2="266" y2="156" stroke="#0D2040" stroke-width="0.5"/>
  <text x="44" y="168" fill="#2A4A6A" font-family="'Courier New',monospace" font-size="6.5">● KØRENDE</text>
  <text x="130" y="168" fill="#2A4A6A" font-family="'Courier New',monospace" font-size="6.5">RPM: 2300</text>
  <text x="210" y="168" fill="#2A4A6A" font-family="'Courier New',monospace" font-size="6.5">η: 72%</text>
  <line x1="34" y1="182" x2="266" y2="182" stroke="#0D2040" stroke-width="0.5"/>

  <!-- ── NAVIGATION BUTTON PAD ── -->
  <!-- Circular base for buttons -->
  <circle cx="130" cy="258" r="52" fill="#222" stroke="#383838" stroke-width="1"/>
  <!-- Up arrow -->
  <rect x="118" y="210" width="24" height="22" rx="4" fill="url(#m3Btn)" stroke="#555" stroke-width="0.5"/>
  <text x="130" y="225" text-anchor="middle" fill="#9CB8D8" font-family="Arial,sans-serif" font-size="13">▲</text>
  <!-- Down arrow -->
  <rect x="118" y="282" width="24" height="22" rx="4" fill="url(#m3Btn)" stroke="#555" stroke-width="0.5"/>
  <text x="130" y="297" text-anchor="middle" fill="#9CB8D8" font-family="Arial,sans-serif" font-size="13">▼</text>
  <!-- Left arrow -->
  <rect x="80" y="246" width="22" height="24" rx="4" fill="url(#m3Btn)" stroke="#555" stroke-width="0.5"/>
  <text x="91" y="262" text-anchor="middle" fill="#9CB8D8" font-family="Arial,sans-serif" font-size="13">◄</text>
  <!-- Right arrow -->
  <rect x="158" y="246" width="22" height="24" rx="4" fill="url(#m3Btn)" stroke="#555" stroke-width="0.5"/>
  <text x="169" y="262" text-anchor="middle" fill="#9CB8D8" font-family="Arial,sans-serif" font-size="13">►</text>
  <!-- OK center button -->
  <circle cx="130" cy="258" r="18" fill="url(#m3Btn)" stroke="#555" stroke-width="0.5"/>
  <circle cx="127" cy="255" r="5" fill="white" opacity="0.08"/>
  <text x="130" y="263" text-anchor="middle" fill="#00C8FF" font-family="Arial,sans-serif" font-size="10" font-weight="700">OK</text>

  <!-- BACK / RETURN BUTTON (right of nav pad) -->
  <circle cx="220" cy="255" r="18" fill="url(#m3Btn)" stroke="#555" stroke-width="0.5"/>
  <text x="220" y="252" text-anchor="middle" fill="#9CB8D8" font-family="Arial,sans-serif" font-size="12">↩</text>
  <text x="220" y="264" text-anchor="middle" fill="#6A8AB0" font-family="Arial,sans-serif" font-size="5.5">TILBAGE</text>

  <!-- ── PRODUCT LABEL ── -->
  <text x="160" y="318" text-anchor="middle" fill="#FF6040" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="700" letter-spacing="0.12em">MAGNA3</text>
</svg>`;

export const PUMP_TEMPLATE_INSTRUCTIONS = `
━━━ FRONT PANEL / DISPLAY TEMPLATES ━━━

CRITICAL PRINCIPLE: Visualise the CONTROL FACE of the pump — NOT the full pump body with pipes and flanges.
Users want to see what they interact with: the circular control disc, the LCD display screen, the button layout.

TEMPLATE SELECTION GUIDE:
  • Comfort TA / Comfort PM / Alpha GO          → COMFORT_TA_PANEL_TEMPLATE  (circular black disc, icons, QR, > button)
  • Magna3 / MAGNA3                              → MAGNA3_DISPLAY_TEMPLATE    (rectangular LCD + nav buttons + MAGNA3 label)
  • CU 352 / CU 362 / CU 200 / CU controller    → CU_CONTROLLER_TEMPLATE     (rectangular enclosure, LED row, nav pad)
  • Alpha / Alpha2 / Alpha3 / Alpha GO           → ALPHA_GO_TEMPLATE          (red body + white control disc + LED ring)
  • CR / CRE / NK / NB / SE / SL multistage     → CR_PUMP_TEMPLATE           (vertical stainless stages + motor)

TRANSCRIPT EXTRACTION RULES — NON-NEGOTIABLE:
  Before generating the SVG, scan the ENTIRE transcript for these values and fill them in:
  ① PRODUCT MODEL   — e.g. "Magna3", "Comfort TA", "CU 362", "Alpha GO"  → product name + title
  ② FLOW RATE       — e.g. "1.7 m³/h", "18 m³", "aktuel flow"           → display reading
  ③ PRESSURE/HEAD   — e.g. "4.5 m", "2.8 bar", "sætpunkt", "tryktab"    → setpoint / display value
  ④ OPERATING MODE  — "Konstanttryk", "AUTO ADAPT", "Proportionaltryk", "TIMER" → mode text on display
  ⑤ ALARMS / FAULTS — mention of fault, alarm, warning                    → alarm LED/icon active (red)
  ⑥ SPECIFIC SETTINGS — "24h timer", "setpoint 4.50m", "RPM", "efficiency" → show on screen / callout label
  ⑦ FEATURES DISCUSSED — "QR code scanning", "Bluetooth", "AUTO ADAPT mode" → highlight that element with callout

  If the transcript gives a value → USE IT. If not → keep the template default. NEVER invent values not in the transcript.

YOUR JOB:
  1. Pick the matching template from those injected below
  2. Change ONLY the lines marked "CHANGE THIS" or "ADAPT" — keep all gradients, filters, shadows
  3. Add SVG <line>+<text> callout annotations for each feature explicitly discussed in the transcript
  4. Embed in clean white (#F8FAFC) page — product name title above the SVG, max 2 compact info items below

SVG SIZING — CRITICAL:
  REMOVE width/height attributes from <svg>, wrap in:
    <div style="width:min(90vw,480px);margin:0 auto">
      <svg viewBox="..." style="width:100%;height:auto;display:block">

SURROUNDING LAYOUT — STRICTLY:
  - Product name: font-family Outfit, 2.2rem, font-weight 700, color #002A5C, centered above SVG
  - MAXIMUM 2 compact info items below (short label + 1–2 values only — NO paragraphs, NO spec tables)
  - Callout annotations point to specific elements on the panel
  - NO requirements lists. NO long descriptions. The panel drawing speaks for itself.

DO NOT simplify the SVG. DO NOT remove gradients or filters. DO NOT replace template elements with flat rectangles.
The templates are your MINIMUM quality bar — add more detail but never less.
`;

