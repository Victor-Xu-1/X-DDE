import type {
  Analysis,
  Candidate,
  Detail,
  Health,
  Job,
  Language,
  Prediction,
  Project,
} from "../types";
export interface PredictionWorkspaceProps {
  active: boolean;
  resultsVersion: number;
  inputVersion?: number;
  language: Language;
  ready: boolean;
  health: Health | null;
  connectionError: boolean;
  onRefresh(): void;
  jobs: Job[];
  job: Job | null;
  detail: Detail | null;
  detailError: boolean;
  onJob(id: string): void;
  onChanged(job: Job): void;
  projects: Project[];
  projectId: string | null;
  onProject(id: string | null): void;
  analysis: Analysis | null;
  loadingAnalysis: boolean;
  analysisError: string;
  onRetry(): void;
  candidate?: Candidate;
  onCandidate(id: string): void;
  urls: string[];
  compared: string[];
  onCompare(ids: string[]): void;
  focusResidue: { residue: string; nonce: number } | null;
  onResidue(residue: string): void;
  draft: Prediction | null;
  onReuse(): void;
  onSubmit(value: Prediction, key: string): Promise<Job>;
}
