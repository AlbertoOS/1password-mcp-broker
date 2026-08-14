export interface MetadataRecord {
  id: string;
  label: string;
  category: string;
}

export interface MetadataBackend {
  listApprovedMetadata(): readonly MetadataRecord[];
}

export class FakeMetadataBackend implements MetadataBackend {
  constructor(private readonly records: readonly MetadataRecord[]) {}

  listApprovedMetadata(): readonly MetadataRecord[] {
    return this.records.map((record) => ({ ...record }));
  }
}
