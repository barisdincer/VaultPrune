import type { AttachmentCandidate, ScanSummary } from "./scanner";
import {
  escapeMarkdownCell,
  formatBytes,
  formatTimestamp,
  formatUtcTimestamp,
} from "./utils";

interface PreviewReportInput {
  candidates: AttachmentCandidate[];
  description: string;
  selectedPaths: Set<string>;
  summary: ScanSummary;
  title: string;
}

interface GroupStat {
  count: number;
  label: string;
  sizeBytes: number;
}

export function buildPreviewReport(input: PreviewReportInput): string {
  const { candidates, description, selectedPaths, summary, title } = input;
  const selectedCandidates = candidates.filter((candidate) => selectedPaths.has(candidate.path));
  const selectedBytes = selectedCandidates.reduce(
    (total, candidate) => total + candidate.sizeBytes,
    0,
  );

  const sections = [
    `# ${title}`,
    "",
    description,
    "",
    `Generated: ${formatUtcTimestamp(summary.generatedAt)}`,
    "",
    "## Scan summary",
    `- Markdown notes scanned: ${summary.scannedMarkdownFiles}`,
    `- Canvas files scanned: ${summary.scannedCanvasFiles}`,
    `- Extra text reference files scanned: ${summary.scannedExtraReferenceFiles}`,
    `- Attachment candidates scanned: ${summary.scannedAttachmentFiles}`,
    `- Referenced attachments matched: ${summary.referencedAttachmentCount}`,
    `- Unused candidates found: ${summary.unusedCandidates.length} (${formatBytes(summary.unusedBytes)})`,
    "",
    "## Current view",
    `- Visible candidates: ${candidates.length} (${formatBytes(sumCandidateBytes(candidates))})`,
    `- Selected candidates: ${selectedCandidates.length} (${formatBytes(selectedBytes)})`,
    "",
    "## By extension",
    renderGroupTable(groupCandidates(candidates, (candidate) => `.${candidate.extension || "noext"}`)),
    "",
    "## By folder",
    renderGroupTable(groupCandidates(candidates, (candidate) => candidate.folder)),
    "",
    "## Candidate list",
    renderCandidateTable(candidates, selectedPaths),
  ];

  return sections.join("\n");
}

function groupCandidates(
  candidates: AttachmentCandidate[],
  keySelector: (candidate: AttachmentCandidate) => string,
): GroupStat[] {
  const grouped = new Map<string, GroupStat>();

  for (const candidate of candidates) {
    const key = keySelector(candidate);
    const current = grouped.get(key) ?? {
      count: 0,
      label: key,
      sizeBytes: 0,
    };

    current.count += 1;
    current.sizeBytes += candidate.sizeBytes;
    grouped.set(key, current);
  }

  return [...grouped.values()].sort((left, right) => {
    if (right.sizeBytes !== left.sizeBytes) {
      return right.sizeBytes - left.sizeBytes;
    }

    return left.label.localeCompare(right.label);
  });
}

function renderGroupTable(groups: GroupStat[]): string {
  if (groups.length === 0) {
    return "No candidates in this view.";
  }

  const rows = [
    "| Group | Count | Size |",
    "| --- | ---: | ---: |",
  ];

  for (const group of groups) {
    rows.push(
      `| ${escapeMarkdownCell(group.label)} | ${group.count} | ${formatBytes(group.sizeBytes)} |`,
    );
  }

  return rows.join("\n");
}

function renderCandidateTable(
  candidates: AttachmentCandidate[],
  selectedPaths: Set<string>,
): string {
  if (candidates.length === 0) {
    return "No candidates in this view.";
  }

  const rows = [
    "| Path | Extension | Size | Modified | Selected |",
    "| --- | --- | ---: | --- | --- |",
  ];

  for (const candidate of candidates) {
    rows.push(
      `| ${escapeMarkdownCell(candidate.path)} | .${escapeMarkdownCell(candidate.extension)} | ${formatBytes(candidate.sizeBytes)} | ${formatTimestamp(candidate.modifiedTime)} | ${selectedPaths.has(candidate.path) ? "yes" : "no"} |`,
    );
  }

  return rows.join("\n");
}

function sumCandidateBytes(candidates: AttachmentCandidate[]): number {
  return candidates.reduce((total, candidate) => total + candidate.sizeBytes, 0);
}
