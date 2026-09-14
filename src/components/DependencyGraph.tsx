import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import type { GraphEdge, GraphNode } from "../../shared/types";
import type { GraphSnapshot } from "../lib/pdf";

type SimNode = SimulationNodeDatum & GraphNode & { r: number };
type SimLink = SimulationLinkDatum<SimNode> & { relation: string };

const GROUP_FILL: Record<string, string> = {
  app: "#ff6b35",
  api: "#3dcdc0",
  core: "#e8c47c",
  ui: "#e8c47c",
  data: "#7da8e8",
  infra: "#b48c78",
  tooling: "#9a8f7c",
};

function fillFor(group: string) {
  return GROUP_FILL[group] ?? "#ff6b35";
}

export type GraphHandle = {
  snapshot: () => GraphSnapshot | null;
};

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  reduced: boolean;
  ref?: Ref<GraphHandle>;
};

export function DependencyGraph({ nodes, edges, reduced, ref }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const [layout, setLayout] = useState<{ nodes: SimNode[]; links: SimLink[] }>({ nodes: [], links: [] });
  const [hover, setHover] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{
    mode: "pan" | "node";
    id?: string;
    sx: number;
    sy: number;
    x: number;
    y: number;
  } | null>(null);
  const glowId = useId();

  const connected = useMemo(() => {
    if (!hover) return null;
    const set = new Set<string>([hover]);
    for (const edge of edges) {
      if (edge.source === hover) set.add(edge.target);
      if (edge.target === hover) set.add(edge.source);
    }
    return set;
  }, [edges, hover]);

  useImperativeHandle(ref, () => ({
    snapshot: () => {
      const svg = svgRef.current;
      if (!svg || layout.nodes.length === 0) return null;
      const width = svg.clientWidth || 800;
      const height = svg.clientHeight || 520;
      return {
        width,
        height,
        nodes: layout.nodes.map((n) => ({
          x: n.x ?? 0,
          y: n.y ?? 0,
          label: n.label,
          group: n.group,
          r: n.r,
        })),
        edges: layout.links.map((l) => {
          const s = l.source as SimNode;
          const t = l.target as SimNode;
          return { x1: s.x ?? 0, y1: s.y ?? 0, x2: t.x ?? 0, y2: t.y ?? 0 };
        }),
      };
    },
  }));

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const width = svg.clientWidth || 800;
    const height = svg.clientHeight || 520;

    const simNodes: SimNode[] = nodes.map((node) => ({
      ...node,
      r: 8 + Math.min(10, node.importance),
      x: width / 2 + (Math.random() - 0.5) * 80,
      y: height / 2 + (Math.random() - 0.5) * 80,
    }));
    const byId = new Map(simNodes.map((n) => [n.id, n]));
    const simLinks: SimLink[] = edges
      .filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, relation: e.relation }));

    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(86)
          .strength(0.45),
      )
      .force("charge", forceManyBody().strength(-240))
      .force("center", forceCenter(width / 2, height / 2))
      .force(
        "collide",
        forceCollide<SimNode>().radius((d) => d.r + 14),
      )
      .alpha(0.9)
      .alphaDecay(reduced ? 0.08 : 0.028);

    simRef.current = simulation;
    const onTick = () => {
      setLayout({
        nodes: simNodes.map((n) => ({ ...n })),
        links: simLinks.slice(),
      });
    };
    simulation.on("tick", onTick);

    let jitter = 0;
    if (!reduced) {
      jitter = window.setInterval(() => {
        simulation.alpha(0.06).restart();
      }, 2400);
    }

    return () => {
      simulation.stop();
      if (jitter) window.clearInterval(jitter);
    };
  }, [nodes, edges, reduced]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      setTransform((prev) => {
        const nextK = Math.min(3, Math.max(0.4, prev.k * (event.deltaY < 0 ? 1.08 : 0.92)));
        const kRatio = nextK / prev.k;
        return {
          k: nextK,
          x: mx - (mx - prev.x) * kRatio,
          y: my - (my - prev.y) * kRatio,
        };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const target = event.target as SVGElement;
    const id = target.dataset.nodeId;
    (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
    if (id) {
      drag.current = { mode: "node", id, sx: event.clientX, sy: event.clientY, x: transform.x, y: transform.y };
      const node = simRef.current?.nodes().find((n) => n.id === id);
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
      }
    } else {
      drag.current = { mode: "pan", sx: event.clientX, sy: event.clientY, x: transform.x, y: transform.y };
    }
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    if (drag.current.mode === "pan") {
      setTransform((prev) => ({
        ...prev,
        x: drag.current!.x + (event.clientX - drag.current!.sx),
        y: drag.current!.y + (event.clientY - drag.current!.sy),
      }));
      return;
    }
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left - transform.x) / transform.k;
    const y = (event.clientY - rect.top - transform.y) / transform.k;
    const node = simRef.current?.nodes().find((n) => n.id === drag.current?.id);
    if (node) {
      node.fx = x;
      node.fy = y;
      simRef.current?.alpha(0.2).restart();
    }
  };

  const onPointerUp = () => {
    if (drag.current?.mode === "node") {
      const node = simRef.current?.nodes().find((n) => n.id === drag.current?.id);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
    }
    drag.current = null;
  };

  return (
    <div className="relative h-[min(68vh,560px)] w-full overflow-hidden rounded-3xl border border-white/10 bg-ink/60">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        role="img"
        aria-label="Interactive module dependency graph"
      >
        <defs>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          {layout.links.map((link, index) => {
            const s = link.source as SimNode;
            const t = link.target as SimNode;
            const active = !connected || (connected.has(s.id) && connected.has(t.id));
            return (
              <line
                key={`${s.id}-${t.id}-${index}`}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke={active ? "rgba(232,196,124,0.55)" : "rgba(255,255,255,0.05)"}
                strokeWidth={active ? 1.4 : 0.8}
              />
            );
          })}
          {layout.nodes.map((node, index) => {
            const active = !connected || connected.has(node.id);
            const dim = connected && !connected.has(node.id);
            return (
              <g
                key={node.id}
                transform={`translate(${node.x ?? 0} ${node.y ?? 0})`}
                opacity={dim ? 0.18 : 1}
                style={{ transition: "opacity 180ms ease" }}
              >
                <circle
                  r={node.r}
                  fill={fillFor(node.group)}
                  data-node-id={node.id}
                  filter={active ? `url(#${glowId})` : undefined}
                  onPointerEnter={() => setHover(node.id)}
                  onPointerLeave={() => setHover(null)}
                  className="cursor-pointer"
                  style={{
                    transformOrigin: "center",
                    animation: reduced ? undefined : `node-in 520ms ${Math.min(index * 40, 600)}ms both`,
                  }}
                />
                <text
                  x={node.r + 6}
                  y={4}
                  fill="#efe6d6"
                  fontSize={11}
                  className="pointer-events-none select-none"
                  style={{ fontFamily: "Outfit Variable, sans-serif" }}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <p className="pointer-events-none absolute bottom-3 left-4 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        Drag to pan · scroll to zoom · hover to isolate
      </p>
    </div>
  );
}
