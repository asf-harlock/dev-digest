import type { ConnTestProvider } from "../../../../../../../lib/types";

/** One configurable provider key row in the API Keys section. */
export interface KeyRowSpec {
  provider: ConnTestProvider;
  labelKey: string;
  hintKey: string;
  /**
   * "secret" (default): a password-masked API key/PAT.
   * "url": a plain-text base URL — used by the keyless local providers,
   * which persist through the same field but store a URL, not a secret.
   */
  mode?: "secret" | "url";
  /** "url" rows only: the default base URL used when none is saved. */
  defaultUrl?: string;
}

/** The provider key rows shown in API Keys. */
export const KEY_ROWS: readonly KeyRowSpec[] = [
  { provider: "openai", labelKey: "apiKeys.openaiLabel", hintKey: "apiKeys.openaiHint" },
  { provider: "anthropic", labelKey: "apiKeys.anthropicLabel", hintKey: "apiKeys.anthropicHint" },
  { provider: "openrouter", labelKey: "apiKeys.openrouterLabel", hintKey: "apiKeys.openrouterHint" },
  {
    provider: "ollama",
    labelKey: "apiKeys.ollamaLabel",
    hintKey: "apiKeys.ollamaHint",
    mode: "url",
    defaultUrl: "http://localhost:11434/v1",
  },
  {
    provider: "lmstudio",
    labelKey: "apiKeys.lmstudioLabel",
    hintKey: "apiKeys.lmstudioHint",
    mode: "url",
    defaultUrl: "http://localhost:1234/v1",
  },
  { provider: "github", labelKey: "apiKeys.githubLabel", hintKey: "apiKeys.githubHint" },
];
