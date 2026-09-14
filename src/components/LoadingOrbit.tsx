import { motion } from "motion/react";

export const STAGES = [
  { id: "structure", label: "Fetching repo structure" },
  { id: "files", label: "Selecting source files" },
  { id: "analyze", label: "Analyzing architecture" },
  { id: "graph", label: "Building dependency graph" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export function LoadingOrbit({ stage }: { stage: StageId }) {
  const active = STAGES.findIndex((item) => item.id === stage);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-16 text-center">
      <div className="relative mb-10 h-40 w-40">
        <motion.span
          className="absolute inset-0 rounded-full border border-ember/30"
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        />
        <motion.span
          className="absolute inset-4 rounded-full border border-gold/25"
          animate={{ rotate: -360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        />
        <motion.span
          className="absolute inset-[22%] rounded-full bg-ember/20"
          animate={{ scale: [0.92, 1.04, 0.92], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="absolute inset-0 grid place-items-center font-mono text-[10px] uppercase tracking-[0.3em] text-gold">
          mapping
        </span>
      </div>
      <ol className="w-full space-y-3 text-left">
        {STAGES.map((item, index) => {
          const state = index < active ? "done" : index === active ? "active" : "todo";
          return (
            <li key={item.id} className="flex items-center gap-3">
              <span
                className={
                  state === "done"
                    ? "h-2 w-2 rounded-full bg-teal"
                    : state === "active"
                      ? "h-2 w-2 rounded-full bg-ember shadow-[0_0_12px_#ff6b35]"
                      : "h-2 w-2 rounded-full bg-white/15"
                }
              />
              <span className={state === "todo" ? "text-muted" : "text-parchment"}>{item.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
