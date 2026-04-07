import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Minimize2, Maximize2, Pencil, RotateCcw, PenLine } from "lucide-react";
import { Button } from "./ui/button";
import { useIframeEdit } from "@/hooks/use-iframe-edit";

const BASE = import.meta.env.BASE_URL;

/** Delegation på document.body + markør på documentElement (ikke window) — så scriptet virker igen efter doc.write() og på lazy-indhold. */
const VIZ_INTERACT_SCRIPT = `
(function() {
  var root = document.documentElement;
  if (root && root.getAttribute('data-viz-interact-bound') === '1') return;
  if (root) root.setAttribute('data-viz-interact-bound', '1');

  function activateTab(host, idx) {
    var tabs = host.querySelectorAll('[role="tab"][data-viz-tab]');
    var panels = host.querySelectorAll('[data-viz-tab-panel]');
    tabs.forEach(function(t) {
      var active = String(t.getAttribute('data-viz-tab')) === String(idx);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
      t.classList.toggle('viz-tab-active', active);
    });
    panels.forEach(function(p) {
      var show = String(p.getAttribute('data-viz-tab-panel')) === String(idx);
      p.style.display = show ? '' : 'none';
      if (show) p.removeAttribute('hidden');
      else p.setAttribute('hidden', '');
    });
  }

  document.body.addEventListener('click', function(e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var filterBtn = t.closest('[data-viz-filter]');
    if (filterBtn) {
      var host = filterBtn.closest('[data-viz-filter-host]');
      if (!host) return;
      e.preventDefault();
      var val = filterBtn.getAttribute('data-viz-filter') || 'all';
      host.querySelectorAll('[data-viz-filter]').forEach(function(b) {
        b.setAttribute('aria-pressed', b === filterBtn ? 'true' : 'false');
      });
      host.querySelectorAll('[data-viz-row-cat]').forEach(function(row) {
        var c = row.getAttribute('data-viz-row-cat') || '';
        row.style.display = (val === 'all' || c === val) ? '' : 'none';
      });
      return;
    }

    var tab = t.closest('[role="tab"][data-viz-tab]');
    if (tab) {
      var tabHost = tab.closest('[data-viz-host-tabs]');
      if (!tabHost) return;
      e.preventDefault();
      activateTab(tabHost, tab.getAttribute('data-viz-tab'));
      return;
    }

    var toggleBtn = t.closest('[data-viz-toggle]');
    if (toggleBtn) {
      var sel = toggleBtn.getAttribute('data-viz-toggle');
      if (sel) {
        document.querySelectorAll(sel).forEach(function(el) {
          el.classList.toggle('viz-open');
        });
      }
    }
  }, true);
})();
`;

/** Under streaming: færre fulde doc.write() ⇒ mindre hvid blink mellem opdateringer */
const STREAMING_IFRAME_THROTTLE_MS = 1100;

function isHtmlRenderable(html: string | null): boolean {
  if (!html || html.length < 300) return false;
  return html.includes("<div") || html.includes("<section") || html.includes("<table");
}

type SkeletonVariant =
  | "dark"
  | "light-sidebar"
  | "light-table"
  | "light-columns"
  | "light-flow"
  | "light-cards"
  | "light-product";

function familyToVariant(family: string | null | undefined): SkeletonVariant {
  switch (family) {
    case "hmi_interface": return "dark";
    case "engagement_analytics":
    case "design_system": return "light-sidebar";
    case "requirements_matrix":
    case "comparison_evaluation": return "light-table";
    case "user_journey":
    case "service_blueprint": return "light-columns";
    case "workflow_process": return "light-flow";
    case "physical_product": return "light-product";
    default: return "light-cards";
  }
}

function SkeletonBlock({ d, w, h, r, op }: {
  d: boolean;
  w?: number | string;
  h?: number | string;
  r?: number | string;
  op?: number;
}) {
  return (
    <div
      className={d ? "__sk_block_dark" : "__sk_block_light"}
      style={{
        width: w ?? "100%",
        height: h ?? "100%",
        borderRadius: r ?? 6,
        opacity: op ?? 1,
        flexShrink: 0,
      }}
    />
  );
}

function ProgressBar({ progress, dark }: { progress: number; dark: boolean }) {
  return (
    <div style={{ height: "2px", background: dark ? "rgba(0,200,255,0.12)" : "rgba(0,119,200,0.1)", position: "relative", flexShrink: 0 }}>
      <div style={{
        position: "absolute", left: 0, top: 0, height: "100%",
        width: `${progress}%`,
        background: dark ? "linear-gradient(90deg,#0077C8,#00c8ff)" : "linear-gradient(90deg,#002A5C,#0077C8)",
        borderRadius: "0 2px 2px 0",
        transition: "width 0.6s ease",
        boxShadow: dark ? "0 0 8px rgba(0,200,255,0.6)" : "0 0 6px rgba(0,119,200,0.4)",
      }} />
    </div>
  );
}

function SkeletonLabel({ dark, label }: { dark: boolean; label: string }) {
  return (
    <div style={{
      position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
      fontSize: "0.67rem",
      color: dark ? "rgba(0,200,255,0.5)" : "rgba(0,42,92,0.4)",
      letterSpacing: "0.12em", fontFamily: "monospace", textTransform: "uppercase",
      animation: "__sk_pulse 1.8s ease-in-out infinite", whiteSpace: "nowrap",
    }}>
      ◈ {label}
    </div>
  );
}

function DarkSkeleton({ progress }: { progress: number }) {
  return (
    <>
      <ProgressBar progress={progress} dark />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{
          width: 56, background: "#080e1a",
          borderRight: "1px solid rgba(0,200,255,0.08)",
          flexShrink: 0, display: "flex", flexDirection: "column",
          alignItems: "center", padding: "14px 0", gap: 10,
        }}>
          <SkeletonBlock d w={28} h={28} r={6} />
          <div style={{ width: "80%", height: 1, background: "rgba(255,255,255,0.05)", margin: "4px 0" }} />
          {[...Array(5)].map((_, i) => (
            <SkeletonBlock key={i} d w={36} h={36} r={8} op={i === 0 ? 1 : 0.45} />
          ))}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{
            height: 48, background: "#080e1a",
            borderBottom: "1px solid rgba(0,200,255,0.08)",
            display: "flex", alignItems: "center", padding: "0 20px", gap: 14, flexShrink: 0,
          }}>
            <SkeletonBlock d w={120} h={14} r={4} />
            <SkeletonBlock d w={200} h={10} r={4} op={0.6} />
            <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
              <SkeletonBlock d w={22} h={22} r="50%" />
              <SkeletonBlock d w={80} h={22} r={4} />
            </div>
          </div>
          <div style={{
            height: 38, background: "#0d1421",
            borderBottom: "1px solid rgba(0,200,255,0.06)",
            display: "flex", alignItems: "flex-end", padding: "0 20px", flexShrink: 0,
          }}>
            {[68, 48, 52, 44].map((w, i) => (
              <div key={i} style={{ padding: "0 20px", height: 38, display: "flex", alignItems: "center", borderBottom: i === 0 ? "2px solid rgba(0,200,255,0.5)" : "none", marginBottom: i === 0 ? -1 : 0 }}>
                <SkeletonBlock d w={w} h={9} r={3} op={i === 0 ? 0.9 : 0.35} />
              </div>
            ))}
          </div>
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 12, padding: 14, overflow: "hidden" }}>
            <div className="__sk_block_dark" style={{ display: "flex", flexDirection: "column", padding: 14, border: "1px solid rgba(0,200,255,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <SkeletonBlock d w={14} h={14} r="50%" />
                <SkeletonBlock d w={140} h={9} r={3} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, flex: 1 }}>
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="__sk_block_dark" style={{ display: "flex", flexDirection: "column", padding: "10px 8px", gap: 6, border: "1px solid rgba(0,200,255,0.06)", borderRadius: 6 }}>
                    <SkeletonBlock d w="70%" h={7} r={3} op={0.5} />
                    <SkeletonBlock d w="90%" h={22} r={4} />
                    <SkeletonBlock d w="60%" h={6} r={3} op={0.4} />
                  </div>
                ))}
              </div>
            </div>
            <div className="__sk_block_dark" style={{ display: "flex", flexDirection: "column", padding: 14, border: "1px solid rgba(0,200,255,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <SkeletonBlock d w={120} h={9} r={3} />
                <SkeletonBlock d w={50} h={18} r={4} />
              </div>
              <div style={{ flex: 1, position: "relative" }}>
                {[...Array(3)].map((_, i) => (
                  <div key={i} style={{ position: "absolute", left: 0, right: 0, top: `${20 + i * 30}%`, height: 1, background: "rgba(0,200,255,0.05)" }} />
                ))}
                <svg width="100%" height="100%" viewBox="0 0 300 100" preserveAspectRatio="none" style={{ opacity: 0.25 }}>
                  <polyline points="0,70 50,55 100,62 150,35 200,44 250,28 300,32" fill="none" stroke="#00c8ff" strokeWidth="2" />
                  <polyline points="0,70 50,55 100,62 150,35 200,44 250,28 300,32 300,100 0,100" fill="rgba(0,200,255,0.06)" stroke="none" />
                </svg>
              </div>
            </div>
            <div className="__sk_block_dark" style={{ display: "flex", flexDirection: "column", padding: 14, border: "1px solid rgba(0,200,255,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <SkeletonBlock d w={100} h={9} r={3} />
              </div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                {[...Array(3)].map((_, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <SkeletonBlock d w={56} h={36} r={5} />
                    <SkeletonBlock d w={44} h={7} r={3} op={0.5} />
                  </div>
                ))}
              </div>
            </div>
            <div className="__sk_block_dark" style={{ display: "flex", flexDirection: "column", padding: 14, border: "1px solid rgba(0,200,255,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <SkeletonBlock d w={130} h={9} r={3} />
              </div>
              {[...Array(2)].map((_, i) => (
                <div key={i} className="__sk_block_dark" style={{ padding: 10, borderRadius: 6, marginBottom: 8, border: "1px solid rgba(0,200,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
                  <SkeletonBlock d w={36} h={36} r="50%" />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                    <SkeletonBlock d w="80%" h={7} r={3} op={0.5} />
                    <SkeletonBlock d w="60%" h={9} r={3} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <SkeletonLabel dark label="Generating visualization…" />
    </>
  );
}

function LightSidebarSkeleton({ progress }: { progress: number }) {
  return (
    <>
      <ProgressBar progress={progress} dark={false} />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ width: 200, background: "#F9FAFB", borderRight: "1px solid #E5E7EB", flexShrink: 0, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <SkeletonBlock d={false} w="60%" h={16} r={4} />
          <div style={{ height: 1, background: "#E5E7EB", margin: "4px 0" }} />
          {[...Array(5)].map((_, i) => (
            <SkeletonBlock key={i} d={false} w="80%" h={12} r={4} op={i === 0 ? 1 : 0.55} />
          ))}
          <div style={{ flex: 1 }} />
          <SkeletonBlock d={false} w="70%" h={10} r={4} op={0.4} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: 20, gap: 14 }}>
          <div style={{ display: "flex", gap: 12 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="__sk_block_light" style={{ flex: 1, borderRadius: 8, padding: 14, border: "1px solid #E5E7EB", display: "flex", flexDirection: "column", gap: 6 }}>
                <SkeletonBlock d={false} w="55%" h={9} r={3} op={0.6} />
                <SkeletonBlock d={false} w="75%" h={22} r={4} />
                <SkeletonBlock d={false} w="40%" h={8} r={3} op={0.4} />
              </div>
            ))}
          </div>
          <div className="__sk_block_light" style={{ flex: 1, borderRadius: 8, border: "1px solid #E5E7EB", padding: 14, display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
            <SkeletonBlock d={false} w={140} h={11} r={3} />
            <div style={{ flex: 1, position: "relative" }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ position: "absolute", left: 0, right: 0, bottom: `${i * 25}%`, height: 1, background: "#E5E7EB" }} />
              ))}
              <svg width="100%" height="100%" viewBox="0 0 300 100" preserveAspectRatio="none" style={{ opacity: 0.3 }}>
                <polyline points="0,80 60,60 120,65 180,38 240,45 300,22" fill="none" stroke="#0077C8" strokeWidth="2.5" />
                <polyline points="0,80 60,60 120,65 180,38 240,45 300,22 300,100 0,100" fill="rgba(0,119,200,0.07)" stroke="none" />
                <polyline points="0,90 60,75 120,80 180,68 240,72 300,55" fill="none" stroke="#002A5C" strokeWidth="1.5" strokeDasharray="4 3" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <SkeletonLabel dark={false} label="Building dashboard…" />
    </>
  );
}

function LightTableSkeleton({ progress }: { progress: number }) {
  return (
    <>
      <ProgressBar progress={progress} dark={false} />
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#002A5C", padding: "12px 20px", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
          <SkeletonBlock d w={160} h={14} r={4} />
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <SkeletonBlock d w={80} h={22} r={4} />
            <SkeletonBlock d w={60} h={22} r={4} />
          </div>
        </div>
        <div style={{ padding: "10px 16px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", flexShrink: 0, display: "flex", gap: 6 }}>
          {[...Array(5)].map((_, i) => (
            <SkeletonBlock key={i} d={false} w={i === 0 ? 36 : 72} h={24} r={12} op={i === 0 ? 0.9 : 0.5} />
          ))}
          <div style={{ marginLeft: "auto" }}>
            <SkeletonBlock d={false} w={180} h={24} r={6} />
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 100px 100px 100px 80px", gap: 0, background: "#F8FAFC", borderBottom: "2px solid #E5E7EB", padding: "8px 16px" }}>
            {[60, "100%", 80, 80, 80, 60].map((w, i) => (
              <SkeletonBlock key={i} d={false} w={w} h={10} r={3} op={0.7} />
            ))}
          </div>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 1fr 100px 100px 100px 80px", gap: 0, padding: "10px 16px", borderBottom: "1px solid #E5E7EB", background: i % 2 === 0 ? "#FFF" : "#F8FAFC" }}>
              <SkeletonBlock d={false} w={48} h={10} r={3} op={0.5} />
              <SkeletonBlock d={false} w="85%" h={10} r={3} op={0.6} />
              <SkeletonBlock d={false} w={60} h={18} r={9} op={0.55} />
              <SkeletonBlock d={false} w={56} h={10} r={3} op={0.5} />
              <SkeletonBlock d={false} w={60} h={18} r={9} op={0.5} />
              <SkeletonBlock d={false} w={36} h={20} r={4} op={0.45} />
            </div>
          ))}
        </div>
      </div>
      <SkeletonLabel dark={false} label="Building matrix…" />
    </>
  );
}

function LightColumnsSkeleton({ progress }: { progress: number }) {
  const cols = 5;
  return (
    <>
      <ProgressBar progress={progress} dark={false} />
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #E5E7EB", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <SkeletonBlock d={false} w={180} h={14} r={4} />
          <SkeletonBlock d={false} w={100} h={10} r={3} op={0.5} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, borderBottom: "2px solid #E5E7EB", flexShrink: 0 }}>
          {[...Array(cols)].map((_, i) => (
            <div key={i} style={{ padding: "12px 10px", textAlign: "center", borderLeft: i > 0 ? "1px solid #E5E7EB" : "none", borderBottom: i === 0 ? "3px solid #0077C8" : "none" }}>
              <SkeletonBlock d={false} w="60%" h={11} r={4} op={i === 0 ? 0.9 : 0.5} />
              <div style={{ marginTop: 4, display: "flex", justifyContent: "center" }}>
                <SkeletonBlock d={false} w={40} h={7} r={3} op={0.35} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {[...Array(4)].map((_, row) => (
            <div key={row} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, flex: 1, borderBottom: row < 3 ? "1px solid #E5E7EB" : "none" }}>
              {[...Array(cols)].map((_, col) => (
                <div key={col} style={{ padding: "8px 10px", borderLeft: col > 0 ? "1px solid #E5E7EB" : "none", display: "flex", flexDirection: "column", gap: 5 }}>
                  <SkeletonBlock d={false} w="80%" h={8} r={3} op={0.4 + col * 0.05} />
                  {row === 2 && col % 2 === 0 && (
                    <SkeletonBlock d={false} w="60%" h={18} r={4} op={0.35} />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <SkeletonLabel dark={false} label="Building journey map…" />
    </>
  );
}

function LightFlowSkeleton({ progress }: { progress: number }) {
  return (
    <>
      <ProgressBar progress={progress} dark={false} />
      <div style={{ flex: 1, overflow: "hidden", display: "flex", gap: 0 }}>
        <div style={{ flex: "0 0 65%", padding: 20, overflow: "hidden", display: "flex", flexDirection: "column", gap: 10 }}>
          <SkeletonBlock d={false} w={160} h={13} r={4} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-around", alignItems: "center" }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
                <div className="__sk_block_light" style={{ width: "55%", height: 36, borderRadius: 8, border: "1px solid #E5E7EB" }} />
                {i < 4 && <div style={{ width: 2, height: 16, background: "#CBD5E1", borderRadius: 1 }} />}
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: "0 0 35%", background: "#F8FAFC", borderLeft: "1px solid #E5E7EB", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <SkeletonBlock d={false} w="70%" h={11} r={3} op={0.6} />
          <div style={{ height: 1, background: "#E5E7EB" }} />
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <SkeletonBlock d={false} w={i === 0 ? "50%" : "35%"} h={9} r={3} op={0.5} />
              <SkeletonBlock d={false} w="85%" h={8} r={3} op={0.35} />
            </div>
          ))}
          <div style={{ marginTop: "auto" }}>
            <SkeletonBlock d={false} w={80} h={28} r={6} op={0.5} />
          </div>
        </div>
      </div>
      <SkeletonLabel dark={false} label="Building workflow…" />
    </>
  );
}

function LightCardsSkeleton({ progress }: { progress: number }) {
  return (
    <>
      <ProgressBar progress={progress} dark={false} />
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: 20, gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <SkeletonBlock d={false} w={200} h={18} r={4} />
          <SkeletonBlock d={false} w={120} h={11} r={3} op={0.5} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, flex: 1, overflow: "hidden" }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="__sk_block_light" style={{ borderRadius: 10, padding: 18, border: "1px solid #E5E7EB", display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <SkeletonBlock d={false} w={32} h={32} r="50%" />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <SkeletonBlock d={false} w="65%" h={11} r={3} />
                  <SkeletonBlock d={false} w="45%" h={8} r={3} op={0.5} />
                </div>
              </div>
              <div style={{ height: 1, background: "#E5E7EB" }} />
              {[...Array(3)].map((_, j) => (
                <SkeletonBlock key={j} d={false} w={`${85 - j * 10}%`} h={8} r={3} op={0.5 - j * 0.08} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <SkeletonLabel dark={false} label="Building visualization…" />
    </>
  );
}

function LightProductSkeleton({ progress }: { progress: number }) {
  return (
    <>
      <ProgressBar progress={progress} dark={false} />
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", padding: 24, gap: 16 }}>
        <SkeletonBlock d={false} w={180} h={16} r={4} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
          <div className="__sk_block_light" style={{ width: "min(55%, 300px)", aspectRatio: "1", borderRadius: "50%", border: "2px solid #E5E7EB" }} />
        </div>
        <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
          {[...Array(2)].map((_, i) => (
            <div key={i} className="__sk_block_light" style={{ width: 160, height: 48, borderRadius: 8, border: "1px solid #E5E7EB" }} />
          ))}
        </div>
      </div>
      <SkeletonLabel dark={false} label="Rendering product panel…" />
    </>
  );
}

function VizSkeleton({ progress, family }: { progress: number; family?: string | null }) {
  const variant = familyToVariant(family);
  const dark = variant === "dark";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: dark ? "#0d1421" : "#FFFFFF",
        borderRadius: "inherit",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        zIndex: 10,
      }}
    >
      <style>{`
        @keyframes __sk_shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes __sk_pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .__sk_block_dark {
          position: relative; overflow: hidden;
          background: #111827; border-radius: 6px;
        }
        .__sk_block_dark::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(0,200,255,0.07) 50%, transparent 100%);
          animation: __sk_shimmer 1.6s ease-in-out infinite;
        }
        .__sk_block_light {
          position: relative; overflow: hidden;
          background: #F3F4F6; border-radius: 6px;
        }
        .__sk_block_light::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(0,119,200,0.06) 50%, transparent 100%);
          animation: __sk_shimmer 1.8s ease-in-out infinite;
        }
      `}</style>

      {variant === "dark" && <DarkSkeleton progress={progress} />}
      {variant === "light-sidebar" && <LightSidebarSkeleton progress={progress} />}
      {variant === "light-table" && <LightTableSkeleton progress={progress} />}
      {variant === "light-columns" && <LightColumnsSkeleton progress={progress} />}
      {variant === "light-flow" && <LightFlowSkeleton progress={progress} />}
      {variant === "light-product" && <LightProductSkeleton progress={progress} />}
      {variant === "light-cards" && <LightCardsSkeleton progress={progress} />}
    </div>
  );
}

interface IframeRendererProps {
  html: string | null;
  className?: string;
  isStreaming?: boolean;
  roomId?: string | null;
  title?: string | null;
  context?: string | null;
  /** grundfos | gabriel | generic — passed to lazy tab fill API */
  workspaceDomain?: string | null;
  /** Resolved viz family — drives family-aware loading skeleton variant */
  pendingFamily?: string | null;
  /** Kaldes med screenshot af visualiseringen når brugeren klikker "Tegn på" */
  onAnnotate?: (screenshotDataUrl: string) => void;
}

export function IframeRenderer({
  html,
  className,
  isStreaming = false,
  roomId,
  title,
  context,
  workspaceDomain,
  pendingFamily,
  onAnnotate,
}: IframeRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const fillPendingRef = useRef(false);
  const originalHtmlRef = useRef<string | null>(null);
  const editHook = useIframeEdit(iframeRef);
  /** Stabil reference — editHook-objektet er nyt hver render og må ikke invalider writeHtmlToIframe. */
  const editHookRef = useRef(editHook);
  editHookRef.current = editHook;
  /** Seneste HTML fra props — læses i throttled interval under streaming */
  const pendingHtmlRef = useRef<string | null>(null);
  const streamFlushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStreamWrittenRef = useRef<string | null>(null);
  const lastCommittedHtmlRef = useRef<string | null>(null);

  const [skeletonProgress, setSkeletonProgress] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isStreaming) {
      setSkeletonProgress(5);
      let current = 5;
      progressTimerRef.current = setInterval(() => {
        const delta = (92 - current) * 0.045;
        current = Math.min(92, current + delta + 0.3);
        setSkeletonProgress(current);
      }, 400);
    } else {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      setSkeletonProgress(100);
      const t = setTimeout(() => setSkeletonProgress(0), 600);
      return () => clearTimeout(t);
    }
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [isStreaming]);

  pendingHtmlRef.current = html;

  const renderable = isHtmlRenderable(html);
  // Show skeleton during active streaming (generation) OR in idle empty state when a predicted family is provided
  const isEmpty = !html || html.trim() === "";
  const showSkeleton = (isStreaming && !renderable) || (!isStreaming && isEmpty && !!pendingFamily);

  function stripCodeFences(s: string): string {
    let t = s.trim();
    t = t.replace(/^```(?:html)?\s*\n?/, "");
    t = t.replace(/\n?```\s*$/, "");
    return t.trim();
  }

  function buildDocument(rawHtml: string): string {
    const t = stripCodeFences(rawHtml).trimStart();
    if (t.startsWith("<!DOCTYPE") || t.toLowerCase().startsWith("<html")) {
      return t.replace(/<\/body>/i,
        `<script>${VIZ_INTERACT_SCRIPT}<\/script></body>`);
    }
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; min-height: 100%; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #0d1421; color: #f8fafc; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
  </style>
</head>
<body>
${t}
<script>${VIZ_INTERACT_SCRIPT}<\/script>
</body>
</html>`;
  }

  const fillLazyTabs = useCallback(async (doc: Document) => {
    if (fillPendingRef.current) return;
    const host = doc.querySelector<HTMLElement>('[data-viz-host-tabs][data-viz-lazy-tabs="1"]');
    if (!host) return;
    const pending = Array.from(doc.querySelectorAll<HTMLElement>('[data-viz-tab-panel][data-viz-pending="1"]'));
    if (!pending.length) return;
    const tabs = pending
      .map(p => ({
        id:    p.getAttribute("data-viz-tab-panel")!,
        label: (p.getAttribute("data-viz-tab-label") || "").trim(),
      }))
      .filter(t => t.id != null);
    if (!tabs.length) return;

    const transcript = "";
    fillPendingRef.current = true;
    try {
      const res = await fetch(`${BASE}api/viz/fill-tab-panels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, roomId, title, context, tabs, workspaceDomain }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.panels || typeof data.panels !== "object") return;
      for (const [id, innerHtml] of Object.entries(data.panels)) {
        const safeId = String(id).replace(/["\\]/g, "");
        const panel = doc.querySelector<HTMLElement>(`[data-viz-tab-panel="${safeId}"]`);
        if (panel && innerHtml != null && String(innerHtml).trim() !== "") {
          panel.innerHTML = String(innerHtml);
          panel.removeAttribute("data-viz-pending");
        }
      }
    } catch {
      // silently fail
    } finally {
      fillPendingRef.current = false;
    }
  }, [roomId, title, context, workspaceDomain]);

  const writeHtmlToIframe = useCallback((rawHtml: string) => {
    if (!iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    originalHtmlRef.current = rawHtml;
    editHookRef.current.disable();
    setIsEditMode(false);
    fillPendingRef.current = false;
    doc.open();
    doc.write(buildDocument(rawHtml));
    doc.close();
  }, []);

  useEffect(() => {
    if (isStreaming) {
      lastStreamWrittenRef.current = null;
    }
  }, [isStreaming]);

  // Under streaming: throttled iframe-opdateringer (undgår blink ved hver chunk)
  useEffect(() => {
    if (!isStreaming || !renderable) {
      if (streamFlushIntervalRef.current) {
        clearInterval(streamFlushIntervalRef.current);
        streamFlushIntervalRef.current = null;
      }
      return;
    }

    const tick = () => {
      const h = pendingHtmlRef.current;
      if (!h || !isHtmlRenderable(h)) return;
      if (h === lastStreamWrittenRef.current) return;
      lastStreamWrittenRef.current = h;
      writeHtmlToIframe(h);
    };

    tick();
    streamFlushIntervalRef.current = setInterval(tick, STREAMING_IFRAME_THROTTLE_MS);

    return () => {
      if (streamFlushIntervalRef.current) {
        clearInterval(streamFlushIntervalRef.current);
        streamFlushIntervalRef.current = null;
      }
    };
  }, [isStreaming, renderable, writeHtmlToIframe]);

  // Når ikke streaming: ét fuldt skriv pr. færdig HTML (inkl. lazy tabs)
  useEffect(() => {
    if (isStreaming) return;
    if (!html || !renderable || !iframeRef.current) {
      if (!html) {
        lastCommittedHtmlRef.current = null;
      }
      return;
    }
    if (lastCommittedHtmlRef.current === html) {
      return;
    }
    lastCommittedHtmlRef.current = html;
    writeHtmlToIframe(html);

    setTimeout(() => {
      const d = iframeRef.current?.contentDocument;
      if (d) fillLazyTabs(d);
    }, 400);
  }, [html, renderable, isStreaming, fillLazyTabs, writeHtmlToIframe]);

  const toggleEditMode = useCallback(() => {
    const newMode = !isEditMode;
    setIsEditMode(newMode);
    if (newMode) {
      editHook.enable();
    } else {
      editHook.disable();
    }
  }, [isEditMode, editHook]);

  const handleReset = useCallback(() => {
    if (!originalHtmlRef.current || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    editHook.disable();
    setIsEditMode(false);
    doc.open();
    doc.write(buildDocument(originalHtmlRef.current));
    doc.close();

    if (!isStreaming) {
      setTimeout(() => {
        const d = iframeRef.current?.contentDocument;
        if (d) fillLazyTabs(d);
      }, 400);
    }
  }, [isStreaming, fillLazyTabs, editHook]);

  const handleAnnotate = useCallback(() => {
    if (!onAnnotate || !iframeRef.current) return;
    const iframeDoc = iframeRef.current.contentDocument;
    if (!iframeDoc) { onAnnotate(""); return; }
    // Send det fuldt renderede HTML-dokument direkte — ingen screenshot-capture
    // SketchModal renderer det i en baggrundsiframe i korrekt størrelse
    const html = iframeDoc.documentElement.outerHTML;
    onAnnotate(html || "");
  }, [onAnnotate]);

  return (
    <div className={cn(
      "relative group flex flex-col w-full h-full",
      isFullscreen
        ? "fixed inset-4 z-50 bg-card rounded-xl border-2 border-primary/50 shadow-2xl p-2"
        : className
    )}>
      {!isEmpty && !showSkeleton && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
          {onAnnotate && (
            <Button
              variant="outline"
              size="sm"
              disabled={isStreaming}
              className="h-7 gap-1.5 text-[10px] font-mono uppercase tracking-wider bg-background/90 border-primary/40 text-primary hover:text-primary-foreground hover:bg-primary backdrop-blur-sm"
              onClick={handleAnnotate}
              title="Åbn Excalidraw med visualiseringen som baggrund — tegn ændringer og annotationer"
            >
              <PenLine className="h-3 w-3" />
              Annotate
            </Button>
          )}

          <Button
            variant={isEditMode ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 gap-1.5 text-[10px] font-mono uppercase tracking-wider backdrop-blur-sm",
              isEditMode
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-background/90 border-border text-muted-foreground hover:text-foreground hover:bg-background"
            )}
            onClick={toggleEditMode}
          >
            <Pencil className="h-3 w-3" />
            {isEditMode ? "Editing" : "Edit"}
          </Button>

          {isEditMode && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[10px] font-mono uppercase tracking-wider bg-background/90 border-border text-muted-foreground hover:text-foreground hover:bg-background backdrop-blur-sm"
              onClick={handleReset}
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          )}

          <Button
            variant="outline"
            size="icon"
            className="w-7 h-7 bg-background/90 border-border backdrop-blur-sm text-muted-foreground hover:text-foreground hover:bg-background"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}

      {isEditMode && !isEmpty && !showSkeleton && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-primary/20 border border-primary/30 backdrop-blur-sm">
          <span className="text-[10px] font-mono text-primary tracking-wider uppercase">
            ✎ Edit · klik = præcis det element du rammer · dobbeltklik = tekst · træk = flyt · vælg farve i værktøjslinjen · Del = slet
          </span>
        </div>
      )}

      {isEmpty && !isStreaming && (
        <div className="flex-1 flex items-center justify-center rounded-lg border border-border bg-card/30">
          <div className="text-center space-y-4 text-muted-foreground p-8">
            <div className="w-16 h-16 mx-auto opacity-10 border-2 border-current rounded-xl flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-display">No Visualization Yet</p>
              <p className="text-xs mt-1 opacity-60">Start recording and click Visualize to generate</p>
            </div>
          </div>
        </div>
      )}

      {showSkeleton && (
        <div className="flex-1 relative rounded-lg border border-border overflow-hidden">
          <VizSkeleton progress={skeletonProgress} family={pendingFamily} />
        </div>
      )}

      {!isEmpty && (
        <div
          className={cn(
            "relative min-h-0 w-full",
            showSkeleton ? "absolute h-0 overflow-hidden opacity-0" : "flex-1 flex flex-col"
          )}
        >
          <iframe
            ref={iframeRef}
            className={cn(
              "w-full rounded-lg bg-card/20 border",
              showSkeleton ? "pointer-events-none h-0 min-h-0 shrink-0 opacity-0" : "min-h-0 flex-1",
              isEditMode ? "border-primary/40 ring-1 ring-primary/20" : "border-border"
            )}
            title="AI Visualization"
            style={{ pointerEvents: "auto" }}
          />
        </div>
      )}
    </div>
  );
}
