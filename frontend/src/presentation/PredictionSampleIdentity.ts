const sampleId = /^(?:seed-(\d+)-)?sample-(\d+)(?:-([0-9a-f]{12}))?$/;

export function predictionSampleIdentity(id: string) {
  const match = sampleId.exec(id);
  return {
    seed: match?.[1] === undefined ? null : Number(match[1]),
    sample: match ? Number(match[2]) : null,
    digest: match?.[3]?.slice(0, 6),
  };
}

export function predictionSampleName(id: string, zh: boolean) {
  const { seed, sample, digest } = predictionSampleIdentity(id);
  const name = `${zh ? "构象" : "Sample"} ${sample ?? id}`;
  return [
    seed === null ? null : `${zh ? "种子" : "Seed"} ${seed}`,
    name,
    digest,
  ]
    .filter(Boolean)
    .join(" · ");
}
