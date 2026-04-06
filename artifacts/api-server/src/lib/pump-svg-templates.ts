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

export const PUMP_TEMPLATE_INSTRUCTIONS = `
━━━ SVG PUMP TEMPLATE SYSTEM ━━━
Below are COMPLETE, WORKING SVG templates for Grundfos products.
YOUR JOB: Copy the most relevant template below, then ADAPT it:
  1. Change display values (flow, pressure, RPM, etc.) to match transcript data
  2. Adjust model name (CU 362, Alpha GO, CR 32-3, etc.) to match what's discussed
  3. Modify LED states, button labels, or status text based on context
  4. Keep ALL gradients, filters, shadows, and structural elements — they create the realistic look
  5. Add callout annotations (SVG <line> + <text> elements) pointing to key parts discussed

SVG SIZING — CRITICAL:
  When you embed the SVG in the HTML page, REMOVE the fixed width/height attributes from the <svg> element
  and KEEP only the viewBox. Then control size with CSS:
    <div style="width:min(88vw,640px);margin:0 auto;padding:8px 0">
      <svg viewBox="..." style="width:100%;height:auto;display:block">
  This makes the product illustration fill most of the visible viewport regardless of screen size.

SURROUNDING LAYOUT — STRICTLY:
  - Product name as hero title: Outfit 2.2rem font-weight:700 color:#002A5C, centered above SVG
  - The SVG fills the viewport as described above — it is the ENTIRE visualization
  - MAXIMUM 2 compact info items below the SVG (short label + value only, NO long text)
  - Callout annotations: <line> + <text> elements placed around the SVG, near the parts they describe
  - NO spec card grids, NO requirements lists, NO paragraphs of text

DO NOT simplify the SVG. DO NOT remove gradients or filters. DO NOT replace detailed elements with simple rectangles.
The templates below are your MINIMUM quality bar — you may add MORE detail but never less.
`;
