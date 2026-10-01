import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { handleRecoverableError } from "~stencil/ui/hydration";

// React Router's default client entry, plus onRecoverableError. React's own
// default rethrows recoverable errors so they surface as bare, minified window
// errors with no component stack — leaving a hydration mismatch (#418)
// impossible to locate. Ours forwards the component stack instead, and stops
// the rethrow that made a recovered render look like a crash.
startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
    { onRecoverableError: handleRecoverableError },
  );
});
