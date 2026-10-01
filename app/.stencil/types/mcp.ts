/** What the OAuth consent page renders, once its loader has resolved the client. */
export type ConsentLoaderData =
  | { ok: false }
  | {
      ok: true;
      consentCode: string;
      clientName: string;
      hosts: string[];
      scopes: string[];
    };
