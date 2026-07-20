export type ServerCliOptions = {
  dangerouslyAutoApprove?: boolean;
  debug?: boolean;
  sharedAppServer?: boolean;
};

export function applyServerCliEnvironment(
  options: ServerCliOptions,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (options.debug) {
    env.CODEX_RELAY_DEBUG = "1";
  }
  if (options.dangerouslyAutoApprove) {
    env.CODEX_RELAY_DANGEROUSLY_AUTO_APPROVE = "1";
  }
  if (options.sharedAppServer) {
    env.CODEX_RELAY_APP_SERVER_MODE = "socket";
  }
}
