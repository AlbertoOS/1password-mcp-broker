const knownCapabilities = ["capability.status", "metadata.discovery"] as const;

type CapabilityName = (typeof knownCapabilities)[number];

export interface CapabilityManifest {
  enabledCapabilities: readonly string[];
}

export interface CapabilityStatus {
  enabledCapabilities: CapabilityName[];
}

export class CapabilityPolicy {
  private constructor(private readonly enabledCapabilities: readonly CapabilityName[]) {}

  static fromManifest(manifest: CapabilityManifest): CapabilityPolicy {
    const enabledCapabilities = manifest.enabledCapabilities.map((capability) => {
      if (!isKnownCapability(capability)) {
        throw new Error(`Unknown capability: ${capability}`);
      }
      return capability;
    });

    if (new Set(enabledCapabilities).size !== enabledCapabilities.length) {
      throw new Error("Duplicate capability in manifest");
    }

    return new CapabilityPolicy(enabledCapabilities);
  }

  status(): CapabilityStatus {
    return {
      enabledCapabilities: [...this.enabledCapabilities],
    };
  }

  isEnabled(capability: CapabilityName): boolean {
    return this.enabledCapabilities.includes(capability);
  }
}

function isKnownCapability(capability: string): capability is CapabilityName {
  return (knownCapabilities as readonly string[]).includes(capability);
}
