export interface MetadataRecord {
  id: string;
  label: string;
  category: string;
}

const authoritativeSyntheticMetadataFixtures = Object.freeze([
  Object.freeze({ id: "fixture-001", label: "Example integration", category: "api-credential" }),
  Object.freeze({ id: "fixture-002", label: "Example integration", category: "api-credential" }),
  Object.freeze({ id: "fixture-003", label: "Example integration", category: "api-credential" }),
  Object.freeze({ id: "fixture-004", label: "Example integration", category: "api-credential" }),
] as const);

export type SyntheticMetadataFixtureId = (typeof authoritativeSyntheticMetadataFixtures)[number]["id"];

export function listSyntheticMetadataFixtures(): readonly MetadataRecord[] {
  return authoritativeSyntheticMetadataFixtures.map((fixture) => ({ ...fixture }));
}

function findSyntheticMetadataFixture(id: string) {
  return authoritativeSyntheticMetadataFixtures.find((fixture) => fixture.id === id);
}

export function isSyntheticMetadataRecord(record: MetadataRecord): boolean {
  const fixture = findSyntheticMetadataFixture(record.id);
  return fixture?.label === record.label && fixture.category === record.category;
}

export interface MetadataBackend {
  listApprovedMetadata(): readonly MetadataRecord[];
}

export class FakeMetadataBackend implements MetadataBackend {
  constructor(private readonly fixtureIds: readonly SyntheticMetadataFixtureId[]) {}

  listApprovedMetadata(): readonly MetadataRecord[] {
    return this.fixtureIds.map((fixtureId) => ({ ...findSyntheticMetadataFixture(fixtureId)! }));
  }
}
