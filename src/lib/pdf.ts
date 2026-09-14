export type GraphSnapshot = {
  width: number;
  height: number;
  nodes: { x: number; y: number; label: string; group: string; r: number }[];
  edges: { x1: number; y1: number; x2: number; y2: number }[];
};

export type PdfInput = {
  repoName: string;
  repoUrl: string;
  tagline: string;
  summary: string[];
  components: { name: string; responsibility: string }[];
  languages: string[];
  sampled: boolean;
  sampleNote: string;
  monorepo: { isMonorepo: boolean; projects: string[] };
  graph: GraphSnapshot | null;
};

function wrap(doc: { getTextWidth: (t: string) => number }, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (doc.getTextWidth(next) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const GROUP_COLORS: Record<string, [number, number, number]> = {
  app: [255, 107, 53],
  api: [61, 205, 192],
  core: [232, 196, 124],
  ui: [232, 196, 124],
  data: [125, 168, 232],
  infra: [180, 140, 120],
  tooling: [160, 160, 150],
};

export async function downloadBriefingPdf(input: PdfInput) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;
  let y = 56;

  doc.setFillColor(252, 248, 241);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.setFillColor(255, 107, 53);
  doc.rect(0, 0, pageW, 8, "F");

  doc.setFont("times", "italic");
  doc.setFontSize(11);
  doc.setTextColor(155, 92, 64);
  doc.text("Codebase briefing", margin, y);
  y += 28;

  doc.setFont("times", "bold");
  doc.setFontSize(26);
  doc.setTextColor(28, 24, 20);
  const titleLines = wrap(doc, input.repoName, maxW);
  for (const line of titleLines) {
    doc.text(line, margin, y);
    y += 30;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90, 80, 70);
  for (const line of wrap(doc, input.tagline, maxW)) {
    doc.text(line, margin, y);
    y += 16;
  }
  y += 6;
  doc.setTextColor(180, 90, 50);
  doc.text(input.repoUrl, margin, y);
  y += 18;
  if (input.languages.length) {
    doc.setTextColor(90, 80, 70);
    doc.text(input.languages.join(" · "), margin, y);
    y += 16;
  }
  if (input.monorepo.isMonorepo) {
    doc.text(
      `Monorepo${input.monorepo.projects.length ? `: ${input.monorepo.projects.join(", ")}` : ""}`,
      margin,
      y,
    );
    y += 16;
  }
  y += 10;

  doc.setDrawColor(220, 200, 180);
  doc.line(margin, y, pageW - margin, y);
  y += 24;

  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.setTextColor(28, 24, 20);
  doc.text("Architecture", margin, y);
  y += 20;
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.setTextColor(50, 44, 38);
  for (const para of input.summary) {
    const lines = wrap(doc, para, maxW);
    if (y + lines.length * 15 > pageH - 64) {
      doc.addPage();
      doc.setFillColor(252, 248, 241);
      doc.rect(0, 0, pageW, pageH, "F");
      y = 56;
    }
    for (const line of lines) {
      doc.text(line, margin, y);
      y += 15;
    }
    y += 10;
  }

  if (input.sampled && input.sampleNote) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(130, 110, 90);
    for (const line of wrap(doc, input.sampleNote, maxW)) {
      doc.text(line, margin, y);
      y += 13;
    }
    y += 8;
  }

  if (input.components.length) {
    if (y > pageH - 160) {
      doc.addPage();
      doc.setFillColor(252, 248, 241);
      doc.rect(0, 0, pageW, pageH, "F");
      y = 56;
    }
    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.setTextColor(28, 24, 20);
    doc.text("Key modules", margin, y);
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const component of input.components) {
      const block = wrap(doc, `${component.name} — ${component.responsibility}`, maxW);
      if (y + block.length * 13 > pageH - 48) {
        doc.addPage();
        doc.setFillColor(252, 248, 241);
        doc.rect(0, 0, pageW, pageH, "F");
        y = 56;
      }
      doc.setTextColor(28, 24, 20);
      doc.setFont("helvetica", "bold");
      const nameWidth = doc.getTextWidth(`${component.name} `);
      doc.text(component.name, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(70, 60, 50);
      const rest = wrap(doc, ` ${component.responsibility}`, maxW - nameWidth);
      if (rest[0]) doc.text(rest[0], margin + nameWidth, y);
      y += 13;
      for (const extra of rest.slice(1)) {
        doc.text(extra, margin, y);
        y += 13;
      }
      y += 6;
    }
  }

  if (input.graph && input.graph.nodes.length) {
    if (y > pageH - 260) {
      doc.addPage();
      doc.setFillColor(252, 248, 241);
      doc.rect(0, 0, pageW, pageH, "F");
      y = 56;
    }
    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.setTextColor(28, 24, 20);
    doc.text("Module graph", margin, y);
    y += 16;
    const graphH = 240;
    const graphW = maxW;
    doc.setFillColor(255, 252, 247);
    doc.setDrawColor(230, 214, 196);
    doc.roundedRect(margin, y, graphW, graphH, 8, 8, "FD");

    const xs = input.graph.nodes.map((n) => n.x);
    const ys = input.graph.nodes.map((n) => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 28;
    const sx = (graphW - pad * 2) / Math.max(1, maxX - minX);
    const sy = (graphH - pad * 2) / Math.max(1, maxY - minY);
    const s = Math.min(sx, sy);
    const ox = margin + pad - minX * s + (graphW - pad * 2 - (maxX - minX) * s) / 2;
    const oy = y + pad - minY * s + (graphH - pad * 2 - (maxY - minY) * s) / 2;
    const tx = (x: number) => ox + x * s;
    const ty = (yy: number) => oy + yy * s;

    doc.setDrawColor(200, 180, 160);
    doc.setLineWidth(0.6);
    for (const edge of input.graph.edges) {
      doc.line(tx(edge.x1), ty(edge.y1), tx(edge.x2), ty(edge.y2));
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    for (const node of input.graph.nodes) {
      const color = GROUP_COLORS[node.group] ?? [255, 107, 53];
      doc.setFillColor(color[0], color[1], color[2]);
      doc.circle(tx(node.x), ty(node.y), Math.max(4, node.r * 0.35), "F");
      doc.setTextColor(60, 50, 40);
      doc.text(node.label.slice(0, 28), tx(node.x) + 6, ty(node.y) + 3);
    }
    y += graphH + 20;
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(140, 120, 100);
  doc.text(`Generated ${new Date().toISOString().slice(0, 10)} · Codebase Explainer`, margin, pageH - 24);

  const slug = input.repoName.replace(/[^\w.-]+/g, "-").toLowerCase();
  doc.save(`${slug || "codebase"}-briefing.pdf`);
}
