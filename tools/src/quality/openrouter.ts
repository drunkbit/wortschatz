/**
 * Minimaler Client für die OpenRouter-Chat-Completion-API.
 *
 * Bewusst ohne SDK: Node bringt fetch mit, und so bleiben die
 * Abhängigkeiten des Tools überschaubar.
 */

export interface ChatMessage {
    role: "system" | "user";
    content: string;
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    /** Anteil der Ausgabe-Tokens, den das Modell fürs Reasoning verbraucht hat. */
    reasoningTokens: number;
}

export interface ChatCompletion {
    content: string;
    model: string;
    usage: TokenUsage | null;
    /** "stop" = vollständig, "length" = durch max_tokens abgeschnitten. */
    finishReason: string | null;
}

/**
 * Steuerung für Reasoning-Modelle (OpenRouter-Parameter `reasoning`).
 * `auto` sendet keinen Parameter und überlässt die Entscheidung dem Modell.
 */
export type ReasoningMode = "auto" | "off" | "low" | "medium" | "high";

export interface OpenRouterConfig {
    apiKey: string;
    model: string;
    baseUrl?: string;
    appUrl?: string;
    appTitle?: string;
    timeoutMs?: number;
    reasoning?: ReasoningMode;
}

export class OpenRouterError extends Error {
    constructor(
        message: string,
        readonly status: number | null,
        readonly retryable: boolean,
        readonly retryAfterMs: number | null = null,
    ) {
        super(message);
        this.name = "OpenRouterError";
    }
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 120_000;

export async function createChatCompletion(
    messages: ChatMessage[],
    config: OpenRouterConfig,
    maxTokens: number,
): Promise<ChatCompletion> {
    const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const reasoning = reasoningParam(config.reasoning);

    let response: Response;
    try {
        response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer":
                    config.appUrl ??
                    "https://github.com/drunkbit/wortschatz",
                "X-Title": config.appTitle ?? "Wortschatz Qualitätsprüfung",
            },
            body: JSON.stringify({
                model: config.model,
                messages,
                temperature: 0,
                max_tokens: maxTokens,
                ...(reasoning ? { reasoning } : {}),
            }),
            signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : String(error);
        throw new OpenRouterError(`Netzwerkfehler: ${message}`, null, true);
    }

    if (!response.ok) {
        const body = await readErrorBody(response);
        const retryable = response.status === 429 || response.status >= 500;
        throw new OpenRouterError(
            `OpenRouter antwortete mit HTTP ${response.status}${body ? `: ${body}` : ""}`,
            response.status,
            retryable,
            parseRetryAfterMs(response),
        );
    }

    const data: unknown = await response.json().catch(() => null);
    if (!data || typeof data !== "object") {
        throw new OpenRouterError(
            "OpenRouter lieferte keine gültige JSON-Antwort.",
            response.status,
            true,
        );
    }

    const payload = data as {
        model?: unknown;
        choices?: Array<{
            message?: { content?: unknown; reasoning?: unknown };
            finish_reason?: unknown;
        }>;
        usage?: {
            prompt_tokens?: unknown;
            completion_tokens?: unknown;
            total_tokens?: unknown;
            completion_tokens_details?: { reasoning_tokens?: unknown };
        };
    };

    const choice = payload.choices?.[0];
    const usage = normalizeUsage(payload.usage);
    const content = normalizeContent(choice?.message?.content);
    const finishReason =
        typeof choice?.finish_reason === "string"
            ? choice.finish_reason
            : null;

    if (!content) {
        throw emptyResponseError(
            response.status,
            finishReason,
            usage,
            normalizeContent(choice?.message?.reasoning),
        );
    }

    return {
        content,
        model: typeof payload.model === "string" ? payload.model : config.model,
        usage,
        finishReason,
    };
}

/**
 * Reasoning-Modelle verbrauchen ihr Ausgabebudget zuerst fürs Denken und
 * liefern dann leeren Inhalt. Solche Antworten enthalten Diagnosewerte,
 * damit klar ist, ob das Budget oder das Modell das Problem ist.
 */
function emptyResponseError(
    status: number,
    finishReason: string | null,
    usage: TokenUsage | null,
    reasoning: string,
): OpenRouterError {
    const details = [
        `finish_reason=${finishReason ?? "unbekannt"}`,
        `Ausgabe-Tokens=${usage?.completionTokens ?? 0}`,
        `davon Reasoning=${usage?.reasoningTokens ?? 0}`,
    ].join(", ");

    const truncated = finishReason === "length";
    const thoughtTooLong =
        truncated && (reasoning.length > 0 || (usage?.reasoningTokens ?? 0) > 0);

    const hint = thoughtTooLong
        ? "Das Modell hat das Budget fürs Reasoning verbraucht. Empfehlung: --reasoning off (Standard) oder ein höheres --max-tokens."
        : truncated
          ? "Das Ausgabebudget war zu klein. Empfehlung: kleineres --batch-size oder höheres --max-tokens."
          : "Antwort ohne Inhalt — Modell und Anbieter prüfen.";

    return new OpenRouterError(
        `OpenRouter lieferte eine leere Antwort (${details}). ${hint}`,
        status,
        // Abgeschnittene Antworten sind deterministisch: Wiederholen hilft nicht.
        !truncated,
    );
}

function reasoningParam(
    mode: ReasoningMode | undefined,
): { enabled: boolean } | { effort: "low" | "medium" | "high" } | null {
    switch (mode) {
        case "off":
            return { enabled: false };
        case "low":
        case "medium":
        case "high":
            return { effort: mode };
        default:
            return null;
    }
}

function normalizeContent(raw: unknown): string {
    if (typeof raw === "string") return raw.trim();
    if (Array.isArray(raw)) {
        return raw
            .map((part) =>
                typeof part === "string"
                    ? part
                    : typeof (part as { text?: unknown })?.text === "string"
                      ? (part as { text: string }).text
                      : "",
            )
            .join("")
            .trim();
    }
    return "";
}

function normalizeUsage(
    usage:
        | {
              prompt_tokens?: unknown;
              completion_tokens?: unknown;
              total_tokens?: unknown;
              completion_tokens_details?: { reasoning_tokens?: unknown };
          }
        | null
        | undefined,
): TokenUsage | null {
    if (!usage) return null;

    const toNumber = (value: unknown): number =>
        typeof value === "number" && Number.isFinite(value) ? value : 0;

    return {
        promptTokens: toNumber(usage.prompt_tokens),
        completionTokens: toNumber(usage.completion_tokens),
        totalTokens: toNumber(usage.total_tokens),
        reasoningTokens: toNumber(
            usage.completion_tokens_details?.reasoning_tokens,
        ),
    };
}

async function readErrorBody(response: Response): Promise<string> {
    try {
        const text = (await response.text()).trim();
        if (!text) return "";

        // Fehlermeldungen von OpenRouter sind meist JSON.
        try {
            const parsed = JSON.parse(text) as {
                error?: { message?: unknown };
                message?: unknown;
            };
            const message = parsed.error?.message ?? parsed.message;
            if (typeof message === "string") return truncate(message, 300);
        } catch {
            // Kein JSON — Rohtext kürzen.
        }
        return truncate(text, 300);
    } catch {
        return "";
    }
}

function parseRetryAfterMs(response: Response): number | null {
    const header = response.headers.get("retry-after");
    if (!header) return null;

    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

    const date = Date.parse(header);
    return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function truncate(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}
