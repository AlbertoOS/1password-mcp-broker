export type SafeAuditEvent = {
  tool: "capability_status" | "list_approved_metadata";
  outcome: "allowed" | "blocked";
  recordCount?: number;
};

export interface AuditSink {
  record(event: SafeAuditEvent): void;
}

export class NullAuditSink implements AuditSink {
  record(_event: SafeAuditEvent): void {}
}

export class InMemoryAuditSink implements AuditSink {
  private readonly recordedEvents: SafeAuditEvent[] = [];

  record(event: SafeAuditEvent): void {
    this.recordedEvents.push({ ...event });
  }

  events(): readonly SafeAuditEvent[] {
    return this.recordedEvents.map((event) => ({ ...event }));
  }
}
