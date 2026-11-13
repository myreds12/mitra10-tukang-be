# AI Agent

The API is restricted to active Admin HO / Super User accounts with the active CASL `read` permission on the `AI Agent` menu. Apply the `20261113_ai_agent` migration and generate the Prisma client before starting the server. The migration creates that permission and grants it to existing roles with those names.

Configure `AI_ANTHROPIC_API_KEY` on the backend only, and use `AI_AGENT_ENABLED=true`. The health endpoint indicates that a value exists, not that Anthropic has authenticated it. Never commit a key. `AI_ANTHROPIC_BASE_URL` must be trusted: the server sends its API key to this URL.

Confirm actual order status IDs before setting `AI_AGENT_STATUS_IDS_CONFIRMED=true` and `AI_AGENT_COMPLETED_STATUS_IDS` / `AI_AGENT_CANCELLED_STATUS_IDS`. Until then the corresponding counts are null. Order value includes all statuses. Work durations and start-hour patterns cover at most 20,000 records, and return `terpotong` when that limit is exceeded. There is currently no verified mapping from work orders to service types, nor a verified way to calculate CSI scores from `csi_answers.data`.

Only fixed aggregation tools are available. Prompts and answers are retained in the conversation tables, and prompts are sent to Anthropic: users must avoid entering personal information. Tool audit logs contain only validated date parameters and a generic result digest, not the results. Claude can still make mistakes and its answers must be checked.

The daily limit is per user and resets at midnight UTC. Before each Messages request the service uses the token-counting endpoint, or a conservative byte-based estimate when `AI_TOKEN_COUNT_MODE=conservative`, and reserves the estimate plus 10% and the maximum output. Actual reported usage replaces the reservation after a successful response; a failed request keeps the reservation because upstream usage is unknown. Token counts are estimates, so the limit is an operational control, not a guaranteed billing cap. Serializable reservations can fail under contention; clients should retry. There is no separate request-rate limiter.
