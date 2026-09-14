import { useEffect, useState } from "react";
import { motion } from "motion/react";

const EXAMPLES = [
  "https://github.com/expressjs/express",
  "https://github.com/pallets/flask",
  "https://github.com/sindresorhus/ky",
  "https://github.com/jashkenas/backbone",
];

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  error: string | null;
  disabled: boolean;
};

export function UrlForm({ value, onChange, onSubmit, error, disabled }: Props) {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setExampleIndex((i) => (i + 1) % EXAMPLES.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <form
      className="mx-auto w-full max-w-xl"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="repo-url" className="sr-only">
        GitHub repository URL
      </label>
      <motion.div
        animate={{
          boxShadow: focused
            ? "0 0 0 1px rgba(255,107,53,0.55), 0 18px 50px rgba(255,107,53,0.12)"
            : "0 0 0 1px rgba(255,255,255,0.08), 0 12px 40px rgba(0,0,0,0.35)",
        }}
        transition={{ duration: 0.22 }}
        className="relative overflow-hidden rounded-full bg-ink/80 backdrop-blur-md"
      >
        <input
          id="repo-url"
          name="repo-url"
          type="url"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={value}
          placeholder={EXAMPLES[exampleIndex]}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent px-6 py-4 pr-36 font-mono text-sm text-parchment outline-none placeholder:text-muted/50 disabled:opacity-60"
        />
        <motion.button
          type="submit"
          disabled={disabled}
          whileHover={disabled ? undefined : { scale: 1.03 }}
          whileTap={disabled ? undefined : { scale: 0.97 }}
          className="absolute right-1.5 top-1.5 rounded-full bg-ember px-5 py-2.5 text-sm font-medium text-void disabled:opacity-50"
        >
          Explain
        </motion.button>
      </motion.div>
      {error ? (
        <p role="alert" className="mt-3 px-2 text-sm text-ember">
          {error}
        </p>
      ) : (
        <p className="mt-3 px-2 text-sm text-muted">Paste any public GitHub URL. No login, no leftover data.</p>
      )}
    </form>
  );
}
