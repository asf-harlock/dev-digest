import { parse, stringify } from 'yaml';
import { AgentManifest, type CiFailOn, type Provider, type ReviewStrategy } from '@devdigest/shared';
import { MANIFEST_DIR, MANIFEST_ERROR_INVALID, SKILLS_DIR } from './constants.js';
import { ValidationError } from '../../platform/errors.js';

/**
 * `.devdigest/agents/<slug>.yaml` (AC-28, AC-29) — the file the agent-runner
 * reads and validates with the same `AgentManifest` contract.
 *
 * The agent's text (name, prompt) only ever travels as a YAML scalar produced
 * by the serializer (UI-1, NFR-6); it is never part of a path.
 */

/** The agent fields the manifest is built from. */
export interface ManifestAgent {
  name: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  strategy: ReviewStrategy;
  ci_fail_on: CiFailOn;
}

export function manifestPath(slug: string): string {
  return `${MANIFEST_DIR}/${slug}.yaml`;
}

export function skillPath(slug: string): string {
  return `${SKILLS_DIR}/${slug}.md`;
}

/**
 * Serialise the manifest. `skillSlugs` are the enabled skills' slugs in link
 * order. The serialised text is parsed back and validated against
 * `AgentManifest`; a manifest that would not validate throws a 422 before
 * anything is written anywhere (EC-5).
 */
export function buildManifestYaml(agent: ManifestAgent, skillSlugs: readonly string[]): string {
  const text = stringify(
    {
      name: agent.name,
      provider: agent.provider,
      model: agent.model,
      system_prompt: agent.system_prompt,
      skills: [...skillSlugs],
      strategy: agent.strategy,
      ci_fail_on: agent.ci_fail_on,
    },
    { lineWidth: 0 },
  );

  const result = AgentManifest.safeParse(parse(text));
  if (
    result.success &&
    (result.data.name !== agent.name || result.data.system_prompt !== agent.system_prompt)
  ) {
    // The serializer must hand the runner exactly the text the user authored.
    throw new ValidationError(`${MANIFEST_ERROR_INVALID}: text does not round-trip`);
  }
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new ValidationError(`${MANIFEST_ERROR_INVALID}: ${issues}`);
  }
  return text;
}
