import { commitSubject, fileSubject, replySubject, type Subject } from "./engine.ts";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function headerPath(value: string): string {
  if (value.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "string") return parsed;
    } catch { /* The host validates malformed headers. */ }
  }
  return /^'.*'$/.test(value) ? value.slice(1, -1) : value;
}

function file(path: string, content: string): Subject | undefined {
  // SSH paths can encode the extension. Keep the original path in diagnostics.
  let classifiedPath = path;
  if (path.startsWith("ssh://")) {
    try { classifiedPath = decodeURIComponent(path); } catch { /* The host reports malformed paths. */ }
  }
  const subject = fileSubject(classifiedPath, content);
  return subject && { ...subject, label: path };
}

/** Select newly supplied text in hashline, apply-patch, and sloppy modes. */
function patchSubjects(patch: string): Subject[] {
  const subjects: Subject[] = [];
  let path = "";
  let additions: string[] = [];
  let literal = false;
  let sloppy = false;
  function flush(): void {
    const subject = file(path, additions.join("\n"));
    if (subject) subjects.push(subject);
    additions = [];
  }
  for (const line of patch.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const header = /^\[(.+)#[\da-f]{4}\]$/i.exec(line) ?? /^\s*¶+(.+?)(?:#[\da-f]{4})?$/i.exec(line);
    const section = /^\*\*\* (Add|Update|Delete|Edit) File:\s*(.*)$/.exec(line);
    if (header || section) {
      flush();
      sloppy = section?.[1] === "Edit";
      let nextPath = header ? header[1]!.trim() : section![2]!.trim();
      if (sloppy) nextPath = nextPath.replace(/(?:^|\s)all$/, "").trim();
      if (nextPath) path = headerPath(nextPath);
      literal = false;
    } else if (/^\*\*\* (Replace|Insert Before|Insert After)(?: all)?$/.test(line)) {
      literal = true;
    } else if (line === "*** Find" || line === "*** End Patch") {
      literal = false;
    } else if (!sloppy && (line.startsWith("*** Move to: ") || line.startsWith("MV "))) {
      const destination = line.startsWith("MV ") ? line.slice(3).trim() : line.slice(13).trim();
      path = headerPath(destination);
    } else if (path && literal) {
      additions.push(line);
    } else if (path && !sloppy && line.startsWith("+")) {
      additions.push(line.slice(1));
    }
  }
  flush();
  return subjects;
}

/** Translate stock omp tool inputs to upstream agent-ste subjects. */
export function subjectsOf(toolName: string, input: Record<string, unknown>): Subject[] {
  let subject: Subject | undefined;
  if (toolName === "write") {
    subject = file(text(input.path), text(input.content));
  } else if (toolName === "say") {
    subject = replySubject(text(input.text));
  } else if (toolName === "bash") {
    subject = commitSubject(text(input.command));
  } else if (toolName === "edit") {
    const patch = text(input.input) || text(input._input);
    if (patch) return patchSubjects(patch);
    const path = text(input.path) || text(input._path);
    if (Array.isArray(input.edits)) {
      const subjects: Subject[] = [];
      for (const entry of input.edits) {
        if (!entry || typeof entry !== "object" || entry.op === "delete") continue;
        const content = typeof entry.new_string === "string" ? entry.new_string
          : entry.op === "create" ? text(entry.diff)
          : text(entry.diff).split(/\r?\n/).filter(line => line.startsWith("+")).map(line => line.slice(1)).join("\n");
        const target = file(text(entry.rename) || path, content);
        if (target) subjects.push(target);
      }
      return subjects;
    }
    if (typeof input.new_string === "string") subject = file(path, input.new_string);
  }
  return subject ? [subject] : [];
}
