/**
 * The first account becomes the administrator. A production install must
 * require the host's BOOTSTRAP_TOKEN so an exposed fresh instance cannot be
 * claimed by the first visitor. Development and tests may start without it.
 */
export interface BootstrapPolicy {
  bootstrap: boolean;
  tokenConfigured: boolean;
  tokenRequired: boolean;
  canRegister: boolean;
}

export function bootstrapPolicy(options: {
  userCount: number;
  token?: string | null;
  nodeEnv?: string | null;
}): BootstrapPolicy {
  const bootstrap = options.userCount === 0;
  const tokenConfigured = Boolean((options.token ?? "").trim());
  const production = options.nodeEnv === "production";
  return {
    bootstrap,
    tokenConfigured,
    tokenRequired: bootstrap && (tokenConfigured || production),
    canRegister: !bootstrap || tokenConfigured || !production,
  };
}
