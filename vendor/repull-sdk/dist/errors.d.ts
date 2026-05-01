/**
 * Error classes for @repull/sdk.
 *
 * The Repull API returns a uniform `{ error: { code, message, requestId? } }`
 * payload on 4xx/5xx. The SDK maps that shape onto `RepullError` and its
 * subclasses, with the original status code preserved.
 */
export interface RepullErrorBody {
    error?: {
        code?: string;
        message?: string;
        requestId?: string;
        details?: unknown;
    };
    message?: string;
    code?: string;
    requestId?: string;
}
export declare class RepullError extends Error {
    readonly status: number;
    readonly code?: string;
    readonly requestId?: string;
    readonly details?: unknown;
    constructor(args: {
        message: string;
        status: number;
        code?: string;
        requestId?: string;
        details?: unknown;
    });
    static fromResponse(status: number, body: RepullErrorBody | string | undefined): RepullError;
}
export declare class RepullAuthError extends RepullError {
    constructor(args: {
        message: string;
        status: number;
        code?: string;
        requestId?: string;
        details?: unknown;
    });
}
export declare class RepullRateLimitError extends RepullError {
    constructor(args: {
        message: string;
        status: number;
        code?: string;
        requestId?: string;
        details?: unknown;
    });
}
export declare class RepullValidationError extends RepullError {
    constructor(args: {
        message: string;
        status: number;
        code?: string;
        requestId?: string;
        details?: unknown;
    });
}
//# sourceMappingURL=errors.d.ts.map