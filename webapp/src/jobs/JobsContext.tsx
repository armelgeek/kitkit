import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, studioWsUrl, type Job } from "../api/client";

// One WebSocket per open project feeds realtime batch progress (§9). Tabs read the
// active jobs from here and refetch their data when a relevant job advances, so a
// batch keeps running (and stays visible) even if the user switches tabs or the
// page is reloaded — the server is the source of truth.
type Ctx = {
  jobs: Job[];
  jobFor: (type: string) => Job | undefined;
  cancel: (id: string) => void;
};

const JobsCtx = createContext<Ctx>({ jobs: [], jobFor: () => undefined, cancel: () => {} });

export function JobsProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [map, setMap] = useState<Record<string, Job>>({});
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setMap({});
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (stopped) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(studioWsUrl());
      } catch {
        retry = setTimeout(connect, 2000);
        return;
      }
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        let msg: any;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === "snapshot") {
          const m: Record<string, Job> = {};
          for (const j of msg.jobs as Job[]) m[j.id] = j;
          setMap(m);
        } else if (msg.type === "job") {
          setMap((prev) => ({ ...prev, [msg.job.id]: msg.job }));
        }
      };
      ws.onclose = () => {
        if (!stopped) retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    };

    // Seed once via REST in case the socket is slow to open.
    api.listJobs(projectId)
      .then((r) => setMap((prev) => {
        const m = { ...prev };
        for (const j of r.jobs) m[j.id] = j;
        return m;
      }))
      .catch(() => {});
    connect();

    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
    };
  }, [projectId]);

  const jobs = Object.values(map)
    .filter((j) => j.project_id === projectId)
    .sort((a, b) => a.created_at - b.created_at);

  // The most recent running job of a type (what a tab's "auto gen" button tracks).
  const jobFor = (type: string) =>
    [...jobs].reverse().find((j) => j.type === type && j.status === "running");

  const cancel = (id: string) => {
    api.cancelJob(id).catch(() => {});
  };

  return <JobsCtx.Provider value={{ jobs, jobFor, cancel }}>{children}</JobsCtx.Provider>;
}

export const useJobs = () => useContext(JobsCtx);

// Helper: run `onAdvance` whenever a job of `type` makes progress, and `onDone`
// when it finishes. Used by tabs to refetch their rows as a batch proceeds.
export function useJobWatcher(
  type: string,
  handlers: { onAdvance?: () => void; onDone?: (job: Job) => void }
) {
  const { jobs } = useJobs();
  const job = [...jobs].reverse().find((j) => j.type === type);
  const lastProgress = useRef<number>(-1);
  const lastStatus = useRef<string>("");

  useEffect(() => {
    if (!job) return;
    const seen = job.done + job.errors.length;
    if (seen !== lastProgress.current) {
      lastProgress.current = seen;
      handlers.onAdvance?.();
    }
    if (job.status !== "running" && job.status !== lastStatus.current) {
      handlers.onDone?.(job);
    }
    lastStatus.current = job.status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.done, job?.errors.length, job?.status]);

  return job;
}
