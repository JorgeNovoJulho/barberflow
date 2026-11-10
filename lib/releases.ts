import bundledReleases from "../releases.json";

export const repository = "https://github.com/JorgeNovoJulho/barberflow";
export const currentRelease = bundledReleases[0];
const versionPattern = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;

type Release = (typeof bundledReleases)[number];
type GithubHead = { sha: string; commit?: { message?: string } };

function isRelease(value: unknown): value is Release {
  if (typeof value !== "object" || value === null) return false;
  const release = value as Partial<Release>;
  return typeof release.version === "string" && versionPattern.test(release.version)
    && typeof release.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(release.date)
    && typeof release.title === "string" && release.title.length <= 180
    && Array.isArray(release.changes) && release.changes.length <= 30
    && release.changes.every((change) => typeof change === "string" && change.length <= 800);
}

export function compareVersions(left: string, right: string) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < leftParts.length; index++) {
    const difference = leftParts[index] - rightParts[index];
    if (difference) return difference;
  }
  return 0;
}

export async function getReleaseInformation() {
  const deployedRevision = process.env.NEXT_PUBLIC_BARBERFLOW_REVISION || null;
  const options = { next: { revalidate: 60 } };
  try {
    const headResponse = await fetch("https://api.github.com/repos/JorgeNovoJulho/barberflow/commits/main", {
      ...options, headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(4000),
    });
    if (!headResponse.ok) throw new Error("GitHub indisponível");
    const head = await headResponse.json() as GithubHead;
    if (!/^[a-f0-9]{40}$/.test(head.sha)) throw new Error("Revisão inválida");

    const releasesResponse = await fetch(`https://raw.githubusercontent.com/JorgeNovoJulho/barberflow/${head.sha}/releases.json`, {
      ...options, signal: AbortSignal.timeout(4000),
    });
    if (!releasesResponse.ok) throw new Error("Histórico indisponível");
    const releases: unknown = await releasesResponse.json();
    if (!Array.isArray(releases) || !isRelease(releases[0])) throw new Error("Histórico inválido");

    const history = [...new Map([...bundledReleases, ...releases.filter(isRelease)]
      .map((release) => [release.version, release])).values()]
      .sort((left, right) => compareVersions(right.version, left.version));
    const latest = releases[0];
    const versionComparison = compareVersions(latest.version, currentRelease.version);
    const pending = versionComparison > 0
      || (versionComparison === 0 && Boolean(deployedRevision && deployedRevision !== head.sha));

    return { history, latest, pending, deployedRevision, head, available: true as const };
  } catch {
    return { history: bundledReleases, deployedRevision, available: false as const };
  }
}
