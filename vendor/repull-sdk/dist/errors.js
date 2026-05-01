/**
 * Error classes for @repull/sdk.
 *
 * The Repull API returns a uniform `{ error: { code, message, requestId? } }`
 * payload on 4xx/5xx. The SDK maps that shape onto `RepullError` and its
 * subclasses, with the original status code preserved.
 */
export class RepullError extends Error {
    status;
    code;
    requestId;
    details;
    constructor(args) {
        super(args.message);
        this.name = 'RepullError';
        this.status = args.status;
        this.code = args.code;
        this.requestId = args.requestId;
        this.details = args.details;
    }
    static fromResponse(status, body) {
        let message = `Repull API error (${status})`;
        let code;
        let requestId;
        let details = undefined;
        if (typeof body === 'string' && body.length > 0) {
            message = body;
        }
        else if (body && typeof body === 'object') {
            const inner = body.error ?? body;
            if (inner && typeof inner === 'object') {
                const m = inner.message;
                if (typeof m === 'string')
                    message = m;
                const c = inner.code;
                if (typeof c === 'string')
                    code = c;
                const r = inner.requestId;
                if (typeof r === 'string')
                    requestId = r;
                const d = inner.details;
                details = d;
            }
        }
        if (status === 401 || status === 403) {
            return new RepullAuthError({ message, status, code, requestId, details });
        }
        if (status === 429) {
            return new RepullRateLimitError({ message, status, code, requestId, details });
        }
        if (status === 400 || status === 422) {
            return new RepullValidationError({ message, status, code, requestId, details });
        }
        return new RepullError({ message, status, code, requestId, details });
    }
}
export class RepullAuthError extends RepullError {
    constructor(args) {
        super(args);
        this.name = 'RepullAuthError';
    }
}
export class RepullRateLimitError extends RepullError {
    constructor(args) {
        super(args);
        this.name = 'RepullRateLimitError';
    }
}
export class RepullValidationError extends RepullError {
    constructor(args) {
        super(args);
        this.name = 'RepullValidationError';
    }
}
//# sourceMappingURL=errors.js.map