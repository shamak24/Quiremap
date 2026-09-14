import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { AnalyzeSuccess } from "../shared/types";
import { requestAnalysis, requestAnalysisFromUrl } from "./lib/analyzeClient";
import { readCache, writeCache } from "./lib/cache";
import { collectRepoForAnalysis, GithubError } from "./lib/github";
import { parseGitHubRepoUrl } from "./lib/parseUrl";
import { BackgroundField } from "./components/BackgroundField";
import { LoadingOrbit, type StageId } from "./components/LoadingOrbit";
import { ResultsView } from "./components/ResultsView";
import { UrlForm } from "./components/UrlForm";

type Screen = "landing" | "loading" | "results";

export default function App() {
  const prefersReduced = useReducedMotion();
  const reduced = Boolean(prefersReduced);
  const [url, setUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("landing");
  const [stage, setStage] = useState<StageId>("structure");
  const [result, setResult] = useState<AnalyzeSuccess | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const heroTransition = useMemo(
    () => (reduced ? { duration: 0 } : { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const }),
    [reduced],
  );

  const run = async () => {
    const parsed = parseGitHubRepoUrl(url);
    if (!parsed) {
      setFormError("Use a full GitHub repo URL, like https://github.com/expressjs/express");
      return;
    }
    setFormError(null);

    const cached = readCache(parsed.owner, parsed.repo);
    if (cached) {
      setResult(cached);
      setScreen("results");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setScreen("loading");
    setStage("structure");
    try {
      let analysis: AnalyzeSuccess;
      try {
        const payload = await collectRepoForAnalysis(url, {
          signal: controller.signal,
          onStage: (next) => setStage(next),
        });
        setStage("analyze");
        analysis = await requestAnalysis(payload, controller.signal);
      } catch (error) {
        if (error instanceof GithubError && error.code === "RATE_LIMIT") {
          setStage("files");
          analysis = await requestAnalysisFromUrl(parsed.url, controller.signal);
        } else {
          throw error;
        }
      }
      if (controller.signal.aborted) return;
      setStage("graph");
      await new Promise((resolve) => window.setTimeout(resolve, reduced ? 0 : 420));
      if (controller.signal.aborted) return;
      writeCache(analysis);
      setResult(analysis);
      setScreen("results");
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof GithubError) {
        setFormError(error.message);
      } else if (error instanceof Error) {
        setFormError(error.message);
      } else {
        setFormError("Something went wrong while explaining this repository.");
      }
      setScreen("landing");
    }
  };

  return (
    <div className="relative min-h-dvh text-parchment">
      <BackgroundField reduced={reduced} />
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-gold">Atlas of source</p>
        <a
          className="text-sm text-muted transition-colors duration-200 hover:text-parchment"
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
        >
          Public repos only
        </a>
      </header>

      <AnimatePresence mode="wait">
        {screen !== "results" ? (
          <motion.main
            key="landing"
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -40, filter: "blur(8px)" }}
            transition={heroTransition}
            className="mx-auto flex min-h-[calc(100dvh-88px)] max-w-5xl flex-col items-center justify-center px-6 pb-24 text-center"
          >
            {screen === "landing" ? (
              <>
                <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-ember">Explain this codebase</p>
                <h1 className="mt-5 max-w-4xl font-display text-5xl italic leading-[0.95] sm:text-7xl md:text-8xl">
                  See the shape of any codebase.
                </h1>
                <p className="mt-6 max-w-xl text-lg text-muted">
                  Paste a GitHub URL. Get a one-page architecture briefing and a living map of how the pieces connect.
                </p>
                <div className="mt-10 w-full">
                  <UrlForm
                    value={url}
                    onChange={(value) => {
                      setUrl(value);
                      if (formError) setFormError(null);
                    }}
                    onSubmit={run}
                    error={formError}
                    disabled={false}
                  />
                </div>
              </>
            ) : (
              <LoadingOrbit stage={stage} />
            )}
          </motion.main>
        ) : result ? (
          <motion.main
            key="results"
            initial={reduced ? false : { opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            transition={heroTransition}
          >
            <ResultsView
              result={result}
              reduced={reduced}
              onReset={() => {
                abortRef.current?.abort();
                setResult(null);
                setScreen("landing");
              }}
            />
          </motion.main>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
