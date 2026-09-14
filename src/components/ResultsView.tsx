import { useRef, useState } from "react";
import { motion } from "motion/react";
import type { AnalyzeSuccess } from "../../shared/types";
import { downloadBriefingPdf } from "../lib/pdf";
import { DependencyGraph, type GraphHandle } from "./DependencyGraph";

type Props = {
  result: AnalyzeSuccess;
  reduced: boolean;
  onReset: () => void;
};

export function ResultsView({ result, reduced, onReset }: Props) {
  const graphRef = useRef<GraphHandle>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const handlePdf = async () => {
    setPdfError(null);
    setPdfBusy(true);
    try {
      await downloadBriefingPdf({
        repoName: result.repoName,
        repoUrl: result.repoUrl,
        tagline: result.tagline,
        summary: result.architectureSummary,
        components: result.components,
        languages: result.languages,
        sampled: result.sampled,
        sampleNote: result.sampleNote,
        monorepo: result.monorepo,
        graph: graphRef.current?.snapshot() ?? null,
      });
    } catch {
      setPdfError("The PDF could not be created. Try again, or screenshot the summary.");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-8">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-mono text-[11px] uppercase tracking-[0.28em] text-gold"
          >
            {result.owner}/{result.repo}
          </motion.p>
          <motion.h2
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduced ? 0 : 0.08, duration: 0.45 }}
            className="mt-2 max-w-3xl font-display text-4xl italic leading-[1.1] text-parchment sm:text-6xl"
          >
            {result.repoName}
          </motion.h2>
          <motion.p
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.18 }}
            className="mt-4 max-w-2xl text-lg text-muted"
          >
            {result.tagline}
          </motion.p>
        </div>
        <div className="flex gap-2">
          <motion.button
            type="button"
            onClick={onReset}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-parchment"
          >
            New repo
          </motion.button>
          <motion.button
            type="button"
            onClick={handlePdf}
            disabled={pdfBusy}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="rounded-full bg-ember px-4 py-2 text-sm font-medium text-void disabled:opacity-60"
          >
            {pdfBusy ? "Preparing PDF…" : "Download PDF"}
          </motion.button>
        </div>
      </div>
      {pdfError ? (
        <p role="alert" className="mb-6 text-sm text-ember">
          {pdfError}
        </p>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {result.languages.map((lang) => (
          <span key={lang} className="rounded-full border border-white/10 px-3 py-1 font-mono text-xs text-gold">
            {lang}
          </span>
        ))}
        {result.monorepo.isMonorepo ? (
          <span className="rounded-full border border-teal/40 px-3 py-1 font-mono text-xs text-teal">monorepo</span>
        ) : null}
        {result.sampled ? (
          <span className="rounded-full border border-ember/40 px-3 py-1 font-mono text-xs text-ember">sampled</span>
        ) : null}
      </div>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div>
          <motion.section
            initial={reduced ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: reduced ? 0 : 0.12 }}
          >
            <h3 className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">Architecture</h3>
            <div className="mt-4 space-y-5 text-[1.05rem] leading-8 text-parchment/90">
              {result.architectureSummary.map((para) => (
                <p key={para.slice(0, 24)}>{para}</p>
              ))}
            </div>
            {result.sampled && result.sampleNote ? (
              <p className="mt-6 border-l border-gold/40 pl-4 text-sm italic text-muted">{result.sampleNote}</p>
            ) : null}
            {result.monorepo.isMonorepo && result.monorepo.projects.length > 0 ? (
              <p className="mt-4 text-sm text-muted">
                Distinct projects: {result.monorepo.projects.join(", ")}
              </p>
            ) : null}
          </motion.section>

          {result.components.length > 0 ? (
            <motion.section
              initial={reduced ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: reduced ? 0 : 0.22 }}
              className="mt-12"
            >
              <h3 className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">Key modules</h3>
              <ul className="mt-5 space-y-5">
                {result.components.map((component, index) => (
                  <motion.li
                    key={component.name}
                    initial={reduced ? false : { opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reduced ? 0 : 0.26 + index * 0.05, duration: 0.28 }}
                  >
                    <p className="font-medium text-gold">{component.name}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{component.responsibility}</p>
                  </motion.li>
                ))}
              </ul>
            </motion.section>
          ) : null}
        </div>

        <motion.section
          initial={reduced ? false : { opacity: 0, scale: 0.98, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, delay: reduced ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.28em] text-muted">Dependency graph</h3>
          {result.graph ? (
            <>
              <DependencyGraph
                ref={graphRef}
                nodes={result.graph.nodes}
                edges={result.graph.edges}
                reduced={reduced}
              />
              {result.graph.clustered ? (
                <p className="mt-3 text-sm text-muted">
                  Showing the most significant modules so the map stays readable.
                </p>
              ) : null}
            </>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-ink/50 p-8 text-muted">
              The model did not return a usable graph, so only the written briefing is shown.
            </div>
          )}
        </motion.section>
      </div>
    </div>
  );
}
