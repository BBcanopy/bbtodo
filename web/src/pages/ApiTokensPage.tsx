import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import { formatDate, formatDateTime, itemStyle } from "../app/utils";
import { EmptyState, ErrorBanner, TokenListSkeleton } from "../components/ui";

export function ApiTokensPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const tokensQuery = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => api.listApiTokens()
  });

  const createTokenMutation = useMutation({
    mutationFn: (tokenName: string) => api.createApiToken(tokenName),
    onSuccess: async (response) => {
      setName("");
      setRevealedToken(response.token);
      await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    }
  });

  const deleteTokenMutation = useMutation({
    mutationFn: (tokenId: string) => api.deleteApiToken(tokenId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    }
  });

  const tokenCount = tokensQuery.data?.length ?? 0;

  return (
    <main className="page-shell">
      <title>API Tokens | BBTodo</title>
      <section className="page-header">
        <div className="page-header__copy">
          <h1 className="page-title">API tokens</h1>
        </div>
        <div className="page-header__meta">
          <span className="label-chip">{tokenCount} active</span>
        </div>
      </section>

      <section className="surface-strip">
        <form
          className="compose-form"
          onSubmit={(event) => {
            event.preventDefault();
            createTokenMutation.mutate(name.trim());
          }}
        >
          <label className="field">
            <span className="field__label">Token name</span>
            <input
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ops sync script"
              required
              value={name}
            />
          </label>
          <button className="primary-button" disabled={createTokenMutation.isPending || name.trim().length === 0} type="submit">
            {createTokenMutation.isPending ? "Creating token..." : "Create token"}
          </button>
        </form>
      </section>

      {tokensQuery.error ? <ErrorBanner error={tokensQuery.error} /> : null}
      {createTokenMutation.error ? <ErrorBanner error={createTokenMutation.error} /> : null}
      {deleteTokenMutation.error ? <ErrorBanner error={deleteTokenMutation.error} /> : null}

      {revealedToken ? (
        <section className="token-reveal">
          <div className="token-reveal__copy">
            <p className="eyebrow">Copy now</p>
            <h2>This token will not be shown again.</h2>
            <p className="lead-copy">Store it in your CLI config or secret manager before leaving this page.</p>
          </div>
          <code>{revealedToken}</code>
        </section>
      ) : null}

      {tokensQuery.isPending ? <TokenListSkeleton /> : null}

      {!tokensQuery.isPending && tokensQuery.data && tokensQuery.data.length === 0 ? (
        <EmptyState eyebrow="No tokens" title="You have not issued any API tokens yet." />
      ) : null}

      {!tokensQuery.isPending && tokensQuery.data && tokensQuery.data.length > 0 ? (
        <section className="token-list">
          {tokensQuery.data.map((token, index) => (
            <article className="token-row" key={token.id} style={itemStyle(index)}>
              <div className="token-row__copy">
                <div className="token-row__meta">
                  <span className="label-chip label-chip--soft">Created {formatDate(token.createdAt)}</span>
                  <span className="token-row__timestamp">
                    Last used {token.lastUsedAt ? formatDateTime(token.lastUsedAt) : "never"}
                  </span>
                </div>
                <h2>{token.name}</h2>
              </div>
              <button className="text-button danger-button" onClick={() => deleteTokenMutation.mutate(token.id)} type="button">
                Revoke
              </button>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
